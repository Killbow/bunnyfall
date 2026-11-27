// @ts-check
import { createWeapon, randomMaterial, WEAPONS_ENUM as W } from '../../combat/enemyEquipment.js';
import { mintCondition, setItemFields } from '../../items/itemTemplates.js';
import { applyRarity } from '../../items/lootRarity.js';

export const EG_LORD_ARMS = Object.freeze({
  hound: Object.freeze({ name: 'The Houndfang', template: W.Saber }),
  spellmaster: Object.freeze({ name: "The Examiner's Staff", template: W.Staff }),
  armsmaster: Object.freeze({ name: 'The Last Lesson', template: W.Longsword }),
  ilthys: Object.freeze({ name: 'Conquest', template: W['War Axe'] }),
  cairnkeeper: Object.freeze({ name: 'Tithe', template: W.Mace }),
  twins: Object.freeze({ name: 'Rivalry', template: W['Dai-Katana'] }),
  morvayn: Object.freeze({ name: 'Soulchain', template: W.Flail }),
  dusk: Object.freeze({ name: 'Duskwing', template: W['Long Bow'] }),
  stalker: Object.freeze({ name: 'Bloodmoon', template: W.Tanto }),
  seyth: Object.freeze({ name: 'Mirrorshard', template: W.Shortsword }),
  colossus: Object.freeze({ name: "The Engine's Heart", template: W.Warhammer }),
  wyrm: Object.freeze({ name: 'Wyrmbreath', template: W.Claymore }),
  garoth: Object.freeze({ name: 'The Clan-Breaker', template: W['Battle Axe'] }),
});

/**
 * The name is set after `applyRarity`, which writes its own name over the item.
 * @param {string} lord
 * @param {number} level
 * @param {() => number} rolls
 */
export function egLordArm(lord, level, rolls) {
  const arm = EG_LORD_ARMS[lord];
  if (!arm) return null;
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const material = Math.max(randomMaterial(lv, rolls), randomMaterial(lv, rolls));
  const item = mintCondition(setItemFields({ group: 'Weapons', ...createWeapon(arm.template, material, rolls) }));
  if (!item) return null;
  applyRarity(item, 'legendary', rolls);
  item.isIdentified = true;
  item.name = arm.name;
  return item;
}
