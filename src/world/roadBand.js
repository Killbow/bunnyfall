// @ts-check
// The verge band Basic Roads paints for a road or track, shared by the main and terrain-worker threads.
import { pathsDataPoint, MP_WORLD_UNITS, N, NE, E, SE, S, SW, W, NW } from './pathData.js';
import { MAP_W, MAP_H } from './roadNetwork.js';
import { PATH_HALF_WIDTH, UNITS_PER_METRE } from './roadClearance.js';

export const PATH_HALF_M = PATH_HALF_WIDTH / UNITS_PER_METRE;
const PIXEL_M = MP_WORLD_UNITS / UNITS_PER_METRE;
const HALF_M = PIXEL_M / 2;
export const ARMS = Object.freeze([[N, 0, 1], [NE, 1, 1], [E, 1, 0], [SE, 1, -1], [S, 0, -1], [SW, -1, -1], [W, -1, 0], [NW, -1, 1]]);

/**
 * @param {object|null} net
 * @param {number} px
 * @param {number} py
 * @param {number} x
 * @param {number} z
 * @param {number} reach
 */
export function roadRoom(net, px, py, x, z, reach) {
  if (!net || !(reach > 0)) return Math.max(0, reach);
  const g = PATH_HALF_M + reach;
  const ix0 = Math.max(-px, Math.floor((x - g) / PIXEL_M)), ix1 = Math.min(MAP_W - 1 - px, Math.floor((x + g) / PIXEL_M));
  const iz0 = Math.max(py - (MAP_H - 1), Math.floor((z - g) / PIXEL_M)), iz1 = Math.min(py, Math.floor((z + g) / PIXEL_M));
  let room = reach;
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const bits = pathsDataPoint(net, px + ix, py - iz);
      if (!bits) continue;
      const qx = x - (ix * PIXEL_M + HALF_M), qz = z - (iz * PIXEL_M + HALF_M);
      for (const [bit, sx, sz] of ARMS) {
        if (!(bits & bit)) continue;
        const ex = sx * HALF_M, ez = sz * HALF_M;
        const t = Math.min(1, Math.max(0, (qx * ex + qz * ez) / (ex * ex + ez * ez)));
        const d = Math.hypot(qx - t * ex, qz - t * ez) - PATH_HALF_M;
        if (d < room) room = Math.max(0, d);
      }
    }
  }
  return room;
}
