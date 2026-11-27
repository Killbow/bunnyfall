import { HSCALE, quadder, boxer } from './pieceLoft.js';
import { NECK_PIVOT_Y } from '../neutralBody.js';

export const WOLF_RAMP = [
  [34, 32, 30],
  [56, 53, 50],
  [82, 78, 74],
  [110, 105, 100],
  [140, 134, 128],
  [170, 164, 157],
];

const box = boxer({ under: 0.32, back: 0.68, flank: 0.86 });

/**
 * @param {number[][]} ramp
 * @param {object} s
 */
export function buildBeastHead(ramp = WOLF_RAMP, s = {}) {
  const { skull = 0.1, snout = 0.14, depth = 0.6, ears = 1, tusks = 0 } = s;
  const faces = [];
  const quad = quadder(faces, ramp, 'head');

  const baseY = NECK_PIVOT_Y * HSCALE;
  const cy = baseY + skull * 0.55;

  box(quad, -skull, cy - skull * 0.9, -skull * 0.9, skull, cy + skull * 0.9, skull * 0.7);

  const mw = skull * (0.42 + depth * 0.34);
  const my = cy - skull * 0.36;
  box(
    quad,
    -mw,
    my - skull * depth * 0.9,
    skull * 0.5,
    mw,
    my + skull * 0.34,
    skull * 0.5 + snout,
    0.88,
    0.6,
  );
  box(
    quad,
    -mw * 0.7,
    my - skull * depth * 0.75,
    skull * 0.5 + snout,
    mw * 0.7,
    my + skull * 0.12,
    skull * 0.5 + snout + skull * 0.12,
    0.3,
    0.24,
    0.18,
  );

  if (ears > 0) {
    const ew = skull * 0.26;
    const eh = skull * 1.1 * ears;
    for (const side of [-1, 1]) {
      const x = side * skull * 0.6;
      box(quad, x - ew, cy + skull * 0.7, -skull * 0.5, x + ew, cy + skull * 0.7 + eh, -skull * 0.5 + ew * 1.6, 0.9, 0.58);
    }
  }

  if (tusks > 0) {
    const tw = skull * 0.09;
    const tl = skull * 0.7 * tusks;
    for (const side of [-1, 1]) {
      const x = side * mw * 0.7;
      box(
        quad,
        x - tw,
        my - skull * depth * 0.7,
        skull * 0.5 + snout * 0.55,
        x + tw,
        my - skull * depth * 0.7 + tl,
        skull * 0.5 + snout * 0.55 + tw * 2,
        1,
        0.86,
        0.6,
      );
    }
  }

  return faces;
}

/**
 * @param {number[][]} ramp
 * @param {{len?:number, thick?:number, sweep?:number, skull?:number}} s
 */
export function buildHorns(ramp = WOLF_RAMP, s = {}) {
  const { len = 0.22, thick = 0.022, sweep = 0.7, skull = 0.1 } = s;
  const faces = [];
  const quad = quadder(faces, ramp, 'head');
  const baseY = NECK_PIVOT_Y * HSCALE + skull * 0.55;

  const SEGS = 4;
  for (const side of [-1, 1]) {
    let px = side * skull * 0.72,
      py = baseY + skull * 0.5,
      pz = -skull * 0.2;
    for (let i = 1; i <= SEGS; i++) {
      const t = i / SEGS;
      const a = t * Math.PI * 0.55 * sweep;
      const nx = px + side * len * 0.1 * t;
      const ny = py + Math.cos(a) * (len / SEGS);
      const nz = pz - Math.sin(a) * (len / SEGS) * 1.4;
      const r = thick * (1.1 - t * 0.75);
      quad([px - r, py, pz + r], [px + r, py, pz + r], [nx + r, ny, nz + r], [nx - r, ny, nz + r], 0.92);
      quad([px + r, py, pz - r], [px - r, py, pz - r], [nx - r, ny, nz - r], [nx + r, ny, nz - r], 0.5);
      quad([px + r, py, pz + r], [px + r, py, pz - r], [nx + r, ny, nz - r], [nx + r, ny, nz + r], 0.72);
      quad([px - r, py, pz - r], [px - r, py, pz + r], [nx - r, ny, nz + r], [nx - r, ny, nz - r], 0.72);
      px = nx;
      py = ny;
      pz = nz;
    }
  }
  return faces;
}
