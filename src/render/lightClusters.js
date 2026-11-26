// @ts-check
// Clustered lights: each light is listed in every cell its view-space box touches. The shader still runs each
// light's range test, so the grid only skips lights that cannot reach a fragment.

import { pageParam } from '../platform/pageQuery.js';

export const CLUSTER_X = 16;
export const CLUSTER_Y = 9;
export const CLUSTER_Z = 24;
export const CLUSTER_CELLS = CLUSTER_X * CLUSTER_Y * CLUSTER_Z;
export const CLUSTER_NEAR = 0.25;
export const CLUSTER_FAR = 256;
export const CLUSTER_LIST_W = 256;
export const CLUSTER_LIST_ROWS = 256;
// A frame whose lists would pass the cap falls back to the plain loop over every light.
export const CLUSTER_LIST_CAP = CLUSTER_LIST_W * CLUSTER_LIST_ROWS;
export const CLUSTER_GRID_W = CLUSTER_X * CLUSTER_Y;
export const CLUSTER_GRID_H = CLUSTER_Z;
// Units 9 and 10 hold only these two 2D textures: an array texture bound to the same unit under a sampler2DArray
// makes the draw an INVALID_OPERATION.
export const CLUSTER_GRID_UNIT = 9;
export const CLUSTER_LIST_UNIT = 10;

const LOG_FAR_NEAR = Math.log(CLUSTER_FAR / CLUSTER_NEAR);
export const CLUSTER_Z_SCALE = CLUSTER_Z / LOG_FAR_NEAR;

export function clustersOn(search = globalThis.location?.search ?? '') {
  return pageParam('clusters', search) !== 'off';
}

// sliceOf and cellOfPoint use the same arithmetic as elCluster in the lane's shader; change them together.
export function sliceOf(depth) {
  if (!(depth > CLUSTER_NEAR)) return 0;
  const k = Math.floor(Math.log(depth / CLUSTER_NEAR) * CLUSTER_Z_SCALE);
  return k < 0 ? 0 : k >= CLUSTER_Z ? CLUSTER_Z - 1 : k;
}

export const clusterCellOf = (x, y, z) => x + y * CLUSTER_X + z * CLUSTER_X * CLUSTER_Y;

export function createClusterSpace() {
  return {
    counts: new Uint16Array(CLUSTER_CELLS),
    grid: new Uint16Array(CLUSTER_CELLS * 2),
    list: new Uint8Array(CLUSTER_LIST_CAP),
    total: 0,
    lights: 0,
    rows: 0,
    built: false,
    _tiles: new Int16Array(4),
    _box: new Int16Array(7 * 64),
  };
}

// The hosts' near planes sit closer than CLUSTER_NEAR, so a sphere that reaches inside it is listed in every tile
// of slice 0, where those fragments land.
export function cellsOfSphere(vx, vy, vz, r, proj, box, at) {
  const depth = -vz;
  const dFar = depth + r;
  if (dFar <= 0) return false;
  const nearFull = depth - r < CLUSTER_NEAR;
  box[at + 6] = nearFull ? 1 : 0;
  if (dFar < CLUSTER_NEAR) {
    box[at] = 0; box[at + 1] = CLUSTER_X - 1; box[at + 2] = 0; box[at + 3] = CLUSTER_Y - 1; box[at + 4] = 0; box[at + 5] = 0;
    return true;
  }
  const dNear = Math.max(depth - r, CLUSTER_NEAR);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let c = 0; c < 8; c++) {
    const x = c & 1 ? vx + r : vx - r;
    const y = c & 2 ? vy + r : vy - r;
    const z = c & 4 ? -dFar : -dNear;
    const cw = proj[3] * x + proj[7] * y + proj[11] * z + proj[15];
    if (!(cw > 1e-6)) return false;
    const nx = (proj[0] * x + proj[4] * y + proj[8] * z + proj[12]) / cw;
    const ny = (proj[1] * x + proj[5] * y + proj[9] * z + proj[13]) / cw;
    if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
    if (ny < minY) minY = ny; if (ny > maxY) maxY = ny;
  }
  if (minX > 1 || maxX < -1 || minY > 1 || maxY < -1) {
    if (!nearFull) return false;
    box[at] = 0; box[at + 1] = CLUSTER_X - 1; box[at + 2] = 0; box[at + 3] = CLUSTER_Y - 1; box[at + 4] = 0; box[at + 5] = 0;
    return true;
  }
  const tile = (n, cells) => { const t = Math.floor((n + 1) * 0.5 * cells); return t < 0 ? 0 : t >= cells ? cells - 1 : t; };
  box[at] = tile(minX, CLUSTER_X); box[at + 1] = tile(maxX, CLUSTER_X);
  box[at + 2] = tile(minY, CLUSTER_Y); box[at + 3] = tile(maxY, CLUSTER_Y);
  box[at + 4] = sliceOf(dNear); box[at + 5] = sliceOf(dFar);
  return true;
}
function tilesIn(box, at, cz, out) {
  if (cz === 0 && box[at + 6]) { out[0] = 0; out[1] = CLUSTER_X - 1; out[2] = 0; out[3] = CLUSTER_Y - 1; }
  else { out[0] = box[at]; out[1] = box[at + 1]; out[2] = box[at + 2]; out[3] = box[at + 3]; }
  return out;
}

