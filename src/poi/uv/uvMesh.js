// @ts-check
// UV editing model for a POI mesh: islands, seams, and an LSCM unwrap.

import { orderByDissection, cholesky, solveCholesky, upperCsc } from '../sparseCholesky.js';
import { wrapAngle } from '../../world/mat4.js';

const EPS_UV = 1e-6;

export const edgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/**
 * @param {{ positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint16Array | Uint32Array, submeshes: { start: number, count: number }[] }} mesh
 * @param {{ weldEps?: number }} [opts]
 */
export function uvSessionOf(mesh, { weldEps = 1e-5 } = {}) {
  const V = mesh.positions.length / 3;
  const T = mesh.indices.length / 3;
  const tris = new Uint32Array(mesh.indices.length);
  const triSub = new Uint16Array(T);
  let t = 0;
  mesh.submeshes.forEach((sm, si) => {
    for (let k = sm.start; k < sm.start + sm.count; k += 3) {
      tris[t * 3] = mesh.indices[k]; tris[t * 3 + 1] = mesh.indices[k + 1]; tris[t * 3 + 2] = mesh.indices[k + 2];
      triSub[t] = si; t++;
    }
  });
  const cornerUv = new Float64Array(T * 6);
  for (let c = 0; c < T * 3; c++) { const v = tris[c]; cornerUv[c * 2] = mesh.uvs[v * 2]; cornerUv[c * 2 + 1] = mesh.uvs[v * 2 + 1]; }
  const weld = new Int32Array(V);
  const P = mesh.positions, q = 1 / (2 * weldEps);
  const cells = new Map();
  const first = [];
  const cellOf = (ix, iy, iz) => ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) | 0;
  let welded = 0;
  for (let v = 0; v < V; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let id = -1;
    for (let ix = Math.floor((x - weldEps) * q); ix <= Math.floor((x + weldEps) * q); ix++) {
      for (let iy = Math.floor((y - weldEps) * q); iy <= Math.floor((y + weldEps) * q); iy++) {
        for (let iz = Math.floor((z - weldEps) * q); iz <= Math.floor((z + weldEps) * q); iz++) {
          const list = cells.get(cellOf(ix, iy, iz));
          if (list) for (const w of list) {
            const r = first[w] * 3;
            if ((id < 0 || w < id) && Math.abs(P[r] - x) <= weldEps && Math.abs(P[r + 1] - y) <= weldEps && Math.abs(P[r + 2] - z) <= weldEps) id = w;
          }
        }
      }
    }
    if (id < 0) {
      id = welded++;
      first.push(v);
      const h = cellOf(Math.floor(x * q), Math.floor(y * q), Math.floor(z * q));
      const list = cells.get(h);
      if (list) list.push(id); else cells.set(h, [id]);
    }
    weld[v] = id;
  }
  const s = {
    positions: mesh.positions, normals: mesh.normals, tris, triSub, cornerUv, weld, welded, faces: T, submeshes: mesh.submeshes.length, seams: new Set(), edgeFaces: new Map(),
    sideEdge: new Int32Array(T * 3).fill(-1), edgeKeyOf: /** @type {string[]} */ ([]), edgeFacesOf: /** @type {number[][]} */ ([]),
  };
  const edgeNumber = new Map();
  for (let f = 0; f < T; f++) {
    for (let i = 0; i < 3; i++) {
      const a = weld[tris[f * 3 + i]], b = weld[tris[f * 3 + (i + 1) % 3]];
      if (a === b) continue;
      const k = edgeKey(a, b);
      let e = edgeNumber.get(k);
      if (e === undefined) { e = s.edgeKeyOf.length; edgeNumber.set(k, e); s.edgeKeyOf.push(k); s.edgeFacesOf.push([]); s.edgeFaces.set(k, s.edgeFacesOf[e]); }
      s.edgeFacesOf[e].push(f);
      s.sideEdge[f * 3 + i] = e;
    }
  }
  for (const [k, fs] of s.edgeFaces) {
    if (fs.length < 2) continue;
    const [a, b] = k.split('_').map(Number);
    for (let i = 1; i < fs.length; i++) {
      if (triSub[fs[0]] !== triSub[fs[i]] || !sameUvAt(s, fs[0], fs[i], a) || !sameUvAt(s, fs[0], fs[i], b)) { s.seams.add(k); break; }
    }
  }
  return s;
}

