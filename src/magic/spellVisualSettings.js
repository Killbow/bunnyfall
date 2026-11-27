import { getPref } from '../ui/uiPrefs.js';

export const REDUCED_VISUAL_INTENSITY = 0.35;

export function visualIntensity(value) {
  return value === 0 || value === REDUCED_VISUAL_INTENSITY ? value : 1;
}

export function spellVisualIntensity(thirdPerson) {
  return visualIntensity(getPref(thirdPerson ? 'spellVisualsThirdPerson' : 'spellVisualsFirstPerson'));
}

export function auraVisualIntensity(thirdPerson) {
  return visualIntensity(getPref(thirdPerson ? 'aurasThirdPerson' : 'aurasFirstPerson'));
}
