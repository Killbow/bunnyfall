// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, the war against Rodney): GARRISONS AND PATROLS - the soldiers a Company keeps at its
// hall's town, and a City Charter at its capital.
//
// Asked: "Charters and Companies" keep them; routes are picked "from set routes"; supply is "Deposit goods into a
// stockpile"; marching to the front "Push[es] the blight back".
//
//   - RECRUITED by a Captain or an Officer with gold from their Company's treasury, up to the garrison's cap.
//   - FED every UTC day out of the Company Stores (a Charter's: every member Company's Stores): each soldier eats its
//     type's upkeep of food, ingots, planks or herbs (the Stores' materials, by their family - professionLaw.js).
//     What goes unfed deserts: half of each type short of something it eats, rounded up.
//   - ORDERS: soldiers put on the city's set routes walk them (palace, gate, temple, streets - worked out from the town's
//     layout on the client); soldiers sent to the front push Rodney's blight back each day in the city's direction
//     (blightLaw.js), losing a tenth of their number each day. The rest hold the barracks.
//
// Pure: no clock, no DOM, no network. Both ends read it; every number is balance.
import { materialOf } from './professionLaw.js';
import { BLIGHT_PUSH_PX } from './blightLaw.js';

/** The soldier types, in the window's order: name, the gold one costs, what it eats a day. */
export const TROOPS = Object.freeze([
  Object.freeze({ key: 'spear', name: 'Spearmen', one: 'Spearman', gold: 300, upkeep: Object.freeze({ food: 1 }), note: 'Hold the streets and gates' }),
  Object.freeze({ key: 'xbow', name: 'Crossbowmen', one: 'Crossbowman', gold: 450, upkeep: Object.freeze({ food: 1, planks: 1 }), note: 'Planks for bolts' }),
  Object.freeze({ key: 'knight', name: 'Knights', one: 'Knight', gold: 1200, upkeep: Object.freeze({ food: 2, ingots: 1 }), note: 'Ingots for steel' }),
  Object.freeze({ key: 'mage', name: 'Battlemages', one: 'Battlemage', gold: 1500, upkeep: Object.freeze({ food: 1, herbs: 1 }), note: 'Herbs for their spells' }),
  Object.freeze({ key: 'healer', name: 'Healers', one: 'Healer', gold: 1000, upkeep: Object.freeze({ food: 1, herbs: 1 }), note: 'Herbs for their salves' }),
]);
export const TROOP_KEYS = Object.freeze(TROOPS.map((t) => t.key));
const BY_KEY = new Map(TROOPS.map((t) => [t.key, t]));
export const troopOf = (k) => BY_KEY.get(k) ?? null;

/** What a garrison may hold: a Company's guard, a Charter's garrison. */
export const GARRISON_MAX = Object.freeze({ company: 12, charter: 60 });
/** The most one recruitment adds. */
export const RECRUIT_MAX = 10;

/** The supplies, as the window names them. */
export const SUPPLIES = Object.freeze([
  Object.freeze({ key: 'food', name: 'Food' }), Object.freeze({ key: 'ingots', name: 'Ingots' }),
  Object.freeze({ key: 'planks', name: 'Planks' }), Object.freeze({ key: 'herbs', name: 'Herbs' }),
]);
/** The supply a Stores material counts as, or null. */
export function supplyOf(material) {
  if (typeof material !== 'string') return null;
  if (material.startsWith('ingot:')) return 'ingots';
  if (material.startsWith('plank:')) return 'planks';
  const fam = materialOf(material)?.family;
  return fam === 'food' ? 'food' : fam === 'herbs' ? 'herbs' : null;
}

/** The set routes, in the window's order. Each city works them out of its own layout (scenes/garrisonPatrols.js). */
export const ROUTES = Object.freeze([
  Object.freeze({ key: 'palace', name: 'Palace ring' }), Object.freeze({ key: 'gate', name: 'Gate to market' }),
  Object.freeze({ key: 'temple', name: 'Temple and market' }), Object.freeze({ key: 'streets', name: 'Back streets' }),
]);
export const ROUTE_KEYS = Object.freeze(ROUTES.map((r) => r.key));
/** The most soldiers a route shows walking it (the rest walk it out of sight). */
export const ROUTE_SHOWN_MAX = 4;

/** The march: each day the soldiers at the front push the blight back by this much of a raid's push for every ten of
 *  them (at most MARCH_PUSH_MAX raids' worth), and lose MARCH_LOSS of their number (at least one). */
