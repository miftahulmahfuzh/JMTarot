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
#
# THE TWO PARAGRAPHS THAT USED TO END HERE ARE BOTH OBSOLETE AS OF 2026-07-28.
# They read: "the Linux Chrome in ~/.cache/puppeteer cannot start (missing
# libasound.so.2, needs sudo), and CDP over --remote-debugging-address=0.0.0.0
# is blocked by the Windows firewall, so real device emulation is not reachable
# from WSL."
#
# Both diagnoses were right and both conclusions were wrong.
#
#   - libasound.so.2 was the ONLY missing library, and a .deb unpacks into a
#     home directory with no sudo at all. `tools/e2e/setup.sh` does it.
#   - the firewall problem was reaching WINDOWS Chrome across the WSL NAT. A
#     LINUX Chrome is a local process and its CDP port is on 127.0.0.1, with
#     nothing in between.
#
# So `tools/e2e/run.sh` honours 390px exactly and drives real Input-domain
# events -- see CLAUDE.md `## How to verify things here` loop 6, and the
# /test-prod-using-headless-chrome skill. PREFER IT for anything narrow, or
# anything needing a session.
#
# THIS SCRIPT IS DELIBERATELY KEPT. It needs nothing but a Windows Chrome
# install, so it is the fallback if ~/.cache/puppeteer is ever cleared, and the
# ~500px clamp above is still a true fact about Windows.
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
