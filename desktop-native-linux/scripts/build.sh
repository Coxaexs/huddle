#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
DIST_DIR="$BUILD_DIR/hoffle-linux-x86_64"

echo "=== Building Native Linux Hoffle Desktop App ==="

mkdir -p "$BUILD_DIR"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/bin"
mkdir -p "$DIST_DIR/resources"

# The self-update script goes inside the binary, and the version it compares
# against is the desktop apps' shared one.
REPO_DIR="$(cd "$ROOT_DIR/.." && pwd)"
GEN_DIR="$BUILD_DIR/gen"
mkdir -p "$GEN_DIR"
{
    printf 'static const char* kUpdateScript = R"HOFFLE_UPDATE('
    cat "$REPO_DIR/desktop/native/native-update.sh"
    printf ')HOFFLE_UPDATE";\n'
} > "$GEN_DIR/update-script.h"
VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$REPO_DIR/desktop/package.json" | head -n 1)"

# Compile with g++
echo "--> Compiling C++ native binary (version $VERSION)..."
g++ -std=c++17 -O2 -Wno-deprecated-declarations \
    -I"$GEN_DIR" -DHOFFLE_VERSION="\"$VERSION\"" \
    "$ROOT_DIR/src/main.cpp" \
    "$ROOT_DIR/src/ActivityScanner.cpp" \
    "$ROOT_DIR/src/ConfigManager.cpp" \
    $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1 ayatana-appindicator3-0.1 keybinder-3.0 libnotify) \
    -o "$DIST_DIR/bin/hoffle"

# Strip symbols for minimal binary size
strip "$DIST_DIR/bin/hoffle"

# Copy resources
echo "--> Copying resources..."
cp "$ROOT_DIR/resources/icon.png" "$DIST_DIR/resources/"
cp "$ROOT_DIR/resources/tray-icon.png" "$DIST_DIR/resources/"
cp "$ROOT_DIR/src/web-bridge.js" "$DIST_DIR/resources/"
cp "$ROOT_DIR/resources/hoffle.desktop" "$DIST_DIR/"

# Create desktop installer script
cat << 'EOF' > "$DIST_DIR/install.sh"
#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"
APP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR"

echo "Installing Hoffle to ~/.local/ ..."
cp "$DIR/bin/hoffle" "$BIN_DIR/hoffle"
chmod +x "$BIN_DIR/hoffle"

cp "$DIR/resources/icon.png" "$ICON_DIR/hoffle.png"

sed "s|Exec=hoffle %U|Exec=$BIN_DIR/hoffle %U|g" "$DIR/hoffle.desktop" > "$APP_DIR/hoffle.desktop"
chmod +x "$APP_DIR/hoffle.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APP_DIR" 2>/dev/null || true
fi

echo "Hoffle installed successfully!"
echo "You can launch it from your application menu or by running 'hoffle' from your terminal."
EOF
chmod +x "$DIST_DIR/install.sh"

# Create single executable launcher at root of dist
cat << 'EOF' > "$DIST_DIR/Hoffle"
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$DIR/bin/hoffle" "$@"
EOF
chmod +x "$DIST_DIR/Hoffle"

# Create tar.gz archives
echo "--> Packaging tar.gz..."
cd "$BUILD_DIR"
tar -czf "$BUILD_DIR/hoffle_native_linux_x86_64.tar.gz" "hoffle-linux-x86_64"
cp "$BUILD_DIR/hoffle_native_linux_x86_64.tar.gz" "$BUILD_DIR/hoffle_native_linux.tar.gz"

echo "=== Build Complete ==="
ls -lh "$BUILD_DIR/hoffle_native_linux_x86_64.tar.gz"
ls -lh "$DIST_DIR/bin/hoffle"
