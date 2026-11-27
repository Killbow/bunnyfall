// @ts-check
// Copies of ARCH3D records are never vendored: the undercroft pieces are listed by id, turn, and place and read
// from the player's own ARCH3D. The module stays pure so a node test rebuilds what the game draws.

export const ARENA_MODEL_ID = 864102;
// Turns 0-3 rotate a quarter turn each about +Y, (x, z) -> (-z, x); turns 4-7 mirror x first.
export const PIECE_TURNS = 8;

/**
 * @param {number[]} v
 * @param {number} turn
 * @returns {number[]}
 */
export function pieceTransform(v, turn) {
  const x = turn >= 4 ? -v[0] : v[0], y = v[1], z = v[2];
  switch (turn & 3) {
    case 0: return [x, y, z];
    case 1: return [-z, y, x];
    case 2: return [-x, y, -z];
    default: return [z, y, -x];
  }
}

/**
 * Indices are widened to 32 bits because the renderer draws with UNSIGNED_INT.
 * @param {any} index
 * @param {Uint8Array} bin
 */
export function decodeArenaModel(index, bin) {
  const a = index.attributes;
  const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const n = index.vertexCount;
  const positions = new Float32Array(buf, a.position.offset, n * 3);
  const normals = new Float32Array(buf, a.normal.offset, n * 3);
  const uvs = new Float32Array(buf, a.uv0.offset, n * 2);
  const indices = Uint32Array.from(new Uint16Array(buf, a.indices.offset, a.indices.count));
  const subMeshes = index.submeshes.filter((s) => s.count > 0).map((s) => ({
    textureArchive: s.archive, textureRecord: s.record, startIndex: s.start, primitiveCount: s.count / 3,
  }));
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices, subMeshes, doors: [] };
}

/**
 * @param {{ positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint32Array, subMeshes: any[] }} classic
 * @param {{ model: number, turn: number, at: number[], keep: 'all' | number[], retexture?: Record<string, number[]> }} piece
 */
export function arenaPieceModel(classic, piece) {
  const keep = piece.keep === 'all' ? null : new Set(piece.keep);
  const mirrored = piece.turn >= 4;
  /** @type {Map<string, number[]>} */
  const groups = new Map();
  for (const sm of classic.subMeshes) {
    for (let t = sm.startIndex / 3; t < sm.startIndex / 3 + sm.primitiveCount; t++) {
      if (keep && !keep.has(t)) continue;
      const to = piece.retexture?.[t] ?? [sm.textureArchive, sm.textureRecord];
      const k = `${to[0]}_${to[1]}`;
      groups.set(k, [...(groups.get(k) ?? []), t]);
    }
  }
  const pos = [], nor = [], uv = [], idx = [], subMeshes = [];
  for (const [k, list] of groups) {
    const [archive, record] = k.split('_').map(Number);
    const startIndex = idx.length;
    for (const t of list) {
      const corners = [0, 1, 2].map((c) => classic.indices[t * 3 + c]);
      if (mirrored) corners.reverse();
      for (const v of corners) {
        const p = pieceTransform([classic.positions[v * 3], classic.positions[v * 3 + 1], classic.positions[v * 3 + 2]], piece.turn);
        const nn = pieceTransform([classic.normals[v * 3], classic.normals[v * 3 + 1], classic.normals[v * 3 + 2]], piece.turn);
        idx.push(pos.length / 3);
        pos.push(p[0] + piece.at[0], p[1] + piece.at[1], p[2] + piece.at[2]);
        nor.push(...nn);
        uv.push(classic.uvs[v * 2], classic.uvs[v * 2 + 1]);
      }
    }
    subMeshes.push({ textureArchive: archive, textureRecord: record, startIndex, primitiveCount: list.length });
  }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), uvs: Float32Array.from(uv), indices: Uint32Array.from(idx), subMeshes, doors: [] };
}

