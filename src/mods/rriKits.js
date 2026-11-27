// Roleplay & Realism: Items kits: starting equipment and spellbook by skill, the shelf hooks,
// and the bandage use handler. This module mints and equips items.

import { mintCondition, setItemFields, templateByIndex, itemValueOf } from '../items/itemTemplates.js';
import { addItem, addGoldPieces } from '../items/inventory.js';
import { createWeapon } from '../combat/enemyEquipment.js';
import { createRandomPotion, createRandomOfGroup } from '../items/loot.js';
import { createRandomBook } from '../items/books.js';
import { randomizeArmorVariant } from '../trade/shopStock.js';
import { CLOTHING_DYES, DYE_COLORS } from '../characters/dyes.js';
import { WEAPON_MATERIALS, WEAPONS } from '../characters/weapons.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { SKILLS, skillValue, tallySkill } from '../characters/skills.js';
import { MATERIAL_BITS } from '../characters/specialAdvantages.js';
import { getBool } from '../platform/settings.js';
import { addSurvivalProvisions } from '../characters/startingGear.js';
import { classicCastingCost } from '../magic/spellcost.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { LOOT_CONTAINER_TYPES } from '../world/sceneCache.js';
import { rriModule } from './rriItems.js';
import { liveStat } from '../characters/statMods.js';
import { equipTableOf, equipItem } from '../characters/equip.js';
import { getItemHands, ITEM_HANDS } from '../characters/equipTable.js';
import { isQuestionsDagger, QUESTIONS_DAGGER_WEAR } from '../items/conditionRepair.js';
import { markFound } from '../items/foundMark.js';
import { EQUIP_SLOTS } from '../characters/paperdoll.js';
import { WEAPON_TYPES } from '../combat/fpsWeapon.js';
import { techniqueFamily } from '../combat/technique/techniqueRoster.js';
import {
  BANDAGE_TEMPLATE, bandageHeal, shelfBandageStack, storeQualityItemCondition, storeQualityOn,
  alchemistPotionCount, alchemistPotionsOn, weaponBalanceOn, rriMeleeWeaponAnimTime,
} from './rriRealism.js';

export function rriAnimTimeOverride(liveSpeed, ctx) {
  if (!weaponBalanceOn() || !ctx?.entity) return null;
  const slots = equipTableOf(ctx.entity);
  const weapon = slots?.[ctx.usingRightHand === false ? EQUIP_SLOTS.LeftHand : EQUIP_SLOTS.RightHand] ?? null;
  const melee = ctx.weaponType === WEAPON_TYPES.Melee || !weapon;
  return rriMeleeWeaponAnimTime({
    liveSpeed, liveStrength: liveStat(ctx.entity, 'strength'),
    weaponWeight: melee ? null : (templateByIndex(weapon.templateIndex)?.baseWeight ?? 0), melee,
    weaponType: ctx.weaponType, twoHanded: !melee && getItemHands(weapon) === ITEM_HANDS.Both,
    shortBlade: !melee && techniqueFamily(weapon) === 'shortBlade',
  });
}

export const KIT = Object.freeze({
  Spellbook: 132, Torch: 247, Candle: 253,
  Cuirass: 102, Gauntlets: 103, Greaves: 104, Right_Pauldron: 106, Helm: 107, Boots: 108,
  MensShoes: 147, MensCasualPants: 151, MensCasualCloak: 154, MensKhajiitSuit: 156, MensFormalTunic: 159, MensLoincloth: 162, MensShortShirt: 165,
  WomensShoes: 186, WomensCasualPants: 190, WomensCasualCloak: 191, WomensKhajiitSuit: 193, WomensEveningGown: 195, WomensLoincloth: 199, WomensShortShirtClosed: 206,
});

