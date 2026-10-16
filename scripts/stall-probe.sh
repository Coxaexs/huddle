#!/usr/bin/env bash
#
# Records what the machine is doing around a restart, once a second, so a slow
# stall after a deploy can be explained from data instead of guessed at.
#
#   scripts/stall-probe.sh [seconds]     default 300
#
# scripts/deploy.sh starts this just before it stops the service. One line a
# second goes to ~/.cache/huddle-stall/<time>.log:
#   time  load  sda-busy%  cpu-iowait%  swap-in/out  probe latency+status  busiest processes
# The probe request is the cheap /api/auth/session (one database read), so a
# slow number there means the database path is slow, not the page.

DUR="${1:-300}"
URL="${HUDDLE_PROBE_URL:-http://127.0.0.1:8730/hangout/api/auth/session}"
OUT="$HOME/.cache/huddle-stall"
mkdir -p "$OUT"
LOG="$OUT/$(date +%Y%m%d-%H%M%S).log"
find "$OUT" -name '*.log' -mtime +14 -delete 2>/dev/null

ticks() { awk '$3=="sda"{print $13}' /proc/diskstats; }
cpu()   { awk '/^cpu /{print $5+0, $6+0, $2+$3+$4+$5+$6+$7+$8}' /proc/stat; }   # idle iowait total
swap()  { awk '/^pswpin|^pswpout/{printf "%s ", $2}' /proc/vmstat; }

echo "# time load sda_busy% iowait% swapin swapout probe busiest" > "$LOG"
prev_ticks=$(ticks); read -r _i prev_io prev_tot < <(cpu); read -r prev_si prev_so < <(swap)
end=$((SECONDS + DUR))
while (( SECONDS < end )); do
  sleep 1
  t=$(ticks); read -r _i io tot < <(cpu); read -r si so < <(swap)
  busy=$(( (t - prev_ticks) / 10 ))                      # ms busy in ~1000 ms -> percent
  iow=$(( tot > prev_tot ? 100 * (io - prev_io) / (tot - prev_tot) : 0 ))
  probe=$(curl -s -o /dev/null --max-time 5 -w '%{time_total}s/%{http_code}' "$URL" 2>/dev/null || echo "none")
  top=$(ps -eo pcpu=,comm= --sort=-pcpu | head -3 | awk '{printf "%s:%s ", $2, $1}')
  echo "$(date +%T) $(cut -d' ' -f1 /proc/loadavg) ${busy}% ${iow}% $((si - prev_si)) $((so - prev_so)) $probe $top" >> "$LOG"
  prev_ticks=$t; prev_io=$io; prev_tot=$tot; prev_si=$si; prev_so=$so
done
