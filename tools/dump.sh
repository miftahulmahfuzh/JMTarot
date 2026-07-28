#!/usr/bin/env bash
# Dump a dev-server page's DOM (after scripts have run) using Windows Chrome.
#
# The sibling of `tools/shot.sh`, for the harnesses under `public/cards/` that
# report in TEXT rather than in pixels. A screenshot of forty PASS/FAIL lines is
# a worse artefact than the lines themselves: it cannot be grepped, it cannot be
# diffed, and a line that scrolls off the bottom is silently lost.
#
#   BUDGET=60000 tools/dump.sh '/cards/_swipeshot.html?case=auto'
#
# `--virtual-time-budget` is what makes this usable at all: these harnesses wait
# out real debounces (track.client's 2s) and stubbed stream delays, which would
# otherwise take a minute of wall clock. Virtual time advances as fast as the
# task queue drains. SET IT GENEROUSLY -- the dump happens when the budget is
# exhausted, so a budget shorter than the harness truncates the report at
# whatever line it had reached, which looks exactly like a hang.
#
# Same platform constraints as shot.sh: there is no Linux browser in this WSL
# image, WSL2 forwards localhost to Windows, and /mnt/c is how the file comes
# back.

set -euo pipefail

CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
PORT="${PORT:-3001}"
URL_PATH="${1:?usage: dump.sh <path>}"

"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --virtual-time-budget="${BUDGET:-60000}" \
  --dump-dom \
  "http://localhost:${PORT}${URL_PATH}" 2>/dev/null
