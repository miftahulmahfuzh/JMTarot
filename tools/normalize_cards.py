#!/usr/bin/env python3
"""Normalize Major Arcana source art into bundle-ready card assets.

The deck is now generated in one pass by `/generate-tarot-card` at exactly
1024x1536 -- 2:3, full bleed, no mat -- so this pass is mostly a resize. The trim
and pad stay as a BACKSTOP, not because anything needs them: they cost nothing on
art that is already correct (measured: 0px trimmed on all 22) and they are the
only thing standing between a stray mat and side bars in the app.

Padding (never cropping) is deliberate. It was originally because cropping to 2:3
would clip the card titles on the 1024x1536 generation; the regenerated deck has
no titles, but padding is still the option that cannot silently eat artwork.

THREE sizes come out. Two of them are WebP for the app; the third is PNG and
exists for one reason, which is worth stating before somebody deletes it as
redundant:

**SATORI CANNOT DECODE WEBP.** `next/og`'s image pipeline is vendored inside
`next` (satori + resvg + yoga, no new dependency), and its allowed-format list --
read out of the bundle rather than out of documentation -- is

    var qI = [image/png, image/apng, image/jpeg, image/gif, image/svg+xml];
    ...
    if (!qI.includes(t)) throw new Error(`Unsupported image type: ${t}`);

`image/webp` and `image/avif` are *detected* and then *rejected*. Every card in
`public/cards/` and `public/cards/thumb/` is WebP, so the naive OG image throws at
REQUEST time -- in the one code path nobody looks at, because a missing WhatsApp
preview is invisible from inside the app. Hence `public/cards/og/NN_slug.png` at
200x300: three cards render at ~190x285 on a 1200x630 canvas, so the size is exact
rather than generous.

Two sizes come out for the app itself, because it draws cards at two very
different scales.
The fan renders all 22 at roughly 88x132 CSS pixels; serving 800x1200 art for
that means 4.1MB to paint 22 thumbnails, which on mobile data would be the
single worst thing this app does. The result panel genuinely needs the full
size. So: full for the reading, thumb for the fan and the slots.

    python3 tools/normalize_cards.py

Reads  assets/major_arcanas/*.png     (left untouched)
Writes public/cards/NN_slug.webp      at TARGET_W x TARGET_H
       public/cards/thumb/NN_slug.webp at THUMB_W x THUMB_H
       public/cards/og/NN_slug.png     at OG_W x OG_H -- PNG, for satori (V7)
       tools/_contactsheet.jpg        for eyeballing the result

Idempotent: re-running overwrites all three outputs with identical bytes.

`public/cards/og/` inherits `/cards/*`'s one-year `immutable` cache header from
next.config.ts, which is correct and is one more directory covered by CLAUDE.md's
existing warning: regenerating the art means changing the filenames or shortening
that header first, or existing installs keep the old images.
"""

from PIL import Image
from pathlib import Path
import sys

SRC = Path("assets/major_arcanas")
OUT = Path("public/cards")
THUMB_OUT = OUT / "thumb"
OG_OUT = OUT / "og"
TARGET_W, TARGET_H = 800, 1200
QUALITY = 82

# The fan draws cards at 88x132 CSS px, so 240x360 covers a 2.7x device pixel
# ratio -- more than an iPhone's 3x needs at that size, and the headroom means
# the same file also serves the slightly larger slots. Quality drops to 80
# because compression artefacts are invisible at this scale.
#
# S3 ADDED A SECOND CONSUMER AND THE HEADROOM DOES NOT REACH IT. `/gallery` draws
# these at 138-173 CSS px (2 columns x 11 rows in a phone-width column, MEASURED --
# see tools/seo/galleryfit.sh), so on a DPR-2 phone the browser wants 276-346 device
# px and gets 240: a 1.15x to 1.44x UPSCALE. Accepted deliberately, because a
# 2-column phone grid CANNOT be served losslessly by a 240px source at any column
# width -- it would need <= 120 CSS px, and 288px of content minus a 12px gap cannot
# produce that. The alternatives are the 800x1200 art (3.7MB for 22 cards, on the page
# whose Core Web Vitals a crawler measures) or a new 480x720 variant (~1MB more
# committed, a new asset class, out of v0.4.0's scope). At DPR 1 and >= 552px the
# column is 238px and this file is very nearly 1:1, so the desktop case is already
# exact. If a later release wants the @2x thumb it is one line here plus a `srcset`
# in `CardFace`.
THUMB_W, THUMB_H = 240, 360
THUMB_QUALITY = 80

# V7's OG previews. 200x300 because the layout draws three cards at ~190x285 on a
# 1200x630 canvas, so this is one device pixel of headroom rather than a guess.
#
# PALETTE-QUANTIZED to 128 colours. The art is dark navy and cream with a narrow
# gamut, so the loss is invisible at 200px and the saving is large -- measured
# below, and the total is what matters: 22 files that are committed and served.
OG_W, OG_H = 200, 300
OG_COLORS = 128
MAT = (0, 0, 0)
DARK_THRESHOLD = 40

# Card order is the Fool's Journey, 0-21. Index is meaningful: it drives the
# journey-stage rules in the combination engine and the birth-card mapping.
#
# THIS USED TO BE A HAND-MAINTAINED (slug, filename) TABLE, because the source art
# arrived in three batches with three naming conventions -- `Death.png`,
# `The hanged man.png`, `high_priestess.png`. The deck was regenerated in one pass
# by `/generate-tarot-card`, every file is `NN_slug.png`, and the mapping is now
# the identity. Keeping the table would be keeping a translation layer between a
# name and itself, and it was the thing that made adding a card error-prone.
ARCANA = [
    "00_fool",
    "01_magician",
    "02_high_priestess",
    "03_empress",
    "04_emperor",
    "05_hierophant",
    "06_lovers",
    "07_chariot",
    "08_strength",
    "09_hermit",
    "10_wheel_of_fortune",
    "11_justice",
    "12_hanged_man",
    "13_death",
    "14_temperance",
    "15_devil",
    "16_tower",
    "17_star",
    "18_moon",
    "19_sun",
    "20_judgement",
    "21_world",
]


