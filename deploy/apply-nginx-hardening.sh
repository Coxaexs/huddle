#!/usr/bin/env bash
#
# One-shot nginx fixes for Hoffle. Run as root:
#
#   sudo bash ~/huddle/deploy/apply-nginx-hardening.sh
#
# 1. Real visitor IPs: trusts CF-Connecting-IP only when the request really
#    came from Cloudflare, and hands Hoffle that checked address. Before this,
#    anyone hitting the home IP directly could fake the header and dodge the
#    sign-up / guestbook / password-reset rate limits.
# 2. Raises the deeppixel.online/hangout upload limit from 10m to 45m, to
#    match hoffle.online (the app allows 40 MB files).
# 3. Moves the stray backup out of sites-enabled/ (nginx was loading it as a
#    second, ignored copy of deeppixel.online).
#
# Everything under /etc/nginx is backed up first. If `nginx -t` fails the
# backup is restored and nginx is not reloaded. Safe to run twice.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run this with sudo." >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/root/nginx-backup-$STAMP.tar.gz"
tar -czf "$BACKUP" -C /etc nginx
echo "Backed up /etc/nginx to $BACKUP"

restore() {
  echo "nginx -t failed; restoring the backup. Nothing was reloaded." >&2
  rm -rf /etc/nginx
  tar -xzf "$BACKUP" -C /etc
  exit 1
}

# 1a. Cloudflare ranges (https://www.cloudflare.com/ips/), for every site.
cat > /etc/nginx/conf.d/cloudflare-realip.conf <<'CONF'
# Written by huddle/deploy/apply-nginx-hardening.sh.
# $remote_addr becomes the visitor's address only for requests that came
# through Cloudflare; anyone else keeps their own address.
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
CONF
echo "Wrote /etc/nginx/conf.d/cloudflare-realip.conf"

# 1b. Hoffle reads CF-Connecting-IP first, so overwrite it with the checked
#     address everywhere nginx proxies to Hoffle (port 8730).
for file in /etc/nginx/sites-available/hoffle.online /etc/nginx/snippets/huddle.conf; do
  if grep -q 'proxy_set_header CF-Connecting-IP \$remote_addr' "$file"; then
    echo "$file already passes the checked IP"
  else
    sed -i 's/^\([[:space:]]*\)proxy_set_header X-Real-IP \$remote_addr;/&\n\1proxy_set_header CF-Connecting-IP $remote_addr;/' "$file"
    echo "Updated $file"
  fi
done

# 2. Upload limit for deeppixel.online/hangout.
sed -i 's/client_max_body_size 10m;/client_max_body_size 45m;/' /etc/nginx/snippets/huddle.conf
echo "deeppixel.online/hangout upload limit: $(grep -o 'client_max_body_size [^;]*' /etc/nginx/snippets/huddle.conf)"

# 3. Stray backups in sites-enabled/ are loaded like real sites.
mkdir -p /root/nginx-disabled
for stray in /etc/nginx/sites-enabled/*.bak*; do
  [[ -e "$stray" ]] || continue
  mv "$stray" /root/nginx-disabled/
  echo "Moved $stray to /root/nginx-disabled/"
done

nginx -t || restore
systemctl reload nginx
echo
echo "Done; nginx reloaded. To undo everything:"
echo "  sudo rm -rf /etc/nginx && sudo tar -xzf $BACKUP -C /etc && sudo systemctl reload nginx"
