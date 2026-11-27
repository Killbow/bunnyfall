// Roleplay & Realism: Items 1.3 (Hazelnut & Ralzar, MIT): fourteen item classes, their template rows,
// twenty vanilla template patches, and the mod's switches.

import { modSetting } from './modSettings.js';
import { ARMOR_MATERIAL, FIRST_FEMALE_ARCHIVE } from '../items/armorMaterials.js';
import { DYE_COLORS, DYE_NAMES } from '../characters/dyes.js';
import { RRI_SPRITES } from './rriIndex.js';

export const RRI_VENDOR = 'roleplay-realism-items';
export const RRI_MOD = Object.freeze({
  guid: '68589945-3fbb-4d58-81a3-3066f3f08539',
  title: 'RoleplayRealism-Items',
  version: '1.3',
  author: 'Hazelnut & Ralzar',
});

export const rriEnabled = () => modSetting(RRI_VENDOR, 'Enabled') === true;
export const rriModule = (key) => rriEnabled() && modSetting(RRI_VENDOR, key) === true;


export const RRI_TEMPLATES = Object.freeze([
  { index: 513, name: "Archer's Axe", baseWeight: 3, hitPoints: 500, capacityOrTarget: 0, basePrice: 14, enchantmentPoints: 500, rarity: 2, variants: 0, drawOrderOrEffect: 100, isBluntWeapon: false, isLiquid: false, isOneHanded: true, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 4, playerTextureArchive: 513, playerTextureRecord: 0 },
  { index: 514, name: 'Light Flail', baseWeight: 4, hitPoints: 500, capacityOrTarget: 0, basePrice: 14, enchantmentPoints: 500, rarity: 2, variants: 0, drawOrderOrEffect: 100, isBluntWeapon: true, isLiquid: false, isOneHanded: true, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 6, playerTextureArchive: 514, playerTextureRecord: 0 },
  { index: 515, name: 'Hauberk', baseWeight: 10, hitPoints: 2048, capacityOrTarget: 0, basePrice: 80, enchantmentPoints: 360, rarity: 4, variants: 1, drawOrderOrEffect: 50, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 11, playerTextureArchive: 245, playerTextureRecord: 3 },
  { index: 516, name: 'Chausses', baseWeight: 2, hitPoints: 1536, capacityOrTarget: 0, basePrice: 62, enchantmentPoints: 50, rarity: 4, variants: 1, drawOrderOrEffect: 30, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 13, playerTextureArchive: 245, playerTextureRecord: 10 },
  { index: 517, name: 'Left Spaulder', baseWeight: 1.6, hitPoints: 1024, capacityOrTarget: 0, basePrice: 52, enchantmentPoints: 40, rarity: 4, variants: 1, drawOrderOrEffect: 60, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 13, playerTextureArchive: 245, playerTextureRecord: 17 },
  { index: 518, name: 'Right Spaulder', baseWeight: 1.6, hitPoints: 1024, capacityOrTarget: 0, basePrice: 52, enchantmentPoints: 40, rarity: 4, variants: 1, drawOrderOrEffect: 60, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 13, playerTextureArchive: 245, playerTextureRecord: 22 },
  { index: 519, name: 'Sollerets', baseWeight: 1.6, hitPoints: 1536, capacityOrTarget: 0, basePrice: 42, enchantmentPoints: 160, rarity: 4, variants: 1, drawOrderOrEffect: 20, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 204, worldTextureRecord: 1, playerTextureArchive: 245, playerTextureRecord: 0 },
  { index: 520, name: 'Jerkin', baseWeight: 8, hitPoints: 1600, capacityOrTarget: 0, basePrice: 60, enchantmentPoints: 320, rarity: 4, variants: 1, drawOrderOrEffect: 50, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 11, playerTextureArchive: 245, playerTextureRecord: 3 },
  { index: 521, name: 'Cuisse', baseWeight: 1.8, hitPoints: 1400, capacityOrTarget: 0, basePrice: 54, enchantmentPoints: 40, rarity: 4, variants: 1, drawOrderOrEffect: 30, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 13, playerTextureArchive: 245, playerTextureRecord: 10 },
  { index: 522, name: 'Helmet', baseWeight: 1.5, hitPoints: 1400, capacityOrTarget: 0, basePrice: 60, enchantmentPoints: 740, rarity: 3, variants: 1, drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 12, playerTextureArchive: 245, playerTextureRecord: 27 },
  { index: 523, name: 'Boots', baseWeight: 1.4, hitPoints: 1250, capacityOrTarget: 0, basePrice: 35, enchantmentPoints: 150, rarity: 4, variants: 1, drawOrderOrEffect: 20, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 204, worldTextureRecord: 1, playerTextureArchive: 245, playerTextureRecord: 0 },
  { index: 524, name: 'Gloves', baseWeight: 1, hitPoints: 1024, capacityOrTarget: 0, basePrice: 36, enchantmentPoints: 300, rarity: 2, variants: 1, drawOrderOrEffect: 70, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 13, playerTextureArchive: 245, playerTextureRecord: 8 },
  { index: 525, name: 'Left Vambrace', baseWeight: 1.4, hitPoints: 1024, capacityOrTarget: 0, basePrice: 43, enchantmentPoints: 40, rarity: 4, variants: 1, drawOrderOrEffect: 60, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 13, playerTextureArchive: 245, playerTextureRecord: 17 },
  { index: 526, name: 'Right Vambrace', baseWeight: 1.4, hitPoints: 1024, capacityOrTarget: 0, basePrice: 43, enchantmentPoints: 40, rarity: 4, variants: 1, drawOrderOrEffect: 60, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false, worldTextureArchive: 207, worldTextureRecord: 13, playerTextureArchive: 245, playerTextureRecord: 22 },
].map(Object.freeze));

