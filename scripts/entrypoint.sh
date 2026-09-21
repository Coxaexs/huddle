#!/bin/sh
set -e

echo "=== Starting Hoffle Web & Realtime Server on :8730 ==="
touch /app/.dev.vars

# Trap signals for graceful shutdown
cleanup() {
  echo "Received termination signal, stopping Hoffle server..."
  kill -TERM "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  exit 0
}

trap cleanup INT TERM

npx wrangler dev \
  --config /app/dist/server/wrangler.json \
  --env-file /app/.dev.vars \
  --ip 0.0.0.0 \
  --port 8730 \
  --persist-to /app/state &
SERVER_PID=$!

wait "$SERVER_PID"
