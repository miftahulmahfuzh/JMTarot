#!/usr/bin/env python3
"""
Assemble a GIF from a directory of PNG frames written by `tools/media/capture.mjs`.

WHY PILLOW AND NOT FFMPEG: neither ffmpeg nor ImageMagick nor gifsicle is
installed in this WSL image, and `## Environment` in CLAUDE.md is emphatic that
nothing here may need sudo. Pillow is already a dependency of the asset
scripts (`tools/make_wallpapers.py`), so this adds nothing to install.

THREE THINGS IT DOES THAT A NAIVE `im.save(append_images=...)` DOES NOT, each
because the naive version was measured and was worse:

  1. **ONE GLOBAL PALETTE, DERIVED FROM THE FRAMES.** Per-frame local palettes
     make the app's dark violet gradient shift hue from frame to frame -- the
     background visibly crawls -- and they cost more bytes, not fewer.
  2. **IDENTICAL FRAMES ARE MERGED INTO ONE LONGER FRAME.** A screen recording
     of a mostly-still UI is mostly duplicates; keeping them is the single
     biggest waste of bytes available. The delay is added to the frame that
     survives, so nothing speeds up.
  3. **THE DELAY COMES FROM THE FILENAME'S WALL-CLOCK OFFSET.** A fixed delay
     would render a 300ms stall and a 60ms card flip as the same length, and the
     flip is the thing worth seeing.

Usage:
  python3 tools/media/gif.py <frames-dir> <out.gif> [--width 320] [--colors 128]
                             [--fps-cap 12] [--trim-start N] [--trim-end N]
                             [--hold-last 900] [--crop x,y,w,h]
"""
from __future__ import annotations

import argparse
import pathlib
import sys

from PIL import Image

# GIF stores delays in hundredths of a second, so anything under 20ms is a lie
# the format cannot tell; browsers additionally treat 0-10ms as "as fast as
# possible", which is not a speed anybody chose.
MIN_DELAY_MS = 30


