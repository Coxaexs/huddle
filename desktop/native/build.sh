#!/usr/bin/env bash
# Builds hoffle-app-audio.exe (per-app screen-share audio on Windows) into
# native/bin/, where electron-builder picks it up. Zig cross-compiles it from
# any OS: the repo's .tools/zig when present, otherwise zig on PATH.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIG="$DIR/../../.tools/zig/zig"
[ -x "$ZIG" ] || ZIG=zig
mkdir -p "$DIR/bin"
"$ZIG" c++ -target x86_64-windows-gnu -O2 -std=c++17 -municode \
  "$DIR/app-audio.cpp" -lole32 -lmmdevapi -luuid \
  -o "$DIR/bin/hoffle-app-audio.exe"
rm -f "$DIR/bin/"*.pdb "$DIR/bin/"*.lib
echo "built $DIR/bin/hoffle-app-audio.exe"
