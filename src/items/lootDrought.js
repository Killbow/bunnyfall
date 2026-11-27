// @ts-check

import { droughtHeld, rollerLevel } from './lootLevelGate.js';
import { lootRarityOn, registerLegendaryFind, rarityRank, RARITIES, isGarment, legendariesFor } from './lootRarity.js';
import { registerTakeListener } from './inventory.js';
import { registerModSaveData } from '../saves/modSaveData.js';

export const DROUGHT_STEP = 25;
export const DROUGHT_STEP_MULT = 0.2;
export const DROUGHT_MAX_MULT = 3;
export const DROUGHT_MAX = 100000;

let _drought = 0;
export const droughtOf = () => _drought;
export const droughtMult = (d = _drought) => Math.min(DROUGHT_MAX_MULT, 1 + DROUGHT_STEP_MULT * Math.floor(Math.max(0, Number(d) || 0) / DROUGHT_STEP));

// Count at the take, not the roll, since corpse loot rolls at spawn; the untaken mark makes a piece count once.
export function noteTaken(item) {
  if (!item || item.untaken !== true) return false;
  delete item.untaken;
  if (!lootRarityOn()) return false;
  if (isGarment(item) && !legendariesFor(item).length) return false;
  if (droughtHeld(rollerLevel()) && rarityRank(item) < RARITIES.legendary.rank) return false;
  _drought = rarityRank(item) >= RARITIES.legendary.rank ? 0 : Math.min(DROUGHT_MAX, _drought + 1);
  return true;
}

export const DROUGHT = 'lootDrought';
export const DROUGHT_SAVE_VENDOR = 'LootDrought';
export function validDroughtRecord(r) {
  const d = r && typeof r === 'object' ? r.drought : null;
  return Number.isSafeInteger(d) && d >= 0 ? Math.min(DROUGHT_MAX, d) : 0;
}
registerModSaveData(DROUGHT_SAVE_VENDOR, {
  newSaveData: () => ({ drought: 0 }),
  getSaveData: () => ({ drought: _drought }),
  restoreSaveData: (r) => { _drought = validDroughtRecord(r); },
});
registerLegendaryFind(DROUGHT, () => (lootRarityOn() ? droughtMult() : 1));
registerTakeListener(DROUGHT, noteTaken);

export function _setDroughtForTests(n) { _drought = Math.max(0, Math.trunc(Number(n) || 0)); }
