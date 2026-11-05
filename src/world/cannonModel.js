// @ts-check
// BUNNYFALL (2026-11-05): THE GREAT CANNON BY WAYREST, MADE IN CODE (scenes/cannonHost.js stands it). A siege bombard on a
// timber carriage: a bronze-dark barrel with its bands and its muzzle, two cheeks, an axle and two great wheels, and the
// builders' scaffold round it while it is unfinished. Its own two pictures (iron and timber, CANNON_ARCHIVE) painted here.
// Model frame: metres, y up, the barrel along +z (the muzzle), the carriage's feet on y = 0.

export const CANNON_ARCHIVE = 9920;
export const REC_IRON = 0, REC_WOOD = 1;
/** Where the muzzle's mouth is in the model frame (the shot leaves from here). */
export const MUZZLE = Object.freeze([0, 2.35, 5.2]);

function builder() {
  /** @type {number[]} */ const p = [], n = [], uv = [];
  /** @type {number[][]} */ const idx = [[], []];
  // a face is seen from the side its normal points to: its corners turned so cross(c - a, d - a) agrees with the normal
  // (render/renderer.js draws gl.frontFace(CW) through the mirrored projection - world/lefayMonument.js faces' law)
  const quad = (sub, a, b, c, d, nx, ny, nz, us = 1, vs = 1) => {
    const e1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * nx + cy * ny + cz * nz < 0) { const t = b; b = d; d = t; }
    const base = p.length / 3;
    for (const v of [a, b, c, d]) p.push(v[0], v[1], v[2]);
    for (let i = 0; i < 4; i++) n.push(nx, ny, nz);
    uv.push(0, 0, us, 0, us, vs, 0, vs);
    idx[sub].push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  /** A box: centre, half sizes. */
  const box = (sub, cx, cy, cz, hx, hy, hz) => {
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    quad(sub, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, hx, hy);
    quad(sub, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, hx, hy);
    quad(sub, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, hz, hy);
    quad(sub, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, hz, hy);
    quad(sub, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, hx, hz);
    quad(sub, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, hx, hz);
  };
  /** A tube along an axis ('z' or 'x'), from `a` to `b` along it, radii r0 to r1, centred at (cx, cy) / (cy, cz); capped. */
  const tube = (sub, axis, a, b, r0, r1, c1, c2, seg = 18, cap = true) => {
    const at = (t, ang, r) => {
      const u = Math.cos(ang) * r, v = Math.sin(ang) * r;
      return axis === 'z' ? [c1 + u, c2 + v, t] : [t, c1 + v, c2 + u];
    };
    const nrm = (ang) => (axis === 'z' ? [Math.cos(ang), Math.sin(ang), 0] : [0, Math.sin(ang), Math.cos(ang)]);
    for (let i = 0; i < seg; i++) {
      const g0 = (i / seg) * Math.PI * 2, g1 = ((i + 1) / seg) * Math.PI * 2, gm = (g0 + g1) / 2, m = nrm(gm);
      quad(sub, at(a, g0, r0), at(a, g1, r0), at(b, g1, r1), at(b, g0, r1), m[0], m[1], m[2], 0.5, Math.abs(b - a));
      if (cap) {
        const ca = axis === 'z' ? [c1, c2, a] : [a, c1, c2], cb = axis === 'z' ? [c1, c2, b] : [b, c1, c2];
        const s = Math.sign(b - a) || 1, na = axis === 'z' ? [0, 0, -s] : [-s, 0, 0];
        quad(sub, ca, ca, at(a, g1, r0), at(a, g0, r0), na[0], na[1], na[2], 0.3, 0.3);
        quad(sub, cb, cb, at(b, g0, r1), at(b, g1, r1), -na[0], -na[1], -na[2], 0.3, 0.3);
      }
    }
  };
  return { p, n, uv, idx, box, tube };
}

