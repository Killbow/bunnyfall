// @ts-check
import { poseCadenceFor, cadenceD2 } from '../net/peerBodies.js';

/**
 * @param {number} frame
 * @param {number} phase
 * @param {ArrayLike<number>} at
 * @param {{ eye?: ArrayLike<number> | null, lens?: number } | null} cam
 * @param {ArrayLike<number> | null} eye
 */
export function horsePoseDue(frame, phase, at, cam, eye) {
  const from = cam?.eye ?? eye;
  if (!from) return true;
  return (frame + phase) % poseCadenceFor(cadenceD2(at, from, cam?.lens ?? 1)) === 0;
}

/**
 * A horse judged in view that was out at its last judgement is posed at once, whatever its cadence. The draw flag
 * `fresh` cannot catch a horse that moved into view between two judgements by one camera.
 * @param {{ seen: Function, pose: Function }} rig
 * @param {any} horse
 * @param {ArrayLike<number>} at
 * @param {{ view: any, proj: any, eye?: ArrayLike<number> | null, lens?: number } | null} cam
 * @param {ArrayLike<number> | null} eye
 * @param {number} frame
 * @param {number} phase
 * @param {boolean} [wasOut]
 */
export function poseWhereSeen(rig, horse, at, cam, eye, frame, phase, wasOut = false) {
  const out = !!cam && !rig.seen(horse, cam.view, cam.proj);
  if (!out && (wasOut || horsePoseDue(frame, phase, at, cam, eye))) rig.pose(horse);
  return out;
}
