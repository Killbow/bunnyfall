// A trail is where a warped value-noise field on the world tile lattice crosses its middle value. Trails therefore
// match across pixel edges and between the worker and the main thread. They paint dirt corners before the marching
// squares run and add tiles to `paths`, but never change heights.
import { ecoHash } from '../ecotone.js';
import { jungleDepthAt, JUNGLE_EDGE, JUNGLE_WANDER_MAX } from './jungleRegion.js';
import { TERRAIN_SIZE } from '../terrainSampler.js';
import { WORLD_MAP_TILE_DIM, WATER, DIRT } from '../terrainTiles.js';

export const JUNGLE_TRAILS = Object.freeze({
  // Each lattice turn uses a Pythagorean triple so the cosine and sine are exact on every engine, unlike
  // `Math.cos`. Six times `amp` must stay under `cell` so the warp never folds a trail.
  families: Object.freeze([
    Object.freeze({ cell: 176, salt: 701, turn: Object.freeze([4 / 5, 3 / 5]), warp: Object.freeze({ cell: 112, amp: 18 }) }),
    Object.freeze({ cell: 240, salt: 709, turn: Object.freeze([12 / 13, -5 / 13]), warp: Object.freeze({ cell: 160, amp: 26 }) }),
  ]),
  gap: 0.1,
  // Must exceed half a tile diagonal (0.71) so the dirt stays unbroken at any heading.
  half: 0.75,
  block: 4,
});

const s3 = (t) => t * t * (3 - 2 * t), ds3 = (t) => 6 * t * (1 - t);
const lattice = (ix, iz, salt) => {
  const v = ecoHash(ix, iz, salt) * (1 - 2 * JUNGLE_TRAILS.gap);
  return v < 0.5 - JUNGLE_TRAILS.gap ? v : v + 2 * JUNGLE_TRAILS.gap;
};
function valueNoise(x, z, cell, salt, out) {
  const qx = x / cell, qz = z / cell, ix = Math.floor(qx), iz = Math.floor(qz), fx = qx - ix, fz = qz - iz;
  const a = lattice(ix, iz, salt), b = lattice(ix + 1, iz, salt), c = lattice(ix, iz + 1, salt), d = lattice(ix + 1, iz + 1, salt);
  const ux = s3(fx), uz = s3(fz), top = a + (b - a) * ux, bot = c + (d - c) * ux;
  out[0] = top + (bot - top) * uz;
  out[1] = ((b - a) * (1 - uz) + (d - c) * uz) * ds3(fx) / cell;
  out[2] = (bot - top) * ds3(fz) / cell;
}

export const warpStretch = (fam) => 1 + (2 * fam.warp.amp * 3) / fam.warp.cell;
const steepest = (fam) => ((1.5 * Math.SQRT2) / fam.cell) * warpStretch(fam);

const _u = [0, 0, 0], _v = [0, 0, 0], _f = [0, 0, 0];
function field(wx, wz, fam) {
  const [c, s] = fam.turn;
  const x = c * wx - s * wz, z = s * wx + c * wz;
  valueNoise(x, z, fam.warp.cell, fam.salt + 1, _u);
  valueNoise(x, z, fam.warp.cell, fam.salt + 2, _v);
  const A = 2 * fam.warp.amp;
  valueNoise(x + A * (_u[0] - 0.5), z + A * (_v[0] - 0.5), fam.cell, fam.salt, _f);
  return A;
}
function familyDistance(wx, wz, fam) {
  const A = field(wx, wz, fam);
  const gx = _f[1] * (1 + A * _u[1]) + _f[2] * A * _v[1];
  const gz = _f[1] * A * _u[2] + _f[2] * (1 + A * _v[2]);
  const off = Math.abs(_f[0] - 0.5), g = Math.sqrt(gx * gx + gz * gz);
  return g > 0 ? off / g : (off > 0 ? Infinity : 0);
}

export function trailDistance(wx, wz) {
  let d = Infinity;
  for (const fam of JUNGLE_TRAILS.families) d = Math.min(d, familyDistance(wx, wz, fam));
  return d;
}

const NB = WORLD_MAP_TILE_DIM / JUNGLE_TRAILS.block;
let _blocksOf = -1, _blocksPy = 0, _blocks = new Float64Array(0);
/**
 * Each floor is a strict lower bound because the field changes no faster than `steepest`. Only the last pixel is
 * cached, because the painter and the trees read the same pixel in turn.
 * @returns {Float64Array}
 */
