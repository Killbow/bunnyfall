// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 1 (2026-11-20, the owner's blueprint "Bunnyfall - Vampire Expansion": Vitae, the
// Beast, Blood Sight, feeding and its consequences): THE BLOOD'S LAW. Pure numbers and rules, no DOM, no clock, no host:
// the curse's state (systems/vampire/vitae.js) and the feeding (scenes/vampire/vampireFeed.js) read them here.
//
// VITAE is the vampire's blood, 0 to VITAE_MAX. It runs down with the character's own clock (VITAE_DRAIN_PER_DAY), is
// spent on the Kiss (MIND_CLOUD_COST), and comes back by feeding. As it falls THE BEAST rises through five stages
// (beastStageOf): Sated, Thirsty, Hungry, Ravenous, Starving. Each stage moves the curse's stats (BEAST_STAT_MODS); a
// Starving vampire cannot rest (the old "fed within a day" rule, replaced for an awakened vampire).
//
// BLOOD has an ARCHETYPE (who it came from: archetypeOfPerson) and a QUALITY % (qualityOfPerson, the same for every
// reader of the same person). The last good feed sets the vampire's blood, and its quality buys RESONANCE: tiers at
// 25/50/75/95 % (resonanceTier), each tier a little more of the archetype's gift (RESONANCE_STAT_MODS,
// RESONANCE_SKILL_MODS). Resonance fades by BLOOD_FADE_PER_DAY a day.
//
// FRESH AND STALE (blueprint section 2): only fresh, living blood reaches the top tiers. Stale blood (prisoners and
// bottled Vitae, Phase 2) is capped at STALE_QUALITY_CAP and cannot quiet a Ravenous or Starving Beast. Phase 1 feeds
// are all fresh; the cap is here so Phase 2 has one law to read.
//
// Kept on the curse entry (systems/vampirism.js createVampirismCurse's `activeEffects` row), so it rides the save.

import { t } from '../textManager.js';
import { SKILLS } from '../skills.js';

/** The most Vitae a vampire holds. */
export const VITAE_MAX = 100;
/** The Vitae an awakened vampire starts with (the Elder's gift). */
export const VITAE_AWAKENED = 75;
/** Vitae lost per day of the character's own clock (online: a day is one real hour). Full to empty in about three days. */
export const VITAE_DRAIN_PER_DAY = 30;
/** The Kiss (Mind-Cloud): Vitae spent to cloud a victim's memory. */
export const MIND_CLOUD_COST = 8;

/** The Beast's stages. */
export const BEAST = Object.freeze({ Sated: 0, Thirsty: 1, Hungry: 2, Ravenous: 3, Starving: 4 });
/** The least Vitae each stage holds at (Sated from 70, Starving under 10). */
export const BEAST_FLOOR = Object.freeze([70, 45, 25, 10, 0]);

/** The stage a Vitae falls in. @param {number} vitae */
export function beastStageOf(vitae) {
  const v = Number.isFinite(vitae) ? vitae : 0;
  for (let s = 0; s < BEAST_FLOOR.length; s++) if (v >= BEAST_FLOOR[s]) return s;
  return BEAST.Starving;
}

/** What each stage does to the curse's stats, on top of the day's or night's +/-20. A Sated vampire passes for mortal;
 *  a Ravenous one is stronger and hard to talk to; a Starving one is a monster. */
export const BEAST_STAT_MODS = Object.freeze([
  Object.freeze({ personality: 5 }),
  Object.freeze({}),
  Object.freeze({ personality: -5 }),
  Object.freeze({ personality: -15, strength: 10, speed: 5 }),
  Object.freeze({ personality: -30, strength: 15, speed: 10, willpower: -10 }),
]);

/** The stage's name, in the player's language. @param {number} stage */
export function beastStageName(stage) {
  switch (stage) {
    case BEAST.Sated: return t('vampire.beast.sated', 'Sated');
    case BEAST.Thirsty: return t('vampire.beast.thirsty', 'Thirsty');
    case BEAST.Hungry: return t('vampire.beast.hungry', 'Hungry');
    case BEAST.Ravenous: return t('vampire.beast.ravenous', 'Ravenous');
    default: return t('vampire.beast.starving', 'Starving');
  }
}

