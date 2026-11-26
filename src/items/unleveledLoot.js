// Port of the Unleveled Loot 1.1.2 mod: materials roll on Luck, shop quality, and dungeon type instead of level,
// and corpse gold divides by level. The 1.1.2 DLL is followed, quirks included, and departures are marked.

import { modSetting } from '../mods/modSettings.js';
import { liveStat } from '../characters/statMods.js';
import { registerFormulaOverride, dice100 } from '../combat/formulas.js';
import { createWeapon } from '../combat/enemyEquipment.js';
import { createRandomArmor } from './loot.js';
import { mintCondition, setItemFields } from './itemTemplates.js';
import { registerEnemyDeathHandler } from '../characters/corpseMarker.js';
import { GOLD_TEMPLATE } from './inventory.js';

export const UNLEVELED_LOOT_VENDOR = 'unleveledLoot';
export const UNLEVELED_LOOT_VERSION = '1.1.2';
export const UNLEVELED_MATERIAL_NAMES = Object.freeze(['Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric']);

const F = Math.fround;
const int = (x) => Math.trunc(x);
export const rangeInt = (min, maxExclusive, rolls) => (maxExclusive <= min ? min : min + Math.floor(rolls() * (maxExclusive - min)));
export const rangeFloat = (min, max, rolls) => F(F(min) + F(F(F(max) - F(min)) * F(rolls())));

// As in the mod, region and dungeon start at 0 and change only at a transition, so a game loaded in a dungeon reads
// Crypt quality until its next door.
let luckMod = 0;
let matRoll = 0;
let region = 0;
let dungeon = 0;
export const _state = () => ({ luckMod, matRoll, region, dungeon });
export function _resetUnleveledLoot() { luckMod = 0; matRoll = 0; region = 0; dungeon = 0; }

let _world = null;
export function setUnleveledLootWorld(world) { _world = world; }
export const _worldReader = () => _world;
const player = () => _world?.playerEntity?.() ?? null;
// During a corpse raise every roll uses the raiser's Luck and level, so clients raising one seeded body agree.
let _raiserLuck = null, _raiserLevel = null;
const playerLevel = () => _raiserLevel ?? Math.max(1, player()?.level | 0);
const playerLuck = () => _raiserLuck ?? liveStat(player(), 'luck');
const insideOpenShop = () => !!_world?.insideOpenShop?.();
const insideDungeon = () => !!_world?.insideDungeon?.();
const buildingQuality = () => _world?.buildingQuality?.() ?? 0;
const currentRegionIndex = () => _world?.regionIndex?.() ?? -1;

const read = (k, r = null) => (r ? r(k) : modSetting(UNLEVELED_LOOT_VENDOR, k));
export const unleveledLootEnabled = (r = null) => !!read('Enabled', r);
export const matSwitchList = (r = null) => UNLEVELED_MATERIAL_NAMES.map((n) => read(n, r) | 0);
export const orcishDrops = (r = null) => (read('Orcish', r) | 0) === 8;
export const daedricDrops = (r = null) => (read('Daedric', r) | 0) === 9;

export function unleveledLootPreTransition() {
  region = currentRegionIndex();
  dungeon = _world?.locationDungeonType?.() ?? 0;
}
// As in the mod, only a building exit clears the dungeon, not a dungeon exit, so an Orc Stronghold's orcish roll
// stays live outdoors until the next building exit.
export function unleveledLootExteriorTransition() { dungeon = -1; }

