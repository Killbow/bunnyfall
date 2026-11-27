// Cells store `weight << 4` with tile flags in the low nibble; a nonzero automap byte blocks a cell, and each 16x16
// ground tile weights 4x4 cells.

import { RMB_SIDE } from './locationLayout.js';
import { WATER_MASK_TABLE } from './waterCorners.js';

// DFU's `TileTypes` misses twelve shore and shallow records that `PlayerMotor` treats as water, so the enhanced
// lane builds its list from `WATER_MASK_TABLE`; the classic lane keeps DFU's seven.
export const WATER_RECORDS_ENHANCED = Object.freeze((() => {
  const out = [];
  for (let record = 0; record < 64; record++) {
    let any = 0;
    for (let t = 0; t < 4; t++) any |= WATER_MASK_TABLE[(record << 2) | t];
    if (any) out.push(record);
  }
  return out;
})());

export const WATER_RECORDS_CLASSIC = Object.freeze([0, 5, 6, 20, 21, 30, 31]);

export const NAV_CELLS_PER_BLOCK = 64;
export const NAV_CELL = RMB_SIDE / NAV_CELLS_PER_BLOCK;
export const HALF_CELL = NAV_CELL / 2;
export const TILE_FLAG_OCCUPIED = 1;

export function tileWeight(tile, { enhancedWater = false } = {}) {
  if (enhancedWater && WATER_RECORDS_ENHANCED.includes(tile)) return 0;
  switch (tile) {
    case 0: case 5: case 6: case 20: case 21: case 30: case 31:
      return 0;
    case 3: return 4;
    case 1: return 6;
    case 2: return 12;
    case 46: case 47: case 55: return 15;
    default: return 7;
  }
}

export class CityNavigation {
  /** @param blocksW */
  constructor(blocksW, blocksH) {
    this.width = blocksW * NAV_CELLS_PER_BLOCK;
    this.height = blocksH * NAV_CELLS_PER_BLOCK;
    this.grid = new Uint8Array(this.width * this.height);
  }

  // RMB rows run opposite to world z, so each block's rows are flipped here, as the rendered ground does, and
  // `navToWorld` stays direct.
  setBlockData(xBlock, yBlock, autoMap, groundTile, { enhancedWater = false } = {}) {
    for (let y = 0; y < NAV_CELLS_PER_BLOCK; y++) {
      const worldRow = yBlock * NAV_CELLS_PER_BLOCK + (NAV_CELLS_PER_BLOCK - 1 - y);
      for (let x = 0; x < NAV_CELLS_PER_BLOCK; x++) {
        if (autoMap[y * NAV_CELLS_PER_BLOCK + x] !== 0) continue;
        const w = tileWeight(groundTile(x >> 2, y >> 2) & 0x3f, { enhancedWater });
        this.grid[worldRow * this.width + (xBlock * NAV_CELLS_PER_BLOCK + x)] = (w << 4) & 0xff;
      }
    }
  }

  inBounds(gx, gy) { return gx >= 0 && gy >= 0 && gx < this.width && gy < this.height; }
  weightAt(gx, gy) { return this.inBounds(gx, gy) ? this.grid[gy * this.width + gx] >> 4 : 0; }
  occupied(gx, gy) { return this.inBounds(gx, gy) ? (this.grid[gy * this.width + gx] & TILE_FLAG_OCCUPIED) !== 0 : false; }
  setOccupied(gx, gy) { if (this.inBounds(gx, gy)) this.grid[gy * this.width + gx] |= TILE_FLAG_OCCUPIED; }
  clearOccupied(gx, gy) { if (this.inBounds(gx, gy)) this.grid[gy * this.width + gx] &= ~TILE_FLAG_OCCUPIED; }

  navToWorld(gx, gy) { return [gx * NAV_CELL + HALF_CELL, gy * NAV_CELL + HALF_CELL]; }
  worldToNav(x, z) { return [Math.floor(x / NAV_CELL), Math.floor(z / NAV_CELL)]; }

  getRandomSpawnPosition(originGx, originGy, radius = 64, maxAttempts = 10, rand = Math.random) {
    for (let i = 0; i <= maxAttempts; i++) {
      const gx = originGx + Math.floor(rand() * (radius * 2 + 1)) - radius;
      const gy = originGy + Math.floor(rand() * (radius * 2 + 1)) - radius;
      if (this.weightAt(gx, gy) > 0) return [gx, gy];
    }
    return null;
  }
}
