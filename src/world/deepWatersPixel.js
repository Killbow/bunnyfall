import { SCALED_OCEAN_ELEVATION, MAX_TERRAIN_HEIGHT, HEIGHTMAP_DIMENSION, STREAMING_TERRAIN_SCALE } from './terrainSampler.js';
import { DeepWaterTileData } from './deepWaterTileData.js';
import { computeHoleMask, buildFloorMesh, TILE_WORLD_SIZE } from './deepWaterFloor.js';
import { capDecision } from './deepWaterCap.js';
import { buildSurfaceMesh, shouldHaveSurface } from './deepWaterSurface.js';

const f32 = Math.fround;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampInt = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * clamp01(t);

export const DW_TERRAIN_HEIGHT = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
export const DW_OCEAN_LOCAL_Y = f32(f32(SCALED_OCEAN_ELEVATION / MAX_TERRAIN_HEIGHT) * DW_TERRAIN_HEIGHT);
const LOOKUP_SLACK = 0.25;

export function terrainLocalY(samples, lx, lz, terrainHeight = DW_TERRAIN_HEIGHT) {
  const n = HEIGHTMAP_DIMENSION;
  const num3 = clamp01(lx / TILE_WORLD_SIZE) * (n - 1);
  const num4 = clamp01(lz / TILE_WORLD_SIZE) * (n - 1);
  const num5 = clampInt(Math.floor(num3), 0, n - 2);
  const num6 = clampInt(Math.floor(num4), 0, n - 2);
  const num7 = num3 - num5, num8 = num4 - num6;
  const at = (row, col) => samples[col * n + row];
  const num9 = lerp(at(num6, num5), at(num6, num5 + 1), num7);
  const num10 = lerp(at(num6 + 1, num5), at(num6 + 1, num5 + 1), num7);
  return lerp(num9, num10, num8) * terrainHeight;
}

/**
 * @param {Float32Array} samples
 * @param {{w?: ?Float32Array, e?: ?Float32Array, s?: ?Float32Array, n?: ?Float32Array}} neighbours
 */
export function nearbyLocalYReader(samples, neighbours = {}, terrainHeight = DW_TERRAIN_HEIGHT) {
  const size = TILE_WORLD_SIZE;
  return (lx, lz) => {
    if (!Number.isFinite(lx) || !Number.isFinite(lz)) return null;
    const inX = lx >= -LOOKUP_SLACK && lx <= size + LOOKUP_SLACK;
    const inZ = lz >= -LOOKUP_SLACK && lz <= size + LOOKUP_SLACK;
    if (inX && inZ) return terrainLocalY(samples, lx, lz, terrainHeight);
    const dx = lx < 0 ? -1 : lx > size ? 1 : 0;
    const dz = lz < 0 ? -1 : lz > size ? 1 : 0;
    if (dx !== 0 && dz !== 0) return null;
    const other = dx < 0 ? neighbours.w : dx > 0 ? neighbours.e : dz < 0 ? neighbours.s : neighbours.n;
    if (!other) return null;
    return terrainLocalY(other, lx - dx * size, lz - dz * size, terrainHeight);
  };
}

/**
 * @param {object} job
 * @param {number} job.px
 * @param {number} job.py
 * @param {Float32Array} job.samples
 * @param {Uint8Array} job.tilemap
 * @param {Uint8Array} job.tilemapBytes
 * @param {ArrayLike<number>} job.climates
 * @param {object} [job.neighbours]
 * @param {?number} job.waterDepth
 * @param {boolean} job.spawnSurfaces
 * @param {object} bake
 * @returns {{px: number, py: number, ocean: boolean, fallback: boolean, biomeClimateIndex: number, holes: ?Uint8Array, floor: ?object, cap: {hide: boolean, tilemap: ?Uint8Array}, surface: ?object, planes: Array}}
 */
export function buildDeepWatersPixel(job, bake) {
  const { px, py, samples, tilemap, tilemapBytes, climates, waterDepth } = job;
  const mapData = { samples, tilemap };
  const climateAt = (x, y) => climates[clampInt(y - py + 1, 0, 2) * 3 + clampInt(x - px + 1, 0, 2)];
  prepareBake(bake, px, py);
  const tile = new DeepWaterTileData({ mapPixelX: px, mapPixelY: py, mapData, climateIndex: climates[4], climateAt, bake });
  let holes = null, floor = null;
  let cap = { hide: false, tilemap: null };
  if (tile.isOceanConnected && tile.hasDistanceField) {
    const mask = computeHoleMask(mapData, tile, bake);
    if (mask && mask.any) {
      holes = mask.holes;
      floor = buildFloorMesh({
        mapData, tile, holes, oceanLocalY: DW_OCEAN_LOCAL_Y, terrainHeight: DW_TERRAIN_HEIGHT, waterDepth,
        nearbyLocalY: nearbyLocalYReader(samples, job.neighbours ?? {}),
      });
      cap = capDecision(px, py, mapData, tilemapBytes, bake);
    }
  }
  const surface = job.spawnSurfaces && shouldHaveSurface(px, py, mapData, bake)
    ? buildSurfaceMesh({ mapPixelX: px, mapPixelY: py, mapData, tilemapBytes, tile, bake })
    : null;
  return {
    px, py,
    ocean: tile.isOceanConnected, fallback: tile.usesLocalWaterFallback, biomeClimateIndex: tile.biomeClimateIndex,
    holes, floor, cap, surface,
    planes: typeof bake?.exportPlanes === 'function' ? bake.exportPlanes(px, py) : [],
  };
}

function prepareBake(bake, px, py) {
  if (bake && typeof bake.prepare === 'function') bake.prepare(px, py);
}

export function deepWatersPixelTransfers(result) {
  const out = new Set();
  const add = (a) => { if (a && a.buffer instanceof ArrayBuffer) out.add(a.buffer); };
  add(result.holes);
  if (result.floor) for (const k of ['positions', 'colors', 'uvs', 'indices', 'vertexLocalY', 'floorQuadWater']) add(result.floor[k]);
  add(result.cap?.tilemap);
  if (result.surface) for (const k of ['positions', 'uvs', 'indices', 'cells']) add(result.surface[k]);
  for (const r of result.planes ?? []) { add(r.fine); add(r.dist); add(r.edge); }
  return [...out];
}
