"""Three AI-planned "FLAC" playlists from the songs split on Colab, built to be DJ'ed.

  python3 plan_flac_playlists.py plan       ask Gemini, write ~/dj-analysis/flac-playlists/plan.json (review it)
  python3 plan_flac_playlists.py install    add the playlists + their transitions to the bot (room kitchen-table)

What goes into each playlist:
  1. Gemini groups the songs into three vibes and names them (" FLAC" is appended to every name).
  2. Each list is ordered here, not by the AI: harmonic (Camelot) and tempo compatibility between neighbours,
     how alike they sound (CLAP), and an energy arc (warm-up, peak, breather, peak, landing).
  3. For every neighbouring pair Gemini plans the transition from both songs' phrase maps (energy, vocals, big
     sections, hooks) and its own listening notes: where to leave A, where to enter B, the room player's AutoMix
     transition (volume / EQ / filter / effects / loop lanes, bars) and the DJ booth's style.
  4. Every plan is checked: cut points snapped to phrase starts that exist, in the right half of each song, with
     room for the mix; styles that clash with the keys or tempos are swapped for safe ones; nothing invented.
Inputs: songs.json (the 100), out/dj_brain_local.json (local_facts.py), the bot's dj_brain/plans.json (Gemini's
listening notes), dj_brain/emb.npy + ids.json (CLAP). Key: DJ_API_GEMINI in ~/huddle/.dev.vars (never printed).
"""
import json
import math
import os
import random
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.expanduser("~/dj-analysis")
WORK = os.path.join(ROOT, "flac-playlists")
BOT = "/mnt/harddisk/data/bot/musicbot-main"
ROOM = os.environ.get("PLAYLIST_ROOM", "huddle:kitchen-table")    # playlists belong to one room
MODEL = os.environ.get("PLAN_MODEL", "gemini-3.8-flash")       # 4 calls in all: a strong model is affordable
SIZE = (22, 44)                     # songs per playlist: a coherent vibe matters more than equal lists
NOT_A_SONG = re.compile(r"\b(\d+|one|bir)\s*(hour|hr|saat)s?\b|for studying|full album|compilation|playlist mix",
                        re.I)
BASE = "https://generativelanguage.googleapis.com/v1beta"

BOOTH_STYLES = ["blend", "fade", "filter", "echo", "cut", "brake", "spinback", "stem_swap", "acapella",
                "drum_bridge", "mashup", "loop_roll", "guitar_ride"]
OVERLAPPING = {"blend", "fade", "filter", "stem_swap", "acapella", "mashup", "guitar_ride", "drum_bridge"}
TONAL = {"blend", "stem_swap", "acapella", "mashup", "guitar_ride"}       # melodies overlap: keys must agree
sys.path.insert(0, BOT)
import mixer  # noqa: E402

LANES = {name: list(options) for name, options in mixer.LANES.items()}


# ---------------------------------------------------------------- data

