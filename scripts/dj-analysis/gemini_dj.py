"""Ask Gemini to listen to each song and write DJ notes: quality check, tags, sections, hooks, loops, several ways in
and out, and where to touch the controls. Results are cached one file per song, so nothing is ever recomputed.

  python3 gemini_dj.py pilot <video id> [<video id> ...] --models gemini-2.5-flash-lite,gemini-2.5-flash
  python3 gemini_dj.py run --model gemini-2.5-flash-lite [--limit 50] [--max-tokens 9000000]

Reads the key (DJ_API_GEMINI) from ~/huddle/.dev.vars and never prints it. Audio is the small mono copy in
~/dj-analysis/full/<id>.mp3 (made by make_clips.py --full); song facts come from out/dj_brain.json.
Output: ~/dj-analysis/out/gemini/<model>/<id>.json  ({"result": ..., "usage": ..., "seconds": ...}).
"""
import argparse
import base64
import concurrent.futures
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request

ROOT = "/home/coxaexs/dj-analysis"
BASE = "https://generativelanguage.googleapis.com/v1beta"

TRANSITIONS = ["blend", "fade", "filter", "echo", "cut", "brake", "spinback", "stem_swap", "acapella", "drum_bridge",
               "mashup", "loop_roll"]
MOVES = ["roll", "slip_loop", "sweep", "riser", "echo", "flanger", "scratch", "rewind", "hook_repeat"]
SECTION_LABELS = ["intro", "verse", "prechorus", "chorus", "drop", "break", "bridge", "solo", "outro", "other"]
CHARACTERS = ["safe", "energetic", "creative"]


def _arr(props, required):
    return {"type": "ARRAY", "items": {"type": "OBJECT", "properties": props, "required": required,
                                         "propertyOrdering": list(props)}}


NUM, INT, STR, BOOL = {"type": "NUMBER"}, {"type": "INTEGER"}, {"type": "STRING"}, {"type": "BOOLEAN"}
ENTRY_EXIT = {"character": {"type": "STRING", "enum": CHARACTERS}, "at": NUM,
              "styles": {"type": "ARRAY", "items": {"type": "STRING", "enum": TRANSITIONS}}, "why": STR}
SCHEMA_PROPS = {
    "broken": BOOL,
    "issues": {"type": "ARRAY", "items": STR},
    "summary": STR,
    "genres": {"type": "ARRAY", "items": STR},
    "moods": {"type": "ARRAY", "items": STR},
    "language": STR,
    "vocals": {"type": "STRING", "enum": ["male", "female", "duet", "rap", "group", "instrumental", "mixed"]},
    "sections": _arr({"label": {"type": "STRING", "enum": SECTION_LABELS}, "start": NUM, "end": NUM, "energy": INT,
                      "vocals": BOOL}, ["label", "start", "end", "energy", "vocals"]),
    "hooks": _arr({"start": NUM, "end": NUM, "what": STR}, ["start", "end", "what"]),
    "loops": _arr({"start": NUM, "bars": INT, "why": STR}, ["start", "bars", "why"]),
    "entries": _arr(ENTRY_EXIT, ["character", "at", "styles", "why"]),
    "exits": _arr(ENTRY_EXIT, ["character", "at", "styles", "why"]),
    "moves": _arr({"at": NUM, "type": {"type": "STRING", "enum": MOVES}, "why": STR}, ["at", "type", "why"]),
    "avoid": _arr({"start": NUM, "end": NUM, "why": STR}, ["start", "end", "why"]),
}
SCHEMA = {"type": "OBJECT", "properties": SCHEMA_PROPS, "required": list(SCHEMA_PROPS), "propertyOrdering": list(SCHEMA_PROPS)}

