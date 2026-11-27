// @ts-check
// A prefab's colliders and the ray that meets them, after Unity's Physics.Raycast.

import { prefabShapeStamp } from './prefabNode.js';
import { multiply } from './mat4.js';

export function invertAffine(m) {
  const a00 = m[0], a10 = m[1], a20 = m[2], a01 = m[4], a11 = m[5], a21 = m[6], a02 = m[8], a12 = m[9], a22 = m[10];
  const c00 = a11 * a22 - a12 * a21, c01 = a12 * a20 - a10 * a22, c02 = a10 * a21 - a11 * a20;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (!det) return null;
  const k = 1 / det;
  const i00 = c00 * k, i01 = (a02 * a21 - a01 * a22) * k, i02 = (a01 * a12 - a02 * a11) * k;
  const i10 = c01 * k, i11 = (a00 * a22 - a02 * a20) * k, i12 = (a02 * a10 - a00 * a12) * k;
  const i20 = c02 * k, i21 = (a01 * a20 - a00 * a21) * k, i22 = (a00 * a11 - a01 * a10) * k;
  const tx = m[12], ty = m[13], tz = m[14];
  return [
    i00, i10, i20, 0,
    i01, i11, i21, 0,
    i02, i12, i22, 0,
    -(i00 * tx + i01 * ty + i02 * tz), -(i10 * tx + i11 * ty + i12 * tz), -(i20 * tx + i21 * ty + i22 * tz), 1,
  ];
}

const xformPoint = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
const xformDir = (m, d) => [
  m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
  m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
  m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
];

/**
 * @param {any} root
 */
const _indexes = new WeakMap();
function colliderIndex(root) {
  const stamp = prefabShapeStamp(root);
  const had = _indexes.get(root);
  if (had && had.stamp === stamp) return had;
  const found = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    for (const c of n.components) if (c.type === 'BoxCollider' || c.type === 'MeshCollider') found.push({ node: n, collider: c });
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  const nodes = [root], parent = [-1], at = new Map([[root, 0]]);
  const indexOf = (n) => {
    let i = at.get(n);
    if (i != null) return i;
    const p = indexOf(n.parent);
    i = nodes.length;
    nodes.push(n); parent.push(p); at.set(n, i);
    return i;
  };
  const entries = found.map(({ node, collider }) => ({ i: indexOf(node), collider }));
  const n = nodes.length;
  const ix = { stamp, nodes, parent, entries, on: new Uint8Array(n), inv: new Array(n).fill(null), invOf: new Array(n).fill(null) };
  _indexes.set(root, ix);
  return ix;
}
function refresh(ix) {
  for (let i = 0; i < ix.nodes.length; i++) ix.on[i] = ix.nodes[i].activeSelf && (ix.parent[i] < 0 || ix.on[ix.parent[i]]) ? 1 : 0;
  return ix;
}
function live(ix) {
  return ix.entries.filter((e) => ix.on[e.i] && e.collider.m_Enabled !== false);
}
const worldOf = (ix, i) => ix.nodes[i].worldMatrix();
function inverseOf(ix, i) {
  const w = worldOf(ix, i);
  if (ix.invOf[i] !== w) { ix.inv[i] = invertAffine(w); ix.invOf[i] = w; }
  return ix.inv[i];
}

/**
 * @param {any} root
 * @returns {{ node:any, collider:any }[]}
 */
export function collidersOf(root) {
  if (!root) return [];
  const ix = refresh(colliderIndex(root));
  return live(ix).map((e) => ({ node: ix.nodes[e.i], collider: e.collider }));
}

/**
 * @param {any} root
 * @returns {{ node:any, collider:any, world:ArrayLike<number> }[]}
 */
export function colliderPoses(root) {
  if (!root) return [];
  const ix = refresh(colliderIndex(root));
  return live(ix).map((e) => ({ node: ix.nodes[e.i], collider: e.collider, world: worldOf(ix, e.i) }));
}

/**
 * @param {number[]} o
 * @param {number[]} d
 * @param {number[]} min
 * @param {number[]} max
 */
