// @ts-check
import { isPotion, isLightSource, TEMPLATES } from '../../items/itemKinds.js';
import { isSurvivalItem } from '../../systems/survival/items.js';
import { isFood, isWaterskin } from '../../systems/survival/food.js';
import { isRestItem } from '../../systems/survival/restItemRows.js';
import { isAmmunition } from '../../items/itemTemplates.js';
import { BANDAGE_TEMPLATE } from '../../mods/rriRealism.js';
import { isEquipped } from '../../characters/equip.js';
import { DECOR_OWN_KEPT_BACK } from '../../net/decorLaw.js';
import { WILD_ITEMS_MAX } from '../../net/wire.js';
import { remainsFit, recordFits } from '../../net/wildLaw.js';
import { RECEIVER_MARKS, tradeableRecord } from '../../net/realmTradeLaw.js';
import { liquidWorthOf, NAVAL_VENDOR, REVENANT_VENDOR } from '../../net/realmGoldLaw.js';
import { goldStack } from '../../items/inventory.js';
import { isWalletItem, walletHolds } from '../../items/walletItem.js';
import { classicPiece, itemWorth } from '../../items/itemLaw.js';
import { HCC_VENDOR, WAGON_MODE } from '../../travel/horseCartLaw.js';

import { WILD_NEVER_GROUPS } from './wildLeaf.js';
export { WILD_NEVER_GROUPS };

export function keptOnWildDeath(item) {
  if (!item) return true;
  return isPotion(item) || isLightSource(item) || isSurvivalItem(item) || isFood(item) || isWaterskin(item)
    || isRestItem(item) || isAmmunition(item) || (item.group === 'UselessItems2' && item.templateIndex === BANDAGE_TEMPLATE);
}

export function wildCanLose(item) {
  if (!item || keptOnWildDeath(item)) return false;
  if (item.group === 'MiscItems' && item.templateIndex === TEMPLATES.Letter_of_credit && !item.questItem) return tradeableRecord({ ...item, equipSlot: undefined });
  if (WILD_NEVER_GROUPS.has(item.group) || DECOR_OWN_KEPT_BACK.has(item.templateIndex) || item.templateIndex === TEMPLATES.Spellbook) return false;
  if (isWalletItem(item) || walletHolds(item)) return false;
  if (classicPiece(item)) return false;
  return tradeableRecord({ ...item, equipSlot: undefined });
}

export function takeWildDrop(items, wagon = null) {
  const lift = (list, worn) => {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if ((worn && isEquipped(it)) || !wildCanLose(it)) continue;
      list.splice(i, 1);
      out.unshift(it);
    }
    return out;
  };
  return [...lift(items, true), ...lift(wagon, false)];
}

export const WILD_GOLD_DIVISOR = 10;
export const WILD_GOLD_LOSS = 1 / WILD_GOLD_DIVISOR;

const coinIn = (/** @type {any} */ list) => (Array.isArray(list) ? list.find((i) => i?.group === 'Currency') ?? null : null);

/**
 * @param {any} entity
 * @param {{ cart?: boolean, packs?: WildPack[] }} [opts]
 */
export function takeWildGold(entity, { cart: withCart = true, packs = wildPacksOf(entity) } = {}) {
  let take = 0;
  const have = Math.max(0, Math.floor(entity?.goldPieces ?? 0));
  const purse = Math.floor(have / WILD_GOLD_DIVISOR);
  if (purse >= 1) { entity.goldPieces = have - purse; take += purse; }
  const cart = withCart && Array.isArray(entity?.wagonItems) ? entity.wagonItems.find((i) => i?.group === 'Currency') : null;
  for (const coin of [cart, ...packs.map((p) => coinIn(p.items))]) {
    if (!coin) continue;
    const n = Math.max(0, Math.floor(coin.stackCount ?? 1));
    const share = Math.floor(n / WILD_GOLD_DIVISOR);
    if (share >= 1) { coin.stackCount = n - share; take += share; }
  }
  return take >= 1 ? goldStack(take) : null;
}

export const wornOffer = (items) => (Array.isArray(items) ? items.filter((it) => it && isEquipped(it) && wildCanLose(it)).slice(0, WILD_ITEMS_MAX) : []);

export function wildRecord(item) {
  const copy = JSON.parse(JSON.stringify(item));
  for (const k of RECEIVER_MARKS) delete copy[k];
  return copy;
}


