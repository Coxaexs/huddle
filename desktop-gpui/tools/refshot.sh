#!/bin/zsh
# Fresh web reference (Full mode, 1180x760) from the QA driver on home, then the native app, then a
# side-by-side. usage: tools/refshot.sh <name> [crop x,y,w,h]
# Needs the driver running on home (port 8767, see README) with the Full-mode session override.
name=$1; crop=$2; here=${0:A:h}
S=/private/tmp/claude-501/-Users-mac/179d553d-d5f2-4f0a-900d-e2581eede0ab/scratchpad
ssh -o ClearAllForwardings=yes home "curl -s 'localhost:8767/shot?n=ref-$name' >/dev/null" && scp -q -o ClearAllForwardings=yes home:.cache/hoffle-qa/shots/ref-$name.jpg $here/../reference/
$here/shot.sh $S/$name.png ${SECS:-8} >/dev/null
$S/fontvenv/bin/python $here/compare.py $here/../reference/ref-$name.jpg $S/$name.png $S/cmp-$name.png $crop && echo $S/cmp-$name.png
