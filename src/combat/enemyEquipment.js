// Enemy starting equipment and armor values, ported from Daggerfall Unity (MIT, Daggerfall Workshop).

import { mintCondition, templateByIndex, itemBaseValue, setItemFields, materialValue } from '../items/itemTemplates.js';
import { dice100, formulaOverride } from './formulas.js';
import { weaponMinDamage, weaponMaxDamage } from '../characters/weapons.js';
import { materialArmorValue, itemArmorValue, BODY_PARTS } from '../items/armorMaterials.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobileTypes.js';
import { ARROW_TEMPLATE } from '../items/inventory.js';
import { customItemClass } from '../mods/rriItems.js';

export { materialArmorValue };

export const WEAPONS_ENUM = Object.freeze({
  Dagger: 113, Tanto: 114, Staff: 115, Shortsword: 116, Wakazashi: 117,
  Broadsword: 118, Saber: 119, Longsword: 120, Katana: 121, Claymore: 122,
  'Dai-Katana': 123, Mace: 124, Flail: 125, Warhammer: 126,
  'Battle Axe': 127, 'War Axe': 128, 'Short Bow': 129, 'Long Bow': 130,
});
const WEAPON_BY_INDEX = Object.freeze(Object.fromEntries(Object.entries(WEAPONS_ENUM).map(([k, v]) => [v, k])));

export const ARMOR_ENUM = Object.freeze({
  Cuirass: 102, Gauntlets: 103, Greaves: 104, Left_Pauldron: 105,
  Right_Pauldron: 106, Helm: 107, Boots: 108, Buckler: 109,
  Round_Shield: 110, Kite_Shield: 111, Tower_Shield: 112,
});
export { BODY_PARTS } from '../items/armorMaterials.js';
// Body parts: 0 Head, 1 RightArm, 2 LeftArm, 3 Chest, 4 Hands, 5 Legs, 6 Feet.
const PIECE_BODY_PART = Object.freeze({
  107: 0,
  106: 1,
  105: 2,
  102: 3,
  103: 4,
  104: 5,
  108: 6,
});
const SHIELD_VALUE = Object.freeze({ 109: 1, 110: 2, 111: 3, 112: 4 });
const SHIELD_PARTS = Object.freeze({
  109: [2, 4],
  110: [2, 4, 5],
  111: [2, 4, 5],
  112: [0, 2, 4, 5],
});

export const shieldProtectedBodyParts = (templateIndex) => SHIELD_PARTS[templateIndex] ?? [];

export const MATERIALS_BY_MODIFIER = Object.freeze([64, 128, 10, 21, 13, 8, 5, 3, 2, 5]);
export function randomMaterial(playerLevel, rolls = Math.random) {
  const o = formulaOverride('randomMaterial')?.(playerLevel, rolls);
  if (o !== undefined) return o;
  let levelModifier = playerLevel - 10;
  levelModifier *= levelModifier >= 0 ? 2 : 4;
  const randomModifier = Math.floor(rolls() * 256);
  let combined = Math.max(0, Math.min(256, levelModifier + randomModifier));
  let material = 0;
  while (MATERIALS_BY_MODIFIER[material] < combined) {
    combined -= MATERIALS_BY_MODIFIER[material++];
  }
  return material;
}

export const ARMOR_MATERIAL = Object.freeze({ Leather: 0x0000, Chain: 0x0100, PLATE_BASE: 0x0200 });
export function randomArmorMaterial(playerLevel, rolls = Math.random) {
  const o = formulaOverride('randomArmorMaterial')?.(playerLevel, rolls);
  if (o !== undefined) return o;
  const roll = 1 + Math.floor(rolls() * 100);
  if (roll >= 70) {
    if (roll >= 90) return ARMOR_MATERIAL.PLATE_BASE + randomMaterial(playerLevel, rolls);
    return ARMOR_MATERIAL.Chain;
  }
  return ARMOR_MATERIAL.Leather;
}

export function createWeapon(templateIndex, material, rolls = Math.random) {
  // DFU's arrow arm skips the material pass and leaves the arrow at condition 0, as classic does.
  if (templateIndex === ARROW_TEMPLATE) {
    return {
      group: 'Weapons', name: templateByIndex(ARROW_TEMPLATE)?.name ?? 'Arrow',
      templateIndex: ARROW_TEMPLATE, material: 0, flags: 0,
      stackCount: 1 + Math.floor(rolls() * 20),
      maxCondition: templateByIndex(ARROW_TEMPLATE)?.hitPoints ?? 0,
      currentCondition: 0,
      value: itemBaseValue({ group: 'Weapons', templateIndex: ARROW_TEMPLATE, material: 0 }),
    };
  }
  return weaponOfMaterial(templateIndex, material);
}

export function weaponOfMaterial(templateIndex, material) {
  const t = templateByIndex(templateIndex);
  const name = WEAPON_BY_INDEX[templateIndex] ?? t?.name;
  return mintCondition({
    name, templateIndex, group: 'Weapons', material,
    // DFU mints no weapon with flag 0x10, so every weapon's damage is halved against a Skeletal Warrior.
    flags: 0,
    value: t ? materialValue(t.basePrice, material) : 1,
    minDamage: weaponMinDamage(templateIndex), maxDamage: weaponMaxDamage(templateIndex),
  });
}

export const armorOfMaterial = (templateIndex, material, variant = null) =>
  mintCondition(setItemFields({ group: 'Armor', templateIndex, material, ...(variant != null ? { variant } : {}) }));

