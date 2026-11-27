// Nature flat scatter for one wilderness map pixel, ported from DFU's DefaultTerrainNature.LayoutNature.
// UMRandom is seeded with the terrain key, so the scatter is deterministic per pixel.

import { UMRandom } from '../formats/umRandom.js';
import { perlinNoise } from './perlin.js';
import {
  HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE,
  TERRAIN_SIZE, SCALED_BEACH_ELEVATION,
} from './terrainSampler.js';
import { WORLD_MAP_TILE_DIM, sampleHeight } from './terrainTiles.js';
import { ecotoneOwner, ECOTONE_REACH } from './ecotone.js';

const MAX_STEEPNESS = 50;
export const SLOPE_SINK_RATIO = 70;
const BASE_CHANCE_ON_DIRT = 0.2;
const BASE_CHANCE_ON_GRASS = 0.9;
const BASE_CHANCE_ON_STONE = 0.05;
export const NATURE_CLEARANCE = 4;
const CLIMATE_TYPE_DESERT = 0;

export const TREE_RECORDS = Object.freeze({
  500: Object.freeze([12, 13, 14, 15, 16, 18, 30]),
  501: Object.freeze([11, 12, 13, 16, 30]),
  502: Object.freeze([12, 13, 15, 16, 17, 18, 30]),
  503: Object.freeze([5, 11, 12, 13, 28, 30]),
  504: Object.freeze([12, 13, 14, 15, 16, 17, 18, 25, 30]),
  506: Object.freeze([5, 11, 12, 13, 14, 15, 16, 24, 25, 30]),
  508: Object.freeze([13, 15, 16, 18, 24, 25, 30]),
  510: Object.freeze([5, 11, 12, 13, 15, 16, 24, 25, 30]),
});
export const isTreeRecord = (baseArchive, record) => !!TREE_RECORDS[baseArchive]?.includes(record);

/**
 * @param {Float32Array} heightmapData
 * @param {Uint8Array} tilemapData
 * @param {{xMin:number,xMax:number,yMin:number,yMax:number}|null} locationRect
 * @param {number} x
 * @param {number} y
 * @param {((x: number, z: number) => boolean)|null} [clear]
 * @param {?Float32Array} [beach]
 */
export function natureStandsAt(heightmapData, tilemapData, locationRect, x, y, clear = null, beach = null) {
  const hDim = HEIGHTMAP_DIMENSION;
  const tDim = WORLD_MAP_TILE_DIM;
  if (!heightmapData || !tilemapData || !(x >= 0 && x < tDim && y >= 0 && y < tDim)) return null;
  const heightScale = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  const cell = TERRAIN_SIZE / (hDim - 1);
  const at = (a, b) => heightmapData[a * hDim + b] * heightScale;
  if (locationRect && x >= locationRect.xMin - NATURE_CLEARANCE && x < locationRect.xMax + NATURE_CLEARANCE
    && y >= locationRect.yMin - NATURE_CLEARANCE && y < locationRect.yMax + NATURE_CLEARANCE) return null;
  const tile = tilemapData[y * tDim + x] & 0x3f;
  if (tile !== 1 && tile !== 2 && tile !== 3) return null;
  const hl = at(Math.max(0, x - 1), y), hr = at(Math.min(hDim - 1, x + 1), y);
  const hd = at(x, Math.max(0, y - 1)), hu = at(x, Math.min(hDim - 1, y + 1));
  const steepness = Math.atan(Math.hypot((hr - hl) / (2 * cell), (hu - hd) / (2 * cell))) * (180 / Math.PI);
  if (steepness > MAX_STEEPNESS) return null;
  const hx = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (x / tDim))));
  const hy = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (y / tDim))));
  if (sampleHeight((beach ?? heightmapData)[hy + hx * hDim]) < SCALED_BEACH_ELEVATION) return null;
  const scale = TERRAIN_SIZE / tDim;
  if (clear && !clear(x * scale, y * scale)) return null;
  return { x: x * scale, y: at(x, y) - steepness / SLOPE_SINK_RATIO, z: y * scale };
}

