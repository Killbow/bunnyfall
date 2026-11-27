// @ts-check
// Only the player's boat gets this bonus; scaling the AI captains would break the tuned sea fights.
export const PEACE_WAY = 1.15;

/** @param {{ enemies?: boolean, boarding?: boolean, aiming?: boolean }} at */
export function peaceWayOf({ enemies = false, boarding = false, aiming = false } = {}) {
  return enemies || boarding || aiming ? 1 : PEACE_WAY;
}

// The runtime asks several times a frame and each world answer walks every nearby enemy, so it is held briefly.
export const PEACE_HOLD_S = 0.1;
export function heldPeaceWay(read, now = () => performance.now() / 1000) {
  let at = -Infinity, k = 1;
  return () => {
    const t = now();
    if (!(t >= at && t - at < PEACE_HOLD_S)) { at = t; k = read(); }
    return k;
  };
}

export function peaceShare(k) {
  const n = Number(k);
  return Number.isFinite(n) ? Math.max(1, Math.min(PEACE_WAY, n)) : 1;
}
