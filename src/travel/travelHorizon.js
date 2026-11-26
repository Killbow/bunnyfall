// @ts-check

import { RING_RIM_END } from '../render/farRing.js';
import { perspective, mirrorProjectionX } from '../world/mat4.js';
import { smooth01 } from '../player/travelCamera.js';
import { groundHit } from '../player/travelPick.js';

export const TV_HAZE_END = RING_RIM_END;
export const WORLD_NEAR = 0.2;
export const WORLD_FAR = 6000;
// FAR covers the grid corner at the widest Land View, about 8.1 km out, from a camera up to about 1.7 km back. NEAR
// stays at 2 m to keep depth precision far out.
export const TV_LENS_NEAR = 2;
export const TV_LENS_FAR = 12000;

export const viewShare = (view) => (view ? smooth01(view.blend) : 0);

/**
 * @template {{ mode: string, end: number }} R
 * @param {R} row
 * @param {{ blend: number } | null} view
 * @returns {R}
 */
export function horizonFog(row, view) {
  const s = viewShare(view);
  if (!(s > 0) || row?.mode !== 'linear' || !(row.end < TV_HAZE_END)) return row;
  return { ...row, end: row.end + (TV_HAZE_END - row.end) * s };
}

export function horizonPlanes(near, view) {
  const s = viewShare(view);
  if (!(s > 0)) return [near, WORLD_FAR];
  return [Math.max(near, near + (TV_LENS_NEAR - near) * s), WORLD_FAR + (TV_LENS_FAR - WORLD_FAR) * s];
}

export function horizonProj(fovY, aspect, near, view) {
  const [n, f] = horizonPlanes(near, view);
  return mirrorProjectionX(perspective(fovY, aspect, n, f));
}

export const TV_PICK_REACH = TV_HAZE_END;

export const horizonHit = (eye, dir, ground) => groundHit(eye, dir, ground, { maxDist: TV_PICK_REACH });
