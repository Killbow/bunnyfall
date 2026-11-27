// @ts-check
// A spell scroll is a Cast When Used item minted at DURABILITY_LOSS_ON_USE condition, so its one use breaks it.
// Spell indices stay within 0..127 because a Cast When Used param is a signed byte in the item law.

import { ITEM_TEMPLATES, registerCustomTemplates, setItemFields, mintCondition, registerValueLaw } from '../../items/itemTemplates.js';
import { ENCHANTMENT_TYPES } from '../../formats/magicDef.js';
import { legacyEnchantmentValue, DURABILITY_LOSS_ON_USE } from '../../magic/enchantments.js';
import { registerTabledLootHandler, registerEnemyLootExtra } from '../../items/loot.js';

export const SCROLL_TEMPLATE = 1820;
export const SCROLL_GROUP = 'UselessItems2';
const PARCHMENT_TEMPLATE = 279;
const MAX_SPELL_INDEX = 127;

export const FULL_WORTH_COST = 150;
export function scrollValue(/** @type {number} */ worth) {
  // Enchantment worth is 10 times the spell's classic casting cost.
  const cost = worth / 10;
  return Math.max(10, Math.round(worth * Math.min(1, Math.max(0.1, cost / FULL_WORTH_COST))));
}

export const TIER_STEP = 250;
export const SCROLL_SHELVES = Object.freeze({
  Guild: (q) => 2 + Math.floor(q / 3),
  Alchemist: (q) => 1 + Math.floor(q / 5),
  GeneralStore: (q) => Math.floor(q / 6),
  PawnShop: (q) => Math.floor(q / 8),
});
export const SCROLL_FOE_PERCENT = 2;
export const SCROLL_PILE_PERCENT = 5;

const base = ITEM_TEMPLATES[PARCHMENT_TEMPLATE];
registerCustomTemplates([Object.freeze({
  ...base,
  index: SCROLL_TEMPLATE, name: 'Spell Scroll', baseWeight: 0.1, hitPoints: DURABILITY_LOSS_ON_USE, capacityOrTarget: 0,
  basePrice: 25, rarity: 1, stackable: false, isNotRepairable: true,
})]);

export const isSpellScroll = (/** @type {any} */ item) => item?.templateIndex === SCROLL_TEMPLATE && item?.group === SCROLL_GROUP;

/** @type {(() => Map<number, any> | null) | null} */
let _source = null;
export function setScrollSpellSource(fn) { _source = typeof fn === 'function' ? fn : null; _poolFor = null; _pool = []; }

let _poolFor = null;
let _pool = [];
export function scrollPool() {
  const map = _source?.() ?? null;
  if (!map || typeof map.get !== 'function') return [];
  if (map !== _poolFor) {
    _poolFor = map;
    _pool = [];
    for (let i = 0; i <= MAX_SPELL_INDEX; i++) {
      const rec = map.get(i);
      const name = String(rec?.name ?? '').trim();
      if (!rec || !name || name.startsWith('!')) continue;
      const ench = [{ type: ENCHANTMENT_TYPES.CastWhenUsed, param: i }];
      const value = scrollValue(legacyEnchantmentValue(ench, { spellOfIndex: (n) => map.get(n) ?? null }));
      _pool.push({ index: i, record: rec, name, value, tier: Math.min(20, 1 + Math.floor(value / TIER_STEP)) });
    }
  }
  return _pool;
}

// Prices a scroll by the current rule, whatever value it was minted with.
export function scrollWorthOf(/** @type {any} */ item) {
  if (item?.templateIndex !== SCROLL_TEMPLATE || item.group !== SCROLL_GROUP) return null;
  const e = item.enchantments?.[0];
  if (!e || e.type !== ENCHANTMENT_TYPES.CastWhenUsed || item.enchantments.length !== 1) return null;
  return scrollPool().find((x) => x.index === e.param)?.value ?? null;
}
registerValueLaw('spellScroll', scrollWorthOf);

export function createSpellScroll(spellIndex) {
  const entry = scrollPool().find((e) => e.index === spellIndex);
  if (!entry) return null;
  const it = mintCondition(setItemFields({ group: SCROLL_GROUP, templateIndex: SCROLL_TEMPLATE }));
  return Object.assign(it, {
    name: `Scroll of ${entry.name}`,
    magic: true,
    isIdentified: true,
    enchantments: [{ type: ENCHANTMENT_TYPES.CastWhenUsed, param: entry.index }],
    value: entry.value,
    currentCondition: DURABILITY_LOSS_ON_USE,
    maxCondition: DURABILITY_LOSS_ON_USE,
  });
}

function pickScrolls(n, maxTier, rolls) {
  const pool = scrollPool().filter((e) => e.tier <= maxTier);
  const out = [];
  while (out.length < n && pool.length) {
    const [e] = pool.splice(Math.min(pool.length - 1, Math.floor(rolls() * pool.length)), 1);
    const it = createSpellScroll(e.index);
    if (it) out.push(it);
  }
  return out;
}

export function scrollShelfStock(kind, quality = 10, rolls = Math.random) {
  const count = SCROLL_SHELVES[kind];
  if (!count) return [];
  const q = Math.max(1, Math.min(20, Math.trunc(Number(quality)) || 1));
  return pickScrolls(count(q), q, rolls);
}

export function rollScrollLoot(items, percent, rolls = Math.random) {
  if (rolls() * 100 >= percent) return items;
  const pool = scrollPool();
  if (!pool.length) return items;
  const a = pool[Math.floor(rolls() * pool.length)];
  const b = pool[Math.floor(rolls() * pool.length)];
  const it = createSpellScroll((a.value <= b.value ? a : b).index);
  if (it) items.push(it);
  return items;
}

// Dungeon pile keys J to O.
const isDungeonPileKey = (/** @type {any} */ key) => { const n = String(key ?? '').charCodeAt(0) - 64; return n >= 10 && n <= 15; };

export function installScrollLoot() {
  registerTabledLootHandler('SCROLL', ({ key, items, rolls }) => { if (isDungeonPileKey(key)) rollScrollLoot(items, SCROLL_PILE_PERCENT, rolls); });
  registerEnemyLootExtra('SCROLL', ({ items, rolls }) => { rollScrollLoot(items, SCROLL_FOE_PERCENT, rolls); });
}
