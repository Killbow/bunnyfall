// Bakes one FBX mesh into the game's own mesh JSON, so the game never parses FBX.
// Run: node tools/fbxMesh.mjs <in.fbx> <out.json> [--name=X] [--forward=-z] [--up=-x] [--units=N]
//   [--origin=centre|grip] [--keep-rotation] [--no-normalise] [--placement=object|scene] [--material=N].
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFbx, nodeAt, childNamed, childrenNamed, property70, objectName } from './fbxRead.mjs';
import { isMain } from './lib/isMain.mjs';

// FBX eOrderXYZ composes R = Rz * Ry * Rx, so the X rotation applies to the vector first.
export function eulerXYZ([rx, ry, rz]) {
  const d = Math.PI / 180;
  const [sx, cx] = [Math.sin(rx * d), Math.cos(rx * d)];
  const [sy, cy] = [Math.sin(ry * d), Math.cos(ry * d)];
  const [sz, cz] = [Math.sin(rz * d), Math.cos(rz * d)];
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}
const apply3 = (m, [x, y, z]) => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
];

export function axisVector(token) {
  const m = /^([+-]?)([xyz])$/.exec(String(token).trim().toLowerCase());
  if (!m) throw new Error(`"${token}" is not an axis: expected one of +x -x +y -y +z -z`);
  const v = [0, 0, 0];
  v['xyz'.indexOf(m[2])] = m[1] === '-' ? -1 : 1;
  return v;
}

export function basisMap(forward = '-z', up = '-x') {
  const f = axisVector(forward);
  const u = axisVector(up);
  const dot = f[0] * u[0] + f[1] * u[1] + f[2] * u[2];
  if (Math.abs(dot) > 1e-9) throw new Error(`--forward=${forward} and --up=${up} are not perpendicular`);
  const r = [
    f[1] * u[2] - f[2] * u[1],
    f[2] * u[0] - f[0] * u[2],
    f[0] * u[1] - f[1] * u[0],
  ];
  return ([x, y, z]) => [
    r[0] * x + r[1] * y + r[2] * z,
    f[0] * x + f[1] * y + f[2] * z,
    u[0] * x + u[1] * y + u[2] * z,
  ];
}

export const toMwBasis = basisMap('-z', '-x');

// FBX stores each polygon's last index as its ones' complement; a list ending on a non-negative index is truncated.
export function polygonsOf(polygonVertexIndex) {
  const polys = [];
  let cur = [];
  for (const raw of polygonVertexIndex) {
    if (raw < 0) { cur.push(~raw); polys.push(cur); cur = []; } else cur.push(raw);
  }
  if (cur.length) throw new Error('PolygonVertexIndex does not end on a closed polygon - the file is truncated');
  return polys;
}

function newellNormal(pts) {
  const nrm = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    nrm[0] += (a[1] - b[1]) * (a[2] + b[2]);
    nrm[1] += (a[2] - b[2]) * (a[0] + b[0]);
    nrm[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return nrm;
}

export function isConvexPolygon(pts) {
  const nrm = newellNormal(pts);
  const scaleN = Math.hypot(...nrm);
  if (scaleN < 1e-9) return true;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length]; const c = pts[(i + 2) % pts.length];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const turn = ((u[1] * w[2] - u[2] * w[1]) * nrm[0] + (u[2] * w[0] - u[0] * w[2]) * nrm[1]
      + (u[0] * w[1] - u[1] * w[0]) * nrm[2]) / scaleN;
    if (turn < -1e-6 * scaleN) return false;
  }
  return true;
}

// Used only where earClip refused a face, so every face that clipped before still bakes to the same bytes.
export function earClipRepeated(pts, epsilon = 1e-6) {
  const keep = pts.map((_, i) => i).filter((i) => {
    const p = pts[i]; const q = pts[(i + pts.length - 1) % pts.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > epsilon;
  });
  if (keep.length === pts.length || keep.length < 3) return null;
  try { return earClip(keep.map((i) => pts[i])).map((t) => t.map((j) => keep[j])); } catch { return null; }
}

export function earClip(pts) {
  const nrm = newellNormal(pts);
  const k = [0, 1, 2].reduce((best, i) => (Math.abs(nrm[i]) > Math.abs(nrm[best]) ? i : best), 0);
  const [ia, ib] = k === 0 ? [1, 2] : k === 1 ? [2, 0] : [0, 1];
  const flip = nrm[k] < 0 ? -1 : 1;
  const p2 = pts.map((p) => [p[ia], p[ib] * flip]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const n = p2.length;
  const crosses = (a, b, c, d) => {
    const d1 = cross(a, b, c); const d2 = cross(a, b, d); const d3 = cross(c, d, a); const d4 = cross(c, d, b);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (crosses(p2[i], p2[(i + 1) % n], p2[j], p2[(j + 1) % n])) {
        throw new Error(`a ${n}-gon crosses itself (edges ${i} and ${j}) - no triangulation covers it. Fix the face in Blender before exporting.`);
      }
    }
  }
  const ring = pts.map((_, i) => i);
  const tris = [];
  while (ring.length > 3) {
    let cut = -1;
    for (let r = 0; r < ring.length && cut < 0; r++) {
      const i0 = ring[(r + ring.length - 1) % ring.length]; const i1 = ring[r]; const i2 = ring[(r + 1) % ring.length];
      const [a, b, c] = [p2[i0], p2[i1], p2[i2]];
      if (cross(a, b, c) <= 0) continue;
      let clear = true;
      for (const j of ring) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inside(p2[j], a, b, c)) { clear = false; break; }
      }
      if (clear) cut = r;
    }
    if (cut < 0) throw new Error(`a ${pts.length}-gon has no ear left to cut - it folds back over itself. Fix the face in Blender before exporting.`);
    const r = cut;
    tris.push([ring[(r + ring.length - 1) % ring.length], ring[r], ring[(r + 1) % ring.length]]);
    ring.splice(r, 1);
  }
  tris.push([ring[0], ring[1], ring[2]]);
  return tris;
}

