// @ts-check
import { MOBILE_TYPES as M } from '../../characters/mobileTypes.js';
import { lwSeed, textSeed } from './seed.js';
import { MAGES_GUILD, FIGHTERS_GUILD, ORDER_FACTIONS } from './dayPlan.js';

export const GUILD_CLASSES = Object.freeze({
  [MAGES_GUILD]: Object.freeze([M.Mage, M.Healer, M.Sorcerer, M.Battlemage, M.Spellsword, M.Nightblade]),
  [FIGHTERS_GUILD]: Object.freeze([M.Warrior, M.Barbarian, M.Archer, M.Ranger, M.Monk, M.Knight]),
});
export const PRIEST_CLASS = M.Healer;

/**
 * @param {{ id: string, job: string, cls: number|null, faction?: number }} res
 * @returns {number|null}
 */
export function townClassOf(res) {
  if (res.cls != null) return res.cls;
  if (res.job === 'priest') return PRIEST_CLASS;
  if (res.job !== 'guildsman') return null;
  const f = res.faction ?? 0;
  if (ORDER_FACTIONS.has(f)) return M.Knight;
  const list = /** @type {readonly number[]|undefined} */ (GUILD_CLASSES[/** @type {keyof typeof GUILD_CLASSES} */ (f)]);
  return list ? list[lwSeed(textSeed(res.id), 0x636c7373) % list.length] : null;
}

// Each entry is a Daggerfall NPC flat (archive, record). Flats that ChildGard censors, and flats more than a tenth
// taller than the 2.15 m walkers, are left out.
export const STILL_FLATS = Object.freeze({
  beggar: Object.freeze({ male: Object.freeze([[182, 21], [182, 29], [184, 27], [182, 30], [182, 31], [182, 14], [182, 16]]), female: Object.freeze([[182, 44], [183, 15]]) }),
  merchant: Object.freeze({ male: Object.freeze([[184, 0], [183, 16], [184, 16], [180, 3], [182, 1], [182, 3], [182, 2], [182, 0]]), female: Object.freeze([[182, 27], [182, 11], [180, 0]]) }),
  crafter: Object.freeze({ male: Object.freeze([[182, 59], [182, 7], [182, 8], [184, 17], [184, 16], [182, 1], [182, 3], [182, 2]]), female: Object.freeze([[182, 26], [182, 12], [182, 11], [180, 0]]) }),
  labourer: Object.freeze({ male: Object.freeze([[184, 17], [182, 39], [182, 19], [182, 20], [182, 23], [182, 17]]), female: Object.freeze([[182, 12], [182, 26], [184, 26]]) }),
  fisher: Object.freeze({ male: Object.freeze([[182, 25], [182, 35]]), female: Object.freeze([[182, 12], [184, 26]]) }),
  priest: Object.freeze({ male: Object.freeze([[183, 12], [182, 22], [181, 2]]), female: Object.freeze([[182, 56], [182, 28], [182, 9], [182, 10]]) }),
  court: Object.freeze({ male: Object.freeze([[180, 2], [183, 4], [175, 14], [182, 15], [183, 5], [182, 40]]), female: Object.freeze([[180, 1], [182, 47], [184, 5], [184, 29], [182, 27]]) }),
});

const STALL_ROLE = Object.freeze({ merchant: 'merchant', crafter: 'crafter', fisher: 'fisher', labourer: 'labourer' });

/**
 * @param {{ job: string, work: number|null }} res
 * @param {{ kind: string, at?: { building?: number } | null } | null | undefined} e
 * @returns {keyof typeof STILL_FLATS | null}
 */
export function stillRoleOf(res, e) {
  if (!e) return null;
  if (e.kind === 'beg') return 'beggar';
  if (e.kind === 'stall') return /** @type {any} */ (STALL_ROLE[/** @type {keyof typeof STALL_ROLE} */ (res.job)] ?? null);
  if (res.job === 'priest' && e.kind === 'social' && res.work != null && e.at?.building === res.work) return 'priest';
  return null;
}

/**
 * @param {{ id: string, sex: 'male'|'female' }} res
 * @param {keyof typeof STILL_FLATS} role
 * @returns {{ archive: number, record: number }}
 */
export function stillFlatOf(res, role) {
  const list = STILL_FLATS[role][res.sex === 'female' ? 'female' : 'male'];
  const [archive, record] = list[lwSeed(textSeed(res.id), 0x7374696c) % list.length];
  return { archive, record };
}
