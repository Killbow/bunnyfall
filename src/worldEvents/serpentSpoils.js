// @ts-check
import { seededRng } from '../weather/wind.js';
import { spoilsBase, magicOrBetter, sigilStone } from './gateSpoils.js';
import { applyRarity, lastPass, socketPass, weaponSocketPass, techniquePass } from '../items/lootRarity.js';
import { bossGems } from '../items/gems.js';
import { rollSerpentSetPiece } from '../items/aetheric.js';
import { SERPENT_EMBERS } from '../net/serpentHoardLaw.js';
import { bossCardRoll } from '../cards/bossCards.js';
import { rollSunkenSovereign } from '../items/gilded.js';

export const SERPENT_SPOILS_GOLD_PER_LEVEL = 160;
export const STOOD_GOLD = 0.6;
export const SERPENT_SPOILS_LEGENDARY = 0.15;
export const SERPENT_SPOILS_SOURCE = Object.freeze({ boss: true, tier: 18, luck: 50 });
// Serpent hoards use their own spoils pool keys, so serpent receipts never push gate or town receipts out of the
// spent list.
export const SERPENT_SPOILS_KEYS = Object.freeze({ store: 'serpent1.spoils', day: 'serpent1.spoilsDay' });
export const SERPENT_SPOILS_RECORDS_MAX = 16;
export const serpentSpoilsDay = (d) => `serpent:${d}`;
export const SERPENT_SPOILS_TEXT = Object.freeze({
  granted: (boss) => `${boss.name}'s hoard is yours. It is in your pack.`,
  recovered: 'A sea serpent\'s hoard is in your pack.',
  kept: (name, boss) => `${boss.name}'s hoard waits for ${name || 'the one who fought it'}.`,
});

function graded(item, tier, rolls) {
  applyRarity(item, tier, rolls);
  item.isIdentified = true;
  return { item, tier: item.rarity ?? tier };
}

export function serpentEmbers() {
  return SERPENT_EMBERS > 0 ? Object.assign(sigilStone(), { stackCount: SERPENT_EMBERS }) : null;
}

/**
 * @param {number} seed
 * @param {number} level
 * @param {string} earned
 */
export function rollSerpentSpoils(seed, level, earned = 'dealt') {
  const rolls = seededRng(seed >>> 0);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const dealt = earned !== 'stood';
  const gold = Math.round(SERPENT_SPOILS_GOLD_PER_LEVEL * lv * (0.8 + 0.4 * rolls()) * (dealt ? 1 : STOOD_GOLD));
  const pieces = [];
  if (dealt) pieces.push(graded(spoilsBase(lv, rolls), rolls() < SERPENT_SPOILS_LEGENDARY ? 'legendary' : 'rare', rolls));
  pieces.push(graded(spoilsBase(lv, rolls), magicOrBetter(rolls, SERPENT_SPOILS_SOURCE), rolls));
  lastPass(pieces.map((p) => p.item), rolls);
  // Each later draw (set piece, card, gems, technique, sovereign) comes after all earlier draws so a given seed
  // keeps rolling the same earlier pieces.
  const coil = dealt ? rollSerpentSetPiece(rolls) : null;
  if (coil) pieces.push({ item: coil, tier: coil.rarity });
  const card = dealt ? bossCardRoll('serpent', rolls) : null;
  socketPass(pieces.map((p) => p.item), rolls);
  weaponSocketPass(pieces.map((p) => p.item), rolls);
  const gems = dealt ? bossGems('serpent', rolls) : [];
  techniquePass(pieces.map((p) => p.item), rolls);
  const sovereign = dealt ? rollSunkenSovereign(rolls) : null;
  if (sovereign) pieces.push({ item: sovereign, tier: sovereign.rarity });
  return { gold, pieces, embers: serpentEmbers(), card, gems };
}

export function serpentSpoilsList(seed, level, earned) {
  const s = rollSerpentSpoils(seed, level, earned);
  return [
    ...s.pieces.map((p) => ({ kind: 'item', item: p.item, tier: p.tier })),
    ...(s.card ? [{ kind: 'item', item: s.card, tier: 'aetheric' }] : []),
    ...s.gems.map((g) => ({ kind: 'item', item: g, tier: 'common' })),
    ...(s.embers ? [{ kind: 'item', item: s.embers, tier: 'artifact' }] : []),
    { kind: 'gold', gold: s.gold, tier: 'common' },
  ];
}
