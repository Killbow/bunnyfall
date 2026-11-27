// Weapon enums, damage tables, and material rules translated from Daggerfall Unity.
import templates from './itemTemplates.json' with { type: 'json' };
import { DYE_COLORS, DYE_TARGETS, getDyeColorTable } from './dyes.js';
import { SKILLS } from './skills.js';
import { SOUND } from '../audio/soundClips.js';
import { CROSSBOW_TEMPLATE, CROSSBOW_SPAN } from './crossbowIds.js';
import { BALLISTA_TEMPLATE, BALLISTA_SPAN, GRAPPLE_TEMPLATE } from './heavyGearIds.js';
import { customItemClass } from '../mods/rriItems.js';

export const WEAPONS = Object.freeze({
  Dagger: 113, Tanto: 114, Staff: 115, Shortsword: 116, Wakazashi: 117,
  Broadsword: 118, Saber: 119, Longsword: 120, Katana: 121, Claymore: 122,
  Dai_Katana: 123, Mace: 124, Flail: 125, Warhammer: 126, Battle_Axe: 127,
  War_Axe: 128, Short_Bow: 129, Long_Bow: 130, Arrow: 131,
});

export function equipSoundFor(item) {
  const W = WEAPONS;
  if (!item || item.werecreatureClaws) return null;
  const cls = customItemClass(item.templateIndex);
  if (cls?.equipSound) return SOUND[cls.equipSound];
  switch (item.templateIndex) {
    case W.Battle_Axe: case W.War_Axe:
      return SOUND.EquipAxe;
    case W.Broadsword: case W.Longsword: case W.Saber: case W.Katana:
      return SOUND.EquipLongBlade;
    case W.Claymore: case W.Dai_Katana:
      return SOUND.EquipTwoHandedBlade;
    case W.Dagger: case W.Tanto: case W.Wakazashi: case W.Shortsword:
      return SOUND.EquipShortBlade;
    case W.Flail:
      return SOUND.EquipFlail;
    case W.Mace: case W.Warhammer:
      return SOUND.EquipMaceOrHammer;
    case W.Staff:
      return SOUND.EquipStaff;
    case W.Short_Bow: case W.Long_Bow:
      return SOUND.EquipBow;
    default:
      return null;
  }
}

export const WEAPON_MATERIALS = Object.freeze({
  None: -1, Iron: 0, Steel: 1, Silver: 2, Elven: 3, Dwarven: 4,
  Mithril: 5, Adamantium: 6, Ebony: 7, Orcish: 8, Daedric: 9,
});

export const weightMultipliersByMaterial = Object.freeze([4, 5, 4, 4, 3, 4, 4, 2, 4, 5]);
export const valueMultipliersByMaterial = Object.freeze([1, 2, 4, 8, 16, 32, 64, 128, 256, 512]);
export const conditionMultipliersByMaterial = Object.freeze([4, 6, 6, 8, 12, 16, 20, 24, 28, 32]);

export const WEAPON_CONDITION_POOL = 1600;

const W = WEAPONS;
const MIN_DAMAGE = new Map([
  [[W.Dagger, W.Tanto, W.Wakazashi, W.Shortsword, W.Broadsword, W.Staff, W.Mace], 1],
  [[W.Longsword, W.Claymore, W.Battle_Axe, W.War_Axe, W.Flail], 2],
  [[W.Saber, W.Katana, W.Dai_Katana, W.Warhammer], 3],
  [[W.Short_Bow, W.Long_Bow], 5],
].flatMap(([ws, v]) => ws.map((w) => [w, v])));
export function weaponMinDamage(weapon) {
  if (weapon === CROSSBOW_TEMPLATE) return CROSSBOW_SPAN.min;
  if (weapon === BALLISTA_TEMPLATE) return BALLISTA_SPAN.min;
  if (weapon === GRAPPLE_TEMPLATE) return 1;
  const cls = customItemClass(weapon);
  if (cls?.baseDamageMin) return cls.baseDamageMin();
  const o = _damageOverride.min?.(weapon);
  if (o != null) return o;
  return MIN_DAMAGE.get(weapon) ?? 0;
}

const _damageOverride = { min: null, max: null };
export function registerWeaponDamageOverride({ min = null, max = null } = {}) {
  _damageOverride.min = typeof min === 'function' ? min : null;
  _damageOverride.max = typeof max === 'function' ? max : null;
}

const MAX_DAMAGE = new Map([
  [[W.Dagger], 6],
  [[W.Tanto, W.Shortsword, W.Staff], 8],
  [[W.Wakazashi], 10],
  [[W.Broadsword, W.Saber, W.Battle_Axe, W.Mace], 12],
  [[W.Flail], 14],
  [[W.Longsword, W.Katana, W.War_Axe], 16],
  [[W.Short_Bow], 17],
  [[W.Claymore, W.Warhammer], 18],
  [[W.Long_Bow], 19],
  [[W.Dai_Katana], 21],
].flatMap(([ws, v]) => ws.map((w) => [w, v])));
export function weaponMaxDamage(weapon) {
  if (weapon === CROSSBOW_TEMPLATE) return CROSSBOW_SPAN.max;
  if (weapon === BALLISTA_TEMPLATE) return BALLISTA_SPAN.max;
  if (weapon === GRAPPLE_TEMPLATE) return 2;
  const cls = customItemClass(weapon);
  if (cls?.baseDamageMax) return cls.baseDamageMax();
  const o = _damageOverride.max?.(weapon);
  if (o != null) return o;
  return MAX_DAMAGE.get(weapon) ?? 0;
}