export function dungeonQuality(d = dungeon, level = playerLevel()) {
  switch (d) {
    case 7: case 16: return 21;
    case 4: case 14: return 18;
    case 8: case 15: return 15;
    case 0: case 1: return 12;
    case 9: case 10: return 10;
    case 13: return 5;
    case 2: case 3: case 11: return Math.min(level, 15);
    default: return 0;
  }
}
export function shopLevel(quality = buildingQuality()) {
  if (quality > 16) return 5;
  if (quality > 12) return 4;
  if (quality > 8) return 3;
  if (quality > 4) return 2;
  return 1;
}
export function randomHighTier(rolls) {
  const num = rangeInt(0, 201, rolls);
  if (num > 199) return 9;
  if (num > 192) return 8;
  if (num > 180) return 7;
  if (num > 100) return 6;
  return 5;
}
export function randomMat(rolls) {
  if (insideDungeon()) matRoll = matRoll - 15 + dungeonQuality();
  else matRoll -= rangeInt(10, 20, rolls);
  if (dice100(luckMod * 2, rolls())) {
    if ((region === 26 || dungeon === 1) && dice100(luckMod, rolls())) return 8;
    matRoll += luckMod * 4;
  }
  if (matRoll > 90) return dice100(luckMod * 3, rolls()) ? randomHighTier(rolls) : 4;
  if (matRoll > 83) return 3;
  if (matRoll > 75) return 2;
  if (matRoll > 35) return 1;
  return 0;
}
export function shopMat(rolls) {
  const regionNow = currentRegionIndex();
  matRoll = matRoll - 35 + shopLevel() * 8;
  if (regionNow === 26 && matRoll > 70 && rangeInt(0, 90, rolls) + luckMod > 90) return 8;
  if (matRoll > 99) return 7;
  if (matRoll > 97) return 6;
  if (matRoll > 94) return 5;
  if (matRoll > 88) return 4;
  if (matRoll > 80) return 3;
  if (matRoll > 70) return 2;
  if (matRoll < 10) return 0;
  return 1;
}
export const materialSwitch = (material, list = matSwitchList()) => list[material] ?? material;
export function wpnMatSelector(rolls, list = matSwitchList()) {
  const m = insideOpenShop() ? shopMat(rolls) : randomMat(rolls);
  return materialSwitch(m, list);
}
export function armMatSelector(rolls, list = matSwitchList()) {
  let rollMod = 0;
  const armRoll = rangeInt(1, 91, rolls) + luckMod;
  if (insideOpenShop()) rollMod += buildingQuality() * 6;
  else if (insideDungeon()) rollMod += dungeonQuality();
  if (armRoll + rollMod > 50) {
    if (armRoll + rollMod > 80) return 0x0200 + wpnMatSelector(rolls, list);
    return 0x0100;
  }
  return 0;
}
export function unleveledRandomMaterial(rolls = Math.random, list = matSwitchList()) {
  luckMod = int(playerLuck() / 10);
  matRoll = rangeInt(0, 92, rolls) + luckMod;
  return wpnMatSelector(rolls, list);
}
export function unleveledRandomArmorMaterial(rolls = Math.random, list = matSwitchList()) {
  luckMod = int(playerLuck() / 10);
  matRoll = rangeInt(0, 92, rolls) + luckMod;
  return armMatSelector(rolls, list);
}

// DFU never reads ModifyFoundLootItems, so nothing calls this. It is registered under that name for parity.
export function unleveledGoldLootPiles(lootItems, { rolls = Math.random, level = playerLevel(), luck = playerLuck() } = {}) {
  luckMod = int(luck / 10);
  let changes = 0;
  for (const item of lootItems) {
    if (item.group === 'Books' && !item.artifact) {
      const conditionMod = rangeFloat(0.2, 0.75, rolls);
      item.currentCondition = int(F(F(item.maxCondition ?? 0) * conditionMod));
      changes++;
    } else if (item.group === 'Currency') {
      item.stackCount = int((item.stackCount ?? 0) / level);
      if (item.stackCount < 1) item.stackCount = 1;
    }
  }
  return changes;
}