// blenderTessellate ports Blender 5.1's mesh_tessellate.cc and polyfill_2d.cc and rounds to float32 after every
// operation in Blender's order, with no fused multiply-add, because the fill depends on that rounding.

const f32 = Math.fround;
const FLT_EPSILON = 2 ** -23;
const CONCAVE = -1, TANGENTIAL = 0, CONVEX = 1;
const toF32 = (pts) => pts.map((p) => [f32(p[0]), f32(p[1]), f32(p[2])]);
const sub3f = (a, b) => [f32(a[0] - b[0]), f32(a[1] - b[1]), f32(a[2] - b[2])];
const cross3f = (a, b) => [f32(f32(a[1] * b[2]) - f32(a[2] * b[1])), f32(f32(a[2] * b[0]) - f32(a[0] * b[2])), f32(f32(a[0] * b[1]) - f32(a[1] * b[0]))];
const dot3f = (a, b) => f32(f32(f32(a[0] * b[0]) + f32(a[1] * b[1])) + f32(a[2] * b[2]));
const cross3d = (a, b, c) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};

export function blenderNormal(pts) {
  const P = toF32(pts);
  const n = [0, 0, 0];
  let prev = P[P.length - 1];
  for (const cur of P) {
    n[0] = f32(n[0] + f32(f32(prev[1] - cur[1]) * f32(prev[2] + cur[2])));
    n[1] = f32(n[1] + f32(f32(prev[2] - cur[2]) * f32(prev[0] + cur[0])));
    n[2] = f32(n[2] + f32(f32(prev[0] - cur[0]) * f32(prev[1] + cur[1])));
    prev = cur;
  }
  const d = dot3f(n, n);
  if (!(d > f32(1e-35))) return [0, 0, 1];
  const inv = f32(1 / f32(Math.sqrt(d)));
  return [f32(n[0] * inv), f32(n[1] * inv), f32(n[2] * inv)];
}

export function blenderProject(pts) {
  const P = toF32(pts);
  const nrm = blenderNormal(P);
  const z = [-nrm[0], -nrm[1], -nrm[2]];
  const lenSq = f32(f32(z[0] * z[0]) + f32(z[1] * z[1]));
  let n1, n2;
  if (lenSq > FLT_EPSILON) {
    const d = f32(1 / f32(Math.sqrt(lenSq)));
    n1 = [f32(z[1] * d), f32(-z[0] * d), 0];
    n2 = [f32(-z[2] * n1[1]), f32(z[2] * n1[0]), f32(f32(z[0] * n1[1]) - f32(z[1] * n1[0]))];
  } else {
    n1 = [z[2] < 0 ? -1 : 1, 0, 0];
    n2 = [0, 1, 0];
  }
  return P.map((p) => [dot3f(n1, p), dot3f(n2, p)]);
}

// tools/shipBake.mjs refuses an export from any other Blender version, whose fill may cut faces otherwise.
export const BLENDER_FILL = '5.1';
const UNSET = -1;
const THIRD = f32(1 / 3);

function triIsect(vs) {
  const e = [0, 1, 2].map((i) => [f32(vs[(i + 1) % 3][0] - vs[i][0]), f32(vs[(i + 1) % 3][1] - vs[i][1])]);
  const c = [0, 1, 2].map((i) => f32(f32(e[i][0] * vs[i][1]) - f32(vs[i][0] * e[i][1])));
  const side = (i, co) => f32(f32(f32(e[i][1] * co[0]) - f32(e[i][0] * co[1])) + c[i]) >= 0;
  return (co) => side(1, co) && side(2, co) && side(0, co);
}