export function rayBoxEntry(o, d, min, max) {
  let tMin = -Infinity, tMax = Infinity;
  for (let a = 0; a < 3; a++) {
    if (d[a] === 0) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    let t0 = (min[a] - o[a]) / d[a], t1 = (max[a] - o[a]) / d[a];
    if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin > tMax) return null;
  }
  return tMin >= 0 ? tMin : null;
}

function rayTriangle(o, d, p, i0, i1, i2) {
  const ax = p[i0 * 3], ay = p[i0 * 3 + 1], az = p[i0 * 3 + 2];
  const e1x = p[i1 * 3] - ax, e1y = p[i1 * 3 + 1] - ay, e1z = p[i1 * 3 + 2] - az;
  const e2x = p[i2 * 3] - ax, e2y = p[i2 * 3 + 1] - ay, e2z = p[i2 * 3 + 2] - az;
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det === 0) return null;
  const inv = 1 / det;
  const tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 ? t : null;
}

/** @param {{ positions: ArrayLike<number>, indices: ArrayLike<number> }} g */
export function rayMeshEntry(o, d, g) {
  let best = null;
  const p = g.positions, ix = g.indices;
  for (let k = 0; k + 2 < ix.length; k += 3) {
    const t = rayTriangle(o, d, p, ix[k], ix[k + 1], ix[k + 2]);
    if (t != null && (best == null || t < best)) best = t;
  }
  return best;
}

const MESH_GRID_CELLS = 32;
const MESH_GRID_FROM = 64;
const MESH_GRID_MIN_CELL = 0.5;
const MESH_GRID_WIDE = 16;
const _meshGrids = new WeakMap();
function meshGrid(g) {
  let gr = _meshGrids.get(g.indices);
  if (gr) return gr;
  const { min, max } = meshBounds(g);
  const cell = Math.max(MESH_GRID_MIN_CELL, (max[0] - min[0]) / MESH_GRID_CELLS, (max[2] - min[2]) / MESH_GRID_CELLS);
  const nx = Math.max(1, Math.ceil((max[0] - min[0]) / cell)), nz = Math.max(1, Math.ceil((max[2] - min[2]) / cell));
  const cells = Array.from({ length: nx * nz }, () => []), wide = [];
  const p = g.positions, ix = g.indices;
  const at = (v, lo, n) => Math.max(0, Math.min(n - 1, Math.floor((v - lo) / cell)));
  for (let k = 0; k + 2 < ix.length; k += 3) {
    const a = ix[k] * 3, b = ix[k + 1] * 3, c = ix[k + 2] * 3;
    const x0 = at(Math.min(p[a], p[b], p[c]), min[0], nx), x1 = at(Math.max(p[a], p[b], p[c]), min[0], nx);
    const z0 = at(Math.min(p[a + 2], p[b + 2], p[c + 2]), min[2], nz), z1 = at(Math.max(p[a + 2], p[b + 2], p[c + 2]), min[2], nz);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > MESH_GRID_WIDE) { wide.push(k); continue; }
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) cells[x * nz + z].push(k);
  }
  gr = { min, cell, nx, nz, cells, wide, seen: new Int32Array(Math.floor(ix.length / 3)), ray: 0 };
  _meshGrids.set(g.indices, gr);
  return gr;
}
/**
 * @param {ArrayLike<number>} o
 * @param {ArrayLike<number>} d
 * @param {{ positions: ArrayLike<number>, indices: ArrayLike<number> }} g
 */
