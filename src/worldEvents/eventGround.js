// @ts-check
// Each client checks portals and parked wagons against the event gates it renders, because the relay never reads
// those frames. All points are scene coordinates and shift with a recenter.

// Ground radius in meters; it exceeds `GATE_CLEAR_M` (24) and `STAR_ROCK_M` (28) so the clear area covers the
// approach to the gate.
export const EVENT_GROUND_M = 40;

/** @type {Map<string, () => (ReadonlyArray<ArrayLike<number>> | null | undefined)>} */
const _sources = new Map();

export function setEventGround(name, fn) {
  if (typeof fn === 'function') _sources.set(name, fn); else _sources.delete(name);
}

export function groundNear(feet, p, r = EVENT_GROUND_M) {
  if (!p || !feet) return null;
  for (const f of feet) if (f && Math.hypot(f[0] - p[0], f[2] - p[2]) <= r) return f;
  return null;
}

export function eventGroundAt(p, r = EVENT_GROUND_M) {
  if (!p) return null;
  for (const [name, fn] of _sources) {
    let feet = null;
    try { feet = fn(); } catch { feet = null; }
    if (feet?.length && groundNear(feet, p, r)) return name;
  }
  return null;
}
