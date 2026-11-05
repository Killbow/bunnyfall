// @ts-check
// BUNNYFALL: THE EDITOR'S SEASON. A builder working on the true terrain can pick the season the world is shown in, from the
// POI editor's bar, so the ground can be worked on without the winter's snow. It is this browser's view alone: the clock, the
// date and every other player are untouched, and it is forgotten on a reload. scenes/world.js refreshSeason reads it
// (it comes ahead of the clock and of ?season=), and takes the turn it asks for the next frame.
import { SEASON } from './climateSwaps.js';

/** @type {number | null} a SEASON value, or null for "follow the clock" */
let pin = null;
let dirty = false;

/** The season picked, or null for the clock's. */
export const liveSeasonPin = () => pin;
/** Pick one (a SEASON value) or null for the clock's. */
export function setLiveSeasonPin(/** @type {number | null} */ v) {
  const next = v === SEASON.Summer || v === SEASON.Winter || v === SEASON.Rain ? v : null;
  if (next === pin) return;
  pin = next;
  dirty = true;
}
/** Has the pick changed since this was last asked? (reads and clears) */
export function takeSeasonViewDirty() { const d = dirty; dirty = false; return d; }
