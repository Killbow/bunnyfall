// Roleplay & Realism Items' AssignEnemyStartingEquipment (RoleplayRealismItemsMod.cs), used in place of
// EnemyEntity.AssignEnemyEquipment while realisticEnemyEquipment is on.
import {
  createWeapon, randomMaterial, randomArmorMaterial, rollEnemyEquipment, enemyArmorValues,
  WEAPONS_ENUM, ARMOR_ENUM, ARROW_TEMPLATE,
} from './enemyEquipment.js';
import { dice100 } from './formulas.js';
import { mintCondition, setItemFields, templateByIndex, itemBaseValue } from '../items/itemTemplates.js';
import { markFound } from '../items/foundMark.js';
import { rriModule, customItemClass } from '../mods/rriItems.js';
import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { DYE_COLORS } from '../characters/dyes.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { ARMOR_MATERIAL as ARMOR_MATERIALS } from '../items/armorMaterials.js';
import { equipTableOf, getEquipSlot, wearLeavers, EQUIP_SLOTS } from '../characters/equip.js';
import { rollEnemyWeaponPoison } from '../afflictions/poisons.js';
import { MENS_PLAIN_ROBES, WOMENS_PLAIN_ROBES } from '../items/createItem.js';

const M = MOBILE_TYPES;
const W = WEAPONS_ENUM;
const A = ARMOR_ENUM;

export const RRI_ITEM = Object.freeze({
  ArchersAxe: 513, LightFlail: 514,
  Hauberk: 515, Chausses: 516, LeftSpaulder: 517, RightSpaulder: 518, Sollerets: 519,
  Jerkin: 520, Cuisse: 521, Helmet: 522, Boots: 523, Gloves: 524, LeftVambrace: 525, RightVambrace: 526,
});

const blunt = [W.Mace, W.Flail, W.Warhammer];
const bluntWnew = [W.Mace, W.Flail, W.Warhammer, RRI_ITEM.LightFlail];
const axe = [W['Battle Axe'], W['War Axe']];
const axeWnew = [W['Battle Axe'], W['War Axe'], RRI_ITEM.ArchersAxe];
const newWeapons = () => rriModule('newWeapons');
const newArmor = () => rriModule('newArmor');

// Matches UnityEngine.Random.Range(lo, hi) for integers: hi is exclusive.
const range = (rolls, lo, hi) => lo + Math.floor(rolls() * (hi - lo));
const coinFlip = (rolls) => range(rolls, 0, 2) === 0;
const oneOf = (rolls, array) => array[range(rolls, 0, array.length)];
const randomShield = (rolls) => range(rolls, A.Buckler, A.Round_Shield + 1);
const randomLongblade = (rolls) => range(rolls, W.Broadsword, W.Longsword + 1);
const randomBlunt = (rolls) => oneOf(rolls, newWeapons() ? bluntWnew : blunt);
const randomAxe = (rolls) => oneOf(rolls, newWeapons() ? axeWnew : axe);
const randomAxeOrBlade = (rolls) => (coinFlip(rolls) ? randomAxe(rolls) : randomLongblade(rolls));
const randomBluntOrBlade = (rolls) => (coinFlip(rolls) ? randomBlunt(rolls) : randomLongblade(rolls));
function randomBigWeapon(rolls) {
  let weapon = range(rolls, W.Claymore, W['War Axe'] + 1);
  if (weapon === W['Dai-Katana'] && dice100(90, rolls())) weapon = W.Claymore;
  return weapon;
}
const randomBow = (rolls) => range(rolls, W['Short Bow'], W['Long Bow'] + 1);
const randomShortblade = (rolls) => (dice100(40, rolls()) ? W.Shortsword : range(rolls, W.Dagger, W.Wakazashi + 1));
function secondaryWeapon(rolls) {
  switch (range(rolls, 0, 4)) {
    case 0: return W.Dagger;
    case 1: return W.Shortsword;
    case 2: return newWeapons() ? RRI_ITEM.ArchersAxe : W['Short Bow'];
    default: return W['Short Bow'];
  }
}
function getCombatClassWeapon(enemyType, rolls) {
  switch (enemyType) {
    case M.Barbarian: return randomBigWeapon(rolls);
    case M.Knight: return coinFlip(rolls) ? randomBlunt(rolls) : randomLongblade(rolls);
    case M.Knight_CityWatch: return randomAxeOrBlade(rolls);
    case M.Monk: return randomBlunt(rolls);
    default: return randomLongblade(rolls);
  }
}
const isFighter = (mob) => mob === M.Knight || mob === M.Warrior;

