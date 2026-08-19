#!/usr/bin/env python3
"""
Prepare a captured still for `README.md`: downscale, quantize, report.

WHY IT EXISTS: `capture.mjs` writes a 780x1688 PNG (390 CSS px at 2x) and those
are 0.5-1.3MB each. GitHub renders a README tile at ~230-300px wide, so the
capture is 3x oversampled for its only destination, and a dozen of them would put
15MB of screenshots into a repository that already commits 23.77MB of wallpapers.

  --width 600 keeps better than 2x at the size these are actually shown, which is
  the point at which the text stays crisp on a retina display and the file stops
  being three quarters waste.

Quantizing to an adaptive 256-colour palette is nearly free on this app's
palette -- it is a dark violet gradient, gold rules and one photograph per screen
-- and it is the difference between ~700KB and ~200KB. Measured per file, and
printed, so a screen where it DOES hurt (the card art in the gallery) is visible
rather than assumed.

Usage:
  python3 tools/media/still.py <in.png> <out.png> [--width 600] [--colors 256]
                              [--crop x,y,w,h] [--max-height N]
"""
from __future__ import annotations

import argparse
import pathlib
import sys

from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--width", type=int, default=600)
    ap.add_argument("--colors", type=int, default=256)
    ap.add_argument("--crop", default=None, help="x,y,w,h in SOURCE pixels")
    ap.add_argument(
        "--max-height",
        type=int,
        default=0,
        help="crop the bottom off after scaling; 0 keeps the whole page",
    )
    a = ap.parse_args()

    src = pathlib.Path(a.src)
    im = Image.open(src).convert("RGB")
    before = src.stat().st_size

    if a.crop:
        x, y, w, h = (int(v) for v in a.crop.split(","))
        im = im.crop((x, y, x + w, y + h))

    if im.width != a.width:
        h = round(im.height * a.width / im.width)
        im = im.resize((a.width, h), Image.LANCZOS)

    if a.max_height and im.height > a.max_height:
        im = im.crop((0, 0, im.width, a.max_height))

    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if a.colors and a.colors < 256 or a.colors == 256:
        im.quantize(colors=a.colors, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG).save(
            out, optimize=True
        )
    else:
        im.save(out, optimize=True)

    after = out.stat().st_size
    print(
        f"{out}  {im.width}x{im.height}  "
        f"{before / 1000:.0f}KB -> {after / 1000:.0f}KB  ({100 * after / before:.0f}%)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
