// Lanes for the condensed Features rows over the game's own prefs.
// They own only the composition; the consumers keep reading the prefs as before.

import { getPref, setPref } from '../ui/uiPrefs.js';
import { registerFeatureLane } from './features.js';
import { BLOOD_PREF, BLOOD_OVERKILL_PREF, BLOOD_SCREEN_PREF, BLOOD_GORE_PREF, GORE_TIERS, GORE_DEFAULT } from '../combat/bloodSwitch.js';

const on = (k) => getPref(k) !== false;

export const WIND_PARTS = Object.freeze(['floraSway', 'windWisps']);
export const WIND_TIERS = Object.freeze([[false, 'Off'], [true, 'On']]);
export const windRead = () => WIND_PARTS.some(on);
export function windWrite(v) { for (const k of WIND_PARTS) setPref(k, v === true || v === 'true'); }

export const QUICKBAR_STYLE_PREF = 'quickbarStyle';
export const QUICKSLOTS_PREF = 'quickslots';
export const QUICKBAR_SHAPE_PREF = 'hotbarShape';
export const QUICK_SLOTS_TIERS = Object.freeze([['off', 'Off'], ['diamond', 'Diamond'], ['hotbar', 'Hotbar'], ['gems', 'Diamonds']]);
export const QUICK_SLOTS_DEFAULT = 'hotbar';
export function quickSlotsRead() {
  const style = getPref(QUICKBAR_STYLE_PREF);
  if (style === 'hotbar') return getPref(QUICKBAR_SHAPE_PREF) === 'diamond' ? 'gems' : 'hotbar';
  if (style === 'diamond') return 'diamond';
  return getPref(QUICKSLOTS_PREF) === false ? 'off' : 'diamond';
}
export function quickSlotsWrite(v) {
  if (v === 'hotbar' || v === 'gems') {
    setPref(QUICKBAR_STYLE_PREF, 'hotbar');
    setPref(QUICKBAR_SHAPE_PREF, v === 'gems' ? 'diamond' : 'square');
    return;
  }
  if (v === 'diamond') { setPref(QUICKBAR_STYLE_PREF, 'diamond'); setPref(QUICKSLOTS_PREF, true); return; }
  setPref(QUICKBAR_STYLE_PREF, 'quickbar');
  setPref(QUICKSLOTS_PREF, false);
}

export const BLOOD_PARTS = Object.freeze([BLOOD_PREF, BLOOD_OVERKILL_PREF, BLOOD_SCREEN_PREF]);
export const BLOOD_TIERS = Object.freeze([['off', 'Off'], ['light', 'Light'], ['normal', 'Normal'], ['heavy', 'Heavy'], ['abattoir', 'Abattoir']]);
export function bloodRead() {
  if (!BLOOD_PARTS.some(on)) return 'off';
  const g = getPref(BLOOD_GORE_PREF);
  return typeof g === 'string' && Object.hasOwn(GORE_TIERS, g) ? g : GORE_DEFAULT;
}
export function bloodWrite(v) {
  if (v === 'off') { for (const k of BLOOD_PARTS) setPref(k, false); return; }
  if (!Object.hasOwn(GORE_TIERS, v)) return;
  if (!BLOOD_PARTS.some(on)) for (const k of BLOOD_PARTS) setPref(k, true);
  setPref(BLOOD_GORE_PREF, v);
}

registerFeatureLane('wind', { tiers: WIND_TIERS, default: true, read: windRead, write: windWrite });
registerFeatureLane('quickSlots', { tiers: QUICK_SLOTS_TIERS, default: QUICK_SLOTS_DEFAULT, read: quickSlotsRead, write: quickSlotsWrite });
registerFeatureLane('blood', { tiers: BLOOD_TIERS, default: GORE_DEFAULT, read: bloodRead, write: bloodWrite });
