#!/usr/bin/env python3
"""Pulls every `.nameplate-<id> { --np-base; --np-art; box-shadow }` rule out of the web's stylesheets
into one JSON table for the native client. usage: extract-nameplates.py <out.json> <css files...>"""
import json, re, sys
rules = {}
for path in sys.argv[2:]:
    css = open(path).read()
    for m in re.finditer(r'\.nameplate-([a-z0-9-]+)\s*\{([^{}]*)\}', css):
        ident, body = m.group(1), m.group(2)
        decl = {}
        for prop in ("--np-base", "--np-art", "box-shadow"):
            d = re.search(re.escape(prop) + r'\s*:\s*([^;]+);?', body)
            if d:
                decl[prop.lstrip("-").replace("np-", "")] = " ".join(d.group(1).split())
        if decl:
            rules.setdefault(ident, {}).update(decl)
json.dump(rules, open(sys.argv[1], "w"), indent=1, sort_keys=True)
print(len(rules), "nameplates")
