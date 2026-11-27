// @ts-check
// A front face winds so cross(b - a, c - a) points out of it, because the renderer draws gl.frontFace(CW) through a
// mirrored projection. Each face takes the normal it should face, and its corners are reordered to agree.
import { GALLEON_ARCHIVE } from './galleonArt.js';

/** @typedef {[number, number, number]} V3 */
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function newell(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

export function basisOf(n) {
  const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(a, n));
  return [u, cross(n, u)];
}

export class MeshBench {
  constructor(archive = GALLEON_ARCHIVE) {
    this.archive = archive;
    /** @type {Map<number, { p: number[], n: number[], uv: number[] }>} */
    this.groups = new Map();
  }
  /** @param {number} rec */
  group(rec) {
    let g = this.groups.get(rec);
    if (!g) { g = { p: [], n: [], uv: [] }; this.groups.set(rec, g); }
    return g;
  }
  tri(rec, a, b, c, ua, ub, uc, facing = null, normals = null) {
    let n = cross(sub(b, a), sub(c, a));
    if (facing && dot(n, facing) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; if (normals) normals = [normals[0], normals[2], normals[1]]; n = scl(n, -1); }
    const l = len(n);
    if (!(l > 1e-12)) return;
    const fn = scl(n, 1 / l);
    const g = this.group(rec);
    const corners = [[a, ua], [b, ub], [c, uc]];
    corners.forEach(([p, uv], i) => {
      g.p.push(p[0], p[1], p[2]);
      const nn = normals ? norm(normals[i]) : fn;
      g.n.push(nn[0], nn[1], nn[2]);
      g.uv.push(uv[0], uv[1]);
    });
  }
  poly(rec, pts, uvs, facing) {
    for (let i = 1; i + 1 < pts.length; i++) this.tri(rec, pts[0], pts[i], pts[i + 1], uvs[0], uvs[i], uvs[i + 1], facing);
  }
  quad(rec, a, b, c, d, uvs, facing) { this.poly(rec, [a, b, c, d], uvs, facing); }
  get triangleCount() { let n = 0; for (const g of this.groups.values()) n += g.p.length / 9; return n; }
  finish() {
    const recs = [...this.groups.keys()].filter((r) => this.groups.get(r).p.length).sort((a, b) => a - b);
    if (!recs.length) return null;
    let nv = 0;
    for (const r of recs) nv += this.groups.get(r).p.length / 3;
    const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
    const indices = new Uint32Array(nv);
    const subMeshes = [], slots = [];
    let v = 0;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const r of recs) {
      const g = this.groups.get(r);
      const start = v;
      positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2);
      for (let i = 0; i < g.p.length / 3; i++) indices[v + i] = v + i;
      for (let i = 0; i < g.p.length; i += 3) for (let k = 0; k < 3; k++) { const x = g.p[i + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
      v += g.p.length / 3;
      subMeshes.push({ startIndex: start, primitiveCount: (v - start) / 3 });
      slots.push({ archive: this.archive, record: r });
    }
    return {
      vertexCount: nv, positions, normals, uvs, indices, subMeshes, slots, blendIndices: null, bindPoses: null,
      aabb: { center: [0, 1, 2].map((k) => (min[k] + max[k]) / 2), extent: [0, 1, 2].map((k) => (max[k] - min[k]) / 2) },
    };
  }
}

// Welds corners that match to 0.1 mm so meeting triangles share them. Welding closes no gaps, so an open drawing
// gives an open collider.
export function colliderOf(geometry) {
  if (!geometry) return null;
  const key = new Map(), pos = [], idx = [];
  const p = geometry.positions;
  for (let i = 0; i < geometry.indices.length; i++) {
    const v = geometry.indices[i];
    const k = `${p[v * 3].toFixed(4)},${p[v * 3 + 1].toFixed(4)},${p[v * 3 + 2].toFixed(4)}`;
    let at = key.get(k);
    if (at === undefined) { at = pos.length / 3; key.set(k, at); pos.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]); }
    idx.push(at);
  }
  const positions = Float32Array.from(pos), indices = Uint32Array.from(idx);
  return { vertexCount: positions.length / 3, positions, normals: new Float32Array(positions.length), uvs: new Float32Array((positions.length / 3) * 2), indices, subMeshes: [{ startIndex: 0, primitiveCount: indices.length / 3 }], blendIndices: null, bindPoses: null, aabb: geometry.aabb };
}

