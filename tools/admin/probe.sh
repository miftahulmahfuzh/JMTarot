#!/usr/bin/env bash
# A1's acceptance probe (roadmap §10.2). THREE IDENTITIES, and curl is two of them.
#
#   1. NO COOKIE    every /admin page must 302 to /login; every /api/admin/** must
#                   401 and never 200 and never 404 (the 404 is the SIGNED-IN
#                   answer, and middleware answers a cookieless caller the way it
#                   answers every gated endpoint).
#   2. A REAL SESSION FOR A NON-ADMIN   every one of them must 404.
#   3. A REAL SESSION FOR THE ADMIN     every one must 200.
#
# **RECONCILIATION R36 IS WHY 1 AND 2 ARE SEPARATE ROWS AND NOT ONE "4xx" CHECK.**
# §10.2 said "404s or 401s", which is true and not testable: a script that treats
# 401 as failure reds on correct behaviour, and that is how an acceptance test gets
# disabled. Signed out is 401 from `decide()`; signed in and not allowlisted is 404
# from `requireAdmin()`.
#
# 2 and 3 need a session cookie, which this script never holds: pass one in, or use
# loop 5. THE HARNESS NEVER HOLDS A CREDENTIAL and no verb here accepts a password.
#
#   tools/admin/probe.sh                              # production, no cookie
#   tools/admin/probe.sh http://localhost:3001
#   JMT_COOKIE="authjs.session-token=…" tools/admin/probe.sh http://localhost:3001
#
# **`ADMIN_EMAILS` IS PRODUCTION ONLY (R37), SO IDENTITY 3 IS A LOCAL RUN.** Preview
# shares DATABASE_URL with production, and setting the variable there would give
# every preview URL a live admin surface over real querent data. What runs against a
# real deployment is identities 1 and 2 -- which need no admin identity, and are the
# half that actually needs the real Vercel edge.
#
# **THE `/api/admin` COMPARISON IS THE POINT OF THIS SCRIPT** and it is a
# measurement rather than an assertion: plan §1.2 and R35 do NOT claim byte-identity
# between `adminNotFound()` and Next's own 404 for an unmatched `/api/` path -- a
# route handler cannot render Next's not-found page. The script prints both so the
# residual difference is a fact somebody looked at, and the recorded measurement is
# in `docs/workstream-notes.md` under A1.
#
# **A1 SHIPS NO `/api/admin/**` ROUTE, SO THAT COMPARISON IS NOT YET MEASURABLE AND
# THE SCRIPT SAYS SO INSTEAD OF PRETENDING.** Every row in that section is currently
# Next's own unmatched-route 404 -- three instances of the same thing. **A5 lands the
# first real admin route and owes the measurement**, because `adminNotFound()`'s
# empty body is only comparable once something returns it. Until then the claim on
# record is what `identity.contract.test.ts` asserts: 404, no body, no
# distinguishing header.
#
# RES_OPTIONS=no-aaaa for the reason every script here sets it: AAAA lookups hang
# 4-12s in this WSL image and every cold outbound connection pays it.
set -uo pipefail
export RES_OPTIONS=no-aaaa

BASE="${1:-https://www.jmtarot.site}"
COOKIE="${JMT_COOKIE:-}"
FAIL=0

HEAD=/tmp/jmt-admin-head
BODY=/tmp/jmt-admin-body

# Pages, then API routes, then the two negative controls. `/en/admin` is here
# because contract G2 says only the CONTENT clause strips a locale prefix, so this
# reaches `decide()` spelled as requested and matches no route (plan §1.3).
PAGES=(/admin /admin/users /admin/tokens /admin/blog /en/admin)
APIS=(/api/admin/users /api/admin/users/abc/answer/worst_thing)
# The controls. The first is an unmatched path INSIDE the admin API tree; the second
# is an unmatched path outside it. A1's claim is about the SHAPE of the refusal, and
# these are what it is compared against.
CONTROLS=(/api/admin/definitely-not-a-route /api/definitely-not-a-route)

probe() { # $1 path, $2 "cookie"|"nocookie"
  local p="$1" mode="$2" args=()
  [ "$mode" = "cookie" ] && [ -n "$COOKIE" ] && args+=(-H "Cookie: $COOKIE")
  # -D dumps the FIRST response's headers even when -L follows, which is what makes
  # "did it land on /login" checkable on the response the caller actually got.
  curl -sS -o "$BODY" -D "$HEAD" -L "${args[@]+"${args[@]}"}" \
    -w '%{http_code} %{num_redirects} %{url_effective}' "$BASE$p" 2>/dev/null
}

echo "== base: $BASE"
echo
echo "-- IDENTITY 1: no cookie. pages must 302 to /login, APIs must 401 --"
printf '%-42s %-5s %-5s %s\n' PATH CODE HOPS NOTES
for p in "${PAGES[@]}"; do
  read -r code hops final <<<"$(probe "$p" nocookie)"
  notes=""
  case "$final" in
    *"/login"*) ;;
    *) notes+="DID NOT LAND ON LOGIN ($final); "; FAIL=1;;
  esac
  # 200 AT /login is the correct outcome here, because -L followed the redirect.
  [ "$hops" -ge 1 ] || { notes+="NO REDIRECT; "; FAIL=1; }
  printf '%-42s %-5s %-5s %s\n' "$p" "$code" "$hops" "${notes:-ok (redirected to login)}"
