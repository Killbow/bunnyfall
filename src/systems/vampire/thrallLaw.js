// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 2 (2026-11-20, the owner's blueprint section 6): THRALLCRAFT'S LAW. Pure numbers and
// rules, no DOM, no clock, no host - the state (thralls.js), the Haven window (ui/vampire/havenWindow.js) and the capture
// (scenes/vampire/vampireFeed.js, the foe pools' death arms) read them here.
//
// BLOOD SLOTS: every thrall - a prisoner, a servant, a social thrall - holds one of the vampire's slots (bloodSlots, by
// level). A servant walks at the vampire's side only as ACTIVE FOLLOWER (one at a time, a companion slot besides).
// UPKEEP: each day of the character's own clock a servant drinks SERVANT_UPKEEP Vitae and a social thrall SOCIAL_UPKEEP;
// what the Vitae cannot pay, the thrall's LOYALTY pays (LOYALTY_UNPAID). At nought a servant leaves and a social thrall
// breaks free and talks. A prisoner drinks nothing: it is fed (TEND) or it sickens (PRISONER_DAY).
// PRISONERS keep HEALTH and MISERY (0-100): drunk from or bled into a vial, health falls and misery rises; high misery
// may kill one under the knife (deathChance); tended, both mend. Their blood is STALE (bloodLaw.js STALE_QUALITY_CAP).
// SERVANTS: a prisoner made a vampiric thrall; its blood quality is its EXPERTISE (thrallRank, 1-5: the gear it may bear
// and its errands' yield). Duties: follower, haven guard (prisoners do not escape, misery grows slower), errand runner.
// ERRANDS (ERRANDS): by day only, a few game hours on the world's clock, each with its haul.
// SOCIAL THRALLS: a townsperson enthralled where they stand - an innkeeper, a watchman or a merchant (socialRoleOf) -
// each with a perk in their own town (or, a merchant, by courier anywhere).

import { ARCHETYPES } from './bloodLaw.js';

/** Blood slots by level: two, and one more each six levels, to SLOTS_MAX. @param {number} level */
export const bloodSlots = (level) => Math.min(SLOTS_MAX, 2 + Math.floor(Math.max(1, Number(level) || 1) / 6));
export const SLOTS_MAX = 6;
/** Prisoners a Haven holds at once (within the slots). */
export const PRISONERS_MAX = 4;

/** Vitae a day. */
export const SERVANT_UPKEEP = 4;
export const SOCIAL_UPKEEP = 3;
/** Loyalty (0-100): a new thrall's, a day unpaid's cost, a day paid's gain. */
export const LOYALTY_START = 70;
export const LOYALTY_UNPAID = 25;
export const LOYALTY_PAID = 5;

/** What making a servant or a social thrall costs in Vitae. */
export const BIND_COST = 15;
export const ENTHRALL_COST = 20;

/** A prisoner's day: misery grows (less under a guard), health mends a little; at full misery one may escape. */
export const PRISONER_DAY = Object.freeze({ misery: 6, miseryGuarded: 3, health: 4, escapeChance: 35 });
/** Drunk from directly: the Vitae (stale), and what it costs the prisoner. */
export const TAP = Object.freeze({ vitae: 20, health: 20, misery: 15 });
/** Bled into a vial. */
export const BOTTLE = Object.freeze({ health: 15, misery: 10 });
/** Tended (a provision, else TEND_GOLD gold): health and misery mended. */
export const TEND = Object.freeze({ health: 25, misery: 20 });
export const TEND_GOLD = 25;
/** The chance in a hundred that a prisoner dies under the knife: none under 60 misery or over 25 health. */
export function deathChance(health, misery) {
  if (health <= 0) return 100;
  const m = Math.max(0, misery - 60) * 1.2;
  const h = Math.max(0, 25 - health) * 2;
  return Math.min(90, Math.round(m + h));
}
/** A vial drunk: its Vitae (stale, bloodLaw.js vitaeAfterFeed's fresh false). */
export const VIAL_VITAE = 18;

