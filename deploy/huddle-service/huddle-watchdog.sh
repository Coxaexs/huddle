#!/bin/bash
#
# ExecStartPost of huddle.service: feeds systemd's watchdog while Hoffle
# answers, so systemd itself restarts a server that is running but not
# serving. Installed as /usr/local/bin/huddle-watchdog.sh.
#
# The unit runs workerd directly, and workerd cannot talk to systemd. This
# starts a loop in the background (inside the unit, so stopping the unit stops
# it) that probes the health endpoint every 5 s and sends WATCHDOG=1 after each
# answer (NotifyAccess=all lets it). With no answer for WatchdogSec (60 s), systemd
# kills workerd and Restart=always starts it again.
#
# A slow answer still counts: every probe may take 20 s, so only a server
# that answers nothing for a whole minute is restarted. Restarting one that
# was slow, not dead, made the outage longer (2026-10-14).

URL="${HUDDLE_WATCHDOG_URL:-http://127.0.0.1:8730/hangout/api/health}"

watch_loop() {
  local failing=0
  # workerd listens about half a second after it starts.
  sleep 2
  while :; do
    if curl -fsS -o /dev/null --max-time 20 "$URL" 2>/dev/null; then
      systemd-notify WATCHDOG=1
      (( failing )) && echo "huddle-watchdog: $URL answers again"
      failing=0
    else
      (( failing )) || echo "huddle-watchdog: $URL not answering; systemd restarts Hoffle if it still is not within 60 s"
      failing=1
    fi
    sleep 5
  done
}

watch_loop < /dev/null &
disown
exit 0