export function cornerAt(s, f, w) {
  for (let i = 0; i < 3; i++) if (s.weld[s.tris[f * 3 + i]] === w) return f * 3 + i;
  return -1;
}
const sameUv = (s, a, b) => Math.abs(s.cornerUv[a * 2] - s.cornerUv[b * 2]) < EPS_UV && Math.abs(s.cornerUv[a * 2 + 1] - s.cornerUv[b * 2 + 1]) < EPS_UV;
function sameUvAt(s, f, g, w) {
  const a = cornerAt(s, f, w), b = cornerAt(s, g, w);
  return a >= 0 && b >= 0 && sameUv(s, a, b);
}

export function setSeam(s, a, b, on) {
  const k = edgeKey(a, b);
  if (!s.edgeFaces.has(k)) return false;
  if (on) s.seams.add(k); else s.seams.delete(k);
  return true;
}

export function islandsOf(s, within = null) {
  const inSet = within ? new Set(within) : null;
  const parent = new Int32Array(s.faces).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const [k, fs] of s.edgeFaces) {
    if (s.seams.has(k)) continue;
    for (let i = 1; i < fs.length; i++) {
      if (inSet && (!inSet.has(fs[0]) || !inSet.has(fs[i]))) continue;
      const ra = find(fs[0]), rb = find(fs[i]);
      if (ra !== rb) parent[rb] = ra;
    }
  }
  const groups = new Map();
  for (let f = 0; f < s.faces; f++) {
    if (inSet && !inSet.has(f)) continue;
    const r = find(f);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(f);
  }
  return [...groups.values()];
}

export function uvIslandsOf(s, within = null) {
  const inSet = within ? new Uint8Array(s.faces) : null;
  if (inSet) for (const f of within) inSet[f] = 1;
  const parent = Int32Array.from({ length: s.faces }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let f = 0; f < s.faces; f++) {
    if (inSet && !inSet[f]) continue;
    for (let k = 0; k < 3; k++) {
      const e = s.sideEdge[f * 3 + k];
      if (e < 0 || s.seams.has(s.edgeKeyOf[e])) continue;
      const ca = f * 3 + k, cb = f * 3 + (k + 1) % 3;
      for (const g of s.edgeFacesOf[e]) {
        if (g <= f || (inSet && !inSet[g]) || s.triSub[g] !== s.triSub[f]) continue;
        if (!sameUv(s, ca, cornerAt(s, g, s.weld[s.tris[ca]])) || !sameUv(s, cb, cornerAt(s, g, s.weld[s.tris[cb]]))) continue;
        const ra = find(f), rb = find(g);
        if (ra !== rb) parent[rb] = ra;
      }
    }
  }
  const groups = new Map();
  for (let f = 0; f < s.faces; f++) {
    if (inSet && !inSet[f]) continue;
    const r = find(f);
    const g = groups.get(r);
    if (g) g.push(f); else groups.set(r, [f]);
  }
  return [...groups.values()];
}

export function uvVertices(s, faces = null) {
  const islands = uvIslandsOf(s, faces);
  const islandOf = new Int32Array(s.faces).fill(-1);
  islands.forEach((g, i) => { for (const f of g) islandOf[f] = i; });
  const vertOf = new Int32Array(s.faces * 3).fill(-1);
  const head = new Int32Array(s.welded).fill(-1), stamp = new Int32Array(s.welded).fill(-1);
  const seed = new Int32Array((faces ? faces.length : s.faces) * 3), next = new Int32Array(seed.length);
  let V = 0;
  islands.forEach((g, I) => {
    for (const f of g) for (let k = 0; k < 3; k++) {
      const c = f * 3 + k, w = s.weld[s.tris[c]];
      if (stamp[w] !== I) { stamp[w] = I; head[w] = -1; }
      let v = head[w];
      while (v >= 0 && !sameUv(s, seed[v], c)) v = next[v];
      if (v < 0) { v = V++; seed[v] = c; next[v] = head[w]; head[w] = v; }
      vertOf[c] = v;
    }
  });
  const start = new Int32Array(V + 1);
  for (let c = 0; c < vertOf.length; c++) if (vertOf[c] >= 0) start[vertOf[c] + 1]++;
  for (let v = 0; v < V; v++) start[v + 1] += start[v];
  const corners = new Int32Array(start[V]), fill = start.slice(0, V);
  for (let c = 0; c < vertOf.length; c++) if (vertOf[c] >= 0) corners[fill[vertOf[c]]++] = c;
  return { islands, islandOf, vertOf, start, corners };
}

export const cornersOf = (faces) => faces.flatMap((f) => [f * 3, f * 3 + 1, f * 3 + 2]);

