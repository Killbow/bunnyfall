// @ts-check
// A company is a set of roster places, not people: whoever holds a place that cycle walks with it, and the trip
// belongs to the first place.
import { lwSeed, lwRng, rollInt, pickOf, textSeed } from './seed.js';
import { holidayOn, holidayKeptIn } from '../../world/holidays.js';
import { dayOfYearFromMinutes } from '../../world/gameDate.js';
import { DAY_MIN } from './dayPlan.js';

export const COMPANY_SIZE = Object.freeze([2, 4]);
export const COMPANY_CITY_MAX = 5;
export const COMPANY_CITY_ADVENTURERS = 5;
export const COMPANY_DIVE_CHANCE = 0.75;
export const ROLE_RUNS = Object.freeze({ mage: [128, 133], thief: [134, 139], warrior: [140, 145] });
export const ROLE_ORDER = Object.freeze(['warrior', 'thief', 'mage']);
export const HOLY_CHANCE = 0.8;
export const COMPANY_WORDS = Object.freeze(['Lantern', 'Iron', 'Silver', 'Wandering', 'Grey', 'Oaken', 'Last', 'Free', 'Crimson', 'Northern', 'Hollow', 'Bright']);
export const COMPANY_BEASTS = Object.freeze(['Ravens', 'Wolves', 'Hawks', 'Stags', 'Foxes', 'Owls', 'Bears', 'Hounds']);
const COMP = 0x636f6d70, HOLY = 0x686f6c79;

/** @param {number|null|undefined} cls */
export function roleOf(cls) {
  if (cls == null) return null;
  for (const [role, [lo, hi]] of Object.entries(ROLE_RUNS)) if (cls >= lo && cls <= hi) return role;
  return null;
}
/**
 * @template {{ cls?: number|null }} T
 * @param {T[]} members
 * @returns {T[]}
 */
export const byRole = (members) => [...members].sort((a, b) => rank(a) - rank(b));
const rank = (m) => { const i = ROLE_ORDER.indexOf(/** @type {string} */ (roleOf(m.cls))); return i < 0 ? ROLE_ORDER.length : i; };

/**
 * Cached by roster identity, which relies on the census building each town roster once.
 * @type {WeakMap<object, any[]>}
 */
const DEALS = new WeakMap();

/**
 * @param {any[]} roster
 * @returns {{ key: string, places: any[], name: string }[]}
 */
export function companiesOf(roster) {
  let got = DEALS.get(roster);
  if (got) return got;
  const advs = roster.filter((r) => r.job === 'adventurer').sort((a, b) => a.slot - b.slot);
  const max = advs.length >= COMPANY_CITY_ADVENTURERS ? COMPANY_CITY_MAX : COMPANY_SIZE[1];
  const left = [...advs];
  got = [];
  while (left.length >= 2) {
    const first = /** @type {any} */ (left.shift());
    const size = Math.min(left.length + 1, rollInt(lwRng(first.town >>> 0, first.slot, COMP), COMPANY_SIZE[0], max));
    const places = [first];
    for (let j = 1; j < size; j++) {
      const have = new Set(places.map((p) => roleOf(p.cls)));
      const i = left.findIndex((r) => !have.has(roleOf(r.cls)));
      places.push(left.splice(i >= 0 ? i : 0, 1)[0]);
    }
    const key = `C${first.town >>> 0}.${got.length}`;
    got.push({ key, places, name: companyName(key, first.name, '') });
  }
  DEALS.set(roster, got);
  return got;
}

/**
 * @param {string} key
 * @param {string} first
 * @param {string} town
 */
export function companyName(key, first, town) {
  const rng = lwRng(textSeed(key), COMP);
  const r = rng(), word = pickOf(rng, COMPANY_WORDS), beasts = pickOf(rng, COMPANY_BEASTS);
  const name = String(first).split(' ')[0];
  if (r < 1 / 3 && name) return `${name}'s company`;
  if (r < 2 / 3 && town) return `${beasts} of ${town}`;
  return `The ${word} Company`;
}
/**
 * @param {any} c
 * @param {string} town
 */
export const namedIn = (c, town) => ({ ...c, name: companyName(c.key, c.places[0]?.name ?? '', town) });

/**
 * @param {any} res
 * @param {any[]} roster
 */
export function companyOfPlace(res, roster) {
  if (res?.job !== 'adventurer') return null;
  return companiesOf(roster).find((c) => c.places.some((p) => p.slot === res.slot)) ?? null;
}

/** @param {any[]} members */
export const headOf = (members) => members.reduce((a, m) => (!a || (m.level ?? 1) > (a.level ?? 1) ? m : a), null);

/**
 * @param {any[]} temples
 * @param {number} day0
 * @param {number} days
 * @returns {{ town: any, day: number, id: number } | null}
 */
export function holyDayOf(temples, day0, days) {
  for (let d = day0 + 1; d < day0 + days - 1; d++) {
    const row = holidayOn(dayOfYearFromMinutes(d * DAY_MIN + 12 * 60));
    // A classic holiday row with region `0xFF` is observed by every region, so it draws no pilgrims.
    if (!row || row.region === 0xFF) continue;
    for (const t of temples) if (holidayKeptIn(row, t.region ?? -1)) return { town: t, day: d, id: row.id };
  }
  return null;
}
/**
 * @param {any} home
 * @param {number} day
 */
export const holyDepartMin = (home, day) => 6 * 60 + (lwSeed(home.mapId >>> 0, day, HOLY) % 90);
/**
 * @param {any} res
 * @param {number} k
 */
export const holyDraw = (res, k) => lwRng(res.town >>> 0, res.slot, k, HOLY)() < HOLY_CHANCE;