export function getArmorTemplateIndex(slot, prefChain = false, prefLeather = false, rolls = Math.random) {
  const rand = (prefChain || prefLeather) && newArmor();
  switch (slot) {
    case 'ChestArmor': return rand ? (coinFlip(rolls) ? A.Cuirass : (prefChain ? RRI_ITEM.Hauberk : RRI_ITEM.Jerkin)) : A.Cuirass;
    case 'LegsArmor': return rand ? (coinFlip(rolls) ? A.Greaves : (prefChain ? RRI_ITEM.Chausses : RRI_ITEM.Cuisse)) : A.Greaves;
    case 'LeftArm': return rand ? (coinFlip(rolls) ? A.Left_Pauldron : (prefChain ? RRI_ITEM.LeftSpaulder : RRI_ITEM.LeftVambrace)) : A.Left_Pauldron;
    case 'RightArm': return rand ? (coinFlip(rolls) ? A.Right_Pauldron : (prefChain ? RRI_ITEM.RightSpaulder : RRI_ITEM.RightVambrace)) : A.Right_Pauldron;
    case 'Feet': return rand ? (coinFlip(rolls) ? A.Boots : (prefChain ? RRI_ITEM.Sollerets : RRI_ITEM.Boots)) : A.Boots;
    case 'Gloves': return rand ? (coinFlip(rolls) ? A.Gauntlets : RRI_ITEM.Gloves) : A.Gauntlets;
    case 'Head': return rand ? (coinFlip(rolls) ? A.Helm : RRI_ITEM.Helmet) : A.Helm;
    default: return -1;
  }
}

const mintWeapon = (templateIndex, material, rolls) => {
  if (customItemClass(templateIndex)) {
    return mintCondition(setItemFields({ group: 'Weapons', templateIndex, material, flags: 0, value: itemBaseValue({ group: 'Weapons', templateIndex, material }) }));
  }
  return createWeapon(templateIndex, material, rolls);
};
const mintArmor = (templateIndex, material) =>
  mintCondition(setItemFields({ group: 'Armor', templateIndex, material }));
const mintClothing = (female, templateIndex, rolls) => {
  const variants = templateByIndex(templateIndex)?.variants ?? 0;
  return mintCondition(setItemFields({
    group: female ? 'WomensClothing' : 'MensClothing', templateIndex,
    variant: variants > 0 ? range(rolls, 0, variants) : 0, dye: DYE_COLORS.Blue,
  }));
};
function wornCondition(item, rolls) {
  if (item.group === 'Armor' || item.group === 'Weapons' || item.group === 'MensClothing' || item.group === 'WomensClothing') {
    item.currentCondition = Math.trunc((0.3 + rolls() * (0.75 - 0.3)) * (item.maxCondition ?? 0));
    // A departure from the mod: every worn kit piece carries the found mark (foundMark.js).
    markFound(item);
  }
  return item;
}

export const RRI_READ = Object.freeze({
  classOf: (entity) => entity.mobileType,
  armorTemplate: (slot, { prefChain, prefLeather }, rolls) => getArmorTemplateIndex(slot, prefChain, prefLeather, rolls),
  unknownArmed: false,
  equipsSecondary: false,
});

