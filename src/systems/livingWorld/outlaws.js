// @ts-check
import { lwSeed, lwRng, textSeed, rollInt, pickOf } from './seed.js';
import { NATIVE_PIXEL } from './trips.js';
import { DAY_MIN } from './dayPlan.js';
import { residentName } from './census.js';
import { getNameBankOfRegion, GENDERS } from '../../characters/nameHelper.js';
import { MOBILE_TYPES } from '../../characters/mobileTypes.js';
import { CARAVAN_QUALITY, purseOf } from './caravanDoor.js';

export const BAND_TOWNS_PER = 40;
export const BANDS_MAX = 4;
export const BAND_LEG_PX = Object.freeze([3, 14]);
export const BAND_TOWN_BLOCKS = 4;
export const HIDEOUT_OFF_PX = Object.freeze([1, 2]);
export const OUTLAW_REACH_PX = 2;
export const BAND_SHARE = 0.6;
export { ROB_RATIO } from './trouble.js';
export const BAND_ERA_DAYS = 60;
export const ROUT_CHANCE = Object.freeze({ patrolled: 0.45, wild: 0.15 });
export const BAND_VACANT_DAYS = 20;
// Must match `CITY_COURT_BLOCKS` in census.js.
export const COURT_BLOCKS = 16;
export const BAND_SIZE = Object.freeze([4, 8]);
export const OUTLAW_CLASSES = Object.freeze([MOBILE_TYPES.Thief, MOBILE_TYPES.Rogue, MOBILE_TYPES.Burglar, MOBILE_TYPES.Nightblade, MOBILE_TYPES.Barbarian, MOBILE_TYPES.Archer]);
export const TAKE_DAYS = 14;
export const TAKE_PURSE_SHARE = 0.25;
export const ROB_GOLD = 40;
export const TAKE_GOODS = 2;
export const TAKE_GOODS_MAX = 16;
export const BAND_WORDS = Object.freeze(['Black', 'Red', 'Grey', 'Iron', 'Broken', 'Hollow', 'Night', 'Ash', 'Bitter', 'Crooked', 'Silent', 'Hanged']);
export const BAND_NOUNS = Object.freeze(['Hand', 'Wolves', 'Knives', 'Crows', 'Company', 'Brothers', 'Hounds', 'Blades', 'Ravens', 'Fangs']);
const HIDE = 0x68696465, BAND = 0x62616e64, ROUT = 0x726f7574;

/**
 * @typedef {{ key: string, region: number, i: number, px: number, py: number, x: number, z: number, a: number, b: number, patrolled: boolean, top: number }} Hideout
 * @typedef {{ key: string, hideout: Hideout, gen: number, heir: number, formedT: number, name: string, level: number, people: { id: string, name: string, cls: number, level: number, gender: number, sex: string }[] }} Band
 */

/** @param {number} n */
export const bandCount = (n) => (n > 1 ? Math.min(BANDS_MAX, 1 + Math.floor(n / BAND_TOWNS_PER)) : 0);
/**
 * @param {number} px
 * @param {number} py
 */
export const pixelNative = (px, py) => ({ x: px * NATIVE_PIXEL + NATIVE_PIXEL / 2, z: (499 - py) * NATIVE_PIXEL + NATIVE_PIXEL / 2 });
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.py - b.py));

/**
 * @param {number} region
 * @param {{ townsIn?: (region: number) => any[], routeOf: (a: any, b: any) => any, townsNear: (px: number, py: number, r: number) => any[], dryAt?: (nx: number, nz: number) => boolean }} world
 * @returns {Hideout[] | undefined}
 */
