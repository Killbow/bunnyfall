// @ts-check
// BUNNYFALL: SPELL SCROLLS. A scroll is a one-use "Cast When Used" magic item carrying one of the classic spells (the
// SPELLS.STD list the Mages Guild sells from). Using it casts the spell free, whatever the reader's skill or magicka, and
// the scroll is gone: it is made of the machinery magic items already run on, so the pack's Use, the Use Magic Item key
// and the hotbar all work with no host change.
//
//   - ONE template (1820, Parchment's picture), not stackable; each scroll's own name ("Scroll of Levitate") and its one
//     CastWhenUsed row (param = the classic spell index) say which spell it is. The item law passes it as a regular
//     magic item (itemLaw.js regularMagicFindings: one row, a kind MAGIC.DEF's regular items carry).
//   - ONE USE: it is minted at DURABILITY_LOSS_ON_USE condition (10), the cost of one use of any Cast When Used item
//     (enchantments.js), so its use breaks it, and enchantLowerCondition removes a broken magic item from the pack.
//   - A CasterOnly spell goes off at once; any other is readied free, as a Cast When Used item's is. Like those items,
//     the scroll is spent when the spell is readied, not when it is finally fired.
//   - WHERE THEY ARE: the Mages Guild's Buy Magic Items shelf, the Alchemist's, the General Store's and the Pawn Shop's
//     shelves (the better the shop, the dearer the scrolls it carries), and as loot (foes, dungeon piles J-O).
//   - PRICE: the item's value is the enchantment worth a magic item of that spell has (legacyEnchantmentValue).
//   - Indices are held to 0..127: a Cast When Used row's param is a signed byte in the item law.

import { ITEM_TEMPLATES, registerCustomTemplates, setItemFields, mintCondition, registerValueLaw } from '../item/itemTemplates.js';
import { ENCHANTMENT_TYPES } from '../../formats/magicDef.js';
import { legacyEnchantmentValue, DURABILITY_LOSS_ON_USE } from '../enchantments.js';
import { registerTabledLootHandler, registerEnemyLootExtra } from '../loot/loot.js';

export const SCROLL_TEMPLATE = 1820;
export const SCROLL_GROUP = 'UselessItems2';
const PARCHMENT_TEMPLATE = 279;   // UselessItems2.Parchment - the scroll wears its picture
const MAX_SPELL_INDEX = 127;

/** A SCROLL'S WORTH (2026-11-05, a player: "I sold a Balyna's Balm for like 800gp in the first shop ... cheap starter
 *  spells for like 10% of that"): the enchantment worth (10 x the spell's casting cost at skill 50) scaled by how dear
 *  the spell is - a spell of casting cost FULL_WORTH_COST or more keeps the whole of it, a cheaper one the share its cost
 *  is of that, never under a tenth: Balyna's Balm (cost 15) 15 gold, Light 42, Heal 86, Fireball 147, Lightning 385,
 *  Shield 721, and Paralysis, Soul Trap or Sphere of Negation their whole worth. */
export const FULL_WORTH_COST = 150;
export function scrollValue(/** @type {number} */ worth) {
  const cost = worth / 10;
  return Math.max(10, Math.round(worth * Math.min(1, Math.max(0.1, cost / FULL_WORTH_COST))));
}

/** How dear a scroll may be on a shelf of a given quality: a scroll worth `value` needs a shop of quality `tier`
 *  (1 + value / TIER_STEP, to 20). The one number to turn if the shelves run too cheap or too dear. */
export const TIER_STEP = 250;
/** Per-shop scroll counts, by shop quality (1-20). */
export const SCROLL_SHELVES = Object.freeze({
  Guild: (q) => 2 + Math.floor(q / 3),
  Alchemist: (q) => 1 + Math.floor(q / 5),
  GeneralStore: (q) => Math.floor(q / 6),
  PawnShop: (q) => Math.floor(q / 8),
});
/** A looting foe's and a dungeon pile's (keys J-O) chance of a scroll, in percent. */
export const SCROLL_FOE_PERCENT = 2;
export const SCROLL_PILE_PERCENT = 5;

const base = ITEM_TEMPLATES[PARCHMENT_TEMPLATE];
registerCustomTemplates([Object.freeze({
  ...base,
  index: SCROLL_TEMPLATE, name: 'Spell Scroll', baseWeight: 0.1, hitPoints: DURABILITY_LOSS_ON_USE, capacityOrTarget: 0,
  basePrice: 25, rarity: 1, stackable: false, isNotRepairable: true,
})]);

export const isSpellScroll = (/** @type {any} */ item) => item?.templateIndex === SCROLL_TEMPLATE && item?.group === SCROLL_GROUP;

// ── the spells a scroll may carry ─────────────────────────────────

/** @type {(() => Map<number, any> | null) | null} */
let _source = null;
/** The host's `spellsByIndex` (hostEnchant.js hands it in): the classic spell records by index. With none, no scroll is
 *  minted anywhere - a shelf simply lacks them. */
export function setScrollSpellSource(fn) { _source = typeof fn === 'function' ? fn : null; _poolFor = null; _pool = []; }

let _poolFor = null;
let _pool = [];
/** The scrollable spells, sorted by index: a name the file does not hide ('!'), an index a signed byte holds. Cached on
 *  the map the source answers. */
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

/** A scroll's worth by today's law, whatever it was minted at (a scroll bought before 2026-11-05 carries the old price):
 *  the item a spell scroll - this template, one Cast When Used row - and its spell in the pool, else null. */
export function scrollWorthOf(/** @type {any} */ item) {
  if (item?.templateIndex !== SCROLL_TEMPLATE || item.group !== SCROLL_GROUP) return null;
  const e = item.enchantments?.[0];
  if (!e || e.type !== ENCHANTMENT_TYPES.CastWhenUsed || item.enchantments.length !== 1) return null;
  return scrollPool().find((x) => x.index === e.param)?.value ?? null;
}
registerValueLaw('spellScroll', scrollWorthOf);

/** One scroll of the classic spell at `spellIndex`, or null when the source has no such spell. */
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

// ── sources ───────────────────────────────────────────────────────

/** `n` distinct scrolls for a shelf of `quality`, none dearer than the shop's tier. */
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

/** A shop's scrolls: `kind` is a SCROLL_SHELVES key. Minted after every other draw of the shelf. */
export function scrollShelfStock(kind, quality = 10, rolls = Math.random) {
  const count = SCROLL_SHELVES[kind];
  if (!count) return [];
  const q = Math.max(1, Math.min(20, Math.trunc(Number(quality)) || 1));
  return pickScrolls(count(q), q, rolls);
}

/** A foe's or a pile's roll: one scroll at `percent`, the cheaper of two random spells (so the common find is the small
 *  one). */
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

const isDungeonPileKey = (/** @type {any} */ key) => { const n = String(key ?? '').charCodeAt(0) - 64; return n >= 10 && n <= 15; };

/** Hooks the piles and the foes (scenes/shared.js calls this where the other supplies' loot hooks go). */
export function installScrollLoot() {
  registerTabledLootHandler('SCROLL', ({ key, items, rolls }) => { if (isDungeonPileKey(key)) rollScrollLoot(items, SCROLL_PILE_PERCENT, rolls); });
  registerEnemyLootExtra('SCROLL', ({ items, rolls }) => { rollScrollLoot(items, SCROLL_FOE_PERCENT, rolls); });
}
