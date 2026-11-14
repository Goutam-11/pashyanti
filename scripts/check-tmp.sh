#!/usr/bin/env bash
# Report how full the container's /tmp tmpfs is, and what is in it.
#
#   scripts/check-tmp.sh
#
# Exits 1 above 80% so it can be chained: scripts/check-tmp.sh && bun run build
set -euo pipefail

warn_at=80
used=$(df --output=pcent /tmp | tail -1 | tr -dc '0-9')
total=$(df -h --output=size /tmp | tail -1 | tr -d ' ')
echo "/tmp: ${used}% of ${total} used"

if [ "$used" -ge "$warn_at" ]; then
  echo
  echo "WARNING: /tmp is ${used}% full. When it fills completely, every command"
  echo "fails with: Error: UNKNOWN: unknown error, write"
  echo
  echo "Biggest entries:"
  du -sh /tmp/* /tmp/.[!.]* 2>/dev/null | sort -h | tail -10 || true
  echo
  echo "Fix: write to the repo instead — scripts/with-cache.sh <command>"
  exit 1
fi
