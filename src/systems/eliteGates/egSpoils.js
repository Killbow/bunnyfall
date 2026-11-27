// @ts-check
import { seededRng } from '../../weather/wind.js';
import { spoilsBase, magicOrBetter, sigilStone, SPOILS_SOURCE } from '../../worldEvents/gateSpoils.js';
import { applyRarity, lastPass, socketPass, weaponSocketPass, techniquePass } from '../../items/lootRarity.js';
import { bossGems } from '../../items/gems.js';
import { bossCardRoll } from '../../cards/bossCards.js';
import { mintPanoplyPiece } from '../../items/aetheric.js';
import { egLordArm } from './egLordArms.js';
import { RANDOM_TREASURE_ICONS } from '../../items/loot.js';
import { egSpoilsPasses, egPassSeed, egPanoplyHit, egLegendaryShare, EG_LORD_ARM_IN } from '../../net/eliteGates/egPay.js';
import { egPanoplyDraw, egPanoplyIn } from '../../net/eliteGates/egPay.js';

export const EG_SPOILS_GOLD_PER_LEVEL = 200;
export const EG_SPOILS_GOLD_STEP = 0.1;
export const EG_SPOILS_GOLD_MAX = 3;
export const EG_SPOILS_KEYS = Object.freeze({ store: 'eg.spoils', day: 'eg.spoilsDay' });
export const EG_SPOILS_RECORDS_MAX = 12;
export const EG_SPOILS_TEXT = Object.freeze({
  spilled: "The Redoubt's spoils spill from the beacon.",
  gathered: "The Redoubt's spoils are in your pack.",
  granted: (w) => `Your spoils from Redoubt ${w} are in your pack.`,
  goldOnly: (w) => `You already took Redoubt ${w} this week. You get its gold, and each of its Reliquaries gives 20 lumen.`,
  opened: (n) => (n === 1 ? 'Your Reliquary opens: its spoils are in your pack.' : `Your ${n} Reliquaries open: their spoils are in your pack.`),
  guest: 'Add a username to keep the Spire\'s spoils. Its gold is yours.',
  recovered: "The Spire's spoils are in your pack.",
});
export const egSpoilsDay = (b, w) => `eg:${b}:${w}`;
export function egSpoilsOf(day) {
  const m = typeof day === 'string' ? /^eg:([0-9a-f]{16}):(\d{1,5})$/.exec(day) : null;
  return m ? { b: m[1], w: Number(m[2]) } : null;
}

function graded(item, tier, rolls) {
  applyRarity(item, tier, rolls);
  item.isIdentified = true;
  return { item, tier: item.rarity ?? tier };
}
export const egSpoilsGold = (lv, w) => EG_SPOILS_GOLD_PER_LEVEL * Math.max(1, lv) * Math.min(EG_SPOILS_GOLD_MAX, 1 + EG_SPOILS_GOLD_STEP * (Math.max(1, w | 0) - 1));

/**
 * @param {number} seed
 * @param {number} lv
 * @param {number} w
 * @param {{ lord?: string, panoply: boolean }} o
 */
function rollPass(seed, lv, w, o) {
  const rolls = seededRng(seed >>> 0);
  const gold = Math.round(egSpoilsGold(lv, w) * (0.8 + 0.4 * rolls()));
  const pieces = [];
  pieces.push(graded(spoilsBase(lv, rolls), rolls() < egLegendaryShare(w) ? 'legendary' : 'rare', rolls));
  const more = 1 + Math.min(2, Math.floor(rolls() * 3));
  for (let i = 0; i < more; i++) pieces.push(graded(spoilsBase(lv, rolls), magicOrBetter(rolls, SPOILS_SOURCE), rolls));
  // The piece choice always takes one draw, even with no Panoply piece, so later draws stay aligned.
  const which = rolls();
  if (o.panoply) { const p = mintPanoplyPiece(() => which); if (p) pieces.push({ item: p, tier: p.rarity }); }
  // The named-legendary check always takes one draw; the item's own draws run only when it comes.
  const named = rolls() * EG_LORD_ARM_IN < 1 && o.lord ? egLordArm(o.lord, lv, rolls) : null;
  if (named) pieces.push({ item: named, tier: named.rarity });
  lastPass(pieces.map((p) => p.item), rolls);
  const card = o.lord ? bossCardRoll(o.lord, rolls) : null;
  socketPass(pieces.map((p) => p.item), rolls);
  weaponSocketPass(pieces.map((p) => p.item), rolls);
  const gems = bossGems('gate', rolls);
  techniquePass(pieces.map((p) => p.item), rolls);
  return { gold, pieces, card, gems };
}

