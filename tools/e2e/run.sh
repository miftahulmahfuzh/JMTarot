#!/usr/bin/env bash
# Thin wrapper around tools/e2e/chrome.mjs. Everything real is in that file's
# header; this exists so no caller has to remember three environment variables.
#
# Node 24 because `chrome.mjs` uses the global WebSocket, and because the default
# node on PATH here is 20.11.1 -- see CLAUDE.md `## Environment`.
#
# RES_OPTIONS=no-aaaa for the same reason every other npm script in this project
# sets it: AAAA lookups can hang 4-12s in this WSL image, and the Google sign-in
# this harness drives makes three outbound calls that each pay it.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/tools/node-v24.18.0-linux-x64/bin:$PATH"
export LD_LIBRARY_PATH="$HOME/tools/chrome-libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
export RES_OPTIONS=no-aaaa

# Local runs point at the dev server; the default is production. `--base` on
# launch overrides it and is remembered in the profile's state file.
: "${E2E_BASE:=https://www.jmtarot.site}"
export E2E_BASE

exec node "$HERE/chrome.mjs" "$@"
