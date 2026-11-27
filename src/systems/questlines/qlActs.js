// @ts-check
export const ACT_KINDS = Object.freeze({
  'fish-caught': 'gather',
  'herb-gathered': 'gather',
  'ore-mined': 'gather',
  'wood-chopped': 'gather',
  'piece-crafted': 'make',
  'gem-socketed': 'loot',
  'piece-reforged': 'loot',
  'gambit-won': 'tavern',
  'cards-won': 'tavern',
  'port-reached': 'sea',
  'cargo-delivered': 'sea',
  'ship-struck': 'sea',
  'raid-repelled': 'world',
  'arena-won': 'world',
  'revenant-knelt': 'world',
  'star-taken': 'world',
  'wyrd-met': 'world',
  'rite-broken': 'endgame',
  'breach-closed': 'endgame',
  'elite-foe-slain': 'endgame',
  'redoubt-taken': 'endgame',
  'valkynaz-felled': 'endgame',
  'hour-broken': 'endgame',
  'serpent-slain': 'endgame',
  'star-held': 'endgame',
  'heart-star-held': 'endgame',
  'ketch-boarded': 'endgame',
  'ketch-cell-banked': 'endgame',
  'warden-felled': 'endgame',
});
export const ACT_IDS = Object.freeze(Object.keys(ACT_KINDS));

let _sink = null;
export function setActSink(fn) { _sink = typeof fn === 'function' ? fn : null; }

const _hearers = new Map();
export function hearActs(name, fn) { if (typeof fn === 'function') _hearers.set(name, fn); else _hearers.delete(name); }

export function noteAct(kind, n = 1) {
  if (!Object.hasOwn(ACT_KINDS, kind)) { console.warn(`[questlines] no act "${kind}"`); return 0; }
  const count = Math.floor(Number(n) || 0);
  if (count > 0) for (const fn of _hearers.values()) { try { fn(kind, count); } catch (e) { console.warn(`[questlines] a hearer of "${kind}" threw (${e?.message ?? e})`); } }
  if (count <= 0 || !_sink) return 0;
  try { return _sink(kind, count) | 0; } catch (e) { console.warn(`[questlines] the act "${kind}" was not heard (${e?.message ?? e})`); return 0; }
}