export function rayMeshEntryWithin(o, d, g, limit) {
  const gr = meshGrid(g);
  const p = g.positions, ix = g.indices;
  const ray = (gr.ray = (gr.ray + 1) | 0) || (gr.seen.fill(0), (gr.ray = 1));
  let best = null;
  const ask = (k) => {
    if (gr.seen[k / 3] === ray) return;
    gr.seen[k / 3] = ray;
    const t = rayTriangle(o, d, p, ix[k], ix[k + 1], ix[k + 2]);
    if (t != null && t <= limit && (best == null || t < best)) best = t;
  };
  for (const k of gr.wide) ask(k);
  const x0 = gr.min[0], z0 = gr.min[2], x1 = x0 + gr.nx * gr.cell, z1 = z0 + gr.nz * gr.cell;
  let tIn = 0, tOut = limit;
  for (let a = 0; a <= 2; a += 2) {
    const lo = a ? z0 : x0, hi = a ? z1 : x1;
    if (d[a] === 0) { if (o[a] < lo || o[a] > hi) return best; continue; }
    let ta = (lo - o[a]) / d[a], tb = (hi - o[a]) / d[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > tIn) tIn = ta;
    if (tb < tOut) tOut = tb;
    if (tIn > tOut) return best;
  }
  const clampCell = (v, lo, n) => Math.max(0, Math.min(n - 1, Math.floor((v - lo) / gr.cell)));
  let cx = clampCell(o[0] + d[0] * tIn, x0, gr.nx), cz = clampCell(o[2] + d[2] * tIn, z0, gr.nz);
  const stepX = d[0] > 0 ? 1 : -1, stepZ = d[2] > 0 ? 1 : -1;
  let tMaxX = d[0] !== 0 ? (x0 + (cx + (stepX > 0 ? 1 : 0)) * gr.cell - o[0]) / d[0] : Infinity;
  let tMaxZ = d[2] !== 0 ? (z0 + (cz + (stepZ > 0 ? 1 : 0)) * gr.cell - o[2]) / d[2] : Infinity;
  const tDeltaX = d[0] !== 0 ? Math.abs(gr.cell / d[0]) : Infinity, tDeltaZ = d[2] !== 0 ? Math.abs(gr.cell / d[2]) : Infinity;
  let walked = tIn;
  while (cx >= 0 && cx < gr.nx && cz >= 0 && cz < gr.nz && walked <= tOut && (best == null || walked <= best)) {
    for (const k of gr.cells[cx * gr.nz + cz]) ask(k);
    if (tMaxX < tMaxZ) { walked = tMaxX; tMaxX += tDeltaX; cx += stepX; } else { walked = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
  }
  return best;
}

/**
 * @param {ArrayLike<number>} positions
 * @returns {{ n:number[], d:number }[]|null}
 */
export function convexHullPlanes(positions) {
  const count = Math.floor(positions.length / 3);
  if (count < 4) return null;
  const P = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) { const q = P(i); for (let a = 0; a < 3; a++) { if (q[a] < lo[a]) lo[a] = q[a]; if (q[a] > hi[a]) hi[a] = q[a]; } }
  const eps = 1e-9 * Math.max(1, hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  let i0 = 0;
  for (let i = 1; i < count; i++) if (positions[i * 3] < positions[i0 * 3]) i0 = i;
  let i1 = -1, best = eps;
  for (let i = 0; i < count; i++) { const l = Math.hypot(...sub(P(i), P(i0))); if (l > best) { best = l; i1 = i; } }
  if (i1 < 0) return null;
  const axis = sub(P(i1), P(i0));
  let i2 = -1; best = eps;
  for (let i = 0; i < count; i++) { const l = Math.hypot(...cross(axis, sub(P(i), P(i0)))); if (l > best) { best = l; i2 = i; } }
  if (i2 < 0) return null;
  const n0 = cross(axis, sub(P(i2), P(i0)));
  let i3 = -1; best = eps * Math.hypot(...n0);
  for (let i = 0; i < count; i++) { const l = Math.abs(dot(n0, sub(P(i), P(i0)))); if (l > best) { best = l; i3 = i; } }
  if (i3 < 0) return null;
  /** @type {{ v:number[], n:number[], d:number, dead:boolean }[]} */
  const faces = [];
  const addFace = (a, b, c) => {
    const n = cross(sub(P(b), P(a)), sub(P(c), P(a)));
    const l = Math.hypot(...n) || 1;
    const u = [n[0] / l, n[1] / l, n[2] / l];
    faces.push({ v: [a, b, c], n: u, d: dot(u, P(a)), dead: false });
  };
  const tet = [i0, i1, i2, i3];
  for (const [a, b, c, o] of [[0, 1, 2, 3], [0, 3, 1, 2], [0, 2, 3, 1], [1, 3, 2, 0]]) {
    const n = cross(sub(P(tet[b]), P(tet[a])), sub(P(tet[c]), P(tet[a])));
    if (dot(n, sub(P(tet[o]), P(tet[a]))) > 0) addFace(tet[a], tet[c], tet[b]); else addFace(tet[a], tet[b], tet[c]);
  }
  for (let i = 0; i < count; i++) {
    if (i === i0 || i === i1 || i === i2 || i === i3) continue;
    const q = P(i);
    const visible = faces.filter((f) => !f.dead && dot(f.n, q) - f.d > eps);
    if (!visible.length) continue;
    const edges = new Set();
    for (const f of visible) for (let e = 0; e < 3; e++) edges.add(`${f.v[e]},${f.v[(e + 1) % 3]}`);
    const horizon = [];
    for (const f of visible) {
      for (let e = 0; e < 3; e++) {
        const a = f.v[e], b = f.v[(e + 1) % 3];
        if (!edges.has(`${b},${a}`)) horizon.push([a, b]);
      }
      f.dead = true;
    }
    for (const [a, b] of horizon) addFace(a, b, i);
  }
  return faces.filter((f) => !f.dead).map((f) => ({ n: f.n, d: f.d }));
}

export function rayConvexEntry(o, d, planes) {
  let tEnter = -Infinity, tExit = Infinity;
  for (const pl of planes) {
    const denom = pl.n[0] * d[0] + pl.n[1] * d[1] + pl.n[2] * d[2];
    const s = pl.n[0] * o[0] + pl.n[1] * o[1] + pl.n[2] * o[2] - pl.d;
    if (denom === 0) { if (s > 0) return null; continue; }
    const t = -s / denom;
    if (denom < 0) { if (t > tEnter) tEnter = t; } else if (t < tExit) tExit = t;
    if (tEnter > tExit) return null;
  }
  return tEnter >= 0 ? tEnter : null;
}

const _hulls = new WeakMap();
export function hullOf(g) {
  if (!_hulls.has(g)) _hulls.set(g, convexHullPlanes(g.positions));
  return _hulls.get(g);
}

/**
 * @param {any} root
 * @param {number[]} origin
 * @param {number[]} dir
 * @param {number} maxDistance
 * @param {{ triggers?: boolean, geometry: (collider:any, node:any) => ({ positions: ArrayLike<number>, indices: ArrayLike<number> }|null) }} opts
 * @returns {{ distance:number, point:number[], node:any, collider:any }|null}
 */
export function raycastColliders(root, origin, dir, maxDistance, { triggers = true, geometry }) {
  if (!root) return null;
  const ix = refresh(colliderIndex(root));
  const taken = [];
  for (const e of ix.entries) {
    if (!ix.on[e.i] || e.collider.m_Enabled === false) continue;
    if (e.collider.m_IsTrigger && !triggers) continue;
    const node = ix.nodes[e.i];
    const g = e.collider.type === 'BoxCollider' ? null : geometry(e.collider, node);
    if (e.collider.type !== 'BoxCollider' && !g) continue;
    taken.push({ e, node, g });
  }
  if (!taken.length) return null;
  const rootWorld = worldOf(ix, 0);
  const off = segmentPointDistance(origin, dir, maxDistance, rootWorld[12], rootWorld[13], rootWorld[14]);
  const rootStretch = ix.nodes[0].parent ? frobenius3(rootWorld) : maxAbs3(ix.nodes[0].localScale);
  let best = null;
  for (const { e, node, g } of taken) {
    const collider = e.collider;
    const shape = g ? meshBounds(g) : null;
    if (rootStretch * chainReach(ix, e, shape ? shape.radius : boxRadius(collider)) + REACH_SLACK < off) continue;
    const inv = inverseOf(ix, e.i);
    if (!inv) continue;
    const o = xformPoint(inv, origin), d = xformDir(inv, dir);
    let t = null;
    if (collider.type === 'BoxCollider') {
      const c = collider.m_Center ?? { x: 0, y: 0, z: 0 }, s = collider.m_Size ?? { x: 1, y: 1, z: 1 };
      const hx = Math.abs(s.x) / 2, hy = Math.abs(s.y) / 2, hz = Math.abs(s.z) / 2;
      t = rayBoxEntry(o, d, [c.x - hx, c.y - hy, c.z - hz], [c.x + hx, c.y + hy, c.z + hz]);
    } else {
      if (!segmentMeetsBox(o, d, shape.min, shape.max, maxDistance)) continue;
      if (collider.m_Convex) { const h = hullOf(g); t = h ? rayConvexEntry(o, d, h) : null; }
      else t = g.indices.length > MESH_GRID_FROM * 3 ? rayMeshEntryWithin(o, d, g, maxDistance) : rayMeshEntry(o, d, g);
    }
    if (t != null && t <= maxDistance && (!best || t < best.distance)) best = { distance: t, node, collider };
  }
  if (!best) return null;
  return { ...best, point: [origin[0] + dir[0] * best.distance, origin[1] + dir[1] * best.distance, origin[2] + dir[2] * best.distance] };
}

const REACH_SLACK = 1e-3;
function chainReach(ix, e, r) {
  let b = r;
  for (let k = e.i; ix.parent[k] >= 0; k = ix.parent[k]) {
    const n = ix.nodes[k], p = n.localPosition;
    b = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) + maxAbs3(n.localScale) * b;
  }
  return b;
}
const maxAbs3 = (s) => Math.max(Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2]));
const frobenius3 = (m) => Math.hypot(m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]);
function boxRadius(c) {
  const ce = c.m_Center ?? { x: 0, y: 0, z: 0 }, s = c.m_Size ?? { x: 1, y: 1, z: 1 };
  return Math.hypot(ce.x, ce.y, ce.z) + Math.hypot(s.x, s.y, s.z) / 2;
}
const _meshBounds = new WeakMap();
function meshBounds(g) {
  let b = _meshBounds.get(g.positions);
  if (b) return b;
  const p = g.positions;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let r2 = 0;
  for (let k = 0; k + 2 < p.length; k += 3) {
    const x = p[k], y = p[k + 1], z = p[k + 2];
    if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
    if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
    if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
    const d2 = x * x + y * y + z * z;
    if (d2 > r2) r2 = d2;
  }
  for (let a = 0; a < 3; a++) { min[a] -= REACH_SLACK; max[a] += REACH_SLACK; }
  b = { radius: Math.sqrt(r2), min, max };
  _meshBounds.set(g.positions, b);
  return b;
}
function segmentPointDistance(o, d, reach, x, y, z) {
  const vx = x - o[0], vy = y - o[1], vz = z - o[2];
  const t = Math.max(0, Math.min(reach, vx * d[0] + vy * d[1] + vz * d[2]));
  return Math.hypot(vx - d[0] * t, vy - d[1] * t, vz - d[2] * t);
}
function segmentMeetsBox(o, d, min, max, limit) {
  let t0 = 0, t1 = limit;
  for (let a = 0; a < 3; a++) {
    if (d[a] === 0) { if (o[a] < min[a] || o[a] > max[a]) return false; continue; }
    let ta = (min[a] - o[a]) / d[a], tb = (max[a] - o[a]) / d[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

export const BUILTIN_COLLIDER_MESHES = Object.freeze({
  Plane: Object.freeze({ positions: Object.freeze([-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5]), indices: Object.freeze([0, 2, 1, 0, 3, 2]) }),
  Cube: Object.freeze({
    positions: Object.freeze([-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5]),
    indices: Object.freeze([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 6, 2, 3, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]),
  }),
});

export function boxColliderTriangles(c) {
  const ce = c.m_Center ?? { x: 0, y: 0, z: 0 }, sz = c.m_Size ?? { x: 1, y: 1, z: 1 };
  const hx = Math.abs(sz.x) / 2, hy = Math.abs(sz.y) / 2, hz = Math.abs(sz.z) / 2;
  const positions = [];
  for (let i = 0; i < 8; i++) positions.push(ce.x + (i & 1 ? hx : -hx), ce.y + (i & 2 ? hy : -hy), ce.z + (i & 4 ? hz : -hz));
  return { positions, indices: [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5] };
}
