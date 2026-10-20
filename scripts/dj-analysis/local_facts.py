"""Song facts for songs the Colab DJ-brain analysis never saw (they were only ever streamed), made with the
bot's own analysis: the same beat grid, phrases and stems the booth plays with.

  python3 local_facts.py <songs.json>      (a list of {"digest", "keys", "yt", "title"})

For each song it rebuilds the exact audio from the stems cache (or the copy stems-sync keeps while a split is out
on Oracle / Colab), loads it into a throwaway DJ deck and writes:
  * ~/dj-analysis/out/dj_brain_local.json   {id: facts} in out/dj_brain.json's shape (bpm, beats_per_bar,
    first_downbeat, duration, sections [{at, energy}], camelot, ...) plus "phrases" with vocal / drum presence,
    big sections and hooks from realdj.structure / find_hooks. gemini_dj.py and build_dj_plans.py read it too.
  * ~/dj-analysis/full/<id>.mp3            a small mono copy for Gemini to listen to (only if missing)
Read-only towards the live bot: a temporary analysis cache, nothing written to musicbot-main.
"""
import asyncio
import json
import os
import subprocess
import sys
import tempfile

BOT = "/mnt/harddisk/data/bot/musicbot-main"
ROOT = os.path.expanduser("~/dj-analysis")
INCOMING = "/mnt/harddisk/data/hoffle-stems-in"
OUT = os.environ.get("LOCAL_FACTS_OUT") or os.path.join(ROOT, "out", "dj_brain_local.json")
sys.path.insert(0, BOT)
os.environ.setdefault("DJ_BRAIN", "0")
os.environ["DJ_STEMS"] = "1"          # stems.local_audio / load_stems read the cache; splitting is off per session

import numpy as np  # noqa: E402

import dj  # noqa: E402
import realdj  # noqa: E402
import stems  # noqa: E402


class NoCrate:
    def items(self):
        return []

    async def take(self, index=0):
        return None


def audio_for(song):
    """(int16 (n, 2) at 48 kHz, stems or None) exactly as the bot would hear the song."""
    local = stems.local_audio(song["keys"]) if song["keys"] else None
    if local:
        return local
    for path in (os.path.join(INCOMING, song["digest"] + ".src.flac"), song.get("file")):
        if path and os.path.exists(path):
            audio = stems.decode(path)
            st = stems.load_stems(song["digest"]) if stems.has_stems(song["digest"]) else None
            return audio, (st if st is not None and st.shape[1] == len(audio) else None)
    return None


def mono_mp3(audio, path):
    pcm = audio.astype(np.int32).mean(axis=1).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "s16le", "-ar", "48000", "-ac", "1",
                    "-i", "pipe:0", "-ar", "22050", "-b:a", "64k", path], input=pcm, check=True)


async def facts(song, tmp):
    got = audio_for(song)
    if not got:
        return None
    audio, st = got
    session = dj.DJSession("facts", "test", NoCrate())
    # Never split anything here: a deck with stems on starts the separator (home's CPU) and writes
    # into the live stems cache. The stems we have are attached below by hand.
    session.stems_on = False
    path = os.path.join(tmp, "song.wav")
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "s16le", "-ar", "48000", "-ac", "2",
                    "-i", "pipe:0", path], input=audio.astype("<i2").tobytes(), check=True)
    await session.load("A", {"title": song["title"], "file": path, "keys": []})
    deck = session.engine.decks["A"]
    if st is not None and st.shape[1] == len(deck.audio):
        deck.stems, deck.stems_status = st, "ready"
        deck.extra = stems.extras(keys=song["keys"], frames=st.shape[1]) if song["keys"] else None
    s = realdj.structure(deck)
    if not s or not deck.bpm:
        return None
    hooks = realdj.find_hooks(deck, s) if deck.has_stems else []
    phrases = [{"at": round(p["start"], 2), "beat": p["beat"], "energy": round(p["energy"], 3),
                "vocals": None if p["vocals"] is None else round(p["vocals"], 2),
                "drums": None if p["drums"] is None else round(p["drums"], 2),
                "guitar": None if p.get("guitar") is None else round(p["guitar"], 2), "big": p["big"]}
               for p in s["phrases"]]
    meta = deck.meta
    return {
        "source": "local", "title": song["title"], "bpm": round(deck.bpm, 2), "beats_per_bar": 4,
        "first_downbeat": round(deck.first_beat, 3), "duration": round(deck.duration, 2),
        "bars": int((deck.duration - deck.first_beat) / (4 * deck.beat_seconds)),
        "camelot": meta.get("camelot"), "key": meta.get("key"), "energy": meta.get("energy"),
        "music_start": meta.get("music_start"), "music_end": meta.get("music_end"),
        "phrase_bars": realdj.PHRASE // 4,
        "sections": [{"at": p["at"], "energy": p["energy"], "bar": p["beat"] // 4} for p in phrases],
        "phrases": phrases, "entry_phrase": s["entry"], "exit_phrase": s["exit"], "big": s["big"],
        "hooks": [{"at": round(h["time"], 2), "beat": h["beat"], "length": h["length"], "score": round(h["score"], 2)}
                  for h in hooks[:6]],
        "guitar_stems": deck.extra is not None,
    }


async def main():
    songs = json.load(open(sys.argv[1]))
    out = json.load(open(OUT)) if os.path.exists(OUT) else {}
    os.makedirs(os.path.join(ROOT, "full"), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        dj.mixer.cache = dj.mixer.AnalysisCache(os.path.join(tmp, "analysis.json"))
        dj.SETTINGS_FILE = os.path.join(tmp, "settings.json")
        for i, song in enumerate(songs, 1):
            sid = song.get("yt") or song["digest"]
            try:
                f = await facts(song, tmp)
            except Exception as error:  # noqa: BLE001
                print(f"{i:3d} {song['title'][:50]}: FAILED {error}")
                continue
            if not f:
                print(f"{i:3d} {song['title'][:50]}: no audio or no beat grid")
                continue
            out[sid] = f
            mp3 = os.path.join(ROOT, "full", sid + ".mp3")
            if not os.path.exists(mp3):
                got = audio_for(song)
                if got:
                    mono_mp3(got[0], mp3)
            print(f"{i:3d} {song['title'][:50]:50s} {f['bpm']:6.1f} bpm {f['camelot'] or '?':>3} "
                  f"{len(f['phrases'])} phrases, {len(f['hooks'])} hooks{', guitar' if f['guitar_stems'] else ''}")
            tmp_out = OUT + ".tmp"
            json.dump(out, open(tmp_out, "w"), ensure_ascii=False)
            os.replace(tmp_out, OUT)
    print(len(out), "songs in", OUT)


if __name__ == "__main__":
    asyncio.run(main())
