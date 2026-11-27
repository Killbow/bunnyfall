import { SKILLS } from '../characters/skills.js';
import { SKILL_SOFT_CAP, climbedSkill } from '../characters/skillSoftcap.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { sigilDueling } from '../items/sigil.js';

export const DESTRUCTION_POTENCY_PER_POINT = 0.01;
export const SCHOOL_POTENCY_PER_POINT = DESTRUCTION_POTENCY_PER_POINT;

// Refereed fights strike player stubs (combat/duelCombat.js duelStub) that carry isPlayer, so they stay unaffected.
export const ownSpellAt = (caster, target) => !!caster?.isPlayer && !caster.peer && !!target && !target.isPlayer;
export const ownSpellOnSelf = (caster, target) => !!caster?.isPlayer && !caster.peer && caster === target && !sigilDueling();

// Uses the climbed skill, which enemy scaling also reads, so the climb that strengthens enemies also pays.
export function schoolPotency(caster, { online = isOnlinePage(), school = SKILLS.Destruction } = {}) {
  if (!online || !caster?.isPlayer || caster._mentor) return 1;
  const climbed = climbedSkill(caster, school);
  return climbed > SKILL_SOFT_CAP ? 1 + (climbed - SKILL_SOFT_CAP) * SCHOOL_POTENCY_PER_POINT : 1;
}

export function schoolMult(caster, target, school, { self = false, ...opts } = {}) {
  if (!(self ? ownSpellOnSelf(caster, target) : ownSpellAt(caster, target))) return 1;
  return schoolPotency(caster, { ...opts, school });
}

const _power = new Map();
const _pierce = new Map();
export const SPELL_POWER_FLOOR = 0.5;
export function registerSpellPowerMod(name, fn) { if (typeof fn === 'function') _power.set(name, fn); else _power.delete(name); }
export function registerSpellPierceMod(name, fn) { if (typeof fn === 'function') _pierce.set(name, fn); else _pierce.delete(name); }

export function spellPowerMult(caster, target, opts = {}) {
  if (!ownSpellAt(caster, target)) return 1;
  let pct = 0;
  for (const fn of _power.values()) {
    const v = fn(caster, target);
    // A modifier may return a negative percent (a keystone's cost); SPELL_POWER_FLOOR bounds the total.
    if (Number.isFinite(v) && v !== 0) pct += v;
  }
  return schoolPotency(caster, opts) * Math.max(SPELL_POWER_FLOOR, 1 + pct / 100);
}

// The info object's `foe` is null for a relay stand-in, whose body the relay holds.
const _landed = new Map();
export function registerSpellLandedListener(name, fn) { if (typeof fn === 'function') _landed.set(name, fn); else _landed.delete(name); }
export function tellSpellLanded(info) {
  for (const fn of _landed.values()) { try { fn(info); } catch { } }
}

export function spellPierce(caster, target) {
  if (!ownSpellAt(caster, target)) return 0;
  let n = 0;
  for (const fn of _pierce.values()) {
    const v = fn(caster, target);
    if (Number.isFinite(v) && v > 0) n += v;
  }
  return n;
}
