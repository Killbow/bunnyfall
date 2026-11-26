// @ts-check
// Lays the Bantha jungle over the pixel layout in four layers. Every draw hashes a world tile or cell, so each tree
// lands in the same place on every client and on the worker. A jungle tree is a rainforest Tree flat carrying
// `jungle` (species) and `js` (scale).
import {
  tileDraw, forestCover, placesPull, groundAt, isTreeRecord, TREE_RECORDS, SLOPE_SINK_RATIO, NATURE_CLEARANCE,
} from './terrainNature.js';
import { HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE, TERRAIN_SIZE, SCALED_BEACH_ELEVATION } from './terrainSampler.js';
import { WORLD_MAP_TILE_DIM, sampleHeight } from './terrainTiles.js';
import { jungleDepthAt, jungleShare, JUNGLE_EDGE, JUNGLE_WANDER_MAX } from './jungle/jungleRegion.js';
import { JUNGLE_ARCHIVE, JUNGLE_SPECIES, JUNGLE_MEASURES } from './jungle/jungleModels.js';
import { trailClear, trailsReach } from './jungle/jungleTrails.js';
import { standPairs, JUNGLE_ROADSIDE } from './jungle/jungleRoadside.js';
import { ecoNoise, ecoOrigin } from './ecotone.js';

export const JUNGLE = Object.freeze({
  // `cell` must be a power of two dividing 128 so cells never straddle a pixel.
  cell: 2,
  canopy: 0.9,
  glade: Object.freeze({ off: Object.freeze([4096.5, -2048.5]), edge: Object.freeze([0.385, 0.44]) }),
  emergent: 0.08,
  emergentScale: Object.freeze([1.28, 1.55]),
  canopyScale: Object.freeze([0.8, 1.18]),
  under: 0.16,
  gapUnder: 0.42,
  underScale: Object.freeze([0.36, 0.62]),
  underClear: 4.5,
  crown: 9,
  palm: 0.05,
  cover: 0.5,
  gladeCover: 0.68,
  coverClear: 2.2,
  ground: Object.freeze({ 1: 0.7, 2: 1, 3: 0.2 }),
  maxSteep: 34,
  floorSteep: 50,
  stands: Object.freeze({ octaves: Object.freeze([Object.freeze({ cell: 8, weight: 0.65 }), Object.freeze({ cell: 2, weight: 0.35 })]), stretch: 2, salt: 541 }),
  inset: Object.freeze([0.25, 0.75]),
  underInset: Object.freeze([0.2, 0.8]),
  tileInset: Object.freeze([0.1, 0.9]),
  base: Object.freeze([1.0, 0.75, 1.0, 0.45, 0.95]),
  // Must divide 128 so groves stay continuous across pixel edges.
  grove: Object.freeze({ cell: 32, floor: 0.25, gain: 1.5, salt: 523 }),
  low: 25,
  high: 120,
  lowland: Object.freeze([1.8, 0.7, 1.4, 1.0, 0.7]),
  upland: Object.freeze([0.6, 1.6, 0.9, 0.8, 1.5]),
  light: 3,
  emergents: Object.freeze([Object.freeze([1, 1.0]), Object.freeze([4, 0.8])]),
  young: Object.freeze([Object.freeze([3, 0.5]), Object.freeze([2, 0.25]), Object.freeze([0, 0.15]), Object.freeze([4, 0.1])]),
});

export const JUNGLE_PALMS = TREE_RECORDS[JUNGLE_ARCHIVE];
export const JUNGLE_COVER = Object.freeze(Array.from({ length: 31 }, (_, i) => i + 1).filter((r) => !isTreeRecord(JUNGLE_ARCHIVE, r)));

const TAN_MAX_SQ = Math.tan(JUNGLE.maxSteep * Math.PI / 180) ** 2;
const TAN_FLOOR_SQ = Math.tan(JUNGLE.floorSteep * Math.PI / 180) ** 2;

export function jungleStandNoise(origin, tx, tz) {
  const S = JUNGLE.stands;
  let n = 0;
  for (let k = 0; k < S.octaves.length; k++) n += S.octaves[k].weight * ecoNoise(origin, tx, tz, S.octaves[k].cell, S.salt + k);
  return Math.min(1, Math.max(0, (n - 0.5) * S.stretch + 0.5));
}

