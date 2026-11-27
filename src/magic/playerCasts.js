// @ts-check
// Player cast listeners: the cast engine reports each released player spell with the magicka it spent.
// This module imports nothing, so the cast engine can import it without a cycle.

const _listeners = new Map();
export function registerPlayerCastListener(name, fn) { if (typeof fn === 'function') _listeners.set(name, fn); else _listeners.delete(name); }
export function tellPlayerCast(entity, spell, cost = 0) {
  const spent = Number.isFinite(cost) && cost > 0 ? cost : 0;
  for (const fn of _listeners.values()) { try { fn(entity, spell, spent); } catch {} }
}
