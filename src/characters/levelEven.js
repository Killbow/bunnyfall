// @ts-check
// The online health floor for the class average at the current Endurance. It is never saved into the stored maximum.
import { hitPointsModifier } from '../combat/formulas.js';

export const ONLINE_BONUS_POOL = 5;

export const averageLevelHp = (h, endurance) => (Math.trunc(h / 2) + h) / 2 + hitPointsModifier(endurance);

export function evenHpFloor(entity, endurance) {
  const h = entity?.career?.hitPointsPerLevel, level = entity?.level;
  if (!(h > 0) || !(level >= 1) || !Number.isFinite(endurance)) return 0;
  return Math.floor(25 + h + (Math.trunc(level) - 1) * Math.max(1, averageLevelHp(h, endurance)));
}

export function evenHpOf(entity, endurance) {
  const stored = Number.isFinite(entity?.rawMaxHealth) ? entity.rawMaxHealth : entity?.maxHealth;
  if (!Number.isFinite(stored)) return 0;
  return Math.max(0, evenHpFloor(entity, endurance) - stored);
}
