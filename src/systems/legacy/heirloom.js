// @ts-check
import { registerCustomTemplates, setItemFields, mintCondition, itemValueOf, templateByIndex } from '../../items/itemTemplates.js';
import { registerEntityFold, registerWeaponDamageMod, newMods, EMPTY_MODS } from '../../characters/entityMods.js';
import { armorBodyParts } from '../../characters/equip.js';
import { SKILL_COUNT } from '../../characters/skills.js';
import { rarityOf } from '../../items/lootRarity.js';
import { isSummoned } from '../../items/inventory.js';
import { REMAINS_GOLD_SHARE, REMAINS_GOLD_MAX } from './legacyLaw.js';
import { houseWord } from './houseName.js';

export const HEIRLOOM_GEN_MAX = 5;
export const HEIRLOOM_DAMAGE_PER_GEN = 5;
export const HEIRLOOM_ARMOR_PER_GEN = 2;
export { REMAINS_GOLD_SHARE, REMAINS_GOLD_MAX };
export const remainsGoldOf = (gold) => Math.min(REMAINS_GOLD_MAX, Math.max(0, Math.floor((Number(gold) || 0) * REMAINS_GOLD_SHARE)));
export const BLESSING_POINTS = 3;
export const BLESSING_SKILL_MAX = 9;

// Custom template indexes must stay unique; 1800 belongs to the keepsake.
export const REMAINS_TEMPLATE = 1810;
export const REMAINS_GROUP = 'UselessItems2';
export const REMAINS_ROW = Object.freeze({
  index: REMAINS_TEMPLATE, name: 'Remains', baseWeight: 2, hitPoints: 100, capacityOrTarget: 0, basePrice: 0,
  enchantmentPoints: 0, rarity: 0, variants: 0, drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false,
  isOneHanded: false, isIngredient: false, worldTextureArchive: 254, worldTextureRecord: 56, playerTextureArchive: 0,
  playerTextureRecord: 0, stackable: false,
});
registerCustomTemplates([REMAINS_ROW]);

const HEIR_GROUPS = new Set(['Weapons', 'Armor']);
const NEVER_RARITY = new Set(['aetheric', 'artifact', 'gilded']);

export function heirloomEligible(it) {
  return !!it && it.equipSlot != null && HEIR_GROUPS.has(it.group) && !it.questItem
    && !NEVER_RARITY.has(it.rarity) && !NEVER_RARITY.has(rarityOf(it)) && it.sigil == null && it.aetheric == null && !isSummoned(it);
}

export function pickHeirloom(items) {
  const worn = (items ?? []).filter(heirloomEligible);
  const handed = worn.find((it) => it.heirloom);
  if (handed) return handed;
  let best = null;
  for (const it of worn) {
    if (!best) { best = it; continue; }
    const dv = itemValueOf(it) - itemValueOf(best);
    if (dv > 0 || (dv === 0 && (it.currentCondition ?? 0) > (best.currentCondition ?? 0))) best = it;
  }
  return best;
}

const baseNameOf = (it) => it.heirloom?.base ?? it.name ?? templateByIndex(it.templateIndex)?.name ?? 'heirloom';

export function markHeirloom(it, { line, house, of, from }) {
  const base = baseNameOf(it);
  const copy = JSON.parse(JSON.stringify(it));
  delete copy.equipSlot;
  copy.heirloom = { line: String(line), house: String(house), of: of | 0, from: String(from), gen: Math.min(HEIRLOOM_GEN_MAX, it.heirloom?.gen | 0), base };
  return copy;
}

export function attuneHeirloom(it) {
  if (!it?.heirloom) return it;
  it.heirloom.gen = Math.min(HEIRLOOM_GEN_MAX, (it.heirloom.gen | 0) + 1);
  return it;
}
export const isHeirloom = (it) => !!it?.heirloom && typeof it.heirloom.line === 'string';

export function mintRemainsItem({ line, of, name }) {
  const item = mintCondition(setItemFields({ group: REMAINS_GROUP, templateIndex: REMAINS_TEMPLATE, material: 0, flags: 0, variant: 0, message: 0, stackCount: 1 }));
  return { ...item, name: `The remains of ${name}`, legacyRemains: { line: String(line), of: of | 0, name: String(name) } };
}
export const isRemainsItem = (it) => it?.templateIndex === REMAINS_TEMPLATE && !!it?.legacyRemains;
// A symbol, so JSON saves skip it. Apart from the pack and wagon, items/itemTransfer.js stores remains only in
// the list marked with their own `of`, which prevents a second set of bones.
export const REMAINS_LIST = Symbol.for('dagger.legacy.remainsList');

export function bestSkillOf(person) {
  const s = person?.skills;
  if (!Array.isArray(s)) return null;
  let best = 0;
  for (let i = 1; i < Math.min(SKILL_COUNT, s.length); i++) if ((s[i] | 0) > (s[best] | 0)) best = i;
  return best;
}
export const blessingOf = (person, name) => ({ of: person.id | 0, name: String(name), skill: bestSkillOf(person) ?? 0, value: BLESSING_POINTS });
export const blessedIn = (entity, skill) => Math.min(BLESSING_SKILL_MAX, (Array.isArray(entity?.legacyBlessings) ? entity.legacyBlessings : [])
  .filter((b) => (b?.skill | 0) === (skill | 0)).reduce((n, b) => n + Math.max(0, Math.min(BLESSING_POINTS, b.value | 0)), 0));

function wornHeirlooms(entity) {
  const slots = entity?.equip?.slots;
  const list = slots ? slots : (entity?.items ?? []).filter((it) => it?.equipSlot != null);
  return list.filter((it) => it && isHeirloom(it));
}
export function legacyFold(entity) {
  const worn = wornHeirlooms(entity);
  const blessings = Array.isArray(entity?.legacyBlessings) ? entity.legacyBlessings : [];
  if (!worn.length && !blessings.length) return EMPTY_MODS;
  const mods = newMods();
  for (const it of worn) {
    if (it.group !== 'Armor') continue;
    const v = HEIRLOOM_ARMOR_PER_GEN * Math.min(HEIRLOOM_GEN_MAX, it.heirloom.gen | 0);
    if (v) for (const part of armorBodyParts(it)) mods.armorParts[part] += v;
  }
  for (const b of blessings) {
    const k = b?.skill | 0;
    if (k >= 0 && k < SKILL_COUNT) mods.skills[k] = Math.min(BLESSING_SKILL_MAX, (mods.skills[k] ?? 0) + Math.max(0, Math.min(BLESSING_POINTS, b.value | 0)));
  }
  return mods;
}
export function heirloomWeaponDamage(weapon, damage) {
  if (!isHeirloom(weapon)) return damage;
  const pct = HEIRLOOM_DAMAGE_PER_GEN * Math.min(HEIRLOOM_GEN_MAX, weapon.heirloom.gen | 0);
  return pct ? Math.trunc(damage * (1 + pct / 100)) : damage;
}
export const LEGACY_FOLD = 'projectLegacy';
registerEntityFold(LEGACY_FOLD, legacyFold);
registerWeaponDamageMod(LEGACY_FOLD, heirloomWeaponDamage);

export function heirloomLine(it) {
  if (!isHeirloom(it)) return null;
  const g = it.heirloom.gen | 0;
  const house = houseWord(it.heirloom.house);
  return `Heirloom of the house${house ? ` of ${house}` : ''}, first borne by ${it.heirloom.from} and ${g ? `carried home ${g} ${g === 1 ? 'time' : 'times'}` : 'not yet carried home'}.`;
}
