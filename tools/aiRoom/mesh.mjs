// AI-ROOMS: a small mesh builder for the editor's model format (`bunnyfall-dungeon-model/1`, src/world/editorModels.js).
// Metres, Unity's frame (y up), flat-shaded, UVs in texture tiles (one tile is 3.2 m, as in the classic corridor
// pieces: u along a wall, v = -(distance below its top) / 3.2). Textures are Daggerfall's NUMBERS only; the pictures are
// the player's own, remapped per dungeon by the texture table like any classic wall.
//
// WINDING: the classic pieces' (b - a) x (c - a) agrees with their normal (checked on 67000), and the renderer culls back
// faces, so every triangle here is emitted so that its cross product points where `normal` says.

const r3 = (v) => Math.round(v * 1000) / 1000;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
const dot = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export class Mesh {
  constructor() { this.tris = []; }   // { tex: 'a_r', p: [[x,y,z]x3], uv: [[u,v]x3], n: [x,y,z] }
  /** A triangle facing `normal` (or its own winding's, when none is given). */
  tri(tex, p, uv, normal = null) {
    let [a, b, c] = p, [ua, ub, uc] = uv;
    const n = cross(sub(b, a), sub(c, a));
    if (Math.hypot(...n) < 1e-9) return;   // degenerate
    if (normal && dot(n, normal) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; }
    this.tris.push({ tex, p: [a, b, c], uv: [ua, ub, uc], n: norm(cross(sub(b, a), sub(c, a))) });
  }
  /** A quad p0..p3 (in order round it) with a uv each, facing `normal`. */
  quad(tex, p, uv, normal) { this.tri(tex, [p[0], p[1], p[2]], [uv[0], uv[1], uv[2]], normal); this.tri(tex, [p[0], p[2], p[3]], [uv[0], uv[2], uv[3]], normal); }
  /** An axis-aligned box, all six faces facing out. `tex` is one texture or { top, bottom, side }. */
  box(x0, y0, z0, x1, y1, z1, tex) {
    const t = typeof tex === 'string' ? { top: tex, bottom: tex, side: tex } : { bottom: tex.top, side: tex.top, ...tex };
    const T = 3.2;
    this.quad(t.top, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [[x0 / T, -z0 / T], [x1 / T, -z0 / T], [x1 / T, -z1 / T], [x0 / T, -z1 / T]], [0, 1, 0]);
    this.quad(t.bottom, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0 / T, -z0 / T], [x1 / T, -z0 / T], [x1 / T, -z1 / T], [x0 / T, -z1 / T]], [0, -1, 0]);
    const wall = (p, uA, uB, n) => this.quad(t.side, p, [[uA, (y0 - y1) / T], [uB, (y0 - y1) / T], [uB, 0], [uA, 0]], n);
    wall([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], x0 / T, x1 / T, [0, 0, -1]);
    wall([[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]], x1 / T, x0 / T, [0, 0, 1]);
    wall([[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], z1 / T, z0 / T, [-1, 0, 0]);
    wall([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], z0 / T, z1 / T, [1, 0, 0]);
  }
  /** A prism of `sides` round the y axis (a column, a bowl): radius r0 at y0, r1 at y1. */
  prism(cx, cz, y0, y1, r0, r1, sides, tex, { cap = true } = {}) {
    const T = 3.2, ring = (r, y, k) => [cx + r * Math.cos((k / sides) * Math.PI * 2), y, cz + r * Math.sin((k / sides) * Math.PI * 2)];
    for (let k = 0; k < sides; k++) {
      const a = ring(r0, y0, k), b = ring(r0, y0, k + 1), c = ring(r1, y1, k + 1), d = ring(r1, y1, k);
      const mid = ring((r0 + r1) / 2, (y0 + y1) / 2, k + 0.5);
      this.quad(tex, [a, b, c, d], [[k / sides, (y0 - y1) / T], [(k + 1) / sides, (y0 - y1) / T], [(k + 1) / sides, 0], [k / sides, 0]], [mid[0] - cx, 0, mid[2] - cz]);
      if (cap && r1 > 0.001) this.tri(tex, [[cx, y1, cz], d, c], [[0.5, 0], [0, 0.2], [0.2, 0.2]], [0, 1, 0]);
    }
  }
  /** The model, textures grouped into sub-meshes. */
  toModel(id) {
    const groups = new Map();
    for (const t of this.tris) { if (!groups.has(t.tex)) groups.set(t.tex, []); groups.get(t.tex).push(t); }
    const positions = [], normals = [], uvs = [], indices = [], subMeshes = [];
    for (const [tex, list] of groups) {
      const startIndex = indices.length, [archive, record] = tex.split('_').map(Number);
      const seen = new Map();   // one vertex for each position + normal + uv a sub-mesh uses
      for (const t of list) {
        for (let k = 0; k < 3; k++) {
          const v = [r3(t.p[k][0]), r3(t.p[k][1]), r3(t.p[k][2]), r3(t.n[0]), r3(t.n[1]), r3(t.n[2]), r3(t.uv[k][0]), r3(t.uv[k][1])], key = v.join(',');
          if (!seen.has(key)) { seen.set(key, positions.length / 3); positions.push(v[0], v[1], v[2]); normals.push(v[3], v[4], v[5]); uvs.push(v[6], v[7]); }
          indices.push(seen.get(key));
        }
      }
      subMeshes.push({ textureArchive: archive, textureRecord: record, startIndex, primitiveCount: list.length });
    }
    return { format: 'bunnyfall-dungeon-model/1', id, positions, normals, uvs, indices, subMeshes };
  }
}
