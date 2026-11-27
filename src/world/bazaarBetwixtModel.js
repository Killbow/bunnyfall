// @ts-check
// Monumental Ceporah Rotunda, Torn Artaeum Crags, Cleft Pylons, Sunken Scrying Basin, and Stasis Waterfalls.

import { DOOR_TYPE } from './meshReader.js';
import { BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX } from '../render/bazaarBetwixtArt.js';
import {
  BAZAAR_ENTER,
  BAZAAR_PORTAL_Z,
  BAZAAR_BRIDGE_Z0,
  BAZAAR_BRIDGE_Z1,
  BAZAAR_CELARUS_POS,
} from '../systems/bazaarBetwixt.js';

export { BAZAAR_ENTER };

const SIDES = 12;
const FLOOR_R = 13.6;
const COL_R = 12.85;
const BASIN_OUTER_R = 3.66;
const BASIN_INNER_R = 3.28;
const FLOOR_Y = 0;
const PARAPET_Y = 0.96;
const COL_H = 9.2;
const ARCH_SPRING_Y = 8.85;
const CORNICE_Y = 11.4;
const DOME_RINGS = Object.freeze([
  [13.2, 13.0],
  [11.4, 14.6],
  [9.2, 16.0],
  [6.6, 17.1],
]);
const OCULUS_R = 6.6;
const OCULUS_TOP_Y = 17.65;

const dot = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (/** @type {number[]} */ a, /** @type {number[]} */ b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (/** @type {number[]} */ a, /** @type {number[]} */ b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (/** @type {number[]} */ v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function rotateEuler(/** @type {number[]} */ p, /** @type {number} */ rx, /** @type {number} */ ry, /** @type {number} */ rz) {
  let [x, y, z] = p;
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
  y = y1; z = z1;
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const x2 = x * cz - y * sz, y2 = x * sz + y * cz;
  x = x2; y = y2;
  const cy = Math.cos(ry), sy = Math.sin(ry);
  return [x * cy + z * sy, y, -x * sy + z * cy];
}

function createMeshCollector() {
  /** @type {Map<number, { p: number[], n: number[], uv: number[], i: number[] }>} */
  const groups = new Map();
  const group = (/** @type {number} */ rec) => {
    let g = groups.get(rec);
    if (!g) { g = { p: [], n: [], uv: [], i: [] }; groups.set(rec, g); }
    return g;
  };
  /**
   * @param {number} rec
   * @param {number[][]} corners
   * @param {number[]} faceN
   * @param {((c: number[], idx: number) => number[]) | number[][]} uv
   * @param {number[][] | null} [normals]
   */
  const poly = (rec, corners, faceN, uv, normals = null) => {
    const g = group(rec);
    const base = g.p.length / 3;
    corners.forEach((c, idx) => {
      g.p.push(c[0], c[1], c[2]);
      const vn = normals ? normals[idx] : faceN;
      g.n.push(vn[0], vn[1], vn[2]);
      const t = typeof uv === 'function' ? uv(c, idx) : uv[idx];
      g.uv.push(t[0], t[1]);
    });
    const flip = dot(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])), faceN) < 0;
    for (let k = 1; k + 1 < corners.length; k++) {
      if (flip) g.i.push(base, base + k + 1, base + k);
      else g.i.push(base, base + k, base + k + 1);
    }
  };

  /**
   * @param {number} rec
   * @param {number[]} minPt
   * @param {number[]} maxPt
   * @param {(p: number[]) => number[]} [xf]
   * @param {(n: number[]) => number[]} [xfN]
   * @param {number} [uvScale]
   */
  const box = (rec, minPt, maxPt, xf = (p) => p, xfN = (n) => n, uvScale = 0.5) => {
    const [x0, y0, z0] = minPt, [x1, y1, z1] = maxPt;
    const w = (x1 - x0) * uvScale, h = (y1 - y0) * uvScale, d = (z1 - z0) * uvScale;
    const faces = [
      { c: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], n: [0, 0, 1], uv: [[0, 0], [w, 0], [w, h], [0, h]] },
      { c: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], n: [0, 0, -1], uv: [[0, 0], [w, 0], [w, h], [0, h]] },
      { c: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], n: [1, 0, 0], uv: [[0, 0], [d, 0], [d, h], [0, h]] },
      { c: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], n: [-1, 0, 0], uv: [[0, 0], [d, 0], [d, h], [0, h]] },
      { c: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], n: [0, 1, 0], uv: [[0, 0], [w, 0], [w, d], [0, d]] },
      { c: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], n: [0, -1, 0], uv: [[0, 0], [w, 0], [w, d], [0, d]] },
    ];
    for (const f of faces) poly(rec, f.c.map(xf), norm(xfN(f.n)), f.uv);
  };

  const finish = (/** @type {string} */ name, /** @type {any[]} */ doors = [], /** @type {boolean} */ skybox = false) => {
    const positions = [], normals = [], uvs = [], indices = [], subMeshes = [];
    for (const [rec, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      if (!g.i.length) continue;
      const base = positions.length / 3;
      const start = indices.length;
      for (let k = 0; k < g.p.length; k++) positions.push(g.p[k]);
      for (let k = 0; k < g.n.length; k++) normals.push(g.n[k]);
      for (let k = 0; k < g.uv.length; k++) uvs.push(g.uv[k]);
      for (let k = 0; k < g.i.length; k++) indices.push(base + g.i[k]);
      subMeshes.push({
        textureArchive: BAZAAR_ROOM_ARCHIVE,
        textureRecord: rec,
        startIndex: start,
        primitiveCount: g.i.length / 3,
      });
    }
    return {
      name,
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      uvs: Float32Array.from(uvs),
      indices: Uint32Array.from(indices),
      subMeshes,
      doors,
      ...(skybox ? { skybox: true } : {}),
    };
  };

  return { poly, box, finish };
}

function ringAngle(/** @type {number} */ k, /** @type {number} */ n = SIDES) {
  return -Math.PI * 0.5 - Math.PI / n + (k * Math.PI * 2) / n;
}

function ringPt(/** @type {number} */ r, /** @type {number} */ k, /** @type {number} */ y, /** @type {number} */ n = SIDES) {
  const a = ringAngle(k, n);
  return [r * Math.cos(a), y, r * Math.sin(a)];
}