export const insideRocks = (rocks, x, z) => (rocks ?? []).some((b) => x > b[0] && x < b[3] && z > b[2] && z < b[5]);

/**
 * @param {ArrayLike<number>} positions
 * @param {ArrayLike<number>} indices
 * @param {ArrayLike<number>} m
 * @param {Float32Array} heightmapData
 */
export function rockFootprint(positions, indices, m, heightmapData) {
  const n = Math.floor(positions.length / 3);
  const w = new Float64Array(n * 3), above = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
    w[i * 3] = wx; w[i * 3 + 1] = wy; w[i * 3 + 2] = wz;
    above[i] = wy - groundAt(heightmapData, wx, wz);
  }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const add = (x, y, z) => {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < y0) y0 = y; if (y > y1) y1 = y;
  };
  for (let i = 0; i < n; i++) if (above[i] >= 0) add(w[i * 3], w[i * 3 + 1], w[i * 3 + 2]);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e], b = indices[t + ((e + 1) % 3)];
      if ((above[a] >= 0) === (above[b] >= 0)) continue;
      const f = above[a] / (above[a] - above[b]);
      add(w[a * 3] + (w[b * 3] - w[a * 3]) * f, w[a * 3 + 1] + (w[b * 3 + 1] - w[a * 3 + 1]) * f, w[a * 3 + 2] + (w[b * 3 + 2] - w[a * 3 + 2]) * f);
    }
  }
  return x0 <= x1 ? [x0, y0, z0, x1, y1, z1] : null;
}

/**
 * @param {Float32Array} heightmapData
 * @param {number} mx
 * @param {number} mz
 */
export function groundAt(heightmapData, mx, mz) {
  const hDim = HEIGHTMAP_DIMENSION;
  const cell = TERRAIN_SIZE / WORLD_MAP_TILE_DIM;
  const fx = Math.max(0, Math.min(hDim - 1, mx / cell)), fz = Math.max(0, Math.min(hDim - 1, mz / cell));
  const x0 = Math.min(hDim - 2, Math.floor(fx)), z0 = Math.min(hDim - 2, Math.floor(fz));
  const tx = fx - x0, tz = fz - z0;
  const h = (a, b) => heightmapData[a * hDim + b];
  const top = h(x0, z0) * (1 - tz) + h(x0, z0 + 1) * tz;
  const bot = h(x0 + 1, z0) * (1 - tz) + h(x0 + 1, z0 + 1) * tz;
  return (top * (1 - tx) + bot * tx) * MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
}

export function makeTerrainKey(mapPixelX, mapPixelY) {
  return (((mapPixelY << 16) >> 16) << 16) + ((mapPixelX << 16) >> 16);
}

/**
 * @param {Float32Array} heightmapData
 * @param {Uint8Array} tilemapData
 * @param {object} opts
 * @param {number} opts.mapPixelX
 * @param {number} opts.mapPixelY
 * @param {number} opts.rawWorldHeight
 * @param {number} opts.climateType
 * @param {{xMin,xMax,yMin,yMax}|null} opts.locationRect
 * @param {?{archive:number, pois?:Array<{xMin:number,xMax:number,yMin:number,yMax:number,hide:boolean}>}} [opts.forests]
 * @param {?Float32Array} [opts.beach]
 * @param {?{nature:ArrayLike<number>, type:ArrayLike<number>}} [opts.ecotone]
 * @returns {Array<{record:number,x:number,y:number,z:number,archive?:number}>}
 */
export function layoutNature(heightmapData, tilemapData, opts) {
  const own = forestsFor(opts.forests, opts.forests?.archive, opts.climateType)
    ? layoutForests(heightmapData, tilemapData, opts)
    : dfuScatter(heightmapData, tilemapData, opts);
  return opts.ecotone ? withEcotone(own, heightmapData, tilemapData, opts) : own;
}

const forestsFor = (forests, archive, climateType) => !!forests && climateType !== CLIMATE_TYPE_DESERT && !!TREE_RECORDS[archive];

