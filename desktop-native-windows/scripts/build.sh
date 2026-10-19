#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$DIR/.." && pwd)"
BUILD_DIR="$DIR/build"
ZIG="$ROOT_DIR/.tools/zig/zig"
[ -x "$ZIG" ] || ZIG=zig

echo "=== Building Hoffle Native Windows App (x86_64-windows) ==="

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 1. Compile resources
echo "• Compiling Windows resources..."
(cd "$DIR/resources" && "$ZIG" rc /fo resource.res resource.rc)

# 2. Compile and Link C++ executable
echo "• Compiling and Linking Hoffle.exe..."
CXX="$ZIG c++"
CXXFLAGS="-target x86_64-windows -O2 -std=c++17"
INCLUDES="-I$DIR/include -I$DIR/vendor/webview2/build/native/include -I$DIR/src"
LIBS="-lgdi32 -luser32 -lshell32 -lole32 -loleaut32 -lshlwapi -ldwmapi -lversion -lcomctl32 -Wl,--subsystem,windows"

$CXX $CXXFLAGS $INCLUDES \
    "$DIR/src/main.cpp" \
    "$DIR/src/ConfigManager.cpp" \
    "$DIR/src/ActivityScanner.cpp" \
    "$DIR/resources/resource.res" \
    $LIBS \
    -o "$BUILD_DIR/Hoffle.exe"

# 3. Copy WebView2Loader.dll
echo "• Bundling WebView2Loader.dll..."
cp "$DIR/vendor/webview2/build/native/x64/WebView2Loader.dll" "$BUILD_DIR/"

# 4. Verify PE32+ executable
echo "• Verifying binary architecture:"
file "$BUILD_DIR/Hoffle.exe"

# 5. Create distribution ZIP package
echo "• Packaging hoffle_native_windows.zip..."
(cd "$BUILD_DIR" && zip -r -q "hoffle_native_windows.zip" "Hoffle.exe" "WebView2Loader.dll")

echo ""
echo "=========================================================="
echo "  SUCCESS! Native Windows App built successfully!"
echo "  Location: $BUILD_DIR/Hoffle.exe"
echo "  Package:  $BUILD_DIR/hoffle_native_windows.zip"
echo "=========================================================="
