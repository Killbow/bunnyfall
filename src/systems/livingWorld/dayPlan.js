// @ts-check
import { NAV_CELL } from '../../world/cityNavigation.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { lwRng, lwSeed, rollInt, pickOf } from './seed.js';
import { hasShopJob, WATCH_COMPANIES } from './census.js';
import { exitNearest } from './places.js';
import { MOBILE_TYPES } from '../../characters/mobileTypes.js';
import { GUILDS } from '../../guilds/guilds.js';
import { ORDERS } from '../../guilds/guildVariants.js';

// The living day turns at 04:00, the one hour every temper is asleep, so no night is split by the turn.
export const DAY_START_MIN = 240;
export const DAY_MIN = 1440;
export const MIN_STAY = 8;
export const WALK_DETOUR = 1.2;
export const WALK_EXTRA_M = 2;
export const GEAR_MIN = 30;
export const HOME_GAP = 30;

export const OUTDOOR = Object.freeze(new Set(['walk', 'market', 'social', 'stall', 'beg', 'dock', 'watch', 'post', 'gate']));

/**
 * @typedef {import('./places.js').Spot} Spot
 * @typedef {import('./places.js').Places} Places
 * @typedef {import('./census.js').Resident} Resident
 * @typedef {{ from: Spot, to: Spot, t0: number, t1: number, kind: 'post'|'watch', mark: { duty: boolean, pair: 0|1|null } }} MorningWalk
 * @typedef {{ kind: string, at: Spot, t0: number, t1: number, from?: Spot, to?: Spot, armed?: boolean, duty?: boolean, pair?: 0|1|null }} Entry
 * @typedef {{ t0: number, t1: number, exit?: Spot|null, armed?: boolean, halt?: number }} Away
 */

const hourOf = (day, h) => day * DAY_MIN + Math.round(h * 60);

export function walkMinutes(a, b, mpm) {
  if (!a || !b) return 0;
  const cells = Math.abs(a.cell[0] - b.cell[0]) + Math.abs(a.cell[1] - b.cell[1]);
  if (cells === 0) return 0;
  return Math.max(1, Math.ceil((cells * NAV_CELL * WALK_DETOUR + WALK_EXTRA_M) / Math.max(0.1, mpm)));
}


export const WATCH_SHIFTS = Object.freeze([Object.freeze([6, 14]), Object.freeze([14, 22]), Object.freeze([22, 30])]);
export const WATCH_ROTATION = WATCH_COMPANIES;
export const PATROL_STOP_MIN = MIN_STAY + 4;
export const PATROL_STOP_MAX = MIN_STAY + 14;

/**
 * @param {Resident} res
 * @param {Places} places
 * @param {number} day
 * @param {number} size
 * @returns {{ shift: number, company: number, rank: number, kind: 'post'|'patrol', post: Spot|null, patrol: number, pair: 0|1|null }}
 */
export function watchDuty(res, places, day, size = 1) {
  const company = res.slot % WATCH_ROTATION, rank = Math.floor(res.slot / WATCH_ROTATION);
  const shift = (company + day) % WATCH_ROTATION;
  const exits = [...places.exits].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const posts = size >= 3 ? Math.min(exits.length, size - 2) : 0;
  if (rank >= 2 && rank - 2 < posts) {
    const turn = lwSeed(res.town, 0x706f7374, company, day) % exits.length;
    return { shift, company, rank, kind: 'post', post: exits[(rank - 2 + turn) % exits.length], patrol: -1, pair: null };
  }
  const i = rank < 2 ? rank : rank - posts, patrols = Math.max(1, size - posts);
  const alone = patrols % 2 === 1 && i === patrols - 1;
  return { shift, company, rank, kind: 'patrol', post: null, patrol: Math.floor(i / 2), pair: alone ? null : /** @type {0|1} */ (i % 2) };
}

/**
 * @param {Places} places
 * @param {number} town
 * @param {number} company
 * @param {number} patrol
 * @param {number} day
 * @param {number} shift
 * @returns {Spot[]}
 */
