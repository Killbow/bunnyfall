// AI-ROOMS: shape helpers shared by the room files.
import { rng, A, B } from './dsl.mjs';

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


/** The Switchback Stair's carving and props (no lights, no foes): a double flight down 19.2 m; upper ports N and W, lower
 *  ports N, S and E. Shared by the border room and its mirrored interior twin (rooms4.mjs). */
export function switchbackCore(r) {
  const up = r.floor(A), mid = r.floor(22.4), low = r.floor(B);
  r.rect(7, 1, 15, 2, up).rect(7, 1, 8, 10, up);
  r.port('N', 'A', 3, up); r.port('W', 'A', 9, up);
  r.rect(14, 18, 18, 19, mid);
  r.rect(14, 3, 15, 17, r.ramp('-z'));
  r.rect(17, 3, 18, 17, r.ramp('+z'));
  r.rect(17, 1, 22, 2, low).rect(21, 0, 22, 31, low).rect(22, 21, 31, 22, low);
  r.port('N', 'B', 3, low); r.port('S', 'B', 4, low); r.port('E', 'B', 10, low);
  r.prop('statue', 8, 1.9); r.prop('lectern', 17.5, 18.7);
  return r;
}
