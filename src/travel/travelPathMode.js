// @ts-check
import { appStorage } from '../platform/appStorage.js';

export const TRAVEL_PATH_MODES = Object.freeze(['roads', 'free']);
export const TRAVEL_PATH_DEFAULT = 'roads';
export const TRAVEL_PATH_STORE_KEY = 'dfjs.overworld.pathMode';

export const TRAVEL_PATH_TEXT = Object.freeze({
  roads: 'Roads',
  free: 'Free',
  label: 'Path',
  tipRoads: 'Follow roads to reach towns. Shift-click to walk to an exact spot.',
  tipFree: 'Walk straight across country. Clicks near a town go to the exact spot.',
  fellBack: 'There is no open way there, so you take the roads.',
});

let mode = null;
const listeners = new Set();

export function travelPathMode() {
  if (mode) return mode;
  let v = null;
  try { v = appStorage()?.getItem(TRAVEL_PATH_STORE_KEY) ?? null; } catch { v = null; }
  mode = TRAVEL_PATH_MODES.includes(/** @type {string} */ (v)) ? /** @type {string} */ (v) : TRAVEL_PATH_DEFAULT;
  return mode;
}

export function setTravelPathMode(next) {
  if (!TRAVEL_PATH_MODES.includes(next)) return travelPathMode();
  if (travelPathMode() === next) return next;
  mode = next;
  try { appStorage()?.setItem(TRAVEL_PATH_STORE_KEY, next); } catch { }
  for (const fn of [...listeners]) { try { fn(next); } catch { } }
  return next;
}

export const toggleTravelPathMode = () => setTravelPathMode(travelPathMode() === 'roads' ? 'free' : 'roads');

export function onTravelPathMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const travelPathUsesRoads = (m = travelPathMode()) => m !== 'free';

/** @param {{ hit: boolean, nearby?: boolean, fine?: boolean, mode?: string }} q */
export function pickTakesPlace({ hit, nearby = false, fine = false, mode: m = travelPathMode() }) {
  return !!hit && travelPathUsesRoads(m) && !nearby && !fine;
}

// `rect` arrives already grown by `grow`, which is subtracted before the share applies. `PLACE_MIDDLE_MIN` is in
// native units (about 77 m), so a one-block hamlet is all middle.
export const PLACE_MIDDLE_SHARE = 0.4;
export const PLACE_MIDDLE_MIN = 3072;
export function pickNearPlaceMiddle(p, rect, grow = 0) {
  if (!p || !rect) return false;
  const hx = Math.max(0, (rect.maxX - rect.minX) / 2 - grow), hz = Math.max(0, (rect.maxZ - rect.minZ) / 2 - grow);
  const rx = Math.max(PLACE_MIDDLE_MIN, hx * PLACE_MIDDLE_SHARE), rz = Math.max(PLACE_MIDDLE_MIN, hz * PLACE_MIDDLE_SHARE);
  return Math.abs(p.x - rect.cx) <= rx && Math.abs(p.z - rect.cz) <= rz;
}

export const fineMoveHeld = (e) => !!(e && (e.shiftKey || e.altKey));

export function _resetTravelPathMode() { mode = null; listeners.clear(); }
