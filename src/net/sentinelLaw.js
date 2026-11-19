// @ts-check
// BUNNYFALL (2026-11-20, the owner: "the major event be a decision between getting support from Sentinel or letting them go
// home"; "donate swords and armor to this noble ... a vote either to stay or split, moving the bar from one percent to the
// other"; "one month, one time only, irreversible"): THE SENTINEL GARRISON'S LAW. Pure and shared: the game reads it to draw
// the noble's window and the bar (scenes/sentinelHost.js, ui/sentinelWindow.js, ui/worldEventsBoard.js), the account service
// to keep the count and to settle the month (server-account/src/sentinel.js).
//
//   - ONE BAR, TWO PERCENTAGES. Every piece of arms or armor given to the noble is a vote for a side (STAY: Sentinel
//     commits its warriors; LEAVE: they go home). Votes are anonymous and cumulative: the service keeps two running
//     counts, never who gave what. Each side starts at SENTINEL_SEED so the first gifts do not swing the bar to a side.
//   - A MONTH, ONCE. The month runs SENTINEL_DAYS from the first time the service is asked. The last SENTINEL_DARK_DAYS the
//     bar goes dark (no percentages), so nobody can snipe it at the end. When the month is over the outcome is written
//     once and never again.
//   - A DAILY CAP per account, so no one buys the outcome.
//
// THE WEDGE (what a 'stay' does to Cromwark's rings) is not here yet: this is the bar, the noble and the count.

/** The two sides, as the wire spells them. */
export const SENTINEL_SIDES = Object.freeze(['stay', 'leave']);
/** What each side starts with, in pieces' worth. */
export const SENTINEL_SEED = 200;
/** The month, in UTC days; the last SENTINEL_DARK_DAYS of it keep the bar dark. */
export const SENTINEL_DAYS = 30;
export const SENTINEL_DARK_DAYS = 3;
/** The most pieces one account may give in a UTC day, and in one press. */
export const SENTINEL_DAILY_CAP = 30;
export const SENTINEL_GIVE_MAX = 10;
/** A final share within this many points of half (either way) is `divided`, the garrison split. */
export const SENTINEL_TIE_BAND = 5;
/** How near the noble the bar is shown on screen (m). */
export const SENTINEL_NEAR_M = 150;
// THE REWARDS (the owner: "a title and a reworked Dagon aura for people that donate over 100 items, a counter and a shop for
// donators ... unique items with special imprints ... maybe some Welkynd shards").
/** Garrison Tokens an account is paid for each piece it gives: a balance the service keeps (given * this - spent). */
export const SENTINEL_TOKENS_PER_PIECE = 2;
/** Pieces given over a lifetime that earn the title and the aura. */
export const SENTINEL_DONOR_PIECES = 100;
/** The donor's title and aura (net/identityToken.js spells them; the aura is Dagon's Fire reworked). */
export const SENTINEL_DONOR_TITLE = 'bannerbearer';
export const SENTINEL_DONOR_AURA = 'sentinelbanner';
/** The event shop, in the window's order: `{ id, name, price, shards? }` - `price` in Garrison Tokens, `shards` the Welkynd
 *  Shards a bundle pays; the rest are unique pieces (systems/sentinelShop.js makes them). Both ends read the prices. */
export const SENTINEL_OFFERS = Object.freeze([
  Object.freeze({ id: 'shards-5', name: '5 Welkynd Shards', price: 10, shards: 5 }),
  Object.freeze({ id: 'shards-20', name: '20 Welkynd Shards', price: 36, shards: 20 }),
  Object.freeze({ id: 'envoys-signet', name: "Envoy's Signet", price: 100 }),
  Object.freeze({ id: 'garrison-wall', name: 'Garrison Wall', price: 160 }),
  Object.freeze({ id: 'banners-edge', name: "Banner's Edge", price: 200 }),
  Object.freeze({ id: 'garrison-ballista', name: 'Garrison Ballista', price: 180 }),
  Object.freeze({ id: 'sunderers-bolt', name: "Sunderer's Bolt", price: 220 }),
  Object.freeze({ id: 'wardens-claymore', name: "Warden's Claymore", price: 210 }),
  Object.freeze({ id: 'oathkeepers-axe', name: "Oathkeeper's Axe", price: 190 }),
  Object.freeze({ id: 'garrison-maul', name: 'Garrison Maul', price: 200 }),
  Object.freeze({ id: 'quiet-oath', name: 'Quiet Oath', price: 170 }),
  Object.freeze({ id: 'tallow-staff', name: 'Tallow Staff', price: 180 }),
  Object.freeze({ id: 'banners-bow', name: "Banner's Bow", price: 190 }),
]);
export const sentinelOfferById = (/** @type {any} */ id) => SENTINEL_OFFERS.find((o) => o.id === id) ?? null;
/** The tokens an account holds: what its gifts paid less what it spent. */
export const sentinelTokens = (/** @type {number} */ given, /** @type {number} */ spent) => Math.max(0, (Math.trunc(Number(given)) || 0) * SENTINEL_TOKENS_PER_PIECE - (Math.trunc(Number(spent)) || 0));

