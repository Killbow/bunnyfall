// Terrain tile texturing and location integration for one map pixel.
// Ported from DFU's DefaultTerrainTexturing and TerrainHelper location paths; the Perlin source is a departure.
// Heightmap value(x, y) is data[x * dim + y]; the tilemap and tileData grids are row-major (y * dim + x).

import { perlinNoise } from './perlin.js';
import { UMRandom } from '../formats/umRandom.js';
import { HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, SCALED_OCEAN_ELEVATION, SCALED_BEACH_ELEVATION } from './terrainSampler.js';
import { worldDataDoor } from '../formats/worldDataDoor.js';

export const GROUND_RECORD_LIMIT = 56;

export const WORLD_MAP_TILE_DIM = 128;
const TILE_DATA_DIM = WORLD_MAP_TILE_DIM + 1;
const MAX_WORLD_TILE_COORD_Z = 64000;
const RMB_TILES_PER_BLOCK = 16;
const RMB_TILES_PER_TERRAIN = 128;
export const BEACH_JITTER = 1.5;

const SEED = 417028;
export const WATER = 0;
export const DIRT = 1;
const GRASS = 2;
const STONE = 3;

function getNoiseClamped(x, y, frequency, amplitude, persistance, octaves, seed) {
  let finalValue = 0;
  for (let i = 0; i < octaves; i++) {
    finalValue += perlinNoise(seed + x * frequency, seed + y * frequency) * amplitude;
    frequency *= 2.0;
    amplitude *= persistance;
  }
  return Math.min(1, Math.max(-1, finalValue));
}

function noiseWeight(worldX, worldY) {
  return getNoiseClamped(worldX, worldY, 0.05, 0.9, 0.4, 3, SEED);
}

function getWeightedRecord(weight, lowerGrassSpread = 0.5, upperGrassSpread = 0.95) {
  if (weight < lowerGrassSpread) return DIRT;
  if (weight > upperGrassSpread) return STONE;
  return GRASS;
}

function makeLookup(index, rotate, flip) {
  if (index > 55) throw new Error('Index out of range. Valid range 0-55');
  if (rotate) index += 64;
  if (flip) index += 128;
  return index;
}

function addLookupRange(table, baseStart, baseEnd, shapeStart, saddleIndex, reverse, offset) {
  if (reverse) {
    table[offset] = makeLookup(baseStart, false, false);
    table[offset + 1] = makeLookup(shapeStart + 2, true, true);
    table[offset + 2] = makeLookup(shapeStart + 2, false, false);
    table[offset + 3] = makeLookup(shapeStart + 1, true, true);
    table[offset + 4] = makeLookup(shapeStart + 2, false, true);
    table[offset + 5] = makeLookup(shapeStart + 1, false, true);
    table[offset + 6] = makeLookup(saddleIndex, true, false);
    table[offset + 7] = makeLookup(shapeStart, true, true);
    table[offset + 8] = makeLookup(shapeStart + 2, true, false);
    table[offset + 9] = makeLookup(saddleIndex, false, false);
    table[offset + 10] = makeLookup(shapeStart + 1, false, false);
    table[offset + 11] = makeLookup(shapeStart, false, false);
    table[offset + 12] = makeLookup(shapeStart + 1, true, false);
    table[offset + 13] = makeLookup(shapeStart, false, true);
    table[offset + 14] = makeLookup(shapeStart, true, false);
    table[offset + 15] = makeLookup(baseEnd, false, false);
  } else {
    table[offset] = makeLookup(baseStart, false, false);
    table[offset + 1] = makeLookup(shapeStart, true, false);
    table[offset + 2] = makeLookup(shapeStart, false, true);
    table[offset + 3] = makeLookup(shapeStart + 1, true, false);
    table[offset + 4] = makeLookup(shapeStart, false, false);
    table[offset + 5] = makeLookup(shapeStart + 1, false, false);
    table[offset + 6] = makeLookup(saddleIndex, false, false);
    table[offset + 7] = makeLookup(shapeStart + 2, true, false);
    table[offset + 8] = makeLookup(shapeStart, true, true);
    table[offset + 9] = makeLookup(saddleIndex, true, false);
    table[offset + 10] = makeLookup(shapeStart + 1, false, true);
    table[offset + 11] = makeLookup(shapeStart + 2, false, true);
    table[offset + 12] = makeLookup(shapeStart + 1, true, true);
    table[offset + 13] = makeLookup(shapeStart + 2, false, false);
    table[offset + 14] = makeLookup(shapeStart + 2, true, true);
    table[offset + 15] = makeLookup(baseEnd, false, false);
  }
}

