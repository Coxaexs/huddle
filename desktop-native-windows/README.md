# Hoffle Native Windows Client (`x86_64`)

A lightweight, **native C++17 / Win32 / WebView2** desktop application for Hoffle on Windows.

Unlike the Electron build (`desktop/`), this client uses Microsoft Edge WebView2 (pre-installed on Windows 10 and 11) and native Win32 APIs, delivering a sub-megabyte binary with minimal RAM overhead.

---

## Key Features

- **Native Win32 + WebView2**: Uses Windows' built-in Evergreen WebView2 runtime—no bundled 200 MB Chromium binary.
- **Per-App Screen-Share Audio (`hoffle-app-audio.exe`)**: Captures audio from a specific application window via WASAPI process-loopback capture during screen shares.
- **Global Push-to-Talk & Mute Hotkeys**: System-wide low-level keyboard hooks and hotkey bindings that work while gaming in full-screen.
- **System Tray Integration**: Minimizes to the Windows notification area with quick Mute, Deafen, Server Switcher, and Quit actions.
- **Rich Presence (`ActivityScanner.cpp`)**: Detects running games and applications via Win32 process enumeration with zero child-process spawning overhead.
- **Self-Updating**: Checks the latest GitHub Release (`native-latest.txt`), verifies SHA-256 checksums, and swaps the binary on quit via `desktop/native/native-update.ps1`.

---

## Directory Structure

```
desktop-native-windows/
├── src/
│   ├── main.cpp             # Win32 window, tray icon, WebView2 host, global hooks
│   ├── ActivityScanner.cpp  # Win32 process scanner for Rich Presence
│   ├── ConfigManager.cpp    # Server URL and window placement persistence
│   └── web-bridge.js        # Injected JS <-> native Win32 bridge
├── include/                 # Win32 / WebView2 headers
├── resources/               # Windows .rc resource script and application icons
├── vendor/webview2/         # WebView2Loader static/DLL SDK
└── scripts/
    └── build.sh             # Cross-platform Zig C++ build script
```

---

## Building

The build script compiles both `Hoffle.exe` and `hoffle-app-audio.exe` using `zig c++` (so it can be built on Linux, macOS, or Windows):

```bash
./desktop-native-windows/scripts/build.sh
```

Output artifacts are placed in `desktop-native-windows/build/`.
