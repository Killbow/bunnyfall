import { DYE_COLORS, DYE_TARGETS } from '../characters/dyes.js';
import { weaponDyeColor } from '../characters/weapons.js';
import { ARMOR_MATERIAL } from './armorMaterials.js';

export function armorDyeColor(material) {
  const M = ARMOR_MATERIAL, D = DYE_COLORS;
  switch (material) {
    case M.Iron: return D.Iron;
    case M.Steel: return D.Steel;
    case M.Silver: return D.Silver;
    case M.Elven: return D.Elven;
    case M.Dwarven: return D.Dwarven;
    case M.Mithril: return D.Mithril;
    case M.Adamantium: return D.Adamantium;
    case M.Ebony: return D.Ebony;
    case M.Orcish: return D.Orcish;
    case M.Daedric: return D.Daedric;
    default: return D.Unchanged;
  }
}

export function itemDyeTarget(item) {
  if (!item) return null;
  if ((item.group === 'Weapons' || item.group === 'Armor') && !item.artifact) return DYE_TARGETS.WeaponsAndArmor;
  if (item.group === 'MensClothing' || item.group === 'WomensClothing') return DYE_TARGETS.Clothing;
  return null;
}

export function itemDyeColor(item) {
  if (!item) return DYE_COLORS.Unchanged;
  // An artifact keeps the Unchanged dye because Daggerfall Unity resets it after the weapon or armor maker runs.
  if (item.artifact) return DYE_COLORS.Unchanged;
  if (item.group === 'Weapons') return Number.isFinite(item.dyeColor) ? item.dyeColor : weaponDyeColor(item.material ?? item.nativeMaterialValue);
  if (item.group === 'Armor') return Number.isFinite(item.dyeColor) ? item.dyeColor : armorDyeColor(item.material ?? item.nativeMaterialValue);
  if (item.group === 'MensClothing' || item.group === 'WomensClothing') return Number.isFinite(item.dye) ? item.dye : Number.isFinite(item.dyeColor) ? item.dyeColor : DYE_COLORS.Unchanged;
  return Number.isFinite(item.dyeColor) ? item.dyeColor : DYE_COLORS.Unchanged;
}