/** A servant's rank (1-5) from its blood quality - its expertise. @param {number} quality */
export const thrallRank = (quality) => Math.max(1, Math.min(5, 1 + Math.floor((Number(quality) || 0) / 22)));

/** The duties. */
export const DUTIES = Object.freeze({ Follow: 'follow', Guard: 'guard', Errand: 'errand', Idle: 'idle' });

/** THE ERRANDS: `hours` of the world's clock away (game hours: online a game hour is two and a half real minutes);
 *  each answers its haul by the thrall's rank (`haul(rank, roll)`). By day only (`byDay`). */
export const ERRANDS = Object.freeze({
  forage: Object.freeze({ hours: 4, haul: (rank, roll) => ({ provisions: 1 + Math.floor(rank / 2) + (roll < 0.5 ? 1 : 0) }) }),
  market: Object.freeze({ hours: 6, haul: (rank, roll) => ({ gold: Math.round((40 + rank * 30) * (0.7 + roll * 0.6)) }) }),
  scout: Object.freeze({ hours: 5, haul: (rank, roll) => ({ scouted: Math.min(30, 8 + rank * 4 + Math.floor(roll * 6)) }) }),
});
export const ERRAND_KEYS = Object.freeze(/** @type {Array<keyof typeof ERRANDS>} */ (Object.keys(ERRANDS)));

/** SOCIAL ROLES by a Living World job (census.js JOBS), or null for one who keeps no post worth enthralling. */
const ROLE_OF_JOB = Object.freeze({
  innkeeper: 'innkeeper', server: 'innkeeper',
  guard: 'guard', patrol: 'guard',
  keeper: 'merchant', smith: 'merchant', merchant: 'merchant', pedlar: 'merchant', clerk: 'merchant',
});
/** @param {any} person */
export function socialRoleOf(person) {
  const res = person?.living?.res;
  if (res?.guard) return 'guard';
  const job = res?.job ?? null;
  return (job && ROLE_OF_JOB[job]) || null;
}
/** A merchant thrall's prices. */
export const MERCHANT = Object.freeze({ provision: 10, vial: 60, vialQuality: 40 });

/** A class foe's blood (MOBILE_TYPES 128-145). @param {number} mobileType */
export function archetypeOfFoe(mobileType) {
  switch (mobileType) {
    case 128: case 130: case 131: case 132: return ARCHETYPES.Scholar;   // Mage, Battlemage, Sorcerer, Healer
    case 133: case 135: case 136: case 137: case 138: case 139: case 141: case 142: return ARCHETYPES.Rogue;   // Nightblade .. Ranger
    case 134: return ARCHETYPES.Noble;   // Bard
    case 140: case 143: return ARCHETYPES.Worker;   // Monk, Barbarian
    default: return ARCHETYPES.Warrior;   // Spellsword, Warrior, Knight, the watch
  }
}
/** A foe's blood quality from its level, and a roll (0-1). */
export const qualityOfFoe = (level, roll) => Math.max(1, Math.min(100, 20 + Math.round((Number(level) || 1) * 3) + Math.floor(roll * 25)));

/** The body a townsperson's thrall walks in: their own class, else their blood's. @param {string} type @param {number|null} [cls] */
export function mobileOfThrall(type, cls = null) {
  if (Number.isInteger(cls) && cls >= 128 && cls <= 145) return cls;
  switch (type) {
    case ARCHETYPES.Scholar: return 128;
    case ARCHETYPES.Rogue: return 136;
    case ARCHETYPES.Noble: return 134;
    case ARCHETYPES.Worker: return 143;
    default: return 144;
  }
}
/** May a foe be subdued (captured instead of killed)? A class foe - a person - never the city watch (146). */
export const subduableFoe = (mobileType) => Number.isInteger(mobileType) && mobileType >= 128 && mobileType <= 145;