/** What the Beast whispers as it reaches a stage, said once on the way down. @param {number} stage */
export function beastStageLine(stage) {
  switch (stage) {
    case BEAST.Thirsty: return t('vampire.beast.thirstyLine', 'A thirst stirs in you. Your skin pales.');
    case BEAST.Hungry: return t('vampire.beast.hungryLine', 'The Beast whispers. Mortals notice your eyes.');
    case BEAST.Ravenous: return t('vampire.beast.ravenousLine', 'You are Ravenous. The Beast pulls at its chain.');
    case BEAST.Starving: return t('vampire.beast.starvingLine', 'You are Starving. Feed, or the Beast will not let you rest.');
    default: return '';
  }
}

// ---- blood archetypes ----

/** The six archetypes of blood. */
export const ARCHETYPES = Object.freeze({ Scholar: 'scholar', Warrior: 'warrior', Rogue: 'rogue', Noble: 'noble', Worker: 'worker', Beast: 'beast' });

/** The archetype's name, in the player's language. @param {string} a */
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

/** A Living World job's blood (systems/livingWorld/census.js JOBS). Anyone else's is a Worker's. */
const JOB_ARCHETYPE = Object.freeze({
  scholar: ARCHETYPES.Scholar, priest: ARCHETYPES.Scholar, clerk: ARCHETYPES.Scholar, pilgrim: ARCHETYPES.Scholar,
  guard: ARCHETYPES.Warrior, mercenary: ARCHETYPES.Warrior, patrol: ARCHETYPES.Warrior, retainer: ARCHETYPES.Warrior, smith: ARCHETYPES.Warrior,
  adventurer: ARCHETYPES.Rogue, courier: ARCHETYPES.Rogue, hunter: ARCHETYPES.Rogue, minstrel: ARCHETYPES.Rogue, beggar: ARCHETYPES.Rogue,
  noble: ARCHETYPES.Noble, courtier: ARCHETYPES.Noble, merchant: ARCHETYPES.Noble, guildsman: ARCHETYPES.Noble, keeper: ARCHETYPES.Noble, innkeeper: ARCHETYPES.Noble,
});
/** The richer jobs' blood is better on average (added to the quality roll). */
const JOB_QUALITY_BONUS = Object.freeze({ noble: 20, courtier: 15, merchant: 10, guildsman: 8, scholar: 8, priest: 6, adventurer: 6, patrol: 6 });

/** A townsperson's blood archetype: their Living World job, else a Worker's. @param {any} person */
export function archetypeOfPerson(person) {
  const job = person?.living?.res?.job ?? person?.job ?? null;
  return (job && JOB_ARCHETYPE[job]) || ARCHETYPES.Worker;
}

/** A small stable hash of a string (FNV-1a), for a person's quality. @param {string} s */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** The chance in a hundred of a rare gem: blood far better than its owner's station. */
export const GEM_CHANCE = 5;

/** A townsperson's blood quality, 1-100 - the same for every reader of the same person (their Living World id, else
 *  their name): 15-85 from the roll, their job's bonus, and now and then a gem (+25). @param {any} person */
export function qualityOfPerson(person) {
  const key = String(person?.living?.id ?? person?.nameNPC ?? person?.name ?? 'stranger');
  const h = hash32(`blood:${key}`);
  const job = person?.living?.res?.job ?? null;
  let q = 15 + (h % 71) + (job ? JOB_QUALITY_BONUS[job] ?? 0 : 0);
  if (((h >>> 8) % 100) < GEM_CHANCE) q += 25;
  return Math.max(1, Math.min(100, q));
}

/** A creature's blood quality from its level: 30 at level 1, to 90. @param {number} level */
export const qualityOfCreature = (level) => Math.max(1, Math.min(90, 30 + Math.round((Number(level) || 1) * 3)));

// ---- resonance ----

/** The quality each resonance tier begins at. */
export const RESONANCE_TIERS = Object.freeze([25, 50, 75, 95]);
/** Stale blood's quality ceiling (Phase 2: prisoners and bottled Vitae). */
export const STALE_QUALITY_CAP = 65;
/** The resonance's quality lost per day of the character's own clock. */
export const BLOOD_FADE_PER_DAY = 10;

