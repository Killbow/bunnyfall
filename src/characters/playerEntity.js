// The shared player entity. Initial values are the pre-chargen state; chargen mutates it in place.
import { SKILL_COUNT, SKILLS_RECENTLY_RAISED_WORDS } from './skills.js';
import { SOCIAL_GROUP_COUNT } from '../formats/factionFile.js';
import { pageHas } from '../platform/pageQuery.js';
import { openGuardCeiling, closeGuardCeiling } from './powerCeiling.js';

export const playerEntity = {
  isPlayer: true,
  race: 'Breton',
  raceId: 1,
  faceIndex: 0,
  gender: 'male',
  level: 1,
  reflexes: 2,
  maxHealth: 50,
  health: 50,
  armor: 0,
  // The 7-part armor table: 100 each means no armor, and equipping subtracts the item's armor value times 5.
  armorValues: [100, 100, 100, 100, 100, 100, 100],
  skills: 30,
  stats: { strength: 50, agility: 50, luck: 50 },
  fatigue: 3200,
  items: [],
  // A pre-chargen entity needs skillUses: skill tallies return early without it.
  skillUses: new Array(SKILL_COUNT).fill(0),
  skillsRecentlyRaised: new Array(SKILLS_RECENTLY_RAISED_WORDS).fill(0),
  reactionMods: new Array(SOCIAL_GROUP_COUNT).fill(0),

};

export function surfacePlayer() {
  if (typeof window === 'undefined') return;
  if (pageHas('shot')) window.__playerEntity = playerEntity;
  else if ('__playerEntity' in window) delete window.__playerEntity;
}

let _deathPresenter = null;

export function setDeathPresenter(fn) {
  const prev = _deathPresenter;
  _deathPresenter = fn ?? null;
  return prev;
}

export function presentPlayerDeath(entity = playerEntity) {
  if (!(entity.health <= 0)) return false;
  hearDeath(entity);
  _deathPresenter?.(entity);
  return true;
}

const _deathListeners = new Map();

export function setDeathListener(key, fn) {
  if (fn) _deathListeners.set(key, fn);
  else _deathListeners.delete(key);
}
function hearDeath(entity) {
  for (const [key, fn] of _deathListeners) {
    try { fn(entity); } catch (e) { console.error(`[death] the ${key} listener failed:`, e?.message ?? e); }
  }
}

let _avoidDeathHook = null;

export function setAvoidDeathHook(fn) {
  const prev = _avoidDeathHook;
  _avoidDeathHook = fn ?? null;
  return prev;
}

const _shieldSoaks = new Map();
function shieldSoakOf(entity, a) {
  let k = 1;
  for (const fn of _shieldSoaks.values()) { try { const v = fn(entity, a); if (Number.isFinite(v) && v > 1) k *= v; } catch { } }
  return k;
}
export function damageShieldPool(entity, dmg) {
  for (const a of entity?.activeEffects ?? []) {
    if (a.kind !== 'shield' || a.ended) continue;
    if (!(a.shieldRemaining > 0)) continue;
    const k = _shieldSoaks.size ? shieldSoakOf(entity, a) : 1;
    a.shieldRemaining -= k === 1 ? dmg : dmg / k;
    if (a.shieldRemaining <= 0) {
      const overflow = Math.abs(a.shieldRemaining);
      a.shieldRemaining = 0;
      a.ended = true;
      a.roundsRemaining = 0;
      return k === 1 ? overflow : Math.round(overflow * k);
    }
    return 0;
  }
  return dmg;
}

let _damageVeto = null;
const _staff = { god: false, fly: false };
let _frozenUntil = 0;
export function setStaffFrozen(/** @type {unknown} */ until) { _frozenUntil = Number.isSafeInteger(until) && /** @type {number} */ (until) > 0 ? /** @type {number} */ (until) : 0; }
export const staffFrozen = (nowS = Date.now() / 1000) => _frozenUntil > nowS;
export function registerPlayerDamageVeto(fn) { _damageVeto = typeof fn === 'function' ? fn : null; }
export const playerDamageWithheld = () => { if (_staff.god || staffFrozen()) return true; try { return !!_damageVeto?.(); } catch { return false; } };

export function setStaffPowers({ god, fly } = {}) { if (typeof god === 'boolean') _staff.god = god; if (typeof fly === 'boolean') _staff.fly = fly; }
export const staffPowers = () => ({ ..._staff });
export const staffFly = () => _staff.fly;
let _levitateWard = null;
export function registerLevitateWard(fn) { _levitateWard = typeof fn === 'function' ? fn : null; }
export const levitateWarded = () => { try { return !!_levitateWard?.(); } catch { return false; } };
let _freeFlight = null;
export function registerFreeFlight(fn) { _freeFlight = typeof fn === 'function' ? fn : null; }
export const freeFlight = () => { try { return !!_freeFlight?.(); } catch { return false; } };

