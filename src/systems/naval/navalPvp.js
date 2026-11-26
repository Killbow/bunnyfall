// @ts-check
import { hullBuild } from './navalShips.js';
import { SHIP_STATES } from './navalDamage.js';
import { captainsDue } from '../../items/sigilSetPowers.js';
import { wildTakeTook } from '../../world/wild/wildDropLaw.js';
import { SEA_HOLD_F } from '../../net/sea/seaPrizeLaw.js';
import { shutSeaHold } from './seaHoldGuard.js';

export const PVP_STRUCK_SHAKE = 1.6;
// Keep equal to HOSTILE_NEAR_M in navalHost.js.
export const SEA_CAPTAIN_NEAR_M = 700;

/** @param {any} deps */
export function createNavalPvp(deps) {
  let guns = null;
  function helm() {
    const boat = deps.enabled?.() ? deps.boat?.() : null;
    const st = boat ? deps.stateOf(boat) : null;
    if (!st || !(boat.uid > 0)) return null;
    const t = deps.build(boat).hullHp / Math.max(1, hullBuild(boat.hull).hullHp) / Math.max(0.01, (deps.due?.() ?? captainsDue()).hull);
    return { hl: boat.hull, u: boat.uid, t, h: st.damage.hullShare(), wrecked: st.damage.state === SHIP_STATES.wrecked, pos: deps.pose(boat).position, boat };
  }
  function struck({ frac = 0, sail = 0, fire = false, left = 1 }) {
    const boat = deps.boat?.(), st = boat ? deps.stateOf(boat) : null;
    if (!st) return null;
    const d = st.damage;
    const hull = Math.max(frac * d.maxHull, d.hull - Math.max(0, left) * d.maxHull);
    const change = d.apply({ hull: Math.max(0, hull), sail: Math.max(0, sail) * d.maxSail, crew: 0, ...(fire ? { fire: 'hull' } : {}) }, deps.clock());
    deps.shake?.(PVP_STRUCK_SHAKE);
    return change;
  }
  function wreck() {
    const boat = deps.boat?.(), st = boat ? deps.stateOf(boat) : null;
    if (st && st.damage.state !== SHIP_STATES.wrecked) st.damage.apply({ hull: st.damage.maxHull * 2, sail: 0, crew: 0 }, deps.clock());
    if (boat) shutSeaHold(boat.uid);
  }
  function takeHold(/** @type {number} */ uid, /** @type {any[]} */ took) {
    const items = (deps.boats?.() ?? []).find((b) => b.uid === uid)?.Cargo?.Items;
    return Array.isArray(items) ? wildTakeTook({}, took, null, undefined, [{ f: SEA_HOLD_F, items }]) : [];
  }
  return {
    attach: (/** @type {any} */ g) => { guns = g; },
    open: (/** @type {string} */ peer, /** @type {unknown} */ shooter, /** @type {boolean} */ byMe) => !!guns?.open(peer, shooter, byMe),
    shot: (/** @type {string} */ peer, /** @type {any} */ hurt) => guns?.shot(peer, hurt),
    helm, struck, wreck, takeHold,
    peerAt: (/** @type {string} */ id) => (deps.peers?.() ?? []).find((p) => p.id === id)?.pos ?? null,
    captainNear() {
      const h = guns?.live ? helm() : null;
      return !!h && (deps.peers?.() ?? []).some((p) => Array.isArray(p.pos) && !!guns.open(p.id, null, true) && Math.hypot(p.pos[0] - h.pos[0], p.pos[2] - h.pos[2]) <= SEA_CAPTAIN_NEAR_M);
    },
  };
}