// Departure: each drop records `foundCondition`, so a mended drop sells at the condition it dropped with.
function dropWeapon(loot, material, rolls) {
  const item = createWeapon(rangeInt(113, 131, rolls), material, rolls);
  item.currentCondition = int(F(rangeFloat(0.3, 0.75, rolls) * F(item.maxCondition ?? 0)));
  item.foundCondition = item.currentCondition;
  loot.push(item);
  return item;
}
function dropArmor(loot, material, rolls) {
  const random = mintCondition(named(createRandomArmor(playerLevel(), rolls)));
  const item = mintCondition(named({ group: 'Armor', templateIndex: random.templateIndex, material, variant: 0 }));
  item.currentCondition = int(F(rangeFloat(0.3, 0.75, rolls) * F(random.maxCondition ?? 0)));
  if (Number.isFinite(item.maxCondition) && item.currentCondition > item.maxCondition) item.currentCondition = item.maxCondition;
  item.foundCondition = item.currentCondition;
  loot.push(item);
  return item;
}
const named = setItemFields;
// Departure: below level 20 a granted drop keeps the race metal with chance level / 20, else takes a middle metal.
export const METAL_RAMP_FULL = 20;
export const rampMetal = (level) => Math.min(7, 3 + Math.trunc((Math.max(1, level | 0) - 1) / 4));
function rampedMetal(top, level, rolls) {
  if (level >= METAL_RAMP_FULL || rangeInt(0, METAL_RAMP_FULL, rolls) < level) return top;
  return materialSwitch(rampMetal(level), matSwitchList());
}
export function addDaedric(loot, enemyId, rolls, level = playerLevel()) {
  const num = rangeInt(0, 101, rolls) + (luckMod - 5);
  const flag = (enemyId === 31 && num > 70) || (enemyId === 29 && num > 75) || ((enemyId === 26 || enemyId === 25) && num > 80) || (enemyId === 27 && num > 80);
  if (!flag) return null;
  const metal = rampedMetal(9, level, rolls);
  if (rangeInt(0, 100, rolls) > 50 || enemyId === 29) return dropWeapon(loot, metal, rolls);
  return dropArmor(loot, 0x0200 + metal, rolls);
}
export function addOrcish(loot, enemyId, rolls, level = playerLevel()) {
  const num = rangeInt(0, 101, rolls) + (luckMod - 5);
  const flag = (enemyId === 24 && num > 80) || (enemyId === 21 && num > 90) || (enemyId === 12 && num > 95) || (enemyId === 7 && num > 98);
  if (!flag) return null;
  const metal = rampedMetal(8, level, rolls);
  if (rangeInt(0, 100, rolls) > 50) return dropWeapon(loot, metal, rolls);
  return dropArmor(loot, 0x0200 + metal, rolls);
}
export function unlevelDroppedLoot(entity, { rolls = Math.random, r = null, luck = undefined, level: levelIn = undefined } = {}) {
  if (!entity || !Array.isArray(entity.items)) return;
  const luckNow = luck ?? playerLuck();
  const level = levelIn != null ? Math.max(1, levelIn | 0) : playerLevel();
  const was = [_raiserLuck, _raiserLevel];
  _raiserLuck = luckNow; _raiserLevel = level;
  try {
    luckMod = int(luckNow / 10);
    const b = entity.basics ?? {};
    const id = entity.mobileType;
    if (b.affinity === 'Daedra' && daedricDrops(r)) addDaedric(entity.items, id, rolls, level);
    else if (b.team === 'Orcs' && orcishDrops(r)) addOrcish(entity.items, id, rolls, level);
    luckMod = int(luckNow / 10);
    for (const item of entity.items) {
      if (item.group !== 'Currency' || item.templateIndex !== GOLD_TEMPLATE) continue;
      item.stackCount = int((item.stackCount ?? 0) / level);
      if (item.stackCount < 1) item.stackCount = 1;
      item.stackCount *= rangeInt(1, luckMod + 1, rolls);
    }
  } finally { [_raiserLuck, _raiserLevel] = was; }
}

export function installUnleveledLoot({ read: r = null } = {}) {
  // Without a player the mod has no Luck or level to read, so it stays off and DFU's own roll applies.
  const on = () => unleveledLootEnabled(r) && player() != null;
  registerFormulaOverride('randomMaterial', (playerLevel, rolls = Math.random) => (on() ? unleveledRandomMaterial(rolls, matSwitchList(r)) : undefined));
  registerFormulaOverride('randomArmorMaterial', (playerLevel, rolls = Math.random) => (on() ? unleveledRandomArmorMaterial(rolls, matSwitchList(r)) : undefined));
  registerFormulaOverride('modifyFoundLootItems', (lootItems) => (on() ? unleveledGoldLootPiles(lootItems) : undefined));
  registerEnemyDeathHandler(UNLEVELED_LOOT_VENDOR, (entity, opts) => { if (on()) unlevelDroppedLoot(entity, { ...opts, r }); });
  return true;
}
export function uninstallUnleveledLoot() {
  registerFormulaOverride('randomMaterial', null);
  registerFormulaOverride('randomArmorMaterial', null);
  registerFormulaOverride('modifyFoundLootItems', null);
  registerEnemyDeathHandler(UNLEVELED_LOOT_VENDOR, null);
}
