// Static-world capsule collider: triangle soup in a uniform grid, resolved as a chain of spheres.
import {
  CAPSULE_RADIUS, CAPSULE_HEIGHT, STEP_OFFSET, SLOPE_LIMIT_DEG, RIDE_HEIGHT,
} from './motor.js';

const CELL = 2;
const FINE_CELLS_MAX = 64;
const cellKey = (gx, gz) => (gx + 0x100000) * 0x200000 + (gz + 0x100000);
const SUBSTEPS_MAX = 256;
const SUBSTEP_LEN = CAPSULE_RADIUS * 0.75;
export const EXACT_SWEEP_MAX = SUBSTEPS_MAX * SUBSTEP_LEN;
const GROUND_NY = Math.cos((SLOPE_LIMIT_DEG * Math.PI) / 180);
export const SIDE_CONTACT = 1e-4;
const TAN_SLOPE_LIMIT = Math.tan((SLOPE_LIMIT_DEG * Math.PI) / 180);
export const SKIN = 0.02;

const BOX_SKIN = 1e-3;
/** @returns {boolean} */
export function sphereTouchesBox(lx, ly, lz, r, min, max) {
  return lx + r >= min[0] - BOX_SKIN && lx - r <= max[0] + BOX_SKIN
    && ly + r >= min[1] - BOX_SKIN && ly - r <= max[1] + BOX_SKIN
    && lz + r >= min[2] - BOX_SKIN && lz - r <= max[2] + BOX_SKIN;
}
const VISITED = new Set();
let RAY_STAMP = 0;
let MARK_EPOCH = 0;
const CAP_SPOKES = [0, 0, 1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1];
const CAP_ORIGIN = [0, 0, 0];
const CAP_HIT = { dist: Infinity, key: null, normal: [0, 0, 0], back: false };
const CAST_NEAR = [];
const CAST_SLACK = 1e-2;
function rayMarks(bucket) {
  let m = bucket.rayMark;
  if (!m || m.length < bucket.tris.length) {
    m = new Int32Array(Math.max(bucket.tris.length, m ? m.length * 2 : 0));
    bucket.rayMark = m;
    bucket.markEpoch = MARK_EPOCH;
  }
  if (++RAY_STAMP >= 0x7fffffff) { RAY_STAMP = 1; MARK_EPOCH++; }
  if (bucket.markEpoch !== MARK_EPOCH) { m.fill(0); bucket.markEpoch = MARK_EPOCH; }
  return m;
}
export function _setRayStampForTest(n) { RAY_STAMP = n; }
let FIXED_POINT_STOP = true;
export function _setFixedPointStopForTest(on) { FIXED_POINT_STOP = !!on; }
const RAY_Y_SLACK = 1e-3;
const SPHERE_Y_SLACK = 1e-3;

const BROAD_CELL = 8;
const BROAD_SPAN_MAX = 64;
const BROAD_QUERY_MAX = 256;
const BROAD_PAD = 1;
const BROAD_COARSE_CELL = 256;
const BROAD_COARSE_SPAN_MAX = 64;
let BROAD_STAMP = 0;
const FRAME_OF = new WeakMap();
export function onFloatingFrame(frame, translation) {
  if (typeof translation === 'function') FRAME_OF.set(translation, frame);
  return translation;
}
const RAY_NEAR = [];
const NEAR_MEMO = 8;
const SPHERE_NEAR = [];
const FILED_NONE = 0, FILED_FINE = 1, FILED_COARSE = 2, FILED_ALWAYS = 3, FILED_POSED = 4, FILED_REPOSED = 5;
function fileBox(bucket, ox, oz, size, spanMax, into, lvl) {
  if (bucket.lvl > lvl) return false;
  const mn = bucket.min, mx = bucket.max;
  const x0 = Math.floor((mn[0] + ox - BOX_SKIN) / size), x1 = Math.floor((mx[0] + ox + BOX_SKIN) / size);
  const z0 = Math.floor((mn[2] + oz - BOX_SKIN) / size), z1 = Math.floor((mx[2] + oz + BOX_SKIN) / size);
  if (!((x1 - x0 + 1) * (z1 - z0 + 1) <= spanMax)) return false;
  const was = bucket.lvl === lvl;
  for (let i = 0, nx = x1 - x0; i <= nx; i++) {
    const gx = x0 + i;
    for (let j = 0, nz = z1 - z0; j <= nz; j++) {
      const gz = z0 + j;
      if (was && gx >= bucket.bx0 && gx <= bucket.bx1 && gz >= bucket.bz0 && gz <= bucket.bz1) continue;
      const k = cellKey(gx, gz);
      let list = into.get(k);
      if (!list) { list = []; into.set(k, list); }
      list.push(bucket);
    }
  }
  bucket.lvl = lvl; bucket.bx0 = x0; bucket.bx1 = x1; bucket.bz0 = z0; bucket.bz1 = z1;
  return true;
}
function fileBucket(broad, bucket) {
  if (bucket.reposed) { fileReposed(broad, bucket); return; }
  let ox = 0, oz = 0;
  if (bucket.moves) {
    if (bucket.posed) { filePosed(broad, bucket); return; }
    if (bucket.frame === null || bucket.r) { fileAlways(broad, bucket); return; }
    const t = bucket.t();
    if (!(Number.isFinite(t[0]) && Number.isFinite(t[1]) && Number.isFinite(t[2]))) { fileAlways(broad, bucket); return; }
    ox = t[0]; oz = t[2];
    if (!broad.frames.some((f) => f.frame === bucket.frame)) broad.frames.push({ frame: bucket.frame, bucket, x: t[0], z: t[2] });
  }
  const mn = bucket.min, mx = bucket.max;
  if (!(mn[0] <= mx[0] && mn[1] <= mx[1] && mn[2] <= mx[2])) return;
  if (fileBox(bucket, ox, oz, BROAD_CELL, BROAD_SPAN_MAX, broad.cells, FILED_FINE)) return;
  if (fileBox(bucket, ox, oz, BROAD_COARSE_CELL, BROAD_COARSE_SPAN_MAX, broad.coarseCells, FILED_COARSE)) return;
  fileAlways(broad, bucket);
}
function fileAlways(broad, bucket) {
  if (bucket.lvl === FILED_ALWAYS) return;
  const a = broad.always;
  let at = a.length;
  while (at > 0 && a[at - 1].ord > bucket.ord) at--;
  a.splice(at, 0, bucket);
  bucket.lvl = FILED_ALWAYS;
}
function filePosed(broad, bucket) {
  broad.poseSeen = -1;
  if (bucket.lvl === FILED_POSED) return;
  const a = broad.posed;
  let at = a.length;
  while (at > 0 && a[at - 1].ord > bucket.ord) at--;
  a.splice(at, 0, bucket);
  bucket.lvl = FILED_POSED;
}
function fileReposed(broad, bucket) {
  reposedCells(bucket);
  if (bucket.lvl === FILED_REPOSED) return;
  const a = broad.reposed;
  let at = a.length;
  while (at > 0 && a[at - 1].ord > bucket.ord) at--;
  a.splice(at, 0, bucket);
  bucket.lvl = FILED_REPOSED;
}
function reposedCells(b) {
  const mn = b.min, mx = b.max;
  b.rnone = !(mn[0] <= mx[0] && mn[1] <= mx[1] && mn[2] <= mx[2]);
  b.bx0 = Math.floor((mn[0] - BOX_SKIN) / BROAD_CELL); b.bx1 = Math.floor((mx[0] + BOX_SKIN) / BROAD_CELL);
  b.bz0 = Math.floor((mn[2] - BOX_SKIN) / BROAD_CELL); b.bz1 = Math.floor((mx[2] + BOX_SKIN) / BROAD_CELL);
  b.rwide = !((b.bx1 - b.bx0 + 1) * (b.bz1 - b.bz0 + 1) <= BROAD_SPAN_MAX);
}
const reposedReaches = (b, cx0, cx1, cz0, cz1) => !b.rnone && (b.rwide || (b.bx1 >= cx0 && b.bx0 <= cx1 && b.bz1 >= cz0 && b.bz0 <= cz1));
function buildBroad(buckets) {
  const broad = { all: [], always: [], cells: new Map(), coarseCells: new Map(), frames: [], posed: [], poseSeen: -1, poseUnion: new Float64Array(4), reposed: [] };
  for (const bucket of buckets.values()) {
    bucket.ord = broad.all.length;
    broad.all.push(bucket);
    bucket.lvl = FILED_NONE;
    fileBucket(broad, bucket);
  }
  return broad;
}
function framesMoved(broad) {
  const fr = broad.frames;
  for (let i = 0; i < fr.length; i++) {
    const f = fr[i], t = f.bucket.t();
    if (t[0] !== f.x || t[2] !== f.z) return true;
  }
  return false;
}