// Ported node for node from polyfill_2d.cc: which corners the walk reaches decides the fill.
function kdTree2d(C, sign) {
  const index = [], neg = [], pos = [], axis = [], removed = [], parent = [];
  for (let i = 0; i < C.length; i++) {
    if (sign[i] !== CONVEX) { index.push(i); neg.push(UNSET); pos.push(UNSET); axis.push(0); removed.push(false); parent.push(UNSET); }
  }
  const balance = (ofs, num, ax) => {
    if (num <= 0) return UNSET;
    if (num === 1) return ofs;
    const at = (k) => C[index[ofs + k]][ax];
    const swap = (a, b) => { const t = index[ofs + a]; index[ofs + a] = index[ofs + b]; index[ofs + b] = t; };
    const median = num >> 1;
    let lo = 0, hi = num - 1;
    while (hi > lo) {
      const co = at(hi);
      let i = lo - 1, j = hi;
      for (;;) {
        while (at(++i) < co) { }
        while (at(--j) > co && j > lo) { }
        if (i >= j) break;
        swap(i, j);
      }
      swap(i, hi);
      if (i >= median) hi = i - 1;
      if (i <= median) lo = i + 1;
    }
    axis[ofs + median] = ax;
    neg[ofs + median] = balance(ofs, median, 1 - ax);
    pos[ofs + median] = balance(ofs + median + 1, num - (median + 1), 1 - ax);
    return ofs + median;
  };
  const root = balance(0, index.length, 0);
  const map = new Array(C.length).fill(UNSET);
  for (let i = 0; i < index.length; i++) {
    if (neg[i] !== UNSET) parent[neg[i]] = i;
    if (pos[i] !== UNSET) parent[pos[i]] = i;
    map[index[i]] = i;
  }
  parent[root] = UNSET;
  return {
    has: (k) => map[k] !== UNSET,
    remove(k) {
      let node = map[k];
      if (node === UNSET) return;
      map[k] = UNSET;
      removed[node] = true;
      while (parent[node] !== UNSET) {
        let child;
        if (neg[node] === UNSET) child = pos[node];
        else if (pos[node] === UNSET) child = neg[node];
        else break;
        const up = parent[node];
        if (neg[up] === node) neg[up] = child; else pos[up] = child;
        if (child !== UNSET) parent[child] = up;
        if (!removed[up]) break;
        node = up;
      }
    },
    isect(ind) {
      const vs = ind.map((i) => C[i]);
      const bounds = [0, 1].map((a) => [Math.min(vs[0][a], vs[1][a], vs[2][a]), Math.max(vs[0][a], vs[1][a], vs[2][a])]);
      const centre = [0, 1].map((a) => f32(f32(f32(vs[0][a] + vs[1][a]) + vs[2][a]) * THIRD));
      const inside = triIsect(vs);
      const walk = (node) => {
        const k = index[node], co = C[k], ax = axis[node];
        if (!removed[node] && inside(co) && !ind.includes(k)) return k;
        const toNeg = () => (neg[node] !== UNSET && co[ax] >= bounds[ax][0] ? walk(neg[node]) : UNSET);
        const toPos = () => (pos[node] !== UNSET && co[ax] <= bounds[ax][1] ? walk(pos[node]) : UNSET);
        const [first, then] = centre[ax] > co[ax] ? [toPos, toNeg] : [toNeg, toPos];
        const hit = first();
        return hit !== UNSET ? hit : then();
      };
      return walk(root);
    },
  };
}