export const canopySite = (wx, wz) => (((wx + wz) / JUNGLE.cell) & 1) === 0;

export function jungleWhole(nine) {
  if (!nine) return false;
  let lo = Infinity;
  for (let k = 0; k < 9; k++) lo = Math.min(lo, nine[k]);
  return lo * TERRAIN_SIZE - JUNGLE_WANDER_MAX >= JUNGLE_EDGE.in;
}
const BEACH_M = SCALED_BEACH_ELEVATION * STREAMING_TERRAIN_SCALE;

const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function pick(weights, draw) {
  let sum = 0;
  for (const w of weights) sum += w;
  let at = draw * sum;
  for (let i = 0; i < weights.length; i++) { at -= weights[i]; if (at < 0) return i; }
  return weights.length - 1;
}

/**
 * @param {number[]} origin
 * @param {number} tx
 * @param {number} tz
 * @param {number} above
 * @param {number} light
 * @param {number} draw
 */
export function canopySpecies(origin, tx, tz, above, light, draw) {
  const lowW = 1 - smoothstep(0, JUNGLE.low, above), highW = smoothstep(JUNGLE.low, JUNGLE.high, above);
  const w = JUNGLE.base.map((b, s) => {
    const grove = JUNGLE.grove.floor + JUNGLE.grove.gain * ecoNoise(origin, tx, tz, JUNGLE.grove.cell, JUNGLE.grove.salt + s);
    const ground = lerp(1, JUNGLE.lowland[s], lowW) * lerp(1, JUNGLE.upland[s], highW);
    return b * grove * ground * (s === 3 ? 1 + JUNGLE.light * light : 1);
  });
  return pick(w, draw);
}

const fromPool = (pool, draw) => pool[pick(pool.map((p) => p[1]), draw)][0];

export const GLADE_LATTICE = 4;
/**
 * @param {number} px
 * @param {number} py
 */
export function gladeField(px, py) {
  const L = GLADE_LATTICE, n = WORLD_MAP_TILE_DIM / L + 1;
  const ox = px * WORLD_MAP_TILE_DIM + JUNGLE.glade.off[0], oz = -py * WORLD_MAP_TILE_DIM + JUNGLE.glade.off[1];
  const g = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = forestCover(ox + i * L, oz + j * L);
  return (x, y) => {
    const fx = x / L, fy = y / L;
    const i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fy));
    const u = fx - i, v = fy - j;
    return (g[j * n + i] * (1 - u) + g[j * n + i + 1] * u) * (1 - v) + (g[(j + 1) * n + i] * (1 - u) + g[(j + 1) * n + i + 1] * u) * v;
  };
}

/**
 * @param {Float32Array} share
 * @param {Float32Array} groundOf
 * @param {Float32Array} g2Of
 * @param {Float32Array} openOf
 */
export const pairTile = (share, groundOf, g2Of, openOf) => (tx, ty) => {
  const ti = ty * WORLD_MAP_TILE_DIM + tx;
  return share[ti] >= 1 && groundOf[ti] > 0 && g2Of[ti] <= TAN_MAX_SQ && openOf[ti] === 0;
};

/**
 * @param {Array<any>} own
 * @param {Float32Array} heightmapData
 * @param {Uint8Array} tilemapData
 * @param {{ mapPixelX: number, mapPixelY: number, locationRect: any, beach?: ?Float32Array, jungle?: ?{ nine: ArrayLike<number>, pois?: any[], paths?: ?Uint8Array, net?: any } }} opts
 */
export const withJungle = (own, heightmapData, tilemapData, opts) => jungleLayout(own, heightmapData, tilemapData, opts).flats;

/**
 * @param {Array<any>} own
 * @param {Float32Array} heightmapData
 * @param {Uint8Array} tilemapData
 * @param {Parameters<typeof withJungle>[3]} opts
 * @returns {{ flats: Array<any>, pairs: ReturnType<typeof standPairs> }}
 */
