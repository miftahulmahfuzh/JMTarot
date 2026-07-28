#!/usr/bin/env bash
# Make a real Chrome launchable inside this WSL image. Idempotent; run it again
# any time `run.sh` complains that the binary will not start.
#
# CLAUDE.md's `## How to verify things here` said this was impossible: "Chromium
# cannot launch in this WSL image -- it needs `libasound2t64`, which needs sudo."
# The diagnosis was right and the conclusion was wrong. `ldd` on the puppeteer
# Chrome names exactly ONE missing library, and a .deb can be unpacked into a
# home directory with no privileges at all. Nothing here needs sudo. Verified by
# running it as an ordinary user with `sudo -n true` failing.
#
# Two steps, either of which may already be done:
#   1. Chrome itself, via puppeteer's downloader (no puppeteer at runtime).
#   2. libasound.so.2, unpacked under ~/tools/chrome-libs.

set -euo pipefail

LIBDIR="$HOME/tools/chrome-libs"
ARCHDIR="$LIBDIR/usr/lib/x86_64-linux-gnu"

echo "== 1/3  chrome binary"
CHROME=$(find "$HOME/.cache/puppeteer/chrome" -name chrome -type f 2>/dev/null | sort -r | head -1 || true)
if [ -z "$CHROME" ]; then
  echo "   downloading Chrome for Testing (one time, ~170MB)"
  npx --yes @puppeteer/browsers install chrome@stable
  CHROME=$(find "$HOME/.cache/puppeteer/chrome" -name chrome -type f | sort -r | head -1)
fi
echo "   $CHROME"

echo "== 2/3  libasound.so.2"
if [ -f "$ARCHDIR/libasound.so.2" ]; then
  echo "   already unpacked at $ARCHDIR"
else
  mkdir -p "$LIBDIR"
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  cd "$TMP"

  # `apt-get download` is preferred, but this image's apt index is stale and
  # points at pool versions that have been superseded (404). apt-get update
  # needs sudo, so fall back to reading the pool directory and taking the
  # newest 1.2.11 build -- ABI-stable, and Chrome only needs the soname.
  if ! apt-get download libasound2t64 2>/dev/null; then
    echo "   apt index stale; fetching from the pool directly"
    POOL=http://archive.ubuntu.com/ubuntu/pool/main/a/alsa-lib
    DEB=$(curl -s "$POOL/" \
      | grep -oP 'libasound2t64_1\.2\.11[^"]*_amd64\.deb' \
      | sort -V | tail -1)
    [ -n "$DEB" ] || { echo "   could not find a libasound2t64 deb in the pool"; exit 1; }
    curl -sfO "$POOL/$DEB"
  fi
  dpkg-deb -x ./*.deb "$LIBDIR"
  echo "   unpacked $(ls ./*.deb)"
fi

echo "== 3/3  verify"
export LD_LIBRARY_PATH="$ARCHDIR:${LD_LIBRARY_PATH:-}"
MISSING=$(ldd "$CHROME" 2>/dev/null | grep -c "not found" || true)
if [ "$MISSING" != "0" ]; then
  echo "   STILL MISSING $MISSING library/libraries:"
  ldd "$CHROME" | grep "not found" | sort -u | sed 's/^/     /'
  echo "   unpack each the same way: apt-get download <pkg> && dpkg-deb -x <deb> $LIBDIR"
  exit 1
fi
echo "   no missing libraries"
echo "   $("$CHROME" --version 2>/dev/null | tail -1)"

# WSLg is what lets `launch --headed` put a window on the Windows desktop, which
# is the only way the human can type a Google password. Headless still works
# without it, so this is a warning and not a failure.
if [ -d /mnt/wslg ] && [ -n "${DISPLAY:-}" ]; then
  echo "   WSLg present (DISPLAY=$DISPLAY) -- headed mode available"
else
  echo "   WARNING: no WSLg/DISPLAY. Headless works; --headed cannot show a window,"
  echo "            so interactive Google sign-in will not be possible."
fi

echo
echo "ready:  tools/e2e/run.sh launch --headed && tools/e2e/run.sh login"
