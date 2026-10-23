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

Release builds also sign Lite's self-update (`src-tauri/src/updater.rs`),
so they need the updater key: `TAURI_SIGNING_PRIVATE_KEY` (the key file's
contents) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, as in CI. To build without
it, leave the update files out:
`npx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'`.

## Updates

Lite checks the latest GitHub Release's `lite-latest.json` at launch and every
4 hours (CI writes it, `scripts/update-manifest.mjs`), downloads a newer build
and verifies it against the public key in `tauri.conf.json`. It installs at
once when that happens within a minute of launch and no call is live, otherwise
when "Restart" is picked in the page's update banner. If the private key is
lost, no Lite update can install again: keep a copy of it.

## Known limitation

The Tauri capability allowlist (`src-tauri/capabilities/`) only grants native
APIs to `https://chat.hoffle.online`. Pointing the app at another Hoffle
address loads the page, but tray, notifications and other native features
stay off until that origin is added to the capability's `remote.urls`.
