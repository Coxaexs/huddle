# Memory guard

On the night of 2026-10-20 the home server ran out of memory. Three big Python
jobs had been started from SSH sessions, one of them a 4.4 GB script still
running in a session that logged out four days earlier. Together with Hoffle's
workerd at its old size, they pushed the 16 GB machine into swap thrashing.
Hoffle and journald missed their watchdogs at 01:07, and the kernel's OOM
killer only acted at 01:38. A second stall at 02:07 lasted until a hard reboot
at 12:21. Oracle served chat in the meantime, but voice and the music bot were
down.

`hoffle-memguard.py` acts before the kernel does. Every two seconds it reads
`/proc/meminfo` and `/proc/pressure/memory`. When available memory is at or
below 8% and swap is nearly full (20% free) or the machine stalls on memory at
least 20% of the time, it stops the biggest process of its user that was
started from a login session (SSH, a terminal, `systemd-run --user`) and uses
at least 500 MB. It sends SIGTERM first and SIGKILL 5 s later. A stall of 50%
or more counts with up to 16% of memory left.

Services are never candidates: Hoffle, the music bot, the bots and the
containers run in system units, so a stray job gets stopped instead of them.

It runs as a user service, so it needs no sudo:

```sh
deploy/memguard/install.sh
journalctl --user -u hoffle-memguard      # what it stopped and why
~/.local/bin/hoffle-memguard --status     # current numbers and candidates
```

The thresholds can be set in the unit's environment: `MEMGUARD_MIN_RSS_MB`,
`MEMGUARD_AVAIL_PERCENT`, `MEMGUARD_SWAP_PERCENT`, `MEMGUARD_PRESSURE`.

For heavy one-off jobs (audio analysis, stem separation, big builds), cap them
up front so they cannot crowd out Hoffle at all:

```sh
systemd-run --user --scope -p MemoryMax=3G -p MemorySwapMax=0 python3 job.py
```
