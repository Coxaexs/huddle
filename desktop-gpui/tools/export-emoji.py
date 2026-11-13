#!/usr/bin/env python3
"""EMOJI_DATASET from the web's app/components/emoji-picker.tsx, as resources/emoji/dataset.json
(name, symbol, category), in the same order. usage: tools/export-emoji.py <emoji-picker.tsx>"""
import json, re, sys, pathlib
src = pathlib.Path(sys.argv[1]).read_text()
body = src[src.index("const EMOJI_DATASET"):src.index("export function EmojiPicker")]
rows = re.findall(r'\{\s*name:\s*"([^"]+)",\s*symbol:\s*"([^"]+)",\s*category:\s*"([^"]+)"\s*\}', body)
out = pathlib.Path(__file__).resolve().parent.parent / "resources/emoji/dataset.json"
out.write_text(json.dumps([{"name": n, "symbol": s, "category": c} for n, s, c in rows], ensure_ascii=False, indent=0))
print(len(rows), "emoji ->", out)