export function blenderPolyfill(coords) {
  const n = coords.length;
  if (n < 3) throw new Error(`a polygon with ${n} corners is not a face`);
  const C = coords.map((p) => [f32(p[0]), f32(p[1])]);
  const area2x = (v1, v2, v3) => {
    const d2x = f32(v2[0] - v1[0]), d2y = f32(v2[1] - v1[1]), d3x = f32(v3[0] - v1[0]), d3y = f32(v3[1] - v1[1]);
    return f32(f32(d2x * d3y) - f32(d3x * d2y));
  };
  const span = (v1, v2, v3) => { const a = area2x(v3, v2, v1); return a === 0 ? TANGENTIAL : a > 0 ? CONVEX : CONCAVE; };
  const next = C.map((_, i) => (i + 1) % n), prev = C.map((_, i) => (i + n - 1) % n);
  const sign = new Array(n), lastHit = new Array(n).fill(UNSET), dirty = new Array(n).fill(false);
  const signCalc = (i) => { sign[i] = span(C[prev[i]], C[i], C[next[i]]); };
  let concave = 0;
  for (let i = 0; i < n; i++) { signCalc(i); if (sign[i] !== CONVEX) concave++; }
  const tree = concave ? kdTree2d(C, sign) : null;
  const earTipCheck = (tip, accept) => {
    if (concave === 0) return true;
    if (sign[tip] !== accept) return false;
    const ind = [tip, next[tip], prev[tip]];
    const cached = lastHit[tip];
    if (cached !== UNSET) {
      if (!dirty[tip]) {
        if (tree.has(cached)) return false;
      } else if (tree.has(cached) && !ind.includes(cached) && triIsect(ind.map((i) => C[i]))(C[cached])) {
        dirty[tip] = false;
        return false;
      }
    }
    const hit = tree.isect(ind);
    if (hit !== UNSET) { lastHit[tip] = hit; dirty[tip] = false; return false; }
    return true;
  };
  let count = n;
  const earTipFind = (init, reverse) => {
    for (const accept of [CONVEX, TANGENTIAL]) {
      let e = init;
      for (let i = 0; i < count; i++) {
        if (earTipCheck(e, accept)) return e;
        e = reverse ? prev[e] : next[e];
      }
    }
    let e = init;
    for (let i = 0; i < count; i++) {
      if (sign[e] !== CONCAVE) return e;
      e = next[e];
    }
    return e;
  };
  const tris = [];
  let head = 0, init = 0, reverse = false;
  while (count > 3) {
    const ear = earTipFind(init, reverse);
    if (sign[ear] !== CONVEX) concave--;
    const p = prev[ear], q = next[ear];
    tris.push([p, ear, q]);
    tree?.remove(ear);
    next[p] = q; prev[q] = p;
    if (head === ear) head = q;
    count--;
    dirty[p] = true; dirty[q] = true;
    if (sign[p] !== CONVEX) { signCalc(p); if (sign[p] === CONVEX) { concave--; tree.remove(p); } }
    if (sign[q] !== CONVEX) { signCalc(q); if (sign[q] === CONVEX) { concave--; tree.remove(q); } }
    init = reverse ? prev[p] : next[q];
    if (sign[init] !== CONVEX) { init = reverse ? prev[init] : next[init]; reverse = !reverse; }
  }
  tris.push([head, next[head], next[next[head]]]);
  return tris;
}

export function blenderQuadFlip(pts) {
  const [v1, v2, v3, v4] = toF32(pts);
  const d13 = sub3f(v3, v1);
  return dot3f(cross3f(sub3f(v2, v1), d13), cross3f(sub3f(v4, v1), d13)) > 0;
}

export function blenderTessellate(pts) {
  const n = pts.length;
  if (n < 3) throw new Error(`a polygon with ${n} corners is not a face`);
  if (n === 3) return [[0, 1, 2]];
  if (n === 4) return blenderQuadFlip(pts) ? [[0, 1, 3], [1, 2, 3]] : [[0, 1, 2], [0, 2, 3]];
  return blenderPolyfill(blenderProject(pts));
}

