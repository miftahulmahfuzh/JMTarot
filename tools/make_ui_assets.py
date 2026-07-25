#!/usr/bin/env python3
"""Generate small procedural UI textures that CSS gave us for free.

The design draws the card back with
`repeating-linear-gradient(45deg, rgba(201,162,39,.16) 0 1px, transparent 1px 11px)`
crossed with its -45deg mirror. React Native has no repeating gradients, so we
bake the crosshatch into a seamlessly tileable PNG and repeat it instead.

A diagonal line drawn corner-to-corner on a square tile always tiles seamlessly,
so tile size sets the perpendicular line spacing: spacing = size / sqrt(2).
16pt gives ~11.3pt, matching the design's 11px.

    python3 tools/make_ui_assets.py

Writes assets/ui/crosshatch{,@2x,@3x}.png
"""

from PIL import Image, ImageDraw
from pathlib import Path

TILE_PT = 16
GOLD = (201, 162, 39)
ALPHA = round(0.16 * 255)


def make_tile(scale: int) -> Image.Image:
    size = TILE_PT * scale
    # Supersample so the diagonals antialias instead of stair-stepping.
    ss = 4
    big = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    width = max(1, round(1 * scale * ss))
    edge = size * ss

    # Both diagonals, each repeated at the wrap points so the seams line up.
    for offset in (-edge, 0, edge):
        draw.line([(offset, 0), (offset + edge, edge)], fill=GOLD + (ALPHA,), width=width)
        draw.line([(offset, edge), (offset + edge, 0)], fill=GOLD + (ALPHA,), width=width)

    return big.resize((size, size), Image.LANCZOS)


def main():
    out = Path("assets/ui")
    out.mkdir(parents=True, exist_ok=True)
    for scale, suffix in ((1, ""), (2, "@2x"), (3, "@3x")):
        tile = make_tile(scale)
        path = out / f"crosshatch{suffix}.png"
        tile.save(path)
        print(f"{path}  {tile.width}x{tile.height}  {path.stat().st_size}B")


if __name__ == "__main__":
    main()
