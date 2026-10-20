#!/usr/bin/env bash
#
# How the stem upgrades are going (Oracle splits every song into high-quality
# stems plus guitar and piano; huddle-ops/failover/server/stems-sync.py brings
# them home).
#
#   scripts/check_stems.sh          done / left / working on now / time left,
#                                   and whether the DJ actually uses the results
#   scripts/check_stems.sh --days 3 look further back for "in use" (default 7)
#
# Read-only: it reads the sync's ledger, the bot's stems index and log, and
# asks Oracle (ssh oracle) what its worker is doing.

set -uo pipefail

DAYS=7
[[ "${1:-}" == "--days" && -n "${2:-}" ]] && DAYS="$2"

exec python3 - "$DAYS" <<'PY'
import glob, json, os, re, subprocess, sys, time
from datetime import datetime, timedelta

DAYS = float(sys.argv[1])
BOT = "/mnt/harddisk/data/bot/musicbot-main"
CACHE = os.path.join(BOT, "stems_cache")
STATE = os.path.expanduser("~/.local/state/hoffle-stems")
BOLD, DIM, GREEN, YELLOW, RED, END = ("\033[1m", "\033[2m", "\033[32m", "\033[33m", "\033[31m", "\033[0m") \
    if sys.stdout.isatty() else ("",) * 6


def load(path, fallback):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return fallback


def dur(seconds):
    seconds = int(max(0, seconds))
    if seconds >= 2 * 86400:
        return "%.1f days" % (seconds / 86400)
    if seconds >= 3600:
        return "%dh %02dm" % (seconds // 3600, seconds % 3600 // 60)
    return "%dm %02ds" % (seconds // 60, seconds % 60)


def ago(ts):
    return dur(time.time() - ts) + " ago"


def oracle(command):
    try:
        out = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "oracle", command],
                             capture_output=True, text=True, timeout=20)
        return out.stdout if out.returncode == 0 else None
    except Exception:
        return None


ledger = load(os.path.join(STATE, "ledger.json"), {})
index = load(os.path.join(CACHE, "index.json"), {"tracks": {}})
title_of = {}
for key, info in index.get("tracks", {}).items():
    if info and info.get("hash") and info.get("title"):
        title_of.setdefault(info["hash"], info["title"])

# ---------------------------------------------------------------- progress
remote = oracle("cat ~/hoffle-stems/progress.json; echo; echo ---; cat ~/hoffle-stems/status.json; echo; echo ---;"
                " ls ~/hoffle-stems/inbox; echo ---; systemctl is-active hoffle-stems; test -e ~/hoffle-backup/ACTIVE && echo SERVING; true")
progress, status, inbox, worker = {}, {}, [], "unknown"
if remote is not None:
    parts = remote.split("---")
    progress = json.loads(parts[0].strip() or "{}") if parts[0].strip().startswith("{") else {}
    status = json.loads(parts[1].strip() or "{}") if len(parts) > 1 and parts[1].strip().startswith("{") else {}
    inbox = [n[:-5] for n in (parts[2].split() if len(parts) > 2 else []) if n.endswith(".json")]
    tail = parts[3].split() if len(parts) > 3 else []
    worker = tail[0] if tail else "unknown"
    serving = "SERVING" in tail

done = {d: e for d, e in ledger.items() if not d.startswith("lib:") and e.get("status") == "done"}
total = progress.get("total")
print(BOLD + "Stem upgrades on Oracle" + END)
if total:
    left = max(0, total - len(done))
    pct = 100 * len(done) / total if total else 0
    bar = "#" * int(pct / 4) + "." * (25 - int(pct / 4))
    print("  done       %s%d%s / %d  [%s] %.1f%%" % (GREEN, len(done), END, total, bar, pct))
    print("  left       %d   (%d downloaded songs still without stems)" % (left, progress.get("library_left", 0)))
else:
    print("  done       %s%d%s   (Oracle's progress file unreadable, no total)" % (GREEN, len(done), END))
    left = None
guitar = sum(1 for e in done.values() if e.get("extra"))
print("  with guitar + piano: %d" % guitar)
colab = [d for d, e in ledger.items() if not d.startswith("lib:") and e.get("status") == "colab"]
if colab:
    oldest = min(ledger[d].get("sent", time.time()) for d in colab)
    print("  on Colab   %d waiting on Drive (sent %s; run Hoffle/stems/hoffle_stems.ipynb)" % (len(colab), ago(oldest)))

# ---------------------------------------------------------------- speed and time left
recent = sorted((e for e in done.values() if e.get("seconds")), key=lambda e: e.get("at", 0))
one_pass = [e["seconds"] for e in recent if e.get("shifts") == 1][-15:]
sample = one_pass or [e["seconds"] for e in recent][-15:]
if sample:
    avg = sum(sample) / len(sample)
    label = "1 pass" if one_pass else "2 passes (no 1-pass songs finished yet)"
    print("  speed      %s per song on average (last %d, %s)" % (dur(avg), len(sample), label))
    if left:
        print("  time left  %s~%s%s at that speed" % (BOLD, dur(left * avg), END))

