"""Turn Gemini's raw DJ notes into dj_plans.json: beat-aligned, checked, with several options per song.

  python3 build_dj_plans.py [--model gemini-3.5-flash-lite] [--export]

Reads  ~/dj-analysis/out/gemini/<model>/<id>.json  and  out/dj_brain.json (our measured beat grid and phrase energies).
Writes ~/dj-analysis/out/dj_plans.json, and with --export also <musicbot>/dj_brain/plans.json (what the bot reads).

What is done to each song:
  * every time Gemini gave is snapped to our beat grid: a phrase start when it is within 2.5 s of one, otherwise the
    nearest bar (cues, loops) or beat (moves, hooks). Gemini hears music but counts seconds roughly.
  * the notes are checked against what the software measured: do Gemini's chorus / drop sections sit on our
    high-energy phrases, and do its section boundaries land on our phrase boundaries? That gives `trust`
    ("high" | "ok" | "low"). The DJ only uses notes it can trust, and a song flagged broken is never used.
  * invalid items (outside the song, wrong order, unknown kinds) are dropped, not repaired.
Nothing here is recomputed later: the output is a plain file, and a missing or low-trust song just plays the old way.
"""
import argparse
import json
import os
import sys
import time

ROOT = "/home/coxaexs/dj-analysis"
BOT_DIR = os.environ.get("DJ_BRAIN_DIR") or "/mnt/harddisk/data/bot/musicbot-main/dj_brain"
PHRASE_SNAP = 2.5          # seconds: a time this close to one of our phrase starts becomes that phrase start
MOVES = {"roll", "slip_loop", "sweep", "riser", "echo", "flanger", "scratch", "rewind", "hook_repeat"}
TRANSITIONS = {"blend", "fade", "filter", "echo", "cut", "brake", "spinback", "stem_swap", "acapella", "drum_bridge",
               "mashup", "loop_roll"}
HIGH_LABELS = {"chorus", "drop"}
QUIET_LABELS = {"intro", "verse", "break", "outro"}


class Grid:
    """The measured beat grid of one song: phrase starts (seconds) and a constant bar / beat length."""

    def __init__(self, song):
        self.bpm = song["bpm"]
        self.per_bar = song["beats_per_bar"]
        self.beat = 60.0 / self.bpm
        self.bar = self.beat * self.per_bar
        self.duration = song["duration"]
        self.phrases = [s["at"] for s in song["sections"]]
        self.energy = [s["energy"] for s in song["sections"]]
        self.first = song["first_downbeat"]

    def nearest_phrase(self, t):
        return min(self.phrases, key=lambda p: abs(p - t)) if self.phrases else None

    def snap(self, t, unit="bar"):
        """(seconds on the grid, 'phrase' | 'bar' | 'beat')."""
        p = self.nearest_phrase(t)
        if unit != "beat" and p is not None and abs(p - t) <= PHRASE_SNAP:
            return round(p, 2), "phrase"
        anchor = p if p is not None else self.first
        step = self.beat if unit == "beat" else self.bar
        return round(anchor + round((t - anchor) / step) * step, 2), unit

    def energy_at(self, t):
        best = 0.0
        for start, e in zip(self.phrases, self.energy):
            if start <= t + 0.01:
                best = e
        return best


def number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and x == x


def trust_of(result, grid):
    """'high' | 'ok' | 'low' and the numbers behind it."""
    if result.get("broken"):
        return "low", {"why": "gemini flagged the audio as broken"}
    sections = [s for s in result.get("sections", []) if number(s.get("start")) and number(s.get("end"))]
    if len(sections) < 3 or not grid.phrases:
        return "low", {"why": "too few sections"}
    mid = lambda s: (s["start"] + s["end"]) / 2
    high = [grid.energy_at(mid(s)) for s in sections if s.get("label") in HIGH_LABELS]
    quiet = [grid.energy_at(mid(s)) for s in sections if s.get("label") in QUIET_LABELS]
    contrast = (sum(high) / len(high) - sum(quiet) / len(quiet)) if high and quiet else 0.0
    starts = [s["start"] for s in sections[1:]]
    aligned = sum(abs(grid.nearest_phrase(t) - t) <= PHRASE_SNAP for t in starts) / max(1, len(starts))
    ok_range = all(0 <= s["start"] <= grid.duration + 3 for s in sections)
    score = 0.6 * max(0.0, min(1.0, contrast / 0.3)) + 0.4 * aligned
    level = "high" if score >= 0.6 and ok_range else "ok" if score >= 0.35 and ok_range else "low"
    return level, {"contrast": round(contrast, 2), "aligned": round(aligned, 2), "score": round(score, 2)}


