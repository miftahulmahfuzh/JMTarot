#!/usr/bin/env bash
# Thin wrapper around tools/media/capture.mjs -- the same shape as
# tools/e2e/run.sh and for the same three reasons: Node 24 (the global
# WebSocket), the unpacked Chrome libs, and RES_OPTIONS=no-aaaa so no outbound
# call in the driven page pays this WSL image's 4-12s AAAA stall.
#
# MEDIA_BASE points at the DEV SERVER by default. This harness plants a
# dev-session cookie, which only exists on localhost; pointing it at production
# would simply fail, and it must never be "fixed" by teaching it a real
# credential -- that is tools/e2e/run.sh's job, and it does not hold one either.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/tools/node-v24.18.0-linux-x64/bin:$PATH"
export LD_LIBRARY_PATH="$HOME/tools/chrome-libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
export RES_OPTIONS=no-aaaa
: "${MEDIA_BASE:=http://localhost:3001}"
export MEDIA_BASE
exec node "$HERE/capture.mjs" "$@"
