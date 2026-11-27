// @ts-check
// The account Worker bundles this file, so it imports nothing client-side; courtRulesDoor.js wires the player hurt
// listener. Every natural regeneration source must go through `regenShare`, while direct healing does not.
export const REGEN_HELD_SHARE = 0.5;
export const REGEN_HELD_HURT_MS = 5000;

let _on = false;
let _now = 0;
let _hurtAt = -Infinity;
/** @type {Map<string, number>} */
const _carry = new Map();
/** @type {WeakMap<object, Map<string, number>>} */
let _bodyCarry = new WeakMap();

/**
 * Call every frame before any magic round. Turning it off drops the carried fractions but keeps the hurt clock.
 * @param {boolean} on
 * @param {number} [nowMs]
 */
export function setCourtRules(on, nowMs = performance.now()) {
  _on = !!on;
  _now = nowMs;
  if (!_on) { _carry.clear(); _bodyCarry = new WeakMap(); }
}
export function courtRulesHurt(hurt) {
  if (_on && hurt && hurt.after < hurt.before) _hurtAt = _now;
}
export function _resetCourtRulesForTests() { setCourtRules(false, 0); _hurtAt = -Infinity; }

export const regenHeldNow = () => _on;
export const regenPausedMs = () => (_on ? Math.max(0, REGEN_HELD_HURT_MS - (_now - _hurtAt)) : 0);

/**
 * Omitting `body` means the player. Other bodies keep their own carried fractions and are halved, but the player's
 * hurt never pauses them.
 * @param {number} n
 * @param {string} source
 * @param {any} [body]
 */
export function regenShare(n, source, body = null) {
  if (!_on || !(n > 0)) return n;
  const onPlayer = !body || !!body.isPlayer;
  if (onPlayer && regenPausedMs() > 0) return 0;
  let carry = _carry;
  if (!onPlayer) { carry = _bodyCarry.get(body) ?? new Map(); _bodyCarry.set(body, carry); }
  const c = (carry.get(source) ?? 0) + n * REGEN_HELD_SHARE;
  const out = Math.floor(c + 1e-9);
  carry.set(source, c - out);
  return out;
}
