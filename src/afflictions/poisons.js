import { savingThrow, careerTolerance, EFFECT_FLAGS } from '../magic/spellcast.js';
import { FATIGUE_MULTIPLIER } from '../characters/statMods.js';
import { dice100 } from '../combat/formulas.js';
import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { youFeelSomewhatBadText } from './diseases.js';
import { isClassEnemyId } from '../characters/enemyBasics.js';

export const POISONS = Object.freeze({
  None: -1,
  Nux_Vomica: 128, Arsenic: 129, Moonseed: 130, Drothweed: 131,
  Somnalius: 132, Pyrrhic_Acid: 133, Magebane: 134, Thyrwort: 135,
  Indulcet: 136, Sursum: 137, Quaesto_Vil: 138, Aegrotat: 139,
});
export const POISON_START_VALUE = 128;
export const TOTAL_POISON_VARIANTS = 12;

// Timing tables are indexed by poison type minus POISON_START_VALUE.
export const MIN_MINUTES_TO_POISON = Object.freeze([4, 10, 0, 5, 0, 0, 2, 0, 2, 1, 2, 0]);
export const MAX_MINUTES_TO_POISON = Object.freeze([4, 10, 0, 10, 0, 0, 2, 0, 12, 4, 12, 0]);
export const MIN_ROUNDS_OF_POISON = Object.freeze([3, 20, 1, 5, 2, 1, 5, 1, 2, 2, 1, 5]);
export const MAX_ROUNDS_OF_POISON = Object.freeze([10, 1000, 4, 30, 10, 2, 20, 3, 6, 2, 4, 20]);

export const isDrugType = (poisonType) => poisonType >= POISONS.Indulcet && poisonType <= POISONS.Aegrotat;

export const poisonCount = (entity) =>
  (entity?.activeEffects ?? []).filter((a) => a.kind === 'poison' && !a.ended).length;

export function startPoison(target, poisonType, currentMinute, rolls = Math.random) {
  if (poisonType === POISONS.None) return null;
  // Daggerfall Unity registers no effect for a type outside the enum, so an out-of-range type starts no poison.
  if (poisonType < POISON_START_VALUE || poisonType >= POISON_START_VALUE + TOTAL_POISON_VARIANTS) return null;
  const i = poisonType - POISON_START_VALUE;
  const range = (lo, hi) => lo + Math.floor(rolls() * (hi + 1 - lo));
  // Roll both spans before the duplicate check so a refused poison still uses its rolls, as in Daggerfall Unity.
  const minutesToStart = range(MIN_MINUTES_TO_POISON[i], MAX_MINUTES_TO_POISON[i]);
  const minutesRemaining = range(MIN_ROUNDS_OF_POISON[i], MAX_ROUNDS_OF_POISON[i]);
  if (target.activeEffects?.some((a) => a.kind === 'poison' && a.poison === poisonType && !a.ended)) return null;
  const entry = {
    kind: 'poison', poison: poisonType, permanent: true,
    state: 'waiting', minutesToStart, minutesRemaining,
    lastMinute: currentMinute, statMods: {}, positiveStatsRemoved: false,
  };
  target.activeEffects = target.activeEffects || [];
  target.activeEffects.push(entry);
  return entry;
}

export function curePoisonEntry(entry) {
  entry.minutesRemaining = 0;
  entry.state = 'complete';
  entry.ended = true;
}

