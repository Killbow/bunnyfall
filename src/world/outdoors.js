import { getPref, setPref } from '../ui/uiPrefs.js';
import { modSetting, setModSetting } from '../mods/modSettings.js';
import { registerFeatureLane } from '../mods/features.js';

export const OUTDOORS_TIERS = Object.freeze([
  ['off', 'Off'],
  ['dome', 'Port sky'],
  ['dynamic', 'Dynamic Skies'],
]);
export const OUTDOORS_DEFAULT = 'dynamic';

export function outdoorsRead() {
  if (!getPref('enhancedEnvironments')) return 'off';
  return modSetting('dynamic-skies', 'Enabled') ? 'dynamic' : 'dome';
}

export function outdoorsWrite(v) {
  const tier = OUTDOORS_TIERS.some(([k]) => k === v) ? v : OUTDOORS_DEFAULT;
  setPref('enhancedEnvironments', tier !== 'off');
  if (tier !== 'off') setModSetting('dynamic-skies', 'Enabled', tier === 'dynamic');
  return tier;
}

registerFeatureLane('outdoors', { tiers: OUTDOORS_TIERS, default: OUTDOORS_DEFAULT, read: outdoorsRead, write: outdoorsWrite });
