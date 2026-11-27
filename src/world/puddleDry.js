// @ts-check
// Dries a town's puddles: single-tile and shallow-water-art water patches in RMB block ground become dry ground.
import { waterCorners, WATER_DRAW_MASK_TABLE } from './waterCorners.js';
import { PUDDLE_RECORDS } from './puddleMask.js';
import { convertTile } from './terrainSurface.js';
import { GROUND_RECORD_LIMIT as RECORD_LIMIT } from './terrainTiles.js';

const PUDDLE = new Set(PUDDLE_RECORDS);
const DIM = 16;
const NEIGHBOURS = Object.freeze([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);
const STEPS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

export function groundTileWet(tile) {
  if (!tile || tile.textureRecord >= RECORD_LIMIT) return false;
  return waterCorners(convertTile(tile.tileBitfield), WATER_DRAW_MASK_TABLE) !== 0;
}

const tileOf = (bitfield) => ({
  tileBitfield: bitfield, textureRecord: bitfield & 0x3f, isRotated: (bitfield & 0x40) === 0x40, isFlipped: (bitfield & 0x80) === 0x80,
});

const _dried = new WeakSet();

/**
 * @param {Array<Array<{tileBitfield:number,textureRecord:number}>>} groundTiles
 * @returns {number}
 */
export function dryPuddles(groundTiles) {
  if (!Array.isArray(groundTiles) || groundTiles.length !== DIM || _dried.has(groundTiles)) return 0;
  _dried.add(groundTiles);
  const at = (x, y) => (x >= 0 && y >= 0 && x < DIM && y < DIM ? groundTiles[x]?.[y] : null);
  const wet = (x, y) => groundTileWet(at(x, y));
  const seen = new Uint8Array(DIM * DIM);
  const plan = [];
  for (let x = 0; x < DIM; x++) {
    for (let y = 0; y < DIM; y++) {
      if (seen[x * DIM + y] || !wet(x, y)) continue;
      const patch = [];
      const stack = [[x, y]];
      seen[x * DIM + y] = 1;
      while (stack.length) {
        const [cx, cy] = /** @type {number[]} */ (stack.pop());
        patch.push([cx, cy]);
        for (const [dx, dy] of STEPS) {
          const nx = cx + dx, ny = cy + dy;
          if (wet(nx, ny) && !seen[nx * DIM + ny]) { seen[nx * DIM + ny] = 1; stack.push([nx, ny]); }
        }
      }
      if (patch.length > 1 && !patch.every(([px, py]) => PUDDLE.has(at(px, py).textureRecord))) continue;
      for (const [px, py] of patch) {
        const count = new Map();
        for (const [dx, dy] of NEIGHBOURS) {
          const n = at(px + dx, py + dy);
          if (!n || n.textureRecord >= RECORD_LIMIT || groundTileWet(n)) continue;
          count.set(n.tileBitfield, (count.get(n.tileBitfield) ?? 0) + 1);
        }
        let best = -1, most = 0;
        for (const [bits, n] of count) if (n > most) { most = n; best = bits; }
        if (best >= 0) plan.push([px, py, best]);
      }
    }
  }
  for (const [x, y, bits] of plan) groundTiles[x][y] = tileOf(bits);
  return plan.length;
}
