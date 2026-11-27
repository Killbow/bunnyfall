// @ts-check
import { mulberry32 } from '../../combat/bloodArt.js';
import { registerCustomTemplates, setItemFields, mintCondition } from '../../items/itemTemplates.js';
import { siteFor, compassWords, leaguesWords } from './harbourBoard.js';

// Template 1342 follows the trade goods, which start at GOODS_TEMPLATE in tradeGoods.js.
export const CHART_TEMPLATE = 1342;
export const CHART_GROUP = 'UselessItems2';
export const CHART_ROW = Object.freeze({
  index: CHART_TEMPLATE, name: 'Treasure Chart', baseWeight: 0.25, hitPoints: 1, capacityOrTarget: 0, basePrice: 150,
  enchantmentPoints: 0, rarity: 9, variants: 0, drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false,
  isOneHanded: false, isIngredient: false, worldTextureArchive: 209, worldTextureRecord: 8, playerTextureArchive: 0,
  playerTextureRecord: 0, stackable: false,
});
// itemLaw.js imports this module so the chart template is registered.
registerCustomTemplates([CHART_ROW]);
export const CHART_SALT = 0xc4a27;
export const CHART_CHANCE = Object.freeze({ pirate: 0.08, deep: 0.18, flagship: 0.6 });
export const CHART_PX = Object.freeze({ near: 6, far: 14 });
export const CACHE_GOLD = Object.freeze({ base: 250, level: 60 });
export const CHART_SITE = 'chart:';
export const CHART_PORT_TRIES = 32;

export const mintChart = (seed) => mintCondition(setItemFields({ group: CHART_GROUP, templateIndex: CHART_TEMPLATE, material: 0, flags: 0, variant: 0, message: seed >>> 0, stackCount: 1 }));
export const isChart = (it) => it?.templateIndex === CHART_TEMPLATE;

/**
 * @param {{ faction?: string, flagship?: boolean }} cls
 * @param {number} seed
 * @param {{ deep?: boolean }} [o]
 */
export function chartAboard(cls, seed, { deep = false } = {}) {
  if (cls?.faction !== 'pirate') return null;
  const r = mulberry32(((seed >>> 0) ^ CHART_SALT) >>> 0);
  const p = cls.flagship ? CHART_CHANCE.flagship : deep ? CHART_CHANCE.deep : CHART_CHANCE.pirate;
  if (!(r() < p)) return null;
  return (r() * 0x100000000) >>> 0;
}

// The site depends only on the seed and the port list, so every client finds the same cache.
/**
 * @param {number} seed
 * @param {{ key: string, name: string, px: number, py: number }[]} ports
 * @param {(px: number, py: number) => boolean} seaAt
 */
export function chartSite(seed, ports, seaAt) {
  const list = (ports ?? []).filter(Boolean);
  if (!list.length) return null;
  const r = mulberry32(((seed >>> 0) ^ (CHART_SALT << 1)) >>> 0);
  for (let i = 0; i < CHART_PORT_TRIES; i++) {
    const port = list[Math.floor(r() * list.length) % list.length];
    const site = siteFor(port, r, seaAt, CHART_PX);
    if (!site) continue;
    const words = `${leaguesWords(site.d)} ${compassWords(site.px - port.px, site.py - port.py)} of ${port.name}`;
    return { id: `${CHART_SITE}${seed >>> 0}`, seed: seed >>> 0, px: site.px, py: site.py, near: port.name, words };
  }
  return null;
}

export function cacheGold(seed, level) {
  const r = mulberry32(((seed >>> 0) ^ 0xca5e) >>> 0);
  return Math.round((CACHE_GOLD.base + CACHE_GOLD.level * Math.max(1, level | 0)) * (0.8 + 0.4 * r()));
}