export function jungleLayout(own, heightmapData, tilemapData, opts) {
  const jg = opts.jungle;
  if (!jg?.nine) return { flats: own, pairs: [] };
  let hi = -Infinity;
  for (let k = 0; k < 9; k++) hi = Math.max(hi, jg.nine[k]);
  if (hi * TERRAIN_SIZE + JUNGLE_WANDER_MAX <= -JUNGLE_EDGE.out) return { flats: own, pairs: [] };
  const whole = jungleWhole(jg.nine);
  const tDim = WORLD_MAP_TILE_DIM, hDim = HEIGHTMAP_DIMENSION, scale = TERRAIN_SIZE / tDim;
  const px = opts.mapPixelX, py = opts.mapPixelY;
  const ox = px * tDim, oz = -py * tDim;
  const origin = ecoOrigin(px, py);
  const share = new Float32Array(tDim * tDim);
  const mine = new Uint8Array(tDim * tDim);
  let any = false;
  for (let y = 0; y < tDim; y++) {
    for (let x = 0; x < tDim; x++) {
      const j = whole ? 1 : jungleShare(jungleDepthAt(px, py, jg.nine, (x + 0.5) * scale, (y + 0.5) * scale));
      if (j <= 0) continue;
      share[y * tDim + x] = j;
      if (j >= 1 || jungleStandNoise(origin, x + 0.5, y + 0.5) < j) { mine[y * tDim + x] = 1; any = true; }
    }
  }
  if (!any) return { flats: own, pairs: [] };

  const yScale = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  const cell = TERRAIN_SIZE / (hDim - 1);
  const at = (a, b) => heightmapData[a * hDim + b] * yScale;
  const clear = [opts.locationRect, ...(jg.pois ?? [])].filter((r) => r && r.xMax > r.xMin && r.yMax > r.yMin).map((r) => ({
    xMin: r.xMin - NATURE_CLEARANCE, xMax: r.xMax + NATURE_CLEARANCE, yMin: r.yMin - NATURE_CLEARANCE, yMax: r.yMax + NATURE_CLEARANCE,
  }));
  const pois = jg.pois ?? [];
  const paths = jg.paths ?? null;
  const groundOf = new Float32Array(tDim * tDim), g2Of = new Float32Array(tDim * tDim), lightOf = new Float32Array(tDim * tDim);
  const gladeOf = new Float32Array(tDim * tDim), openOf = new Float32Array(tDim * tDim);
  const glade = gladeField(px, py);
  for (let y = 0; y < tDim; y++) {
    for (let x = 0; x < tDim; x++) {
      const ti = y * tDim + x;
      if (!mine[ti]) continue;
      const ground = JUNGLE.ground[tilemapData[ti] & 0x3f];
      if (!ground || paths?.[ti]) continue;
      if (clear.some((r) => x >= r.xMin && x < r.xMax && y >= r.yMin && y < r.yMax)) continue;
      const hl = at(Math.max(0, x - 1), y), hr = at(Math.min(hDim - 1, x + 1), y);
      const hd = at(x, Math.max(0, y - 1)), hu = at(x, Math.min(hDim - 1, y + 1));
      const gx = (hr - hl) / (2 * cell), gz = (hu - hd) / (2 * cell);
      const g2 = gx * gx + gz * gz;
      if (g2 > TAN_FLOOR_SQ) continue;
      const hx = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (x / tDim))));
      const hy = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (y / tDim))));
      if (sampleHeight((opts.beach ?? heightmapData)[hy + hx * hDim]) < SCALED_BEACH_ELEVATION) continue;
      groundOf[ti] = ground;
      g2Of[ti] = g2;
      const closed = smoothstep(JUNGLE.glade.edge[0], JUNGLE.glade.edge[1], glade(x, y)), pull = placesPull(pois, x, y);
      lightOf[ti] = 1 - Math.min(1, Math.max(0, closed + pull));
      gladeOf[ti] = 1 - closed;
      openOf[ti] = Math.min(1, Math.max(0, -pull));
    }
  }
  const placeAt = (mx, mz, g2) => groundAt(heightmapData, mx, mz) - Math.atan(Math.sqrt(g2)) * (180 / Math.PI) / SLOPE_SINK_RATIO;
  const trails = whole || trailsReach(jg.nine);
  const onTrail = (ti, mx, mz, species, js) => trails && share[ti] >= 1 && !trailClear(px, py, mx, mz, JUNGLE_MEASURES[species].foot * js);
  // Pairs are placed before the other layers so every later tree and plant keeps its trunk `JUNGLE_ROADSIDE.clear`
  // off theirs.
  const pairs = jg.net ? standPairs({
    px, py, net: jg.net, heightmapData,
    tileOk: pairTile(share, groundOf, g2Of, openOf),
    trailOk: (x, z, r) => !trails || trailClear(px, py, x, z, r),
  }) : [];
  const pairTrunks = [], nearPairTile = pairs.length ? new Uint8Array(tDim * tDim) : null;
  for (const p of pairs) {
    for (const t of p.trees) {
      pairTrunks.push(t.x, t.z, p.js);
      const reach = Math.ceil((JUNGLE_ROADSIDE.clear * p.js) / scale) + 1;
      const tx = Math.floor(t.x / scale), ty = Math.floor(t.z / scale);
      for (let y = Math.max(0, ty - reach); y <= Math.min(tDim - 1, ty + reach); y++) nearPairTile.fill(1, y * tDim + Math.max(0, tx - reach), y * tDim + Math.min(tDim - 1, tx + reach) + 1);
    }
  }
  const nearPair = (mx, mz, clear) => {
    if (!nearPairTile?.[Math.min(tDim - 1, Math.floor(mz / scale)) * tDim + Math.min(tDim - 1, Math.floor(mx / scale))]) return false;
    for (let i = 0; i < pairTrunks.length; i += 3) {
      const dx = mx - pairTrunks[i], dz = mz - pairTrunks[i + 1], r = clear * pairTrunks[i + 2];
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };

  const out = own.filter((f) => !mine[Math.min(tDim - 1, Math.floor(f.z / scale + 1e-6)) * tDim + Math.min(tDim - 1, Math.floor(f.x / scale + 1e-6))]);

  const C = JUNGLE.cell, cells = tDim / C;
  const trunks = new Float32Array(cells * cells * 3).fill(NaN);
  const [in0, in1] = JUNGLE.inset;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const wx = ox + cx * C, wz = oz + cy * C;
      if (!canopySite(wx, wz)) continue;
      const tx = cx * C + C * (in0 + (in1 - in0) * tileDraw(wx, wz, 20));
      const tz = cy * C + C * (in0 + (in1 - in0) * tileDraw(wx, wz, 21));
      const ti = Math.floor(tz) * tDim + Math.floor(tx);
      if (!groundOf[ti] || g2Of[ti] > TAN_MAX_SQ) continue;
      const light = lightOf[ti];
      if (tileDraw(wx, wz, 22) >= JUNGLE.canopy * share[ti] * (1 - light) * groundOf[ti]) continue;
      const mx = tx * scale, mz = tz * scale;
      const above = groundAt(heightmapData, mx, mz) - BEACH_M;
      const emergent = tileDraw(wx, wz, 23) < JUNGLE.emergent;
      const species = emergent ? fromPool(JUNGLE.emergents, tileDraw(wx, wz, 24)) : canopySpecies(origin, tx, tz, above, light, tileDraw(wx, wz, 24));
      const [s0, s1] = emergent ? JUNGLE.emergentScale : JUNGLE.canopyScale;
      const js = s0 + (s1 - s0) * tileDraw(wx, wz, 25);
      if (onTrail(ti, mx, mz, species, js)) continue;
      if (nearPair(mx, mz, JUNGLE_ROADSIDE.clear)) continue;
      const k = (cy * cells + cx) * 3;
      trunks[k] = mx; trunks[k + 1] = mz; trunks[k + 2] = js;
      out.push({ record: JUNGLE_SPECIES[species].record, x: mx, y: placeAt(mx, mz, g2Of[ti]), z: mz, wood: 1, archive: JUNGLE_ARCHIVE, jungle: species, js });
    }
  }

  // A neighbor pixel cell is read from its pure tile hashes and treated as standing, so nothing here crowds a trunk
  // across the edge.
  const _t = [0, 0, 0];
  const trunkAt = (i, j, t) => {
    if (i >= 0 && i < cells && j >= 0 && j < cells) {
      const k = (j * cells + i) * 3;
      if (Number.isNaN(trunks[k])) return false;
      t[0] = trunks[k]; t[1] = trunks[k + 1]; t[2] = trunks[k + 2];
      return true;
    }
    const wx = ox + i * C, wz = oz + j * C;
    if (!canopySite(wx, wz)) return false;
    t[0] = (i * C + C * (in0 + (in1 - in0) * tileDraw(wx, wz, 20))) * scale;
    t[1] = (j * C + C * (in0 + (in1 - in0) * tileDraw(wx, wz, 21))) * scale;
    const [s0, s1] = tileDraw(wx, wz, 23) < JUNGLE.emergent ? JUNGLE.emergentScale : JUNGLE.canopyScale;
    t[2] = s0 + (s1 - s0) * tileDraw(wx, wz, 25);
    return true;
  };
  const crowded = (mx, mz, cx, cy, clear) => {
    for (let j = cy - 1; j <= cy + 1; j++) {
      for (let i = cx - 1; i <= cx + 1; i++) {
        if (!trunkAt(i, j, _t)) continue;
        const dx = mx - _t[0], dz = mz - _t[1], r = clear * _t[2];
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  };

  const [u0, u1] = JUNGLE.underInset;
  const taken = new Uint8Array(tDim * tDim);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const wx = ox + cx * C, wz = oz + cy * C;
      const tx = cx * C + C * (u0 + (u1 - u0) * tileDraw(wx, wz, 40)), tz = cy * C + C * (u0 + (u1 - u0) * tileDraw(wx, wz, 41));
      const ti = Math.floor(tz) * tDim + Math.floor(tx), ground = groundOf[ti];
      if (!ground) continue;
      const mx = tx * scale, mz = tz * scale, g2 = g2Of[ti], j = share[ti];
      const fields = 1 - openOf[ti];
      const gap = !crowded(mx, mz, cx, cy, JUNGLE.crown);
      const under = g2 > TAN_MAX_SQ ? 0 : (gap ? JUNGLE.gapUnder : JUNGLE.under) * j * ground * fields;
      const palm = JUNGLE.palm * j * ground * fields;
      const roll = tileDraw(wx, wz, 42);
      if (roll >= under + palm || crowded(mx, mz, cx, cy, JUNGLE.underClear)) continue;
      if (nearPair(mx, mz, JUNGLE_ROADSIDE.clear)) continue;
      if (roll < under) {
        const species = fromPool(JUNGLE.young, tileDraw(wx, wz, 43));
        const [s0, s1] = JUNGLE.underScale;
        const js = s0 + (s1 - s0) * tileDraw(wx, wz, 44);
        if (onTrail(ti, mx, mz, species, js)) continue;
        out.push({ record: JUNGLE_SPECIES[species].record, x: mx, y: placeAt(mx, mz, g2), z: mz, wood: 1, archive: JUNGLE_ARCHIVE, jungle: species, js });
      } else {
        out.push({ record: JUNGLE_PALMS[Math.floor(tileDraw(wx, wz, 45) * JUNGLE_PALMS.length)], x: mx, y: placeAt(mx, mz, g2), z: mz, wood: 1, archive: JUNGLE_ARCHIVE });
      }
      taken[ti] = 1;
    }
  }

  const [t0, t1] = JUNGLE.tileInset;
  for (let y = 0; y < tDim; y++) {
    for (let x = 0; x < tDim; x++) {
      const ti = y * tDim + x, ground = groundOf[ti];
      if (!ground || taken[ti]) continue;
      const wx = ox + x, wz = oz + y;
      const cx = Math.floor(x / C), cy = Math.floor(y / C);
      const mx = (x + t0 + (t1 - t0) * tileDraw(wx, wz, 30)) * scale, mz = (y + t0 + (t1 - t0) * tileDraw(wx, wz, 31)) * scale;
      const cover = lerp(JUNGLE.cover, JUNGLE.gladeCover, gladeOf[ti]) * share[ti] * ground;
      if (tileDraw(wx, wz, 32) >= cover || crowded(mx, mz, cx, cy, JUNGLE.coverClear) || nearPair(mx, mz, JUNGLE.coverClear)) continue;
      out.push({ record: JUNGLE_COVER[Math.floor(tileDraw(wx, wz, 36) * JUNGLE_COVER.length)], x: mx, y: placeAt(mx, mz, g2Of[ti]), z: mz, wood: 1, archive: JUNGLE_ARCHIVE });
    }
  }
  return { flats: out, pairs };
}
