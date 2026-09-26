#!/bin/sh
# Snapshot a self-hosted Hoffle's state (D1 messages, R2 uploads, hub storage).
#
#   scripts/backup.sh [state-dir] [out-dir]      defaults: ./state ./backups
#
# Safe while the server is running: every SQLite file is copied with
# `sqlite3 .backup`, which takes a consistent snapshot instead of a torn copy of
# a database mid-write. Upload blobs are plain files and are copied as-is.
# Restore with scripts/restore.sh.
set -eu

STATE_DIR="${1:-${PERSIST_DIR:-./state}}"
OUT_DIR="${2:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [ ! -d "$STATE_DIR" ]; then
  echo "No state directory at $STATE_DIR" >&2
  exit 1
fi
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required for a consistent backup (apt install sqlite3)." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SNAP="$WORK/state"

# Copy the tree first, then overwrite each database with a consistent snapshot.
cp -a "$STATE_DIR" "$SNAP"
find "$SNAP" \( -name '*.sqlite-wal' -o -name '*.sqlite-shm' \) -delete
find "$STATE_DIR" -name '*.sqlite' | while read -r db; do
  rel="${db#"$STATE_DIR"/}"
  rm -f "$SNAP/$rel"
  sqlite3 "$db" ".backup '$SNAP/$rel'"
done

mkdir -p "$OUT_DIR"
ARCHIVE="$OUT_DIR/hoffle-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK" state
echo "Backup written to $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# Keep the newest KEEP backups (default 14); set KEEP=0 to keep everything.
KEEP="${KEEP:-14}"
if [ "$KEEP" -gt 0 ]; then
  ls -1t "$OUT_DIR"/hoffle-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
fi