function withEcotone(own, heightmapData, tilemapData, opts) {
  const { nature, type } = opts.ecotone;
  const keys = Array.from({ length: 9 }, (_, k) => `${nature[k]}:${type[k]}`);
  if (keys.every((k) => k === keys[4])) return own;
  const tDim = WORLD_MAP_TILE_DIM, scale = TERRAIN_SIZE / tDim;
  const px = opts.mapPixelX, py = opts.mapPixelY;
  const keyAt = (dx, dz) => keys[(dz + 1) * 3 + (dx + 1)];
  const owner = new Int8Array(tDim * tDim).fill(4);
  const reach = Math.ceil(ECOTONE_REACH / scale) + 1;
  let any = false;
  for (let y = 0; y < tDim; y++) {
    const nearZ = y < reach || y >= tDim - reach;
    for (let x = 0; x < tDim; x++) {
      if (!nearZ && x >= reach && x < tDim - reach) continue;
      const [dx, dz] = ecotoneOwner(px, py, (x + 0.5) * scale, (y + 0.5) * scale, keyAt);
      if (dx === 0 && dz === 0) continue;
      owner[y * tDim + x] = (dz + 1) * 3 + (dx + 1);
      any = true;
    }
  }
  if (!any) return own;
  const ownWoods = forestsFor(opts.forests, opts.forests?.archive, opts.climateType);
  const tileOf = ownWoods
    ? (f) => Math.min(tDim - 1, Math.floor(f.z / scale)) * tDim + Math.min(tDim - 1, Math.floor(f.x / scale))
    : (f) => Math.round(f.z / scale) * tDim + Math.round(f.x / scale);
  const out = own.filter((f) => owner[tileOf(f)] === 4);
  const woods = opts.forests ? forestTiles(heightmapData, tilemapData, opts) : null;
  const scatter = dfuTiles(heightmapData, tilemapData, opts);
  for (let i = 0; i < owner.length; i++) {
    const k = owner[i];
    if (k === 4) continue;
    const x = i % tDim, y = (i - x) / tDim, archive = nature[k];
    const f = forestsFor(opts.forests, archive, type[k])
      ? woods(x, y, TREE_RECORDS[archive], coverOf(archive))
      : scatter(x, y, type[k]);
    if (f) out.push({ ...f, archive });
  }
  return out;
}

function dfuTiles(heightmapData, tilemapData, opts) {
  const hDim = HEIGHTMAP_DIMENSION;
  const tDim = WORLD_MAP_TILE_DIM;
  const worldHeight = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  const cell = TERRAIN_SIZE / (hDim - 1);
  const heightAt = (x, y) => heightmapData[x * hDim + y] * worldHeight;
  const scale = TERRAIN_SIZE / tDim;
  const loc = opts.locationRect;
  const grown = loc && loc.xMin > 0 && loc.yMin > 0
    ? { xMin: loc.xMin - NATURE_CLEARANCE, xMax: loc.xMax + NATURE_CLEARANCE, yMin: loc.yMin - NATURE_CLEARANCE, yMax: loc.yMax + NATURE_CLEARANCE }
    : null;
  const elevationScale = Math.min(1.0, Math.max(0.4, opts.rawWorldHeight / 128));
  const ox = opts.mapPixelX * tDim, oz = -opts.mapPixelY * tDim;
  return (x, y, climateType) => {
    const hl = heightAt(Math.max(0, x - 1), y), hr = heightAt(Math.min(hDim - 1, x + 1), y);
    const hd = heightAt(x, Math.max(0, y - 1)), hu = heightAt(x, Math.min(hDim - 1, y + 1));
    const steepness = Math.atan(Math.hypot((hr - hl) / (2 * cell), (hu - hd) / (2 * cell))) * (180 / Math.PI);
    if (steepness > MAX_STEEPNESS) return null;
    if (grown && grown.xMin > 0 && grown.yMin > 0 && x >= grown.xMin && x < grown.xMax && y >= grown.yMin && y < grown.yMax) return null;
    const tile = tilemapData[y * tDim + x] & 0x3f;
    const base = tile === 1 ? BASE_CHANCE_ON_DIRT : tile === 2 ? BASE_CHANCE_ON_GRASS : tile === 3 ? BASE_CHANCE_ON_STONE : 0;
    if (!base) return null;
    const chance = base * elevationScale * (climateType === CLIMATE_TYPE_DESERT ? 0.25 : 1.0);
    const wx = ox + x, wz = oz + y;
    if (tileDraw(wx, wz, 4) > chance) return null;
    const hx = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (x / tDim))));
    const hy = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (y / tDim))));
    if (sampleHeight((opts.beach ?? heightmapData)[hy + hx * hDim]) < SCALED_BEACH_ELEVATION) return null;
    return { record: 1 + Math.floor(tileDraw(wx, wz, 5) * 31), x: x * scale, y: heightAt(x, y) - steepness / SLOPE_SINK_RATIO, z: y * scale };
  };
}

