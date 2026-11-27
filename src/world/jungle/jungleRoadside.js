// @ts-check
// Each roadside pair file holds two trees and the lianas between them. It is cut into two halves, each a near-only
// prototype instanced at its own tree root, so each half hands over to the far picture of its species. A root is
// the middle of what sinks below the file ground, because the lianas would pull a lowest-band root toward the road.
import { parseObj, parseMtl, objMesh, eachDrawn, FOOT_TOP, JUNGLE_SPECIES } from './jungleModels.js';
import { HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE, TERRAIN_SIZE } from '../terrainSampler.js';
import { WORLD_MAP_TILE_DIM } from '../terrainTiles.js';
import { surfaceHeightAt } from '../terrainSurface.js';
import { ARMS, roadRoom, PATH_HALF_M } from '../roadBand.js';
import { pathsDataPoint } from '../pathData.js';
import { tileDraw } from '../terrainNature.js';

export const JUNGLE_PAIRS = Object.freeze([
  Object.freeze({ key: 'leaning', file: 'pine', trees: Object.freeze([4, 1]) }),
  Object.freeze({ key: 'fig', file: 'pine-1', trees: Object.freeze([4, 2]) }),
  Object.freeze({ key: 'sunk', file: 'pine2', trees: Object.freeze([4, 1]) }),
]);

export const pairRecord = (p, side) => `jungle-pair-${p.key}.${side}`;

export const pairFiles = (p) => ({ obj: `${p.file}.obj`, mtl: `${p.file}.mtl` });

/**
 * Must match the instance turn in `BB_VS` (`render/renderer.js`) so the trees of a pair appear where the near
 * meshes draw them.
 * @param {number} x
 * @param {number} z
 * @param {number} t
 * @returns {[number, number]}
 */
export const turnXZ = (x, z, t) => [Math.cos(t) * x + Math.sin(t) * z, -Math.sin(t) * x + Math.cos(t) * z];

/**
 * @param {string} objText
 * @param {string} mtlText
 * @param {{ trees: ReadonlyArray<number> }} pair
 * @param {ReadonlyArray<string>} pictures
 * @param {ReadonlyArray<number>} speciesLow
 */
export function readPair(objText, mtlText, pair, pictures, speciesLow) {
  const obj = parseObj(objText), mtl = parseMtl(mtlText);
  const pictureOf = (material) => mtl.get(material ?? '')?.mapKd ?? null;
  const P = obj.positions;
  const roots = pair.trees.map((species) => {
    const pic = pictures[species];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, low = Infinity;
    for (const f of obj.faces) {
      if (pictureOf(f.material) !== pic) continue;
      for (const c of f.corners) {
        const x = P[c[0] * 3], y = P[c[0] * 3 + 1], z = P[c[0] * 3 + 2];
        low = Math.min(low, y);
        if (y >= 0) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
    }
    if (!(x1 >= x0)) throw new Error(`jungle pair: no tree of ${pic} stands into its ground`);
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, base: low - speciesLow[species] };
  });
  const named = (mesh) => ({
    ...mesh,
    subs: mesh.subs.map((s) => {
      const picture = pictureOf(s.material);
      if (!picture) throw new Error(`jungle pair: ${s.material} names no picture`);
      return { ...s, picture };
    }),
  });
  const ax = (roots[0].x + roots[1].x) / 2, az = (roots[0].z + roots[1].z) / 2;
  const dx = roots[1].x - roots[0].x, dz = roots[1].z - roots[0].z;
  const sideOf = (f) => {
    let cx = 0, cz = 0;
    for (const c of f.corners) { cx += P[c[0] * 3]; cz += P[c[0] * 3 + 2]; }
    cx /= f.corners.length; cz /= f.corners.length;
    return (cx - ax) * dx + (cz - az) * dz < 0 ? 0 : 1;
  };
  const halves = roots.map((r, k) => named(objMesh({ ...obj, faces: obj.faces.filter((f) => sideOf(f) === k) }, r.x, r.z)));
  return {
    mesh: named(objMesh(obj, ax, az)), halves, anchor: [ax, az],
    roots: roots.map((r) => [-(r.x - ax), r.z - az]),
    base: roots.map((r) => r.base),
  };
}

