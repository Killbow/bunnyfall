// Orc head furniture: the two lower tusks and the heavy brow shelf.

import { HSCALE, shadePiece, pushQuad } from './pieceLoft.js';

export const IVORY_RAMP = [[92, 84, 66], [124, 114, 92], [156, 146, 120], [188, 178, 150], [214, 206, 180], [236, 230, 210]];

const CHIN_Y = 1.70, JAW_Y = 1.74, CHEEK_Y = 1.79, TEMPLE_Y = 1.85;
const JAW_RX = 0.082, JAW_RZ = 0.105;
const CHEEK_RX = 0.102, CHEEK_RZ = 0.130;

export function buildTusks(ramp = IVORY_RAMP, { jaw = 1, size = 1 } = {}) {
  const faces = [];
  const quad = (a, b, c, d) => pushQuad(faces, a, b, c, d, 'head');

  const rootY = ((CHIN_Y + JAW_Y) / 2) * HSCALE;
  const rootX = JAW_RX * 0.62 * jaw;
  const rootZ = JAW_RZ * 0.72 * jaw;
  const len = (CHEEK_Y - JAW_Y) * HSCALE * 1.45 * size;

  for (const sgn of [-1, 1]) {
    const nodes = [
      { x: sgn * rootX,               y: rootY,              z: rootZ,         r: 0.019 * size },
      { x: sgn * rootX * 1.12,        y: rootY + len * 0.38, z: rootZ * 0.98,  r: 0.016 * size },
      { x: sgn * rootX * 1.30,        y: rootY + len * 0.74, z: rootZ * 0.88,  r: 0.011 * size },
      { x: sgn * rootX * 1.46,        y: rootY + len,        z: rootZ * 0.74,  r: 0.0025 * size },
    ];
    const ringOf = (n) => [
      [n.x - n.r, n.y, n.z - n.r], [n.x + n.r, n.y, n.z - n.r],
      [n.x + n.r, n.y, n.z + n.r], [n.x - n.r, n.y, n.z + n.r],
    ];
    const rings = nodes.map(ringOf);
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let k = 0; k < 4; k++) {
        const j = (k + 1) % 4;
        quad(rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]);
      }
    }
    const r0 = rings[0];
    quad(r0[3], r0[2], r0[1], r0[0]);
  }
  return shadePiece(faces, ramp, 0.08, 0.18);
}

export function buildBrow(ramp, { skull = 1, jut = 1 } = {}) {
  const faces = [];
  const quad = (a, b, c, d) => pushQuad(faces, a, b, c, d, 'head');

  const yLo = ((CHEEK_Y + TEMPLE_Y) / 2) * HSCALE;
  const yHi = (TEMPLE_Y + 0.020) * HSCALE;
  const halfW = CHEEK_RX * 0.94 * skull;
  const zFace = CHEEK_RZ * 0.86 * skull;
  const zOut = zFace + 0.030 * jut * skull;

  const COLS = 5;
  const colX = (i) => -halfW + (2 * halfW) * (i / COLS);
  const arcZ = (x) => zOut - (Math.abs(x) / halfW) ** 2 * (zOut - zFace) * 0.55;

  for (let i = 0; i < COLS; i++) {
    const x0 = colX(i), x1 = colX(i + 1);
    const z0 = arcZ(x0), z1 = arcZ(x1);
    quad([x0, yLo, z0], [x1, yLo, z1], [x1, yHi, z1], [x0, yHi, z0]);
    quad([x0, yLo, zFace], [x1, yLo, zFace], [x1, yLo, z1], [x0, yLo, z0]);
    quad([x0, yHi, z0], [x1, yHi, z1], [x1, yHi, zFace], [x0, yHi, zFace]);
  }
  for (const sgn of [-1, 1]) {
    const x = sgn * halfW, z = arcZ(x);
    quad([x, yLo, zFace], [x, yLo, z], [x, yHi, z], [x, yHi, zFace]);
  }
  return shadePiece(faces, ramp, 0.08, 0.18);
}