export function assignRriEnemyEquipment(entity, variant, playerLevel, { player = null, rolls = Math.random, read = RRI_READ } = {}) {
  if (!rriModule('realisticEnemyEquipment')) return null;
  const mob = entity.mobileType;
  if (!entity.isClass) {
    const eq = rollEnemyEquipment(entity, variant, playerLevel, rolls);
    // ItemHelper's arm rolls its poison before ConvertOrcish runs, so the poison's draws come first.
    // poisonRolled tells equipEnemy not to roll it again.
    const poison = eq.rightHand ? rollEnemyWeaponPoison(entity.mobileType, playerLevel, rolls) : null;
    if (poison != null) eq.rightHand.poisonType = poison;
    convertOrcish(entity, eq, rolls);
    return { ...eq, armorValues: enemyArmorValues(entity, eq.armorPieces), poisonRolled: true };
  }
  const items = [];
  const table = {};
  const slots = equipTableOf(table);
  const add = (item, equip = false) => {
    wornCondition(item, rolls);
    items.push(item);
    const slot = equip ? getEquipSlot(table, item) : EQUIP_SLOTS.None;
    if (slot !== EQUIP_SLOTS.None) {
      for (const s of wearLeavers(table, item, slot)) slots[s] = null;
      slots[slot] = item;
    }
    return item;
  };
  const female = player?.gender === 'female';
  const itemLevel = mob === M.Knight_CityWatch ? 1 : (entity.level ?? playerLevel);
  const chance = 50;
  let armored = 100;
  let prefChain = false;
  let prefLeather = false;
  const cls = read.classOf(entity);

  switch (cls) {
    case M.Archer:
    case M.Ranger: {
      add(createWeapon(randomBow(rolls), randomMaterial(itemLevel, rolls), rolls), true);
      add(mintWeapon(mob === M.Ranger ? randomLongblade(rolls) : randomShortblade(rolls), randomMaterial(itemLevel, rolls), rolls));
      const arrowPile = createWeapon(ARROW_TEMPLATE, WEAPON_MATERIALS.Iron, rolls);
      arrowPile.stackCount = range(rolls, 4, 17);
      items.push(arrowPile);
      armored = 60;
      prefChain = true;
      break;
    }
    case M.Barbarian:
    case M.Knight:
    case M.Knight_CityWatch:
    case M.Monk:
    case M.Spellsword:
    case M.Warrior:
    case M.Rogue:
      if (variant === 0) {
        add(mintWeapon(getCombatClassWeapon(cls, rolls), randomMaterial(itemLevel, rolls), rolls), true);
        if (dice100(chance, rolls())) add(mintArmor(randomShield(rolls), randomArmorMaterial(itemLevel, rolls)), true);
        else if (dice100(chance, rolls())) add(mintWeapon(secondaryWeapon(rolls), randomMaterial(itemLevel, rolls), rolls), read.equipsSecondary);
        if (!isFighter(cls)) armored = 80;
      } else {
        add(mintWeapon(randomBigWeapon(rolls), randomMaterial(itemLevel, rolls), rolls), true);
        if (!isFighter(cls)) { prefChain = true; armored = 90; }
      }
      if (cls === M.Barbarian) { armored = 30; prefLeather = true; }
      break;
    case M.Mage:
    case M.Sorcerer:
    case M.Healer:
      add(createWeapon(W.Staff, randomMaterial(itemLevel, rolls), rolls), true);
      if (dice100(chance, rolls())) add(mintWeapon(randomShortblade(rolls), randomMaterial(itemLevel, rolls), rolls));
      add(mintClothing(female, female ? WOMENS_PLAIN_ROBES : MENS_PLAIN_ROBES, rolls), true);
      armored = 35;
      prefLeather = true;
      break;
    case M.Assassin:
      add(mintWeapon(randomAxeOrBlade(rolls), randomMaterial(itemLevel, rolls), rolls), true);
      add(mintWeapon(randomAxeOrBlade(rolls), randomMaterial(itemLevel, rolls), rolls));
      armored = 65;
      prefChain = true;
      break;
    case M.Battlemage:
      add(mintWeapon(randomBluntOrBlade(rolls), randomMaterial(itemLevel, rolls), rolls), true);
      add(mintWeapon(randomBluntOrBlade(rolls), randomMaterial(itemLevel, rolls), rolls));
      armored = 75;
      prefChain = true;
      break;
    case M.Acrobat:
    case M.Bard:
    case M.Burglar:
    case M.Nightblade:
    case M.Thief:
      add(mintWeapon(randomShortblade(rolls), randomMaterial(itemLevel, rolls), rolls), true);
      if (dice100(chance, rolls())) add(mintWeapon(secondaryWeapon(rolls), randomMaterial(Math.trunc(itemLevel / 2), rolls), rolls), read.equipsSecondary);
      armored = 50;
      prefLeather = true;
      if (mob === M.Nightblade) prefChain = true;
      break;
    default:
      if (read.unknownArmed) {
        add(mintWeapon(randomLongblade(rolls), randomMaterial(itemLevel, rolls), rolls), true);
        armored = 50;
      }
      break;
  }

  const armor = (slot) => {
    const templateIndex = read.armorTemplate(slot, { prefChain, prefLeather, career: entity.career ?? null }, rolls);
    // Rolled whether or not a piece is minted, as it is an argument of CreateArmor in the mod.
    const material = randomArmorMaterial(itemLevel, rolls);
    if (templateIndex !== -1) add(mintArmor(templateIndex, material), true);
  };
  if (dice100(armored, rolls())) armor('ChestArmor');
  armored -= 10;
  if (dice100(armored, rolls()) || (mob === M.Barbarian && dice100(armored + 50, rolls()))) armor('LegsArmor');
  armored -= 10;
  if (dice100(armored, rolls())) armor('Feet');
  armored -= 10;
  if (dice100(armored, rolls()) || (mob === M.Barbarian && dice100(armored + 50, rolls()))) armor('Head');
  armored -= 20;
  if (armored > 0) {
    if (dice100(armored, rolls())) armor('RightArm');
    if (dice100(armored, rolls())) armor('LeftArm');
    if (dice100(armored, rolls())) armor('Gloves');
  }
  const worn = items.filter((it) => slots.includes(it));
  const armorPieces = worn.filter((it) => it.group === 'Armor')
    .map((item) => ({ piece: item.templateIndex, material: item.material, shield: item.templateIndex >= A.Buckler && item.templateIndex <= A.Tower_Shield, item }));
  return { rightHand: slots[EQUIP_SLOTS.RightHand], leftHand: slots[EQUIP_SLOTS.LeftHand], armorPieces, armorValues: enemyArmorValues(entity, armorPieces), items, worn, poisonClass: cls };
}

