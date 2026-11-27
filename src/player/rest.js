import { liveStat, maxFatigue } from '../characters/statMods.js';
import { skillValue, SKILLS } from '../characters/skills.js';
import { healingRateModifier } from '../combat/formulas.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { localizedText, t } from '../ui/textManager.js';

export const SPECIAL_ABILITY = Object.freeze({
  AcuteHearing: 1, Athleticism: 2, AdrenalineRush: 4,
  NoRegenSpellPoints: 8, SunDamage: 16, HolyDamage: 32,
});
export const RAPID_HEALING = Object.freeze({ None: 0, InLight: 1, InDarkness: 2, Always: 4 });

export const hasSpecialAbility = (career, flag) =>
  ((career?.abilityFlagsAndSpellPointsBitfield ?? 0) & flag) === flag;

export { healingRateModifier };

export function healthRecoveryRate(entity, { day = false, inside = true } = {}) {
  let medical = skillValue(entity, SKILLS.Medical);
  const rapid = entity.career?.rapidHealing ?? 0;
  let add = 60;
  if (rapid === RAPID_HEALING.Always) add = 100;
  else if (day && !inside) {
    if (rapid === RAPID_HEALING.InLight) add = 100;
  } else if (rapid === RAPID_HEALING.InDarkness) {
    add = 100;
  }
  medical += add;
  return Math.max(Math.floor(healingRateModifier(liveStat(entity, 'endurance')) + medical * (entity.maxHealth ?? 0) / 1000), 1);
}

export const fatigueRecoveryRate = (maxFat) => Math.max(Math.floor(maxFat / 8), 1);

export const restIgnoresNoRegen = () => isOnlinePage();

export function spellPointRecoveryRate(entity) {
  if (hasSpecialAbility(entity.career, SPECIAL_ABILITY.NoRegenSpellPoints) && !restIgnoresNoRegen()) return 0;
  return Math.max(Math.floor((entity.maxMagicka ?? 0) / 8), 1);
}

export const EXHAUSTED_SAFE_TEXT_ID = 1071;
export const EXHAUSTED_IN_WATER = 'Fatigue overcomes you and sends you to a watery grave....';
export const exhaustedInWaterText = () => localizedText('exhaustedInWater', EXHAUSTED_IN_WATER);
export const EXHAUSTED_SPENT_SHARE = 0.1;
export const EXHAUSTED_SWIMMING_LINE = 'You are too exhausted to swim. Get out of the water!';
export const EXHAUSTED_FIGHTING_LINE = 'You are too exhausted to fight. Get clear and rest!';
export const exhaustedFightingText = () => t('rest.exhausted.fighting', EXHAUSTED_FIGHTING_LINE);
const spentDamage = (entity) => Math.max(1, Math.ceil((entity?.maxHealth ?? 0) * EXHAUSTED_SPENT_SHARE));

export function exhaustionOutcome({ enemiesNearby = false, swimming = false, entity, day = false, inside = true }) {
  if (swimming) {
    return { kind: 'drown', damage: spentDamage(entity), line: EXHAUSTED_SWIMMING_LINE, textId: null, inWater: true };
  }
  if (!enemiesNearby && !swimming) {
    return {
      kind: 'rest',
      textId: EXHAUSTED_SAFE_TEXT_ID,
      health: healthRecoveryRate(entity, { day, inside }),
      fatigue: fatigueRecoveryRate(maxFatigue(entity)),
      magicka: spellPointRecoveryRate(entity),
    };
  }
  return { kind: 'spent', damage: spentDamage(entity), line: exhaustedFightingText(), textId: null, inWater: false };
}
