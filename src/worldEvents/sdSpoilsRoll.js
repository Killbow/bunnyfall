// @ts-check
import { seededRng } from '../weather/wind.js';
import { spoilsBase } from './gateSpoils.js';
import { applyRarity, rarityChances, lastPass, socketPass, weaponSocketPass, techniquePass } from '../items/lootRarity.js';
import { bossGems } from '../items/gems.js';
import { rollNumidiumPiece } from '../items/aetheric.js';
import { rollHourlock } from '../items/gilded.js';
import { RANDOM_TREASURE_ICONS } from '../items/loot.js';
import { bossCardRoll } from '../cards/bossCards.js';

export const SD_SPOILS_GOLD_PER_LEVEL = 400;
export const SD_SPOILS_LEGENDARY = 0.25;
export const SD_SPOILS_SOURCE = Object.freeze({ boss: true, tier: 24, luck: 70 });
// Device storage keys for unsaved spoils and spent receipts. Renaming them strands pending spoils on existing
// devices.
export const SD_SPOILS_KEYS = Object.freeze({ store: 'sd9.spoils', day: 'sd9.spoilsDay' });
export const SD_SPOILS_RECORDS_MAX = 8;
export const SD_SPOILS_TEXT = Object.freeze({
  spilled: 'Your spoils spill across the arena floor.',
  none: 'No spoils. Your part in the fight was too small.',
  gathered: 'The spoils of the Last Moment are in your pack.',
  granted: 'Your share of the Brass Remnant\'s spoils is in your pack.',
  recovered: 'The Brass Remnant\'s spoils are in your pack.',
});
// The `sd:` prefix keeps Hour receipts apart from gate days in the shared spent list, and `sdSpoilsSlot` parses the
// same format.
export const sdSpoilsDay = (d) => `sd:${d}`;
export function sdSpoilsSlot(day) {
  const m = typeof day === 'string' ? /^sd:(\d{1,9})$/.exec(day) : null;
  const s = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(s) && s >= 1 ? s : null;
}

/**
 * @param {() => number} rolls
 * @param {{ kind?: string, tier?: number, boss?: boolean, luck?: number }} [source]
 */
export function rareOrBetter(rolls, source = SD_SPOILS_SOURCE) {
  const c = rarityChances(source);
  return rolls() * c.rare < c.legendary ? 'legendary' : 'rare';
}

// Reads the tier back from the item because `applyRarity` falls back to Rare when no Legendary record fits the
// item.
function graded(item, tier, rolls) {
  applyRarity(item, tier, rolls);
  item.isIdentified = true;
  return { item, tier: item.rarity ?? tier };
}

/**
 * @param {number} seed
 * @param {number} level
 */
export function rollSdSpoils(seed, level) {
  const rolls = seededRng(seed >>> 0);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const gold = Math.round(SD_SPOILS_GOLD_PER_LEVEL * lv * (0.8 + 0.4 * rolls()));
  const pieces = [];
  pieces.push(graded(spoilsBase(lv, rolls), rolls() < SD_SPOILS_LEGENDARY ? 'legendary' : 'rare', rolls));
  for (let i = 0; i < 2; i++) pieces.push(graded(spoilsBase(lv, rolls), rareOrBetter(rolls), rolls));
  lastPass(pieces.map((p) => p.item), rolls);
  // Every draw below shares one seeded stream, so add new draws after the existing ones; inserting one earlier
  // changes the spoils every existing seed produces.
  const brass = rollNumidiumPiece(rolls);
  if (brass) pieces.push({ item: brass, tier: brass.rarity });
  const hourlock = rollHourlock(rolls);
  if (hourlock) pieces.push({ item: hourlock, tier: hourlock.rarity });
  const card = bossCardRoll('abyss', rolls);
  socketPass(pieces.map((p) => p.item), rolls);
  weaponSocketPass(pieces.map((p) => p.item), rolls);
  const gems = bossGems('abyss', rolls);
  techniquePass(pieces.map((p) => p.item), rolls);
  return { gold, pieces, card, gems };
}

export function sdSpoilsList(seed, level) {
  const look = seededRng(((seed >>> 0) ^ 0x5eed) >>> 0);
  const flat = () => RANDOM_TREASURE_ICONS[Math.floor(look() * RANDOM_TREASURE_ICONS.length)];
  const s = rollSdSpoils(seed, level);
  const pieces = s.pieces.map((p) => ({ kind: 'item', item: p.item, tier: p.tier, record: flat() }));
  const gold = { kind: 'gold', gold: s.gold, tier: 'common', record: flat() };
  // The `look` stream draws pictures for pieces, gold, card, then gems. Keep new draws last so earlier pictures
  // stay the same for a seed.
  const card = s.card ? [{ kind: 'item', item: s.card, tier: 'aetheric', record: flat() }] : [];
  const gems = s.gems.map((g) => ({ kind: 'item', item: g, tier: 'common', record: flat() }));
  return [
    ...pieces,
    ...card,
    ...gems,
    gold,
  ];
}
