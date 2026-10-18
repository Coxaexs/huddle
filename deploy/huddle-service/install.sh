#!/usr/bin/env bash
#
# Install huddle.service (workerd run directly, fast restarts, systemd
# watchdog). Run with sudo:
#
#   sudo deploy/huddle-service/install.sh           install and restart Hoffle
#   sudo deploy/huddle-service/install.sh --revert  put the wrangler dev unit back
#
# Makes dist/workerd/config.bin first if the live build has none. If Hoffle
# does not answer within 30 s of the restart, this puts the previous unit back
# by itself.

set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run me with sudo (I write to /etc/systemd and /usr/local/bin)." >&2; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OWNER="$(stat -c %U "$ROOT")"
UNIT=/etc/systemd/system/huddle.service
DROPINS=/etc/systemd/system/huddle.service.d
BACKUP="$UNIT.wrangler.bak"
HEALTH=http://127.0.0.1:8730/hangout/api/health

healthy() {
  for _ in $(seq 1 60); do
    curl -fs -o /dev/null --max-time 5 "$HEALTH" && return 0
    sleep 0.5
  done
  return 1
}

revert() {
  [[ -f "$BACKUP" ]] || { echo "No $BACKUP to go back to." >&2; exit 1; }
  cp "$BACKUP" "$UNIT"
  for f in "$DROPINS"/*.conf.wrangler-only; do
    if [[ -e "$f" ]]; then mv "$f" "${f%.wrangler-only}"; fi
  done
  systemctl daemon-reload
  systemctl restart huddle.service
  if healthy; then echo "Back on wrangler dev; Hoffle answers."; else echo "Back on wrangler dev, but Hoffle is not answering yet: journalctl -u huddle" >&2; fi
}

if [[ "${1:-}" == "--revert" ]]; then
  revert
  exit 0
fi

if [[ ! -s "$ROOT/dist/workerd/config.bin" ]]; then
  echo "Making $ROOT/dist/workerd/config.bin ..."
  sudo -u "$OWNER" "$ROOT/scripts/workerd-config.sh"
fi

# Keep the wrangler unit once, the first time.
if [[ ! -f "$BACKUP" ]] && grep -q 'wrangler' "$UNIT" 2>/dev/null; then
  cp "$UNIT" "$BACKUP"
fi

install -m 0755 "$HERE/huddle-watchdog.sh" /usr/local/bin/huddle-watchdog.sh
install -m 0644 "$HERE/huddle.service" "$UNIT"
# Drop-ins only for wrangler dev: its environment switches, and a stop timeout
# the unit now sets itself. failback.conf stays.
for f in local-dev-off.conf stop-timeout.conf; do
  if [[ -e "$DROPINS/$f" ]]; then mv "$DROPINS/$f" "$DROPINS/$f.wrangler-only"; fi
done
systemctl daemon-reload

echo "Restarting huddle.service on workerd ..."
start=$(date +%s%N)
systemctl restart huddle.service
if healthy; then
  echo "Hoffle answers $(( ($(date +%s%N) - start) / 1000000 )) ms after the restart began."
  systemctl status huddle.service --no-pager | sed -n '1,12p'
else
  echo "Hoffle did not answer within 30 s on workerd; putting wrangler dev back." >&2
  journalctl -u huddle.service -n 30 --no-pager >&2 || true
  revert
  exit 1
fi
