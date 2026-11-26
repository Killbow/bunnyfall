// @ts-check
// The relay and client share these drill rules. A collapse clears every drill and hopper.

export const MINE_DRILL = Object.freeze({ shiftS: 180, perOreS: 12, hopperMax: 45, noisePerS: 0.5, wearPerS: 0.12, most: 24, crewMax: 7 });

/**
 * @typedef {{ s: number, c: number, k: number, by: string, crew?: string[], from: number, until: number, took: number, rich: number }} MineDrillState
 */

export const MINE_ORE_RUNS = MINE_DRILL.shiftS / MINE_DRILL.perOreS;
export const mineOreKey = (/** @type {number} */ s, /** @type {number} */ c, /** @type {number} */ k) => `${s}:${c}:${k}`;
export const oreRunsLeft = (/** @type {Record<string, number> | undefined} */ work, /** @type {string} */ key) => MINE_ORE_RUNS - (work?.[key] ?? 0);

/** The ore a deposit still holds for drills: its runs left times its seam's richness (1 to 3). A hole's text names this number. */
export const mineOreLeft = (/** @type {Record<string, number> | undefined} */ work, /** @type {string} */ key, /** @type {number} */ rich) =>
  Math.max(0, oreRunsLeft(work, key)) * Math.max(1, Math.min(3, rich | 0));

export const drillRuns =(/** @type {MineDrillState} */ d, /** @type {number} */ nowS) =>
  Math.floor(Math.max(0, Math.min(nowS, d.until) - d.from) / MINE_DRILL.perOreS);

/** Whether a drill runs at `nowS`. */
export const drillRunning = (/** @type {MineDrillState} */ d, /** @type {number} */ nowS) => nowS >= d.from && nowS < d.until;

/** The ore a drill has made by `nowS`, and what its hopper holds untaken. */
export function drillHopper(/** @type {MineDrillState} */ d, /** @type {number} */ nowS) {
  const made = drillRuns(d, nowS) * Math.max(1, Math.min(3, d.rich | 0));
  return Math.max(0, Math.min(MINE_DRILL.hopperMax, made - d.took));
}

/** How many of a drill's shift seconds fall between `fromS` and `toS` - its noise and its wear are paid by them. */
export const drillSecondsBetween = (/** @type {MineDrillState} */ d, /** @type {number} */ fromS, /** @type {number} */ toS) => Math.max(0, Math.min(toS, d.until) - Math.max(fromS, d.from));

/** A drill's hopper as the page reads it: `{ n, running, left }` (left: shift seconds remaining). */
export function drillReading(/** @type {MineDrillState} */ d, /** @type {number} */ nowS) {
  return { n: drillHopper(d, nowS), running: drillRunning(d, nowS), left: Math.max(0, d.until - nowS) };
}