const WIDE_LEAF = 4;
const WIDE_BINS = 16;
const WIDE_MARGIN = CELL;
function wideBox(tri) {
  const a = tri[0], b = tri[1], c = tri[2];
  tri[3] = [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]), Math.min(a[2], b[2], c[2])];
  tri[4] = [Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]), Math.max(a[2], b[2], c[2])];
  return Number.isFinite(tri[3][0] + tri[3][1] + tri[3][2] + tri[4][0] + tri[4][1] + tri[4][2]);
}
function wideTree(bucket) {
  const n = bucket.wide.length;
  if (bucket.wideTree && bucket.wideTree.n === n) return bucket.wideTree;
  const tris = bucket.tris, order = Int32Array.from(bucket.wide);
  const tb = new Float64Array(n * 6), cen = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) {
    const t = tris[order[k]], mn = t[3], mx = t[4];
    for (let q = 0; q < 3; q++) { tb[k * 6 + q] = mn[q]; tb[k * 6 + 3 + q] = mx[q]; cen[k * 3 + q] = (mn[q] + mx[q]) / 2; }
  }
  const swap = (i, j) => {
    const t = order[i]; order[i] = order[j]; order[j] = t;
    for (let q = 0; q < 6; q++) { const v = tb[i * 6 + q]; tb[i * 6 + q] = tb[j * 6 + q]; tb[j * 6 + q] = v; }
    for (let q = 0; q < 3; q++) { const v = cen[i * 3 + q]; cen[i * 3 + q] = cen[j * 3 + q]; cen[j * 3 + q] = v; }
  };
  const cap = Math.max(1, 2 * n);
  const box = new Float64Array(cap * 6), left = new Int32Array(cap), start = new Int32Array(cap), count = new Int32Array(cap);
  const binN = new Int32Array(WIDE_BINS), binB = new Float64Array(WIDE_BINS * 6), rightA = new Float64Array(WIDE_BINS);
  const area = (B, o) => { const dx = B[o + 3] - B[o], dy = B[o + 4] - B[o + 1], dz = B[o + 5] - B[o + 2]; return dx * dy + dy * dz + dz * dx; };
  let nodes = 1;
  const stack = [0, n, 0];
  while (stack.length) {
    const node = stack.pop(), hi = stack.pop(), lo = stack.pop();
    const o = node * 6;
    box[o] = box[o + 1] = box[o + 2] = Infinity; box[o + 3] = box[o + 4] = box[o + 5] = -Infinity;
    const c0 = [Infinity, Infinity, Infinity], c1 = [-Infinity, -Infinity, -Infinity];
    for (let k = lo; k < hi; k++) {
      for (let q = 0; q < 3; q++) {
        if (tb[k * 6 + q] < box[o + q]) box[o + q] = tb[k * 6 + q];
        if (tb[k * 6 + 3 + q] > box[o + 3 + q]) box[o + 3 + q] = tb[k * 6 + 3 + q];
        const c = cen[k * 3 + q];
        if (c < c0[q]) c0[q] = c;
        if (c > c1[q]) c1[q] = c;
      }
    }
    if (hi - lo <= WIDE_LEAF) { left[node] = -1; start[node] = lo; count[node] = hi - lo; continue; }
    let bestCost = Infinity, bestAx = -1, bestBin = 0;
    for (let ax = 0; ax < 3; ax++) {
      const ext = c1[ax] - c0[ax];
      if (!(ext > 0)) continue;
      binN.fill(0);
      for (let i = 0; i < WIDE_BINS; i++) { binB[i * 6] = binB[i * 6 + 1] = binB[i * 6 + 2] = Infinity; binB[i * 6 + 3] = binB[i * 6 + 4] = binB[i * 6 + 5] = -Infinity; }
      for (let k = lo; k < hi; k++) {
        const bi = Math.min(WIDE_BINS - 1, Math.floor(((cen[k * 3 + ax] - c0[ax]) / ext) * WIDE_BINS));
        binN[bi]++;
        for (let q = 0; q < 3; q++) {
          if (tb[k * 6 + q] < binB[bi * 6 + q]) binB[bi * 6 + q] = tb[k * 6 + q];
          if (tb[k * 6 + 3 + q] > binB[bi * 6 + 3 + q]) binB[bi * 6 + 3 + q] = tb[k * 6 + 3 + q];
        }
      }
      const acc = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      const grow = (i) => { for (let q = 0; q < 3; q++) { if (binB[i * 6 + q] < acc[q]) acc[q] = binB[i * 6 + q]; if (binB[i * 6 + 3 + q] > acc[q + 3]) acc[q + 3] = binB[i * 6 + 3 + q]; } };
      let nr = 0;
      for (let i = WIDE_BINS - 1; i >= 1; i--) { if (binN[i]) grow(i); nr += binN[i]; rightA[i] = nr ? area(acc, 0) * nr : 0; }
      acc[0] = acc[1] = acc[2] = Infinity; acc[3] = acc[4] = acc[5] = -Infinity;
      let nl = 0;
      for (let i = 0; i < WIDE_BINS - 1; i++) {
        if (binN[i]) grow(i);
        nl += binN[i];
        if (!nl || nl === hi - lo) continue;
        const cost = area(acc, 0) * nl + rightA[i + 1];
        if (cost < bestCost) { bestCost = cost; bestAx = ax; bestBin = i; }
      }
    }
    let mid;
    if (bestAx < 0) mid = (lo + hi) >> 1;
    else {
      const ext = c1[bestAx] - c0[bestAx];
      let i = lo, j = hi - 1;
      while (i <= j) {
        const bi = Math.min(WIDE_BINS - 1, Math.floor(((cen[i * 3 + bestAx] - c0[bestAx]) / ext) * WIDE_BINS));
        if (bi <= bestBin) i++;
        else { swap(i, j); j--; }
      }
      mid = i;
      if (mid === lo || mid === hi) mid = (lo + hi) >> 1;
    }
    const l = nodes;
    nodes += 2;
    left[node] = l;
    stack.push(lo, mid, l, mid, hi, l + 1);
  }
  bucket.wideTree = { n, order, box, left, start, count };
  return bucket.wideTree;
}
const WIDE_STACK = new Int32Array(128);
const WIDE_NEAR = [];
function wideNear(bucket, lx, ly, lz, r) {
  WIDE_NEAR.length = 0;
  const T = wideTree(bucket), box = T.box;
  let sp = 0;
  WIDE_STACK[sp++] = 0;
  while (sp) {
    const node = WIDE_STACK[--sp], o = node * 6;
    if (lx + r < box[o] - BOX_SKIN || lx - r > box[o + 3] + BOX_SKIN || ly + r < box[o + 1] - BOX_SKIN || ly - r > box[o + 4] + BOX_SKIN
      || lz + r < box[o + 2] - BOX_SKIN || lz - r > box[o + 5] + BOX_SKIN) continue;
    const l = T.left[node];
    if (l < 0) { for (let k = T.start[node], e = k + T.count[node]; k < e; k++) WIDE_NEAR.push(T.order[k]); continue; }
    WIDE_STACK[sp++] = l; WIDE_STACK[sp++] = l + 1;
  }
  return WIDE_NEAR;
}
function wideOnRay(bucket, ox, oy, oz, dir, reach) {
  const out = [];
  const T = wideTree(bucket), box = T.box;
  let sp = 0;
  WIDE_STACK[sp++] = 0;
  while (sp) {
    const node = WIDE_STACK[--sp], o = node * 6;
    let tMin = 0, tMax = reach, miss = false;
    for (let k = 0; k < 3 && !miss; k++) {
      const lo = box[o + k] - BOX_SKIN, hi = box[o + 3 + k] + BOX_SKIN, d = dir[k], ok = k === 0 ? ox : k === 1 ? oy : oz;
      if (d === 0) { if (ok < lo || ok > hi) miss = true; continue; }
      let t0 = (lo - ok) / d, t1 = (hi - ok) / d;
      if (t0 > t1) { const tt = t0; t0 = t1; t1 = tt; }
      if (t0 > tMin) tMin = t0;
      if (t1 < tMax) tMax = t1;
      if (tMin > tMax) miss = true;
    }
    if (miss) continue;
    const l = T.left[node];
    if (l < 0) { for (let k = T.start[node], e = k + T.count[node]; k < e; k++) out.push(T.order[k]); continue; }
    WIDE_STACK[sp++] = l; WIDE_STACK[sp++] = l + 1;
  }
  return out;
}
export function wideCandidates(collider, key, p, r) {
  const bucket = collider._buckets.get(key);
  if (!bucket || !bucket.wide.length) return 0;
  const t = bucket.t();
  return wideNear(bucket, p[0] - t[0], p[1] - t[1], p[2] - t[2], r).length;
}
export function wideRayCandidates(collider, key, p, dir, reach) {
  const bucket = collider._buckets.get(key);
  if (!bucket || !bucket.wide.length) return 0;
  const t = bucket.t();
  return wideOnRay(bucket, p[0] - t[0], p[1] - t[1], p[2] - t[2], dir, reach).length;
}
const triNear = (tri, lx, ly, lz, r) => tri[3] === undefined || sphereTouchesBox(lx, ly, lz, r, tri[3], tri[4]);

const NEAR = [];
function nearCells(bucket, lx, ly, lz, r) {
  NEAR.length = 0;
  const gx = Math.floor(lx / CELL);
  const gz = Math.floor(lz / CELL);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const cell = bucket.grid.get(cellKey(gx + ox, gz + oz));
      if (cell) NEAR.push(cell);
    }
  }
  if (bucket.wide.length) NEAR.push(wideNear(bucket, lx, ly, lz, r + WIDE_MARGIN));
  return NEAR;
}

const RUNS_MAX = 1024;
function cellRun(bucket, lx, lz) {
  const gx = Math.floor(lx / CELL), gz = Math.floor(lz / CELL), k = cellKey(gx, gz);
  let runs = bucket.runs;
  if (runs === null || runs.size >= RUNS_MAX) runs = bucket.runs = new Map();
  let run = runs.get(k);
  if (run !== undefined) return run;
  const marks = rayMarks(bucket), stamp = RAY_STAMP, list = [];
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const cell = bucket.grid.get(cellKey(gx + ox, gz + oz));
      if (!cell) continue;
      for (let ci = 0; ci < cell.length; ci++) {
        const ti = cell[ci];
        if (marks[ti] !== stamp) { marks[ti] = stamp; list.push(ti); }
      }
    }
  }
  const n = list.length, xz = new Float64Array(n * 4), tris = bucket.tris;
  for (let i = 0; i < n; i++) {
    const t = tris[list[i]], a = t[0], b = t[1], c = t[2];
    xz[i * 4] = Math.min(a[0], b[0], c[0]); xz[i * 4 + 1] = Math.max(a[0], b[0], c[0]);
    xz[i * 4 + 2] = Math.min(a[2], b[2], c[2]); xz[i * 4 + 3] = Math.max(a[2], b[2], c[2]);
  }
  run = { idx: Int32Array.from(list), xz };
  runs.set(k, run);
  return run;
}
const NO_WIDE = new Int32Array(0);
const wideRun = (bucket, lx, ly, lz, r) => (bucket.wide.length ? wideNear(bucket, lx, ly, lz, r + WIDE_MARGIN) : NO_WIDE);

const COLUMN_SLACK = 1e-3;
const COLUMN_NEAR = [];
function wideInColumn(bucket, x0, x1, z0, z1, out) {
  const T = wideTree(bucket), box = T.box;
  let sp = 0;
  WIDE_STACK[sp++] = 0;
  while (sp) {
    const node = WIDE_STACK[--sp], o = node * 6;
    if (x1 < box[o] - BOX_SKIN || x0 > box[o + 3] + BOX_SKIN || z1 < box[o + 2] - BOX_SKIN || z0 > box[o + 5] + BOX_SKIN) continue;
    const l = T.left[node];
    if (l < 0) { for (let k = T.start[node], e = k + T.count[node]; k < e; k++) out.push(T.order[k]); continue; }
    WIDE_STACK[sp++] = l; WIDE_STACK[sp++] = l + 1;
  }
  return out;
}
const COLUMN_WIDE = [];
const COLUMN_SPANS = [];
function columnClear(spans, y, height) {
  const axis = Math.max(0, height - 2 * CAPSULE_RADIUS);
  const lo = y - SKIN - COLUMN_SLACK, hi = y + 2 * CAPSULE_RADIUS + axis + SKIN + COLUMN_SLACK;
  for (let i = 0; i < spans.length; i += 2) if (!(spans[i + 1] < lo || spans[i] > hi)) return false;
  return true;
}

export function segmentHitsBox(ox, oy, oz, dir, min, max, limit) {
  if (!(limit >= 0)) return false;
  let tMin = 0, tMax = limit;
  for (let k = 0; k < 3; k++) {
    const lo = min[k] - BOX_SKIN, hi = max[k] + BOX_SKIN;
    if (!(hi >= lo)) return false;
    const d = dir[k];
    const ok = k === 0 ? ox : k === 1 ? oy : oz;
    if (d === 0) { if (ok < lo || ok > hi) return false; continue; }
    const inv = 1 / d;
    let t1 = (lo - ok) * inv, t2 = (hi - ok) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return false;
  }
  return true;
}

function closestPointOnTriangle(px, py, pz, a, b, c, out) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return; }
  const bpx = px - b[0], bpy = py - b[1], bpz = pz - b[2];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = b[0]; out[1] = b[1]; out[2] = b[2]; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out[0] = a[0] + abx * v; out[1] = a[1] + aby * v; out[2] = a[2] + abz * v;
    return;
  }
  const cpx = px - c[0], cpy = py - c[1], cpz = pz - c[2];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out[0] = a[0] + acx * w; out[1] = a[1] + acy * w; out[2] = a[2] + acz * w;
    return;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    out[0] = b[0] + (c[0] - b[0]) * w;
    out[1] = b[1] + (c[1] - b[1]) * w;
    out[2] = b[2] + (c[2] - b[2]) * w;
    return;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  out[0] = a[0] + abx * v + acx * w;
  out[1] = a[1] + aby * v + acy * w;
  out[2] = a[2] + abz * v + acz * w;
}

function faceNy(tri) {
  const a = tri[0], b = tri[1], c = tri[2];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return l > 0 ? Math.abs(ny) / l : 0;
}

function faceNyTurned(tri, R) {
  const a = tri[0], b = tri[1], c = tri[2];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return l > 0 ? Math.abs(R[1] * nx + R[4] * ny + R[7] * nz) / l : 0;
}

