#!/usr/bin/env bash
#
# Install the memory guard as a user service of the account that runs Hoffle's
# jobs (no sudo). Needs lingering so it runs without a login:
#   loginctl show-user "$USER" -p Linger    should say Linger=yes
#
#   deploy/memguard/install.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

install -D -m 0755 "$HERE/hoffle-memguard.py" "$HOME/.local/bin/hoffle-memguard"
install -D -m 0644 "$HERE/hoffle-memguard.service" "$HOME/.config/systemd/user/hoffle-memguard.service"

systemctl --user daemon-reload
systemctl --user enable hoffle-memguard.service
systemctl --user restart hoffle-memguard.service

echo "Installed. Now:"
python3 "$HOME/.local/bin/hoffle-memguard" --status
