// @ts-check
// A ship's walkable deck, in her mesh node's frame: the swell moves that node and never her root.

import { STEP_OFFSET } from '../../player/motor.js';

export const DECK_CELL = 0.5;
export const DECK_FLAT = Math.cos(30 * Math.PI / 180);
export const DECK_HEADROOM = 1.7;
export const DECK_STEP = 0.4;
export const DECK_INSET = 1;
export const DECK_JOIN = STEP_OFFSET;
export const DECK_BENCH = 0.9;
export const FLIGHT_OVER = 1;
export const FLIGHT_CELLS = 24;
export const FLIGHT_JOIN = 2 * DECK_JOIN;
export const DECK_FLOOR = DECK_STEP / 2;
const LEVEL_BIN = 0.25;
const WALL_NY = 0.05;
const SIDE_STEPS = Object.freeze([[0, -1], [-1, 0], [1, 0], [0, 1]].map((s) => Object.freeze(s)));

/** @param {ArrayLike<number>} m @param {ArrayLike<number>} p @param {number[]} [out] */
export function intoDeck(m, p, out = [0, 0, 0]) {
  const a00 = m[0], a10 = m[1], a20 = m[2], a01 = m[4], a11 = m[5], a21 = m[6], a02 = m[8], a12 = m[9], a22 = m[10];
  const c00 = a11 * a22 - a12 * a21, c01 = a12 * a20 - a10 * a22, c02 = a10 * a21 - a11 * a20;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  const k = det ? 1 / det : 0;
  const x = p[0] - m[12], y = p[1] - m[13], z = p[2] - m[14];
  out[0] = (c00 * x + (a02 * a21 - a01 * a22) * y + (a01 * a12 - a02 * a11) * z) * k;
  out[1] = (c01 * x + (a00 * a22 - a02 * a20) * y + (a02 * a10 - a00 * a12) * z) * k;
  out[2] = (c02 * x + (a01 * a20 - a00 * a21) * y + (a00 * a11 - a01 * a10) * z) * k;
  return out;
}

/** @param {ArrayLike<number>} m @param {ArrayLike<number>} q @param {number[]} [out] */
export function outOfDeck(m, q, out = [0, 0, 0]) {
  const x = q[0], y = q[1], z = q[2];
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}

/**
 * @param {{ positions: ArrayLike<number>, indices: ArrayLike<number>, moves?: boolean }[]} meshes
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} extent
 * @param {{ cell?: number, inset?: number }} [opts]
 */