export function createLookupTable() {
  const table = new Uint8Array(64);
  addLookupRange(table, 0, 1, 5, 48, false, 0);
  addLookupRange(table, 2, 1, 10, 51, true, 16);
  addLookupRange(table, 2, 3, 15, 53, false, 32);
  addLookupRange(table, 3, 3, 15, 53, true, 48);
  return table;
}

const LOOKUP_TABLE = createLookupTable();

export function marchTile(b0, b1, b2, b3) {
  const shape = (b0 & 1) | ((b1 & 1) << 1) | ((b2 & 1) << 2) | ((b3 & 1) << 3);
  const ring = (b0 + b1 + b2 + b3) >> 2;
  return LOOKUP_TABLE[shape | (ring << 4)];
}

/** @param {number} sample */
export const sampleHeight = (sample) => Math.fround(sample * MAX_TERRAIN_HEIGHT);
/** @param {number} height */
export const isWaterHeight = (height) => height <= SCALED_OCEAN_ELEVATION;

/**
 * @param {Float32Array} heightmapData
 * @param {number} mapPixelX
 * @param {number} mapPixelY
 * @returns {Uint8Array}
 */
export function generateTileData(heightmapData, mapPixelX, mapPixelY, hDim = HEIGHTMAP_DIMENSION) {
  const tdDim = TILE_DATA_DIM;
  const tileData = new Uint8Array(tdDim * tdDim);
  for (let index = 0; index < tileData.length; index++) {
    const x = index % tdDim;
    const y = Math.trunc(index / tdDim);

    const hx = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (x / tdDim))));
    const hy = Math.min(hDim - 1, Math.max(0, Math.trunc(hDim * (y / tdDim))));
    // The ocean compare is float32, as in DFU: the height is rounded to float32 and compared against the float
    // thresholds, because the double 27.2 fails against the clamped sea sample.
    tileData[index] = tileDataAt(sampleHeight(heightmapData[hy + hx * hDim]), x, y, mapPixelX, mapPixelY);
  }
  return tileData;
}

export function tileDataAt(height, x, y, mapPixelX, mapPixelY) {
  if (isWaterHeight(height)) return WATER;
  const jitter = UMRandom.createFromIndex((x + y * TILE_DATA_DIM) >>> 0).nextFloatRange(-BEACH_JITTER, BEACH_JITTER);
  if (height <= Math.fround(SCALED_BEACH_ELEVATION + jitter)) return DIRT;
  const latitude = mapPixelX * WORLD_MAP_TILE_DIM + x;
  const longitude = MAX_WORLD_TILE_COORD_Z - mapPixelY * WORLD_MAP_TILE_DIM + y;
  return getWeightedRecord(noiseWeight(latitude, longitude));
}

/**
 * @param {Uint8Array} tileData
 * @param {Uint8Array} tilemapData
 * @param {boolean} march
 */
export function assignTiles(tileData, tilemapData, march = true) {
  const tdDim = TILE_DATA_DIM;
  const tDim = WORLD_MAP_TILE_DIM;
  for (let index = 0; index < tDim * tDim; index++) {
    const x = index % tDim;
    const y = Math.trunc(index / tDim);
    if (tilemapData[index] !== 0) continue;
    if (march) {
      const tdIdx = x + y * tdDim;
      tilemapData[index] = marchTile(tileData[tdIdx], tileData[tdIdx + 1], tileData[tdIdx + tdDim], tileData[tdIdx + tdDim + 1]);
    } else {
      tilemapData[index] = tileData[x + y * tdDim];
    }
  }
}

