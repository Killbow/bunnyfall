// Spell absorption, ported from Daggerfall Unity's EntityEffectManager.TryAbsorption. Only Destruction effects
// absorb, the target needs magicka room for the cost, and the sources are tried in DFU's order.
import { SKILLS, skillValue } from '../characters/skills.js';
import { effectCost, effectSchool, TARGET_COST_MULT, CAST_COST_FLOOR } from './spellcost.js';

// specialAdvantages.js keeps its own copy of these values as ABSORPTION_FLAGS, so the two must stay identical.
export const SPELL_ABSORPTION = Object.freeze({ None: 0, InLight: 1, InDarkness: 2, Always: 4 });

// Departures from DFU: the item enchantment is a 50% roll, the effect chance caps at 50% (the Spell Maker
// limit), and every absorb refunds half the points. The career's Always absorption keeps 100%.
export const ABSORB_ENCHANT_CHANCE = 50;
export const SPELL_ABSORPTION_CHANCE_CAP = 50;
export const ABSORB_REFUND_SCALE = 0.5;
export const absorbRefund = (points) => Math.max(0, Math.floor((Number(points) || 0) * ABSORB_REFUND_SCALE));

export function effectCastingCost(effect, targetType, targetEntity) {
  const { sp } = effectCost(effect, (id) => skillValue(targetEntity, id));
  const scaled = Math.trunc(sp * (TARGET_COST_MULT[targetType] ?? 1.0));
  return Math.max(CAST_COST_FLOOR, scaled);
}

export function isDestructionEffect(effect) {
  return effectSchool(effect) === SKILLS.Destruction;
}

export function careerAbsorbs(career, { day = false, inside = true } = {}) {
  const flags = career?.spellAbsorptionFlags ?? SPELL_ABSORPTION.None;
  if (flags === SPELL_ABSORPTION.Always) return true;
  if (flags === SPELL_ABSORPTION.InDarkness) return inside || !day;
  if (flags === SPELL_ABSORPTION.InLight) return !inside && day;
  return false;
}

const _absorbChances = new Map();
export function registerAbsorptionChance(name, fn) { if (typeof fn === 'function') _absorbChances.set(name, fn); else _absorbChances.delete(name); }

export function tryAbsorption(effect, targetType, target, { day = false, inside = true, absorbing = false, rolls = Math.random, paid = 0 } = {}) {
  if (!effect) return 0;
  if (!isDestructionEffect(effect)) return 0;
  const cost = effectCastingCost(effect, targetType, target);
  const available = (target?.maxMagicka ?? 0) - (target?.magicka ?? 0);
  // A self-cast drinks no more than it spent, because the game prices casts with modifiers this cost leaves out.
  const drink = paid > 0 ? Math.min(cost, paid) : cost;
  if (drink > available) return 0;
  // A failed effect roll falls through to the other sources, in DFU's order.
  const chance = spellAbsorptionChance(target);
  if (chance > 0 && Math.floor(rolls() * 100) < chance) return drink;
  for (const fn of _absorbChances.values()) {
    let c = 0;
    try { c = Number(fn(target)) || 0; } catch { c = 0; }
    if (c > 0 && Math.floor(rolls() * 100) < c) return drink;
  }
  if (careerAbsorbs(target?.career, { day, inside })) return drink;
  if (absorbing && Math.floor(rolls() * 100) < ABSORB_ENCHANT_CHANCE) return drink;
  return 0;
}

// The chance uses the target's level at absorb time, as DFU's effect-based arm does. An older entry with no
// `chanceBase` uses its stored `chance`.
export function spellAbsorptionChance(target) {
  // The best live entry wins, because a gifted bundle never merges with my own, so several can be active.
  let best = 0;
  for (const a of target?.activeEffects ?? []) {
    if (a.kind !== 'spellAbsorption' || a.ended) continue;
    const per = Math.max(1, a.chancePerLevel ?? 1);
    const chance = a.chanceBase == null ? (a.chance ?? 0) : (a.chanceBase ?? 0) + (a.chanceMod ?? 0) * Math.floor((target?.level ?? 1) / per);
    if (chance > best) best = chance;
  }
  return Math.min(SPELL_ABSORPTION_CHANCE_CAP, best);
}
