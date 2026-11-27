// @ts-check
import { mulberry32 } from '../../combat/bloodArt.js';
import { registerCustomTemplates, setItemFields, mintCondition } from '../../items/itemTemplates.js';
import { hashKey } from './harbourBoard.js';

// Templates start after the stores at STORES_TEMPLATE in navalStores.js, one per GOODS entry in order, so saved
// items depend on the GOODS order.
export const GOODS_TEMPLATE = 1331;
export const GOODS_GROUP = 'UselessItems2';
/** @typedef {{ id: string, name: string, unit: string, units: string, base: number, kg: number, icon: readonly number[], ether?: boolean }} Good */
/** @typedef {{ id: string, name: string, unit: string, units: string, base: number, kg: number, ether?: boolean, crew?: boolean }} Dealt */
/** @type {readonly Good[]} */
export const GOODS = Object.freeze([
  Object.freeze({ id: 'wine', name: 'Wine', unit: 'cask', units: 'casks', base: 30, kg: 10, icon: Object.freeze([205, 11]) }),
  Object.freeze({ id: 'grain', name: 'Grain', unit: 'sack', units: 'sacks', base: 12, kg: 10, icon: Object.freeze([205, 17]) }),
  Object.freeze({ id: 'wool', name: 'Wool', unit: 'bale', units: 'bales', base: 18, kg: 10, icon: Object.freeze([205, 24]) }),
  Object.freeze({ id: 'iron', name: 'Iron', unit: 'pig', units: 'pigs', base: 24, kg: 12, icon: Object.freeze([254, 63]) }),
  Object.freeze({ id: 'spice', name: 'Spices', unit: 'sack', units: 'sacks', base: 60, kg: 4, icon: Object.freeze([205, 18]) }),
  Object.freeze({ id: 'silk', name: 'Silk', unit: 'bolt', units: 'bolts', base: 75, kg: 4, icon: Object.freeze([205, 21]) }),
  Object.freeze({ id: 'silver', name: 'Silver', unit: 'bar', units: 'bars', base: 90, kg: 6, icon: Object.freeze([254, 65]) }),
  Object.freeze({ id: 'ivory', name: 'Ivory', unit: 'tusk', units: 'tusks', base: 110, kg: 8, icon: Object.freeze([254, 70]) }),
  Object.freeze({ id: 'etheramber', name: 'Ether-amber', unit: 'lump', units: 'lumps', base: 240, kg: 2, icon: Object.freeze([254, 8]), ether: true }),
  Object.freeze({ id: 'starglass', name: 'Starglass', unit: 'shard', units: 'shards', base: 320, kg: 1, icon: Object.freeze([254, 4]), ether: true }),
  Object.freeze({ id: 'voidsilk', name: 'Voidsilk', unit: 'bolt', units: 'bolts', base: 280, kg: 2, icon: Object.freeze([254, 6]), ether: true }),
]);
export const goodById = (id) => GOODS.find((g) => g.id === id) ?? null;
export const goodTemplate = (id) => { const i = GOODS.findIndex((g) => g.id === id); return i < 0 ? null : GOODS_TEMPLATE + i; };
export const goodOfTemplate = (t) => (Number.isInteger(t) && t >= GOODS_TEMPLATE && t < GOODS_TEMPLATE + GOODS.length ? GOODS[t - GOODS_TEMPLATE] : null);

export const GOODS_ROWS = Object.freeze(GOODS.map((g, i) => Object.freeze({
  index: GOODS_TEMPLATE + i, name: g.name, baseWeight: g.kg, hitPoints: 1, capacityOrTarget: 0, basePrice: g.base,
  enchantmentPoints: 0, rarity: g.ether ? 8 : 2, variants: 0, drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false,
  isOneHanded: false, isIngredient: false, worldTextureArchive: g.icon[0], worldTextureRecord: g.icon[1], playerTextureArchive: 0,
  playerTextureRecord: 0, stackable: true,
})));
// itemLaw.js imports this module so these templates are registered.
registerCustomTemplates(GOODS_ROWS);

export const mintGood = (id, n) => mintCondition(setItemFields({ group: GOODS_GROUP, templateIndex: goodTemplate(id), material: 0, flags: 0, variant: 0, message: 0, stackCount: Math.max(1, n | 0) }));
export const goodIn = (items, id) => { const t = goodTemplate(id); return (items ?? []).reduce((n, it) => n + (it?.templateIndex === t ? Math.max(1, it.stackCount | 0) : 0), 0); };
export function takeGood(items, id, n) {
  const t = goodTemplate(id);
  let left = Math.max(0, n | 0);
  for (let i = (items ?? []).length - 1; i >= 0 && left > 0; i--) {
    const it = items[i];
    if (it?.templateIndex !== t) continue;
    const have = Math.max(1, it.stackCount | 0);
    if (have > left) { it.stackCount = have - left; left = 0; } else { items.splice(i, 1); left -= have; }
  }
  return Math.max(0, n | 0) - left;
}
export const goodsWeight = (items) => (items ?? []).reduce((kg, it) => { const g = goodOfTemplate(it?.templateIndex); return kg + (g ? g.kg * Math.max(1, it.stackCount | 0) : 0); }, 0);

// Half of REPAIR_PRICE.crew in navalDamage.js, copied rather than imported because the account service reads
// this module through the item graph.
export const CREW_BASE = 15;
export const CREW = Object.freeze({ id: 'crew', name: 'Crew', unit: 'man', units: 'men', base: CREW_BASE, kg: 0, crew: true });
/** @param {{ key: string, ether?: boolean }} port */
export function crewStandOf(port) {
  if (port?.ether) return 'wants';
  const r = mulberry32(hashKey(`${port?.key ?? ''}:crew`) >>> 0);
  return /** @type {const} */ (['makes', 'wants', 'neither'])[Math.floor(r() * 3) % 3];
}

