#!/usr/bin/env python3
"""Prints a style dump from the QA driver (rows of [depth, tag.class, rect, font, colour, ...])."""
import json, sys
raw = open(sys.argv[1]).read()
raw = raw[raw.index("["):] if not raw.lstrip().startswith("[") else raw
d = json.loads(raw)
for r in d[: int(sys.argv[2]) if len(sys.argv) > 2 else 200]:
    print("  " * r[0] + " | ".join(str(x) for x in r[1:] if x not in ("", None)))
