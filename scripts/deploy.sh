#!/usr/bin/env bash
#
# Deploy the working tree to the running Hoffle without taking it down.
#
#   scripts/deploy.sh               build, then swap the new build in
#   scripts/deploy.sh --build-only  build in the staging copy and stop (a safe
#                                   "does it build?"; `npm run build` refuses
#                                   to run in the live checkout)
#   scripts/deploy.sh --rollback    put the previous build back
#
# Building in place (npm run build inside this checkout) rewrote dist/ while
# `wrangler dev` was serving it. Wrangler reloaded halfway through and died
# with 'No such module "__vite_rsc_assets_manifest.js"' until systemd restarted
# it. So this builds in a separate copy, then swaps the finished build in with
# the service stopped and starts it again: a few seconds of restart, the same
# every time. Letting wrangler's file watcher reload instead was not reliable:
# rsync --delay-updates stages files in .~tmp~ folders inside dist/, the
# watcher stats one just as it is renamed away and wrangler exits (every
# deploy on 2026-10-14). Stopping the unit takes the polkit rule in
# deploy/huddle-service/50-huddle-deploy.rules; without it this swaps the
# files in and kills the running server, and Restart=always starts it again.
#
# With huddle.socket installed, systemd holds port 8730 and requests wait
# through the restart instead of failing. A stopped service would then be
# started again by the first request, perhaps halfway through the copy, so the
# new build is made next to the live one (dist-next/), swapped in with one
# atomic rename, and picked up by a single restart.
#
# huddle.service runs workerd directly now, on dist/workerd/config.bin. Each
# build gets its own config (scripts/workerd-config.sh), made in the staging
# copy before the swap, so it lands and rolls back together with the build.
#
# While this runs, ROOT/.deploying exists, and the healthcheck leaves the
# service alone.
#
# The build that was live is kept in dist-prev/ for --rollback, and
# dist/DEPLOYED.txt says what each build was made from: the commit, and any
# uncommitted files that went into it.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="${HUDDLE_BUILD_DIR:-$HOME/.cache/huddle-build}"
HEALTH_URL="${HUDDLE_HEALTH_URL:-http://127.0.0.1:8730/hangout/}"
UNIT="${HUDDLE_UNIT:-huddle.service}"

# One deploy at a time. A second one's copy step deletes the staging copy's
# node_modules link while the first is still building, and that build then
# fails with "Can't resolve 'tailwindcss'" (2026-10-16).
mkdir -p "$(dirname "$STAGE")"
exec 9>"$STAGE.lock"
if ! flock -n 9; then
  echo "Another deploy is running; waiting for it to finish ..."
  flock 9
fi

touch "$ROOT/.deploying"
trap 'rm -f "$ROOT/.deploying"' EXIT

# Each step says how long it took, so a slow deploy shows where.
lap_at=$SECONDS
lap() { echo "  ($((SECONDS - lap_at))s: $1)"; lap_at=$SECONDS; }

healthy() {
  # Up to two minutes: the reload takes a few seconds, a cold start longer.
  for _ in $(seq 1 60); do
    curl -fs -o /dev/null --max-time 5 "$HEALTH_URL" && return 0
    sleep 2
  done
  return 1
}

