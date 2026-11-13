#!/bin/zsh
# Screenshot of the app's own window, without Screen Recording permission.
# usage: tools/shot.sh <out.png> [seconds] [binary]
# Needs gpui built with tools/gpui-snapshot.patch (see README): the patched renderer writes every
# frame it draws to GPUI_SNAPSHOT. macOS stops drawing covered windows, so the file holds the last
# frame actually drawn; use HOFFLE_DEBUG=1 and the .log next to the PNG to see the real state.
here=${0:A:h}
out=$1; secs=${2:-3}; bin=${3:-$here/../target/debug/hoffle-lite}; name=$(basename $bin)
pkill -x $name 2>/dev/null; rm -f "$out"
(GPUI_SNAPSHOT="$out" "$bin" >"${out%.png}.log" 2>&1 &)
sleep $secs
[ -z "$KEEP" ] && pkill -x $name
[ -f "$out" ] && echo "shot $out" || { echo "no frame"; tail -5 "${out%.png}.log"; }
