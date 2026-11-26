// @ts-check
import { MEASURED, LIFT, caravanSideU } from './wagonModels.js';
import { WAGON_ARCHIVE, TEX, WAGON_TILE, SIDE_Y0, SIDE_Y1 } from './wagonArt.js';
import { planarUv } from './galleonMesh.js';

const M = MEASURED.caravan;
export const CARAVAN_WALL = 0.06;
export const CARAVAN_ROOM = Object.freeze({
  halfX: M.sideX - CARAVAN_WALL,
  floorY: M.floorY - LIFT + 0.01,
  eavesY: SIDE_Y1 - LIFT,
  peakY: M.endTopY - LIFT - CARAVAN_WALL,
  rearZ: M.rearZ + CARAVAN_WALL,
  frontZ: M.bedZ[1] - CARAVAN_WALL,
});
export const CEILING_FACETS = 8;

export function ceilingArc(room = CARAVAN_ROOM) {
  const { halfX: X, eavesY: e, peakY: p } = room;
  // `cy` solves |(X, e) - (0, cy)| = p - cy, the circle through both eaves and the peak.
  const cy = (X * X + e * e - p * p) / (2 * (e - p));
  return { cy, r: p - cy, half: Math.asin(X / (p - cy)) };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const baked = (p) => [p[0], p[1] + LIFT, p[2]];
const sideUv = (out) => (p) => { const b = baked(p); return [caravanSideU(b, out, WAGON_TILE.roomSide[0]), Math.min(1, Math.max(0, (b[1] - SIDE_Y0) / (SIDE_Y1 - SIDE_Y0)))]; };
const endUv = (sign) => (p) => { const b = baked(p); return [0.5 + (sign * b[0]) / (2 * M.sideX), (b[1] - M.floorY) / (M.endTopY - M.floorY)]; };

export function caravanRoomModel({ records = null } = {}) {
  const R = CARAVAN_ROOM, { cy, r, half } = ceilingArc(R);
  const rec = (k) => records?.[k] ?? TEX[k];
  const groups = new Map();
  const group = (k) => { const g = groups.get(k) ?? { p: [], n: [], uv: [], i: [] }; groups.set(k, g); return g; };
  const poly = (k, corners, n, uv, normals = null) => {
    const g = group(k), base = g.p.length / 3;
    corners.forEach((c, i) => { g.p.push(...c); g.n.push(...(normals ? normals[i] : n)); g.uv.push(...(typeof uv === 'function' ? uv(c) : uv[i])); });
    const flip = dot(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])), n) < 0;
    for (let i = 1; i + 1 < corners.length; i++) g.i.push(...(flip ? [base, base + i + 1, base + i] : [base, base + i, base + i + 1]));
  };
  const { halfX: X, floorY: f, eavesY: e, rearZ: zr, frontZ: zf } = R;
  poly('roomFloor', [[-X, f, zr], [X, f, zr], [X, f, zf], [-X, f, zf]], [0, 1, 0], (p) => planarUv(p, [0, 1, 0], WAGON_TILE.roomFloor));
  poly('roomSide', [[X, f, zr], [X, f, zf], [X, e, zf], [X, e, zr]], [-1, 0, 0], sideUv([1, 0, 0]));
  poly('roomSide', [[-X, f, zr], [-X, f, zf], [-X, e, zf], [-X, e, zr]], [1, 0, 0], sideUv([-1, 0, 0]));
  const at = (k) => { const a = -half + (2 * half * k) / CEILING_FACETS; return { x: r * Math.sin(a), y: cy + r * Math.cos(a), n: [-Math.sin(a), -Math.cos(a), 0], s: r * (a + half) }; };
  for (let k = 0; k < CEILING_FACETS; k++) {
    const a = at(k), b = at(k + 1), [tu, tv] = WAGON_TILE.roomCeiling;
    const m = -half + (2 * half * (k + 0.5)) / CEILING_FACETS, mid = [-Math.sin(m), -Math.cos(m), 0];
    poly('roomCeiling', [[a.x, a.y, zr], [b.x, b.y, zr], [b.x, b.y, zf], [a.x, a.y, zf]], mid,
      [[zr / tu, a.s / tv], [zr / tu, b.s / tv], [zf / tu, b.s / tv], [zf / tu, a.s / tv]], [a.n, b.n, b.n, a.n]);
  }
  const gable = [];
  for (let k = CEILING_FACETS; k >= 0; k--) { const a = at(k); gable.push([a.x, a.y]); }
  const end = (z) => [[-X, f, z], [X, f, z], ...gable.map(([x, y]) => [x, y, z])];
  poly('roomRear', end(zr), [0, 0, 1], endUv(1));
  poly('roomFront', end(zf), [0, 0, -1], endUv(-1));
  const positions = [], normals = [], uvs = [], indices = [], subMeshes = [];
  for (const k of ['roomFloor', 'roomSide', 'roomCeiling', 'roomRear', 'roomFront']) {
    const g = groups.get(k), base = positions.length / 3, start = indices.length;
    positions.push(...g.p); normals.push(...g.n); uvs.push(...g.uv);
    for (const i of g.i) indices.push(base + i);
    subMeshes.push({ textureArchive: WAGON_ARCHIVE, textureRecord: rec(k), startIndex: start, primitiveCount: g.i.length / 3 });
  }
  return { name: 'Caravan room', positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs), indices: Uint32Array.from(indices), subMeshes, doors: [] };
}

export const CARAVAN_ENTER = Object.freeze([0, CARAVAN_ROOM.floorY, CARAVAN_ROOM.rearZ + 0.3]);
export const CARAVAN_LANTERN = Object.freeze([0, CARAVAN_ROOM.peakY, (CARAVAN_ROOM.rearZ + CARAVAN_ROOM.frontZ) / 2]);