export function wildPickOf(items, w = -1, wt = null) {
  if (!Number.isInteger(w) || w < 0) return null;
  const offer = wornOffer(items);
  if (!Array.isArray(wt)) return offer[w] ?? null;
  const is = (/** @type {any} */ it) => !!it && it.templateIndex === wt[0] && (it.material ?? 0) === wt[1];
  return is(offer[w]) ? offer[w] : (offer.find(is) ?? null);
}

/**
 * @param {any} entity
 * @param {number} [w]
 * @param {number[] | null} [wt]
 * @param {{ cart?: boolean, packs?: WildPack[] }} [opts]
 */
export function wildDropCandidates(entity, w = -1, wt = null, { cart: withCart = true, packs = wildPacksOf(entity) } = {}) {
  const bag = Array.isArray(entity?.items) ? entity.items : [];
  const cart = withCart && Array.isArray(entity?.wagonItems) ? entity.wagonItems : [];
  const k = wildPickOf(bag, w, wt);
  const drop = [...bag.filter((it) => !isEquipped(it) && wildCanLose(it)), ...cart.filter((it) => wildCanLose(it)), ...packs.flatMap((p) => p.items.filter((it) => wildCanLose(it)))];
  return k ? [k, ...drop] : drop;
}

const dropWorth = (/** @type {any} */ it) => { const l = liquidWorthOf(it); return l > 0 ? l : itemWorth(it); };

/**
 * @param {any} entity
 * @param {number} [w]
 * @param {(item: any) => boolean} [keep]
 * @param {number[] | null} [wt]
 * @param {{ cart?: boolean, packs?: WildPack[], letters?: boolean }} [opts]
 */
export function takeWildDeath(entity, w = -1, keep = () => false, wt = null, { cart: withCart = true, packs = wildPacksOf(entity), letters = false } = {}) {
  const bag = Array.isArray(entity?.items) ? entity.items : [];
  const cart = withCart && Array.isArray(entity?.wagonItems) ? entity.wagonItems : [];
  const lit = Number.isSafeInteger(entity?.lightSourceIndex) && entity.lightSourceIndex >= 0 ? bag[entity.lightSourceIndex] : undefined;
  /** @type {[any, string][]} */
  const took = [];
  const k = wildPickOf(bag, w, wt);
  if (k && !keep(k) && recordFits(wildRecord(k))) { bag.splice(bag.indexOf(k), 1); took.push([k, 'bag']); }
  const killer = took.length > 0;
  const cartCoin = cart.find((i) => i?.group === 'Currency') ?? null;
  const purse0 = Math.max(0, Math.floor(entity?.goldPieces ?? 0)), cart0 = cartCoin ? Math.max(0, Math.floor(cartCoin.stackCount ?? 1)) : 0;
  const packCoins = packs.map((p) => coinIn(p.items)), pack0 = packCoins.map((c) => (c ? Math.max(0, Math.floor(c.stackCount ?? 1)) : 0));
  const coin = takeWildGold(entity, { cart: withCart, packs });
  /** @type {{ purse: number, cart: number, packs?: Record<string, number>, letters?: Record<string, number> }} */
  const gold = { purse: coin ? purse0 - Math.max(0, Math.floor(entity.goldPieces ?? 0)) : 0, cart: coin && cartCoin ? cart0 - Math.max(0, Math.floor(cartCoin.stackCount ?? 0)) : 0 };
  packCoins.forEach((c, i) => { const n = c ? pack0[i] - Math.max(0, Math.floor(c.stackCount ?? 0)) : 0; if (n > 0) (gold.packs ??= {})[packs[i].f] = n; });
  const shares = letters ? lettersTenth([bag, cart, ...packs.map((p) => p.items)], keep) : [];
  const lettersGold = shares.reduce((g, [, n]) => g + n, 0);
  const pile = lettersGold > 0 ? (coin ? Object.assign(coin, { stackCount: coin.stackCount + lettersGold }) : goldStack(lettersGold)) : coin;
  if (lettersGold > 0) gold.letters = Object.fromEntries(shares.map(([it, n]) => [it.uid, n]));
  if (pile) took.push([pile, 'gold']);
  const aside = (/** @type {any[]} */ list) => {
    const held = list.map((it, i) => (keep(it) || (letters && shareLetter(it)) || (wildCanLose(it) && !recordFits(wildRecord(it))) ? [i, it] : null)).filter((x) => x !== null);
    for (let n = held.length - 1; n >= 0; n--) list.splice(/** @type {any} */ (held[n])[0], 1);
    return held;
  };
  const back = (/** @type {any[]} */ list, /** @type {any[]} */ held) => { for (const [i, it] of held) list.splice(Math.min(i, list.length), 0, it); };
  const hb = aside(bag), hc = aside(cart);
  const hp = packs.map((p) => aside(p.items));
  /** @type {[any, string][]} */
  const drop = [...takeWildDrop(bag).map((it) => /** @type {[any, string]} */ ([it, 'bag'])), ...takeWildDrop([], cart).map((it) => /** @type {[any, string]} */ ([it, 'cart'])),
    ...packs.flatMap((p) => takeWildDrop([], p.items).map((it) => /** @type {[any, string]} */ ([it, p.f])))];
  back(bag, hb); back(cart, hc); packs.forEach((p, i) => back(p.items, hp[i]));
  const worth = new Map(drop.map(([it]) => [it, dropWorth(it)]));
  drop.sort((a, b) => worth.get(b[0]) - worth.get(a[0]));
  took.push(...drop);
  const records = remainsFit(took.map(([it]) => wildRecord(it)));
  for (const [it, from] of took.slice(records.length)) {
    if (from === 'bag') bag.push(it);
    else if (from === 'cart') cart.push(it);
    else if (from !== 'gold') packs.find((p) => p.f === from)?.items.push(it);
    else {
      entity.goldPieces = Math.max(0, Math.floor(entity.goldPieces ?? 0)) + gold.purse;
      packCoins.forEach((c, i) => { const n = gold.packs?.[packs[i].f] ?? 0; if (c && n) c.stackCount = Math.max(0, Math.floor(c.stackCount ?? 0)) + n; });
      if (cartCoin) cartCoin.stackCount = Math.max(0, Math.floor(cartCoin.stackCount ?? 0)) + gold.cart;
      for (const [l, n] of shares) l.value += n;
      gold.purse = 0; gold.cart = 0; delete gold.packs; delete gold.letters;
    }
  }
  for (const p of packs) p.put?.(p.items);
  if (lit !== undefined) entity.lightSourceIndex = bag.indexOf(lit);
  const kept = took.slice(0, records.length);
  return { taken: kept.map(([it]) => it), from: kept.map(([, f]) => f), records, killer: killer && records.length > 0, gold };
}