export function hideoutsOf(region, world) {
  const towns = [...(world.townsIn?.(region) ?? [])].sort((p, q) => p.mapId - q.mapId);
  const n = bandCount(towns.length);
  if (!n) return [];
  const big = towns.filter((t) => (t.blocks | 0) >= BAND_TOWN_BLOCKS);
  /** @type {[any, any][]} */
  const legs = [];
  for (let i = 0; i < big.length; i++) {
    for (let j = i + 1; j < big.length; j++) {
      const d = cheb(big[i], big[j]);
      if (d >= BAND_LEG_PX[0] && d <= BAND_LEG_PX[1]) legs.push([big[i], big[j]]);
    }
  }
  if (!legs.length) return [];
  const top = Math.max(...towns.map((t) => t.blocks | 0));
  const patrolled = top >= COURT_BLOCKS;
  /** @type {Hideout[]} */
  const out = [];
  const taken = new Set();
  for (let i = 0; i < Math.min(n, legs.length); i++) {
    let k = lwSeed(region >>> 0, i, HIDE) % legs.length;
    while (taken.has(k)) k = (k + 1) % legs.length;
    taken.add(k);
    const [a, b] = legs[k];
    const plan = world.routeOf(a, b);
    if (plan === undefined) return undefined;
    const at = plan?.pixels?.length ? hideoutOff(plan.pixels, lwSeed(region >>> 0, i, HIDE, 1), world) : null;
    if (!at) continue;
    out.push({ key: `O${region >>> 0}.${i}`, region: region >>> 0, i, ...at, ...pixelNative(at.px, at.py), a: a.mapId, b: b.mapId, patrolled, top });
  }
  return out;
}

function hideoutOff(pixels, seed, world) {
  const mid = Math.floor(pixels.length / 2);
  const off = HIDEOUT_OFF_PX[seed % 2], side = (seed >>> 1) % 2 ? 1 : -1;
  for (const shift of [0, 1, -1, 2, -2]) {
    const m = Math.max(0, Math.min(pixels.length - 1, mid + shift));
    const p = pixels[m], q = pixels[Math.min(pixels.length - 1, m + 1)], o = pixels[Math.max(0, m - 1)];
    const dx = Math.sign(q.x - o.x), dy = Math.sign(q.y - o.y);
    const perp = dx || dy ? { x: -dy, y: dx } : { x: 1, y: 0 };
    for (const d of [off, HIDEOUT_OFF_PX[0] + HIDEOUT_OFF_PX[1] - off]) {
      for (const s of [side, -side]) {
        const px = p.x + perp.x * d * s, py = p.y + perp.y * d * s;
        if (px < 0 || py < 0 || px > 999 || py > 499) continue;
        if (world.townsNear(px, py, 0).length) continue;
        const c = pixelNative(px, py);
        if (world.dryAt && !world.dryAt(c.x, c.z)) continue;
        return { px, py };
      }
    }
  }
  return null;
}

/**
 * @param {Hideout} h
 * @param {number} e
 */
export function routOfEra(h, e) {
  const rng = lwRng(textSeed(h.key), ROUT, e);
  if (rng() >= (h.patrolled ? ROUT_CHANCE.patrolled : ROUT_CHANCE.wild)) return null;
  const era = BAND_ERA_DAYS * DAY_MIN;
  return e * era + era * (0.1 + 0.8 * rng());
}

/** @type {Map<string, { e: number, gen: number, lastT: number }>} */
const GENS = new Map();
/**
 * @param {Hideout} h
 * @param {number} t
 * @returns {{ gen: number, formedT: number, vacant: boolean }}
 */
export function genAt(h, t) {
  const era = BAND_ERA_DAYS * DAY_MIN, vac = BAND_VACANT_DAYS * DAY_MIN;
  const k = Math.max(0, Math.floor(t / era));
  let c = GENS.get(h.key);
  if (!c || c.e > k - 1) c = { e: 0, gen: 0, lastT: -Infinity };
  for (; c.e < k - 1; c.e++) { const r = routOfEra(h, c.e); if (r != null) { c.gen++; c.lastT = r + vac; } }
  if (GENS.size > 512) GENS.clear();
  GENS.set(h.key, c);
  let gen = c.gen, formedT = c.lastT, vacant = false;
  for (let e = Math.max(0, k - 1); e <= k; e++) {
    const r = routOfEra(h, e);
    if (r == null || r > t) continue;
    if (t < r + vac) { vacant = true; continue; }
    gen++; formedT = r + vac;
  }
  return { gen, formedT, vacant };
}

/**
 * @param {Hideout} h
 * @param {number} t
 * @param {Map<string, { t: number }> | null} [routs]
 * @param {(region: number) => number} [bankOf]
 * @returns {Band | null}
 */
