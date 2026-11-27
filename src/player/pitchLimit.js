// @ts-check

export const PITCH_LIMIT = (Math.PI / 2) * 0.99;

/** @param {number} pitch */
export function clampPitch(pitch) {
  return Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
}