export function uvVertexCorners(s, c, island = null) {
  const w = s.weld[s.tris[c]];
  const faces = island ?? uvIslandsOf(s).find((g) => g.includes(Math.floor(c / 3)));
  const out = [];
  for (const f of faces) {
    const k = cornerAt(s, f, w);
    if (k >= 0 && sameUv(s, k, c)) out.push(k);
  }
  return out;
}

export function uvCentre(s, corners) {
  if (!corners.length) return [0, 0];
  const [u0, v0, u1, v1] = uvBounds(s, corners);
  return [(u0 + u1) / 2, (v0 + v1) / 2];
}
export function uvBounds(s, corners) {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const c of corners) {
    const u = s.cornerUv[c * 2], v = s.cornerUv[c * 2 + 1];
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  return [u0, v0, u1, v1];
}

export function transformCorners(s, corners, { move = [0, 0], turn = 0, scale = [1, 1], pivot = null } = {}) {
  const p = pivot ?? uvCentre(s, corners);
  const a = (turn * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  for (const c of new Set(corners)) {
    let u = (s.cornerUv[c * 2] - p[0]) * scale[0], v = (s.cornerUv[c * 2 + 1] - p[1]) * scale[1];
    const ru = u * cs + v * sn, rv = -u * sn + v * cs;
    s.cornerUv[c * 2] = p[0] + ru + move[0];
    s.cornerUv[c * 2 + 1] = p[1] + rv + move[1];
  }
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a) => { const l = len3(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const posOf = (s, v) => [s.positions[v * 3], s.positions[v * 3 + 1], s.positions[v * 3 + 2]];
const faceNormal = (s, f) => { const a = posOf(s, s.tris[f * 3]), b = posOf(s, s.tris[f * 3 + 1]), c = posOf(s, s.tris[f * 3 + 2]); return cross3(sub3(b, a), sub3(c, a)); };

export function pictureAxes(n) {
  const up = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  const u = norm3(cross3(n, up));
  const v = norm3(cross3(n, u));
  return [u, v];
}
const uvSigned = (s, f) => {
  const a = f * 6, U = s.cornerUv;
  return (U[a + 2] - U[a]) * (U[a + 5] - U[a + 1]) - (U[a + 3] - U[a + 1]) * (U[a + 4] - U[a]);
};
function frontSigned(s, f) {
  const n = norm3(faceNormal(s, f));
  const [ua, va] = pictureAxes(n);
  const P = [0, 1, 2].map((k) => { const p = posOf(s, s.tris[f * 3 + k]); return [dot3(p, ua), dot3(p, va)]; });
  return (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]);
}
function keepHandedness(s, faces) {
  let agree = 0;
  for (const f of faces) agree += Math.sign(uvSigned(s, f)) * Math.abs(frontSigned(s, f)) * Math.sign(frontSigned(s, f));
  if (agree < 0) for (const c of cornersOf(faces)) s.cornerUv[c * 2] = -s.cornerUv[c * 2];
}

export function projectPlanar(s, faces, normal) {
  const [ua, va] = pictureAxes(norm3(normal));
  for (const c of cornersOf(faces)) { const p = posOf(s, s.tris[c]); s.cornerUv[c * 2] = dot3(p, ua); s.cornerUv[c * 2 + 1] = dot3(p, va); }
}
export function projectBox(s, faces) {
  for (const f of faces) {
    const n = faceNormal(s, f), ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
    const i = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : ax[1] >= ax[2] ? 1 : 2;
    const dir = [0, 0, 0]; dir[i] = Math.sign(n[i]) || 1;
    const [ua, va] = pictureAxes(dir);
    for (let k = 0; k < 3; k++) { const c = f * 3 + k, p = posOf(s, s.tris[c]); s.cornerUv[c * 2] = dot3(p, ua); s.cornerUv[c * 2 + 1] = dot3(p, va); }
  }
}
function anglesRound(ang, rho, onAxis) {
  let ref = -1;
  for (let k = 0; k < 3 && ref < 0; k++) if (rho[k] > onAxis) ref = k;
  if (ref < 0) return;
  let sum = 0, off = 0;
  for (let k = 0; k < 3; k++) {
    if (!(rho[k] > onAxis)) continue;
    ang[k] = ang[ref] + wrapAngle(ang[k] - ang[ref]);
    sum += ang[k]; off++;
  }
  for (let k = 0; k < 3; k++) if (!(rho[k] > onAxis)) ang[k] = sum / off;
}
const ON_AXIS = 1e-6;

export function projectCylinder(s, faces, axis = [0, 1, 0], centre = [0, 0, 0]) {
  const a = norm3(axis), [x, z] = pictureAxes(a);
  let rSum = 0, n = 0;
  for (const c of cornersOf(faces)) { const d = sub3(posOf(s, s.tris[c]), centre); rSum += Math.hypot(dot3(d, x), dot3(d, z)); n++; }
  const r = n ? rSum / n : 1;
  for (const f of faces) {
    const d3 = [0, 1, 2].map((k) => sub3(posOf(s, s.tris[f * 3 + k]), centre));
    const ang = d3.map((d) => Math.atan2(dot3(d, z), dot3(d, x)));
    anglesRound(ang, d3.map((d) => Math.hypot(dot3(d, x), dot3(d, z))), ON_AXIS * r);
    for (let k = 0; k < 3; k++) { const c = f * 3 + k; s.cornerUv[c * 2] = ang[k] * r; s.cornerUv[c * 2 + 1] = -dot3(d3[k], a); }
  }
  keepHandedness(s, faces);
}
export function projectSphere(s, faces, centre = [0, 0, 0]) {
  let rSum = 0, n = 0;
  for (const c of cornersOf(faces)) { rSum += len3(sub3(posOf(s, s.tris[c]), centre)); n++; }
  const r = n ? rSum / n : 1;
  for (const f of faces) {
    const d3 = [0, 1, 2].map((k) => sub3(posOf(s, s.tris[f * 3 + k]), centre));
    const lon = d3.map((d) => Math.atan2(d[2], d[0]));
    anglesRound(lon, d3.map((d) => Math.hypot(d[0], d[2])), ON_AXIS * r);
    for (let k = 0; k < 3; k++) {
      const c = f * 3 + k, d = norm3(sub3(posOf(s, s.tris[c]), centre));
      s.cornerUv[c * 2] = lon[k] * r; s.cornerUv[c * 2 + 1] = -Math.asin(Math.max(-1, Math.min(1, d[1]))) * r;
    }
  }
  keepHandedness(s, faces);
}

const LIVE_AREA2 = 1e-14;
function isLive(s, f) {
  const a = s.weld[s.tris[f * 3]], b = s.weld[s.tris[f * 3 + 1]], c = s.weld[s.tris[f * 3 + 2]];
  return a !== b && b !== c && a !== c && len3(faceNormal(s, f)) > LIVE_AREA2;
}

export function unwrapLscm(s, faces, { iterations = 6000, tolerance = 1e-7 } = {}) {
  const local = new Int32Array(s.faces).fill(-1);
  const laid = [];
  for (const isl of islandsOf(s, faces)) for (const piece of unwrapIsland(s, isl, local, iterations, tolerance)) laid.push(piece);
  return laid;
}
function unwrapIsland(s, faces, local, iterations, tolerance) {
  const n = faces.length;
  for (let i = 0; i < n; i++) local[faces[i]] = i;
  const live = new Uint8Array(n);
  for (let i = 0; i < n; i++) live[i] = isLive(s, faces[i]) ? 1 : 0;
  const cp = Int32Array.from({ length: n * 3 }, (_, c) => c), fp = Int32Array.from({ length: n }, (_, i) => i);
  const find = (p, x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
  const join = (p, a, b) => { const ra = find(p, a), rb = find(p, b); if (ra !== rb) p[rb] = ra; };
  const weldOf = (i, k) => s.weld[s.tris[faces[i] * 3 + k]];
  const joinAt = (i, j, w) => { for (let a = 0; a < 3; a++) if (weldOf(i, a) === w) for (let b = 0; b < 3; b++) if (weldOf(j, b) === w) join(cp, i * 3 + a, j * 3 + b); };
  const later = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const e = s.sideEdge[faces[i] * 3 + k];
    if (e < 0 || s.seams.has(s.edgeKeyOf[e])) continue;
    const wa = weldOf(i, k), wb = weldOf(i, (k + 1) % 3);
    for (const g of s.edgeFacesOf[e]) {
      const j = local[g];
      if (j <= i) continue;
      if (live[i] && live[j]) { join(fp, i, j); joinAt(i, j, wa); joinAt(i, j, wb); } else later.push(i, j, wa, wb);
    }
  }
  const vert = new Int32Array(n * 3).fill(-1);
  for (let i = 0; i < n; i++) if (live[i]) for (let k = 0; k < 3; k++) vert[i * 3 + k] = find(cp, i * 3 + k);
  for (let q = 0; q < later.length; q += 4) { joinAt(later[q], later[q + 1], later[q + 2]); joinAt(later[q], later[q + 1], later[q + 3]); }
  const uv = new Float64Array(n * 6), got = new Int32Array(n * 3).fill(-1);
  const idOf = new Int32Array(n * 3).fill(-1);
  const groups = new Map();
  for (let i = 0; i < n; i++) if (live[i]) { const r = find(fp, i), g = groups.get(r); if (g) g.push(i); else groups.set(r, [i]); }
  const pieces = [];
  for (const g of groups.values()) {
    layPiece(s, faces, g, vert, idOf, uv, iterations, tolerance);
    for (const i of g) for (let k = 0; k < 3; k++) got[i * 3 + k] = pieces.length;
    pieces.push(g);
  }
  const firstOf = new Int32Array(n * 3).fill(-1);
  for (let c = 0; c < n * 3; c++) if (got[c] >= 0) { const r = find(cp, c); if (firstOf[r] < 0) firstOf[r] = c; }
  for (let more = true; more;) {
    more = false;
    for (let i = 0; i < n; i++) if (!live[i]) for (let k = 0; k < 3; k++) {
      const c = i * 3 + k;
      if (got[c] >= 0) continue;
      const r = find(cp, c);
      let from = firstOf[r];
      if (from < 0) {
        const p = posOf(s, s.tris[faces[i] * 3 + k]);
        let best = Infinity;
        for (let m = 0; m < 3; m++) if (got[i * 3 + m] >= 0) { const d = len3(sub3(posOf(s, s.tris[faces[i] * 3 + m]), p)); if (d < best) { best = d; from = i * 3 + m; } }
      }
      if (from < 0) continue;
      uv[c * 2] = uv[from * 2]; uv[c * 2 + 1] = uv[from * 2 + 1]; got[c] = got[from];
      if (firstOf[r] < 0) firstOf[r] = c;
      more = true;
    }
  }
  for (let i = 0; i < n; i++) if (!live[i] && got[i * 3] >= 0) pieces[got[i * 3]].push(i);
  for (let c = 0; c < n * 3; c++) if (got[c] >= 0) { const g = faces[(c / 3) | 0] * 3 + (c % 3); s.cornerUv[g * 2] = uv[c * 2]; s.cornerUv[g * 2 + 1] = uv[c * 2 + 1]; }
  for (let i = 0; i < n; i++) local[faces[i]] = -1;
  return pieces.map((g) => g.map((i) => faces[i]));
}

function layPiece(s, faces, g, vert, idOf, uv, iterations, tolerance) {
  const rep = [];
  for (const i of g) for (let k = 0; k < 3; k++) { const r = vert[i * 3 + k]; if (idOf[r] < 0) { idOf[r] = rep.length; rep.push(i * 3 + k); } }
  const N = rep.length;
  const P = new Float64Array(N * 3);
  for (let v = 0; v < N; v++) { const p = s.tris[faces[(rep[v] / 3) | 0] * 3 + (rep[v] % 3)] * 3; P[v * 3] = s.positions[p]; P[v * 3 + 1] = s.positions[p + 1]; P[v * 3 + 2] = s.positions[p + 2]; }
  const far = (from) => {
    let best = 0, bd = -1;
    for (let i = 0; i < N; i++) { const d = Math.hypot(P[i * 3] - P[from * 3], P[i * 3 + 1] - P[from * 3 + 1], P[i * 3 + 2] - P[from * 3 + 2]); if (d > bd) { bd = d; best = i; } }
    return [best, bd];
  };
  const [p0] = far(0), [p1, dist] = far(p0);
  const pinned = new Map([[p0, [0, 0]], [p1, [dist || 1, 0]]]);
  const freeIdx = new Int32Array(N).fill(-1);
  let F = 0;
  for (let i = 0; i < N; i++) if (!pinned.has(i)) freeIdx[i] = F++;
  const T = g.length;
  const tv = new Int32Array(T * 3), mr = new Float64Array(T * 3), mz = new Float64Array(T * 3);
  let area3 = 0;
  for (let t = 0; t < T; t++) {
    const f = faces[g[t]];
    const A = posOf(s, s.tris[f * 3]), e1 = sub3(posOf(s, s.tris[f * 3 + 1]), A), e2 = sub3(posOf(s, s.tris[f * 3 + 2]), A);
    const nn = cross3(e1, e2), area2 = len3(nn);
    area3 += area2 / 2;
    const xa = norm3(e1), ya = norm3(cross3(norm3(nn), xa));
    const q = [[0, 0], [len3(e1), 0], [dot3(e2, xa), dot3(e2, ya)]];
    const d = Math.sqrt(area2);
    for (let j = 0; j < 3; j++) {
      tv[t * 3 + j] = idOf[vert[g[t] * 3 + j]];
      mr[t * 3 + j] = (q[(j + 2) % 3][0] - q[(j + 1) % 3][0]) / d;
      mz[t * 3 + j] = (q[(j + 2) % 3][1] - q[(j + 1) % 3][1]) / d;
    }
  }
  const nb = Array.from({ length: F }, () => []), pts = new Array(F);
  for (let v = 0; v < N; v++) if (freeIdx[v] >= 0) pts[freeIdx[v]] = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  for (let t = 0; t < T; t++) for (let a = 0; a < 3; a++) {
    const fa = freeIdx[tv[t * 3 + a]];
    if (fa < 0) continue;
    for (let b = 0; b < 3; b++) { const fb = freeIdx[tv[t * 3 + b]]; if (b !== a && fb >= 0) nb[fa].push(fb); }
  }
  const rank = new Int32Array(F);
  orderByDissection(pts, nb).forEach((v, r) => { rank[v] = r; });
  const I = new Int32Array(T * 6), J = new Int32Array(T * 6), Vr = new Float64Array(T * 6), Vz = new Float64Array(T * 6);
  const br = new Float64Array(F), bz = new Float64Array(F);
  let cnt = 0;
  for (let t = 0; t < T; t++) {
    let cr = 0, cz = 0;
    for (let j = 0; j < 3; j++) {
      const pin = pinned.get(tv[t * 3 + j]);
      if (pin) { const ar = mr[t * 3 + j], az = mz[t * 3 + j]; cr -= ar * pin[0] - az * pin[1]; cz -= ar * pin[1] + az * pin[0]; }
    }
    for (let a = 0; a < 3; a++) {
      const fa = freeIdx[tv[t * 3 + a]];
      if (fa < 0) continue;
      const ra = rank[fa], ar = mr[t * 3 + a], az = mz[t * 3 + a];
      br[ra] += ar * cr + az * cz; bz[ra] += ar * cz - az * cr;
      for (let b = a; b < 3; b++) {
        const fb = freeIdx[tv[t * 3 + b]];
        if (fb < 0) continue;
        const rb = rank[fb], qr = mr[t * 3 + b], qz = mz[t * 3 + b];
        const re = ar * qr + az * qz, im = ar * qz - az * qr;
        if (ra <= rb) { I[cnt] = ra; J[cnt] = rb; Vz[cnt] = im; } else { I[cnt] = rb; J[cnt] = ra; Vz[cnt] = -im; }
        Vr[cnt++] = re;
      }
    }
  }
  const { Ap, Ai, Ar, Az } = upperCsc(F, I, J, Vr, Vz, cnt);
  const L = cholesky(F, Ap, Ai, Ar, Az);
  let zr, zz;
  if (L) ({ re: zr, im: zz } = solveCholesky(L, br, bz));
  else {
    let mn = [0, 0, 0];
    for (const i of g) { const fn = faceNormal(s, faces[i]); mn = [mn[0] + fn[0], mn[1] + fn[1], mn[2] + fn[2]]; }
    const [ua, va] = pictureAxes(norm3(len3(mn) > 0 ? mn : [0, 1, 0]));
    zr = new Float64Array(F); zz = new Float64Array(F);
    for (let v = 0; v < N; v++) {
      if (freeIdx[v] < 0) continue;
      const d = [P[v * 3] - P[p0 * 3], P[v * 3 + 1] - P[p0 * 3 + 1], P[v * 3 + 2] - P[p0 * 3 + 2]];
      zr[rank[freeIdx[v]]] = dot3(d, ua); zz[rank[freeIdx[v]]] = dot3(d, va);
    }
    pcgHermitian(F, Ap, Ai, Ar, Az, br, bz, zr, zz, iterations, tolerance);
  }
  const U = new Float64Array(N * 2);
  for (let v = 0; v < N; v++) {
    const pin = pinned.get(v);
    if (pin) { U[v * 2] = pin[0]; U[v * 2 + 1] = pin[1]; } else { const r = rank[freeIdx[v]]; U[v * 2] = zr[r]; U[v * 2 + 1] = zz[r]; }
  }
  let areaUv = 0;
  for (let t = 0; t < T; t++) {
    const a = tv[t * 3] * 2, b = tv[t * 3 + 1] * 2, c = tv[t * 3 + 2] * 2;
    areaUv += Math.abs((U[b] - U[a]) * (U[c + 1] - U[a + 1]) - (U[b + 1] - U[a + 1]) * (U[c] - U[a])) / 2;
  }
  if (areaUv > 0) { const k = Math.sqrt(area3 / areaUv); for (let i = 0; i < N * 2; i++) U[i] *= k; }
  for (const i of g) for (let k = 0; k < 3; k++) { const c = i * 3 + k, v = idOf[vert[c]]; uv[c * 2] = U[v * 2]; uv[c * 2 + 1] = U[v * 2 + 1]; }
}

function pcgHermitian(n, Ap, Ai, Ar, Az, br, bz, xr, xz, iterations, tolerance) {
  const diag = new Float64Array(n);
  for (let j = 0; j < n; j++) for (let p = Ap[j]; p < Ap[j + 1]; p++) if (Ai[p] === j) diag[j] += Ar[p];
  for (let i = 0; i < n; i++) diag[i] = diag[i] > 0 ? 1 / diag[i] : 1;
  const mul = (vr, vz, yr, yz) => {
    yr.fill(0); yz.fill(0);
    for (let j = 0; j < n; j++) for (let p = Ap[j]; p < Ap[j + 1]; p++) {
      const i = Ai[p], hr = Ar[p], hz = Az[p];
      yr[i] += hr * vr[j] - hz * vz[j]; yz[i] += hr * vz[j] + hz * vr[j];
      if (i !== j) { yr[j] += hr * vr[i] + hz * vz[i]; yz[j] += hr * vz[i] - hz * vr[i]; }
    }
  };
  const rr = new Float64Array(n), rz = new Float64Array(n), zr = new Float64Array(n), zz = new Float64Array(n);
  const pr = new Float64Array(n), pz = new Float64Array(n), qr = new Float64Array(n), qz = new Float64Array(n);
  mul(xr, xz, qr, qz);
  let bb = 0, rho = 0;
  for (let i = 0; i < n; i++) {
    rr[i] = br[i] - qr[i]; rz[i] = bz[i] - qz[i]; zr[i] = rr[i] * diag[i]; zz[i] = rz[i] * diag[i]; pr[i] = zr[i]; pz[i] = zz[i];
    bb += br[i] * br[i] + bz[i] * bz[i]; rho += rr[i] * zr[i] + rz[i] * zz[i];
  }
  const stop = tolerance * tolerance * Math.max(bb, 1e-30);
  for (let it = 0; it < iterations; it++) {
    let res = 0;
    for (let i = 0; i < n; i++) res += rr[i] * rr[i] + rz[i] * rz[i];
    if (res <= stop) break;
    mul(pr, pz, qr, qz);
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += pr[i] * qr[i] + pz[i] * qz[i];
    if (!(pAp > 0)) break;
    const alpha = rho / pAp;
    let rho2 = 0;
    for (let i = 0; i < n; i++) {
      xr[i] += alpha * pr[i]; xz[i] += alpha * pz[i]; rr[i] -= alpha * qr[i]; rz[i] -= alpha * qz[i];
      zr[i] = rr[i] * diag[i]; zz[i] = rz[i] * diag[i]; rho2 += rr[i] * zr[i] + rz[i] * zz[i];
    }
    const beta = rho2 / rho;
    rho = rho2;
    for (let i = 0; i < n; i++) { pr[i] = zr[i] + beta * pr[i]; pz[i] = zz[i] + beta * pz[i]; }
  }
}

export function hull2(pts) {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
export function minAreaTurn(pts) {
  const h = hull2(pts);
  let best = 0, bestArea = Infinity;
  const tryAngle = (a) => {
    const cs = Math.cos(a), sn = Math.sin(a);
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const [u, v] of h) { const ru = u * cs + v * sn, rv = -u * sn + v * cs; u0 = Math.min(u0, ru); u1 = Math.max(u1, ru); v0 = Math.min(v0, rv); v1 = Math.max(v1, rv); }
    let area = (u1 - u0) * (v1 - v0);
    if (v1 - v0 > u1 - u0) area *= 1 + 1e-9;
    if (area < bestArea * (1 - 1e-12)) { bestArea = area; best = a; }
  };
  tryAngle(0);
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; tryAngle(Math.atan2(b[1] - a[1], b[0] - a[0])); }
  return (best * 180) / Math.PI;
}

/**
 * @param {any} s
 * @param {number[][]} islands
 * @param {{ margin?: number, rotate?: boolean }} [opts]
 */
export function packIslands(s, islands, { margin = 0.01, rotate = true } = {}) {
  const items = [];
  for (const faces of islands) {
    if (!faces.length) continue;
    const corners = [...new Set(cornersOf(faces))];
    const turn = rotate ? minAreaTurn(corners.map((c) => [s.cornerUv[c * 2], s.cornerUv[c * 2 + 1]])) : 0;
    const a = (turn * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
    const at = new Float64Array(corners.length * 2);
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    corners.forEach((c, i) => {
      const u = s.cornerUv[c * 2], v = s.cornerUv[c * 2 + 1], ru = u * cs + v * sn, rv = -u * sn + v * cs;
      at[i * 2] = ru; at[i * 2 + 1] = rv;
      if (ru < u0) u0 = ru; if (ru > u1) u1 = ru; if (rv < v0) v0 = rv; if (rv > v1) v1 = rv;
    });
    items.push({ corners, at, b: [u0, v0, u1, v1], w: u1 - u0, h: v1 - v0 });
  }
  if (!items.length) return 0;
  const fits = (k) => {
    const order = [...items.keys()].sort((a, b) => items[b].h - items[a].h);
    let x = margin, y = margin, rowH = 0;
    const at = new Map();
    for (const i of order) {
      const w = items[i].w * k + margin, h = items[i].h * k + margin;
      if (x + w > 1 + 1e-12) { x = margin; y += rowH; rowH = 0; }
      if (x + w > 1 + 1e-12 || y + h > 1 + 1e-12) return null;
      at.set(i, [x, y]);
      x += w; rowH = Math.max(rowH, h);
    }
    return at;
  };
  const total = items.reduce((a, it) => a + Math.max(it.w * it.h, 1e-12), 0);
  let hi = 1 / Math.sqrt(total), lo = 0, place = fits(hi);
  if (place) lo = hi;
  else {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2, at = fits(mid);
      if (at) { lo = mid; place = at; } else hi = mid;
    }
  }
  if (!place) return 0;
  items.forEach((it, i) => {
    const [x, y] = place.get(i);
    it.corners.forEach((c, j) => {
      s.cornerUv[c * 2] = x + (it.at[j * 2] - it.b[0]) * lo;
      s.cornerUv[c * 2 + 1] = y + (it.at[j * 2 + 1] - it.b[1]) * lo;
    });
  });
  return lo;
}

export function texelDensity(s, faces, w, h) {
  let uvA = 0, area = 0;
  for (const f of faces) {
    const n = faceNormal(s, f);
    area += len3(n) / 2;
    const [a, b, c] = [f * 3, f * 3 + 1, f * 3 + 2].map((k) => [s.cornerUv[k * 2] * w, s.cornerUv[k * 2 + 1] * h]);
    uvA += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }
  return area > 0 ? Math.sqrt(uvA / area) : 0;
}
export function setTexelDensity(s, islands, target, w, h) {
  for (const faces of islands) {
    const d = texelDensity(s, faces, w, h);
    if (!(d > 0)) continue;
    const k = target / d;
    transformCorners(s, cornersOf(faces), { scale: [k, k] });
  }
}

export function meshFromSession(s) {
  const keyOf = new Map();
  const pos = [], nor = [], uv = [];
  const bySub = Array.from({ length: s.submeshes }, () => []);
  for (let f = 0; f < s.faces; f++) bySub[s.triSub[f]].push(f);
  const indices = [], submeshes = [];
  for (const faces of bySub) {
    const start = indices.length;
    for (const f of faces) for (let k = 0; k < 3; k++) {
      const c = f * 3 + k, v = s.tris[c];
      const u = s.cornerUv[c * 2], w = s.cornerUv[c * 2 + 1];
      const key = `${v}|${Math.round(u * 1e6)}|${Math.round(w * 1e6)}`;
      let id = keyOf.get(key);
      if (id === undefined) {
        id = pos.length / 3; keyOf.set(key, id);
        pos.push(s.positions[v * 3], s.positions[v * 3 + 1], s.positions[v * 3 + 2]);
        nor.push(s.normals[v * 3], s.normals[v * 3 + 1], s.normals[v * 3 + 2]);
        uv.push(u, w);
      }
      indices.push(id);
    }
    submeshes.push({ start, count: indices.length - start });
  }
  const V = pos.length / 3;
  return {
    positions: Float32Array.from(pos), normals: Float32Array.from(nor), uvs: Float32Array.from(uv),
    indices: V > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices), submeshes,
  };
}