export function outlawBandAt(h, t, routs = null, bankOf = getNameBankOfRegion) {
  const g = genAt(h, t);
  if (g.vacant) return null;
  let heir = 0, formedT = g.formedT;
  const vac = BAND_VACANT_DAYS * DAY_MIN;
  for (let r = routs?.get(`${h.key}@${g.gen}.0`); r; r = routs?.get(`${h.key}@${g.gen}.${heir}`)) {
    if (r.t > t) break;
    if (t < r.t + vac) return null;
    heir++; formedT = r.t + vac;
  }
  const key = `${h.key}~${g.gen}${heir ? `h${heir}` : ''}`;
  const people = bandPeople(h, key, bankOf);
  return { key, hideout: h, gen: g.gen, heir, formedT, name: outlawBandName(key, people[0]?.name ?? ''), level: Math.max(...people.map((p) => p.level)), people };
}

/**
 * @param {string} key
 * @param {string} leader
 */
export function outlawBandName(key, leader) {
  const rng = lwRng(textSeed(key), BAND, 0x6e616d65);
  const noun = pickOf(rng, BAND_NOUNS), word = pickOf(rng, BAND_WORDS);
  const first = String(leader).split(' ')[0];
  return rng() < 1 / 3 && first ? `${first}'s ${noun}` : `the ${word} ${noun}`;
}

/**
 * @param {Hideout} h
 * @param {string} key
 * @param {(region: number) => number} bankOf
 */
export function bandPeople(h, key, bankOf = getNameBankOfRegion) {
  const rng = lwRng(textSeed(key), BAND);
  const n = rollInt(rng, BAND_SIZE[0], BAND_SIZE[1]);
  const base = Math.max(2, Math.min(14, 2 + Math.floor((h.top | 0) / 6)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const female = rng() < 0.3;
    const gender = female ? GENDERS.Female : GENDERS.Male;
    const cls = i === 0 ? pickOf(rng, [MOBILE_TYPES.Nightblade, MOBILE_TYPES.Barbarian, MOBILE_TYPES.Rogue]) : pickOf(rng, OUTLAW_CLASSES);
    const level = Math.max(1, base + (i === 0 ? 3 : rollInt(rng, -1, 2)));
    out.push({ id: `${key}.${i}`, name: residentName(lwSeed(textSeed(key), i, 0x6e6d), bankOf(h.region), gender), cls, level, gender, sex: female ? 'female' : 'male' });
  }
  return out;
}

/**
 * Draws the band share from the trip seed, not the trouble random stream, so the other trouble rolls stay
 * independent of it.
 * @param {any} trip
 * @param {number} px
 * @param {number} py
 * @param {number} t
 * @param {Hideout[]} hideouts
 * @param {Map<string, { t: number }> | null} [routs]
 * @param {number} [max]
 * @returns {{ band: Band, foes: number[], level: number } | null}
 */
export function bandTrouble(trip, px, py, t, hideouts, routs = null, max = 6) {
  const near = hideouts.filter((h) => Math.max(Math.abs(h.px - px), Math.abs(h.py - py)) <= OUTLAW_REACH_PX)
    .sort((a, b) => Math.max(Math.abs(a.px - px), Math.abs(a.py - py)) - Math.max(Math.abs(b.px - px), Math.abs(b.py - py)) || (a.key < b.key ? -1 : 1));
  if (!near.length) return null;
  if (lwRng(textSeed(trip.id), BAND)() >= BAND_SHARE) return null;
  for (const h of near) {
    const band = outlawBandAt(h, t, routs);
    if (!band) continue;
    const who = band.people.slice(0, max);
    return { band, foes: who.map((p) => p.cls), level: Math.round(who.reduce((a, p) => a + p.level, 0) / who.length) };
  }
  return null;
}

/**
 * @param {Band} band
 * @param {any[]} trips
 * @param {number} t
 * @returns {{ robbed: any[], gold: number, goods: number }}
 */
export function takeOf(band, trips, t) {
  const from = Math.max(band.formedT, t - TAKE_DAYS * DAY_MIN);
  const seen = new Set();
  const robbed = trips.filter((tr) => {
    const e = tr?.enc;
    if (!e || e.kind !== 'robbed' || e.band !== band.key || e.t0 < from || e.t0 > t || seen.has(tr.id)) return false;
    seen.add(tr.id);
    return true;
  });
  const gold = robbed.reduce((a, tr) => a + (tr.kind === 'merchant' || tr.kind === 'carter' || tr.kind === 'pedlar' ? Math.round(purseOf(CARAVAN_QUALITY(tr)) * TAKE_PURSE_SHARE) : ROB_GOLD), 0);
  return { robbed, gold, goods: Math.min(TAKE_GOODS_MAX, TAKE_GOODS * robbed.length) };
}
