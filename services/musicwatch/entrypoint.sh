#!/bin/sh
# Starts the Music + Watch bot next to Hoffle.
#
# It needs two secrets that Hoffle generates on its first start, so it reads
# them from Hoffle's state/secrets.env (./state is mounted read-only at /hoffle):
#   BOT_TOKEN            -> HUDDLE_BOT_TOKEN, how the bot signs in to Hoffle
#   MUSICWATCH_PASSWORD  -> WEB_UI_PASSWORD, how Hoffle signs in to the bot
# A value set in .env wins over the file, the same as for Hoffle itself.
set -e

SECRETS=/hoffle/secrets.env

# Hoffle writes the file on its first start; give it a minute.
waited=0
while [ ! -f "$SECRETS" ] && [ "$waited" -lt 120 ]; do
  [ "$waited" -eq 0 ] && echo "Waiting for Hoffle to create state/secrets.env..."
  sleep 2
  waited=$((waited + 2))
done

secret() {
  [ -f "$SECRETS" ] && grep -E "^$1=" "$SECRETS" | tail -n 1 | cut -d= -f2- || true
}

: "${HUDDLE_BOT_TOKEN:=${BOT_TOKEN:-$(secret BOT_TOKEN)}}"
: "${WEB_UI_PASSWORD:=${MUSICWATCH_PASSWORD:-$(secret MUSICWATCH_PASSWORD)}}"
export HUDDLE_BOT_TOKEN WEB_UI_PASSWORD

if [ -z "$HUDDLE_BOT_TOKEN" ] || [ -z "$WEB_UI_PASSWORD" ]; then
  echo "Could not read BOT_TOKEN and MUSICWATCH_PASSWORD from $SECRETS."
  echo "Start Hoffle once (docker compose up -d hoffle), then start this again."
  exit 1
fi

# Fresh code on every start; the bot's own data files are not part of the repo,
# so they are never overwritten.
tar -C /opt/musicbot -cf - . | tar -C /data -xf -
mkdir -p /data/musics

exec python /opt/hoffle/hoffle_only.py
