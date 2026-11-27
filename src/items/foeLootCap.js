// @ts-check

import {
  corpseSource, rarityRank, lootRarityOn, rarityEligible, rollRarity, applyRarity, lastPass, legendaryFindMult, isGarment, RARITIES,
  cursePass,
  damnPass,
  socketPass,
  weaponSocketPass,
  techniquePass,
} from './lootRarity.js';
import { isGoldPieces, ARROW_TEMPLATE } from './inventory.js';
import { wildFoeLoot } from '../world/wildZone.js';
import { isPotion } from './useItem.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { renownLootQuarters, lootEased } from './renownLoot.js';
import { isCardRecord } from '../net/cardWorthLaw.js';

export const CARD_CAP_RANK = 2;
export const PLAIN_FOE_LOOT_CAP = 3;
export const ELITE_DUNGEON_FOE_LOOT_CAP = 5;

export const PLAIN_FOE_RARITY_WEIGHTS = Object.freeze({
  magic:     Object.freeze({ base: 50,   perTier: 5,     cap: 190 }),
  rare:      Object.freeze({ base: 6,    perTier: 1.2,   cap: 38 }),
  legendary: Object.freeze({ base: 0.15, perTier: 0.075, cap: 3 }),
});
export const PLAIN_FOE_RARITY_WEIGHTS_BEFORE = Object.freeze({
  magic:     Object.freeze({ base: 40,  perTier: 4,    cap: 150 }),
  rare:      Object.freeze({ base: 4,   perTier: 0.8,  cap: 25 }),
  legendary: Object.freeze({ base: 0.1, perTier: 0.05, cap: 2 }),
});
const _ladders = new Map();
export function plainFoeRarityWeights(quarters = renownLootQuarters()) {
  if (quarters === 4) return PLAIN_FOE_RARITY_WEIGHTS;
  let w = _ladders.get(quarters);
  if (!w) {
    const tier = (/** @type {'magic'|'rare'|'legendary'} */ t) => Object.freeze(Object.fromEntries(['base', 'perTier', 'cap']
      .map((k) => [k, lootEased(PLAIN_FOE_RARITY_WEIGHTS_BEFORE[t][k], PLAIN_FOE_RARITY_WEIGHTS[t][k], quarters)])));
    w = Object.freeze({ magic: tier('magic'), rare: tier('rare'), legendary: tier('legendary') });
    _ladders.set(quarters, w);
  }
  return w;
}

export const titledFoe = (entity) => !!(entity?.eliteFoe || entity?.champion || entity?.revenant || entity?.properName || entity?.worldBoss);

/** @returns {{ cap: number, plainLadder: boolean } | null} */
export function plainFoeLootRule(entity, basics = null) {
  if (!entity || titledFoe(entity)) return null;
  if (corpseSource(basics, entity.level, entity.mobileType).boss) return null;
  const eliteDungeon = !!entity.elite;
  const wide = wildFoeLoot(entity);
  return { cap: Math.ceil((eliteDungeon ? ELITE_DUNGEON_FOE_LOOT_CAP : PLAIN_FOE_LOOT_CAP) * wide), plainLadder: !eliteDungeon };
}

const _supplies = new Map();
export function registerLootSupply(name, fn) { if (typeof fn === 'function') _supplies.set(name, fn); else _supplies.delete(name); }
export function isLootSupply(item) {
  if (!item) return false;
  if (isPotion(item)) return true;
  for (const fn of _supplies.values()) { try { if (fn(item)) return true; } catch { } }
  return false;
}
const GARMENT_UNDER_SUPPLY = 0.5;
const garmentRank = (it) => (lootRarityOn() && isGarment(it) && rarityRank(it) > 0 && rarityRank(it) < RARITIES.legendary.rank ? GARMENT_UNDER_SUPPLY : null);
const capRank = (it) => { if (isCardRecord(it)) return CARD_CAP_RANK; const r = rarityRank(it); const g = garmentRank(it); if (g != null) return g; return r > 0 ? 1 + r : (isLootSupply(it) ? 1 : 0); };

const isQuiverArrow = (it) => it?.group === 'Weapons' && it.templateIndex === ARROW_TEMPLATE;

// Arrows pass the cap uncounted; gold folds into one stack and quest items are always kept, even past the cap.
/**
 * @param {any[]} items
 * @param {number} cap
 */
export function capLootList(items, cap) {
  if (!Array.isArray(items) || !(cap >= 0)) return [];
  const quiver = items.filter(isQuiverArrow);
  if (items.length - quiver.length <= cap) return [];
  let gold = null;
  for (const it of items) {
    if (!isGoldPieces(it)) continue;
    if (!gold) gold = it;
    else gold.stackCount = (gold.stackCount | 0) + (it.stackCount | 0);
  }
  const quest = items.filter((it) => it?.questItem && it !== gold);
  const rest = items.filter((it) => it && it !== gold && !isGoldPieces(it) && !it.questItem && !isQuiverArrow(it))
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (capRank(b.it) - capRank(a.it)) || ((b.it.value ?? 0) - (a.it.value ?? 0)) || (a.i - b.i))
    .map((r) => r.it);
  const keep = [...(gold ? [gold] : []), ...quest];
  for (const it of rest) { if (keep.length >= cap) break; keep.push(it); }
  const kept = new Set([...keep, ...quiver]);
  const dropped = items.filter((it) => !kept.has(it));
  const order = items.filter((it) => kept.has(it));
  // Rewrite in place, in the list's own order, because the inventory window reads this array.
  items.length = 0;
  items.push(...order);
  return dropped;
}