function intoBucket(x, y, z, t, R, out) {
  const px = x - t[0], py = y - t[1], pz = z - t[2];
  if (!R) { out[0] = px; out[1] = py; out[2] = pz; return out; }
  out[0] = R[0] * px + R[1] * py + R[2] * pz;
  out[1] = R[3] * px + R[4] * py + R[5] * pz;
  out[2] = R[6] * px + R[7] * py + R[8] * pz;
  return out;
}
function turnedBox(bucket, t, R, out) {
  for (let i = 0; i < 3; i++) {
    let c = t[i], e = 0;
    for (let j = 0; j < 3; j++) {
      const r = R[j * 3 + i];
      c += r * ((bucket.min[j] + bucket.max[j]) / 2);
      e += Math.abs(r) * ((bucket.max[j] - bucket.min[j]) / 2);
    }
    out[i] = c - e; out[i + 3] = c + e;
  }
  return out;
}
const MOVER_TURN_EPS = 1e-4;
function moverReaches(b, x0, x1, z0, z1) {
  const w = moverBox(b, MOVER_BOX);
  return !(w[1] < x0 || w[0] > x1 || w[3] < z0 || w[2] > z1);
}
function moverBox(b, out) {
  const mn = b.min, mx = b.max;
  const big = Math.max(Math.abs(mn[0]), Math.abs(mn[1]), Math.abs(mn[2]), Math.abs(mx[0]), Math.abs(mx[1]), Math.abs(mx[2]));
  if (!(big < Infinity)) { out[0] = -Infinity; out[1] = Infinity; out[2] = -Infinity; out[3] = Infinity; return out; }
  const e = 2 * (2 * BOX_SKIN + MOVER_TURN_EPS * big);
  const t = b.t();
  const R = b.r ? b.r() : null;
  if (R) {
    const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
    const hx = (mx[0] - mn[0]) / 2, hy = (mx[1] - mn[1]) / 2, hz = (mx[2] - mn[2]) / 2;
    const wx = t[0] + R[0] * cx + R[3] * cy + R[6] * cz, ex = Math.abs(R[0]) * hx + Math.abs(R[3]) * hy + Math.abs(R[6]) * hz + e;
    const wz = t[2] + R[2] * cx + R[5] * cy + R[8] * cz, ez = Math.abs(R[2]) * hx + Math.abs(R[5]) * hy + Math.abs(R[8]) * hz + e;
    out[0] = wx - ex; out[1] = wx + ex; out[2] = wz - ez; out[3] = wz + ez;
  } else {
    out[0] = mn[0] + t[0] - e; out[1] = mx[0] + t[0] + e; out[2] = mn[2] + t[2] - e; out[3] = mx[2] + t[2] + e;
  }
  return out;
}
const MOVER_BOX = new Float64Array(4);
function posedBoxes(broad, seen) {
  const u = broad.poseUnion;
  u[0] = Infinity; u[1] = -Infinity; u[2] = Infinity; u[3] = -Infinity;
  for (const b of broad.posed) {
    const w = moverBox(b, (b.wbox ??= new Float64Array(4)));
    u[0] = Math.min(u[0], w[0]); u[1] = Math.max(u[1], w[1]); u[2] = Math.min(u[2], w[2]); u[3] = Math.max(u[3], w[3]);
  }
  broad.poseSeen = seen;
}
const LOCAL = [0, 0, 0];
const LOCAL_DIR = [0, 0, 0];
const TURNED_BOX = [0, 0, 0, 0, 0, 0];

const GROUND_NORMAL_STEP = 0.5;

export class Collider {
  /**
   * @param {(x:number,z:number)=>number} heightAt
   * @param {((x:number,z:number)=>number)|null} [surfaceAt]
   */
  constructor(heightAt = () => -Infinity, surfaceAt = null) {
    this.heightAt = heightAt;
    this.surfaceAt = typeof surfaceAt === 'function' ? surfaceAt : null;
    this._buckets = new Map();
    this._broad = null;
    /** @type {any} */
    this.cover = null;
    /** @type {any} */
    this.late = null;
    this._poseCount = 0;
    this._walk = 0;
    this._walkRefused = false;
    this._onGround = false;
    this._memo = null;
    this._memoRing = Array.from({ length: NEAR_MEMO }, () => ({ x0: 0, x1: 0, z0: 0, z1: 0, after: 0, list: null }));
    this._memoAt = 0;
    this._reposedKeys = new Set();
  }

  posesMoved() { this._poseCount++; }

  _near(x0, x1, z0, z1, out, afterOrd = -1) {
    const memo = this._memo;
    if (memo === null) return this._gather(x0, x1, z0, z1, out, afterOrd);
    for (let i = 0; i < NEAR_MEMO; i++) {
      const e = memo[i];
      if (e.list !== null && e.x0 === x0 && e.x1 === x1 && e.z0 === z0 && e.z1 === z1 && e.after === afterOrd) return e.list;
    }
    const list = this._gather(x0, x1, z0, z1, out, afterOrd);
    const e = memo[this._memoAt];
    this._memoAt = (this._memoAt + 1) % NEAR_MEMO;
    e.x0 = x0; e.x1 = x1; e.z0 = z0; e.z1 = z1; e.after = afterOrd; e.list = list.slice();
    return list;
  }

