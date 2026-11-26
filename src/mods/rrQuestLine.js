// The Roleplay & Realism master armorer quest line: its quest tables, factions, merchant service,
// and custom armor service.

import { DIRECTION_HINTS } from '../talk/talk.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { groupTemplates, setItemFields, mintCondition } from '../items/itemTemplates.js';
import { customItemsForGroup } from '../items/itemTemplates.js';

export const RR_TEXT = Object.freeze({
  fortVerynear1: 'You see many heavy bootprints in the mud and even spot a discarded shield.',
  fortVerynear2: 'These are definite tracks from of a band of warriors somewhere nearby.',
  fortNear: 'You spot signs of recent activity in the area that seem to lead to the {0}.',
  customArmor: 'Custom Armor',
  dharjenCustomArmor: 'Dharjen Custom Armor',
  notEnoughMaterials: 'Sorry I have not yet sourced enough rare materials to make you armor.',
  lordVerathonName: 'Lord Verathon',
  captainUlthegaName: 'Captain Ulthega',
  orthusDharjenName: 'Orthus Dharjen',
});

export const RR_PLACES_TABLE = Object.freeze([
  'Aldleigh,              0x3181, 1, -1',
  'Northrock_Fort_Ext,    0x73A0, 1, -1',
  'Northrock_Fort,        0x73A1, 1, -1',
]);
export const RR_FACTIONS_TABLE = Object.freeze([
  'Lord_Verathon,         0, -1, 1020',
  'Captain_Ulthega,       0, -1, 1021',
  'Orthus_Dharjen,        0, -1, 1022',
]);
export const RR_QUEST_LIST = 'RoleplayRealism';

export const RR_FACTION_IDS = Object.freeze({ LordVerathon: 1020, CaptainUlthega: 1021, OrthusDharjen: 1022 });
export const RR_CUSTOM_FACTIONS = Object.freeze([
  Object.freeze({ id: 1020, parent: 0, type: 4, name: RR_TEXT.lordVerathonName, summon: -1, region: 16, power: 10, face: 12, race: 2, flat1: (183 << 7) + 20, sgroup: 3, ggroup: 0, children: [1021] }),
  Object.freeze({ id: 1021, parent: 1020, type: 4, name: RR_TEXT.captainUlthegaName, summon: -1, region: 16, power: 2, face: 57, race: 2, flat1: (180 << 7) + 2, sgroup: 4, ggroup: 0, children: null }),
  Object.freeze({ id: 1022, parent: 0, type: 4, name: RR_TEXT.orthusDharjenName, summon: -1, region: 17, power: 2, face: 380, race: 2, flat1: (334 << 7) + 14, sgroup: 1, ggroup: 0, children: null }),
]);

export const RR_FORT_PIXEL = Object.freeze({ x: 938, y: 51 });
const FORT_NEAR_DIRECTION = Object.freeze({
  '938,50': 'south', '939,50': 'southwest', '939,51': 'west', '939,52': 'northwest',
  '938,52': 'north', '937,52': 'northeast', '937,51': 'east', '937,50': 'southeast',
});
export function rrFortProximityLines(mapPixelX, mapPixelY) {
  if (!(mapPixelX >= 937 && mapPixelX <= 939 && mapPixelY >= 50 && mapPixelY <= 52)) return [];
  if (mapPixelX === 938 && mapPixelY === 51) return [RR_TEXT.fortVerynear1, RR_TEXT.fortVerynear2];
  const dir = FORT_NEAR_DIRECTION[`${mapPixelX},${mapPixelY}`];
  return dir ? [RR_TEXT.fortNear.replace('{0}', DIRECTION_HINTS[dir])] : [];
}

export function rrMasterArmBuildingKey(regionIndex) {
  switch (regionIndex) {
    case 52: return 131342;
    case 18: return 197134;
    case 48: return 131598;
    default: return 0;
  }
}
export const RR_ARMORER_BLOCK = 'ARMRAM03.RMB';
export const RR_ARMORER_RECORD = 14;
export function rrMasterArmBuildingKeyIn(location) {
  const key = rrMasterArmBuildingKey(location?.regionIndex);
  const ed = location?.exterior?.exteriorData;
  if (!key || !Array.isArray(ed?.blockNames) || !(ed.width > 0)) return key;
  const cx = (key >> 16) & 0xff, cy = (key >> 8) & 0xff;
  let first = null;
  for (let i = 0; i < ed.blockNames.length; i++) {
    if (ed.blockNames[i] !== RR_ARMORER_BLOCK) continue;
    const x = i % ed.width, y = Math.floor(i / ed.width);
    if (x === cx && y === cy) return key;
    first ??= [x, y];
  }
  return first ? (first[0] << 16) + (first[1] << 8) + RR_ARMORER_RECORD : key;
}
export function rrMasterArmorerDiscovery(location, variantOf) {
  if (!location) return null;
  if (variantOf(location.regionIndex, location.locationIndex, RR_ARMORER_BLOCK, RR_ARMORER_RECORD) == null) return null;
  return { buildingKey: rrMasterArmBuildingKeyIn(location), name: RR_TEXT.dharjenCustomArmor };
}

export const RR_CUSTOM_ARMOR_MATERIALS = Object.freeze([
  ARMOR_MATERIAL.Mithril, ARMOR_MATERIAL.Adamantium, ARMOR_MATERIAL.Ebony, ARMOR_MATERIAL.Orcish, ARMOR_MATERIAL.Daedric,
]);
export const rrCustomArmorOffered = (level) => level >= 9;
export function rrCustomArmorMaterials(level) {
  const out = [];
  for (const material of RR_CUSTOM_ARMOR_MATERIALS) {
    if (level < 9
      || (level < 12 && material >= ARMOR_MATERIAL.Adamantium)
      || (level < 15 && material >= ARMOR_MATERIAL.Orcish)
      || (level < 18 && material >= ARMOR_MATERIAL.Daedric)) break;
    out.push(material);
  }
  return out;
}
export function rrCustomArmorVariants(templateIndex, templateVariants) {
  switch (templateIndex) {
    case 102: case 105: case 106: return [1, 3];
    case 104: return [2, 5];
    case 103: return [1, 1];
    case 108: case 107: return [1, templateVariants - 1];
    default: return null;
  }
}
export function rrCustomArmorStock(level, { mint = (fields) => mintCondition(setItemFields(fields)), armorTemplates = groupTemplates('Armor'), customTemplates = customItemsForGroup('Armor') } = {}) {
  const items = [];
  for (const material of rrCustomArmorMaterials(level)) {
    for (const t of armorTemplates) {
      const span = rrCustomArmorVariants(t.index, t.variants ?? 0);
      if (!span) continue;
      for (let v = span[0]; v <= span[1]; v++) items.push(mint({ group: 'Armor', templateIndex: t.index, material, variant: v }));
    }
    for (const templateIndex of customTemplates) items.push(mint({ group: 'Armor', templateIndex, material }));
  }
  return items;
}
export function rrCustomArmorService(window, entity) {
  const level = entity?.level ?? 1;
  if (!rrCustomArmorOffered(level)) { window.messageBox?.(RR_TEXT.notEnoughMaterials); return false; }
  window.openBuy?.(rrCustomArmorStock(level));
  return true;
}
