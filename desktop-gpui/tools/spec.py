#!/usr/bin/env python3
"""Look up elements in a captured web spec: tools/spec.py <spec.json> <class-or-text substring>..."""
import json, sys
spec = json.load(open(sys.argv[1]))
for q in sys.argv[2:]:
    for e in spec:
        if q in e.get("cls", "") or (e.get("text") and q == e["text"]):
            print(json.dumps({k: v for k, v in e.items() if v not in (None, "")}))
