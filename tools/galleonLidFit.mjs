// Measures the galleon's hull half-breadth at each gunport shutter station from the bake and prints LID_FIT.
// Run: node tools/galleonLidFit.mjs, then paste LID_FIT into src/world/galleonModel.js when its pin fails.
import { readFileSync } from 'node:fs';
import { MEASURED, LID } from '../src/world/galleonModel.js';
import { isMain } from './lib/isMain.mjs';

export function hullTriangles(bake) {
  const hull = bake.parts.find((p) => p.role === 'hull');
  if (!hull) throw new Error('galleonLidFit: the bake has no hull');
  const P = hull.positions, T = hull.triangles, out = [];
  for (let t = 0; t < T.length; t += 3) {
    const v = [0, 1, 2].map((k) => [P[T[t + k] * 3], P[T[t + k] * 3 + 1], P[T[t + k] * 3 + 2]]);
    out.push({ v, y0: Math.min(v[0][1], v[1][1], v[2][1]), y1: Math.max(v[0][1], v[1][1], v[2][1]), z0: Math.min(v[0][2], v[1][2], v[2][2]), z1: Math.max(v[0][2], v[1][2], v[2][2]) });
  }
  return out;
}

export function halfBreadth(tris, y, z, s) {
  let best = null;
  for (const { v: [a, b, c], y0, y1, z0, z1 } of tris) {
    if (y < y0 - 1e-9 || y > y1 + 1e-9 || z < z0 - 1e-9 || z > z1 + 1e-9) continue;
    const d = (b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2]);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((y - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (z - a[2])) / d;
    const w = ((b[1] - a[1]) * (z - a[2]) - (y - a[1]) * (b[2] - a[2])) / d;
    if (u < -1e-9 || w < -1e-9 || u + w > 1 + 1e-9) continue;
    const x = s * (a[0] + u * (b[0] - a[0]) + w * (c[0] - a[0]));
    if (x < 0) continue;
    if (best === null || x > best) best = x;
  }
  return best;
}

export const overOpening = (y, dz) => Math.abs(dz) < MEASURED.portHalfW && y > MEASURED.portSillY && y < MEASURED.portTopY;

export function sideFit(tris, z, s) {
  return LID.rows.map((y) => {
    const row = LID.cols.map((dz) => (overOpening(y, dz) ? null : halfBreadth(tris, y, z + dz, s)));
    if (row[0] == null || row[row.length - 1] == null) throw new Error(`galleonLidFit: no planking at the edge of the shutter at z ${z}, y ${y}`);
    return row.map((x, k) => x ?? row[0] + ((row[row.length - 1] - row[0]) * (LID.cols[k] - LID.cols[0])) / (LID.cols[LID.cols.length - 1] - LID.cols[0]));
  });
}

export function measureLidFit(bake) {
  const tris = hullTriangles(bake);
  const starboard = MEASURED.portZ.map((z) => sideFit(tris, z, 1)), port = MEASURED.portZ.map((z) => sideFit(tris, z, -1));
  const fit = starboard.map((rows, i) => rows.map((row, r) => row.map((x, k) => Math.round(Math.max(x, port[i][r][k]) * 1000) / 1000)));
  return { fit, starboard, port };
}

if (isMain(import.meta.url)) {
  const bake = JSON.parse(readFileSync(new URL('../src/assets/galleon/galleon.json', import.meta.url), 'utf8'));
  const { fit, starboard, port } = measureLidFit(bake);
  const f = (x) => x.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  console.log('export const LID_FIT = frozen([');
  for (const rows of fit) console.log(`  [${rows.map((row) => `[${row.map(f).join(', ')}]`).join(', ')}],`);
  console.log(']);');
  MEASURED.portZ.forEach((z, i) => {
    let worst = { d: 0, r: 0, k: 0 };
    starboard[i].forEach((row, r) => row.forEach((x, k) => { const d = Math.abs(x - port[i][r][k]); if (d > worst.d) worst = { d, r, k }; }));
    console.log(`// port ${i} (z ${z}): her two sides' stations differ by ${(worst.d * 100).toFixed(2)} cm at most${worst.d > 0 ? ` (row ${worst.r}, column ${worst.k}: starboard ${starboard[i][worst.r][worst.k].toFixed(4)}, port ${port[i][worst.r][worst.k].toFixed(4)})` : ''}`);
  });
}
