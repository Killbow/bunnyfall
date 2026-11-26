import { HSCALE, quadder, boxer } from './pieceLoft.js';

export const CHITIN_RAMP = [
  [44, 38, 34],
  [70, 60, 52],
  [98, 84, 72],
  [128, 110, 94],
  [158, 138, 118],
  [186, 166, 144],
];

const box = boxer({ side: 0.64, flank: 0.86 });

function limb(quad, ax, ay, az, bx, by, bz, r, shade) {
  const dx = bx - ax,
    dz = bz - az;
  const L = Math.hypot(dx, dz) || 1e-6;
  const px = (-dz / L) * r,
    pz = (dx / L) * r;
  quad([ax - px, ay + r, az - pz], [ax + px, ay + r, az + pz], [bx + px, by + r, bz + pz], [bx - px, by + r, bz - pz], shade);
  quad([ax + px, ay - r, az + pz], [ax - px, ay - r, az - pz], [bx - px, by - r, bz - pz], [bx + px, by - r, bz + pz], shade * 0.4);
  quad([ax + px, ay + r, az + pz], [ax + px, ay - r, az + pz], [bx + px, by - r, bz + pz], [bx + px, by + r, bz + pz], shade * 0.72);
  quad([ax - px, ay - r, az - pz], [ax - px, ay + r, az - pz], [bx - px, by + r, bz - pz], [bx - px, by - r, bz - pz], shade * 0.72);
}

/**
 * @param {number[][]} ramp
 * @param {object} s
 */
export function buildArachnid(ramp = CHITIN_RAMP, s = {}) {
  const {
    span = 0.34,
    ride = 0.16,
    thorax = 0.1,
    abdomen = 0.13,
    legR = 0.016,
    arch = 0.5,
    claws = 0,
    sting = 0,
    legPairs = 4,
  } = s;

  const faces = [];
  const quad = quadder(faces, ramp);
  const y = ride * HSCALE;

  box(quad, -thorax, y - thorax * 0.7, 0, thorax, y + thorax * 0.7, thorax * 1.7, 0.92, 0.62);
  box(
    quad,
    -abdomen,
    y - abdomen * 0.75,
    -abdomen * 2.0,
    abdomen,
    y + abdomen * 0.8,
    -abdomen * 0.1,
    0.88,
    0.58,
  );

  const n = legPairs;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const ang = 0.75 - t * 1.9;
      const dirX = side * Math.cos(ang);
      const dirZ = Math.sin(ang);
      const rootX = side * thorax * 0.8;
      const rootZ = thorax * (1.1 - t * 1.1);
      const kneeX = rootX + dirX * span * 0.5;
      const kneeZ = rootZ + dirZ * span * 0.5;
      const kneeY = y + span * arch * 0.55;
      const footX = rootX + dirX * span;
      const footZ = rootZ + dirZ * span;
      limb(quad, rootX, y, rootZ, kneeX, kneeY, kneeZ, legR, 0.8);
      limb(quad, kneeX, kneeY, kneeZ, footX, 0.01 * HSCALE, footZ, legR * 0.75, 0.62);
    }
  }

  if (claws > 0) {
    const cr = thorax * 0.34 * claws;
    for (const side of [-1, 1]) {
      const x = side * thorax * 1.1;
      limb(quad, side * thorax * 0.7, y, thorax * 1.4, x, y, thorax * 2.4, legR * 1.4, 0.74);
      box(quad, x - cr, y - cr * 0.7, thorax * 2.3, x + cr, y + cr * 0.7, thorax * 2.3 + cr * 2.4, 0.9, 0.6);
    }
  }

  return faces;
}

/**
 * @param {number[][]} ramp
 * @param {object} s
 */
export function buildSting(ramp = CHITIN_RAMP, s = {}) {
  const { sting = 0.5, abdomen = 0.1, ride = 0.11, legR = 0.015, strike = 0 } = s;
  const faces = [];
  const quad = quadder(faces, ramp);
  const y = ride * HSCALE;

  const segs = 5;
  let px = 0,
    py = y + abdomen * 0.4,
    pz = -abdomen * 1.9;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const coil = t * Math.PI * 0.72;
    const thrown = t * Math.PI * 0.16;
    const a = coil + (thrown - coil) * strike;
    const reach = 1 + strike * 0.5;
    const nx = 0;
    const ny = py + Math.sin(a) * sting * 0.34 * (1 - strike * 0.55);
    const nz = pz + ((1 - Math.cos(a)) * sting * 0.2 + sting * 0.06) * reach + strike * sting * 0.42 * t;
    const r = legR * (2.1 - t * 1.2);
    quad([px - r, py, pz + r], [px + r, py, pz + r], [nx + r, ny, nz + r], [nx - r, ny, nz + r], 0.9);
    quad([px + r, py, pz - r], [px - r, py, pz - r], [nx - r, ny, nz - r], [nx + r, ny, nz - r], 0.46);
    quad([px + r, py, pz + r], [px + r, py, pz - r], [nx + r, ny, nz - r], [nx + r, ny, nz + r], 0.7);
    quad([px - r, py, pz - r], [px - r, py, pz + r], [nx - r, ny, nz + r], [nx - r, ny, nz - r], 0.7);
    px = nx;
    py = ny;
    pz = nz;
  }
  const br = legR * 1.4;
  quad([px - br, py - br, pz], [px + br, py - br, pz], [px + br, py + br, pz + sting * 0.16], [px - br, py + br, pz + sting * 0.16], 1);
  return faces;
}
