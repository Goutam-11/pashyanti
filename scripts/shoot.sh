#!/usr/bin/env bash
# Screenshot the running app with headless Firefox — without filling /tmp.
#
#   scripts/shoot.sh light "?theme=light"
#   scripts/shoot.sh dark  "?theme=dark"
#   scripts/shoot.sh tour  "?theme=light&tour=1"
#   scripts/shoot.sh terms "" 390,844
#
# Why this wrapper exists: Firefox writes its cache and profile into $TMPDIR,
# and inside this container $TMPDIR is a 3.6 GB tmpfs that also holds every
# tool's temp files. Six hand-run `firefox --headless` calls filled it and took
# the whole shell down with "Error: UNKNOWN: unknown error, write". This pins
# TMPDIR and the profile inside .scratch/, and deletes the profile afterwards.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$ROOT/.scratch/tmp"
CACHE="$ROOT/.scratch/cache"
SHOTS="$ROOT/.scratch/shots"
PROFILE="$TMP/ff-profile-$$"

mkdir -p "$TMP" "$CACHE" "$SHOTS"
export TMPDIR="$TMP"
export XDG_CACHE_HOME="$CACHE"
export MOZ_HEADLESS=1

NAME="${1:-shot}"
QUERY="${2:-}"
SIZE="${3:-430,760}"
URL="http://127.0.0.1:8080/${QUERY}"

cleanup() { rm -rf "$PROFILE" 2>/dev/null || true; }
trap cleanup EXIT

rm -rf "$PROFILE"
mkdir -p "$PROFILE"

timeout 60 firefox --profile "$PROFILE" --headless \
  --window-size="$SIZE" --screenshot="$SHOTS/$NAME.png" "$URL" \
  >/dev/null 2>&1 || true

if [ -f "$SHOTS/$NAME.png" ]; then
  echo "wrote $SHOTS/$NAME.png ($(stat -c%s "$SHOTS/$NAME.png") bytes)"
else
  echo "no screenshot produced — is the server up on http://127.0.0.1:8080 ?" >&2
  exit 1
fi
