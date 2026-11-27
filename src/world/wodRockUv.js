// @ts-check
// World of Daggerfall rock texturing and stretch limits.

export const WOD_ROCK_STRETCH_MIN = 4;

export const WOD_ROCK_MODELS = new Set([60610, 60711, 60712, 60713, 60714, 60715, 60716, 60717, 60718, 60719, 60720, 41719]);
export const WOD_ROCK_PEBBLE_MIN = 1.05;
export const WOD_ROCK_MAX_REPEATS_PER_M = 1 / 8;

export function pieceStretch(m) {
  return Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const scaled = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

/**
 * @template {{positions: Float32Array, normals?: Float32Array, uvs?: Float32Array, indices: Uint32Array, subMeshes: Array<any>}} M
 * @param {M} cpu
 * @param {ArrayLike<number>} matrix
 * @param {?number} [modelId]
 * @param {number} [minStretch]
 * @returns {M}
 */
export function wodRockUvs(cpu, matrix, modelId = null, minStretch = WOD_ROCK_MODELS.has(modelId) ? WOD_ROCK_PEBBLE_MIN : WOD_ROCK_STRETCH_MIN) {
  if (!cpu?.uvs || !cpu.indices?.length || !(pieceStretch(matrix) + 1e-4 >= minStretch)) return cpu;
  const P = cpu.positions, UV = cpu.uvs, I = cpu.indices;
  const nV = P.length / 3, nT = I.length / 3;
  const cap = WOD_ROCK_MODELS.has(modelId) ? WOD_ROCK_MAX_REPEATS_PER_M : Infinity;
  const pos = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const lin = (d) => [
    matrix[0] * d[0] + matrix[4] * d[1] + matrix[8] * d[2],
    matrix[1] * d[0] + matrix[5] * d[1] + matrix[9] * d[2],
    matrix[2] * d[0] + matrix[6] * d[1] + matrix[10] * d[2],
  ];

  const parent = new Int32Array(nV).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < nT; t++) {
    const a = find(I[t * 3]), b = find(I[t * 3 + 1]), c = find(I[t * 3 + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  let ext = 0;
  for (let i = 0; i < P.length; i++) ext = Math.max(ext, Math.abs(P[i]));
  const tol = Math.max(ext, 1e-6) * 1e-4;

  /** @type {Array<{n: number[], d: number, tris: number[]}>} */
  const planes = [];
  const byRoot = new Map();
  for (let t = 0; t < nT; t++) {
    const pa = pos(I[t * 3]), n0 = cross(sub(pos(I[t * 3 + 1]), pa), sub(pos(I[t * 3 + 2]), pa)), l = len(n0);
    const root = find(I[t * 3]);
    let list = byRoot.get(root);
    if (!list) byRoot.set(root, list = []);
    let g = -1;
    if (l > 0) {
      const n = scaled(n0, 1 / l), d = dot(n, pa);
      g = list.find((k) => dot(planes[k].n, n) > 1 - 1e-4 && Math.abs(dot(planes[k].n, pa) - planes[k].d) <= tol) ?? -1;
      if (g < 0) { g = planes.length; planes.push({ n, d, tris: [] }); list.push(g); }
    } else if (list.length) g = list[0];
    else { g = planes.length; planes.push({ n: [0, 0, 0], d: 0, tris: [] }); list.push(g); }
    planes[g].tris.push(t);
  }

  const out = { positions: [], normals: [], uvs: [] };
  const uvs = new Float32Array(UV);
  let indices = I;
  const owner = new Int32Array(nV).fill(-1);
  const copyOf = new Map();
  let next = nV;
  for (let g = 0; g < planes.length; g++) {
    const { tris } = planes[g];
    let ref = -1, best = 0;
    for (const t of tris) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      const area = len(cross(sub(pos(b), pos(a)), sub(pos(c), pos(a))));
      const det = (UV[b * 2] - UV[a * 2]) * (UV[c * 2 + 1] - UV[a * 2 + 1]) - (UV[c * 2] - UV[a * 2]) * (UV[b * 2 + 1] - UV[a * 2 + 1]);
      if (area > best && Math.abs(det) > 1e-12) { best = area; ref = t; }
    }
    let map = null;
    if (ref >= 0) {
      const a = I[ref * 3], b = I[ref * 3 + 1], c = I[ref * 3 + 2];
      const pa = pos(a), e1 = sub(pos(b), pa), e2 = sub(pos(c), pa);
      const dt = (UV[b * 2] - UV[a * 2]) * (UV[c * 2 + 1] - UV[a * 2 + 1]) - (UV[c * 2] - UV[a * 2]) * (UV[b * 2 + 1] - UV[a * 2 + 1]);
      const rows = sub(scaled(e1, (UV[c * 2 + 1] - UV[a * 2 + 1]) / dt), scaled(e2, (UV[b * 2 + 1] - UV[a * 2 + 1]) / dt));
      const n0 = cross(e1, e2), t0 = scaled(rows, 1 / len(rows)), b0 = cross(scaled(n0, 1 / len(n0)), t0);
      const x1 = dot(e1, t0), y1 = dot(e1, b0), x2 = dot(e2, t0), y2 = dot(e2, b0);
      const du1 = UV[b * 2] - UV[a * 2], dv1 = UV[b * 2 + 1] - UV[a * 2 + 1];
      const du2 = UV[c * 2] - UV[a * 2], dv2 = UV[c * 2 + 1] - UV[a * 2 + 1];
      const k = x1 * y2 - x2 * y1;
      const f1 = lin(rows), m1 = cross(lin(e1), lin(e2)), lf = len(f1), lm = len(m1);
      if (k !== 0 && lf > 0 && lm > 0 && Number.isFinite(lf * lm)) {
        let ux = (du1 * y2 - du2 * y1) / k, uy = (du2 * x1 - du1 * x2) / k;
        let vx = (dv1 * y2 - dv2 * y1) / k, vy = (dv2 * x1 - dv1 * x2) / k;
        if (cap < Infinity) {
          const s1 = ux * ux + uy * uy + vx * vx + vy * vy, s2 = Math.sqrt((ux * ux + uy * uy - vx * vx - vy * vy) ** 2 + 4 * (ux * vx + uy * vy) ** 2);
          const fine = Math.sqrt((s1 + s2) / 2);
          if (fine > cap) { const q = cap / fine; ux *= q; uy *= q; vx *= q; vy *= q; }
        }
        const t1 = scaled(f1, 1 / lf), b1 = cross(scaled(m1, 1 / lm), t1);
        const u0 = UV[a * 2], v0 = UV[a * 2 + 1];
        map = (v) => {
          const d = lin(sub(pos(v), pa)), x = dot(d, t1), y = dot(d, b1);
          return [u0 + ux * x + uy * y, v0 + vx * x + vy * y];
        };
      }
    }
    const verts = [];
    for (const t of tris) {
      for (let j = 0; j < 3; j++) {
        const v = I[t * 3 + j];
        if (owner[v] < 0 || owner[v] === g) { if (owner[v] < 0) { owner[v] = g; verts.push([v, v]); } continue; }
        const key = `${g}:${v}`;
        let w = copyOf.get(key);
        if (w === undefined) {
          w = next++;
          copyOf.set(key, w);
          out.positions.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
          out.normals.push(cpu.normals ? cpu.normals[v * 3] : 0, cpu.normals ? cpu.normals[v * 3 + 1] : 0, cpu.normals ? cpu.normals[v * 3 + 2] : 0);
          out.uvs.push(UV[v * 2], UV[v * 2 + 1]);
          verts.push([v, w]);
        }
        if (indices === I) indices = new Uint32Array(I);
        indices[t * 3 + j] = w;
      }
    }
    if (!map) continue;
    const got = verts.map(([v]) => map(v));
    let minU = Infinity, minV = Infinity;
    for (const [u, v] of got) { if (u < minU) minU = u; if (v < minV) minV = v; }
    const su = Math.floor(minU), sv = Math.floor(minV);
    verts.forEach(([, w], i) => {
      const u = got[i][0] - su, v = got[i][1] - sv;
      if (w < nV) { uvs[w * 2] = u; uvs[w * 2 + 1] = v; } else { out.uvs[(w - nV) * 2] = u; out.uvs[(w - nV) * 2 + 1] = v; }
    });
  }

  if (next === nV) return { ...cpu, uvs };
  const grow = (base, extra) => { const a = new Float32Array(base.length + extra.length); a.set(base); a.set(extra, base.length); return a; };
  return {
    ...cpu,
    positions: grow(P, out.positions),
    normals: cpu.normals ? grow(cpu.normals, out.normals) : cpu.normals,
    uvs: grow(uvs, out.uvs),
    indices,
  };
}
