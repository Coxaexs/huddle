# Hoffle Native Linux Client (`x86_64`)

A lightweight, **native C++17 / GTK3 / WebKit2GTK** desktop application for Hoffle on Linux.

Built directly against system libraries (`gtk+-3.0`, `webkit2gtk-4.1`, `ayatana-appindicator3`, `keybinder-3.0`, `libnotify`), it uses a fraction of the memory and disk space of Electron.

---

## Key Features

- **Native GTK3 + WebKit2GTK**: Uses the system WebKit engine with hardware-accelerated WebRTC and media playback.
- **System Tray Indicator**: Integrates with Linux desktop bars via `ayatana-appindicator3` (GNOME, KDE, XFCE, Waybar, i3/Sway).
- **Global Hotkeys (`keybinder-3.0`)**: System-wide Mute and Push-to-Talk keybindings.
- **Desktop Notifications (`libnotify`)**: Native freedesktop notifications for DMs, mentions, and voice calls.
- **Rich Presence (`ActivityScanner.cpp`)**: Scans `/proc` directly in C++ to detect running games and developer tools.
- **Self-Updating**: Checks `native-latest.txt` from GitHub Releases, verifies SHA-256 checksums, and updates via `desktop/native/native-update.sh`.

---

## Directory Structure

```
desktop-native-linux/
├── src/
│   ├── main.cpp             # GTK3 window, WebKit2GTK view, AppIndicator tray, keybinder
│   ├── ActivityScanner.cpp  # /proc process scanner for Rich Presence
│   ├── ConfigManager.cpp    # XDG config persistence (~/.config/hoffle)
│   └── web-bridge.js        # Injected JS <-> native GTK bridge
├── resources/               # Desktop entry (hoffle.desktop) and tray/window icons
└── scripts/
    └── build.sh             # g++ build and packaging script
```

---

## Prerequisites (Ubuntu / Debian)

```bash
sudo apt update
sudo apt install build-essential pkg-config \
  libgtk-3-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev libkeybinder-3.0-dev libnotify-dev
```

## Building

```bash
./desktop-native-linux/scripts/build.sh
```

Output is written to `desktop-native-linux/build/hoffle-linux-x86_64/` along with an `install.sh` script.
