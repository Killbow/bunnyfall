// @ts-check
// The companion cap shared by every kind of companion. Each kind registers how many of its own follow the player,
// and every path that adds a companion checks here first.

export const COMPANION_SLOTS = 3;
export const COMPANION_SLOTS_FULL = 'Your companions are full';

/** @type {Map<string, () => number>} */
const _counts = new Map();
export function registerCompanionCount(kind, count) {
  if (typeof count === 'function') _counts.set(kind, count); else _counts.delete(kind);
}
export function companionsWithYou(except = null) {
  let n = 0;
  for (const [k, f] of _counts) {
    if (k === except) continue;
    try { n += Math.max(0, Number(f()) | 0); } catch { }
  }
  return n;
}
/** @type {Map<string, () => Array<{ name: string, role?: string }>>} */
const _rosters = new Map();
export function registerCompanionRoster(kind, list) {
  if (typeof list === 'function') _rosters.set(kind, list); else _rosters.delete(kind);
}
export function companionRoster(except = null) {
  const out = [];
  for (const [k, f] of _rosters) {
    if (k === except) continue;
    try { for (const c of f() ?? []) if (c?.name) out.push({ kind: k, name: String(c.name), role: c.role ? String(c.role) : '' }); } catch { }
  }
  return out;
}
export const companionSlotFree = () => companionsWithYou() < COMPANION_SLOTS;
export function _resetCompanionSlotsForTests() { _counts.clear(); _rosters.clear(); }
