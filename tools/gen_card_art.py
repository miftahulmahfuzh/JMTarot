#!/usr/bin/env python3
"""Generate one Major Arcana card image from the locked style contract.

Half of the `/generate-tarot-card` skill. This half only talks to the API and
writes a file; `check_card_art.py` judges the result and the skill's operator
looks at it. Keeping them apart matters: a generator that also grades itself is
a generator that grades itself generously.

    python3 tools/gen_card_art.py 10_wheel_of_fortune
    python3 tools/gen_card_art.py 08_strength --reference assets/major_arcanas/_anchor.png
    python3 tools/gen_card_art.py 08_strength --note "less dust, colder light"

Writes  assets/major_arcanas/_candidates/<slug>.aNN.png   (NN auto-increments)
        assets/major_arcanas/_candidates/<slug>.aNN.txt    (the exact prompt sent)

NEVER writes to assets/major_arcanas/ itself. That directory is source art --
"never edit in place, never delete" -- and promoting a candidate into it is a
deliberate, separate act by a human, not a side effect of a generation.

── STDLIB ONLY, ON PURPOSE ──────────────────────────────────────────────────
No `openai`, no `requests`. This machine has neither, and the repository already
argued the case in src/lib/llm/openai.ts: what we need is one POST, the wire
format is public and stable, and a dependency for one script is a dependency
forever. `urllib.request` plus a hand-built multipart body is the whole cost.

── THE TWO ENDPOINTS ────────────────────────────────────────────────────────
With no --reference this posts JSON to /v1/images/generations. With one or more
it posts multipart to /v1/images/edits, which is how a reference image reaches
the model -- and that is the mechanism the whole consistency strategy rests on:
card 2 through 22 are generated AGAINST card 1, not against a description of it.
"""

import argparse
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

# ── The AAAA trap, and why this line is here ────────────────────────────────
# CLAUDE.md: AAAA lookups hang for 4-12s in this WSL image, so every npm script
# that touches the network sets RES_OPTIONS=no-aaaa. This is a Python script, so
# no npm script covers it. glibc reads RES_OPTIONS when the resolver initialises,
# which happens on the first getaddrinfo() -- so this must run before any DNS,
# which means before the first urlopen and not, say, inside main().
# Measured with curl against api.openai.com: dns=0.049s with it.
os.environ.setdefault("RES_OPTIONS", "no-aaaa")

ROOT = Path(__file__).resolve().parent.parent
SKILL = ROOT / ".claude/skills/generate-tarot-card"
CANDIDATES = ROOT / "assets/major_arcanas/_candidates"
ENV_FILE = ROOT / ".env.local"

API = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-image-2"

# 1024x1536 is exactly 2:3, which is exactly what the app draws: CARD_RATIO in
# src/theme/tokens.ts, the Fan's 88x132, Slots' 90x135, CardDetail's
# `aspect-ratio: 2/3`. The old art was ALSO generated at 2:3 and still showed
# side gaps, because the model painted a card inside a black mat; the ratio was
# never the bug. `full bleed` in the style block is the fix, and check_card_art
# is what proves it landed.
DEFAULT_SIZE = "1024x1536"
DEFAULT_QUALITY = "high"

# Image generation is slow and a truncated read costs a paid image.
TIMEOUT_S = 600


def load_key() -> tuple[str, str]:
    """Find OPENAI_API_KEY. Returns (key, where-it-came-from).

    .env.local FIRST, environment second, and the order is deliberate: the key
    lives in .env.local next to every other secret in this project, and a stale
    value exported in some shell silently winning over the file is the kind of
    thing that costs an hour.

    THE ENVIRONMENT FALLBACK IS NOT BELT-AND-BRACES, IT IS SCAR TISSUE. A batch
    of 21 cards died all at once because .env.local had been rewritten out from
    under it between the anchor run and the batch -- the whole run wasted on a
    missing variable that could have been passed in for the duration. It also
    means a batch can run without the key being persisted anywhere at all.
    Reporting the source matters as much as the fallback: two places to look is
    two places to be wrong about.
    """
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() != "OPENAI_API_KEY":
                continue
            v = v.strip().strip('"').strip("'")
            if v:
                # CLAUDE.md: `$` is escaped as `\$` in .env files because Next
                # expands it. Nothing expands anything here, so undo the
                # escaping rather than sending a key with stray backslashes.
                return v.replace("\\$", "$"), str(ENV_FILE.name)

    if env := os.environ.get("OPENAI_API_KEY", "").strip():
        return env, "environment"

    sys.exit(
        f"OPENAI_API_KEY not found in {ENV_FILE} or the environment.\n"
        "Add it to .env.local, or export it for one batch:\n"
        "  OPENAI_API_KEY=sk-... python3 tools/gen_card_art.py <slug> ..."
    )


def load_contract() -> tuple[str, dict[str, str]]:
    """Split style.md into the verbatim style block and the per-card scenes.

    The style block is everything between the STYLE BLOCK fences; each scene is
    a line `- <slug>: <scene>` under the SCENES heading. Parsing the markdown
    rather than keeping a second machine-readable copy is the point -- one file
    that a human edits and the script reads cannot drift from itself.
    """
    path = SKILL / "style.md"
    if not path.is_file():
        sys.exit(f"missing style contract: {path}")
    text = path.read_text(encoding="utf-8")

    blocks = re.findall(r"<!-- STYLE BLOCK v(\S+) -->\n(.*?)\n<!-- /STYLE BLOCK -->", text, re.S)
    if len(blocks) != 1:
        sys.exit(f"style.md must contain exactly one STYLE BLOCK, found {len(blocks)}")
    version, style = blocks[0]

    scenes = dict(re.findall(r"^- ([0-9]{2}_[a-z_]+): (.+)$", text, re.M))
    if len(scenes) != 22:
        sys.exit(f"style.md must define 22 scenes, found {len(scenes)}")

    return f"{style.strip()}\n\nSTYLE VERSION: {version}", scenes