export function tilingFault(p2, tris, pts3 = null) {
  const n = p2.length;
  const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const span = (a, b) => Math.hypot(...a.map((v, k) => b[k] - v));
  let face = 0;
  for (let i = 0; i < n; i++) { const a = p2[i], b = p2[(i + 1) % n]; face += a[0] * b[1] - b[0] * a[1]; }
  face /= 2;
  if (!(Math.abs(face) > 0)) return 'it has no area in its plane';
  if (tris.length !== n - 2) return `${tris.length} triangles where ${n} corners take ${n - 2}`;
  let size = 0;
  for (const p of pts3 ?? p2) for (const v of p) size = Math.max(size, Math.abs(v));
  const thin = 4 * size * 2 ** -23;
  const s = Math.sign(face);
  const solid = [];
  let sum = 0;
  for (const t of tris) {
    if (t.length !== 3 || t.some((i) => !Number.isInteger(i) || i < 0 || i >= n)) return `a triangle [${t}] names a corner the face does not have`;
    const [a, b, c] = [p2[t[0]], p2[t[1]], p2[t[2]]];
    const twice = area2(a, b, c);
    sum += twice / 2;
    const [A, B, C] = pts3 ? [pts3[t[0]], pts3[t[1]], pts3[t[2]]] : [a, b, c];
    const own = pts3 ? Math.hypot(...cross3d(A, B, C)) : Math.abs(twice);
    if (!(own > thin * Math.max(span(A, B), span(B, C), span(C, A)))) continue;
    if (!(Math.abs(twice) > 1e-6 * own)) return `triangle [${t}] stands edge-on to the face (${(own / 2).toPrecision(4)} of its own, ${(twice / 2).toPrecision(4)} in the face's plane)`;
    if (Math.sign(twice) !== s) return `triangle [${t}] is wound against the face (${(twice / 2).toPrecision(4)} of ${face.toPrecision(6)})`;
    solid.push([a, b, c, s]);
  }
  if (Math.abs(sum - face) > 1e-6 * Math.abs(face)) return `its triangles cover ${sum.toPrecision(9)} of its ${face.toPrecision(9)}`;
  const segs = [];
  for (let i = 0; i < n; i++) segs.push([p2[i], p2[(i + 1) % n]]);
  for (const t of tris) for (let k = 0; k < 3; k++) segs.push([p2[t[k]], p2[t[(k + 1) % 3]]]);
  const eps = thin;
  const nearEdge = (q) => segs.some(([a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(q[0] - a[0] - u * dx, q[1] - a[1] - u * dy) <= eps;
  });
  const xs = p2.map((p) => p[0]);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b] = segs[i], [c, d] = segs[j];
      const d1 = area2(a, b, c), d2 = area2(a, b, d), d3 = area2(c, d, a), d4 = area2(c, d, b);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) xs.push(a[0] + (b[0] - a[0]) * (d3 / (d3 - d4)));
    }
  }
  xs.sort((a, b) => a - b);
  const winding = (q) => {
    let w = 0;
    for (let e = 0; e < n; e++) {
      const a = p2[e], b = p2[(e + 1) % n], c = area2(a, b, q);
      if (a[1] <= q[1]) { if (b[1] > q[1] && c > 0) w++; } else if (b[1] <= q[1] && c < 0) w--;
    }
    return w;
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    if (!(x1 - x0 > eps)) continue;
    const xm = (x0 + x1) / 2;
    const ys = [];
    for (const [a, b] of segs) {
      if (Math.min(a[0], b[0]) <= x0 && Math.max(a[0], b[0]) >= x1) ys.push(a[1] + (b[1] - a[1]) * (xm - a[0]) / (b[0] - a[0]));
    }
    ys.sort((a, b) => a - b);
    for (let k = 0; k + 1 < ys.length; k++) {
      if (!(ys[k + 1] - ys[k] > eps)) continue;
      const q = [xm, (ys[k] + ys[k + 1]) / 2];
      if (nearEdge(q)) continue;
      let cover = 0;
      for (const [a, b, c, st] of solid) if (st * area2(a, b, q) > 0 && st * area2(b, c, q) > 0 && st * area2(c, a, q) > 0) cover += st;
      const w = winding(q);
      if (cover !== w) return `${Math.abs(cover)} of its triangles${cover < 0 ? ' (against it)' : ''} lie over a point it winds ${w} times about (${q.map((v) => v.toPrecision(6)).join(', ')} in its plane)`;
    }
  }
  return null;
}

export function sceneFrame(tree) {
  const gs = nodeAt(tree.nodes, 'GlobalSettings');
  const num = (name, d) => { const v = gs ? property70(gs, name)?.[0] : undefined; return v === undefined ? d : Number(v); };
  const axis = (i, sign) => { const v = [0, 0, 0]; v[i] = sign < 0 ? -1 : 1; return v; };
  const upI = num('UpAxis', 1); const coordI = num('CoordAxis', 0);
  if (![0, 1, 2].includes(upI) || ![0, 1, 2].includes(coordI) || upI === coordI) {
    throw new Error(`GlobalSettings names UpAxis ${upI} and CoordAxis ${coordI} - not two distinct axes`);
  }
  const up = axis(upI, num('UpAxisSign', 1));
  const coord = axis(coordI, num('CoordAxisSign', 1));
  const side = [up[1] * coord[2] - up[2] * coord[1], up[2] * coord[0] - up[0] * coord[2], up[0] * coord[1] - up[1] * coord[0]];
  const unitScale = num('UnitScaleFactor', 1);
  if (!(unitScale > 0)) throw new Error(`GlobalSettings UnitScaleFactor ${unitScale} is not a length`);
  const u = unitScale / 100;
  const m = [...coord, ...side, ...up].map((v) => v * u);
  return { m, unitScale };
}

const UNSUPPORTED_TRANSFORM = [
  ['PreRotation', [0, 0, 0]], ['PostRotation', [0, 0, 0]],
  ['RotationOffset', [0, 0, 0]], ['RotationPivot', [0, 0, 0]],
  ['ScalingOffset', [0, 0, 0]], ['ScalingPivot', [0, 0, 0]],
  ['GeometricTranslation', [0, 0, 0]], ['GeometricRotation', [0, 0, 0]], ['GeometricScaling', [1, 1, 1]],
];

function assertRootObject(tree, model) {
  const id = model.props[0];
  for (const c of childrenNamed(nodeAt(tree.nodes, 'Connections'), 'C')) {
    if (c.props[0] === 'OO' && c.props[1] === id && c.props[2] !== 0 && c.props[2] !== 0n) {
      throw new Error(`${objectName(model.props[1])} is parented under object ${c.props[2]} - apply or clear the parent in Blender, a scene placement reads the object's own transform only`);
    }
  }
  for (const [name, identity] of UNSUPPORTED_TRANSFORM) {
    const v = property70(model, name);
    if (v && v.some((x, i) => Math.abs(Number(x) - identity[i]) > 1e-9)) {
      throw new Error(`${objectName(model.props[1])} carries ${name} ${JSON.stringify(v)} - a scene placement reads T*R*S only`);
    }
  }
}

