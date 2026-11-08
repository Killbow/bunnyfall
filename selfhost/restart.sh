#!/bin/sh
# BUNNYFALL: restart the server after warning every player online.
# This restarts the code already running. To pull a new version from GitHub, use selfhost/update.sh.
set -eu
cd "$(dirname "$0")/.."

COMPOSE=${BF_COMPOSE:-docker compose}
STATE=${BF_UPDATES:-updates}
LOCK=${BF_LOCK:-.update.lock}           # update.sh's lock: this prevents restarts during an update
mkdir -p "$STATE"
PIDF="$STATE/restart.pid"
LOG="$STATE/restart.log"
[ -L "$LOG" ] && rm -f "$LOG"

# The warning
status=0
out=$($COMPOSE exec -T server node selfhost/restartNotice.mjs "$@") || status=$?
say() { [ -n "$out" ] && printf '%s\n' "$out" | grep -v '^ra=' || true; }
if [ "$status" != 0 ]; then say; exit "$status"; fi
say
ra=$(printf '%s\n' "$out" | sed -n 's/^ra=//p')
case "$ra" in ''|*[!0-9]*) echo "the warning was sent, but its restart time was not understood: nothing scheduled"; exit 1 ;; esac

# Any countdown already waiting ends here: replaced by this one, or called off.
if [ -f "$PIDF" ]; then
  pid=$(cat "$PIDF" 2>/dev/null || true)
  case "$pid" in ''|*[!0-9]*) ;; *) kill -- "-$pid" 2>/dev/null && echo "the countdown that was waiting is stopped" ;; esac
  rm -f "$PIDF"
fi
[ "$ra" = 0 ] && exit 0

wait=$(( ra - $(date +%s) ))
[ "$wait" -lt 0 ] && wait=0
# setsid: the job is its own process group (so a cancel stops the sleep too) and outlives this terminal.
BF_WAIT=$wait BF_CMD="$COMPOSE" BF_LOCKF="$LOCK" BF_PIDF="$PIDF" setsid sh -c '
  stamp() { date "+%Y-%m-%d %H:%M:%S"; }
  echo "[bunnyfall-restart $(stamp)] restart scheduled in ${BF_WAIT}s"
  sleep "$BF_WAIT"
  exec 9>"$BF_LOCKF"
  flock 9
  echo "[bunnyfall-restart $(stamp)] restarting the server"
  if $BF_CMD restart server; then echo "[bunnyfall-restart $(stamp)] done"; else echo "[bunnyfall-restart $(stamp)] restart failed"; fi
  [ "$(cat "$BF_PIDF" 2>/dev/null)" = "$$" ] && rm -f "$BF_PIDF"
' >>"$LOG" 2>&1 </dev/null &
echo $! > "$PIDF"
echo "the server restarts at zero (log: $LOG)"