/** The cannon's model, for renderer.createMesh. `scaffold` stands the builders' timber round it. */
export function cannonModel({ scaffold = true } = {}) {
  const b = builder();
  // the barrel: breech to muzzle, its bands, the muzzle's swell, the cascabel behind
  const by = 2.35;
  b.tube(REC_IRON, 'z', -2.6, 4.6, 0.82, 0.62, 0, by, 20);
  for (const z of [-2.2, -0.9, 0.6, 2.2, 3.6]) b.tube(REC_IRON, 'z', z - 0.12, z + 0.12, 0.9 - (z + 2.6) * 0.028, 0.9 - (z + 2.6) * 0.028, 0, by, 20);
  b.tube(REC_IRON, 'z', 4.6, 5.2, 0.72, 0.78, 0, by, 20);
  b.tube(REC_IRON, 'z', -3.1, -2.6, 0.3, 0.6, 0, by, 14);
  b.box(REC_IRON, 0, by, -3.25, 0.2, 0.2, 0.2);
  // the trunnions on the cheeks
  b.tube(REC_IRON, 'x', -1.25, 1.25, 0.22, 0.22, by, 0.2, 12);
  // the carriage: two cheeks, the transoms, the trail on the ground behind
  for (const x of [-1.05, 1.05]) b.box(REC_WOOD, x, 1.45, 0.2, 0.16, 0.95, 2.4);
  b.box(REC_WOOD, 0, 0.95, 1.6, 0.9, 0.22, 0.28);
  b.box(REC_WOOD, 0, 0.95, -1.4, 0.9, 0.22, 0.28);
  b.box(REC_WOOD, 0, 0.35, -3.6, 0.45, 0.25, 1.6);
  // the axle and the wheels, iron-shod
  b.tube(REC_IRON, 'x', -1.9, 1.9, 0.14, 0.14, 1.15, 1.0, 10);
  for (const x of [-1.55, 1.55]) {
    b.tube(REC_WOOD, 'x', x - 0.16, x + 0.16, 1.15, 1.15, 1.15, 1.0, 22);
    b.tube(REC_IRON, 'x', x - 0.18, x + 0.18, 1.2, 1.2, 1.15, 1.0, 22, false);
  }
  // the scaffold: four posts, two rails a side, a plank deck, and a stack of the builders' planks beside
  if (scaffold) {
    for (const [x, z] of [[-2.6, -3.4], [2.6, -3.4], [-2.6, 4.2], [2.6, 4.2]]) b.box(REC_WOOD, x, 2.2, z, 0.12, 2.2, 0.12);
    for (const y of [1.6, 3.6]) for (const x of [-2.6, 2.6]) b.box(REC_WOOD, x, y, 0.4, 0.08, 0.08, 3.9);
    for (const y of [3.6]) for (const z of [-3.4, 4.2]) b.box(REC_WOOD, 0, y, z, 2.7, 0.08, 0.08);
    b.box(REC_WOOD, 2.6, 3.7, 0.4, 0.45, 0.05, 3.9);
    for (let i = 0; i < 5; i++) b.box(REC_WOOD, 4.2, 0.12 + i * 0.18, -1 + (i % 2) * 0.1, 0.5, 0.08, 2.2);
    for (let i = 0; i < 3; i++) b.box(REC_IRON, -4.1, 0.18 + i * 0.3, 0.6 - i * 0.05, 0.6, 0.14, 0.3);
  }
  const startA = 0, countA = b.idx[0].length, indices = Uint32Array.from([...b.idx[0], ...b.idx[1]]);
  return {
    positions: new Float32Array(b.p), normals: new Float32Array(b.n), uvs: new Float32Array(b.uv), indices,
    subMeshes: [
      { textureArchive: CANNON_ARCHIVE, textureRecord: REC_IRON, startIndex: startA, primitiveCount: countA / 3 },
      { textureArchive: CANNON_ARCHIVE, textureRecord: REC_WOOD, startIndex: countA, primitiveCount: b.idx[1].length / 3 },
    ],
  };
}

/** Its two pictures, 64 x 64 RGBA rows top first: dark iron with a bronze cast, and grained timber. */
export function cannonArt() {
  const W = 64, pics = [];
  let seed = 9920;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const kind of ['iron', 'wood']) {
    const data = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, k = rnd();
      let r, g, bl;
      if (kind === 'iron') { const v = 52 + k * 22 + Math.sin(y * 0.7) * 4; r = v * 1.08; g = v * 0.98; bl = v * 0.86; }
      else { const grain = Math.sin(x * 0.55 + Math.sin(y * 0.18) * 2.2) * 14, plank = (y % 16 === 0) ? -30 : 0; const v = 100 + grain + plank + k * 14; r = v; g = v * 0.72; bl = v * 0.46; }
      data[i] = Math.max(0, Math.min(255, r)); data[i + 1] = Math.max(0, Math.min(255, g)); data[i + 2] = Math.max(0, Math.min(255, bl)); data[i + 3] = 255;
    }
    pics.push({ record: kind === 'iron' ? REC_IRON : REC_WOOD, image: { width: W, height: W, data } });
  }
  return pics;
}