def load(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def songs_with_facts():
    songs = load(os.path.join(WORK, "songs.json"), [])
    local = load(os.path.join(ROOT, "out", "dj_brain_local.json"), {})
    notes = (load(os.path.join(BOT, "dj_brain", "plans.json"), {}) or {}).get("songs", {})
    out = []
    for s in songs:
        sid = s.get("yt") or s["digest"]
        f = local.get(sid)
        if not f:
            print("no facts for", s["title"], "- left out")
            continue
        n = notes.get(sid) or {}
        if NOT_A_SONG.search(s["title"]):
            print("not a song (a long compilation), left out:", s["title"])
            continue
        s["title"] = re.sub(r"^\s*\[[^\]]*\]\s*", "", s["title"]).strip()      # "[Playlist] Andrea Bocelli ..."
        if s["title"].strip().lower() in ("unknown title", "unknown") and s.get("yt"):
            s["title"] = youtube_title(s["yt"]) or s["title"]
        out.append({**s, "id": sid, "facts": f, "notes": n if not n.get("broken") else {}})
    # The same song under two uploads ("Teoman - Paramparça" / "teoman - Paramparça"): keep one.
    kept = {}
    for song in out:
        key = same_song_key(song["title"])
        best = kept.get(key)
        if best is None or (song["facts"].get("guitar_stems"), song.get("plays", 0)) > \
                (best["facts"].get("guitar_stems"), best.get("plays", 0)):
            if best is not None:
                print("duplicate, kept one:", best["title"], "/", song["title"])
            kept[key] = song
        else:
            print("duplicate, kept one:", best["title"], "/", song["title"])
    return list(kept.values())


def same_song_key(title):
    t = title.lower()
    t = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", t)
    t = re.sub(r"\b(official|music|video|audio|lyrics?|hd|hq|remaster(ed)?|\d{4})\b", " ", t)
    return re.sub(r"[^\w]+", " ", t).strip()


def youtube_title(vid):
    try:
        out = subprocess.run([os.path.join(BOT, "env", "bin", "yt-dlp"), "--skip-download", "--print", "title",
                              "--no-warnings", "https://www.youtube.com/watch?v=" + vid],
                             capture_output=True, text=True, timeout=60)
        return out.stdout.strip() or None
    except Exception:  # noqa: BLE001
        return None


def similarity():
    try:
        import numpy as np
        ids = load(os.path.join(BOT, "dj_brain", "ids.json"), [])
        emb = np.load(os.path.join(BOT, "dj_brain", "emb.npy")).astype("float32")
        emb /= np.linalg.norm(emb, axis=1, keepdims=True) + 1e-9
        row = {vid: i for i, vid in enumerate(ids)}
        return lambda a, b: float(emb[row[a]] @ emb[row[b]]) if a in row and b in row else None
    except Exception:  # noqa: BLE001
        return lambda a, b: None


def camelot_distance(a, b):
    m1, m2 = re.fullmatch(r"(\d+)([AB])", a or ""), re.fullmatch(r"(\d+)([AB])", b or "")
    if not m1 or not m2:
        return 3
    n1, l1, n2, l2 = int(m1.group(1)), m1.group(2), int(m2.group(1)), m2.group(2)
    step = min((n1 - n2) % 12, (n2 - n1) % 12)
    return step + (0 if l1 == l2 else 1) if step or l1 != l2 else 0


def tempo_gap(a, b):
    """Smallest relative tempo difference allowing half / double time."""
    if not a or not b:
        return 1.0
    return min(abs(math.log(a / (b * f))) for f in (0.5, 1, 2))


# ---------------------------------------------------------------- Gemini

def api_key():
    for line in open(os.path.expanduser("~/huddle/.dev.vars")):
        if line.startswith("DJ_API_GEMINI="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("DJ_API_GEMINI is not in ~/huddle/.dev.vars")


def gemini(prompt, schema, temperature=0.4):
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema,
                                 "temperature": temperature, "maxOutputTokens": 65536,
                                 # Thinking models spend output tokens on thought: cap it so the answer fits.
                                 "thinkingConfig": {"thinkingBudget": 8192}}}
    req = urllib.request.Request(f"{BASE}/models/{MODEL}:generateContent", data=json.dumps(body).encode(),
                                 method="POST", headers={"Content-Type": "application/json", "x-goog-api-key": api_key()})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=300) as response:
                data = json.loads(response.read())
            candidate = data["candidates"][0]
            text = "".join(p.get("text", "") for p in candidate["content"]["parts"] if not p.get("thought"))
            if candidate.get("finishReason") == "MAX_TOKENS":
                print("Gemini ran out of output tokens, trying again")
                raise ValueError("cut off")
            return json.loads(text)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:300]
            if error.code in (429, 500, 503) and attempt < 4:
                time.sleep(20 * (attempt + 1))
                continue
            raise RuntimeError(f"Gemini {error.code}: {detail}") from None
        except (KeyError, IndexError, ValueError):
            if attempt < 4:
                time.sleep(5)
                continue
            raise
    raise RuntimeError("Gemini gave no answer")


def song_line(s):
    f, n = s["facts"], s["notes"]
    bits = [s["id"], s["title"], f"{f['bpm']:.0f}bpm", f.get("camelot") or "?", f"energy {f.get('energy') or 0:.2f}"]
    if n:
        bits += [n.get("language") or "", "/".join(n.get("genres", [])[:3]), "/".join(n.get("moods", [])[:3]),
                 (n.get("summary") or "")[:120]]
    return " | ".join(b for b in bits if b)


