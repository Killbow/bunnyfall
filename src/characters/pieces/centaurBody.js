// The centaur's horse half: a barrel, four legs, and a tail hung off the human waist.

import { HSCALE, quadder, boxer } from './pieceLoft.js';

export const BAY_RAMP = [
  [46, 30, 20],
  [72, 48, 30],
  [102, 68, 42],
  [132, 92, 58],
  [162, 118, 78],
  [190, 148, 104],
];

const WITHERS_Y = 1.02;
const BARREL_LEN = 0.62;

const box = boxer();

/**
 * @param {number[][]} ramp
 * @param {{girth?:number, len?:number, legs?:number}} opts
 */
export function buildHorseBody(ramp = BAY_RAMP, { girth = 1, len = 1, legs = 1 } = {}) {
  const faces = [];
  const quad = quadder(faces, ramp);

  const wx = 0.19 * girth;
  const back = BARREL_LEN * len;
  const topY = WITHERS_Y * HSCALE;
  const belly = (WITHERS_Y - 0.42) * HSCALE;

  const seg = [
    [0.02, -0.2, 1.0],
    [-0.2, -0.46, 1.06],
    [-0.46, -back, 0.92],
  ];
  for (const [z0, z1, f] of seg) {
    box(quad, -wx * f, belly, z1, wx * f, topY, z0);
  }

  const lw = 0.05 * legs;
  const hoofY = 0.0;
  for (const [side, z] of [
    [-1, -0.12],
    [1, -0.12],
    [-1, -back + 0.1],
    [1, -back + 0.1],
  ]) {
    const x = side * wx * 0.62;
    box(quad, x - lw, hoofY + 0.06 * HSCALE, z - lw, x + lw, belly + 0.02, z + lw, 0.7, 0.6, 0.35);
    box(quad, x - lw * 1.5, hoofY, z - lw * 1.5, x + lw * 1.5, hoofY + 0.06 * HSCALE, z + lw * 1.5, 0.32, 0.26, 0.2);
  }

  const tw = 0.035 * girth;
  box(quad, -tw, belly + 0.04, -back - 0.06, tw, topY - 0.04, -back + 0.02, 0.5, 0.42, 0.3);

  return faces;
}
