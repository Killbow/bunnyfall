// Roleplay & Realism: Items rules that touch no entity: loot rewrite, bandaging, condition prices,
// store-quality condition, weapon balance, and the alchemist's potions.

import { rriModule } from './rriItems.js';
import { WEAPONS } from '../characters/weapons.js';
import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { swingFrameSeconds, swingHandling } from '../characters/weaponStates.js';

export const SPEED_REDUCTION_FACTOR = 3.4;
export const REPAIR_COST_FACTOR = 0.6;
export const INSTANT_REPAIR_COST_FACTOR = 0.9;

export const RRI_LOOT_MATRICES = Object.freeze({
  '-':   { MinGold: 0,  MaxGold: 0,  P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0,  AM: 0,  WP: 0,  MI: 0, CL: 0,  BK: 0,  M2: 0, RL: 0 },
  A:     { MinGold: 0,  MaxGold: 5,  P1: 0, P2: 0, C1: 1, C2: 1, C3: 1, M1: 0,  AM: 1,  WP: 5,  MI: 1, CL: 5,  BK: 0,  M2: 1, RL: 0 },
  B:     { MinGold: 0,  MaxGold: 0,  P1: 5, P2: 5, C1: 0, C2: 0, C3: 0, M1: 0,  AM: 0,  WP: 0,  MI: 0, CL: 0,  BK: 0,  M2: 0, RL: 0 },
  C:     { MinGold: 0,  MaxGold: 10, P1: 5, P2: 5, C1: 3, C2: 3, C3: 3, M1: 3,  AM: 10, WP: 20, MI: 1, CL: 50, BK: 2,  M2: 2, RL: 1 },
  D:     { MinGold: 0,  MaxGold: 0,  P1: 2, P2: 2, C1: 2, C2: 2, C3: 2, M1: 2,  AM: 0,  WP: 0,  MI: 0, CL: 0,  BK: 0,  M2: 0, RL: 0 },
  E:     { MinGold: 0,  MaxGold: 10, P1: 2, P2: 2, C1: 5, C2: 5, C3: 5, M1: 2,  AM: 0,  WP: 5,  MI: 0, CL: 0,  BK: 0,  M2: 1, RL: 2 },
  F:     { MinGold: 2,  MaxGold: 15, P1: 2, P2: 2, C1: 5, C2: 5, C3: 5, M1: 2,  AM: 80, WP: 70, MI: 2, CL: 0,  BK: 0,  M2: 3, RL: 10 },
  G:     { MinGold: 0,  MaxGold: 8,  P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0,  AM: 10, WP: 1,  MI: 1, CL: 10, BK: 0,  M2: 3, RL: 5 },
  H:     { MinGold: 0,  MaxGold: 5,  P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0,  AM: 5,  WP: 30, MI: 1, CL: 2,  BK: 1,  M2: 0, RL: 5 },
  I:     { MinGold: 0,  MaxGold: 0,  P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0,  AM: 0,  WP: 0,  MI: 1, CL: 0,  BK: 0,  M2: 0, RL: 5 },
  J:     { MinGold: 10, MaxGold: 40, P1: 3, P2: 3, C1: 3, C2: 3, C3: 3, M1: 5,  AM: 1,  WP: 1,  MI: 5, CL: 5,  BK: 5,  M2: 2, RL: 10 },
  K:     { MinGold: 10, MaxGold: 20, P1: 3, P2: 3, C1: 3, C2: 3, C3: 3, M1: 3,  AM: 70, WP: 50, MI: 3, CL: 0,  BK: 2,  M2: 2, RL: 80 },
  L:     { MinGold: 0,  MaxGold: 10, P1: 0, P2: 0, C1: 3, C2: 3, C3: 3, M1: 3,  AM: 70, WP: 50, MI: 2, CL: 20, BK: 0,  M2: 3, RL: 3 },
  M:     { MinGold: 0,  MaxGold: 7,  P1: 1, P2: 1, C1: 1, C2: 1, C3: 1, M1: 2,  AM: 80, WP: 40, MI: 2, CL: 15, BK: 2,  M2: 3, RL: 1 },
  N:     { MinGold: 1,  MaxGold: 40, P1: 5, P2: 5, C1: 5, C2: 5, C3: 5, M1: 5,  AM: 90, WP: 60, MI: 2, CL: 20, BK: 5,  M2: 2, RL: 5 },
  O:     { MinGold: 0,  MaxGold: 30, P1: 1, P2: 1, C1: 1, C2: 1, C3: 1, M1: 1,  AM: 5,  WP: 10, MI: 1, CL: 60, BK: 0,  M2: 0, RL: 0 },
  P:     { MinGold: 2,  MaxGold: 10, P1: 5, P2: 2, C1: 2, C2: 2, C3: 2, M1: 2,  AM: 10, WP: 10, MI: 2, CL: 50, BK: 9,  M2: 2, RL: 0 },
  Q:     { MinGold: 10, MaxGold: 40, P1: 2, P2: 2, C1: 4, C2: 4, C3: 4, M1: 2,  AM: 0,  WP: 0,  MI: 2, CL: 70, BK: 5,  M2: 3, RL: 5 },
  R:     { MinGold: 2,  MaxGold: 10, P1: 0, P2: 0, C1: 3, C2: 3, C3: 3, M1: 5,  AM: 0,  WP: 0,  MI: 1, CL: 0,  BK: 0,  M2: 2, RL: 0 },
  S:     { MinGold: 30, MaxGold: 70, P1: 5, P2: 5, C1: 5, C2: 5, C3: 5, M1: 15, AM: 0,  WP: 0,  MI: 8, CL: 5,  BK: 5,  M2: 2, RL: 10 },
  T:     { MinGold: 10, MaxGold: 50, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0,  AM: 60, WP: 40, MI: 0, CL: 50, BK: 10, M2: 0, RL: 10 },
  U:     { MinGold: 0,  MaxGold: 40, P1: 5, P2: 5, C1: 5, C2: 5, C3: 5, M1: 10, AM: 20, WP: 20, MI: 4, CL: 20, BK: 90, M2: 5, RL: 70 },
  LR1:   { MinGold: 0,  MaxGold: 20, P1: 0, P2: 0, C1: 0, C2: 0, C3: 0, M1: 0,  AM: 40, WP: 50, MI: 1, CL: 50, BK: 0,  M2: 0, RL: 5 },
  LR2:   { MinGold: 0,  MaxGold: 5,  P1: 3, P2: 3, C1: 1, C2: 1, C3: 3, M1: 3,  AM: 0,  WP: 20, MI: 1, CL: 60, BK: 10, M2: 3, RL: 0 },
  LR3:   { MinGold: 0,  MaxGold: 30, P1: 3, P2: 3, C1: 1, C2: 1, C3: 1, M1: 2,  AM: 0,  WP: 20, MI: 1, CL: 95, BK: 45, M2: 2, RL: 10 },
});

