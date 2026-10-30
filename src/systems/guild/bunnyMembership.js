// @ts-check
// BUNNY-GUILDS (Phase 0d): WHO BELONGS TO BUNNYFALL'S GUILDS, AND AT WHAT RANK.
//
// A character's own book of these guilds, kept in its save (DFU's per-mod save slot, systems/modSaveData.js, under
// BUNNY_GUILDS_VENDOR) beside Daggerfall's own membership books, never inside them: Daggerfall's guild code walks its
// books and knows none of these. The Roll hears them as it hears the others (net/npcRollTracker.js rollEntityDoors), so
// a member's chapter counts its Merit and its seats.
//
// THE RANK is the reputation's, as Daggerfall's guilds read it (Guild.cs's ten rows, guildFactions.js
// RANK_REQ_REPUTATION): a member rises to the highest rank the guild's reputation meets, read whenever they visit a hall,
// and never past 7 - ranks 8 and 9 are a chapter's seats, the Turning's to give (Chapters-Arc 3.5). A rank is never
// taken away by a falling reputation; leaving is the member's own choice.

import { registerModSaveData } from '../modSaveData.js';
import { RANK_REQ_REPUTATION } from './guildFactions.js';
import { getReputation } from '../faction/factionRep.js';
import { bunnyGuildOfKey, BUNNY_GUILDS, bunnyGuildsOn } from './bunnyGuilds.js';

/** The save record's vendor. */
export const BUNNY_GUILDS_VENDOR = 'BunnyGuilds';
/** The highest rank a visit gives: 8 and 9 are seats. */
export const BUNNY_RANK_CEILING = 7;
/** The reputation a guild takes a new member at (rank 0's need). */
export const BUNNY_JOIN_REP = RANK_REQ_REPUTATION[0];

/** @typedef {{ rank: number, joinedAt: number }} BunnyMembership */
/** @type {Record<string, BunnyMembership>} */
let book = {};

/** The book as the save keeps it, each line checked: a known guild, a whole rank 0..9, a time. */
export function bunnyBookOf(/** @type {unknown} */ rec) {
  /** @type {Record<string, BunnyMembership>} */
  const out = {};
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return out;
  for (const [key, m] of Object.entries(rec)) {
    const rank = /** @type {any} */ (m)?.rank, at = /** @type {any} */ (m)?.joinedAt;
    if (!bunnyGuildOfKey(key) || !Number.isSafeInteger(rank) || rank < 0 || rank > 9) continue;
    out[key] = { rank, joinedAt: Number.isSafeInteger(at) ? at : 0 };
  }
  return out;
}

/** Register the save record - once, at boot (bunnyGuilds.js installBunnyGuilds, online only). */
export function registerBunnyMembership(search = undefined) {
  if (!bunnyGuildsOn(search)) return;
  registerModSaveData(BUNNY_GUILDS_VENDOR, {
    newSaveData: () => ({}),
    getSaveData: () => ({ ...book }),
    restoreSaveData: (rec) => { book = bunnyBookOf(rec); },
  });
}

/** A guild's line of the book, or null. */
export const bunnyMembershipOf = (/** @type {string} */ key) => book[key] ?? null;
/** Every guild the character belongs to, by key. */
export const bunnyMemberships = () => ({ ...book });

/** The highest rank a reputation meets, up to the ceiling. */
export function bunnyRankFor(/** @type {number} */ rep) {
  let rank = 0;
  for (let i = 0; i <= BUNNY_RANK_CEILING; i++) if (rep >= RANK_REQ_REPUTATION[i]) rank = i;
  return rank;
}

/** The character's reputation with a guild (its faction in the player's dictionary; 0 where it has none). */
export const bunnyRepOf = (/** @type {any} */ entity, /** @type {string} */ key) => {
  const g = bunnyGuildOfKey(key);
  return g && entity?.factionRep ? getReputation(entity.factionRep, g.factionId) : 0;
};

/** Join: answers 'joined', 'already', or 'refused' (the reputation under the guild's need). */
export function joinBunnyGuild(/** @type {any} */ entity, /** @type {string} */ key, nowS = Math.floor(Date.now() / 1000)) {
  if (!bunnyGuildOfKey(key)) return 'refused';
  if (book[key]) return 'already';
  if (bunnyRepOf(entity, key) < BUNNY_JOIN_REP) return 'refused';
  book[key] = { rank: 0, joinedAt: nowS };
  return 'joined';
}

/** Leave: true when the character was a member. */
export function leaveBunnyGuild(/** @type {string} */ key) {
  if (!book[key]) return false;
  delete book[key];
  return true;
}

/** A visit's review: the member rises to what the reputation meets. Answers the new rank where it rose, else null. */
export function reviewBunnyRank(/** @type {any} */ entity, /** @type {string} */ key) {
  const m = book[key];
  if (!m) return null;
  const earned = bunnyRankFor(bunnyRepOf(entity, key));
  if (earned <= m.rank) return null;
  m.rank = earned;
  return earned;
}

/** The memberships as the Roll hears them: `[{ f, rank }]`, by faction. */
export const bunnyRollMembers = () => BUNNY_GUILDS.filter((g) => book[g.key]).map((g) => ({ f: g.factionId, rank: book[g.key].rank }))
  .sort((a, b) => a.f - b.f);

/** For tests: set the book. */
export function _setBunnyBook(/** @type {unknown} */ rec) { book = bunnyBookOf(rec); }
