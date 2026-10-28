"""Install the Colab structure run (hoffle_structure.ipynb) for the bot: dj_brain/structure.json.

  python3 export_structure.py            fetch Drive/Hoffle/out/structure.json (rclone) and install it
  python3 export_structure.py --local    install ~/dj-analysis/out/structure.json as it is

Per song (YouTube id): its sections [[start, end, label]] and where its bars start (downbeats, seconds). The bot
(djbrain.structure / sections / downbeats) picks a newer file up within a minute, no restart: the club's song map
then has the song's real sections, landing on its real bar lines. Songs it doesn't cover keep Gemini's sections.
Run it as the bot's group so the bot can replace the file later:  sg server -c "umask 002; python3 export_structure.py"
"""
import json
import os
import subprocess
import sys
import time

ROOT = "/home/coxaexs/dj-analysis"
BOT_DIR = os.environ.get("DJ_BRAIN_DIR") or "/mnt/harddisk/data/bot/musicbot-main/dj_brain"
LABELS = {"intro", "verse", "chorus", "bridge", "break", "inst", "solo", "outro"}


def clean(song):
    """A song's sections and downbeats as the bot reads them, or None when there is too little to use."""
    segments = []
    for item in song.get("segments") or []:
        if not (isinstance(item, list) and len(item) == 3):
            continue
        start, end, label = item
        if label in LABELS and isinstance(start, (int, float)) and isinstance(end, (int, float)) and end > start:
            segments.append([round(start, 2), round(end, 2), label])
    downbeats = [round(x, 2) for x in song.get("downbeats") or [] if isinstance(x, (int, float))]
    if len(segments) < 3:
        return None
    return {"segments": segments, "downbeats": downbeats}


def main():
    source = f"{ROOT}/out/structure.json"
    if "--local" not in sys.argv:
        subprocess.run(["rclone", "copy", "gdrive:Hoffle/out/structure.json", f"{ROOT}/out/"], check=True)
    data = json.load(open(source))
    songs = {}
    for vid, song in (data.get("songs") or {}).items():
        made = clean(song)
        if made:
            songs[vid] = made
    os.makedirs(BOT_DIR, exist_ok=True)
    target = f"{BOT_DIR}/structure.json"
    with open(target + ".tmp", "w") as f:
        json.dump({"version": 1, "model": data.get("model"), "made": data.get("made") or time.strftime("%Y-%m-%d"), "songs": songs}, f)
    os.replace(target + ".tmp", target)
    print(f"{len(songs)} songs ({len(data.get('songs') or {}) - len(songs)} left out) -> {target}, {os.path.getsize(target) // 1024} KB")


if __name__ == "__main__":
    main()