/** The tier (0-4) a quality reaches. @param {number} quality */
export function resonanceTier(quality) {
  let n = 0;
  for (const at of RESONANCE_TIERS) if (quality >= at) n++;
  return n;
}

/** Each archetype's gift per tier: stats... */
export const RESONANCE_STAT_MODS = Object.freeze({
  [ARCHETYPES.Scholar]: Object.freeze({ intelligence: 3, willpower: 2 }),
  [ARCHETYPES.Warrior]: Object.freeze({ strength: 3, endurance: 2 }),
  [ARCHETYPES.Rogue]: Object.freeze({ agility: 3, speed: 2 }),
  [ARCHETYPES.Noble]: Object.freeze({ personality: 4, luck: 1 }),
  [ARCHETYPES.Worker]: Object.freeze({ endurance: 3, strength: 1 }),
  [ARCHETYPES.Beast]: Object.freeze({ speed: 2, endurance: 2 }),
});
/** ...and skills. */
export const RESONANCE_SKILL_MODS = Object.freeze({
  [ARCHETYPES.Scholar]: Object.freeze({ [SKILLS.Destruction]: 3, [SKILLS.Mysticism]: 3 }),
  [ARCHETYPES.Warrior]: Object.freeze({ [SKILLS.LongBlade]: 3, [SKILLS.BluntWeapon]: 3 }),
  [ARCHETYPES.Rogue]: Object.freeze({ [SKILLS.Stealth]: 3, [SKILLS.Lockpicking]: 3 }),
  [ARCHETYPES.Noble]: Object.freeze({ [SKILLS.Etiquette]: 3, [SKILLS.Mercantile]: 3 }),
  [ARCHETYPES.Worker]: Object.freeze({ [SKILLS.Climbing]: 3, [SKILLS.Swimming]: 3 }),
  [ARCHETYPES.Beast]: Object.freeze({ [SKILLS.HandToHand]: 4, [SKILLS.Jumping]: 3 }),
});

/** What one sentence says of the gift, for the feed box and the status tile. @param {string} a */
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

// ---- feeding ----

/** The ways to feed, and what each gives. `vitae` the Vitae it gives; `relief` whether it quiets a Ravenous or Starving
 *  Beast (fresh blood only). */
export const FEEDS = Object.freeze({
  /** A sleeper, or one clouded by the Kiss: a quiet drink. */
  sip: Object.freeze({ vitae: 25, relief: true }),
  /** Drunk awake and left weakened. */
  drink: Object.freeze({ vitae: 30, relief: true }),
  /** Drained to death: the most, and the worst. */
  drain: Object.freeze({ vitae: 60, relief: true }),
  /** A landed blow on a creature or a foe: a mouthful in the fight. */
  wound: Object.freeze({ vitae: 2, relief: false }),
});

/** Whether a Ravenous or Starving Beast lets you feed with a cool head: at those stages the Kiss is harder. The chance
 *  in a hundred that the Kiss fails (the victim remembers) at each stage. */
export const KISS_SLIP = Object.freeze([0, 0, 5, 20, 40]);

/** The new Vitae after a feed (never past VITAE_MAX). A stale feed cannot lift the Vitae out of the Ravenous band.
 *  @param {number} vitae @param {number} gain @param {{ fresh?: boolean }} [o] */
export function vitaeAfterFeed(vitae, gain, { fresh = true } = {}) {
  const v = Math.max(0, Math.min(VITAE_MAX, (Number(vitae) || 0) + gain));
  if (fresh) return v;
  const stage = beastStageOf(vitae);
  return stage >= BEAST.Ravenous ? Math.min(v, BEAST_FLOOR[BEAST.Hungry] - 1) : v;
}

/** The blood a feed leaves the vampire with: the new blood when its quality beats the faded one held, else the one held.
 *  @param {{ type: string, quality: number } | null} held @param {string} type @param {number} quality
 *  @param {{ fresh?: boolean }} [o] */
export function bloodAfterFeed(held, type, quality, { fresh = true } = {}) {
  const q = Math.max(1, Math.min(fresh ? 100 : STALE_QUALITY_CAP, Math.round(quality)));
  if (!held || q >= (held.quality ?? 0)) return { type, quality: q };
  return { ...held };
}
