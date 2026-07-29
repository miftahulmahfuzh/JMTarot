#!/usr/bin/env bash
# Loop 4 for the two admin pages: is this dashboard readable at a phone width?
#
# NOT A SCREENSHOT, AND THAT IS NOT A PREFERENCE. CLAUDE.md `## How to verify things here`:
# neither Chrome available in this image gives a real phone viewport -- both floor at ~500px,
# so `--width 390` lays out at 500 and merely CROPS. A shot that looks like a phone is not
# one, and this project has made that mistake twice.
#
# **AND THE FLOOR IS A FLOOR, NOT A CLAMP -- MEASURED BY A4 ON 2026-07-30.** `run.sh launch
# --width 1440` reports `innerWidth === outerWidth === 1440`. CLAUDE.md says *"both are 500
# whatever --width says"*, which is true BELOW 500 and false above it; the 500 reading
# reproduces only against an ALREADY-RUNNING Chrome, where `launch` prints "already running"
# and silently ignores the flag. So loop 5 can answer a DESKTOP width question -- see
# `_adminshot.html` -- and still cannot answer a phone one, which is why this harness exists.
#
# EXACT rather than approximate: every number `chartfit.js` reads has the container's inline
# size as its only input -- an `auto-fit minmax()` column count, a container query's plot
# height, a CSS bar height, a rendered font size (which is a constant precisely because §3
# keeps text out of the SVG). Constraining `main` to a known width gives the answer a phone
# would.
#
# THE MEASUREMENT ITSELF IS IN `chartfit.js`, AND ITS HEADER SAYS WHY IT IS A FILE: the same
# JavaScript inside a double-quoted bash argument HUNG `galleryfit.sh` with no error and no
# output, while every fragment of it worked when sent alone.
#
# PRECONDITIONS -- all three, or the numbers are of the wrong page:
#   1. `npm run dev` on 3001, and `npm run db:up` before it.
#   2. `DEV_PASSWORD_LOGIN=1` in .env.local (the harness mints a real Auth.js session).
#   3. **`ADMIN_EMAILS` in .env.local contains `miftah@localhost`.**
#
#      **NOT `miftah@dev.local`, WHICH IS WHAT TASK 20 AND §10 BOTH SAY.** Two different
#      addresses exist for "the dev user" and the plan named the wrong one:
#      `scripts/db-seed.ts` creates `miftah@dev.local`, while
#      `POST /api/auth/dev-session` upserts and signs `<username>@localhost`. The
#      allowlist is compared against the SESSION's email, so `@localhost` is the one that
#      matters. Measured: with `@dev.local` alone, every /admin URL answers 404 -- the
#      A-D2 refusal working correctly, on a session that is not an admin.
#      `_adminfit.html` probes for that and says so, rather than letting every
#      measurement come back empty and read as a broken harness.
#      **PRODUCTION ONLY in the real world (R37): never on Preview, which shares
#      DATABASE_URL with production.**
#
# Usage:
#   tools/e2e/run.sh launch --base http://localhost:3001     # once
#   tools/seo/chartfit.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$HERE/e2e/run.sh"
JS="$HERE/seo/chartfit.js"

for PAGE in overview tokens; do
  echo "===== /admin${PAGE/overview/} ====="
  "$RUN" goto "/cards/_adminfit.html?page=$PAGE" > /dev/null
  # The planter waits for the Suspense boundary to resolve before it reports ready; give the
  # queries a beat to land before the first measurement, or the first width measures a
  # skeleton.
  sleep 3

  for WIDTH in 320 360 390 1200; do
    "$RUN" eval "$(sed "s/__WIDTH__/$WIDTH/" "$JS")"
  done
done

cat <<'NOTE'

