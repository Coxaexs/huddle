#!/usr/bin/env bash
#
# Deploy the working tree to the running Hoffle without taking it down.
#
#   scripts/deploy.sh             build, then swap the new build in
#   scripts/deploy.sh --rollback  put the previous build back
#
# Building in place (npm run build inside this checkout) rewrote dist/ while
# `wrangler dev` was serving it. Wrangler reloaded halfway through and died
# with 'No such module "__vite_rsc_assets_manifest.js"' until systemd restarted
# it. So this builds in a separate copy, then lands the finished files with
# rsync --delay-updates: every file is staged first and renamed into place at
# the end, and wrangler's watcher reloads once, onto a complete build.
#
# The build that was live is kept in dist-prev/ for --rollback.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="${HUDDLE_BUILD_DIR:-$HOME/.cache/huddle-build}"
HEALTH_URL="${HUDDLE_HEALTH_URL:-http://127.0.0.1:8730/hangout/}"

healthy() {
  # Up to two minutes: the reload takes a few seconds, a cold start longer.
  for _ in $(seq 1 60); do
    curl -fs -o /dev/null --max-time 5 "$HEALTH_URL" && return 0
    sleep 2
  done
  return 1
}

land() {
  rsync -a --delete --delay-updates "$1/" "$ROOT/dist/"
}

if [[ "${1:-}" == "--rollback" ]]; then
  [[ -d "$ROOT/dist-prev" ]] || { echo "No dist-prev/ to roll back to." >&2; exit 1; }
  land "$ROOT/dist-prev"
  if healthy; then echo "Rolled back to the previous build."; else echo "Rolled back, but Hoffle is not answering at $HEALTH_URL." >&2; exit 1; fi
  exit 0
fi

echo "Copying the working tree to $STAGE ..."
mkdir -p "$STAGE"
rsync -a --delete \
  --exclude=/.git/ --exclude=/node_modules/ --exclude=/dist/ --exclude='/dist-*/' \
  --exclude=/state/ --exclude='/state.*/' --exclude=/backups/ --exclude=/.wrangler/ \
  --exclude=/.vinext/ --exclude=/mobile/ --exclude=/desktop/ --exclude=/desktop-tauri/ \
  --exclude=/native-qt/ --exclude='*/node_modules/' \
  "$ROOT/" "$STAGE/"
ln -sfn "$ROOT/node_modules" "$STAGE/node_modules"

echo "Building ..."
(cd "$STAGE" && npm run build)
[[ -f "$STAGE/dist/server/wrangler.json" ]] || { echo "The build produced no dist/server/wrangler.json; nothing deployed." >&2; exit 1; }
# The generated config records where it was built; point it at this checkout,
# exactly as an in-place build would have.
sed -i "s#$STAGE/#$ROOT/#g" "$STAGE/dist/server/wrangler.json"

if [[ -d "$ROOT/dist" ]]; then
  rsync -a --delete "$ROOT/dist/" "$ROOT/dist-prev/"
fi

echo "Swapping the new build in ..."
land "$STAGE/dist"
sleep 3
if healthy; then
  echo "Deployed. (scripts/deploy.sh --rollback puts the previous build back.)"
else
  echo "Hoffle is not answering at $HEALTH_URL after the deploy." >&2
  echo "Roll back with: scripts/deploy.sh --rollback" >&2
  exit 1
fi
