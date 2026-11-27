// @ts-check
import { REPAIR_PRICE } from './navalDamage.js';
import { BARREL } from './navalShips.js';

export const BARREL_PRICE = 40;
export const FIELD_QUIET_S = 15;
export const FIELD_MEND_PER_S = 0.004;
export const FIELD_MEND_ALONE = 0.5;
// Free mending stops at this share: a port makes her whole, the sea only seaworthy.
export const FIELD_MEND_CAP = 0.5;
export const FIELD_REFLOAT = 0.15;

// Make Her Whole buys in this order; the hull comes first because it keeps her afloat.
export const YARD_ORDER = Object.freeze(['hull', 'sail', 'crew', 'barrels']);
export const YARD_PRICE = Object.freeze({ hull: REPAIR_PRICE.hull, sail: REPAIR_PRICE.sail, crew: REPAIR_PRICE.crew, barrels: BARREL_PRICE });

export const YARD_DISCOUNT_MAX = 0.5;
/**
 * @param {{ hull: number, maxHull: number, sail: number, maxSail: number, crew: number, maxCrew: number }} damage
 * @param {number} barrels
 * @param {number} gold
 * @param {{ discount?: number }} [o]
 */
export function yardOffer(damage, barrels, gold, { discount = 0 } = {}) {
  const k = 1 - Math.max(0, Math.min(YARD_DISCOUNT_MAX, Number(discount) || 0));
  const purse = Math.max(0, Math.floor(Number(gold) || 0));
  const missing = {
    hull: Math.max(0, Math.ceil(damage.maxHull - damage.hull - 1e-9)),
    sail: Math.max(0, Math.ceil(damage.maxSail - damage.sail - 1e-9)),
    crew: Math.max(0, Math.round(damage.maxCrew - damage.crew)),
    barrels: Math.max(0, BARREL.stock - Math.max(0, barrels | 0)),
  };
  const rows = YARD_ORDER.map((id) => {
    const n = missing[id], price = Math.round(YARD_PRICE[id] * k * 100) / 100;
    const afford = Math.min(n, Math.floor(purse / price));
    return { id, missing: n, price, whole: Math.ceil(n * price - 1e-9), afford, cost: Math.ceil(afford * price - 1e-9) };
  });
  return { rows, whole: rows.reduce((sum, r) => sum + r.whole, 0), gold: purse };
}

export function yardAll(damage, barrels, gold, { discount = 0 } = {}) {
  let purse = Math.max(0, Math.floor(Number(gold) || 0));
  const out = [];
  for (const r of yardOffer(damage, barrels, purse, { discount }).rows) {
    const n = Math.min(r.missing, Math.floor(purse / r.price));
    if (n <= 0) continue;
    const cost = Math.ceil(n * r.price - 1e-9);
    out.push({ id: r.id, n, cost });
    purse -= cost;
  }
  return out;
}

/**
 * @param {{ hull: number, maxHull: number, sail: number, maxSail: number }} damage
 * @param {number} dt
 * @param {{ crewed: boolean, crewShare: number, scale?: number }} crew
 */
export function fieldMend(damage, dt, { crewed, crewShare, scale = 1 }) {
  const rate = FIELD_MEND_PER_S * (crewed ? Math.max(0, Math.min(1, crewShare)) : FIELD_MEND_ALONE) * Math.max(0, scale) * Math.max(0, dt);
  const part = (have, whole) => Math.max(0, Math.min(whole * FIELD_MEND_CAP - have, whole * rate));
  return { hull: part(damage.hull, damage.maxHull), sail: damage.maxSail > 0 ? part(damage.sail, damage.maxSail) : 0 };
}

