// @ts-check
import { seededRng } from '../weather/wind.js';
import { spoilsBase, magicOrBetter } from './gateSpoils.js';
import { applyRarity, lastPass, techniquePass } from '../items/lootRarity.js';
import { rollRaidSetPiece } from '../items/aetheric.js';

export const RAID_SPOILS_GOLD_PER_LEVEL = 80;
export const RAID_HELD_GOLD_X = 1.5;
export const RAID_SPOILS_SOURCE = Object.freeze({ kind: 'pile', tier: 12, luck: 50 });
// Device storage keys for thanks no save holds yet and for spent receipts; renaming them loses records a crash left
// behind.
export const RAID_SPOILS_KEYS = Object.freeze({ store: 'raid4.spoils', day: 'raid4.spoilsDay' });
export const RAID_SPOILS_TEXT = Object.freeze({
  granted: 'The town\'s thanks are in your pack.',
  recovered: 'A town\'s thanks are in your pack.',
  kept: (name) => `The town's thanks wait for ${name || 'the one who fought'}.`,
});
export const RAID_SPOILS_RECORDS_MAX = 32;
export const raidSpoilsDay = (w) => `raid:${w}`;

/**
 * @param {number} seed
 * @param {number} level
 * @param {number} party
 * @param {boolean} [held]
 */
export function rollRaidSpoils(seed, level, party, held = false) {
  const rolls = seededRng(seed >>> 0);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const gold = Math.round(RAID_SPOILS_GOLD_PER_LEVEL * lv * (0.8 + 0.4 * rolls()) * (held ? RAID_HELD_GOLD_X : 1));
  const item = spoilsBase(lv, rolls);
  const tier = magicOrBetter(rolls, RAID_SPOILS_SOURCE);
  applyRarity(item, tier, rolls);
  item.isIdentified = true;
  // `applyRarity` lowers a Legendary with no record for its kind to Rare, so read the tier back off the item.
  const pieces = [{ item, tier: item.rarity ?? tier }];
  // Draw order on `rolls` is fixed: add new draws after the existing ones so a seed keeps rolling the same thanks.
  const set = rollRaidSetPiece(party, rolls);
  if (set) pieces.push({ item: set, tier: set.rarity });
  lastPass([item], rolls);
  techniquePass([item], rolls);
  if (held) {
    const more = spoilsBase(lv, rolls), moreTier = magicOrBetter(rolls, RAID_SPOILS_SOURCE);
    applyRarity(more, moreTier, rolls);
    more.isIdentified = true;
    lastPass([more], rolls);
    techniquePass([more], rolls);
    pieces.push({ item: more, tier: more.rarity ?? moreTier });
  }
  return { gold, pieces };
}

export function raidSpoilsList(seed, level, party, held = false) {
  const s = rollRaidSpoils(seed, level, party, held);
  return [...s.pieces.map((p) => ({ kind: 'item', item: p.item, tier: p.tier })), { kind: 'gold', gold: s.gold, tier: 'common' }];
}
