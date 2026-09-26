#!/bin/sh
# Keep coturn's external-ip in step with the address your DNS name points at.
#
# This is the half of a TURN setup that rots quietly. The relay hands every peer
# the address in `external-ip`, and that line is a fixed string: when the ISP
# reassigns the address, coturn keeps advertising the old one, calls finish
# their handshake and carry no audio, and the only symptom is that some friends
# cannot hear each other while everyone else is fine.
#
# Run it from a timer (see sync-external-ip.timer) and it rewrites the line and
# restarts coturn only when the address actually changed, so a working relay is
# never interrupted for nothing.
#
# Usage: sync-external-ip.sh [name-to-follow] [--dry-run]
#
# TURN_CONF      config to edit (default /etc/turnserver.conf)
# TURN_RESTART   command to run after a change (default "systemctl restart coturn")
set -eu

CONF="${TURN_CONF:-/etc/turnserver.conf}"
RESTART="${TURN_RESTART:-systemctl restart coturn}"
NAME="${1:-xray.deeppixel.online}"
DRY_RUN=no
[ "${2:-}" = "--dry-run" ] && DRY_RUN=yes

[ -f "$CONF" ] || { echo "$CONF does not exist" >&2; exit 1; }

PUBLIC=$(dig +short "$NAME" A | tail -1)
case "$PUBLIC" in
  ''|*[!0-9.]*) echo "could not resolve $NAME to an IPv4 address; leaving $CONF alone" >&2; exit 1 ;;
esac

# Whatever is there now, with the private half kept as it is: that part is the
# address coturn binds locally, and it does not change with the public one.
LINE=$(sed -n 's/^external-ip=\(.*\)$/\1/p' "$CONF" | head -1)
CURRENT=${LINE%%/*}
PRIVATE=${LINE#*/}
[ "$PRIVATE" = "$LINE" ] && PRIVATE=""

if [ "$CURRENT" = "$PUBLIC" ]; then
  echo "external-ip is already $PUBLIC"
  exit 0
fi

if [ "$DRY_RUN" = yes ]; then
  echo "would set external-ip=$PUBLIC/${PRIVATE:-<private ip>} (was ${CURRENT:-unset}) in $CONF"
  exit 0
fi

if [ -n "$PRIVATE" ]; then
  sed -i "s|^external-ip=.*|external-ip=$PUBLIC/$PRIVATE|" "$CONF"
else
  sed -i "s|^external-ip=.*|external-ip=$PUBLIC|" "$CONF"
fi
echo "external-ip ${CURRENT:-unset} -> $PUBLIC; restarting the relay"
$RESTART
