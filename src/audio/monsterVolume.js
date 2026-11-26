import { getPref } from '../ui/uiPrefs.js';

export const shelfVolume = (key) => { const v = Number(getPref(key)); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; };

export function monsterVolume() {
  return shelfVolume('monsterVolume');
}

export function companionVolume() {
  return shelfVolume('companionVolume');
}
