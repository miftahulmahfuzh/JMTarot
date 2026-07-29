#!/usr/bin/env python3
"""Grade public/wallpapers/ against S-D9's three constraints.

The other half of tools/make_wallpapers.py, and DELIBERATELY INDEPENDENT OF IT.

`tools/check_card_art.py` imports `normalize_cards.py`, and that is right: the two
files need to agree about what "a dark mat" is, so sharing the ALGORITHM removes a
class of drift. It is the wrong pattern for an EXPECTATION. An oracle that reads
its dimensions, its slug list and its thresholds out of the pipeline cannot catch
a wrong dimension, a renamed card or a quality slip -- it can only confirm that
the pipeline agrees with itself. So this file holds its own table, its own
numbers, and imports `normalize_cards.py` for `flatten`/`trim_dark_mat` only.

    python3 tools/check_wallpapers.py

Exit 0 if every check passes, 1 otherwise. There are no advisory checks here: a
wallpaper is a file a stranger downloads once, so every property below is either
true or the download is wrong.

── WHERE THE NUMBERS COME FROM ──────────────────────────────────────────────
docs/plans/2026-07-28-wallpapers.md `## The numbers`, measured across all 22 cards
on 2026-07-28, each with a negative control that a WRONG pipeline would produce:

  card MAD vs source        0.123-0.188   crop-then-rescale scores 10.174  (54x)
  phone inner-region MAD    0.123-0.188   same control
  left-bar stddev           0.000         upscale-to-fill scores 19.88
  left-bar mean RGB         (10, 8, 19)   the token is (10, 8, 18)

THE BAR COLOUR DRIFTS BY EXACTLY ONE LEVEL OF BLUE, ON EVERY CARD. #0a0812 is
(10,8,18) going in and (10,8,19) coming out, because JPEG's DCT quantization moves
it. This check therefore asserts a TOLERANCE and never equality -- an oracle
written with `== (10,8,18)` fails on correct output, and what somebody does at
that point is delete the check.

AND THE FLATNESS CHECK IS check_card_art.py's EDGE_UNIFORM_STDDEV USED IN REVERSE.
There a flat edge strip is a FAILURE: it means the source art is not full bleed.
Here a flat bar is the PROOF that the card was padded rather than scaled to fill,
which is the whole of S-D9's "no upscaling". Same instrument, opposite verdict. Do
not "fix" either file to agree with the other.
"""

import importlib.util
import statistics
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/major_arcanas"
OUT = ROOT / "public/wallpapers"

# ── The expectations. HELD HERE, NOT IMPORTED. See the header.
CARD_W, CARD_H = 1024, 1536
PHONE_W, PHONE_H = 1440, 3120
CANVAS = (10, 8, 18)          # src/theme/tokens.ts color.canvas #0a0812
CANVAS_TOL = 3                # measured drift is exactly +1 on blue
BAR_STDDEV_MAX = 1.5          # correct: 0.000; upscale-to-fill control: 19.88
MAD_MAX = 1.0                 # correct: 0.123-0.188; crop control: 10.174

# A truncated write is a small VALID jpeg, so a floor is a real check. Measured
# range across 44 files: 429-695KB. The ceiling catches a quality slip upward.
MIN_BYTES = 150 * 1024
MAX_BYTES = 1_500 * 1024

# The total is asserted so a future quality bump cannot silently triple the
# repository. Measured 23.77MB; the budget is deliberately close.
TOTAL_BUDGET_BYTES = 30 * 1024 * 1024

