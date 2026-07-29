#!/usr/bin/env bash
# Loop 4 for S5's download control: does it fit a phone, in both locales?
#
# NOT A SCREENSHOT. CLAUDE.md `## How to verify things here`: neither Chrome in this
# image gives a real phone width -- both floor at ~500px, so a 320px window lays out
# at 500 and merely crops. The control's only input is its container's inline size,
# so a constrained container plus `getBoundingClientRect` is EXACT where a shot is
# theatre. `tools/seo/galleryfit.sh` is the sibling that measures the grid.
#
# The measurement is in `wallpaperfit.js` -- a file, not a heredoc, because the same
# JavaScript inside a double-quoted bash argument hung this harness with no output.
#
# THE CONTROL LIVES IN THE ZOOM SHEET, WHICH IS CLIENT STATE, so this opens the
# sheet with a programmatic `.click()` before measuring. That is legitimate here and
# is NOT legitimate for a focus question: S3 measured that a programmatic click does
# not focus its target, which is how loop 5 reproduced Safari's focus behaviour.
# Geometry does not care who opened the sheet.
#
# Usage:  tools/e2e/run.sh launch                       # once
#         E2E_BASE=http://localhost:3001 tools/seo/wallpaperfit.sh
#
# NO DEV SESSION: `/gallery` is public, so there is no cookie to plant.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$HERE/e2e/run.sh"
JS="$HERE/seo/wallpaperfit.js"

# The Moon is card 18 and its aria-label is locale-specific, so the sheet is opened
# by INDEX rather than by text: the eighteenth zoom button in document order. The
# grid is rendered in Fool's Journey order and `alt.test.ts` fences that, so this is
# stable in both locales without a second string to keep in sync.
OPEN='(() => { const b = document.querySelectorAll("main ul[class*=grid] li button")[18]; if (!b) return "no zoom button"; b.click(); return "opened " + (b.getAttribute("aria-label") || ""); })()'

for LOCALE in id en; do
  PATHNAME="/gallery"
  [ "$LOCALE" = en ] && PATHNAME="/en/gallery"
  echo "===== $LOCALE  ($PATHNAME) ====="
  "$RUN" goto "$PATHNAME" > /dev/null
  "$RUN" eval "$OPEN"

  for WIDTH in 320 360 375 390; do
    "$RUN" eval "$(sed "s/__WIDTH__/$WIDTH/" "$JS")"
  done
done

cat <<'NOTE'

WHAT THE NUMBERS MEAN:
  sheetW is DERIVED -- min(340, w - 40), because `CardDetail`'s scrim carries 20px
  of side padding and the sheet is `width: 100%; max-width: 340px`. So 280 / 320 /
  335 / 340 at the four widths, and the control is measured inside that.

  overflow MUST be false and offenders MUST be empty at every width in both
  locales. That is the claim; everything else is context.

  sameRow MUST be false: one column, always. Two 1440x3120 labels do not fit side
  by side at 280px, which is why `WallpaperDownload.module.css` says
  `grid-template-columns: 1fr` and this asserts it by geometry rather than by
  reading the stylesheet back.

  labelLines MAY be 2 -- the anchor is a flex row and a wrapped `.dims` is legible.
  The Indonesian is the longer half here as it is everywhere else in this app.
NOTE