export const RRI_TEMPLATE_PATCHES = Object.freeze([
  { index: 93, baseWeight: 600.0, basePrice: 1000 },
  { index: 94, basePrice: 3000 },
  { index: 114, hitPoints: 40, rarity: 2 },
  { index: 116, baseWeight: 2, hitPoints: 400 },
  { index: 117, baseWeight: 2.25, hitPoints: 150, rarity: 2 },
  { index: 118, hitPoints: 700, basePrice: 12 },
  { index: 121, baseWeight: 3.5, hitPoints: 350, rarity: 2 },
  { index: 123, baseWeight: 5.5, hitPoints: 450, rarity: 3 },
  { index: 124, baseWeight: 6.0, basePrice: 12 },
  { index: 126, baseWeight: 8.5 },
  { index: 129, hitPoints: 80 },
  { index: 130, hitPoints: 120 },
  { index: 131, baseWeight: 0.1 },
  { index: 140, baseWeight: 0.1 },
  { index: 247, baseWeight: 0.35, worldTextureRecord: 16 },
  { index: 249, baseWeight: 0.15 },
  { index: 252, baseWeight: 0.15 },
  { index: 275, baseWeight: 0.1 },
  { index: 278, baseWeight: 0.1 },
  { index: 279, baseWeight: 0.1 },
].map(Object.freeze));


export function leatherMaterialArmorValue(material, message) {
  const M = ARMOR_MATERIAL;
  switch (material) {
    case M.Leather: return message === 0 ? 3 : 5;
    case M.Chain: case M.Chain2: return 6;
    case M.Iron: return 5;
    case M.Steel: case M.Silver: return 7;
    case M.Elven: return 8;
    case M.Dwarven: return 9;
    case M.Mithril: return 11;
    case M.Adamantium: return 11;
    case M.Ebony: return 12;
    case M.Orcish: return 13;
    case M.Daedric: return 14;
    default: return 0;
  }
}

export function chainmailMaterialArmorValue(material) {
  const M = ARMOR_MATERIAL;
  switch (material) {
    case M.Leather: return 3;
    case M.Chain: case M.Chain2: return 5;
    case M.Iron: return 6;
    case M.Steel: case M.Silver: return 8;
    case M.Elven: return 9;
    case M.Dwarven: return 11;
    case M.Mithril: case M.Adamantium: return 13;
    case M.Ebony: return 15;
    case M.Orcish: return 17;
    case M.Daedric: return 18;
    default: return 0;
  }
}


export const RRI_TEXT = Object.freeze({ mail: 'Mail ', fur: 'Fur ', brig: 'Brigandine ' });

export { FIRST_FEMALE_ARCHIVE };
const raw = (item) => item?.material ?? ARMOR_MATERIAL.Leather;
const msg = (item) => item?.message ?? 0;