function dfuScatter(heightmapData, tilemapData, opts) {
  const hDim = HEIGHTMAP_DIMENSION;
  const tDim = WORLD_MAP_TILE_DIM;
  const worldHeight = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  const cell = TERRAIN_SIZE / (hDim - 1);
  const at = (x, y) => heightmapData[x * hDim + y] * worldHeight;

  let rect = null;
  if (opts.locationRect && opts.locationRect.xMin > 0 && opts.locationRect.yMin > 0) {
    rect = {
      xMin: opts.locationRect.xMin - NATURE_CLEARANCE,
      xMax: opts.locationRect.xMax + NATURE_CLEARANCE,
      yMin: opts.locationRect.yMin - NATURE_CLEARANCE,
      yMax: opts.locationRect.yMax + NATURE_CLEARANCE,
    };
  }

  let elevationScale = opts.rawWorldHeight / 128;
  elevationScale = Math.min(1.0, Math.max(0.4, elevationScale));
  const climateScale = opts.climateType === CLIMATE_TYPE_DESERT ? 0.25 : 1.0;
  const chanceOnDirt = BASE_CHANCE_ON_DIRT * elevationScale * climateScale;
  const chanceOnGrass = BASE_CHANCE_ON_GRASS * elevationScale * climateScale;
  const chanceOnStone = BASE_CHANCE_ON_STONE * elevationScale * climateScale;

  const seed = makeTerrainKey(opts.mapPixelX, opts.mapPixelY) >>> 0;
  const rng = new UMRandom(seed === 0 ? 0x6e624eb7 : seed);

  const scale = TERRAIN_SIZE / tDim;
  const beachLine = SCALED_BEACH_ELEVATION;

  const steepnessAt = (x, y) => {
    const hl = at(Math.max(0, x - 1), y);
    const hr = at(Math.min(hDim - 1, x + 1), y);
    const hd = at(x, Math.max(0, y - 1));
    const hu = at(x, Math.min(hDim - 1, y + 1));
    const dx = (hr - hl) / (2 * cell);
    const dz = (hu - hd) / (2 * cell);
    return Math.atan(Math.hypot(dx, dz)) * (180 / Math.PI);
  };

  const flats = [];
  for (let y = 0; y < tDim; y++) {
    for (let x = 0; x < tDim; x++) {
      const steepness = steepnessAt(x, y);
      if (steepness > MAX_STEEPNESS) continue;
      // DFU re-tests rect.x > 0 && rect.y > 0 on the expanded rect, so a location starting within 4 of an axis
      // gets no containment test and nature scatters across its footprint.
      if (rect && rect.xMin > 0 && rect.yMin > 0
        && x >= rect.xMin && x < rect.xMax && y >= rect.yMin && y < rect.yMax) continue;

      const tile = tilemapData[y * tDim + x] & 0x3f;
      if (tile === 1) {
        if (rng.nextFloatRange(0, 1) > chanceOnDirt) continue;
      } else if (tile === 2) {
        if (rng.nextFloatRange(0, 1) > chanceOnGrass) continue;
      } else if (tile === 3) {
        if (rng.nextFloatRange(0, 1) > chanceOnStone) continue;
      } else {
        continue;
      }

      const hx = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (x / tDim))));
      const hy = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (y / tDim))));
      const height = sampleHeight((opts.beach ?? heightmapData)[hy + hx * hDim]);
      if (height < beachLine) continue;

      const record = rng.nextIntRange(1, 32);
      flats.push({
        record,
        x: x * scale,
        y: at(x, y) - steepness / SLOPE_SINK_RATIO,
        z: y * scale,
      });
    }
  }
  return flats;
}

