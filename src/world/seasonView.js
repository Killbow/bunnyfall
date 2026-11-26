// @ts-check
// Editor-only season override: this browser's view alone, forgotten on reload.
// weather/worldWeather.js refreshSeason reads it ahead of the clock and ?season=.
import { SEASON } from './climateSwaps.js';

/** @type {number | null} */
let pin = null;
let dirty = false;

export const liveSeasonPin = () => pin;
export function setLiveSeasonPin(/** @type {number | null} */ v) {
  const next = v === SEASON.Summer || v === SEASON.Winter || v === SEASON.Rain ? v : null;
  if (next === pin) return;
  pin = next;
  dirty = true;
}
export function takeSeasonViewDirty() { const d = dirty; dirty = false; return d; }
