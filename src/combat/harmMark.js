// @ts-check
// Records the enemy whose harm last reached the player, for deaths with no killing blow. Leaf module: no imports.

export const HARM_MARK_SPELL_MS = 30000;
export const HARM_MARK_STRUCK_MS = 120000;

export const HARM_FIGHT_MS = 30000;

/** @type {{ entity: any, until: number } | null} */
let _mark = null;
let _harmAt = null;
let _fights = new WeakMap();
let _lowAt = null;

export function markPlayerHarm(entity, { ms = HARM_MARK_SPELL_MS, now = Date.now() } = {}) {
  if (!entity || entity.isPlayer) return;
  _mark = { entity, until: now + ms };
  _harmAt = now;
  const f = _fights.get(entity);
  _fights.set(entity, { since: f && now - f.at <= HARM_FIGHT_MS ? f.since : now, at: now });
}
export function harmFightSince(entity, now = Date.now()) {
  const f = entity ? _fights.get(entity) : null;
  return f && now - f.at <= HARM_FIGHT_MS ? f.since : null;
}
// Reads the harm time, not the mark, because a struck mark lasts two minutes for revenant credit.
export const playerHarmedWithin = (ms, now = Date.now()) => _harmAt != null && now - _harmAt <= ms;
export function markPlayerLow(now = Date.now()) { _lowAt = now; }
export const playerLowSince = (since) => _lowAt != null && since != null && _lowAt >= since;
export function endPlayerFights() { _fights = new WeakMap(); _lowAt = null; _harmAt = null; }
export function playerHarmMark(now = Date.now()) {
  return _mark && now <= _mark.until ? _mark.entity : null;
}
export function clearPlayerHarm(entity = null) {
  if (!entity || _mark?.entity === entity) _mark = null;
  if (entity) _fights.delete(entity);
}
export function _resetHarmMarkForTests() { _mark = null; endPlayerFights(); }
