// @ts-check

// Kept apart from createItem.js, which pulls in UI, so the account service's item rules can read these rows.
import { ARROW_TEMPLATE } from './inventory.js';
import { ARMOR_MATERIAL } from './armorMaterials.js';

const WEAPON_STEEL = 0x0001;

const A = Object.freeze({
  Cuirass: 102, Gauntlets: 103, Greaves: 104, Left_Pauldron: 105,
  Right_Pauldron: 106, Helm: 107, Boots: 108, Buckler: 109,
});
const W = Object.freeze({
  Dagger: 113, Staff: 115, Longsword: 120, Battle_Axe: 127, Short_Bow: 129,
});
export const MENS_PLAIN_ROBES = 163;
export const WOMENS_PLAIN_ROBES = 200;

const armor = (templateIndex, material) => ({ kind: 'armor', templateIndex, material });
const weapon = (templateIndex) => ({ kind: 'weapon', templateIndex, material: WEAPON_STEEL });
// Row order is the picker's order, and the last-picked index points into it.
export const CREATE_ITEM_ROWS = Object.freeze([
  { label: 'Leather Cuirass', ...armor(A.Cuirass, ARMOR_MATERIAL.Leather) },
  { label: 'Leather Gauntlets', ...armor(A.Gauntlets, ARMOR_MATERIAL.Leather) },
  { label: 'Leather Greaves', ...armor(A.Greaves, ARMOR_MATERIAL.Leather) },
  { label: 'Leather Left Pauldron', ...armor(A.Left_Pauldron, ARMOR_MATERIAL.Leather) },
  { label: 'Leather Right Pauldron', ...armor(A.Right_Pauldron, ARMOR_MATERIAL.Leather) },
  { label: 'Leather Helm', ...armor(A.Helm, ARMOR_MATERIAL.Leather) },
  { label: 'Leather Boots', ...armor(A.Boots, ARMOR_MATERIAL.Leather) },
  { label: 'Chain Cuirass', ...armor(A.Cuirass, ARMOR_MATERIAL.Chain) },
  { label: 'Chain Gauntlets', ...armor(A.Gauntlets, ARMOR_MATERIAL.Chain) },
  { label: 'Chain Greaves', ...armor(A.Greaves, ARMOR_MATERIAL.Chain) },
  { label: 'Chain Left Pauldron', ...armor(A.Left_Pauldron, ARMOR_MATERIAL.Chain) },
  { label: 'Chain Right Pauldron', ...armor(A.Right_Pauldron, ARMOR_MATERIAL.Chain) },
  { label: 'Chain Helm', ...armor(A.Helm, ARMOR_MATERIAL.Chain) },
  { label: 'Chain Boots', ...armor(A.Boots, ARMOR_MATERIAL.Chain) },
  { label: 'Steel Cuirass', ...armor(A.Cuirass, ARMOR_MATERIAL.Steel) },
  { label: 'Steel Gauntlets', ...armor(A.Gauntlets, ARMOR_MATERIAL.Steel) },
  { label: 'Steel Greaves', ...armor(A.Greaves, ARMOR_MATERIAL.Steel) },
  { label: 'Steel Left Pauldron', ...armor(A.Left_Pauldron, ARMOR_MATERIAL.Steel) },
  { label: 'Steel Right Pauldron', ...armor(A.Right_Pauldron, ARMOR_MATERIAL.Steel) },
  { label: 'Steel Helm', ...armor(A.Helm, ARMOR_MATERIAL.Steel) },
  { label: 'Steel Boots', ...armor(A.Boots, ARMOR_MATERIAL.Steel) },
  { label: 'Steel Buckler', ...armor(A.Buckler, ARMOR_MATERIAL.Steel) },
  { label: 'Steel Dagger', ...weapon(W.Dagger) },
  { label: 'Steel Longsword', ...weapon(W.Longsword) },
  { label: 'Steel Staff', ...weapon(W.Staff) },
  { label: 'Short Bow', ...weapon(W.Short_Bow) },
  { label: 'Arrows', ...weapon(ARROW_TEMPLATE) },
  { label: 'Steel Battle Axe', ...weapon(W.Battle_Axe) },
  { label: 'Robes', kind: 'robes' },
]);
