// @ts-check

import { frustumPlanes } from './frustum.js';

export const ZERO_ORIGIN = Object.freeze([0, 0, 0]);

export function spherePlanes(m, out = new Float32Array(24)) {
  frustumPlanes(m, out);
  for (let k = 0; k < 6; k++) {
    const l = Math.hypot(out[k * 4], out[k * 4 + 1], out[k * 4 + 2]) || 1;
    out[k * 4] /= l; out[k * 4 + 1] /= l; out[k * 4 + 2] /= l; out[k * 4 + 3] /= l;
  }
  return out;
}

export function sphereInPlanes(planes, x, y, z, r) {
  for (let k = 0; k < 6; k++) {
    if (planes[k * 4] * x + planes[k * 4 + 1] * y + planes[k * 4 + 2] * z + planes[k * 4 + 3] < -r) return false;
  }
  return true;
}

export function boundsOf(positions, indices = null, start = 0, count = -1, stride = 3) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const n = indices ? (count < 0 ? indices.length - start : count) : Math.floor(positions.length / stride);
  const at = (k) => (indices ? indices[start + k] : k) * stride;
  for (let k = 0; k < n; k++) {
    const o = at(k), x = positions[o], y = positions[o + 1], z = positions[o + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const out = new Float32Array(4);
  if (n === 0) return out;
  out[0] = (minX + maxX) / 2; out[1] = (minY + maxY) / 2; out[2] = (minZ + maxZ) / 2;
  let r2 = 0;
  for (let k = 0; k < n; k++) {
    const o = at(k), dx = positions[o] - out[0], dy = positions[o + 1] - out[1], dz = positions[o + 2] - out[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) r2 = d2;
  }
  out[3] = Math.sqrt(r2);
  return out;
}

export const BOUNDS_RANGE = 8192;

export function* boundsSteps(positions, range = BOUNDS_RANGE) {
  const n = Math.floor(positions.length / 3);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let k0 = 0; k0 < n; k0 += range) {
    for (let o = k0 * 3, end = Math.min(n, k0 + range) * 3; o < end; o += 3) {
      const x = positions[o], y = positions[o + 1], z = positions[o + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    yield;
  }
  const sphere = new Float32Array(4);
  if (n === 0) return sphere;
  sphere[0] = (minX + maxX) / 2; sphere[1] = (minY + maxY) / 2; sphere[2] = (minZ + maxZ) / 2;
  let reach2 = 0;
  for (let k0 = 0; k0 < n; k0 += range) {
    for (let o = k0 * 3, end = Math.min(n, k0 + range) * 3; o < end; o += 3) {
      const dx = positions[o] - sphere[0], dy = positions[o + 1] - sphere[1], dz = positions[o + 2] - sphere[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > reach2) reach2 = d2;
    }
    yield;
  }
  sphere[3] = Math.sqrt(reach2);
  return sphere;
}

export function transformSphere(m, s, out, o = 0) {
  return transformSphereScaled(m, s, matrixScale(m), out, o);
}
export function matrixScale(m) {
  return Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
}
export function transformSphereScaled(m, s, sc, out, o = 0) {
  const x = s[0], y = s[1], z = s[2];
  out[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  out[o + 3] = s[3] * sc;
  return out;
}


export function recordVisible(planes, r) {
  return !r.bounded || sphereInPlanes(planes, r.sphere[0], r.sphere[1], r.sphere[2], r.sphere[3]);
}
export function subMeshVisible(planes, r, i) {
  if (!r.bounded) return true;
  const o = i * 4, rad = r.subSpheres[o + 3];
  return rad < 0 || sphereInPlanes(planes, r.subSpheres[o], r.subSpheres[o + 1], r.subSpheres[o + 2], rad);
}
// The sphere is lifted half a height because the billboard shader is bottom-anchored.
/**
 * @param {{ bounds?: ArrayLike<number>|null, origin?: ArrayLike<number>|null, size?: { w?: number, h: number }|null }} b
 * @param {Float64Array|Float32Array|number[]} out
 */
export function batchSphere(b, out) {
  const s = b.bounds;
  if (!s) return null;
  const o = b.origin;
  out[0] = s[0] + (o ? o[0] : 0);
  out[1] = s[1] + (o ? o[1] : 0) + batchLift(b);
  out[2] = s[2] + (o ? o[2] : 0);
  out[3] = batchReach(b) + (b.size?.h ?? 0) * _flatLean;
  return out;
}

// The radius grows to the half-diagonal of the current size, because producers rewrite size without new bounds.
/** @param {{ bounds?: ArrayLike<number>|null, size?: { w?: number, h: number }|null }} b */
export function batchReach(b) {
  const r = b.bounds[3], z = b.size;
  if (!z) return r;
  const q = (z.w * z.w + z.h * z.h) * 0.25;
  return q > r * r * (1 + 1e-6) ? Math.sqrt(q) : r;
}

let _flatLean = 0;
export function setFlatLean(sinLean) { _flatLean = Number.isFinite(sinLean) && sinLean > 0 ? Math.min(1, sinLean) : 0; }
/** @param {{ size?: { h: number }|null }} b */
export function batchLift(b) {
  return (b.size?.h ?? 0) * 0.5;
}
export function quadHalfDiagonal(size) {
  return Math.hypot(size.w, size.h) * 0.5;
}
const _batchSphere = new Float64Array(4);
export function batchVisible(planes, b) {
  const c = batchSphere(b, _batchSphere);
  return !c || sphereInPlanes(planes, c[0], c[1], c[2], c[3]);
}

// A static batch of many flats is culled by its placements, because one sphere spans its whole pixel.
export const PLACEMENT_GRID = 4;
export const PLACEMENT_ONE_CELL = 16;
export function placementGrid(centers) {
  const n = centers.length;
  const G = n > PLACEMENT_ONE_CELL ? PLACEMENT_GRID : 1;
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = centers[i]; pts[i * 3] = c[0]; pts[i * 3 + 1] = c[1]; pts[i * 3 + 2] = c[2]; }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n * 3; i += 3) {
    const x = pts[i], z = pts[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const sx = (x1 - x0) / G || 1, sz = (z1 - z0) / G || 1;
  const cell = new Int32Array(n), start = new Uint32Array(G * G + 1);
  for (let i = 0; i < n; i++) {
    const gx = Math.min(G - 1, Math.floor((pts[i * 3] - x0) / sx)), gz = Math.min(G - 1, Math.floor((pts[i * 3 + 2] - z0) / sz));
    cell[i] = gx * G + gz; start[cell[i] + 1]++;
  }
  for (let k = 0; k < G * G; k++) start[k + 1] += start[k];
  const fill = start.slice(0, G * G), byCell = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const o = fill[cell[i]]++ * 3; byCell[o] = pts[i * 3]; byCell[o + 1] = pts[i * 3 + 1]; byCell[o + 2] = pts[i * 3 + 2]; }
  const cs = new Float32Array(G * G * 4);
  for (let k = 0; k < G * G; k++) {
    const a = start[k] * 3, e = start[k + 1] * 3;
    if (a === e) { cs[k * 4 + 3] = -1; continue; }
    let lx = Infinity, ly = Infinity, lz = Infinity, hx = -Infinity, hy = -Infinity, hz = -Infinity;
    for (let i = a; i < e; i += 3) {
      if (byCell[i] < lx) lx = byCell[i]; if (byCell[i] > hx) hx = byCell[i];
      if (byCell[i + 1] < ly) ly = byCell[i + 1]; if (byCell[i + 1] > hy) hy = byCell[i + 1];
      if (byCell[i + 2] < lz) lz = byCell[i + 2]; if (byCell[i + 2] > hz) hz = byCell[i + 2];
    }
    const cx = (lx + hx) / 2, cy = (ly + hy) / 2, cz = (lz + hz) / 2;
    let r2 = 0;
    for (let i = a; i < e; i += 3) { const dx = byCell[i] - cx, dy = byCell[i + 1] - cy, dz = byCell[i + 2] - cz; if (dx * dx + dy * dy + dz * dz > r2) r2 = dx * dx + dy * dy + dz * dz; }
    cs[k * 4] = cx; cs[k * 4 + 1] = cy; cs[k * 4 + 2] = cz; cs[k * 4 + 3] = Math.sqrt(r2) * (1 + 1e-6) + 1e-4;
  }
  return { G, x0, z0, x1, z1, sx, sz, start, pts: byCell, cs, hw: NaN, hh: NaN, half: 0, vol: null };
}
// A hair wide, so the float32 position the GPU uses for a corner never lands outside this double bound.
export function placementRadius(half, lean) {
  return (half + lean) * (1 + 1e-5) + 1e-3;
}
export function placedHalfDiagonal(b) {
  const q = b._place, s = b.size;
  if (q.hw !== s.w || q.hh !== s.h) { q.hw = s.w; q.hh = s.h; q.half = quadHalfDiagonal(s); }
  return q.half;
}
const _cells = new Int32Array(4);
function cellRange(q, x0, z0, x1, z1) {
  if (x1 < q.x0 || x0 > q.x1 || z1 < q.z0 || z0 > q.z1) return false;
  const top = q.G - 1;
  _cells[0] = Math.max(0, Math.min(top, Math.floor((x0 - q.x0) / q.sx)));
  _cells[1] = Math.max(0, Math.min(top, Math.floor((x1 - q.x0) / q.sx)));
  _cells[2] = Math.max(0, Math.min(top, Math.floor((z0 - q.z0) / q.sz)));
  _cells[3] = Math.max(0, Math.min(top, Math.floor((z1 - q.z0) / q.sz)));
  return true;
}
const _cubeArgs = new Float64Array(5);
// This tests the cube, not the far sphere, because a face still draws the corners of the cube.
export function placementsInCube(b, rad, px, py, pz, far) {
  const c = _cubeArgs;
  c[0] = rad; c[1] = px; c[2] = py; c[3] = pz; c[4] = far;
  return placementsInCubeOf(b, c);
}
export function placementsInCubeOf(b, c) {
  const rad = c[0], px = c[1], py = c[2], pz = c[3], far = c[4];
  const q = b._place, o = b.origin || ZERO_ORIGIN, R = far + rad;
  const lx = px - o[0], ly = py - o[1] - batchLift(b), lz = pz - o[2];
  if (!cellRange(q, lx - R, lz - R, lx + R, lz + R)) return false;
  const G = q.G, cs = q.cs, st = q.start, p = q.pts;
  for (let gx = _cells[0], gx1 = _cells[1]; gx <= gx1; gx++) {
    for (let k = gx * G + _cells[2], ke = gx * G + _cells[3]; k <= ke; k++) {
      const cr = cs[k * 4 + 3];
      if (cr < 0) continue;
      const rr = R + cr;
      if (Math.abs(cs[k * 4] - lx) > rr || Math.abs(cs[k * 4 + 1] - ly) > rr || Math.abs(cs[k * 4 + 2] - lz) > rr) continue;
      for (let i = st[k] * 3, e = st[k + 1] * 3; i < e; i += 3) {
        if (Math.abs(p[i] - lx) <= R && Math.abs(p[i + 1] - ly) <= R && Math.abs(p[i + 2] - lz) <= R) return true;
      }
    }
  }
  return false;
}
export function placementsInVolume(b, rad, planes) {
  const q = b._place, o = b.origin || ZERO_ORIGIN;
  const ox = o[0], oy = o[1] + batchLift(b), oz = o[2];
  const cs = q.cs, st = q.start, p = q.pts;
  for (let k = 0, n = q.G * q.G; k < n; k++) {
    const cr = cs[k * 4 + 3];
    if (cr < 0 || !sphereInPlanes(planes, cs[k * 4] + ox, cs[k * 4 + 1] + oy, cs[k * 4 + 2] + oz, cr + rad)) continue;
    for (let i = st[k] * 3, e = st[k + 1] * 3; i < e; i += 3) {
      if (sphereInPlanes(planes, p[i] + ox, p[i + 1] + oy, p[i + 2] + oz, rad)) return true;
    }
  }
  return false;
}

export const VOLUME_TABLE_MAX = 512;
export const VOLUME_MEMO_MAX = 128;
let _volNamed = new Map(), _volNamedCount = 0, _volNext = 1;
const _volSeen = new Set();
const _volBits = new WeakMap();
// Each step folds the hash down: imul carries a difference only upward, so sign-only differences would cancel.
export function volumeHash(u) {
  let h = 2166136261;
  for (let i = 0; i < 24; i++) { h = Math.imul(h ^ u[i], 16777619); h ^= h >>> 15; }
  return h;
}
/** @param {ArrayLike<number>} planes */
export function volumeName(planes) {
  if (!(planes instanceof Float32Array) || planes.length !== 24) return 0;
  let u = _volBits.get(planes);
  if (u === undefined) { u = new Uint32Array(planes.buffer, planes.byteOffset, 24); _volBits.set(planes, u); }
  const h = volumeHash(u);
  const list = _volNamed.get(h);
  if (list !== undefined) {
    find: for (let j = 0; j < list.length; j++) {
      const e = list[j];
      for (let i = 0; i < 24; i++) if (e.bits[i] !== u[i]) continue find;
      return e.id;
    }
  }
  if (!_volSeen.has(h)) {
    if (_volSeen.size >= VOLUME_TABLE_MAX) _volSeen.clear();
    _volSeen.add(h);
    return 0;
  }
  _volSeen.delete(h);
  if (_volNamedCount >= VOLUME_TABLE_MAX) { _volNamed = new Map(); _volNamedCount = 0; }
  const e = { bits: Uint32Array.from(u), id: _volNext++ };
  const into = _volNamed.get(h);
  if (into !== undefined) into.push(e); else _volNamed.set(h, [e]);
  _volNamedCount++;
  return e.id;
}
export function placementsInVolumeOf(b, rad, planes, name) {
  if (name === 0) return placementsInVolume(b, rad, planes);
  const q = b._place, o = b.origin || ZERO_ORIGIN, h = b.size?.h ?? 0;
  let m = q.vol;
  if (m === null || m === undefined) m = q.vol = new Map();
  const e = m.get(name);
  if (e !== undefined && e.rad === rad && e.ox === o[0] && e.oy === o[1] && e.oz === o[2] && e.h === h) return e.ans;
  const ans = placementsInVolume(b, rad, planes);
  if (e !== undefined) { e.rad = rad; e.ox = o[0]; e.oy = o[1]; e.oz = o[2]; e.h = h; e.ans = ans; return ans; }
  if (m.size >= VOLUME_MEMO_MAX) m.clear();
  m.set(name, { rad, ox: o[0], oy: o[1], oz: o[2], h, ans });
  return ans;
}
