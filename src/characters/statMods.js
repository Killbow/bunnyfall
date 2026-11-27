// Attribute stat-mod layer with drains. Standalone, so effects and combat formulas read a live stat cycle-free.

import { mentoredStat } from './mentorMode.js';
export const STAT_KEYS_ORDER = Object.freeze([
  'strength', 'intelligence', 'willpower', 'agility',
  'endurance', 'personality', 'speed', 'luck',
]);

export const MAX_STAT_VALUE = 100;

export function liveStat(entity, statName, skipKind = null, skipFold = null) {
  const base = mentoredStat(entity, statName, entity.stats?.[statName] ?? 0);
  let mod = 0;
  let maxMod = 0;
  let survival = 0;
  let curse = 0;
  const list = entity.activeEffects;
  if (list) {
    for (const a of list) {
      if (skipKind != null && a?.kind === skipKind) continue;
      if (a?.statMaxMods && !a.ended) maxMod += a.statMaxMods[statName] ?? 0;
      if (a.kind === 'disease' || a.kind === 'poison') { mod += a.statMods?.[statName] ?? 0; continue; }
      if (a.kind === 'racialOverride') {
        const v = a.ended ? 0 : a.statMods?.[statName] ?? 0;
        if (v < 0) curse += v; else mod += v;
        continue;
      }
      if (a.kind === 'artifact') { if (!a.ended) mod += a.statMods?.[statName] ?? 0; continue; }
      if (a.kind === 'survival') { survival += a.statMods?.[statName] ?? 0; continue; }
      if (a.stat !== statName) continue;
      if (a.kind === 'fortifyAttribute') mod += a.magnitude;
      else if (a.kind === 'drainAttribute' || a.kind === 'transferAttribute') mod -= a.magnitude;
    }
  }
  mod += entity._mods?.stats?.[statName] ?? 0;
  if (skipFold != null) mod -= entity._mods?.statFolds?.[skipFold]?.[statName] ?? 0;
  maxMod += entity._mods?.statMax?.[statName] ?? 0;
  // A vampire's daytime penalty stops at a live 1, because a live 0 is death.
  if (curse < 0) curse = -Math.min(-curse, Math.max(0, Math.min(Math.max(base + mod, 0), MAX_STAT_VALUE) - 1));
  mod += curse;
  if (survival < 0) survival = -Math.min(-survival, Math.max(0, Math.min(base, Math.min(Math.max(base + mod, 0), MAX_STAT_VALUE)) - 5));
  mod += survival;
  return Math.min(Math.max(base + mod, 0), MAX_STAT_VALUE + maxMod);
}

export function increaseDrainMagnitude(target, entry, amount) {
  const permanentValue = target.stats?.[entry.stat] ?? 0;
  if (permanentValue - (entry.magnitude + amount) < 1) entry.magnitude = permanentValue - 1;
  else entry.magnitude += amount;
}

export const REFRESH_MODS_DELAY = 0.2;

/**
 * @param {object} entity
 * @param {object} sinks
 * @param {number} dt
 * @returns {boolean}
 */
export function killIfAnyLiveStatZero(entity, sinks, dt = 0) {
  if (!entity) return false;
  entity._refreshModsTimer = (entity._refreshModsTimer ?? 0) + (Number(dt) || 0);
  if (!(entity._refreshModsTimer > REFRESH_MODS_DELAY)) return false;
  entity._refreshModsTimer = 0;
  if ((entity.health ?? 0) <= 0) return false;
  for (const stat of STAT_KEYS_ORDER) {
    if (entity.stats?.[stat] == null) continue;
    if (liveStat(entity, stat) !== 0) continue;
    sinks?.hurt?.(entity.health, { whole: true });
    return true;
  }
  return false;
}

export const FATIGUE_MULTIPLIER = 64;

export function maxFatigue(entity) {
  return (liveStat(entity, 'strength') + liveStat(entity, 'endurance')) * FATIGUE_MULTIPLIER;
}
export const clampFatigue = (entity, v) => Math.max(0, Math.min(maxFatigue(entity), v));

export function fillVitalSigns(entity) {
  if (!entity) return;
  entity.health = entity.maxHealth ?? entity.health;
  entity.fatigue = maxFatigue(entity);
  entity.magicka = entity.maxMagicka ?? entity.magicka;
}

export function maxBreath(entity) {
  return Math.trunc(liveStat(entity, 'endurance') / 2);
}

export const FATIGUE_LOSS = Object.freeze({
  Default: 11, Climbing: 22, Running: 88, Swimming: 44, Jumping: 11,
});

export const FATIGUE_DRAIN_SCALE = 0.75;
