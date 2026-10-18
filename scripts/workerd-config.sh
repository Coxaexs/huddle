#!/usr/bin/env bash
#
# Write the workerd config that huddle.service runs:
#
#   scripts/workerd-config.sh [DIST] [OUT]
#
# DIST is a build (default: ./dist), OUT the config file (default:
# DIST/workerd/config.bin). scripts/deploy.sh runs this on every build.
#
# Hoffle used to run under `wrangler dev`: a Node process plus two workerd
# processes, a proxy on 8730 and the app behind it on a random port. A restart
# took several seconds, and the proxy could hang with the unit still "active"
# (nothing bound to 8730). Now systemd runs the app's workerd directly.
#
# Wrangler and miniflare still write the config, so it is exactly what
# `wrangler dev` runs (D1, R2, Durable Objects, assets, all persisted under
# state/). This starts `wrangler dev` with MINIFLARE_WORKERD_PATH pointing at
# a stand-in that saves the app's config instead of serving it, then stops.
# The proxy instance does run, on a spare port, for the second or two this
# takes; it never touches state/.
#
# The config embeds the code, the asset manifest and the secrets from
# .dev.vars, so it is written mode 600 and must be made again for every build.
# The assets folder inside it is wherever DIST was; huddle.service points it
# at the live dist/client with `--directory-path`, so a config made in the
# staging copy works once swapped in.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$(cd "${1:-$ROOT/dist}" && pwd)"
OUT="${2:-$DIST/workerd/config.bin}"
NODE="$ROOT/node_modules/node/bin/node"
WORKERD="$ROOT/node_modules/@cloudflare/workerd-linux-64/bin/workerd"

[[ -f "$DIST/server/wrangler.json" ]] || { echo "No $DIST/server/wrangler.json; build first." >&2; exit 1; }

tmp="$(mktemp -d)"
wrangler_pid=
stop_wrangler() {
  [[ -n "$wrangler_pid" ]] || return 0
  kill -- "-$wrangler_pid" 2>/dev/null || true
  wait "$wrangler_pid" 2>/dev/null || true
  wrangler_pid=
}
cleanup() {
  stop_wrangler
  rm -rf "$tmp"
}
trap cleanup EXIT

# The stand-in for workerd. The app instance is the one wrangler starts with an
# inspector; its config arrives on stdin.
cat > "$tmp/workerd" <<EOF
#!/bin/bash
if printf '%s\n' "\$@" | grep -q -- --inspector-addr; then
  cat > "$tmp/config.bin.part" && mv "$tmp/config.bin.part" "$tmp/config.bin"
  exec sleep 60
fi
exec "$WORKERD" "\$@"
EOF
chmod +x "$tmp/workerd"

port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"

# Same settings huddle.service used to pass to `wrangler dev`.
(
  cd "$ROOT"
  export CI=true WRANGLER_SEND_METRICS=false X_LOCAL_EXPLORER=false X_LOCAL_OBSERVABILITY=false
  export MINIFLARE_WORKERD_PATH="$tmp/workerd"
  # Its own process group, so one kill stops wrangler and both workerds.
  exec setsid "$NODE" "$ROOT/node_modules/wrangler/bin/wrangler.js" dev \
    --config "$DIST/server/wrangler.json" \
    --env-file "$ROOT/.dev.vars" \
    --ip 127.0.0.1 --port "$port" --inspector-port 0 \
    --persist-to "$ROOT/state" \
    --var MUSICWATCH_BASE_URL:http://127.0.0.1:8722 \
    --var MUSIC_HELPER_BASE_URL:http://127.0.0.1:8731 \
    --var DND_BASE_URL:http://127.0.0.1:8000 \
    --log-level warn --show-interactive-dev-session=false
) > "$tmp/wrangler.log" 2>&1 < /dev/null &
wrangler_pid=$!

for _ in $(seq 1 120); do
  [[ -s "$tmp/config.bin" ]] && break
  if ! kill -0 "$wrangler_pid" 2>/dev/null; then
    echo "wrangler exited before writing a config:" >&2
    cat "$tmp/wrangler.log" >&2
    exit 1
  fi
  sleep 0.5
done
[[ -s "$tmp/config.bin" ]] || { echo "No config from wrangler after 60 s:" >&2; cat "$tmp/wrangler.log" >&2; exit 1; }

stop_wrangler

mkdir -p "$(dirname "$OUT")"
umask 077
cp "$tmp/config.bin" "$OUT.new"
chmod 600 "$OUT.new"
mv "$OUT.new" "$OUT"
echo "Wrote $OUT ($(stat -c %s "$OUT") bytes)"