export const RRI_MOB_LOOT_KEYS = Object.freeze({
  [MOBILE_TYPES.Giant]: 'E',
  [MOBILE_TYPES.Nymph]: 'B',
  [MOBILE_TYPES.Mummy]: 'J',
  [MOBILE_TYPES.OrcShaman]: 'LR2',
  [MOBILE_TYPES.Lich]: 'J',
  [MOBILE_TYPES.FireDaedra]: 'S',
  [MOBILE_TYPES.Daedroth]: 'S',
  [MOBILE_TYPES.DaedraSeducer]: 'S',
  [MOBILE_TYPES.Mage]: 'LR3',
  [MOBILE_TYPES.Battlemage]: 'LR3',
  [MOBILE_TYPES.Sorcerer]: 'LR3',
  [MOBILE_TYPES.Healer]: 'LR2',
  [MOBILE_TYPES.Nightblade]: 'LR3',
  [MOBILE_TYPES.Monk]: 'O',
  [MOBILE_TYPES.Barbarian]: 'LR1',
  [MOBILE_TYPES.Warrior]: 'LR1',
});

export const lootRebalanceOn = () => rriModule('lootRebalance');
export const rriLootMatrix = (key) => (lootRebalanceOn() ? (RRI_LOOT_MATRICES[key] ?? RRI_LOOT_MATRICES['-']) : null);
export const rriEnemyLootTableKey = (mobileType, key) => (lootRebalanceOn() ? (RRI_MOB_LOOT_KEYS[mobileType] ?? key) : key);

export const BANDAGE_TEMPLATE = 249;
export const isRriStackable = (item) => rriModule('bandaging') && item?.group === 'UselessItems2' && item?.templateIndex === BANDAGE_TEMPLATE;
export const bandageHeal = (medical, maxHealth) => Math.trunc(Math.min(Math.trunc(medical / 3), maxHealth * 0.4));
export function shelfBandageStack(quality, rolls = Math.random) {
  const max = Math.trunc(quality / 2);
  const roll = max <= 1 ? 1 : 1 + Math.floor(rolls() * (max - 1));
  return Math.max(1, Math.min(8, roll));
}


