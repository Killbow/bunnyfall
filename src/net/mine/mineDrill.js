// @ts-check
// The relay and client share these drill rules. A collapse clears every drill and hopper.

export const MINE_DRILL = Object.freeze({ shiftS: 180, perOreS: 12, hopperMax: 45, noisePerS: 0.5, wearPerS: 0.12, most: 24, crewMax: 7 });

/**
 * @typedef {{ s: number, c: number, k: number, by: string, crew?: string[], from: number, until: number, took: number, rich: number }} MineDrillState
 */

/** Whether a drill runs at `nowS`. */
export const drillRunning = (/** @type {MineDrillState} */ d, /** @type {number} */ nowS) => nowS >= d.from && nowS < d.until;

/** The ore a drill has made by `nowS`, and what its hopper holds untaken. */
export function drillHopper(/** @type {MineDrillState} */ d, /** @type {number} */ nowS) {
  const ran = Math.max(0, Math.min(nowS, d.until) - d.from);
  const made = Math.floor(ran / MINE_DRILL.perOreS) * Math.max(1, Math.min(3, d.rich | 0));
  return Math.max(0, Math.min(MINE_DRILL.hopperMax, made - d.took));
}

/** How many of a drill's shift seconds fall between `fromS` and `toS` - its noise and its wear are paid by them. */
export const drillSecondsBetween = (/** @type {MineDrillState} */ d, /** @type {number} */ fromS, /** @type {number} */ toS) => Math.max(0, Math.min(toS, d.until) - Math.max(fromS, d.from));

/** A drill's hopper as the page reads it: `{ n, running, left }` (left: shift seconds remaining). */
export function drillReading(/** @type {MineDrillState} */ d, /** @type {number} */ nowS) {
  return { n: drillHopper(d, nowS), running: drillRunning(d, nowS), left: Math.max(0, d.until - nowS) };
}
