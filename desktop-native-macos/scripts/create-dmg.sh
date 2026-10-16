#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$DIR/build"
APP_DIR="$BUILD_DIR/Hoffle.app"
DMG_PATH="$BUILD_DIR/Hoffle-macOS-arm64.dmg"

if [ ! -d "$APP_DIR" ]; then
    echo "• App bundle not found. Building first..."
    "$DIR/scripts/build.sh"
fi

echo "=== Creating Hoffle macOS Apple Silicon (.dmg) Installer ==="

DMG_TMP="$BUILD_DIR/dmg_staging"
rm -rf "$DMG_TMP" "$DMG_PATH"
mkdir -p "$DMG_TMP"

# Copy app bundle
cp -R "$APP_DIR" "$DMG_TMP/"

# Create symlink to /Applications
ln -s /Applications "$DMG_TMP/Applications"

# Pick iso/dmg creation tool
if command -v hdiutil >/dev/null 2>&1; then
    echo "• Using macOS native hdiutil to create DMG..."
    hdiutil create -volname "Hoffle" -srcfolder "$DMG_TMP" -ov -format UDZO "$DMG_PATH"
elif command -v genisoimage >/dev/null 2>&1; then
    echo "• Using genisoimage with Apple HFS extensions..."
    genisoimage -V "Hoffle" -D -R -apple -no-pad -o "$DMG_PATH" "$DMG_TMP"
elif command -v mkisofs >/dev/null 2>&1; then
    echo "• Using mkisofs with Apple HFS extensions..."
    mkisofs -V "Hoffle" -D -R -apple -no-pad -o "$DMG_PATH" "$DMG_TMP"
else
    echo "Error: Neither hdiutil, genisoimage, nor mkisofs found."
    exit 1
fi

rm -rf "$DMG_TMP"

echo "=========================================================="
echo "  Installer ready: $DMG_PATH"
echo "  Size: $(du -h "$DMG_PATH" | cut -f1)"
echo "=========================================================="
