// @ts-check
// Carries a poll on the account heartbeat (net/heartbeat.js) instead of its own route.
// After one heartbeat answer without the part the own route runs again; after RIDE_MISS_MAX in a row it runs alone.
// A failed heartbeat (offline, signed out, or busy) is not a miss.

export const RIDE_MISS_MAX = 2;

/**
 * @param {{ every: number, wanted: () => boolean, accept: (r: any) => void, now?: () => number }} io
 */
export function createRide({ every, wanted, accept, now = () => Date.now() }) {
  let at = -Infinity;
  let misses = 0;
  let attached = false;
  const usable = () => misses < RIDE_MISS_MAX;
  const ready = (/** @type {number} */ t, /** @type {number} */ early) => usable() && wanted() && t - at >= every - early;
  /** @type {import('./heartbeat.js').HeartbeatPart} */
  const part = {
    due: (t) => ready(t, 0),
    soon: (t, early) => ready(t, early),
    every,
    body: () => { at = now(); return true; },
    take: (r) => {
      if (r?.ok) { misses = 0; accept(r); } else if (r?.missing) misses++;
    },
  };
  return {
    attach: () => { attached = true; return part; },
    active: () => attached && misses === 0,
    asked: () => { at = now(); },
  };
}
