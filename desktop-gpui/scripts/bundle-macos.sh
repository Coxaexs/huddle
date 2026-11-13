#!/bin/sh
# Builds "Hoffle GPUI.app" next to the release binary, signed ad hoc so macOS remembers the
# microphone permission. Usage: scripts/bundle-macos.sh [--debug]
set -eu
cd "$(dirname "$0")/.."

profile=release
[ "${1:-}" = "--debug" ] && profile=debug
if [ "$profile" = release ]; then cargo build --release; else cargo build; fi

version=$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -1)
app="target/$profile/Hoffle GPUI.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "target/$profile/hoffle-lite" "$app/Contents/MacOS/Hoffle GPUI"
cp resources/icon.icns "$app/Contents/Resources/icon.icns"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Hoffle GPUI</string>
  <key>CFBundleDisplayName</key><string>Hoffle GPUI</string>
  <key>CFBundleIdentifier</key><string>online.hoffle.gpui</string>
  <key>CFBundleExecutable</key><string>Hoffle GPUI</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$version</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSMicrophoneUsageDescription</key><string>Hoffle uses the microphone when you join a voice room.</string>
</dict>
</plist>
PLIST
codesign --force --deep --sign - "$app"
echo "$app"
