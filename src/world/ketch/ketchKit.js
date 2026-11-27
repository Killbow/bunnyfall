// @ts-check
import { deckToDungeon } from '../../net/ketch/ketchDeck.js';
import { faces } from '../gateModel.js';
import { KT_ARCHIVE, KT_NET_M } from './ketchArt.js';

export const KT_TILE_M = 2;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const D = (x, y, z) => deckToDungeon(x, y, z);

/** @param {{ f?: any, hit?: number[] | null }} [o] */
export function ketchKit({ f = faces(), hit = null } = {}) {
  function tri(rec, a, b, c, ua, ub, uc, want = null, solid = false) {
    const A = D(...a), B = D(...b), C = D(...c);
    const n = cross(sub(B, A), sub(C, A));
    if (want && dot(n, want) < 0) { if (rec != null) f.tri(rec, A, C, B, ua, uc, ub); }
    else if (rec != null) f.tri(rec, A, B, C, ua, ub, uc);
    if (solid && hit) hit.push(...A, ...B, ...C);
  }
  function quad(rec, a, b, c, d, want, uv = null, solid = false) {
    const U = uv ?? planeUv([a, b, c, d], want);
    tri(rec, a, b, c, U[0], U[1], U[2], want, solid);
    tri(rec, a, c, d, U[0], U[2], U[3], want, solid);
  }
  function quad2(rec, a, b, c, d, want, uv = null, solid = false) {
    quad(rec, a, b, c, d, want, uv, solid);
    quad(rec, a, b, c, d, [-want[0], -want[1], -want[2]], uv, false);
  }
  function box(rec, x0, x1, y0, y1, z0, z1, { skip = [], inside = false, solid = false, recs = null, hitSkip = false } = {}) {
    const s = inside ? -1 : 1, R = (k) => (recs?.[k] ?? rec);
    const F = {
      top: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, s, 0]],
      bottom: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -s, 0]],
      px: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [s, 0, 0]],
      nx: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-s, 0, 0]],
      pz: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, s]],
      nz: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -s]],
    };
    for (const [k, q] of Object.entries(F)) {
      const off = skip.includes(k);
      if (off && (hitSkip || !solid)) continue;
      quad(off ? null : R(k), q[0], q[1], q[2], q[3], q[4], null, solid);
    }
  }
  function prism(rec, pts, y0, y1, { top = true, bottom = false, solid = false, topRec = null } = {}) {
    const n = pts.length, cx = pts.reduce((t, p) => t + p[0], 0) / n, cz = pts.reduce((t, p) => t + p[1], 0) / n;
    let run = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const out = [(p[0] + q[0]) / 2 - cx, 0, (p[1] + q[1]) / 2 - cz];
      quad(rec, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], out, [[run / KT_TILE_M, y0 / KT_TILE_M], [(run + L) / KT_TILE_M, y0 / KT_TILE_M], [(run + L) / KT_TILE_M, y1 / KT_TILE_M], [run / KT_TILE_M, y1 / KT_TILE_M]], solid);
      run += L;
    }
    if (top) fan(topRec ?? rec, pts, y1, [0, 1, 0], solid);
    if (bottom) fan(rec, pts, y0, [0, -1, 0], solid);
  }
  function fan(rec, pts, y, want = [0, 1, 0], solid = false) {
    const uv = (p) => [p[0] / KT_TILE_M, p[1] / KT_TILE_M];
    for (let i = 1; i + 1 < pts.length; i++) tri(rec, [pts[0][0], y, pts[0][1]], [pts[i][0], y, pts[i][1]], [pts[i + 1][0], y, pts[i + 1][1]], uv(pts[0]), uv(pts[i]), uv(pts[i + 1]), want, solid);
  }
  function cyl(rec, cx, cz, r, y0, y1, n = 16, { top = true, bottom = false, solid = false, capRec = null, wrap = false, inside = false } = {}) {
    const C = 2 * Math.PI * r, s = inside ? -1 : 1;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const p = [cx + Math.sin(a0) * r, cz + Math.cos(a0) * r], q = [cx + Math.sin(a1) * r, cz + Math.cos(a1) * r];
      const u0 = wrap ? k / n : (a0 / (Math.PI * 2)) * C / KT_TILE_M, u1 = wrap ? (k + 1) / n : (a1 / (Math.PI * 2)) * C / KT_TILE_M;
      quad(rec, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], [s * Math.sin((a0 + a1) / 2), 0, s * Math.cos((a0 + a1) / 2)],
        [[u0, y0 / KT_TILE_M], [u1, y0 / KT_TILE_M], [u1, y1 / KT_TILE_M], [u0, y1 / KT_TILE_M]], solid);
    }
    if (top) disc(capRec ?? rec, cx, cz, r, y1, n, { solid, up: true, faceUv: true });
    if (bottom) disc(capRec ?? rec, cx, cz, r, y0, n, { solid, up: false, faceUv: true });
  }
  function disc(rec, cx, cz, r, y, n = 24, { solid = false, up = true, faceUv = false } = {}) {
    sector(rec, cx, cz, 0, r, 0, Math.PI * 2, y, n, { solid, up, faceUv });
  }
  function sector(rec, cx, cz, r0, r1, a0, a1, y, n = 12, { solid = false, up = true, faceUv = false, rim = 0, rimRec = null, inner = false, ends = false } = {}) {
    const P = (r, a) => [cx + Math.sin(a) * r, cz + Math.cos(a) * r];
    const uv = (p) => (faceUv ? [0.5 + (p[0] - cx) / (2 * r1), 0.5 + (p[1] - cz) / (2 * r1)] : [p[0] / KT_TILE_M, p[1] / KT_TILE_M]);
    const want = up ? [0, 1, 0] : [0, -1, 0];
    for (let k = 0; k < n; k++) {
      const b0 = a0 + ((a1 - a0) * k) / n, b1 = a0 + ((a1 - a0) * (k + 1)) / n;
      const o0 = P(r1, b0), o1 = P(r1, b1);
      if (r0 > 0) {
        const i0 = P(r0, b0), i1 = P(r0, b1);
        quad(rec, [i0[0], y, i0[1]], [o0[0], y, o0[1]], [o1[0], y, o1[1]], [i1[0], y, i1[1]], want, [uv(i0), uv(o0), uv(o1), uv(i1)], solid);
        if (inner && rim > 0) quad(rimRec ?? rec, [i0[0], y - rim, i0[1]], [i1[0], y - rim, i1[1]], [i1[0], y, i1[1]], [i0[0], y, i0[1]], [cx - (i0[0] + i1[0]) / 2, 0, cz - (i0[1] + i1[1]) / 2], null, solid);
      } else tri(rec, [cx, y, cz], [o0[0], y, o0[1]], [o1[0], y, o1[1]], uv([cx, cz]), uv(o0), uv(o1), want, solid);
      if (rim > 0) quad(rimRec ?? rec, [o0[0], y - rim, o0[1]], [o1[0], y - rim, o1[1]], [o1[0], y, o1[1]], [o0[0], y, o0[1]], [(o0[0] + o1[0]) / 2 - cx, 0, (o0[1] + o1[1]) / 2 - cz], null, solid);
    }
    if (ends && rim > 0) for (const a of [a0, a1]) {
      const i = P(r0, a), o = P(r1, a), side = a === a0 ? [-Math.cos(a), 0, Math.sin(a)] : [Math.cos(a), 0, -Math.sin(a)];
      quad(rimRec ?? rec, [i[0], y - rim, i[1]], [o[0], y - rim, o[1]], [o[0], y, o[1]], [i[0], y, i[1]], side, null, solid);
    }
  }
  function pipe(rec, a, b, r, n = 8, { solid = false, caps = false } = {}) {
    const ax = norm(sub(b, a)), up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s1 = norm(cross(ax, up)), s2 = norm(cross(ax, s1)), L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const at = (p, k) => { const t = (k / n) * Math.PI * 2, c = Math.cos(t) * r, s = Math.sin(t) * r; return [p[0] + s1[0] * c + s2[0] * s, p[1] + s1[1] * c + s2[1] * s, p[2] + s1[2] * c + s2[2] * s]; };
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n) * Math.PI * 2, out = [s1[0] * Math.cos(t) + s2[0] * Math.sin(t), s1[1] * Math.cos(t) + s2[1] * Math.sin(t), s1[2] * Math.cos(t) + s2[2] * Math.sin(t)];
      quad(rec, at(a, k), at(a, k + 1), at(b, k + 1), at(b, k), out, [[k / n, 0], [(k + 1) / n, 0], [(k + 1) / n, L / KT_TILE_M], [k / n, L / KT_TILE_M]], solid);
    }
    if (caps) for (const [p, w] of [[a, [-ax[0], -ax[1], -ax[2]]], [b, ax]]) for (let k = 0; k < n; k++) tri(rec, p, at(p, k), at(p, k + 1), [0.5, 0.5], [0, 0], [1, 0], w, solid);
  }
  function cone(rec, a, b, r, n = 8) {
    const ax = norm(sub(b, a)), up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s1 = norm(cross(ax, up)), s2 = norm(cross(ax, s1));
    const at = (k) => { const t = (k / n) * Math.PI * 2; return [a[0] + (s1[0] * Math.cos(t) + s2[0] * Math.sin(t)) * r, a[1] + (s1[1] * Math.cos(t) + s2[1] * Math.sin(t)) * r, a[2] + (s1[2] * Math.cos(t) + s2[2] * Math.sin(t)) * r]; };
    for (let k = 0; k < n; k++) {
      const p = at(k), q = at(k + 1), mid = [(p[0] + q[0] + b[0]) / 3 - a[0], (p[1] + q[1] + b[1]) / 3 - a[1], (p[2] + q[2] + b[2]) / 3 - a[2]];
      tri(rec, p, q, b, [k / n, 0], [(k + 1) / n, 0], [(k + 0.5) / n, 1], mid);
      tri(rec, a, q, p, [0.5, 0.5], [0, 0], [1, 0], [-ax[0], -ax[1], -ax[2]]);
    }
  }
  /**
   * @param {ReadonlyArray<ReadonlyArray<number>>} pts
   * @param {number} y
   * @param {{ h?: number, pitch?: number, post?: number, solid?: boolean, net?: number, netRec?: any, postRec?: number, barRec?: number }} [o]
   */
  function rail(pts, y, { h = 1.1, pitch = 2, post = 0.07, solid = true, net = 0, netRec = null, postRec, barRec } = {}) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]), ux = (q[0] - p[0]) / L, uz = (q[1] - p[1]) / L, nx = -uz, nz = ux;
      const m = Math.max(1, Math.round(L / pitch));
      for (let k = 0; k <= m; k++) {
        if (k === m && i + 2 < pts.length) continue;
        const x = p[0] + ux * (L * k) / m, z = p[1] + uz * (L * k) / m;
        box(postRec, x - post, x + post, y, y + h, z - post, z + post, { skip: ['bottom'] });
      }
      const bar = (yy, t) => {
        const a = [p[0] + nx * t, yy - t, p[1] + nz * t], b = [q[0] + nx * t, yy - t, q[1] + nz * t], c = [q[0] - nx * t, yy - t, q[1] - nz * t], d = [p[0] - nx * t, yy - t, p[1] - nz * t];
        const up = (P) => [P[0], P[1] + 2 * t, P[2]];
        quad(barRec, up(a), up(b), up(c), up(d), [0, 1, 0]);
        quad(barRec, a, b, up(b), up(a), [nx, 0, nz]);
        quad(barRec, d, c, up(c), up(d), [-nx, 0, -nz]);
        quad(barRec, a, b, c, d, [0, -1, 0]);
      };
      bar(y + h, 0.06);
      bar(y + h * 0.5, 0.035);
      if (solid) quad(null, [p[0], y, p[1]], [q[0], y, q[1]], [q[0], y + h, q[1]], [p[0], y + h, p[1]], [nx, 0, nz], null, true);
      if (net > 0) {
        quad2(netRec, [p[0], y + h, p[1]], [q[0], y + h, q[1]], [q[0], y + net, q[1]], [p[0], y + net, p[1]], [nx, 0, nz], [[0, 0], [L / KT_NET_M, 0], [L / KT_NET_M, (net - h) / KT_NET_M], [0, (net - h) / KT_NET_M]]);
        quad(null, [p[0], y, p[1]], [q[0], y, q[1]], [q[0], y + net, q[1]], [p[0], y + net, p[1]], [nx, 0, nz], null, true);
      }
    }
  }
  function slabWithHoles(rec, x0, x1, z0, z1, y, holes, want = [0, 1, 0], solid = false) {
    const zs = [...new Set([z0, z1, ...holes.flatMap((h) => [h[2], h[3]])])].filter((z) => z >= z0 && z <= z1).sort((a, b) => a - b);
    for (let j = 0; j + 1 < zs.length; j++) {
      const za = zs[j], zb = zs[j + 1], zm = (za + zb) / 2;
      const cuts = holes.filter((h) => zm > h[2] && zm < h[3]).map((h) => [Math.max(x0, h[0]), Math.min(x1, h[1])]).sort((a, b) => a[0] - b[0]);
      let x = x0;
      for (const [c0, c1] of cuts) { if (c0 > x) quad(rec, [x, y, za], [c0, y, za], [c0, y, zb], [x, y, zb], want, null, solid); x = Math.max(x, c1); }
      if (x < x1) quad(rec, [x, y, za], [x1, y, za], [x1, y, zb], [x, y, zb], want, null, solid);
    }
  }
  // The collider is two-sided, so the solid ramp also draws its underside; undrawn, it is an invisible ceiling for
  // a body under the stairs.
  function stairs(rec, x0, x1, z0, z1, y0, y1, n, { solid = true, riserRec = null, soffitRec = null } = {}) {
    const dz = (z1 - z0) / n, dy = (y1 - y0) / n, s = Math.sign(dy) || -1;
    for (let k = 0; k < n; k++) {
      const za = z0 + dz * k, zb = za + dz, yt = y0 + dy * (k + 1);
      quad(rec, [x0, yt, za], [x1, yt, za], [x1, yt, zb], [x0, yt, zb], [0, 1, 0]);
      quad(riserRec ?? rec, [x0, yt - dy, za], [x1, yt - dy, za], [x1, yt, za], [x0, yt, za], [0, 0, s < 0 ? -1 : 1]);
    }
    if (solid) {
      quad(null, [x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], null, true);
      quad(soffitRec ?? riserRec ?? rec, [x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1], [0, -1, 0]);
    }
  }
  return { f, hit, tri, quad, quad2, box, prism, fan, cyl, disc, sector, pipe, cone, rail, slabWithHoles, stairs };
}

