"""Sort the library into the DJ's mood stations (the bot's stations.py): which of them each song belongs to.

  python3 classify_stations.py              classify songs not done yet, then export
  python3 classify_stations.py --export     just write the bot's file from what is done

The songs: every library song with a YouTube id (the stems index, the Colab manifest, Gemini's notes). Gemma
(text only, free tier) reads each one's title and artist, and Gemini's genres and moods where it listened to the
song, and puts it in one to three stations. Answers are cached in ~/dj-analysis/out/stations_raw.json, so a rerun
only asks about new songs. --export writes <musicbot>/dj_brain/stations.json, which the bot reads within a minute.
Run the export as the bot's group:  sg server -c "umask 002; python3 classify_stations.py"
Reads the key (DJ_API_GEMINI) from ~/huddle/.dev.vars and never prints it.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = "/home/coxaexs/dj-analysis"
BOT = os.environ.get("MUSICBOT_DIR") or "/mnt/harddisk/data/bot/musicbot-main"
RAW = f"{ROOT}/out/stations_raw.json"
MODEL = "gemini-3.5-flash-lite"       # quick and steady; Gemma (gemma-4-*) kept answering 500 or timing out on 2026-10-26
#: When a model fails a batch, the next one gets it (all free tier, text only).
FALLBACKS = ["gemini-3.1-flash-lite", "gemma-4-26b-a4b-it"]
BATCH = 25
RPM = 10

# The stations, as the model is told them (the bot's stations.py has the same ids).
STATIONS = {
    "heavy": "Heavy rock: hard rock, metal, nu-metal, post-grunge, pop-punk and punk; loud guitars and big drums (Three Days Grace, Linkin Park, Metallica, Paramore, maNga)",
    "indie": "Indie rock: indie, alternative and garage rock, post-punk, britpop guitar bands (The Strokes, Arctic Monkeys, Pixies, Radiohead's rock songs)",
    "sad": "Sad: melancholic, heartbroken, slow or emotional songs of any genre",
    "pop": "Pop: mainstream pop, pop-rock and synth-pop, catchy and upbeat (Taylor Swift, Dua Lipa, The Weeknd)",
    "dreamy": "Dreamy: dream pop, bedroom pop, shoegaze, lo-fi, ethereal or hazy indie (bôa's Duvet, Beach House, Cigarettes After Sex)",
    "party": "Party: dance, EDM, house, hip-hop, reggaeton, club bangers that make people dance",
    "turkish": "Türkçe: songs sung in Turkish, any genre",
    "chill": "Chill: relaxed acoustic, folk, soul, R&B, jazz, laid-back grooves",
}


def key():
    for line in open(os.path.expanduser("~/huddle/.dev.vars")):
        if line.startswith("DJ_API_GEMINI="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("no DJ_API_GEMINI in ~/huddle/.dev.vars")


def library():
    """{youtube id: {"title", "genres", "moods", "language"}} for every song we know with a YouTube id."""
    songs = {}
    index = json.load(open(f"{BOT}/stems_cache/index.json")).get("tracks", {})
    for k, v in index.items():
        if k.startswith("yt:") and v.get("title"):
            songs.setdefault(k[3:], {"title": v["title"]})
    manifest = f"{ROOT}/manifest.json"
    if os.path.exists(manifest):
        for vid, item in json.load(open(manifest)).items():
            name = os.path.basename(item.get("file") or "")
            artist = os.path.basename(os.path.dirname(item.get("file") or ""))
            title = re.sub(r"\s*-\s*\[[\w-]{11}\]\.\w+$", "", name)
            songs.setdefault(vid, {"title": f"{artist} - {title}" if artist and artist.lower() not in title.lower() else title})
    plans = json.load(open(f"{BOT}/dj_brain/plans.json")).get("songs", {})
    for vid, p in plans.items():
        if vid in songs:
            songs[vid].update(genres=p.get("genres") or [], moods=p.get("moods") or [], language=p.get("language"))
    return songs


def ask(api_key, batch, model=None):
    lines = []
    for n, (vid, song) in enumerate(batch):
        heard = ""
        if song.get("genres") or song.get("moods"):
            heard = f" | heard as: {', '.join(song.get('genres') or [])}; {', '.join(song.get('moods') or [])}"
            if song.get("language"):
                heard += f"; sung in {song['language']}"
        lines.append(f"{n}. {song['title']}{heard}")
    prompt = (
        "You sort songs into a DJ's mood stations. The stations:\n"
        + "\n".join(f"- {sid}: {text}" for sid, text in STATIONS.items())
        + "\n\nFor each song below, give the stations it belongs in: one to three, the best first. A song sung in "
        "Turkish is always in turkish too. Use what you know about the song and artist; 'heard as' is what a model "
        "heard listening to it. If a line is not music (a speech, a podcast, a sound effect), give an empty list.\n"
        "Answer only with JSON: {\"0\": [\"indie\", \"sad\"], \"1\": [...], ...}\n\n" + "\n".join(lines)
    )
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}}
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model or MODEL}:generateContent?key={api_key}",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=300) as response:
        data = json.load(response)
    text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"] if not p.get("thought"))
    text = text[text.find("{"):text.rfind("}") + 1]
    answer = json.loads(text)
    out = {}
    for n, (vid, _song) in enumerate(batch):
        got = answer.get(str(n))
        if isinstance(got, list):
            out[vid] = [s for s in got if s in STATIONS][:3]
    return out


def export(raw):
    titles = {vid: song["title"] for vid, song in library().items()}
    songs = {vid: {"in": ids, "title": titles.get(vid)} for vid, ids in raw.items() if ids}
    counts = {sid: sum(sid in s["in"] for s in songs.values()) for sid in STATIONS}
    target = f"{BOT}/dj_brain/stations.json"
    with open(target + ".tmp", "w") as f:
        json.dump({"version": 1, "model": MODEL, "made": time.strftime("%Y-%m-%d"), "songs": songs}, f)
    os.replace(target + ".tmp", target)
    print(f"{len(songs)} songs in stations -> {target}: {counts}")


def main():
    raw = json.load(open(RAW)) if os.path.exists(RAW) else {}
    if "--export" not in sys.argv:
        api_key = key()
        songs = library()
        todo = [(vid, s) for vid, s in songs.items() if vid not in raw]
        print(f"{len(songs)} songs, {len(todo)} to classify")
        for start in range(0, len(todo), BATCH):
            batch = todo[start:start + BATCH]
            for attempt in range(6):
                model = ([MODEL] + FALLBACKS)[min(attempt // 2, len(FALLBACKS))]
                try:
                    raw.update(ask(api_key, batch, model))
                    break
                except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError) as error:
                    wait = 20 * (attempt + 1)
                    print(f"batch {start} ({model}): {type(error).__name__} {getattr(error, 'code', '')}, retrying in {wait}s")
                    time.sleep(wait)
            json.dump(raw, open(RAW + ".tmp", "w"), ensure_ascii=False)
            os.replace(RAW + ".tmp", RAW)
            print(f"{min(start + BATCH, len(todo))}/{len(todo)}", flush=True)
            time.sleep(60 / RPM)
    export(raw)


if __name__ == "__main__":
    main()
