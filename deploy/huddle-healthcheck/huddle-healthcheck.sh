#!/usr/bin/env bash
#
# Restart huddle.service when its local port stops answering.
#
# systemd's Restart=always only fires when the main process exits. The failure
# seen in practice is different: wrangler dev stays alive (unit shows "active")
# but its proxy stops binding 127.0.0.1:8730, so the site is down while systemd
# thinks all is well. This probe closes that gap by checking the port itself.
#
# Runs as a oneshot from huddle-healthcheck.timer (every ~60s). It only
# restarts after two runs in a row failed (about two minutes): a server that is
# slow under load, not dead, used to be restarted after 15 seconds, and the
# cold start that followed was a longer outage than the slowness (2026-10-14).
# Oracle's watcher waits four minutes, so a restart here finishes first.

set -uo pipefail

URL="http://127.0.0.1:8730/hangout/"
UNIT="huddle.service"
FAILS=/run/huddle-healthcheck.fails

probe() {
  # -f: non-2xx/3xx is a failure. --max-time bounds a hung socket; slow is not dead.
  curl -fsS -o /dev/null --max-time 20 "$URL"
}

# A freshly (re)started unit is still booting: wrangler takes a while to bind
# the port. Probing then read as "down" and restarted it again mid-start.
GRACE_SECONDS=90
started_us=$(systemctl show -p ActiveEnterTimestampMonotonic --value "$UNIT" 2>/dev/null || echo 0)
now_us=$(( $(cut -d" " -f1 /proc/uptime | tr -d .) * 10000 ))
if [[ "$started_us" =~ ^[0-9]+$ ]] && (( started_us > 0 && now_us - started_us < GRACE_SECONDS * 1000000 )); then
  exit 0
fi

# scripts/deploy.sh is swapping a build in (it stops and starts the unit itself).
root=$(systemctl show -p WorkingDirectory --value "$UNIT" 2>/dev/null)
if [[ -n "$root" && -n "$(find "$root/.deploying" -mmin -20 2>/dev/null)" ]]; then
  exit 0
fi

if probe; then
  rm -f "$FAILS"
  exit 0
fi
sleep 10
if probe; then
  rm -f "$FAILS"
  exit 0
fi

count=$(( $(cat "$FAILS" 2>/dev/null || echo 0) + 1 ))
if (( count < 2 )); then
  echo "$count" > "$FAILS"
  logger -t huddle-healthcheck "port 8730 not answering; restarting ${UNIT} if it still is not next minute"
  exit 0
fi
rm -f "$FAILS"
logger -t huddle-healthcheck "port 8730 not answering for two minutes; restarting ${UNIT}"
systemctl restart "$UNIT"