export function getLocationTerrainTileOrigin(dfLocation) {
  const width = dfLocation.exterior.exteriorData.width;
  const height = dfLocation.exterior.exteriorData.height;
  const result = {
    x: Math.trunc((RMB_TILES_PER_TERRAIN - width * RMB_TILES_PER_BLOCK) / 2),
    y: Math.trunc((RMB_TILES_PER_TERRAIN - height * RMB_TILES_PER_BLOCK) / 2),
  };
  if (width === 1 && height === 1 &&
      dfLocation.exterior.exteriorData.blockNames[0].startsWith('CUST')) {
    result.x = 72;
    result.y = 55;
  }
  return result;
}

const LOCATION_TYPE_TOWN_CITY = 0;

/**
 * @param {object} dfLocation
 * @returns {{xMin,xMax,yMin,yMax}}
 */
export function locationFootprintRect(dfLocation) {
  const o = getLocationTerrainTileOrigin(dfLocation);
  const { width, height } = dfLocation.exterior.exteriorData;
  const c = dfLocation.mapTableData.locationType === LOCATION_TYPE_TOWN_CITY ? 3 : 2;
  return { xMin: o.x - c, xMax: o.x + width * RMB_TILES_PER_BLOCK - 1 + c, yMin: o.y - c, yMax: o.y + height * RMB_TILES_PER_BLOCK - 1 + c };
}

/**
 * @param {object} dfLocation
 * @param {object} mapsFile
 * @param {object} blocksFile
 * @param {Uint8Array} tilemapData
 * @returns {{xMin,xMax,yMin,yMax}}
 */
export function setLocationTiles(dfLocation, mapsFile, blocksFile, tilemapData) {
  const tilePos = getLocationTerrainTileOrigin(dfLocation);
  let xmin = Infinity, ymin = Infinity, xmax = 0, ymax = 0;
  const width = dfLocation.exterior.exteriorData.width;
  const height = dfLocation.exterior.exteriorData.height;
  for (let blockY = 0; blockY < height; blockY++) {
    for (let blockX = 0; blockX < width; blockX++) {
      const blockName = blocksFile.checkName(mapsFile.getRmbBlockName(dfLocation, blockX, blockY));
      const blockIndex = blocksFile.getBlockIndex(blockName);
      if (blockIndex === -1) continue;
      const block = blocksFile.getBlock(blockIndex);
      const groundTiles = block.rmbBlock.fldHeader.groundData.groundTiles;
      for (let tileY = 0; tileY < RMB_TILES_PER_BLOCK; tileY++) {
        for (let tileX = 0; tileX < RMB_TILES_PER_BLOCK; tileX++) {
          const tile = groundTiles[tileX][(RMB_TILES_PER_BLOCK - 1) - tileY];
          const xpos = tilePos.x + blockX * RMB_TILES_PER_BLOCK + tileX;
          const ypos = tilePos.y + blockY * RMB_TILES_PER_BLOCK + tileY;
          if (tile.textureRecord < GROUND_RECORD_LIMIT) {
            if (xpos < xmin) xmin = xpos;
            if (xpos > xmax) xmax = xpos;
            if (ypos < ymin) ymin = ypos;
            if (ypos > ymax) ymax = ypos;
            // Zero bitfields are stored as 0xFF so AssignTiles cannot overwrite them.
            tilemapData[xpos + ypos * WORLD_MAP_TILE_DIM] =
              tile.tileBitfield === 0 ? 0xff : tile.tileBitfield;
          }
        }
      }
    }
  }
  const extraClearance = dfLocation.mapTableData.locationType === LOCATION_TYPE_TOWN_CITY ? 3 : 2;
  return {
    xMin: xmin - extraClearance,
    xMax: xmax + extraClearance,
    yMin: ymin - extraClearance,
    yMax: ymax + extraClearance,
  };
}

