// @ts-check
import { TRANSPORT_SMALL_CART, TRANSPORT_HORSE } from '../items/itemTemplates.js';

export const SMALL_CART_KG = 750;

// `floor` is the lowest `value` item validation accepts for a marked wagon: its first shelf price, so wagons saved
// before the price rise stay valid. `hitch` is in meters ahead of the rear axle.
export const WAGON_KINDS = Object.freeze({
  cart: Object.freeze({ key: 'cart', name: 'Small Cart', kg: SMALL_CART_KG, value: 150, floor: 150, hitch: 3.8, seats: 0, enterable: false, icon: 112490, rank: 0, horses: 1 }),
  openWagon: Object.freeze({ key: 'openWagon', name: 'Open Wagon', kg: 1500, value: 9000, floor: 900, hitch: 7.1, seats: 4, enterable: false, icon: 112491, rank: 1, horses: 2 }),
  caravan: Object.freeze({ key: 'caravan', name: 'Caravan', kg: 2000, value: 25000, floor: 2500, hitch: 7.7, seats: 0, enterable: true, icon: 112492, rank: 2, horses: 2 }),
});
export const WAGON_KIND_ORDER = Object.freeze(['cart', 'openWagon', 'caravan']);
export const validWagonKind = (k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(WAGON_KINDS, k) ? k : null);
// The wire code is the index in `WAGON_KIND_ORDER`, so new kinds go at the end of that list.
export const wagonKindCode = (k) => Math.max(0, WAGON_KIND_ORDER.indexOf(validWagonKind(k) ?? 'cart'));
export const wagonKindOfCode = (c) => (Number.isInteger(c) && c >= 0 && c < WAGON_KIND_ORDER.length ? WAGON_KIND_ORDER[c] : 'cart');

export const isWagonItem = (item) => item?.templateIndex === TRANSPORT_SMALL_CART;
export const wagonKindOf = (item) => validWagonKind(item?.wagonKind) ?? 'cart';

export function activeWagonItem(items) {
  let best = null, rank = -1;
  for (const it of items ?? []) {
    if (!isWagonItem(it)) continue;
    const r = WAGON_KINDS[wagonKindOf(it)].rank;
    if (r > rank) { best = it; rank = r; }
  }
  return best;
}
export const activeWagonKind = (items) => { const it = activeWagonItem(items); return it ? wagonKindOf(it) : null; };
export const wagonKgLimitOf = (kind) => WAGON_KINDS[validWagonKind(kind) ?? 'cart'].kg;
export const wagonKgFor = (entity) => wagonKgLimitOf(activeWagonKind(entity?.items ?? []));
export const wagonHitchOf = (kind) => WAGON_KINDS[validWagonKind(kind) ?? 'cart'].hitch;
export const wagonHorsesOf = (kind) => WAGON_KINDS[validWagonKind(kind) ?? 'cart'].horses;
export const horseCountOf = (items) => { let n = 0; for (const it of items ?? []) if (it?.templateIndex === TRANSPORT_HORSE) n++; return n; };
export const WAGON_TEAM_TEXT = Object.freeze({
  short: (kind) => `Your ${WAGON_KINDS[validWagonKind(kind) ?? 'cart'].name} needs ${wagonHorsesOf(kind) === 2 ? 'two horses' : 'a horse'} to pull it. Buy another at a town's Stable.`,
});
export function wagonTeamShort(items) {
  const kind = activeWagonKind(items);
  if (!kind) return null;
  const have = horseCountOf(items);
  return have > 0 && have < wagonHorsesOf(kind) ? WAGON_TEAM_TEXT.short(kind) : null;
}

export function newWagonItem(kind) {
  const k = validWagonKind(kind) ?? 'cart';
  const base = { group: 'Transportation', templateIndex: TRANSPORT_SMALL_CART };
  if (k === 'cart') return base;
  return { ...base, wagonKind: k, value: WAGON_KINDS[k].value };
}
export const wagonItemName = (item) => (isWagonItem(item) && validWagonKind(item?.wagonKind) && item.wagonKind !== 'cart' ? WAGON_KINDS[item.wagonKind].name : null);

export const stableWagonName = (kind) => (validWagonKind(kind) === 'openWagon' ? 'Your open wagon' : validWagonKind(kind) === 'caravan' ? 'Your caravan' : 'Your wagon');
