#!/usr/bin/env bash
# Loop 4, for the ONE page in this release whose whole structure is a claim about
# geometry: is `/gallery` eleven rows of two, complete, at every phone width?
#
# NOT A SCREENSHOT, AND THAT IS NOT A PREFERENCE. CLAUDE.md `## How to verify
# things here`: neither Chrome available in this image gives a real phone width --
# both floor at ~500px, so `--window-size=390` lays out at 500 and merely CROPS. A
# shot that looks like a phone is not one, and that mistake has been made in this
# project twice. `tools/seo/fit.sh` is the generic overflow check; this one also
# reads the numbers S3's plan predicted, because "no overflow" and "eleven rows of
# two" are different claims and only the second is what 2x11 means.
#
# EXACT rather than approximate: the grid's only input is its container's inline
# size -- two `minmax(0, 1fr)` tracks, a 12px column gap, a 2:3 card -- so
# constraining `.shell` to a known width gives the answer a phone would.
#
# THE MEASUREMENT ITSELF IS IN `galleryfit.js`, AND ITS HEADER SAYS WHY IT IS A FILE:
# the same JavaScript inside a double-quoted bash argument HUNG this harness with no
# error and no output, while every fragment of it worked when sent alone.
#
# Usage:  tools/e2e/run.sh launch            # once
#         E2E_BASE=http://localhost:3001 tools/seo/galleryfit.sh
#         E2E_BASE=https://www.jmtarot.site tools/seo/galleryfit.sh
#
# NO DEV SESSION, unlike every iframe harness under `public/cards/`: `/gallery` is
# public, so there is no cookie to plant.
#
# THE NEGATIVE CONTROL, RUN AND RECORDED: put `min-width: 260px` on `.tile` in
# `GalleryGrid.module.css` and `overflow` goes true at all four widths, with
# `offenders` naming `ul.grid 410>288` at 320. A harness whose red state has never
# been seen is a harness nobody can trust.
#
# **PUT IT AFTER THAT RULE'S OWN `min-width: 0`, OR THE CONTROL DOES NOTHING.** The
# first attempt added the line at the top of the block, the later `min-width: 0`
# won, and the harness stayed green -- which reads exactly like a harness that
# cannot see the failure. `getComputedStyle(li).minWidth` is how that was caught,
# and it is worth checking before believing a green control.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$HERE/e2e/run.sh"

JS="$HERE/seo/galleryfit.js"

for LOCALE in id en; do
  PATHNAME="/gallery"
  [ "$LOCALE" = en ] && PATHNAME="/en/gallery"
  echo "===== $LOCALE  ($PATHNAME) ====="
  "$RUN" goto "$PATHNAME" > /dev/null

  for WIDTH in 320 360 375 390; do
    "$RUN" eval "$(sed "s/__WIDTH__/$WIDTH/" "$JS")"
  done
done

cat <<'NOTE'

WHAT THE NUMBERS MUST BE (S3's plan, D-S3-2):
  w    col     cardH    gridH
  320  138.0   207.0    3009
  360  158.0   237.0    3339
  375  165.5   248.25   3463     <- iPhone SE, the binding width
  390  173.0   259.5    3587
  tiles 22, rows 11, perRow [2], ratio 1.5, loreH >= 44, overflow false,
  offenders [], hrefs 22, alts 22, disclaimers 1, nameLines within [1, 2].

  nameLines MAY include 2 -- `The High Priestess` is 18 characters and already
  wraps in the 90px draw-screen slot; 3 would mean the plate is eating the artwork.
  disclaimers is 1 because `PublicShell`'s footer owns it and the page renders none.
NOTE