function lightRecord(item, { playerTextureArchive }) {
  let offset = playerTextureArchive - FIRST_FEMALE_ARCHIVE;
  offset = (offset < 4) ? 2 : 6;
  if (raw(item) === ARMOR_MATERIAL.Leather && msg(item) === 1) return offset;
  if (raw(item) >= ARMOR_MATERIAL.Iron) return 8 + offset;
  return (offset < 4) ? 16 : 17;
}
function helmetRecord(item, { playerTextureArchive }) {
  let offset = playerTextureArchive - FIRST_FEMALE_ARCHIVE;
  let leather = 16;
  switch (offset) {
    case 1: case 2: case 3: offset = 2; leather = 16; break;
    case 4: case 6: offset = 6; leather = 17; break;
    case 0: offset = 1; leather = 18; break;
    case 5: case 7: offset = 5; leather = 19; break;
    default: break;
  }
  if (raw(item) === ARMOR_MATERIAL.Leather && msg(item) === 1) return offset;
  if (raw(item) >= ARMOR_MATERIAL.Iron) return 8 + offset;
  return leather;
}

const lightWord = (item) => ((raw(item) === ARMOR_MATERIAL.Chain || (raw(item) === ARMOR_MATERIAL.Leather && msg(item) === 1))
  ? RRI_TEXT.fur : raw(item) >= ARMOR_MATERIAL.Iron ? RRI_TEXT.brig : '');
const mailWord = (item) => (raw(item) >= ARMOR_MATERIAL.Iron ? RRI_TEXT.mail : '');

function lightVariant(item, { jerkin = false } = {}) {
  const out = {};
  const name = lightWord(item) + (item.name ?? '');
  if (raw(item) === ARMOR_MATERIAL.Chain) {
    out.material = ARMOR_MATERIAL.Leather;
    out.message = 1;
    const stored = Number.isFinite(item.weightInKg) ? item.weightInKg : (RRI_TEMPLATES.find((t) => t.index === item.templateIndex)?.baseWeight ?? 0);
    out.weightInKg = jerkin ? stored - 2 : stored;
  }
  if (name !== (item.name ?? '')) out.name = name;
  return out;
}
function mailVariant(item) {
  const word = mailWord(item);
  return word ? { name: word + (item.name ?? '') } : {};
}

const armorEnchant = (item, { enchantmentPoints, armorEnchantmentMultiplier }) =>
  enchantmentPoints + Math.floor(enchantmentPoints * armorEnchantmentMultiplier(raw(item)));

const weaponClass = (index, groupIndex, { min, max, skill, type, magicType, equipSound }) => Object.freeze({
  index, group: 'Weapons', groupIndex,
  inventoryTextureArchive: index,
  baseDamageMin: () => min, baseDamageMax: () => max,
  weaponSkillUsed: skill,
  itemHands: 'Either',
  weaponType: (enchanted) => (enchanted ? magicType : type),
  equipSound, swingSound: 'SwingMediumPitch',
});
const chainClass = (index, slot, { leatherRecord, otherRecord, record = null }) => Object.freeze({
  index, group: 'Armor', equipSlot: slot,
  inventoryTextureArchive: null,
  inventoryTextureRecord: (item) => (record ?? (raw(item) === ARMOR_MATERIAL.Leather ? leatherRecord : otherRecord)),
  nativeMaterialValue: (item) => (raw(item) >= ARMOR_MATERIAL.Iron ? raw(item) - 0x0100 : raw(item)),
  materialArmorValue: (item) => chainmailMaterialArmorValue(raw(item)),
  enchantmentPower: armorEnchant,
  onVariantSet: mailVariant,
  variantWord: mailWord,
});
const lightClass = (index, slot, { jerkin = false, helmet = false } = {}) => Object.freeze({
  index, group: 'Armor', equipSlot: slot,
  inventoryTextureArchive: index,
  inventoryTextureRecord: helmet ? helmetRecord : lightRecord,
  nativeMaterialValue: (item) => (raw(item) >= ARMOR_MATERIAL.Iron ? raw(item) - 0x0200 : raw(item)),
  materialArmorValue: (item) => leatherMaterialArmorValue(raw(item), msg(item)),
  enchantmentPower: armorEnchant,
  equipSound: 'EquipLeather',
  onVariantSet: (item) => lightVariant(item, { jerkin }),
  variantWord: lightWord,
});

