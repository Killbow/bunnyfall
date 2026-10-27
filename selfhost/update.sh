#!/bin/sh
# BUNNYFALL: pull the latest main from GitHub and rebuild the server, only when something changed.
#   sh selfhost/update.sh          update now
#   sh selfhost/update.sh --force  rebuild even if nothing changed
#   sh selfhost/update.sh --if-requested  update only if the owner pressed the in-game button (cron, every minute)
# Output also goes to updates/update.log, which the in-game button shows.
set -eu
cd "$(dirname "$0")/.."

BRANCH=main
mkdir -p updates
LOG=updates/update.log
if [ "${1:-}" = "--if-requested" ]; then
  [ -f updates/update-requested ] || exit 0
  rm -f updates/update-requested
  exec >>"$LOG" 2>&1
  echo "[bunnyfall-update] requested from the game"
fi
LOG_TAG="[bunnyfall-update $(date '+%Y-%m-%d %H:%M:%S')]"

# One update at a time (cron and a manual run can overlap).
exec 9>.update.lock
if ! flock -n 9; then echo "$LOG_TAG another update is running, skipping"; exit 0; fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "$LOG_TAG local edits on this box, not pulling. Commit them to GitHub or run: git checkout -- ."
  git status --short --untracked-files=no
  exit 1
fi

git fetch --quiet origin "$BRANCH"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ] && [ "${1:-}" != "--force" ]; then
  echo "$LOG_TAG already up to date ($(git rev-parse --short HEAD))"
  exit 0
fi

git merge --ff-only --quiet "origin/$BRANCH"
echo "$LOG_TAG updated $(git rev-parse --short "$LOCAL") -> $(git rev-parse --short HEAD)"
git log --oneline "$LOCAL..HEAD" | head -20

# Build first while the old server keeps running, then swap. Players reconnect on their own.
docker compose build
docker compose up -d
docker image prune -f >/dev/null
echo "$LOG_TAG done"
