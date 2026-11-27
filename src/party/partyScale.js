// @ts-check
// Party scaling for shared enemies; fighters are the players who struck an enemy within PARTY_FIGHT_WINDOW_MS.
// Toughness divides incoming damage instead of raising maximum health, which every client and save agree on.
// Per-enemy records live in WeakMaps, so no stream or save carries them.

import { PARTY_MAX } from '../net/wire.js';

export const PARTY_SCALE_HP_PCT = 50;
export const PARTY_SCALE_DAMAGE_PCT = 10;
export const PARTY_SCALE_EXTRA_EVERY = 2;
export const PARTY_SCALE_EXTRA_MAX = 3;
/** Matches RENOWN_ASSIST_MS in net/renownTracker.js. */
export const PARTY_FIGHT_WINDOW_MS = 30_000;
export const PARTY_ME = Symbol('me');

export const partySizeOf = (n) => (Number.isFinite(n) ? Math.max(1, Math.min(PARTY_MAX, Math.floor(n))) : 1);

export const partyToughness = (n) => 1 + (PARTY_SCALE_HP_PCT * (partySizeOf(n) - 1)) / 100;

export const partyDamageFactor = (n) => 1 + (PARTY_SCALE_DAMAGE_PCT * (partySizeOf(n) - 1)) / 100;

export const partyExtraFoes = (n) => Math.min(PARTY_SCALE_EXTRA_MAX, Math.floor((partySizeOf(n) - 1) / PARTY_SCALE_EXTRA_EVERY));

export function partyGroupMembers(types, n) {
  const own = Array.isArray(types) ? types : [];
  const out = own.slice();
  const more = partyExtraFoes(n);
  for (let k = 0; k < more && own.length; k++) out.push(own[k % own.length]);
  return out;
}

const _obj = (o) => (o && typeof o === 'object' ? o : null);

/** @type {WeakMap<object, Map<string|symbol, number>>} */
let _fighters = new WeakMap();

export function noteFighter(foe, who, now) {
  const key = _obj(foe);
  if (!key || who == null || !Number.isFinite(now)) return;
  let m = _fighters.get(key);
  if (!m) _fighters.set(key, (m = new Map()));
  m.set(who, now);
}

export function foeFighters(foe, now) {
  const key = _obj(foe);
  const m = key ? _fighters.get(key) : null;
  if (!m || !Number.isFinite(now)) return 1;
  let n = 0;
  for (const [who, at] of m) {
    if (now - at <= PARTY_FIGHT_WINDOW_MS) n++;
    else m.delete(who);
  }
  return partySizeOf(n);
}

export function foeFightersUpTo(foe, now, max) {
  const key = _obj(foe);
  const m = key ? _fighters.get(key) : null;
  if (!m || !Number.isFinite(now)) return 1;
  let n = 0;
  for (const at of m.values()) if (now - at <= PARTY_FIGHT_WINDOW_MS) n++;
  return Math.max(1, Math.min(max, n));
}

function weighDown(carry, key, amount, t) {
  const exact = amount / t + (key ? carry.get(key) ?? 0 : 0);
  // The epsilon pays a point owed to float error: 1.2 + 0.8 is 1.9999999999999998 in a double.
  const whole = Math.floor(exact + 1e-9);
  if (key) carry.set(key, Math.max(0, exact - whole));
  return whole;
}

/** @type {WeakMap<object, number>} */
let _carry = new WeakMap();
/** @type {WeakMap<object, number>} */
let _healCarry = new WeakMap();
/** @type {WeakMap<object, number>} */
let _hitCarry = new WeakMap();

export function partyFoeLoses(foe, damage, n) {
  if (!(damage > 0)) return damage;
  const t = partyToughness(n);
  if (t === 1) return damage;
  return weighDown(_carry, _obj(foe), damage, t);
}

export function partyFoeHeals(foe, amount, n) {
  if (!(amount > 0)) return amount;
  const t = partyToughness(n);
  if (t === 1) return amount;
  return weighDown(_healCarry, _obj(foe), amount, t);
}

export function partyFoeHits(damage, n, victim = null) {
  if (!(damage > 0)) return damage;
  const f = partyDamageFactor(n);
  if (f === 1) return damage;
  const key = _obj(victim);
  if (!key) return Math.round(damage * f);
  const exact = damage * f + (_hitCarry.get(key) ?? 0);
  const whole = Math.floor(exact + 1e-9);
  _hitCarry.set(key, Math.max(0, exact - whole));
  return whole;
}

/** @type {WeakMap<object, true>} */
let _whole = new WeakMap();
export function markWholeBlow(entity) { const key = _obj(entity); if (key) _whole.set(key, true); }
export function takeWholeBlow(entity) {
  const key = _obj(entity);
  if (!key || !_whole.has(key)) return false;
  _whole.delete(key);
  return true;
}

export function _resetPartyScaleForTests() {
  _fighters = new WeakMap();
  _carry = new WeakMap();
  _healCarry = new WeakMap();
  _hitCarry = new WeakMap();
  _whole = new WeakMap();
}