def group(songs):
    schema = {"type": "OBJECT", "properties": {"playlists": {"type": "ARRAY", "items": {
        "type": "OBJECT", "properties": {"name": {"type": "STRING"}, "description": {"type": "STRING"},
                                         "ids": {"type": "ARRAY", "items": {"type": "STRING"}}},
        "required": ["name", "description", "ids"]}}}, "required": ["playlists"]}
    lo, hi = SIZE
    prompt = (
        "You are an experienced club and radio DJ curating for a group of friends in Turkey (they listen to Turkish "
        f"and English music). Split ALL {len(songs)} of these songs into exactly 3 playlists of {lo} to {hi} songs "
        "each. Each playlist must have one coherent vibe a DJ could play as a continuous set: genre and sound first "
        "(e.g. Turkish rock/alternative, guitar indie/alt-rock, pop/dance/electronic/hip-hop), then mood, language "
        "and energy. Coherence matters more than equal sizes: a song only goes in a list where it truly belongs (no "
        "English pop ballads in a Turkish rock list, no indie guitar songs in a club list). Do not call a list "
        "electronic or club if it is mostly guitar music, and vice versa: the name must describe what is really "
        "in it. Every song id must appear in exactly one playlist. Give each playlist a short, evocative name (2-4 "
        "words; Turkish if the list is mostly Turkish, else English; no emoji, do not add the word FLAC) and a "
        "one-line description in the same language.\n\n"
        "Songs (id | title | tempo | key | energy | language | genres | moods | summary):\n"
        + "\n".join(song_line(s) for s in songs))
    known = {s["id"] for s in songs}
    for attempt in range(3):
        lists = gemini(prompt, schema, temperature=0.5)["playlists"][:3]
        seen = set()
        for p in lists:
            p["ids"] = [i for i in p["ids"] if i in known and not (i in seen or seen.add(i))]
        for s in songs:                                       # anything Gemini dropped: the smallest list
            if s["id"] not in seen:
                min(lists, key=lambda p: len(p["ids"]))["ids"].append(s["id"])
        sizes = [len(p["ids"]) for p in lists]
        if len(lists) == 3 and all(lo <= n <= hi for n in sizes):
            return lists
        print("sizes", sizes, "- asking again")
        prompt += (f"\n\nYour previous answer had playlist sizes {sizes}. Every playlist must have between {lo} "
                   f"and {hi} songs; move the songs that fit two vibes to the smaller list.")
    return lists


# ---------------------------------------------------------------- order (not AI: measurable)

def pair_score(a, b, sim):
    fa, fb = a["facts"], b["facts"]
    keys = camelot_distance(fa.get("camelot"), fb.get("camelot"))
    gap = tempo_gap(fa["bpm"], fb["bpm"])
    score = {0: 1.0, 1: 0.7, 2: -0.2}.get(keys, -0.8)
    score += 1.2 if gap <= 0.03 else 0.7 if gap <= 0.06 else 0.0 if gap <= 0.1 else -1.6
    s = sim(a.get("yt"), b.get("yt"))
    if s is not None:
        score += 0.8 * (s - 0.5)
    return score


