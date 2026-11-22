// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 7 (docs/FARM-EXPANSION.md section 9): MARKET DAY - every Company farm holds a market one
// UTC day a week. Its weekday is drawn from the farm's map id (so the days spread out over the Bay), the week's contests
// from the farm's id and the week. On the day the farm's STALLS sell: members stock them from the Company Stores, visitors
// from any Company (or none) buy a little above the shops' price, the gold going into the stocking Company's treasury less
// a tenth for the PRIZE POT. The contests are entered at the judging tables and judged at the day's close, once.
// Pure: no clock, no network. The service (server-account/src/farmMarkets.js) turns its answers into statements.
import { farmWeek } from '../farmProgressLaw.js';
import { contentOn } from '../../mods/contentOff.js';

const DAY = 86400;
export const MARKET_STALLS = 4;
/** The most a stall holds, and the lot a click stocks or sells. */
export const STALL_MAX = 60, STALL_LOT = 10;
/** The most one buy takes. */
export const BUY_MAX = 10;
/** A tenth of the day's sales goes to the prize pot. */
export const POT_SHARE = .1;

function hash(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) { h = Math.imul(h ^ (x | 0), 0x01000193) >>> 0; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; }
  return (h ^ (h >>> 15)) >>> 0;
}

// ─── THE DAY ───────────────────────────────────────────────────────────
/** The UTC day number a farm's market falls on in week `week` (farmWeek's Monday is day week*7-3). */
export const marketDayOf = (mapId, week) => week * 7 - 3 + (hash(mapId >>> 0, 91) % 7);
/** The farm's market today: { week, day, closesAt } - or null on every other day. */
export function marketToday(mapId, nowS) {
  if (!contentOn('farmMarkets')) return null;
  const day = Math.floor(nowS / DAY), week = farmWeek(nowS);
  return marketDayOf(mapId, week) === day ? { week, day, closesAt: (day + 1) * DAY } : null;
}
/** Whether the market is tomorrow (the order post says so the day before). */
export const marketTomorrow = (mapId, nowS) => marketToday(mapId, nowS + DAY) !== null;
/** The farm's weekday for words: 0 Sundas .. 6 Loredas in Daggerfall's week is Morndas-first; here a UTC weekday 0 = Monday. */
export const marketWeekday = (mapId) => hash(mapId >>> 0, 91) % 7;

// ─── THE STALLS ────────────────────────────────────────────────────────
/** Gold a unit sells for at a stall: a little above the shops' (the shops buy a pantry food at about 3-6). */
export const STALL_PRICES = Object.freeze({
  'food:grain': 5, 'food:corn': 6, 'food:mushroom': 7, 'food:cabbage': 7, 'food:tomato': 8, 'food:sunseed': 8, 'food:berries': 9,
  'food:root': 7, 'food:flax': 8, 'food:gourd': 8, 'food:grapes': 10, 'food:milk': 8, 'food:apple': 6, 'food:egg': 5, 'food:meat': 12,
});
export const STALL_MATERIALS = Object.freeze(Object.keys(STALL_PRICES));
export const stallPrice = (material) => STALL_PRICES[material] ?? 0;
export const stallOk = (material) => Object.hasOwn(STALL_PRICES, material);
/** What one buy of `qty` costs, and how it divides: the prize pot's tenth, the Company's rest. */
export function saleOf(material, qty) {
  const cost = stallPrice(material) * qty, pot = Math.floor(cost * POT_SHARE);
  return { cost, pot, company: cost - pot };
}

// ─── THE CONTESTS ──────────────────────────────────────────────────────
/** What can be judged in this build: the sheaf (a crop's care and strain) and the show (an animal's contentment).
 *  The pie and the pot waits on dishes that can be carried to a table; the brewers' bench on Phase 4's drinks; the
 *  ploughing and scything races on live minigames in the ring. */
export const CONTESTS = Object.freeze(['sheaf', 'show']);
export const CONTESTS_LATER = Object.freeze(['pie', 'brew', 'plough', 'scythe']);
export const CONTESTS_PER_MARKET = 3;
/** The contests a farm's market holds in `week`: up to three drawn on its id and the week, the same for every client. */
export function marketContests(mapId, week) {
  return CONTESTS.map((c, i) => ({ c, k: hash(mapId >>> 0, week, i + 5) })).sort((a, b) => a.k - b.k || a.c.localeCompare(b.c)).slice(0, CONTESTS_PER_MARKET).map((x) => x.c);
}
/** A small random for one entrant's score: the same wherever it is judged. */
const luck = (mapId, day, account, contest, span) => hash(mapId >>> 0, day, hash(...[...String(account)].map((ch) => ch.charCodeAt(0))), contest.length + contest.charCodeAt(0)) % span;
/** A sheaf's score: the care of its bed (0-6) counts most, a showy strain's bonus, a small random. */
export const sheafScore = ({ care = 0, showy = false }, mapId, day, account) => Math.max(0, Math.min(6, care | 0)) * 10 + (showy ? 8 : 0) + luck(mapId, day, account, 'sheaf', 10);
/** A show animal's score: its contentment (0-100) at the entering, a small random. */
export const showScore = ({ content = 0 }, mapId, day, account) => Math.round(Math.max(0, Math.min(100, content))) + luck(mapId, day, account, 'show', 10);
/** An entry's score by its contest. */
export const entryScore = (contest, snapshot, mapId, day, account) => (contest === 'sheaf' ? sheafScore(snapshot ?? {}, mapId, day, account) : contest === 'show' ? showScore(snapshot ?? {}, mapId, day, account) : 0);

export const RIBBONS = Object.freeze(['blue', 'red', 'white']);
/** A ribbon's farm work (farmWorkLaw.js: blue 100, red 60, white 30), and how many an account counts in a week. */
export const RIBBON_WORK = Object.freeze({ blue: 100, red: 60, white: 30 });
export const RIBBON_WEEK_MAX = 3;
/** The prize pot's share of each place. */
export const RIBBON_POT = Object.freeze({ blue: .5, red: .3, white: .2 });

/**
 * THE JUDGING of one contest: entries `{ account, score, ... }` placed best first (ties to the earlier entry), the top
 * three given ribbons. Answers `[{ ...entry, ribbon }]`.
 */
export function placeEntries(entries) {
  return [...entries].sort((a, b) => b.score - a.score || (a.at ?? 0) - (b.at ?? 0) || String(a.account).localeCompare(String(b.account)))
    .slice(0, RIBBONS.length).map((e, i) => ({ ...e, ribbon: RIBBONS[i] }));
}
/** The pot's gold for a ribbon in a contest, the pot divided evenly by the market's contests. */
export const potPrize = (pot, contests, ribbon) => Math.floor(Math.floor(pot / Math.max(1, contests)) * (RIBBON_POT[ribbon] ?? 0));

/** A contest's words are the client's; its keys: */
export const contestKey = (c) => (CONTESTS.includes(c) ? c : null);
/** Entries each account may make: one in a contest. */
export const ENTRY_MAX = 1;
