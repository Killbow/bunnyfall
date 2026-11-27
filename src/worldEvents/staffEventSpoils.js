// @ts-check
import { seededRng } from '../weather/wind.js';
import { spoilsBase, magicOrBetter } from './gateSpoils.js';
import { applyRarity, lastPass, techniquePass } from '../items/lootRarity.js';
import { t } from '../ui/textManager.js';

export const STAFF_SPOILS_TABLE = Object.freeze({
  goldPerLevel: 100,
  source: Object.freeze({ kind: 'pile', tier: 16, luck: 50 }),
  everyone: Object.freeze(['magic']),
  top: Object.freeze(['rare']),
  first: Object.freeze({ legendary: 0.1, least: 'rare' }),
});
// The `sev:` prefix keeps staff event receipts apart from raid receipts (`raid:`) in the spent list of the shared
// raid spoils pool.
export const staffSpoilsDay = (/** @type {string} */ id) => `sev:${id}`;
export const STAFF_SPOILS_TEXT = Object.freeze({
  granted: () => t('staffEvent.spoils', 'Your reward for the fight is in your pack.'),
});

const ORDER = ['magic', 'rare', 'legendary'];
/**
 * @param {() => number} rolls
 * @param {string} least
 */
function atLeast(rolls, least) {
  const got = magicOrBetter(rolls, STAFF_SPOILS_TABLE.source);
  return ORDER.indexOf(got) >= ORDER.indexOf(least) ? got : least;
}
/**
 * @param {number} lv
 * @param {string} tier
 * @param {() => number} rolls
 */
function piece(lv, tier, rolls) {
  const item = spoilsBase(lv, rolls);
  applyRarity(item, tier, rolls);
  item.isIdentified = true;
  // `applyRarity` lowers a Legendary with no record for its item to Rare, so the tier is read back off the item.
  return { item, tier: item.rarity ?? tier };
}

/**
 * @param {number} seed
 * @param {number} level
 * @param {number} rank
 */
export function rollStaffSpoils(seed, level, rank) {
  const T = STAFF_SPOILS_TABLE;
  const rolls = seededRng(seed >>> 0);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const gold = Math.round(T.goldPerLevel * lv * (0.8 + 0.4 * rolls()));
  const pieces = T.everyone.map((least) => piece(lv, atLeast(rolls, least), rolls));
  if (rank >= 1) for (const least of T.top) pieces.push(piece(lv, atLeast(rolls, least), rolls));
  if (rank === 1) pieces.push(piece(lv, rolls() < T.first.legendary ? 'legendary' : atLeast(rolls, T.first.least), rolls));
  lastPass(pieces.map((p) => p.item), rolls);
  techniquePass(pieces.map((p) => p.item), rolls);
  return { gold, pieces };
}

export function staffSpoilsList(/** @type {number} */ seed, /** @type {number} */ level, /** @type {number} */ rank, /** @type {number} */ bonusGold = 0) {
  const s = rollStaffSpoils(seed, level, rank);
  return [...s.pieces.map((p) => ({ kind: 'item', item: p.item, tier: p.tier })), { kind: 'gold', gold: s.gold + Math.max(0, Math.floor(Number(bonusGold) || 0)), tier: 'common' }];
}

/**
 * @param {{ grant: (o: any) => any }} pool
 * @param {(f: () => any) => Promise<any>} lock
 * @param {{ v: string, s: string, c: number, r: number, g?: number }} c
 * @param {number} level
 */
export function grantStaffSpoils(pool, lock, c, level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return lock(() => pool.grant({ day: staffSpoilsDay(c.v), acct: c.s, roll: () => staffSpoilsList(c.c, lv, c.r, c.g ?? 0), text: STAFF_SPOILS_TEXT.granted() }))
    .catch((e) => console.warn('[sev] spoils', e?.message ?? e));
}
