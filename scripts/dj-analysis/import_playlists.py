"""Add the finished playlists to the bot's playlists.json (room huddle:kitchen-table, shared).

Run it yourself when you are ready:  python3 import_playlists.py [--apply]
Without --apply it only shows what it would add. It never changes or removes an existing playlist, skips names that
already exist, and writes a backup next to playlists.json first. The bot keeps playlists in memory and rewrites the
file when anyone edits one, so do this right after `touch .restart` (or while the bot is stopped) to avoid it
overwriting the import.
"""
import json
import os
import shutil
import sys
import time

BOT = "/mnt/harddisk/data/bot/musicbot-main"
SRC = "/home/coxaexs/dj-analysis/final/playlists_import.json"
data = json.load(open(SRC))
path = os.path.join(BOT, "playlists.json")
live = json.load(open(path))
room = live.setdefault(data["guild"], {"shared": {}, "users": {}})
shared = room.setdefault("shared", {})
add = {n: e for n, e in data["shared"].items() if n not in shared}
for n, e in data["shared"].items():
    print(("ADD  " if n in add else "SKIP ") + f"{n} ({len(e)} songs)" + ("" if n in add else " - name already exists"))
if "--apply" not in sys.argv:
    print("\ndry run. Re-run with --apply to write.")
    sys.exit(0)
os.makedirs(os.path.join(BOT, "backups"), exist_ok=True)
shutil.copy2(path, os.path.join(BOT, "backups", f"playlists.json.{time.strftime('%Y%m%d-%H%M%S')}"))
shared.update(add)
tmp = path + ".import.tmp"
json.dump(live, open(tmp, "w"), ensure_ascii=False, indent=2)
os.replace(tmp, path)
print(f"\nadded {len(add)} playlists to {data['guild']}")
