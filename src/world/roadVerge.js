// Keeps a wilderness flat's whole footprint off roads and tracks: it is placed only where its reach meets none.

import { MP_WORLD_UNITS } from './pathData.js';
import { UNITS_PER_METRE } from './roadClearance.js';
import { roadRoom } from './roadBand.js';
import { LPT_CROWNS } from './lptCrowns.js';
import { lptVariety } from './lowPolyTrees.js';
import { getNatureArchive, SEASON } from './climateSwaps.js';
import { TILE } from './roadPainter.js';

const PIXEL_M = MP_WORLD_UNITS / UNITS_PER_METRE;
export { PATH_HALF_M, ARMS, roadRoom } from './roadBand.js';

export const vergeClear = (net, px, py, x, z, radius) => roadRoom(net, px, py, x, z, radius) >= radius;

/**
 * @param {number} baseArchive
 * @param {number} record
 */
export function lptCrownOf(baseArchive, record) {
  let crown = 0;
  for (const season of [SEASON.Summer, SEASON.Winter]) crown = Math.max(crown, LPT_CROWNS[`${getNatureArchive(baseArchive, season)}_${record}`] ?? 0);
  return crown;
}

/**
 * @param {number} halfWidth
 * @param {number} baseArchive
 * @param {number} record
 * @param {number} px
 * @param {number} py
 * @param {number} x
 * @param {number} z
 */
export function natureReach(halfWidth, baseArchive, record, px, py, x, z) {
  const crown = lptCrownOf(baseArchive, record);
  return Math.max(halfWidth, crown > 0 ? crown * lptVariety(px, py, x, z, false).scale : 0);
}

export const TILE_M = PIXEL_M / 128;
export const LPT_FIT_FLOOR = 0.2;

/**
 * @param {Uint8Array} tilemap
 * @param {?Uint8Array} paths
 */
export function pathTileMask(tilemap, paths = null) {
  const out = new Uint8Array(tilemap.length);
  for (let i = 0; i < tilemap.length; i++) {
    const rec = tilemap[i] & 0x3f;
    out[i] = (paths && paths[i]) || rec === TILE.road || rec === TILE.roadDirt || rec === TILE.roadGrass ? 1 : 0;
  }
  return out;
}

/**
 * @param {Uint8Array} mask
 * @param {number} x
 * @param {number} z
 * @param {number} reach
 */
export function tileRoom(mask, x, z, reach) {
  if (!(reach > 0)) return Math.max(0, reach);
  const n = Math.ceil(reach / TILE_M);
  const cx = Math.floor(x / TILE_M), cz = Math.floor(z / TILE_M);
  let room = reach;
  for (let tz = Math.max(0, cz - n); tz <= Math.min(127, cz + n); tz++) {
    for (let tx = Math.max(0, cx - n); tx <= Math.min(127, cx + n); tx++) {
      if (!mask[tz * 128 + tx]) continue;
      const dx = Math.max(tx * TILE_M - x, 0, x - (tx + 1) * TILE_M);
      const dz = Math.max(tz * TILE_M - z, 0, z - (tz + 1) * TILE_M);
      const d = Math.hypot(dx, dz);
      if (d < room) room = d;
    }
  }
  return room;
}

/**
 * @param {?Uint8Array} mask
 * @param {?object} net
 * @param {number} px
 * @param {number} py
 * @param {number} x
 * @param {number} z
 * @param {number} crown
 * @param {number} widest
 */
export function lptFitCap(mask, net, px, py, x, z, crown, widest) {
  if (!(crown > 0)) return Infinity;
  const reach = crown * widest;
  let room = mask ? tileRoom(mask, x, z, reach) : reach;
  if (net) room = Math.min(room, roadRoom(net, px, py, x, z, reach));
  return room >= reach ? Infinity : Math.max(LPT_FIT_FLOOR, room / crown);
}

/**
 * @param {ReadonlyArray<{c: ArrayLike<number>, r: number}>|null} solids
 * @param {number} x
 * @param {number} z
 * @param {number} trunk
 * @param {number} widest
 */
export function lptTrunkCap(solids, x, z, trunk, widest) {
  if (!(trunk > 0) || !solids?.length) return Infinity;
  let room = Infinity;
  for (const s of solids) room = Math.min(room, Math.hypot(s.c[0] - x, s.c[2] - z) - s.r);
  return room >= trunk * widest ? Infinity : Math.max(LPT_FIT_FLOOR, room / trunk);
}
