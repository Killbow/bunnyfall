// @ts-check

const _listeners = new Map();
export function registerPlayerKillListener(name, fn) { if (typeof fn === 'function') _listeners.set(name, fn); else _listeners.delete(name); }
export function reportPlayerKill(entity, info = {}) {
  const kind = typeof info?.kind === 'string' ? info.kind : 'melee';
  for (const fn of _listeners.values()) { try { fn(entity, { kind }); } catch { } }
}
