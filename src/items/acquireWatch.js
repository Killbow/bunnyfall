// @ts-check
// Finds rare-or-better items new to the player's pack, wagon, or Materials Bag, checked once a frame.
// It watches the lists, not each add path. Transfers strip the saved `acquired` mark, so traded items are new.
// Cards merge into stacks, so a card arrives when its total count rises; moves between the lists never count.

import { rarityAttr, RARITIES } from './lootRarity.js';
import { isIliacCard } from '../cards/iliacItems.js';
import { cardById } from '../net/iliacCards.js';
import { isAmmunition } from './itemTemplates.js';

export const ACQUIRED_FIELD = 'acquired';
export const BANNER_MIN_TIER = 'rare';
export const BANNER_BIG_TIER = 'aetheric';

const TIERED_GROUPS = new Set(['Weapons', 'Armor', 'Jewellery', 'MensClothing', 'WomensClothing']);

export function markable(item) {
  if (!item || typeof item !== 'object') return false;
  if (isIliacCard(item) || item.artifact === true) return true;
  return TIERED_GROUPS.has(item.group) && !(item.group === 'Weapons' && isAmmunition(item));
}

export function acquiredTier(item) {
  if (!item) return null;
  if (isIliacCard(item)) {
    const t = cardById(item.card)?.tier;
    return typeof t === 'string' && RARITIES[t] ? t : null;
  }
  return rarityAttr(item);
}

export const tierRank = (tier) => (tier && RARITIES[tier] ? RARITIES[tier].rank : -1);
export const tierAnnounces = (tier) => tierRank(tier) >= RARITIES[BANNER_MIN_TIER].rank;
export const tierIsBig = (tier) => tierRank(tier) >= RARITIES[BANNER_BIG_TIER].rank;
export const announces = (item) => tierAnnounces(acquiredTier(item));
export const isAcquired = (item) => item?.[ACQUIRED_FIELD] === true;

// The presenter slot lives in this leaf module so the loot codex and the banner UI never import each other.
let _findPresenter = null;
export function setCodexFindPresenter(fn) { _findPresenter = typeof fn === 'function' ? fn : null; }
export function presentCodexFind(item, kind) {
  try { return !!_findPresenter?.(item, kind); } catch { return false; }
}

const listsOf = (entity) => [entity?.items, entity?.wagonItems, entity?.bagItems].filter(Array.isArray);
const countOf = (item) => (Number.isInteger(item?.stackCount) && item.stackCount > 0 ? item.stackCount : 1);

export function createAcquireWatch() {
  let lastEntity = null;
  let lastItems = null;
  let lastDone = null;
  let totals = new Map();
  let held = new Set();
  const never = new WeakSet();

  function observe(entity) {
    if (!entity || typeof entity !== 'object') return [];
    const done = entity.chargenDone === true;
    // A new entity, a new pack after a load, and character creation set a new baseline and announce nothing.
    const prime = entity !== lastEntity || entity.items !== lastItems || !done || lastDone !== done;
    lastEntity = entity;
    lastItems = entity.items;
    lastDone = done;
    /** @type {{ item: any, count: number, tier: string }[]} */
    const arrivals = [];
    const nowTotals = new Map();
    // Counts that marked records new to the lists brought, such as the player's own stack back from a chest.
    const movedIn = new Map();
    const face = new Map();
    const nowHeld = new Set();
    for (const list of listsOf(entity)) {
      for (const item of list) {
        if (!item || typeof item !== 'object' || never.has(item)) continue;
        if (!markable(item)) { never.add(item); continue; }
        if (isIliacCard(item)) {
          const id = item.card;
          const n = countOf(item);
          nowTotals.set(id, (nowTotals.get(id) ?? 0) + n);
          if (!held.has(item) && isAcquired(item)) movedIn.set(id, (movedIn.get(id) ?? 0) + n);
          if (!face.has(id) || !isAcquired(item)) face.set(id, item);
          nowHeld.add(item);
          item[ACQUIRED_FIELD] = true;
          continue;
        }
        if (isAcquired(item)) continue;
        item[ACQUIRED_FIELD] = true;
        if (prime) continue;
        const tier = acquiredTier(item);
        if (tierAnnounces(tier)) arrivals.push({ item, count: countOf(item), tier });
      }
    }
    if (!prime) {
      for (const [id, total] of nowTotals) {
        const rose = total - (totals.get(id) ?? 0) - (movedIn.get(id) ?? 0);
        if (rose <= 0) continue;
        const item = face.get(id);
        const tier = acquiredTier(item);
        if (tierAnnounces(tier)) arrivals.push({ item, count: rose, tier });
      }
    }
    totals = nowTotals;
    held = nowHeld;
    return arrivals;
  }

  return {
    observe,
    reset() { lastEntity = null; lastItems = null; lastDone = null; totals = new Map(); held = new Set(); },
  };
}
