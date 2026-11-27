// @ts-check
import { ARCHETYPES } from './bloodLaw.js';

/** @param {number} level */
export const bloodSlots = (level) => Math.min(SLOTS_MAX, 2 + Math.floor(Math.max(1, Number(level) || 1) / 6));
export const SLOTS_MAX = 6;
export const PRISONERS_MAX = 4;

export const SERVANT_UPKEEP = 4;
export const SOCIAL_UPKEEP = 3;
export const LOYALTY_START = 70;
export const LOYALTY_UNPAID = 15;
export const LOYALTY_PAID = 5;

export const BIND_COST = 15;
export const ENTHRALL_COST = 20;

export const PRISONER_DAY = Object.freeze({ misery: 6, miseryGuarded: 3, health: 4, escapeChance: 35 });
export const TAP = Object.freeze({ vitae: 20, health: 20, misery: 15 });
export const BOTTLE = Object.freeze({ health: 15, misery: 10 });
export const TEND = Object.freeze({ health: 25, misery: 20 });
export const TEND_GOLD = 25;
export function deathChance(health, misery) {
  if (health <= 0) return 100;
  const m = Math.max(0, misery - 60) * 1.2;
  const h = Math.max(0, 25 - health) * 2;
  return Math.min(90, Math.round(m + h));
}
export const VIAL_VITAE = 18;

/** @param {number} quality */
export const thrallRank = (quality) => Math.max(1, Math.min(5, 1 + Math.floor((Number(quality) || 0) / 22)));

export const DUTIES = Object.freeze({ Follow: 'follow', Guard: 'guard', Errand: 'errand', Idle: 'idle' });

export const ERRANDS = Object.freeze({
  forage: Object.freeze({ hours: 4, haul: (rank, roll) => ({ provisions: 1 + Math.floor(rank / 2) + (roll < 0.5 ? 1 : 0) }) }),
  market: Object.freeze({ hours: 6, haul: (rank, roll) => ({ gold: Math.round((40 + rank * 30) * (0.7 + roll * 0.6)) }) }),
  scout: Object.freeze({ hours: 5, haul: (rank, roll) => ({ scouted: Math.min(30, 8 + rank * 4 + Math.floor(roll * 6)) }) }),
});
export const ERRAND_KEYS = Object.freeze(/** @type {Array<keyof typeof ERRANDS>} */ (Object.keys(ERRANDS)));

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
export const MERCHANT = Object.freeze({ provision: 10, vial: 60, vialQuality: 40 });

// Case values are class enemy mobile types (characters/mobileTypes.js), from 128 Mage to 145 Knight.
/** @param {number} mobileType */
export function archetypeOfFoe(mobileType) {
  switch (mobileType) {
    case 128: case 130: case 131: case 132: return ARCHETYPES.Scholar;
    case 133: case 135: case 136: case 137: case 138: case 139: case 141: case 142: return ARCHETYPES.Rogue;
    case 134: return ARCHETYPES.Noble;
    case 140: case 143: return ARCHETYPES.Worker;
    default: return ARCHETYPES.Warrior;
  }
}
export const qualityOfFoe = (level, roll) => Math.max(1, Math.min(100, 20 + Math.round((Number(level) || 1) * 3) + Math.floor(roll * 25)));

/** @param {string} type @param {number|null} [cls] */
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
export const subduableFoe = (mobileType) => Number.isInteger(mobileType) && mobileType >= 128 && mobileType <= 145;
