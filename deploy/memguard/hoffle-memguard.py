#!/usr/bin/env python3
"""Stop a runaway job before memory pressure freezes the whole server.

On 2026-10-20 three big Python jobs started from SSH sessions (one of them a
4.4 GB script left running in a session that had logged out four days before)
pushed the 16 GB home server into swap thrashing. Hoffle, journald and SSH
stopped answering for half an hour before the kernel's OOM killer acted, and a
second stall later that night needed a hard reboot.

This runs as a user service and checks memory every two seconds. When memory
and swap are nearly gone, or the machine is thrashing, it stops the biggest of
this user's processes that was started from a login session (SSH, a terminal,
systemd-run) and uses at least MEMGUARD_MIN_RSS_MB. Services are never
candidates: Hoffle, the music bot and the containers run in system units.

    hoffle-memguard.py             watch (what the service runs)
    hoffle-memguard.py --status    print the numbers and the candidates, stop nothing
"""

import os
import re
import signal
import sys
import time

UID = os.getuid()
PAGE_MB = os.sysconf("SC_PAGE_SIZE") / 1024 / 1024
MIN_RSS_MB = int(os.environ.get("MEMGUARD_MIN_RSS_MB", "500"))
# Danger: available memory at or below AVAIL_PERCENT with swap nearly full
# (SWAP_PERCENT free) or the machine stalling on memory (PRESSURE, the share of
# the last 10 s in which every task waited for memory). A stall that bad with
# up to twice that much memory left counts too.
AVAIL_PERCENT = float(os.environ.get("MEMGUARD_AVAIL_PERCENT", "8"))
SWAP_PERCENT = float(os.environ.get("MEMGUARD_SWAP_PERCENT", "20"))
PRESSURE = float(os.environ.get("MEMGUARD_PRESSURE", "20"))
INTERVAL = 2
SESSION_CGROUP = re.compile(
    rf"^0::/user\.slice/user-{UID}\.slice/"
    rf"(session-[^/]+\.scope|user@{UID}\.service/app\.slice/run-[^/]+\.scope)(/|$)",
    re.M,
)


def log(message: str) -> None:
    print(message, flush=True)


def reading() -> tuple[bool, str]:
    meminfo = {}
    with open("/proc/meminfo") as f:
        for line in f:
            key, rest = line.split(":", 1)
            meminfo[key] = int(rest.split()[0])
    available = 100 * meminfo["MemAvailable"] / meminfo["MemTotal"]
    swap = 100 * meminfo["SwapFree"] / meminfo["SwapTotal"] if meminfo["SwapTotal"] else 0.0
    pressure = 0.0
    try:
        with open("/proc/pressure/memory") as f:
            for line in f:
                if line.startswith("full "):
                    pressure = float(line.split()[1].split("=", 1)[1])
    except OSError:
        pass
    danger = (available <= AVAIL_PERCENT and (swap <= SWAP_PERCENT or pressure >= PRESSURE)) or (
        available <= 2 * AVAIL_PERCENT and pressure >= 2.5 * PRESSURE
    )
    summary = f"available {available:.1f}%, swap free {swap:.0f}%, memory pressure {pressure:.0f}%"
    return danger, summary


def candidates() -> list[tuple[int, int, str]]:
    """(rss MB, pid, command line) of session processes, biggest first."""
    found = []
    for name in os.listdir("/proc"):
        if not name.isdigit() or int(name) == os.getpid():
            continue
        try:
            if os.stat(f"/proc/{name}").st_uid != UID:
                continue
            with open(f"/proc/{name}/cgroup") as f:
                if not SESSION_CGROUP.search(f.read()):
                    continue
            with open(f"/proc/{name}/statm") as f:
                rss = int(int(f.read().split()[1]) * PAGE_MB)
            with open(f"/proc/{name}/cmdline", "rb") as f:
                command = f.read().replace(b"\0", b" ").decode(errors="replace").strip()
        except (OSError, ValueError, IndexError):
            continue
        if rss >= MIN_RSS_MB:
            found.append((rss, int(name), command[:200]))
    return sorted(found, reverse=True)


def running(pid: int) -> bool:
    try:
        with open(f"/proc/{pid}/stat") as f:
            return f.read().rsplit(")", 1)[1].split()[0] != "Z"
    except OSError:
        return False


def stop(pid: int) -> None:
    try:
        os.kill(pid, signal.SIGTERM)
        for _ in range(10):
            time.sleep(0.5)
            if not running(pid):
                return
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def main() -> None:
    if "--status" in sys.argv:
        danger, summary = reading()
        log(f"{summary}; {'DANGER' if danger else 'fine'}")
        for rss, pid, command in candidates():
            log(f"  candidate {pid} {rss} MB  {command}")
        return
    log(f"watching: min {MIN_RSS_MB} MB, available <= {AVAIL_PERCENT}%, "
        f"swap free <= {SWAP_PERCENT}%, pressure >= {PRESSURE}%")
    while True:
        danger, summary = reading()
        if danger:
            victims = candidates()
            if victims:
                rss, pid, command = victims[0]
                log(f"memory nearly gone ({summary}); stopping pid {pid} ({rss} MB): {command}")
                stop(pid)
                time.sleep(10)
                continue
            log(f"memory nearly gone ({summary}), but no session process uses {MIN_RSS_MB} MB")
            time.sleep(30)
            continue
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