def flatten(im):
    """Drop alpha onto the mat colour so every card is opaque RGB."""
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, MAT)
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def trim_dark_mat(im):
    """Crop off uniformly near-black rows/columns at each edge."""
    grey = im.convert("L")
    w, h = grey.size
    px = grey.load()
    xs = range(0, w, max(1, w // 60))
    ys = range(0, h, max(1, h // 60))

    row_dark = lambda y: all(px[x, y] < DARK_THRESHOLD for x in xs)
    col_dark = lambda x: all(px[x, y] < DARK_THRESHOLD for y in ys)

    top = 0
    while top < h and row_dark(top):
        top += 1
    bottom = h
    while bottom > top and row_dark(bottom - 1):
        bottom -= 1
    left = 0
    while left < w and col_dark(left):
        left += 1
    right = w
    while right > left and col_dark(right - 1):
        right -= 1

    return im.crop((left, top, right, bottom))


def fit_to_ratio(im):
    """Scale to fit the 2:3 target and centre on a mat -- no artwork is lost."""
    target_ratio = TARGET_W / TARGET_H
    w, h = im.size
    if w / h > target_ratio:
        new_w, new_h = TARGET_W, round(TARGET_W * h / w)
    else:
        new_h, new_w = TARGET_H, round(TARGET_H * w / h)

    im = im.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGB", (TARGET_W, TARGET_H), MAT)
    canvas.paste(im, ((TARGET_W - new_w) // 2, (TARGET_H - new_h) // 2))
    return canvas, new_w, new_h


def main():
    if not SRC.is_dir():
        sys.exit(f"missing source directory: {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    THUMB_OUT.mkdir(parents=True, exist_ok=True)
    OG_OUT.mkdir(parents=True, exist_ok=True)

    missing = [f"{s}.png" for s in ARCANA if not (SRC / f"{s}.png").is_file()]
    if missing:
        sys.exit(f"missing source art: {', '.join(missing)}")

    thumbs, total_in, total_out, total_thumb, total_og = [], 0, 0, 0, 0
    print(
        f"{'card':22s} {'source':>12s} {'trimmed':>12s} {'bars':>6s} {'kb':>7s} "
        f"{'thumb kb':>9s} {'og kb':>7s}"
    )

    for slug in ARCANA:
        src_path = SRC / f"{slug}.png"
        total_in += src_path.stat().st_size

        im = flatten(Image.open(src_path))
        source_size = im.size
        im = trim_dark_mat(im)
        trimmed_size = im.size
        card, drawn_w, drawn_h = fit_to_ratio(im)

        dst = OUT / f"{slug}.webp"
        card.save(dst, "WEBP", quality=QUALITY, method=6)
        out_bytes = dst.stat().st_size
        total_out += out_bytes

        # Downscaled from the already-padded 2:3 card, not from the source, so
        # the two sizes frame the artwork identically. A thumb derived straight
        # from the source would sit a pixel or two off from its full-size
        # counterpart and the swap would visibly jump.
        thumb_dst = THUMB_OUT / f"{slug}.webp"
        card.resize((THUMB_W, THUMB_H), Image.LANCZOS).save(
            thumb_dst, "WEBP", quality=THUMB_QUALITY, method=6
        )
        thumb_bytes = thumb_dst.stat().st_size
        total_thumb += thumb_bytes

        # V7's OG copy. Derived from the SAME padded 2:3 card as the other two, so
        # the WhatsApp preview frames the artwork exactly as the app does -- a
        # preview cropped differently from the page reads as a different deck.
        og_dst = OG_OUT / f"{slug}.png"
        (
            card.resize((OG_W, OG_H), Image.LANCZOS)
            .quantize(colors=OG_COLORS, method=Image.MEDIANCUT)
            .save(og_dst, "PNG", optimize=True)
        )
        og_bytes = og_dst.stat().st_size
        total_og += og_bytes

        # Side bars appear when the trimmed art is narrower than 2:3.
        bars = (TARGET_W - drawn_w) // 2
        print(
            f"{slug:22s} {'x'.join(map(str, source_size)):>12s} "
            f"{'x'.join(map(str, trimmed_size)):>12s} {bars:>6d} {out_bytes/1024:>7.1f} "
            f"{thumb_bytes/1024:>9.1f} {og_bytes/1024:>7.1f}"
        )
        thumbs.append(card.resize((160, 240), Image.LANCZOS))

    sheet = Image.new("RGB", (160 * 6, 240 * 4), (10, 8, 18))
    for i, thumb in enumerate(thumbs):
        sheet.paste(thumb, (160 * (i % 6), 240 * (i // 6)))
    sheet.save("tools/_contactsheet.jpg", quality=88)

    print(f"\n{len(ARCANA)} cards  {total_in/1e6:.1f}MB -> {total_out/1e6:.2f}MB "
          f"({total_in/total_out:.0f}x smaller)")
    print(f"{len(ARCANA)} thumbs {total_thumb/1e3:.0f}KB total "
          f"-- the whole fan, at {total_thumb/total_out*100:.0f}% of the full-size cost")
    print(f"{len(ARCANA)} og pngs {total_og/1e3:.0f}KB total "
          f"-- satori cannot read WebP; see the header")
    print("contact sheet: tools/_contactsheet.jpg")


if __name__ == "__main__":
    main()
