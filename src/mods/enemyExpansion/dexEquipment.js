// Daggerfall Enemy Expansion's enemy equipment: BestiaryMod.Start takes EnemyEntity.AssignEnemyEquipment over,
// with the mod's own copy of the Roleplay & Realism: Items class kits while realisticEnemyEquipment is on.

import { assignRriEnemyEquipment, RRI_ITEM } from '../../combat/rriEnemyEquipment.js';
import { ARMOR_ENUM as A } from '../../combat/enemyEquipment.js';
import { rriModule } from '../rriItems.js';
import { MOBILE_TYPES as M } from '../../characters/mobileTypes.js';

const CLASS_BY_NAME = new Map(Object.entries(M)
  .filter(([name, id]) => id >= M.Mage && id <= M.Knight && name !== 'Knight_CityWatch')
  .map(([name, id]) => [name.toLowerCase(), id]));

export function dexClassTable(mobileId, propsOf) {
  const table = propsOf(mobileId)?.equipmentTable;
  if (!table) return mobileId;
  const name = String(table).toLowerCase();
  if (name === 'guard') return M.Knight_CityWatch;
  return CLASS_BY_NAME.get(name) ?? null;
}

const ARMOR_FLAG = Object.freeze({ Leather: 1, Chain: 2, Plate: 4 });
const forbiddenArmors = (career) => ((career?.weaponArmorShieldsBitfield ?? 0) >>> 6) & 0x07;
const coinFlip = (rolls) => Math.floor(rolls() * 2) === 0;

const CLASSIC_PIECE = Object.freeze({ ChestArmor: A.Cuirass, LegsArmor: A.Greaves, LeftArm: A.Left_Pauldron, RightArm: A.Right_Pauldron, Feet: A.Boots, Gloves: A.Gauntlets, Head: A.Helm });
const CHAIN_PIECE = Object.freeze({ ChestArmor: RRI_ITEM.Hauberk, LegsArmor: RRI_ITEM.Chausses, LeftArm: RRI_ITEM.LeftSpaulder, RightArm: RRI_ITEM.RightSpaulder, Feet: RRI_ITEM.Sollerets, Gloves: RRI_ITEM.Gloves, Head: RRI_ITEM.Helmet });
const LEATHER_PIECE = Object.freeze({ ChestArmor: RRI_ITEM.Jerkin, LegsArmor: RRI_ITEM.Cuisse, LeftArm: RRI_ITEM.LeftVambrace, RightArm: RRI_ITEM.RightVambrace, Feet: RRI_ITEM.Boots, Gloves: RRI_ITEM.Gloves, Head: RRI_ITEM.Helmet });

export function dexArmorTemplateIndex(slot, career, rolls = Math.random) {
  const forbidden = forbiddenArmors(career);
  if (!rriModule('newArmor') || (forbidden & ARMOR_FLAG.Plate) === 0 || coinFlip(rolls)) return CLASSIC_PIECE[slot] ?? -1;
  if ((forbidden & ARMOR_FLAG.Chain) === 0) return CHAIN_PIECE[slot] ?? -1;
  if ((forbidden & ARMOR_FLAG.Leather) === 0) return LEATHER_PIECE[slot] ?? -1;
  return -1;
}

export const dexKitRead = (propsOf) => Object.freeze({
  classOf: (entity) => dexClassTable(entity.mobileType, propsOf),
  armorTemplate: (slot, { career }, rolls) => dexArmorTemplateIndex(slot, career, rolls),
  unknownArmed: true,
  equipsSecondary: true,
});

export function createDexEquipmentAssigner(propsOf) {
  const read = dexKitRead(propsOf);
  return (entity, variant, playerLevel, opts = {}) => assignRriEnemyEquipment(entity, variant, playerLevel, { ...opts, read });
}