// ByVertice and ByVertex layers index by the corner's position, ByPolygonVertex by the corner itself.
export function layerReader(layer, stride, valueKey, indexKey) {
  if (!layer) return null;
  const values = childNamed(layer, valueKey)?.props[0];
  if (!values) return null;
  const map = childNamed(layer, 'MappingInformationType')?.props[0];
  const ref = childNamed(layer, 'ReferenceInformationType')?.props[0];
  const idx = childNamed(layer, indexKey)?.props[0] ?? null;
  if (map !== 'ByPolygonVertex' && map !== 'ByVertice' && map !== 'ByVertex') {
    throw new Error(`${valueKey}: MappingInformationType ${map} is not supported (need ByPolygonVertex or ByVertice)`);
  }
  if (ref !== 'Direct' && ref !== 'IndexToDirect') {
    throw new Error(`${valueKey}: ReferenceInformationType ${ref} is not Direct or IndexToDirect`);
  }
  if (ref === 'IndexToDirect' && !idx) throw new Error(`${valueKey}: IndexToDirect with no ${indexKey}`);
  const byVertex = map !== 'ByPolygonVertex';
  return (corner, position) => {
    const key = byVertex ? position : corner;
    const at = (ref === 'IndexToDirect' ? idx[key] : key) * stride;
    const out = new Array(stride);
    for (let k = 0; k < stride; k++) out[k] = values[at + k];
    return out;
  };
}

export function cornerWelder({ readNormal, readUv, position, normal, out = { positions: [], normals: [], uvs: [] } }) {
  const seen = new Map();
  return {
    out,
    corner(c, positionIndex) {
      const n = readNormal ? readNormal(c, positionIndex) : null;
      const uv = readUv ? readUv(c, positionIndex) : null;
      // The weld key is the authored triple, rounded so last-bit float noise does not leave a seam nobody authored.
      const key = `${positionIndex}|${n ? n.map((v) => v.toFixed(5)).join(',') : ''}|${uv ? uv.map((v) => v.toFixed(6)).join(',') : ''}`;
      const hit = seen.get(key);
      if (hit !== undefined) return hit;
      const at = out.positions.length / 3;
      out.positions.push(...position(positionIndex));
      if (n) out.normals.push(...normal(n));
      if (uv) out.uvs.push(uv[0], uv[1]);
      seen.set(key, at);
      return at;
    },
  };
}

function materialReader(geo, polygons) {
  const layer = childNamed(geo, 'LayerElementMaterial');
  if (!layer) throw new Error('the Geometry carries no LayerElementMaterial - there is no material to bake alone');
  const map = childNamed(layer, 'MappingInformationType')?.props[0];
  const ids = childNamed(layer, 'Materials')?.props[0];
  if (!ids?.length) throw new Error('LayerElementMaterial carries no Materials');
  if (map === 'AllSame') return () => ids[0];
  if (map === 'ByPolygon') {
    if (ids.length !== polygons) throw new Error(`LayerElementMaterial: ${ids.length} material indices for ${polygons} polygons`);
    return (i) => ids[i];
  }
  throw new Error(`LayerElementMaterial: MappingInformationType ${map} is not ByPolygon or AllSame`);
}

export function objectMaterials(tree, name) {
  const objects = nodeAt(tree.nodes, 'Objects');
  const byId = new Map((objects?.children ?? []).map((o) => [String(o.props[0]), o]));
  const model = childrenNamed(objects, 'Model').find((m) => m.props[2] === 'Mesh' && objectName(m.props[1]) === name);
  if (!model) throw new Error(`no Mesh object "${name}" in this export`);
  const conns = childrenNamed(nodeAt(tree.nodes, 'Connections'), 'C');
  const into = (id, kind) => conns.filter((c) => String(c.props[2]) === id && byId.get(String(c.props[1]))?.name === kind);
  const node = (c) => byId.get(String(c.props[1]));
  return into(String(model.props[0]), 'Material').map((m) => {
    const texs = into(String(node(m).props[0]), 'Texture');
    const tex = texs.length ? node(texs.find((c) => c.props[3] === 'DiffuseColor') ?? texs[0]) : null;
    const file = tex ? String(childNamed(tex, 'RelativeFilename')?.props[0] ?? '') : '';
    return file ? file.replace(/\\/g, '/') : null;
  });
}

