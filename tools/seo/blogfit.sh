#!/usr/bin/env bash
# Loop 4, for the longest prose this project has ever put on a phone.
#
# THE QUESTION: does a two-thousand-word article fit a 320px screen, in both
# languages, with nothing overflowing and no dead anchor in its own table of contents?
#
# NOT A SCREENSHOT, AND THAT IS NOT A PREFERENCE. CLAUDE.md `## How to verify things
# here`: neither Chrome in this image gives a real phone width -- both floor at ~500px,
# so `--window-size=320` lays out at 500 and merely CROPS. A shot that looks like a
# phone is not one, and that mistake has been made in this project twice.
#
# EXACT rather than approximate: an article body's only input is its container's inline
# size, so constraining `article[class*=page]` to a known width gives the answer a phone
# would. `tools/seo/galleryfit.sh` is the precedent and `blogfit.js`'s header records
# why the measurement is a FILE rather than a heredoc.
#
# Usage:  tools/e2e/run.sh launch            # once
#         E2E_BASE=http://localhost:3001 tools/seo/blogfit.sh
#         E2E_BASE=https://www.jmtarot.site tools/seo/blogfit.sh
#
# NO DEV SESSION, unlike every iframe harness under `public/cards/`: `/blog` is public,
# so there is no cookie to plant.
#
# THE NEGATIVE CONTROL, RUN AND RECORDED: put `min-width: 420px` on `.p` in
# `src/components/Prose.module.css` and `overflow` goes true at 320/360/390 with
# `offenders` naming `p 420>288`. **CHECK `getComputedStyle(p).minWidth` BEFORE
# BELIEVING A GREEN CONTROL** -- galleryfit's first control was defeated by a later
# `min-width: 0` in the same block and stayed green, which reads exactly like a harness
# that cannot see the failure.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$HERE/e2e/run.sh"
JS="$HERE/seo/blogfit.js"

for LOCALE in id en; do
  for SLUG in how-to-read-tarot what-tarot-is; do
    PATHNAME="/blog/$SLUG"
    [ "$LOCALE" = en ] && PATHNAME="/en/blog/$SLUG"
    echo "===== $LOCALE  ($PATHNAME) ====="
    "$RUN" goto "$PATHNAME" > /dev/null

    for WIDTH in 320 360 375 390; do
      "$RUN" eval "$(sed "s/__WIDTH__/$WIDTH/" "$JS")"
    done
  done
done

cat <<'NOTE'

WHAT THE NUMBERS MUST BE:
  overflow false and offenders [] at EVERY width in BOTH locales. That is the pass
  condition and the only hard one.

  tocDead [], proseDead [], smallTargets [] -- an anchor that scrolls nowhere and a
  30px tap target are both invisible by eye.

  chars is ~34 at 320px and that is ARITHMETIC, NOT A DEFECT (reconciliation §7, S6
  F4): 288px of content at ~8.4px per character in Cormorant Garamond at 19px cannot
  reach the 45-75 desktop guideline, and getting there needs ~14px type -- too small
  for two thousand words of serif. The lever used is padding, 20 -> 16, which buys 8px
  back on the width that binds. **A number below ~30, or any overflow, IS a failure**,
  and the lever is padding rather than a new font-size token: §10 forbids one without a
  written reason, and this measurement is the reason not to add it.
NOTE
