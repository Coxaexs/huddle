#!/usr/bin/env bash
#
# Restart huddle.service when its local port stops answering.
#
# systemd's Restart=always only fires when the main process exits. The failure
# seen in practice is different: wrangler dev stays alive (unit shows "active")
# but its proxy stops binding 127.0.0.1:8730, so the site is down while systemd
# thinks all is well. This probe closes that gap by checking the port itself.
#
# Runs as a oneshot from huddle-healthcheck.timer (every ~60s). A single probe
# can blip during a deploy, so it retries once before acting.

set -uo pipefail

URL="http://127.0.0.1:8730/hangout/"
UNIT="huddle.service"

probe() {
  # -f: non-2xx/3xx is a failure. --max-time bounds a hung socket.
  curl -fsS -o /dev/null --max-time 10 "$URL"
}

if probe; then
  exit 0
fi

sleep 5
if probe; then
  exit 0
fi

logger -t huddle-healthcheck "port 8730 not answering; restarting ${UNIT}"
systemctl restart "$UNIT"
