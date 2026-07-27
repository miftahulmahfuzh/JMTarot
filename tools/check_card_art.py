#!/usr/bin/env python3
"""Grade one candidate card against the deck's measurable requirements.

The other half of the `/generate-tarot-card` skill. This half measures; a human
(or the agent running the skill) still has to LOOK at the card, because the
things that actually broke the last deck -- ten cards sharing one backdrop -- are
invisible to every number below.

    python3 tools/check_card_art.py assets/major_arcanas/_candidates/10_wheel_of_fortune.a01.png
    python3 tools/check_card_art.py <candidate> --anchor assets/major_arcanas/_anchor.png

Exit 0 if every hard check passes, 1 otherwise. Advisory checks never fail the
run; they print a warning, because a threshold that fails on something harmless
is a threshold somebody comments out.

── WHERE THE NUMBERS COME FROM ──────────────────────────────────────────────
docs/art-inconsistency.md measured the existing deck and found the break is
frame LUMINANCE, not hue: cream cards at 44-49% against navy at 8-29%, a 5x
spread that makes one card glow beside two that recede. The frame sampling band
below is that document's band, unchanged on purpose, so a number printed here is
comparable to a number printed there.
"""

import argparse
import colorsys
import importlib.util
import statistics
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

TARGET_W, TARGET_H = 1024, 1536

# The app draws every card in a 2:3 box with `border-radius: 10px` on a 90px-wide
# slot (src/components/Slots.module.css), so the clipped corner is 10/90 of the
# width -- about 114px once scaled to a 1024px-wide source. Detail inside that
# arc is detail the querent never sees.
CORNER_FRAC = 10 / 90

# Frame luminance. A mid-tone frame is the whole point: bright enough to read as
# an object on the near-black --canvas (#0a0812, ~4%), dark enough not to glow.
FRAME_LUM_MIN, FRAME_LUM_MAX = 22.0, 36.0

# A letterbox bar is uniform along its whole length; artwork is not. 1.5 is well
# clear of WebP/PNG noise on a flat mat and well below any real frame.
EDGE_UNIFORM_STDDEV = 1.5

# Palette. The style block asks for "desaturated and cold ... one saturated
# accent and only one", and mean saturation measures exactly that. MEASURED: the
# first approved card sits at 21.3% against 42-67% for every card of the old
# deck, so this separates the two treatments outright. The floor guards the other
# way -- a fully greyscale card has no red accent left to carry.
SAT_MIN_PCT, SAT_MAX_PCT = 12.0, 32.0

# The red accent, by hue rather than by channel differences.
#
# THIS IS ADVISORY AND IT CANNOT BE A HARD GATE. Two findings, both measured
# rather than reasoned about:
#
# 1. The obvious test -- `R-G > 40 and R-B > 40` -- is an ABSOLUTE channel
#    difference, and absolute differences shrink with brightness. On a deck that
#    is dark by design it scored a visibly blood-soaked card at 0.03% and the
#    handful of pixels it did find were CANDLE FLAME at hue 28-30 degrees.
#    Hue and saturation are brightness-independent; channel deltas are not.
#
# 2. Even done properly, a global red share measures WARMTH, NOT BLOOD. Negative
#    control: the old cream-and-gold Fool, which contains no blood whatsoever,
#    scores 7.6% against 3.9% for the bloodiest card in the new deck. No hue
#    wedge separates them, because there is nothing to separate -- both are red
#    pixels.
#
# So this number is only meaningful ONCE THE SATURATION GATE ABOVE HAS PASSED,
# which is what makes "the red pixels are the accent" true rather than assumed.
# Reported so a card with no red at all is visible; never failed on.
RED_HUE_MAX, RED_HUE_MIN = 15.0, 350.0
RED_SAT_FLOOR, RED_VAL_FLOOR = 0.35, 0.10
RED_ADVISORY_MIN, RED_ADVISORY_MAX = 1.0, 12.0

# Anchor tolerances. Frame luminance is the tight one because it is the metric
# that broke the last deck; mean colour is loose because the scenes are supposed
# to differ.
ANCHOR_LUM_TOL = 5.0
ANCHOR_RB_TOL = 14.0
ANCHOR_COLOUR_TOL = 46.0