export const PAIR_MEASURE_STEP = 0.02;
export const UNDER_TOP = 8;
export const UNDER_CELL = 0.5;

/**
 * @param {ReturnType<typeof readPair>} read
 * @param {(picture: string) => {width: number, height: number, data: Uint8Array}} picOf
 * @param {number} [step]
 */
export function measurePair(read, picOf, step = PAIR_MEASURE_STEP) {
  const [[ax, az], [bx, bz]] = read.roots;
  const feet = [0, 0], points = [];
  let height = 0;
  for (const s of read.mesh.subs) {
    eachDrawn(read.mesh, picOf(s.picture), step, (x, y, z) => {
      height = Math.max(height, y);
      points.push(x, y, z);
      if (y >= FOOT_TOP) return;
      const da = Math.hypot(x - ax, z - az), db = Math.hypot(x - bx, z - bz);
      if (da <= db) feet[0] = Math.max(feet[0], da); else feet[1] = Math.max(feet[1], db);
    }, s.at, s.count);
  }
  const d = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / d, uz = (bz - az) / d, mid = (feet[0] - feet[1]) / 2;
  const band = PATH_HALF_M / JUNGLE_ROADSIDE.scale[0];
  let over = Infinity, reach = 0;
  const cells = new Map();
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    const a = x * ux + z * uz, b = -x * uz + z * ux;
    if (Math.abs(a - mid) > band) continue;
    over = Math.min(over, y);
    reach = Math.max(reach, Math.abs(b));
    if (y >= UNDER_TOP) continue;
    const key = `${Math.floor(a / UNDER_CELL)},${Math.floor(b / UNDER_CELL)}`;
    if (!(cells.get(key) <= y)) cells.set(key, y);
  }
  const under = [...cells].map(([key, y]) => {
    const [i, j] = key.split(',').map(Number), a = (i + 0.5) * UNDER_CELL, b = (j + 0.5) * UNDER_CELL;
    return [a * ux - b * uz, a * uz + b * ux, y];
  });
  return { feet, height, over, reach, under };
}

