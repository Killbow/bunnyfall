// Online, a quest listed here opens its watch window a set time after the player arrives.
// The window runs on the character's own clock instead of fixed hours of the shared world clock.

// Times are in seconds of character time, and place is the Place symbol from the quest script without underscores.
export const ONLINE_GUARD_WINDOWS = Object.freeze({
  N0B10Y03: Object.freeze({ place: 'magesguild', delaySeconds: 10 * 60, lengthSeconds: 60 * 60 }),
});

export function guardWindowStep(s, here, now, win) {
  if (s.guardAnchor == null) {
    if (!here) return false;
    s.guardAnchor = now;
    s.guardAway = false;
  }
  const t = now - s.guardAnchor;
  // A clock behind the arrival, such as a load from another timeline, restarts the watch.
  if (t < 0) {
    s.guardAnchor = here ? now : null;
    s.guardAway = false;
    return false;
  }
  if (t > win.delaySeconds + win.lengthSeconds) {
    if (!here) { s.guardAway = true; return false; }
    // A player who stays after the window closes keeps it shut, so the questor can pay.
    // Leaving and coming back starts a new watch.
    if (!s.guardAway) return false;
    s.guardAnchor = now;
    s.guardAway = false;
    return false;
  }
  return t >= win.delaySeconds;
}