/**
 * @param {number} seed
 * @param {number} level
 * @param {number} w
 * @param {{ lord?: string, pity?: number[], goldOnly?: boolean }} [o]
 */
export function rollEgSpoils(seed, level, w, { lord = '', pity = [], goldOnly = false } = {}) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const passes = [];
  for (let p = 0; p < egSpoilsPasses(w); p++) {
    if (goldOnly) { const r = seededRng(egPassSeed(seed, p)); passes.push({ gold: Math.round(egSpoilsGold(lv, w) * (0.8 + 0.4 * r())), pieces: [], card: null, gems: [] }); continue; }
    passes.push(rollPass(egPassSeed(seed, p), lv, w, { lord, panoply: pity.includes(p) || egPanoplyHit(seed >>> 0, w, p) }));
  }
  return passes;
}

/**
 * @param {number} seed
 * @param {number} level
 * @param {number} w
 * @param {{ lord?: string, pity?: number[], goldOnly?: boolean, embers?: number }} [o]
 */
export function egSpoilsList(seed, level, w, o = {}) {
  return dressed(seed, rollEgSpoils(seed, level, w, o), o.goldOnly ? null : egEmberStack(o.embers));
}
// The most `egEmbersOf` pays at any Redoubt a receipt allows (at most 19,999).
export const EG_EMBERS_MAX = 2001;
export const egEmberStack = (n) => (Number.isSafeInteger(n) && n > 0 ? Object.assign(sigilStone(), { stackCount: Math.min(n, EG_EMBERS_MAX) }) : null);
// Spoils roll on the service's `seed`, not the receipt's `c`, which the page could read and roll ahead; `c` is used
// only when the service keeps no row.
export const egSpoilsSeedOf = (c, d) => (Number.isSafeInteger(d?.seed) && d.seed >= 0 ? d.seed >>> 0 : (c?.c ?? 0) >>> 0);
function dressed(seed, passes, embers = null) {
  const look = seededRng(((seed >>> 0) ^ 0x5eed) >>> 0);
  const flat = () => RANDOM_TREASURE_ICONS[Math.floor(look() * RANDOM_TREASURE_ICONS.length)];
  const out = [];
  for (const s of passes) {
    for (const p of s.pieces) out.push({ kind: 'item', item: p.item, tier: p.tier, record: flat() });
    const gold = { kind: 'gold', gold: s.gold, tier: 'common', record: flat() };
    if (s.card) out.push({ kind: 'item', item: s.card, tier: 'aetheric', record: flat() });
    for (const g of s.gems) out.push({ kind: 'item', item: g, tier: 'common', record: flat() });
    out.push(gold);
  }
  if (embers) out.push({ kind: 'item', item: embers, tier: 'artifact', record: flat() });
  return out;
}

export const EG_RELIQUARY_PANOPLY_X = 2;
// Matches the 64-entry `rl` trim (`m.rel.slice(0, 64)`) in `egBrain.js`.
export const EG_RELIQUARIES_MAX = 64;
export const egReliquarySeed = (seed, i) => egPassSeed(seed >>> 0, 16 + i);
export const egReliquaryPanoply = (seed, w, i) => egPanoplyDraw(seed >>> 0, 16 + i) * egPanoplyIn(w) < EG_RELIQUARY_PANOPLY_X;
export const egReliquaryDay = (b) => `eg:${b}:rl`;
/**
 * @param {number} seed
 * @param {number} level
 * @param {number[]} rl
 */
export function egReliquaryList(seed, level, rl) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const ws = (Array.isArray(rl) ? rl : []).filter((w) => Number.isSafeInteger(w) && w >= 1).slice(0, EG_RELIQUARIES_MAX);
  return dressed(egReliquarySeed(seed, 0xffff), ws.map((w, i) => rollPass(egReliquarySeed(seed, i), lv, w, { panoply: egReliquaryPanoply(seed, w, i) })));
}
/**
 * @param {any} c
 * @param {any} d
 * @param {number} level
 */
export function egReliquaryGrant(c, d, level) {
  if (c?.q !== 'x' || !Number.isSafeInteger(c.c) || typeof c.b !== 'string') return null;
  const rl = (Array.isArray(d?.rl) ? d.rl : []).filter((w) => Number.isSafeInteger(w) && w >= 1).slice(0, EG_RELIQUARIES_MAX);
  if (!rl.length) return null;
  const seed = egSpoilsSeedOf(c, d);
  return { day: egReliquaryDay(c.b), roll: () => egReliquaryList(seed, level, rl), text: EG_SPOILS_TEXT.opened(rl.length), n: rl.length };
}