/** @param {ReturnType<typeof createMeshCollector>} mc @param {number[]} basePos @param {number} rBot @param {number} rTop @param {number} h */
function addFlutedColumn(mc, basePos, rBot, rTop, h) {
  const T = BAZAAR_TEX;
  const [cx, cy, cz] = basePos;
  const mapP = (/** @type {number[]} */ p) => [cx + p[0], cy + p[1], cz + p[2]];

  const bw = rBot * 1.42;
  mc.box(T.marbleWall, [-bw, 0, -bw], [bw, 0.36, bw], mapP, undefined, 0.6);
  mc.box(T.leyGold, [-bw * 0.9, 0.36, -bw * 0.9], [bw * 0.9, 0.52, bw * 0.9], mapP, undefined, 1.2);

  const shaftY0 = 0.52, shaftY1 = h - 0.62;
  const segs = 12;
  for (let s = 0; s < segs; s++) {
    const a0 = (s / segs) * Math.PI * 2, a1 = ((s + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p0 = mapP([rBot * c0, shaftY0, rBot * s0]);
    const p1 = mapP([rBot * c1, shaftY0, rBot * s1]);
    const p2 = mapP([rTop * c1, shaftY1, rTop * s1]);
    const p3 = mapP([rTop * c0, shaftY1, rTop * s0]);
    const n0 = norm([c0, 0.04, s0]), n1 = norm([c1, 0.04, s1]);
    const midN = norm([n0[0] + n1[0], n0[1] + n1[1], n0[2] + n1[2]]);
    mc.poly(T.marblePier, [p0, p1, p2, p3], midN, [[s / segs * 2, 0], [(s + 1) / segs * 2, 0], [(s + 1) / segs * 2, 2], [s / segs * 2, 2]], [n0, n1, n1, n0]);
  }

  const cw = rTop * 1.32, abw = rTop * 1.54;
  mc.box(T.leyGold, [-cw, shaftY1, -cw], [cw, shaftY1 + 0.22, cw], mapP, undefined, 1.2);
  mc.box(T.marbleWall, [-abw, shaftY1 + 0.22, -abw], [abw, h, abw], mapP, undefined, 0.6);
}

/**
 * @param {ReturnType<typeof createMeshCollector>} mc @param {number[]} basePos
 * @param {number} halfW @param {number} h @param {number} cantRad @param {number} yawRad
 */
function addCleftPylon(mc, basePos, halfW, h, cantRad, yawRad) {
  const T = BAZAAR_TEX;
  const xf = (/** @type {number[]} */ p) => {
    const r = rotateEuler(p, 0, yawRad, cantRad);
    return [basePos[0] + r[0], basePos[1] + r[1], basePos[2] + r[2]];
  };
  const xfN = (/** @type {number[]} */ n) => rotateEuler(n, 0, yawRad, cantRad);

  mc.box(T.marbleWall, [-halfW * 1.35, -0.35, -halfW * 1.35], [halfW * 1.35, 0.42, halfW * 1.35], xf, xfN, 0.55);
  mc.box(T.leyGold, [-halfW * 1.18, 0.42, -halfW * 1.18], [halfW * 1.18, 0.60, halfW * 1.18], xf, xfN, 1.1);

  const gap = halfW * 0.16;
  const tw = halfW * 0.72;
  mc.box(T.marbleWall, [-halfW, 0.60, -halfW * 0.82], [-gap, h * 0.94, halfW * 0.82], xf, xfN, 0.45);
  mc.box(T.marbleWall, [gap, 0.60, -halfW * 0.82], [halfW, h * 0.86, halfW * 0.82], xf, xfN, 0.45);
  mc.box(T.leyGold, [-gap * 0.85, 0.60, -tw * 0.52], [gap * 0.85, h * 0.90, tw * 0.52], xf, xfN, 1.2);
}

/**
 * @param {ReturnType<typeof createMeshCollector>} mc @param {number} cx @param {number} cz
 * @param {number} topR @param {number} topY @param {number} depth @param {number} segs @param {number} seed
 */
function addTornIslandRoot(mc, cx, cz, topR, topY, depth, segs, seed) {
  const T = BAZAAR_TEX;
  const ringAt = (/** @type {number} */ r, /** @type {number} */ y, /** @type {number} */ jagAmp, /** @type {number} */ phase) => (
    Array.from({ length: segs }, (_, i) => {
      const a = (i / segs) * Math.PI * 2;
      const jag = 1 + jagAmp * Math.sin(i * 3.0 + phase + seed) + jagAmp * 0.55 * Math.cos(i * 5.0 - seed * 1.7);
      return [cx + r * jag * Math.cos(a), y, cz + r * jag * Math.sin(a)];
    })
  );

  const r0 = ringAt(topR, topY, 0.04, 0.0);
  const r1 = ringAt(topR * 0.84, topY - depth * 0.22, 0.14, 0.7);
  const r2 = ringAt(topR * 0.54, topY - depth * 0.58, 0.22, 1.5);
  const apex = [cx + Math.sin(seed) * 0.6, topY - depth, cz + Math.cos(seed) * 0.6];

  /** @type {Array<[number[][], number[][], number, number]>} */
  const bands = [[r0, r1, 0, 1.2], [r1, r2, 1.2, 2.8]];
  for (const [hi, lo, v0, v1] of bands) {
    for (let i = 0; i < segs; i++) {
      const ni = (i + 1) % segs;
      const fn = norm(cross(sub(hi[ni], hi[i]), sub(lo[i], hi[i])));
      const outN = dot(fn, [hi[i][0] - cx, -0.35, hi[i][2] - cz]) >= 0 ? fn : [-fn[0], -fn[1], -fn[2]];
      mc.poly(T.artaeumCliff, [hi[i], hi[ni], lo[ni], lo[i]], outN, [[0, v0], [1.4, v0], [1.4, v1], [0, v1]]);
    }
  }
  for (let i = 0; i < segs; i++) {
    const ni = (i + 1) % segs;
    const fn = norm(cross(sub(r2[ni], r2[i]), sub(apex, r2[i])));
    const outN = dot(fn, [r2[i][0] - cx, -0.5, r2[i][2] - cz]) >= 0 ? fn : [-fn[0], -fn[1], -fn[2]];
    mc.poly(T.artaeumCliff, [r2[i], r2[ni], apex], outN, [[0, 2.8], [1.2, 2.8], [0.6, 4.5]]);
  }
}

/** @type {any} */
let _cachedRotundaModel = null;

export function bazaarRotundaModel() {
  if (_cachedRotundaModel) return _cachedRotundaModel;
  const mc = createMeshCollector();
  const { poly, box, finish } = mc;
  const T = BAZAAR_TEX;

  // Build the torn arrival threshold crag at z = -29.0 .. -23.6.
  const cragPts = [
    [-2.05, FLOOR_Y, BAZAAR_BRIDGE_Z0],
    [2.05, FLOOR_Y, BAZAAR_BRIDGE_Z0],
    [3.85, FLOOR_Y, -25.1],
    [3.95, FLOOR_Y, -27.4],
    [2.35, FLOOR_Y, -29.0],
    [-2.35, FLOOR_Y, -29.0],
    [-3.95, FLOOR_Y, -27.4],
    [-3.85, FLOOR_Y, -25.1],
  ];
  poly(T.astralSlate, cragPts, [0, 1, 0], (c) => [c[0] / 2.2, c[2] / 2.2]);

  const cragLip = cragPts.map(([x, , z]) => [x * 1.04, -0.45, z + (z < -26.2 ? -0.14 : 0.12)]);
  for (let i = 0; i < cragPts.length; i++) {
    const ni = (i + 1) % cragPts.length;
    const midX = (cragPts[i][0] + cragPts[ni][0]) * 0.5;
    const midZ = (cragPts[i][2] + cragPts[ni][2]) * 0.5 + 26.3;
    const outN = norm([midX, 0.25, midZ]);
    poly(T.marbleWall, [cragLip[i], cragLip[ni], cragPts[ni], cragPts[i]], outN, [[0, 0], [2, 0], [2, 0.4], [0, 0.4]]);
    if (i >= 1 && i <= 6) {
      const k0 = [cragPts[i][0] * 0.96, 0.08, cragPts[i][2]], k1 = [cragPts[ni][0] * 0.96, 0.08, cragPts[ni][2]];
      poly(T.leyGold, [cragPts[i], cragPts[ni], k1, k0], [0, 1, 0], [[0, 0], [2, 0], [2, 0.3], [0, 0.3]]);
    }
  }
  // Lay a golden Old-Ways compass spear pointing North toward the bridge.
  box(T.leyGold, [-0.08, 0.0, -26.4], [0.08, 0.016, BAZAAR_BRIDGE_Z0]);
  poly(T.leyGold, [[-0.42, 0.017, -24.3], [0.42, 0.017, -24.3], [0, 0.017, BAZAAR_BRIDGE_Z0 + 0.05]], [0, 1, 0], [[0, 0], [1, 0], [0.5, 1]]);
  addCleftPylon(mc, [-2.95, 0, -24.05], 0.56, 6.8, -0.045, 0.18);
  addCleftPylon(mc, [2.95, 0, -24.05], 0.56, 6.8, 0.045, -0.18);
  addTornIslandRoot(mc, 0, -26.3, 3.85, -0.45, 20.5, 10, 1.3);

  // Add the 10 m hard-light causeway collider and hovering gold anchor ribs.
  poly(
    T.invisibleDeck,
    [
      [-1.95, FLOOR_Y, BAZAAR_BRIDGE_Z0 - 0.15],
      [1.95, FLOOR_Y, BAZAAR_BRIDGE_Z0 - 0.15],
      [1.95, FLOOR_Y, BAZAAR_BRIDGE_Z1 + 0.45],
      [-1.95, FLOOR_Y, BAZAAR_BRIDGE_Z1 + 0.45],
    ],
    [0, 1, 0],
    [[0, 0], [1, 0], [1, 1], [0, 1]],
  );
  for (let b = 0; b < 5; b++) {
    const bz = BAZAAR_BRIDGE_Z0 + 1.0 + b * 2.0;
    box(T.leyGold, [-2.18, -0.08, bz - 0.38], [-1.94, 0.06, bz + 0.38], undefined, undefined, 1.2);
    box(T.leyGold, [1.94, -0.08, bz - 0.38], [2.18, 0.06, bz + 0.38], undefined, undefined, 1.2);
  }

  // Build the 27.2 m Grand Ceporah Rotunda floor and stone roots.
  const floorSegs = 24;
  const floorOuter = Array.from({ length: floorSegs }, (_, k) => ringPt(FLOOR_R, k, FLOOR_Y, floorSegs));
  const floorStep = Array.from({ length: floorSegs }, (_, k) => ringPt(FLOOR_R + 0.48, k, -0.34, floorSegs));
  const basinEdge = Array.from({ length: floorSegs }, (_, k) => ringPt(BASIN_INNER_R, k, FLOOR_Y, floorSegs));

  for (let k = 0; k < floorSegs; k++) {
    const nk = (k + 1) % floorSegs;
    poly(
      T.astralSlate,
      [basinEdge[k], floorOuter[k], floorOuter[nk], basinEdge[nk]],
      [0, 1, 0],
      (c) => [c[0] / 2.2, c[2] / 2.2],
    );
    const outN = norm([(floorOuter[k][0] + floorOuter[nk][0]) * 0.5, 0.25, (floorOuter[k][2] + floorOuter[nk][2]) * 0.5]);
    poly(T.leyGold, [floorStep[k], floorStep[nk], floorOuter[nk], floorOuter[k]], outN, [[0, 0], [2, 0], [2, 0.6], [0, 0.6]]);
  }
  addTornIslandRoot(mc, 0, 0, FLOOR_R + 0.35, -0.34, 28.5, 16, 4.2);

  // Lay radial and concentric golden ley-channels feeding the Sunken Scrying Basin.
  const leyH = 0.015;
  for (let k = 0; k < SIDES; k++) {
    const a = ringAngle(k, SIDES) + Math.PI / SIDES;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = -sa * 0.045, pz = ca * 0.045;
    const r0 = BASIN_OUTER_R, r1 = COL_R - 0.5;
    poly(
      T.leyGold,
      [
        [ca * r0 - px, leyH, sa * r0 - pz],
        [ca * r0 + px, leyH, sa * r0 + pz],
        [ca * r1 + px, leyH, sa * r1 + pz],
        [ca * r1 - px, leyH, sa * r1 - pz],
      ],
      [0, 1, 0],
      [[0, 0], [1, 0], [1, 4], [0, 4]],
    );
  }
  for (const lr of [6.4, 9.8]) {
    for (let k = 0; k < floorSegs; k++) {
      const nk = (k + 1) % floorSegs;
      const i0 = ringPt(lr - 0.045, k, leyH, floorSegs), i1 = ringPt(lr - 0.045, nk, leyH, floorSegs);
      const o0 = ringPt(lr + 0.045, k, leyH, floorSegs), o1 = ringPt(lr + 0.045, nk, leyH, floorSegs);
      poly(T.leyGold, [i0, o0, o1, i1], [0, 1, 0], [[0, 0], [1, 0], [1, 2], [0, 2]]);
    }
  }

  // Build the Sunken Scrying Basin kerb and obsidian well.
  const kerbTopY = 0.38, wellBotY = -0.46;
  const kerbOutBot = Array.from({ length: floorSegs }, (_, k) => ringPt(BASIN_OUTER_R, k, FLOOR_Y, floorSegs));
  const kerbOutTop = Array.from({ length: floorSegs }, (_, k) => ringPt(BASIN_OUTER_R - 0.10, k, kerbTopY, floorSegs));
  const kerbInTop = Array.from({ length: floorSegs }, (_, k) => ringPt(BASIN_INNER_R, k, kerbTopY, floorSegs));
  const wellBot = Array.from({ length: floorSegs }, (_, k) => ringPt(BASIN_INNER_R - 0.18, k, wellBotY, floorSegs));
  poly(T.astralSlate, wellBot, [0, 1, 0], (c) => [c[0] / 2.0, c[2] / 2.0]);
  for (let k = 0; k < floorSegs; k++) {
    const nk = (k + 1) % floorSegs;
    const outN = norm([(kerbOutBot[k][0] + kerbOutBot[nk][0]) * 0.5, 0.35, (kerbOutBot[k][2] + kerbOutBot[nk][2]) * 0.5]);
    const inN = norm([-(kerbInTop[k][0] + kerbInTop[nk][0]) * 0.5, 0.25, -(kerbInTop[k][2] + kerbInTop[nk][2]) * 0.5]);
    poly(T.marbleWall, [kerbOutBot[k], kerbOutBot[nk], kerbOutTop[nk], kerbOutTop[k]], outN, [[0, 0], [1.2, 0], [1.2, 0.4], [0, 0.4]]);
    poly(T.leyGold, [kerbInTop[k], kerbOutTop[k], kerbOutTop[nk], kerbInTop[nk]], [0, 1, 0], [[0, 0], [0.6, 0], [0.6, 1.5], [0, 1.5]]);
    poly(T.marbleWall, [wellBot[k], wellBot[nk], kerbInTop[nk], kerbInTop[k]], inN, [[0, 0], [1.2, 0], [1.2, 0.7], [0, 0.7]]);
  }

  // Raise the Northern High Chancel with three steps, a sun medallion, and twin cleft obelisks.
  const cz = BAZAAR_CELARUS_POS[2];
  box(T.marbleWall, [-3.95, 0.0, 5.55], [3.95, 0.18, 11.45]);
  box(T.leyGold, [-4.02, 0.0, 5.48], [4.02, 0.07, 11.52]);
  box(T.marbleWall, [-3.55, 0.18, 6.25], [3.55, 0.36, 11.25]);
  box(T.leyGold, [-3.62, 0.18, 6.18], [3.62, 0.25, 11.32]);
  box(T.marbleWall, [-3.15, 0.36, 6.95], [3.15, 0.54, 11.05]);
  box(T.leyGold, [-3.22, 0.36, 6.88], [3.22, 0.43, 11.12]);

  const medallionR = 2.05;
  const medPts = Array.from({ length: 16 }, (_, k) => {
    const a = (k / 16) * Math.PI * 2;
    return [medallionR * Math.cos(a), 0.552, cz + medallionR * Math.sin(a)];
  });
  poly(T.chancelSun, medPts, [0, 1, 0], (c) => [0.5 + c[0] / (medallionR * 2), 0.5 + (c[2] - cz) / (medallionR * 2)]);
  addCleftPylon(mc, [-4.35, 0, 9.85], 0.58, 7.8, 0.035, -0.25);
  addCleftPylon(mc, [4.35, 0, 9.85], 0.58, 7.8, -0.035, 0.25);

  // Erect 12 fluted Ceporah columns, arched entablature, and South/North triumphal arches.
  for (let k = 0; k < SIDES; k++) {
    const nk = (k + 1) % SIDES;
    const col0 = ringPt(COL_R, k, FLOOR_Y), col1 = ringPt(COL_R, nk, FLOOR_Y);
    addFlutedColumn(mc, col0, 0.56, 0.47, COL_H);

    const tang = sub(col1, col0);
    const bayW = Math.hypot(tang[0], tang[2]);
    const uDir = [tang[0] / bayW, 0, tang[2] / bayW];
    const inN = norm([-(col0[0] + col1[0]) * 0.5, 0, -(col0[2] + col1[2]) * 0.5]);
    const outN = [-inN[0], 0, -inN[2]];
    const bayPt = (/** @type {number} */ s, /** @type {number} */ y, /** @type {number} */ depth = 0) => [
      col0[0] + uDir[0] * s + outN[0] * depth,
      y,
      col0[2] + uDir[2] * s + outN[2] * depth,
    ];

    const isTriumphal = k === 0 || k === 6;
    const archRise = isTriumphal ? 1.85 : 1.35;
    const archSegs = 8;
    const spanL = 0.72, spanR = bayW - 0.72;
    const halfD = 0.44;
    for (let a = 0; a < archSegs; a++) {
      const t0 = a / archSegs, t1 = (a + 1) / archSegs;
      const s0 = spanL + (spanR - spanL) * t0, s1 = spanL + (spanR - spanL) * t1;
      const rise0 = ARCH_SPRING_Y + archRise * Math.sin(t0 * Math.PI);
      const rise1 = ARCH_SPRING_Y + archRise * Math.sin(t1 * Math.PI);

      poly(T.marbleWall, [bayPt(s0, rise0, -halfD), bayPt(s1, rise1, -halfD), bayPt(s1, CORNICE_Y, -halfD), bayPt(s0, CORNICE_Y, -halfD)], inN,
        [[t0 * 2, rise0 / 5.0], [t1 * 2, rise1 / 5.0], [t1 * 2, 0.95], [t0 * 2, 0.95]]);
      poly(T.marbleWall, [bayPt(s1, rise1, halfD), bayPt(s0, rise0, halfD), bayPt(s0, CORNICE_Y, halfD), bayPt(s1, CORNICE_Y, halfD)], outN,
        [[t1 * 2, rise1 / 5.0], [t0 * 2, rise0 / 5.0], [t0 * 2, 0.95], [t1 * 2, 0.95]]);

      const soffitSlope = -(rise1 - rise0) / Math.max(0.05, s1 - s0);
      const soffitN = norm([uDir[0] * soffitSlope, -1, uDir[2] * soffitSlope]);
      poly(T.leyGold, [bayPt(s0, rise0, -halfD), bayPt(s1, rise1, -halfD), bayPt(s1, rise1, halfD), bayPt(s0, rise0, halfD)], soffitN,
        [[t0 * 4, 0], [t1 * 4, 0], [t1 * 4, 1], [t0 * 4, 1]]);
    }
    poly(T.leyGold, [bayPt(0, CORNICE_Y, -halfD - 0.14), bayPt(bayW, CORNICE_Y, -halfD - 0.14), bayPt(bayW, CORNICE_Y, halfD + 0.14), bayPt(0, CORNICE_Y, halfD + 0.14)], [0, 1, 0],
      [[0, 0], [4, 0], [4, 1], [0, 1]]);
    poly(T.marbleWall, [bayPt(0, COL_H, -halfD), bayPt(spanL, COL_H, -halfD), bayPt(spanL, CORNICE_Y, -halfD), bayPt(0, CORNICE_Y, -halfD)], inN, [[0, 0.6], [0.4, 0.6], [0.4, 0.95], [0, 0.95]]);
    poly(T.marbleWall, [bayPt(spanR, COL_H, -halfD), bayPt(bayW, COL_H, -halfD), bayPt(bayW, CORNICE_Y, -halfD), bayPt(spanR, CORNICE_Y, -halfD)], inN, [[0.6, 0.6], [1, 0.6], [1, 0.95], [0.6, 0.95]]);
    poly(T.marbleWall, [bayPt(spanL, COL_H, halfD), bayPt(0, COL_H, halfD), bayPt(0, CORNICE_Y, halfD), bayPt(spanL, CORNICE_Y, halfD)], outN, [[0.4, 0.6], [0, 0.6], [0, 0.95], [0.4, 0.95]]);
    poly(T.marbleWall, [bayPt(bayW, COL_H, halfD), bayPt(spanR, COL_H, halfD), bayPt(spanR, CORNICE_Y, halfD), bayPt(bayW, CORNICE_Y, halfD)], outN, [[1, 0.6], [0.6, 0.6], [0.6, 0.95], [1, 0.95]]);

    // Open South Bay 0 for the Hard-Light Causeway and leave North Bay 6 open toward Ceporah Tower.
    if (k === 0) {
      const gapHalf = 2.05;
      const gL = bayW * 0.5 - gapHalf, gR = bayW * 0.5 + gapHalf;
      for (const [b0s, b1s] of [[0.76, gL], [gR, bayW - 0.76]]) {
        if (b1s <= b0s + 0.15) continue;
        poly(T.balustrade, [bayPt(b0s, 0.08, 0), bayPt(b1s, 0.08, 0), bayPt(b1s, PARAPET_Y - 0.1, 0), bayPt(b0s, PARAPET_Y - 0.1, 0)], inN, [[0, 0], [1.2, 0], [1.2, 1], [0, 1]]);
        poly(T.balustrade, [bayPt(b1s, 0.08, 0), bayPt(b0s, 0.08, 0), bayPt(b0s, PARAPET_Y - 0.1, 0), bayPt(b1s, PARAPET_Y - 0.1, 0)], outN, [[0, 0], [1.2, 0], [1.2, 1], [0, 1]]);
        poly(T.leyGold, [bayPt(b0s, PARAPET_Y, -0.16), bayPt(b1s, PARAPET_Y, -0.16), bayPt(b1s, PARAPET_Y, 0.16), bayPt(b0s, PARAPET_Y, 0.16)], [0, 1, 0], [[0, 0], [2, 0], [2, 1], [0, 1]]);
      }
    } else if (k !== 6) {
      const b0s = 0.76, b1s = bayW - 0.76;
      poly(T.balustrade, [bayPt(b0s, 0.08, 0), bayPt(b1s, 0.08, 0), bayPt(b1s, PARAPET_Y - 0.1, 0), bayPt(b0s, PARAPET_Y - 0.1, 0)], inN, [[0, 0], [3, 0], [3, 1], [0, 1]]);
      poly(T.balustrade, [bayPt(b1s, 0.08, 0), bayPt(b0s, 0.08, 0), bayPt(b0s, PARAPET_Y - 0.1, 0), bayPt(b1s, PARAPET_Y - 0.1, 0)], outN, [[0, 0], [3, 0], [3, 1], [0, 1]]);
      poly(T.leyGold, [bayPt(b0s, PARAPET_Y, -0.16), bayPt(b1s, PARAPET_Y, -0.16), bayPt(b1s, PARAPET_Y, 0.16), bayPt(b0s, PARAPET_Y, 0.16)], [0, 1, 0], [[0, 0], [4, 0], [4, 1], [0, 1]]);
    }
  }

  const doors = [{
    type: DOOR_TYPE.BUILDING,
    index: 0,
    vert0: { x: -1.1, y: 0.05, z: BAZAAR_PORTAL_Z - 0.18 },
    vert2: { x: 1.1, y: 2.95, z: BAZAAR_PORTAL_Z + 0.18 },
    normal: { x: 0, y: 0, z: 1 },
  }];

  _cachedRotundaModel = finish('Bazaar Betwixt Sanctum', doors, false);
  return _cachedRotundaModel;
}

/** @type {any} */
let _cachedDomeModel = null;

/**
 * Detached levitating coffered Ceporah ring-dome and open skylight oculus rotated dynamically overhead.
 */
export function bazaarDomeModel() {
  if (_cachedDomeModel) return _cachedDomeModel;
  const { poly, finish } = createMeshCollector();
  const T = BAZAAR_TEX;

  for (let k = 0; k < SIDES; k++) {
    const nk = (k + 1) % SIDES;
    const b0 = ringPt(DOME_RINGS[0][0], k, DOME_RINGS[0][1]);
    const b1 = ringPt(DOME_RINGS[0][0], nk, DOME_RINGS[0][1]);
    const u0 = ringPt(DOME_RINGS[0][0] + 0.36, k, DOME_RINGS[0][1] + 0.32);
    const u1 = ringPt(DOME_RINGS[0][0] + 0.36, nk, DOME_RINGS[0][1] + 0.32);
    poly(T.leyGold, [b1, b0, u0, u1], [0, -1, 0], [[0, 0], [3, 0], [3, 1], [0, 1]]);
  }

  for (let s = 0; s + 1 < DOME_RINGS.length; s++) {
    const [r0, y0] = DOME_RINGS[s];
    const [r1, y1] = DOME_RINGS[s + 1];
    for (let k = 0; k < SIDES; k++) {
      const nk = (k + 1) % SIDES;
      const a0 = ringPt(r0, k, y0), b0 = ringPt(r0, nk, y0);
      const a1 = ringPt(r1, k, y1), b1 = ringPt(r1, nk, y1);
      const midX = (a0[0] + b0[0] + a1[0] + b1[0]) * 0.25;
      const midZ = (a0[2] + b0[2] + a1[2] + b1[2]) * 0.25;
      const domeInN = norm([-midX * 0.42, -1, -midZ * 0.42]);
      poly(T.domeCoffer, [a0, b0, b1, a1], domeInN, [[0, 0], [2, 0], [2, 1], [0, 1]]);

      const oa0 = ringPt(r0 + 0.36, k, y0 + 0.32), ob0 = ringPt(r0 + 0.36, nk, y0 + 0.32);
      const oa1 = ringPt(r1 + 0.30, k, y1 + 0.32), ob1 = ringPt(r1 + 0.30, nk, y1 + 0.32);
      poly(T.marbleWall, [ob0, oa0, oa1, ob1], [-domeInN[0], -domeInN[1], -domeInN[2]], [[0, 0], [2, 0], [2, 1], [0, 1]]);

      const ca = ringAngle(k);
      const ribIn = [-Math.cos(ca), 0, -Math.sin(ca)];
      const ribSide = [-ribIn[2], 0, ribIn[0]];
      const rw = 0.18, rd = 0.16;
      const r0L = [a0[0] + ribIn[0] * rd - ribSide[0] * rw, y0 - 0.05, a0[2] + ribIn[2] * rd - ribSide[2] * rw];
      const r0R = [a0[0] + ribIn[0] * rd + ribSide[0] * rw, y0 - 0.05, a0[2] + ribIn[2] * rd + ribSide[2] * rw];
      const r1L = [a1[0] + ribIn[0] * rd - ribSide[0] * rw, y1 - 0.05, a1[2] + ribIn[2] * rd - ribSide[2] * rw];
      const r1R = [a1[0] + ribIn[0] * rd + ribSide[0] * rw, y1 - 0.05, a1[2] + ribIn[2] * rd + ribSide[2] * rw];
      poly(T.leyGold, [r0L, r0R, r1R, r1L], domeInN, [[0, 0], [1, 0], [1, 2], [0, 2]]);
    }
  }

  for (let k = 0; k < SIDES; k++) {
    const nk = (k + 1) % SIDES;
    const b0 = ringPt(OCULUS_R, k, DOME_RINGS[DOME_RINGS.length - 1][1]);
    const b1 = ringPt(OCULUS_R, nk, DOME_RINGS[DOME_RINGS.length - 1][1]);
    const t0 = ringPt(OCULUS_R, k, OCULUS_TOP_Y);
    const t1 = ringPt(OCULUS_R, nk, OCULUS_TOP_Y);
    const ot0 = ringPt(OCULUS_R + 0.30, k, OCULUS_TOP_Y);
    const ot1 = ringPt(OCULUS_R + 0.30, nk, OCULUS_TOP_Y);
    const inN = norm([-(b0[0] + b1[0]) * 0.5, 0, -(b0[2] + b1[2]) * 0.5]);
    poly(T.leyGold, [b0, b1, t1, t0], inN, [[0, 0], [3, 0], [3, 1], [0, 1]]);
    poly(T.leyGold, [t0, t1, ot1, ot0], [0, 1, 0], [[0, 0], [3, 0], [3, 0.5], [0, 0.5]]);

    const ca = ringAngle(k);
    const tip = [(OCULUS_R - 1.15) * Math.cos(ca), OCULUS_TOP_Y - 0.22, (OCULUS_R - 1.15) * Math.sin(ca)];
    const side = [-Math.sin(ca) * 0.18, 0, Math.cos(ca) * 0.18];
    const baseL = [OCULUS_R * Math.cos(ca) - side[0], OCULUS_TOP_Y - 0.14, OCULUS_R * Math.sin(ca) - side[2]];
    const baseR = [OCULUS_R * Math.cos(ca) + side[0], OCULUS_TOP_Y - 0.14, OCULUS_R * Math.sin(ca) + side[2]];
    poly(T.leyGold, [baseL, baseR, tip], [0, -1, 0], [[0, 0], [1, 0], [0.5, 1]]);
    poly(T.leyGold, [baseR, baseL, tip], [0, 1, 0], [[1, 0], [0, 0], [0.5, 1]]);
  }

  _cachedDomeModel = finish('Bazaar Betwixt Levitating Dome', [], true);
  return _cachedDomeModel;
}

/** @type {any} */
let _cachedCapstoneModel = null;

/**
 * Faceted golden Psijic relic octahedron-crown hovering telekinetically atop each cleft obelisk.
 */
export function bazaarCapstoneModel() {
  if (_cachedCapstoneModel) return _cachedCapstoneModel;
  const { poly, box, finish } = createMeshCollector();
  const T = BAZAAR_TEX;

  const top = [0, 1.15, 0];
  const bot = [0, -1.15, 0];
  const eq = [[0.85, 0, 0], [0, 0, 0.85], [-0.85, 0, 0], [0, 0, -0.85]];
  for (let i = 0; i < 4; i++) {
    const a = eq[i], b = eq[(i + 1) % 4];
    const un = norm([(a[0] + b[0]) * 0.5, 0.75, (a[2] + b[2]) * 0.5]);
    const dn = norm([(a[0] + b[0]) * 0.5, -0.75, (a[2] + b[2]) * 0.5]);
    poly(T.leyGold, [a, b, top], un, [[0, 0], [1, 0], [0.5, 1]]);
    poly(T.leyGold, [b, a, bot], dn, [[0, 0], [1, 0], [0.5, 1]]);
  }
  box(T.marbleWall, [-0.52, -0.52, -0.52], [0.52, 0.52, 0.52], undefined, undefined, 1.0);

  _cachedCapstoneModel = finish('Bazaar Betwixt Obelisk Capstone', [], true);
  return _cachedCapstoneModel;
}

/** @type {any} */
let _cachedCragModel = null;

/**
 * Canonical torn Artaeum coastal cliff-spur and Ceporah aqueduct water-gate instanced around the chasm.
 */
export function bazaarCragModel() {
  if (_cachedCragModel) return _cachedCragModel;
  const mc = createMeshCollector();
  const { poly, box, finish } = mc;
  const T = BAZAAR_TEX;

  addTornIslandRoot(mc, 0, -0.35, 3.15, -0.55, 22.0, 10, 1.9);
  box(T.artaeumCliff, [-3.5, -0.65, -2.8], [3.5, 0.55, 2.7], undefined, undefined, 0.35);
  box(T.artaeumCliff, [-3.1, 0.50, -2.5], [-1.55, 1.55, 1.8], undefined, undefined, 0.38);
  box(T.artaeumCliff, [1.55, 0.50, -2.5], [3.1, 1.75, 1.6], undefined, undefined, 0.38);
  box(T.marbleWall, [-1.55, 0.45, -1.2], [1.55, 1.18, 3.45], undefined, undefined, 0.55);
  box(T.leyGold, [-1.66, 1.12, -1.25], [-1.22, 1.48, 3.55], undefined, undefined, 1.0);
  box(T.leyGold, [1.22, 1.12, -1.25], [1.66, 1.48, 3.55], undefined, undefined, 1.0);
  poly(T.stasisCascade, [[-1.22, 1.24, -1.15], [1.22, 1.24, -1.15], [1.22, 1.18, 3.42], [-1.22, 1.18, 3.42]], [0, 1, 0.02], [[0, 0], [1, 0], [1, 2], [0, 2]]);

  _cachedCragModel = finish('Bazaar Betwixt Torn Artaeum Crag', [], true);
  return _cachedCragModel;
}

/**
 * @param {ReturnType<typeof createMeshCollector>} mc @param {number} tex @param {number} cx @param {number} cz
 * @param {number} rBot @param {number} yBot @param {number} rTop @param {number} yTop
 * @param {number} segs @param {number} uRep @param {number} vRep @param {number} [capTopTex] @param {number} [capBotTex]
 */
function addFrustum(mc, tex, cx, cz, rBot, yBot, rTop, yTop, segs, uRep, vRep, capTopTex = -1, capBotTex = -1) {
  const botRing = [];
  const topRing = [];
  const slopeY = (rBot - rTop) / Math.max(0.05, yTop - yBot);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    botRing.push([cx + rBot * ca, yBot, cz + rBot * sa]);
    topRing.push([cx + rTop * ca, yTop, cz + rTop * sa]);
  }
  for (let i = 0; i < segs; i++) {
    const ni = (i + 1) % segs;
    const u0 = (i / segs) * uRep, u1 = ((i + 1) / segs) * uRep;
    const midA = ((i + 0.5) / segs) * Math.PI * 2;
    const fn = norm([Math.cos(midA), slopeY, Math.sin(midA)]);
    mc.poly(tex, [botRing[i], botRing[ni], topRing[ni], topRing[i]], fn, [[u0, 0], [u1, 0], [u1, vRep], [u0, vRep]]);
  }
  if (capTopTex >= 0 && rTop > 0.02) {
    mc.poly(capTopTex, topRing, [0, 1, 0], (c) => [(c[0] - cx) / (rTop * 2) + 0.5, (c[2] - cz) / (rTop * 2) + 0.5]);
  }
  if (capBotTex >= 0 && rBot > 0.02) {
    mc.poly(capBotTex, [...botRing].reverse(), [0, -1, 0], (c) => [(c[0] - cx) / (rBot * 2) + 0.5, (c[2] - cz) / (rBot * 2) + 0.5]);
  }
}

/**
 * @param {ReturnType<typeof createMeshCollector>} mc @param {number} count @param {number} angleOffset
 * @param {number} rBot @param {number} y0 @param {number} rTop @param {number} y1 @param {number} halfW
 */
function addTowerWindowBayRing(mc, count, angleOffset, rBot, y0, rTop, y1, halfW) {
  const T = BAZAAR_TEX;
  const slopeY = (rBot - rTop) / Math.max(0.1, y1 - y0);
  for (let i = 0; i < count; i++) {
    const a = angleOffset + (i / count) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const tx = -sa, tz = ca;
    const fn = norm([ca, slopeY, sa]);
    const pAt = (/** @type {number} */ s, /** @type {number} */ y, /** @type {number} */ out) => {
      const t = (y - y0) / (y1 - y0);
      const r = rBot + (rTop - rBot) * t + out;
      return [ca * r + tx * s, y, sa * r + tz * s];
    };
    mc.poly(
      T.vistaWindow,
      [pAt(-halfW, y0, 0.16), pAt(halfW, y0, 0.16), pAt(halfW * 0.92, y1, 0.16), pAt(-halfW * 0.92, y1, 0.16)],
      fn,
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    );
    const frameW = 0.34;
    for (const dir of [-1, 1]) {
      const sIn = dir * halfW, sOut = dir * (halfW + frameW);
      const sInT = dir * halfW * 0.92, sOutT = dir * (halfW * 0.92 + frameW);
      const sideN = norm([tx * dir, 0, tz * dir]);
      const bIn = pAt(sIn, y0, 0.0), bOut = pAt(sOut, y0, 0.0);
      const bInP = pAt(sIn, y0, 0.42), bOutP = pAt(sOut, y0, 0.42);
      const tInP = pAt(sInT, y1, 0.38), tOutP = pAt(sOutT, y1, 0.38);
      const tIn = pAt(sInT, y1, 0.0), tOut = pAt(sOutT, y1, 0.0);
      mc.poly(T.vistaMarble, [bInP, bOutP, tOutP, tInP], fn, [[0, 0], [0.4, 0], [0.4, 2.5], [0, 2.5]]);
      mc.poly(T.vistaMarble, [bOut, bOutP, tOutP, tOut], sideN, [[0, 0], [0.4, 0], [0.4, 2.5], [0, 2.5]]);
      mc.poly(T.leyGold, [bIn, bInP, tInP, tIn], [-sideN[0], 0, -sideN[2]], [[0, 0], [0.3, 0], [0.3, 2.5], [0, 2.5]]);
    }
  }
}

/** @type {any} */
let _cachedVistaModel = null;

/**
 * Multi-tiered 3D Ceporah Tower and Torn Isle of Artaeum Citadel vista on the northern horizon.
 */
export function bazaarCeporahVistaModel() {
  if (_cachedVistaModel) return _cachedVistaModel;
  const mc = createMeshCollector();
  const { poly, box, finish } = mc;
  const T = BAZAAR_TEX;

  // 1. Asymmetric Torn Isle of Artaeum cliff mass, secondary sea-stack crag, viaduct arch, and cascades.
  const mainCap = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const jag = 1 + 0.04 * Math.sin(i * 3.0 + 2.7) + 0.022 * Math.cos(i * 5.0 - 2.7 * 1.7);
    return [24.0 * jag * Math.cos(a), 2.2, 24.0 * jag * Math.sin(a)];
  });
  poly(T.artaeumCliff, mainCap, [0, 1, 0], (c) => [c[0] / 8.0, c[2] / 8.0]);
  addTornIslandRoot(mc, 0, 0, 24.0, 2.2, 54.0, 16, 2.7);
  addFrustum(mc, T.artaeumCliff, 0, 0, 21.4, 1.8, 20.0, 4.0, 16, 4.0, 0.8, T.astralSlate, -1);

  box(T.artaeumCliff, [-16.8, -3.5, -21.5], [-5.4, 2.6, -12.0], undefined, undefined, 0.22);
  box(T.artaeumCliff, [5.8, -4.2, -21.2], [17.2, 2.3, -11.2], undefined, undefined, 0.22);
  box(T.artaeumCliff, [13.5, -5.0, -6.2], [23.6, 1.9, 5.8], undefined, undefined, 0.22);

  const stackCx = -22.0, stackCz = -10.0;
  const stackCap = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const jag = 1 + 0.04 * Math.sin(i * 3.0 + 5.1) + 0.022 * Math.cos(i * 5.0 - 5.1 * 1.7);
    return [stackCx + 10.0 * jag * Math.cos(a), -4.0, stackCz + 10.0 * jag * Math.sin(a)];
  });
  poly(T.artaeumCliff, stackCap, [0, 1, 0], (c) => [(c[0] - stackCx) / 6.0, (c[2] - stackCz) / 6.0]);
  addTornIslandRoot(mc, stackCx, stackCz, 10.0, -4.0, 34.0, 12, 5.1);
  addFrustum(mc, T.artaeumCliff, stackCx, stackCz, 8.4, -4.2, 7.4, -1.2, 12, 2.5, 0.7, T.astralSlate, -1);
  addFrustum(mc, T.vistaMarble, stackCx, stackCz, 5.8, -1.2, 5.3, 3.2, 8, 2.0, 1.0, T.astralSlate, -1);
  addFrustum(mc, T.leyGold, stackCx, stackCz, 5.6, 3.2, 5.6, 3.7, 8, 2.0, 0.4, T.astralSlate, T.vistaMarble);
  addCleftPylon(mc, [stackCx, 3.7, stackCz], 1.25, 8.6, 0.04, 0.38);

  // 3D Ceporah stone viaduct arch bridge spanning from the sea-stack bastion to the main citadel podium.
  const vA = [-19.4, -8.8], vB = [-12.6, -5.7];
  const vDx = vB[0] - vA[0], vDz = vB[1] - vA[1];
  const vLen = Math.hypot(vDx, vDz) || 1;
  const vUx = vDx / vLen, vUz = vDz / vLen;
  const vNx = vUz, vNz = -vUx;
  const vHalfW = 1.32;
  const vSegs = 8;
  const vPt = (/** @type {number} */ t, /** @type {number} */ y, /** @type {number} */ s) => [
    vA[0] + vDx * t + vNx * s,
    y,
    vA[1] + vDz * t + vNz * s,
  ];
  for (let s = 0; s < vSegs; s++) {
    const t0 = s / vSegs, t1 = (s + 1) / vSegs;
    const arch0 = (-1.6 + 1.2 * t0) + 4.4 * Math.sin(t0 * Math.PI);
    const arch1 = (-1.6 + 1.2 * t1) + 4.4 * Math.sin(t1 * Math.PI);
    const deck0 = 3.5 + 1.9 * t0, deck1 = 3.5 + 1.9 * t1;
    poly(T.vistaMarble, [vPt(t0, arch0, vHalfW), vPt(t1, arch1, vHalfW), vPt(t1, deck1, vHalfW), vPt(t0, deck0, vHalfW)],
      [vNx, 0, vNz], [[t0 * 3, 0], [t1 * 3, 0], [t1 * 3, 1.2], [t0 * 3, 1.2]]);
    poly(T.vistaMarble, [vPt(t1, arch1, -vHalfW), vPt(t0, arch0, -vHalfW), vPt(t0, deck0, -vHalfW), vPt(t1, deck1, -vHalfW)],
      [-vNx, 0, -vNz], [[t1 * 3, 0], [t0 * 3, 0], [t0 * 3, 1.2], [t1 * 3, 1.2]]);
    const soffitSlope = -(arch1 - arch0) / Math.max(0.1, vLen / vSegs);
    const soffitN = norm([vUx * soffitSlope, -1, vUz * soffitSlope]);
    poly(T.leyGold, [vPt(t0, arch0, vHalfW), vPt(t1, arch1, vHalfW), vPt(t1, arch1, -vHalfW), vPt(t0, arch0, -vHalfW)],
      soffitN, [[t0 * 4, 0], [t1 * 4, 0], [t1 * 4, 1], [t0 * 4, 1]]);
    poly(T.astralSlate, [vPt(t0, deck0, vHalfW), vPt(t1, deck1, vHalfW), vPt(t1, deck1, -vHalfW), vPt(t0, deck0, -vHalfW)],
      [0, 1, 0], [[t0 * 3, 0], [t1 * 3, 0], [t1 * 3, 1], [t0 * 3, 1]]);
    for (const side of [-1, 1]) {
      const sOut = side * (vHalfW + 0.14), sIn = side * (vHalfW - 0.18);
      poly(T.leyGold, [vPt(t0, deck0, sOut), vPt(t1, deck1, sOut), vPt(t1, deck1 + 0.65, sOut), vPt(t0, deck0 + 0.65, sOut)],
        [vNx * side, 0, vNz * side], [[t0 * 3, 0], [t1 * 3, 0], [t1 * 3, 0.5], [t0 * 3, 0.5]]);
      poly(T.leyGold, [vPt(t0, deck0 + 0.65, sIn), vPt(t1, deck1 + 0.65, sIn), vPt(t1, deck1 + 0.65, sOut), vPt(t0, deck0 + 0.65, sOut)],
        [0, 1, 0], [[t0 * 3, 0], [t1 * 3, 0], [t1 * 3, 0.3], [t0 * 3, 0.3]]);
    }
  }

  // Two luminous stasis-cascade chutes spilling down the sanctum-facing cliff face.
  const chutes = [
    { x: -7.8, z0: -21.2, y0: 2.3, drop: 29.5, flareZ: -4.8, hw: 1.45 },
    { x: 9.2, z0: -20.6, y0: 2.1, drop: 31.5, flareZ: -4.6, hw: 1.25 },
  ];
  for (const ch of chutes) {
    box(T.vistaMarble, [ch.x - ch.hw - 0.55, ch.y0 - 0.8, ch.z0 - 0.6], [ch.x + ch.hw + 0.55, ch.y0 + 0.9, ch.z0 + 1.8], undefined, undefined, 0.4);
    box(T.leyGold, [ch.x - ch.hw - 0.65, ch.y0 + 0.7, ch.z0 - 0.7], [ch.x + ch.hw + 0.65, ch.y0 + 1.15, ch.z0 + 1.9], undefined, undefined, 0.8);
    const cSegs = 6;
    for (let s = 0; s < cSegs; s++) {
      const t0 = s / cSegs, t1 = (s + 1) / cSegs;
      const z0 = ch.z0 - 0.5 + ch.flareZ * Math.pow(t0, 0.72);
      const z1 = ch.z0 - 0.5 + ch.flareZ * Math.pow(t1, 0.72);
      const y0 = ch.y0 - ch.drop * Math.pow(t0, 1.25);
      const y1 = ch.y0 - ch.drop * Math.pow(t1, 1.25);
      const taper0 = t0 > 0.72 ? (1 - (t0 - 0.72) / 0.28 * 0.88) : (1 + 0.28 * t0);
      const taper1 = t1 > 0.72 ? (1 - (t1 - 0.72) / 0.28 * 0.88) : (1 + 0.28 * t1);
      const w0 = ch.hw * taper0, w1 = ch.hw * taper1;
      const fn = norm([0, z0 - z1, y1 - y0]);
      poly(
        T.stasisCascade,
        [[ch.x + w0, y0, z0], [ch.x - w0, y0, z0], [ch.x - w1, y1, z1], [ch.x + w1, y1, z1]],
        fn,
        [[0, t0 * 4], [1, t0 * 4], [1, t1 * 4], [0, t1 * 4]],
      );
    }
  }

  // 2. Stepped 16-sided Ceporah citadel podium, 12-pier outer colonnade, and 8 sweeping radial buttress fins.
  addFrustum(mc, T.vistaMarble, 0, 0, 18.5, 2.0, 17.9, 6.4, 16, 4.0, 1.2);
  addFrustum(mc, T.leyGold, 0, 0, 18.8, 6.4, 18.8, 7.2, 16, 4.0, 0.4, T.astralSlate, T.vistaMarble);
  addFrustum(mc, T.vistaMarble, 0, 0, 16.6, 7.2, 16.2, 9.0, 16, 4.0, 0.6, T.astralSlate, -1);
  addFrustum(mc, T.leyGold, 0, 0, 16.5, 8.7, 16.5, 9.1, 16, 4.0, 0.3, T.astralSlate, -1);

  const colCount = 12;
  const colR = 15.8;
  for (let k = 0; k < colCount; k++) {
    const a = (k / colCount) * Math.PI * 2;
    addFrustum(mc, T.vistaMarble, colR * Math.cos(a), colR * Math.sin(a), 0.74, 9.1, 0.62, 16.7, 10, 2.0, 2.0);
  }
  for (let k = 0; k < colCount; k++) {
    const a0 = (k / colCount) * Math.PI * 2, a1 = ((k + 1) / colCount) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const rIn = 15.0, rOut = 16.55;
    const y0 = 16.7, y1 = 17.85, yC = 18.3;
    const outN = norm([(c0 + c1) * 0.5, 0, (s0 + s1) * 0.5]);
    const inN = [-outN[0], 0, -outN[2]];
    poly(T.vistaMarble, [[rOut * c0, y0, rOut * s0], [rOut * c1, y0, rOut * s1], [rOut * c1, y1, rOut * s1], [rOut * c0, y1, rOut * s0]], outN, [[0, 0], [2, 0], [2, 0.6], [0, 0.6]]);
    poly(T.vistaMarble, [[rIn * c1, y0, rIn * s1], [rIn * c0, y0, rIn * s0], [rIn * c0, y1, rIn * s0], [rIn * c1, y1, rIn * s1]], inN, [[0, 0], [2, 0], [2, 0.6], [0, 0.6]]);
    poly(T.leyGold, [[rIn * c0, y0, rIn * s0], [rIn * c1, y0, rIn * s1], [rOut * c1, y0, rOut * s1], [rOut * c0, y0, rOut * s0]], [0, -1, 0], [[0, 0], [2, 0], [2, 0.5], [0, 0.5]]);
    poly(T.leyGold, [[(rOut + 0.25) * c0, y1, (rOut + 0.25) * s0], [(rOut + 0.25) * c1, y1, (rOut + 0.25) * s1], [(rOut + 0.25) * c1, yC, (rOut + 0.25) * s1], [(rOut + 0.25) * c0, yC, (rOut + 0.25) * s0]], outN, [[0, 0], [2, 0], [2, 0.4], [0, 0.4]]);
    poly(T.leyGold, [[(rIn - 0.15) * c0, yC, (rIn - 0.15) * s0], [(rOut + 0.25) * c0, yC, (rOut + 0.25) * s0], [(rOut + 0.25) * c1, yC, (rOut + 0.25) * s1], [(rIn - 0.15) * c1, yC, (rIn - 0.15) * s1]], [0, 1, 0], [[0, 0], [0.5, 0], [0.5, 2], [0, 2]]);
  }

  for (let b = 0; b < 8; b++) {
    const a = (b / 8) * Math.PI * 2 + Math.PI / 8;
    const rx = Math.cos(a), rz = Math.sin(a);
    const tx = -rz, tz = rx;
    const finPt = (/** @type {number} */ r, /** @type {number} */ y, /** @type {number} */ s) => [rx * r + tx * s, y, rz * r + tz * s];
    const tiers = [
      { rIn: 9.8, rOutB: 19.5, yB: 3.5, rOutT: 15.6, yT: 15.2, hw: 0.76 },
      { rIn: 9.2, rOutB: 15.1, yB: 15.2, rOutT: 10.8, yT: 26.2, hw: 0.58 },
    ];
    for (const tr of tiers) {
      const slopeN = norm([rx * (tr.yT - tr.yB), tr.rOutB - tr.rOutT, rz * (tr.yT - tr.yB)]);
      poly(T.vistaMarble, [finPt(tr.rIn, tr.yB, tr.hw), finPt(tr.rOutB, tr.yB, tr.hw), finPt(tr.rOutT, tr.yT, tr.hw * 0.85), finPt(tr.rIn, tr.yT, tr.hw * 0.85)], [tx, 0, tz], [[0, 0], [2, 0], [1.4, 2.5], [0, 2.5]]);
      poly(T.vistaMarble, [finPt(tr.rOutB, tr.yB, -tr.hw), finPt(tr.rIn, tr.yB, -tr.hw), finPt(tr.rIn, tr.yT, -tr.hw * 0.85), finPt(tr.rOutT, tr.yT, -tr.hw * 0.85)], [-tx, 0, -tz], [[2, 0], [0, 0], [0, 2.5], [1.4, 2.5]]);
      poly(T.leyGold, [finPt(tr.rOutB, tr.yB, -tr.hw), finPt(tr.rOutB, tr.yB, tr.hw), finPt(tr.rOutT, tr.yT, tr.hw * 0.85), finPt(tr.rOutT, tr.yT, -tr.hw * 0.85)], slopeN, [[0, 0], [0.8, 0], [0.8, 3.0], [0, 3.0]]);
      poly(T.leyGold, [finPt(tr.rIn, tr.yT, -tr.hw * 0.85), finPt(tr.rIn, tr.yT, tr.hw * 0.85), finPt(tr.rOutT, tr.yT, tr.hw * 0.85), finPt(tr.rOutT, tr.yT, -tr.hw * 0.85)], [0, 1, 0], [[0, 0], [0.6, 0], [0.6, 1.2], [0, 1.2]]);
    }
  }

  // 3. Three monumental fluted Ceporah Tower tiers, summit cleft horns, and hovering Astral Spire.
  addFrustum(mc, T.vistaMarble, 0, 0, 11.2, 16.0, 9.8, 37.2, 16, 4.0, 3.0);
  addTowerWindowBayRing(mc, 8, 0.0, 10.95, 20.0, 10.05, 34.4, 1.38);
  addFrustum(mc, T.vistaMarble, 0, 0, 9.8, 37.0, 10.95, 37.8, 16, 4.0, 0.4);
  addFrustum(mc, T.leyGold, 0, 0, 11.05, 37.8, 11.05, 38.6, 16, 4.0, 0.4, T.vistaMarble, T.leyGold);

  addFrustum(mc, T.leyGold, 0, 0, 9.65, 38.6, 9.45, 39.8, 16, 4.0, 0.4, T.vistaMarble, -1);
  addFrustum(mc, T.vistaMarble, 0, 0, 8.8, 39.8, 7.5, 54.8, 16, 3.5, 2.5);
  addTowerWindowBayRing(mc, 8, 0.0, 8.62, 41.8, 7.72, 52.8, 1.04);
  for (let p = 0; p < 8; p++) {
    const a = (p / 8) * Math.PI * 2 + Math.PI / 8;
    const ca = Math.cos(a), sa = Math.sin(a), tx = -sa, tz = ca;
    const pilPt = (/** @type {number} */ r, /** @type {number} */ y, /** @type {number} */ s) => [ca * r + tx * s, y, sa * r + tz * s];
    const hw = 0.44;
    const fn = norm([ca, (8.8 - 7.5) / 15.0, sa]);
    poly(T.vistaMarble, [pilPt(9.28, 39.8, -hw), pilPt(9.28, 39.8, hw), pilPt(7.98, 54.8, hw * 0.88), pilPt(7.98, 54.8, -hw * 0.88)], fn, [[0, 0], [0.5, 0], [0.5, 3], [0, 3]]);
    poly(T.vistaMarble, [pilPt(9.28, 39.8, hw), pilPt(8.5, 39.8, hw), pilPt(7.3, 54.8, hw * 0.88), pilPt(7.98, 54.8, hw * 0.88)], [tx, 0, tz], [[0, 0], [0.4, 0], [0.4, 3], [0, 3]]);
    poly(T.vistaMarble, [pilPt(8.5, 39.8, -hw), pilPt(9.28, 39.8, -hw), pilPt(7.98, 54.8, -hw * 0.88), pilPt(7.3, 54.8, -hw * 0.88)], [-tx, 0, -tz], [[0, 0], [0.4, 0], [0.4, 3], [0, 3]]);
  }
  addFrustum(mc, T.vistaMarble, 0, 0, 7.5, 54.8, 8.5, 55.5, 16, 3.5, 0.35);
  addFrustum(mc, T.leyGold, 0, 0, 8.6, 55.5, 8.6, 56.3, 16, 3.5, 0.4, T.vistaMarble, T.leyGold);

  addFrustum(mc, T.vistaMarble, 0, 0, 6.6, 56.3, 4.8, 68.8, 12, 3.0, 2.0);
  addTowerWindowBayRing(mc, 6, Math.PI / 6, 6.32, 58.2, 5.12, 66.6, 0.86);
  addFrustum(mc, T.leyGold, 0, 0, 5.45, 68.6, 5.45, 69.6, 12, 3.0, 0.4, T.chancelSun, T.leyGold);

  for (let h = 0; h < 4; h++) {
    const a = (h / 4) * Math.PI * 2 + Math.PI / 4;
    const ca = Math.cos(a), sa = Math.sin(a), tx = -sa, tz = ca;
    const hPt = (/** @type {number} */ r, /** @type {number} */ y, /** @type {number} */ s) => [ca * r + tx * s, y, sa * r + tz * s];
    const bOut = 5.15, bIn = 3.85, yB = 69.2;
    const mOut = 4.15, mIn = 3.15, yM = 74.2;
    const tip = hPt(2.85, 78.4, 0);
    const bLOut = hPt(bOut, yB, -0.58), bROut = hPt(bOut, yB, 0.58);
    const bLIn = hPt(bIn, yB, -0.44), bRIn = hPt(bIn, yB, 0.44);
    const mLOut = hPt(mOut, yM, -0.36), mROut = hPt(mOut, yM, 0.36);
    const mLIn = hPt(mIn, yM, -0.26), mRIn = hPt(mIn, yM, 0.26);
    poly(T.vistaMarble, [bLOut, bROut, mROut, mLOut], norm([ca, 0.22, sa]), [[0, 0], [0.6, 0], [0.5, 1.5], [0, 1.5]]);
    poly(T.leyGold, [bRIn, bLIn, mLIn, mRIn], norm([-ca, -0.15, -sa]), [[0, 0], [0.6, 0], [0.5, 1.5], [0, 1.5]]);
    poly(T.vistaMarble, [bROut, bRIn, mRIn, mROut], [tx, 0, tz], [[0, 0], [0.5, 0], [0.4, 1.5], [0, 1.5]]);
    poly(T.vistaMarble, [bLIn, bLOut, mLOut, mLIn], [-tx, 0, -tz], [[0, 0], [0.5, 0], [0.4, 1.5], [0, 1.5]]);
    poly(T.vistaMarble, [mLOut, mROut, tip], norm([ca, 0.32, sa]), [[0, 0], [0.5, 0], [0.25, 1.2]]);
    poly(T.leyGold, [mRIn, mLIn, tip], norm([-ca, -0.12, -sa]), [[0, 0], [0.5, 0], [0.25, 1.2]]);
    poly(T.leyGold, [mROut, mRIn, tip], [tx, 0.1, tz], [[0, 0], [0.4, 0], [0.2, 1.2]]);
    poly(T.leyGold, [mLIn, mLOut, tip], [-tx, 0.1, -tz], [[0, 0], [0.4, 0], [0.2, 1.2]]);
  }

  // Hovering faceted golden-marble Astral Spire above the open summit lantern.
  const spireSegs = 8;
  const spireBot = [0, 73.0, 0];
  const spireTop = [0, 86.0, 0];
  const spireLo = Array.from({ length: spireSegs }, (_, i) => {
    const a = (i / spireSegs) * Math.PI * 2;
    return [1.72 * Math.cos(a), 75.9, 1.72 * Math.sin(a)];
  });
  const spireHi = Array.from({ length: spireSegs }, (_, i) => {
    const a = (i / spireSegs) * Math.PI * 2;
    return [1.72 * Math.cos(a), 76.9, 1.72 * Math.sin(a)];
  });
  addFrustum(mc, T.vistaMarble, 0, 0, 1.82, 75.85, 1.82, 76.95, spireSegs, 2.0, 0.5, T.leyGold, T.leyGold);
  for (let i = 0; i < spireSegs; i++) {
    const ni = (i + 1) % spireSegs;
    const midA = ((i + 0.5) / spireSegs) * Math.PI * 2;
    poly(T.leyGold, [spireHi[i], spireHi[ni], spireTop], norm([Math.cos(midA), 0.19, Math.sin(midA)]), [[0, 0], [0.6, 0], [0.3, 2.4]]);
    poly(T.leyGold, [spireLo[ni], spireLo[i], spireBot], norm([Math.cos(midA), -0.58, Math.sin(midA)]), [[0, 0], [0.6, 0], [0.3, 1.0]]);
  }

  _cachedVistaModel = finish('Bazaar Ceporah Citadel Vista', [], true);
  return _cachedVistaModel;
}

