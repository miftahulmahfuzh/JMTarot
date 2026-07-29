#!/usr/bin/env python3
"""Derive downloadable wallpapers from the committed source art.

    python3 tools/make_wallpapers.py     # or: npm run wallpapers

Reads  assets/major_arcanas/NN_slug.png      (LEFT UNTOUCHED)
Writes public/wallpapers/<url-slug>-card.jpg   1024x1536, the native card
       public/wallpapers/<url-slug>-phone.jpg  1440x3120, that card UNSCALED on a mat
       tools/_wallpapersheet.jpg               for eyeballing (gitignored)

Idempotent: re-running writes byte-identical files. VERIFIED by SHA-256 over all
44 on 2026-07-28 -- Pillow's JPEG encoder is deterministic for fixed parameters
and writes no timestamp, and every parameter is pinned in ENCODE below.

── THE THREE CONSTRAINTS THIS FILE EXISTS TO HONOUR (roadmap v0.4.0 S-D9) ──────

1. **THE ART IS NEVER REGENERATED.** Generating the deck is expensive and the
   current art is the product's best asset. Nothing here imports
   tools/gen_card_art.py, calls a model, or runs `npm run assets`. The only input
   is the 22 committed PNGs.

2. **NOTHING IS UPSCALED AND NOTHING IS CROPPED.** 1024x1536 is the true
   resolution; a 2x export is a lie in a filename. So the phone variant is the
   native card CENTRED ON A MAT, and the card variant is the source pixels with
   nothing done to them but a JPEG encode.

   **AND THIS IS WHERE THE TRAP IS.** The obvious reuse is
   `normalize_cards.py`'s `fit_to_ratio`, which trims a dark mat and then scales
   the result to the target. On art that is already correct that costs nothing --
   measured 0px trimmed on all 22 -- but if the trim ever removes 4px of width,
   `fit_to_ratio` LANCZOSes 1020 -> 1024 and produces an UPSCALE, from inside the
   function that looks like the right one to call. So this file uses
   `flatten`/`trim_dark_mat` as an ASSERTION and then reads the untouched source.
   A source that fails the assertion is a source to fix.

3. **THE OUTPUT PATH IS ITS OWN, WITH ITS OWN CACHE HEADER.** `public/wallpapers/`,
   never under `public/cards/`. `/cards/*` carries `max-age=31536000, immutable` on
   non-content-hashed filenames -- correct there, because the fan pulls 22 files on
   every cold draw -- and `/wallpapers/*` carries `max-age=86400,
   stale-while-revalidate=604800` instead, because a wallpaper is fetched ONCE by
   somebody who tapped a button. That is also why there is no `?v=` and no content
   hash in these filenames: a regenerated deck propagates in a day on its own.

── WHY JPEG, WHEN WEBP IS 24% SMALLER AT MATCHED FIDELITY ──────────────────────
Measured, not assumed: WebP q90 is 471KB at PSNR 38.99 against JPEG q92's 621KB at
38.94. We ship JPEG anyway, and the reason is the target platform. The one thing a
wallpaper must do is reach the iOS Photos library, because Set Wallpaper reads
from nowhere else, and iOS's WebP story in that pipeline is inconsistent and
version-dependent -- Photos does not treat WebP as a native asset type and
"Add to Photos" on a long-pressed WebP has a history of failing. JPEG is accepted
by every Photos app, messenger, printer and OS. 6.6MB of git is not worth a
download button that silently does nothing on the platform this app is built for.

q90 rather than q92 or q95: 65.1% of this deck's pixels are darker than 15%
luminance, and the p99.9 per-channel error runs 11-13 at q90, 10-11 at q92 and 8-9
at q95. q92 buys ONE level for 12% more bytes; q95 buys three for 46%. Change
QUALITY here if a real phone (loop 6) ever shows blocking in a dark gradient --
that is the only instrument that can answer it.

4:4:4 rather than 4:2:0, for 83KB a card: this deck's signature is a thin GOLD
HAIRLINE on a navy or cream frame, which is exactly the content chroma subsampling
smears.
"""

import re
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from normalize_cards import ARCANA, flatten, trim_dark_mat  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/major_arcanas"
OUT = ROOT / "public/wallpapers"
SHEET = ROOT / "tools/_wallpapersheet.jpg"
CARDS_JSON = ROOT / "src/data/cards.json"

CARD_W, CARD_H = 1024, 1536

# 1440x3120 is 19.5:9 and the WIDEST pixel width in common circulation (Galaxy
# S24/S25 Ultra), so NO PHONE EVER UPSCALES THIS FILE -- the strongest available
# form of "no upscaling": we do not do it, and we do not make the device do it.
# Within 0.5% of every modern iPhone's aspect (0.4600-0.4614), so the aspect-fill
# crop on an iPhone is under one percent.
#
# The card is 1536/3120 = 49.2% of the height, so it SURVIVES an aspect-fill crop
# on anything: a 16:9 screen shows 82% of the height, a 4:3 tablet 61.5%. Checked
# concretely on an iPhone SE 3 (750x1334): the card lands at y=412..1212 inside a
# visible band of 145..1479.
#
# The card's top edge is at 25.4% of the height and iOS puts the clock at roughly
# 12-20%, so they do not collide.
PHONE_W, PHONE_H = 1440, 3120

