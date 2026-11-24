// @ts-check
// The pitch limit shared by the mouse look, the head bob, and the hit recoil.
// Past 90 degrees the view flips, so the limit is 0.99 of a right angle (89.1 degrees), as in Daggerfall Unity.

/** 89.1 degrees, in radians. */
export const PITCH_LIMIT = (Math.PI / 2) * 0.99;

/** @param {number} pitch */
export function clampPitch(pitch) {
  return Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
}