def load_normalize():
    """Reuse the shipping pipeline's own mat-trimmer rather than reimplementing it.

    If this file's idea of "a dark mat" ever diverges from normalize_cards.py's,
    a card can pass here and still come out of `npm run assets` with side bars --
    which is the exact bug this whole exercise exists to remove.
    """
    spec = importlib.util.spec_from_file_location("nc", ROOT / "tools/normalize_cards.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def frame_stats(im: Image.Image) -> tuple[float, float]:
    """Mean luminance % and red-minus-blue of the border band.

    Verbatim the sampling in docs/art-inconsistency.md: a band just inside the
    top and bottom edges, across the middle 64% of the width.
    """
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    band_h = max(8, round(h * 0.010))
    inset = max(8, round(h * 0.005))
    ys = list(range(inset, inset + band_h)) + list(range(h - inset - band_h, h - inset))
    s = [px[x, y] for x in range(int(w * 0.18), int(w * 0.82)) for y in ys]
    r, g, b = (sum(c[i] for c in s) / len(s) for i in range(3))
    return (r + g + b) / 3 / 255 * 100, r - b


def edge_uniformity(im: Image.Image) -> dict[str, float]:
    """Per-edge stddev of the outermost 1% strip. Near-zero means a flat bar."""
    im = im.convert("L")
    w, h = im.size
    px = im.load()
    strip_w = max(4, round(w * 0.01))
    strip_h = max(4, round(h * 0.01))
    edges = {
        "top": [px[x, y] for x in range(w) for y in range(strip_h)],
        "bottom": [px[x, y] for x in range(w) for y in range(h - strip_h, h)],
        "left": [px[x, y] for x in range(strip_w) for y in range(h)],
        "right": [px[x, y] for x in range(w - strip_w, w) for y in range(h)],
    }
    return {k: statistics.pstdev(v) for k, v in edges.items()}


def palette(im: Image.Image) -> tuple[float, float]:
    """Mean saturation % of the lit pixels, and the red-accent share %.

    One pass, because both walk the same pixels and this runs on every attempt.
    Near-black pixels are excluded from the saturation mean: their hue and
    saturation are numerically unstable and there are a great many of them in a
    deck lit by one candle.
    """
    small = im.convert("RGB").resize((256, 384), Image.BILINEAR)
    px = small.load()
    sats: list[float] = []
    red = 0
    for x in range(256):
        for y in range(384):
            r, g, b = px[x, y]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if v < 0.08:
                continue
            sats.append(s)
            deg = h * 360
            if (deg < RED_HUE_MAX or deg > RED_HUE_MIN) and s > RED_SAT_FLOOR and v > RED_VAL_FLOOR:
                red += 1
    if not sats:
        return 0.0, 0.0
    return statistics.mean(sats) * 100, red / (256 * 384) * 100


def corner_detail(im: Image.Image) -> dict[str, float]:
    """Stddev inside each clipped corner square. High means detail is being lost."""
    im = im.convert("L")
    w, h = im.size
    px = im.load()
    n = round(w * CORNER_FRAC)
    boxes = {
        "tl": (0, 0),
        "tr": (w - n, 0),
        "bl": (0, h - n),
        "br": (w - n, h - n),
    }
    out = {}
    for name, (ox, oy) in boxes.items():
        out[name] = statistics.pstdev(
            [px[ox + dx, oy + dy] for dx in range(n) for dy in range(n)]
        )
    return out


def mean_colour(im: Image.Image) -> tuple[float, float, float]:
    small = im.convert("RGB").resize((64, 96), Image.BILINEAR)
    px = list(small.getdata())
    return tuple(sum(c[i] for c in px) / len(px) for i in range(3))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("candidate", type=Path)
    ap.add_argument("--anchor", type=Path, help="approved reference card to compare against")
    args = ap.parse_args()

    if not args.candidate.is_file():
        sys.exit(f"missing candidate: {args.candidate}")

    im = Image.open(args.candidate)
    nc = load_normalize()

    hard: list[tuple[bool, str]] = []
    soft: list[tuple[bool, str]] = []

    # ── 1. Geometry. 2:3 exactly, because the box is 2:3 exactly.
    w, h = im.size
    hard.append(
        (
            (w, h) == (TARGET_W, TARGET_H),
            f"size {w}x{h} (want {TARGET_W}x{TARGET_H}, ratio {w/h:.4f} vs {2/3:.4f})",
        )
    )

    # ── 2. Full bleed. THE bug that started this: the old art was 2:3 with the
    # card painted inside a black mat, so cards 0-10 lost 11% of their width to
    # bars that normalize_cards.py then had to pad back. Two independent reads.
    flat = nc.flatten(im)
    trimmed = nc.trim_dark_mat(flat)
    lost_w, lost_h = w - trimmed.size[0], h - trimmed.size[1]
    hard.append(
        (
            lost_w <= 4 and lost_h <= 4,
            f"mat trim removes {lost_w}px wide / {lost_h}px tall (want <=4 each)",
        )
    )
    uni = edge_uniformity(im)
    flatlist = [k for k, v in uni.items() if v < EDGE_UNIFORM_STDDEV]
    hard.append(
        (
            not flatlist,
            "edge strip stddev "
            + " ".join(f"{k}={v:.1f}" for k, v in uni.items())
            + (f"  FLAT: {', '.join(flatlist)}" if flatlist else ""),
        )
    )

    # ── 3. Frame luminance. docs/art-inconsistency.md's primary metric.
    lum, rb = frame_stats(im)
    hard.append(
        (
            FRAME_LUM_MIN <= lum <= FRAME_LUM_MAX,
            f"frame luminance {lum:.1f}% (want {FRAME_LUM_MIN}-{FRAME_LUM_MAX}%), R-B {rb:+.0f}",
        )
    )

    # ── 4. Palette: hard on desaturation, advisory on the red accent. The
    # comment block on RED_HUE_MAX explains at length why that split is not
    # squeamishness -- a global red share cannot tell blood from warm light.
    sat, red = palette(im)
    hard.append(
        (
            SAT_MIN_PCT <= sat <= SAT_MAX_PCT,
            f"mean saturation {sat:.1f}% (want {SAT_MIN_PCT}-{SAT_MAX_PCT}%; "
            "the old deck ran 42-67%)",
        )
    )
    soft.append(
        (
            RED_ADVISORY_MIN <= red <= RED_ADVISORY_MAX,
            f"red-accent share {red:.2f}% (advisory band {RED_ADVISORY_MIN}-{RED_ADVISORY_MAX}%) "
            "-- only meaningful because the saturation gate above passed",
        )
    )

    # ── 5. Corner safety. Advisory: detail here is clipped by border-radius.
    corners = corner_detail(im)
    busy = [k for k, v in corners.items() if v > 42]
    soft.append(
        (
            not busy,
            "corner detail " + " ".join(f"{k}={v:.0f}" for k, v in corners.items())
            + (f"  BUSY (clipped by border-radius): {', '.join(busy)}" if busy else ""),
        )
    )

    # ── 6. Anchor agreement, if we have one.
    if args.anchor:
        if not args.anchor.is_file():
            sys.exit(f"missing anchor: {args.anchor}")
        a = Image.open(args.anchor)
        a_lum, a_rb = frame_stats(a)
        hard.append(
            (
                abs(lum - a_lum) <= ANCHOR_LUM_TOL,
                f"frame luminance vs anchor: {lum:.1f}% vs {a_lum:.1f}% "
                f"(delta {abs(lum-a_lum):.1f}, tol {ANCHOR_LUM_TOL})",
            )
        )
        hard.append(
            (
                abs(rb - a_rb) <= ANCHOR_RB_TOL,
                f"frame R-B vs anchor: {rb:+.0f} vs {a_rb:+.0f} "
                f"(delta {abs(rb-a_rb):.0f}, tol {ANCHOR_RB_TOL})",
            )
        )
        c1, c2 = mean_colour(im), mean_colour(a)
        dist = sum((x - y) ** 2 for x, y in zip(c1, c2)) ** 0.5
        soft.append(
            (
                dist <= ANCHOR_COLOUR_TOL,
                f"mean colour distance from anchor {dist:.1f} (tol {ANCHOR_COLOUR_TOL}) "
                "-- loose by design, the scenes are supposed to differ",
            )
        )

    print(f"\n{args.candidate.name}")
    print("=" * 72)
    for ok, msg in hard:
        print(f"  {'PASS' if ok else 'FAIL'}  {msg}")
    for ok, msg in soft:
        print(f"  {'ok  ' if ok else 'WARN'}  {msg}")

    failed = [m for ok, m in hard if not ok]
    print("=" * 72)
    if failed:
        print(f"{len(failed)} hard check(s) failed.")
    else:
        print("all hard checks passed.")
    print(
        "\nNOW LOOK AT THE IMAGE. No measurement here catches: text baked into the\n"
        "art, a composition that repeats another card's backdrop, a scene that\n"
        "stops reading when rotated 180deg, blood rendered as a wound rather than\n"
        "a stain, or a card that is simply bad."
    )
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
