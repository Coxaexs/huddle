#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$DIR/.." && pwd)"
BUILD_DIR="$DIR/build"
OBJ_DIR="$BUILD_DIR/obj"
APP_DIR="$BUILD_DIR/Hoffle.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

echo "=== Building Hoffle Native macOS App (Apple Silicon arm64) ==="

# 1. Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$OBJ_DIR" "$MACOS_DIR" "$RESOURCES_DIR"

# 2. Check environment & toolchain
OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
    echo "• Detected native macOS host: using Apple clang"
    CC="clang"
    TARGET_FLAGS="-arch arm64 -mmacosx-version-min=11.0"
    SDK_FLAGS=""
else
    echo "• Detected Linux host: cross-compiling for Apple Silicon (arm64-apple-darwin)"
    ZIG="$ROOT_DIR/.tools/zig/zig"
    SDK="$ROOT_DIR/.tools/sdk/MacOSX13.3.sdk"
    
    if [ ! -f "$ZIG" ] || [ ! -d "$SDK" ]; then
        echo "Error: Zig or macOS SDK not found at $ZIG / $SDK"
        exit 1
    fi
    
    CC="$ZIG cc"
    TARGET_FLAGS="-target aarch64-macos"
    SDK_FLAGS="-isysroot $SDK -I$SDK/usr/include -F$SDK/System/Library/Frameworks -L$SDK/usr/lib"
fi

# Ensure icons are generated
if [ ! -f "$DIR/Resources/AppIcon.icns" ]; then
    echo "• Generating application icons..."
    python3 "$DIR/scripts/generate-icons.py"
fi

CFLAGS="-O2 -fobjc-arc $TARGET_FLAGS $SDK_FLAGS -I$DIR/src -Wno-deprecated-declarations -Wno-nullability-completeness -Wno-macro-redefined -Wno-unknown-warning-option -Wno-availability"

SOURCES=(
    "main.m"
    "ConfigManager.m"
    "GlobalHotkeyManager.m"
    "ActivityScanner.m"
    "PushToTalkManager.m"
    "PreferencesWindowController.m"
    "WebViewController.m"
    "MainWindowController.m"
    "AppDelegate.m"
)

OBJECTS=()

# 3. Compile source files to object files
echo "• Compiling Objective-C source files..."
for src in "${SOURCES[@]}"; do
    obj="$OBJ_DIR/${src%.m}.o"
    echo "  [CC] src/$src -> obj/${src%.m}.o"
    $CC $CFLAGS -c "$DIR/src/$src" -o "$obj"
    OBJECTS+=("$obj")
done

# 4. Link binary
echo "• Linking native executable (Mach-O 64-bit arm64)..."
FRAMEWORKS="-framework Cocoa -framework WebKit -framework UserNotifications -framework Carbon -framework Security -framework QuartzCore"
$CC $TARGET_FLAGS $SDK_FLAGS "${OBJECTS[@]}" -o "$MACOS_DIR/Hoffle" $FRAMEWORKS

chmod +x "$MACOS_DIR/Hoffle"

# 5. Package bundle metadata and resources
echo "• Packaging Hoffle.app bundle..."
# The desktop apps share one version, which the self-update compares against.
VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$ROOT_DIR/desktop/package.json" | head -n 1)"
sed "/<key>CFBundleShortVersionString<\/key>/{n;s#<string>[^<]*</string>#<string>$VERSION</string>#;}" \
    "$DIR/Resources/Info.plist" > "$CONTENTS_DIR/Info.plist"
echo -n "APPL????" > "$CONTENTS_DIR/PkgInfo"

if [ -f "$DIR/Resources/AppIcon.icns" ]; then
    cp "$DIR/Resources/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"
fi

if [ -f "$DIR/Resources/StatusIcon.png" ]; then
    cp "$DIR/Resources/StatusIcon.png" "$RESOURCES_DIR/StatusIcon.png"
fi

if [ -f "$DIR/Resources/StatusIcon@2x.png" ]; then
    cp "$DIR/Resources/StatusIcon@2x.png" "$RESOURCES_DIR/StatusIcon@2x.png"
fi

if [ -f "$DIR/src/web-bridge.js" ]; then
    cp "$DIR/src/web-bridge.js" "$RESOURCES_DIR/web-bridge.js"
fi

# The self-update script (desktop/native/, shared with the Linux app).
cp "$ROOT_DIR/desktop/native/native-update.sh" "$RESOURCES_DIR/native-update.sh"

# 6. Verify binary
echo "• Verifying binary architecture:"
file "$MACOS_DIR/Hoffle"

# 7. Create distribution ZIP archive
echo "• Creating Hoffle-macOS-arm64.zip archive..."
(cd "$BUILD_DIR" && tar -czf "Hoffle-macOS-arm64.tar.gz" "Hoffle.app")
(cd "$BUILD_DIR" && zip -r -q "Hoffle-macOS-arm64.zip" "Hoffle.app" 2>/dev/null || true)

# 8. Create DMG installer if mkisofs/genisoimage available
if command -v genisoimage >/dev/null 2>&1 || command -v mkisofs >/dev/null 2>&1; then
    echo "• Creating hoffle_native.dmg installer..."
    DMG_TMP="$BUILD_DIR/dmg_tmp"
    rm -rf "$DMG_TMP"
    mkdir -p "$DMG_TMP"
    cp -R "$APP_DIR" "$DMG_TMP/"
    ln -s /Applications "$DMG_TMP/Applications"
    
    ISO_TOOL="genisoimage"
    command -v mkisofs >/dev/null 2>&1 && ISO_TOOL="mkisofs"
    
    $ISO_TOOL -V "Hoffle Native" -D -R -apple -no-pad -o "$BUILD_DIR/hoffle_native.dmg" "$DMG_TMP" >/dev/null 2>&1 || true
    rm -rf "$DMG_TMP"
    if [ -f "$BUILD_DIR/hoffle_native.dmg" ]; then
        echo "  Created $BUILD_DIR/hoffle_native.dmg ($(du -h "$BUILD_DIR/hoffle_native.dmg" | cut -f1))"
        cp "$BUILD_DIR/hoffle_native.dmg" "$BUILD_DIR/Hoffle-macOS-arm64.dmg" 2>/dev/null || true
    fi
fi

echo ""
echo "=========================================================="
echo "  SUCCESS! Native macOS App built successfully!"
echo "  Location: $APP_DIR"
if [ -f "$BUILD_DIR/hoffle_native.dmg" ]; then
    echo "  DMG Installer: $BUILD_DIR/hoffle_native.dmg"
fi
echo "=========================================================="
