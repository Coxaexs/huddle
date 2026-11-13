#!/usr/bin/env python3
"""Side by side: web reference (left) and native screenshot (right, scaled to the same size).
usage: compare.py <reference.jpg> <native.png> <out.png> [crop x,y,w,h in reference pixels]"""
import sys
from PIL import Image
ref = Image.open(sys.argv[1]).convert("RGB")
nat = Image.open(sys.argv[2]).convert("RGB").resize(ref.size, Image.LANCZOS)
if len(sys.argv) > 4:
    x, y, w, h = map(int, sys.argv[4].split(","))
    ref, nat = ref.crop((x, y, x + w, y + h)), nat.crop((x, y, x + w, y + h))
    scale = 2 if w < 700 else 1
    ref, nat = ref.resize((w * scale, h * scale)), nat.resize((w * scale, h * scale))
out = Image.new("RGB", (ref.width * 2 + 12, ref.height), (255, 0, 128))
out.paste(ref, (0, 0)); out.paste(nat, (ref.width + 12, 0))
out.save(sys.argv[3])
