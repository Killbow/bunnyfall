// @ts-check
// How a hull gathers way, loses it, and answers the helm, for both the player's boat and AI captains. SAIL_FREE
// applies to the player alone under sail; captains keep their own point of sail.

export const HELM_WAY = Object.freeze({ sailAccel: 3.5, coast: 3, turnAccelSail: 2.4, steerFloor: 3, steerPeak: 14, steerPeakV: 4.5 });

export const SAIL_FREE = Object.freeze({ pace: 1.2, gain: 1.643 });
// Measured drive of each rig with the wind on the beam, over the drive of the original mod, by hull and variant.
export const SAIL_FREE_GAINS = Object.freeze({
  1: Object.freeze([1.065, 1.159, 2.071, 1.190, 1.233, 1.212, 2.131]),
  2: Object.freeze([SAIL_FREE.gain]),
  3: Object.freeze([2.131]),
  4: Object.freeze([1.798]),
});
export const sailFreeGain = (b) => SAIL_FREE_GAINS[b?.hull]?.[b?.variant ?? 0] ?? SAIL_FREE_GAINS[b?.hull]?.[0] ?? 1;
export const POINT_OF_SAIL = Object.freeze({ run: 0.9, quarter: 45, head: 0.55 });
/** @param {number} offRun */
export function pointOfSail(offRun) {
  const d = Math.min(180, Math.abs(Number(offRun) || 0));
  const { run, quarter, head } = POINT_OF_SAIL;
  if (d <= quarter) return run + ((1 - run) * (1 - Math.cos((Math.PI * d) / quarter))) / 2;
  return head + ((1 - head) * (1 + Math.cos((Math.PI * (d - quarter)) / (180 - quarter)))) / 2;
}
// The one home of these wind values for every ship at sea; the captains' AI re-exports them.
export const WIND_RATED = 1.5;
export const WIND_SHARE = Object.freeze([0.3, 2]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const windShare = (windLen) => clamp(windLen / WIND_RATED, WIND_SHARE[0], WIND_SHARE[1]);
export const seaWind = (windLen) => (windLen > 0 ? WIND_RATED * windShare(windLen) : 0);
export const HANDLINGS = Object.freeze(['responsive', 'classic']);
// A hull with no Cargo node gets the largest hold any hull has, or the cargo rule clamps every speed to nothing.
export const CARGO_HOLD_MISSING = 3;
export const HULL_HELM = Object.freeze([1, 1, 0.75, 0.25, 0.75]);

// The rudder answers a curve of her way rather than the way itself, biting hardest at steerPeakV, so half sail
// turns tightest.
/** @param {number} v */
export function steerage(v) {
  const x = Math.max(0, Number(v) || 0) / HELM_WAY.steerPeakV;
  return HELM_WAY.steerFloor + (HELM_WAY.steerPeak - HELM_WAY.steerFloor) * x * Math.exp(1 - x);
}

/** @param {unknown} h */
export const isResponsive = (h) => h !== 'classic';
