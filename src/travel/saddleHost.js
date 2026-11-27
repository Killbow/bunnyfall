// @ts-check
import { drawEnhancedSaddle, hideEnhancedSaddle, enhancedSaddleMounted, toggleSaddlePanel } from '../ui/enhancedSaddle.js';
import { upkeepReach } from '../systems/upkeep/upkeepRuntime.js';
import { activeWagonItem } from './wagonKinds.js';
import { wagonWord } from './wagonUpkeep.js';

export const SADDLE_SPEED_TAU = 0.35;
export const SADDLE_MODES = Object.freeze(['Horse', 'Cart']);

/** @param {{ upkeep: any, runtime: () => any, items: () => any[], wagonKg: () => number, wagonLimit: () => number, say: (t: string) => void, pass: (m: number) => void, openStable: () => void, canView: () => boolean, toggleView: () => void, foot: () => void }} deps */
export function createSaddleHost({ upkeep, runtime, items, wagonKg, wagonLimit, say, pass, openStable, canView, toggleView, foot }) {
  let speed = 0, galloping = false, walking = false;
  /** @type {any} */
  let shown = null;
  const reach = () => { const rt = runtime(); return { ...upkeepReach(rt, !!rt), near: true, stabled: false }; };
  const act = (verb, arg = 0) => { const r = upkeep.act(verb, arg, { ...reach(), pass }); if (r?.text) say(r.text); return r; };
  const hooks = {
    feed: () => act('feed', shown?.horse?.feed ?? 0), treat: () => act('treat', shown?.horse?.feed ?? 0), kit: () => act('kit'),
    cargo: () => { runtime()?.openWagonCargo?.(); },
    stable: () => openStable(),
    view: () => toggleView(),
    dismount: () => { const rt = runtime(); if (rt) rt.handleQuickMountOrDismount(); else foot(); },
  };

  // `metres` is what the motor rolled this frame, never a placement such as a teleport. `walk` is the motor's
  // `rideWalking`, because only the motor knows a refused gallop.
  function motion(dt, metres, gallop, walk = false) {
    galloping = !!gallop;
    walking = !!walk;
    if (!(dt > 0) || !Number.isFinite(metres)) return;
    speed += (metres / dt - speed) * Math.min(1, dt / SADDLE_SPEED_TAU);
  }

  /** @param {string} mode */
  function read(mode) {
    if (!SADDLE_MODES.includes(mode)) return null;
    const rt = runtime(), r = reach();
    const base = upkeep.saddle(mode);
    const cart = mode === 'Cart';
    const w = cart ? activeWagonItem(items() ?? []) : null;
    const limit = cart ? wagonLimit() : 0;
    return {
      mode, name: rt?.hasHorseName ? rt.horseName : '', wagonName: w ? wagonWord(w) : '',
      speed, galloping: mode === 'Horse' && galloping,
      walks: mode === 'Horse' && walking,
      horse: base.horse, wagon: cart ? base.wagon : null, oats: base.oats, apples: base.apples, kits: base.kits,
      load: cart && limit > 0 ? { kg: wagonKg(), limit } : null,
      near: true, wagonNear: r.wagonNear,
      cargo: cart && rt ? !!rt.canAccessWagonInventory?.()?.allowed : null,
      view: !!canView(), hcc: !!rt,
    };
  }

  /** @param {{ show: boolean, mode: string, covered?: boolean, touch?: boolean, mouseFree?: boolean, freeKey?: string, keyOf?: (a: string) => string, toggle?: boolean }} f */
  function frame({ show, mode, covered = false, touch = false, mouseFree = true, freeKey = 'Y', keyOf, toggle = false }) {
    const s = show ? read(mode) : null;
    if (s && toggle && !covered) toggleSaddlePanel();
    shown = s;
    if (!s) { speed = 0; galloping = false; walking = false; if (enhancedSaddleMounted()) hideEnhancedSaddle(); return null; }
    return drawEnhancedSaddle({ saddle: s, covered, touch, mouseFree, freeKey, keyOf }, hooks);
  }

  return { motion, read, frame, hooks, hide: () => { speed = 0; hideEnhancedSaddle(); }, get speed() { return speed; } };
}