export const MADE_K = 0.6;
export const WANT_K = 1.55;
export const PRICE_DRIFT = 0.12;
export const SPREAD = 0.08;
// Below 1, so the dealing edge never closes the whole spread and a round trip never pays.
export const TRADE_MOST = 0.75;
export const EXOTIC_K = 1.4;
export const CROWN_TRADE = Object.freeze({
  Daggerfall: Object.freeze({ makes: Object.freeze(['grain', 'iron', 'wool']), wants: Object.freeze(['wine', 'spice', 'silk']) }),
  Wayrest: Object.freeze({ makes: Object.freeze(['wine', 'silver']), wants: Object.freeze(['iron', 'ivory', 'grain']) }),
  Sentinel: Object.freeze({ makes: Object.freeze(['spice', 'silk', 'ivory']), wants: Object.freeze(['wool', 'iron', 'silver']) }),
});
export const DAY_STOCK = Object.freeze({ makes: Object.freeze({ sell: 30, buy: 4 }), wants: Object.freeze({ sell: 2, buy: 30 }), neither: Object.freeze({ sell: 10, buy: 12 }) });
const BAY = GOODS.filter((g) => !g.ether).map((g) => g.id);
const ETHER = GOODS.filter((g) => g.ether).map((g) => g.id);

/** @param {{ key: string }} port */
export function isleGood(port) {
  // A seeded draw replaces a plain hash modulo, which gave neighboring isles the same few goods.
  const r = mulberry32(hashKey(`${port?.key ?? ''}:isle`) >>> 0);
  return BAY[Math.floor(r() * BAY.length) % BAY.length];
}

/** @param {{ key: string, crown?: string|null, ether?: boolean }} port */
export function portTrade(port) {
  if (port?.ether) { const own = isleGood(port); return { makes: [...ETHER, own], wants: BAY.filter((g) => g !== own) }; }
  const base = CROWN_TRADE[port?.crown] ?? { makes: [], wants: [] };
  const makes = [...base.makes], wants = [...base.wants];
  const free = BAY.filter((g) => !makes.includes(g) && !wants.includes(g));
  const h = hashKey(`${port?.key ?? ''}:trade`);
  if (free.length) (h & 1 ? makes : wants).push(free[(h >>> 1) % free.length]);
  return { makes, wants };
}
export function standOf(port, id) {
  if (id === CREW.id) return crewStandOf(port);
  const g = goodById(id);
  if (!g) return 'neither';
  const t = portTrade(port);
  if (t.makes.includes(id)) return 'makes';
  if (t.wants.includes(id) || (g.ether && !port?.ether)) return 'wants';
  return 'neither';
}

/**
 * @param {{ key: string, crown?: string|null, ether?: boolean }} port
 * @param {string} id
 * @param {number} day
 */
export function priceOf(port, id, day) {
  /** @type {Dealt | null} */
  const g = id === CREW.id ? CREW : goodById(id);
  if (!g) return null;
  const stand = standOf(port, id);
  const exotic = !g.crew && !!g.ether !== !!port?.ether;
  const mood = stand === 'makes' ? MADE_K : stand === 'wants' ? (exotic ? EXOTIC_K : WANT_K) : 1;
  // The drift depends only on the port key, good, and day, so every client sees the same price.
  const r = mulberry32((hashKey(`${port?.key ?? ''}:${id}`) ^ Math.imul((day | 0) + 1, 0x85ebca6b)) >>> 0);
  const mid = g.base * mood * (1 - PRICE_DRIFT + 2 * PRICE_DRIFT * r());
  return { id, stand, mid, sell: Math.max(1, Math.round(mid * (1 + SPREAD))), buy: Math.max(1, Math.round(mid * (1 - SPREAD))) };
}

/**
 * @param {{ key: string, crown?: string|null, ether?: boolean }} port
 * @param {number} day
 * @param {{ sold?: any, bought?: any }} [dealt]
 * @param {number} [edge]
 * @param {{ ask: number, pay: number } | null} [town]
 * @param {boolean} [crew]
 */
export function exchangeOf(port, day, dealt = {}, edge = 0, town = null, crew = false) {
  const k = SPREAD * (1 - Math.max(0, Math.min(TRADE_MOST, Number(edge) || 0)));
  const ask = town && Number.isFinite(town.ask) && town.ask > 0 ? town.ask : 1;
  const pay = town && Number.isFinite(town.pay) && town.pay > 0 ? Math.min(ask, town.pay) : 1;
  const rows = [];
  /** @type {readonly Dealt[]} */
  const dealing = crew ? [CREW, ...GOODS] : GOODS;
  for (const g of dealing) {
    const stand = standOf(port, g.id);
    const other = !g.crew && !!g.ether !== !!port?.ether;
    if (other && stand === 'neither') continue;
    const p = priceOf(port, g.id, day);
    const stock = DAY_STOCK[stand];
    const exotic = other && stand !== 'makes';
    const sell = Math.max(2, Math.round(p.mid * (1 + k) * ask));
    // Buy stays at least 1 below sell, or rounding a nearly closed spread would make a round trip free.
    rows.push({
      id: g.id, name: g.name, unit: g.unit, units: g.units, kg: g.kg, stand, sell, buy: Math.max(1, Math.min(sell - 1, Math.round(p.mid * (1 - k) * pay))), exotic,
      sells: exotic ? 0 : Math.max(0, stock.sell - (dealt.bought?.[g.id] | 0)), buys: Math.max(0, stock.buy - (dealt.sold?.[g.id] | 0)),
    });
  }
  return rows;
}