# (art slug, url slug) -- roadmap v0.4.0 §3.2, WHICH IS THE CONTRACT. A mismatch
# is a failing check and not a judgement call, because a slug is a permanent
# public address and a rename is a 301 nobody will remember to write.
CARDS = [
    ("00_fool", "the-fool"),
    ("01_magician", "the-magician"),
    ("02_high_priestess", "the-high-priestess"),
    ("03_empress", "the-empress"),
    ("04_emperor", "the-emperor"),
    ("05_hierophant", "the-hierophant"),
    ("06_lovers", "the-lovers"),
    ("07_chariot", "the-chariot"),
    ("08_strength", "strength"),
    ("09_hermit", "the-hermit"),
    ("10_wheel_of_fortune", "wheel-of-fortune"),
    ("11_justice", "justice"),
    ("12_hanged_man", "the-hanged-man"),
    ("13_death", "death"),
    ("14_temperance", "temperance"),
    ("15_devil", "the-devil"),
    ("16_tower", "the-tower"),
    ("17_star", "the-star"),
    ("18_moon", "the-moon"),
    ("19_sun", "the-sun"),
    ("20_judgement", "judgement"),
    ("21_world", "the-world"),
]

OX, OY = (PHONE_W - CARD_W) // 2, (PHONE_H - CARD_H) // 2


