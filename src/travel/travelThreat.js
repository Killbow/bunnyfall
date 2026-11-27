// @ts-check

import { paceNow } from './travelPace.js';

export const THREAT_WARN_S = 0.6;

/**
 * Returns 0 when the point is already inside `reach` and the way goes deeper, and Infinity when the way leads out
 * of it or never enters it.
 * @param {number} dx
 * @param {number} dz
 * @param {number} reach
 * @param {{x: number, z: number} | null} heading
 */
export function metresToReach(dx, dz, reach, heading) {
  const d = Math.hypot(dx, dz);
  if (!heading) return Math.max(0, d - reach);
  const along = dx * heading.x + dz * heading.z;
  if (d <= reach) return along >= 0 ? 0 : Infinity;
  const disc = along * along - (d * d - reach * reach);
  if (disc < 0) return Infinity;
  const enter = along - Math.sqrt(disc);
  return enter >= 0 ? enter : Infinity;
}

export const threatStep = (n) => (n >= 5 ? Math.floor(n / 5) * 5 : Math.max(1, Math.floor(n)));

export const JOURNEY_FOE_PACE = 5;
export const foePaced = (cap, want) => Math.min(want, Math.max(cap, paceNow('foe') ?? JOURNEY_FOE_PACE));

// Inside a hostile ship's hold the clock runs at x1, because the sea fight steps on the world clock and any faster
// rate speeds up enemy fire.
export const foeRate = (foes, want) => (foes?.held ? Math.min(1, want) : foePaced(foes?.cap ?? Infinity, want));

/**
 * @param {{ threats: Array<{ dx: number, dz: number, reach: number, chasing?: boolean, mps?: number, holds?: number }>, heading?: {x: number, z: number} | null, speedMps: number, warnS?: number }} q
 * @returns {{ cap: number, threat: object | null, metres: number, held: boolean }}
 */
export function threatCap({ threats, heading = null, speedMps, warnS = THREAT_WARN_S }) {
  let best = Infinity, near = null, rate = 0;
  const held = (threats ?? []).some((t) => t.holds > 0 && Math.hypot(t.dx, t.dz) <= t.holds);
  if (!(speedMps > 0)) return { cap: Infinity, threat: null, metres: Infinity, held };
  for (const t of threats ?? []) {
    const m = t.chasing ? Math.max(0, Math.hypot(t.dx, t.dz) - t.reach) : metresToReach(t.dx, t.dz, t.reach, heading);
    const closing = speedMps + (t.mps > 0 ? t.mps : 0);
    if (!Number.isFinite(m)) continue;
    const r = m / (warnS * closing);
    if (near === null || r < rate) { rate = r; best = m; near = t; }
  }
  if (near === null) return { cap: Infinity, threat: null, metres: Infinity, held };
  return { cap: threatStep(rate), threat: near, metres: best, held };
}
