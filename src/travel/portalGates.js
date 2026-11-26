// @ts-check
// Portals are stored in the world (wire) frame and converted with `toScene` every frame, so a floating-origin
// recenter needs no update here. Every distance in this file is in scene meters.

import { createPortalSet, PORTAL_MS } from './portalFx.js';
import {
  PORTAL_OPEN_MS, PORTAL_SAY_REACH, PORTAL_PEER_REACH, PORTAL_REGROUND, PORTAL_STEP_GAP_MS, PORTAL_STEP_JUMP,
  portalWire, validPortalRecord, portalStepIn,
} from './portalStone.js';
import { eventGroundAt } from '../worldEvents/eventGround.js';

const across = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** @param {{ renderer?: any, audio?: any, now?: () => number, toScene?: (p: number[]) => number[], toWire?: (p: number[]) => number[], destOf?: (x: number, y: number) => ({ pixel: { x: number, y: number }, name: string } | null), groundAt?: ((p: number[]) => number | null) | null, onEnter?: (gate: any) => void, onRefused?: (hold: string, gate: any) => void, eventGround?: boolean }} [deps] */
export function createPortalGates({
  renderer = null, audio = null, now = () => performance.now(),
  toScene = (p) => p, toWire = (p) => p, destOf = () => null, groundAt = null, onEnter = () => {}, onRefused = () => {},
  eventGround = true,
} = {}) {
  const offGround = (p) => eventGround && !!eventGroundAt(p);
  const fx = createPortalSet({ renderer, audio, now });
  /** @type {{ id: string, owner: string | null, native: number[], dest: { pixel: { x: number, y: number }, name: string }, until: number, fx: any, was: boolean | null, grounded: boolean }[]} */
  const gates = [];
  let _seq = 0;
  let _lastTick = null, _lastFeet = null;
  let _also = null;
  const holdFor = (ms) => Math.max(0, ms - PORTAL_MS.open - PORTAL_MS.close);

  function stand(g) { g.fx = fx.open(toScene(g.native), { holdMs: holdFor(g.until - now()), fixed: true }); }
  function drop(g) {
    if (g.fx) fx.remove(g.fx);
    g.fx = null;
    const i = gates.indexOf(g);
    if (i >= 0) gates.splice(i, 1);
  }

  function open(pos, dest) {
    for (const g of gates.filter((x) => x.owner === null)) drop(g);
    const g = { id: `${Math.floor(now()).toString(36)}${(_seq++).toString(36)}`, owner: null, native: toWire(pos), dest, until: now() + PORTAL_OPEN_MS, fx: null, was: null, grounded: true };
    gates.push(g);
    stand(g);
    return g;
  }
  const mine = () => gates.find((g) => g.owner === null && now() < g.until) ?? null;

  function applyOwner(owner, raw, from = null) {
    if (owner == null || !from) return false;
    const r = validPortalRecord(raw);
    const dest = r ? destOf(r.d[0], r.d[1]) : null;
    if (!r || !dest) return false;
    if (across(toScene(r.p), from) > PORTAL_PEER_REACH) return false;
    if (offGround(toScene(r.p))) return false;
    const old = gates.find((g) => g.owner === owner);
    if (old && now() < old.until) {
      // A second portal id from the same owner is refused while the first is still open.
      if (old.id !== r.i) return false;
      // A repeated record can shorten the portal time but never extend it.
      old.until = Math.min(old.until, now() + r.r);
      return true;
    }
    if (old) drop(old);
    const g = { id: r.i, owner, native: [...r.p], dest, until: now() + r.r, fx: null, was: null, grounded: false };
    gates.push(g);
    stand(g);
    return true;
  }

  function forgetSteps() { for (const g of gates) g.was = null; _lastFeet = null; }

  // A tick gap or a jump of the feet clears the step state, so leaving a building or teleporting never counts as
  // stepping into a portal.
  function tick(feet, { hold = () => null } = {}) {
    const t = now();
    const gap = _lastTick == null || t - _lastTick > PORTAL_STEP_GAP_MS || !feet || !_lastFeet || across(feet, _lastFeet) > PORTAL_STEP_JUMP
      || Math.abs(feet[1] - _lastFeet[1]) > PORTAL_STEP_JUMP;
    _lastTick = t;
    _lastFeet = feet ? [feet[0], feet[1], feet[2]] : null;
    if (gap) for (const g of gates) g.was = null;
    for (let i = gates.length - 1; i >= 0; i--) {
      const g = gates[i];
      if (t >= g.until) { drop(g); continue; }
      let at = toScene(g.native);
      if (offGround(at)) { drop(g); continue; }
      if (!g.grounded && groundAt) {
        const y = groundAt(at);
        if (Number.isFinite(y)) {
          if (Math.abs(/** @type {number} */ (y) - at[1]) <= PORTAL_REGROUND) { at = [at[0], /** @type {number} */ (y), at[2]]; g.native = toWire(at); }
          g.grounded = true;
        }
      }
      if (g.fx) { g.fx.feet[0] = at[0]; g.fx.feet[1] = at[1] - 0.05; g.fx.feet[2] = at[2]; }
    }
    fx.tick(null);
    if (!feet) return null;
    let entered = null;
    for (const g of gates) {
      const step = portalStepIn(g.was, feet, toScene(g.native));
      g.was = step.inside;
      if (!entered && step.entered && t < g.until - PORTAL_MS.close) entered = g;
    }
    if (!entered) return null;
    const why = hold();
    if (why) { if (why !== 'busy') onRefused(why, entered); return null; }
    onEnter(entered);
    return entered;
  }

  function wireRecord(near) {
    const g = mine();
    if (!g || !near || across(toScene(g.native), near) > PORTAL_SAY_REACH) return null;
    return portalWire(g, now());
  }

  return {
    open, mine, applyOwner, tick, wireRecord, forgetSteps,
    batches: () => { const more = _also?.(); return more?.length ? [...fx.batches(), ...more] : fx.batches(); },
    drawAlso(batchesOf) { _also = batchesOf; },
    get gates() { return gates; },
    clear() { fx.clear(); for (const g of gates) g.fx = null; gates.length = 0; _lastFeet = null; },
  };
}
