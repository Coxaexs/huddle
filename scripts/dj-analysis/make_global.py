"""Make playlists global (shown in every room and server): move them into the "*" pseudo-guild with their mix
plans, and drop the per-room copies (a room's own copy would shadow the global one).

  python3 make_global.py "<name>" ["<name>" ...]          (run as: sg server -c "umask 002; ...")
The source is the first room that has the name, kitchen-table preferred (it holds the hand-made transitions).
"""
import json
import sqlite3
import sys
import time

DB = "/mnt/harddisk/data/bot/musicbot-main/musicbot.sqlite3"
GLOBAL = "*"
PREFER = "huddle:kitchen-table"

names = sys.argv[1:]
con = sqlite3.connect(DB, timeout=30)
con.execute("BEGIN IMMEDIATE")
load = lambda key: json.loads((con.execute("SELECT payload FROM documents WHERE key = ?", (key,)).fetchone() or ["{}"])[0])
lists, mixes, meta = load("music_playlists"), load("playlist_mixes"), load("music_playlist_meta")
glob = lists.setdefault(GLOBAL, {"shared": {}, "users": {}})
glob.setdefault("shared", {}), glob.setdefault("users", {})
glob_mix = mixes.setdefault(GLOBAL, {}).setdefault("shared", {})
for name in names:
    rooms = [g for g in [PREFER] + sorted(lists) if g != GLOBAL and name in lists.get(g, {}).get("shared", {})]
    if not rooms:
        print("not found in any room:", name)
        continue
    source = rooms[0]
    glob["shared"][name] = lists[source]["shared"][name]
    record = mixes.get(source, {}).get("shared", {}).get(name)
    if record:
        glob_mix[name] = record
    cover = meta.get(source, {}).get("shared", {}).get(name)
    if cover:
        meta.setdefault(GLOBAL, {"shared": {}, "users": {}}).setdefault("shared", {})[name] = cover
    for room in sorted(set(rooms)):
        del lists[room]["shared"][name]
        mixes.get(room, {}).get("shared", {}).pop(name, None)
        meta.get(room, {}).get("shared", {}).pop(name, None)
    print(f"global: {name} ({len(glob['shared'][name])} songs, "
          f"{len((record or {}).get('transitions', {}))} transitions) from {source}; removed from {', '.join(sorted(set(rooms)))}")
now = time.time()
for key, data in (("music_playlists", lists), ("playlist_mixes", mixes), ("music_playlist_meta", meta)):
    con.execute("INSERT INTO documents(key, payload, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE "
                "SET payload=excluded.payload, updated_at=excluded.updated_at",
                (key, json.dumps(data, ensure_ascii=False, separators=(",", ":")), now))
con.commit()
con.close()