export const WEAPON_SKILL_USED = new Map([
  [[W.Dagger, W.Tanto, W.Wakazashi, W.Shortsword], SKILLS.ShortBlade],
  [[W.Broadsword, W.Longsword, W.Saber, W.Katana, W.Claymore, W.Dai_Katana], SKILLS.LongBlade],
  [[W.Battle_Axe, W.War_Axe], SKILLS.Axe],
  [[W.Flail, W.Mace, W.Warhammer, W.Staff], SKILLS.BluntWeapon],
  [[W.Short_Bow, W.Long_Bow], SKILLS.Archery],
].flatMap(([ws, v]) => ws.map((w) => [w, v])));
export function weaponSkillUsed(templateIndex) {
  if (templateIndex === CROSSBOW_TEMPLATE) return SKILLS.Archery;
  if (templateIndex === BALLISTA_TEMPLATE) return SKILLS.Archery;
  const cls = customItemClass(templateIndex);
  if (cls?.weaponSkillUsed) return SKILLS[cls.weaponSkillUsed];
  return WEAPON_SKILL_USED.get(templateIndex) ?? null;
}

export function weaponMaterialModifier(material) {
  const M = WEAPON_MATERIALS;
  switch (material) {
    case M.Iron: return -1;
    case M.Steel: case M.Silver: return 0;
    case M.Elven: return 1;
    case M.Dwarven: return 2;
    case M.Mithril: case M.Adamantium: return 3;
    case M.Ebony: return 4;
    case M.Orcish: return 5;
    case M.Daedric: return 6;
    default: return 0;
  }
}
export function weaponToHit(material) { return weaponMaterialModifier(material) * 10; }

export function weaponDyeColor(material) {
  const M = WEAPON_MATERIALS, D = DYE_COLORS;
  switch (material) {
    case M.Iron: return D.Iron;
    case M.Steel: return D.Steel;
    case M.Silver: return D.Silver;
    case M.Elven: return D.Elven;
    case M.Dwarven: return D.Dwarven;
    case M.Mithril: return D.Mithril;
    case M.Adamantium: return D.Adamantium;
    case M.Ebony: return D.Ebony;
    case M.Orcish: return D.Orcish;
    case M.Daedric: return D.Daedric;
    default: return D.Unchanged;
  }
}

const byIndex = new Map(templates.map((t) => [t.index, t]));

// Unity's Mathf.Round rounds halves to even, not up.
const roundHalfEven = (x) => { const f = Math.floor(x); return (x - f === 0.5) ? (f % 2 === 0 ? f : f + 1) : Math.round(x); };
export function weightForMaterial(weightInKg, material) {
  const quarterKgs = Math.trunc(weightInKg * 4);
  const matQuarterKgs = (quarterKgs * (weightMultipliersByMaterial[material] ?? 4)) / 4;
  return roundHalfEven(matQuarterKgs) / 4;
}

export function buildWeapon(templateIndex, material, { female = false } = {}) {
  const t = byIndex.get(templateIndex);
  if (!t) return null;
  const pool = templateIndex === WEAPONS.Arrow ? t.hitPoints : WEAPON_CONDITION_POOL;
  const maxCondition = Math.trunc((pool * conditionMultipliersByMaterial[material]) / 4);
  return {
    templateIndex,
    name: t.name,
    nativeMaterialValue: material,
    value: t.basePrice * 3 * valueMultipliersByMaterial[material],
    weightInKg: weightForMaterial(t.baseWeight, material),
    maxCondition,
    currentCondition: maxCondition,
    dyeColor: weaponDyeColor(material),
    minDamage: weaponMinDamage(templateIndex),
    maxDamage: weaponMaxDamage(templateIndex),
    materialModifier: weaponMaterialModifier(material),
    toHitModifier: weaponToHit(material),
    isOneHanded: t.isOneHanded,
    playerTextureArchive: t.playerTextureArchive - (female ? 1 : 0),
    playerTextureRecord: t.playerTextureRecord,
  };
}

export function weaponMaterialRamp(material, palGet) {
  const idx = getDyeColorTable(weaponDyeColor(material), DYE_TARGETS.WeaponsAndArmor);
  return idx.map((i) => { const c = palGet(i); return [c.r, c.g, c.b]; });
}

const hardened = (item, v) => (Number.isInteger(item?.craftMods?.h) && item.craftMods.h !== 0 ? Math.max(1, Math.round(v * (1 + item.craftMods.h / 100))) : v);
export const itemMinDamage = (item) => hardened(item, weaponMinDamage(item?.templateIndex));
export const itemMaxDamage = (item) => hardened(item, weaponMaxDamage(item?.templateIndex));
