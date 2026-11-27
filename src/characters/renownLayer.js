// @ts-check
// The online layer: Renown's health and magicka, added to the character's own only while it plays online.

import { renownBonus } from '../net/renown.js';
import { evenHpOf } from './levelEven.js';

export const renownHpOf = (e) => (Number.isFinite(e?.renownHp) && e.renownHp > 0 ? Math.trunc(e.renownHp) : 0);
export const spireHpOf = (e) => (Number.isFinite(e?.spireHp) && e.spireHp > 0 ? Math.trunc(e.spireHp) : 0);
export const spireBodyMax = (e) => Math.max(0, (e?.maxHealth ?? 0) - spireHpOf(e));
export const renownMpOf = (e) => (Number.isFinite(e?.renownMp) && e.renownMp > 0 ? Math.trunc(e.renownMp) : 0);
export const foldMpOf = (e) => { const v = e?._mods?.magicka; return Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0; };
export const onlineMpOf = (e) => renownMpOf(e) + foldMpOf(e);

export function keepFraction(v, from, to) {
  if (!(v > 0) || !(from > 0) || !(to >= 0) || from === to) return v;
  return Math.min(to, Math.max(1, Math.round((v * to) / from)));
}

/**
 * @param {any} entity
 * @param {number|null} level
 */
export function setRenownLayer(entity, level) {
  const r = Number.isSafeInteger(level) && level > 1 ? renownBonus(level) : { hp: 0, mp: 0 };
  if (!entity) return r;
  const online = Number.isSafeInteger(level) && level >= 1;
  _levels.set(entity, online ? level : null);
  const x = online ? _extras.get(entity) : null;
  const even = online ? evenHpOf(entity, (entity.stats?.endurance ?? NaN) + (x?.end ?? 0)) : 0;
  const b = x || even ? { hp: r.hp + (x?.hp ?? 0) + even, mp: r.mp + (x?.mp ?? 0) } : r;
  entity.evenHp = even;
  if (renownHpOf(entity) === b.hp && renownMpOf(entity) === b.mp) return b;
  const hpFrom = entity.maxHealth, mpFrom = entity.maxMagicka;
  entity.renownHp = b.hp;
  entity.renownMp = b.mp;
  if (Number.isFinite(entity.health)) entity.health = keepFraction(entity.health, hpFrom, entity.maxHealth);
  if (Number.isFinite(entity.magicka)) entity.magicka = keepFraction(entity.magicka, mpFrom, entity.maxMagicka);
  return b;
}

const _extras = new WeakMap();
const _levels = new WeakMap();
/**
 * @param {any} entity
 * @param {{ hp?: number, mp?: number, end?: number }|null} extra
 */
export function setOnlineLayerExtra(entity, extra) {
  if (!entity) return { hp: 0, mp: 0 };
  const hp = Math.max(0, Math.trunc(Number(extra?.hp) || 0)), mp = Math.max(0, Math.trunc(Number(extra?.mp) || 0));
  const end = Math.trunc(Number(extra?.end) || 0);
  if (hp || mp || end) _extras.set(entity, { hp, mp, end }); else _extras.delete(entity);
  const level = _levels.get(entity);
  return level == null ? { hp: renownHpOf(entity), mp: renownMpOf(entity) } : setRenownLayer(entity, level);
}

export function refreshOnlineLayer(entity, { keepHealth = false } = {}) {
  const level = entity ? _levels.get(entity) : null;
  if (level == null) return;
  const health = entity.health;
  setRenownLayer(entity, level);
  if (keepHealth && Number.isFinite(health)) entity.health = Math.min(health, entity.maxHealth);
}

/**
 * @param {any} entity
 * @param {number} hp
 */
export function setSpireHp(entity, hp) {
  const pts = Number.isFinite(hp) && hp > 0 ? Math.trunc(hp) : 0;
  if (!entity || !Object.getOwnPropertyDescriptor(entity, 'maxHealth')?.get) return 0;
  if (spireHpOf(entity) === pts) return pts;
  const from = entity.maxHealth;
  entity.spireHp = pts;
  if (Number.isFinite(entity.health)) entity.health = keepFraction(entity.health, from, entity.maxHealth);
  return pts;
}

/** @param {any} entity */
export function offlineVitals(entity) {
  const hp = renownHpOf(entity), mp = onlineMpOf(entity);
  const out = { health: entity?.health, magicka: entity?.magicka, maxMagicka: entity?.maxMagicka };
  if (hp) {
    const raw = Number.isFinite(entity.rawMaxHealth) ? entity.rawMaxHealth : Math.max(0, entity.maxHealth - hp);
    const lim = entity.maxHealthLimiter;
    const off = lim >= 1 && lim < raw ? lim : raw;
    out.health = keepFraction(entity.health, entity.maxHealth, off);
  }
  if (mp) {
    const off = Math.max(0, (entity.maxMagicka ?? 0) - mp);
    out.magicka = keepFraction(entity.magicka, entity.maxMagicka, off);
    out.maxMagicka = off;
  }
  return out;
}