export function buildDeck(meshes, extent, { cell = DECK_CELL, inset = DECK_INSET } = {}) {
  const nx = Math.max(1, Math.ceil((extent.maxX - extent.minX) / cell));
  const nz = Math.max(1, Math.ceil((extent.maxZ - extent.minZ) / cell));
  const minX = extent.minX, minZ = extent.minZ;
  /** @type {number[][]} */
  const surf = Array.from({ length: nx * nz }, () => []);
  /** @type {number[][]} */
  const flat = Array.from({ length: nx * nz }, () => []);
  /** @type {number[][]} */
  const upFlat = Array.from({ length: nx * nz }, () => []);
  /** @type {number[][]} */
  const walls = Array.from({ length: nx * nz }, () => []);
  /** @type {number[][]} */
  const leaves = Array.from({ length: nx * nz }, () => []);
  /** @type {number[][]} */
  const lids = Array.from({ length: nx * nz }, () => []);
  /** @type {number[][]} */
  const midX = Array.from({ length: nx * nz }, () => []), midZ = Array.from({ length: nx * nz }, () => []);
  const flatAt = (into, ox, oz, ni, nk, ax, ay, az, bx, by, bz, cx, cy, cz, det) => {
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / cell - ox)), i1 = Math.min(ni - 1, Math.ceil((Math.max(ax, bx, cx) - minX) / cell - ox));
    const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / cell - oz)), k1 = Math.min(nk - 1, Math.ceil((Math.max(az, bz, cz) - minZ) / cell - oz));
    for (let k = k0; k <= k1; k++) {
      const z = minZ + (k + oz) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = minX + (i + ox) * cell;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        into[k * nx + i].push(l1 * ay + l2 * by + l3 * cy);
      }
    }
  };
  const CUT = Array.from({ length: 5 }, () => new Float64Array(24));
  const cutTo = (src, n, dst, axis, v, sign) => {
    let m = 0;
    for (let q = 0; q < n; q++) {
      const p = q * 3, r = q + 1 < n ? p + 3 : 0;
      const dp = sign * (src[p + axis] - v), dr = sign * (src[r + axis] - v);
      if (dp >= 0) { dst[m] = src[p]; dst[m + 1] = src[p + 1]; dst[m + 2] = src[p + 2]; m += 3; }
      if ((dp > 0 && dr < 0) || (dp < 0 && dr > 0)) {
        const t = dp / (dp - dr);
        dst[m] = src[p] + (src[r] - src[p]) * t; dst[m + 1] = src[p + 1] + (src[r + 1] - src[p + 1]) * t; dst[m + 2] = src[p + 2] + (src[r + 2] - src[p + 2]) * t;
        m += 3;
      }
    }
    return m / 3;
  };
  const wallFace = (into, ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const [T, R, U, C, D] = CUT;
    T[0] = ax; T[1] = ay; T[2] = az; T[3] = bx; T[4] = by; T[5] = bz; T[6] = cx; T[7] = cy; T[8] = cz;
    const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / cell)), k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - minZ) / cell));
    for (let k = k0; k <= k1; k++) {
      const z0 = minZ + k * cell, z1 = z0 + cell;
      const n = cutTo(R, cutTo(T, 3, R, 2, z0, 1), U, 2, z1, -1);
      if (n < 1) continue;
      let lo = Infinity, hi = -Infinity;
      for (let q = 0; q < n * 3; q += 3) { if (U[q] < lo) lo = U[q]; if (U[q] > hi) hi = U[q]; }
      const i0 = Math.max(0, Math.floor((lo - minX) / cell)), i1 = Math.min(nx - 1, Math.floor((hi - minX) / cell));
      for (let i = i0; i <= i1; i++) {
        const x0 = minX + i * cell, x1 = x0 + cell;
        const m = cutTo(C, cutTo(U, n, C, 0, x0, 1), D, 0, x1, -1);
        if (m < 1) continue;
        let bottom = Infinity, top = -Infinity;
        for (let q = 1; q < m * 3; q += 3) { if (D[q] < bottom) bottom = D[q]; if (D[q] > top) top = D[q]; }
        into[k * nx + i].push(bottom, top);
      }
    }
  };
  for (const m of meshes) {
    const p = m.positions, ix = m.indices, moves = !!m.moves;
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const ax = p[a], ay = p[a + 1], az = p[a + 2], bx = p[b], by = p[b + 1], bz = p[b + 2], cx = p[c], cy = p[c + 1], cz = p[c + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nX = uy * vz - uz * vy, nY = uz * vx - ux * vz, nZ = ux * vy - uy * vx;
      const len = Math.hypot(nX, nY, nZ);
      if (!(len > 1e-12)) continue;
      if (Math.abs(nY) < WALL_NY * len) { wallFace(moves ? leaves : walls, ax, ay, az, bx, by, bz, cx, cy, cz); continue; }
      // A part that opens counts as a wall when shut and never as a floor: the deck cannot know its state.
      const isFlat = Math.abs(nY) >= DECK_FLAT * len;
      if (moves && !(isFlat && nY > 0)) continue;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / cell - 0.5)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - minX) / cell - 0.5));
      const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / cell - 0.5)), k1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - minZ) / cell - 0.5));
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) continue;
      for (let k = k0; k <= k1; k++) {
        const z = minZ + (k + 0.5) * cell;
        for (let i = i0; i <= i1; i++) {
          const x = minX + (i + 0.5) * cell;
          const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
          const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
          const l3 = 1 - l1 - l2;
          if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
          const y = l1 * ay + l2 * by + l3 * cy;
          if (moves) { lids[k * nx + i].push(y); continue; }
          surf[k * nx + i].push(y);
          if (isFlat) { flat[k * nx + i].push(y); if (nY > 0) upFlat[k * nx + i].push(y); }
        }
      }
      if (isFlat && nY > 0 && !moves) {
        flatAt(midX, 1, 0.5, nx - 1, nz, ax, ay, az, bx, by, bz, cx, cy, cz, det);
        flatAt(midZ, 0.5, 1, nx, nz - 1, ax, ay, az, bx, by, bz, cx, cy, cz, det);
      }
    }
  }
  const linked = (j, n, h1, h2) => {
    const d = Math.abs(h1 - h2);
    if (d <= DECK_JOIN) return true;
    if (!(d <= FLIGHT_JOIN)) return false;
    const mid = n - j === 1 && n % nx ? midX[j] : j - n === 1 && j % nx ? midX[n] : n - j === nx ? midZ[j] : j - n === nx ? midZ[n] : null;
    if (mid) for (const m of mid) if (Math.abs(m - h1) <= DECK_JOIN && Math.abs(m - h2) <= DECK_JOIN) return true;
    return false;
  };
  const rises = (w, y) => { for (let q = 0; q < w.length; q += 2) if (w[q + 1] > y + DECK_STEP && w[q] < y + DECK_HEADROOM) return true; return false; };
  /** @type {number[][]} */
  const doors = Array.from({ length: nx * nz }, () => []);
  /** @type {number[][]} */
  const cand = surf.map((all, j) => {
    const out = [];
    for (const y of flat[j]) {
      let clear = true;
      for (const o of all) if (o > y + 1e-3 && o < y + DECK_HEADROOM) { clear = false; break; }
      if (!clear || rises(walls[j], y)) continue;
      if (rises(leaves[j], y)) { if (upFlat[j].some((u) => Math.abs(u - y) < 1e-3) && !doors[j].some((q) => Math.abs(q - y) < 1e-3)) doors[j].push(y); continue; }
      if (!out.some((q) => Math.abs(q - y) < 1e-3)) out.push(y);
    }
    return out.sort((q, r) => r - q);
  });
  const bins = new Map();
  for (const c of cand) for (const y of c) { const b = Math.round(y / LEVEL_BIN); bins.set(b, (bins.get(b) ?? 0) + 1); }
  let mainBin = null, most = 0;
  for (const [b, n] of bins) if (n > most || (n === most && mainBin != null && b > mainBin)) { most = n; mainBin = b; }
  const N = nx * nz;
  const y = new Float32Array(N).fill(NaN);
  if (mainBin == null) return deckOf({ cell, minX, minZ, nx, nz, y });
  const main = mainBin * LEVEL_BIN;
  const at = new Int32Array(N + 1), lv = [];
  for (let j = 0; j < N; j++) { at[j] = lv.length; for (let q = cand[j].length - 1; q >= 0; q--) if (cand[j][q] >= main - LEVEL_BIN) lv.push(cand[j][q]); }
  at[N] = lv.length;
  const M = lv.length, nodeCell = new Int32Array(M);
  for (let j = 0; j < N; j++) for (let a = at[j]; a < at[j + 1]; a++) nodeCell[a] = j;
  const joined = (c, h, live, from = -1) => {
    for (let a = at[c]; a < at[c + 1]; a++) if (live[a] && Math.abs(lv[a] - h) <= DECK_JOIN) return a;
    if (from >= 0) for (let a = at[c]; a < at[c + 1]; a++) if (live[a] && linked(from, c, h, lv[a])) return a;
    return -1;
  };
  const bench = (c, h) => {
    let floor = NaN;
    for (const q of flat[c]) if (Math.abs(q - h) <= DECK_STEP && !(Math.abs(floor - h) <= Math.abs(q - h))) floor = q;
    if (Number.isNaN(floor)) return false;
    let seat = false;
    for (const s of surf[c]) {
      if (!(s > floor + 1e-3 && s < floor + DECK_HEADROOM)) continue;
      if (s <= floor + DECK_STEP || s > floor + DECK_BENCH || !flat[c].includes(s)) return false;
      seat = true;
    }
    for (let pass = 0; pass < 2; pass++) {
      const w = pass ? leaves[c] : walls[c];
      for (let q = 0; q < w.length; q += 2) {
        if (!(w[q + 1] > floor + DECK_STEP && w[q] < floor + DECK_HEADROOM)) continue;
        if (w[q] <= floor + DECK_STEP || w[q + 1] > floor + DECK_BENCH) return false;
        seat = true;
      }
    }
    return seat;
  };
  const settle = (passes) => {
    const live = new Uint8Array(M).fill(1);
    for (let pass = 0; pass < passes; pass++) {
      const edge = [];
      for (let a = 0; a < M; a++) {
        if (!live[a]) continue;
        const j = nodeCell[a], i = j % nx, k = (j - i) / nx, h = lv[a];
        const off = (ii, kk) => ii < 0 || kk < 0 || ii >= nx || kk >= nz || (joined(kk * nx + ii, h, live, j) < 0 && !bench(kk * nx + ii, h));
        if (off(i - 1, k) || off(i + 1, k) || off(i, k - 1) || off(i, k + 1)) edge.push(a);
      }
      for (const a of edge) live[a] = 0;
    }
    return pieced(live);
  };
  const pieced = (live) => {
    const piece = new Int32Array(M).fill(-1), sizes = [];
    for (let a0 = 0; a0 < M; a0++) {
      if (!live[a0] || piece[a0] >= 0) continue;
      const id = sizes.length, queue = [a0];
      piece[a0] = id;
      for (let q = 0; q < queue.length; q++) {
        const a = queue[q], j = nodeCell[a], i = j % nx, k = (j - i) / nx, h = lv[a];
        for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
          if (!di && !dk) continue;
          const ii = i + di, kk = k + dk;
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          const b = joined(kk * nx + ii, h, live, di && dk ? -1 : j);
          if (b < 0 || piece[b] >= 0) continue;
          if (di && dk && (joined(k * nx + ii, h, live, j) < 0 || joined(kk * nx + i, h, live, j) < 0)) continue;
          piece[b] = id;
          queue.push(b);
        }
      }
      sizes.push(queue.length);
    }
    let open = -1;
    for (let p = 0; p < sizes.length; p++) if (open < 0 || sizes[p] > sizes[open]) open = p;
    return { live, piece, open, count: open < 0 ? 0 : sizes[open] };
  };
  const keepFlights = (s0, all) => {
    const high = main + FLIGHT_OVER;
    const sizes = new Int32Array(M);
    for (let a = 0; a < M; a++) if (s0.live[a]) sizes[s0.piece[a]]++;
    const raised = new Uint8Array(M), from = new Uint8Array(M);
    let any = false;
    for (let a = 0; a < M; a++) {
      if (!s0.live[a]) continue;
      if (s0.piece[a] === s0.open) from[a] = 1;
      else if (lv[a] > high && sizes[s0.piece[a]] >= FLIGHT_CELLS) { raised[a] = 1; any = true; }
    }
    if (!any) return s0;
    let s = s0;
    for (;;) {
      const beside = (b, by) => {
        const j = nodeCell[b], i = j % nx, k = (j - i) / nx;
        for (const [ii, kk] of [[i - 1, k], [i + 1, k], [i, k - 1], [i, k + 1]]) {
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          const c = joined(kk * nx + ii, lv[b], s.live, j);
          if (c >= 0 && c !== by && !from[c] && !raised[c]) return true;
        }
        return false;
      };
      const back = new Int32Array(M).fill(-2), queue = [];
      for (let a = 0; a < M; a++) if (from[a]) { back[a] = -1; queue.push(a); }
      let reached = -1;
      for (let q = 0; q < queue.length && reached < 0; q++) {
        const a = queue[q], j = nodeCell[a], i = j % nx, k = (j - i) / nx, h = lv[a];
        for (const [di, dk] of SIDE_STEPS) {
          const ii = i + di, kk = k + dk;
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          const b = joined(kk * nx + ii, h, all, j);
          if (b < 0 || back[b] !== -2) continue;
          if (s.live[b]) {
            if (raised[b] && !from[a]) { back[b] = a; reached = b; break; }
            continue;
          }
          if (beside(b, a)) continue;
          back[b] = a;
          queue.push(b);
        }
      }
      if (reached < 0) return s;
      const live = Uint8Array.from(s.live);
      for (let a = reached; a >= 0; a = back[a]) live[a] = 1;
      s = pieced(live);
    }
  };
  let s = settle(inset);
  if (inset > 0) {
    const bare = settle(0);
    if (s.count * 2 < bare.count) s = bare;
    else s = keepFlights(s, bare.live);
  }
  const top = new Int32Array(N).fill(-1);
  for (let a = 0; a < M; a++) if (s.live[a] && s.piece[a] === s.open) { y[nodeCell[a]] = lv[a]; top[nodeCell[a]] = a; }
  {
    const comp = new Int32Array(N).fill(-1), sizes = [];
    for (let j0 = 0; j0 < N; j0++) {
      if (Number.isNaN(y[j0]) || comp[j0] >= 0) continue;
      const c = sizes.length, stack = [j0];
      let n = 0;
      comp[j0] = c;
      while (stack.length) {
        const j = /** @type {number} */ (stack.pop()), i = j % nx;
        n++;
        for (let q = 0; q < 4; q++) {
          const b = q === 0 ? (i > 0 ? j - 1 : -1) : q === 1 ? (i < nx - 1 ? j + 1 : -1) : q === 2 ? j - nx : j + nx;
          if (b < 0 || b >= N || comp[b] >= 0 || Number.isNaN(y[b]) || !linked(j, b, y[j], y[b])) continue;
          comp[b] = c; stack.push(b);
        }
      }
      sizes.push(n);
    }
    let big = 0;
    for (let c = 1; c < sizes.length; c++) if (sizes[c] > sizes[big]) big = c;
    for (let j = 0; j < N; j++) if (comp[j] >= 0 && comp[j] !== big) { y[j] = NaN; top[j] = -1; }
  }
  const moreAt = new Int32Array(N + 1), moreY = [], morePiece = [], ids = new Map();
  for (let j = 0; j < N; j++) {
    moreAt[j] = moreY.length;
    for (let a = at[j]; a < at[j + 1]; a++) {
      if (!s.live[a] || a === top[j]) continue;
      let p = 0;
      if (s.piece[a] !== s.open) { p = ids.get(s.piece[a]) ?? ids.size + 1; ids.set(s.piece[a], p); }
      moreY.push(lv[a]); morePiece.push(p);
    }
  }
  moreAt[N] = moreY.length;
  const floorAt = new Int32Array(N + 1), floorY = [];
  for (let j = 0; j < N; j++) {
    floorAt[j] = floorY.length;
    const up = upFlat[j];
    for (const q of cand[j]) for (let n = 0; n < up.length; n++) if (Math.abs(up[n] - q) < 1e-3) { floorY.push(q); break; }
  }
  floorAt[N] = floorY.length;
  const ajarAt = new Int32Array(N + 1), ajarY = [];
  {
    const sets = Array.from({ length: N }, () => []);
    const add = (j, h) => { if (sets[j].some((q) => Math.abs(q - h) < 1e-3)) return false; sets[j].push(h); return true; };
    let front = [];
    for (let j = 0; j < N; j++) {
      for (const h of lids[j]) if (add(j, h)) front.push(j, h);
      for (const h of doors[j]) if (h >= main - LEVEL_BIN && add(j, h)) front.push(j, h);
    }
    for (let pass = 0; pass < inset && front.length; pass++) {
      const next = [];
      for (let q = 0; q < front.length; q += 2) {
        const j = front[q], h = front[q + 1], i = j % nx, k = (j - i) / nx;
        for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, kk = k + dk;
          if ((!di && !dk) || ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          const c = kk * nx + ii;
          for (let a = at[c]; a < at[c + 1]; a++) if (!s.live[a] && Math.abs(lv[a] - h) <= DECK_JOIN && add(c, lv[a])) next.push(c, lv[a]);
        }
      }
      front = next;
    }
    for (let j = 0; j < N; j++) { ajarAt[j] = ajarY.length; for (const h of sets[j]) ajarY.push(h); }
    ajarAt[N] = ajarY.length;
  }
  let flights = null;
  for (let j = 0; j < N; j++) {
    if (Number.isNaN(y[j])) continue;
    if ((j + 1) % nx && Math.abs(y[j + 1] - y[j]) > DECK_JOIN && linked(j, j + 1, y[j], y[j + 1])) (flights ??= new Uint8Array(N))[j] |= 1;
    if (j + nx < N && Math.abs(y[j + nx] - y[j]) > DECK_JOIN && linked(j, j + nx, y[j], y[j + nx])) (flights ??= new Uint8Array(N))[j] |= 2;
  }
  return deckOf({ cell, minX, minZ, nx, nz, y, more: { at: moreAt, y: Float32Array.from(moreY), piece: Int32Array.from(morePiece) }, floors: { at: floorAt, y: Float32Array.from(floorY) }, flights, ajar: { at: ajarAt, y: Float32Array.from(ajarY) } });
}

