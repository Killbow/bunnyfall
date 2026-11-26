// @ts-check
// BUNNYFALL (2026-11-26, caverns): THE CARTOGRAPHERS' SOCIETY'S LAW - the spec's section 9, the owner's "contracts for
// LARGE quantity of ore, the kind of large you either need to break your hand outside or inside the mine, this contract
// turns into points that lets you buy special rewards, including rare grindable titles and auras".
//
//   CONTRACTS  each names one ore and a large amount of it, delivered from the Stores (the units gathered, `own`: bought
//              ore never counts, so Seals cannot be bought with gold). One at a time a character; the desk offers
//              SOCIETY_OFFERS of them a day, the same for everyone on a character's day (societyOffers). Size and pay
//              grow with the ore's rarity. Ore from anywhere counts: a vein outside, a cave vein, a drill's haul.
//   SURVEY SEALS  the account service's currency (server-account/src/society.js): a contract turned in pays them.
//   THE SHOP   a ladder of titles, each costing more and each needing the one before (Prospector, Delver, Deepwarden,
//              Master of the Seam), then The Burning Stair, the Wellhead-Walker's falling embers, at a very high price.
//
// Pure: the account service and every page read this one law.

/** The contracts by ore: how much is asked, and the Seals it pays. */
export const SOCIETY_CONTRACTS = Object.freeze({
  'metal:iron': Object.freeze({ n: 400, seals: 40 }), 'metal:copper': Object.freeze({ n: 400, seals: 40 }), 'metal:tin': Object.freeze({ n: 400, seals: 40 }),
  'metal:silver': Object.freeze({ n: 200, seals: 60 }), 'metal:gold': Object.freeze({ n: 150, seals: 70 }), 'metal:platinum': Object.freeze({ n: 100, seals: 80 }),
  'ore:mithril': Object.freeze({ n: 40, seals: 110 }), 'ore:ebony': Object.freeze({ n: 30, seals: 120 }), 'ore:orichalcum': Object.freeze({ n: 30, seals: 120 }),
  'ore:adamantium': Object.freeze({ n: 30, seals: 130 }),
});
export const SOCIETY_ORES = Object.freeze(Object.keys(SOCIETY_CONTRACTS));
/** How many contracts the desk offers a character a day. */
export const SOCIETY_OFFERS = 3;

/** The shop's wares in order: `kind:key`, its price in Seals, and the ware a title needs held first (the ladder). */
export const SOCIETY_WARES = Object.freeze([
  Object.freeze({ id: 'title:prospector', seals: 150, needs: null, name: 'Prospector' }),
  Object.freeze({ id: 'title:delver', seals: 400, needs: 'title:prospector', name: 'Delver' }),
  Object.freeze({ id: 'title:deepwarden', seals: 900, needs: 'title:delver', name: 'Deepwarden' }),
  Object.freeze({ id: 'title:masteroftheseam', seals: 1800, needs: 'title:deepwarden', name: 'Master of the Seam' }),
  Object.freeze({ id: 'aura:burningstair', seals: 4000, needs: null, name: 'The Burning Stair' }),
]);
export const SOCIETY_TITLES = Object.freeze(SOCIETY_WARES.filter((w) => w.id.startsWith('title:')).map((w) => w.id.slice(6)));
/** The most a wares list holds (every ware, with room). */
const WARES_MAX = 16;

/** The wares a row's `society_wares` holds (space-separated ids), the known ones alone. */
export function societyWaresHeld(/** @type {unknown} */ s) {
  if (typeof s !== 'string') return [];
  const ids = new Set(/** @type {string[]} */ (SOCIETY_WARES.map((w) => w.id)));
  return [...new Set(s.trim().split(/\s+/).filter((id) => ids.has(id)))].slice(0, WARES_MAX);
}

const hashOf = (/** @type {string} */ s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** The contracts the desk offers a character on a UTC day: SOCIETY_OFFERS ores, the rare ones less often. */
export function societyOffers(/** @type {string} */ character, /** @type {number} */ day) {
  // a common ore weighs 4, a precious metal 2, a rare ore 1 (by its contract's pay)
  const weights = SOCIETY_ORES.map((o) => (SOCIETY_CONTRACTS[/** @type {keyof typeof SOCIETY_CONTRACTS} */ (o)].seals >= 100 ? 1 : SOCIETY_CONTRACTS[/** @type {keyof typeof SOCIETY_CONTRACTS} */ (o)].seals >= 60 ? 2 : 4));
  let h = hashOf(`${character}|${day}`);
  const out = [];
  for (let tries = 0; out.length < SOCIETY_OFFERS && tries < 64; tries++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    let r = h % weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (r >= weights[i]) { r -= weights[i]; i++; }
    if (!out.includes(SOCIETY_ORES[i])) out.push(SOCIETY_ORES[i]);
  }
  return out.map((ore) => ({ ore, ...SOCIETY_CONTRACTS[/** @type {keyof typeof SOCIETY_CONTRACTS} */ (ore)] }));
}

/** Whether a ware can be bought by a row holding `held` wares and `seals` Seals: null, or why not. */
export function societyBuyRefused(/** @type {string} */ id, /** @type {string[]} */ held, /** @type {number} */ seals) {
  const w = SOCIETY_WARES.find((x) => x.id === id);
  if (!w) return 'bad-ware';
  if (held.includes(id)) return 'owned';
  if (w.needs && !held.includes(w.needs)) return 'ladder';
  if (!(seals >= w.seals)) return 'seals-short';
  return null;
}

// ─── THE MINE KIT (the spec's section 3) ────────────────────────────
/** The kit the desk sells for gold, kept a character beside the Stores (`mine_kit`, migration 0224): a drill (one owned,
 *  never spent, needed to set one), its fuel (one spent a shift), lamps (one spent a chamber lit) and the Survey Rod (one
 *  owned: walls read sound or weak). `per` how many one purchase brings. */
export const SOCIETY_KIT = Object.freeze([
  Object.freeze({ id: 'drill', name: 'Mining Drill', gold: 1500, per: 1, owned: true }),
  Object.freeze({ id: 'fuel', name: 'Drill Fuel', gold: 250, per: 5, owned: false }),
  Object.freeze({ id: 'lamp', name: 'Mine Lamp', gold: 120, per: 2, owned: false }),
  Object.freeze({ id: 'rod', name: 'Survey Rod', gold: 400, per: 1, owned: true }),
]);
export const SOCIETY_KIT_IDS = Object.freeze(SOCIETY_KIT.map((k) => k.id));
/** The most of a spent kit a character keeps. */
export const SOCIETY_KIT_MAX = 99;
/** A member's Seals by rank: a contract's Seals, and a tenth more a rank of the Society (a visitor's none). */
export const SOCIETY_RANK_SHARE = 0.1;
export const societySealsFor = (/** @type {number} */ seals, /** @type {number} */ rank) => Math.round(seals * (1 + SOCIETY_RANK_SHARE * Math.max(0, Math.min(9, rank | 0))));
/** The Society's standing a contract turned in raises (its guild's reputation, the page's as survey notes'). */
export const SOCIETY_CONTRACT_REP = 3;
