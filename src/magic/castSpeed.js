// Spell cast animation rate from the caster's live Speed plus registered loot modifiers, read by both the classic
// hands and the Morrowind arm. A leaf that imports only statMods, so combat and systems modules avoid a cycle.

import { liveStat, MAX_STAT_VALUE } from '../characters/statMods.js';

export const CAST_SPEED_PIVOT = 50;
export const CAST_SPEED_SPAN = 200;
export const CAST_RATE_MIN = 0.5;
export const CAST_RATE_MAX = 2;

const _mods = new Map();
export function registerCastSpeedMod(name, fn) { if (typeof fn === 'function') _mods.set(name, fn); else _mods.delete(name); }

export function speedCastRate(speed) {
  const s = Math.min(MAX_STAT_VALUE, Math.max(0, Number.isFinite(speed) ? speed : CAST_SPEED_PIVOT));
  return 1 + (s - CAST_SPEED_PIVOT) / CAST_SPEED_SPAN;
}

export function castRate(entity) {
  if (!entity) return 1;
  let r = speedCastRate(liveStat(entity, 'speed'));
  for (const fn of _mods.values()) {
    const pct = fn(entity);
    if (Number.isFinite(pct)) r += pct / 100;
  }
  return Math.min(CAST_RATE_MAX, Math.max(CAST_RATE_MIN, r));
}

export const validCastRate = (rate) => (Number.isFinite(rate) && rate > 0 ? Math.min(CAST_RATE_MAX, Math.max(CAST_RATE_MIN, rate)) : 1);
