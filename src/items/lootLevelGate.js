// @ts-check
// Scales the Rare and Legendary thresholds by the roller's level.
// Never state these levels, factors, or chances in player-facing text, patch notes, or release notes.

export const RARE_GATE = Object.freeze({ floor: 0.15, holdTo: 7, fullAt: 12 });
export const LEGENDARY_GATE = Object.freeze({ floor: 0.05, holdTo: 9, step: 0.25, fullAt: 15 });
export const DROUGHT_FROM = 10;

const lv = (level) => Math.max(1, Math.floor(Number(level) || 1));

export function rareGate(level) {
  const L = lv(level);
  const g = RARE_GATE;
  if (L <= g.holdTo) return g.floor;
  if (L >= g.fullAt) return 1;
  return g.floor + ((1 - g.floor) * (L - g.holdTo)) / (g.fullAt - g.holdTo);
}

export function legendaryGate(level) {
  const L = lv(level);
  const g = LEGENDARY_GATE;
  if (L <= g.holdTo) return g.floor;
  if (L >= g.fullAt) return 1;
  return g.step + ((1 - g.step) * (L - g.holdTo - 1)) / (g.fullAt - g.holdTo - 1);
}

export function gateLevel(level) {
  const v = Number(level);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export const droughtHeld = (level) => gateLevel(level) != null && lv(level) < DROUGHT_FROM;

let _level = null;
let _scoped = null;
export function registerRollerLevel(fn) { _level = typeof fn === 'function' ? fn : null; }
// Shared room rolls run inside this scope at the room's level, so every client gets the same result.
export function withRollerLevel(level, fn) {
  const was = _scoped;
  _scoped = { level: gateLevel(level) };
  let out;
  try { out = fn(); } finally { _scoped = was; }
  if (out && typeof out.then === 'function') throw new TypeError('withRollerLevel: the body must be synchronous');
  return out;
}
export function rollerLevel() {
  if (_scoped) return _scoped.level;
  if (!_level) return null;
  try { return gateLevel(_level()); } catch { return null; }
}
