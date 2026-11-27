import { SCALED_OCEAN_ELEVATION, SCALED_BEACH_ELEVATION, MAX_TERRAIN_HEIGHT, HEIGHTMAP_DIMENSION } from './terrainSampler.js';
import { WORLD_MAP_TILE_DIM } from './terrainTiles.js';
import { roundToInt } from './mathf.js';
import { WATER_THRESHOLD } from './deepWatersBake.js';

const f32 = Math.fround;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampInt = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const DW_WATER_THRESHOLD = WATER_THRESHOLD;
export const DW_CARVE_THRESHOLD = f32(f32(SCALED_OCEAN_ELEVATION + f32(0.25)) / MAX_TERRAIN_HEIGHT);
export const DW_VISUAL_THRESHOLD = f32(SCALED_BEACH_ELEVATION / MAX_TERRAIN_HEIGHT);

const H_LEN = HEIGHTMAP_DIMENSION;
const T_LEN = WORLD_MAP_TILE_DIM;

export const heightSample = (mapData, a, b) => mapData.samples[b * H_LEN + a];
// The raw tilemap marks location tiles with 0xFF, which Daggerfall Unity reads back as record 0.
export function tileSample(mapData, a, b) {
  const t = mapData.tilemap[b * T_LEN + a];
  return t === 0xff ? 0 : t;
}

export function tileValueContainsWater(tile) {
  const n = tile & 0x3f;
  return n === 0 || n === 5 || n === 6 || n === 7 || n === 48;
}

export function mapDataHasWater(mapData) {
  if (tilemapHasWater(mapData, true)) return true;
  return heightmapHasWater(mapData);
}

export function mapDataFullySubmerged(mapData) {
  return heightmapFullyBelowThreshold(mapData, DW_WATER_THRESHOLD);
}

export function isLocalPointWater(mapData, fracX, fracZ) {
  const t = DW_CARVE_THRESHOLD;
  if (tilemapPointHasWater(mapData, fracX, fracZ, t)) return true;
  return heightmapPointBelowThreshold(mapData, fracX, fracZ, t);
}

export function cellContainsWaterTile(mapData, cellX, cellY, cellResolution) {
  if (!mapData.tilemap || cellResolution <= 0) return false;
  const length = T_LEN, length2 = T_LEN;
  const num = clampInt(Math.trunc((cellX * length2) / cellResolution), 0, length2 - 1);
  const num2 = clampInt(Math.trunc(((cellX + 1) * length2 - 1) / cellResolution), 0, length2 - 1);
  const num3 = clampInt(Math.trunc((cellY * length) / cellResolution), 0, length - 1);
  const num4 = clampInt(Math.trunc(((cellY + 1) * length - 1) / cellResolution), 0, length - 1);
  for (let i = num3; i <= num4; i++) {
    for (let j = num; j <= num2; j++) if (tileValueContainsWater(tileSample(mapData, i, j))) return true;
  }
  return false;
}

export function isLocalPointPureWaterTile(mapData, fracX, fracZ) {
  if (!mapData.tilemap) return false;
  const length = T_LEN, length2 = T_LEN;
  const num = clampInt(Math.floor(f32(clamp01(f32(fracX)) * length2)), 0, length2 - 1);
  const num2 = clampInt(Math.floor(f32(clamp01(f32(fracZ)) * length)), 0, length - 1);
  return (tileSample(mapData, num2, num) & 0x3f) === 0;
}

export function isCellPartiallySubmerged(mapData, cellX, cellY, cellResolution) {
  return heightmapCellBelowThreshold(mapData, cellX, cellY, cellResolution, DW_WATER_THRESHOLD);
}

export function isCellVisuallyWet(mapData, cellX, cellY, cellResolution) {
  return heightmapCellBelowThreshold(mapData, cellX, cellY, cellResolution, DW_VISUAL_THRESHOLD);
}

function tilemapHasWater(mapData, withHeights) {
  if (!mapData.tilemap) return false;
  const length = T_LEN, length2 = T_LEN;
  const flag = withHeights && !!mapData.samples;
  for (let i = 0; i < length; i++) {
    for (let j = 0; j < length2; j++) {
      if (tileValueContainsWater(tileSample(mapData, i, j)) && (!flag || heightmapCellBelowThreshold(mapData, j, i, length2, DW_VISUAL_THRESHOLD))) return true;
    }
  }
  return false;
}

function tilemapPointHasWater(mapData, fracX, fracZ, lowTerrainThreshold) {
  if (!mapData.tilemap) return false;
  const length = T_LEN, length2 = T_LEN;
  const num = clampInt(Math.floor(f32(clamp01(f32(fracX)) * length2)), 0, length2 - 1);
  const num2 = clampInt(Math.floor(f32(clamp01(f32(fracZ)) * length)), 0, length - 1);
  if (!tileValueContainsWater(tileSample(mapData, num2, num))) return false;
  if (mapData.samples) return heightmapPointBelowThreshold(mapData, fracX, fracZ, lowTerrainThreshold);
  return true;
}

function heightmapHasWater(mapData) {
  if (!mapData.samples) return false;
  const s = mapData.samples, t = DW_WATER_THRESHOLD;
  for (let i = 0; i < s.length; i++) if (s[i] <= t) return true;
  return false;
}

function heightmapFullyBelowThreshold(mapData, threshold) {
  if (!mapData.samples) return false;
  const s = mapData.samples;
  for (let i = 0; i < s.length; i++) if (s[i] > threshold) return false;
  return s.length > 0;
}

export function heightmapPointBelowThreshold(mapData, fracX, fracZ, threshold) {
  if (!mapData.samples) return false;
  const length = H_LEN, length2 = H_LEN;
  const num = clampInt(roundToInt(f32(clamp01(f32(fracX)) * (length2 - 1))), 0, length2 - 1);
  const num2 = clampInt(roundToInt(f32(clamp01(f32(fracZ)) * (length - 1))), 0, length - 1);
  return heightSample(mapData, num2, num) <= threshold;
}

export function heightmapCellBelowThreshold(mapData, cellX, cellY, cellResolution, threshold) {
  if (!mapData.samples || cellResolution <= 0) return false;
  const length = H_LEN, length2 = H_LEN;
  const num = clampInt(Math.floor(f32(f32(cellX * (length2 - 1)) / cellResolution)), 0, length2 - 1);
  const num2 = clampInt(Math.ceil(f32(f32((cellX + 1) * (length2 - 1)) / cellResolution)), 0, length2 - 1);
  const num3 = clampInt(Math.floor(f32(f32(cellY * (length - 1)) / cellResolution)), 0, length - 1);
  const num4 = clampInt(Math.ceil(f32(f32((cellY + 1) * (length - 1)) / cellResolution)), 0, length - 1);
  for (let i = num3; i <= num4; i++) {
    for (let j = num; j <= num2; j++) if (heightSample(mapData, i, j) <= threshold) return true;
  }
  return false;
}
