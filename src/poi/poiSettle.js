// @ts-check

// What a POI trade or event does to a character's save, as plain functions over the save's data. The account service
// settles a live POI's trades and events with these (server-account/src/poiTrade.js), and a game that holds a save locally
// uses the same ones, so a requirement means the same item in both places. Nothing here changes the save's shape: items
// are the records the save already holds, gold is its `goldPieces`.

import { templateGroups } from '../systems/item/itemLaw.js';
import { tradeableRecord, loadedWagonOf, recordCount, recordIsOffered, TRADE_VOLATILE_FIELDS, VALUE_IS_IDENTITY_TEMPLATES, REALM_TRADE_RECORD_MAX } from '../net/realm/realmTradeLaw.js';
import { GLASS_BOTTLE_TEMPLATE } from '../systems/inventory.js';
import { POTION_RECIPES, potionRecipeKey } from '../systems/potionRecipes.js';

/** The group an item stack names: its own, or its template's first. @param {any} s */
const groupOf = (s) => s.group ?? templateGroups(s.template)[0];

/** Maps each potion recipe name (`healing`, `healTrue`) to its numeric recipe key. */
const POTION_KEYS = new Map(POTION_RECIPES.map((r) => [r.name, potionRecipeKey(r.ingredients)]));
/** Returns the numeric recipe key for a stack's `recipe` name, or null if unknown. @param {unknown} name */
export const potionKeyOf = (name) => (typeof name === 'string' ? POTION_KEYS.get(name) ?? null : null);

/**
 * Returns whether a record holds exactly the item a stack names. A material counts only where the stack gives one. For
 * the Glass Bottle, a stack with a `recipe` matches only that recipe's plain potion (recordAccepts also takes its
 * Potent ones), and a stack without one matches only an empty bottle, so a take never removes a potion the stack did
 * not name.
 * @param {any} rec @param {any} s
 */
export function recordMatches(rec, s) {
  if (!rec || rec.templateIndex !== s.template || rec.group !== groupOf(s)) return false;
  if (s.material !== undefined && rec.material !== s.material) return false;
  if (rec.group !== 'UselessItems1' || rec.templateIndex !== GLASS_BOTTLE_TEMPLATE) return true;
  if (s.recipe === undefined) return !rec.potionRecipeKey;
  return potionKeyOf(s.recipe) !== null && rec.potionRecipeKey === potionKeyOf(s.recipe) && !rec.potent;
}

/** Returns whether `rec` is a Potent potion of the recipe that `s` names. @param {any} rec @param {any} s */
const potentOf = (rec, s) => s.recipe !== undefined && !!rec?.potent && recordMatches({ ...rec, potent: undefined }, s);

/**
 * Returns whether a record may count toward a stack: what recordMatches accepts, and also a Potent potion of the
 * stack's recipe. A Potent potion counts for a condition and a requirement, and a take spends it only after the plain
 * ones (takeStacks).
 * @param {any} rec @param {any} s
 */
export const recordAccepts = (rec, s) => recordMatches(rec, s) || potentOf(rec, s);

/** @param {any} save @param {any} s */
export function countOf(save, s) {
  let n = 0;
  for (const rec of Array.isArray(save?.items) ? save.items : []) if (recordAccepts(rec, s)) n += recordCount(rec);
  return n;
}

/** @param {any} save */
export const leavesOf = (save) => { const loaded = loadedWagonOf(save); return (/** @type {any} */ rec) => tradeableRecord(rec) && rec !== loaded; };

/** @param {any} save @param {any} s */
export function takeableOf(save, s) {
  const leaves = leavesOf(save);
  let n = 0;
  for (const rec of Array.isArray(save?.items) ? save.items : []) if (leaves(rec) && recordAccepts(rec, s)) n += recordCount(rec);
  return n;
}

/** The gold a save holds. @param {any} save */
export const goldOf = (save) => (Number.isSafeInteger(save?.goldPieces) && save.goldPieces > 0 ? save.goldPieces : 0);

/**
 * Mutate save.items and remaining records in place, because callers hold live references to both.
 * @param {any} save
 * @param {{ template: number, group?: string, material?: number, recipe?: string, count: number }[]} stacks
 */