export const wildCartRecordOf = (/** @type {any} */ save) => { const r = save?.modData?.[HCC_VENDOR]; return r && typeof r === 'object' ? r : null; };

/**
 * @param {any} rec
 * @returns {boolean}
 */
export function wildCartMayBeAway(rec) {
  if (!rec || typeof rec !== 'object') return false;
  if (rec.Mode === WAGON_MODE.None || rec.Mode === WAGON_MODE.Deployed) return true;
  return rec.Mode === WAGON_MODE.WithPlayer && rec.WagonStabled === true;
}


import { WILD_REVENANTS_MAX, wildSwornAtSide } from './wildLeaf.js';
export { WILD_REVENANTS_MAX, wildSwornAtSide };

export const WILD_PACK = Object.freeze({
  crew: (/** @type {any} */ boat, /** @type {any} */ name) => `crew:${boat}:${name}`,
  sworn: (/** @type {any} */ id) => `sworn:${id}`,
  kit: (/** @type {any} */ id) => `kit:${id}`,
});

/**
 * @typedef {{ f: string, items: any[], put?: (left: any[]) => void }} WildPack
 */

/**
 * @param {string} f
 * @param {any} gear
 * @returns {WildPack}
 */
function kitPack(f, gear) {
  const items = Object.values(gear).filter((it) => it && typeof it === 'object');
  return { f, items, put: (left) => { for (const k of Object.keys(gear)) if (gear[k] && typeof gear[k] === 'object' && !left.includes(gear[k])) delete gear[k]; } };
}

/**
 * @param {any} party
 * @param {any} revenants
 * @returns {WildPack[]}
 */
export function wildPacks(party, revenants) {
  /** @type {WildPack[]} */
  const out = [];
  for (const c of Array.isArray(party) ? party : []) if (c && Array.isArray(c.items)) out.push({ f: WILD_PACK.crew(c.boat, c.name), items: c.items });
  for (const r of wildSwornAtSide(revenants)) {
    if (Array.isArray(r.companion?.items)) out.push({ f: WILD_PACK.sworn(r.id), items: r.companion.items });
    if (r.companion?.gear && typeof r.companion.gear === 'object') out.push(kitPack(WILD_PACK.kit(r.id), r.companion.gear));
  }
  return out;
}
/**
 * @param {any} save
 * @returns {WildPack[]}
 */
