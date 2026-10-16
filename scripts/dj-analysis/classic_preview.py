import json, re, sys
sys.path.insert(0, "/home/coxaexs/dj-analysis/testenv/deps")
import numpy as np
O = "/home/coxaexs/dj-analysis/out/"
b = json.load(open(O + "dj_brain.json"))["songs"]
ids = json.load(open(O + "song_tags.json"))["ids"]
E = np.load(O + "embeddings.npy"); E = E / np.linalg.norm(E, axis=1, keepdims=True)
ix = {v: i for i, v in enumerate(ids)}
P = json.load(open(O + "dj_playlists_frozen.json"))["playlists"]
used = {t["id"] for i, p in enumerate(P) if i != 4 for t in p["tracks"]}
SEED = re.compile(r"queen|beatles|pink floyd|rolling stones|depeche mode|lou reed|stranglers|johnny cash|led zeppelin|ac/dc|acdc|eagles|fleetwood|david bowie|the cure|the smiths|joy division|bee gees|abba|elton john|bob dylan|simon & garfunkel|the doors|creedence|bon jovi|guns n|scorpions|dire straits|the police|\bu2\b|genesis|the kinks|the who|lynyrd|aerosmith|kiss\b|deep purple|black sabbath|nirvana|metallica", re.I)
short = lambda v: re.sub(r"\[[^\]]*\]|\((official|lyric|audio|video|remaster)[^)]*\)", "", b[v]["file"].split("/")[-1], flags=re.I).strip()[:48]
seeds = [v for v in b if v not in used and SEED.search(b[v]["file"]) and b[v]["lang"] == "en"]
print(len(seeds), "seed songs not used elsewhere:"); print("; ".join(short(v) for v in seeds))
cen = E[[ix[v] for v in seeds]].mean(0); cen /= np.linalg.norm(cen)
cand = [v for v in b if v not in used and v not in seeds and b[v]["lang"] == "en" and 100 <= (b[v]["duration"] or 0) <= 480]
cand.sort(key=lambda v: -float(E[ix[v]] @ cen))
print("\nnearest non-seed candidates:"); print("; ".join(f"{short(v)} ({float(E[ix[v]] @ cen):.2f})" for v in cand[:45]))