// Precomputed `readPair` and `measurePair` results so the terrain worker places pairs without reading files.
// Remeasure when a pair file changes.
export const JUNGLE_PAIR_MEASURES = Object.freeze([
  Object.freeze({
    roots: Object.freeze([Object.freeze([-4.439, 16.334]), Object.freeze([4.439, -16.334])]), base: Object.freeze([0, 0.21]),
    feet: Object.freeze([6.42, 8.53]), height: 22.55, over: 4.12, reach: 8.99,
    under: Object.freeze([[6.09, -4.3, 5.83], [5.61, -4.43, 5.81], [5.13, -4.57, 5.8], [5, -4.08, 5.8], [4.64, -4.7, 6.35], [3.55, -4.48, 5.77], [3.07, -4.61, 5.77], [2.58, -4.74, 5.77], [2.45, -4.26, 5.76], [1.97, -4.39, 5.76], [2.1, -4.87, 5.99], [1.62, -5, 6.43], [-1.06, -4.69, 6.41], [-1.54, -4.82, 6.41], [3.2, -5.09, 6.5], [3.68, -4.96, 6.59], [-0.93, -5.17, 6.61], [2.71, -5.22, 6.69], [-1.41, -5.3, 6.68], [2.23, -5.35, 6.94], [1.14, -5.13, 6.93], [-1.89, -5.44, 6.96], [0.65, -5.26, 7.1], [1.75, -5.48, 7.18], [0.17, -5.39, 7.33], [1.27, -5.61, 7.41], [-0.79, -5.66, 7.5], [-1.28, -5.79, 7.64], [0.78, -5.75, 7.72], [0.3, -5.88, 7.88], [-1.76, -5.92, 7.86], [-2.11, -0.83, 7.98], [-2.24, -0.35, 7.85], [-2.37, 0.13, 7.73], [-2.5, 0.62, 7.6], [-2.63, 1.1, 7.46], [-2.76, 1.58, 7.43], [-2.89, 2.06, 7.5], [-3.02, 2.55, 7.59], [-3.15, 3.03, 7.67], [-3.29, 3.51, 7.76], [-3.42, 3.99, 7.84], [-3.55, 4.48, 7.92], [-1.63, -6.4, 7.86], [-2.24, -6.05, 7.77], [-2.37, -5.57, 7.68], [-2.5, -5.08, 7.57], [-2.64, -4.6, 7.5], [-2.77, -4.12, 7.43], [-2.9, -3.64, 7.36], [-3.03, -3.15, 7.4], [-3.16, -2.67, 7.52], [-3.29, -2.19, 7.64], [-3.42, -1.71, 7.76], [-3.55, -1.22, 7.87], [-3.68, -0.74, 7.99], [-1.67, -4.34, 7.76], [-2.98, 6.19, 4.12], [-2.49, 6.32, 5.91], [-2.93, 4.12, 7.46], [-2.8, 3.64, 7.85]].map((c) => Object.freeze(c))),
  }),
  Object.freeze({
    roots: Object.freeze([Object.freeze([-3.256, 17.506]), Object.freeze([3.256, -17.506])]), base: Object.freeze([0, 0]),
    feet: Object.freeze([6.42, 7.56]), height: 22.55, over: 7.46, reach: 2.78,
    under: Object.freeze([[-0.14, -3.33, 7.76], [-1.7, 5.02, 7.46]].map((c) => Object.freeze(c))),
  }),
  Object.freeze({
    roots: Object.freeze([Object.freeze([-4.439, 15.926]), Object.freeze([4.439, -15.926])]), base: Object.freeze([0, -2]),
    feet: Object.freeze([6.42, 8.53]), height: 22.55, over: 4.12, reach: 4.28,
    under: Object.freeze([[-1.51, -4.83, 7.76], [-3.02, 6.17, 4.12], [-2.53, 6.3, 7.99], [-2.83, 3.62, 7.46]].map((c) => Object.freeze(c))),
  }),
]);

export const JUNGLE_ROADSIDE = Object.freeze({
  first: 44,
  step: 40,
  end: 24,
  jitter: 8,
  chance: 0.6,
  scale: Object.freeze([0.92, 1.08]),
  sink: 0.3,
  bury: 3,
  headroom: 2.75,
  clear: 9,
  salt: 600,
});
// Guaranteed by `first`, `end`, and `jitter` alone, so no neighbor pixel trunk can come within `clear`. Any change
// to those values must keep this bound.
export const EDGE_MIN = 19;

const PIXEL = TERRAIN_SIZE, HALF = PIXEL / 2;

/**
 * Uses the drawn surface (two planes per heightmap cell, as in `surfaceHeightAt`), not bilinear `groundAt`, which
 * can sit up to half a meter higher.
 * @param {Float32Array} heightmapData
 * @param {number} x
 * @param {number} z
 * @param {number} r
 */