export function patrolBeat(places, town, company, patrol, day, shift) {
  const rng = lwRng(town, 0x62656174, company, patrol, day, shift);
  const pool = [...places.exits, ...places.social, ...places.market];
  if (!pool.length) return [];
  const anchor = pool[Math.floor(rng() * pool.length)];
  const n = Math.min(pool.length, rollInt(rng, 4, 6));
  const gap = (/** @type {Spot} */ a) => Math.abs(a.cell[0] - anchor.cell[0]) + Math.abs(a.cell[1] - anchor.cell[1]);
  const near = pool.map((sp) => ({ sp, d: gap(sp) })).sort((a, b) => a.d - b.d || (a.sp.key < b.sp.key ? -1 : a.sp.key > b.sp.key ? 1 : 0)).slice(0, n).map((x) => x.sp);
  const cx = near.reduce((a, sp) => a + sp.x, 0) / near.length, cz = near.reduce((a, sp) => a + sp.z, 0) / near.length;
  const bearing = (/** @type {Spot} */ sp) => Math.atan2(sp.x - cx, sp.z - cz);
  return near.sort((a, b) => bearing(a) - bearing(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * @param {readonly Spot[]} beat
 * @param {() => number} rng
 * @param {number} first
 * @param {number} from
 * @param {number} until
 * @param {number} mpm
 * @param {boolean} [hold]
 * @returns {{ at: Spot, i: number, from: number, dur: number }[]}
 */
export function patrolStops(beat, rng, first, from, until, mpm, hold = false) {
  const out = [];
  for (let t = from, i = first; beat.length && t < until; i++) {
    const at = beat[i % beat.length], next = beat[(i + 1) % beat.length];
    const dur = rollInt(rng, PATROL_STOP_MIN, PATROL_STOP_MAX);
    out.push({ at, i: i % beat.length, from: t, dur });
    t += dur + walkMinutes(at, next, mpm);
  }
  if (hold) {
    while (out.length > 1 && out[out.length - 1].from > until - MIN_STAY * 2) out.pop();
    if (out.length) { const last = out[out.length - 1]; last.dur = until - last.from; }
  }
  return out;
}

/**
 * @param {Resident} res
 * @param {Places} places
 * @param {number} day
 * @param {number} size
 * @param {number} mpm
 * @returns {{ at: Spot, kind: 'post'|'watch', pair: 0|1|null, stops: { at: Spot, from: number, dur: number }[] } | null}
 */
export function nightTail(res, places, day, size, mpm) {
  const d = watchDuty(res, places, day, size);
  if (d.shift !== 2) return null;
  const night = dayPlan(res, places, day, { mpm, watch: size });
  const last = night[night.length - 1];
  if (!last?.duty) return null;
  const D1 = (day + 1) * DAY_MIN + DAY_START_MIN, morning = hourOf(day, WATCH_SHIFTS[2][1]);
  if (last.kind === 'post') return { at: last.at, kind: 'post', pair: null, stops: [{ at: last.at, from: D1, dur: morning - D1 }] };
  const beat = patrolBeat(places, res.town, d.company, d.patrol, day, 2);
  const tail = patrolStops(beat, lwRng(res.town, 0x7461696c, d.company, d.patrol, day), beat.indexOf(last.at), D1, morning, mpm, true);
  return { at: last.at, kind: 'watch', pair: d.pair, stops: tail };
}

/**
 * @param {Resident} res
 * @param {Places} places
 * @param {number} day
 * @param {number} size
 * @param {number} mpm
 * @returns {{ from: Spot, to: Spot, t0: number, t1: number, kind: 'post'|'watch', mark: { duty: boolean, pair: 0|1|null } } | null}
 */
export function morningWalk(res, places, day, size, mpm) {
  const d = watchDuty(res, places, day, size);
  if (d.shift !== 0) return null;
  const home = res.home != null ? places.doors.get(res.home) ?? null : null;
  const to = d.kind === 'post' ? d.post : patrolBeat(places, res.town, d.company, d.patrol, day, 0)[0] ?? null;
  if (!home || !to) return null;
  const t1 = hourOf(day, WATCH_SHIFTS[0][0]), t0 = t1 - walkMinutes(home, to, mpm);
  return t0 < day * DAY_MIN + DAY_START_MIN ? { from: home, to, t0, t1, kind: d.kind === 'post' ? 'post' : 'watch', mark: { duty: true, pair: d.pair } } : null;
}

const favouritesOf = new WeakMap();

/**
 * @param {Resident} res
 * @param {Places} places
 * @param {Spot|null} home
 */
export function favourites(res, places, home) {
  let kept = favouritesOf.get(places);
  if (!kept) { kept = new Map(); favouritesOf.set(places, kept); }
  const key = `${res.town}|${res.roll}|${res.slot}|${home?.key ?? ''}`;
  let fav = kept.get(key);
  if (!fav) { fav = favouritesNow(res, places, home); kept.set(key, fav); }
  return fav;
}

const doorKindsOf = new WeakMap();
/** @param {Places} places */
function doorKinds(places) {
  let k = doorKindsOf.get(places);
  if (!k) {
    /** @type {Spot[]} */ const tavern = [], temple = [], shops = [], houses = [], outfitters = [];
    /** @type {Map<number, Spot[]>} */
    const halls = new Map();
    for (const [key, spot] of places.doors) {
      const t = places.types.get(key) ?? -1;
      if (t === BUILDING_TYPES.Tavern) tavern.push(spot);
      if (t === BUILDING_TYPES.Temple) temple.push(spot);
      if (t === BUILDING_TYPES.GuildHall) { const f = places.factions?.get(key) ?? 0; halls.set(f, [...(halls.get(f) ?? []), spot]); }
      if (hasShopJob(t)) shops.push(spot);
      if (t >= BUILDING_TYPES.House1 && t <= BUILDING_TYPES.House6) houses.push(spot);
      if (t === BUILDING_TYPES.Armorer || t === BUILDING_TYPES.WeaponSmith || t === BUILDING_TYPES.Alchemist) outfitters.push(spot);
    }
    const spots = [...new Set([...places.doors.values(), ...places.social, ...(places.corners ?? []), ...(places.squares ?? []), ...places.market])].sort((a, b) => a.key.localeCompare(b.key));
    const orders = [...halls].filter(([f]) => ORDER_FACTIONS.has(f)).flatMap(([, list]) => list);
    k = { tavern, temple, halls, orders, shops, houses, outfitters, rank: new Map(spots.map((s, i) => [s, i])) };
    doorKindsOf.set(places, k);
  }
  return k;
}

/**
 * @param {Places} places
 * @param {readonly Spot[]} list
 * @param {Spot|null} from
 */
function nearestOf(places, list, from) {
  const out = [...list];
  if (!from) return out;
  const fx = from.cell[0], fy = from.cell[1], rank = doorKinds(places).rank;
  return out.sort((a, b) => (Math.abs(a.cell[0] - fx) + Math.abs(a.cell[1] - fy)) - (Math.abs(b.cell[0] - fx) + Math.abs(b.cell[1] - fy))
    || (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
}

export const SQUARE_LIKE = 0.2;
export const SOCIAL_NEAR = 3;
export const EVENING_SPREAD_MIN = 75;
// An evening drinker is above this; `stir.js` reads it as `DRINKER`, so never add a second literal.
export const TAVERN_DRINK = 0.55;
export const MARKET_HOURS = Object.freeze([7.5, 10.5]);

/**
 * @param {Resident} res
 * @param {Places} places
 * @returns {Spot|null}
 */
export function squareOf(res, places) {
  const pts = places.squares?.length ? places.squares : places.square ? [places.square] : [];
  return pts.length ? pts[lwSeed(res.town, res.roll.charCodeAt(0), res.slot, 0x73717561) % pts.length] : null;
}

export const MAGES_GUILD = GUILDS.MagesGuild.factionId;
export const FIGHTERS_GUILD = GUILDS.FightersGuild.factionId;
export const ORDER_FACTIONS = /** @type {ReadonlySet<number>} */ (Object.freeze(new Set(Object.values(ORDERS))));
/** @param {number|null|undefined} cls */
export const isMageClass = (cls) => cls != null && cls >= MOBILE_TYPES.Mage && cls <= MOBILE_TYPES.Nightblade;
/** @param {number|null|undefined} cls */
export const isWarriorClass = (cls) => cls != null && cls >= MOBILE_TYPES.Monk && cls <= MOBILE_TYPES.Knight;
export const GUILD_OF_TRADE = /** @type {ReadonlyMap<number, number>} */ (Object.freeze(new Map([
  [BUILDING_TYPES.Bookseller, MAGES_GUILD], [BUILDING_TYPES.Library, MAGES_GUILD], [BUILDING_TYPES.Alchemist, MAGES_GUILD],
  [BUILDING_TYPES.Armorer, FIGHTERS_GUILD], [BUILDING_TYPES.WeaponSmith, FIGHTERS_GUILD],
])));

/**
 * @param {Resident} res
 * @param {Places} places
 * @param {Spot|null} home
 * @returns {Spot|null}
 */
export function guildHallOf(res, places, home) {
  if (res.job === 'guildsman') return res.work != null ? places.doors.get(res.work) ?? null : null;
  const { halls, orders } = doorKinds(places);
  const nearest = (/** @type {readonly Spot[]|undefined} */ list) => (list?.length ? nearestOf(places, list, home)[0] : null);
  const order = nearest(orders);
  if (res.job === 'courtier') return order;
  if (res.cls === MOBILE_TYPES.Knight && order) return order;
  const guild = (res.work != null ? GUILD_OF_TRADE.get(places.types.get(res.work) ?? -1) : undefined)
    ?? (isMageClass(res.cls) ? MAGES_GUILD : isWarriorClass(res.cls) ? FIGHTERS_GUILD : null);
  return guild == null ? null : nearest(halls.get(guild));
}

/**
 * @param {Resident} res
 * @param {number} day
 * @param {number} [days]
 */
export function guildDay(res, day, days = GUILD_DAYS) {
  const w = lwSeed(res.town, res.roll.charCodeAt(0), res.slot, 0x67696c64) % 7;
  const d = ((day % 7) + 7) % 7;
  return GUILD_DAY_OFFSETS.slice(0, days).some((o) => d === (w + o) % 7);
}
export const GUILD_DAYS = 2;
export const GUILD_DAY_OFFSETS = Object.freeze([0, 3, 5]);
export const GUILD_DAYS_BY_BAND = Object.freeze({ failing: 1, steady: 2, thriving: 3, ascendant: 3 });
/**
 * @param {Places} places
 * @param {Spot|null} hall
 * @param {((faction: number) => (string|null)) | null | undefined} bandOf
 */
export function hallGuildDays(places, hall, bandOf) {
  if (!bandOf || hall?.building == null) return GUILD_DAYS;
  const band = bandOf(places.factions?.get(hall.building) ?? 0);
  if (band === 'shut') return GUILD_DAYS_SHUT;
  return /** @type {Record<string, number>} */ (GUILD_DAYS_BY_BAND)[band ?? ''] ?? GUILD_DAYS;
}
export const GUILD_DAYS_SHUT = 0;

const B = BUILDING_TYPES;
/** @type {Readonly<Record<string, readonly (readonly [number, number])[]>>} */
export const ERRAND_NEEDS = Object.freeze({
  homemaker: [[B.GeneralStore, 4], [B.ClothingStore, 2], [B.Alchemist, 1], [B.FurnitureStore, 1], [B.PawnShop, 1]],
  crafter: [[B.GeneralStore, 3], [B.PawnShop, 2], [B.FurnitureStore, 1], [B.Bank, 1]],
  keeper: [[B.Bank, 3], [B.GeneralStore, 2]],
  helper: [[B.GeneralStore, 3], [B.Bank, 1]],
  smith: [[B.Bank, 2], [B.GeneralStore, 2], [B.Alchemist, 1]],
  clerk: [[B.GeneralStore, 2], [B.ClothingStore, 1], [B.Bookseller, 1]],
  scholar: [[B.Library, 3], [B.Bookseller, 2], [B.Alchemist, 1]],
  guildsman: [[B.Alchemist, 2], [B.Bookseller, 1], [B.Armorer, 1], [B.WeaponSmith, 1]],
  guard: [[B.GeneralStore, 2], [B.Armorer, 1], [B.WeaponSmith, 1], [B.Alchemist, 1]],
  courtier: [[B.GemStore, 3], [B.ClothingStore, 2], [B.Bank, 2], [B.Bookseller, 1]],
  merchant: [[B.Bank, 3], [B.GeneralStore, 2], [B.PawnShop, 2], [B.GemStore, 1]],
  visitor: [[B.GeneralStore, 2], [B.ClothingStore, 1], [B.GemStore, 1], [B.PawnShop, 1], [B.Alchemist, 1], [B.Bookseller, 1]],
});

export const ERRAND_NEED_SHARE = 0.6;
export const ERRAND_SHOP_SHARE = 2 / 3;

/**
 * @param {Resident} res
 * @param {Places} places
 * @param {Spot|null} home
 */
export const isLodger = (res, places, home) => !!home && home.building != null && places.types.get(home.building) === BUILDING_TYPES.Tavern && res.work !== home.building;
export const LODGE_BREAKFAST_MIN = Object.freeze([15, 45]);
export const LODGE_UP_MIN = Object.freeze([20, 60]);
export const MARKET_STALL_H = Object.freeze([8, 13.5]);
export const PATRON_BROWSE_SHARE = 0.1;
export const PATRON_LATE_MIN = 45;
export const PILGRIM_TEMPLE_H = Object.freeze([8.5, 15.5]);
export const MINSTREL_PLAY_H = Object.freeze([18.5, 23]);

/**
 * @param {string} job
 * @param {Places} places
 * @param {readonly Spot[]} shops
 * @param {() => number} rng
 * @returns {Spot|null}
 */
export function errandShop(job, places, shops, rng) {
  const needs = (ERRAND_NEEDS[job] ?? []).map(([t, w]) => /** @type {const} */ ([shops.filter((s) => places.types.get(s.building ?? -1) === t), w])).filter(([list]) => list.length);
  if (!needs.length || rng() >= ERRAND_NEED_SHARE) return shops.length ? shops[Math.floor(rng() * Math.min(4, shops.length))] : null;
  let r = rng() * needs.reduce((n, [, w]) => n + w, 0);
  let list = needs[needs.length - 1][0];
  for (const [l, w] of needs) { if (r < w) { list = l; break; } r -= w; }
  return list[Math.floor(rng() * Math.min(2, list.length))];
}

/**
 * @param {Resident} res
 * @param {Places} places
 * @param {Spot|null} home
 */
function favouritesNow(res, places, home) {
  const rng = lwRng(res.town, res.roll.charCodeAt(0), res.slot, 0x666176);
  const near = (list, n = 2) => (list.length ? list[Math.floor(rng() * Math.min(list.length, n))] : null);
  const kinds = doorKinds(places);
  const byNear = (/** @type {readonly Spot[]} */ list) => nearestOf(places, list, home);
  const sq = squareOf(res, places);
  const own = (/** @type {Spot|null} */ s) => (s?.kind === 'square' ? sq : s);
  const social = byNear([...places.social, ...(places.corners ?? [])]);
  const s1 = places.square && rng() < SQUARE_LIKE ? sq : own(near(social, SOCIAL_NEAR));
  const s2 = own(near(social.filter((s) => own(s) !== s1), SOCIAL_NEAR)) ?? s1;
  const market = byNear([...places.market, ...(places.squares ?? [])]);
  return {
    social: [s1, s2].filter(Boolean),
    tavern: near(byNear(kinds.tavern)),
    temple: near(byNear(kinds.temple)),
    guild: guildHallOf(res, places, home),
    market: own(near(market, SOCIAL_NEAR)),
    shops: byNear(kinds.shops),
    square: sq,
  };
}

/**
 * @param {Resident} res
 * @param {Places} places
 * @param {number} day
 * @param {{ mpm: number, away?: readonly Away[], visitor?: boolean, home?: Spot|null, watch?: number, bandOf?: ((faction: number) => (string|null)) | null, errands?: readonly { at: Spot|null, from: number, dur: number }[], browse?: readonly Spot[] }} opts
 * @returns {Entry[]}
 */
export function dayPlan(res, places, day, { mpm, away = [], visitor = false, home: homeIn = null, watch: watchSize = 1, bandOf = null, errands = [], browse = [] }) {
  const D0 = day * DAY_MIN + DAY_START_MIN, D1 = D0 + DAY_MIN;
  const home = homeIn ?? (res.home != null ? places.doors.get(res.home) ?? null : null);
  if (!home) return [{ kind: 'home', at: /** @type {any} */ (null), t0: D0, t1: D1 }];
  const rng = lwRng(res.town, res.roll.charCodeAt(0), res.slot, day);
  const fav = favourites(res, places, home);
  const work = res.work != null ? places.doors.get(res.work) ?? null : null;
  const h = (hh) => hourOf(day, hh);
  const shift = res.job === 'guard' && !visitor ? watchDuty(res, places, day, watchSize).shift : -1;
  let wake = res.temper === 0 ? h(5 + rng()) : res.temper === 2 ? h(8 + rng() * 2) : h(6 + rng() * 1.5);
  let bed = res.temper === 0 ? h(20 + rng()) : res.temper === 2 ? h(24.5 + rng() * 1.5) : h(21.5 + rng() * 1.5);
  if (shift === 0) { wake = h(5 + rng() * 0.5); bed = h(21 + rng()); }
  else if (shift === 1) { wake = h(9 + rng()); bed = h(23 + rng()); }
  else if (shift === 2) { wake = h(10.5 + rng()); bed = h(WATCH_SHIFTS[2][1]); }
  else if (shift === 3) { wake = h(13 + rng()); bed = h(21.5 + rng()); }
  const startOut = shift === 3 ? nightTail(res, places, day - 1, watchSize, mpm) : null;
  const walkIn = shift === 0 ? morningWalk(res, places, day, watchSize, mpm) : null;
  const walkOut = shift === 3 ? morningWalk(res, places, day + 1, watchSize, mpm) : null;
  /** @type {{ kind: string, at: Spot|null, from: number, dur: number, until?: number, slack?: number, mark?: { duty?: boolean, pair?: 0|1|null } }[]} */
  const intents = [];
  const I = (kind, at, from, dur, until = undefined, slack = undefined, mark = undefined) => { if (at) intents.push({ kind, at: at.kind === 'square' && !mark?.duty ? fav.square : at, from, dur, until, slack, mark }); };
  const stroll = (from) => {
    const spots = [...places.social, ...(places.corners ?? []), ...places.market];
    if (spots.length < 2) return;
    const a = spots[Math.floor(rng() * spots.length)];
    let b = spots[Math.floor(rng() * spots.length)];
    if (b === a) b = spots[(spots.indexOf(a) + 1) % spots.length];
    I('social', a, from, rollInt(rng, 6, 15));
    I('market', b, from + 20, rollInt(rng, 6, 15));
  };
  const evening = (at = h(18)) => {
    const from = at + rollInt(rng, 0, EVENING_SPREAD_MIN);
    if (res.social > 0.3) I('social', pickOf(rng, fav.social.length ? fav.social : [null]), from, rollInt(rng, 30, 90));
    if (res.drink > TAVERN_DRINK && rng() < 0.75) I('tavern', fav.tavern, from + 60, rollInt(rng, 90, 180));
    else if (res.pious > 0.7 && rng() < 0.6) I('temple', fav.temple, from + 30, rollInt(rng, 30, 60));
    else if (res.social > 0.75 && rng() < 0.3) {
      const houses = doorKinds(places).houses.filter((s) => s !== home);
      if (houses.length) I('visit', houses[Math.floor(rng() * houses.length)], from + 45, rollInt(rng, 60, 120));
    }
  };
  const brng = browse.length ? lwRng(res.town, res.roll.charCodeAt(0), res.slot, day, 0x62726f77) : null;
  const errand = (from) => {
    if (brng && brng() < PATRON_BROWSE_SHARE) { I('shop', browse[Math.floor(brng() * browse.length) % browse.length], from, 10 + Math.floor(brng() * 15)); return; }
    if (rng() < ERRAND_SHOP_SHARE && fav.shops.length) I('shop', errandShop(job, places, fav.shops, rng), from, rollInt(rng, 15, 35));
    else I('market', fav.market, from, rollInt(rng, 20, 40));
  };
  const job = visitor ? (res.job === 'carter' ? 'carter-visit' : res.job === 'minstrel' ? 'minstrel-visit' : res.job === 'pilgrim' ? 'pilgrim-visit' : 'visitor') : res.job;
  const lodger = isLodger(res, places, home);
  switch (job) {
    case 'keeper': case 'smith': case 'clerk': case 'scholar': case 'helper': case 'guildsman': {
      if (rng() < 0.25) errand(wake + 30);
      const at = job === 'guildsman' && work && hallGuildDays(places, work, bandOf) === GUILD_DAYS_SHUT ? home : work ?? home;
      I('work', at, h(job === 'smith' ? 7 : 8), 240);
      const lunch = rng();
      if (lunch < 0.3) I('tavern', fav.tavern, h(12), 45);
      else if (lunch < 0.5) I('market', fav.market, h(12), 30);
      I('work', at, h(12.5), 330, h(18));
      if (fav.guild && job !== 'guildsman' && guildDay(res, day, hallGuildDays(places, fav.guild, bandOf))) I('guild', fav.guild, h(18), rollInt(rng, 60, 120));
      evening();
      break;
    }
    case 'crafter': {
      if (rng() < 0.7) errand(h(9));
      if (rng() < 0.5) I('stall', rng() < 0.5 ? places.square ?? fav.market : fav.market, h(13), rollInt(rng, 60, 150));
      else if (rng() < 0.5) errand(h(14));
      evening();
      break;
    }
    case 'homemaker': {
      I('market', fav.market, h(MARKET_HOURS[0] + rng() * (MARKET_HOURS[1] - MARKET_HOURS[0])), rollInt(rng, 45, 90));
      errand(h(11));
      if (res.social > 0.5) stroll(h(13));
      if (res.pious > 0.6) I('temple', fav.temple, h(15), rollInt(rng, 30, 60));
      if (res.social > 0.3) I('social', pickOf(rng, fav.social.length ? fav.social : [null]), h(16), rollInt(rng, 45, 120));
      evening(h(18.5));
      break;
    }
    case 'labourer': case 'courier': {
      let t = h(7), lunch = false;
      for (let i = 0, n = rollInt(rng, 3, 5); i < n; i++) {
        const shop = fav.shops.length && rng() < 0.3;
        const spots = [...places.market, ...places.social];
        const at = shop ? fav.shops[Math.floor(rng() * fav.shops.length)] : (spots.length ? spots[Math.floor(rng() * spots.length)] : null);
        const dur = rollInt(rng, 25, 60);
        I(shop ? 'work' : 'stall', at, t, dur);
        t += 120;
        // The lunch roll stays at this point in the draw order so every later roll of the day is unchanged.
        if (i === 1) lunch = rng() < 0.3;
        if (i === 2 && lunch) I('tavern', fav.tavern, t - 120 + dur, 30);
      }
      evening();
      break;
    }
    case 'carter': case 'hunter':
    case 'farmer': {
      I('fields', exitNearest(places, home.cell), h(6), 660, h(17));
      evening(h(18));
      break;
    }
    case 'fisher': case 'sailor': {
      const dock = places.dock.length ? places.dock[lwSeed(res.town, res.slot) % places.dock.length] : null;
      I(dock ? 'dock' : 'fields', dock ?? exitNearest(places, home.cell), h(job === 'sailor' ? 6 : 5.5), 450, h(job === 'sailor' ? 15 : 13));
      if (job === 'fisher') I('stall', rng() < 0.5 ? places.square ?? fav.market : fav.market, h(14), rollInt(rng, 60, 90));
      if (job === 'sailor' && res.drink > 0.3) I('tavern', fav.tavern, h(16), rollInt(rng, 120, 240));
      evening(h(18.5));
      break;
    }
    case 'beggar': {
      I('beg', fav.social[0] ?? null, h(8), 240);
      I('market', fav.market, h(12), 30);
      I('beg', fav.social[1] ?? fav.social[0] ?? null, h(13), 300, h(18));
      break;
    }
    case 'innkeeper': case 'server': {
      if (rng() < 0.6) I('market', fav.market, h(10.5), rollInt(rng, 30, 45));
      I('work', work ?? home, h(11), 900, bed);
      break;
    }
    case 'priest': {
      if (rng() < 0.4) I('social', fav.temple ? (places.social.find((s) => s.building === fav.temple?.building) ?? null) : null, h(8), rollInt(rng, 30, 60));
      if (rng() < 0.3) I('market', fav.market, h(10), rollInt(rng, 20, 30));
      I('work', work ?? home, h(11), 600, bed);
      break;
    }
    case 'noble':
    case 'courtier': {
      if (rng() < 0.35) I('social', places.square, h(15), rollInt(rng, 30, 60));
      if (fav.guild && guildDay(res, day, hallGuildDays(places, fav.guild, bandOf))) I('guild', fav.guild, h(16.5), rollInt(rng, 60, 120));
      break;
    }
    case 'guard': {
      const duty = watchDuty(res, places, day, watchSize);
      if (duty.shift === 3) {
        if (startOut) for (const s of startOut.stops) I(startOut.kind, s.at, s.from, s.dur, undefined, Infinity, { duty: true, pair: startOut.pair });
        evening(h(18));
        break;
      }
      const [s0, s1] = WATCH_SHIFTS[duty.shift];
      const [from, until] = [h(s0), Math.min(h(s1), D1)];
      if (duty.shift === 2) { errand(h(15)); if (res.social > 0.4) I('social', pickOf(rng, fav.social.length ? fav.social : [null]), h(17.5), rollInt(rng, 30, 75)); }
      const mark = { duty: true, pair: duty.pair };
      if (duty.kind === 'post') I('post', duty.post, from, until - from, until, Infinity, mark);
      else {
        const beat = patrolBeat(places, res.town, duty.company, duty.patrol, day, duty.shift);
        const stops = patrolStops(beat, lwRng(res.town, 0x73746f70, duty.company, duty.patrol, day, duty.shift), 0, from, until, mpm, true);
        for (const s of stops) I('watch', s.at, s.from, s.dur, until, Infinity, mark);
      }
      if (duty.shift === 0) evening(h(17.5));
      break;
    }
    case 'merchant': {
      I('stall', places.square ?? fav.market, h(8), 300, h(13));
      I('tavern', fav.tavern, h(13), 45);
      for (let i = 0; i < 2 && fav.shops.length; i++) I('shop', errandShop(job, places, fav.shops, rng), h(14.5 + i), rollInt(rng, 30, 50));
      I('tavern', fav.tavern, h(19), rollInt(rng, 120, 200));
      break;
    }
    case 'patrol': case 'retainer':
    case 'mercenary': {
      I('social', places.square ?? fav.social[0] ?? null, h(10), rollInt(rng, 60, 120));
      I('tavern', fav.tavern, h(13), 60);
      // Drawn even when the hall is shut, so the later draws of the day stay the same.
      const stay = rollInt(rng, 60, 120);
      if (hallGuildDays(places, fav.guild, bandOf) !== GUILD_DAYS_SHUT) I('guild', fav.guild, h(15), stay);
      I('tavern', fav.tavern, h(19), rollInt(rng, 120, 240));
      break;
    }
    case 'adventurer': {
      if (rng() < 0.3) I('temple', fav.temple, h(9), rollInt(rng, 20, 40));
      const outfitters = nearestOf(places, doorKinds(places).outfitters, home);
      if (outfitters.length && rng() < 0.6) I('shop', outfitters[Math.floor(rng() * Math.min(3, outfitters.length))], h(10), rollInt(rng, 30, 60));
      if (hallGuildDays(places, fav.guild, bandOf) !== GUILD_DAYS_SHUT) I('guild', fav.guild, h(11.5), 60);
      I('social', places.square ?? fav.social[0] ?? null, h(14), rollInt(rng, 60, 120));
      I('tavern', lodger ? home : fav.tavern, h(18.5), rollInt(rng, 180, 300), lodger ? bed - rollInt(rng, LODGE_UP_MIN[0], LODGE_UP_MIN[1]) : undefined);
      break;
    }
    case 'pilgrim': {
      I('temple', fav.temple, h(7), 60);
      I('market', fav.market, h(10), rollInt(rng, 30, 60));
      if (res.social > 0.5) stroll(h(12.5));
      if (res.social > 0.4) I('social', fav.social[0] ?? null, h(15), rollInt(rng, 30, 60));
      I('temple', fav.temple, h(17), 45);
      break;
    }
    case 'pilgrim-visit': {
      I('temple', fav.temple, h(PILGRIM_TEMPLE_H[0]), rollInt(rng, 150, 210));
      I('market', fav.market, h(13), rollInt(rng, 30, 60));
      I('temple', fav.temple, h(PILGRIM_TEMPLE_H[1]), rollInt(rng, 90, 120));
      I('tavern', lodger ? home : fav.tavern, h(19.5), rollInt(rng, 90, 150), lodger ? bed - rollInt(rng, LODGE_UP_MIN[0], LODGE_UP_MIN[1]) : undefined);
      break;
    }
    case 'carter-visit': {
      I('stall', places.square ?? fav.market, h(MARKET_STALL_H[0]), (MARKET_STALL_H[1] - MARKET_STALL_H[0]) * 60, h(MARKET_STALL_H[1]), Infinity);
      break;
    }
    case 'minstrel': case 'minstrel-visit': {
      I('market', fav.market, h(11), rollInt(rng, 30, 60));
      const room = job === 'minstrel-visit' && lodger ? home : fav.tavern;
      I('tavern', room, h(MINSTREL_PLAY_H[0]), (MINSTREL_PLAY_H[1] - MINSTREL_PLAY_H[0]) * 60, lodger && job === 'minstrel-visit' ? bed - rollInt(rng, LODGE_UP_MIN[0], LODGE_UP_MIN[1]) : undefined);
      break;
    }
    case 'visitor': {
      I('market', fav.market, h(9), rollInt(rng, 30, 60));
      if (fav.shops.length) I('shop', errandShop(job, places, fav.shops, rng), h(10.5), rollInt(rng, 30, 60));
      if (res.pious > 0.5) I('temple', fav.temple, h(13), rollInt(rng, 30, 45));
      I('social', places.square ?? fav.social[0] ?? null, h(15), rollInt(rng, 45, 90));
      I('tavern', lodger ? home : fav.tavern, h(18), rollInt(rng, 180, 300), lodger ? bed - rollInt(rng, LODGE_UP_MIN[0], LODGE_UP_MIN[1]) : undefined);
      break;
    }
    default: evening();
  }
  for (const e of errands) if (e?.at) patronErrand(intents, e, mpm);
  if (res.temper === 0 && res.social > 0.6 && job !== 'guard' && job !== 'farmer' && job !== 'fisher') { const at = intents.length; stroll(wake + 20); intents.unshift(...intents.splice(at)); }
  if (lodger) { const at = intents.length; I('tavern', home, wake + rollInt(rng, LODGE_BREAKFAST_MIN[0], LODGE_BREAKFAST_MIN[1]), rollInt(rng, 20, 40)); intents.unshift(...intents.splice(at)); }
  const start = startOut ? { at: startOut.at, kind: startOut.kind, mark: { duty: true, pair: startOut.pair } } : walkIn ? { at: walkIn.to, kind: walkIn.kind, mark: walkIn.mark, walk: walkIn } : null;
  return schedule(intents, { D0, D1, wake, bed, home, mpm, away, start, end: walkOut });
}

/**
 * @param {{ kind: string, at: Spot|null, from: number, dur: number, until?: number, slack?: number, mark?: { duty?: boolean, pair?: 0|1|null } }[]} intents
 * @param {{ at: Spot, from: number, dur: number }} e
 * @param {number} mpm
 */
function patronErrand(intents, e, mpm) {
  // The errand goes before any stay that begins at or after its minute; a stay begun at the same minute would be
  // cut to nothing and delay the errand.
  let k = intents.findIndex((it) => it.from >= e.from);
  if (k < 0) k = intents.length;
  /** @type {typeof intents} */
  const add = [{ kind: 'shop', at: e.at, from: e.from, dur: e.dur, until: e.from + e.dur + PATRON_LATE_MIN }];
  const prev = intents[k - 1];
  if (prev?.at && !prev.mark?.duty) {
    const end = Math.min(prev.from + prev.dur, prev.until ?? Infinity);
    const leave = e.from - walkMinutes(prev.at, e.at, mpm);
    if (end > leave) {
      const back = e.from + e.dur + walkMinutes(e.at, prev.at, mpm);
      if (end - back >= MIN_STAY) add.push({ ...prev, from: back, dur: end - back });
      prev.until = Math.min(prev.until ?? Infinity, leave);
    }
  }
  intents.splice(k, 0, ...add);
}

/**
 * @param {{ kind: string, at: Spot|null, from: number, dur: number, until?: number, slack?: number, mark?: { duty?: boolean, pair?: 0|1|null } }[]} intents
 * @param {{ D0: number, D1: number, wake: number, bed: number, home: Spot, mpm: number, away: readonly Away[], start?: { at: Spot, kind: string, mark?: { duty?: boolean, pair?: 0|1|null }, walk?: MorningWalk } | null, end?: MorningWalk | null }} o
 * @returns {Entry[]}
 */
export function schedule(intents, { D0, D1, wake, bed, home, mpm, away, start = null, end: walkOut = null }) {
  /** @type {Entry[]} */
  const out = [];
  const push = (kind, at, t0, t1, extra = {}) => {
    if (!(t1 > t0)) return;
    const last = out[out.length - 1];
    if (last && kind !== 'walk' && last.kind === kind && last.at === at && last.t1 === t0 && !!last.armed === !!extra.armed) { last.t1 = t1; return; }
    out.push({ kind, at, t0, t1, ...extra });
  };
  const windows = [...(away ?? [])].filter((w) => w.t1 > D0 && w.t0 < D1).sort((a, b) => a.t0 - b.t0);
  let at = start?.at ?? home, atKind = start?.kind ?? 'home', cursor = D0;
  let atMark = start?.mark ?? null;
  if (start?.walk) { const w = start.walk; push('walk', w.to, w.t0, w.t1, { from: w.from, to: w.to, ...w.mark }); cursor = w.t1; }
  const fill = (t) => {
    t = Math.min(t, D1);
    if (!(t > cursor)) return;
    if (at === home) {
      for (const [a, b, k] of [[cursor, Math.min(t, wake), 'sleep'], [Math.max(cursor, wake), Math.min(t, bed), 'home'], [Math.max(cursor, bed), t, 'sleep']]) {
        if (b > a) push(/** @type {string} */ (k), home, /** @type {number} */ (a), /** @type {number} */ (b));
      }
    } else push(atKind, at, cursor, t, atMark ?? {});
    cursor = t;
  };
  const go = (to, by, extra = {}, arriveKind = 'home', arriveMark = null) => {
    if (to === at) return;
    const m = walkMinutes(at, to, mpm);
    if (m > 0) { fill(Math.max(cursor, by - m)); push('walk', to, cursor, cursor + m, { from: at, to, ...(atMark ?? {}), ...(arriveMark ?? {}), ...extra }); cursor += m; }
    at = to;
    atKind = arriveKind;
    atMark = arriveMark;
  };
  const runAway = (w) => {
    const exit = w.exit ?? null;
    if (w.t0 > cursor && exit) {
      const out_ = walkMinutes(home, exit, mpm);
      const leaveHome = w.t0 - out_;
      if (at !== home) go(home, leaveHome - (w.armed ? GEAR_MIN : 0));
      if (w.armed) { fill(leaveHome - GEAR_MIN); if (leaveHome > cursor) { push('gear', home, cursor, leaveHome); cursor = leaveHome; } }
      go(exit, w.t0, { armed: !!w.armed }, 'away');
    }
    const back = exit && exit !== home ? walkMinutes(exit, home, mpm) : 0;
    const halt = exit && exit !== home && w.halt && w.halt > 0 ? w.halt : 0;
    let t1 = Math.min(D1, w.t1);
    // A walk home that would run past the day end is never started: the resident stays away to the end and the next
    // day plan starts them at home.
    if (back > 0 && Math.max(cursor, t1) + halt + back > D1) t1 = D1;
    if (t1 > cursor) push('away', exit ?? home, cursor, t1, { armed: !!w.armed });
    cursor = Math.max(cursor, t1);
    at = exit ?? home; atKind = 'away';
    if (cursor < D1 && halt > 0) { push('gate', exit, cursor, cursor + halt); cursor += halt; atKind = 'gate'; }
    if (cursor < D1 && back > 0) {
      push('walk', home, cursor, cursor + back, { from: exit, to: home, armed: !!w.armed });
      cursor += back;
      at = home; atKind = 'home';
    }
  };
  let wi = 0;
  while (wi < windows.length && windows[wi].t0 <= D0) runAway(windows[wi++]);
  const nextWatch = intents.map(() => /** @type {typeof intents[number] | null} */ (null));
  for (let k = intents.length - 2; k >= 0; k--) nextWatch[k] = intents[k + 1].mark?.duty ? intents[k + 1] : nextWatch[k + 1];
  for (const [k, it] of intents.entries()) {
    if (cursor >= D1) break;
    if (!!atMark?.duty !== !!it.mark?.duty && at !== home) go(home, cursor);
    const m = walkMinutes(at, it.at, mpm);
    while (wi < windows.length && windows[wi].t0 < Math.max(cursor + m, it.from) + MIN_STAY) runAway(windows[wi++]);
    const m2 = walkMinutes(at, it.at, mpm);
    const start = Math.max(cursor + m2, it.from);
    if (start - it.from > (it.slack ?? 120)) continue;
    const homeBy = it.mark?.duty ? Infinity : bed - walkMinutes(it.at, home, mpm);
    const w = windows[wi];
    const awayBy = w ? w.t0 - (w.armed ? GEAR_MIN : 0) - walkMinutes(home, w.exit ?? home, mpm) - walkMinutes(it.at, home, mpm) : Infinity;
    const nw = it.mark?.duty ? null : nextWatch[k];
    const watchBy = nw ? nw.from - walkMinutes(it.at, home, mpm) - walkMinutes(home, nw.at, mpm) : Infinity;
    const end = Math.min(start + it.dur, it.until ?? Infinity, homeBy, awayBy, watchBy, D1);
    if (end - start < MIN_STAY) continue;
    if (at !== home && (at !== it.at || !OUTDOOR.has(it.kind))) {
      if (start - cursor > walkMinutes(at, home, mpm) + walkMinutes(home, it.at, mpm) + HOME_GAP) go(home, cursor);
      else go(/** @type {Spot} */ (it.at), cursor + walkMinutes(at, it.at, mpm), {}, it.kind, it.mark ?? null);
    }
    go(/** @type {Spot} */ (it.at), start, {}, it.kind, it.mark ?? null);
    fill(start);
    push(it.kind, it.at, start, end, it.mark ?? {});
    cursor = end;
    atKind = it.kind;
    atMark = it.mark ?? null;
  }
  while (wi < windows.length) runAway(windows[wi++]);
  if (cursor < D1 && at !== home) go(home, cursor);
  if (walkOut) { fill(walkOut.t0); push('walk', walkOut.to, walkOut.t0, walkOut.t1, { from: walkOut.from, to: walkOut.to, ...walkOut.mark }); }
  else fill(D1);
  return out;
}

/**
 * @param {readonly Entry[]} plan
 * @param {number} t
 */
export function entryAt(plan, t) {
  let lo = 0, hi = plan.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (plan[mid].t0 <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 && t < plan[ans].t1 ? ans : -1;
}

/** @param {Entry|null|undefined} e */
export const isOutdoor = (e) => !!e && OUTDOOR.has(e.kind);
