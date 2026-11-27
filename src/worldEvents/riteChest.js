// @ts-check
import { createRandomArmor } from '../items/loot.js';
import { setItemFields, mintCondition } from '../items/itemTemplates.js';
import { applyRarity } from '../items/lootRarity.js';
import { goldStack } from '../items/inventory.js';
import { sigilParty } from '../items/sigil.js';
import { registerModSaveData } from '../saves/modSaveData.js';
import { DAEDRA_HEART } from '../net/professionLaw.js';

export const RITE_CHEST_GOLD = Object.freeze([20, 40]);
// Daggerfall item template indices: Sulphur (69), Ichor (64), Ectoplasm (39), and Lich Dust (45).
export const RITE_REAGENTS = Object.freeze([
  Object.freeze({ templateIndex: 69, group: 'MetalIngredients' }),
  Object.freeze({ templateIndex: 64, group: 'MiscellaneousIngredients1' }),
  Object.freeze({ templateIndex: 39, group: 'CreatureIngredients1' }),
  Object.freeze({ templateIndex: 45, group: 'CreatureIngredients1' }),
]);
export const RITE_REAGENTS_MIN = 2;
export const RITE_REAGENTS_MAX = 4;
export const RITE_HEART = Object.freeze({ templateIndex: DAEDRA_HEART.templateIndex, group: DAEDRA_HEART.group });
export const RITE_HEART_CHANCE = 0.08;
export const RITE_BRAND_IN = 20;
export const RITE_BRAND_SET = 'dagon';

/**
 * @param {number} level
 * @param {() => number} [rolls]
 */
export function riteChestItems(level, rolls = Math.random) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const [lo, hi] = RITE_CHEST_GOLD;
  const items = [goldStack(Math.round(lv * (lo + rolls() * (hi - lo))))];
  const n = RITE_REAGENTS_MIN + Math.floor(rolls() * (RITE_REAGENTS_MAX - RITE_REAGENTS_MIN + 1));
  for (let i = 0; i < n; i++) {
    const r = rolls() < RITE_HEART_CHANCE ? RITE_HEART : RITE_REAGENTS[Math.floor(rolls() * RITE_REAGENTS.length) % RITE_REAGENTS.length];
    items.push(mintCondition(setItemFields({ group: r.group, templateIndex: r.templateIndex })));
  }
  if (rolls() * RITE_BRAND_IN < 1) items.push(riteBrand(lv, rolls));
  return items;
}

export function riteBrand(level, rolls = Math.random) {
  const it = createRandomArmor(level, rolls);
  applyRarity(it, 'magic', rolls);
  it.isIdentified = true;
  it.sigil = { set: RITE_BRAND_SET, party: sigilParty(1), xp: 0 };
  return it;
}

export const RITE_CHEST_SAVE_VENDOR = 'RiteChest';
let _day = -1;
export const riteChestOpened = (day) => _day === day;
export function markRiteChest(day) { if (Number.isSafeInteger(day)) _day = day; }
registerModSaveData(RITE_CHEST_SAVE_VENDOR, {
  newSaveData: () => ({ day: -1 }),
  getSaveData: () => ({ day: _day }),
  restoreSaveData: (r) => { _day = Number.isSafeInteger(r?.day) ? r.day : -1; },
});

// The faithful are transient and never saved, so this saved memory makes a rebuilt circle spawn only the survivors
// and keeps its lines from repeating.
export const RITE_DAY_SAVE_VENDOR = 'RiteDay';
// Restored counts cap at `RITE_FAITHFUL_MAX` plus the Summoner (`net/gateRite.js`); keep the two in sync.
const SLAIN_MAX = 9;
const blank = (d) => ({ d, slain: {}, fell: 0, struck: 0, passed: 0, saidBroken: 0 });
let _rite = blank(-1);
export function riteMemory(day) {
  if (_rite.d !== day) _rite = blank(day);
  return _rite;
}
export const riteSeen = (day) => (_rite.d === day ? _rite : null);
const bit = (v) => (v === 1 ? 1 : 0);
registerModSaveData(RITE_DAY_SAVE_VENDOR, {
  newSaveData: () => blank(-1),
  getSaveData: () => ({ ..._rite, slain: { ..._rite.slain } }),
  restoreSaveData: (r) => {
    if (!r || !Number.isSafeInteger(r.d)) { _rite = blank(-1); return; }
    const slain = {};
    for (const [k, v] of Object.entries(r.slain && typeof r.slain === 'object' ? r.slain : {})) if (/^\d{1,4}$/.test(k) && Number.isSafeInteger(v) && v > 0) slain[k] = Math.min(v, SLAIN_MAX);
    _rite = { d: r.d, slain, fell: bit(r.fell), struck: bit(r.struck), passed: bit(r.passed), saidBroken: bit(r.saidBroken) };
  },
});
