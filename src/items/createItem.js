import { addItem, isSummoned } from './inventory.js';
import { unequipSlot, equipTableOf } from '../characters/equip.js';
import { createWeapon } from '../combat/enemyEquipment.js';
import { randomizeArmorVariant } from '../trade/shopStock.js';
import { mintCondition, itemBaseValue, templateByIndex, setItemFields } from './itemTemplates.js';
import { DYE_COLORS } from '../characters/dyes.js';
import { localizedText, localizedStrings } from '../ui/textManager.js';

import { CREATE_ITEM_ROWS, MENS_PLAIN_ROBES, WOMENS_PLAIN_ROBES } from './createItemRows.js';

export { isSummoned };
export { CREATE_ITEM_ROWS, MENS_PLAIN_ROBES, WOMENS_PLAIN_ROBES };

// One index shared by every cast and host, as in classic Daggerfall, so the picker reopens on the last row taken.
let _lastSelectedIndex = 0;
export const lastCreateItemIndex = () => _lastSelectedIndex;
export const setLastCreateItemIndex = (i) => { _lastSelectedIndex = i | 0; };

const CREATE_ITEM_TEXT = localizedStrings({
  LeatherCuirass: 'Leather Cuirass', LeatherGauntlets: 'Leather Gauntlets', LeatherGreaves: 'Leather Greaves',
  LeatherLeftPauldron: 'Leather Left Pauldron', LeatherRightPauldron: 'Leather Right Pauldron',
  LeatherHelm: 'Leather Helm', LeatherBoots: 'Leather Boots', ChainCuirass: 'Chain Cuirass',
  ChainGauntlets: 'Chain Gauntlets', ChainGreaves: 'Chain Greaves', ChainLeftPauldron: 'Chain Left Pauldron',
  ChainRightPauldron: 'Chain Right Pauldron', ChainHelm: 'Chain Helm', ChainBoots: 'Chain Boots',
  SteelCuirass: 'Steel Cuirass', SteelGauntlets: 'Steel Gauntlets', SteelGreaves: 'Steel Greaves',
  SteelLeftPauldron: 'Steel Left Pauldron', SteelRightPauldron: 'Steel Right Pauldron', SteelHelm: 'Steel Helm',
  SteelBoots: 'Steel Boots', SteelBuckler: 'Steel Buckler', SteelDagger: 'Steel Dagger',
  SteelLongsword: 'Steel Longsword', SteelStaff: 'Steel Staff', ShortBow: 'Short Bow', Arrows: 'Arrows',
  SteelBattleAxe: 'Steel Battle Axe', Robes: 'Robes',
});
export const createItemLabels = () => CREATE_ITEM_ROWS.map((r) => CREATE_ITEM_TEXT[r.label.replace(/ /g, '')] ?? r.label);

export function createTempItem(index, { gender = 'male', nowMinutes = 0, rounds = 0, rolls = Math.random } = {}) {
  const row = CREATE_ITEM_ROWS[index];
  if (!row) return null;
  let item = null;
  if (row.kind === 'armor') {
    item = mintCondition(setItemFields({
      group: 'Armor', templateIndex: row.templateIndex, material: row.material,
      variant: randomizeArmorVariant(row.templateIndex, row.material, rolls),
    }));
  } else if (row.kind === 'weapon') {
    item = createWeapon(row.templateIndex, row.material, rolls);
    item.value = itemBaseValue(item);
  } else {
    const templateIndex = gender === 'female' ? WOMENS_PLAIN_ROBES : MENS_PLAIN_ROBES;
    const variants = templateByIndex(templateIndex)?.variants ?? 0;
    item = mintCondition({
      group: gender === 'female' ? 'WomensClothing' : 'MensClothing',
      templateIndex,
      variant: Math.floor(rolls() * variants),
      dye: DYE_COLORS.Blue,
      name: templateByIndex(templateIndex)?.name,
    });
    item.value = itemBaseValue(item);
  }
  // This stamp alone makes the item conjured; isSummoned and stacking read it.
  item.timeForItemToDisappear = nowMinutes + rounds;
  return item;
}

export function grantCreatedItem(entity, index, opts = {}) {
  const item = createTempItem(index, opts);
  if (!item) return null;
  // Conjured items join a stack only when their lifetimes match exactly.
  addItem(entity.items ??= [], item);
  return item;
}

export function removeExpiredItems(entity, nowMinutes) {
  const list = entity?.items;
  if (!Array.isArray(list) || !list.length) return [];
  const doomed = list.filter((it) => isSummoned(it) && it.timeForItemToDisappear < nowMinutes);
  if (!doomed.length) return [];
  const slots = equipTableOf(entity);
  for (const item of doomed) {
    for (let slot = 0; slot < slots.length; slot++) {
      // Unequip first, or the armor value stays; unequipSlot already updates the armor table, so call it once.
      if (slots[slot] === item) unequipSlot(entity, slot);
    }
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  }
  return doomed;
}

export const CANNOT_REMOVE_ITEM_TEXT = 'You cannot remove this item.';
export const cannotRemoveItemText = () => localizedText('cannotRemoveItem', CANNOT_REMOVE_ITEM_TEXT);