export function randomConditionLootItems(items, rolls = Math.random) {
  if (!Array.isArray(items)) return items;
  for (const item of items) {
    if (!item) continue;
    if ((item.group === 'Armor' || item.group === 'Weapons' || item.group === 'Books') && !item.artifact) {
      const conditionMod = 0.2 + rolls() * (0.75 - 0.2);
      item.currentCondition = Math.trunc((item.maxCondition ?? 0) * conditionMod);
      item.foundCondition = item.currentCondition;
    }
  }
  return items;
}
export function conditionCostBase(baseValue, conditionPercentage = -1) {
  const conditionMod = conditionPercentage === -1 ? 1 : Math.max(conditionPercentage / 100, 0.2);
  let cost = Math.trunc(baseValue * conditionMod);
  if (cost < 1) cost = 1;
  return cost;
}
export function conditionRepairCostBase(baseItemValue, condition, max, instantRepairs = false) {
  const repairCostScaleFactor = instantRepairs ? INSTANT_REPAIR_COST_FACTOR : REPAIR_COST_FACTOR;
  const conditionFactor = max > 0 ? repairCostScaleFactor * (max - condition) / max : 0;
  return Math.max(Math.trunc(baseItemValue * conditionFactor), 1);
}
export const conditionBasedPricesOn = () => rriModule('conditionBasedPrices');

export function storeQualityLow(quality) {
  if (quality <= 3) return 0.25;
  if (quality <= 7) return 0.40;
  if (quality <= 13) return 0.60;
  if (quality <= 17) return 0.75;
  return null;
}
export function storeQualityItemCondition(items, quality, rolls = Math.random) {
  const low = storeQualityLow(quality);
  if (low == null || !Array.isArray(items)) return items;
  for (const item of items) {
    if (item && (item.group === 'Armor' || item.group === 'Weapons') && !item.artifact) {
      const conditionMod = low + rolls() * (1 - low);
      item.currentCondition = Math.trunc((item.maxCondition ?? 0) * conditionMod);
      item.foundCondition = item.currentCondition;
    }
  }
  return items;
}
export const storeQualityOn = () => conditionBasedPricesOn() && rriModule('storeQualityItemCondition');

export function alchemistPotionCount(quality, rolls = Math.random) {
  const roll = quality <= 0 ? 0 : Math.floor(rolls() * quality);
  return Math.max(1, Math.min(12, roll));
}
export const alchemistPotionsOn = () => rriModule('alchemistPotions');

const W = WEAPONS;
export const RRI_WEAPON_MIN_DAMAGE = Object.freeze(Object.fromEntries([
  [[W.Dagger, W.Tanto, W.Wakazashi, W.Saber, W.Katana, W.Dai_Katana], 1],
  [[W.Shortsword, W.Broadsword, W.Longsword, W.Claymore], 2],
  [[W.Battle_Axe, W.War_Axe, W.Staff], 3],
  [[W.Mace, W.Flail, W.Warhammer], 4],
  [[W.Short_Bow, W.Long_Bow], 5],
].flatMap(([ws, v]) => ws.map((w) => [w, v]))));
export const RRI_WEAPON_MAX_DAMAGE = Object.freeze(Object.fromEntries([
  [[W.Dagger], 6],
  [[W.Tanto], 7],
  [[W.Shortsword, W.Staff], 8],
  [[W.Wakazashi], 10],
  [[W.Mace], 12],
  [[W.Battle_Axe], 13],
  [[W.Broadsword, W.Saber], 14],
  [[W.Longsword], 15],
  [[W.Katana, W.Flail], 16],
  [[W.Short_Bow], 17],
  [[W.Dai_Katana, W.War_Axe, W.Warhammer], 18],
  [[W.Long_Bow], 19],
  [[W.Claymore], 19],
].flatMap(([ws, v]) => ws.map((w) => [w, v]))));
export const weaponBalanceOn = () => rriModule('weaponBalance');
export const rriWeaponMinDamage = (weapon) => (weaponBalanceOn() ? (RRI_WEAPON_MIN_DAMAGE[weapon] ?? 0) : null);
export const rriWeaponMaxDamage = (weapon) => (weaponBalanceOn() ? (RRI_WEAPON_MAX_DAMAGE[weapon] ?? 0) : null);

export function rriMeleeWeaponAnimTime({ liveSpeed, liveStrength, weaponWeight = null, melee = false, weaponType = melee ? 15 : 0, twoHanded = false, shortBlade = false }) {
  let adjustedSpeed;
  if (melee || weaponWeight == null) {
    adjustedSpeed = liveSpeed;
  } else {
    const strWeightPerc = 150 - liveStrength;
    const adjustedWeight = strWeightPerc * weaponWeight / 100;
    const speedReductionPerc = adjustedWeight * SPEED_REDUCTION_FACTOR;
    const playerSpeed = Math.min(liveSpeed, 98);
    adjustedSpeed = Math.trunc(playerSpeed - (playerSpeed * speedReductionPerc / 90));
  }
  return swingFrameSeconds(adjustedSpeed, { handling: swingHandling(weaponType, twoHanded, shortBlade) });
}
