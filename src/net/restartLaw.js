// @ts-check
// BUNNYFALL: server restart warnings.

/** Shortest and longest countdown, in seconds. */
export const RESTART_MIN_S = 30;
export const RESTART_MAX_S = 60 * 60;

/** Seconds before the restart at which players get a chat reminder (the first announcement is always said). */
export const RESTART_REMINDERS_S = Object.freeze([30 * 60, 15 * 60, 10 * 60, 5 * 60, 60, 30, 10]);

/** The hub's storage key for the pending restart (epoch ms). Kept apart from every prefix the hub's sweep deletes. */
export const RESTART_KEY = 'restart:at';

/** The order's subject. Orders name an account; a notice from the box has none, so it names the server. */
export const RESTART_SUBJECT = 'server';

/**
 * The admin's argument: `-5min`, `-90s`, `-1h` (the leading dash is optional), or `cancel`.
 * @param {unknown} arg
 * @returns {{ seconds: number } | { cancel: true } | { error: string }}
 */
export function parseRestartArg(arg) {
  const s = String(arg ?? '').trim().toLowerCase();
  if (s === 'cancel' || s === 'off') return { cancel: true };
  const m = /^-?(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hour)$/.exec(s);
  if (!m) return { error: 'usage' };
  const n = Number(m[1]);
  const unit = m[2].startsWith('h') ? 3600 : m[2].startsWith('m') ? 60 : 1;
  const seconds = n * unit;
  if (seconds < RESTART_MIN_S || seconds > RESTART_MAX_S) return { error: 'range' };
  return { seconds };
}

/**
 * The relay's frame to players: `{t:'restart', in}` - milliseconds until the restart, or 0 when none is pending (called
 * off, or already past). Relative rather than a clock time, so a player whose clock is wrong still counts down right.
 * @param {any} m
 * @returns {number | null} the milliseconds, or null for a frame that is not a valid one
 */
export function restartFrameIn(m) {
  if (!m || m.t !== 'restart') return null;
  const ms = m.in;
  if (!Number.isSafeInteger(ms) || ms < 0 || ms > (RESTART_MAX_S + 60) * 1000) return null;
  return ms;
}