// Real forests depart from DefaultTerrainNature, behind the Features row `realForests`.
// forestCover is a pure function of the world tile, so every client and the terrain worker grow the same woods.

export const FOREST = Object.freeze({
  octaves: Object.freeze([
    Object.freeze({ wave: 192, weight: 0.58, c: 0.8, s: 0.6, off: 17.3 }),
    Object.freeze({ wave: 72, weight: 0.27, c: 0.28, s: 0.96, off: 91.7 }),
    Object.freeze({ wave: 26, weight: 0.15, c: 5 / 13, s: 12 / 13, off: 53.1 }),
  ]),
  warp: 48, warpWave: 140,
  edge: Object.freeze([0.495, 0.525]),
  lattice: 4,
  forestTree: 0.5, undergrowth: 0.12, plainTree: 0.02, plainCover: 0.1,
  ground: Object.freeze({ 1: 0.6, 2: 1, 3: 0.15 }),
  inset: Object.freeze([0.1, 0.9]),
  hide: Object.freeze({ near: 10, far: 30, pull: 1 }),
  clear: Object.freeze({ near: 6, far: 26, pull: 1 }),
  edgeFade: 12,
  woods: 0.5,
});
const TAN_MAX_STEEP_SQ = Math.tan(MAX_STEEPNESS * Math.PI / 180) ** 2;

const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * @param {number} tx
 * @param {number} tz
 */
export function forestCover(tx, tz) {
  const w = FOREST.warpWave, k = 2 * FOREST.warp;
  const wx = tx + (perlinNoise(tx / w + 211.3, tz / w + 7.9) - 0.5) * k;
  const wz = tz + (perlinNoise(tx / w + 37.1, tz / w + 151.7) - 0.5) * k;
  let n = 0;
  for (const o of FOREST.octaves) n += perlinNoise((wx * o.c - wz * o.s) / o.wave + o.off, (wx * o.s + wz * o.c) / o.wave + o.off) * o.weight;
  return n;
}

export const forestAt = (tx, tz) => smoothstep(FOREST.edge[0], FOREST.edge[1], forestCover(tx, tz));

/**
 * @param {number} mapPixelX
 * @param {number} mapPixelY
 */
