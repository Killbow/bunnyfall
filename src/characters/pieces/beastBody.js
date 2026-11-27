import { HSCALE, quadder, boxer } from './pieceLoft.js';

export const PELT_RAMP = [
  [38, 30, 22],
  [62, 50, 36],
  [88, 72, 52],
  [116, 96, 70],
  [146, 122, 92],
  [176, 150, 116],
];

const box = boxer();

/**
 * @param {number[][]} ramp
 * @param {object} s
 */
export function buildBeastBody(ramp = PELT_RAMP, s = {}) {
  const {
    back = 0.62,
    len = 0.9,
    girth = 0.17,
    legs = 0.05,
    crouch = 0.3,
    head = 0.12,
    snout = 0.1,
    tail = 0.3,
    tailUp = 0.3,
  } = s;

  const faces = [];
  const quad = quadder(faces, ramp);

  const spine = back * HSCALE;
  const belly = spine - girth * (1.5 - crouch * 0.5);
  const half = len / 2;

  for (const [z0, z1, f] of [
    [half * 0.55, half * 0.05, 0.86],
    [half * 0.1, -half * 0.45, 1.0],
    [-half * 0.4, -half, 0.84],
  ]) {
    box(quad, -girth * f, belly, z1, girth * f, spine, z0);
  }

  const neckZ = half * 0.55;
  const headZ = neckZ + head * 1.4;
  const headY = spine - girth * 0.15 + head * 0.2;
  const nw = girth * 0.42;
  box(quad, -nw, spine - girth * 0.7, neckZ, nw, spine + head * 0.1, headZ - head * 0.5, 0.9, 0.62);
  box(quad, -head, headY - head, headZ - head * 0.7, head, headY + head * 0.6, headZ + head * 0.5, 0.95, 0.66);
  if (snout > 0) {
    const sw = head * 0.5;
    box(
      quad,
      -sw,
      headY - head * 0.75,
      headZ + head * 0.4,
      sw,
      headY + head * 0.05,
      headZ + head * 0.4 + snout,
      0.85,
      0.58,
    );
  }

  for (const [side, z] of [
    [-1, half * 0.4],
    [1, half * 0.4],
    [-1, -half * 0.6],
    [1, -half * 0.6],
  ]) {
    const x = side * girth * 0.66;
    box(quad, x - legs, 0.02 * HSCALE, z - legs, x + legs, belly + 0.02, z + legs, 0.7, 0.6, 0.35);
    box(
      quad,
      x - legs * 1.5,
      0,
      z - legs * 1.4,
      x + legs * 1.5,
      0.03 * HSCALE,
      z + legs * 1.8,
      0.4,
      0.34,
      0.24,
    );
  }

  if (tail > 0) {
    const tw = girth * 0.16;
    const y0 = belly + (spine - belly) * (0.4 + tailUp * 0.5);
    box(quad, -tw, y0 - tw, -half - tail, tw, y0 + tw, -half + 0.02, 0.6, 0.5, 0.3);
  }

  return faces;
}

/**
 * @param {number[][]} ramp
 * @param {{len?:number, up?:number, thick?:number, at?:number}} s
 */
export function buildBeastTail(ramp = PELT_RAMP, s = {}) {
  const { len = 0.3, up = 0.3, thick = 0.03, at = 0.98 } = s;
  const faces = [];
  const quad = quadder(faces, ramp);
  const y = at * HSCALE;
  const drop = (1 - up) * len * 0.5;
  box(quad, -thick, y - thick, -len * 0.55, thick, y + thick, -0.01, 0.7, 0.55, 0.34);
  box(
    quad,
    -thick * 0.7,
    y - thick * 0.7 - drop,
    -len,
    thick * 0.7,
    y + thick * 0.7 - drop,
    -len * 0.5,
    0.62,
    0.48,
    0.3,
  );
  return faces;
}
