#!/usr/bin/env bash
#
# Install the Huddle port health check. Run with sudo:
#   sudo deploy/huddle-healthcheck/install.sh                    the probe only
#   sudo deploy/huddle-healthcheck/install.sh --nightly-restart  and a restart at 05:00
#
# It installs a probe that restarts huddle.service if 127.0.0.1:8730 stops
# answering even while systemd still reports the unit as active. The nightly
# restart is no longer needed now that workerd runs with --gc-global (see
# README.md), so it is only installed when asked for.

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run me with sudo (I write to /etc/systemd and /usr/local/bin)." >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"

install -m 0755 "$HERE/huddle-healthcheck.sh" /usr/local/bin/huddle-healthcheck.sh
install -m 0644 "$HERE/huddle-healthcheck.service" /etc/systemd/system/huddle-healthcheck.service
install -m 0644 "$HERE/huddle-healthcheck.timer" /etc/systemd/system/huddle-healthcheck.timer
if [[ "${1:-}" == "--nightly-restart" ]]; then
  install -m 0644 "$HERE/huddle-nightly-restart.service" /etc/systemd/system/huddle-nightly-restart.service
  install -m 0644 "$HERE/huddle-nightly-restart.timer" /etc/systemd/system/huddle-nightly-restart.timer
fi

systemctl daemon-reload
systemctl enable --now huddle-healthcheck.timer
if [[ "${1:-}" == "--nightly-restart" ]]; then
  systemctl enable --now huddle-nightly-restart.timer
fi

echo "Installed. Timer status:"
systemctl status huddle-healthcheck.timer --no-pager | sed -n '1,5p' || true
echo
echo "Probe it once by hand with:  sudo systemctl start huddle-healthcheck.service"
echo "Watch it act with:           journalctl -t huddle-healthcheck -f"
