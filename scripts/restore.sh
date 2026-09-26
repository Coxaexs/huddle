#!/bin/sh
# Restore a backup made by scripts/backup.sh.
#
#   scripts/restore.sh <archive.tar.gz> [state-dir]    default state-dir: ./state
#
# Stop the server first: restoring under a running workerd leaves it holding
# the old databases. The current state is moved aside, not deleted.
set -eu

ARCHIVE="${1:?usage: scripts/restore.sh <archive.tar.gz> [state-dir]}"
STATE_DIR="${2:-${PERSIST_DIR:-./state}}"

if [ ! -f "$ARCHIVE" ]; then
  echo "No backup at $ARCHIVE" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK"
if [ ! -d "$WORK/state" ]; then
  echo "$ARCHIVE does not look like a Hoffle backup (no state/ inside)." >&2
  exit 1
fi

# Check every database before touching anything.
find "$WORK/state" -name '*.sqlite' | while read -r db; do
  result="$(sqlite3 "$db" 'PRAGMA integrity_check;')"
  if [ "$result" != "ok" ]; then
    echo "Integrity check failed for ${db#"$WORK"/}: $result" >&2
    exit 1
  fi
done

if [ -e "$STATE_DIR" ]; then
  ASIDE="$STATE_DIR.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$STATE_DIR" "$ASIDE"
  echo "Previous state moved to $ASIDE"
fi
mv "$WORK/state" "$STATE_DIR"
echo "Restored $ARCHIVE into $STATE_DIR. Start the server again."
