// @ts-check
import { t } from '../../ui/textManager.js';
import { SKILLS } from '../../characters/skills.js';

export const VITAE_MAX = 100;
export const VITAE_AWAKENED = 75;
// Days are the character's own clock; online a day is one real hour.
export const VITAE_DRAIN_PER_DAY = 12;
// Skipped time, such as a rest or a journey, drains at this share and never below TRAVEL_DRAIN_FLOOR.
export const TRAVEL_DRAIN_MUL = 0.25;
export const TRAVEL_DRAIN_FLOOR = 25;
export const MIND_CLOUD_COST = 8;

export const BEAST = Object.freeze({ Sated: 0, Thirsty: 1, Hungry: 2, Ravenous: 3, Starving: 4 });
export const BEAST_FLOOR = Object.freeze([70, 45, 25, 10, 0]);

/** @param {number} vitae */
export function beastStageOf(vitae) {
  const v = Number.isFinite(vitae) ? vitae : 0;
  for (let s = 0; s < BEAST_FLOOR.length; s++) if (v >= BEAST_FLOOR[s]) return s;
  return BEAST.Starving;
}

export const BEAST_STAT_MODS = Object.freeze([
  Object.freeze({ personality: 5 }),
  Object.freeze({}),
  Object.freeze({ personality: -5 }),
  Object.freeze({ personality: -15, strength: 10, speed: 5 }),
  Object.freeze({ personality: -30, strength: 15, speed: 10, willpower: -10 }),
]);

/** @param {number} stage */
export function beastStageName(stage) {
  switch (stage) {
    case BEAST.Sated: return t('vampire.beast.sated', 'Sated');
    case BEAST.Thirsty: return t('vampire.beast.thirsty', 'Thirsty');
    case BEAST.Hungry: return t('vampire.beast.hungry', 'Hungry');
    case BEAST.Ravenous: return t('vampire.beast.ravenous', 'Ravenous');
    default: return t('vampire.beast.starving', 'Starving');
  }
}

/** @param {number} stage */
export function beastStageLine(stage) {
  switch (stage) {
    case BEAST.Thirsty: return t('vampire.beast.thirstyLine', 'A thirst stirs in you. Your skin pales.');
    case BEAST.Hungry: return t('vampire.beast.hungryLine', 'The Beast whispers. Mortals notice your eyes.');
    case BEAST.Ravenous: return t('vampire.beast.ravenousLine', 'You are Ravenous. The Beast pulls at its chain.');
    case BEAST.Starving: return t('vampire.beast.starvingLine', 'You are Starving. Feed, or the Beast will not let you rest.');
    default: return '';
  }
}

export const ARCHETYPES = Object.freeze({ Scholar: 'scholar', Warrior: 'warrior', Rogue: 'rogue', Noble: 'noble', Worker: 'worker', Beast: 'beast' });

/** @param {string} a */
export function archetypeName(a) {
  switch (a) {
    case ARCHETYPES.Scholar: return t('vampire.blood.scholar', 'Scholar');
    case ARCHETYPES.Warrior: return t('vampire.blood.warrior', 'Warrior');
    case ARCHETYPES.Rogue: return t('vampire.blood.rogue', 'Rogue');
    case ARCHETYPES.Noble: return t('vampire.blood.noble', 'Noble');
    case ARCHETYPES.Beast: return t('vampire.blood.beast', 'Beast');
    default: return t('vampire.blood.worker', 'Worker');
  }
}

const JOB_ARCHETYPE = Object.freeze({
  scholar: ARCHETYPES.Scholar, priest: ARCHETYPES.Scholar, clerk: ARCHETYPES.Scholar, pilgrim: ARCHETYPES.Scholar,
  guard: ARCHETYPES.Warrior, mercenary: ARCHETYPES.Warrior, patrol: ARCHETYPES.Warrior, retainer: ARCHETYPES.Warrior, smith: ARCHETYPES.Warrior,
  adventurer: ARCHETYPES.Rogue, courier: ARCHETYPES.Rogue, hunter: ARCHETYPES.Rogue, minstrel: ARCHETYPES.Rogue, beggar: ARCHETYPES.Rogue,
  noble: ARCHETYPES.Noble, courtier: ARCHETYPES.Noble, merchant: ARCHETYPES.Noble, guildsman: ARCHETYPES.Noble, keeper: ARCHETYPES.Noble, innkeeper: ARCHETYPES.Noble,
});
const JOB_QUALITY_BONUS = Object.freeze({ noble: 20, courtier: 15, merchant: 10, guildsman: 8, scholar: 8, priest: 6, adventurer: 6, patrol: 6 });

/** @param {any} person */
export function archetypeOfPerson(person) {
  const job = person?.living?.res?.job ?? person?.job ?? null;
  return (job && JOB_ARCHETYPE[job]) || ARCHETYPES.Worker;
}

/** @param {string} s */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const GEM_CHANCE = 5;

/** @param {any} person */
export function qualityOfPerson(person) {
  // Hashed from a stable key so every reader gets the same quality for the same person.
  const key = String(person?.living?.id ?? person?.interactionId ?? person?.nameNPC ?? person?.name ?? 'stranger');
  const h = hash32(`blood:${key}`);
  const job = person?.living?.res?.job ?? null;
  let q = 15 + (h % 71) + (job ? JOB_QUALITY_BONUS[job] ?? 0 : 0);
  if (((h >>> 8) % 100) < GEM_CHANCE) q += 25;
  return Math.max(1, Math.min(100, q));
}

