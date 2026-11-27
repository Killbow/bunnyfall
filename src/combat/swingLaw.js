// @ts-check
// Registers the held-weapon reader for swing timing, so characters/weaponStates.js stays a leaf module.
import { registerSwingReader } from '../characters/weaponStates.js';
import { WEAPON_TYPES } from './fpsWeapon.js';
import { EQUIP_SLOTS } from '../characters/equip.js';
import { getItemHands, ITEM_HANDS } from '../characters/equipTable.js';
import { templateByIndex } from '../items/itemTemplates.js';
import { liveStat } from '../characters/statMods.js';
import { techniqueFamily } from './technique/techniqueRoster.js';

/**
 * @param {{entity?: any, weaponType?: number, usingRightHand?: boolean}|null} ctx
 * @returns {{weaponType: number, weight: number, strength: number, twoHanded: boolean, family: string|null, shortBlade: boolean}|null}
 */
export function readSwing(ctx) {
  const entity = ctx?.entity;
  if (!entity) return null;
  const weaponType = Number.isInteger(ctx.weaponType) ? ctx.weaponType : WEAPON_TYPES.Melee;
  const item = handItem(entity, ctx);
  const bare = !item || weaponType === WEAPON_TYPES.Melee || weaponType === WEAPON_TYPES.Werecreature;
  const family = familyOf(weaponType, item, bare);
  return {
    weaponType,
    weight: bare ? 0 : (templateByIndex(item.templateIndex)?.baseWeight ?? 0),
    strength: liveStat(entity, 'strength'),
    twoHanded: !bare && getItemHands(item) === ITEM_HANDS.Both,
    family,
    shortBlade: family === 'shortBlade',
  };
}

// Reads entity.equip without equipOf, which would add an empty table that weaponRig.js syncWorn reads as no weapon.
const handItem = (entity, ctx) => entity.equip?.slots?.[ctx.usingRightHand === false ? EQUIP_SLOTS.LeftHand : EQUIP_SLOTS.RightHand] ?? null;
const familyOf = (weaponType, item, bare) => (weaponType === WEAPON_TYPES.Werecreature ? null : bare ? 'handToHand' : techniqueFamily(item));
export function swingFamily(ctx) {
  const entity = ctx?.entity;
  if (!entity) return null;
  const weaponType = Number.isInteger(ctx.weaponType) ? ctx.weaponType : WEAPON_TYPES.Melee;
  const item = handItem(entity, ctx);
  return familyOf(weaponType, item, !item || weaponType === WEAPON_TYPES.Melee || weaponType === WEAPON_TYPES.Werecreature);
}

// Registers on import; weaponRig.js imports this module so every rig has the reader.
export function installSwingLaw() { registerSwingReader(readSwing); }
installSwingLaw();