export function planarUv(p, n, tile) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  let u, v;
  if (ay >= ax && ay >= az) { u = p[2]; v = p[0]; }
  else if (ax >= az) { u = n[0] >= 0 ? p[2] : -p[2]; v = p[1]; }
  else { u = n[2] >= 0 ? -p[0] : p[0]; v = p[1]; }
  return [tile[0] ? u / tile[0] : u, tile[1] ? v / tile[1] : v];
}

export function box(bench, rec, c, h, { axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], tile = [1, 1], skip = [], uvFace = null } = {}) {
  const [X, Y, Z] = axes;
  const pt = (sx, sy, sz) => add(add(add(c, scl(X, sx * h[0])), scl(Y, sy * h[1])), scl(Z, sz * h[2]));
  const faces = [
    [X, [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [scl(X, -1), [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [Y, [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [scl(Y, -1), [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [Z, [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]], [scl(Z, -1), [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
  ];
  faces.forEach(([n, cs], fi) => {
    if (skip.includes(fi)) return;
    const pts = cs.map((s) => pt(...s));
    const uvs = uvFace ? cs.map((_, k) => uvFace(fi, k)) : pts.map((p) => planarUv(p, n, tile));
    bench.quad(rec, pts[0], pts[1], pts[2], pts[3], uvs, n);
  });
}

export function prism(bench, rec, p0, p1, r0, r1, sides, { capRec = rec, caps = [true, true], smooth = false, uRound = 1, tileV = 1, twist = 0, ref = null } = {}) {
  const axis = sub(p1, p0);
  const L = len(axis);
  if (!(L > 1e-9)) return;
  const w = scl(axis, 1 / L);
  const [e1, e2] = ref ? (() => { const a = norm(sub(ref, scl(w, dot(ref, w)))); return [a, cross(w, a)]; })() : basisOf(w);
  const ringAt = (p, r, k) => { const a = twist + (k / sides) * Math.PI * 2; return add(p, add(scl(e1, Math.cos(a) * r), scl(e2, Math.sin(a) * r))); };
  const dirAt = (k) => { const a = twist + (k / sides) * Math.PI * 2; return add(scl(e1, Math.cos(a)), scl(e2, Math.sin(a))); };
  for (let k = 0; k < sides; k++) {
    const a0 = ringAt(p0, r0, k), a1 = ringAt(p0, r0, k + 1), b0 = ringAt(p1, r1, k), b1 = ringAt(p1, r1, k + 1);
    const mid = norm(add(dirAt(k), dirAt(k + 1)));
    const u0 = (k / sides) * uRound, u1 = ((k + 1) / sides) * uRound, v1 = L / tileV;
    if (smooth) {
      const n0 = dirAt(k), n1 = dirAt(k + 1);
      bench.tri(rec, a0, a1, b1, [u0, 0], [u1, 0], [u1, v1], mid, [n0, n1, n1]);
      bench.tri(rec, a0, b1, b0, [u0, 0], [u1, v1], [u0, v1], mid, [n0, n1, n0]);
    } else bench.quad(rec, a0, a1, b1, b0, [[u0, 0], [u1, 0], [u1, v1], [u0, v1]], mid);
  }
  const cap = (p, r, n) => {
    const pts = [], uvs = [];
    for (let k = 0; k < sides; k++) { pts.push(ringAt(p, r, k)); const a = (k / sides) * Math.PI * 2; uvs.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]); }
    bench.poly(capRec, pts, uvs, n);
  };
  if (caps[0] && r0 > 0) cap(p0, r0, scl(w, -1));
  if (caps[1] && r1 > 0) cap(p1, r1, w);
}

export function rope(bench, rec, points, r, { sides = 4, tileV = 0.5 } = {}) {
  let along = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const L = len(sub(b, a));
    const before = bench.group(rec).uv.length;
    prism(bench, rec, a, b, r, r, sides, { caps: [false, false], smooth: true, tileV });
    const uv = bench.group(rec).uv;
    for (let k = before + 1; k < uv.length; k += 2) uv[k] += along / tileV;
    along += L;
  }
}

export function sagging(a, b, sag, n = 6) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = lerp3(a, b, t);
    p[1] -= sag * 4 * t * (1 - t);
    out.push(p);
  }
  return out;
}
