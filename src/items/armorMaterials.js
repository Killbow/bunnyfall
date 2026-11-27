// Daggerfall armor material constants and the armor values, shield parts, and variant clamps derived from them.
// This is the only copy; other modules import these rather than porting their own.

// Values match the classic ArmorMaterialTypes enum, including Chain2 at 0x0103.
export const ARMOR_MATERIAL = Object.freeze({
  None: -1,
  Leather: 0x0000,
  Chain: 0x0100,
  Chain2: 0x0103,
  Iron: 0x0200, Steel: 0x0201, Silver: 0x0202, Elven: 0x0203, Dwarven: 0x0204,
  Mithril: 0x0205, Adamantium: 0x0206, Ebony: 0x0207, Orcish: 0x0208, Daedric: 0x0209,
});
export const isLeather = (m) => m === ARMOR_MATERIAL.Leather;
export const isChain = (m) => m === ARMOR_MATERIAL.Chain || m === ARMOR_MATERIAL.Chain2;
export const isPlate = (m) => m >= ARMOR_MATERIAL.Iron;
// A plate material's low byte is its metal index, Iron 0 to Daedric 9, which the per-material tables read.
export const plateMetal = (m) => (isPlate(m) && m <= ARMOR_MATERIAL.Daedric ? m - ARMOR_MATERIAL.Iron : null);

export const BODY_PARTS = Object.freeze({ Head: 0, RightArm: 1, LeftArm: 2, Chest: 3, Hands: 4, Legs: 5, Feet: 6 });
export const NUMBER_BODY_PARTS = 7;

// Takes a bare material because the enemy equipment table has armor records and no items.
const PLATE_ARMOR_VALUES = [7, 9, 9, 11, 13, 15, 15, 17, 19, 21];
export function materialArmorValue(material) {
  if (isLeather(material)) return 3;
  if (isChain(material)) return 6;
  if (isPlate(material)) return PLATE_ARMOR_VALUES[plateMetal(material)] ?? 0;
  return 0;
}

// Shield armor values ignore material.
export const SHIELD_VALUES = new Map([[109, 1], [110, 2], [111, 3], [112, 4]]);
export const SHIELD_PARTS = new Map([
  [109, [BODY_PARTS.LeftArm, BODY_PARTS.Hands]],
  [110, [BODY_PARTS.LeftArm, BODY_PARTS.Hands, BODY_PARTS.Legs]],
  [111, [BODY_PARTS.LeftArm, BODY_PARTS.Hands, BODY_PARTS.Legs]],
  [112, [BODY_PARTS.Head, BODY_PARTS.LeftArm, BODY_PARTS.Hands, BODY_PARTS.Legs]],
]);
export const isShieldTemplate = (templateIndex) => SHIELD_VALUES.has(templateIndex);

// A custom class's armor value is registered by its installer so this file stays a leaf module.
let _customArmorValue = null;
export function registerCustomArmorValue(fn) { _customArmorValue = typeof fn === 'function' ? fn : null; }
const hardArmour = (item, v) => (Number.isInteger(item?.craftMods?.h) && item.craftMods.h !== 0 && v > 0 ? Math.max(1, Math.round(v * (1 + item.craftMods.h / 100))) : v);
// Shields return early with their template value. Armor artifacts then halve, rounding down; clothing never does.
// A missing material reads as Leather (0), as the classic item field defaults to 0.
export function itemArmorValue(item) {
  const custom = _customArmorValue?.(item);
  if (custom != null) return hardArmour(item, custom);
  if (item?.group === 'Armor' && isShieldTemplate(item?.templateIndex)) {
    return hardArmour(item, SHIELD_VALUES.get(item.templateIndex) ?? 0);
  }
  let result = materialArmorValue(item?.material ?? ARMOR_MATERIAL.Leather);
  if (item?.artifact && item?.group === 'Armor') result = Math.trunc(result / 2);
  return hardArmour(item, result);
}

// Templates: 102 cuirass, 103 gauntlets, 104 greaves, 105 and 106 pauldrons, 108 boots.
export function clampArmorVariant(templateIndex, material, variant) {
  const leather = isLeather(material), chain = isChain(material);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (templateIndex === 102) return leather ? 0 : chain ? 4 : clamp(variant, 1, 3);
  if (templateIndex === 104) return leather ? clamp(variant, 0, 1) : chain ? 6 : clamp(variant, 2, 5);
  if (templateIndex === 105 || templateIndex === 106) return leather ? 0 : chain ? 4 : clamp(variant, 1, 3);
  if (templateIndex === 103) return leather ? 0 : 1;
  if (templateIndex === 108) return leather ? 0 : clamp(variant, 1, 2);
  return variant;
}

export const FIRST_FEMALE_ARCHIVE = 245;
export const FIRST_MALE_ARCHIVE = 249;

export const BODY_MORPHOLOGY = Object.freeze({ Argonian: 0, Elf: 1, Human: 2, Khajiit: 3 });
export const HUMAN_MORPHOLOGY = BODY_MORPHOLOGY.Human;

export const armorArchive = (gender = 'male', morphology = HUMAN_MORPHOLOGY) =>
  (gender === 'male' ? FIRST_MALE_ARCHIVE : FIRST_FEMALE_ARCHIVE) + morphology;

export const MATERIAL_FAMILY = Object.freeze({ Leather: 0, Chain: 1, Plate: 2 });
// Callers pass the item class's native value, so custom classes such as a mail hauberk read as chain.
export const familyOfNative = (m) => (Number.isInteger(m) && m >= 0 ? Math.min(m >> 8, MATERIAL_FAMILY.Plate) : null);
const MATERIAL_OF_FAMILY = [ARMOR_MATERIAL.Leather, ARMOR_MATERIAL.Chain, ARMOR_MATERIAL.Iron];
export const armorVariant = (templateIndex, family, requested = 0) =>
  clampArmorVariant(templateIndex, MATERIAL_OF_FAMILY[family] ?? ARMOR_MATERIAL.Iron, requested);
