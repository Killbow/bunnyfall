// @ts-check
// Daggerfall's Furniture group (templates 217-245) has no loot or shop source in the classic game. Furniture is
// delivered to the save's furnishings, never carried, and set down from the decorate panel.

import { GROUP_TEMPLATE_INDICES } from '../items/itemTemplatesData.js';
import { itemLongName } from '../items/itemInfo.js';
import { decorDescriptorOf, decorItemFlat } from './decorItems.js';
import { STONE_DECOR_TEMPLATES, stoneDecorModel } from '../net/recipeLaw.js';

export const FURNITURE_TEMPLATES = Object.freeze([...(GROUP_TEMPLATE_INDICES.Furniture ?? [])]);
export const FURNISH_BEDS = Object.freeze(new Set([217, 218, 219, 220]));
export const FURNISH_TABLES_AND_CHAIRS = Object.freeze(new Set([221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232]));
export const FURNISH_PILLOWS = Object.freeze(new Set([235, 236]));
export const isFurnishing = (item) => item?.group === 'Furniture' && (FURNITURE_TEMPLATES.includes(item?.templateIndex) || STONE_DECOR_TEMPLATES.includes(item?.templateIndex));

export function furnishingKinds(item) {
  if (!isFurnishing(item)) return null;
  const t = item.templateIndex;
  if (FURNISH_PILLOWS.has(t) || stoneDecorModel(t) !== null) return null;
  if (FURNISH_BEDS.has(t)) return ['bed'];
  if (FURNISH_TABLES_AND_CHAIRS.has(t)) return ['furniture'];
  return ['furniture', 'decor'];
}

export function furnishingLooks(item, entries) {
  const kinds = furnishingKinds(item);
  return kinds ? (entries ?? []).filter((e) => kinds.includes(e.kind)) : [];
}

export function decorFurnishingEntry(item, index) {
  if (!isFurnishing(item)) return null;
  const descriptor = decorDescriptorOf(item);
  if (!descriptor) return null;
  const looks = furnishingKinds(item);
  const model = stoneDecorModel(item.templateIndex);
  const pic = decorItemFlat(item);
  const flat = model === null ? pic : null;
  if (!looks && !flat && model === null) return null;
  return {
    key: `furnish:${index}`, kind: 'own', own: item, furnishing: true, name: itemLongName(item), model, flat,
    looks, light: null, item: descriptor, storage: false, count: item.stackCount ?? 1,
    icon: pic ? { archive: pic[0], record: pic[1], dye: null } : null,
  };
}

export const furnishingBackLine = (n) => (n === 1 ? 'A piece of your furniture came back to Your things.'
  : `${n} pieces of your furniture came back to Your things.`);
export function ownBackLines(items, packLine) {
  const furn = items.filter(isFurnishing).length;
  const rest = items.length - furn;
  return [rest ? packLine(rest) : null, furn ? furnishingBackLine(furn) : null].filter(Boolean).join(' ');
}

export const furnishingDeliveredLine = (names) => (names.length === 1
  ? `The ${names[0]} will be delivered. Place it from the Decorate panel in any room you can decorate.`
  : `${names.length} pieces of furniture will be delivered. Place them from the Decorate panel in any room you can decorate.`);
