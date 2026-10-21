#!/usr/bin/env bash
#
# Copy the newest desktop release from GitHub onto this server, so
# hoffle.online/download/... serves it (lib/downloads.ts). Does nothing when
# the newest release is already here. deploy/downloads has an hourly timer.
#
#   scripts/sync-downloads.sh [--force]
#
# Needs ADMIN_AGENT_TOKEN in .dev.vars; talks to the local worker on 8730.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${HUDDLE_PORT:-8730}"
token="$(sed -n 's/^ADMIN_AGENT_TOKEN=//p' "$ROOT/.dev.vars" | tr -d '"' | head -n1)"
[[ -n "$token" ]] || { echo "No ADMIN_AGENT_TOKEN in $ROOT/.dev.vars" >&2; exit 1; }
force=false
[[ "${1:-}" == "--force" ]] && force=true

# A whole release is ~500 MB; give it time.
curl -fsS --max-time 1800 -X POST "http://127.0.0.1:$PORT/hangout/api/admin/downloads" \
  -H "Authorization: Bearer $token" -H "Content-Type: application/json" \
  --data "{\"action\":\"sync\",\"force\":$force}"
echo
