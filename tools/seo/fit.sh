#!/usr/bin/env bash
# Loop 4: does a public page fit a phone?
#
# NOT A SCREENSHOT. CLAUDE.md `## How to verify things here`: neither Chrome
# available in this image gives a real phone width -- both floor at ~500px, so
# `--window-size=390` lays out at 500 and merely CROPS. A shot that looks like a
# phone is not one, and that mistake has been made in this project twice.
#
# What this does instead is exact for container-driven layout: constrain the
# element under test to a fixed inline size, then read `scrollWidth` against
# `clientWidth`. No viewport required.
#
# Usage:  tools/seo/fit.sh /                     # the landing
#         tools/seo/fit.sh /gallery
#         tools/seo/fit.sh /blog 'main'
#         E2E_BASE=https://www.jmtarot.site tools/seo/fit.sh /blog
#
# Prerequisites: `tools/e2e/setup.sh` once, then `tools/e2e/run.sh launch`.
#
# The two things that will actually overflow on S1's pages, so look for them by
# name in `offenders`:
#   .links  in the footer, if `flex-wrap` goes missing.
#   the hero `<img>`, if `max-width: 100%` goes missing -- it is declared at
#   `width={800}`. `Landing.test.ts` asserts that rule in the CSS for the same
#   reason, because this loop needs a browser and that one does not.
set -euo pipefail

PATHNAME="${1:?usage: tools/seo/fit.sh <path> [selector]}"
SELECTOR="${2:-main, .frame, [class*=frame]}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$HERE/e2e/run.sh" goto "$PATHNAME"

for WIDTH in 320 360 390; do
  "$HERE/e2e/run.sh" eval "
    (() => {
      const root = document.querySelector('${SELECTOR}');
      if (!root) return 'NO MATCH for ${SELECTOR}';
      const prev = { w: root.style.width, mw: root.style.maxWidth };
      root.style.width = '${WIDTH}px';
      root.style.maxWidth = '${WIDTH}px';
      // Force layout before measuring.
      void root.offsetWidth;
      const over = [];
      for (const el of root.querySelectorAll('*')) {
        if (el.scrollWidth > el.clientWidth + 1) {
          over.push(el.tagName.toLowerCase()
            + (el.className ? '.' + String(el.className).split(' ')[0] : '')
            + ' ' + el.scrollWidth + '>' + el.clientWidth);
        }
      }
      const rootOver = root.scrollWidth > root.clientWidth + 1;
      root.style.width = prev.w; root.style.maxWidth = prev.mw;
      return JSON.stringify({ width: ${WIDTH}, rootOverflows: rootOver, offenders: over.slice(0, 8) });
    })()
  "
done