const range = (rolls, lo, hi) => lo + Math.floor(rolls() * (hi - lo));
const dice100 = (chance, rolls) => 1 + Math.floor(rolls() * 100) <= chance;
const mint = (item) => mintCondition(setItemFields(item));
function addOrEquipWornItem(entity, item, equip, rolls) {
  addItem(entity.items, item);
  if (item.group === 'Armor' || item.group === 'Weapons' || item.group === 'MensClothing' || item.group === 'WomensClothing') {
    item.currentCondition = Math.trunc((0.3 + rolls() * (0.75 - 0.3)) * (item.maxCondition ?? 0));
    markFound(item);
  }
  if (equip) equipItem(entity, item);
  return item;
}
function clothing(female, templateIndex, rolls, { variant = -1, dye = DYE_COLORS.Blue } = {}) {
  const variants = templateByIndex(templateIndex)?.variants ?? 0;
  return mint({ group: female ? 'WomensClothing' : 'MensClothing', templateIndex, variant: variant < 0 ? (variants > 0 ? range(rolls, 0, variants) : 0) : variant, dye });
}
function armor(templateIndex, material, rolls, variant = -1) {
  return mint({ group: 'Armor', templateIndex, material, variant: variant < 0 ? randomizeArmorVariant(templateIndex, material, rolls) : variant });
}
const pick = (list, rolls) => list[range(rolls, 0, list.length)];
const randomOf = (group, rolls) => mint(createRandomOfGroup(group, rolls));

const materialForbidden = (career, bit) => ((career?.forbiddenMaterialsFlags ?? 0) & bit) === bit;
const armorForbidden = (career, bit) => ((((career?.weaponArmorShieldsBitfield ?? 0) >>> 6) & 0x07) & bit) === bit;
const ARMOR_FLAG_LEATHER = 1, ARMOR_FLAG_CHAIN = 2;