function incrementPoisonEffects(entry, sinks, rolls, onAlert) {
  if (entry.state === 'waiting') {
    if (--entry.minutesToStart > 0) return;
    entry.state = 'active';
  }
  // Exclusive upper bound, matching the Daggerfall Unity calls in the switch below.
  const range = (lo, hi) => lo + Math.floor(rolls() * (hi - lo));
  const mods = entry.statMods;
  const change = (stat, delta) => { mods[stat] = (mods[stat] ?? 0) + delta; };
  switch (entry.poison) {
    case POISONS.Nux_Vomica:
      if (sinks.hurt) sinks.hurt(range(2, 12));
      break;
    case POISONS.Arsenic:
      if (sinks.hurt) sinks.hurt(2);
      change('endurance', -1);
      break;
    case POISONS.Moonseed:
      if (sinks.hurt) sinks.hurt(range(1, 10));
      break;
    case POISONS.Drothweed:
      change('strength', -range(5, 10));
      change('agility', -range(1, 5));
      change('speed', -range(1, 5));
      break;
    case POISONS.Somnalius:
      if (sinks.drainFatigue) sinks.drainFatigue(range(10, 100) * FATIGUE_MULTIPLIER);
      break;
    case POISONS.Pyrrhic_Acid:
      if (sinks.hurt) sinks.hurt(range(1, 30));
      break;
    case POISONS.Magebane:
      change('willpower', -range(1, 5));
      if (sinks.drainMagicka) sinks.drainMagicka(range(5, 15));
      break;
    case POISONS.Thyrwort:
      change('willpower', -range(5, 20));
      change('personality', -range(10, 20));
      break;
    case POISONS.Indulcet:
      if (sinks.drainFatigue) sinks.drainFatigue(range(10, 100) * FATIGUE_MULTIPLIER);
      change('luck', range(4, 10));
      break;
    case POISONS.Sursum:
      change('intelligence', -range(10, 30));
      change('strength', range(5, 20));
      break;
    case POISONS.Quaesto_Vil:
      change('willpower', -range(1, 4));
      if (sinks.restoreFatigue) sinks.restoreFatigue(range(5, 10) * FATIGUE_MULTIPLIER);
      break;
    case POISONS.Aegrotat:
      change('endurance', -range(1, 5));
      if (sinks.restoreMagicka) sinks.restoreMagicka(range(5, 10));
      break;
  }
  if (onAlert) onAlert(youFeelSomewhatBadText());
  if (--entry.minutesRemaining <= 0) entry.state = 'complete';
}

function completePoison(entry) {
  if (isDrugType(entry.poison) && !entry.positiveStatsRemoved) {
    for (const k of Object.keys(entry.statMods)) if (entry.statMods[k] > 0) entry.statMods[k] = 0;
    entry.positiveStatsRemoved = true;
  }
  if (!Object.values(entry.statMods).some((v) => v < 0)) curePoisonEntry(entry);
}

export function updatePoisonEntry(entry, currentMinute, sinks, rolls = Math.random, onAlert = null) {
  if (entry.ended) return;
  if (entry.state !== 'complete') {
    let minutesPassed = currentMinute - entry.lastMinute;
    while (minutesPassed-- > 0 && entry.minutesRemaining > 0 && entry.state !== 'complete') {
      incrementPoisonEffects(entry, sinks, rolls, onAlert);
    }
    entry.lastMinute = currentMinute;
  } else {
    completePoison(entry);
  }
}

// Call before tickActiveEffects, like the disease pass.
export function updatePoisons(entity, currentMinute, sinks, rolls = Math.random, onAlert = null) {
  for (const a of entity.activeEffects ?? []) {
    if (a.kind === 'poison') updatePoisonEntry(a, currentMinute, sinks, rolls, onAlert);
  }
}

export function inflictPoison(target, poisonType, bypassResistance, { rolls = Math.random, currentMinute = 0 } = {}) {
  // Daggerfall Unity checks career immunity for every entity; classic ignored it for AI characters.
  if (careerTolerance(target.career ?? {}, EFFECT_FLAGS.Poison) === 'Immune') return null;
  if (bypassResistance || savingThrow(2, EFFECT_FLAGS.Poison, target, 0, rolls) !== 0) {
    if (target.level !== 1) return startPoison(target, poisonType, currentMinute, rolls);
  }
  return null;
}

export function rollEnemyWeaponPoison(mobileType, playerLevel, rolls = Math.random) {
  if (playerLevel <= 1) return null;
  const isClass = isClassEnemyId(mobileType) && mobileType !== MOBILE_TYPES.None;
  if (!isClass && mobileType !== MOBILE_TYPES.Orc && mobileType !== MOBILE_TYPES.Centaur && mobileType !== MOBILE_TYPES.OrcSergeant) return null;
  const chanceToPoison = mobileType === MOBILE_TYPES.Assassin ? 60 : 5;
  if (!dice100(chanceToPoison, rolls())) return null;
  return POISON_START_VALUE + Math.floor(rolls() * 8);
}
