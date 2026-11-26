// @ts-check
// What a drill's haul is worth once it reaches the account service: the character's Firmament mining yield and XP, and
// the mining XP a drill earns (half what a hand-mined node pays an ore, so a drill is no better a place to level).
import { minedMaterial, HARVEST_XP_PER_TIER } from '../professionLaw.js';
import { yieldPct, xpPct, scaleQty, scaleXp } from '../firmament/firmamentLaw.js';

/** A drill ore's share of the XP a hand-mined ore gives (a node of 2 to 4 ore pays about 15 XP a tier: 5 an ore). */
export const MINE_XP_SHARE = 0.5;
const ORE_PER_NODE = 3;

/**
 * The ore a haul of `n` pays and the mining XP it earns.
 * @param {number} n the signed haul
 * @param {string} ore its material key
 * @param {Record<string, number>} stats the character's Firmament stats (`treeStats`), `{}` where closed
 * @param {number} roll a die in [0, 1) for the yield's fraction
 */
export function drillHaulPaid(n, ore, stats, roll) {
  const qty = scaleQty(n, yieldPct(stats, 'mining'), roll);
  const tier = minedMaterial(ore)?.tier ?? 0;
  const base = Math.floor((n * MINE_XP_SHARE * HARVEST_XP_PER_TIER * tier) / ORE_PER_NODE);
  return { qty, xp: tier > 0 ? scaleXp(base, xpPct(stats, 'mining')) : 0 };
}