def points(items, grid, unit="bar"):
    """Entries / exits: snapped, in range, one per character, with only known styles."""
    out, seen = [], set()
    for item in items or []:
        t = item.get("at")
        if not number(t) or not 0 <= t <= grid.duration - 5:
            continue
        at, kind = grid.snap(t, unit)
        styles = [s for s in item.get("styles", []) if s in TRANSITIONS]
        if item.get("character") in seen or not styles:
            continue
        seen.add(item["character"])
        out.append({"character": item["character"], "at": at, "grid": kind, "raw": round(t, 1), "styles": styles,
                    "why": str(item.get("why", ""))[:160]})
    return sorted(out, key=lambda x: x["at"])


def build_song(result, song):
    grid = Grid(song)
    trust, detail = trust_of(result, grid)
    moves = []
    for m in result.get("moves", []):
        if number(m.get("at")) and 0 <= m["at"] <= grid.duration - 3 and m.get("type") in MOVES:
            at, kind = grid.snap(m["at"], "beat")
            moves.append({"at": at, "type": m["type"], "why": str(m.get("why", ""))[:140]})
    loops = []
    for l in result.get("loops", []):
        if number(l.get("start")) and 0 <= l["start"] <= grid.duration - 3 and l.get("bars") in (1, 2, 4, 8):
            at, _ = grid.snap(l["start"], "bar")
            loops.append({"at": at, "bars": l["bars"], "why": str(l.get("why", ""))[:120]})
    hooks = []
    for h in result.get("hooks", []):
        if number(h.get("start")) and number(h.get("end")) and 0 <= h["start"] < h["end"] <= grid.duration + 2:
            hooks.append({"at": grid.snap(h["start"], "beat")[0], "length": round(min(8.0, h["end"] - h["start"]), 1),
                          "what": str(h.get("what", ""))[:100]})
    avoid = [{"start": a["start"], "end": a["end"], "why": str(a.get("why", ""))[:100]} for a in result.get("avoid", [])
             if number(a.get("start")) and number(a.get("end")) and a["start"] < a["end"]]
    return {
        "trust": trust, "check": detail, "broken": bool(result.get("broken")), "issues": [str(i)[:120] for i in result.get("issues", [])][:6],
        "summary": str(result.get("summary", ""))[:200], "genres": result.get("genres", [])[:3], "moods": result.get("moods", [])[:3],
        "language": result.get("language"), "vocals": result.get("vocals"),
        "entries": points(result.get("entries"), grid), "exits": points(result.get("exits"), grid),
        "moves": sorted(moves, key=lambda x: x["at"]), "loops": sorted(loops, key=lambda x: x["at"]),
        "hooks": sorted(hooks, key=lambda x: x["at"]), "avoid": avoid[:6],
        "sections": [{"label": s.get("label"), "start": round(s["start"], 1), "end": round(s["end"], 1), "energy": s.get("energy")}
                     for s in result.get("sections", []) if number(s.get("start")) and number(s.get("end"))],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="gemini-3.5-flash-lite,gemini-3.1-flash-lite", help="best first; each song uses the first model that has it")
    ap.add_argument("--export", action="store_true")
    args = ap.parse_args()
    brain = json.load(open(f"{ROOT}/out/dj_brain.json"))["songs"]
    models = args.models.split(",")
    songs, skipped = {}, 0
    for model in models:
        folder = f"{ROOT}/out/gemini/{model}"
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            vid = name[:-5]
            if not name.endswith(".json") or vid not in brain or vid in songs:
                continue
            try:
                raw = json.load(open(f"{folder}/{name}"))["result"]
                songs[vid] = dict(build_song(raw, brain[vid]), model=model)
            except Exception as error:                  # one odd answer must not stop the rest
                skipped += 1
                print("skipped", vid, error)
    trust = {k: sum(1 for s in songs.values() if s["trust"] == k) for k in ("high", "ok", "low")}
    out = {"version": 1, "models": models, "made": time.strftime("%Y-%m-%d"), "count": len(songs), "trust": trust, "songs": songs}
    path = f"{ROOT}/out/dj_plans.json"
    json.dump(out, open(path + ".tmp", "w"), ensure_ascii=False)
    os.replace(path + ".tmp", path)
    print(f"{len(songs)} songs ({skipped} skipped), trust {trust}, {os.path.getsize(path) // 1024} KB -> {path}")
    if args.export:
        os.makedirs(BOT_DIR, exist_ok=True)
        light = {v: s for v, s in songs.items() if s["trust"] != "low" or s["broken"]}      # low-trust notes are not used
        for s in light.values():
            s.pop("sections", None)                       # the bot does not need them
        target = f"{BOT_DIR}/plans.json"
        json.dump({"version": 1, "models": models, "made": out["made"], "songs": light}, open(target + ".tmp", "w"), ensure_ascii=False)
        os.replace(target + ".tmp", target)
        print(f"exported {len(light)} songs to {target}")


if __name__ == "__main__":
    main()
