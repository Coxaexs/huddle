# Huddle desktop

An [Electron](https://electronjs.org) shell around the hosted app at
`https://deeppixel.online/hangout`. It exists so voice, video and **screen
sharing** behave the same on macOS and Windows (identical Chromium) and so you
get a real installable app with a proper screen-share source picker.

It loads the live site, so it always shows whatever is currently deployed — no
rebuild needed when you change the web app. To point it somewhere else (e.g. a
local `wrangler dev`), set `HUDDLE_URL`:

    HUDDLE_URL=http://127.0.0.1:8730/hangout npm start

## Run it locally

    cd desktop
    npm install
    npm start

## Build installers

Each installer must be built on (or for) its own platform. electron-builder
produces **unsigned** apps by default — they run fine, but the OS shows a
first-launch warning (see "Signing" below).

### macOS (.dmg) — build on your Mac

    cd desktop
    npm install
    npm run dist:mac

Output lands in `desktop/dist/`:
`Huddle-1.0.0-arm64.dmg` (Apple Silicon) and `Huddle-1.0.0.dmg` (Intel).

Opening an unsigned app the first time: right-click the app → **Open** →
**Open**, or allow it under **System Settings → Privacy & Security**. Screen
recording will prompt for permission the first time you share your screen.

### Windows (.exe)

You need a Windows machine, **or** CI (recommended — no local Windows needed):

- **GitHub Actions:** the workflow at `.github/workflows/desktop.yml` builds the
  Windows `.exe` (and the Mac `.dmg`) on GitHub's runners. Trigger it from the
  repo's **Actions** tab ("Build desktop apps" → Run workflow), or push a tag:

      git tag desktop-v1.0.0 && git push origin desktop-v1.0.0

  Download the installers from the run's **Artifacts**.

- **On a Windows machine:**

      cd desktop
      npm install
      npm run dist:win

  Output: `desktop/dist/Huddle Setup 1.0.0.exe`. Unsigned installers trigger a
  SmartScreen prompt: **More info → Run anyway**.

### Linux (.AppImage)

    npm run dist:linux    # -> desktop/dist/Huddle-1.0.0.AppImage

## Signing (optional, removes the warnings)

- **Windows:** set the `CSC_LINK` (path/URL to a `.pfx`) and `CSC_KEY_PASSWORD`
  env vars (or repo secrets for CI). Certificates come from a CA (~$100+/yr) or
  Azure Trusted Signing.
- **macOS:** needs an Apple Developer account (~$99/yr). Set `CSC_LINK` +
  `CSC_KEY_PASSWORD` to a "Developer ID Application" cert, and `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for notarization.
  electron-builder signs and notarizes automatically when these are present.

## What's in here

- `src/main.js` — window, permissions, and the screen-share request handler.
- `src/picker.html` / `src/picker-preload.js` — the source picker shown when the
  web app calls `getDisplayMedia()`.
- `build/` — app icons and macOS entitlements.
- `package.json` — the `build:` block is the electron-builder config.
