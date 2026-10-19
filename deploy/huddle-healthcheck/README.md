# Huddle health check (and the nightly restart it no longer needs)

Hoffle's workerd process used to grow in memory with every request: about
147 KB per `/api/bot/servers` poll on wrangler 4.92, about 42 KB on 4.148, and
still 30–85 KB per request on workerd 2026-10-06 (even `/api/health`). Live, it
reached ~1.9 GB within hours. The JavaScript heaps stay small (5–80 MB per
isolate), so it looked like native memory inside workerd, not a leak in
Huddle's code.

It is garbage that V8 collects too rarely. Each request passes through several
of miniflare's isolates (its entry worker, the user worker, the D1 simulator,
the assets workers), and what each leaves behind holds memory V8 does not count
towards its heap, so V8 rarely runs a full collection. A forced full GC through
the inspector gave ~270 MB back at once, and alternating load with forced GCs
kept a test copy flat.

The fix is the V8 flag `--gc-global` (every collection is a full one), which
`scripts/workerd-config.sh` puts in the config of every build. On the same mixed
traffic (pages, messages, health, assets), 25,000 requests:

| | memory | CPU | p95 | slowest request |
| --- | --- | --- | --- | --- |
| without | 150 MB → 3.2 GB, still rising | 202 s | 121 ms | 596 ms |
| `--gc-global` | 150 MB → 590 MB, flat | 217 s | 133 ms | 196 ms |

What else keeps it in check:

- fewer requests (the music bot polls every 5 s while every voice room is empty)
- `huddle-healthcheck`: restarts Huddle when 127.0.0.1:8730 stops answering.
  It skips its probe for 90 s after a (re)start, so a slow boot is not taken
  for an outage and restarted a second time.
- `huddle-nightly-restart` (no longer needed): a restart at 05:00 so memory
  never built up for more than a day. It is installed only with
  `--nightly-restart`. To turn off one that is already installed:

      sudo systemctl disable --now huddle-nightly-restart.timer

Install (needs sudo):

    sudo deploy/huddle-healthcheck/install.sh
