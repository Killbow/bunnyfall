// Wings for flying enemies, a body plan the other builders cannot express.

import { HSCALE, quadder } from './pieceLoft.js';

export const MEMBRANE_RAMP = [
  [52, 36, 34],
  [80, 56, 50],
  [110, 78, 68],
  [140, 104, 90],
  [170, 132, 114],
  [198, 162, 142],
];

/**
 * @param {number[][]} ramp
 * @param {object} s
 */
export function buildWings(ramp = MEMBRANE_RAMP, s = {}) {
  const { span = 0.55, at = 1.34, fold = 0.2, fingers = 4, droop = 0.24, rib = 0.012 } = s;

  const faces = [];
  const quad = quadder(faces, ramp);
  const y0 = at * HSCALE;

  for (const side of [-1, 1]) {
    const rootX = side * 0.1;
    const rootZ = -0.02;

    const tip = [];
    for (let i = 0; i <= fingers; i++) {
      const t = i / fingers;
      const spread = (1 - fold) * (0.95 - t * 0.5) + fold * 0.12;
      const backness = t * 0.9 + fold * 0.8;
      const x = rootX + side * span * spread;
      const z = rootZ - span * backness * 0.75;
      const y = y0 - droop * (t * 0.7 + 0.15) * (1 - fold * 0.5);
      tip.push([x, y, z]);
    }

    for (let i = 0; i < fingers; i++) {
      const a = tip[i];
      const b = tip[i + 1];
      const shade = 0.86 - (i / fingers) * 0.36;
      quad([rootX, y0, rootZ], a, b, [rootX, y0, rootZ], shade);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - droop * 0.12, (a[2] + b[2]) / 2];
      quad(a, mid, b, a, shade * 0.72);
    }

    for (const t of tip) {
      const dx = t[0] - rootX;
      const dy = t[1] - y0;
      const dz = t[2] - rootZ;
      const L = Math.hypot(dx, dz) || 1e-6;
      const px = (-dz / L) * rib;
      const pz = (dx / L) * rib;
      quad(
        [rootX - px, y0 + rib, rootZ - pz],
        [rootX + px, y0 + rib, rootZ + pz],
        [rootX + dx + px, y0 + dy + rib, rootZ + dz + pz],
        [rootX + dx - px, y0 + dy + rib, rootZ + dz - pz],
        0.95,
      );
    }
  }

  return faces;
}