export { ARROW_TEMPLATE };

/** @returns { rightHand, leftHand, armorPieces, armorValues } */
export function assignEnemyEquipment(entity, variant, playerLevel, rolls = Math.random) {
  const eq = rollEnemyEquipment(entity, variant, playerLevel, rolls);
  return { ...eq, armorValues: enemyArmorValues(entity, eq.armorPieces) };
}

export function rollEnemyEquipment(entity, variant, playerLevel, rolls = Math.random) {
  const range = (lo, hi) => lo + Math.floor(rolls() * (hi + 1 - lo));
  let itemLevel = playerLevel;
  if (entity.isClass && entity.mobileType === KNIGHT_CITY_WATCH) itemLevel = 1;
  let rightHand = null, leftHand = null;
  const armorPieces = [];
  let chance = 0;
  if (variant === 0) {
    rightHand = createWeapon(range(WEAPONS_ENUM.Broadsword, WEAPONS_ENUM.Longsword), randomMaterial(itemLevel, rolls));
    chance = 50;
    const shield = range(ARMOR_ENUM.Buckler, ARMOR_ENUM.Round_Shield);
    if (dice100(chance, rolls())) {
      leftHand = { templateIndex: shield, shield: true };
      armorPieces.push({ piece: shield, material: randomArmorMaterial(itemLevel, rolls), shield: true });
    } else if (dice100(chance, rolls())) {
      leftHand = createWeapon(range(WEAPONS_ENUM.Dagger, WEAPONS_ENUM.Shortsword), randomMaterial(itemLevel, rolls));
    }
  } else {
    rightHand = createWeapon(range(WEAPONS_ENUM.Claymore, WEAPONS_ENUM['Battle Axe']), randomMaterial(itemLevel, rolls));
    if (variant === 1) chance = 75;
    else if (variant === 2) chance = 90;
  }
  for (const piece of [ARMOR_ENUM.Helm, ARMOR_ENUM.Right_Pauldron, ARMOR_ENUM.Left_Pauldron, ARMOR_ENUM.Cuirass, ARMOR_ENUM.Greaves, ARMOR_ENUM.Boots]) {
    if (dice100(chance, rolls())) armorPieces.push({ piece, material: randomArmorMaterial(itemLevel, rolls) });
  }
  return { rightHand, leftHand, armorPieces };
}

const SLOT_BODY_PART = Object.freeze({ Head: BODY_PARTS.Head, RightArm: BODY_PARTS.RightArm, LeftArm: BODY_PARTS.LeftArm, ChestArmor: BODY_PARTS.Chest, Gloves: BODY_PARTS.Hands, LegsArmor: BODY_PARTS.Legs, Feet: BODY_PARTS.Feet });
const pieceBodyPart = (piece) => PIECE_BODY_PART[piece] ?? SLOT_BODY_PART[customItemClass(piece)?.equipSlot] ?? null;

export function enemyArmorValues(entity, armorPieces) {
  const armorValues = new Array(7).fill(100);
  for (const a of armorPieces) {
    if (a.shield) {
      const bonus = SHIELD_VALUE[a.piece] ?? 0;
      for (const part of SHIELD_PARTS[a.piece] ?? []) armorValues[part] -= bonus * 5;
    } else {
      // DFU's armor loop stops before the Feet slot, so boots never lower Feet armor; the corpse still drops them.
      const part = pieceBodyPart(a.piece);
      if (part == null || part === BODY_PARTS.Feet) continue;
      armorValues[part] -= (a.item ? itemArmorValue(a.item) : materialArmorValue(a.material)) * 5;
    }
  }
  if (entity.isClass) {
    for (let i = 0; i < 7; i++) if (armorValues[i] > 60) armorValues[i] = 60;
  } else {
    const def = (entity.armor ?? 0);
    for (let i = 0; i < 7; i++) if (armorValues[i] > def) armorValues[i] = def;
  }
  return armorValues;
}

// A registered assigner returns assignEnemyEquipment's shape, or null to use the default.
let _assigner = null;
export function setEnemyEquipmentAssigner(fn) { _assigner = typeof fn === 'function' ? fn : null; }
export const enemyEquipmentAssigner = () => _assigner;
export function assignEnemyStartingEquipment(entity, variant, playerLevel, { player = null, rolls = Math.random } = {}) {
  const custom = _assigner?.(entity, variant, playerLevel, { player, rolls });
  return custom ?? assignEnemyEquipment(entity, variant, playerLevel, rolls);
}

export function equipmentItems(eq) {
  if (eq.items) return eq.items;
  const items = [];
  // The equipped records themselves, not copies: the corpse drops the same weapon the enemy swings.
  if (eq.rightHand) items.push(eq.rightHand);
  if (eq.leftHand && !eq.leftHand.shield) items.push(eq.leftHand);
  for (const a of eq.armorPieces) items.push(armorOfMaterial(a.piece, a.material));
  return items;
}

export function bowDamageArrow() {
  return { ...createWeapon(ARROW_TEMPLATE, 0), stackCount: 1 };
}

// Careers: 7 Orc, 21 Orc Shaman, 8 Centaur, 12 Orc Sergeant, 24 Orc Warlord.
export function equipmentVariantFor(careerIndex, isClass, rolls = Math.random) {
  if (careerIndex === 7 || careerIndex === 21) return 0;
  if (careerIndex === 8 || careerIndex === 12) return 1;
  if (careerIndex === 24) return 2;
  if (isClass) return Math.floor(rolls() * 2);
  return null;
}