export function assignSkillItems(entity, skill, rolls = Math.random) {
  const career = entity.career ?? {};
  const female = entity.gender === 'female';
  const luck = career.luck ?? 50;
  const upgrade = dice100(Math.trunc(luck / (luck < 56 ? 2 : 1)), rolls);
  let weaponMaterial = WEAPON_MATERIALS.Iron;
  if ((upgrade && !materialForbidden(career, MATERIAL_BITS.steel)) || materialForbidden(career, MATERIAL_BITS.iron)) weaponMaterial = WEAPON_MATERIALS.Steel;
  let armorMaterial = ARMOR_MATERIAL.Leather;
  if ((upgrade && !armorForbidden(career, ARMOR_FLAG_CHAIN)) || armorForbidden(career, ARMOR_FLAG_LEATHER)) armorMaterial = ARMOR_MATERIAL.Chain;
  const worn = (item, equip = false) => addOrEquipWornItem(entity, item, equip, rolls);
  const items = entity.items;
  switch (skill) {
    case SKILLS.Archery: {
      worn(createWeapon(WEAPONS.Short_Bow, weaponMaterial, rolls));
      const arrowPile = createWeapon(WEAPONS.Arrow, WEAPON_MATERIALS.Iron, rolls);
      arrowPile.stackCount = 30;
      addItem(items, arrowPile);
      return;
    }
    case SKILLS.Axe: worn(createWeapon(pick(rriModule('newWeapons') ? [WEAPONS.Battle_Axe, WEAPONS.War_Axe, 513] : [WEAPONS.Battle_Axe, WEAPONS.War_Axe], rolls), weaponMaterial, rolls)); return;
    case SKILLS.Backstabbing: worn(armor(KIT.Right_Pauldron, armorMaterial, rolls)); return;
    case SKILLS.BluntWeapon: worn(createWeapon(pick(rriModule('newWeapons') ? [WEAPONS.Mace, WEAPONS.Flail, WEAPONS.Warhammer, 514] : [WEAPONS.Mace, WEAPONS.Flail, WEAPONS.Warhammer], rolls), weaponMaterial, rolls)); return;
    case SKILLS.Climbing: worn(armor(KIT.Helm, armorMaterial, rolls, -1)); return;
    case SKILLS.CriticalStrike: worn(armor(KIT.Greaves, armorMaterial, rolls)); return;
    case SKILLS.Dodging: worn(clothing(female, female ? KIT.WomensCasualCloak : KIT.MensCasualCloak, rolls)); return;
    case SKILLS.Etiquette: worn(clothing(female, female ? KIT.WomensEveningGown : KIT.MensFormalTunic, rolls)); return;
    case SKILLS.HandToHand: worn(armor(KIT.Gauntlets, armorMaterial, rolls)); return;
    case SKILLS.Jumping: worn(armor(KIT.Boots, armorMaterial, rolls)); return;
    case SKILLS.Lockpicking: addItem(items, createRandomPotion(rolls)); return;
    case SKILLS.LongBlade: worn(createWeapon(dice100(50, rolls) ? WEAPONS.Saber : WEAPONS.Broadsword, weaponMaterial, rolls)); return;
    case SKILLS.Medical: {
      const bandages = mint({ group: 'UselessItems2', templateIndex: BANDAGE_TEMPLATE });
      bandages.stackCount = 4;
      addItem(items, bandages);
      return;
    }
    case SKILLS.Mercantile: addGoldPieces(entity, range(rolls, luck, luck * 4)); return;
    case SKILLS.Pickpocket: addItem(items, randomOf('Gems', rolls)); return;
    case SKILLS.Running: worn(clothing(female, female ? KIT.WomensShoes : KIT.MensShoes, rolls)); return;
    case SKILLS.ShortBlade: worn(createWeapon(dice100(50, rolls) ? WEAPONS.Shortsword : WEAPONS.Tanto, weaponMaterial, rolls)); return;
    case SKILLS.Stealth: worn(clothing(female, female ? KIT.WomensKhajiitSuit : KIT.MensKhajiitSuit, rolls)); return;
    case SKILLS.Streetwise: worn(armor(KIT.Cuirass, armorMaterial, rolls)); return;
    case SKILLS.Swimming: addItem(items, clothing(female, female ? KIT.WomensLoincloth : KIT.MensLoincloth, rolls)); return;
    case SKILLS.Daedric: case SKILLS.Dragonish: case SKILLS.Giantish: case SKILLS.Harpy: case SKILLS.Impish: case SKILLS.Orcish:
      addItem(items, createRandomBook(rolls));
      for (let i = 0; i < 4; i++) addItem(items, randomOf('CreatureIngredients1', rolls));
      return;
    case SKILLS.Centaurian: case SKILLS.Nymph: case SKILLS.Spriggan:
      addItem(items, createRandomBook(rolls));
      for (let i = 0; i < 4; i++) addItem(items, randomOf('PlantIngredients1', rolls));
      return;
    default: return;
  }
}


export function assignSkillEquipment(entity, { rolls = Math.random, torchesFromItems = getBool('Enhancements', 'PlayerTorchFromItems') } = {}) {
  entity.items = entity.items ?? [];
  const before = entity.items.length;
  const career = entity.career ?? {};
  const female = entity.gender === 'female';
  for (const dagger of entity.items) {
    if (isQuestionsDagger(dagger)) {
      mintCondition(dagger);
      dagger.currentCondition = Math.trunc(dagger.maxCondition * QUESTIONS_DAGGER_WEAR);
      markFound(dagger);
    }
  }
  for (const skill of career.primarySkills ?? []) assignSkillItems(entity, skill, rolls);
  for (const skill of career.majorSkills ?? []) assignSkillItems(entity, skill, rolls);
  const shortShirt = clothing(female, female ? KIT.WomensShortShirtClosed : KIT.MensShortShirt, rolls, { variant: 0, dye: CLOTHING_DYES[range(rolls, 0, CLOTHING_DYES.length)] });
  const casualPants = clothing(female, female ? KIT.WomensCasualPants : KIT.MensCasualPants, rolls);
  addOrEquipWornItem(entity, shortShirt, true, rolls);
  addOrEquipWornItem(entity, casualPants, true, rolls);
  addItem(entity.items, mint({ group: 'MiscItems', templateIndex: KIT.Spellbook }));
  addGoldPieces(entity, range(rolls, 5, career.luck ?? 50));
  addItem(entity.items, createWeapon(WEAPONS.Dagger, WEAPON_MATERIALS.Iron, rolls));
  if (torchesFromItems) {
    for (let i = 0; i < 6; i++) addItem(entity.items, mint({ group: 'UselessItems2', templateIndex: KIT.Torch }));
    for (let i = 0; i < 4; i++) addItem(entity.items, mint({ group: 'UselessItems2', templateIndex: KIT.Candle }));
  }
  const added = entity.items.slice(before);
  addSurvivalProvisions(entity, added);
  return added;
}