export function bakeMesh(tree, { name = null, keepRotation = false, normalise = true, forward = '-z', up = '-x', units = 1, origin = 'centre', placement = 'object', material = null } = {}) {
  if (placement !== 'object' && placement !== 'scene') throw new Error(`placement "${placement}" is not object or scene`);
  const scene = placement === 'scene';
  const toBasis = basisMap(forward, up);
  const objects = nodeAt(tree.nodes, 'Objects');
  if (!objects) throw new Error('no Objects section in this FBX');
  const geos = childrenNamed(objects, 'Geometry').filter((g) => g.props[2] === 'Mesh');
  if (geos.length !== 1) {
    throw new Error(`expected exactly one Mesh Geometry, found ${geos.length}: ${geos.map((g) => objectName(g.props[1])).join(', ')}`);
  }
  const geo = geos[0];
  const models = childrenNamed(objects, 'Model').filter((m) => m.props[2] === 'Mesh');
  const model = models[0] ?? null;
  if (scene && !model) throw new Error('a scene placement needs the Model that places the mesh, and this FBX has none');

  const positions = childNamed(geo, 'Vertices')?.props[0];
  const pvi = childNamed(geo, 'PolygonVertexIndex')?.props[0];
  if (!positions || !pvi) throw new Error('the Geometry carries no Vertices/PolygonVertexIndex');

  const normalLayer = childNamed(geo, 'LayerElementNormal');
  const uvLayer = childNamed(geo, 'LayerElementUV');
  const readNormal = layerReader(normalLayer, 3, 'Normals', 'NormalsIndex');
  const readUv = layerReader(uvLayer, 2, 'UV', 'UVIndex');

  const scale = (model && property70(model, 'Lcl Scaling')) ?? [1, 1, 1];
  const rotation = (model && property70(model, 'Lcl Rotation')) ?? [0, 0, 0];
  const translation = (model && property70(model, 'Lcl Translation')) ?? [0, 0, 0];
  const useRotation = keepRotation || scene;
  const rotationOrder = model ? Number(property70(model, 'RotationOrder')?.[0] ?? 0) : 0;
  if (useRotation && rotationOrder !== 0) throw new Error(`RotationOrder ${rotationOrder} is not eOrderXYZ (0) - set the object's rotation mode to XYZ Euler in Blender`);
  const R = useRotation ? eulerXYZ(rotation) : null;
  let frame = null;
  if (scene) {
    assertRootObject(tree, model);
    const f = sceneFrame(tree);
    frame = { m: f.m, t: apply3(f.m, translation.map(Number)), unitScale: f.unitScale };
  }
  // The inverse transpose of a pure scale is its reciprocal, so normals take 1 / scale.
  const nScale = scale.map((s) => (s === 0 ? 0 : 1 / s));

  const placePosition = (p) => {
    let v = [p[0] * scale[0], p[1] * scale[1], p[2] * scale[2]];
    if (R) v = apply3(R, v);
    if (frame) { v = apply3(frame.m, v); v = [v[0] + frame.t[0], v[1] + frame.t[1], v[2] + frame.t[2]]; }
    return toBasis(v);
  };
  const placeNormal = (n) => {
    let v = [n[0] * nScale[0], n[1] * nScale[1], n[2] * nScale[2]];
    if (R) v = apply3(R, v);
    if (frame) v = apply3(frame.m, v);
    v = toBasis(v);
    const len = Math.hypot(v[0], v[1], v[2]);
    return len > 1e-12 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 1];
  };

  const polys = polygonsOf(pvi);
  const wears = material === null ? null : materialReader(geo, polys.length);
  const weld = cornerWelder({ readNormal, readUv, position: (i) => placePosition(positions.slice(i * 3, i * 3 + 3)), normal: placeNormal });
  const { positions: outPos, normals: outNrm, uvs: outUv } = weld.out;
  const indices = [];
  let corner = 0;
  let ngons = 0;
  let clipped = 0;
  let repeated = 0;
  let kept = 0;
  const cornerOf = weld.corner;

  for (let pi = 0; pi < polys.length; pi++) {
    const poly = polys[pi];
    const base = corner;
    corner += poly.length;
    if (poly.length < 3) throw new Error(`a polygon with ${poly.length} corners is not a face`);
    if (wears && wears(pi) !== material) continue;
    kept++;
    if (poly.length > 4) ngons++;
    const ring = poly.map((p, i) => cornerOf(base + i, p));
    // Fan when that is a valid triangulation and ear-clip otherwise, so convex meshes keep the bytes they baked to.
    const pts = poly.length > 3 ? poly.map((p) => placePosition(positions.slice(p * 3, p * 3 + 3))) : null;
    if (!pts || isConvexPolygon(pts)) {
      for (let i = 1; i + 1 < ring.length; i++) indices.push(ring[0], ring[i], ring[i + 1]);
    } else {
      let tris;
      try { tris = earClip(pts); } catch (err) {
        tris = earClipRepeated(pts);
        if (!tris) throw new Error(`${err.message} (the polygon at corner ${base})`);
        repeated++;
      }
      for (const [a, b, c] of tris) indices.push(ring[a], ring[b], ring[c]);
      clipped++;
    }
  }

  if (outPos.length / 3 > 65535) throw new Error(`${outPos.length / 3} vertices will not fit a Uint16 index buffer`);
  if (wears && !kept) throw new Error(`no polygon of this object wears material ${material}`);

  const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < outPos.length; i += 3) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], outPos[i + k]); max[k] = Math.max(max[k], outPos[i + k]); }
  }
  const size = [0, 1, 2].map((k) => max[k] - min[k]);
  const longest = Math.max(...size);
  // A scene placement is neither normalized nor recentered: where the mesh sits is what the modeler authored.
  const unit = !scene && normalise && longest > 0 ? units / longest : 1;
  const anchor = scene ? [0, 0, 0]
    : origin === 'grip'
      ? gripAnchor(outPos, min, max)
      : [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  for (let i = 0; i < outPos.length; i += 3) {
    for (let k = 0; k < 3; k++) outPos[i + k] = (outPos[i + k] - anchor[k]) * unit;
  }

  const round = (a, n) => a.map((v) => +v.toFixed(n));
  return {
    name: name ?? objectName(geo.props[1]) ?? 'mesh',
    bake: {
      tool: 'tools/fbxMesh.mjs',
      fbxVersion: tree.version,
      creator: nodeAt(tree.nodes, 'Creator')?.props[0] ?? childNamed(tree.nodes, 'Creator')?.props[0] ?? null,
      sourceVertices: positions.length / 3,
      sourceCorners: pvi.length,
      polygons: kept,
      ...(wears ? { material } : {}),
      ngons,
      clipped,
      ...(repeated ? { repeated } : {}),
      placement,
      appliedScale: round(scale, 6),
      droppedRotation: useRotation ? null : round(rotation, 6),
      ...(frame ? { sceneTranslation: round(frame.t, 6), unitScaleFactor: frame.unitScale } : {}),
      basis: `Morrowind (+Y forward, +Z up), from local forward=${forward} up=${up}`,
      sizeBeforeNormalise: round(size, 4),
      unitDivisor: +(1 / unit).toFixed(6),
      units: scene ? null : units,
      origin: scene ? 'scene' : origin,
      anchor: round(anchor, 4),
    },
    bounds: { min: round([0, 1, 2].map((k) => (min[k] - anchor[k]) * unit), 6), max: round([0, 1, 2].map((k) => (max[k] - anchor[k]) * unit), 6) },
    positions: round(outPos, 6),
    normals: outNrm.length ? round(outNrm, 6) : null,
    uvs: outUv.length ? round(outUv, 6) : null,
    indices,
  };
}

