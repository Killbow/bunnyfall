// @ts-check
// Every existing crafting operation has a route in the unified menu.
export const WORKSHOP_CRAFTS = Object.freeze([
  { id: 'smithing', name: 'Smithing', track: 'smithing', stations: ['anvil', 'jeweller'] },
  { id: 'building', name: 'Building', track: 'building', stations: ['workbench', 'mason'] },
  { id: 'outfitting', name: 'Outfitting', track: 'outfitting', stations: ['loom'] },
  { id: 'cooking', name: 'Cooking', track: 'provisioning', stations: ['fire'] },
  { id: 'alchemy', name: 'Alchemy', track: 'provisioning', stations: ['alchemy'] },
  { id: 'enchanting', name: 'Enchanting', track: 'enchanting', stations: ['enchant'] },
]);
export const WORKSHOP_STATIONS = Object.freeze({ anvil: 'Forge & anvil', jeweller: 'Jeweller’s bench', workbench: 'Workbench', mason: 'Mason’s bench', loom: 'Loom', fire: 'Pot', alchemy: 'Cauldron', enchant: 'Enchanting table' });
export const workshopCraftOf = (station) => WORKSHOP_CRAFTS.find((c) => c.stations.includes(station)) ?? WORKSHOP_CRAFTS[0];
export function workshopOperations(station) {
  if (station === 'enchant') return [['gear', 'Reforge & item work'], ['reforge', 'Essence reforge'], ['disenchant', 'Disenchant']];
  if (station === 'fire' || station === 'alchemy') return [['craft', station === 'fire' ? 'Pot' : 'Cauldron'], ['traditional', 'Traditional recipes']];
  return [['craft', 'Create'], ...(['anvil', 'loom'].includes(station) ? [['upgrade', 'Improve']] : []),
    ...(['anvil', 'workbench', 'mason', 'loom'].includes(station) ? [['refine', 'Refine']] : []), ['salvage', 'Salvage']];
}
export const workshopPageOf = (id) => id === 'stores' || id === 'store' ? 'store' : id === 'professions' || id === 'mastery' ? 'mastery' : 'make';
export const workshopStationOf = (station) => station === 'forge' || station === 'temper-anvil' ? 'anvil' : station === 'temper-loom' ? 'loom' : station === 'enchanter' ? 'enchant' : WORKSHOP_STATIONS[station] ? station : 'anvil';
