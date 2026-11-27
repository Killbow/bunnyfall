// Keep imports to preferences and the page query so combat leaf modules can import this without a cycle.
import { getPref } from '../ui/uiPrefs.js';
import { pageParam } from '../platform/pageQuery.js';

// Each pref key here needs a matching row in src/mods/features.js.
export const BLOOD_PREF = 'blood-marks';
export const bloodMarksOn = (search = globalThis.location?.search ?? '') =>
  getPref(BLOOD_PREF) !== false && pageParam('blood', search) !== 'off';

export const BLOOD_GORE_PREF = 'blood-gore';
export const GORE_TIERS = Object.freeze({
  light: Object.freeze({ density: 0.5, capacity: 300 }),
  normal: Object.freeze({ density: 1, capacity: 600 }),
  heavy: Object.freeze({ density: 1, capacity: 1500 }),
  abattoir: Object.freeze({ density: 1, capacity: 4000 }),
});
export const GORE_DEFAULT = 'normal';
export const BLOOD_CAPACITY_DEFAULT = GORE_TIERS[GORE_DEFAULT].capacity;
export const BLOOD_CAPACITY_MIN = 50;
export const BLOOD_CAPACITY_MAX = 4000;
export function bloodGore() {
  const v = getPref(BLOOD_GORE_PREF);
  return typeof v === 'string' && Object.hasOwn(GORE_TIERS, v) ? v : GORE_DEFAULT;
}
// A pool allocates its mark ring at this capacity once and never grows it, so a new tier's capacity applies
// after a reload while its density applies at once.
export function bloodCapacity() {
  const v = Number(GORE_TIERS[bloodGore()].capacity);
  if (!Number.isFinite(v)) return BLOOD_CAPACITY_DEFAULT;
  return Math.max(BLOOD_CAPACITY_MIN, Math.min(BLOOD_CAPACITY_MAX, Math.round(v)));
}
export function bloodDensity() {
  const v = Number(GORE_TIERS[bloodGore()].density);
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

export const BLOOD_OVERKILL_PREF = 'blood-overkill';
export const bloodOverkillOn = () => getPref(BLOOD_OVERKILL_PREF) !== false;

export const BLOOD_SCREEN_PREF = 'blood-screen';
export const bloodScreenOn = () => getPref(BLOOD_SCREEN_PREF) !== false;

export const bloodDecalDeps = Object.freeze({
  enabled: () => bloodMarksOn(),
  capacity: bloodCapacity,
  density: bloodDensity,
  overkill: bloodOverkillOn,
  flight: () => true,
});
