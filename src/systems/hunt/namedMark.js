// @ts-check
// A named mark is derived from the week and tier, so a peer reads it from the existing enemy record (`t` and `bt`)
// and the wire carries nothing extra.
import { BOUNTY_TIERS } from '../../guilds/bountyBoard.js';
import { huntMarkOf, huntMarkSeed, huntWeekAt, HUNT_MARK_NAMES } from '../../net/huntLaw.js';
import { rollBossTraits, bossTraitMask } from '../../characters/bossTraits.js';
import { eliteRng } from '../../characters/eliteFoes.js';
import { trophyTitle } from './trophies.js';

export const HUNT_MARK_TRAITS = 2;
export const huntMarkTraits = (/** @type {number} */ week, /** @type {number} */ tier) => rollBossTraits(HUNT_MARK_TRAITS, eliteRng(huntMarkSeed(week, tier)));

/**
 * Checks this week and then last week, so a mark spawned before the week turns is still recognized after it.
 * @param {number} mobileType
 * @param {unknown} mask
 * @param {number} nowMs
 */
export function huntMarkSeen(mobileType, mask, nowMs) {
  const week = huntWeekAt(nowMs);
  for (const w of [week, week - 1]) {
    for (const [tier, row] of BOUNTY_TIERS.entries()) {
      if (!row.foes.includes(mobileType)) continue;
      const { foe, name } = huntMarkOf(w, row.min);
      if (foe !== mobileType || bossTraitMask(huntMarkTraits(w, tier)) !== mask) continue;
      const nameIndex = HUNT_MARK_NAMES.indexOf(name);
      return { week: w, tier, foe, nameIndex, title: trophyTitle(foe, nameIndex) };
    }
  }
  return null;
}
