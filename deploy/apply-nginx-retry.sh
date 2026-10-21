#!/usr/bin/env bash
#
# Let nginx retry a read that a Hoffle restart cut off. Run as root, once:
#
#   sudo bash ~/huddle/deploy/apply-nginx-retry.sh
#
# huddle.socket holds port 8730 through a restart, so new requests wait for
# the new workerd instead of failing. A request the old workerd had already
# taken is still cut off when it exits ("upstream prematurely closed" in the
# error log, a 502 for that one request). nginx can retry it, but only on
# another server of an upstream, so this names Hoffle's address twice (the
# second as a backup) and allows one retry. The retry opens a new connection,
# which the socket holds until the new workerd answers. Only reads (GET,
# HEAD...) are retried, never a POST or PATCH, so nothing is sent twice.
#
# On a test nginx with this config, three streams of requests through a
# restart: 679 sent, 0 failed, one retried.
#
# Changes /etc/nginx/sites-available/hoffle.online (location /) and
# /etc/nginx/snippets/huddle.conf (location /hangout/, used by deeppixel.online),
# keeps backups next to them, and puts them back if nginx -t fails.

set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run me with sudo." >&2; exit 1; }

UPSTREAM=/etc/nginx/conf.d/hoffle-upstream.conf
FILES=(/etc/nginx/sites-available/hoffle.online /etc/nginx/snippets/huddle.conf)
STAMP=$(date +%Y%m%d-%H%M%S)

if grep -q "proxy_pass http://hoffle_app;" "${FILES[@]}" 2>/dev/null && [[ -f "$UPSTREAM" ]]; then
  echo "Already applied."
  exit 0
fi

for f in "${FILES[@]}"; do
  n=$(grep -c "proxy_pass http://127.0.0.1:8730;" "$f" || true)
  [[ "$n" == 1 ]] || { echo "$f: expected one 'proxy_pass http://127.0.0.1:8730;', found $n. Nothing changed." >&2; exit 1; }
done

restore() {
  for f in "${FILES[@]}"; do cp -p "$f.bak-$STAMP" "$f"; done
  rm -f "$UPSTREAM"
}

for f in "${FILES[@]}"; do cp -p "$f" "$f.bak-$STAMP"; done

cat > "$UPSTREAM" <<'EOF'
# Hoffle's workerd, behind huddle.socket on 127.0.0.1:8730. The same address
# twice: when a restart cuts off a request workerd had already taken, nginx
# retries it once (reads only) on a fresh connection, which the socket holds
# until the new workerd answers. max_fails=0: a restart never marks it down.
# Written by ~/huddle/deploy/apply-nginx-retry.sh.
upstream hoffle_app {
    server 127.0.0.1:8730 max_fails=0;
    server 127.0.0.1:8730 max_fails=0 backup;
}
EOF

for f in "${FILES[@]}"; do
  sed -i -E 's#^([[:space:]]*)proxy_pass http://127\.0\.0\.1:8730;#\1proxy_pass http://hoffle_app;\n\1proxy_next_upstream error timeout;\n\1proxy_next_upstream_tries 2;#' "$f"
done

if ! out=$(nginx -t 2>&1); then
  echo "$out" >&2
  echo "nginx -t failed; putting the old config back." >&2
  restore
  exit 1
fi
systemctl reload nginx
sleep 1

ok=1
for target in "chat.hoffle.online /hangout/api/health" "deeppixel.online /hangout/api/health"; do
  set -- $target
  code=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 10 --resolve "$1:443:127.0.0.1" "https://$1$2" || true)
  echo "$1$2 -> $code"
  [[ "$code" == 200 ]] || ok=0
done
if (( ok )); then
  echo "Done. Backups: ${FILES[*]/%/.bak-$STAMP}"
else
  echo "A site did not answer 200; putting the old config back." >&2
  restore
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
  exit 1
fi