/** The noble: a name for now, where he stands (what /pos says: the map pixel's world point, DF units), how tall (m). */
export const SENTINEL_NOBLE = Object.freeze({ name: 'Lord Calder Vane', title: "Sentinel's envoy", world: Object.freeze({ x: 26001697, z: 13320620 }), h: 1.95 });

const UNIT_M = 40;       // DF world units to metres
const PIXEL_UNITS = 32768;
const ROWS = 499;
/** The noble's place in his map pixel's frame (east, north from its south-west corner, metres): `{ px, py, x, z }`. */
export function sentinelNobleSite(w = SENTINEL_NOBLE.world) {
  const px = Math.floor(w.x / PIXEL_UNITS), row = Math.floor(w.z / PIXEL_UNITS);
  return { px, py: ROWS - row, x: (w.x - px * PIXEL_UNITS) / UNIT_M, z: (w.z - row * PIXEL_UNITS) / UNIT_M };
}

/** A side read back: 'stay' or 'leave', else null. */
export const cleanSide = (/** @type {any} */ s) => (SENTINEL_SIDES.includes(s) ? /** @type {'stay'|'leave'} */ (s) : null);
/** A press's count read back: a whole number from 1 to SENTINEL_GIVE_MAX, else 0. */
export const cleanGive = (/** @type {any} */ n) => { const k = Math.trunc(Number(n)); return k >= 1 && k <= SENTINEL_GIVE_MAX ? k : 0; };

/** Both sides' pieces from the stored counts (the seed added). */
export const sentinelTotals = (/** @type {number} */ stay, /** @type {number} */ leave) => ({ stay: SENTINEL_SEED + Math.max(0, Number(stay) || 0), leave: SENTINEL_SEED + Math.max(0, Number(leave) || 0) });
/** The bar: whole percentages that sum to 100, `{ stay, leave }`. */
export function sentinelPct(/** @type {number} */ stay, /** @type {number} */ leave) {
  const t = sentinelTotals(stay, leave), s = Math.round((t.stay / (t.stay + t.leave)) * 100);
  return { stay: s, leave: 100 - s };
}
/** Where the bar leans: 'stay', 'leave' or 'divided' (within SENTINEL_TIE_BAND of half). */
export function sentinelLeaning(/** @type {number} */ stay, /** @type {number} */ leave) {
  const p = sentinelPct(stay, leave);
  return p.stay >= 50 + SENTINEL_TIE_BAND ? 'stay' : p.stay <= 50 - SENTINEL_TIE_BAND ? 'leave' : 'divided';
}
/** The month's clock from when it began (UTC seconds): `{ endsAt, dark, over, daysLeft }`. */
export function sentinelPhase(/** @type {number} */ nowS, /** @type {number} */ startedAt) {
  const endsAt = startedAt + SENTINEL_DAYS * 86400, left = endsAt - nowS;
  return { endsAt, over: left <= 0, dark: left > 0 && left <= SENTINEL_DARK_DAYS * 86400, daysLeft: Math.max(0, Math.ceil(left / 86400)) };
}

/** What a refusal says, by its error. */
export const SENTINEL_WORDS = Object.freeze({
  'sentinel-bad': 'The noble did not understand that gift.',
  'sentinel-over': 'The garrison has made its choice. The noble takes no more.',
  'sentinel-cap': 'You have given all you may today. Come back tomorrow.',
  busy: 'The noble is busy. Try again in a moment.',
});
export const sentinelWordText = (/** @type {string} */ error) => /** @type {Record<string, string>} */ (SENTINEL_WORDS)[error] ?? 'The noble could not take that just now.';
