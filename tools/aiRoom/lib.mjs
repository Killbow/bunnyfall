// AI-ROOMS: shape helpers shared by the room files.
import { rng } from './dsl.mjs';

/** Overlapping discs on a random walk from (ci, cj): a cave that is one piece by construction. */
export function blobs(r, ch, ci, cj, { n = 8, rmin = 3, rmax = 5.5, step = 5, seed = 1 } = {}) {
  const rand = rng(seed); let x = ci, z = cj; const centres = [];
  for (let k = 0; k < n; k++) {
    const rad = rmin + rand() * (rmax - rmin); r.disc(x, z, rad, rad, ch); centres.push([x, z, rad]);
    const a = rand() * Math.PI * 2; x = Math.max(rad + 1, Math.min(32 - rad - 1, x + Math.cos(a) * step)); z = Math.max(rad + 1, Math.min(32 - rad - 1, z + Math.sin(a) * step));
  }
  return centres;
}
export const portCells = (edge, port) => { const c = port === 'A' ? 10 : 22; return edge === 'N' || edge === 'S' ? [c, edge === 'N' ? 0 : 31] : [edge === 'W' ? 0 : 31, c]; };
/** Join a port's corridor mouth to a point with an L of corridor. */
export const link = (r, edge, port, ci, cj, ch) => { const [i, j] = portCells(edge, port); r.corridor(i, j, Math.floor(ci), Math.floor(cj), ch); };