export function lowestDrawn(heightmapData, x, z, r) {
  const hDim = HEIGHTMAP_DIMENSION, cell = PIXEL / (hDim - 1), yScale = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  const at = (i, j) => heightmapData[Math.max(0, Math.min(hDim - 1, i)) * hDim + Math.max(0, Math.min(hDim - 1, j))];
  let lo = surfaceHeightAt(heightmapData, x, z);
  const ask = (px, pz) => { lo = Math.min(lo, surfaceHeightAt(heightmapData, px, pz)); };
  const i0 = Math.floor((x - r) / cell), i1 = Math.ceil((x + r) / cell), j0 = Math.floor((z - r) / cell), j1 = Math.ceil((z + r) / cell);
  for (let i = Math.max(0, i0); i <= Math.min(hDim - 1, i1); i++) {
    for (let j = Math.max(0, j0); j <= Math.min(hDim - 1, j1); j++) if (Math.hypot(i * cell - x, j * cell - z) <= r) lo = Math.min(lo, heightmapData[i * hDim + j] * yScale);
  }
  for (let i = i0; i <= i1; i++) { const e = i * cell - x; if (Math.abs(e) <= r) { const h = Math.sqrt(r * r - e * e); ask(i * cell, z + h); ask(i * cell, z - h); } }
  for (let j = j0; j <= j1; j++) { const e = j * cell - z; if (Math.abs(e) <= r) { const h = Math.sqrt(r * r - e * e); ask(x + h, j * cell); ask(x - h, j * cell); } }
  for (let k = i0 - j1; k <= i1 - j0; k++) {
    const v = (k * cell - x + z) / (r * Math.SQRT2);
    if (Math.abs(v) > 1) continue;
    const w = Math.acos(v);
    for (const t of [w - Math.PI / 4, -w - Math.PI / 4]) ask(x + r * Math.cos(t), z + r * Math.sin(t));
  }
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const h00 = at(i, j), h10 = at(i + 1, j), h01 = at(i, j + 1), h11 = at(i + 1, j + 1);
      for (const [gx, gz] of [[h11 - h01, h01 - h00], [h10 - h00, h11 - h10]]) {
        const g = Math.hypot(gx, gz);
        if (g > 0) ask(x - (r * gx) / g, z - (r * gz) / g);
      }
    }
  }
  return lo;
}

/**
 * @param {Float32Array} heightmapData
 * @param {ReadonlyArray<ReadonlyArray<number>>} corners
 */