export function trailBlocks(px, py) {
  if (_blocksOf === px && _blocksPy === py) return _blocks;
  const B = JUNGLE_TRAILS.block, H = B / 2, R = Math.SQRT2 * H, ox = px * WORLD_MAP_TILE_DIM, oz = -py * WORLD_MAP_TILE_DIM;
  const fams = JUNGLE_TRAILS.families, out = new Float64Array(fams.length * NB * NB);
  fams.forEach((fam, k) => {
    for (let j = 0; j < NB; j++) {
      for (let i = 0; i < NB; i++) {
        field(ox + i * B + H, oz + j * B + H, fam);
        out[(k * NB + j) * NB + i] = Math.abs(_f[0] - 0.5) / steepest(fam) - R - 1e-9;
      }
    }
  });
  _blocksOf = px; _blocksPy = py; _blocks = out;
  return out;
}

export function trailRoom(px, py, x, z) {
  const scale = TERRAIN_SIZE / WORLD_MAP_TILE_DIM;
  return Math.max(0, (trailDistance(px * WORLD_MAP_TILE_DIM + x / scale, -py * WORLD_MAP_TILE_DIM + z / scale) - JUNGLE_TRAILS.half) * scale);
}

export function trailClear(px, py, x, z, reach) {
  const scale = TERRAIN_SIZE / WORLD_MAP_TILE_DIM, bx = Math.floor(x / scale / JUNGLE_TRAILS.block), bz = Math.floor(z / scale / JUNGLE_TRAILS.block);
  if (bx >= 0 && bx < NB && bz >= 0 && bz < NB) {
    const blocks = trailBlocks(px, py), need = JUNGLE_TRAILS.half + reach / scale;
    let far = true;
    for (let k = 0; k < JUNGLE_TRAILS.families.length; k++) if (blocks[(k * NB + bz) * NB + bx] < need) far = false;
    if (far) return true;
  }
  return trailRoom(px, py, x, z) >= reach;
}

export function trailsReach(nine) {
  let hi = -Infinity;
  for (let k = 0; k < 9; k++) hi = Math.max(hi, nine[k]);
  return hi * TERRAIN_SIZE + JUNGLE_WANDER_MAX >= JUNGLE_EDGE.in;
}

/**
 * @param {Uint8Array} tileData
 * @param {Uint8Array} tilemap
 * @param {?Uint8Array} paths
 * @param {{ px: number, py: number, nine: ArrayLike<number>, whole?: boolean, rect?: ?{ xMin: number, xMax: number, yMin: number, yMax: number } }} at
 */
export function paintJungleTrails(tileData, tilemap, paths, { px, py, nine, whole = false, rect = null }) {
  if (!nine || (!whole && !trailsReach(nine))) return paths;
  const T = WORLD_MAP_TILE_DIM, D = T + 1, scale = TERRAIN_SIZE / T, ox = px * T, oz = -py * T;
  const B = JUNGLE_TRAILS.block, fams = JUNGLE_TRAILS.families, near = [], blocks = trailBlocks(px, py);
  const on = new Uint8Array(D * D);
  let n = 0;
  for (let by = 0; by < T; by += B) {
    for (let bx = 0; bx < T; bx += B) {
      near.length = 0;
      fams.forEach((fam, k) => { if (blocks[(k * NB + by / B) * NB + bx / B] <= JUNGLE_TRAILS.half) near.push(fam); });
      if (!near.length) continue;
      for (let y = by; y < (by + B === T ? D : by + B); y++) {
        for (let x = bx; x < (bx + B === T ? D : bx + B); x++) {
          const i = x + y * D;
          if (tileData[i] === WATER) continue;
          if (rect && x >= rect.xMin && x <= rect.xMax && y >= rect.yMin && y <= rect.yMax) continue;
          let d = Infinity;
          for (const fam of near) d = Math.min(d, familyDistance(ox + x, oz + y, fam));
          if (d > JUNGLE_TRAILS.half) continue;
          if (!whole && jungleDepthAt(px, py, nine, x * scale, y * scale) < JUNGLE_EDGE.in) continue;
          on[i] = 1;
          tileData[i] = DIRT;
          n++;
        }
      }
    }
  }
  if (!n) return paths;
  paths ??= new Uint8Array(T * T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const t = y * T + x, i = x + y * D;
      if (tilemap[t] === 0 && on[i] + on[i + 1] + on[i + D] + on[i + D + 1] >= 2) paths[t] = 1;
    }
  }
  return paths;
}
