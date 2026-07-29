#!/usr/bin/env bash
# Loop 4 over `/account`'s answer list, in both locales, at four phone widths.
#
# THE QUESTION: does a row whose label is a full sentence fit 320px with a 44px tap
# target, and do the two state marks occupy one column?
#
# NOT A SCREENSHOT, AND THAT IS NOT A PREFERENCE. CLAUDE.md `## How to verify things
# here`: neither Chrome in this image gives a real phone width -- both floor at ~500px,
# so `--window-size=320` lays out at 500 and merely CROPS. A shot that looks like a
# phone is not one, and that mistake has been made in this project twice.
#
# **UNLIKE `blogfit.sh` THIS ONE NEEDS A SESSION**, because `/account` is gated and
# `isPublic()` must never learn that path. `POST /api/auth/dev-session` mints a genuine
# Auth.js JWE against a genuine `users` row through the same upsert the Google callback
# uses, and it 404s unless `DEV_PASSWORD_LOGIN=1 && NODE_ENV !== 'production'`. So this
# harness is LOCAL ONLY -- there is deliberately no production mode.
#
# Usage:  npm run db:up && npm run db:seed && npm run dev
#         tools/e2e/run.sh launch --base http://localhost:3001
#         E2E_BASE=http://localhost:3001 tools/seo/answersfit.sh
#
# THE NEGATIVE CONTROL, RUN AND RECORDED: put `min-width: 420px` on `.question` in
# `src/components/AccountAnswers.module.css` and `overflow` goes true at 320/360/390.
# Drop `min-height: 44px` from `.rowButton` and `smallTargets` names every row.
# **CHECK `getComputedStyle` BEFORE BELIEVING A GREEN CONTROL** -- galleryfit's first
# control was defeated by a later `min-width: 0` in the same block and stayed green,
# which reads exactly like a harness that cannot see the failure.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$HERE/e2e/run.sh"
JS="$HERE/seo/answersfit.js"

: "${E2E_BASE:=http://localhost:3001}"
export E2E_BASE

case "$E2E_BASE" in
  *localhost*|*127.0.0.1*) ;;
  *)
    echo "answersfit is LOCAL ONLY: it plants a dev session, and /api/auth/dev-session" >&2
    echo "404s off a dev server. E2E_BASE was '$E2E_BASE'." >&2
    exit 2
    ;;
esac

# The session, planted the way `public/cards/_gate.html` plants it. `credentials:
# same-origin` so Set-Cookie is kept, and the response is asserted rather than assumed
# -- without it every measurement below reports "answers section not found" and reads
# like a CSS problem.
echo "===== planting a dev session ====="
"$RUN" goto /login > /dev/null
# ONE LINE, DELIBERATELY. A multi-line `eval` argument hangs the harness -- measured,
# and it looks exactly like a dev server that will not answer.
"$RUN" eval "(async () => { const r = await fetch('/api/auth/dev-session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'miftah' }), credentials: 'same-origin' }); return { status: r.status, body: (await r.text()).slice(0, 120) }; })()"

for LOCALE in id en; do
  PATHNAME="/account"
  # `?lang=` overrides the whole D6 chain but ONLY when NODE_ENV !== 'production',
  # which is exactly this harness's situation. There is no `/en/account` and there
  # must not be: locale is not a URL segment for the nine app routes (D6).
  [ "$LOCALE" = en ] && PATHNAME="/account?lang=en"

  echo "===== $LOCALE  ($PATHNAME) ====="
  "$RUN" goto "$PATHNAME" > /dev/null

  for WIDTH in 320 360 375 390; do
    "$RUN" eval "$(sed "s/__WIDTH__/$WIDTH/" "$JS")"
  done
done

cat <<'NOTE'

WHAT THE NUMBERS MUST BE:
  overflow false and offenders [] at EVERY width in BOTH locales. The pass condition
  and the only hard one.

  smallTargets [] -- a row under 44px is the iOS minimum missed, and this release
  already ships one of those in `PublicShare` on twenty-three pages.

  markWidths must be a SINGLE value. Two values means the answered and unanswered
  marks are different sizes, so the six question titles wrap at two different widths
  and the list reads as ragged -- which is invisible by eye when five of six rows are
  answered, and is what `.markEmpty` having a border and a fixed box exists to prevent.

  maxTitleLines is 2-3 at 320px in `id` and is NOT a defect: `Hal paling berat yang
  pernah kamu saksikan` is a full sentence, and V8's row needed `flex-wrap` for exactly
  this. English is shorter, the same way `_slotfit.html` found English fits better here.
NOTE