def load_normalize():
    """Share the mat-trimmer, never the expectations. See the header."""
    spec = importlib.util.spec_from_file_location("nc", ROOT / "tools/normalize_cards.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def mad(a: Image.Image, b: Image.Image) -> float:
    """Mean absolute per-channel difference on a 64x96 downsample.

    Downsampled on purpose: this asks "is this the same COMPOSITION", not "are
    these the same bytes". JPEG noise moves it by 0.2; a crop moves it by 10.

    `tobytes()` rather than `getdata()` -- the latter is deprecated in Pillow 12
    and removed in 14, and check_card_art.py's `mean_colour` will have to follow.
    """
    A = a.convert("RGB").resize((64, 96), Image.BILINEAR).tobytes()
    B = b.convert("RGB").resize((64, 96), Image.BILINEAR).tobytes()
    return sum(abs(x - y) for x, y in zip(A, B)) / len(A)


def bar_stats(im: Image.Image) -> tuple[float, tuple[float, float, float]]:
    """Stddev and mean colour of the LEFT padding bar.

    Sampled every 37th row, because 3120 rows x 200 columns is 624k pixel reads
    per card for a number that does not move. 37 is coprime with nothing in
    particular; it just is not a factor of the height.
    """
    grey, rgb = im.convert("L").load(), im.convert("RGB").load()
    xs = range(0, OX - 4)
    ys = range(0, PHONE_H, 37)
    sd = statistics.pstdev([grey[x, y] for x in xs for y in ys])
    sample = [rgb[x, y] for x in range(0, OX - 4, 7) for y in ys]
    mean = tuple(sum(p[i] for p in sample) / len(sample) for i in range(3))
    return sd, mean


def main() -> None:
    if not OUT.is_dir():
        sys.exit(f"missing output directory: {OUT}\nrun: npm run wallpapers")
    nc = load_normalize()

    expected = {f"{u}-{v}.jpg" for _, u in CARDS for v in ("card", "phone")}
    present = {p.name for p in OUT.iterdir() if p.is_file()}

    fails: list[str] = []

    # ── 1. Completeness, and NO EXTRAS. An extra file is a stale slug left over
    # from a renamed card, which is the exact drift the /cards/* immutable
    # warning is about -- a live URL nothing in the UI links to any more.
    for name in sorted(expected - present):
        fails.append(f"missing: {name}")
    for name in sorted(present - expected):
        fails.append(f"unexpected file (stale slug?): {name}")

    total = 0
    print(f"{'file':34s} {'size':>10s} {'KB':>7s} {'MAD':>6s} {'bar sd':>7s} {'bar rgb':>16s}")

    for art, url in CARDS:
        source = Image.open(SRC / f"{art}.png")

        # ── 2. THE SOURCE IS UNTOUCHED AND FULL BLEED. Asserted here as well as
        # in the pipeline, because this is the assumption every other check rests
        # on: if the source were not exactly 1024x1536 the pipeline would have had
        # to resample, and "no upscaling" would be untestable.
        if source.size != (CARD_W, CARD_H):
            fails.append(f"{art}.png is {source.size}, want {(CARD_W, CARD_H)}")
            continue
        trimmed = nc.trim_dark_mat(nc.flatten(source))
        lost = (CARD_W - trimmed.size[0], CARD_H - trimmed.size[1])
        if lost[0] > 4 or lost[1] > 4:
            fails.append(f"{art}.png has a {lost} mat -- the pipeline would have to resample")

        for variant, want in (("card", (CARD_W, CARD_H)), ("phone", (PHONE_W, PHONE_H))):
            path = OUT / f"{url}-{variant}.jpg"
            if not path.is_file():
                continue
            n = path.stat().st_size
            total += n
            im = Image.open(path)

            # ── 3. Format, mode and geometry, exactly.
            if im.format != "JPEG":
                fails.append(f"{path.name}: format {im.format}, want JPEG")
            if im.mode != "RGB":
                fails.append(f"{path.name}: mode {im.mode}, want RGB (no alpha)")
            if im.size != want:
                fails.append(f"{path.name}: {im.size}, want {want}")
            if not (MIN_BYTES <= n <= MAX_BYTES):
                fails.append(
                    f"{path.name}: {n} bytes, want {MIN_BYTES}-{MAX_BYTES} "
                    "(a truncated write is a small VALID jpeg)"
                )

            # ── 4. NOT CROPPED. Same composition as the source, within JPEG noise.
            region = im.crop((OX, OY, OX + CARD_W, OY + CARD_H)) if variant == "phone" else im
            d = mad(source, region)
            if d > MAD_MAX:
                fails.append(
                    f"{path.name}: MAD {d:.3f} vs source > {MAD_MAX} -- cropped or "
                    "reframed (a crop-then-rescale control measures 10.17)"
                )

            # ── 5. NOT UPSCALED. A padded card leaves flat bars at the token
            # colour. A card scaled to fill has no bars at all: the control
            # measures 19.88 against 0.000 here.
            sd, mean = (bar_stats(im) if variant == "phone" else (0.0, CANVAS))
            if variant == "phone":
                if sd > BAR_STDDEV_MAX:
                    fails.append(
                        f"{path.name}: left-bar stddev {sd:.2f} > {BAR_STDDEV_MAX} -- the "
                        "card was scaled to fill rather than padded"
                    )
                if any(abs(mean[i] - CANVAS[i]) > CANVAS_TOL for i in range(3)):
                    fails.append(
                        f"{path.name}: bar mean {tuple(round(c, 1) for c in mean)} is not "
                        f"{CANVAS} +/-{CANVAS_TOL} -- wrong backdrop colour"
                    )

            print(
                f"{path.name:34s} {'x'.join(map(str, im.size)):>10s} {n/1024:>7.0f} "
                f"{d:>6.3f} {sd:>7.3f} {str(tuple(round(c) for c in mean)):>16s}"
            )

    # ── 6. The total. Asserted so a quality bump cannot silently triple the repo.
    print(f"\n{len(present)} files, {total/1e6:.2f}MB "
          f"(budget {TOTAL_BUDGET_BYTES/1e6:.0f}MB, mean {total/max(1,len(present))/1024:.0f}KB)")
    if total > TOTAL_BUDGET_BYTES:
        fails.append(f"total {total/1e6:.2f}MB exceeds the {TOTAL_BUDGET_BYTES/1e6:.0f}MB budget")

    print("=" * 72)
    if fails:
        for f in fails:
            print(f"  FAIL  {f}")
        print(f"{len(fails)} check(s) failed.")
        sys.exit(1)
    print("all checks passed.")
    print(
        "\nNOW LOOK AT tools/_wallpapersheet.jpg. No measurement here catches: a card\n"
        "that is beautiful at 88x132 and muddy at 1024x1536, a composition whose\n"
        "centre of interest sits where an iOS clock lands, or JPEG blocking in a dark\n"
        "gradient -- which only a REAL PHONE (loop 6) can answer."
    )


if __name__ == "__main__":
    main()