  _gather(x0, x1, z0, z1, out, afterOrd) {
    let broad = this._broad;
    if (broad !== null && framesMoved(broad)) broad = null;
    if (broad === null) broad = this._broad = buildBroad(this._buckets);
    out.length = 0;
    const cx0 = Math.floor(x0 / BROAD_CELL), cx1 = Math.floor(x1 / BROAD_CELL);
    const cz0 = Math.floor(z0 / BROAD_CELL), cz1 = Math.floor(z1 / BROAD_CELL);
    if (!((cx1 - cx0 + 1) * (cz1 - cz0 + 1) <= BROAD_QUERY_MAX)) {
      const all = broad.all;
      for (let i = afterOrd + 1; i < all.length; i++) out.push(all[i]);
      return out;
    }
    const stamp = ++BROAD_STAMP;
    for (const b of broad.always) if (b.ord > afterOrd && (!b.moves || moverReaches(b, x0, x1, z0, z1))) { b._broadStamp = stamp; out.push(b); }
    let sorted = true;
    const posed = broad.posed;
    if (posed.length) {
      if (broad.poseSeen !== this._poseCount) posedBoxes(broad, this._poseCount);
      const u = broad.poseUnion;
      if (!(u[1] < x0 || u[0] > x1 || u[3] < z0 || u[2] > z1)) {
        for (let i = 0; i < posed.length; i++) {
          const b = posed[i], w = b.wbox;
          if (b.ord <= afterOrd || w[1] < x0 || w[0] > x1 || w[3] < z0 || w[2] > z1) continue;
          b._broadStamp = stamp;
          if (out.length && out[out.length - 1].ord > b.ord) sorted = false;
          out.push(b);
        }
      }
    }
    const reposed = broad.reposed;
    for (let i = 0; i < reposed.length; i++) {
      const b = reposed[i];
      if (b.ord <= afterOrd || !reposedReaches(b, cx0, cx1, cz0, cz1)) continue;
      b._broadStamp = stamp;
      if (out.length && out[out.length - 1].ord > b.ord) sorted = false;
      out.push(b);
    }
    for (let gx = cx0; gx <= cx1; gx++) {
      for (let gz = cz0; gz <= cz1; gz++) {
        const list = broad.cells.get(cellKey(gx, gz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b.ord <= afterOrd || b._broadStamp === stamp) continue;
          b._broadStamp = stamp;
          if (out.length && out[out.length - 1].ord > b.ord) sorted = false;
          out.push(b);
        }
      }
    }
    if (broad.coarseCells.size) {
      const kx0 = Math.floor(x0 / BROAD_COARSE_CELL), kx1 = Math.floor(x1 / BROAD_COARSE_CELL);
      const kz0 = Math.floor(z0 / BROAD_COARSE_CELL), kz1 = Math.floor(z1 / BROAD_COARSE_CELL);
      for (let i = 0, nx = kx1 - kx0; i <= nx; i++) {
        for (let j = 0, nz = kz1 - kz0; j <= nz; j++) {
          const list = broad.coarseCells.get(cellKey(kx0 + i, kz0 + j));
          if (!list) continue;
          for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b.ord <= afterOrd || b._broadStamp === stamp) continue;
            b._broadStamp = stamp;
            if (out.length && out[out.length - 1].ord > b.ord) sorted = false;
            out.push(b);
          }
        }
      }
    }
    // Candidates return to insertion order so ties and push order match a walk over every bucket.
    if (!sorted) {
      for (let i = 1; i < out.length; i++) {
        const b = out[i];
        let j = i - 1;
        while (j >= 0 && out[j].ord > b.ord) { out[j + 1] = out[j]; j--; }
        out[j + 1] = b;
      }
    }
    return out;
  }

  restFloor(x, z) {
    const h = this.heightAt(x, z);
    if (!Number.isFinite(h)) return h;
    const r = CAPSULE_RADIUS;
    const hx0 = this.heightAt(x - r, z), hx1 = this.heightAt(x + r, z), hz0 = this.heightAt(x, z - r), hz1 = this.heightAt(x, z + r);
    if (!(Number.isFinite(hx0) && Number.isFinite(hx1) && Number.isFinite(hz0) && Number.isFinite(hz1))) return h;
    const gx = minmod((hx1 - h) / r, (h - hx0) / r), gz = minmod((hz1 - h) / r, (h - hz0) / r);
    return h + r * (Math.sqrt(1 + gx * gx + gz * gz) - 1);
  }

  addMesh(bucketKey, positions, indices, matrix, translation = null, rotation = null, posed = false, sight = null) {
    let bucket = this._buckets.get(bucketKey);
    const fresh = !bucket;
    if (!bucket) {
      bucket = { key: bucketKey, moves: !!(translation || rotation), frame: FRAME_OF.get(translation) ?? null, ord: -1, _broadStamp: 0, lvl: FILED_NONE, bx0: 0, bx1: -1, bz0: 0, bz1: -1, tris: [], yLo: [], yHi: [], part: [], parts: 0, sight: null, rayMark: null, posed: !!posed && !!(translation || rotation), reposed: !translation && !rotation && this._reposedKeys.has(bucketKey), rnone: true, rwide: false, wbox: null, grid: new Map(), runs: null, wide: [], wideTree: null, t: translation || (() => ZERO3), r: rotation, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      this._buckets.set(bucketKey, bucket);
    }
    const m = matrix;
    const tx = (i) => {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ];
    };
    bucket.runs = null;
    const part = bucket.parts++;
    if (sight && !bucket.sight) bucket.sight = new Array(bucket.tris.length).fill(0);
    // A mirrored placement turns every triangle over; the last two corners swap back to restore the winding.
    const mirrored = !!m && m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]) < 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = tx(indices[i]);
      const b = tx(indices[mirrored ? i + 2 : i + 1]);
      const c = tx(indices[mirrored ? i + 1 : i + 2]);
      const idx = bucket.tris.length;
      bucket.tris.push([a, b, c]);
      bucket.part[idx] = part;
      if (bucket.sight) bucket.sight[idx] = sight && sight[i / 3] ? 1 : 0;
      bucket.yLo[idx] = Math.min(a[1], b[1], c[1]);
      bucket.yHi[idx] = Math.max(a[1], b[1], c[1]);
      for (let j = 0; j < 3; j++) {
        const v = j === 0 ? a : j === 1 ? b : c;
        for (let k = 0; k < 3; k++) {
          if (v[k] < bucket.min[k]) bucket.min[k] = v[k];
          if (v[k] > bucket.max[k]) bucket.max[k] = v[k];
        }
      }
      const minX = Math.floor(Math.min(a[0], b[0], c[0]) / CELL);
      const maxX = Math.floor(Math.max(a[0], b[0], c[0]) / CELL);
      const minZ = Math.floor(Math.min(a[2], b[2], c[2]) / CELL);
      const maxZ = Math.floor(Math.max(a[2], b[2], c[2]) / CELL);
      if ((maxX - minX + 1) * (maxZ - minZ + 1) > FINE_CELLS_MAX) { if (wideBox(bucket.tris[idx])) bucket.wide.push(idx); continue; }
      for (let gx = minX; gx <= maxX; gx++) {
        for (let gz = minZ; gz <= maxZ; gz++) {
          const k = cellKey(gx, gz);
          let cell = bucket.grid.get(k);
          if (!cell) { cell = []; bucket.grid.set(k, cell); }
          cell.push(idx);
        }
      }
    }
    const broad = this._broad;
    if (broad !== null) {
      if (framesMoved(broad)) this._broad = null;
      else {
        if (fresh) { bucket.ord = broad.all.length; broad.all.push(bucket); }
        fileBucket(broad, bucket);
      }
    }
  }

  settle(bucketKey) {
    const bucket = this._buckets.get(bucketKey);
    if (bucket && bucket.wide.length) wideTree(bucket);
  }

  poseBucket(bucketKey, positions, indices, matrix) {
    const bucket = this._buckets.get(bucketKey);
    if (!bucket || bucket.moves || bucket.parts > 1 || bucket.sight !== null) {
      this.removeBucket(bucketKey);
      this._reposedKeys.add(bucketKey);
      if (matrix) this.addMesh(bucketKey, positions, indices, matrix);
      return;
    }
    this._reposedKeys.add(bucketKey);
    this.cover?.remove(bucketKey);
    this.late?.forget(bucketKey);
    this._buckets.delete(bucketKey);
    this._buckets.set(bucketKey, bucket);
    bucket.runs = null;
    if (!matrix || !rebake(bucket, positions, indices, matrix)) {
      bucket.tris = []; bucket.yLo = []; bucket.yHi = []; bucket.part = []; bucket.parts = 0;
      bucket.grid = new Map(); bucket.wide = []; bucket.wideTree = null;
      bucket.min = [Infinity, Infinity, Infinity]; bucket.max = [-Infinity, -Infinity, -Infinity];
      if (matrix) this.addMesh(bucketKey, positions, indices, matrix);
    }
    const broad = this._broad;
    if (broad === null) return;
    if (bucket.lvl !== FILED_REPOSED || framesMoved(broad)) { bucket.reposed = true; this._broad = null; return; }
    const all = broad.all, rp = broad.reposed;
    if (all[bucket.ord] !== bucket) { this._broad = null; return; }
    reposedCells(bucket);
    all.splice(bucket.ord, 1);
    for (let i = bucket.ord; i < all.length; i++) all[i].ord = i;
    bucket.ord = all.length;
    all.push(bucket);
    rp.splice(rp.indexOf(bucket), 1);
    rp.push(bucket);
  }

  removeBucket(bucketKey) {
    if (this._buckets.delete(bucketKey)) this._broad = null;
    this._reposedKeys.delete(bucketKey);
    this.cover?.remove(bucketKey);
    this.late?.forget(bucketKey);
  }

  bucketPose(bucketKey) {
    const bucket = this._buckets.get(bucketKey);
    if (!bucket?.moves) return null;
    const t = bucket.t();
    const r = bucket.r ? bucket.r() : null;
    return { t: [t[0], t[1], t[2]], r: r ? Array.from(r) : null };
  }

  /** @returns {string} */
  shapeKey() {
    const r = (/** @type {number} */ v) => Math.round(v * 1000);
    const rows = [];
    for (const b of this._buckets.values()) {
      const t = b.moves ? b.t() : ZERO3;
      const turn = b.r ? Array.from(b.r(), r).join(',') : '';
      rows.push(`${b.key}:${b.tris.length}:${b.min.map(r)}:${b.max.map(r)}:${r(t[0])},${r(t[1])},${r(t[2])}:${turn}`);
    }
    return rows.sort().join(';');
  }

  bounds() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const bucket of this._buckets.values()) {
      if (!(bucket.min[0] <= bucket.max[0])) continue;
      const t = bucket.t();
      const R = bucket.r ? bucket.r() : null;
      if (R) {
        const b = turnedBox(bucket, t, R, TURNED_BOX);
        for (let k = 0; k < 3; k++) { if (b[k] < min[k]) min[k] = b[k]; if (b[k + 3] > max[k]) max[k] = b[k + 3]; }
        continue;
      }
      for (let k = 0; k < 3; k++) {
        if (bucket.min[k] + t[k] < min[k]) min[k] = bucket.min[k] + t[k];
        if (bucket.max[k] + t[k] > max[k]) max[k] = bucket.max[k] + t[k];
      }
    }
    return min[0] <= max[0] ? { min, max } : null;
  }

  raycast(origin, dir, maxDist, filter = null) {
    return this.raycastHit(origin, dir, maxDist, filter).dist;
  }

  raycastHit(origin, dirW, maxDist, filter = null, out = null) {
    const ex = origin[0] + dirW[0] * maxDist, ez = origin[2] + dirW[2] * maxDist;
    const near = this._near(Math.min(origin[0], ex) - BOX_SKIN, Math.max(origin[0], ex) + BOX_SKIN,
      Math.min(origin[2], ez) - BOX_SKIN, Math.max(origin[2], ez) + BOX_SKIN, RAY_NEAR);
    return this._rayHit(origin, dirW, maxDist, filter, out, near);
  }

  _rayHit(origin, dirW, maxDist, filter, out, near) {
    let best = Infinity;
    let bestKey = null;
    let bestTri = null;
    let bestR = null;
    const only = filter?.only ? new Set(filter.only) : null;
    const skip = filter?.skip ? new Set(filter.skip) : null;
    const bodies = !!filter?.bodies;
    for (let bi = 0; bi < near.length; bi++) {
      const bucket = near[bi], bkey = bucket.key;
      if (only && !only.has(bkey)) continue;
      if (skip && skip.has(bkey)) continue;
      const t = bucket.t();
      const R = bucket.r ? bucket.r() : null;
      let ox, oy, oz, dir = dirW;
      if (R) {
        intoBucket(origin[0], origin[1], origin[2], t, R, LOCAL);
        ox = LOCAL[0]; oy = LOCAL[1]; oz = LOCAL[2];
        dir = intoBucket(dirW[0], dirW[1], dirW[2], ZERO3, R, LOCAL_DIR);
      } else {
        ox = origin[0] - t[0];
        oy = origin[1] - t[1];
        oz = origin[2] - t[2];
      }
      if (!segmentHitsBox(ox, oy, oz, dir, bucket.min, bucket.max, Math.min(maxDist, best))) continue;
      let cx = Math.floor(ox / CELL);
      let cz = Math.floor(oz / CELL);
      const stepX = dir[0] > 0 ? 1 : -1;
      const stepZ = dir[2] > 0 ? 1 : -1;
      const invX = dir[0] !== 0 ? 1 / dir[0] : Infinity;
      const invZ = dir[2] !== 0 ? 1 / dir[2] : Infinity;
      let tMaxX = dir[0] !== 0 ? ((cx + (stepX > 0 ? 1 : 0)) * CELL - ox) * invX : Infinity;
      let tMaxZ = dir[2] !== 0 ? ((cz + (stepZ > 0 ? 1 : 0)) * CELL - oz) * invZ : Infinity;
      const tDeltaX = Math.abs(CELL * invX);
      const tDeltaZ = Math.abs(CELL * invZ);
      const marks = rayMarks(bucket), stamp = RAY_STAMP;
      const yLoOf = bucket.yLo, yHiOf = bucket.yHi, dy = dir[1], passed = bodies ? bucket.sight : null;
      let walked = 0;
      while (walked <= Math.min(maxDist, best)) {
        const cell = bucket.grid.get(cellKey(cx, cz));
        if (cell) {
          const tOut = Math.min(tMaxX, tMaxZ, maxDist, best);
          const y0 = oy + dy * walked, y1 = oy + dy * tOut;
          const rLo = (y0 < y1 ? y0 : y1) - RAY_Y_SLACK, rHi = (y0 < y1 ? y1 : y0) + RAY_Y_SLACK;
          for (let ci = 0; ci < cell.length; ci++) {
            const ti = cell[ci];
            if (marks[ti] === stamp) continue;
            if (yHiOf[ti] < rLo || yLoOf[ti] > rHi) continue;
            marks[ti] = stamp;
            if (passed !== null && passed[ti]) continue;
            const tri = bucket.tris[ti];
            const hit = rayTriangle(ox, oy, oz, dir, tri[0], tri[1], tri[2]);
            if (hit !== null && hit < best && hit <= maxDist) { best = hit; bestKey = bkey; bestTri = tri; bestR = R; }
          }
        }
        if (tMaxX < tMaxZ) { walked = tMaxX; tMaxX += tDeltaX; cx += stepX; }
        else { walked = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
      }
      if (bucket.wide.length) {
        for (const ti of wideOnRay(bucket, ox, oy, oz, dir, Math.min(maxDist, best))) {
          if (passed !== null && passed[ti]) continue;
          const tri = bucket.tris[ti];
          const hit = rayTriangle(ox, oy, oz, dir, tri[0], tri[1], tri[2]);
          if (hit !== null && hit < best && hit <= maxDist) { best = hit; bestKey = bkey; bestTri = tri; bestR = R; }
        }
      }
    }
    let normal = null;
    let nx = 0, ny = 0, nz = 0;
    let back = false;
    if (bestTri) {
      const [a, b, c] = bestTri;
      nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (bestR) {
        const R = bestR;
        const wx = R[0] * nx + R[3] * ny + R[6] * nz, wy = R[1] * nx + R[4] * ny + R[7] * nz, wz = R[2] * nx + R[5] * ny + R[8] * nz;
        nx = wx; ny = wy; nz = wz;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      back = nx * dirW[0] + ny * dirW[1] + nz * dirW[2] > 0;
      if (back) { nx = -nx; ny = -ny; nz = -nz; }
      if (!out) normal = [nx, ny, nz];
    }
    if (out) {
      out.dist = best; out.key = bestKey;
      out.normal[0] = nx; out.normal[1] = ny; out.normal[2] = nz;
      out.back = back;
      return out;
    }
    return { dist: best, key: bestKey, normal, back };
  }

  surfaceHit(origin, dir, maxDist, filter = null) {
    const mesh = this.raycastHit(origin, dir, maxDist, filter);
    if (!(dir[1] < 0)) return mesh;
    const floor = (this.surfaceAt ?? this.heightAt)(origin[0], origin[2]);
    if (!Number.isFinite(floor)) return mesh;
    const d = (origin[1] - floor) / -dir[1];
    if (!(d >= 0) || d > maxDist) return mesh;
    if (mesh && Number.isFinite(mesh.dist) && mesh.dist <= d) return mesh;
    return { dist: d, key: null, normal: this.groundNormal(origin[0], origin[2]) };
  }

  groundNormal(x, z) {
    const h = GROUND_NORMAL_STEP;
    const at = this.surfaceAt ?? this.heightAt;
    const c = at(x, z), xp = at(x + h, z), xm = at(x - h, z), zp = at(x, z + h), zm = at(x, z - h);
    if (!Number.isFinite(xp - xm) || !Number.isFinite(zp - zm) || !Number.isFinite(c)) return [0, 1, 0];
    const nx = (-minmod((xp - c) / h, (c - xm) / h)) || 0, nz = (-minmod((zp - c) / h, (c - zm) / h)) || 0;
    const l = Math.hypot(nx, 1, nz) || 1;
    return [nx / l, 1 / l, nz / l];
  }

  insideSolid(p) {
    const held = SWEEP_HELD;
    for (const bucket of this._buckets.values()) {
      if (bucket.r || !(bucket.min[0] <= bucket.max[0])) continue;
      const t = bucket.t();
      held.clear();
      partsHolding(bucket, p[0] - t[0], p[1] - t[1], p[2] - t[2], held);
      if (held.size) return true;
    }
    return false;
  }

  sphereOverlaps(center, radius) {
    const r2 = radius * radius;
    const g = radius + 2 * BOX_SKIN;
    const near = this._near(center[0] - g, center[0] + g, center[2] - g, center[2] + g, SPHERE_NEAR);
    for (let bi = 0; bi < near.length; bi++) {
      const bucket = near[bi];
      const t = bucket.t();
      const R = bucket.r ? bucket.r() : null;
      let lx, ly, lz;
      if (R) { intoBucket(center[0], center[1], center[2], t, R, LOCAL); lx = LOCAL[0]; ly = LOCAL[1]; lz = LOCAL[2]; }
      else {
        lx = center[0] - t[0];
        ly = center[1] - t[1];
        lz = center[2] - t[2];
      }
      if (!sphereTouchesBox(lx, ly, lz, radius, bucket.min, bucket.max)) continue;
      const yLoOf = bucket.yLo, yHiOf = bucket.yHi, yReach = radius + SPHERE_Y_SLACK, sightOf = bucket.sight;
      for (let pass = 0; pass < 2; pass++) {
        const cell = pass === 0 ? cellRun(bucket, lx, lz).idx : wideRun(bucket, lx, ly, lz, radius);
        for (let ci = 0; ci < cell.length; ci++) {
          const ti = cell[ci];
          if (sightOf !== null && sightOf[ti]) continue;
          if (yHiOf[ti] < ly - yReach || yLoOf[ti] > ly + yReach) continue;
          const tri = bucket.tris[ti];
          if (!triNear(tri, lx, ly, lz, radius)) continue;
          closestPointOnTriangle(lx, ly, lz, tri[0], tri[1], tri[2], TMP);
          const dx = lx - TMP[0];
          const dy = ly - TMP[1];
          const dz = lz - TMP[2];
          if (dx * dx + dy * dy + dz * dz < r2) return true;
        }
      }
    }
    return false;
  }

  capsuleContact(feet, height, reach, filter = null, out = [0, 0, 0], beneath = null) {
    // The axis is never negative: below two radii of height the capsule is a sphere, as in Unity.
    const axis = Math.max(0, height - 2 * CAPSULE_RADIUS);
    const middles = Math.max(0, Math.ceil(axis / (2 * CAPSULE_RADIUS * BEAD_OVERLAP)) - 1);
    const n = middles + 2;
    const lim = CAPSULE_RADIUS + reach;
    const lim2 = lim * lim;
    const only = filter?.only ? new Set(filter.only) : null;
    let best = Infinity;
    const g = lim + 2 * BOX_SKIN;
    const near = this._near(feet[0] - g, feet[0] + g, feet[2] - g, feet[2] + g, SPHERE_NEAR);
    for (let bi = 0; bi < near.length; bi++) {
      const bucket = near[bi], bkey = bucket.key;
      if (only && !only.has(bkey)) continue;
      const t = bucket.t();
      const R = bucket.r ? bucket.r() : null;
      let lx = feet[0] - t[0];
      let lz = feet[2] - t[2];
      for (let i = 0; i < n; i++) {
        let ly = feet[1] + CAPSULE_RADIUS + (axis * i) / (n - 1) - t[1];
        if (R) { intoBucket(feet[0], feet[1] + CAPSULE_RADIUS + (axis * i) / (n - 1), feet[2], t, R, LOCAL); lx = LOCAL[0]; ly = LOCAL[1]; lz = LOCAL[2]; }
        if (!sphereTouchesBox(lx, ly, lz, lim, bucket.min, bucket.max)) continue;
        const yLoOf = bucket.yLo, yHiOf = bucket.yHi, yReach = lim + SPHERE_Y_SLACK, sightOf = bucket.sight;
        for (let pass = 0; pass < 2; pass++) {
          const cell = pass === 0 ? cellRun(bucket, lx, lz).idx : wideRun(bucket, lx, ly, lz, lim);
          for (let ci = 0; ci < cell.length; ci++) {
            const ti = cell[ci];
            if (sightOf !== null && sightOf[ti]) continue;
            if (yHiOf[ti] < ly - yReach || yLoOf[ti] > ly + yReach) continue;
            const tri = bucket.tris[ti];
            if (!triNear(tri, lx, ly, lz, lim)) continue;
            closestPointOnTriangle(lx, ly, lz, tri[0], tri[1], tri[2], TMP);
            const dx = lx - TMP[0];
            const dy = ly - TMP[1];
            const dz = lz - TMP[2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (!(d2 <= lim2 && d2 < best)) continue;
            let px = TMP[0] + t[0], py = TMP[1] + t[1], pz = TMP[2] + t[2];
            if (R) { px = R[0] * TMP[0] + R[3] * TMP[1] + R[6] * TMP[2] + t[0]; py = R[1] * TMP[0] + R[4] * TMP[1] + R[7] * TMP[2] + t[1]; pz = R[2] * TMP[0] + R[5] * TMP[1] + R[8] * TMP[2] + t[2]; }
            if (beneath != null) {
              const cx = px - feet[0], cy = py - (feet[1] + height / 2), cz = pz - feet[2];
              const len = Math.hypot(cx, cy, cz);
              if (!(len > 0 && cy / len < beneath)) continue;
            }
            best = d2; out[0] = px; out[1] = py; out[2] = pz;
          }
        }
      }
    }
    return best < Infinity ? out : null;
  }

  sphereCastAll(origin, radius, dir, maxDist, filter = null) {
    const out = [];
    const skip = filter?.skip ? new Set(filter.skip) : null;
    const end = [origin[0] + dir[0] * maxDist, origin[1] + dir[1] * maxDist, origin[2] + dir[2] * maxDist];
    const lo = [0, 1, 2].map((i) => Math.min(origin[i], end[i]) - radius);
    const hi = [0, 1, 2].map((i) => Math.max(origin[i], end[i]) + radius);
    let ux = -dir[2], uy = 0, uz = dir[0];
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-6) { ux = 1; uy = 0; uz = 0; ul = 1; }
    ux /= ul; uy /= ul; uz /= ul;
    const vx = dir[1] * uz - dir[2] * uy, vy = dir[2] * ux - dir[0] * uz, vz = dir[0] * uy - dir[1] * ux;
    const h = radius * Math.SQRT1_2;
    const spokes = [[0, 0, 0], [ux * radius, uy * radius, uz * radius], [-ux * radius, -uy * radius, -uz * radius],
      [vx * radius, vy * radius, vz * radius], [-vx * radius, -vy * radius, -vz * radius],
      [(ux + vx) * h, (uy + vy) * h, (uz + vz) * h], [(ux - vx) * h, (uy - vy) * h, (uz - vz) * h],
      [(-ux + vx) * h, (-uy + vy) * h, (-uz + vz) * h], [(-ux - vx) * h, (-uy - vy) * h, (-uz - vz) * h]];
    const reach = maxDist + radius;
    const r2 = radius * radius;
    for (const [key, bucket] of this._buckets) {
      if (skip && skip.has(key)) continue;
      const t = bucket.t();
      const R = bucket.r ? bucket.r() : null;
      let apart = false;
      if (R) {
        const b = turnedBox(bucket, t, R, TURNED_BOX);
        for (let i = 0; i < 3; i++) if (hi[i] < b[i] - BOX_SKIN || lo[i] > b[i + 3] + BOX_SKIN) apart = true;
      } else for (let i = 0; i < 3; i++) if (hi[i] < bucket.min[i] + t[i] - BOX_SKIN || lo[i] > bucket.max[i] + t[i] + BOX_SKIN) apart = true;
      if (apart) continue;
      let lx = origin[0] - t[0], ly = origin[1] - t[1], lz = origin[2] - t[2];
      if (R) { intoBucket(origin[0], origin[1], origin[2], t, R, LOCAL); lx = LOCAL[0]; ly = LOCAL[1]; lz = LOCAL[2]; }
      let overlap = false;
      if (sphereTouchesBox(lx, ly, lz, radius, bucket.min, bucket.max)) {
        const visited = VISITED;
        visited.clear();
        for (const cell of nearCells(bucket, lx, ly, lz, radius)) {
          for (const ti of cell) {
            if (visited.has(ti)) continue;
            visited.add(ti);
            const tri = bucket.tris[ti];
            if (!triNear(tri, lx, ly, lz, radius)) continue;
            closestPointOnTriangle(lx, ly, lz, tri[0], tri[1], tri[2], TMP);
            const dx = lx - TMP[0], dy = ly - TMP[1], dz = lz - TMP[2];
            if (dx * dx + dy * dy + dz * dz < r2) { overlap = true; break; }
          }
          if (overlap) break;
        }
      }
      if (overlap) { out.push({ key, dist: 0, point: [0, 0, 0] }); continue; }
      let best = Infinity, bestPoint = null;
      const only = { only: [key] };
      for (const [ox, oy, oz] of spokes) {
        const o = [origin[0] + ox, origin[1] + oy, origin[2] + oz];
        const hit = this.raycastHit(o, dir, reach, only);
        if (hit.dist < best) { best = hit.dist; bestPoint = [o[0] + dir[0] * hit.dist, o[1] + dir[1] * hit.dist, o[2] + dir[2] * hit.dist]; }
      }
      if (Number.isFinite(best)) out.push({ key, dist: Math.max(0, best - radius), point: bestPoint });
    }
    return out;
  }

  hullSweepAll(origin, radius, dir, maxDist, { keelY = -Infinity, skip = null } = {}) {
    const out = [];
    const end = [origin[0] + dir[0] * maxDist, origin[1] + dir[1] * maxDist, origin[2] + dir[2] * maxDist];
    const lo = [0, 1, 2].map((i) => Math.min(origin[i], end[i]) - radius);
    const hi = [0, 1, 2].map((i) => Math.max(origin[i], end[i]) + radius);
    const held = SWEEP_HELD, first = SWEEP_FIRST;
    for (const [key, bucket] of this._buckets) {
      if (skip && skip.has(key)) continue;
      if (!(bucket.min[0] <= bucket.max[0])) continue;
      const t = bucket.t();
      const R = bucket.r ? bucket.r() : null;
      let apart = false;
      if (R) {
        const b = turnedBox(bucket, t, R, TURNED_BOX);
        for (let i = 0; i < 3; i++) if (hi[i] < b[i] - BOX_SKIN || lo[i] > b[i + 3] + BOX_SKIN) apart = true;
      } else for (let i = 0; i < 3; i++) if (hi[i] < bucket.min[i] + t[i] - BOX_SKIN || lo[i] > bucket.max[i] + t[i] + BOX_SKIN) apart = true;
      if (apart) continue;
      intoBucket(origin[0], origin[1], origin[2], t, R, LOCAL);
      const ox = LOCAL[0], oy = LOCAL[1], oz = LOCAL[2];
      let dx = dir[0], dy = dir[1], dz = dir[2];
      if (R) { intoBucket(dir[0], dir[1], dir[2], ZERO3, R, LOCAL_DIR); dx = LOCAL_DIR[0]; dy = LOCAL_DIR[1]; dz = LOCAL_DIR[2]; }
      const ex = ox + dx * maxDist, ey = oy + dy * maxDist, ez = oz + dz * maxDist;
      const x0 = Math.min(ox, ex) - radius, x1 = Math.max(ox, ex) + radius;
      const y0 = Math.min(oy, ey) - radius, y1 = Math.max(oy, ey) + radius;
      const z0 = Math.min(oz, ez) - radius, z1 = Math.max(oz, ez) + radius;
      held.clear();
      first.clear();
      if (!bucket.r) partsHolding(bucket, ox, oy, oz, held);
      const keel = bucket.r ? -Infinity : keelY - t[1];
      const marks = rayMarks(bucket), stamp = RAY_STAMP;
      const yLoOf = bucket.yLo, yHiOf = bucket.yHi, partOf = bucket.part, tris = bucket.tris;
      const test = (ti) => {
        if (marks[ti] === stamp) return;
        marks[ti] = stamp;
        if (yHiOf[ti] < keel || yHiOf[ti] < y0 || yLoOf[ti] > y1) return;
        const part = partOf[ti];
        if (held.has(part)) return;
        const tri = tris[ti], a = tri[0], b = tri[1], c = tri[2];
        if (Math.max(a[0], b[0], c[0]) < x0 || Math.min(a[0], b[0], c[0]) > x1 || Math.max(a[2], b[2], c[2]) < z0 || Math.min(a[2], b[2], c[2]) > z1) return;
        if (!sweepSphereTriangle(ox, oy, oz, radius, dx, dy, dz, maxDist, a, b, c, SWEEP_HIT)) return;
        const near = SWEEP_HIT[0] === 0 ? (SWEEP_HIT[1] - ox) ** 2 + (SWEEP_HIT[2] - oy) ** 2 + (SWEEP_HIT[3] - oz) ** 2 : 0;
        const was = first.get(part);
        if (!was || SWEEP_HIT[0] < was[0] || (SWEEP_HIT[0] === 0 && near < was[4])) first.set(part, [SWEEP_HIT[0], SWEEP_HIT[1], SWEEP_HIT[2], SWEEP_HIT[3], near]);
      };
      const gx0 = Math.floor(x0 / CELL), gx1 = Math.floor(x1 / CELL), gz0 = Math.floor(z0 / CELL), gz1 = Math.floor(z1 / CELL);
      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const cell = bucket.grid.get(cellKey(gx, gz));
          if (cell) for (let ci = 0; ci < cell.length; ci++) test(cell[ci]);
        }
      }
      if (bucket.wide.length) {
        const half = maxDist / 2;
        for (const ti of [...wideNear(bucket, ox + dx * half, oy + dy * half, oz + dz * half, half + radius)]) test(ti);
      }
      for (const [part, [d, cx, cy, cz]] of first) {
        const p = R ? [R[0] * cx + R[3] * cy + R[6] * cz + t[0], R[1] * cx + R[4] * cy + R[7] * cz + t[1], R[2] * cx + R[5] * cy + R[8] * cz + t[2]]
          : [cx + t[0], cy + t[1], cz + t[2]];
        out.push(d === 0 ? { key, part, dist: 0, point: p, start: true } : { key, part, dist: d, point: p });
      }
    }
    return out;
  }

  capsuleCast(p1, p2, radius, dir, maxDist, axisSamples = 3, filter = null) {
    const ax = p2[0] - p1[0], ay = p2[1] - p1[1], az = p2[2] - p1[2];
    let ux = -dir[2], uy = 0, uz = dir[0];
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-6) { ux = 1; uy = 0; uz = 0; ul = 1; }
    ux /= ul; uy /= ul; uz /= ul;
    const vx = dir[1] * uz - dir[2] * uy;
    const vy = dir[2] * ux - dir[0] * uz;
    const vz = dir[0] * uy - dir[1] * ux;
    const reach = maxDist + radius;
    let best = Infinity;
    let bestKey = null;
    const n = ax === 0 && ay === 0 && az === 0 ? 1 : Math.max(1, axisSamples);
    const g = radius * (1 + Math.hypot(dir[0], dir[1], dir[2])) + CAST_SLACK, rx = dir[0] * reach, rz = dir[2] * reach;
    const near = this._near(Math.min(p1[0], p2[0], p1[0] + rx, p2[0] + rx) - g, Math.max(p1[0], p2[0], p1[0] + rx, p2[0] + rx) + g,
      Math.min(p1[2], p2[2], p1[2] + rz, p2[2] + rz) - g, Math.max(p1[2], p2[2], p1[2] + rz, p2[2] + rz) + g, CAST_NEAR);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const bx = p1[0] + ax * t, by = p1[1] + ay * t, bz = p1[2] + az * t;
      const h = radius * Math.SQRT1_2;
      for (let sp = 0; sp < 9; sp++) {
        const su = CAP_SPOKES[sp * 2], sv = CAP_SPOKES[sp * 2 + 1], k = sp >= 5 ? h : radius;
        CAP_ORIGIN[0] = bx + (su * ux + sv * vx) * k; CAP_ORIGIN[1] = by + (su * uy + sv * vy) * k; CAP_ORIGIN[2] = bz + (su * uz + sv * vz) * k;
        const hit = this._rayHit(CAP_ORIGIN, dir, Math.min(reach, best), filter, CAP_HIT, near);
        if (hit.dist < best) { best = hit.dist; bestKey = hit.key; }
      }
    }
    return { dist: Number.isFinite(best) ? Math.max(0, best - radius) : Infinity, key: bestKey };
  }

  sphereCast(origin, radius, dir, maxDist, filter = null) {
    return this.capsuleCast(origin, origin, radius, dir, maxDist, 1, filter);
  }

  _resolveSphere(center, radius, out, standCeil = Infinity, oneWayFloor = false, midBody = false, skip = null) {
    let grounded = false;
    let ceiling = false;
    let pushedDown = false;
    let groundKey = null;
    let groundY = -Infinity;
    let liftY = -Infinity, liftX = 0, liftZ = 0, intoX = 0, intoZ = 0;
    const c0x = center[0], c0y = center[1], c0z = center[2];
    const reach = radius + SKIN, g = reach + BROAD_PAD + 2 * BOX_SKIN;
    let gx = center[0], gz = center[2], walkedOrd = -1;
    let near = this._near(gx - g, gx + g, gz - g, gz + g, SPHERE_NEAR);
    for (let bi = 0; ; bi++) {
      if (Math.abs(center[0] - gx) > BROAD_PAD || Math.abs(center[2] - gz) > BROAD_PAD) {
        gx = center[0]; gz = center[2];
        near = this._near(gx - g, gx + g, gz - g, gz + g, SPHERE_NEAR, walkedOrd);
        bi = -1;
        continue;
      }
      if (bi >= near.length) break;
      const bucket = near[bi], bkey = bucket.key;
      walkedOrd = bucket.ord;
      if (skip?.has(bkey)) continue;
      const t = bucket.t();
      const R = bucket.r ? bucket.r() : null;
      if (R) intoBucket(center[0], center[1], center[2], t, R, LOCAL);
      const bx = R ? LOCAL[0] : center[0] - t[0], by = R ? LOCAL[1] : center[1] - t[1], bz = R ? LOCAL[2] : center[2] - t[2];
      if (!sphereTouchesBox(bx, by, bz, radius + SKIN, bucket.min, bucket.max)) continue;
      const yLoOf = bucket.yLo, yHiOf = bucket.yHi, yReach = reach + SPHERE_Y_SLACK, sightOf = bucket.sight;
      let wx = NaN, wy = NaN, wz = NaN, lx = 0, ly = 0, lz = 0;
      const xzReach = reach + SPHERE_Y_SLACK;
      for (let pass = 0; pass < 2; pass++) {
        const run = pass === 0 ? cellRun(bucket, bx, bz) : null;
        const cell = run !== null ? run.idx : wideRun(bucket, bx, by, bz, radius + SKIN), xz = run !== null ? run.xz : null;
        for (let ci = 0; ci < cell.length; ci++) {
          const ti = cell[ci];
          if (sightOf !== null && sightOf[ti]) continue;
          if (center[0] !== wx || center[1] !== wy || center[2] !== wz) {
            wx = center[0]; wy = center[1]; wz = center[2];
            lx = wx - t[0]; ly = wy - t[1]; lz = wz - t[2];
            if (R) { intoBucket(wx, wy, wz, t, R, LOCAL); lx = LOCAL[0]; ly = LOCAL[1]; lz = LOCAL[2]; }
          }
          if (yHiOf[ti] < ly - yReach || yLoOf[ti] > ly + yReach) continue;
          if (xz !== null && (xz[ci * 4 + 1] < lx - xzReach || xz[ci * 4] > lx + xzReach
            || xz[ci * 4 + 3] < lz - xzReach || xz[ci * 4 + 2] > lz + xzReach)) continue;
          const tri = bucket.tris[ti];
          if (!triNear(tri, lx, ly, lz, radius + SKIN)) continue;
          closestPointOnTriangle(lx, ly, lz, tri[0], tri[1], tri[2], TMP);
          let dx = lx - TMP[0];
          let dy = ly - TMP[1];
          let dz = lz - TMP[2];
          if (R) { const wx = R[0] * dx + R[3] * dy + R[6] * dz, wy = R[1] * dx + R[4] * dy + R[7] * dz, wz = R[2] * dx + R[5] * dy + R[8] * dz; dx = wx; dy = wy; dz = wz; }
          const d2 = dx * dx + dy * dy + dz * dz;
          const contactR = radius + SKIN;
          if (d2 >= contactR * contactR || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const wallAbove = (dy > 0 && center[1] - dy > standCeil)
            || (midBody && dy > 0 && dy / d >= GROUND_NY);
          const floorAbove = oneWayFloor !== false && d < radius && !wallAbove && dy / d <= -GROUND_NY
            && (oneWayFloor === true || (R ? center[1] - dy : t[1] + (ly - dy)) < center[1] + oneWayFloor)
            && (R ? faceNyTurned(tri, R) : faceNy(tri)) >= GROUND_NY;
          const unstood = floorAbove && this._walk && this._walkRefused;
          if (floorAbove && !unstood) {
            const dh2 = dx * dx + dz * dz;
            const cy = R ? center[1] - dy : t[1] + (ly - dy);
            center[1] = cy + Math.sqrt(Math.max(0, radius * radius - dh2));
            grounded = true;
            if (cy > groundY) groundY = cy;
            if (groundKey == null || bkey !== 'dungeon') groundKey = bkey;
            if (this._walk) { liftY = cy; liftX = center[0] - dx; liftZ = center[2] - dz; intoX = -dx; intoZ = -dz; }
            continue;
          }
          if (d < radius) {
            if (wallAbove || unstood) {
              const dh = Math.sqrt(dx * dx + dz * dz);
              if (dh > 1e-6) {
                const pushH = (radius - d) / dh;
                center[0] += dx * pushH;
                center[2] += dz * pushH;
              } else {
                const push = (radius - d) / d;
                center[1] += dy * push;
              }
            } else {
              const push = (radius - d) / d;
              center[0] += dx * push;
              center[1] += dy * push;
              center[2] += dz * push;
            }
          }
          const ny = dy / d;
          const touching = d < radius;
          if (ny >= GROUND_NY && !wallAbove) {
            grounded = true;
            const cy = center[1] - dy;
            if (cy > groundY) groundY = cy;
            if (groundKey == null || bkey !== 'dungeon') groundKey = bkey;
          }
          if (touching && ny <= -0.5) ceiling = true;
          if (touching && ny <= -GROUND_NY) pushedDown = true;
        }
      }
    }
    if (liftY > -Infinity && !this._standsOn(liftX, liftZ, intoX, intoZ, center[1], radius)) {
      center[0] = c0x; center[1] = c0y; center[2] = c0z;
      this._walkRefused = true;
      try { this._resolveSphere(center, radius, out, standCeil, oneWayFloor, midBody, skip); } finally { this._walkRefused = false; }
      return;
    }
    out.grounded = out.grounded || grounded;
    out.hitCeiling = out.hitCeiling || ceiling;
    out.pushedDown = out.pushedDown || pushedDown;
    if (grounded) out.groundY = Math.max(out.groundY ?? -Infinity, groundY);
    if (groundKey != null && (out.groundKey == null || groundKey !== 'dungeon')) out.groundKey = groundKey;
  }

  _resolveCapsule(feet, out, height = CAPSULE_HEIGHT, standCeil = Infinity, straddle = false, clear = false) {
    const entryY = feet[1];
    const axis = Math.max(0, height - 2 * CAPSULE_RADIUS);
    const low = at3(CAP_LOW, feet[0], feet[1] + CAPSULE_RADIUS, feet[2]);
    const high = at3(CAP_HIGH, feet[0], feet[1] + CAPSULE_RADIUS + axis, feet[2]);
    const span = 2 * CAPSULE_RADIUS * BEAD_OVERLAP;
    const middles = Math.max(0, Math.ceil(axis / span) - 1);
    while (MID_SCRATCH.length < middles) MID_SCRATCH.push([0, 0, 0]);
    const mid = MID_SCRATCH;
    const tall = height > RIDE_HEIGHT || !!this._keepFloor;
    const lowOneWay = straddle ? axis : true;
    let lowFloor = -Infinity;
    for (let iter = 0; iter < 3; iter++) {
      const sx = low[0], sy = low[1], sz = low[2];
      if (!clear && tall) {
        const lo = LOW_OUT;
        lo.grounded = false; lo.hitCeiling = false; lo.pushedDown = false; lo.groundKey = null; lo.groundY = undefined;
        this._resolveSphere(low, CAPSULE_RADIUS, lo, standCeil, lowOneWay);
        if (lo.grounded) lowFloor = low[1];
        out.grounded = out.grounded || lo.grounded;
        out.hitCeiling = out.hitCeiling || lo.hitCeiling;
        out.pushedDown = out.pushedDown || lo.pushedDown;
        if (lo.grounded) out.groundY = Math.max(out.groundY ?? -Infinity, lo.groundY);
        if (lo.groundKey != null && (out.groundKey == null || lo.groundKey !== 'dungeon')) out.groundKey = lo.groundKey;
      } else if (!clear) this._resolveSphere(low, CAPSULE_RADIUS, out, standCeil, lowOneWay);
      for (let i = 0; i < middles; i++) {
        const m2 = mid[i];
        m2[0] = low[0];
        m2[2] = low[2];
        m2[1] = low[1] + (axis * (i + 1)) / (middles + 1);
        if (!clear) this._resolveSphere(m2, CAPSULE_RADIUS, out, standCeil, false, true);
        low[0] = m2[0];
        low[2] = m2[2];
        low[1] = m2[1] - (axis * (i + 1)) / (middles + 1);
      }
      high[0] = low[0];
      high[2] = low[2];
      high[1] = low[1] + axis;
      if (!clear) this._resolveSphere(high, CAPSULE_RADIUS, out, standCeil, axis === 0 ? lowOneWay : false, axis !== 0);
      low[0] = high[0];
      low[2] = high[2];
      low[1] = high[1] - axis;
      if (FIXED_POINT_STOP && low[0] === sx && low[1] === sy && low[2] === sz) break;
    }
    feet[0] = low[0];
    feet[1] = low[1] - CAPSULE_RADIUS;
    const floorFeet = tall && out.hitCeiling ? lowFloor - CAPSULE_RADIUS : -Infinity;
    if (feet[1] < floorFeet) feet[1] = floorFeet;
    feet[2] = low[2];
    if (out.hitCeiling && feet[1] > entryY) {
      const probeOut = blank(OUT_TIGHT);
      for (let i = 1; i <= middles + 1; i++) {
        const y = feet[1] + CAPSULE_RADIUS + (axis * i) / (middles + 1);
        const probe = at3(P_TIGHT, feet[0], y, feet[2]);
        this._resolveSphere(probe, CAPSULE_RADIUS, probeOut);
        if (probe[1] < y - 1e-4) { feet[1] = Math.max(entryY, floorFeet); break; }
      }
    }
    if (feet[1] - entryY > SKIN && Number.isFinite(this.raycast([feet[0], entryY + CAPSULE_RADIUS + axis - SKIN, feet[2]], UP, feet[1] - entryY + SKIN, BODY_RAY))) {
      out.refused = true;
      feet[1] = Math.max(entryY, floorFeet);
    }
  }

  move(feet, dx, dy, dz, height = CAPSULE_HEIGHT, snap = true, keepFloor = false, noStep = false, onGround = false) {
    const was = this._keepFloor, stepped = this._noStep, stood = this._onGround, walked = this._walk, memo = this._memo;
    this._keepFloor = !!keepFloor;
    this._noStep = !!noStep;
    this._onGround = !!onGround;
    if (memo === null) {
      for (const e of this._memoRing) e.list = null;
      this._memo = this._memoRing;
    }
    try { return this._move(feet, dx, dy, dz, height, snap); } finally { this._keepFloor = was; this._noStep = stepped; this._onGround = stood; this._walk = walked; this._memo = memo; }
  }
  _move(feet, dx, dy, dz, height = CAPSULE_HEIGHT, snap = true) {
    const maxComp = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const maxStep = SUBSTEP_LEN;
    if (maxComp > maxStep) {
      const n = Math.min(SUBSTEPS_MAX, Math.ceil(maxComp / maxStep));
      const out = { grounded: false, hitCeiling: false, pushedDown: false, groundKey: null, sides: false };
      for (let i = 0; i < n; i++) {
        const r = this._moveStep(feet, dx / n, dy / n, dz / n, height, snap);
        out.grounded = r.grounded;
        out.groundKey = r.groundKey ?? null;
        out.hitCeiling = out.hitCeiling || r.hitCeiling;
        out.sides = out.sides || r.sides;
      }
      return out;
    }
    return this._moveStep(feet, dx, dy, dz, height, snap);
  }

  penetrationAt(feet, height = CAPSULE_HEIGHT) {
    const probe = [feet[0], feet[1], feet[2]];
    const out = { grounded: false, hitCeiling: false, pushedDown: false };
    this._resolveCapsule(probe, out, height);
    return Math.hypot(probe[0] - feet[0], probe[1] - feet[1], probe[2] - feet[2]);
  }

  _standsOn(x, z, ix, iz, cy, r) {
    const reach = this._walk - r;
    if (!(reach > 0)) return true;
    const l = Math.hypot(ix, iz), ux = l > 1e-9 ? ix / l : 0, uz = l > 1e-9 ? iz / l : 0, o = STAND_ORIGIN;
    for (const k of STAND_ACROSS) {
      o[0] = x + ux * STAND_INSET - uz * k * STAND_SPREAD;
      o[1] = cy;
      o[2] = z + uz * STAND_INSET + ux * k * STAND_SPREAD;
      if (Number.isFinite(this.raycast(o, UP, reach, BODY_RAY))) return false;
    }
    return true;
  }

  _column(x, z) {
    const c = CAPSULE_RADIUS + SKIN + COLUMN_SLACK, spans = COLUMN_SPANS;
    spans.length = 0;
    const near = this._near(x - c - BOX_SKIN, x + c + BOX_SKIN, z - c - BOX_SKIN, z + c + BOX_SKIN, COLUMN_NEAR);
    for (let bi = 0; bi < near.length; bi++) {
      const b = near[bi], mn = b.min, mx = b.max;
      if (!(mn[0] <= mx[0] && mn[1] <= mx[1] && mn[2] <= mx[2])) continue;
      const t = b.t(), R = b.r ? b.r() : null;
      if (R) {
        const w = moverBox(b, MOVER_BOX);
        if (!(x + c < w[0] || x - c > w[1] || z + c < w[2] || z - c > w[3])) spans.push(-Infinity, Infinity);
        continue;
      }
      const lx = x - t[0], lz = z - t[2];
      if (lx + c < mn[0] - BOX_SKIN || lx - c > mx[0] + BOX_SKIN || lz + c < mn[2] - BOX_SKIN || lz - c > mx[2] + BOX_SKIN) continue;
      const tris = b.tris, yLo = b.yLo, yHi = b.yHi, ty = t[1];
      const x0 = lx - c, x1 = lx + c, z0 = lz - c, z1 = lz + c;
      for (let gx = Math.floor(x0 / CELL), gx1 = Math.floor(x1 / CELL); gx <= gx1; gx++) {
        for (let gz = Math.floor(z0 / CELL), gz1 = Math.floor(z1 / CELL); gz <= gz1; gz++) {
          const cell = b.grid.get(cellKey(gx, gz));
          if (!cell) continue;
          for (let ci = 0; ci < cell.length; ci++) {
            const ti = cell[ci], tri = tris[ti], p = tri[0], q = tri[1], r = tri[2];
            if (Math.max(p[0], q[0], r[0]) < x0 || Math.min(p[0], q[0], r[0]) > x1 || Math.max(p[2], q[2], r[2]) < z0 || Math.min(p[2], q[2], r[2]) > z1) continue;
            spans.push(yLo[ti] + ty, yHi[ti] + ty);
          }
        }
      }
      if (b.wide.length) {
        COLUMN_WIDE.length = 0;
        for (const ti of wideInColumn(b, x0, x1, z0, z1, COLUMN_WIDE)) spans.push(yLo[ti] + ty, yHi[ti] + ty);
      }
    }
    return spans;
  }

  findClearFloor(feet, maxUp = 6, step = 0.25) {
    for (let up = 0; up <= maxUp; up += step) {
      const test = [feet[0], feet[1] + up, feet[2]];
      if (this.penetrationAt(test) < 0.03) {
        const d = this.raycast([test[0], test[1] + 0.2, test[2]], [0, -1, 0], up + 2, BODY_RAY);
        if (Number.isFinite(d)) return [test[0], test[1] + 0.2 - d, test[2]];
        return test;
      }
    }
    return feet;
  }

  _moveStep(feet, dx, dy, dz, height = CAPSULE_HEIGHT, snap = true) {
    const out = { grounded: false, hitCeiling: false, pushedDown: false, sides: false };

    const beforeX = feet[0];
    const beforeZ = feet[2];
    const entryY = feet[1];
    const standCeil = entryY + STEP_OFFSET;
    feet[0] += dx;
    feet[2] += dz;
    const hOut = blank(OUT_SIDE);
    this._walk = dy === 0 || this._onGround ? height : 0;
    this._resolveCapsule(feet, hOut, height, Infinity, true);
    if (hOut.refused) { feet[0] = beforeX; feet[2] = beforeZ; }
    const movedSq = (feet[0] - beforeX) ** 2 + (feet[2] - beforeZ) ** 2;
    const wantedSq = dx * dx + dz * dz;
    const sideX = feet[0] - (beforeX + dx), sideY = feet[1] - entryY, sideZ = feet[2] - (beforeZ + dz);
    const sideSq = sideX * sideX + sideZ * sideZ;
    let sides = sideSq > SIDE_CONTACT * SIDE_CONTACT && sideY / Math.sqrt(sideSq + sideY * sideY) < GROUND_NY;

    if (!this._noStep && dy <= 0 && wantedSq > 1e-8 && movedSq < wantedSq * 0.25) {
      let prevResolvedY = feet[1];
      for (const lift of [0.125, 0.25, 0.375, STEP_OFFSET]) {
        const raisedStart = at3(P_RAISED, beforeX, feet[1] + lift, beforeZ);
        const startOut = blank(OUT_RAISED);
        this._resolveCapsule(raisedStart, startOut, height, standCeil);
        if (raisedStart[1] <= prevResolvedY + 1e-4) break;
        if (startOut.refused) break;
        prevResolvedY = raisedStart[1];
        const retry = at3(P_RETRY, beforeX + dx, raisedStart[1], beforeZ + dz);
        const retryOut = blank(OUT_RETRY);
        this._resolveCapsule(retry, retryOut, height, standCeil);
        const retrySq = (retry[0] - beforeX) ** 2 + (retry[2] - beforeZ) ** 2;
        if (retrySq < wantedSq * 0.25 || retryOut.pushedDown) continue;
        if (retry[1] > standCeil + 1e-4) continue;
        let landed = null;
        for (let y = retry[1]; ; y -= STEP_OFFSET / 8) {
          const probeY = Math.max(y, entryY);
          const probe = at3(P_LAND, retry[0], probeY, retry[2]);
          const probeOut = blank(OUT_LAND);
          this._resolveCapsule(probe, probeOut, height, standCeil);
          const slidSq = (probe[0] - retry[0]) ** 2 + (probe[2] - retry[2]) ** 2;
          if (probeOut.grounded && !probeOut.pushedDown && slidSq < 1e-8
            && probe[1] <= standCeil + 1e-4 && probe[1] >= entryY - 1e-4) { landed = probe; break; }
          if (probeY <= entryY) break;
        }
        if (!landed) continue;
        if ((landed[0] - beforeX) * dx + (landed[2] - beforeZ) * dz >= 0.5 * wantedSq) sides = false;
        feet[0] = landed[0];
        feet[1] = landed[1];
        feet[2] = landed[2];
        break;
      }
    }
    out.sides = sides;

    const vx0 = feet[0], vy0 = feet[1], vz0 = feet[2];
    feet[1] += dy;
    let column = hOut.grounded ? null : this._column(feet[0], feet[2]);
    this._resolveCapsule(feet, out, height, Infinity, dy > 0, column !== null && columnClear(column, feet[1], height));
    if (dy < 0 && out.grounded && ((feet[0] - vx0) ** 2 + (feet[2] - vz0) ** 2) > 1e-12) {
      let lo = 0, hi = -dy;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        const probe = at3(P_BISECT, vx0, vy0 - mid, vz0);
        const pOut = blank(OUT_BISECT);
        this._resolveCapsule(probe, pOut, height);
        if ((probe[0] - vx0) ** 2 + (probe[1] - (vy0 - mid)) ** 2 + (probe[2] - vz0) ** 2 < 1e-12) lo = mid; else hi = mid;
      }
      const stop = at3(P_STOP, vx0, vy0 - lo, vz0);
      const sOut = blank(OUT_STOP);
      this._resolveCapsule(stop, sOut, height);
      if (sOut.grounded) {
        feet[0] = stop[0]; feet[1] = stop[1]; feet[2] = stop[2];
        out.grounded = true; out.hitCeiling = sOut.hitCeiling; out.pushedDown = sOut.pushedDown;
        out.groundKey = sOut.groundKey; out.groundY = sOut.groundY;
      }
    }

    if (snap && dy <= 0 && !out.grounded) {
      if (column === null || feet[0] !== vx0 || feet[2] !== vz0) column = this._column(feet[0], feet[2]);
      for (let y = feet[1] - STEP_OFFSET / 8; y >= feet[1] - STEP_OFFSET - 1e-9; y -= STEP_OFFSET / 8) {
        if (columnClear(column, y, height)) continue;
        const probe = at3(P_SNAP, feet[0], y, feet[2]);
        const probeOut = blank(OUT_SNAP);
        this._resolveCapsule(probe, probeOut, height);
        const slidSq = (probe[0] - feet[0]) ** 2 + (probe[2] - feet[2]) ** 2;
        if (probeOut.grounded && !probeOut.pushedDown && slidSq <= (STEP_OFFSET / 8) ** 2
          && probe[1] > feet[1] - STEP_OFFSET + 1e-4 && probe[1] <= feet[1] + 1e-4) {
          const settle = at3(P_SETTLE, probe[0], probe[1] - SKIN, probe[2]);
          const settleOut = blank(OUT_SETTLE);
          this._resolveCapsule(settle, settleOut, height);
          const settled = settleOut.grounded && !settleOut.pushedDown && settle[1] <= probe[1] + 1e-6
            && (settle[0] - probe[0]) ** 2 + (settle[2] - probe[2]) ** 2 <= (STEP_OFFSET / 8) ** 2;
          const land = settled ? settle : probe;
          feet[0] = land[0]; feet[1] = land[1]; feet[2] = land[2];
          out.grounded = true;
          out.groundKey = (settled ? settleOut : probeOut).groundKey;
          break;
        }
      }
    }

    const floor = this.restFloor(feet[0], feet[2]);
    const floorReach = Math.max(STEP_OFFSET, Math.hypot(feet[0] - beforeX, feet[2] - beforeZ) * TAN_SLOPE_LIMIT);
    if (snap && dy <= 0 && !out.grounded && feet[1] > floor && feet[1] - floor <= floorReach) {
      const probe = at3(P_FLOOR, feet[0], floor, feet[2]);
      const probeOut = blank(OUT_FLOOR);
      if (column === null || !columnClear(column, floor, height)) this._resolveCapsule(probe, probeOut, height);
      if (!probeOut.hitCeiling && Math.abs(probe[0] - feet[0]) < 1e-6 && Math.abs(probe[2] - feet[2]) < 1e-6 && Math.abs(probe[1] - floor) < 1e-6) {
        feet[1] = floor;
        out.grounded = true;
      }
    }
    if (feet[1] < floor + SKIN && !(dy > 0 && feet[1] >= floor)) {
      if (dy <= 0) out.grounded = true;
      feet[1] = floor;
    }
    return out;
  }
}