/** @param {any[]} parts */
export function composeArenaModel(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.positions.length / 3; ni += p.indices.length; }
  const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2), indices = new Uint32Array(ni);
  /** @type {Map<string, { archive: number, record: number, runs: { part: number, start: number, count: number, v0: number }[], n: number }>} */
  const byPicture = new Map();
  let v0 = 0;
  parts.forEach((p, pi) => {
    positions.set(p.positions, v0 * 3);
    normals.set(p.normals, v0 * 3);
    uvs.set(p.uvs, v0 * 2);
    for (const s of p.subMeshes) {
      const k = `${s.textureArchive}_${s.textureRecord}`;
      if (!byPicture.has(k)) byPicture.set(k, { archive: s.textureArchive, record: s.textureRecord, runs: [], n: 0 });
      const g = byPicture.get(k);
      g.runs.push({ part: pi, start: s.startIndex, count: s.primitiveCount * 3, v0 });
      g.n += s.primitiveCount;
    }
    v0 += p.positions.length / 3;
  });
  const subMeshes = [];
  let at = 0;
  for (const g of byPicture.values()) {
    const startIndex = at;
    for (const r of g.runs) {
      const src = parts[r.part].indices;
      for (let i = 0; i < r.count; i++) indices[at++] = src[r.start + i] + r.v0;
    }
    subMeshes.push({ textureArchive: g.archive, textureRecord: g.record, startIndex, primitiveCount: g.n });
  }
  if (at < ni) {
    let base = 0;
    for (const p of parts) {
      const named = new Uint8Array(p.indices.length);
      for (const s of p.subMeshes) named.fill(1, s.startIndex, s.startIndex + s.primitiveCount * 3);
      for (let i = 0; i < p.indices.length; i++) if (!named[i]) indices[at++] = p.indices[i] + base;
      base += p.positions.length / 3;
    }
  }
  return { positions, normals, uvs, indices, subMeshes, doors: [] };
}

/**
 * @param {any} index
 * @param {Uint8Array} bin
 * @param {(id: number) => any} classicOf
 */
export function buildArenaModel(index, bin, classicOf) {
  const parts = [decodeArenaModel(index, bin)];
  for (const piece of index.pieces ?? []) {
    const classic = classicOf(piece.model);
    if (classic) parts.push(arenaPieceModel(classic, piece));
  }
  return composeArenaModel(parts);
}

export const STAIR_RISER_MIN = 0.1;
export const STAIR_RISER_MAX = 0.48;
export const TREAD_MIN = 0.15;
export const TREAD_MAX = 0.8;
export const RUN_W_MIN = 0.5;
export const RUN_MIN = 3;
export const RAMP_LIFT = 0.02;
export const RAMP_BELOW = 0.6;