def frames_in(d: pathlib.Path) -> list[tuple[int, pathlib.Path]]:
    out = []
    # .jpg is what a screencast writes; .png is what a capture loop wrote before
    # the capture loop turned out to eat taps. Both are read so an old frame
    # directory still assembles.
    files = sorted(list(d.glob("*.jpg")) + list(d.glob("*.png")))
    for p in files:
        # NNNN-OOOOOO.ext -- index and wall-clock offset in ms.
        stem = p.stem.split("-")
        if len(stem) != 2:
            raise SystemExit(f"{p.name}: expected NNNN-OOOOOO.jpg")
        out.append((int(stem[1]), p))
    if not out:
        raise SystemExit(f"no frames in {d}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("frames")
    ap.add_argument("out")
    ap.add_argument("--width", type=int, default=320)
    ap.add_argument("--colors", type=int, default=128)
    ap.add_argument("--fps-cap", type=float, default=12.0)
    ap.add_argument("--trim-start", type=int, default=0)
    ap.add_argument("--trim-end", type=int, default=0)
    ap.add_argument("--hold-last", type=int, default=900)
    ap.add_argument(
        "--speed",
        type=float,
        default=1.0,
        help="playback multiplier; 2.0 halves every delay. LIKE --max-delay, A "
        "VALUE OTHER THAN 1 MUST BE DISCLOSED WHERE THE GIF IS SHOWN.",
    )
    ap.add_argument(
        "--max-delay",
        type=int,
        default=0,
        help="cap how long ONE frame is held, in ms (0 = real time). "
        "THIS COMPRESSES REAL WAITING AND MUST BE DISCLOSED IN THE CAPTION.",
    )
    ap.add_argument("--crop", default=None, help="x,y,w,h in SOURCE pixels")
    a = ap.parse_args()

    raw = frames_in(pathlib.Path(a.frames))
    if a.trim_start:
        raw = raw[a.trim_start :]
    if a.trim_end:
        raw = raw[: -a.trim_end]
    if not raw:
        raise SystemExit("every frame was trimmed away")

    # Per-frame delay from consecutive offsets; the last frame gets --hold-last so
    # a loop does not snap away from the payoff the moment it arrives.
    delays = []
    for i, (off, _) in enumerate(raw):
        nxt = raw[i + 1][0] if i + 1 < len(raw) else off + a.hold_last
        delays.append(max(MIN_DELAY_MS, nxt - off))

    # Capping a delay makes the GIF shorter than the thing it recorded. It is
    # here because a group chat genuinely takes ~10s to answer and a README will
    # not hold a reader for that -- but a capture that no longer runs at real
    # speed has to SAY so where it is shown, which is why this prints the real
    # elapsed time next to the played one.
    real_total = sum(delays) / 1000
    if a.max_delay:
        delays = [min(d, a.max_delay) for d in delays]
    if a.speed != 1.0:
        delays = [max(MIN_DELAY_MS, round(d / a.speed)) for d in delays]

    crop = tuple(int(v) for v in a.crop.split(",")) if a.crop else None

    # Mixed source sizes mean the capture surface changed mid-recording, which is
    # the screencast drifting off the device override (see capture.mjs's `rec`).
    # Resizing them all to one width would HIDE that by producing a tidy GIF of
    # two different layouts, so it is refused instead.
    src_sizes = {Image.open(p).size for _, p in raw}
    if len(src_sizes) > 1:
        raise SystemExit(f"frames have mixed sizes {sorted(src_sizes)} -- re-record; do not assemble")

    images = []
    for _, p in raw:
        im = Image.open(p).convert("RGB")
        if crop:
            x, y, w, h = crop
            im = im.crop((x, y, x + w, y + h))
        if im.width != a.width:
            h = round(im.height * a.width / im.width)
            im = im.resize((a.width, h), Image.LANCZOS)
        images.append(im)

    # Merge runs of identical frames, summing their delays. Compared on the
    # RESIZED bytes on purpose: two frames differing only in a sub-pixel the
    # downscale erases are the same frame in the output, and that is where most
    # of the duplicates in a UI recording actually are.
    merged: list[Image.Image] = []
    merged_delays: list[int] = []
    for im, d in zip(images, delays):
        if merged and im.tobytes() == merged[-1].tobytes():
            merged_delays[-1] += d
        else:
            merged.append(im)
            merged_delays.append(d)

    # Honour the fps cap by folding a too-short frame into its predecessor rather
    # than dropping it, so total duration is preserved.
    cap_ms = round(1000 / a.fps_cap)
    capped: list[Image.Image] = []
    capped_delays: list[int] = []
    for im, d in zip(merged, merged_delays):
        if capped and capped_delays[-1] < cap_ms:
            capped_delays[-1] += d
        else:
            capped.append(im)
            capped_delays.append(d)

    # One global palette from an even sample of the whole run -- not from frame 0,
    # which on this app is often a screen the animation is about to leave.
    step = max(1, len(capped) // 12)
    sample = capped[::step]
    strip = Image.new("RGB", (capped[0].width, capped[0].height * len(sample)))
    for i, im in enumerate(sample):
        strip.paste(im, (0, i * capped[0].height))
    pal = strip.quantize(colors=a.colors, method=Image.MEDIANCUT)

    quant = [im.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for im in capped]

    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    quant[0].save(
        out,
        save_all=True,
        append_images=quant[1:],
        duration=capped_delays,
        loop=0,
        optimize=True,
        disposal=1,
    )
    total = sum(capped_delays) / 1000
    pace = ""
    if a.max_delay or a.speed != 1.0:
        how = []
        if a.speed != 1.0:
            how.append(f"{a.speed:g}x")
        if a.max_delay:
            how.append(f"{a.max_delay}ms/frame cap")
        pace = f"  (real {real_total:.1f}s, played {' + '.join(how)} -- DISCLOSE THIS)"
    print(
        f"{out}  {len(quant)} frames (from {len(raw)})  {capped[0].width}x{capped[0].height}  "
        f"{total:.1f}s  {out.stat().st_size / 1_000_000:.2f}MB  {a.colors} colors{pace}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
