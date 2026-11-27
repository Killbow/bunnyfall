// @ts-check
// Marches a ray against the terrain surface the host draws. A leaf module with no imports.

/**
 * @param {any} collider
 * @param {number} x
 * @param {number} z
 */
export function groundAt(collider, x, z) {
  try {
    const h = typeof collider?.surfaceAt === 'function' ? collider.surfaceAt(x, z) : collider?.heightAt?.(x, z);
    return Number.isFinite(h) ? h : NaN;
  } catch { return NaN; }
}
export const GROUND_MARCH_STEP = 0.25;
const GROUND_MARCH_REFINE = 10;

/**
 * @param {ArrayLike<number>} origin
 * @param {ArrayLike<number>} dir
 * @param {number} max
 * @param {any} collider
 */
export function groundHit(origin, dir, max, collider) {
  if (!Number.isFinite(groundAt(collider, origin[0], origin[2]))) return Infinity;
  const above = (/** @type {number} */ t) => {
    const g = groundAt(collider, origin[0] + dir[0] * t, origin[2] + dir[2] * t);
    return !Number.isFinite(g) || origin[1] + dir[1] * t > g;
  };
  if (!above(0)) return Infinity;
  for (let t = GROUND_MARCH_STEP, prev = 0; prev < max; prev = t, t = Math.min(max, t + GROUND_MARCH_STEP)) {
    if (above(t)) { if (t >= max) break; continue; }
    let lo = prev, hi = t;
    for (let i = 0; i < GROUND_MARCH_REFINE; i++) { const mid = (lo + hi) / 2; if (above(mid)) lo = mid; else hi = mid; }
    return hi;
  }
  return Infinity;
}

/**
 * @param {ArrayLike<number>} origin
 * @param {ArrayLike<number>} dir
 * @param {number} max
 * @param {any} collider
 */
export function rayHit(origin, dir, max, collider) {
  let best = Infinity;
  try { const m = collider?.raycast?.(origin, dir, max); if (Number.isFinite(m) && m >= 0) best = m; } catch {}
  return Math.min(best, groundHit(origin, dir, Math.min(max, best), collider));
}