const TARGET = Object.freeze({ CasterOnly: 0, ByTouch: 1, SingleTargetAtRange: 2 });
const ELEMENT = Object.freeze({ Shock: 3, Magic: 4 });
const EFFECT_KEY = Object.freeze({
  DamageHealth: [4, 0], Slowfall: [25, 255], LightNormal: [15, 255], CreateItem: [2, 255],
  HealHealth: [10, 8], HealFatigue: [10, 9], Levitate: [14, 255], Open: [17, 255],
});
const UNUSED_EFFECT = Object.freeze({ type: -1, subType: -1, durationBase: 0, durationMod: 0, durationPerLevel: 0, chanceBase: 0, chanceMod: 0, chancePerLevel: 0, magnitudeBaseLow: 0, magnitudeBaseHigh: 0, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 0 });
const effect = (key, { duration = [0, 0, 0], chance = [0, 0, 0], magnitude = [0, 0, 0, 0, 0] } = {}) => ({
  type: EFFECT_KEY[key][0], subType: EFFECT_KEY[key][1],
  durationBase: duration[0], durationMod: duration[1], durationPerLevel: duration[2],
  chanceBase: chance[0], chanceMod: chance[1], chancePerLevel: chance[2],
  magnitudeBaseLow: magnitude[0], magnitudeBaseHigh: magnitude[1], magnitudeLevelBase: magnitude[2], magnitudeLevelHigh: magnitude[3], magnitudePerLevel: magnitude[4],
});
export const RRI_SPELL_INDEX_BASE = 990;
function spell(i, name, target, element, icon, effects) {
  const rec = { effects: [...effects, UNUSED_EFFECT, UNUSED_EFFECT].slice(0, 3).map((e) => ({ ...e })), element, rangeType: target, name, icon, index: RRI_SPELL_INDEX_BASE + i, rri: true };
  rec.cost = classicCastingCost(rec);
  return Object.freeze(rec);
}
export const RRI_SPELLS = Object.freeze({
  minorShock: spell(0, 'Minor Shock', TARGET.ByTouch, ELEMENT.Shock, 37, [effect('DamageHealth', { magnitude: [2, 10, 1, 2, 1] })]),
  arcaneArrow: spell(1, 'Arcane Arrow', TARGET.SingleTargetAtRange, ELEMENT.Magic, 57, [effect('DamageHealth', { magnitude: [5, 6, 1, 1, 2] })]),
  gentleFall: spell(2, 'Gentle Fall', TARGET.CasterOnly, ELEMENT.Magic, 31, [effect('Slowfall', { duration: [2, 1, 2] })]),
  candle: spell(3, 'Candle', TARGET.CasterOnly, ELEMENT.Magic, 22, [effect('LightNormal', { duration: [4, 4, 1] })]),
  knickKnack: spell(4, 'Knick-Knack', TARGET.CasterOnly, ELEMENT.Magic, 26, [effect('CreateItem', { duration: [4, 1, 2] })]),
  salveBruise: spell(5, 'Salve Bruise', TARGET.CasterOnly, ELEMENT.Magic, 13, [effect('HealHealth', { magnitude: [3, 6, 0, 0, 1] })]),
  smellingSalts: spell(6, 'Smelling Salts', TARGET.CasterOnly, ELEMENT.Magic, 10, [effect('HealFatigue', { magnitude: [3, 6, 0, 0, 1] })]),
  rise: spell(7, 'Rise', TARGET.CasterOnly, ELEMENT.Magic, 13, [effect('Levitate', { duration: [1, 1, 2] })]),
  knock: spell(8, 'Knock', TARGET.CasterOnly, ELEMENT.Magic, 3, [effect('Open', { duration: [1, 1, 0], chance: [8, 0, 2] })]),
});

