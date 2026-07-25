#!/usr/bin/env bash
# Screenshot a dev-server page using the Windows Chrome install.
#
# There is no Linux browser in this WSL image -- Chromium will not launch
# without sudo-installed libraries -- but WSL2 forwards localhost to Windows,
# so Windows Chrome can reach `npm run dev` and write a PNG we can read back
# through /mnt/c. This is the only visual verification loop available here.
#
#   tools/shot.sh <url-path> <width> <height> <out.png>
#
# Example: tools/shot.sh /spike 390 1400 /tmp/spike.png
#
# KNOWN LIMIT -- read before trusting a narrow screenshot. Windows clamps a
# Chrome window to roughly 500px minimum, so --window-size below that is
# silently ignored: ask for 375 and the page still lays out at ~500, while the
# PNG is cropped to 375. It looks like a phone screenshot and is not one.
# Measured: requesting 375, 390 and 430 all reported the same viewport.
#
# So this script is for LOOKING at a page, not for measuring phone layout.
# Two things were tried and did not work: the Linux Chrome in
# ~/.cache/puppeteer cannot start (missing libasound.so.2, needs sudo), and
# CDP over --remote-debugging-address=0.0.0.0 is blocked by the Windows
# firewall, so real device emulation is not reachable from WSL.
#
# To check phone geometry, put the component in a fixed-width container and
# read getBoundingClientRect -- for anything whose only input is its container
# width, that is exact rather than an approximation. See src/app/spike/Probe.tsx.
# Anything that depends on the real viewport -- 100dvh, safe-area insets, touch
# -- has to be checked on an actual iPhone against a Vercel preview URL.

set -euo pipefail

CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
PORT="${PORT:-3001}"
URL_PATH="${1:?usage: shot.sh <path> <w> <h> <out.png>}"
W="${2:-390}"
H="${3:-844}"
OUT="${4:?missing output path}"

WIN_TMP='C:\Users\GPD\AppData\Local\Temp'
LIN_TMP='/mnt/c/Users/GPD/AppData/Local/Temp'
NAME="jmtarot-shot-$$.png"

# --virtual-time-budget lets transitions finish before the capture. Without it
# the shot lands mid-animation: cards halfway to their slots, partially
# rotated, and it reads as a layout bug rather than a timing artefact. The card
# flight and flip are both 620ms, so 3s is comfortable.
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 \
  --virtual-time-budget="${BUDGET:-3000}" \
  --window-size="${W},${H}" \
  --screenshot="${WIN_TMP}\\${NAME}" \
  "http://localhost:${PORT}${URL_PATH}" >/dev/null 2>&1

cp "${LIN_TMP}/${NAME}" "$OUT"
rm -f "${LIN_TMP}/${NAME}"
echo "$OUT ($(stat -c%s "$OUT") bytes, ${W}x${H} @2x)"
