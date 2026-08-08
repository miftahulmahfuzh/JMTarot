#!/usr/bin/env python3
"""Crop the three reader faces out of the three reader scenes.

    python3 tools/make_avatars.py        # or: npm run avatars

Reads  public/dukuns/<reader>.jpg    (LEFT UNTOUCHED -- they are 2:1 SCENES)
Writes public/readers/<reader>.webp  112x112, committed
       tools/_avatarsheet.jpg        the three crops at 4x, for eyeballing
                                     (gitignored)

Idempotent: re-running writes byte-identical files for a fixed source and a fixed
CROPS table. `make_icons.py` and `make_wallpapers.py` are the convention and this
copies all of it -- a docstring that states the invariants, constants named after
the tokens they mirror, an ASSERTION that proves the docstring's promise rather
than trusting it, and one summary line per file.

── WHY THIS SCRIPT EXISTS AT ALL (v0.7.0 `C-D16`) ─────────────────────────────

The chat needs a circular portrait per reader, and `public/dukuns/*.jpg` are 2:1
landscape scenes: a woman at a table with a spread, a woman behind a crystal ball,
a man in a cafe. At 28px in a bubble gutter, a scene is a smudge. The avatar is the
FACE, cropped out once, reviewed by eye, and checked in.

**GENERATED, COMMITTED, NEVER HAND-EDITED**, exactly like `public/cards/` and
`public/wallpapers/`. The deploy does not run Python.

── THE FOUR RULES ─────────────────────────────────────────────────────────────

1. **THE SOURCE IS `public/dukuns/`, NOT `assets/`.** `C-D16` names both in
   consecutive sentences (F4's D6); `assets/` holds only `major_arcanas/` and
   `ui/`, and there is no reader art in either. Recorded here so nobody "fixes"
   this script to read a directory that does not exist.

2. **THE CROP TABLE IS HAND-WRITTEN AND IS THE DELIVERABLE OF A REVIEW, NOT A
   COMPUTATION.** Three faces do not justify a face-detection dependency, and a
   detector that drifts by five pixels on a regeneration is a change nobody
   reviewed. The boxes below were chosen by eye against `_avatarsheet.jpg` and are
   in SOURCE PIXELS.

3. **NOTHING IS UPSCALED AND NOTHING IS STRETCHED.** `make_wallpapers.py`'s S-D9
   rule, and the same trap sits in the same place: `normalize_cards.py`'s
   `fit_to_ratio` is the helper that LOOKS right to reuse here and would LANCZOS a
   short side UP to reach a ratio. So every box is asserted SQUARE and asserted
   `>= OUT` before the resize, which makes the resize always a downsample.

4. **112px, WHICH IS NOT `C-D16`'s "2x THE LARGEST RENDERED SIZE"** (F4's D7). The
   largest render is 36px (the header row; a bubble gutter is 28px), so 2x is 72.
   **The iPhone's device pixel ratio is 3**, and 36x3 = 108, rounded up to 112 for
   a multiple of 16. A face at 72px on a 3x screen is soft in the one way that
   reads as a broken asset rather than as a low-resolution one, and the whole cost
   is ~7KB across three files.

── THE CACHE HEADER IS NOT `/cards/*`'s ──────────────────────────────────────

`/readers/*` carries `max-age=86400, stale-while-revalidate=604800` in
`next.config.ts`, NOT a year of `immutable`. This table will be tuned after
somebody looks at the sheet on a phone, and three non-content-hashed filenames
plus a year of `immutable` means every existing install keeps a bad crop until
2027. **That exact mistake was already made once in this repo, with
`/wallpapers/`.** `/readers/` also joins `src/middleware.ts`'s negative lookahead,
which is a SEPARATE rule (`F4-18`): the header without the matcher entry means a
`Set-Cookie` on a static image on every chat render.
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/dukuns"
OUT_DIR = ROOT / "public/readers"
SHEET = ROOT / "tools/_avatarsheet.jpg"

# 36px (the header row) x the iPhone's DPR of 3, rounded up to a multiple of 16.
# See rule 4.
OUT = 112

# q82 with `method=6`: ~3-5KB a face. WebP rather than JPEG, and the reason is the
# opposite of `make_wallpapers.py`'s: a wallpaper has to reach the iOS Photos
# library, and an avatar only has to reach an <img> -- so the format question is
# purely bytes, and every browser this app supports decodes WebP.
ENCODE = dict(format="WEBP", quality=82, method=6)

# src/theme/tokens.ts `color.canvas` = #0a0812. The sheet's mat only; no output
# file has a background, because a face crop is opaque edge to edge.
CANVAS = (10, 8, 18)

# ── THE CROP TABLE ─────────────────────────────────────────────────────────────
#
# `(left, top, right, bottom)` in SOURCE pixels, square by construction and
# asserted square below. Each was chosen so the crop clears the hair on top and
# ends at the collar, with the face a little above centre -- which is where a face
# sits in a portrait and is not where a naive centre crop puts it.
#
# The three sources are three different resolutions (1024x512, 1376x768,
# 1440x720), so these numbers do not scale between rows and there is no formula
# hiding in them.
CROPS: dict[str, tuple[int, int, int, int]] = {
    # Face at ~(516, 124). Hair top ~30, chin ~170: the box opens at 15 and closes
    # at the collar. The narrowest source of the three, so the smallest box.
    "thessaly": (401, 12, 631, 242),
    # Face at ~(730, 176), between two candelabra. 300 wide clears both -- widening
    # it to 340 pulls a candle flame into the circle, which at 28px reads as a
    # blown highlight rather than as a candle.
    "margaret": (580, 34, 880, 334),
    # Face at ~(714, 200). Hair top ~110, chin ~250; the box ends on the denim
    # collar, which is what keeps the circle from looking like a floating head.
    # The left edge moved 566 -> 554 after the first sheet: he sat ~3% left of
    # centre, which is invisible in a square and is not in a CIRCLE, where an
    # off-centre face reads as a bad crop rather than as a pose.
    "adrian": (554, 46, 874, 366),
}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    thumbs: list[Image.Image] = []
    total = 0

    print(f"{'reader':10s} {'source':>12s}  {'box':>22s}  {'side':>5s}  {'out':>10s}")

    for reader, box in CROPS.items():
        path = SRC / f"{reader}.jpg"
        if not path.exists():
            sys.exit(f"{path.relative_to(ROOT)} is missing -- the source is public/dukuns/")

        source = Image.open(path)
        left, top, right, bottom = box
        w, h = right - left, bottom - top

        # ── THE ASSERTIONS THAT REPLACE A RESAMPLE (rule 3) ──────────────────
        # Each one is a docstring promise made mechanical. A square that is not
        # square stretches a face by a percentage nobody would notice in review
        # and everybody would notice on a phone.
        if w != h:
            sys.exit(f"{reader}: box {box} is {w}x{h}, not square")
        if left < 0 or top < 0 or right > source.width or bottom > source.height:
            sys.exit(f"{reader}: box {box} falls outside {source.size}")
        if w < OUT:
            sys.exit(
                f"{reader}: box side {w} is under {OUT}px, so the resize would be an "
                "UPSCALE. Widen the box or lower OUT -- do not reach for fit_to_ratio."
            )

        face = source.convert("RGB").crop(box).resize((OUT, OUT), Image.LANCZOS)
        if face.size != (OUT, OUT) or face.mode != "RGB":
            sys.exit(f"{reader}: produced {face.size} {face.mode}")

        out = OUT_DIR / f"{reader}.webp"
        face.save(out, **ENCODE)
        size = out.stat().st_size
        total += size

        print(
            f"{reader:10s} {str(source.size):>12s}  {str(box):>22s}  {w:>5d}  "
            f"{size/1024:>7.1f}KB"
        )
        # 4x, because the review question is "is this a portrait" and 112px is too
        # small to answer it on a desktop screen -- while 28px on glass is a loop-6
        # question this sheet cannot answer either way.
        thumbs.append(face.resize((OUT * 4, OUT * 4), Image.LANCZOS))

    sheet = Image.new("RGB", (OUT * 4 * len(thumbs), OUT * 4), CANVAS)
    for i, t in enumerate(thumbs):
        sheet.paste(t, (OUT * 4 * i, 0))
    sheet.save(SHEET, quality=88)

    print(
        f"\n{len(CROPS)} avatars, {total/1024:.1f}KB total\n"
        f"contact sheet: {SHEET.relative_to(ROOT)}  -- LOOK AT IT, then look at it "
        f"on a phone at 28px (loop 6)"
    )


if __name__ == "__main__":
    main()
