// @ts-check
// Every face winds so (b - a) x (c - a) points out of the solid, because the world pass culls back faces.

export const MESH_KIT_START = 96;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** @param {{ start?: number }} [o] */
export function createMeshKit({ start = MESH_KIT_START } = {}) {
  /** @type {Map<number, { p: Float32Array, n: Float32Array, uv: Float32Array, v: number }>} */
  const byRec = new Map();
  let verts = 0;
  const bucket = (rec) => {
    let b = byRec.get(rec);
    if (!b) byRec.set(rec, b = { p: new Float32Array(start * 3), n: new Float32Array(start * 3), uv: new Float32Array(start * 2), v: 0 });
    return b;
  };
  const grow = (b, need) => {
    if (b.v + need <= b.p.length / 3) return;
    let cap = b.p.length / 3;
    while (cap < b.v + need) cap *= 2;
    const p = new Float32Array(cap * 3), n = new Float32Array(cap * 3), uv = new Float32Array(cap * 2);
    p.set(b.p.subarray(0, b.v * 3)); n.set(b.n.subarray(0, b.v * 3)); uv.set(b.uv.subarray(0, b.v * 2));
    b.p = p; b.n = n; b.uv = uv;
  };
  function rawTri(rec, a, b, c, ua = [0, 0], ub = [1, 0], uc = [1, 1]) {
    const g = bucket(rec);
    grow(g, 3);
    const nn = unit(cross(sub(b, a), sub(c, a)));
    for (const [q, u] of [[a, ua], [b, ub], [c, uc]]) {
      const i = g.v * 3, j = g.v * 2;
      g.p[i] = q[0]; g.p[i + 1] = q[1]; g.p[i + 2] = q[2];
      g.n[i] = nn[0]; g.n[i + 1] = nn[1]; g.n[i + 2] = nn[2];
      g.uv[j] = u[0]; g.uv[j + 1] = u[1];
      g.v++;
    }
    verts += 3;
  }
  const facing = (a, b, c, out, dir) => {
    const nn = cross(sub(b, a), sub(c, a));
    if (!out) return true;
    if (dir) return dot(nn, out) >= 0;
    const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    return dot(nn, sub(mid, out)) >= 0;
  };
  const kit = {
    tri(rec, a, b, c, out = null, dir = true, ua = [0, 0], ub = [1, 0], uc = [1, 1]) {
      if (facing(a, b, c, out, dir)) rawTri(rec, a, b, c, ua, ub, uc); else rawTri(rec, a, c, b, ua, uc, ub);
      return kit;
    },
    quad(rec, a, b, c, d, out = null, dir = true, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      if (facing(a, b, c, out, dir)) { rawTri(rec, a, b, c, uv[0], uv[1], uv[2]); rawTri(rec, a, c, d, uv[0], uv[2], uv[3]); }
      else { rawTri(rec, a, d, c, uv[0], uv[3], uv[2]); rawTri(rec, a, c, b, uv[0], uv[2], uv[1]); }
      return kit;
    },
    box(rec, lo, hi, { skip = [], uvScale = 0.5 } = {}) {
      const [x0, y0, z0] = lo, [x1, y1, z1] = hi, s = uvScale, P = (x, y, z) => [x, y, z];
      const U = (a, b) => [[0, 0], [a * s, 0], [a * s, b * s], [0, b * s]];
      /** @type {Array<[string, number[][], number[], number[][]]>} */
      const F = [
        ['top', [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], [0, 1, 0], U(x1 - x0, z1 - z0)],
        ['bottom', [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], [0, -1, 0], U(x1 - x0, z1 - z0)],
        ['nz', [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)], [0, 0, -1], U(x1 - x0, y1 - y0)],
        ['pz', [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], [0, 0, 1], U(x1 - x0, y1 - y0)],
        ['nx', [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], [-1, 0, 0], U(z1 - z0, y1 - y0)],
        ['px', [P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)], [1, 0, 0], U(z1 - z0, y1 - y0)],
      ];
      for (const [name, q, out, uv] of F) if (!skip.includes(name)) kit.quad(rec, q[0], q[1], q[2], q[3], out, true, uv);
      return kit;
    },
    prism(rec, poly, y0, y1, { top = true, bottom = false, uvScale = 0.5 } = {}) {
      const n = poly.length, cx = poly.reduce((a, p) => a + p[0], 0) / n, cz = poly.reduce((a, p) => a + p[1], 0) / n;
      let along = 0;
      for (let k = 0; k < n; k++) {
        const p = poly[k], q = poly[(k + 1) % n], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const out = [((p[0] + q[0]) / 2) - cx, 0, ((p[1] + q[1]) / 2) - cz];
        kit.quad(rec, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], out, true, [[along * uvScale, 0], [(along + len) * uvScale, 0], [(along + len) * uvScale, (y1 - y0) * uvScale], [along * uvScale, (y1 - y0) * uvScale]]);
        along += len;
      }
      const cap = (y, up) => { for (let k = 1; k + 1 < n; k++) kit.tri(rec, [poly[0][0], y, poly[0][1]], [poly[k][0], y, poly[k][1]], [poly[k + 1][0], y, poly[k + 1][1]], [0, up, 0], true, [poly[0][0] * uvScale, poly[0][1] * uvScale], [poly[k][0] * uvScale, poly[k][1] * uvScale], [poly[k + 1][0] * uvScale, poly[k + 1][1] * uvScale]); };
      if (top) cap(y1, 1);
      if (bottom) cap(y0, -1);
      return kit;
    },
    extrude(rec, profile, a, b, { caps = true, uvScale = 0.5 } = {}) {
      const d = unit(sub(b, a)), side = unit(cross(d, [0, 1, 0])), up = cross(side, d), len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const at = (o, p) => [o[0] + side[0] * p[0] + up[0] * p[1], o[1] + side[1] * p[0] + up[1] * p[1], o[2] + side[2] * p[0] + up[2] * p[1]];
      const n = profile.length, cu = profile.reduce((s, p) => s + p[0], 0) / n, cv = profile.reduce((s, p) => s + p[1], 0) / n;
      for (let k = 0; k < n; k++) {
        const p = profile[k], q = profile[(k + 1) % n], mid = [(p[0] + q[0]) / 2 - cu, (p[1] + q[1]) / 2 - cv];
        const out = [side[0] * mid[0] + up[0] * mid[1], side[1] * mid[0] + up[1] * mid[1], side[2] * mid[0] + up[2] * mid[1]];
        const w = Math.hypot(q[0] - p[0], q[1] - p[1]);
        kit.quad(rec, at(a, p), at(a, q), at(b, q), at(b, p), out, true, [[0, 0], [w * uvScale, 0], [w * uvScale, len * uvScale], [0, len * uvScale]]);
      }
      if (caps) for (const [o, s] of [[a, -1], [b, 1]]) for (let k = 1; k + 1 < n; k++) kit.tri(rec, at(o, profile[0]), at(o, profile[k]), at(o, profile[k + 1]), [d[0] * s, d[1] * s, d[2] * s]);
      return kit;
    },
    lathe(rec, profile, sides, { centre = [0, 0, 0], a0 = 0, a1 = Math.PI * 2, uvScale = 0.5 } = {}) {
      for (let k = 0; k < sides; k++) {
        const t0 = a0 + ((a1 - a0) * k) / sides, t1 = a0 + ((a1 - a0) * (k + 1)) / sides, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
        for (let j = 0; j + 1 < profile.length; j++) {
          const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
          const P = (r, y, c, s) => [centre[0] + r * c, centre[1] + y, centre[2] + r * s];
          const mid = Math.cos((t0 + t1) / 2), mids = Math.sin((t0 + t1) / 2);
          const pa = P(r0, y0, c0, s0), pb = P(r0, y0, c1, s1), pc = P(r1, y1, c1, s1), pd = P(r1, y1, c0, s0);
          if (Math.max(r0, r1) <= 0) continue;
          const u0 = (k / sides) * Math.PI * 2 * Math.max(r0, r1) * uvScale, u1 = ((k + 1) / sides) * Math.PI * 2 * Math.max(r0, r1) * uvScale;
          const uv = [[u0, y0 * uvScale], [u1, y0 * uvScale], [u1, y1 * uvScale], [u0, y1 * uvScale]];
          const nr = y1 - y0, ny = -(r1 - r0), out = [nr * mid, ny, nr * mids];
          if (r0 <= 0) kit.tri(rec, pa, pc, pd, out, true, uv[0], uv[2], uv[3]);
          else if (r1 <= 0) kit.tri(rec, pa, pb, pc, out, true, uv[0], uv[1], uv[2]);
          else kit.quad(rec, pa, pb, pc, pd, out, true, uv);
        }
      }
      return kit;
    },
    sweep(rec, profile, path, { closed = false, uvScale = 0.5 } = {}) {
      const m = path.length;
      if (m < 2) return kit;
      const tangent = (i) => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(m - 1, i + 1)];
        return unit(closed ? sub(path[(i + 1) % m], path[(i - 1 + m) % m]) : sub(b, a));
      };
      let t = tangent(0), side = unit(Math.abs(t[1]) > 0.95 ? cross(t, [1, 0, 0]) : cross(t, [0, 1, 0]));
      const rings = [];
      for (let i = 0; i < m; i++) {
        const ti = tangent(i);
        side = unit(sub(side, [ti[0] * dot(side, ti), ti[1] * dot(side, ti), ti[2] * dot(side, ti)]));
        const up = cross(side, ti);
        rings.push(profile.map((p) => [path[i][0] + side[0] * p[0] + up[0] * p[1], path[i][1] + side[1] * p[0] + up[1] * p[1], path[i][2] + side[2] * p[0] + up[2] * p[1]]));
        t = ti;
      }
      const segs = closed ? m : m - 1;
      let along = 0;
      for (let i = 0; i < segs; i++) {
        const A = rings[i], B = rings[(i + 1) % m], len = Math.hypot(...sub(path[(i + 1) % m], path[i]));
        const ca = path[i], cb = path[(i + 1) % m], cm = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2, (ca[2] + cb[2]) / 2];
        for (let k = 0; k < profile.length; k++) {
          const k1 = (k + 1) % profile.length;
          kit.quad(rec, A[k], A[k1], B[k1], B[k], cm, false, [[k * uvScale, along * uvScale], [(k + 1) * uvScale, along * uvScale], [(k + 1) * uvScale, (along + len) * uvScale], [k * uvScale, (along + len) * uvScale]]);
        }
        along += len;
      }
      return kit;
    },
    mesh(rec, src, { start = 0, count = src.indices.length / 3, at = [0, 0, 0] } = {}) {
      const g = bucket(rec);
      grow(g, count * 3);
      for (let k = start; k < start + count * 3; k++) {
        const v = src.indices[k], i = g.v * 3, j = g.v * 2;
        g.p[i] = src.positions[v * 3] + at[0]; g.p[i + 1] = src.positions[v * 3 + 1] + at[1]; g.p[i + 2] = src.positions[v * 3 + 2] + at[2];
        g.n[i] = src.normals[v * 3]; g.n[i + 1] = src.normals[v * 3 + 1]; g.n[i + 2] = src.normals[v * 3 + 2];
        g.uv[j] = src.uvs[v * 2]; g.uv[j + 1] = src.uvs[v * 2 + 1];
        g.v++;
      }
      verts += count * 3;
      return kit;
    },
    get vertexCount() { return verts; },
    get triangleCount() { return verts / 3; },
    records: () => [...byRec.keys()].sort((a, b) => a - b),
    pack(archive) {
      const recs = kit.records(), positions = new Float32Array(verts * 3), normals = new Float32Array(verts * 3), uvs = new Float32Array(verts * 2), indices = new Uint32Array(verts);
      const subMeshes = [];
      let v = 0;
      for (const rec of recs) {
        const g = byRec.get(rec);
        positions.set(g.p.subarray(0, g.v * 3), v * 3); normals.set(g.n.subarray(0, g.v * 3), v * 3); uvs.set(g.uv.subarray(0, g.v * 2), v * 2);
        for (let i = 0; i < g.v; i++) indices[v + i] = v + i;
        subMeshes.push({ textureArchive: archive, textureRecord: rec, startIndex: v, primitiveCount: g.v / 3 });
        v += g.v;
      }
      return { positions, normals, uvs, indices, subMeshes };
    },
  };
  return kit;
}

export function meshKitBounds(positions) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], positions[i + k]); b[k + 3] = Math.max(b[k + 3], positions[i + k]); }
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  let r = 0;
  for (let i = 0; i < positions.length; i += 3) r = Math.max(r, Math.hypot(positions[i] - c[0], positions[i + 1] - c[1], positions[i + 2] - c[2]));
  return { box: b, centre: c, r };
}
