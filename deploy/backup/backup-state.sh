#!/usr/bin/env bash
#
# Back up Huddle's state/ directory — the only copy of all real data (the D1
# database, R2 blobs and Durable Object storage, all emulated as local SQLite).
#
# SQLite files are captured with the online `.backup` command rather than a raw
# `cp`, so a snapshot taken while wrangler is mid-write is still internally
# consistent. Everything else is copied as-is. The result is one timestamped
# tarball per run, and the newest KEEP are kept.
#
# Cron-friendly: no arguments. Override paths with env vars if needed.
#   STATE_DIR  (default /home/coxaexs/huddle/state)
#   DEST_DIR   (default /mnt/harddisk/backups/huddle — a separate disk)
#   KEEP       (default 14)

set -uo pipefail

STATE_DIR="${STATE_DIR:-/home/coxaexs/huddle/state}"
DEST_DIR="${DEST_DIR:-/mnt/harddisk/backups/huddle}"
KEEP="${KEEP:-14}"

# These archives hold the whole user table — PBKDF2 password hashes and live
# session rows — so they must never be group/world readable. The destination
# lives on a shared disk whose default ACL grants `other::rwx`, which would
# otherwise be inherited, so lock down both the directory and every file.
umask 077

if [[ ! -d "$STATE_DIR" ]]; then
  echo "state dir not found: $STATE_DIR" >&2
  exit 1
fi
mkdir -p "$DEST_DIR"
chmod 700 "$DEST_DIR" 2>/dev/null || true
# umask cannot defeat an inherited default ACL, so clear it explicitly.
if command -v setfacl >/dev/null 2>&1; then
  setfacl -b "$DEST_DIR" 2>/dev/null || true
  setfacl -k "$DEST_DIR" 2>/dev/null || true
fi

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

cd "$STATE_DIR"
# Walk every file. WAL/SHM sidecars are skipped on purpose: the `.backup` of the
# main db already folds in their contents, and a stale sidecar would corrupt a
# restore.
while IFS= read -r -d '' f; do
  case "$f" in
    *-wal|*-shm|*.sqlite-wal|*.sqlite-shm) continue ;;
  esac
  mkdir -p "$STAGING/$(dirname "$f")"
  if [[ "$f" == *.sqlite ]]; then
    if ! sqlite3 "$f" ".backup '$STAGING/$f'" 2>/dev/null; then
      # Not a valid SQLite db (or locked hard) — fall back to a raw copy.
      cp -a "$f" "$STAGING/$f"
    fi
  else
    cp -a "$f" "$STAGING/$f"
  fi
done < <(find . -type f -print0)

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$DEST_DIR/huddle-state-$STAMP.tar.gz"
tar czf "$ARCHIVE" -C "$STAGING" .
chmod 600 "$ARCHIVE"

# Rotate: keep the newest $KEEP, delete the rest.
ls -1t "$DEST_DIR"/huddle-state-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "backed up $STATE_DIR -> $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