export function convertOrcish(entity, eq, rolls = Math.random) {
  if (entity.basics?.team !== 'Orcs' || !dice100(80, rolls())) return eq;
  const convertFrom = entity.mobileType === M.OrcWarlord ? WEAPON_MATERIALS.Mithril : WEAPON_MATERIALS.Ebony;
  const orcish = (material) => (material & 0xFF) >= convertFrom;
  for (const weapon of [eq.rightHand, eq.leftHand]) {
    if (!weapon || weapon.group !== 'Weapons' || !orcish(weapon.material ?? 0)) continue;
    weapon.material = WEAPON_MATERIALS.Orcish;
    delete weapon.maxCondition; mintCondition(weapon);
    weapon.value = itemBaseValue(weapon);
  }
  for (const a of eq.armorPieces) {
    // Leather (0x0000) and chain (0x0100) read 0 under the mask, so only plate converts.
    if (!orcish(a.material ?? 0)) continue;
    a.material = ARMOR_MATERIALS.Orcish;
    if (a.item) { a.item.material = ARMOR_MATERIALS.Orcish; delete a.item.maxCondition; mintCondition(a.item); a.item.value = itemBaseValue(a.item); }
  }
  // Loot table items are already in the enemy's items before equipment is assigned, so they convert too.
  for (const it of entity.items ?? []) {
    if (it.group !== 'Weapons' && it.group !== 'Armor') continue;
    if (!orcish(it.material ?? 0)) continue;
    it.material = it.group === 'Weapons' ? WEAPON_MATERIALS.Orcish : ARMOR_MATERIALS.Orcish;
    delete it.maxCondition; mintCondition(it); it.value = itemBaseValue(it);
  }
  return eq;
}