/** @param {{ positions: ArrayLike<number>, indices: ArrayLike<number>, subMeshes: any[] }} model */
export function arenaStairRuns(model) {
  const P = model.positions, I = model.indices;
  /** @type {{ hx: number, hz: number, dist: number, ylo: number, yhi: number, t0: number, t1: number }[]} */
  const risers = [];
  const near = (a, b, e) => Math.abs(a - b) <= e;
  for (const sm of model.subMeshes) {
    for (let t = sm.startIndex; t < sm.startIndex + sm.primitiveCount * 3; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(n[0], n[1], n[2]);
      if (!(l > 1e-9) || Math.abs(n[1] / l) > 0.05) continue;
      const ylo = Math.min(P[a + 1], P[b + 1], P[c + 1]), yhi = Math.max(P[a + 1], P[b + 1], P[c + 1]);
      if (yhi - ylo < STAIR_RISER_MIN || yhi - ylo > STAIR_RISER_MAX) continue;
      let hx = n[0], hz = n[2];
      const hl = Math.hypot(hx, hz);
      hx /= hl; hz /= hl;
      if (hx < -1e-6 || (Math.abs(hx) <= 1e-6 && hz < 0)) { hx = -hx; hz = -hz; }
      const dist = P[a] * hx + P[a + 2] * hz;
      const ts = [a, b, c].map((v) => P[v] * -hz + P[v + 2] * hx);
      const t0 = Math.min(...ts), t1 = Math.max(...ts);
      const same = risers.find((r) => near(r.hx, hx, 0.01) && near(r.hz, hz, 0.01) && near(r.dist, dist, 0.02) && near(r.ylo, ylo, 0.02) && near(r.yhi, yhi, 0.02) && t0 <= r.t1 + 0.02 && t1 >= r.t0 - 0.02);
      if (same) { same.t0 = Math.min(same.t0, t0); same.t1 = Math.max(same.t1, t1); } else risers.push({ hx, hz, dist, ylo, yhi, t0, t1 });
    }
  }
  const wide = risers.filter((r) => r.t1 - r.t0 >= RUN_W_MIN);
  const nextOf = (a, sign) => {
    let best = null;
    for (const b of wide) {
      if (b === a || !near(a.hx, b.hx, 0.01) || !near(a.hz, b.hz, 0.01) || !near(b.ylo, a.yhi, 0.03)) continue;
      const d = b.dist - a.dist;
      if (Math.abs(d) < TREAD_MIN || Math.abs(d) > TREAD_MAX || (sign && Math.sign(d) !== sign)) continue;
      const ov = Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0);
      if (ov < RUN_W_MIN) continue;
      if (!best || ov > best.ov) best = { b, d, ov };
    }
    return best;
  };
  const taken = new Set();
  for (const a of wide) { const n = nextOf(a, 0); if (n) taken.add(n.b); }
  const runs = [];
  for (const a of wide) {
    if (taken.has(a)) continue;
    const first = nextOf(a, 0);
    if (!first) continue;
    const sign = Math.sign(first.d);
    const chain = [a];
    for (let n = first; n && !chain.includes(n.b); n = nextOf(n.b, sign)) chain.push(n.b);
    if (chain.length < RUN_MIN) continue;
    const t0 = Math.max(...chain.map((r) => r.t0)), t1 = Math.min(...chain.map((r) => r.t1));
    if (t1 - t0 < RUN_W_MIN) continue;
    runs.push({
      up: [sign * a.hx, sign * a.hz], side: [-a.hz, a.hx], t0, t1,
      nosings: chain.map((r) => ({ s: sign * r.dist, y: r.yhi })), foot: a.ylo,
    });
  }
  return runs;
}

export function nosingHull(nosings) {
  const pts = nosings.slice().sort((p, q) => p.s - q.s);
  const hull = [];
  for (const p of pts) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2], b = hull[hull.length - 1];
      if ((b.s - a.s) * (p.y - a.y) - (b.y - a.y) * (p.s - a.s) >= 0) hull.pop(); else break;
    }
    hull.push(p);
  }
  return hull;
}

export function arenaStairRamps(model) {
  const runs = arenaStairRuns(model);
  const pos = [], idx = [];
  for (const r of runs) {
    const hull = nosingHull(r.nosings);
    const [h0, h1] = hull;
    const k = (h1.y - h0.y) / (h1.s - h0.s);
    const drop = h0.y - r.foot + RAMP_BELOW;
    const line = [{ s: h0.s - drop / k, y: h0.y - drop }, ...hull].map((p) => ({ s: p.s, y: p.y + RAMP_LIFT }));
    const at = (s, t) => [r.up[0] * s + r.side[0] * t, r.up[1] * s + r.side[1] * t];
    const base = pos.length / 3;
    for (const p of line) {
      const a = at(p.s, r.t0), b = at(p.s, r.t1);
      pos.push(a[0], p.y, a[1], b[0], p.y, b[1]);
    }
    for (let i = 0; i + 1 < line.length; i++) {
      const v = base + i * 2;
      idx.push(v, v + 1, v + 3, v, v + 3, v + 2);
    }
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx), runs };
}