const ZERO3 = [0, 0, 0];
function rebake(bucket, positions, indices, m) {
  const n = indices.length / 3, tris = bucket.tris, grid = bucket.grid, mn = bucket.min, mx = bucket.max;
  if (bucket.parts !== 1 || tris.length !== n || bucket.wide.length) return false;
  for (const cell of grid.values()) cell.length = 0;
  mn[0] = mn[1] = mn[2] = Infinity; mx[0] = mx[1] = mx[2] = -Infinity;
  const mirrored = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]) < 0;
  let filled = 0;
  for (let idx = 0; idx < n; idx++) {
    const tri = tris[idx], i = idx * 3;
    for (let j = 0; j < 3; j++) {
      const v = tri[j], at = indices[j === 0 ? i : (j === 1) !== mirrored ? i + 1 : i + 2] * 3;
      const x = positions[at], y = positions[at + 1], z = positions[at + 2];
      v[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      v[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      v[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    const a = tri[0], b = tri[1], c = tri[2];
    bucket.yLo[idx] = Math.min(a[1], b[1], c[1]);
    bucket.yHi[idx] = Math.max(a[1], b[1], c[1]);
    for (let j = 0; j < 3; j++) {
      const v = tri[j];
      for (let k = 0; k < 3; k++) {
        if (v[k] < mn[k]) mn[k] = v[k];
        if (v[k] > mx[k]) mx[k] = v[k];
      }
    }
    const minX = Math.floor(Math.min(a[0], b[0], c[0]) / CELL), maxX = Math.floor(Math.max(a[0], b[0], c[0]) / CELL);
    const minZ = Math.floor(Math.min(a[2], b[2], c[2]) / CELL), maxZ = Math.floor(Math.max(a[2], b[2], c[2]) / CELL);
    if ((maxX - minX + 1) * (maxZ - minZ + 1) > FINE_CELLS_MAX) return false;
    for (let gx = minX; gx <= maxX; gx++) {
      for (let gz = minZ; gz <= maxZ; gz++) {
        const k = cellKey(gx, gz);
        let cell = grid.get(k);
        if (!cell) { cell = []; grid.set(k, cell); }
        if (!cell.length) filled++;
        cell.push(idx);
      }
    }
  }
  if (grid.size > 2 * filled + 64) for (const [k, cell] of grid) if (!cell.length) grid.delete(k);
  return true;
}
const UP3 = [0, 1, 0];
const CROSSING_SAME = 1e-4;
const SWEEP_HELD = new Set();
const SWEEP_FIRST = new Map();
const SWEEP_HIT = [0, 0, 0, 0];
const HOLD_CROSSINGS = new Map();

function partsHolding(bucket, lx, ly, lz, out) {
  if (lx < bucket.min[0] || lx > bucket.max[0] || lz < bucket.min[2] || lz > bucket.max[2] || ly > bucket.max[1]) return out;
  const crossings = HOLD_CROSSINGS;
  crossings.clear();
  const cross = (ti) => {
    if (bucket.yHi[ti] < ly) return;
    if (bucket.sight !== null && bucket.sight[ti]) return;
    const tri = bucket.tris[ti];
    const h = rayTriangle(lx, ly, lz, UP3, tri[0], tri[1], tri[2]);
    if (h === null) return;
    const part = bucket.part[ti];
    const list = crossings.get(part);
    if (list) list.push(h); else crossings.set(part, [h]);
  };
  const cell = bucket.grid.get(cellKey(Math.floor(lx / CELL), Math.floor(lz / CELL)));
  if (cell) for (const ti of cell) cross(ti);
  if (bucket.wide.length) for (const ti of wideOnRay(bucket, lx, ly, lz, UP3, bucket.max[1] - ly + 1)) cross(ti);
  for (const [part, hits] of crossings) {
    hits.sort((a, b) => a - b);
    let n = 0, last = -Infinity;
    for (const x of hits) { if (x - last > CROSSING_SAME) n++; last = x; }
    if (n & 1) out.add(part);
  }
  return out;
}

export function sweepSphereTriangle(cx, cy, cz, r, dx, dy, dz, L, a, b, c, out) {
  const r2 = r * r;
  closestPointOnTriangle(cx, cy, cz, a, b, c, TMP);
  const qx = cx - TMP[0], qy = cy - TMP[1], qz = cz - TMP[2];
  if (qx * qx + qy * qy + qz * qz <= r2) { out[0] = 0; out[1] = TMP[0]; out[2] = TMP[1]; out[3] = TMP[2]; return true; }
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
  const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  const n0x = e1y * e2z - e1z * e2y, n0y = e1z * e2x - e1x * e2z, n0z = e1x * e2y - e1y * e2x;
  const nl = Math.hypot(n0x, n0y, n0z);
  if (nl > 1e-12) {
    let nx = n0x / nl, ny = n0y / nl, nz = n0z / nl;
    let s = nx * (cx - a[0]) + ny * (cy - a[1]) + nz * (cz - a[2]);
    if (s < 0) { s = -s; nx = -nx; ny = -ny; nz = -nz; }
    const nd = nx * dx + ny * dy + nz * dz;
    if (nd < -1e-12 && s >= r) {
      const tp = (s - r) / -nd;
      if (tp <= L) {
        const px = cx + dx * tp - nx * r, py = cy + dy * tp - ny * r, pz = cz + dz * tp - nz * r;
        const tol = -1e-9 * nl;
        if (edgeSide(e1x, e1y, e1z, px - a[0], py - a[1], pz - a[2], n0x, n0y, n0z) >= tol
          && edgeSide(c[0] - b[0], c[1] - b[1], c[2] - b[2], px - b[0], py - b[1], pz - b[2], n0x, n0y, n0z) >= tol
          && edgeSide(a[0] - c[0], a[1] - c[1], a[2] - c[2], px - c[0], py - c[1], pz - c[2], n0x, n0y, n0z) >= tol) {
          out[0] = tp; out[1] = px; out[2] = py; out[3] = pz;
          return true;
        }
      }
    }
  }
  let best = sweepEdge(cx, cy, cz, r2, dx, dy, dz, L, a, b, Infinity, out);
  best = sweepEdge(cx, cy, cz, r2, dx, dy, dz, L, b, c, best, out);
  best = sweepEdge(cx, cy, cz, r2, dx, dy, dz, L, c, a, best, out);
  best = sweepCorner(cx, cy, cz, r2, dx, dy, dz, L, a, best, out);
  best = sweepCorner(cx, cy, cz, r2, dx, dy, dz, L, b, best, out);
  best = sweepCorner(cx, cy, cz, r2, dx, dy, dz, L, c, best, out);
  if (best === Infinity) return false;
  out[0] = best;
  return true;
}
const edgeSide = (ux, uy, uz, vx, vy, vz, nx, ny, nz) => (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
function sweepEdge(cx, cy, cz, r2, dx, dy, dz, L, p, q, best, out) {
  const ex = q[0] - p[0], ey = q[1] - p[1], ez = q[2] - p[2];
  const wx = cx - p[0], wy = cy - p[1], wz = cz - p[2];
  const ee = ex * ex + ey * ey + ez * ez, ed = ex * dx + ey * dy + ez * dz, ew = ex * wx + ey * wy + ez * wz;
  const A = ee - ed * ed;
  if (A <= 1e-12 * ee) return best;
  const B = 2 * (ee * (dx * wx + dy * wy + dz * wz) - ed * ew);
  const C = ee * (wx * wx + wy * wy + wz * wz - r2) - ew * ew;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return best;
  const tt = (-B - Math.sqrt(disc)) / (2 * A);
  if (tt < 0 || tt > L || tt >= best) return best;
  const f = (ed * tt + ew) / ee;
  if (f < 0 || f > 1) return best;
  out[1] = p[0] + ex * f; out[2] = p[1] + ey * f; out[3] = p[2] + ez * f;
  return tt;
}
function sweepCorner(cx, cy, cz, r2, dx, dy, dz, L, v, best, out) {
  const wx = cx - v[0], wy = cy - v[1], wz = cz - v[2];
  const B = 2 * (dx * wx + dy * wy + dz * wz), C = wx * wx + wy * wy + wz * wz - r2;
  const disc = B * B - 4 * C;
  if (disc < 0) return best;
  const tt = (-B - Math.sqrt(disc)) / 2;
  if (tt < 0 || tt > L || tt >= best) return best;
  out[1] = v[0]; out[2] = v[1]; out[3] = v[2];
  return tt;
}
const TMP = [0, 0, 0];
const UP = Object.freeze([0, 1, 0]);
const BODY_RAY = Object.freeze({ bodies: true });
const STAND_INSET = 2 * SKIN;
const STAND_ORIGIN = [0, 0, 0];
const STAND_SPREAD = CAPSULE_RADIUS / 2;
const STAND_ACROSS = Object.freeze([0, 1, -1]);
const minmod = (a, b) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);
const MID_SCRATCH = [];
const LOW_OUT = { grounded: false, hitCeiling: false, pushedDown: false, groundKey: null, groundY: undefined };
const at3 = (a, x, y, z) => { a[0] = x; a[1] = y; a[2] = z; return a; };
const blank = (o) => { o.grounded = false; o.hitCeiling = false; o.pushedDown = false; o.groundKey = undefined; o.groundY = undefined; o.refused = undefined; return o; };
const newOut = () => blank({});
const CAP_LOW = [0, 0, 0], CAP_HIGH = [0, 0, 0], P_TIGHT = [0, 0, 0], P_RAISED = [0, 0, 0], P_RETRY = [0, 0, 0], P_LAND = [0, 0, 0];
const P_BISECT = [0, 0, 0], P_STOP = [0, 0, 0], P_SNAP = [0, 0, 0], P_SETTLE = [0, 0, 0], P_FLOOR = [0, 0, 0];
const OUT_TIGHT = newOut(), OUT_SIDE = newOut(), OUT_RAISED = newOut(), OUT_RETRY = newOut(), OUT_LAND = newOut();
const OUT_BISECT = newOut(), OUT_STOP = newOut(), OUT_SNAP = newOut(), OUT_SETTLE = newOut(), OUT_FLOOR = newOut();
const BEAD_OVERLAP = 0.95;

function rayTriangle(ox, oy, oz, d, a, b, c) {
  const e1x = b[0] - a[0]; const e1y = b[1] - a[1]; const e1z = b[2] - a[2];
  const e2x = c[0] - a[0]; const e2y = c[1] - a[1]; const e2z = c[2] - a[2];
  const px = d[1] * e2z - d[2] * e2y;
  const py = d[2] * e2x - d[0] * e2z;
  const pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det;
  const tx = ox - a[0]; const ty = oy - a[1]; const tz = oz - a[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-4 ? t : null;
}