export function forestField(mapPixelX, mapPixelY) {
  const L = FOREST.lattice, n = WORLD_MAP_TILE_DIM / L + 1;
  const ox = mapPixelX * WORLD_MAP_TILE_DIM, oz = -mapPixelY * WORLD_MAP_TILE_DIM;
  const g = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = forestAt(ox + i * L, oz + j * L);
  return (x, y) => {
    const fx = x / L, fy = y / L;
    const i = Math.min(n - 2, Math.floor(fx)), j = Math.min(n - 2, Math.floor(fy));
    const u = fx - i, v = fy - j;
    const a = g[j * n + i], b = g[j * n + i + 1], c = g[(j + 1) * n + i], d = g[(j + 1) * n + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

export function tileDraw(tx, tz, k) {
  let h = Math.imul(tx | 0, 0x9e3779b1) ^ Math.imul(tz | 0, 0x85ebca77) ^ Math.imul((k | 0) + 0x632be5ab, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function placesPull(pois, x, y) {
  if (!pois?.length) return 0;
  const tDim = WORLD_MAP_TILE_DIM;
  const fade = smoothstep(0, FOREST.edgeFade, Math.min(x, y, tDim - 1 - x, tDim - 1 - y));
  if (fade <= 0) return 0;
  let pull = 0;
  for (const p of pois) {
    const dx = Math.max(p.xMin - x, 0, x - (p.xMax - 1)), dy = Math.max(p.yMin - y, 0, y - (p.yMax - 1));
    const ring = p.hide ? FOREST.hide : FOREST.clear;
    const k = (1 - smoothstep(ring.near, ring.far, Math.sqrt(dx * dx + dy * dy))) * ring.pull;
    pull += p.hide ? k : -k;
  }
  return pull * fade;
}

const coverRecords = new Map();
function coverOf(archive) {
  let out = coverRecords.get(archive);
  if (!out) {
    out = Object.freeze(Array.from({ length: 31 }, (_, i) => i + 1).filter((r) => !isTreeRecord(archive, r)));
    coverRecords.set(archive, out);
  }
  return out;
}

function layoutForests(heightmapData, tilemapData, opts) {
  const tileFlat = forestTiles(heightmapData, tilemapData, opts);
  const trees = TREE_RECORDS[opts.forests.archive], cover = coverOf(opts.forests.archive);
  const flats = [];
  for (let y = 0; y < WORLD_MAP_TILE_DIM; y++) {
    for (let x = 0; x < WORLD_MAP_TILE_DIM; x++) {
      const f = tileFlat(x, y, trees, cover);
      if (f) flats.push(f);
    }
  }
  return flats;
}

function forestTiles(heightmapData, tilemapData, opts) {
  const hDim = HEIGHTMAP_DIMENSION;
  const tDim = WORLD_MAP_TILE_DIM;
  const yScale = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  const cell = TERRAIN_SIZE / (hDim - 1);
  const at = (x, y) => heightmapData[x * hDim + y] * yScale;
  const scale = TERRAIN_SIZE / tDim;
  const pois = opts.forests.pois ?? [];
  const paths = opts.forests.paths ?? null;
  const clear = [opts.locationRect, ...pois].filter((r) => r && r.xMax > r.xMin && r.yMax > r.yMin).map((r) => ({
    xMin: r.xMin - NATURE_CLEARANCE, xMax: r.xMax + NATURE_CLEARANCE, yMin: r.yMin - NATURE_CLEARANCE, yMax: r.yMax + NATURE_CLEARANCE,
  }));
  const woodAt = forestField(opts.mapPixelX, opts.mapPixelY);
  const ox = opts.mapPixelX * tDim, oz = -opts.mapPixelY * tDim;
  const [in0, in1] = FOREST.inset;

  return (x, y, trees, cover) => {
    const ti = y * tDim + x;
    const ground = FOREST.ground[tilemapData[ti] & 0x3f];
    if (!ground || paths?.[ti]) return null;
    if (clear.some((r) => x >= r.xMin && x < r.xMax && y >= r.yMin && y < r.yMax)) return null;
    const hl = at(Math.max(0, x - 1), y), hr = at(Math.min(hDim - 1, x + 1), y);
    const hd = at(x, Math.max(0, y - 1)), hu = at(x, Math.min(hDim - 1, y + 1));
    const gx = (hr - hl) / (2 * cell), gz = (hu - hd) / (2 * cell);
    const g2 = gx * gx + gz * gz;
    if (g2 > TAN_MAX_STEEP_SQ) return null;
    const hx = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (x / tDim))));
    const hy = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (y / tDim))));
    if (sampleHeight((opts.beach ?? heightmapData)[hy + hx * hDim]) < SCALED_BEACH_ELEVATION) return null;

    const wood = Math.min(1, Math.max(0, woodAt(x, y) + placesPull(pois, x, y)));
    const tree = (FOREST.plainTree + (FOREST.forestTree - FOREST.plainTree) * wood) * ground;
    const under = (FOREST.plainCover + (FOREST.undergrowth - FOREST.plainCover) * wood) * ground;
    const wx = ox + x, wz = oz + y;
    const roll = tileDraw(wx, wz, 0);
    if (roll >= tree + under) return null;
    const pool = roll < tree ? trees : cover;
    const record = pool[Math.floor(tileDraw(wx, wz, 1) * pool.length)];
    const mx = (x + in0 + (in1 - in0) * tileDraw(wx, wz, 2)) * scale;
    const mz = (y + in0 + (in1 - in0) * tileDraw(wx, wz, 3)) * scale;
    const steepness = Math.atan(Math.sqrt(g2)) * (180 / Math.PI);
    return { record, x: mx, y: groundAt(heightmapData, mx, mz) - steepness / SLOPE_SINK_RATIO, z: mz, wood };
  };
}
