"""Take one song out of plan.json and let Gemini plan the one new transition that joins its neighbours.

  python3 drop_from_plan.py "<part of the title>"
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import plan_flac_playlists as planner  # noqa: E402

needle = sys.argv[1].lower()
path = os.path.join(planner.WORK, "plan.json")
plan = json.load(open(path))
songs = {s["title"]: s for s in planner.songs_with_facts()}
by_url = {planner.entry(s)["url"]: s for s in songs.values()}
for p in plan:
    for i, entry in enumerate(p["songs"]):
        if needle not in entry["title"].lower():
            continue
        print("dropping", entry["title"], "from", p["name"])
        del p["songs"][i]
        del p["digests"][i]
        before = p["transitions"][:max(0, i - 1)]
        after = p["transitions"][i + 1:]
        joined = []
        if 0 < i < len(p["songs"]):
            a, b = by_url[p["songs"][i - 1]["url"]], by_url[p["songs"][i]["url"]]
            raw = (planner.plan_transitions([a, b], p["name"]) or [{}])[0]
            spec, fixes = planner.check(raw, a, b)
            joined = [{"from": a["title"], "to": b["title"], "spec": spec, "fixes": fixes, "planned": bool(raw)}]
            print("new join:", a["title"], "->", b["title"], spec)
        p["transitions"] = before + joined + after
        assert len(p["transitions"]) == len(p["songs"]) - 1
        json.dump(plan, open(path, "w"), ensure_ascii=False, indent=1)
        sys.exit(0)
print("no song matches", needle)
