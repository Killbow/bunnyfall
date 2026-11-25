// @ts-check
// CAVERNS-MINING-LOGGING: THE CAVERN EXPEDITION'S LAW - pure, read by the client (professions/expedition.js, the Society's
// survey contracts) and, through net/nodeLaw.js dungeonVein, by the account service (it recomputes every dungeon vein).
//
// A DUNGEON'S DAY VEINS ARE A CHAIN. Its last slot, when it holds two or more, is the SEAM: the deep vein the others
// lead to, which the day's other veins - the TRACES - point toward once one is worked. A lone vein is only a vein. The
// seam is the better of two draws from the deep table (so it runs richer than a trace), and on about one cavern-day in
// RICH_ONE_IN it is a RICH seam of a magical ore (RICH_ORES) that no known route holds.
//
// A CAVERN has a KIND, fixed by its id and never changing: what reaching its seam asks of the miner. A dry cavern asks
// only a pick; a dark one a light; a sheer one a grappling hook; a shored one a partner standing by. Every kind's tool
// is one a player already can own (a Torch or Lantern, the Grappling Hook, a party member), so the lesson is what to bring.
//
// No DOM, no network, no clock: the mix is the gate's own (gateLaw.js gateHash).
import { gateHash } from './gateLaw.js';

/** This law's own salt, apart from the nodes'. */
export const EXPEDITION_SALT = 0x4e58;
/** A cavern-day's seam is rich one time in this many. */
export const RICH_ONE_IN = 8;
/** The magical ores a rich seam draws from (Mining 70 or 90 works them: tiers 5 and 6). */
export const RICH_ORES = Object.freeze(['ore:mithril', 'ore:ebony', 'ore:orichalcum', 'ore:adamantium']);
/** The caverns' kinds and their weights in a hundred. */
export const CAVERN_KINDS = Object.freeze(['dry', 'dark', 'sheer', 'shored']);
export const CAVERN_WEIGHTS = Object.freeze([40, 20, 20, 20]);
/** How near, in metres, a partner must stand while a shored seam is struck. */
export const PARTNER_M = 15;

const roll = (/** @type {number} */ dungeon, /** @type {number} */ day, /** @type {number} */ k) => gateHash(EXPEDITION_SALT, dungeon, 0, day, 0, k) / 4294967296;

/** The slot of a dungeon's seam given how many veins it holds that day, or -1 where there is none. */
export const seamSlot = (/** @type {number} */ count) => (count >= 2 ? count - 1 : -1);

/** A cavern's kind: fixed by its id alone. */
export function cavernKind(/** @type {number} */ dungeon) {
  let at = roll(dungeon, 0, 1) * 100;
  for (let i = 0; i < CAVERN_KINDS.length; i++) { if (at < CAVERN_WEIGHTS[i]) return CAVERN_KINDS[i]; at -= CAVERN_WEIGHTS[i]; }
  return 'dry';
}

/** Whether a cavern-day's seam is rich. */
export const richSeam = (/** @type {number} */ dungeon, /** @type {number} */ day) => Math.floor(roll(dungeon, day, 2) * RICH_ONE_IN) === 0;
/** The magical ore of a cavern-day's rich seam. */
export const richOre = (/** @type {number} */ dungeon, /** @type {number} */ day) => RICH_ORES[Math.min(RICH_ORES.length - 1, Math.floor(roll(dungeon, day, 3) * RICH_ORES.length))];
/** A unit roll for the seam's second draw: the better of two. */
export const seamSecondDraw = (/** @type {number} */ dungeon, /** @type {number} */ day, /** @type {number} */ k) => roll(dungeon, day, 4 + k);

/** What reaching a kind's seam asks: `need` is the thing, `words` what the miner reads. */
export const SEAM_NEEDS = Object.freeze({
  dry: Object.freeze({ need: 'pick', words: 'The seam lies open to a pick.' }),
  dark: Object.freeze({ need: 'light', words: 'The seam lies in the dark: you need a light in your pack.' }),
  sheer: Object.freeze({ need: 'hook', words: 'The seam lies up a sheer face: you need a Grappling Hook in your pack.' }),
  shored: Object.freeze({ need: 'partner', words: 'The seam is loose rock: a partner must stand by to shore it.' }),
});

/**
 * What the seam asks, met or not.
 * @param {string} kind a cavern's kind
 * @param {{ light?: boolean, hook?: boolean, partner?: boolean }} have what the miner has
 * @returns {string|null} the refusal's words, or null where the seam may be worked
 */
export function seamRefusal(kind, have) {
  const need = SEAM_NEEDS[/** @type {keyof typeof SEAM_NEEDS} */ (kind)] ?? SEAM_NEEDS.dry;
  if (need.need === 'light' && !have.light) return need.words;
  if (need.need === 'hook' && !have.hook) return need.words;
  if (need.need === 'partner' && !have.partner) return need.words;
  return null;
}

const COMPASS = Object.freeze(['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']);
/** The compass word for a vector in the dungeon's own space (x east, z north). */
export const compassWord = (/** @type {number} */ dx, /** @type {number} */ dz) => COMPASS[(Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) + 8) % 8];
/** A lead from a trace to the seam: its heading and its distance in paces (a pace is 0.75 m, rounded to ten). */
export function leadOf(/** @type {number[]} */ from, /** @type {number[]} */ to) {
  const dx = to[0] - from[0], dz = to[2] - from[2];
  return { heading: compassWord(dx, dz), paces: Math.max(10, Math.round(Math.hypot(dx, dz) / 0.75 / 10) * 10) };
}

/** THE SOCIETY'S PRICE FOR A CAVERN'S NOTES: by the seam's ore tier, a rich seam's bonus and the kind (a harder cavern
 *  pays more), scaled by the member's rank like a survey. */
export const NOTE_BASE_GOLD = 60;
export const NOTE_TIER_GOLD = 25;
export const NOTE_RICH_MULT = 3;
export const NOTE_KIND_MULT = Object.freeze({ dry: 1, dark: 1.25, sheer: 1.5, shored: 1.5 });
/**
 * @param {{ tier: number, rich: boolean, kind: string }} note
 * @param {number} rank -1 for none
 */
export function cavernNotePay(note, rank) {
  const kindMult = NOTE_KIND_MULT[/** @type {keyof typeof NOTE_KIND_MULT} */ (note.kind)] ?? 1;
  const base = (NOTE_BASE_GOLD + NOTE_TIER_GOLD * Math.max(0, note.tier)) * kindMult * (note.rich ? NOTE_RICH_MULT : 1);
  return Math.round(base * (1 + 0.1 * Math.max(0, rank)));
}
