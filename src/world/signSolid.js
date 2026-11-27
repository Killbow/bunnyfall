// @ts-check
// A sign triangle whose every corner is SIGN_HANG_M or more over the sign foot hangs: rays and sweeps hit it,
// but bodies pass. The marks feed the collider sight list (player/collider.js addMesh).

import { isShopSignModel } from './houseSigns.js';

export const SIGN_HANG_M = 1;

/**
 * @param {ArrayLike<number>} positions
 * @param {ArrayLike<number>} indices
 * @returns {Uint8Array}
 */
export function signHungMarks(positions, indices) {
  let foot = Infinity;
  for (let i = 1; i < positions.length; i += 3) if (positions[i] < foot) foot = positions[i];
  const hang = foot + SIGN_HANG_M;
  const marks = new Uint8Array(Math.floor(indices.length / 3));
  for (let t = 0; t < marks.length; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    marks[t] = Math.min(positions[a * 3 + 1], positions[b * 3 + 1], positions[c * 3 + 1]) < hang ? 0 : 1;
  }
  return marks;
}

/** @type {WeakMap<object, Uint8Array>} */
const HUNG = new WeakMap();

/**
 * @param {number} modelIdNum
 * @param {{ positions: ArrayLike<number>, indices: ArrayLike<number> }} model
 * @returns {Uint8Array | null}
 */
export function sightMarksOf(modelIdNum, model) {
  if (!isShopSignModel(modelIdNum)) return null;
  let marks = HUNG.get(model);
  if (!marks) HUNG.set(model, (marks = signHungMarks(model.positions, model.indices)));
  return marks;
}