land() {
  # A build from before huddle.service ran workerd directly has no config.
  if [[ ! -s "$1/workerd/config.bin" ]]; then
    "$ROOT/scripts/workerd-config.sh" "$1"
  fi
  if systemctl is-active --quiet huddle.socket 2>/dev/null; then
    rsync -a --delete "$1/" "$ROOT/dist-next/"
    if [[ -d "$ROOT/dist" ]]; then
      mv -T --exchange "$ROOT/dist-next" "$ROOT/dist"
    else
      mv -T "$ROOT/dist-next" "$ROOT/dist"
    fi
    systemctl --no-ask-password restart "$UNIT" || { echo "$UNIT did not restart; see: journalctl -u $UNIT" >&2; exit 1; }
    rm -rf "$ROOT/dist-next"
  elif systemctl --no-ask-password stop "$UNIT" 2>/dev/null; then
    rsync -a --delete "$1/" "$ROOT/dist/"
    systemctl --no-ask-password start "$UNIT" || { echo "$UNIT did not start again; see: journalctl -u $UNIT" >&2; exit 1; }
  else
    echo "(Cannot stop $UNIT without a password; swapping the files in and killing the running server for systemd to restart.)"
    rsync -a --delete --delay-updates "$1/" "$ROOT/dist/"
    pid="$(systemctl show -p MainPID --value "$UNIT" 2>/dev/null || echo 0)"
    if [[ "$pid" =~ ^[0-9]+$ ]] && (( pid > 0 )); then kill -INT "$pid" 2>/dev/null || true; fi
  fi
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
  --exclude=/node_modules --exclude=/state/ --exclude='/state.*/' --exclude=/backups/ --exclude=/.wrangler/ \
  --exclude=/.vinext/ --exclude=/mobile/ --exclude=/desktop/ --exclude=/desktop-tauri/ \
  --exclude=/native-qt/ --exclude='*/node_modules/' --exclude=/.deploying \
  "$ROOT/" "$STAGE/"
ln -sfn "$ROOT/node_modules" "$STAGE/node_modules"
lap "copy"

echo "Building ..."
(cd "$STAGE" && npm run build)
lap "build"
[[ -f "$STAGE/dist/server/wrangler.json" ]] || { echo "The build produced no dist/server/wrangler.json; nothing deployed." >&2; exit 1; }
if [[ "${1:-}" == "--build-only" ]]; then
  echo "Build OK in $STAGE; nothing deployed."
  exit 0
fi
{
  echo "built $(date -Is) from $(git -C "$ROOT" describe --always --dirty 2>/dev/null || echo "an unknown commit")"
  changes="$(git -C "$ROOT" status --porcelain 2>/dev/null | head -100)"
  if [[ -n "$changes" ]]; then
    echo "uncommitted changes in the build:"
    echo "$changes"
  fi
} > "$STAGE/dist/DEPLOYED.txt"
# The generated config records where it was built; point it at this checkout,
# exactly as an in-place build would have.
sed -i "s#$STAGE/#$ROOT/#g" "$STAGE/dist/server/wrangler.json"
echo "Writing the workerd config ..."
"$ROOT/scripts/workerd-config.sh" "$STAGE/dist"
lap "workerd config"

if [[ -d "$ROOT/dist" ]]; then
  rsync -a --delete "$ROOT/dist/" "$ROOT/dist-prev/"
fi

# Record what the machine is doing from before the restart until a few minutes
# after it (~/.cache/huddle-stall/), so a slow stall can be explained.
if [[ -x "$ROOT/scripts/stall-probe.sh" ]]; then
  nohup "$ROOT/scripts/stall-probe.sh" 360 >/dev/null 2>&1 </dev/null &
fi

echo "Swapping the new build in ..."
land "$STAGE/dist"
lap "swap"
sleep 3
if healthy; then
  lap "health check"
  echo "Deployed. (scripts/deploy.sh --rollback puts the previous build back.)"
  # The standby copy (database snapshot plus code, pushed to Oracle and the
  # ThinkPad) is what made a deploy take minutes. The site is already live and
  # hoffle-backup.timer repeats this every five minutes anyway, so start it
  # and carry on instead of waiting; its output goes to the log below. It waits
  # five minutes first and runs at the lowest priority: right after a restart
  # everyone's client reconnects at once, and a copy of the database competing
  # with that is exactly when the site is slowest.
  if [[ -x "$HOME/.local/bin/hoffle-backup.sh" ]]; then
    mkdir -p "$HOME/.cache"
    nohup bash -c 'sleep 300; exec nice -n 19 ionice -c3 "$HOME/.local/bin/hoffle-backup.sh"' >"$HOME/.cache/hoffle-deploy-sync.log" 2>&1 </dev/null &
    echo "Syncing the standby in five minutes, at low priority (log: ~/.cache/hoffle-deploy-sync.log)."
  fi
else
  echo "Hoffle is not answering at $HEALTH_URL after the deploy." >&2
  echo "Roll back with: scripts/deploy.sh --rollback" >&2
  exit 1
fi