PROMPT = """You are an expert club DJ preparing a music library for DJ software that mixes songs on two decks and can split any song into drums, bass and vocals. Listen to this song and write the notes the software needs.

Facts measured by software (trust them):
- duration {duration:.0f} s, about {bpm:.0f} BPM, {per_bar} beats per bar
- 8-bar phrases start at these seconds (energy 0 to 1 in brackets): {phrases}

Rules for every time: SECONDS from the start of this audio, one decimal, never beyond the duration. When something starts on a phrase boundary, use the phrase start time above.

1. broken: true only if the audio is cut off, mostly silent, badly distorted, not music (speech, a sound effect, a game recording) or loses sync with its own beat. List what is wrong in issues (empty if fine).
2. summary (one line), genres (up to 3, specific), moods (up to 3), language sung (ISO code like en, tr, or none), vocals.
3. sections: the whole song in order, with energy 1 to 10 and whether vocals are present.
4. hooks: up to 4 memorable moments of 1 to 8 seconds (the chorus hook, a sung tag) that sound good looped or stuttered.
5. loops: up to 4 stretches that loop cleanly (bars = 1, 2, 4 or 8): a steady drum groove or a sustained pad, preferably without vocals.
6. entries: exactly 3 places to START the song when it comes in as the new song, one each of character safe (cleanest beginning, usually the intro), energetic (just before the first big chorus or drop) and creative (something different: a second verse, the bridge, a breakdown). Give the transition styles that suit each, best first, from: {transitions}.
7. exits: exactly 3 places to LEAVE the song, one each of safe (the natural outro), energetic (right after the biggest chorus, cutting the song short) and creative (a breakdown, a drop, a key moment). Same style list.
8. moves: 4 to 10 moments where a DJ would touch the controls while the song plays. Types: roll (rapid repeat into a drop), slip_loop (loop a beat or bar), sweep (filter sweep), riser (build-up sound), echo (echo throw on the last word of a phrase), flanger (swirl in a calm part), scratch (on a vocal word), rewind (pull-up back a bar), hook_repeat (stutter a hook). Put each one where it really fits the music, not at an even spacing.
9. avoid: stretches where mixing in or out would sound bad (spoken intro, tempo or key change, silence, abrupt end).
Be specific and musical. Short reasons."""


