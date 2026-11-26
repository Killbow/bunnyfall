// Starting equipment: ItemHelper.AssignStartingGear from DFU (MIT, Daggerfall Workshop).

import { addItem, addGoldPieces } from '../items/inventory.js';
import { giveWallet, isWalletItem } from '../items/walletItem.js';
import { giveStartingLockpicks } from '../systems/lockpick/lockpickItem.js';
import { equipItem } from './equip.js';
import { templateByIndex, mintCondition, setItemFields } from '../items/itemTemplates.js';
import { CLOTHING_DYES } from './dyes.js';
import { createWeapon } from '../combat/enemyEquipment.js';
import { getBool } from '../platform/settings.js';
import { survivalOn } from '../systems/survival/switch.js';
import { startingProvisions, startingCampfire } from '../systems/survival/items.js';
import { sharedClockOn } from '../world/worldTick.js';

const SHORT_SHIRT_M = 165, CASUAL_PANTS_M = 151;
const SHORT_SHIRT_CLOSED_F = 206, CASUAL_PANTS_F = 190;
const SPELLBOOK = 132;
const TORCH = 247, CANDLE = 253;
const ARROW = 131;
const LONGSWORD = 120, BATTLE_AXE = 127;

export const STARTING_WEAPON_BY_CLASS = Object.freeze([
  116, 119, 119, 116, 124, 116, 116, 114, 119, 116, 116, 120, 115, 130, 127, 126, 118, 120,
]);
export const STARTING_MATERIAL_BY_CLASS = Object.freeze([
  1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0,
]);
export const ARCHER_CLASS_INDEX = 13;
export const ARCHER_ARROWS = 24;
export const STARTING_GOLD = 100;

const mint = (item) => mintCondition(setItemFields(item));

export function assignStartingGear(entity, { classIndex = 0, isCustom = false, rolls = Math.random, torchesFromItems = getBool('Enhancements', 'PlayerTorchFromItems') } = {}) {
  entity.items = entity.items ?? [];
  const female = entity.gender === 'female';
  const added = [];
  const add = (item) => { const it = mint(item); addItem(entity.items, it); added.push(it); return it; };

  add({ group: 'MiscItems', templateIndex: SPELLBOOK });

  const pantsTemplate = female ? CASUAL_PANTS_F : CASUAL_PANTS_M;
  const shirt = add({
    group: female ? 'WomensClothing' : 'MensClothing',
    templateIndex: female ? SHORT_SHIRT_CLOSED_F : SHORT_SHIRT_M,
    variant: 0,
    dye: CLOTHING_DYES[Math.floor(rolls() * CLOTHING_DYES.length)],
  });
  const pants = add({
    group: female ? 'WomensClothing' : 'MensClothing',
    templateIndex: pantsTemplate,
    variant: Math.floor(rolls() * (templateByIndex(pantsTemplate)?.variants ?? 1)),
  });

  equipItem(entity, shirt);
  equipItem(entity, pants);

  if (isCustom) {
    add({ group: 'Weapons', templateIndex: LONGSWORD, material: 0 });
  } else {
    const i = Math.max(0, Math.min(STARTING_WEAPON_BY_CLASS.length - 1, classIndex | 0));
    add({ group: 'Weapons', templateIndex: STARTING_WEAPON_BY_CLASS[i], material: STARTING_MATERIAL_BY_CLASS[i] });
    if (i === ARCHER_CLASS_INDEX) {
      add({ group: 'Weapons', templateIndex: BATTLE_AXE, material: 1 });
      add({ ...createWeapon(ARROW, 0, rolls), stackCount: ARCHER_ARROWS });
    }
  }

  if (torchesFromItems) {
    for (let i = 0; i < 5; i++) add({ group: 'UselessItems2', templateIndex: TORCH });
    for (let i = 0; i < 2; i++) add({ group: 'UselessItems2', templateIndex: CANDLE });
  }

  addSurvivalProvisions(entity, added);
  addStartingGold(entity, STARTING_GOLD);
  return added;
}

export function addSurvivalProvisions(entity, added = []) {
  if (survivalOn()) for (const it of startingProvisions(entity)) { addItem(entity.items, it); added.push(it); }
  else if (sharedClockOn()) { const it = startingCampfire(); if (it) { addItem(entity.items, it); added.push(it); } }
  if (giveWallet(entity)) added.push(entity.items.find(isWalletItem));
  const picks = giveStartingLockpicks(entity);
  if (picks) added.push(picks);
  return added;
}

let _assigner = null;
export function setStartingEquipmentAssigner(fn) { _assigner = typeof fn === 'function' ? fn : null; }
export function assignStartingEquipment(entity, opts = {}) {
  return _assigner?.(entity, opts) ?? assignStartingGear(entity, opts);
}

export function addStartingGold(entity, amount = STARTING_GOLD) {
  addGoldPieces(entity, amount);
  return entity;
}