export function summonedBody(f) {
  const e = f?.entity;
  if (!e) return f;
  e.summoned = true;
  e.items = [];
  return f;
}

// Wire field sm lists the summons in an owner frame, so a puppet copy of a summon on a peer carries no loot.
export function summonedWord(src, out) {
  const sm = [];
  src.forEach(([f, qt], k) => { if (!qt && f?.entity?.summoned === true && out[k]) sm.push(out[k].i); });
  return sm.length ? { sm } : {};
}

export function summonedRecord(r, seqs) {
  if (r && seqs?.has?.(r.i)) r.sm = 1;
  return r;
}

export const savedSummon = (f, rec) => (f?.entity?.summoned === true ? { ...rec, summoned: true } : rec);
export const restoredSummon = (f, sf) => (sf?.summoned === true && f?.entity ? summonedBody(f) : f);

export function markSummoned(f, r) {
  if (r?.sm === 1 && f?.entity && f.entity.summoned !== true) summonedBody(f);
  return f;
}

// Runs at spawn and again at death after every death handler, so the cap holds for what the body carries.
export function capFoeLoot(entity) {
  if (entity?.summoned === true && Array.isArray(entity.items)) return entity.items.splice(0);
  const cap = entity?.lootCap;
  // An enemy promoted after its spawn is titled by the time it dies, so it is not capped.
  if (!Number.isInteger(cap) || !Array.isArray(entity.items) || titledFoe(entity)) return [];
  return capLootList(entity.items, cap);
}

export function rollCorpseKit(entity, opts = {}) {
  const kit = [...rollKitPieces(entity, opts), ...rollKitGarments(entity, opts)];
  // Keep the pass order fixed so seeded draws do not move: curse, sockets, weapon sockets, damn, then technique.
  cursePass(kit, opts.rolls ?? Math.random);
  socketPass(kit, opts.rolls ?? Math.random);
  weaponSocketPass(kit, opts.rolls ?? Math.random);
  damnPass(kit, opts.rolls ?? Math.random);
  techniquePass(kit, opts.rolls ?? Math.random);
  return kit;
}
function rollKitPieces(entity, { rolls = Math.random, luck = 50, quarters = undefined, find: findIn = undefined } = {}) {
  if (!lootRarityOn() || !entity || !Array.isArray(entity.items) || entity.revenant) return [];
  /** @type {{ kind: string, tier: number, family: string, boss: boolean, weights: any, qualityMult?: number }} */ const source = { ...corpseSource(ENEMY_BASICS[entity.mobileType] ?? null, entity.level, entity.mobileType), boss: false, weights: plainFoeRarityWeights(quarters) };
  const find = findIn ?? legendaryFindMult();
  source.qualityMult = (source.qualityMult ?? 1) * (entity.cromwarkLootMultiplier ?? 1);
  const minted = [];
  entity.items.forEach((it, i) => {
    if (isGarment(it)) return;
    // Kit is the eligible pieces without the saved untaken mark; the equip table is not reliable after a load.
    if (!it || it.untaken === true || !rarityEligible(it)) return;
    // Roll a copy, so the equip table and the hand keep the piece as it was minted.
    const piece = { ...it, untaken: true };
    entity.items[i] = piece;
    const tier = rollRarity({ ...source, luck, find }, rolls);
    if (tier !== 'common') { applyRarity(piece, tier, rolls, null, { family: source.family ?? null }); minted.push(piece); }
  });
  lastPass(minted, rolls);
  return minted;
}
function rollKitGarments(entity, { rolls = Math.random, luck = 50, quarters = undefined, find: findIn = undefined } = {}) {
  if (!lootRarityOn() || entity?.revenant || !Array.isArray(entity?.items)) return [];
  const kit = corpseSource(ENEMY_BASICS[entity.mobileType] ?? null, entity.level, entity.mobileType);
  kit.boss = false;
  kit.weights = plainFoeRarityWeights(quarters);
  kit.qualityMult = (kit.qualityMult ?? 1) * (entity.cromwarkLootMultiplier ?? 1);
  const find = findIn ?? legendaryFindMult();
  const dressed = [];
  entity.items.forEach((g, i) => {
    if (!isGarment(g) || g.untaken === true || !rarityEligible(g)) return;
    const copy = { ...g, untaken: true };
    entity.items[i] = copy;
    const rung = rollRarity({ ...kit, luck, find }, rolls);
    if (rung !== 'common') { applyRarity(copy, rung, rolls, null, { family: kit.family ?? null }); dressed.push(copy); }
  });
  lastPass(dressed, rolls);
  return dressed;
}
