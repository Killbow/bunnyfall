// @ts-check
// Decides which enemies a technique blow reaches and how much it scales the damage.
// The shared swing and arrow hit paths still roll the hit and apply the damage.

import { healthShare } from '../healthShare.js';

export const TECH_BODY_RADIUS = 0.45;
export const TECH_REACH_UP = 2.2;
export const TECH_POINT_BLANK = 0.6;

export const bodyRadius = (foe) => (Number.isFinite(foe?.radius) ? foe.radius : Number.isFinite(foe?.ai?.radius) ? foe.ai.radius : TECH_BODY_RADIUS);

export const playerBody = (foe) => !!foe && (foe.rival != null || foe.duel === true);

/**
 * @param {any} blow
 * @param {any} foe
 * @param {{ dist: number, inView: boolean, losClear: boolean }} sight
 */
export function blowReaches(blow, foe, sight) {
  if (!blow || !sight?.losClear) return false;
  const f = foe?.ai?.feet;
  const r = bodyRadius(foe);
  const level = (y) => !blow.feet || Math.abs(y - blow.feet[1]) <= TECH_REACH_UP;
  if (blow.lane) {
    if (!f || !level(f[1])) return false;
    const L = blow.lane, rx = f[0] - L.from[0], rz = f[2] - L.from[1];
    const along = rx * L.dir[0] + rz * L.dir[1];
    const across = Math.abs(rx * L.dir[1] - rz * L.dir[0]);
    return along >= (blow.ability ? 0 : -0.5) && along <= L.len + r && across <= L.halfW + r;
  }
  if (blow.target && foe !== blow.target) return false;
  const arc = blow.target ? 'all' : blow.arc;
  if (arc === 'view') return !!sight.inView && sight.dist <= blow.reach;
  if (!f || !blow.feet) return sight.dist <= blow.reach;
  const dx = f[0] - blow.feet[0], dz = f[2] - blow.feet[2], d = Math.hypot(dx, dz);
  if (!((d - r <= blow.reach && level(f[1])) || sight.dist <= blow.reach)) return false;
  if (arc === 'all' || d < TECH_POINT_BLANK) return true;
  const cos = (dx * Math.sin(blow.yaw ?? 0) + dz * Math.cos(blow.yaw ?? 0)) / d;
  return cos >= Math.cos(/** @type {number} */ (blow.arc));
}

export function blowMult(blow, foe) {
  let m = Number.isFinite(blow?.mult) ? blow.mult : 1;
  if (blow?.wounded > 0) m += blow.wounded * Math.max(0, Math.min(1, 1 - (healthShare(foe?.entity) ?? 1)));
  return m;
}

export const scaleBlowDamage = (damage, mult) => (damage > 0 ? Math.max(1, Math.round(damage * mult)) : damage);

// Called once per enemy a technique blow reaches, before the host applies the damage; a miss reports 0.
/** @type {Array<[string, (landing: { blow: any, foe: any, damage: number }) => void]>} */
let _landed = [];
export function registerTechniqueLandedListener(name, fn) {
  _landed = _landed.filter(([n]) => n !== name);
  if (typeof fn === 'function') _landed.push([name, fn]);
}
export function tellTechniqueLanded(blow, foe, damage) {
  if (!blow || _landed.length === 0) return;
  for (let i = 0; i < _landed.length; i++) { try { _landed[i][1]({ blow, foe, damage }); } catch { } }
}

// Called once per press when its cost is paid, so timed windows open even when the blow misses.
/** @type {Array<[string, (press: { id: string, use: any, entity: any }) => void]>} */
let _used = [];
export function registerTechniqueUsedListener(name, fn) {
  _used = _used.filter(([n]) => n !== name);
  if (typeof fn === 'function') _used.push([name, fn]);
}
export function tellTechniqueUsed(id, use, entity) {
  if (_used.length === 0) return;
  for (let i = 0; i < _used.length; i++) { try { _used[i][1]({ id, use, entity }); } catch { } }
}
