"""Turn the Colab output into the final, import-ready playlists.

Reads  ~/dj-analysis/out/{dj_brain.json, dj_playlists_frozen.json, song_tags.json, embeddings.npy}
Writes ~/dj-analysis/final/{playlists_import.json, playlists_detail.json}

The Colab file is never modified. This step: removes duplicate recordings (same song, different upload) across
the whole set, swaps the grab-bag cluster (#4) for a classic-rock / oldies playlist, tops up playlists that
fell under 25 songs, re-orders with the DJ cost function and gives the playlists real names.
Run with any python that has numpy:  python3 finalize_playlists.py
"""
import json
import math
import os
import re
import sys

sys.path.insert(0, "/home/coxaexs/dj-analysis/testenv/deps")
import numpy as np

O = "/home/coxaexs/dj-analysis/out/"
F = "/home/coxaexs/dj-analysis/final/"
os.makedirs(F, exist_ok=True)
brain = json.load(open(O + "dj_brain.json"))["songs"]
manifest = json.load(open("/home/coxaexs/dj-analysis/manifest.json"))
ids = json.load(open(O + "song_tags.json"))["ids"]
E = np.load(O + "embeddings.npy")
E = E / np.linalg.norm(E, axis=1, keepdims=True)
ix = {v: i for i, v in enumerate(ids)}
frozen = json.load(open(O + "dj_playlists_frozen.json"))["playlists"]

NAMES = {                       # chosen by reading the actual songs in each playlist
    0: ("AI · Türkçe Pop-Rock Duygusal", True),
    1: ("AI · Türkçe Pop Hitleri", True),
    2: ("AI · Türkçe Alternatif Rock", True),
    3: ("AI · Pop & Alt-Pop Hits", False),
    4: ("AI · Rock Klasikleri & Oldies", False),       # rebuilt below
    5: ("AI · Indie & Alt Rock", False),
    6: ("AI · Afrobeats & French Rap", False),
    7: ("AI · Nu Metal & Hard Rock", False),
    8: ("AI · Soft & Sad Singer-Songwriters", False),
    9: ("AI · Party Pop & Dance", False),
}
MIN_LEN, MAX_LEN = 25, 40
SEED = re.compile(r"queen|beatles|pink floyd|rolling stones|depeche mode|lou reed|stranglers|johnny cash|led zeppelin|ac/dc|"
                  r"eagles|fleetwood|david bowie|the cure|the smiths|joy division|bee gees|elton john|bob dylan|simon & garfunkel|"
                  r"the doors|creedence|bon jovi|guns n|scorpions|dire straits|the police|\bu2\b|the kinks|the who|lynyrd|"
                  r"aerosmith|deep purple|black sabbath|nirvana|metallica|john lennon|rebel rebel|china girl|space oddity|"
                  r"day tripper|come together|while my guitar|this i love|pixies|oasis|blondie|placebo|r\.e\.m|sex pistols", re.I)
NOT_CLASSIC = re.compile(r"calvin harris|thirty seconds|dresden|side effects|john newman|one direction|5 seconds|tv girl|britney|"
                         r"zach bryan|edward sharpe|tamino|warhaus|dua lipa|redd|mark ronson|cage the elephant|the script|"
                         r"coldplay|linkin park|three days|taylor swift|olivia", re.I)


# ---------------------------------------------------------------------------------------------- helpers
def base(v):
    return brain[v]["file"].split("/")[-1]


def title_of(v):
    f = brain[v]["file"]
    parts = f.split("/")
    name = re.sub(r"\.[a-z0-9]+$", "", parts[-1])
    name = re.sub(r"\s*-?\s*\[[A-Za-z0-9_-]{11}\]\s*$", "", name).strip(" -")
    artist = parts[-2] if len(parts) > 1 else ""
    if artist and artist != "NA" and " - " not in name and artist.lower() not in name.lower():
        name = f"{artist} - {name}"
    return re.sub(r"\s+", " ", name)[:120]


def norm_title(v):
    t = re.sub(r"\.[a-z0-9]+$", "", base(v)).lower()
    t = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", t)
    t = re.sub(r"\b(official|video|audio|lyrics?|lyric|visuali[sz]er|remaster(ed)?|hd|live|ft|feat|music|vevo|mv|clip|the)\b", " ", t)
    return re.sub(r"[^a-z0-9ğüşıöç]+", " ", t).strip()


def tempo_gap(a, b):
    r = a / b
    return min(abs(math.log(r)), abs(math.log(r * 2)), abs(math.log(r / 2)))


def same_song(a, b):
    ta, tb = set(norm_title(a).split()), set(norm_title(b).split())
    if len(ta) >= 2 and ta == tb:                # same words, e.g. "The Beatles - The Beatles - Come Together"
        return True
    sa, sb = brain[a], brain[b]
    return (float(E[ix[a]] @ E[ix[b]]) > 0.965 and tempo_gap(sa["bpm"], sb["bpm"]) < 0.03
            and abs((sa["duration"] or 0) - (sb["duration"] or 0)) < 20)


def camelot_steps(a, b):
    if not a or not b:
        return 3
    na, nb = int(a[:-1]), int(b[:-1])
    d = min((na - nb) % 12, (nb - na) % 12)
    return min(d + (0 if a[-1] == b[-1] else 1), 3)


def artist_of(v):
    f = brain[v]["file"]
    return (f.split(" - ")[0].split("/")[-1] if " - " in f else "").strip().lower()