export const MARCH_PUSH_PER_TEN = 1;
export const MARCH_PUSH_MAX = 3;
export const MARCH_LOSS = 0.1;
export const marchPushPx = (n) => (n > 0 ? BLIGHT_PUSH_PX * Math.min(MARCH_PUSH_MAX, (n / 10) * MARCH_PUSH_PER_TEN) : 0);
export const marchLoss = (n) => (n > 0 ? Math.max(1, Math.ceil(n * MARCH_LOSS)) : 0);

/** The days a garrison is reckoned at once, at most (a long absence is not a long famine). */
export const GARRISON_DAYS_MAX = 14;

const int = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);
/** Troops read back: every type a whole number at least nought. */
export const troopsOf = (raw) => Object.fromEntries(TROOP_KEYS.map((k) => [k, int(raw?.[k])]));
export const troopTotal = (t) => TROOP_KEYS.reduce((a, k) => a + int(t?.[k]), 0);
/** Orders read back: each route's soldiers and the march's. */
export const ordersOf = (raw) => ({ routes: Object.fromEntries(ROUTE_KEYS.map((k) => [k, int(raw?.routes?.[k])])), march: int(raw?.march) });
export const orderedTotal = (o) => ROUTE_KEYS.reduce((a, k) => a + o.routes[k], 0) + o.march;

/** A day's upkeep for these troops, by supply. */
export function upkeepOf(troops) {
  const need = { food: 0, ingots: 0, planks: 0, herbs: 0 };
  for (const t of TROOPS) for (const [s, n] of Object.entries(t.upkeep)) need[s] += int(troops?.[t.key]) * n;
  return need;
}

/**
 * ONE DAY: what the troops eat of `have` (by supply), who deserts for want, and the march's loss.
 * Answers `{ eaten, troops, deserted, lost }` - `troops` after it all.
 */
export function garrisonDay(troops, have, march = 0) {
  const need = upkeepOf(troops);
  const eaten = {}, short = {};
  for (const s of Object.keys(need)) { eaten[s] = Math.min(need[s], int(have?.[s])); short[s] = eaten[s] < need[s]; }
  const out = troopsOf(troops);
  let deserted = 0;
  for (const t of TROOPS) {
    if (!out[t.key]) continue;
    if (Object.keys(t.upkeep).some((s) => short[s])) { const d = Math.ceil(out[t.key] / 2); out[t.key] -= d; deserted += d; }
  }
  // the march's dead: taken from the hardest-worn first - spearmen, then the rest in order
  let lost = Math.min(marchLoss(march), troopTotal(out));
  const dead = lost;
  for (const k of TROOP_KEYS) { const n = Math.min(out[k], lost); out[k] -= n; lost -= n; if (!lost) break; }
  return { eaten, troops: out, deserted, lost: dead };
}

/** Orders cut to the troops there are: the march first, then the routes from the last. */
export function ordersFit(orders, total) {
  const o = { routes: { ...orders.routes }, march: orders.march };
  let over = orderedTotal(o) - total;
  if (over > 0) { const n = Math.min(o.march, over); o.march -= n; over -= n; }
  for (const k of [...ROUTE_KEYS].reverse()) { if (over <= 0) break; const n = Math.min(o.routes[k], over); o.routes[k] -= n; over -= n; }
  return o;
}

/** How many days the supplies `have` last these troops - the shortest of what they eat (Infinity for none). */
export function supplyDays(troops, have) {
  const need = upkeepOf(troops);
  let days = Infinity;
  for (const [s, n] of Object.entries(need)) if (n > 0) days = Math.min(days, Math.floor(int(have?.[s]) / n));
  return days;
}

/** What a refusal says, by its error. */
export const GARRISON_WORDS = Object.freeze({
  'garrison-rank': 'Only the Captain and the Officers recruit and give orders.',
  'garrison-no-hall': 'Your Company needs a hall to keep a guard.',
  'garrison-no-charter': 'Your Company is in no City Charter.',
  'garrison-full': 'The garrison has no room for that many.',
  'garrison-gold': 'Your Company\'s treasury does not hold enough gold.',
  'garrison-empty': 'The garrison has no soldiers yet.',
  'garrison-too-many': 'There are not that many soldiers to give orders to.',
  'garrison-no-front': 'Rodney\'s blight could not be found from here. Try again in a moment.',
  'garrison-bad': 'That garrison request was not understood.',
});
export const garrisonWordText = (error) => GARRISON_WORDS[error] ?? 'The garrison could not be changed just now.';