let _duelFell = null;
export function registerDuelFell(fn) { _duelFell = typeof fn === 'function' ? fn : null; }
export const duelSpare = (entity) => { _duelFell?.(entity); };

const _damageMods = new Map();
const _deathSaves = new Map();
const _hurtListeners = new Map();
const namedRegistry = (map) => (name, fn) => { if (typeof fn === 'function') map.set(name, fn); else map.delete(name); };
export const registerPlayerDamageMod = namedRegistry(_damageMods);
export const registerPlayerDeathSave = namedRegistry(_deathSaves);
export const registerPlayerHurtListener = namedRegistry(_hurtListeners);
const _holds = new Map();
export const registerPlayerHold = namedRegistry(_holds);
export const playerHeld = () => { for (const fn of _holds.values()) { try { if (fn()) return true; } catch { } } return false; };
export const registerShieldSoakMod = namedRegistry(_shieldSoaks);
const _doorOpen = new Map();
export const registerPlayerDoorOpen = namedRegistry(_doorOpen);
function tellDoorOpen(entity) {
  for (const fn of _doorOpen.values()) { try { fn(entity); } catch { } }
}
export function playerBlowCameToNothing(entity) { tellDoorOpen(entity); }
let _foeBlow = () => false;
export function setFoeBlowProbe(fn) { _foeBlow = typeof fn === 'function' ? fn : () => false; }
const _evasions = new Map();
export const registerPlayerBlowEvasion = namedRegistry(_evasions);
function playerBlowEvaded(entity) {
  for (const fn of _evasions.values()) { try { if (fn(entity) === true) return true; } catch { } }
  return false;
}
export function playerDamageMods(entity, dmg) {
  let d = dmg;
  const was = openGuardCeiling();
  try {
    for (const fn of _damageMods.values()) {
      try { const n = fn(entity, d); if (Number.isFinite(n)) d = Math.max(0, n); } catch { }
    }
  } finally { closeGuardCeiling(was); }
  return d;
}
function playerDeathSaved(entity, dmg) {
  for (const fn of _deathSaves.values()) { try { if (fn(entity, dmg) === true) return true; } catch { } }
  return false;
}
function tellHurt(entity, dmg, before, after, saved = false) {
  const hurt = saved ? { dmg, before, after, saved: true } : { dmg, before, after };
  for (const fn of _hurtListeners.values()) { try { fn(entity, hurt); } catch { } }
}

/** @param {any} entity */
export function forcePlayerDeath(entity) {
  if (!((entity?.health ?? 0) > 0)) return false;
  entity.health = 0;
  surfacePlayer();
  hearDeath(entity);
  _deathPresenter?.(entity);
  return true;
}

/** @param {any} entity */
export function presentHeardDeath(entity) {
  if (!((entity?.health ?? 0) > 0)) return false;
  entity.health = 0;
  surfacePlayer();
  _deathPresenter?.(entity);
  return true;
}

export function hurtPlayer(entity, dmg, { bypassShield = false, spare = null } = {}) {
  tellDoorOpen(entity);
  if (playerDamageWithheld()) return false;
  if (!(dmg > 0)) return false;
  const portSays = !bypassShield && !spare;
  if (portSays) {
    if (_foeBlow() && playerBlowEvaded(entity)) return false;
    dmg = playerDamageMods(entity, dmg);
    if (!(dmg > 0)) return false;
  }
  if (!bypassShield) {
    dmg = damageShieldPool(entity, dmg);
    if (!(dmg > 0)) return false;
  }
  const wasAlive = (entity.health ?? 0) > 0;
  if (spare && wasAlive && entity.health - dmg < 1) {
    entity.health = 1;
    surfacePlayer();
    try { spare(entity); } catch { }
    return false;
  }
  if (portSays && wasAlive && entity.health - dmg < 1 && entity.health >= (entity.maxHealth ?? Infinity) && _foeBlow()) {
    const was = entity.health;
    entity.health = 1;
    surfacePlayer();
    tellHurt(entity, was - 1, was, 1);
    return false;
  }
  if (portSays && wasAlive && entity.health - dmg < 1 && playerDeathSaved(entity, dmg)) {
    const was = entity.health;
    entity.health = 1;
    surfacePlayer();
    tellHurt(entity, was - 1, was, 1, true);
    return false;
  }
  const before = entity.health;
  entity.health = Math.max(0, entity.health - dmg);
  surfacePlayer();
  if (portSays) tellHurt(entity, dmg, before, entity.health);
  if (wasAlive && entity.health === 0) {
    if (_avoidDeathHook?.(entity)) {
      entity.health = Math.trunc((entity.maxHealth ?? 0) * 0.1);
      surfacePlayer();
      return false;
    }
    hearDeath(entity);
    _deathPresenter?.(entity);
    return true;
  }
  return false;
}