const _levels = new WeakMap();
export function mainLevel(deck) {
  const was = _levels.get(deck);
  if (was !== undefined) return was;
  const ys = [];
  for (let j = 0; j < deck.y.length; j++) if (!Number.isNaN(deck.y[j])) ys.push(deck.y[j]);
  ys.sort((a, b) => a - b);
  const level = ys.length ? ys[ys.length >> 1] : 0;
  _levels.set(deck, level);
  return level;
}

const NO_SPOTS = Object.freeze([]);

/**
 * @param {{ cell: number, minX: number, minZ: number, nx: number, nz: number, y: Float32Array,
 *   more?: { at: Int32Array, y: Float32Array, piece: Int32Array } | null, floors?: { at: Int32Array, y: Float32Array } | null,
 *   flights?: Uint8Array | null, ajar?: { at: Int32Array, y: Float32Array } | null }} g
 */
export function deckOf(g) {
  const { cell, minX, minZ, nx, nz, y } = g;
  const more = g.more ?? null, floors = g.floors ?? null, flights = g.flights ?? null, ajar = g.ajar ?? null;
  const steps = (j, n) => {
    const d = Math.abs(y[n] - y[j]);
    if (d <= DECK_JOIN) return true;
    if (!flights || !(d <= FLIGHT_JOIN)) return false;
    return n - j === 1 ? (n % nx !== 0 && (flights[j] & 1) !== 0) : j - n === 1 ? (j % nx !== 0 && (flights[n] & 1) !== 0)
      : n - j === nx ? (flights[j] & 2) !== 0 : j - n === nx ? (flights[n] & 2) !== 0 : false;
  };
  const cellOf = (x, z) => {
    const i = Math.floor((x - minX) / cell), k = Math.floor((z - minZ) / cell);
    return i < 0 || k < 0 || i >= nx || k >= nz ? -1 : k * nx + i;
  };
  const centre = (j) => { const i = j % nx, k = (j - i) / nx; return [minX + (i + 0.5) * cell, y[j], minZ + (k + 0.5) * cell]; };
  const levelOf = (j, p) => {
    if (p <= 0) return y[j];
    if (more) for (let n = more.at[j]; n < more.at[j + 1]; n++) if (more.piece[n] === p) return more.y[n];
    return NaN;
  };
  const floorNear = (j, p, h) => {
    let best = p > 0 ? NaN : y[j], d = Number.isNaN(best) ? Infinity : Math.abs(best - h);
    if (more) for (let n = more.at[j]; n < more.at[j + 1]; n++) {
      if (p >= 0 && more.piece[n] !== p) continue;
      const e = Math.abs(more.y[n] - h);
      if (e < d) { d = e; best = more.y[n]; }
    }
    return best;
  };
  let pieces = 1;
  if (more) for (let n = 0; n < more.piece.length; n++) if (more.piece[n] >= pieces) pieces = more.piece[n] + 1;
  let ringBest = -1, ringD = Infinity, qx = 0, qz = 0, ringPiece = 0, ringLevel = NaN, ringBand = DECK_STEP, ringNear = false, ringH = NaN;
  const visit = (i, k) => {
    if (i < 0 || k < 0 || i >= nx || k >= nz) return;
    const j = k * nx + i;
    const h = ringNear ? floorNear(j, ringPiece, ringLevel) : ringPiece ? levelOf(j, ringPiece) : y[j];
    if (Number.isNaN(h) || Math.abs(h - ringLevel) > ringBand) return;
    const x0 = minX + i * cell, z0 = minZ + k * cell;
    const dx = qx < x0 ? x0 - qx : qx > x0 + cell ? qx - x0 - cell : 0;
    const dz = qz < z0 ? z0 - qz : qz > z0 + cell ? qz - z0 - cell : 0;
    const d = dx * dx + dz * dz;
    if (d < ringD) { ringD = d; ringBest = j; ringH = h; }
  };
  const nearestCell = (x, z, p = 0, level = NaN, band = DECK_STEP, near = false) => {
    if (!count || p >= pieces) return -1;
    ringBest = -1; ringD = Infinity; qx = x; qz = z; ringPiece = near ? p : p > 0 ? p : 0; ringLevel = level ?? NaN; ringBand = band; ringNear = near;
    const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cell)));
    const ck = Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cell)));
    const far = Math.max(ci, nx - 1 - ci, ck, nz - 1 - ck);
    for (let r = 0; r <= far; r++) {
      for (let k = ck - r; k <= ck + r; k++) {
        if (k === ck - r || k === ck + r) for (let i = ci - r; i <= ci + r; i++) visit(i, k);
        else { visit(ci - r, k); visit(ci + r, k); }
      }
      if (ringBest >= 0 && ringD <= (r * cell) ** 2) break;
    }
    return ringBest;
  };
  const squareOf = (j, x, z, out, piece) => {
    const i = j % nx, k = (j - i) / nx, e = cell * 1e-3;
    const x0 = minX + i * cell, z0 = minZ + k * cell;
    out[0] = Math.min(x0 + cell - e, Math.max(x0 + e, x));
    out[1] = piece > 0 ? levelOf(j, piece) : y[j];
    out[2] = Math.min(z0 + cell - e, Math.max(z0 + e, z));
    return out;
  };
  const lineOnDeck = (p0, p1) => {
    let i = Math.floor((p0[0] - minX) / cell), k = Math.floor((p0[2] - minZ) / cell);
    const i1 = Math.floor((p1[0] - minX) / cell), k1 = Math.floor((p1[2] - minZ) / cell);
    if (i < 0 || k < 0 || i >= nx || k >= nz || Number.isNaN(y[k * nx + i])) return false;
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2], si = Math.sign(dx), sk = Math.sign(dz);
    const tdx = si ? cell / Math.abs(dx) : Infinity, tdz = sk ? cell / Math.abs(dz) : Infinity;
    let tx = si ? (minX + (si > 0 ? i + 1 : i) * cell - p0[0]) / dx : Infinity;
    let tz = sk ? (minZ + (sk > 0 ? k + 1 : k) * cell - p0[2]) / dz : Infinity;
    let was = k * nx + i;
    const on = (ii, kk) => ii >= 0 && kk >= 0 && ii < nx && kk < nz && !Number.isNaN(y[kk * nx + ii]) && steps(was, kk * nx + ii);
    for (let n = Math.abs(i1 - i) + Math.abs(k1 - k); (i !== i1 || k !== k1) && n >= 0; n--) {
      if (Math.abs(tx - tz) < 1e-9) {
        if (!on(i + si, k) || !on(i, k + sk)) return false;
        i += si; k += sk; tx += tdx; tz += tdz;
      } else if (tx < tz) { i += si; tx += tdx; } else { k += sk; tz += tdz; }
      if (!on(i, k)) return false;
      was = k * nx + i;
    }
    return i === i1 && k === k1;
  };
  const cost = new Float64Array(y.length), from = new Int32Array(y.length), seen = new Uint32Array(y.length), shut = new Uint32Array(y.length);
  const heapF = [], heapJ = [];
  let stamp = 0;
  const heapPush = (f, j) => {
    let n = heapF.length;
    heapF.push(f); heapJ.push(j);
    while (n > 0) {
      const up = (n - 1) >> 1;
      if (heapF[up] <= f) break;
      heapF[n] = heapF[up]; heapJ[n] = heapJ[up]; n = up;
    }
    heapF[n] = f; heapJ[n] = j;
  };
  const heapPop = () => {
    const top = heapJ[0], lastF = heapF.pop(), lastJ = heapJ.pop();
    const len = heapF.length;
    if (len) {
      let n = 0;
      for (;;) {
        const l = 2 * n + 1, r = l + 1;
        let m = n, mf = lastF;
        if (l < len && heapF[l] < mf) { m = l; mf = heapF[l]; }
        if (r < len && heapF[r] < mf) { m = r; mf = heapF[r]; }
        if (m === n) break;
        heapF[n] = heapF[m]; heapJ[n] = heapJ[m]; n = m;
      }
      heapF[n] = lastF; heapJ[n] = lastJ;
    }
    return top;
  };
  let count = 0, sx = 0, sz = 0;
  for (let j = 0; j < y.length; j++) if (!Number.isNaN(y[j])) { count++; const c = centre(j); sx += c[0]; sz += c[2]; }
  const spotsMade = new Map(), spotsAt = new Map();
  let spotCells = null, spotX = null, spotZ = null;
  const deck = {
    ...g,
    count,
    walkable(x, z) { const j = cellOf(x, z); return j >= 0 && !Number.isNaN(y[j]); },
    // With `piece`, only that piece's floors answer, so the leash never sets a body on another piece's floor.
    /** @param {number} x @param {number} z @param {number} [h] @param {number} [piece] */
    heightAt(x, z, h, piece) {
      const j = cellOf(x, z);
      if (j < 0) return NaN;
      const p = piece == null ? -1 : Math.max(0, piece);
      if (h == null || !more) return p > 0 ? NaN : y[j];
      return floorNear(j, p, h);
    },
    /** @param {number} x @param {number} z @param {number} h @param {number} [band] */
    pieceAt(x, z, h, band = Infinity) {
      const j = cellOf(x, z);
      if (j < 0) return -1;
      let best = Number.isNaN(y[j]) ? -1 : 0, d = best < 0 ? Infinity : Math.abs(y[j] - h);
      if (more) for (let n = more.at[j]; n < more.at[j + 1]; n++) { const e = Math.abs(more.y[n] - h); if (e < d) { d = e; best = more.piece[n]; } }
      return d <= band ? best : -1;
    },
    /** @param {number} x @param {number} z @param {number} h */
    ajarAt(x, z, h) {
      const j = ajar ? cellOf(x, z) : -1;
      if (j < 0) return NaN;
      let best = NaN, d = Infinity;
      for (let n = ajar.at[j]; n < ajar.at[j + 1]; n++) { const e = Math.abs(ajar.y[n] - h); if (e < d) { d = e; best = ajar.y[n]; } }
      return best;
    },
    /** @param {number} x @param {number} z @param {number} ref @param {number} [piece] @param {number[]} [out] */
    keep(x, z, ref, piece = 0, out = [0, 0, 0]) {
      const p = piece < 0 ? -1 : piece, c = cellOf(x, z), own = c < 0 ? NaN : floorNear(c, p, ref);
      if (Math.abs(own - ref) <= FLIGHT_JOIN) { out[0] = x; out[1] = own; out[2] = z; return out; }
      const j = nearestCell(x, z, p, ref, FLIGHT_JOIN, true);
      if (j >= 0) { const h = ringH; squareOf(j, x, z, out, 0); out[1] = h; return out; }
      return deck.clamp(x, z, out, Math.max(0, p));
    },
    /** @param {number} x @param {number} z @param {number} h @param {number} [reach] */
    under(x, z, h, reach = 0) {
      const r = Math.ceil(reach / cell), ci = Math.floor((x - minX) / cell), ck = Math.floor((z - minZ) / cell);
      const lo = h - DECK_HEADROOM, hi = h + DECK_STEP, rr = reach * reach;
      for (let k = Math.max(0, ck - r); k <= Math.min(nz - 1, ck + r); k++) {
        for (let i = Math.max(0, ci - r); i <= Math.min(nx - 1, ci + r); i++) {
          const x0 = minX + i * cell, z0 = minZ + k * cell;
          const dx = x < x0 ? x0 - x : x > x0 + cell ? x - x0 - cell : 0, dz = z < z0 ? z0 - z : z > z0 + cell ? z - z0 - cell : 0;
          if (dx * dx + dz * dz > rr) continue;
          const j = k * nx + i;
          if (ajar) for (let n = ajar.at[j]; n < ajar.at[j + 1]; n++) if (ajar.y[n] >= lo && ajar.y[n] <= hi) return true;
          if (floors) { for (let n = floors.at[j]; n < floors.at[j + 1]; n++) if (floors.y[n] >= lo && floors.y[n] <= hi) return true; continue; }
          if (y[j] >= lo && y[j] <= hi) return true;
          if (more) for (let n = more.at[j]; n < more.at[j + 1]; n++) if (more.y[n] >= lo && more.y[n] <= hi) return true;
        }
      }
      return false;
    },
    /** @param {number} x @param {number} z @param {number} [level] */
    nearest(x, z, level = NaN) {
      const j = nearestCell(x, z, 0, level);
      return j < 0 ? null : centre(j);
    },
    /** @param {number} x @param {number} z @param {number[]} [out]
     *  @param {number} [piece] @param {number} [level] */
    clamp(x, z, out = [0, 0, 0], piece = 0, level = NaN) {
      const j = nearestCell(x, z, piece, level);
      return j < 0 ? null : squareOf(j, x, z, out, piece);
    },
    /** @param {number} x @param {number} z @param {number} h @param {number[]} [out] */
    land(x, z, h, out = [0, 0, 0]) {
      if (!count) return null;
      const on = deck.heightAt(x, z, h);
      if (Math.abs(on - h) <= DECK_STEP) { out[0] = x; out[1] = on; out[2] = z; return out; }
      const lv = mainLevel(deck), k = Math.floor((z - minZ) / cell);
      let j = -1, best = Infinity;
      if (k >= 0 && k < nz) {
        for (let i = 0; i < nx; i++) {
          const c = k * nx + i, x0 = minX + i * cell;
          if (!(Math.abs(y[c] - lv) <= DECK_FLOOR)) continue;
          const dx = x < x0 ? x0 - x : x > x0 + cell ? x - x0 - cell : 0;
          if (dx < best) { best = dx; j = c; }
        }
      }
      if (j < 0) j = nearestCell(x, z, 0, lv, DECK_FLOOR);
      return j < 0 ? null : squareOf(j, x, z, out, 0);
    },
    /** @param {number} side @param {number} z @param {number[]} [out] @param {number} [level] */
    rail(side, z, out = [0, 0, 0], level = NaN) {
      if (!count) return null;
      const k0 = Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cell)));
      for (let r = 0; r < nz; r++) {
        for (let pass = 0; pass < (r ? 2 : 1); pass++) {
          const k = pass ? k0 + r : k0 - r;
          if (k < 0 || k >= nz) continue;
          for (let n = 0; n < nx; n++) {
            const i = side > 0 ? nx - 1 - n : n, j = k * nx + i, x = minX + (i + 0.5) * cell;
            if (x * side < 0) break;
            if (Number.isNaN(y[j]) || Math.abs(y[j] - level) > DECK_STEP) continue;
            out[0] = x; out[1] = y[j]; out[2] = minZ + (k + 0.5) * cell;
            return out;
          }
        }
      }
      return null;
    },
    // Spots are cached and frozen. Distances stay Float64 so ties break the way a fresh sampling breaks them.
    spots(n, level) {
      if (!count || n <= 0) return NO_SPOTS;
      const kept = level == null ? spotsMade : spotsAt.get(level) ?? spotsAt.set(level, new Map()).get(level);
      let made = kept.get(n);
      if (made) return made;
      if (!spotCells) {
        spotCells = new Int32Array(count); spotX = new Float64Array(count); spotZ = new Float64Array(count);
        for (let j = 0, q = 0; j < y.length; j++) {
          if (Number.isNaN(y[j])) continue;
          const i = j % nx, k = (j - i) / nx;
          spotCells[q] = j; spotX[q] = minX + (i + 0.5) * cell; spotZ[q] = minZ + (k + 0.5) * cell; q++;
        }
      }
      let cells = spotCells, xs = spotX, zs = spotZ, m = count;
      if (level != null) {
        const keep = [];
        for (let q = 0; q < count; q++) if (Math.abs(y[spotCells[q]] - level) <= DECK_STEP) keep.push(q);
        if (!keep.length) { kept.set(n, NO_SPOTS); return NO_SPOTS; }
        if (keep.length < count) {
          m = keep.length;
          cells = Int32Array.from(keep, (q) => spotCells[q]); xs = Float64Array.from(keep, (q) => spotX[q]); zs = Float64Array.from(keep, (q) => spotZ[q]);
        }
      }
      if (m === count && kept !== spotsMade) {
        made = spotsMade.get(n);
        if (made) { kept.set(n, made); return made; }
      }
      let first;
      if (m === count) first = deck.nearest(sx / count, sz / count);
      else {
        let cx = 0, cz = 0;
        for (let q = 0; q < m; q++) { cx += xs[q]; cz += zs[q]; }
        cx /= m; cz /= m;
        let b = 0, bd = Infinity;
        for (let q = 0; q < m; q++) { const d = (xs[q] - cx) ** 2 + (zs[q] - cz) ** 2; if (d < bd) { bd = d; b = q; } }
        first = centre(cells[b]);
      }
      const out = [Object.freeze(first)];
      const far = new Float64Array(m).fill(Infinity);
      while (out.length < Math.min(n, m)) {
        const last = out[out.length - 1], lx = last[0], lz = last[2];
        let best = -1, bestD = -1;
        for (let q = 0; q < m; q++) {
          const dx = xs[q] - lx, dz = zs[q] - lz, d = dx * dx + dz * dz;
          if (d < far[q]) far[q] = d;
          if (far[q] > bestD) { bestD = far[q]; best = q; }
        }
        if (bestD <= 0) break;
        out.push(Object.freeze(centre(cells[best])));
      }
      made = Object.freeze(out);
      kept.set(n, made);
      if (m === count) spotsMade.set(n, made);
      return made;
    },
    path(a, b) {
      const s = deck.nearest(a[0], a[1]), e = deck.nearest(b[0], b[1]);
      if (!s || !e) return null;
      const js = cellOf(s[0], s[2]), je = cellOf(e[0], e[2]);
      stamp = (stamp + 1) >>> 0 || 1;
      if (stamp === 1) { seen.fill(0); shut.fill(0); }
      heapF.length = 0; heapJ.length = 0;
      const ex = e[0], ez = e[2];
      const h = (j) => { const i = j % nx, k = (j - i) / nx, dx = minX + (i + 0.5) * cell - ex, dz = minZ + (k + 0.5) * cell - ez; return Math.sqrt(dx * dx + dz * dz); };
      cost[js] = 0; from[js] = -1; seen[js] = stamp;
      heapPush(h(js), js);
      while (heapF.length) {
        const j = heapPop();
        if (shut[j] === stamp) continue;
        shut[j] = stamp;
        if (j === je) break;
        const i = j % nx, k = (j - i) / nx;
        for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
          if (!di && !dk) continue;
          const ii = i + di, kk = k + dk;
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          const n = kk * nx + ii;
          if (shut[n] === stamp || Number.isNaN(y[n]) || !steps(j, n)) continue;
          if (di && dk && !(steps(j, k * nx + ii) && steps(j, kk * nx + i))) continue;
          const c = cost[j] + (di && dk ? Math.SQRT2 : 1) * cell;
          if (seen[n] !== stamp || c < cost[n]) { seen[n] = stamp; cost[n] = c; from[n] = j; heapPush(c + h(n), n); }
        }
      }
      if (shut[je] !== stamp) return null;
      const cells = [];
      for (let j = je; j !== -1; j = from[j]) cells.push(j);
      cells.reverse();
      const out = [centre(cells[0])];
      let at = 0;
      while (at < cells.length - 1) {
        let next = at + 1;
        const p0 = centre(cells[at]);
        for (let q = at + 2; q < cells.length && lineOnDeck(p0, centre(cells[q])); q++) next = q;
        out.push(centre(cells[next]));
        at = next;
      }
      return out;
    },
  };
  return deck;
}
