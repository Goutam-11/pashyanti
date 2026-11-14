#!/usr/bin/env bash
# Run any command with every cache and temp directory pinned inside the repo.
#
#   scripts/with-cache.sh bun run build
#   scripts/with-cache.sh uv sync
#   scripts/with-cache.sh gh run list
#
# Why: the container's /tmp is a 3.6 GB tmpfs. When it fills, *every* command
# fails with "Error: UNKNOWN: unknown error, write" — including `df`. Some tools
# (node, bun, gh, uv) write temp files there by default. This keeps them in
# .scratch/, which is gitignored and lives on the real filesystem.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="$ROOT/.scratch/cache"
TMP="$ROOT/.scratch/tmp"

mkdir -p "$CACHE/uv" "$CACHE/bun" "$CACHE/node" "$CACHE/gh" "$TMP"

export TMPDIR="$TMP"
export XDG_CACHE_HOME="$CACHE"
export UV_CACHE_DIR="$CACHE/uv"
export BUN_INSTALL_CACHE_DIR="$CACHE/bun"
export NODE_COMPILE_CACHE="$CACHE/node"

exec "$@"