export const wildPacksOf = (save) => wildPacks(save?.modData?.[NAVAL_VENDOR]?.party?.party, save?.modData?.[REVENANT_VENDOR]?.list);

export const WILD_FALL_PACKS = 1;

export const WILD_FALL_LETTERS = 1;
const shareLetter = (/** @type {any} */ it) => !!it && it.group === 'MiscItems' && it.templateIndex === TEMPLATES.Letter_of_credit && !it.questItem
  && typeof it.uid === 'string' && !!it.uid && Number.isSafeInteger(it.value) && it.value > 0 && wildCanLose(it);
function lettersTenth(/** @type {any[][]} */ lists, /** @type {(item: any) => boolean} */ keep) {
  /** @type {[any, number][]} */ const out = [];
  for (const list of lists) for (const it of list) {
    if (!shareLetter(it) || keep(it)) continue;
    const n = Math.floor(it.value / WILD_GOLD_DIVISOR);
    if (n > 0) { it.value -= n; out.push([it, n]); }
  }
  return out;
}
/**
 * @param {{ from: string[], gold: { packs?: Record<string, number> } }} drop
 * @returns {boolean}
 */
export const wildTakesPacks = (drop) => drop.from.some((f) => f !== 'bag' && f !== 'cart' && f !== 'gold') || !!drop.gold.packs;

export const wildTookOf = (/** @type {any[]} */ taken, /** @type {string[]} */ from) => taken.map((it, i) => ({ g: it.group ?? null, t: it.templateIndex ?? null, m: it.material ?? 0, u: typeof it.uid === 'string' ? it.uid : null, p: typeof it.provenance === 'string' ? it.provenance : null, n: Math.max(1, Math.floor(it.stackCount ?? 1)), f: from[i] })).filter((x) => x.f !== 'gold');

/**
 * @param {any} entity
 * @param {any[]} took
 * @param {{ purse?: number, cart?: number, packs?: Record<string, number>, letters?: Record<string, number> } | null} gold
 * @param {(item: any) => void} [before]
 * @param {WildPack[]} [packs]
 */
export function wildTakeTook(entity, took, gold, before = (/** @type {any} */ _it) => {}, packs = wildPacksOf(entity)) {
  /** @type {any[] & { letters?: { n: number, gold: number } }} */ const out = [];
  for (const s of Array.isArray(took) ? took : []) {
    const list = s?.f === 'cart' ? entity?.wagonItems : s?.f === 'bag' ? entity?.items : packs.find((p) => p.f === s?.f)?.items;
    if (!Array.isArray(list)) continue;
    const same = (/** @type {any} */ it) => !!it && (s.u ? it.uid === s.u : s.p ? it.provenance === s.p
      : !it.uid && !it.provenance && it.group === s.g && it.templateIndex === s.t && (it.material ?? 0) === s.m && Math.max(1, Math.floor(it.stackCount ?? 1)) === s.n);
    const i = list.findIndex(same);
    if (i < 0) continue;
    before(list[i]);
    out.push(list.splice(i, 1)[0]);
  }
  const purse = Math.max(0, Math.floor(gold?.purse ?? 0)), cart = Math.max(0, Math.floor(gold?.cart ?? 0));
  if (purse) entity.goldPieces = Math.max(0, Math.floor(entity.goldPieces ?? 0) - purse);
  const coin = cart && Array.isArray(entity?.wagonItems) ? entity.wagonItems.find((i) => i?.group === 'Currency') : null;
  if (coin) coin.stackCount = Math.max(0, Math.floor(coin.stackCount ?? 1) - cart);
  const lists = [entity?.items, entity?.wagonItems, ...packs.map((p) => p.items)].filter(Array.isArray);
  for (const [u, share] of Object.entries(gold?.letters ?? {})) {
    const n = Math.max(0, Math.floor(Number(share) || 0)), it = n ? lists.flat().find((x) => x?.uid === u) : null;
    if (!it || !Number.isSafeInteger(it.value)) continue;
    it.value = Math.max(0, it.value - n);
    out.letters = { n: (out.letters?.n ?? 0) + 1, gold: (out.letters?.gold ?? 0) + n };
  }
  for (const p of packs) {
    const n = Math.max(0, Math.floor(gold?.packs?.[p.f] ?? 0)), c = n ? coinIn(p.items) : null;
    if (c) c.stackCount = Math.max(0, Math.floor(c.stackCount ?? 1) - n);
    p.put?.(p.items);
  }
  return out;
}
