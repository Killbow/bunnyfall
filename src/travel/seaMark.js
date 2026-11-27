// @ts-check
// The route planner reads one heightmap byte per map pixel, but near a coast the built terrain of that pixel can be
// land where the byte says water. A sailed leg is therefore aimed at the nearest 5 by 5 tile block of water on the
// built terrain.

import { MP_WORLD_UNITS, T_SIZE as TILE } from './travelPaths.js';

export const PIXEL_TILES = MP_WORLD_UNITS / TILE;
export const MARK_BLOCK_HALF = 2;
export const SEA_LEG_UNBUILT = Object.freeze({ unbuilt: true });
export const SEA_LEG_DRY = Object.freeze({ dry: true });

/**
 * @param {{ x: number, z: number }} origin
 * @param {((x: number, z: number) => boolean | null) | null | undefined} waterAt
 * @returns {{ x: number, z: number } | typeof SEA_LEG_UNBUILT | typeof SEA_LEG_DRY | null}
 */
export function seaLegMark(origin, waterAt) {
  if (typeof waterAt !== 'function') return null;
  const floats = (/** @type {number} */ x, /** @type {number} */ z) => {
    for (let a = -MARK_BLOCK_HALF; a <= MARK_BLOCK_HALF; a++) for (let b = -MARK_BLOCK_HALF; b <= MARK_BLOCK_HALF; b++) if (!waterAt(x + a * TILE, z + b * TILE)) return false;
    return true;
  };
  const mid = PIXEL_TILES / 2;
  const at = (/** @type {number} */ i, /** @type {number} */ j) => ({ x: origin.x + (i + 0.5) * TILE, z: origin.z + (j + 0.5) * TILE });
  const centre = { x: origin.x + MP_WORLD_UNITS / 2, z: origin.z + MP_WORLD_UNITS / 2 };
  if (waterAt(centre.x, centre.z) === null) return SEA_LEG_UNBUILT;
  if (floats(centre.x, centre.z)) return null;
  const lo = MARK_BLOCK_HALF, hi = PIXEL_TILES - 1 - MARK_BLOCK_HALF;
  /** @type {{ x: number, z: number } | null} */
  let best = null, bestD = Infinity;
  for (let r = 0; r <= mid; r++) {
    if ((r - 1) * TILE > bestD) break;
    for (let i = mid - 1 - r; i <= mid + r; i++) {
      for (let j = mid - 1 - r; j <= mid + r; j++) {
        const onRing = i === mid - 1 - r || i === mid + r || j === mid - 1 - r || j === mid + r;
        if (!onRing || i < lo || i > hi || j < lo || j > hi) continue;
        const p = at(i, j), d = Math.hypot(p.x - centre.x, p.z - centre.z);
        if (d < bestD && floats(p.x, p.z)) { best = p; bestD = d; }
      }
    }
  }
  return best ?? SEA_LEG_DRY;
}