done
for p in "${APIS[@]}"; do
  read -r code hops final <<<"$(probe "$p" nocookie)"
  notes=""
  [ "$code" = "401" ] || { notes+="EXPECTED 401 (R36), got $code; "; FAIL=1; }
  printf '%-42s %-5s %-5s %s\n' "$p" "$code" "$hops" "${notes:-ok}"
done

echo
if [ -z "$COOKIE" ]; then
  cat <<'NOTE'
-- IDENTITIES 2 AND 3: skipped, no JMT_COOKIE --
   curl cannot hold a Google session and this script will not learn how.
   Locally, mint one against a real `users` row through the same upsert the Google
   callback uses (DEV_PASSWORD_LOGIN=1, NODE_ENV != production):

     curl -si -X POST http://localhost:3001/api/auth/dev-session \
       -d '{"name":"miftah"}' -H 'content-type: application/json' | grep -i set-cookie

   Then re-run with JMT_COOKIE="authjs.session-token=<value>".

   Against a deployment, loop 5 is the instrument -- it is the only one that holds a
   real signed-in session, because a human typed the password into a headed window
   and the harness never saw it:

     E2E_BASE=http://localhost:3001 tools/e2e/run.sh whoami
     E2E_BASE=http://localhost:3001 tools/e2e/run.sh goto /admin
     E2E_BASE=http://localhost:3001 tools/e2e/run.sh status /api/admin/users

   ADMIN_EMAILS is PRODUCTION ONLY (R37), so the admin flow runs against localhost
   and the refusal cases run against production.
NOTE
else
  echo "-- IDENTITY 2 or 3: with the cookie you passed --"
  printf '%-42s %-5s %-5s %s\n' PATH CODE HOPS NOTES
  for p in "${PAGES[@]}" "${APIS[@]}"; do
    read -r code hops final <<<"$(probe "$p" cookie)"
    notes=""
    case "$code" in
      200) notes="ADMIN (200)";;
      404) notes="NON-ADMIN (404) -- correct for an ordinary session";;
      *) notes="UNEXPECTED $code at $final"; FAIL=1;;
    esac
    printf '%-42s %-5s %-5s %s\n' "$p" "$code" "$hops" "$notes"
  done
  echo
  echo "   A non-admin must be 404 on EVERY row above, including /admin itself."
  echo "   A 302 to /login here means the cookie is not being sent or has expired."
  echo
  echo "   **A 404 IS AMBIGUOUS FOR AN ADMIN AND THAT IS THE FEATURE.** A-D2 makes"
  echo "   \"not allowlisted\" and \"no such route\" the same answer, so while A4, A5 and"
  echo "   A6 are unlanded an ADMIN sees 200 on /admin and 404 on the other rows --"
  echo "   from Next's router, not from requireAdmin(). ONE 200 is what proves the"
  echo "   identity; the 404s prove nothing either way until those pages exist."
fi

echo
echo "-- THE REFUSAL SHAPE, MEASURED RATHER THAN ASSERTED (R35) --"
# Byte-identity is not claimed. What is claimed: the same status, an empty body, no
# distinguishing header. A JSON `{ error }` body would be a body no unmatched route
# in this app produces, and the body is the tell.
#
# **THIS SECTION NEEDS A COOKIE AND SAYS SO RATHER THAN RUNNING ANYWAY.** Measured
# 2026-07-30: with no cookie, EVERY row here -- including
# `/api/definitely-not-a-route` -- is `401 {"error":"Unauthorized"}`, 24 bytes, from
# `decide()` in middleware. That is correct (R36) and it is not
# `adminNotFound()`'s output at all, so comparing shapes there measures middleware
# against itself and reports a false failure. The first version of this script did
# exactly that.
if [ -z "$COOKIE" ]; then
  echo "   skipped: needs a session. Signed out, middleware answers every path here"
  echo "   with 401 {\"error\":\"Unauthorized\"} before any admin code runs (R36)."
  echo
  if [ "$FAIL" = "0" ]; then echo "probe: clean (identity 1 only)."; else echo "probe: FAILED."; fi
  exit "$FAIL"
fi
for p in "${CONTROLS[@]}" "${APIS[0]}"; do
  args=()
  [ -n "$COOKIE" ] && args+=(-H "Cookie: $COOKIE")
  code="$(curl -sS -o "$BODY" -D "$HEAD" "${args[@]+"${args[@]}"}" \
    -w '%{http_code}' "$BASE$p" 2>/dev/null)"
  bytes="$(wc -c <"$BODY" | tr -d ' ')"
  ctype="$(grep -i '^content-type:' "$HEAD" | tr -d '\r' | head -1)"
  printf '%-42s %-5s %6s bytes  %s\n' "$p" "$code" "$bytes" "${ctype:-(no content-type)}"
  if grep -qi '"error"' "$BODY"; then
    echo "    ^ A JSON error body. THIS IS THE TELL and A-D2 forbids it."
    FAIL=1
  fi
done

echo
if [ "$FAIL" = "0" ]; then echo "probe: clean."; else echo "probe: FAILED."; fi
exit "$FAIL"
