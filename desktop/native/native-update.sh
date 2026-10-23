#!/bin/sh
# Hoffle Native updates itself with this (macOS and Linux; native-update.ps1
# is the Windows twin). The app runs it; the page can only ask the app to.
#
#   native-update.sh check <current-version> <platform> <app> <stage>
#     Reads native-latest.txt from the latest GitHub Release (CI writes it,
#     see .github/workflows/desktop.yml). When that lists a newer version for
#     <platform>, downloads the archive into <stage>, checks its SHA-256
#     against the list and unpacks it. Prints one line:
#       ready <version>    unpacked in <stage>/new; a restart installs it
#       manual <version>   newer, but <app> sits where it cannot be replaced
#       none               nothing newer
#
#   native-update.sh install <app> <pid> <stage>
#     Waits for the app (<pid>) to quit, puts <stage>/new in place of <app>
#     and starts it again. <app> is Hoffle.app on macOS, the hoffle binary on
#     Linux.
set -eu

MANIFEST="https://github.com/Coxaexs/huddle/releases/latest/download/native-latest.txt"
FILES="https://github.com/Coxaexs/huddle/releases/download/"

# True when dotted version $1 is newer than $2.
newer() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    n = split(a, x, "."); m = split(b, y, ".")
    for (i = 1; i <= (n > m ? n : m); i++) {
      if (x[i] + 0 > y[i] + 0) exit 0
      if (x[i] + 0 < y[i] + 0) exit 1
    }
    exit 1
  }'
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d " " -f 1
  else shasum -a 256 "$1" | cut -d " " -f 1; fi
}

fetch() {
  curl -fsSL --retry 2 --max-time 600 -o "$2" "$1"
}

check() {
  current=$1 platform=$2 app=$3 stage=$4
  mkdir -p "$stage"
  fetch "$MANIFEST" "$stage/manifest.txt"
  version=$(awk '$1 == "version" { print $2 }' "$stage/manifest.txt")
  url=$(awk -v p="$platform" '$1 == p { print $2 }' "$stage/manifest.txt")
  sum=$(awk -v p="$platform" '$1 == p { print $3 }' "$stage/manifest.txt")
  if [ -z "$version" ] || [ -z "$url" ] || [ -z "$sum" ] || ! newer "$version" "$current"; then
    echo none
    return
  fi
  case $url in
    "$FILES"*) ;;
    *) echo "update: unexpected address $url" >&2; exit 1 ;;
  esac
  if [ ! -w "$(dirname "$app")" ] || [ ! -w "$app" ]; then
    echo "manual $version"
    return
  fi
  # Unpacked by an earlier check already.
  if [ -d "$stage/new" ] && [ "$(cat "$stage/version" 2>/dev/null)" = "$version" ]; then
    echo "ready $version"
    return
  fi
  rm -rf "$stage/new" "$stage/version" "$stage/update.tar.gz"
  fetch "$url" "$stage/update.tar.gz"
  if [ "$(sha256 "$stage/update.tar.gz")" != "$sum" ]; then
    rm -f "$stage/update.tar.gz"
    echo "update: checksum mismatch" >&2
    exit 1
  fi
  mkdir "$stage/new"
  tar -xzf "$stage/update.tar.gz" -C "$stage/new"
  rm -f "$stage/update.tar.gz"
  echo "$version" > "$stage/version"
  echo "ready $version"
}

install() {
  app=$1 pid=$2 stage=$3
  i=0
  while kill -0 "$pid" 2>/dev/null && [ $i -lt 150 ]; do
    sleep 0.2
    i=$((i + 1))
  done
  case $(uname -s) in
    Darwin)
      new="$stage/new/Hoffle.app"
      [ -d "$new" ] || exit 1
      rm -rf "$app.old"
      mv "$app" "$app.old"
      if mv "$new" "$app"; then rm -rf "$app.old"; else mv "$app.old" "$app"; fi
      open "$app"
      ;;
    *)
      new="$stage/new/hoffle-linux-x86_64"
      [ -f "$new/bin/hoffle" ] || exit 1
      # A rename, so even a running copy of the old binary is left intact.
      cp "$new/bin/hoffle" "$app.new"
      chmod +x "$app.new"
      mv -f "$app.new" "$app"
      # Unpacked from the tarball (not install.sh's lone binary): icons too.
      res="$(dirname "$app")/../resources"
      if [ -d "$res" ]; then cp -R "$new/resources/." "$res/"; fi
      nohup "$app" >/dev/null 2>&1 &
      ;;
  esac
  rm -rf "$stage/new" "$stage/version"
}

case ${1:-} in
  check) shift; check "$@" ;;
  install) shift; install "$@" ;;
  *) echo "usage: $0 check <current> <platform> <app> <stage> | install <app> <pid> <stage>" >&2; exit 2 ;;
esac