def key():
    for line in open("/home/coxaexs/huddle/.dev.vars"):
        if line.startswith("DJ_API_GEMINI="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DJ_API_GEMINI not found in .dev.vars")


def brain():
    return json.load(open(f"{ROOT}/out/dj_brain.json"))["songs"]


def facts_prompt(song):
    phrases = "; ".join(f"{s['at']:.1f} ({s['energy']:.1f})" for s in song["sections"][:60])
    return PROMPT.format(duration=song["duration"], bpm=song["bpm"], per_bar=song["beats_per_bar"], phrases=phrases,
                         transitions=", ".join(TRANSITIONS))


class DailyLimit(Exception):
    """The free tier's per-day request quota is used up: stop, do not retry."""


_pace = threading.Lock()
_next_slot = [0.0]
RPM = [14]                                  # the free tier allows 15 requests a minute per model


def pace():
    """Wait for this request's turn so the whole run stays under the requests-per-minute limit."""
    with _pace:
        now = time.time()
        wait = max(0.0, _next_slot[0] - now)
        _next_slot[0] = max(now, _next_slot[0]) + 60.0 / RPM[0]
    if wait:
        time.sleep(wait)


def request(model, vid, song, api_key, thinking=None):
    audio = open(f"{ROOT}/full/{vid}.mp3", "rb").read()
    body = {"contents": [{"parts": [{"inline_data": {"mime_type": "audio/mpeg", "data": base64.b64encode(audio).decode()}},
                                     {"text": facts_prompt(song)}]}],
            "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA, "temperature": 0.4,
                                 "maxOutputTokens": 8192}}
    if thinking is not None:
        body["generationConfig"]["thinkingConfig"] = thinking
    req = urllib.request.Request(f"{BASE}/models/{model}:generateContent", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-goog-api-key": api_key})
    started = time.time()
    for attempt in range(6):
        pace()
        try:
            with urllib.request.urlopen(req, timeout=240) as response:
                data = json.loads(response.read())
            break
        except urllib.error.HTTPError as error:
            text = error.read().decode("utf-8", "replace")
            if error.code == 429 and "PerDay" in text:
                raise DailyLimit(text[:200])
            if error.code in (429, 500, 502, 503, 504) and attempt < 5:
                time.sleep(min(60, 4 * 2 ** attempt))
                continue
            raise RuntimeError(f"HTTP {error.code}: {text[:300]}")
        except (urllib.error.URLError, TimeoutError):
            if attempt == 5:
                raise
            time.sleep(4 * 2 ** attempt)
    candidate = (data.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in (candidate.get("content") or {}).get("parts", []))
    if not text:
        raise RuntimeError(f"empty answer, finishReason={candidate.get('finishReason')} {str(data.get('promptFeedback'))[:200]}")
    return json.loads(text), data.get("usageMetadata", {}), round(time.time() - started, 1), candidate.get("finishReason")


def thinking_for(model):
    """Thinking costs output tokens and these notes do not need it."""
    if model.startswith("gemini-2.5"):
        return {"thinkingBudget": 0} if "pro" not in model else None
    return None


BLOCKED_FILE = f"{ROOT}/out/gemini/blocked.json"


def load_blocked():
    """Songs Google refuses (PROHIBITED_CONTENT): asking again only wastes daily quota."""
    try:
        return json.load(open(BLOCKED_FILE))
    except (OSError, ValueError):
        return []


def mark_blocked(vid):
    ids = sorted(set(load_blocked()) | {vid})
    json.dump(ids, open(BLOCKED_FILE, "w"))


def save(model, vid, result, usage, seconds):
    folder = f"{ROOT}/out/gemini/{model}"
    os.makedirs(folder, exist_ok=True)
    tmp = f"{folder}/{vid}.json.tmp"
    json.dump({"result": result, "usage": usage, "seconds": seconds}, open(tmp, "w"), ensure_ascii=False)
    os.replace(tmp, f"{folder}/{vid}.json")


def summarize(result):
    return (f"broken={result.get('broken')} genres={result.get('genres')} moods={result.get('moods')} lang={result.get('language')} "
            f"sections={len(result.get('sections', []))} hooks={len(result.get('hooks', []))} loops={len(result.get('loops', []))} "
            f"entries={[(e['character'], e['at']) for e in result.get('entries', [])]} "
            f"exits={[(e['character'], e['at']) for e in result.get('exits', [])]} moves={len(result.get('moves', []))}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["pilot", "run"])
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--models", default="gemini-2.5-flash-lite")
    ap.add_argument("--model", default="gemini-2.5-flash-lite")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--rpm", type=int, default=14, help="requests per minute (free tier: 15)")
    ap.add_argument("--ids-file", help="JSON list of video ids to do first (then the rest, unless --only)")
    ap.add_argument("--redo", action="store_true", help="also redo songs that another model already did")
    ap.add_argument("--only", action="store_true", help="with --ids-file: do nothing else")
    ap.add_argument("--max-tokens", type=int, default=0, help="stop after this many total (prompt+output) tokens")
    args = ap.parse_args()
    RPM[0] = args.rpm
    api_key, songs = key(), brain()
    if args.mode == "pilot":
        for model in args.models.split(","):
            for vid in args.ids:
                try:
                    result, usage, seconds, finish = request(model, vid, songs[vid], api_key, thinking_for(model))
                    save(model, vid, result, usage, seconds)
                    print(f"\n== {model} {vid} {seconds}s finish={finish} tokens={usage}\n   {summarize(result)}")
                except Exception as error:
                    print(f"\n== {model} {vid} FAILED: {error}")
        return
    gem_dir = f"{ROOT}/out/gemini"
    if args.redo:                       # only this model's own results count as done
        have = {f[:-5] for f in os.listdir(f"{gem_dir}/{args.model}") if f.endswith(".json")} if os.path.isdir(f"{gem_dir}/{args.model}") else set()
    else:                               # a song done by ANY model is done (the plans builder merges them)
        have = {f[:-5] for d in os.listdir(gem_dir) if os.path.isdir(f"{gem_dir}/{d}") for f in os.listdir(f"{gem_dir}/{d}") if f.endswith(".json")}
    blocked = set(load_blocked())
    todo = [v for v in songs if v not in have and v not in blocked and os.path.exists(f"{ROOT}/full/{v}.mp3")]
    if args.ids_file:
        first = [v for v in json.load(open(args.ids_file)) if v in set(todo)]
        todo = first if args.only else first + [v for v in todo if v not in set(first)]
    if args.limit:
        todo = todo[:args.limit]
    print(len(todo), "songs to do with", args.model)
    spent, done, failed, lock, stop = [0], [0], [0], threading.Lock(), threading.Event()

    def work(vid):
        if stop.is_set():
            return
        try:
            result, usage, seconds, finish = request(args.model, vid, songs[vid], api_key, thinking_for(args.model))
            save(args.model, vid, result, usage, seconds)
            with lock:
                spent[0] += usage.get("totalTokenCount", 0)
                done[0] += 1
                if done[0] % 20 == 0:
                    print(f"{done[0]}/{len(todo)} done, {spent[0]:,} tokens, {failed[0]} failed", flush=True)
                if args.max_tokens and spent[0] >= args.max_tokens:
                    stop.set()
        except DailyLimit as error:
            print("DAILY QUOTA REACHED, stopping (run again tomorrow, finished songs are kept):", error, flush=True)
            stop.set()
        except Exception as error:
            if "PROHIBITED_CONTENT" in str(error):
                mark_blocked(vid)
            with lock:
                failed[0] += 1
            print(f"FAILED {vid}: {str(error)[:200]}", flush=True)

    with concurrent.futures.ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(work, todo))
    print(f"finished: {done[0]} done, {failed[0]} failed, {spent[0]:,} tokens" + (" (token cap reached)" if stop.is_set() else ""))


if __name__ == "__main__":
    main()
