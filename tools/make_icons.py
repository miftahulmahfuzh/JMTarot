#!/usr/bin/env python3
"""Generate the home-screen icons.

    python3 tools/make_icons.py

Writes public/icon.png       512x512
       public/apple-icon.png 180x180

The mark is the same four-pointed star and ring that sits on the card back, so
the installed icon and the deck read as one thing.

NO ALPHA CHANNEL, deliberately. iOS composites home-screen icons onto white, so
a transparent background turns a dark icon into a bright square with a smudge
in the middle. Saving as RGB makes that impossible to get wrong later.

The star is drawn as a polygon rather than set as the '✧' glyph: it avoids
depending on a font being installed, and it keeps the proportions identical at
both sizes.
"""

from PIL import Image, ImageDraw
from pathlib import Path
import math

CANVAS = (10, 8, 18)        # --canvas #0a0812
GOLD_LIFT = (216, 183, 106)  # --gold-lift #d8b76a
GOLD_RING = (116, 96, 40)    # --gold at ~50% over the canvas, precomputed opaque

# Supersample, then downscale: PIL has no antialiased polygon fill.
SS = 4


def star_points(cx, cy, outer, inner, points=4, rotation=-math.pi / 2):
    """Concave star: `points` tips at `outer`, valleys at `inner`."""
    coords = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        a = rotation + i * math.pi / points
        coords.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return coords


def make(size: int, path: Path):
    s = size * SS
    im = Image.new("RGB", (s, s), CANVAS)
    d = ImageDraw.Draw(im)
    c = s / 2

    # Ring, matching the medallion on the card back (62/172 of the card width).
    ring_r = s * 0.30
    d.ellipse(
        [c - ring_r, c - ring_r, c + ring_r, c + ring_r],
        outline=GOLD_RING,
        width=max(1, int(s * 0.008)),
    )

    # Four-pointed star. The deep inner radius is what makes it read as a
    # sparkle rather than a diamond.
    d.polygon(star_points(c, c, s * 0.20, s * 0.052), fill=GOLD_LIFT)

    im.resize((size, size), Image.LANCZOS).save(path, "PNG")
    # Prove the promise in the docstring rather than trusting it.
    assert Image.open(path).mode == "RGB", f"{path} must have no alpha channel"
    print(f"{path}  {size}x{size}  {path.stat().st_size / 1024:.1f}KB  mode=RGB")


def main():
    out = Path("public")
    out.mkdir(exist_ok=True)
    make(512, out / "icon.png")
    make(180, out / "apple-icon.png")


if __name__ == "__main__":
    main()