def multipart(fields: dict[str, str], files: list[tuple[str, Path]]) -> tuple[bytes, str]:
    """Build a multipart/form-data body. Files share the field name `image[]`."""
    boundary = "----jmtarot" + os.urandom(12).hex()
    out = bytearray()
    for name, value in fields.items():
        out += f"--{boundary}\r\n".encode()
        out += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        out += value.encode("utf-8") + b"\r\n"
    for name, path in files:
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        out += f"--{boundary}\r\n".encode()
        out += (
            f'Content-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'
        ).encode()
        out += f"Content-Type: {ctype}\r\n\r\n".encode()
        out += path.read_bytes() + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def post(url: str, key: str, body: bytes, content_type: str) -> dict:
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": content_type},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            err = json.loads(raw)["error"]
        except Exception:
            sys.exit(f"HTTP {e.code}\n{raw[:2000]}")
        # A content-policy refusal is the expected failure mode for this deck,
        # not an anomaly -- name it so the operator revises the scene line
        # instead of retrying the identical prompt three times.
        kind = err.get("code") or err.get("type") or "error"
        sys.exit(
            f"HTTP {e.code} [{kind}]: {err.get('message')}\n"
            + (
                "\n>> This looks like a content-policy refusal. Soften the "
                "DEPICTION, not the mood: blood as stain//pool/drip rather than "
                "wounds, threat implied by composition rather than shown.\n"
                if "moderation" in str(kind) or "safety" in str(err.get("message", "")).lower()
                else ""
            )
        )


def next_attempt(slug: str) -> int:
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    used = [
        int(m.group(1))
        for p in CANDIDATES.glob(f"{slug}.a*.png")
        if (m := re.search(r"\.a(\d+)\.png$", p.name))
    ]
    return max(used, default=0) + 1


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("slug", help="e.g. 10_wheel_of_fortune")
    ap.add_argument(
        "--reference",
        action="append",
        default=[],
        metavar="PNG",
        help="anchor image(s) to generate against. Switches to /images/edits.",
    )
    ap.add_argument(
        "--note",
        default="",
        help="one revision instruction appended to the prompt, for retries",
    )
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--size", default=DEFAULT_SIZE)
    ap.add_argument("--quality", default=DEFAULT_QUALITY)
    ap.add_argument(
        "--dry-run", action="store_true", help="print the prompt and exit, spending nothing"
    )
    args = ap.parse_args()

    style, scenes = load_contract()
    if args.slug not in scenes:
        sys.exit(f"unknown slug {args.slug!r}\nknown: {', '.join(sorted(scenes))}")

    parts = [style, f"SCENE FOR THIS CARD: {scenes[args.slug]}"]
    if args.reference:
        parts.append(
            "The attached image is the deck's approved reference card. Match its "
            "border treatment, palette, luminance and rendering exactly. Do NOT "
            "reuse its composition, setting or figures -- only its look."
        )
    if args.note:
        parts.append(f"REVISION FOR THIS ATTEMPT: {args.note}")
    prompt = "\n\n".join(parts)

    if args.dry_run:
        print(prompt)
        return

    attempt = next_attempt(args.slug)
    dst = CANDIDATES / f"{args.slug}.a{attempt:02d}.png"

    print(f"model={args.model} size={args.size} quality={args.quality}")
    print(f"refs={len(args.reference)} -> {dst.relative_to(ROOT)}")
    if args.note:
        print(f"note: {args.note}")

    key, source = load_key()
    print(f"key from: {source}")
    fields = {
        "model": args.model,
        "prompt": prompt,
        "size": args.size,
        "quality": args.quality,
        "n": "1",
    }
    if args.reference:
        refs = []
        for r in args.reference:
            p = Path(r)
            if not p.is_file():
                sys.exit(f"missing reference image: {p}")
            refs.append(("image[]", p))
        # Multipart is all strings; `fields` is already in that shape.
        body, ctype = multipart(fields, refs)
        data = post(f"{API}/images/edits", key, body, ctype)
    else:
        # JSON is typed, and the API rejects `"n": "1"` with a 400. The two
        # endpoints genuinely disagree about this, so the conversion lives here
        # rather than in `fields` -- which the multipart branch needs as strings.
        payload = {**fields, "n": int(fields["n"])}
        body = json.dumps(payload).encode()
        data = post(f"{API}/images/generations", key, body, "application/json")

    item = data["data"][0]
    if b64 := item.get("b64_json"):
        import base64

        dst.write_bytes(base64.b64decode(b64))
    elif url := item.get("url"):
        with urllib.request.urlopen(url, timeout=TIMEOUT_S) as r:
            dst.write_bytes(r.read())
    else:
        sys.exit(f"no image in response: {json.dumps(data)[:600]}")

    dst.with_suffix(".txt").write_text(prompt + "\n", encoding="utf-8")

    print(f"\nwrote {dst.relative_to(ROOT)}  ({dst.stat().st_size/1024:.0f}KB)")
    if usage := data.get("usage"):
        print(f"usage: {json.dumps(usage)}")
    if revised := item.get("revised_prompt"):
        print(f"\nmodel rewrote the prompt:\n{revised}")
    print(f"\nnext: python3 tools/check_card_art.py {dst.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
