# Huddle health check and nightly restart

Production runs `wrangler dev`, and its workerd process grows in memory with
every request: measured at about 147 KB per `/api/bot/servers` poll on
wrangler 4.92 (about 42 KB on 4.148). The JavaScript heap itself does not grow
(it is back to ~35 MB after a forced GC), so this is native memory inside
workerd, not a leak in Huddle's code. With the music bot polling once a second,
that was ~1.2 GB an hour; at ~3 GB a garbage collection froze the worker for
long enough that the port stopped answering, about every 3 hours 15 minutes.

What keeps it in check:

- fewer requests (the music bot polls every 5 s while every voice room is empty)
- a newer wrangler/workerd (grows ~3.5x slower)
- `huddle-healthcheck`: restarts Huddle when 127.0.0.1:8730 stops answering.
  It now skips its probe for 90 s after a (re)start, so a slow boot is not
  taken for an outage and restarted a second time.
- `huddle-nightly-restart` (optional): a restart at 05:00 so memory never
  builds up for more than a day.

Install (needs sudo):

    sudo deploy/huddle-healthcheck/install.sh
