// @ts-check
// Stats derive from `horseSeed` and are never saved. Each law that takes `rules` defaults to `HORSE_CARE_HARD`, so
// a call without a tier runs the Hard tier.

import { isHorseItem } from './horseCoats.js';
import { UPKEEP_ITEM } from '../systems/upkeep/upkeepItemRows.js';
import { HORSE_CARE_HARD } from '../systems/upkeep/upkeepTiers.js';

export const STEED_STATS = Object.freeze(['speed', 'stamina', 'endurance', 'strength']);
export const STEED_STAT_TEXT = Object.freeze({ speed: 'Speed', stamina: 'Stamina', endurance: 'Endurance', strength: 'Strength' });
export const STEED_BORN_MIN = 20;
export const STEED_BORN_MAX = 80;
export const STEED_STAT_CAP = 100;

const SEED_MAX = 65535;
function mix(a, b) {
  let h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b >>> 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const seedOf = (item) => (isHorseItem(item) && Number.isInteger(item.horseSeed) && item.horseSeed >= 1 && item.horseSeed <= SEED_MAX ? item.horseSeed : 0);

export function bornStats(seed) {
  if (!Number.isInteger(seed) || seed < 1 || seed > SEED_MAX) return null;
  const span = STEED_BORN_MAX - STEED_BORN_MIN;
  /** @type {Record<string, number>} */
  const out = {};
  STEED_STATS.forEach((k, i) => { out[k] = STEED_BORN_MIN + Math.round(span * (mix(seed, 2 * i + 1) + mix(seed, 2 * i + 2)) / 2); });
  return /** @type {{ speed: number, stamina: number, endurance: number, strength: number }} */ (out);
}
export const horseBornStats = (item) => bornStats(seedOf(item));

export const BOND_TENTHS_MAX = 1000;
export const BOND_STEP = 5;
export const BOND_TIERS = Object.freeze([
  Object.freeze({ min: 0, name: 'Wary' }),
  Object.freeze({ min: 15, name: 'Accepting' }),
  Object.freeze({ min: 35, name: 'Familiar' }),
  Object.freeze({ min: 55, name: 'Trusting' }),
  Object.freeze({ min: 75, name: 'Devoted' }),
  Object.freeze({ min: 95, name: 'Kindred' }),
]);
export const DAY_BOND_TENTHS = 30;
export const STARVING_BOND_TENTHS_A_DAY = 20;
const bondTenths = (item) => (Number.isInteger(item?.horseBond) ? Math.max(0, Math.min(BOND_TENTHS_MAX, item.horseBond)) : 0);
export const bondTier = (points) => [...BOND_TIERS].reverse().find((t) => points >= t.min)?.name ?? BOND_TIERS[0].name;
export const bondBonus = (points) => Math.floor(Math.max(0, points) / BOND_STEP);

export const MINUTES_A_DAY = 1440;
export const NEW_HORSE_FED = 12 * 60;
export const FULL_AHEAD = 30 * 60;
export const FED_AHEAD_MAX = 48 * 60;
export const STARVING_AFTER = 2 * MINUTES_A_DAY;
export const HUNGER = Object.freeze({
  fed: Object.freeze({ key: 'fed', name: 'Fed', penalty: 0, breath: 1 }),
  hungry: Object.freeze({ key: 'hungry', name: 'Hungry', penalty: 10, breath: 0.7 }),
  starving: Object.freeze({ key: 'starving', name: 'Starving', penalty: 25, breath: 0.4 }),
});
export const fedUntil = (item) => (Number.isInteger(item?.horseFed) && item.horseFed > 0 ? item.horseFed : null);
export function hungerOf(item, now) {
  const f = fedUntil(item);
  if (f == null || now < f) return 'fed';
  return now - f >= STARVING_AFTER ? 'starving' : 'hungry';
}
const fadeBy = (item, now) => {
  const f = fedUntil(item);
  if (f == null) return 0;
  const starved = now - f - STARVING_AFTER;
  return starved > 0 ? Math.floor((starved / MINUTES_A_DAY) * STARVING_BOND_TENTHS_A_DAY) : 0;
};
export const bondAt = (item, now) => Math.max(0, bondTenths(item) - fadeBy(item, now)) / 10;
function setBond(item, tenths) {
  const t = Math.max(0, Math.min(BOND_TENTHS_MAX, Math.round(tenths)));
  if (t > 0) item.horseBond = t; else delete item.horseBond;
}
// The starving fade owed so far comes off the bond before the food clock moves, so the same fade is never taken
// twice.
function setFed(item, until, now, fades = true) {
  const fade = fades ? fadeBy(item, now) : 0;
  if (fade > 0) setBond(item, bondTenths(item) - fade);
  item.horseFed = Math.max(1, Math.round(until));
}
// In a tier where the bond never fades, a starving horse's clock is held at the starving line, so switching tiers
// later owes no fade for that time.
function holdStarving(item, now) {
  const f = fedUntil(item);
  if (f == null || now - f <= STARVING_AFTER) return false;
  item.horseFed = Math.max(1, Math.round(now - STARVING_AFTER));
  return true;
}

export const OATS_TEMPLATE = UPKEEP_ITEM.Oats;
export const APPLE_TEMPLATES = Object.freeze([532, 1608]);
export const STEED_FOODS = Object.freeze({
  [OATS_TEMPLATE]: Object.freeze({ key: 'oats', name: 'oats', hours: 24, love: 1, treat: false }),
  [APPLE_TEMPLATES[0]]: Object.freeze({ key: 'apple', name: 'an apple', hours: 4, love: 1.5, treat: true }),
  [APPLE_TEMPLATES[1]]: Object.freeze({ key: 'apple', name: 'an apple', hours: 4, love: 1.5, treat: true }),
});
export const steedFoodOf = (item) => (item && !item.questItem && Object.hasOwn(STEED_FOODS, item.templateIndex) ? STEED_FOODS[item.templateIndex] : null);
export const steedFoodIn = (items, kind) => (Array.isArray(items) ? items.find((it) => steedFoodOf(it)?.key === kind) ?? null : null);
function spend(items, food) {
  const i = items.indexOf(food);
  if (i < 0) return false;
  if ((food.stackCount ?? 1) > 1) food.stackCount--;
  else items.splice(i, 1);
  return true;
}

export const STEED_TEXT = Object.freeze({
  noHorse: 'You do not own a horse.',
  notHere: 'Your horse is not here to feed.',
  stabled: 'Your horse is at the stable, where it is fed.',
  full: (who) => `${who} is not hungry.`,
  noFood: (kind) => (kind === 'apple' ? 'You have no apples.' : 'You have no oats. A Stable sells them.'),
  ate: (who, food, tier, grew) => `${who} eats ${food}${grew ? `. Your bond grows (${tier}).` : '.'}`,
  winded: 'Your horse is winded.',
  starving: 'Your horse is too weak to gallop. Feed it.',
  rested: 'Your horse has its breath back.',
  ateOnTheRoad: (n) => `Your horse ate ${n === 1 ? 'a sack' : `${n} sacks`} of oats from your packs.`,
});

/**
 * @param {any[]} items
 * @param {any} horse
 * @param {'oats'|'apple'} kind
 * @param {number} now
 * @param {string} [who]
 * @param {{ from?: any[], food?: any, rules?: any }} [o]
 */
export function feedHorse(items, horse, kind, now, who = 'Your horse', { from = items, food = null, rules = HORSE_CARE_HARD } = {}) {
  if (!isHorseItem(horse) || !Array.isArray(items) || !items.includes(horse)) return { ok: false, text: STEED_TEXT.noHorse, gained: 0 };
  const piece = food && steedFoodOf(food)?.key === kind && Array.isArray(from) && from.includes(food) ? food : steedFoodIn(from, kind);
  if (!piece) return { ok: false, text: STEED_TEXT.noFood(kind), gained: 0 };
  return eat(from, horse, piece, now, rules, who);
}
function eat(items, horse, food, now, rules, who) {
  const f = steedFoodOf(food);
  const from = Math.max(now, fedUntil(horse) ?? now);
  if (from - now >= FULL_AHEAD) return { ok: false, text: STEED_TEXT.full(who), gained: 0 };
  const until = Math.min(now + FED_AHEAD_MAX, from + f.hours * 60);
  const gained = Math.round(((until - from) / MINUTES_A_DAY) * DAY_BOND_TENTHS * f.love);
  spend(items, food);
  setFed(horse, until, now, rules.bondFades);
  const before = bondTenths(horse);
  setBond(horse, before + gained);
  const grew = bondTenths(horse) > before;
  return { ok: true, text: STEED_TEXT.ate(who, f.name, bondTier(bondTenths(horse) / 10), grew), gained: bondTenths(horse) - before };
}

export const STEED_WHERE = Object.freeze(['with', 'waiting', 'stabled']);
export const SKIP_MINUTES = 60;
export const STABLE_FED = 12 * 60;
const STABLE_TOP_UNDER = 6 * 60;
const GRAZED_BACK = STARVING_AFTER - 6 * 60;

/**
 * @param {any[]} items
 * @param {number} now
 * @param {{ since?: number|null, where?: string, stores?: any[], rules?: any }} [o]
 */
export function tendHorses(items, now, { since = null, where = 'with', stores = [], rules = HORSE_CARE_HARD } = {}) {
  let changed = false, ate = 0;
  if (!Array.isArray(items) || !Number.isFinite(now)) return { changed, ate };
  for (const horse of items.filter(isHorseItem)) {
    if (fedUntil(horse) == null) { horse.horseFed = Math.max(1, Math.round(now + NEW_HORSE_FED)); changed = true; continue; }
    // A stabled or grazing horse never starves across the skipped span, so only the fade owed before `since` is
    // taken; with no `since`, all of it up to now.
    const owedTo = since != null && since < now ? since : now;
    if (where === 'stabled') {
      if (/** @type {number} */ (fedUntil(horse)) < now + STABLE_TOP_UNDER) { setFed(horse, now + STABLE_FED, owedTo, rules.bondFades); changed = true; }
      continue;
    }
    if (where === 'waiting') {
      if (now - /** @type {number} */ (fedUntil(horse)) > GRAZED_BACK) { setFed(horse, now - GRAZED_BACK, owedTo, rules.bondFades); changed = true; }
      continue;
    }
    if (since != null && now - since >= SKIP_MINUTES) {
      // Each sack is eaten at the minute the food ran out inside the span, so the fade up to that minute is taken
      // first.
      for (let f = /** @type {number} */ (fedUntil(horse)); f < now; f = /** @type {number} */ (fedUntil(horse))) {
        const from = steedFoodIn(items, 'oats') ? items : Array.isArray(stores) && steedFoodIn(stores, 'oats') ? stores : null;
        if (!from) break;
        const at = Math.max(f, since);
        const r = eat(from, horse, steedFoodIn(from, 'oats'), at, rules);
        if (!r.ok) break;
        ate++; changed = true;
      }
    }
    if (!rules.bondFades && holdStarving(horse, now)) changed = true;
  }
  return { changed, ate };
}

export function steedStats(item, now, rules = HORSE_CARE_HARD) {
  const born = horseBornStats(item);
  if (!born) return null;
  const bond = rules.bondFades ? bondAt(item, now) : bondTenths(item) / 10;
  const hunger = hungerOf(item, now);
  const bonus = bondBonus(bond), penalty = rules.hungerCosts ? HUNGER[hunger].penalty : 0;
  /** @type {Record<string, number>} */
  const stats = {};
  for (const k of STEED_STATS) stats[k] = Math.max(1, Math.min(STEED_STAT_CAP, born[k] + bonus - penalty));
  return { born, stats: /** @type {typeof born} */ (stats), bond, tier: bondTier(bond), bonus, hunger, penalty };
}

export const STEED_PRICE = 1000;
export const STEED_PRICE_LEAST = 400;
export const steedValue = (born) => (born ? Math.max(STEED_PRICE_LEAST, Math.round(STEED_PRICE * (1 + (STEED_STATS.reduce((a, k) => a + born[k], 0) / STEED_STATS.length - 50) / 50))) : STEED_PRICE);

export const steedSpeedScale = (speed, rules = HORSE_CARE_HARD) => {
  const k = Math.max(0.85, Math.min(1.15, 0.85 + 0.003 * speed));
  return rules.paceFloor ? Math.max(1, k) : k;
};
export const teamDraftScale = (strength, load, rules = HORSE_CARE_HARD) => (rules.draftDrags ? Math.max(0.75, Math.min(1, 1 - Math.max(0, Math.min(1, load)) * (0.3 - 0.002 * strength))) : 1);

export const STAMINA_BASE = 40;
export const STAMINA_PER_POINT = 1.2;
export const GALLOP_SPEND = 3.3;
export const BREATH_BACK = 2.2;
export const RIDDEN_BACK = 0.5;
export const WINDED_UNTIL = 0.3;
export const breathMax = (stats) => STAMINA_BASE + STAMINA_PER_POINT * (stats?.stamina ?? 50);
export const freshBreath = () => ({ spent: 0, winded: false });
/**
 * @param {{ spent: number, winded: boolean }} b
 * @param {{ stats: any, hunger?: string, galloping?: boolean, ridden?: boolean, dt: number, rules?: any }} o
 */
export function stepBreath(b, { stats, hunger = 'fed', galloping = false, ridden = false, dt, rules = HORSE_CARE_HARD }) {
  const max = breathMax(stats), end = stats?.endurance ?? 50;
  let spent = Math.max(0, Math.min(max, b?.spent ?? 0)), winded = !!b?.winded;
  const t = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (galloping && !winded) spent += GALLOP_SPEND * (1.25 - end / 200) * t;
  else spent -= BREATH_BACK * (0.75 + end / 200) * (rules.hungerCosts ? HUNGER[hunger]?.breath ?? 1 : 1) * (ridden ? RIDDEN_BACK : 1) * t;
  spent = Math.max(0, Math.min(max, spent));
  if (spent >= max) winded = true;
  else if (winded && max - spent >= WINDED_UNTIL * max) winded = false;
  return { spent, winded };
}
export const breathShare = (b, stats) => { const max = breathMax(stats); return max > 0 ? Math.max(0, Math.min(1, (max - (b?.spent ?? 0)) / max)) : 1; };
export const canGallop = (b, hunger) => !b?.winded && hunger !== 'starving';

export const horsesIn = (items) => (Array.isArray(items) ? items.filter(isHorseItem) : []);
export function chooseRiddenHorse(items, i) {
  const horses = horsesIn(items);
  const pick = horses[i];
  if (!pick) return { ok: false, text: STEED_TEXT.noHorse };
  if (pick === horses[0]) return { ok: true, text: 'You already ride that horse.' };
  items.splice(items.indexOf(pick), 1);
  items.splice(items.indexOf(horses[0]), 0, pick);
  return { ok: true, text: 'You will ride that horse now.' };
}