export function buildLightClusters(lights, count, view, proj, space) {
  const counts = space.counts, grid = space.grid, list = space.list, box = space._box;
  counts.fill(0);
  space.total = 0; space.lights = 0; space.rows = 0; space.built = false;
  // A list entry is one byte, so at most 255 lights enter the grid.
  const n = Math.min(count, box.length / 7, 255);
  const t4 = space._tiles;
  let total = 0, touched = 0;
  for (let i = 0; i < n; i++) {
    const r = lights[i * 4 + 3];
    const at = i * 7;
    box[at] = -1;
    if (!(r > 0)) continue;
    const x = lights[i * 4], y = lights[i * 4 + 1], z = lights[i * 4 + 2];
    const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
    const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
    const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
    if (!cellsOfSphere(vx, vy, vz, r, proj, box, at)) { box[at] = -1; continue; }
    touched++;
    const z0 = box[at + 4], z1 = box[at + 5];
    for (let cz = z0; cz <= z1; cz++) {
      const [x0, x1, y0, y1] = tilesIn(box, at, cz, t4);
      total += (x1 - x0 + 1) * (y1 - y0 + 1);
      for (let cy = y0; cy <= y1; cy++) {
        const row = cy * CLUSTER_X + cz * CLUSTER_X * CLUSTER_Y;
        for (let cx = x0; cx <= x1; cx++) counts[row + cx]++;
      }
    }
  }
  space.lights = touched;
  if (total > CLUSTER_LIST_CAP) return false;
  let off = 0;
  for (let c = 0; c < CLUSTER_CELLS; c++) {
    grid[c * 2] = off; grid[c * 2 + 1] = counts[c];
    off += counts[c];
    counts[c] = 0;
  }
  for (let i = 0; i < n; i++) {
    const at = i * 7;
    if (box[at] < 0) continue;
    const z0 = box[at + 4], z1 = box[at + 5];
    for (let cz = z0; cz <= z1; cz++) {
      const [x0, x1, y0, y1] = tilesIn(box, at, cz, t4);
      for (let cy = y0; cy <= y1; cy++) {
        const row = cy * CLUSTER_X + cz * CLUSTER_X * CLUSTER_Y;
        for (let cx = x0; cx <= x1; cx++) {
          const c = row + cx;
          list[grid[c * 2] + counts[c]++] = i;
        }
      }
    }
  }
  space.total = total;
  space.rows = Math.min(CLUSTER_LIST_ROWS, Math.ceil(total / CLUSTER_LIST_W));
  space.built = true;
  return true;
}

export function cellLights(space, x, y, z) {
  const c = clusterCellOf(x, y, z);
  const off = space.grid[c * 2], cnt = space.grid[c * 2 + 1];
  return Array.from(space.list.subarray(off, off + cnt));
}

export function cellOfPoint(wp, view, proj, viewport) {
  const x = wp[0], y = wp[1], z = wp[2];
  const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
  const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
  const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
  const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15];
  if (!(cw > 1e-6)) return null;
  const nx = (proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12]) / cw;
  const ny = (proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13]) / cw;
  if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return null;
  const px = (nx + 1) * 0.5 * viewport[2], py = (ny + 1) * 0.5 * viewport[3];
  const tx = Math.min(CLUSTER_X - 1, Math.floor(px * CLUSTER_X / viewport[2]));
  const ty = Math.min(CLUSTER_Y - 1, Math.floor(py * CLUSTER_Y / viewport[3]));
  return [tx, ty, sliceOf(-vz)];
}

export function meanListLength(space) {
  let sum = 0;
  for (let c = 0; c < CLUSTER_CELLS; c++) sum += space.grid[c * 2 + 1];
  return sum / CLUSTER_CELLS;
}
