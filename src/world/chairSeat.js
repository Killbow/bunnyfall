// @ts-check

import { SEATED_EYE_HEIGHT, SEATED_HIP_HEIGHT, SEAT_ANKLE } from '../player/seatPose.js';

export const CHAIR_MODELS = Object.freeze(new Set([41100, 41105, 41106, 41122, 41123, 43307]));
export const isChairModel = (modelId) => CHAIR_MODELS.has(modelId);
export const CHAIR_KIND = Object.freeze({ 41100: 'chair', 41105: 'bench', 41106: 'bench', 41122: 'throne', 41123: 'throne', 43307: 'bench' });

export const CHAIR_SEAT_MIN = 0.2;
export const CHAIR_SEAT_MAX = 0.9;
export const CHAIR_SEAT_DEFAULT = 0.45;
export const CHAIR_BACK_RISE = 0.25;
export const CHAIR_BACK_REACHES = Object.freeze([0.5, 0.75, 0.95]);
export const CHAIR_LAP_TOP = 0.64;
export const CHAIR_PROBE_OVER = 0.05;
export const CHAIR_FLOOR_STEP = 0.6;

export const chairProbeOver = (collider, aabb) => (x, z, fromY) => {
  const len = fromY - aabb.min[1] + CHAIR_PROBE_OVER;
  const d = collider?.raycast?.([x, fromY, z], [0, -1, 0], len);
  return Number.isFinite(d) && d <= len ? fromY - d : null;
};

/**
 * @param {{ min: number[], max: number[] }} aabb
 * @param {ArrayLike<number>} matrix
 * @param {(x: number, z: number, fromY: number) => (number|null)} probe
 * @param {ArrayLike<number>} from
 */
export function chairSeatOf(aabb, matrix, probe, from) {
  if (!aabb?.min || !aabb?.max) return null;
  const floorY = aabb.min[1];
  const cx = (aabb.min[0] + aabb.max[0]) / 2, cz = (aabb.min[2] + aabb.max[2]) / 2;
  const hx = (aabb.max[0] - aabb.min[0]) / 2, hz = (aabb.max[2] - aabb.min[2]) / 2;
  const h = probe(cx, cz, floorY + CHAIR_SEAT_MAX + CHAIR_PROBE_OVER);
  const rise = Number.isFinite(h) ? /** @type {number} */ (h) - floorY : NaN;
  const seatY = rise >= CHAIR_SEAT_MIN && rise <= CHAIR_SEAT_MAX ? /** @type {number} */ (h) : floorY + CHAIR_SEAT_DEFAULT;
  const unit = (x, z) => { const l = Math.hypot(x, z); return l > 1e-6 ? [x / l, z / l] : null; };
  const ax = unit(matrix?.[0] ?? 1, matrix?.[2] ?? 0) ?? [1, 0];
  const az = unit(matrix?.[8] ?? 0, matrix?.[10] ?? 1) ?? [0, 1];
  const sides = [ax, [-ax[0], -ax[1]], az, [-az[0], -az[1]]];
  let back = null, backH = seatY + CHAIR_BACK_RISE;
  const topY = aabb.max[1] + CHAIR_PROBE_OVER;
  for (const s of sides) {
    const half = Math.abs(s[0]) * hx + Math.abs(s[1]) * hz;
    for (const k of CHAIR_BACK_REACHES) {
      const y = probe(cx + s[0] * half * k, cz + s[1] * half * k, topY);
      if (Number.isFinite(y) && /** @type {number} */ (y) > backH) { backH = /** @type {number} */ (y); back = s; }
    }
  }
  let face;
  if (back) face = [-back[0], -back[1]];
  else {
    const to = unit((from?.[0] ?? cx) - cx, (from?.[2] ?? cz) - cz) ?? az;
    face = sides.reduce((best, s) => (s[0] * to[0] + s[1] * to[1] > best[0] * to[0] + best[1] * to[1] ? s : best), sides[0]);
  }
  const feetY = Math.max(floorY - SEAT_ANKLE, seatY - SEATED_HIP_HEIGHT);
  return {
    feet: [cx, feetY, cz], yaw: Math.atan2(face[0], face[1]), top: CHAIR_LAP_TOP,
    eye: [cx, feetY + SEATED_EYE_HEIGHT, cz], pitch: 0, seatY,
  };
}
