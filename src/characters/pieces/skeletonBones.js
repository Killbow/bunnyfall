// The skeleton's ribcage, the one part not expressible as a girth multiplier on the neutral rig.

import { HSCALE, quadder } from './pieceLoft.js';

export const BONE_RAMP = [
  [74, 72, 66],
  [104, 102, 94],
  [136, 133, 123],
  [168, 165, 154],
  [198, 195, 184],
  [226, 223, 212],
];

const CHEST_TOP = 1.5;
const CHEST_BOT = 1.06;
const STERNUM_Z = 0.1;

/**
 * @param {number[][]} ramp
 * @param {{torso?:number, ribs?:number, gap?:number}} opts
 */
export function buildRibcage(ramp = BONE_RAMP, { torso = 1, ribs = 6, gap = 0.42 } = {}) {
  const faces = [];
  const quad = quadder(faces, ramp);

  const rx = 0.15 * torso;
  const rz = 0.1 * torso;
  const span = CHEST_TOP - CHEST_BOT;
  const band = span / ribs;
  const bone = band * (1 - gap);

  for (let i = 0; i < ribs; i++) {
    const t = i / (ribs - 1);
    const flare = 0.72 + Math.sin(t * Math.PI * 0.86) * 0.42;
    const yTop = (CHEST_TOP - i * band) * HSCALE;
    const yBot = (CHEST_TOP - i * band - bone) * HSCALE;
    const wx = rx * flare;
    const wz = rz * flare;

    const ring = [
      [
        [-wx, yTop, wz],
        [wx, yTop, wz],
        [wx, yBot, wz],
        [-wx, yBot, wz],
        0.95,
      ],
      [
        [wx, yTop, -wz],
        [-wx, yTop, -wz],
        [-wx, yBot, -wz],
        [wx, yBot, -wz],
        0.4,
      ],
      [
        [wx, yTop, wz],
        [wx, yTop, -wz],
        [wx, yBot, -wz],
        [wx, yBot, wz],
        0.62,
      ],
      [
        [-wx, yTop, -wz],
        [-wx, yTop, wz],
        [-wx, yBot, wz],
        [-wx, yBot, -wz],
        0.62,
      ],
    ];
    for (const [a, b, c, d, shade] of ring) quad(a, b, c, d, shade);
  }

  const sx = 0.028 * torso;
  quad(
    [-sx, CHEST_TOP * HSCALE, STERNUM_Z * torso],
    [sx, CHEST_TOP * HSCALE, STERNUM_Z * torso],
    [sx, (CHEST_BOT + 0.06) * HSCALE, STERNUM_Z * torso],
    [-sx, (CHEST_BOT + 0.06) * HSCALE, STERNUM_Z * torso],
    1,
  );

  return faces;
}

export function buildPelvis(ramp = BONE_RAMP, { torso = 1 } = {}) {
  const faces = [];
  const quad = quadder(faces, ramp);

  const yTop = 1.02 * HSCALE;
  const yBot = 0.86 * HSCALE;
  const wx = 0.17 * torso;
  const wz = 0.1 * torso;
  for (const side of [-1, 1]) {
    const xo = side * wx * 0.55;
    const bw = wx * 0.42;
    quad([xo - bw, yTop, wz], [xo + bw, yTop, wz], [xo + bw, yBot, wz], [xo - bw, yBot, wz], 0.92);
    quad([xo + bw, yTop, -wz], [xo - bw, yTop, -wz], [xo - bw, yBot, -wz], [xo + bw, yBot, -wz], 0.38);
    quad(
      [xo + side * bw, yTop, wz],
      [xo + side * bw, yTop, -wz],
      [xo + side * bw, yBot, -wz],
      [xo + side * bw, yBot, wz],
      0.6,
    );
  }
  return faces;
}
