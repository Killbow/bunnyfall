import { getPref, setPref } from '../ui/uiPrefs.js';
import { getInt, setValue, saveSettings } from '../platform/settings.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { registerFeatureLane } from '../mods/features.js';

export const LAND_VIEW_MIN = 1;
export const LAND_VIEW_MAX = 6;
export const LAND_VIEW_DFU_MAX = 4;
export const LAND_VIEW_DEFAULT = 5;

export const LAND_VIEW_TIERS = Object.freeze([
  [1, '1'], [2, '2'], [3, 'Classic (3)'], [4, '4'], [5, '5'], [6, 'Furthest (6)'],
]);

const clampInt = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function landViewDistance({ enhanced, pref, setting }) {
  if (!enhanced) return clampInt(setting, LAND_VIEW_MIN, LAND_VIEW_DFU_MAX, 3);
  return clampInt(pref, LAND_VIEW_MIN, LAND_VIEW_MAX, LAND_VIEW_DEFAULT);
}

export const enhancedOutdoors = () => isEnhanced() && !!getPref('enhancedEnvironments');

export function landViewRead({ enhanced = enhancedOutdoors() } = {}) {
  return landViewDistance({ enhanced, pref: getPref('landViewDistance'), setting: getInt('Experimental', 'TerrainDistance', 1, 4) });
}

export function landViewWrite(v) {
  const n = clampInt(v, LAND_VIEW_MIN, LAND_VIEW_MAX, LAND_VIEW_DEFAULT);
  setPref('landViewDistance', n);
  setValue('Experimental', 'TerrainDistance', String(Math.min(n, LAND_VIEW_DFU_MAX)));
  saveSettings();
  return n;
}

// Off the enhanced outdoors the DFU key caps at 4, so a preset value of 5 or 6 reads as 4; presets compare against
// this reading.
export function landViewAsRead(v, { enhanced = enhancedOutdoors() } = {}) {
  const n = clampInt(v, LAND_VIEW_MIN, LAND_VIEW_MAX, LAND_VIEW_DEFAULT);
  return landViewDistance({ enhanced, pref: n, setting: Math.min(n, LAND_VIEW_DFU_MAX) });
}

registerFeatureLane('landView', { tiers: LAND_VIEW_TIERS, read: landViewRead, write: landViewWrite, readOf: landViewAsRead });