/** @type {any} */
let _cachedVistaRingModel = null;

/**
 * Solid 3D beveled 16-segment golden armillary ring scaled and revolved around Ceporah Tower's summit.
 */
export function bazaarVistaRingModel() {
  if (_cachedVistaRingModel) return _cachedVistaRingModel;
  const { poly, box, finish } = createMeshCollector();
  const T = BAZAAR_TEX;
  const segs = 16;
  const rIn = 0.955, rMid = 1.0, rOut = 1.045, h = 0.045;

  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const midA = ((i + 0.5) / segs) * Math.PI * 2;
    const mc0 = Math.cos(midA), ms0 = Math.sin(midA);

    const pOut0 = [rOut * c0, 0, rOut * s0], pOut1 = [rOut * c1, 0, rOut * s1];
    const pTop0 = [rMid * c0, h, rMid * s0], pTop1 = [rMid * c1, h, rMid * s1];
    const pIn0 = [rIn * c0, 0, rIn * s0], pIn1 = [rIn * c1, 0, rIn * s1];
    const pBot0 = [rMid * c0, -h, rMid * s0], pBot1 = [rMid * c1, -h, rMid * s1];

    poly(T.leyGold, [pOut0, pOut1, pTop1, pTop0], norm([mc0, 1, ms0]), [[0, 0], [1, 0], [1, 0.5], [0, 0.5]]);
    poly(T.leyGold, [pTop0, pTop1, pIn1, pIn0], norm([-mc0, 1, -ms0]), [[0, 0], [1, 0], [1, 0.5], [0, 0.5]]);
    poly(T.leyGold, [pIn0, pIn1, pBot1, pBot0], norm([-mc0, -1, -ms0]), [[0, 0], [1, 0], [1, 0.5], [0, 0.5]]);
    poly(T.leyGold, [pBot0, pBot1, pOut1, pOut0], norm([mc0, -1, ms0]), [[0, 0], [1, 0], [1, 0.5], [0, 0.5]]);
  }

  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const xf = (/** @type {number[]} */ p) => {
      const r = rotateEuler(p, 0, a, 0);
      return [r[0] + Math.cos(a), r[1], r[2] - Math.sin(a)];
    };
    const xfN = (/** @type {number[]} */ n) => rotateEuler(n, 0, a, 0);
    box(T.marbleWall, [-0.068, -0.062, -0.055], [0.068, 0.062, 0.055], xf, xfN, 2.0);
  }

  _cachedVistaRingModel = finish('Bazaar Ceporah Crown Ring', [], true);
  return _cachedVistaRingModel;
}