def cost(a, b, target):
    sa, sb = brain[a], brain[b]
    gap = tempo_gap(sa["bpm"], sb["bpm"])
    tempo = gap * 6 if gap <= 0.06 else 0.6 + gap * 8 if gap <= 0.12 else 2.5
    key = (0.0, 0.15, 0.7, 1.1)[camelot_steps(sa["camelot"], sb["camelot"])]
    c = tempo + key + abs(sb["energy"] - target) * 2.2 + (1 - float(E[ix[a]] @ E[ix[b]])) * 1.2
    return c + (0.8 if artist_of(a) and artist_of(a) == artist_of(b) else 0)


def arc(t):
    return 0.5 + 0.32 * math.sin(math.pi * min(1.0, t * 1.6)) * (0.75 if 0.62 < t < 0.75 else 1.0)


def order(members):
    left = list(members)
    n = len(left)
    cur = min(left, key=lambda v: abs(brain[v]["energy"] - arc(0)))
    left.remove(cur)
    route = [cur]
    while left:
        nxt = min(left, key=lambda v: cost(route[-1], v, arc(len(route) / n)))
        left.remove(nxt)
        route.append(nxt)
    return route


def usable(v):
    return (not v.startswith("f_") and 100 <= (brain[v]["duration"] or 0) <= 480
            and not re.search(r"sound effect|tutorial|reaction", brain[v]["file"], re.I))


# ---------------------------------------------------------------------------------------------- build
kept_all = []                                   # every song placed anywhere, for global de-duplication


def is_dup(v):
    return any(same_song(v, k) for k in kept_all)


members = {}
for i in range(10):
    if i == 4:
        continue
    keep = []
    for t in frozen[i]["tracks"]:
        v = t["id"]
        if usable(v) and not is_dup(v):
            keep.append(v)
            kept_all.append(v)
    members[i] = keep

# classic rock & oldies: seeds first, then nearest neighbours of the seed centroid
used = set(kept_all)
seeds = [v for v in brain if v not in used and usable(v) and brain[v]["lang"] == "en"
         and SEED.search(brain[v]["file"]) and not NOT_CLASSIC.search(brain[v]["file"])]
cen = E[[ix[v] for v in seeds]].mean(0)
cen /= np.linalg.norm(cen)
classic = []
for v in seeds + sorted((v for v in brain if v not in used and v not in seeds and usable(v) and brain[v]["lang"] == "en"
                         and not NOT_CLASSIC.search(brain[v]["file"])), key=lambda v: -float(E[ix[v]] @ cen)):
    if len(classic) >= 36:
        break
    if not is_dup(v) and not any(same_song(v, c) for c in classic):
        classic.append(v)
members[4] = classic
kept_all += classic

# top up short playlists with the nearest unused songs of the same language group
for i in range(10):
    tr = NAMES[i][1]
    while len(members[i]) < MIN_LEN:
        c = E[[ix[v] for v in members[i]]].mean(0)
        pool = [v for v in brain if usable(v) and not is_dup(v) and ((brain[v]["lang"] == "tr" and brain[v]["lang_p"] >= 0.5) == tr)
                and v not in members[i]]
        if not pool:
            break
        best = max(pool, key=lambda v: float(E[ix[v]] @ c))
        members[i].append(best)
        kept_all.append(best)

# ---------------------------------------------------------------------------------------------- write
imp, detail = {}, []
for i in range(10):
    route = order(members[i][:MAX_LEN])
    name, tr = NAMES[i]
    entries, tracks = [], []
    for k, v in enumerate(route):
        s = brain[v]
        m = int(round(s["duration"] or 0))
        entries.append({"title": title_of(v), "url": f"https://www.youtube.com/watch?v={v}", "duration": f"{m // 60}:{m % 60:02d}",
                        "source_type": "youtube", "thumbnail": f"https://i.ytimg.com/vi/{v}/hqdefault.jpg"})
        nxt = brain[route[k + 1]] if k + 1 < len(route) else None
        steps = camelot_steps(s["camelot"], nxt["camelot"]) if nxt else None
        tracks.append({"id": v, "title": title_of(v), "bpm": s["bpm"], "camelot": s["camelot"], "energy": s["energy"],
                       "mix_in": s["mix_in"], "mix_out": s["mix_out"], "drop_in": s.get("drop_in"),
                       "next": {"key_steps": steps, "bpm_gap": round(tempo_gap(s["bpm"], nxt["bpm"]), 3)} if nxt else None})
    imp[name] = entries
    bpms = [t["bpm"] for t in tracks]
    detail.append({"name": name, "turkish": tr, "count": len(tracks),
                   "rules": {"bpm_range": [round(min(bpms)), round(max(bpms))], "median_bpm": round(float(np.median(bpms))),
                             "arc": "warm up -> peak -> breather -> peak (realdj.energy_target shape)",
                             "key_flow": "camelot steps <= 1 where possible"}, "tracks": tracks})
    print(f"{'TR' if tr else '  '} {name:<40} {len(entries)} songs")
json.dump({"guild": "huddle:kitchen-table", "shared": imp}, open(F + "playlists_import.json", "w"), ensure_ascii=False, indent=1)
json.dump({"frozen": True, "playlists": detail}, open(F + "playlists_detail.json", "w"), ensure_ascii=False)
all_ids = [t["id"] for d in detail for t in d["tracks"]]
print("total", len(all_ids), "unique", len(set(all_ids)))
print("\nclassic playlist:", "; ".join(t["title"][:34] for t in detail[4]["tracks"]))
