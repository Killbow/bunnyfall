import { enchantArmorMod, enchantArmorDisplayMod, enchantSkillMod, enchantWeightAllowanceMult } from '../magic/enchantments.js';
import { addEquipChangeListener } from './equip.js';
import { openBlowCeiling, closeBlowCeiling } from './powerCeiling.js';
import { NUMBER_BODY_PARTS } from '../items/armorMaterials.js';
export { NUMBER_BODY_PARTS };
export const STANDING_CHANNELS = 5;
export const WARDROBE_CHANNELS = Object.freeze(['warmth', 'dry', 'coldDegrees', 'heatDegrees', 'fatigueLess', 'fallLess']);
export const EMPTY_MODS = Object.freeze({
  armorParts: Object.freeze(new Array(NUMBER_BODY_PARTS).fill(0)),
  stats: Object.freeze({}), statMax: Object.freeze({}), skills: Object.freeze({}), resist: Object.freeze({}), weightMult: 0,
  standing: Object.freeze(new Array(STANDING_CHANNELS).fill(0)),
  ...Object.fromEntries(WARDROBE_CHANNELS.map((k) => [k, 0])), magicka: 0,
});
export const newMods = () => ({ armorParts: new Array(NUMBER_BODY_PARTS).fill(0), stats: {}, statMax: {}, skills: {}, resist: {}, weightMult: 0,
  standing: new Array(STANDING_CHANNELS).fill(0), ...Object.fromEntries(WARDROBE_CHANNELS.map((k) => [k, 0])), magicka: 0 });

const _folds = new Map();
export function registerEntityFold(name, fn) { if (typeof fn === 'function') _folds.set(name, fn); else _folds.delete(name); }
export const entityFoldNames = () => [...(_folds.keys())];

const _weaponMods = new Map();
export function registerWeaponDamageMod(name, fn) { if (typeof fn === 'function') _weaponMods.set(name, fn); else _weaponMods.delete(name); }
const _blowMods = new Map();
export function registerWeaponBlowMod(name, fn) { if (typeof fn === 'function') _blowMods.set(name, fn); else _blowMods.delete(name); }
const NO_BLOW_INFO = Object.freeze({ unaware: false });
export function weaponBlowMods(weapon, damage, attacker, target, info = NO_BLOW_INFO) {
  let d = damage;
  const was = openBlowCeiling();
  try {
    for (const fn of _blowMods.values()) {
      try { const next = fn(weapon, d, attacker, target, info ?? NO_BLOW_INFO); if (Number.isFinite(next)) d = next; } catch (e) { console.warn('[entityMods] a blow modifier threw', e?.message ?? e); }
    }
  } finally { closeBlowCeiling(was); }
  return d;
}

export function computeEntityMods(entity) {
  if (!entity) return EMPTY_MODS;
  const out = newMods();
  out.statFolds = Object.create(null);
  for (const [name, fn] of _folds) {
    let m;
    try { m = fn(entity); } catch (e) { console.warn('[entityMods] a fold threw', e); continue; }
    if (!m) continue;
    out.statFolds[name] = Object.fromEntries(Object.entries(m.stats ?? {}).map(([k, v]) => [k, v | 0]));
    if (Array.isArray(m.armorParts)) for (let i = 0; i < NUMBER_BODY_PARTS; i++) out.armorParts[i] += m.armorParts[i] | 0;
    for (const [k, v] of Object.entries(m.stats ?? {})) out.stats[k] = (out.stats[k] ?? 0) + (v | 0);
    for (const [k, v] of Object.entries(m.statMax ?? {})) out.statMax[k] = (out.statMax[k] ?? 0) + (v | 0);
    for (const [k, v] of Object.entries(m.skills ?? {})) out.skills[k] = (out.skills[k] ?? 0) + (v | 0);
    for (const [k, v] of Object.entries(m.resist ?? {})) out.resist[k] = (out.resist[k] ?? 0) + (v | 0);
    out.weightMult += Number(m.weightMult) || 0;
    if (Array.isArray(m.standing)) for (let g = 0; g < STANDING_CHANNELS; g++) out.standing[g] += Number(m.standing[g]) || 0;
    for (const k of WARDROBE_CHANNELS) out[k] += Number(m[k]) || 0;
    out.magicka += m.magicka | 0;
  }
  entity._mods = out;
  return out;
}
export const entityModsOf = (entity) => entity?._mods ?? EMPTY_MODS;
addEquipChangeListener(computeEntityMods);

export const entityArmorPoints = (entity, bodyPart) => entityModsOf(entity).armorParts?.[bodyPart] ?? 0;
export const entityEnchantArmorMod = (entity) => enchantArmorMod(entity);
export const entityArmorMod = (entity, bodyPart) => enchantArmorMod(entity) - entityArmorPoints(entity, bodyPart);
export const entityArmorDisplayMod = (entity, bodyPart) => enchantArmorDisplayMod(entity) + (entityModsOf(entity).armorParts?.[bodyPart] ?? 0);
export const entitySkillMod = (entity, skillId) => enchantSkillMod(entity, skillId) + (entityModsOf(entity).skills?.[skillId] ?? 0);
export const entityStatMod = (entity, stat) => entityModsOf(entity).stats?.[stat] ?? 0;
export const entityWeightMult = (entity) => enchantWeightAllowanceMult(entity) + (entityModsOf(entity).weightMult ?? 0);
export function entityResistMod(entity, elements) {
  const r = entityModsOf(entity).resist;
  let out = 0;
  for (const el of elements ?? []) if (r?.[el]) out += r[el];
  return out;
}
export function weaponDamageMods(weapon, damage, attacker = null) {
  let d = damage;
  for (const fn of _weaponMods.values()) d = fn(weapon, d, attacker);
  return d;
}