# src/theme/tokens.ts `color.canvas` = #0a0812. NOT a new token, and NOT
# `color.bgRadial`: a subtle dark gradient in 8-bit sRGB bands on an OLED panel,
# and the flat mat is nearly free -- measured, the padded 1440x3120 file is only
# 39KB larger than the bare 1024x1536 card, because a flat region is DC-only.
CANVAS = (10, 8, 18)

ENCODE = dict(quality=90, optimize=True, progressive=True, subsampling=0)

VARIANTS = ("card", "phone")


def url_slug(name: str) -> str:
    """`The Moon` -> `the-moon`. Roadmap v0.4.0 S-D4.

    A SECOND identifier, derived, never the art filename: `Card.slug` addresses a
    file and this addresses a document a person found by typing words.
    Underscores and a leading number are worth nothing in a URL.

    VERIFIED to reproduce roadmap §3.2's table exactly for all 22, including the
    four cards that carry no article (strength, justice, death, temperance) and
    `wheel-of-fortune`. Neither is a special case; both fall out of the rule.

    THE SAME DERIVATION AS `cardUrlSlug` IN src/data/deck.ts, AND THAT IS NOT A
    SECOND DEFINITION OF A PUBLIC ADDRESS: no language here can import the other,
    so `check_wallpapers.py` holds §3.2's table verbatim and `wallpaper.test.ts`
    asserts every URL the TypeScript builds names a file this script wrote. The
    filesystem is the shared artefact and either side drifting is red.
    """
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def read_names() -> dict[str, str]:
    """art slug -> English card name, from the generated deck data.

    `src/data/cards.json` rather than a table here, so the URL slug follows the
    card's name and there is one fewer hand-maintained mapping -- the thing
    normalize_cards.py's header records as having made adding a card error-prone.
    """
    import json

    return {c["slug"]: c["name"] for c in json.loads(CARDS_JSON.read_text())}


def main() -> None:
    if not SRC.is_dir():
        sys.exit(f"missing source directory: {SRC}")
    names = read_names()
    missing = [f"{s}.png" for s in ARCANA if not (SRC / f"{s}.png").is_file()]
    if missing:
        sys.exit(f"missing source art: {', '.join(missing)}")

    OUT.mkdir(parents=True, exist_ok=True)

    thumbs, totals = [], {v: 0 for v in VARIANTS}
    print(f"{'card':22s} {'url slug':20s} {'card kb':>8s} {'phone kb':>9s}")

    for art in ARCANA:
        url = url_slug(names[art])
        source = Image.open(SRC / f"{art}.png")

        # ── THE ASSERTION THAT REPLACES A RESAMPLE. See constraint 2 in the
        # header. Failing loudly here is the whole mechanism: the alternative is
        # a silent LANCZOS that turns "the honest maximum" into a 4px upscale.
        if source.size != (CARD_W, CARD_H):
            sys.exit(
                f"{art}.png is {source.size}, want {(CARD_W, CARD_H)}. "
                "This pipeline never resamples -- fix the source."
            )
        flat = flatten(source)
        trimmed = trim_dark_mat(flat)
        lost = (CARD_W - trimmed.size[0], CARD_H - trimmed.size[1])
        if lost[0] > 4 or lost[1] > 4:
            sys.exit(
                f"{art}.png carries a {lost} dark mat. Padding it back would mean "
                "scaling the artwork up, which S-D9 forbids -- fix the source."
            )

        # `flat` and not `source`: identical pixels for an RGB PNG with no alpha
        # (which all 22 are, verified -- mode RGB, no ICC profile), and it means a
        # source that ever arrives with an alpha channel is composited onto the
        # mat colour rather than onto white by the JPEG encoder.
        card = flat.convert("RGB")

        card_path = OUT / f"{url}-card.jpg"
        card.save(card_path, "JPEG", **ENCODE)
        totals["card"] += card_path.stat().st_size

        # NO RESIZE ON THIS LINE, EVER. `paste` at an offset is the whole variant.
        mat = Image.new("RGB", (PHONE_W, PHONE_H), CANVAS)
        mat.paste(card, ((PHONE_W - CARD_W) // 2, (PHONE_H - CARD_H) // 2))
        phone_path = OUT / f"{url}-phone.jpg"
        mat.save(phone_path, "JPEG", **ENCODE)
        totals["phone"] += phone_path.stat().st_size

        print(
            f"{art:22s} {url:20s} {card_path.stat().st_size/1024:>8.0f} "
            f"{phone_path.stat().st_size/1024:>9.0f}"
        )
        # The sheet shows the PHONE variant, because the mat and the centring are
        # the only things in this pipeline a number cannot judge.
        thumbs.append(mat.resize((120, 260), Image.LANCZOS))

    sheet = Image.new("RGB", (120 * 6, 260 * 4), CANVAS)
    for i, t in enumerate(thumbs):
        sheet.paste(t, (120 * (i % 6), 260 * (i // 6)))
    sheet.save(SHEET, quality=88)

    total = sum(totals.values())
    print(
        f"\n{len(ARCANA)} cards x 2 variants = {len(ARCANA)*2} files\n"
        f"  card   {totals['card']/1e6:6.2f} MB\n"
        f"  phone  {totals['phone']/1e6:6.2f} MB\n"
        f"  TOTAL  {total/1e6:6.2f} MB   ({total/(len(ARCANA)*2)/1024:.0f}KB mean)\n"
        f"contact sheet: {SHEET.relative_to(ROOT)}\n"
        "verify: python3 tools/check_wallpapers.py"
    )


if __name__ == "__main__":
    main()
