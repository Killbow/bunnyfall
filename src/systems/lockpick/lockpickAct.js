// @ts-check
import { LOCKPICK_ACT, pinsFor, spoolsFor, setWindowS, slipBreakChance, bindingOrder, spoolPins, sensesBinding, autoOpens } from './lockpickLaw.js';

export const PIN = Object.freeze({ rest: 'rest', rise: 'rise', hang: 'hang', fall: 'fall', spring: 'spring', set: 'set' });

/** @param {{ lock: number, chance: number, seed: number, band?: number, skill?: number, exterior?: boolean, rng?: () => number }} o */
export function createLockpickAct({ lock, chance, seed, band = 1, skill = 0, exterior = false, rng = Math.random }) {
  const A = LOCKPICK_ACT;
  const n = pinsFor(lock);
  const order = bindingOrder(n, seed);
  const spool = spoolPins(n, spoolsFor(lock), seed);
  const window = setWindowS(chance, band);
  const breakChance = slipBreakChance(chance);
  /** @typedef {{ phase: string, t: number, y: number, rise: number, spool: boolean, falseSet: boolean }} LockPin */
  /** @type {LockPin[]} */
  const pins = Array.from({ length: n }, (_, i) => ({ phase: /** @type {string} */ (PIN.rest), t: 0, y: 0, rise: /** @type {number} */ (A.riseS), spool: spool[i], falseSet: false }));
  const st = {
    lock, chance, n, order, pins, window, breakChance, exterior,
    sense: sensesBinding(skill),
    pos: 0,
    next: 0,
    open: false, done: false,
    broken: 0, slips: 0, sets: 0,
    last: /** @type {string|null} */ (null), lastPin: -1,
  };
  const binding = () => (st.next < n ? order[st.next] : -1);
  const dropAll = () => {
    for (const p of pins) { p.phase = PIN.rest; p.t = 0; p.y = 0; p.falseSet = false; }
    st.next = 0;
  };
  const place = (p) => {
    switch (p.phase) {
      case PIN.rise: return Math.min(1, p.t / p.rise);
      case PIN.hang: case PIN.set: return 1;
      case PIN.fall: return Math.max(0, 1 - p.t / A.fallS);
      case PIN.spring: { const h = p.t / A.springS; return Math.max(0, h < 0.5 ? h * 2 : 2 - h * 2) * 0.85; }
      default: return 0;
    }
  };
  const inWindow = (p) => p.phase === PIN.hang || (p.phase === PIN.rise && p.t >= p.rise - A.graceS) || (p.phase === PIN.fall && p.t <= A.graceS);
  const answer = (what, i) => { st.last = what; st.lastPin = i; return what; };
  const slip = (i) => {
    const moving = pins[i];
    moving.phase = PIN.rest; moving.t = 0; moving.y = 0;
    if (rng() < breakChance) { st.broken++; dropAll(); return answer('break', i); }
    st.slips++;
    if (st.next > 0) {
      const back = pins[order[st.next - 1]];
      back.phase = PIN.rest; back.t = 0; back.y = 0;
      st.next--;
    }
    for (const q of pins) if (q.phase !== PIN.set) q.falseSet = false;
    return answer('slip', i);
  };

  return {
    state: st,
    get binding() { return binding(); },
    tick(dt) {
      if (st.done) return st;
      const step = Math.max(0, Math.min(0.25, Number(dt) || 0));
      for (const p of pins) {
        if (p.phase === PIN.rest || p.phase === PIN.set) { p.y = place(p); continue; }
        p.t += step;
        if (p.phase === PIN.rise && p.t >= p.rise) { p.t -= p.rise; p.phase = PIN.hang; }
        if (p.phase === PIN.hang && p.t >= st.window) { p.t -= st.window; p.phase = PIN.fall; }
        if (p.phase === PIN.fall && p.t >= A.fallS) { p.t = 0; p.phase = PIN.rest; }
        if (p.phase === PIN.spring && p.t >= A.springS) { p.t = 0; p.phase = PIN.rest; }
        p.y = place(p);
      }
      return st;
    },
    move(d) { if (!st.done) st.pos = Math.max(0, Math.min(n - 1, st.pos + Math.sign(Number(d) || 0))); return st.pos; },
    aim(i) { if (!st.done && Number.isInteger(i) && i >= 0 && i < n) st.pos = i; return st.pos; },
    press() {
      if (st.done) return null;
      const i = st.pos, p = pins[i];
      if (p.phase === PIN.set) return answer('already', i);
      if (p.phase === PIN.rest) {
        if (i === binding()) { p.phase = PIN.rise; p.t = 0; p.rise = A.riseS * (1 + A.riseJitter * (2 * rng() - 1)); return answer('lift', i); }
        if (rng() < breakChance * A.freeRisk) { st.broken++; dropAll(); return answer('break', i); }
        p.phase = PIN.spring; p.t = 0;
        return answer('springy', i);
      }
      if (i !== binding() || !inWindow(p)) return slip(i);
      if (p.spool && !p.falseSet) {
        p.falseSet = true; p.phase = PIN.rest; p.t = 0; p.y = 0;
        return answer('false-set', i);
      }
      p.phase = PIN.set; p.t = 0; p.y = 1;
      st.next++; st.sets++;
      if (st.next >= n) { st.open = true; st.done = true; return answer('open', i); }
      return answer('set', i);
    },
    auto() {
      if (st.done) return null;
      if (autoOpens(st.chance, rng(), st.exterior)) {
        for (const p of pins) { p.phase = PIN.set; p.t = 0; p.y = 1; }
        st.next = n; st.open = true; st.done = true;
        return answer('open', -1);
      }
      st.slips++; dropAll();
      return answer('slip', -1);
    },
    cancel() { st.done = true; return st; },
    report() { return { open: st.open, broken: st.broken, sets: st.sets, slips: st.slips }; },
  };
}