export function gripAnchor(positions, min, max, band = 0.18) {
  const cut = min[1] + (max[1] - min[1]) * band;
  let n = 0; const sum = [0, 0, 0];
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] > cut) continue;
    for (let k = 0; k < 3; k++) sum[k] += positions[i + k];
    n++;
  }
  if (!n) return [0, 1, 2].map((k) => (min[k] + max[k]) / 2);
  return sum.map((v) => v / n);
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (k) => args.includes(`--${k}`);
  const opt = (k, d = null) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length !== 2) {
    console.error('usage: node tools/fbxMesh.mjs <in.fbx> <out.json> [--name=X] [--forward=-z] [--up=-x] [--units=N] [--origin=centre|grip] [--keep-rotation] [--no-normalise] [--placement=object|scene] [--material=N]');
    process.exit(2);
  }
  const [inPath, outPath] = files;
  const mesh = bakeMesh(readFbx(readFileSync(inPath)), {
    name: opt('name'), keepRotation: flag('keep-rotation'), normalise: !flag('no-normalise'),
    forward: opt('forward', '-z'), up: opt('up', '-x'),
    units: Number(opt('units', 1)), origin: opt('origin', 'centre'),
    placement: opt('placement', 'object'),
    material: opt('material') === null ? null : Number(opt('material')),
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(mesh)}\n`);
  const b = mesh.bake;
  console.log(`${inPath} -> ${outPath}`);
  console.log(`  ${mesh.name}: ${b.polygons} polygons (${b.ngons} n-gons, ${b.clipped} ear-clipped) -> ${mesh.indices.length / 3} triangles`);
  console.log(`  ${b.sourceCorners} corners welded to ${mesh.positions.length / 3} vertices`);
  if (b.placement === 'scene') console.log(`  scene placement kept: translation ${b.sceneTranslation.join(', ')}, size ${b.sizeBeforeNormalise.join(' x ')}`);
  else console.log(`  scale ${b.appliedScale.join(' x ')} baked; size ${b.sizeBeforeNormalise.join(' x ')} / ${b.unitDivisor} -> longest axis ${b.units}`);
  console.log(`  origin ${b.origin} at ${JSON.stringify(b.anchor)}`);
  console.log(`  ${b.basis}`);
  console.log(`  bounds ${JSON.stringify(mesh.bounds.min)} .. ${JSON.stringify(mesh.bounds.max)}`);
}
