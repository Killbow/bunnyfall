// @ts-check
// A zero-import leaf: other modules register multipliers here so the damage formulas read them without a cycle.

/** @typedef {{ kind?: 'melee'|'arrow'|'spell', element?: number|null }} BlowTakenInfo */

/** @type {Map<string, (attacker: any, target: any, weapon: any, info: BlowTakenInfo) => number>} */
const _mods = new Map();

export function registerBlowTakenMod(name, fn) { if (typeof fn === 'function') _mods.set(name, fn); else _mods.delete(name); }

export function blowTakenScale(attacker, target, weapon = null, info = {}) {
  let k = 1;
  for (const fn of _mods.values()) {
    try { const m = fn(attacker, target, weapon, info ?? {}); if (Number.isFinite(m) && m > 0) k *= m; } catch { }
  }
  return k;
}

export function blowTaken(damage, attacker, target, weapon = null, info = {}) {
  if (!(damage > 0)) return damage;
  const k = blowTakenScale(attacker, target, weapon, info);
  return k === 1 ? damage : Math.max(1, Math.round(damage * k));
}

export const blowTakenNames = () => [..._mods.keys()];
