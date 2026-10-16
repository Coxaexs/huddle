"""Copy the Colab results into the bot as a small local data folder (dj_brain/), so the DJ never needs Colab or Drive.

  python3 export_brain.py            # from ~/dj-analysis/out -> <musicbot>/dj_brain/
Writes songs.json (per YouTube id: bpm, key, energy, language, mix points), emb.npy (float16 sound fingerprints) and
ids.json (row order of emb.npy). Delete the folder or set DJ_BRAIN=0 and the DJ goes back to plain behaviour.
"""
import json
import os
import sys

sys.path.insert(0, "/home/coxaexs/dj-analysis/testenv/deps")
import numpy as np

SRC = "/home/coxaexs/dj-analysis/out/"
DST = os.environ.get("DJ_BRAIN_DIR") or "/mnt/harddisk/data/bot/musicbot-main/dj_brain"
brain = json.load(open(SRC + "dj_brain.json"))["songs"]
ids = json.load(open(SRC + "song_tags.json"))["ids"]
emb = np.load(SRC + "embeddings.npy")
emb = (emb / np.linalg.norm(emb, axis=1, keepdims=True)).astype("float16")
keep = [i for i, v in enumerate(ids) if v in brain and not v.startswith("f_")]
songs = {}
for i in keep:
    s = brain[ids[i]]
    songs[ids[i]] = {"bpm": s["bpm"], "camelot": s["camelot"], "energy": s["energy"], "lang": s["lang"],
                     "lang_p": s["lang_p"], "mix_in": s["mix_in"]["at"], "mix_out": s["mix_out"]["at"],
                     "drop_in": (s.get("drop_in") or {}).get("at")}
os.makedirs(DST, exist_ok=True)
tmp = DST + "/.tmp"
os.makedirs(tmp, exist_ok=True)
json.dump(songs, open(tmp + "/songs.json", "w"), ensure_ascii=False)
json.dump([ids[i] for i in keep], open(tmp + "/ids.json", "w"))
np.save(tmp + "/emb.npy", emb[keep])
for name in ("songs.json", "ids.json", "emb.npy"):
    os.replace(f"{tmp}/{name}", f"{DST}/{name}")
os.rmdir(tmp)
print("exported", len(keep), "songs to", DST)