export const RRI_CLASSES = Object.freeze({
  513: weaponClass(513, 3, { min: 2, max: 10, skill: 'Axe', type: 'Battleaxe', magicType: 'Battleaxe_Magic', equipSound: 'EquipAxe' }),
  514: weaponClass(514, 6, { min: 3, max: 10, skill: 'BluntWeapon', type: 'Flail', magicType: 'Flail_Magic', equipSound: 'EquipFlail' }),
  515: chainClass(515, 'ChestArmor', { leatherRecord: 3, otherRecord: 7 }),
  516: Object.freeze({ ...chainClass(516, 'LegsArmor', { leatherRecord: 10, otherRecord: 16 }),
    inventoryTextureRecord: (item) => (raw(item) === ARMOR_MATERIAL.Leather ? 10 : (raw(item) >= ARMOR_MATERIAL.Chain && raw(item) < ARMOR_MATERIAL.Silver) ? 11 : 16) }),
  517: chainClass(517, 'LeftArm', { leatherRecord: 17, otherRecord: 21 }),
  518: chainClass(518, 'RightArm', { leatherRecord: 22, otherRecord: 26 }),
  519: chainClass(519, 'Feet', { record: 0 }),
  520: lightClass(520, 'ChestArmor', { jerkin: true }),
  521: lightClass(521, 'LegsArmor'),
  522: lightClass(522, 'Head', { helmet: true }),
  523: lightClass(523, 'Feet'),
  524: lightClass(524, 'Gloves'),
  525: lightClass(525, 'LeftArm'),
  526: lightClass(526, 'RightArm'),
});

export function customItemClass(templateIndex) {
  const cls = RRI_CLASSES[templateIndex];
  if (!cls) return null;
  if (!rriModule(cls.group === 'Weapons' ? 'newWeapons' : 'newArmor')) return null;
  return cls;
}

export function rriNativeMaterialValue(item) {
  const cls = item ? customItemClass(item.templateIndex) : null;
  return cls?.nativeMaterialValue ? cls.nativeMaterialValue(item) : (item?.material ?? 0);
}
export function rriEquipSound(item) {
  const cls = item ? customItemClass(item.templateIndex) : null;
  return cls?.equipSound ?? null;
}

export function rriCustomItemsForGroup(group) {
  return Object.values(RRI_CLASSES).filter((c) => c.group === group && customItemClass(c.index)).map((c) => c.index);
}

export function rriStoredWeight(item) {
  const cls = customItemClass(item?.templateIndex);
  if (!cls || item?.group !== 'Armor' || item?.message !== 1 || item.templateIndex < 520) return null;
  const base = RRI_TEMPLATES.find((t) => t.index === item.templateIndex)?.baseWeight;
  if (base == null) return null;
  return item.templateIndex === 520 ? base - 2 : base;
}
export function rriVariantFields(item) {
  const cls = customItemClass(item?.templateIndex);
  if (!cls?.onVariantSet) return null;
  return cls.onVariantSet(item);
}
export function rriVariantWord(item) {
  const cls = item ? customItemClass(item.templateIndex) : null;
  return cls?.variantWord ? cls.variantWord(item) : '';
}


export function rriSpriteEntries(sprites = RRI_SPRITES) {
  const out = [];
  const byName = Object.fromEntries(Object.entries(DYE_NAMES).map(([v, n]) => [n, Number(v)]));
  for (const [name, row] of Object.entries(sprites)) {
    const m = /^(\d{3})_(\d+)-(\d+)(?:_(?!Mask)([A-Z][a-z]+))?(_Mask)?$/.exec(name);
    if (!m) continue;
    const dye = m[4] ? byName[m[4]] : null;
    if (m[4] && dye === undefined) continue;
    if (dye === DYE_COLORS.Unchanged) continue;
    const [width, height, x, y, w, h] = row;
    out.push({ name, archive: Number(m[1]), record: Number(m[2]), frame: Number(m[3]), dye, map: m[5] ? 'Mask' : 'Albedo', width, height, rect: x === undefined ? null : { x, y, width: w, height: h } });
  }
  return out;
}
