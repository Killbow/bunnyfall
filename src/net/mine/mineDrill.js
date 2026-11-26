// @ts-check
// BUNNYFALL (2026-11-26, caverns): THE DRILL'S LAW - pure, the relay's (server/src/world/mine.js, through
// net/mine/mineBrain.js) and every page's (systems/mine/mineClient.js). The spec's sections 3, 5 and 7: a drill set on a
// hole (a drill face the holes find) runs a SHIFT, filling its HOPPER with the hole's ore - a piece each MINE_DRILL.perOreS,
// times the seam's richness - while it roars: its section's alarm rises (waves come far sooner than a pick's) and its
// stability wears. A player keeps one drill at a time; one drill stands on a hole. The hopper is its setter's alone to
// empty, and what they take the relay signs (net/mine/mineReceipt.js) for the account service to pay into their Stores.
// A collapse buries every drill and hopper.
//
// Imports nothing: plain numbers in, plain numbers out (ruling R2).

/**
 * The drill's numbers (the spec's "first guesses for tuning"):
 *   shiftS     a shift, from set to stop (s)
 *   perOreS    a piece of ore each this many seconds of shift (times the seam's richness, 1 to 3)
 *   hopperMax  the most a hopper holds untaken (the drill runs on, its ore spilling)
 *   noisePerS  the alarm a running drill raises a second (a pick's strike is 1: a wave in ~50 s, not 24 strikes)
 *   wearPerS   the stability a running drill wears a second (a pick's strike is 0.6)
 *   most       the most drills a mine holds
 *   crewMax    the most accounts beside its setter a drill's crew names (a party's others)
 */
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