export function takeStacks(save, stacks) {
  if (!Array.isArray(save?.items)) return stacks.length ? { ok: false, why: 'items' } : { ok: true };
  const list = save.items;
  /** what each record has given so far, by index - decided first, applied only when every stack is covered */
  const gives = new Map();
  const leaves = leavesOf(save);
  for (const s of stacks) {
    const from = list.map((rec, i) => ({ rec, i })).filter(({ rec, i }) => leaves(rec) && recordAccepts(rec, s) && recordCount(rec) - (gives.get(i) ?? 0) > 0)
      .sort((a, b) => (+potentOf(a.rec, s) - +potentOf(b.rec, s)) || (recordCount(a.rec) - (gives.get(a.i) ?? 0)) - (recordCount(b.rec) - (gives.get(b.i) ?? 0)));
    let need = s.count;
    for (const { rec, i } of from) {
      if (need <= 0) break;
      const n = Math.min(need, recordCount(rec) - (gives.get(i) ?? 0));
      gives.set(i, (gives.get(i) ?? 0) + n);
      need -= n;
    }
    if (need > 0) return { ok: false, why: 'items' };
  }
  const lit = Number.isSafeInteger(save.lightSourceIndex) ? list[save.lightSourceIndex] : undefined;
  for (const [i, n] of [...gives].sort((a, b) => b[0] - a[0])) {
    const rec = list[i];
    if (n >= recordCount(rec)) list.splice(i, 1);
    else rec.stackCount = recordCount(rec) - n;
  }
  if (Number.isSafeInteger(save.lightSourceIndex)) save.lightSourceIndex = lit ? list.indexOf(lit) : -1;   // an index into this very list (save.js)
  return { ok: true, picks: picksOf(gives) };
}

/** @param {Map<number, number>} gives */
const picksOf = (gives) => [...gives].sort((a, b) => a[0] - b[0]).map(([at, n]) => ({ at, n }));

export const HAND_MAX = 32;

/** @param {any} rec */
export function handRecord(rec) {
  const out = JSON.parse(JSON.stringify(rec));
  for (const k of TRADE_VOLATILE_FIELDS) if (k !== 'value' || !VALUE_IS_IDENTITY_TEMPLATES.includes(rec.templateIndex)) delete out[k];
  return out;
}

/**
 * @param {any} save @param {{ template: number, group?: string, material?: number, recipe?: string, count: number }[]} stacks
 * @param {{ at: number, n: number, rec: any }[][]} hand
 */
export function takeChosen(save, stacks, hand) {
  const refused = { ok: false, why: 'hand' };
  if (!Array.isArray(save?.items) || !Array.isArray(hand) || hand.length !== stacks.length) return refused;
  const list = save.items;
  /** @type {Map<number, number>} */
  const gives = new Map();
  const left = (/** @type {number} */ i) => recordCount(list[i]) - (gives.get(i) ?? 0);
  const leaves = leavesOf(save);
  for (let k = 0; k < stacks.length; k++) {
    const s = stacks[k];
    let sum = 0;
    if (!Array.isArray(hand[k])) return refused;
    for (const p of hand[k]) {
      if (!Number.isSafeInteger(p?.n) || p.n < 1) return refused;
      const fits = (/** @type {number} */ i) => i >= 0 && i < list.length && left(i) >= p.n && leaves(list[i]) && recordIsOffered(list[i], p.rec);
      const i = fits(p.at) ? p.at : list.findIndex((_, j) => fits(j));
      if (i < 0 || !recordAccepts(list[i], s) || JSON.stringify(list[i]).length > REALM_TRADE_RECORD_MAX) return refused;
      gives.set(i, (gives.get(i) ?? 0) + p.n);
      sum += p.n;
    }
    if (sum !== s.count) return refused;
  }
  const lit = Number.isSafeInteger(save.lightSourceIndex) ? list[save.lightSourceIndex] : undefined;
  const picks = picksOf(gives);
  for (const { at, n } of [...picks].reverse()) {
    if (n >= recordCount(list[at])) list.splice(at, 1);
    else list[at].stackCount = recordCount(list[at]) - n;
  }
  if (Number.isSafeInteger(save.lightSourceIndex)) save.lightSourceIndex = lit ? list.indexOf(lit) : -1;
  return { ok: true, picks };
}

/** Take gold from a save's purse, in place. Answers whether it held that much. @param {any} save @param {number} amount */
export function takeGold(save, amount) {
  const have = goldOf(save);
  if (amount > have) return false;
  save.goldPieces = have - amount;
  return true;
}

/** Put records and gold into a save, in place. @param {any} save @param {any[]} records @param {number} gold */
export function giveGoods(save, records, gold) {
  if (!Array.isArray(save.items)) save.items = [];
  save.items.push(...records);
  save.goldPieces = goldOf(save) + gold;
}

export { eventClaim, recipeClaim } from './poiDmCore.js';