export function highestDrawn(heightmapData, corners) {
  const hDim = HEIGHTMAP_DIMENSION, cell = PIXEL / (hDim - 1), yScale = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
  let hi = -Infinity;
  const ask = (x, z) => { hi = Math.max(hi, surfaceHeightAt(heightmapData, x, z)); };
  const n = corners.length;
  for (let k = 0; k < n; k++) {
    const [x0, z0] = corners[k], [x1, z1] = corners[(k + 1) % n];
    ask(x0, z0);
    for (const [f0, f1] of [[x0, x1], [z0, z1], [x0 - z0, x1 - z1]]) {
      if (f0 === f1) continue;
      for (let c = Math.ceil(Math.min(f0, f1) / cell); c * cell <= Math.max(f0, f1); c++) {
        const t = (c * cell - f0) / (f1 - f0);
        ask(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      }
    }
  }
  const xs = corners.map((c) => c[0]), zs = corners.map((c) => c[1]);
  const inside = (x, z) => {
    let sign = 0;
    for (let k = 0; k < n; k++) {
      const [x0, z0] = corners[k], [x1, z1] = corners[(k + 1) % n];
      const c = Math.sign((x1 - x0) * (z - z0) - (z1 - z0) * (x - x0));
      if (c && sign && c !== sign) return false;
      sign ||= c;
    }
    return true;
  };
  for (let i = Math.max(0, Math.ceil(Math.min(...xs) / cell)); i <= Math.min(hDim - 1, Math.floor(Math.max(...xs) / cell)); i++) {
    for (let j = Math.max(0, Math.ceil(Math.min(...zs) / cell)); j <= Math.min(hDim - 1, Math.floor(Math.max(...zs) / cell)); j++) {
      if (inside(i * cell, j * cell)) hi = Math.max(hi, heightmapData[i * hDim + j] * yScale);
    }
  }
  return hi;
}

/** @param {{ px: number, py: number, net: any, heightmapData: Float32Array, tileOk: (tx: number, ty: number) => boolean, trailOk: (x: number, z: number, r: number) => boolean }} job */
export function standPairs({ px, py, net, heightmapData, tileOk, trailOk }) {
  const bits = net ? pathsDataPoint(net, px, py) : 0;
  if (!bits) return [];
  const R = JUNGLE_ROADSIDE, tile = PIXEL / WORLD_MAP_TILE_DIM;
  const ox = px * WORLD_MAP_TILE_DIM, oz = -py * WORLD_MAP_TILE_DIM;
  const ground = (x, z) => surfaceHeightAt(heightmapData, x, z);
  const out = [], trunks = [];
  for (const [bit, sx, sz] of ARMS) {
    if (!(bits & bit)) continue;
    const len = Math.hypot(sx, sz) * HALF, rx = sx / Math.hypot(sx, sz), rz = sz / Math.hypot(sx, sz);
    for (let s0 = R.first; s0 <= len - R.end; s0 += R.step) {
      const wx = ox + Math.floor((HALF + rx * s0) / tile), wz = oz + Math.floor((HALF + rz * s0) / tile);
      if (tileDraw(wx, wz, R.salt) >= R.chance) continue;
      const s = s0 + (tileDraw(wx, wz, R.salt + 1) * 2 - 1) * R.jitter;
      const kind = Math.min(JUNGLE_PAIRS.length - 1, Math.floor(tileDraw(wx, wz, R.salt + 2) * JUNGLE_PAIRS.length));
      const flip = tileDraw(wx, wz, R.salt + 3) < 0.5;
      const js = R.scale[0] + (R.scale[1] - R.scale[0]) * tileDraw(wx, wz, R.salt + 4);
      const m = JUNGLE_PAIR_MEASURES[kind], [[lax, laz], [lbx, lbz]] = m.roots;
      const ux = flip ? rz : -rz, uz = flip ? -rx : rx;
      const turn = Math.atan2(lbz - laz, lbx - lax) - Math.atan2(uz, ux);
      const qx = HALF + rx * s, qz = HALF + rz * s, mid = ((m.feet[0] - m.feet[1]) / 2) * js;
      const ax = qx - ux * mid, az = qz - uz * mid;
      const trees = m.roots.map(([x, z], t) => {
        const [dx, dz] = turnXZ(x * js, z * js, turn);
        return { species: JUNGLE_PAIRS[kind].trees[t], x: ax + dx, z: az + dz, foot: m.feet[t] * js };
      });
      if (!trees.every((t) => tileOk(Math.floor(t.x / tile), Math.floor(t.z / tile)))) continue;
      if (!trees.every((t) => roadRoom(net, px, py, t.x, t.z, t.foot) >= t.foot && trailOk(t.x, t.z, t.foot))) continue;
      if (trees.some((t) => trunks.some((u) => Math.hypot(t.x - u.x, t.z - u.z) < R.clear * js))) continue;
      const y = Math.min(...trees.map((t) => lowestDrawn(heightmapData, t.x, t.z, t.foot))) - R.sink;
      if (trees.some((t) => ground(t.x, t.z) - y > R.bury)) continue;
      const h = (UNDER_CELL * js) / 2;
      const square = (x, z, across, along) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [x + ux * i * across + rx * j * along, z + uz * i * across + rz * j * along]);
      if (m.under.some(([cx, cz, cy]) => {
        const [dx, dz] = turnXZ(cx * js, cz * js, turn);
        return highestDrawn(heightmapData, square(ax + dx, az + dz, h, h)) + R.headroom > y + cy * js;
      })) continue;
      if (highestDrawn(heightmapData, square(qx, qz, PATH_HALF_M, m.reach * js)) + R.headroom > y + UNDER_TOP * js) continue;
      for (const t of trees) trunks.push(t);
      out.push({ kind, js, turn, ax, az, y, trees: trees.map((t, k) => ({ species: t.species, record: JUNGLE_SPECIES[t.species].record, x: t.x, z: t.z, y: y + m.base[k] * js })) });
    }
  }
  return out;
}