// Ramp triangles sit after every submesh, so no host draws them, while every collider built from the full index
// list walks on them; `colliderOnlyFrom` marks the first.
export function withStairRamps(model) {
  const ramps = arenaStairRamps(model);
  const nv = model.positions.length / 3, nr = ramps.positions.length / 3;
  const positions = new Float32Array((nv + nr) * 3), normals = new Float32Array((nv + nr) * 3), uvs = new Float32Array((nv + nr) * 2);
  positions.set(model.positions); positions.set(ramps.positions, nv * 3);
  normals.set(model.normals);
  for (let i = 0; i < nr; i++) normals[(nv + i) * 3 + 1] = 1;
  uvs.set(model.uvs);
  const indices = new Uint32Array(model.indices.length + ramps.indices.length);
  indices.set(model.indices);
  for (let i = 0; i < ramps.indices.length; i++) indices[model.indices.length + i] = ramps.indices[i] + nv;
  return { ...model, positions, normals, uvs, indices, colliderOnlyFrom: model.indices.length, stairRuns: ramps.runs.length };
}

export const T_EPS = 0.004;
// Must exceed `T_EPS` so a set-back corner is never taken for one on an edge.
export const SINK_M = 0.006;

export function sealArenaSeams(model) {
  const it = sealSteps(model);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
/**
 * Runs the same steps as `sealArenaSeams`, awaiting `breathe()` between units, and must produce the same bytes.
 * @param {() => Promise<void>} breathe
 */
export async function sealArenaSeamsSliced(model, breathe) {
  const it = sealSteps(model);
  for (let r = it.next(); ; r = it.next()) {
    if (r.done) return r.value;
    await breathe();
  }
}
export const SEAL_UNIT = 32;
function* sealSteps(model) {
  const P = model.positions, N = model.normals, U = model.uvs, I = model.indices;
  const LIGHT = SEAL_UNIT * 16;
  /** @type {{ p: number[][], n: number[][], uv: number[][], pic: number, fn: number[], d: number, area: number, sink: number }[]} */
  const tris = [];
  for (let pic = 0; pic < model.subMeshes.length; pic++) {
    const sm = model.subMeshes[pic];
    for (let t = sm.startIndex; t < sm.startIndex + sm.primitiveCount * 3; t += 3) {
      if ((t / 3 + 1) % LIGHT === 0) yield;
      const v = [I[t], I[t + 1], I[t + 2]];
      const p = v.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      const e1 = sub(p[1], p[0]), e2 = sub(p[2], p[0]);
      const c = cross(e1, e2), l = Math.hypot(c[0], c[1], c[2]);
      if (!(l > 1e-9)) continue;
      const fn = [c[0] / l, c[1] / l, c[2] / l];
      tris.push({ p, n: v.map((i) => [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]]), uv: v.map((i) => [U[i * 2], U[i * 2 + 1]]), pic, fn, d: dot(fn, p[0]), area: l / 2, sink: 0 });
    }
  }
  const reps = new Map();
  let welded = 0;
  const weld = (q) => {
    const kx = Math.round(q[0] / T_EPS), ky = Math.round(q[1] / T_EPS), kz = Math.round(q[2] / T_EPS);
    for (let x = kx - 1; x <= kx + 1; x++) for (let y = ky - 1; y <= ky + 1; y++) for (let z = kz - 1; z <= kz + 1; z++) {
      for (const r of reps.get(`${x},${y},${z}`) ?? []) {
        if (Math.hypot(r[0] - q[0], r[1] - q[1], r[2] - q[2]) <= T_EPS) { if (r[0] !== q[0] || r[1] !== q[1] || r[2] !== q[2]) welded++; return r; }
      }
    }
    const k = `${kx},${ky},${kz}`;
    if (!reps.has(k)) reps.set(k, []);
    reps.get(k).push(q);
    return q;
  };
  yield;
  for (let i = 0; i < tris.length; i++) { tris[i].p = tris[i].p.map(weld); if ((i + 1) % SEAL_UNIT === 0) yield; }
  for (let i = tris.length - 1; i >= 0; i--) {
    if ((i + 1) % LIGHT === 0) yield;
    const T = tris[i], c = cross(sub(T.p[1], T.p[0]), sub(T.p[2], T.p[0])), l = Math.hypot(c[0], c[1], c[2]);
    if (!(l > 1e-9)) tris.splice(i, 1);
  }
  const dropped = I.length / 3 - tris.length;
  const planeArea = (A) => {
    const by = new Map();
    for (const X of tris) {
      if (dot(A.fn, X.fn) < 0.999 || Math.abs(A.d - X.d) > 0.01) continue;
      if (!boxesNear(A.p, X.p, 6)) continue;
      by.set(X.pic, (by.get(X.pic) ?? 0) + X.area);
    }
    return by;
  };
  let sunk = 0;
  const grid = new Map();
  const G = 4;
  for (let i = 0; i < tris.length; i++) {
    if ((i + 1) % LIGHT === 0) yield;
    const [mn, mx] = box(tris[i].p);
    for (let gx = Math.floor(mn[0] / G); gx <= Math.floor(mx[0] / G); gx++) for (let gz = Math.floor(mn[2] / G); gz <= Math.floor(mx[2] / G); gz++) {
      const k = `${gx},${gz}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  }
  const seen = new Set();
  let pairs = 0;
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      if (++pairs % (SEAL_UNIT * 32) === 0) yield;
      const i = Math.min(list[a], list[b]), j = Math.max(list[a], list[b]);
      const key = i * 1e6 + j;
      if (seen.has(key)) continue;
      seen.add(key);
      const A = tris[i], B = tris[j];
      if (dot(A.fn, B.fn) < 0.999 || Math.abs(A.d - B.d) > 0.01 || !boxesNear(A.p, B.p, 1e-3)) continue;
      if (!(strictlyInside(centroid(B.p), A) || strictlyInside(centroid(A.p), B))) continue;
      let loser = B;
      if (A.pic !== B.pic) { const by = planeArea(A); loser = (by.get(A.pic) ?? 0) < (by.get(B.pic) ?? 0) ? A : B; }
      if (!loser.sink) { loser.sink = SINK_M; sunk++; }
    }
  }
  for (const T of tris) if (T.sink) T.p = T.p.map((q) => [q[0] - T.fn[0] * T.sink, q[1] - T.fn[1] * T.sink, q[2] - T.fn[2] * T.sink]);
  const corners = new Map();
  const cell = (x) => Math.floor(x);
  let filed = 0;
  for (const T of tris) for (const q of (T.sink ? [] : T.p)) {
    if (++filed % LIGHT === 0) yield;
    const k = `${cell(q[0])},${cell(q[1])},${cell(q[2])}`;
    if (!corners.has(k)) corners.set(k, []);
    const l = corners.get(k);
    if (!l.some((o) => Math.abs(o[0] - q[0]) < 1e-5 && Math.abs(o[1] - q[1]) < 1e-5 && Math.abs(o[2] - q[2]) < 1e-5)) l.push(q);
  }
  const onEdge = (a, b) => {
    const d = sub(b, a), L2 = dot(d, d);
    const out = [];
    if (!(L2 > 1e-8)) return out;
    const [mn, mx] = box([a, b]);
    for (let x = cell(mn[0] - T_EPS); x <= cell(mx[0] + T_EPS); x++) for (let y = cell(mn[1] - T_EPS); y <= cell(mx[1] + T_EPS); y++) for (let z = cell(mn[2] - T_EPS); z <= cell(mx[2] + T_EPS); z++) {
      for (const q of corners.get(`${x},${y},${z}`) ?? []) {
        const t = dot(sub(q, a), d) / L2;
        if (t * Math.sqrt(L2) <= T_EPS || (1 - t) * Math.sqrt(L2) <= T_EPS) continue;
        const f = [a[0] + d[0] * t - q[0], a[1] + d[1] * t - q[1], a[2] + d[2] * t - q[2]];
        if (Math.hypot(f[0], f[1], f[2]) <= T_EPS) out.push({ t, q });
      }
    }
    return out.sort((u, v) => u.t - v.t);
  };
  let tjunctions = 0, cut = 0;
  const outByPic = model.subMeshes.map(() => []);
  let unit = 0;
  for (const T of tris) {
    if (++unit % SEAL_UNIT === 0) yield;
    const edges = [0, 1, 2].map((e) => onEdge(T.p[e], T.p[(e + 1) % 3]));
    const n = edges[0].length + edges[1].length + edges[2].length;
    const corner = (k) => ({ p: T.p[k], n: T.n[k], uv: T.uv[k] });
    if (!n) { outByPic[T.pic].push([corner(0), corner(1), corner(2)]); continue; }
    tjunctions += n; cut++;
    const ring = [];
    for (let e = 0; e < 3; e++) {
      ring.push(corner(e));
      for (const { t, q } of edges[e]) ring.push(lerpCorner(corner(e), corner((e + 1) % 3), t, q));
    }
    const busy = edges.map((l) => l.length > 0);
    if (busy.filter(Boolean).length === 1) {
      const e = busy.indexOf(true), apex = (e + 2) % 3;
      const start = ring.indexOf(ring.find((c) => c.p === T.p[apex]));
      const seq = [...ring.slice(start), ...ring.slice(0, start)];
      for (let k = 1; k + 1 < seq.length; k++) outByPic[T.pic].push([seq[0], seq[k], seq[k + 1]]);
    } else {
      const w = [0, 1, 2].map((k) => Math.hypot(...sub(T.p[(k + 1) % 3], T.p[(k + 2) % 3])));
      const ws = w[0] + w[1] + w[2];
      const mix = (f) => f(0).map((_, i) => (w[0] * f(0)[i] + w[1] * f(1)[i] + w[2] * f(2)[i]) / ws);
      const c = { p: mix((k) => T.p[k]), n: norm3(mix((k) => T.n[k])), uv: mix((k) => T.uv[k]) };
      for (let k = 0; k < ring.length; k++) outByPic[T.pic].push([c, ring[k], ring[(k + 1) % ring.length]]);
    }
  }
  yield;
  const total = outByPic.reduce((s, l) => s + l.length, 0);
  const positions = new Float32Array(total * 9), normals = new Float32Array(total * 9), uvs = new Float32Array(total * 6), indices = new Uint32Array(total * 3);
  const subMeshes = [];
  let at = 0;
  for (let pic = 0; pic < outByPic.length; pic++) {
    const list = outByPic[pic];
    if (!list.length) continue;
    const startIndex = at * 3;
    for (const tri of list) {
      if ((at + 1) % LIGHT === 0) yield;
      for (let k = 0; k < 3; k++) {
        const v = at * 3 + k;
        positions.set(tri[k].p, v * 3); normals.set(tri[k].n, v * 3); uvs.set(tri[k].uv, v * 2);
        indices[v] = v;
      }
      at++;
    }
    const sm = model.subMeshes[pic];
    subMeshes.push({ textureArchive: sm.textureArchive, textureRecord: sm.textureRecord, startIndex, primitiveCount: list.length });
  }
  return { positions, normals, uvs, indices, subMeshes, doors: [], stats: { tjunctions, cut, sunk, dropped, welded } };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const centroid = (p) => [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3, (p[0][2] + p[1][2] + p[2][2]) / 3];
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const box = (p) => [[0, 1, 2].map((k) => Math.min(...p.map((q) => q[k]))), [0, 1, 2].map((k) => Math.max(...p.map((q) => q[k])))];
const boxesNear = (a, b, e) => { const [an, ax] = box(a), [bn, bx] = box(b); return [0, 1, 2].every((k) => an[k] <= bx[k] + e && bn[k] <= ax[k] + e); };
function strictlyInside(q, T) {
  const s = [0, 1, 2].map((e) => dot(cross(sub(T.p[(e + 1) % 3], T.p[e]), sub(q, T.p[e])), T.fn));
  return s.every((v) => v > 1e-6) || s.every((v) => v < -1e-6);
}
function lerpCorner(a, b, t, q) {
  return { p: q, n: norm3([a.n[0] + (b.n[0] - a.n[0]) * t, a.n[1] + (b.n[1] - a.n[1]) * t, a.n[2] + (b.n[2] - a.n[2]) * t]), uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t] };
}
