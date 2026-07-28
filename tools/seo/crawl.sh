#!/usr/bin/env bash
# THE ACCEPTANCE TEST FOR v0.4.0 (roadmap §11.2).
#
# Every path below must be 200, must carry NO Set-Cookie, must not mention /login,
# and must not carry an x-robots-tag. **A 302 anywhere in this list is the release
# failing at its only purpose.**
#
# WITH NO COOKIE JAR, WHICH IS THE ENTIRE POINT. `curl` sends none unless told to,
# and this script never writes one -- a crawler carries no cookie, and every bug
# this release exists to fix was invisible to a signed-in browser.
#
# `%{num_redirects}` and `%{url_effective}` are printed, so a 302 to /login shows
# up as a 200 at the WRONG URL rather than as a red status code.
#
#   tools/seo/crawl.sh                                # production
#   tools/seo/crawl.sh http://localhost:3001          # a local `next start -p 3001`
#   tools/seo/crawl.sh https://<preview>.vercel.app   # a Vercel preview
#
# **`npm start` LISTENS ON 3000 AND 3000 IS PERMANENTLY HELD** by another project's
# Grafana container, so a local run is `npx next start -p 3001`. `npm run dev`
# already passes the port; `npm start` does not.
#
# **THIS SCRIPT IS EXPECTED TO FAIL UNTIL THE WHOLE RELEASE LANDS**, and that is
# what it is for (S1 flag 9). S1's landing page links to /gallery, /arcana/... and
# /blog, which S3, S4 and S6 own. A homepage linking to three 404s is worse than the
# redirect it replaced, and no unit test can see it because the pages are MEANT to
# be missing at that point in the sequence. **Merging S1 to main is fine; deploying
# a build where this reports 404 on those three paths is not.**
#
# RES_OPTIONS=no-aaaa for the reason every npm script here sets it: AAAA lookups
# hang 4-12s in this WSL image and every cold outbound connection pays it.
set -uo pipefail
export RES_OPTIONS=no-aaaa

BASE="${1:-https://www.jmtarot.site}"
FAIL=0

# The public surface. `/en` twins included -- they are S2's, and a 404 here before
# S2 lands is expected and is not a pass.
PATHS=(
  /
  /en
  /gallery
  /en/gallery
  /arcana/the-moon
  /en/arcana/the-moon
  /blog
  /en/blog
  /terms
  /privacy
  /sitemap.xml
  /robots.txt
)

printf '%-26s %-4s %-4s %s\n' PATH CODE HOPS NOTES
for p in "${PATHS[@]}"; do
  # -D dumps the FIRST response's headers even when -L follows, which is what
  # makes "no Set-Cookie" checkable on the response the crawler actually got.
  headers="$(curl -sS -o /tmp/jmt-crawl-body -D /tmp/jmt-crawl-head -L \
    -w '%{http_code} %{num_redirects} %{url_effective}' "$BASE$p" 2>/dev/null)"
  code="${headers%% *}"
  rest="${headers#* }"
  hops="${rest%% *}"
  final="${rest#* }"

  notes=""
  [ "$code" = "200" ] || { notes+="NOT 200; "; FAIL=1; }
  [ "$hops" = "0" ] || { notes+="REDIRECTED to $final; "; FAIL=1; }
  case "$final" in *"/login"*) notes+="LANDED ON LOGIN; "; FAIL=1;; esac
  if grep -qi '^set-cookie:' /tmp/jmt-crawl-head; then
    # S-D10. A stranger who never agreed to anything must leave with nothing in
    # their jar, and a Set-Cookie makes the response uncacheable at the edge.
    notes+="SET-COOKIE ($(grep -i '^set-cookie:' /tmp/jmt-crawl-head | \
      sed 's/=.*//' | tr -d '\r' | paste -sd,)); "
    FAIL=1
  fi
  if grep -qi '^x-robots-tag:.*noindex' /tmp/jmt-crawl-head; then
    # S-D12: `/s/`'s noindex must not spread. One broadly-matching headers() entry
    # would do it and `headers.test.ts` is the only other thing that would notice.
    notes+="NOINDEX; "
    FAIL=1
  fi
  printf '%-26s %-4s %-4s %s\n' "$p" "$code" "$hops" "${notes:-ok}"
done

echo
echo "-- /s/ must STILL be noindex (S-D12) --"
# A negative control on the whole script: if this prints nothing, the crawl above
# proves less than it looks like it does.
curl -sS -o /dev/null -D - "$BASE/s/abcdefghjkmn" 2>/dev/null \
  | grep -iE '^(HTTP/|x-robots-tag|referrer-policy)' | tr -d '\r' \
  || { echo "COULD NOT READ /s/ HEADERS"; FAIL=1; }

echo
echo "-- the sitemap parses as XML and names the right host --"
curl -sS "$BASE/sitemap.xml" 2>/dev/null | python3 -c '
import sys, xml.dom.minidom as m
d = m.parseString(sys.stdin.read())
urls = [n.firstChild.data for n in d.getElementsByTagName("loc")]
print(len(urls), "urls;", urls[0] if urls else "NONE")
' || { echo "SITEMAP DID NOT PARSE"; FAIL=1; }

echo
echo "-- robots.txt names the sitemap --"
curl -sS "$BASE/robots.txt" 2>/dev/null | grep -i '^sitemap:' \
  || { echo "NO SITEMAP DIRECTIVE"; FAIL=1; }

echo
if [ "$FAIL" = "0" ]; then echo "crawl: clean."; else echo "crawl: FAILED."; fi
exit "$FAIL"
