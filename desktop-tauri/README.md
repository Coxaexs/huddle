# Huddle Desktop (Tauri v2)

Lightweight, high-performance cross-platform desktop shell for Huddle, built with **Tauri v2** and Rust.

## Features
- **Tiny footprint:** ~15 MB executable, ~40–70 MB RAM (vs 250MB+ in Electron).
- **Native System Tray:** Minimize to tray, restore, and quick-quit controls.
- **Global Hotkey:** `Cmd+Shift+M` / `Ctrl+Shift+M` to toggle microphone mute globally across any active application or game.
- **Native Notifications:** Deep OS notification center integration.

## Development

### Prerequisites
- Node.js 20+
- Rust toolchain (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Linux platform dependencies (if compiling on Linux):
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### Run Locally in Dev Mode
```bash
cd desktop-tauri
npm install
npm run dev
```

### Build Production Binary
```bash
npm run build
```
The output installers (.deb, .AppImage, .dmg, or .msi/.exe) will be generated in `src-tauri/target/release/bundle/`.
