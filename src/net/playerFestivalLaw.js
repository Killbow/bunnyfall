// @ts-check
// PLAYER-FESTIVALS (2026-10-30, the owner: "players being able to make a festival ... choose what festival to do with a
// custom entry"): A FESTIVAL A PLAYER HOSTS, the one law both ends read (server-account/src/playerFestival.js keeps the
// registry; systems/online/playerFestivals.js is the client's). Not the Witches' Festival (festivalLaw.js): that one is
// the calendar's, this one is a player's. At an innkeeper, a registered account pays gold and names a festival and what
// it is; for FEST_HOURS it stands in that town - on the map, once in chat, and with a small buff for whoever is there.

/** A festival's name and its description, and the town's name the host's client says. */
export const FEST_NAME_MAX = 40;
export const FEST_TEXT_MAX = 140;
export const FEST_TOWN_MAX = 60;
/** What hosting costs, in gold, and how long a festival stands, in seconds. */
export const FEST_COST_GOLD = 500;
export const FEST_HOURS = 2;
export const FEST_DURATION_S = FEST_HOURS * 3600;
/** At most one festival per account and per town at a time, and this many on the whole server. */
export const FEST_ACTIVE_MAX = 24;
/** The attendee's buff: a stat, how much, and for how many game minutes each time it is laid on (renewed, never stacked). */
export const FEST_BUFF_NAME = 'Festival Cheer';
export const FEST_BUFF_STAT = 'personality';
export const FEST_BUFF_AMOUNT = 5;
export const FEST_BUFF_ROUNDS = 120;

const clean = (/** @type {unknown} */ v, /** @type {number} */ max) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
};
/** A festival's name as it is kept, or null. */
export const festName = (/** @type {unknown} */ v) => clean(v, FEST_NAME_MAX);
/** A festival's description as it is kept, or null. */
export const festText = (/** @type {unknown} */ v) => clean(v, FEST_TEXT_MAX);
/** A town's name as it is kept, or null. */
export const festTown = (/** @type {unknown} */ v) => clean(v, FEST_TOWN_MAX);
/** Whether a map id can name a town (an unsigned 32-bit whole number). */
export const festMapIdOk = (/** @type {unknown} */ v) => Number.isSafeInteger(v) && /** @type {number} */ (v) > 0 && /** @type {number} */ (v) <= 0xffffffff;

/** Whether a festival `{ endsAt }` (seconds) still stands at `nowS`. */
export const festStanding = (/** @type {{ endsAt: number }} */ f, /** @type {number} */ nowS) => Number(f?.endsAt) > nowS;
/** The minutes a festival has left at `nowS`, rounded up. */
export const festMinutesLeft = (/** @type {{ endsAt: number }} */ f, /** @type {number} */ nowS) => Math.max(0, Math.ceil((Number(f?.endsAt) - nowS) / 60));
