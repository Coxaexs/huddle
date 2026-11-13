#!/bin/zsh
# Screenshot of the app's own window, without Screen Recording permission.
# usage: tools/shot.sh <out.png> [seconds] [binary]
# Needs gpui built with tools/gpui-snapshot.patch (see README): the patched renderer writes every
# frame it draws to GPUI_SNAPSHOT. macOS stops drawing covered windows, so the file holds the last
# frame actually drawn; use HOFFLE_DEBUG=1 and the .log next to the PNG to see the real state.
here=${0:A:h}
out=$1; secs=${2:-3}; bin=${3:-$here/../target/debug/hoffle-lite}; name=$(basename $bin)
# Always the QA account (claude-listener), never the session the app saved on this Mac (the owner's).
if [ -z "$HOFFLE_SESSION" ]; then
  export HOFFLE_SESSION="$(ssh -o ClearAllForwardings=yes home 'awk "\$6==\"hoffle_session\"{print \$7}" ~/.cache/claude-listener/cookies.txt')"
  [ -z "$HOFFLE_SESSION" ] && { echo "no QA session"; exit 1; }
fi
pkill -x $name 2>/dev/null; rm -f "$out"
(GPUI_SNAPSHOT="$out" "$bin" >"${out%.png}.log" 2>&1 &)
sleep $secs
[ -z "$KEEP" ] && pkill -x $name
[ -f "$out" ] && echo "shot $out" || { echo "no frame"; tail -5 "${out%.png}.log"; }
