// @ts-check
import { seededRng } from '../../weather/wind.js';
import { spoilsBase, magicOrBetter } from '../../worldEvents/gateSpoils.js';
import { applyRarity, lastPass, techniquePass } from '../../items/lootRarity.js';
import { rollStarspunPiece } from '../../items/aetheric.js';
import { RAID_SPOILS_SOURCE } from '../../worldEvents/raidSpoils.js';
import { starglass } from './starglass.js';
import { heartStar } from './starfallNight.js';
import { t } from '../../ui/textManager.js';

export const STAR_SPOILS_GOLD_PER_LEVEL = 60;
export const STARGLASS_MAX = 3;
export const STAR_SPOILS_KEYS = Object.freeze({ store: 'star7.spoils', day: 'star7.spoilsDay' });
export const STAR_SPOILS_RECORDS_MAX = 32;
// Keyed by night and star, so a star receipt never collides with a gate day key in the spoils pool.
export const starSpoilsDay = (n, k) => `star:${n}.${k}`;
export const STAR_SPOILS_TEXT = Object.freeze({
  granted: () => t('starfall.spoils.granted', 'The star\'s spoils are in your pack.'),
  recovered: () => t('starfall.spoils.recovered', 'A fallen star\'s spoils are in your pack.'),
  kept: (name) => (name ? t('starfall.spoils.keptFor', 'A fallen star\'s spoils wait for {name}.', { name }) : t('starfall.spoils.kept', 'A fallen star\'s spoils wait for the one who held it.')),
});

// Every roll comes from the receipt seed, so each defender gets their own spoils and every device agrees.
/**
 * @param {number} seed
 * @param {number} level
 * @param {number} n
 * @param {number} k
 */
export function rollStarSpoils(seed, level, n, k) {
  const rolls = seededRng(seed >>> 0);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const twice = heartStar(n, k) ? 2 : 1;
  const gold = Math.round(STAR_SPOILS_GOLD_PER_LEVEL * lv * (0.8 + 0.4 * rolls())) * twice;
  const glass = starglass((1 + Math.min(STARGLASS_MAX - 1, Math.floor(rolls() * STARGLASS_MAX))) * twice);
  const item = spoilsBase(lv, rolls);
  const tier = magicOrBetter(rolls, RAID_SPOILS_SOURCE);
  applyRarity(item, tier, rolls);
  item.isIdentified = true;
  const pieces = [{ item, tier: item.rarity ?? tier }];
  // The Starspun piece, the last pass, and the technique pass roll last, so earlier draws keep their seed values.
  const set = rollStarspunPiece(rolls, twice === 2);
  if (set) pieces.push({ item: set, tier: set.rarity });
  lastPass([item], rolls);
  techniquePass([item], rolls);
  return { gold, starglass: glass, pieces };
}

export function starSpoilsList(seed, level, n, k) {
  const s = rollStarSpoils(seed, level, n, k);
  return [...s.pieces.map((p) => ({ kind: 'item', item: p.item, tier: p.tier })), { kind: 'item', item: s.starglass, tier: 'common' }, { kind: 'gold', gold: s.gold, tier: 'common' }];
}
