// Reads the drawn Bantha jungle area into map pixel rows for src/world/jungle/banthaArea.js.
// Run: ARENA2_PATH=/path/to/arena2 node tools/banthaArea.mjs.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MapsFile, REGION_RACES, REGION_NAMES } from '../src/formats/mapsFile.js';
import { isMain } from './lib/isMain.mjs';

export const BANTHA_DRAWN = Object.freeze([
  [108, 339, 340, 388, 399],
  [109, 359, 364, 390, 390, 394, 397],
  [110, 236, 237, 319, 323, 330, 334, 357, 362, 367, 369, 371, 372, 374, 375],
  [111, 236, 238, 258, 260, 277, 278, 299, 307, 318, 323, 326, 339, 345, 345, 356, 361, 364, 378, 381, 384],
  [112, 237, 237, 245, 247, 254, 254, 257, 264, 276, 281, 288, 289, 294, 308, 317, 339, 343, 345, 349, 358, 362, 388],
  [113, 243, 268, 274, 345, 349, 354, 360, 390, 398, 399],
  [114, 237, 334, 342, 343, 359, 399],
  [115, 237, 331, 358, 399],
  [116, 237, 331, 343, 399],
  [117, 237, 399],
  [118, 237, 250, 253, 399],
  [119, 238, 246, 248, 250, 253, 399],
  [120, 238, 244, 246, 250, 256, 399],
  [121, 238, 248, 257, 399],
  [122, 238, 244, 258, 399],
  [123, 242, 243, 258, 399],
  [124, 249, 249, 258, 399],
  [125, 258, 399],
  [126, 258, 399],
  [127, 257, 399],
  [128, 261, 399],
  [129, 264, 399],
  [130, 268, 399],
  [131, 271, 399],
  [132, 274, 399],
  [133, 277, 399],
  [134, 280, 399],
  [135, 283, 399],
  [136, 287, 399],
  [137, 290, 399],
  [138, 293, 399],
  [139, 296, 399],
  [140, 299, 399],
  [141, 302, 399],
  [142, 305, 399]

].map((r) => Object.freeze(r)));
export const DRAWN_W = 400;
export const DRAWN_H = 200;
export const DRAWN_SCALE = 2.5;
export const DRAWN_SIGMA = 0.75;
export const COAST_REACH = 6;
const SEA = 31;

/** @param {{ width: number, height: number, regionAt: (x: number, y: number) => number, races: readonly number[], drawing?: readonly (readonly number[])[] }} o */
export function banthaArea({ width, height, regionAt, races, drawing = BANTHA_DRAWN }) {
  const W = DRAWN_W, H = DRAWN_H;
  const drawn = new Float64Array(W * H);
  for (const [v, ...runs] of drawing) for (let k = 0; k < runs.length; k += 2) for (let u = runs[k]; u <= runs[k + 1]; u++) drawn[v * W + u] = 1;
  const R = 3, taps = [];
  let sum = 0;
  for (let i = -R; i <= R; i++) { const w = Math.exp(-(i * i) / (2 * DRAWN_SIGMA * DRAWN_SIGMA)); taps.push(w); sum += w; }
  for (let i = 0; i < taps.length; i++) taps[i] /= sum;
  const clampI = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);
  const across = new Float64Array(W * H), soft = new Float64Array(W * H);
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) { let s = 0; for (let i = -R; i <= R; i++) s += taps[i + R] * drawn[v * W + clampI(u + i, W)]; across[v * W + u] = s; }
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) { let s = 0; for (let i = -R; i <= R; i++) s += taps[i + R] * across[clampI(v + i, H) * W + u]; soft[v * W + u] = s; }
  const at = (fu, fv) => {
    const u = Math.min(Math.max(fu, 0), W - 1.001), v = Math.min(Math.max(fv, 0), H - 1.001);
    const u0 = Math.floor(u), v0 = Math.floor(v), a = u - u0, b = v - v0;
    return (soft[v0 * W + u0] * (1 - a) + soft[v0 * W + u0 + 1] * a) * (1 - b) + (soft[(v0 + 1) * W + u0] * (1 - a) + soft[(v0 + 1) * W + u0 + 1] * a) * b;
  };
  const region = new Int16Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) region[y * width + x] = regionAt(x, y);
  const south = (i) => region[i] !== SEA && races[region[i]] === 1;
  const area = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (south(i) && at((x + 0.5) / DRAWN_SCALE - 0.5, (y + 0.5) / DRAWN_SCALE - 0.5) >= 0.5) area[i] = 1;
    }
  }
  for (let x = 0; x < width; x++) {
    let top = -1;
    for (let y = 0; y < height; y++) if (area[y * width + x]) { top = y; break; }
    if (top < 0) continue;
    let y = top - 1;
    while (y >= 0 && top - y <= COAST_REACH && south(y * width + x)) y--;
    if (y >= 0 && region[y * width + x] === SEA) for (let k = y + 1; k < top; k++) area[k * width + x] = 1;
  }
  const seen = new Uint8Array(width * height);
  for (let s = 0; s < width * height; s++) {
    if (area[s] || seen[s]) continue;
    const piece = [s];
    seen[s] = 1;
    let open = false, dry = false;
    for (let q = 0; q < piece.length; q++) {
      const i = piece[q], x = i % width, y = (i - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) open = true;
      if (region[i] !== SEA) dry = true;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
        if (j >= 0 && !area[j] && !seen[j]) { seen[j] = 1; piece.push(j); }
      }
    }
    if (!open && !dry) for (const i of piece) area[i] = 1;
  }
  return area;
}

export function areaRows(area, width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = [y];
    for (let x = 0; x < width; x++) {
      if (!area[y * width + x]) continue;
      const first = x;
      while (x + 1 < width && area[y * width + x + 1]) x++;
      row.push(first, x);
    }
    if (row.length > 1) rows.push(row);
  }
  return rows;
}

if (isMain(import.meta.url)) {
  const A = process.env.ARENA2_PATH;
  if (!A) { console.log('banthaArea: set ARENA2_PATH to the ARENA2 folder (sh tools/fetch-data.sh)'); process.exit(0); }
  const rd = (f) => new Uint8Array(readFileSync(join(A, f)));
  const maps = new MapsFile(); maps.load(rd('MAPS.BSA'), rd('CLIMATE.PAK'), rd('POLITIC.PAK'));
  const W = 1000, H = 500;
  const area = banthaArea({ width: W, height: H, regionAt: (x, y) => maps.getRegionIndexAt(x, y), races: REGION_RACES });
  const rows = areaRows(area, W, H);
  const by = new Map(), clim = new Map();
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!area[i]) continue;
    n++;
    const x = i % W, y = (i - x) / W, r = REGION_NAMES[maps.getRegionIndexAt(x, y)], c = maps.getClimateIndex(x, y);
    by.set(r, (by.get(r) ?? 0) + 1); clim.set(c, (clim.get(c) ?? 0) + 1);
  }
  console.log(rows.map((r) => `  [${r.join(', ')}],`).join('\n'));
  console.log(`// ${n} pixels in ${rows.length} rows; regions ${JSON.stringify([...by].sort((a, b) => b[1] - a[1]))}; climates ${JSON.stringify([...clim].sort((a, b) => b[1] - a[1]))}`);
}