function planeUv(pts, want) {
  const n = want ? norm(want) : norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  const flat = Math.abs(n[1]) > 0.7, ax = flat ? [1, 0, 0] : norm([-n[2], 0, n[0]]), ay = flat ? [0, 0, 1] : [0, 1, 0];
  return pts.map((p) => [dot(p, ax) / KT_TILE_M, dot(p, ay) / KT_TILE_M]);
}

export function packKetchFaces(f, archive = KT_ARCHIVE) {
  const recs = [...f.byRec.keys()].sort((a, b) => a - b);
  const count = recs.reduce((n, r) => n + f.byRec.get(r).p.length / 3, 0);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const indices = new Uint32Array(count);
  const subMeshes = [];
  let v = 0;
  for (const rec of recs) {
    const g = f.byRec.get(rec);
    const n = g.p.length / 3;
    positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2);
    for (let i = 0; i < n; i++) indices[v + i] = v + i;
    subMeshes.push({ textureArchive: archive, textureRecord: rec, startIndex: v, primitiveCount: n / 3 });
    v += n;
  }
  return { positions, normals, uvs, indices, subMeshes };
}
export function packKetchHit(hit) {
  const positions = new Float32Array(hit), n = positions.length / 3;
  const indices = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  for (let i = 0; i < n; i++) indices[i] = i;
  return { positions, indices };
}