# ---------------------------------------------------------------- now
print()
print(BOLD + "Right now" + END)
if remote is None:
    print("  %sOracle did not answer (ssh oracle)%s" % (RED, END))
elif serving:
    print("  %sOracle is serving Hoffle (failover): the worker is paused on purpose%s" % (YELLOW, END))
elif worker != "active":
    print("  %sworker is %s%s (it restarts by itself within 5 minutes; hoffle-stems-kick.timer)" % (YELLOW, worker, END))
if status.get("state") == "working":
    elapsed = time.time() - status.get("started", time.time())
    expect = (sum(sample) / len(sample)) if sample else None
    eta = " (about %s to go)" % dur(expect - elapsed) if expect and expect > elapsed else ""
    print("  splitting  %s%s%s, %s, %d passes, started %s%s" % (
        BOLD, status.get("title") or status.get("id"), END, dur(status.get("seconds", 0)).replace("0m ", ""),
        status.get("shifts", 0), ago(status.get("started", time.time())), eta))
elif status:
    print("  worker is %s (%s)" % (status.get("state"), ago(status.get("at", time.time()))))
queued = [i for i in inbox if i != status.get("id")]
for i in queued:
    entry = ledger.get(i, {})
    print("  queued     %s %s(%s)%s" % (title_of.get(i) or entry.get("title") or i, DIM, entry.get("kind") or "upgrade", END))

# ---------------------------------------------------------------- latest finished
print()
print(BOLD + "Latest finished" + END)
for digest, e in sorted(done.items(), key=lambda kv: kv[1].get("at", 0))[-5:]:
    print("  %s  %s %s(%s, %s)%s" % (datetime.fromtimestamp(e.get("at", 0)).strftime("%m-%d %H:%M"),
                                   title_of.get(digest, digest[:12]), DIM, e.get("kind") or "upgrade",
                                   dur(e.get("seconds") or 0), END))

# ---------------------------------------------------------------- in use?
since = datetime.now() - timedelta(days=DAYS)
cached, split_home = [], []
line_re = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d),\d+ - (\S+) - INFO - (.*)$")
for path in sorted(glob.glob(os.path.join(BOT, "musicbot.log*")), reverse=True):
    try:
        f = open(path, encoding="utf-8", errors="replace")
    except OSError:
        continue
    with f:
        for line in f:
            m = line_re.match(line)
            if not m:
                continue
            at = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
            if at < since:
                continue
            msg = m.group(3)
            if m.group(2) == "MusicBot.DJ" and " rebuilt from the stems cache" in msg and not msg.startswith("DJ t:"):
                t = re.search(r"'(.*)' rebuilt|\"(.*)\" rebuilt", msg)
                if t:
                    cached.append((at, t.group(1) or t.group(2)))
            elif m.group(2) == "MusicBot.Stems" and msg.startswith("Separated "):
                split_home.append(at)

hash_of_title = {}
for key, info in index.get("tracks", {}).items():
    if info and info.get("title"):
        hash_of_title.setdefault(info["title"].strip(), info["hash"])
upgraded_loads = [(at, t) for at, t in cached
                  if ledger.get(hash_of_title.get(t.strip(), ""), {}).get("status") == "done"
                  and ledger[hash_of_title[t.strip()]].get("at", 0) <= at.timestamp()]
with_gp = sum(1 for at, t in upgraded_loads
              if os.path.exists(os.path.join(CACHE, hash_of_title[t.strip()] + ".gp.npy"))
              or os.path.exists(os.path.join(CACHE, hash_of_title[t.strip()] + ".gp.flac")))
print()
print(BOLD + "In use? (DJ sets, last %g days)" % DAYS + END)
print("  songs loaded from the stems cache     %d" % len(cached))
print("    of them already upgraded on Oracle  %s%d%s  (%d with guitar + piano)" % (GREEN, len(upgraded_loads), END, with_gp))
print("  songs split again on home's CPU       %s%d%s  %s(should shrink as the cache fills)%s" % (
    YELLOW if split_home else GREEN, len(split_home), END, DIM, END))
for at, t in upgraded_loads[-5:]:
    print("    %s  %s" % (at.strftime("%m-%d %H:%M"), t))

# ---------------------------------------------------------------- storage
names = os.listdir(CACHE)
raw = sum(1 for n in names if n.endswith(".npy") and not n.endswith(".gp.npy"))
flac = sum(1 for n in names if n.endswith(".stems.flac"))
st = os.statvfs(CACHE)
size = sum(os.path.getsize(os.path.join(CACHE, n)) for n in names if os.path.isfile(os.path.join(CACHE, n)))
print()
print(BOLD + "Storage" + END)
print("  cache       %.1f GB; songs stored as FLAC %d, still raw %d%s" % (
    size / 1e9, flac, raw, "" if os.path.exists(os.path.join(STATE, "flac-ok")) else "  (FLAC mode is OFF)"))
print("  hard disk   %.0f GB free %s(new library songs pause below 20 GB)%s" % (st.f_bavail * st.f_frsize / 1e9, DIM, END))
PY
