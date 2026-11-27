// The skills model: entity-layer skill data read by formulas, advancement, chargen, and the scenes.

import { SPECIAL_ABILITY_BITS } from './specialAdvantages.js';
import { localizedStrings, localizedText, getLocalizedTextWithReversion, TextCollections } from '../ui/textManager.js';
import { effectiveSkill, overcapTallyWeight, movementTallyWeight, SKILL_SOFT_CAP, SKILL_HARD_CAP } from './skillSoftcap.js';
import { mentoredSkill } from './mentorMode.js';
import { masterCappedSkill, skillCanPassCap } from './masterSkills.js';
export { SKILL_SOFT_CAP, SKILL_HARD_CAP, effectiveSkill } from './skillSoftcap.js';

export const SKILLS = Object.freeze({
  Medical: 0, Etiquette: 1, Streetwise: 2, Jumping: 3, Orcish: 4,
  Harpy: 5, Giantish: 6, Dragonish: 7, Nymph: 8, Daedric: 9,
  Spriggan: 10, Centaurian: 11, Impish: 12, Lockpicking: 13,
  Mercantile: 14, Pickpocket: 15, Stealth: 16, Swimming: 17,
  Climbing: 18, Backstabbing: 19, Dodging: 20, Running: 21,
  Destruction: 22, Restoration: 23, Illusion: 24, Alteration: 25,
  Thaumaturgy: 26, Mysticism: 27, ShortBlade: 28, LongBlade: 29,
  HandToHand: 30, Axe: 31, BluntWeapon: 32, Archery: 33,
  CriticalStrike: 34,
});
export const SKILL_COUNT = 35;

export const MAGIC_SKILLS = Object.freeze([
  SKILLS.Destruction, SKILLS.Restoration, SKILLS.Illusion,
  SKILLS.Alteration, SKILLS.Thaumaturgy, SKILLS.Mysticism,
]);
export const SKILL_KEYS = Object.freeze(Object.entries(SKILLS).reduce((a, [k, v]) => { a[v] = k; return a; }, new Array(SKILL_COUNT)));

const SKILL_TEXT = localizedStrings({
  medical: 'Medical', etiquette: 'Etiquette', streetwise: 'Streetwise', jumping: 'Jumping', orcishSkill: 'Orcish', harpy: 'Harpy',
  giantish: 'Giantish', dragonish: 'Dragonish', nymph: 'Nymph', daedricSkill: 'Daedric', spriggan: 'Spriggan', centaurian: 'Centaurian',
  impish: 'Impish', lockpicking: 'Lockpicking', mercantile: 'Mercantile', pickpocket: 'Pickpocket', stealth: 'Stealth',
  swimming: 'Swimming', climbing: 'Climbing', backstabbing: 'Backstabbing', dodging: 'Dodging', running: 'Running',
  destruction: 'Destruction', restoration: 'Restoration', illusion: 'Illusion', alteration: 'Alteration', thaumaturgy: 'Thaumaturgy',
  mysticism: 'Mysticism', shortBlade: 'Short Blade', longBlade: 'Long Blade', handToHand: 'Hand-to-Hand', axe: 'Axe',
  bluntWeapon: 'Blunt Weapon', archery: 'Archery', criticalStrike: 'Critical Strike',
});
const skillWord = (k) => {
  if (k === 'Orcish') return getLocalizedTextWithReversion('orcishSkill', TextCollections.Internal, false, localizedText('orcish', 'Orcish'));
  if (k === 'Daedric') return getLocalizedTextWithReversion('daedricSkill', TextCollections.Internal, false, localizedText('daedric', 'Daedric'));
  return SKILL_TEXT[k[0].toLowerCase() + k.slice(1)];
};
export const SKILL_NAMES = Object.freeze(SKILL_KEYS.reduce((a, k, id) => Object.defineProperty(a, id, { enumerable: true, get: () => skillWord(k) }), []));

export const WEAPON_SKILL = Object.freeze({
  Dagger: SKILLS.ShortBlade, Tanto: SKILLS.ShortBlade, Wakazashi: SKILLS.ShortBlade, Shortsword: SKILLS.ShortBlade,
  Broadsword: SKILLS.LongBlade, Longsword: SKILLS.LongBlade, Saber: SKILLS.LongBlade,
  Katana: SKILLS.LongBlade, Claymore: SKILLS.LongBlade, 'Dai-Katana': SKILLS.LongBlade,
  'Battle Axe': SKILLS.Axe, 'War Axe': SKILLS.Axe,
  Staff: SKILLS.BluntWeapon, Mace: SKILLS.BluntWeapon, Flail: SKILLS.BluntWeapon, Warhammer: SKILLS.BluntWeapon,
  'Short Bow': SKILLS.Archery, 'Long Bow': SKILLS.Archery,
});

export function permanentSkillValue(entity, skillId) {
  const o = entity.skillOverrides;
  if (o && o[skillId] != null) return o[skillId];
  const s = entity.skills;
  if (typeof s === 'number') return s;
  return s?.[skillId] ?? 0;
}

