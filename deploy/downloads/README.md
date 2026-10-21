# Desktop downloads from this server

`hoffle.online/download/<platform>` serves the desktop apps from this
server's own storage instead of sending people to GitHub (see
`lib/downloads.ts`). The hourly timer here copies each new GitHub release in.

Install it as a user service on the server:

    cp deploy/downloads/hoffle-downloads.* ~/.config/systemd/user/
    systemctl --user daemon-reload
    systemctl --user enable --now hoffle-downloads.timer

Run it by hand with `scripts/sync-downloads.sh` (add `--force` to copy the
files again). Platforms: windows, windows-lite, mac-arm64, mac-intel,
mac-lite, linux.
