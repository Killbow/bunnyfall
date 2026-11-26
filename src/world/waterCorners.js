import { createLookupTable } from './terrainTiles.js';
import { convertTile, WATER_TILE_INDEX } from './terrainSurface.js';

export const SHORE_FAMILIES = Object.freeze([
  Object.freeze([5, 6, 7, 48]),
  Object.freeze([20, 21, 22, 49]),
  Object.freeze([30, 31, 32, 50]),
]);
export const SHALLOW_WHOLE = Object.freeze([8, 23, 33, 34, 35, 36]);

export const SHALLOW_DRAWN = Object.freeze([9]);

export const ISLAND_DRAWN = Object.freeze([4, 19, 29]);
export const CORNER_DRAWN = Object.freeze([37, 38, 40, 41, 43, 44]);

export function buildWaterMaskTable(drawn = false) {
  const table = new Uint8Array(256);
  for (let t = 0; t < 4; t++) table[(WATER_TILE_INDEX << 2) | t] = 0xF;
  const lookup = createLookupTable();
  for (let shape = 0; shape < 16; shape++) {
    const raw = lookup[shape];
    const record = raw & 0x3f;
    const k = SHORE_FAMILIES[0].indexOf(record);
    if (k < 0) continue;
    const t = convertTile(raw) & 3;
    const water = (~shape) & 0xF;
    for (const family of SHORE_FAMILIES) table[(family[k] << 2) | t] = water;
  }
  for (const r of SHALLOW_WHOLE) for (let t = 0; t < 4; t++) table[(r << 2) | t] = 0xF;
  if (!drawn) return table;
  for (const r of SHALLOW_DRAWN) for (let t = 0; t < 4; t++) table[(r << 2) | t] = 0xF;
  for (const r of ISLAND_DRAWN) for (let t = 0; t < 4; t++) table[(r << 2) | t] = 0xF;
  const corner = SHORE_FAMILIES[0][2];
  for (const r of CORNER_DRAWN) for (let t = 0; t < 4; t++) table[(r << 2) | t] = table[(corner << 2) | t];
  for (const family of SHORE_FAMILIES) for (const t of [2, 3]) table[(family[3] << 2) | t] = table[(family[3] << 2) | (t - 2)];
  return table;
}

export const WATER_MASK_TABLE = buildWaterMaskTable();
export const WATER_DRAW_MASK_TABLE = buildWaterMaskTable(true);

export const NO_BED_DEPTH = 1.2;
export const SHEET_NO_BED = -NO_BED_DEPTH;
export const SHELF_SHEET_DEPTH = 1.668;

export function packWaterMask(table = WATER_MASK_TABLE) {
  const words = new Uint32Array(32);
  for (let i = 0; i < 256; i++) words[i >> 3] |= (table[i] & 0xF) << ((i & 7) * 4);
  return words;
}


export const waterCorners = (convertedByte, table = WATER_MASK_TABLE) => table[convertedByte & 0xff];

export function waterCoverage(mask, fx, fy) {
  const c00 = mask & 1, c10 = (mask >> 1) & 1, c01 = (mask >> 2) & 1, c11 = (mask >> 3) & 1;
  const top = c00 + (c10 - c00) * fx;
  const bottom = c01 + (c11 - c01) * fx;
  return top + (bottom - top) * fy;
}