export function skillValue(entity, skillId) {
  const o = entity.skillOverrides;
  if (o && o[skillId] != null) return o[skillId];
  let mod = entity._enchantMods?.skillMods?.[skillId] ?? 0;
  const list = entity.activeEffects;
  if (list) {
    for (const a of list) {
      if (a.kind === 'racialOverride' && !a.ended) mod += a.skillMods?.[skillId] ?? 0;
    }
  }
  mod += entity._mods?.skills?.[skillId] ?? 0;
  return effectiveSkill(mentoredSkill(entity, masterCappedSkill(entity, permanentSkillValue(entity, skillId), skillId))) + mod;
}

export function skillModOf(entity, skillId) {
  let mod = entity._enchantMods?.skillMods?.[skillId] ?? 0;
  const list = entity.activeEffects;
  if (list) for (const a of list) if (a.kind === 'racialOverride' && !a.ended) mod += a.skillMods?.[skillId] ?? 0;
  return mod + (entity._mods?.skills?.[skillId] ?? 0);
}

export function displaySkillValue(entity, skillId) {
  const o = entity.skillOverrides;
  if (o && o[skillId] != null) return o[skillId];
  return mentoredSkill(entity, masterCappedSkill(entity, permanentSkillValue(entity, skillId), skillId)) + skillModOf(entity, skillId);
}

export function realSkillValue(entity, skillId) {
  const o = entity.skillOverrides;
  if (o && o[skillId] != null) return o[skillId];
  return permanentSkillValue(entity, skillId) + skillModOf(entity, skillId);
}

export function skillValueText(entity, skillId) {
  const shown = displaySkillValue(entity, skillId);
  const real = realSkillValue(entity, skillId);
  return real !== shown ? `${shown} (${real})` : String(shown);
}

export function tallySkill(entity, skillId, amount = 1, movement = false) {
  if (!entity.skillUses) return;
  const real = Array.isArray(entity.skills) ? (entity.skills[skillId] ?? 0) : 0;
  if (real >= SKILL_SOFT_CAP && skillCanPassCap(entity, skillId)) {
    if (real >= SKILL_HARD_CAP) return;
    const w = movement ? movementTallyWeight(entity, skillId, amount, real) : overcapTallyWeight(entity, skillId, amount, real);
    if (!(w > 0)) return;
    const frac = (entity.skillUseFrac ??= new Array(SKILL_COUNT).fill(0));
    const total = (frac[skillId] ?? 0) + w;
    const whole = Math.floor(total);
    frac[skillId] = total - whole;
    if (!whole) return;
    entity.skillUses[skillId] += whole;
    return;
  }
  entity.skillUses[skillId] += amount;
  if (entity.skillUses[skillId] > 20000) entity.skillUses[skillId] = 20000;
}

export function tallyMovementSkill(entity, skillId, amount = 1) {
  tallySkill(entity, skillId, amount, true);
}

export const SKILLS_RECENTLY_RAISED_WORDS = 2;

function raisedWords(entity) {
  if (!entity.skillsRecentlyRaised || entity.skillsRecentlyRaised.length < SKILLS_RECENTLY_RAISED_WORDS) {
    entity.skillsRecentlyRaised = new Array(SKILLS_RECENTLY_RAISED_WORDS).fill(0);
  }
  return entity.skillsRecentlyRaised;
}

export function getSkillRecentlyIncreased(entity, skillId) {
  const w = raisedWords(entity);
  return (w[Math.floor(skillId / 32)] & (1 << (skillId % 32))) !== 0;
}

export function setSkillRecentlyIncreased(entity, skillId) {
  const w = raisedWords(entity);
  const i = Math.floor(skillId / 32);
  w[i] = (w[i] | (1 << (skillId % 32))) >>> 0;
}

export function resetSkillsRecentlyRaised(entity) {
  raisedWords(entity).fill(0);
}

export function levelUpSkillSum(entity) {
  const c = entity.career;
  const v = (id) => effectiveSkill(masterCappedSkill(entity, entity.skills[id], id));
  let sum = 0;
  for (const id of c.primarySkills) sum += v(id);
  let lowestMajor = Infinity;
  for (const id of c.majorSkills) { const x = v(id); sum += x; if (x < lowestMajor) lowestMajor = x; }
  sum -= lowestMajor;
  let highestMinor = -Infinity;
  for (const id of c.minorSkills) { const x = v(id); if (x > highestMinor) highestMinor = x; }
  return sum + highestMinor;
}

export const JUMP_SPELL_MULTIPLIER = 0.6;
export const ATHLETICISM_MULTIPLIER = 0.1;
export const IMPROVED_ATHLETICISM_MULTIPLIER = 0.1;
export const isEnhancedJumping = (entity) =>
  !!entity?.activeEffects?.some((a) => a.kind === 'jumping');
export function jumpSpeedMultiplier(entity) {
  let m = 1 + (skillValue(entity, SKILLS.Jumping) * 0.5) / 100;
  if (isEnhancedJumping(entity)) m += JUMP_SPELL_MULTIPLIER;
  const bits = entity.career?.abilityFlagsAndSpellPointsBitfield ?? 0;
  if ((bits & SPECIAL_ABILITY_BITS.athleticism) === SPECIAL_ABILITY_BITS.athleticism) {
    m += ATHLETICISM_MULTIPLIER;
    if (entity._enchantMods?.improvedAthleticism) m += IMPROVED_ATHLETICISM_MULTIPLIER;
  }
  return m;
}