export function assignSkillSpells(spells, skill, primary, spellsByIndex) {
  const classic = (id) => { const sp = spellsByIndex?.get?.(id); if (sp) spells.push(sp); };
  switch (skill) {
    case SKILLS.Alteration:
      spells.push(RRI_SPELLS.gentleFall);
      if (primary) classic(38);
      return;
    case SKILLS.Destruction:
      spells.push(RRI_SPELLS.arcaneArrow);
      if (primary) spells.push(RRI_SPELLS.minorShock);
      return;
    case SKILLS.Illusion:
      spells.push(RRI_SPELLS.candle);
      if (primary) classic(44);
      return;
    case SKILLS.Mysticism:
      spells.push(RRI_SPELLS.knock);
      spells.push(RRI_SPELLS.knickKnack);
      if (primary) { classic(1); classic(94); }
      return;
    case SKILLS.Restoration:
      spells.push(RRI_SPELLS.salveBruise);
      if (primary) { spells.push(RRI_SPELLS.smellingSalts); classic(97); }
      return;
    case SKILLS.Thaumaturgy:
      classic(2);
      if (primary) spells.push(RRI_SPELLS.rise);
      return;
    default: return;
  }
}
export function assignSkillSpellbook(career, spellsByIndex) {
  const spells = [];
  for (const skill of career?.primarySkills ?? []) assignSkillSpells(spells, skill, true, spellsByIndex);
  for (const skill of career?.majorSkills ?? []) assignSkillSpells(spells, skill, false, spellsByIndex);
  return spells;
}

export function onShopShelfStocked(items, { buildingType, quality = 0, containerType = LOOT_CONTAINER_TYPES.ShopShelves } = {}, { rolls = Math.random, randomPotion = createRandomPotion } = {}) {
  if (!Array.isArray(items) || containerType !== LOOT_CONTAINER_TYPES.ShopShelves) return items;
  if (rriModule('bandaging')) {
    const bandage = items.find((it) => it?.group === 'UselessItems2' && it.templateIndex === BANDAGE_TEMPLATE);
    if (bandage) bandage.stackCount = shelfBandageStack(quality, rolls);
  }
  if (storeQualityOn()) storeQualityItemCondition(items, quality, rolls);
  if (alchemistPotionsOn() && buildingType === BUILDING_TYPES.Alchemist) {
    let numPotions = alchemistPotionCount(quality, rolls);
    while (numPotions > 0) {
      const item = randomPotion(rolls);
      item.value = itemValueOf(item) * 2;
      items.push(item);
      numPotions--;
    }
  }
  return items;
}

export function useBandage(item, collection, { entity = null } = {}) {
  if (!rriModule('bandaging')) return null;
  if (!collection || !entity) return { kind: 'bandaged', healed: 0 };
  const medical = skillValue(entity, SKILLS.Medical);
  const heal = bandageHeal(medical, entity.maxHealth ?? 0);
  const i = collection.indexOf(item);
  if (i >= 0) { if ((item.stackCount ?? 1) > 1) item.stackCount--; else collection.splice(i, 1); }
  entity.health = Math.min(entity.maxHealth ?? entity.health ?? 0, (entity.health ?? 0) + heal);
  tallySkill(entity, SKILLS.Medical, 1);
  return { kind: 'bandaged', healed: heal };
}
useBandage.usable = () => rriModule('bandaging');