/**
 * @param {object} mapsFile
 * @param {object} blocksFile
 * @param {object|null} [as]
 * @returns {(dfLocation: object) => {xMin: number, xMax: number, yMin: number, yMax: number}}
 */
export function locationRectReader(mapsFile, blocksFile, as = null) {
  /** @type {Map<number, object|null>} */
  const ground = new Map();
  const shared = {
    checkName: (name) => blocksFile.checkName(name),
    getBlockIndex: (name) => blocksFile.getBlockIndex(name),
    getBlock: (index) => {
      let b = ground.get(index);
      if (b === undefined) {
        const block = blocksFile.getBlock(index);
        const groundTiles = block?.rmbBlock?.fldHeader?.groundData?.groundTiles;
        b = groundTiles ? { rmbBlock: { fldHeader: { groundData: { groundTiles } } } } : block;
        ground.set(index, b);
      }
      return b;
    },
  };
  const scratch = new Uint8Array(WORLD_MAP_TILE_DIM * WORLD_MAP_TILE_DIM);
  return (dfLocation) => {
    const loc = as ? { ...dfLocation, ...as } : dfLocation;
    const door = worldDataDoor();
    const own = door !== null && (!Number.isInteger(loc.regionIndex) || !Number.isInteger(loc.locationIndex) || (door.locationPinned?.(loc.regionIndex, loc.locationIndex) ?? true));
    return setLocationTiles(loc, mapsFile, own ? blocksFile : shared, scratch.fill(0));
  };
}

export function bilinearInterpolator(valx0y0, valx0y1, valx1y0, valx1y1, u, v) {
  return (1 - u) * ((1 - v) * valx0y0 + v * valx0y1) +
    u * ((1 - v) * valx1y0 + v * valx1y1);
}

export function calcAvgMaxHeight(heightmapData) {
  let avg = 0;
  let max = 0;
  for (let i = 0; i < heightmapData.length; i++) {
    const h = heightmapData[i];
    avg += h;
    if (h > max) max = h;
  }
  return [avg / heightmapData.length, max];
}

/**
 * @param {Float32Array} heightmapData
 * @param {number} avgHeight
 * @param {{xMin,xMax,yMin,yMax}} locationRect
 */
export function blendLocationTerrain(heightmapData, avgHeight, locationRect, hDim = HEIGHTMAP_DIMENSION) {
  const xMin = locationRect.xMin / WORLD_MAP_TILE_DIM;
  const xMax = locationRect.xMax / WORLD_MAP_TILE_DIM;
  const yMin = locationRect.yMin / WORLD_MAP_TILE_DIM;
  const yMax = locationRect.yMax / WORLD_MAP_TILE_DIM;
  const leftScale = 1 / xMin;
  const rightScale = 1 / (1 - xMax);
  const topScale = 1 / yMin;
  const bottomScale = 1 / (1 - yMax);
  let strength = 0;
  const targetHeight = avgHeight;
  for (let y = 0; y < hDim; y++) {
    const v = y / (hDim - 1);
    const insideY = v >= yMin && v <= yMax;
    for (let x = 0; x < hDim; x++) {
      const u = x / (hDim - 1);
      const insideX = u >= xMin && u <= xMax;
      if (insideX || insideY) {
        if (insideY && u <= xMin) strength = u * leftScale;
        else if (insideY && u >= xMax) strength = (1 - u) * rightScale;
        else if (insideX && v <= yMin) strength = v * topScale;
        else if (insideX && v >= yMax) strength = (1 - v) * bottomScale;
      } else {
        let xs = 0, ys = 0;
        if (u <= xMin) xs = u * leftScale; else if (u >= xMax) xs = (1 - u) * rightScale;
        if (v <= yMin) ys = v * topScale; else if (v >= yMax) ys = (1 - v) * bottomScale;
        strength = bilinearInterpolator(0, 0, 0, 1, xs, ys);
      }
      const idx = y + x * hDim;
      const height = heightmapData[idx];
      heightmapData[idx] = (insideX && insideY)
        ? targetHeight
        : height + (targetHeight - height) * strength;
    }
  }
}