def arc(n):
    """Target energy over a set: warm up, peak, breather, bigger peak, land."""
    points = [(0.0, 0.35), (0.3, 0.75), (0.5, 0.55), (0.8, 0.95), (1.0, 0.6)]
    out = []
    for i in range(n):
        x = i / max(1, n - 1)
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            if x0 <= x <= x1:
                out.append(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
                break
    return out


def order(members, sim, seed=7):
    """Best neighbour fit + energy arc, by randomized greedy starts and 2-opt."""
    if len(members) < 3:
        return members
    energies = [m["facts"].get("energy") or 0.5 for m in members]
    lo, hi = min(energies), max(energies)
    norm = {m["id"]: ((m["facts"].get("energy") or 0.5) - lo) / ((hi - lo) or 1) for m in members}
    target = arc(len(members))
    score = {(a["id"], b["id"]): pair_score(a, b, sim) for a in members for b in members if a is not b}

    def total(seq):
        return (sum(score[(x["id"], y["id"])] for x, y in zip(seq, seq[1:]))
                - 1.0 * sum(abs(norm[x["id"]] - t) for x, t in zip(seq, target)))
    rng = random.Random(seed)
    best, best_total = None, -1e9
    for _ in range(60):
        left = members[:]
        rng.shuffle(left)
        seq = [min(left, key=lambda m: abs(norm[m["id"]] - target[0]) + rng.random() * 0.2)]
        left.remove(seq[0])
        while left:
            i = len(seq)
            nxt = max(left, key=lambda m: score[(seq[-1]["id"], m["id"])] - 1.0 * abs(norm[m["id"]] - target[i])
                      + rng.random() * 0.3)
            seq.append(nxt)
            left.remove(nxt)
        improved = True
        while improved:
            improved = False
            for i in range(1, len(seq) - 1):
                for j in range(i + 1, len(seq)):
                    cand = seq[:i] + seq[i:j + 1][::-1] + seq[j + 1:]
                    if total(cand) > total(seq) + 1e-9:
                        seq, improved = cand, True
        t = total(seq)
        if t > best_total:
            best, best_total = seq, t
    return best


# ---------------------------------------------------------------- transitions

def phrase_map(f, part):
    """The phrase starts of one half of a song: 'time (energy, vocals, BIG)'."""
    rows = f["phrases"]
    half = len(rows) // 2
    rows = rows[half - 1:] if part == "end" else rows[:half + 1]
    out = []
    for p in rows:
        bits = [f"{p['at']:.1f}s", f"e{p['energy']:.2f}"]
        if p.get("vocals") is not None:
            bits.append(f"v{p['vocals']:.2f}")
        if p.get("guitar") is not None:
            bits.append(f"g{p['guitar']:.2f}")
        if p.get("big"):
            bits.append("BIG")
        out.append(" ".join(bits))
    return "; ".join(out)


def song_block(s, part):
    f, n = s["facts"], s["notes"]
    lines = [f"{s['title']} — {f['bpm']:.1f} bpm, key {f.get('camelot') or '?'}, {f['duration']:.0f}s, "
             f"music ends {f.get('music_end') or f['duration']:.0f}s"
             + (", has guitar/piano stems" if f.get("guitar_stems") else "")]
    lines.append(f"  phrases ({'second half' if part == 'end' else 'first half'}): " + phrase_map(f, part))
    key = "exits" if part == "end" else "entries"
    if n.get(key):
        lines.append(f"  its own {key} (listening notes): " + "; ".join(
            f"{e['at']:.1f}s {e.get('character')} [{','.join(e.get('styles', []))}] {e.get('why', '')[:80]}"
            for e in n[key]))
    if part == "end" and f.get("hooks"):
        lines.append("  vocal hooks at: " + ", ".join(f"{h['at']:.1f}s" for h in f["hooks"][:4]))
    if n.get("summary"):
        lines.append("  sounds like: " + n["summary"][:140])
    return "\n".join(lines)


def plan_transitions(seq, title):
    item = {"type": "OBJECT", "properties": {
        "index": {"type": "INTEGER"}, "out_at": {"type": "NUMBER"}, "in_at": {"type": "NUMBER"},
        "booth": {"type": "STRING", "enum": BOOTH_STYLES}, "booth_beats": {"type": "INTEGER"},
        "bars": {"type": "INTEGER"},
        **{lane: {"type": "STRING", "enum": LANES[lane]} for lane in LANES},
        "why": {"type": "STRING"}},
        "required": ["index", "out_at", "in_at", "booth", "booth_beats", "bars", *LANES, "why"]}
    schema = {"type": "OBJECT", "properties": {"transitions": {"type": "ARRAY", "items": item}},
              "required": ["transitions"]}
    pairs = []
    for i, (a, b) in enumerate(zip(seq, seq[1:])):
        fa, fb = a["facts"], b["facts"]
        pairs.append(
            f"### Transition {i}: \"{a['title']}\" -> \"{b['title']}\"\n"
            f"tempo gap {tempo_gap(fa['bpm'], fb['bpm']) * 100:.0f}% (half/double time allowed), "
            f"key distance {camelot_distance(fa.get('camelot'), fb.get('camelot'))} on the Camelot wheel\n"
            f"OUTGOING {song_block(a, 'end')}\nINCOMING {song_block(b, 'start')}")
    prompt = (
        f"You are a world-class DJ planning every transition of the set \"{title}\" so it sounds hand-mixed. "
        "For each transition choose:\n"
        "- out_at: the second where the outgoing song starts mixing out. Use one of its phrase start times listed "
        "(or one of its own exits). Prefer leaving after a big section, not cutting a chorus or a sung line in "
        "half; keep at least the mix length before its music ends.\n"
        "- in_at: the second where the incoming song comes in. Use one of its listed phrase start times (or its own "
        "entries): usually an intro or the phrase before its first BIG section so the mix builds into it; enter on a "
        "BIG phrase only for a deliberate drop.\n"
        "- bars (2, 4, 8 or 16) and the five lanes for the room player's automatic mix: volume, eq, filter, effects, "
        "loop. Match them to the music: long blends with a bass swap for compatible tempos and keys; filters and "
        "echo/reverb tails to hide clashing keys; a fast cut or echo out for big tempo gaps; loops only on steady "
        "rhythmic outros.\n"
        "- booth (style for the live DJ booth) and booth_beats (4, 8, 16 or 32). Overlapping melodic styles (blend, "
        "stem_swap, acapella, mashup, guitar_ride) need compatible keys (distance 0-1) and tempos within ~6%; "
        "drum_bridge for clashing keys at close tempos; echo, cut, brake, spinback or loop_roll when tempos are far "
        "apart. acapella/mashup only when the outgoing song sings at out_at (v value high) and the incoming has "
        "little vocal at in_at. guitar_ride only when the outgoing song has guitar/piano stems and a strong guitar "
        "(g value) and little vocal at out_at.\n"
        "- why: one short sentence.\n"
        "Phrase entries read 'time eENERGY vVOCALS gGUITAR BIG' (0-1 shares; BIG = loud section).\n"
        "Return one object per transition, with its index.\n\n" + "\n\n".join(pairs))
    return gemini(prompt, schema, temperature=0.35)["transitions"]


def nearest_phrase(f, t, part):
    rows = [p["at"] for p in f["phrases"]]
    if not rows:
        return None
    half = f["duration"] / 2
    # Leave a song in its second half (short songs: after 40%); enter in its first half.
    floor = f["duration"] * (0.55 if f["duration"] >= 120 else 0.4)
    pool = [r for r in rows if (r >= floor if part == "out" else r <= half * 1.2)] or rows
    return min(pool, key=lambda r: abs(r - t))


def check(t, a, b):
    """Make a planned transition safe: real phrase starts, room for the mix, styles that fit."""
    fa, fb = a["facts"], b["facts"]
    keys = camelot_distance(fa.get("camelot"), fb.get("camelot"))
    gap = tempo_gap(fa["bpm"], fb["bpm"])
    notes = []
    bars = t.get("bars") if t.get("bars") in (2, 4, 8, 16) else 8
    bar = 240.0 / fa["bpm"]
    end = min(fa.get("music_end") or fa["duration"], fa["duration"])
    out_at = nearest_phrase(fa, float(t.get("out_at") or 0), "out")
    while out_at is not None and out_at + bars * bar > end and bars > 2:
        bars //= 2
    if out_at is None or out_at + bars * bar > end:
        out_at = None
        notes.append("exit dropped (no room)")
    in_at = nearest_phrase(fb, float(t.get("in_at") or 0), "in")
    booth = t.get("booth") if t.get("booth") in BOOTH_STYLES else "blend"
    if booth in TONAL and (keys > 1 or gap > 0.06):
        booth = "drum_bridge" if gap <= 0.06 else "echo"
        notes.append(f"booth {t.get('booth')} -> {booth} (keys {keys}, tempo {gap * 100:.0f}%)")
    if booth in OVERLAPPING and gap > 0.1:
        booth = "echo"
        notes.append("booth -> echo (tempo gap)")
    if booth == "guitar_ride" and not fa.get("guitar_stems"):
        booth = "stem_swap"
        notes.append("guitar_ride without guitar stems -> stem_swap")
    booth_beats = t.get("booth_beats") if t.get("booth_beats") in (4, 8, 16, 32) else 16
    lanes = {lane: (t.get(lane) if t.get(lane) in LANES[lane] else mixer.PRESETS["fade"][lane]) for lane in LANES}
    if gap > 0.1 and lanes["volume"] == "overlay":
        lanes["volume"] = "fade_in_cut_out"
        notes.append("overlay at a big tempo gap -> fade in, cut out")
    spec = {"preset": "custom", "bars": bars, **lanes, "booth": booth, "booth_beats": booth_beats,
            "why": (t.get("why") or "")[:200]}
    if out_at is not None:
        spec["out_at"] = round(out_at, 2)
    if in_at is not None:
        spec["in_at"] = round(in_at, 2)
    return spec, notes


# ---------------------------------------------------------------- playlist entries

def entry(s):
    f = s["facts"]
    url = (f"https://www.youtube.com/watch?v={s['yt']}" if s.get("yt")
           else next((k for k in s["keys"] if k.startswith(("spotify:search:", "http"))), None)
           or "spotify:search:" + s["title"])
    dur = int(f["duration"])
    return {"title": s["title"], "url": url, "duration": f"{dur // 60}:{dur % 60:02d}",
            "source_type": "youtube" if s.get("yt") else "spotify",
            "thumbnail": f"https://i.ytimg.com/vi/{s['yt']}/hqdefault.jpg" if s.get("yt") else None}


def cmd_plan():
    songs = songs_with_facts()
    print(len(songs), "songs with facts")
    sim = similarity()
    by_id = {s["id"]: s for s in songs}
    lists = group(songs)
    plan = []
    for p in lists:
        members = [by_id[i] for i in p["ids"]]
        seq = order(members, sim)
        raw = {t["index"]: t for t in plan_transitions(seq, p["name"])}
        transitions = []
        for i, (a, b) in enumerate(zip(seq, seq[1:])):
            spec, notes = check(raw.get(i) or {}, a, b)
            transitions.append({"from": a["title"], "to": b["title"], "spec": spec, "fixes": notes,
                                "planned": bool(raw.get(i))})
        plan.append({"name": p["name"].strip() + " FLAC", "description": p["description"],
                     "songs": [entry(s) for s in seq], "digests": [s["digest"] for s in seq],
                     "transitions": transitions})
        print(f"\n== {p['name']} FLAC ({len(seq)} songs): {p['description']}")
        for i, t in enumerate(transitions):
            sp = t["spec"]
            print(f"  {i + 1:2d}. {t['from'][:32]:32s} -> {t['to'][:32]:32s} out {sp.get('out_at', '-')!s:>6} "
                  f"in {sp.get('in_at', '-')!s:>6} {sp['bars']:2d} bars {sp['booth']:11s}"
                  + (f"  fixed: {'; '.join(t['fixes'])}" if t["fixes"] else "") + ("" if t["planned"] else "  (no AI plan)"))
    json.dump(plan, open(os.path.join(WORK, "plan.json"), "w"), ensure_ascii=False, indent=1)
    print("\nwrote", os.path.join(WORK, "plan.json"))


def cmd_install():
    plan = load(os.path.join(WORK, "plan.json"))
    con = sqlite3.connect(os.path.join(BOT, "musicbot.sqlite3"), timeout=30)
    con.execute("BEGIN IMMEDIATE")                         # the bot writes this store too: hold it while we do
    row = con.execute("SELECT payload FROM documents WHERE key = 'music_playlists'").fetchone()
    lists = json.loads(row[0]) if row else {}
    mixes_row = con.execute("SELECT payload FROM documents WHERE key = 'playlist_mixes'").fetchone()
    mixes = json.loads(mixes_row[0]) if mixes_row else {}
    room = lists.setdefault(ROOM, {"shared": {}, "users": {}})
    shared = room.setdefault("shared", {})
    room_mixes = mixes.setdefault(ROOM, {}).setdefault("shared", {})
    for p in plan:
        if p["name"] in shared:
            print("exists already, left as is:", p["name"])
            continue
        shared[p["name"]] = p["songs"]
        transitions = {}
        for i, t in enumerate(p["transitions"]):
            transitions[f"{p['songs'][i]['url']}\n{p['songs'][i + 1]['url']}"] = t["spec"]
        room_mixes[p["name"]] = {"enabled": True, "transitions": transitions}
        print("added", p["name"], len(p["songs"]), "songs,", len(transitions), "planned transitions")
    now = time.time()
    for key, data in (("music_playlists", lists), ("playlist_mixes", mixes)):
        con.execute("INSERT INTO documents(key, payload, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE "
                    "SET payload=excluded.payload, updated_at=excluded.updated_at",
                    (key, json.dumps(data, ensure_ascii=False, separators=(",", ":")), now))
    con.commit()
    con.close()
    import stems                                           # keep these songs' stems for good
    stems.set_pins("flac-playlists", {d for p in plan for d in p["digests"]})
    print("pinned the songs' stems (reason flac-playlists)")


if __name__ == "__main__":
    {"plan": cmd_plan, "install": cmd_install}[sys.argv[1] if len(sys.argv) > 1 else "plan"]()
