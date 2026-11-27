// @ts-check
import { effectiveLevel } from './mentorMode.js';
import { sigilRenown } from '../items/sigil.js';
import { lootRarityOn } from '../items/lootRarity.js';

export const HERO_THREAT = Object.freeze({
  level: Object.freeze({ from: 10, to: 30, damage: 1.07, health: 1.04 }),
  renown: Object.freeze({ from: 15, to: 50, damage: 1.01, health: 1.005 }),
});

const stepsOf = (v, { from, to }) => (Number.isFinite(v) ? Math.max(0, Math.min(to, Math.trunc(/** @type {number} */ (v))) - from) : 0);

/**
 * @param {number} level
 * @param {number|null} [renown]
 * @returns {{ damage: number, health: number, level: number, renown: number }}
 */
export function heroThreat(level, renown = null) {
  const L = stepsOf(level, HERO_THREAT.level), R = stepsOf(renown, HERO_THREAT.renown);
  return {
    damage: HERO_THREAT.level.damage ** L * HERO_THREAT.renown.damage ** R,
    health: HERO_THREAT.level.health ** L * HERO_THREAT.renown.health ** R,
    level: L, renown: R,
  };
}

/**
 * @param {any} player
 * @param {{ puppet?: boolean }} [o]
 * @returns {{ damage: number, health: number, level: number, renown: number } | null}
 */
export function heroThreatOf(player, { puppet = false } = {}) {
  if (!player || !lootRarityOn()) return null;
  const t = heroThreat(effectiveLevel(player), player._mentor ? null : sigilRenown());
  if (!(t.damage > 1 || t.health > 1)) return null;
  return puppet ? { ...t, health: 1 } : t;
}
