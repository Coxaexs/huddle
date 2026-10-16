"""Cut a 30 s mono clip from every downloaded song, for the Colab tagging notebook.

Writes clips/<youtube id>.mp3 plus manifest.json (id -> original file name and
duration), then clips.zip. Resumable: existing clips are skipped.
"""
import hashlib, json, os, re, subprocess, sys, zipfile
from concurrent.futures import ThreadPoolExecutor

SRC = "/mnt/harddisk/data/bot/musicbot-main/musics"
OUT = "/home/coxaexs/dj-analysis"
NEW = "--new" in sys.argv                      # only songs not tagged / uploaded yet
FULL = "--full" in sys.argv                    # whole songs (mono 22.05 kHz) for beats / structure
CLIPS = os.path.join(OUT, "full" if FULL else "clips_new" if NEW else "clips")
SEEN = os.path.join(OUT, "uploaded_full_ids.json" if FULL else "uploaded_ids.json")      # ids already sent to Colab
def _ids(path, key=None):
    try:
        data = json.load(open(path))
        return set(data[key] if key else data)
    except (OSError, ValueError, KeyError):
        return set()


seen = set()
if NEW or FULL:
    seen = _ids(SEEN) | _ids(os.path.join(OUT, "out", "song_tags.json"), "ids")
os.makedirs(CLIPS, exist_ok=True)
ID = re.compile(r"\[([A-Za-z0-9_-]{11})\]\.[a-z0-9]+$")


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def cut(name):
    m = ID.search(name)
    vid = m.group(1) if m else "f_" + hashlib.md5(name.encode()).hexdigest()[:10]
    path = os.path.join(SRC, name)
    if vid in seen:
        return None
    dest = os.path.join(CLIPS, vid + ".mp3")
    dur = duration(path)
    if not dur:
        return None
    if FULL and not os.path.exists(dest):
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", "22050",
                        "-b:a", "96k", dest], check=False)
    elif not os.path.exists(dest):
        start = max(0.0, min(dur * 0.35, dur - 32))
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{start:.1f}", "-t", "30",
                        "-i", path, "-ac", "1", "-ar", "48000", "-b:a", "64k", dest], check=False)
    return (vid, {"file": name, "duration": round(dur, 1)}) if os.path.exists(dest) else None


files = sorted(os.path.relpath(os.path.join(d, f), SRC) for d, _, fs in os.walk(SRC)
               for f in fs if f.lower().endswith((".mp3", ".m4a", ".opus", ".flac", ".wav")))
with ThreadPoolExecutor(3) as pool:
    results = [r for r in pool.map(cut, files) if r]
manifest = dict(results)
if NEW or FULL:
    with open(SEEN, "w") as f:
        json.dump(sorted(seen | set(manifest)), f)
    print(len(manifest), "files in", CLIPS)
    sys.exit(0)
with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=0)
with zipfile.ZipFile(os.path.join(OUT, "clips.zip"), "w", zipfile.ZIP_STORED) as z:
    for vid in manifest:
        z.write(os.path.join(CLIPS, vid + ".mp3"), vid + ".mp3")
    z.write(os.path.join(OUT, "manifest.json"), "manifest.json")
print(len(manifest), "clips of", len(files), "files")
