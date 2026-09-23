#!/bin/sh
# All-in-one image: same startup as the regular image, plus the music helper
# running inside this container on loopback.
export HOFFLE_START_MUSIC_HELPER=1
export MUSIC_HELPER_BASE_URL="${MUSIC_HELPER_BASE_URL:-http://127.0.0.1:8731}"
exec /app/scripts/entrypoint.sh