// A store pays for a fixed amount of work, so a bigger ship needs more stores.
export const STORE_POINTS = 64;
export const STORE_YARD_SHARE = 0.7;
export const SAIL_WORK = REPAIR_PRICE.sail / REPAIR_PRICE.hull;
export const storePrice = () => Math.round(STORE_POINTS * REPAIR_PRICE.hull * STORE_YARD_SHARE);
export const STORE_PRICE = storePrice();
export const workToWhole = (d) => Math.max(0, d.maxHull - d.hull) + (d.maxSail > 0 ? Math.max(0, d.maxSail - d.sail) * SAIL_WORK : 0);
export const storesToWhole = (d) => Math.ceil(workToWhole(d) / STORE_POINTS - 1e-9);
export const STORES_STOCK = 10;
export const GROG_PER_HAND = 1;
export const GROG_MIN = 10;
export const SEA_REPAIR_PER_S = 0.016;
export const SEA_REPAIR_ALONE = 0.5;
export const SEA_REPAIR_UNDER_FIRE = 0.125;

export const grogPrice = (crew) => Math.max(GROG_MIN, Math.round(Math.max(0, crew) * GROG_PER_HAND));

/** @param {{ stores: number, stock?: number, morale: number|null, crew: number, crewed: boolean, gold: number, grogToday?: boolean }} o */
export function provisionOffer({ stores, stock = STORES_STOCK, morale, crew, crewed, gold, grogToday = false }) {
  const purse = Math.max(0, Math.floor(Number(gold) || 0));
  const rows = [];
  const n = Math.max(0, Math.max(0, stock | 0) - Math.max(0, stores | 0));
  rows.push({ id: 'stores', missing: n, price: STORE_PRICE, whole: n * STORE_PRICE, afford: Math.min(n, Math.floor(purse / STORE_PRICE)), have: Math.max(0, stores | 0) });
  if (crewed && morale != null) {
    const price = grogPrice(crew), want = morale < 100 && !grogToday ? 1 : 0;
    rows.push({ id: 'grog', missing: want, price, whole: want * price, afford: Math.min(want, Math.floor(purse / price)), have: morale, drunk: morale < 100 && !!grogToday });
  }
  for (const r of rows) r.cost = r.afford * r.price;
  return { rows, gold: purse };
}

/**
 * @param {{ hull: number, maxHull: number, sail: number, maxSail: number }} damage
 * @param {number} dt
 * @param {{ crewed: boolean, crewShare: number, scale?: number, budget?: number }} o
 */
export function seaRepair(damage, dt, { crewed, crewShare, scale = 1, budget = Infinity }) {
  const share = crewed && crewShare > 0 ? Math.min(1, crewShare) : SEA_REPAIR_ALONE;
  let left = SEA_REPAIR_PER_S * share * Math.max(0, scale) * Math.max(0, dt);
  const out = { hull: 0, sail: 0, work: 0 };
  const hullGap = damage.maxHull > 0 ? Math.max(0, 1 - damage.hull / damage.maxHull) : 0;
  const h = Math.min(hullGap, left);
  out.hull = h * damage.maxHull; left -= h;
  if (left > 0 && damage.maxSail > 0) out.sail = Math.min(Math.max(0, 1 - damage.sail / damage.maxSail), left) * damage.maxSail;
  out.work = out.hull + out.sail * SAIL_WORK;
  const cap = Math.max(0, budget);
  if (out.work > cap) {
    out.hull = Math.min(out.hull, cap);
    out.sail = Math.min(out.sail, Math.max(0, cap - out.hull) / SAIL_WORK);
    out.work = out.hull + out.sail * SAIL_WORK;
  }
  return out;
}
/** @param {{ hull: number, maxHull: number, sail: number, maxSail: number }} damage */
export function paidDamage(damage, { free = true } = {}) {
  // Parts under FIELD_MEND_CAP read whole, so no store is spent on work the free mending does.
  const past = (have, whole) => (free && whole > 0 && have < whole * FIELD_MEND_CAP - 1e-9 ? whole : have);
  return { hull: past(damage.hull, damage.maxHull), maxHull: damage.maxHull, sail: past(damage.sail, damage.maxSail), maxSail: damage.maxSail };
}
export const wantsRepair = (damage) => damage.hull < damage.maxHull - 1e-6 || (damage.maxSail > 0 && damage.sail < damage.maxSail - 1e-6);
