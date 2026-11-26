// @ts-check
// Scales the loot bonus by the roller's Renown stage, from half at stage 0 to one and a half times at stage 4.
// Offline play has no Renown and gets the full bonus.
import { sigilOnline, sigilRenown, renownSigilStage } from './sigil.js';

export const RENOWN_LOOT_QUARTERS = Object.freeze([2, 3, 4, 5, 6]);
export const RENOWN_LOOT_OFFLINE_QUARTERS = 4;

export function renownLootQuarters({ online = sigilOnline(), renown = sigilRenown() } = {}) {
  if (!online) return RENOWN_LOOT_OFFLINE_QUARTERS;
  return RENOWN_LOOT_QUARTERS[Math.max(0, renownSigilStage(renown))];
}

// Rounds to nine places because quarter steps of decimals such as 0.4 are inexact in binary.
export const lootEased = (/** @type {number} */ before, /** @type {number} */ after, /** @type {number} */ quarters) =>
  Math.round((before + ((after - before) * quarters) / 4) * 1e9) / 1e9;