WHAT THE NUMBERS ARE -- MEASURED 2026-07-30, not predicted:

  w     content  kpiCols  plotH  heatCols  heatCell
  320   280      1        200    7         33.42
  360   320      1        200    7         39.14
  390   350      2        200    7         43.42
  1200  1160     5        240    7         46.00

  heatCols is SEVEN AT EVERY WIDTH. The 24 this table first recorded at 1200 was the
  defect loop 3 found: the grid flipped to 24 columns above 520px -- inherited from
  §5.3's weekday x HOUR design -- while its labels still named the seven weekdays. See
  `Heatmap.module.css`. The cell is capped at 46px rather than stretched, because a
  7-column calendar in an 1100px card gives 150px cells.

  barH      20                      `--chart-bar`, under the 24px cap
  meterH    12                      the meter track
  tickPx    [11]                    ONE value, and it is 11 -- an SVG <text> would SCALE with
                                    its container (§3), so this constant existing at all is
                                    the whole architecture being right
  labelClip 0                       a category name wraps, never clips
  overflow  false                   at every width, on both pages
  offenders []
  panelBg   rgb(19, 15, 34)         **OPAQUE #130f22 (R8).** An `rgba(...)` or a
                                    `transparent` here means the palette's own surface is not
                                    being painted, and every measured contrast number stops
                                    holding -- 2.66:1 for --chart-sev-4 against the radial's
                                    top stop, against a 3:1 floor.

TWO COMMITMENTS THIS RUN CORRECTED, RATHER THAN CONFIRMED:

  kpiCols at 390 is 2, not 1. A 350px content box fits two 169px tiles
  (2 x 150 + 12 gap = 312 <= 350) and that is `minmax(150px, 1fr)` working. The
  "one column at 320" claim holds where it was made; 390 was never measured.

  heatCell at 320 is 33.42, against a stated ">= 36". (280 - 32 padding - 12 gaps) / 7
  = 33.4 is arithmetic, not a defect: a heat cell is one of ~35 READOUTS with a CSS
  hover/focus tooltip, not a control, so the 44px iOS floor does not govern it and
  neither does 36. It is excluded from `under44` for that reason and reported here
  instead. 39px at 360, 43px at 390, 46px capped above.

THREE DEFECTS LOOP 4 FOUND, ALL FIXED:

  1. `repeat(auto-fit, minmax(380px, 1fr))` DOES NOT SHRINK BELOW 380px -- `auto-fit`
     collapses empty tracks, not narrow ones. `div.grid 380>280` at 320, and it also
     made the KPI row report TWO columns, because the row was inside an over-wide
     track. One CSS defect, two wrong numbers, invisible in a screenshot.
     -> `minmax(min(380px, 100%), 1fr)`.
  2. `StackedBar`'s segments were `flex: 0 0 <pct>%`: the percentages sum to 100 and
     the row also carries (n-1) x 2px of gap, so `span.bar 179>175`. The code comment
     claimed basis "lets flex subtract the gaps for us", which is false with
     `flex-shrink: 0`. -> `flex: 0 1 <pct>%`.
  3. The league's row was 44px and its ANCHOR was 16px. **The tap target is the
     anchor, not the row containing it.** -> the link fills its cell.

ONE DEFECT NOT A4's, FLAGGED RATHER THAN FIXED: `a.navLink 42` -- A1's
`src/app/admin/layout.module.css`, whose own comment says "44px of tap target". It is
42. §6 assigns that file to A1 and A4 does not edit it.

THE NEGATIVE CONTROL, RUN AND RECORDED -- AND THE PLAN'S SUGGESTED VALUE DOES NOT WORK:
Task 20 says to put `min-width: 200px` on `.tile` and expect overflow at 320.
**It does not fire**: the KPI row spans the full grid width, so a 200px minimum fits a
280px content box and `overflow` stays false. At `min-width: 400px` it fires, naming
`div.page 417>280 / div.grid 417>280 / div.wide 400>280 / div.row 400>280`.
**CHECK `getComputedStyle(tile).minWidth` FIRST** -- `galleryfit.sh`'s header records a
control that did nothing because a later `min-width: 0` won, which reads exactly like a
harness that cannot see the failure. Here it read `200px`, so the rule WAS winning and
the control was simply too small: a control that does nothing has two possible causes
and they need telling apart.
NOTE
