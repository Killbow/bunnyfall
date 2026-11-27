// @ts-check
// Mesh frame: meters, y up, x across the aim, z along it, and the ground under its middle at y = 0.
import { WALL_SIZE } from '../magic/bunnySpellLaw.js';
import { flatMesh, flatModel, seededRandom } from './flatMesh.js';

export const WALL_SKIRT_M = 1.0;

export function moundModel(seed, art) {
  const tile = art.tile, tileV = art.tileV ?? tile;
  const outsideUv = (q) => moundUv(q, tile, tileV);
  const rnd = seededRandom(seed);
  const hw = WALL_SIZE.w / 2, H = WALL_SIZE.h;
  const N = 16, M = 6;

  const rings = [];
  for (let i = 0; i <= N; i++) {
    const end = i === 0 || i === N;
    const x0 = -hw + (WALL_SIZE.w * i) / N + (end ? (i === 0 ? -0.06 : 0.06) : (rnd() - 0.5) * 0.14);
    const top = H - 0.24 + rnd() * 0.3 - (end ? 0.12 : 0);
    const ring = [];
    const side = (sgn) => {
      const pts = [];
      for (let j = 0; j <= M; j++) {
        const v = j / M;
        const y = j === 0 ? -WALL_SKIRT_M : v * top + (j < M ? (rnd() - 0.5) * 0.18 : 0);
        const lump = j === 0 ? 0 : (rnd() - 0.5) * 0.12;
        pts.push([x0 + (end ? 0 : (rnd() - 0.5) * 0.06), y, sgn * (halfAt(j === 0 ? 0 : v) + lump)]);
      }
      return pts;
    };
    const front = side(1), back = side(-1);
    ring.push(...front);
    ring.push([x0 + (rnd() - 0.5) * 0.1, top + 0.04 + rnd() * 0.08, (rnd() - 0.5) * 0.12]);
    ring.push(...back.reverse());
    rings.push(ring);
  }
  const R = rings[0].length;
  const b = flatMesh(tile, outsideUv);
  for (let i = 0; i < N; i++) {
    const a = rings[i], c = rings[i + 1];
    for (let j = 0; j < R - 1; j++) b.quad(a[j], c[j], c[j + 1], a[j + 1], j < M ? [0, 0, 1] : j === M ? [0, 1, 0.5] : j === M + 1 ? [0, 1, -0.5] : [0, 0, -1]);
    b.quad(a[R - 1], c[R - 1], c[0], a[0], [0, -1, 0]);
  }
  for (const [i, sgn] of [[0, -1], [N, 1]]) {
    const ring = rings[i];
    const c = ring.reduce((m, q) => [m[0] + q[0] / R, m[1] + q[1] / R, m[2] + q[2] / R], [0, 0, 0]);
    c[0] += sgn * 0.08;
    const rimUv = ring.map(outsideUv);
    const midUv = [outsideUv(c)[0], rimUv.reduce((m, t) => m + t[1], 0) / R];
    for (let j = 0; j < R; j++) b.tri(c, ring[j], ring[(j + 1) % R], [sgn, 0, 0], (q) => (q === c ? midUv : outsideUv(q)));
  }
  return flatModel(b, art.mound);
}

const halfAt = (v) => 0.45 - 0.23 * Math.pow(Math.max(0, v), 1.3);
function moundUv(q, tile, tileV) {
  const inside = halfAt(Math.min(1, Math.max(0, q[1] / WALL_SIZE.h))) - Math.abs(q[2]);
  return [(q[0] - q[2]) / tile, (q[1] + 1.5 * inside) / tileV];
}