/** @param {number} quality */
export function bloodQualityName(quality) {
  switch (resonanceTier(quality)) {
    case 0: return t('vampire.quality.thin', 'thin');
    case 1: return t('vampire.quality.fair', 'fair');
    case 2: return t('vampire.quality.good', 'good');
    case 3: return t('vampire.quality.rich', 'rich');
    default: return t('vampire.quality.potent', 'potent');
  }
}

/** @param {string} type @param {number} quality */
export function bloodTag(type, quality) {
  const q = Math.round(quality);
  return t('vampire.bloodTag', '{type} blood, {word} ({quality}%)', { type: archetypeName(type), word: bloodQualityName(q), quality: q });
}

/** @param {number} level */
export const qualityOfCreature = (level) => Math.max(1, Math.min(90, 30 + Math.round((Number(level) || 1) * 3)));

export const RESONANCE_TIERS = Object.freeze([25, 50, 75, 95]);
export const STALE_QUALITY_CAP = 65;
export const BLOOD_FADE_PER_DAY = 10;

/** @param {number} quality */
export function resonanceTier(quality) {
  let n = 0;
  for (const at of RESONANCE_TIERS) if (quality >= at) n++;
  return n;
}

export const RESONANCE_STAT_MODS = Object.freeze({
  [ARCHETYPES.Scholar]: Object.freeze({ intelligence: 3, willpower: 2 }),
  [ARCHETYPES.Warrior]: Object.freeze({ strength: 3, endurance: 2 }),
  [ARCHETYPES.Rogue]: Object.freeze({ agility: 3, speed: 2 }),
  [ARCHETYPES.Noble]: Object.freeze({ personality: 4, luck: 1 }),
  [ARCHETYPES.Worker]: Object.freeze({ endurance: 3, strength: 1 }),
  [ARCHETYPES.Beast]: Object.freeze({ speed: 2, endurance: 2 }),
});
export const RESONANCE_SKILL_MODS = Object.freeze({
  [ARCHETYPES.Scholar]: Object.freeze({ [SKILLS.Destruction]: 3, [SKILLS.Mysticism]: 3 }),
  [ARCHETYPES.Warrior]: Object.freeze({ [SKILLS.LongBlade]: 3, [SKILLS.BluntWeapon]: 3 }),
  [ARCHETYPES.Rogue]: Object.freeze({ [SKILLS.Stealth]: 3, [SKILLS.Lockpicking]: 3 }),
  [ARCHETYPES.Noble]: Object.freeze({ [SKILLS.Etiquette]: 3, [SKILLS.Mercantile]: 3 }),
  [ARCHETYPES.Worker]: Object.freeze({ [SKILLS.Climbing]: 3, [SKILLS.Swimming]: 3 }),
  [ARCHETYPES.Beast]: Object.freeze({ [SKILLS.HandToHand]: 4, [SKILLS.Jumping]: 3 }),
});

/** @param {string} a */
export function resonanceWords(a) {
  switch (a) {
    case ARCHETYPES.Scholar: return t('vampire.res.scholar', 'sharper mind and spells');
    case ARCHETYPES.Warrior: return t('vampire.res.warrior', 'strength and steel');
    case ARCHETYPES.Rogue: return t('vampire.res.rogue', 'quick feet and quiet steps');
    case ARCHETYPES.Noble: return t('vampire.res.noble', 'charm and a silver tongue');
    case ARCHETYPES.Beast: return t('vampire.res.beast', 'claws and a wild leap');
    default: return t('vampire.res.worker', 'a strong back');
  }
}

export const FEEDS = Object.freeze({
  sip: Object.freeze({ vitae: 25, relief: true }),
  drink: Object.freeze({ vitae: 30, relief: true }),
  drain: Object.freeze({ vitae: 60, relief: true }),
  tap: Object.freeze({ vitae: 20, relief: false }),
  vial: Object.freeze({ vitae: 18, relief: false }),
  wound: Object.freeze({ vitae: 4, relief: true }),
});

export const KISS_SLIP = Object.freeze([0, 0, 5, 20, 40]);

/** @param {number} vitae @param {number} gain @param {{ fresh?: boolean }} [o] */
export function vitaeAfterFeed(vitae, gain, { fresh = true } = {}) {
  const v = Math.max(0, Math.min(VITAE_MAX, (Number(vitae) || 0) + gain));
  if (fresh) return v;
  const stage = beastStageOf(vitae);
  return stage >= BEAST.Ravenous ? Math.min(v, BEAST_FLOOR[BEAST.Hungry] - 1) : v;
}

/**
 * @param {{ type: string, quality: number } | null} held
 * @param {string} type
 * @param {number} quality
 * @param {{ fresh?: boolean, staleCap?: number }} [o]
 */
export function bloodAfterFeed(held, type, quality, { fresh = true, staleCap = STALE_QUALITY_CAP } = {}) {
  const q = Math.max(1, Math.min(fresh ? 100 : staleCap, Math.round(quality)));
  if (!held || q >= (held.quality ?? 0)) return { type, quality: q };
  return { ...held };
}
