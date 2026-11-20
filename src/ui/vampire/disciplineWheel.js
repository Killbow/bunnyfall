// @ts-check
// BUNNYFALL VAMPIRE EXPANSION: THE DISCIPLINE KEY AND ITS WHEEL (the owner: "i want them to cast via hotkey"; asked, "One
// key + wheel"). One action, 'Discipline' (systems/inputActions.js - Numpad0 by default, rebindable in Controls):
//   TAP  casts the last Discipline again (the first known, before any);
//   HOLD opens a wheel of the vampire's Disciplines (the shared three and the clan's two) - FLICK the mouse toward one and
//        LET GO to cast it; let go in the middle and nothing is cast. A click while it is open casts the one lit.
// Each spoke says its name, its Vitae and its cooldown. The mode wheel's own manners (ui/modeWheel.js): the mouse is the
// wheel's while it is open (the world host's look asks `disciplineWheelOpen` and turns no camera), a lost focus closes it
// casting nothing, and a window up (hostPaused) leaves the key to the window.
// The casting is systems/vampire/disciplines.js; this file only reads the key and draws the wheel.

import { eventActions, isTextEntryTarget, hostPaused } from '../input.js';
import { t } from '../../systems/textManager.js';
import { knownDisciplines, castDiscipline, cooldownLeft, lastDiscipline } from '../../systems/vampire/disciplines.js';

export const DISCIPLINE_ACTION = 'Discipline';
/** A press held this long (ms) opens the wheel; a shorter one is a tap. */
export const HOLD_MS = 180;
const DEAD_ZONE = 18, MAX_ARM = 60;

let _open = false;
/** Whether the wheel is open (the host's look turns no camera while it is). */
export const disciplineWheelOpen = () => _open;

/** The spoke a flick of (dx, dy) points at among `n` spokes clockwise from the top, or -1 inside the dead zone. */
export function spokeAt(dx, dy, n) {
  if (!(n > 0) || !(Math.hypot(dx, dy) >= DEAD_ZONE)) return -1;
  const a = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);   // 0 up, clockwise
  return Math.round(a / ((Math.PI * 2) / n)) % n;
}

/**
 * Listen for the key, once. `now()` the character's own minute; `region()` the region's index; `seenBy()` the
 * townsfolk who see the caster now; `say(line)` the HUD's line.
 * @param {{ entity: any, now: () => number, region: () => number, seenBy: () => number, say: (s: string) => void, win?: any }} deps
 */
export function installDisciplineKey({ entity, now, region, seenBy, say, win = globalThis.window }) {
  const doc = win?.document ?? null;
  if (!win?.addEventListener || win.__disciplineKey) return;
  win.__disciplineKey = true;
  let held = null;   // { code, at, timer, list, x, y, spoke }
  let root = null;
  const cells = [];

  const cast = (d) => { if (d) say(castDiscipline(entity, d.id, { now: Math.floor(now()), region: region(), seenBy })); };

  function draw() {
    if (!doc?.createElement) return;
    if (!root) {
      root = doc.createElement('div');
      root.className = 'discipline-wheel';
      root.setAttribute('aria-hidden', 'true');
      Object.assign(root.style, {
        position: 'fixed', left: '50%', top: '50%', width: '280px', height: '280px', margin: '-140px 0 0 -140px',
        borderRadius: '50%', pointerEvents: 'none', zIndex: '40', display: 'none',
        background: 'radial-gradient(circle, rgba(40,6,10,0.18) 0 20%, rgba(20,6,8,0.78) 21% 100%)',
        border: '1px solid #5a1a20', boxShadow: '0 0 28px rgba(120,0,10,0.45)',
        font: '600 13px var(--data, system-ui, sans-serif)', letterSpacing: '0.04em',
      });
      doc.body?.append(root);
    }
    root.style.display = _open ? 'block' : 'none';
    if (!_open || !held) return;
    const list = held.list;
    while (cells.length < list.length) { const c = doc.createElement('div'); root.append(c); cells.push(c); }
    cells.forEach((c, i) => {
      const d = list[i];
      c.style.display = d ? 'block' : 'none';
      if (!d) return;
      const a = (i / list.length) * Math.PI * 2;
      const cd = cooldownLeft(d.id);
      c.textContent = `${d.name()} · ${d.vitae}${cd > 0 ? ` · ${cd}s` : ''}`;
      const lit = i === held.spoke;
      Object.assign(c.style, {
        position: 'absolute', left: `${50 + Math.sin(a) * 36}%`, top: `${50 - Math.cos(a) * 36}%`, transform: 'translate(-50%, -50%)',
        padding: '4px 8px', borderRadius: '3px', whiteSpace: 'nowrap', textAlign: 'center',
        color: lit ? '#f3e6e0' : cd > 0 ? '#7d6a66' : '#c9b2ac', background: lit ? '#8a1c26' : 'transparent',
      });
    });
  }
  function openWheel() { if (!held) return; _open = true; draw(); }
  function close(choose) {
    const h = held;
    held = null;
    if (h?.timer) clearTimeout(h.timer);
    const wasOpen = _open;
    _open = false;
    draw();
    if (!choose || !h) return;
    if (wasOpen) { if (h.spoke >= 0) cast(h.list[h.spoke]); }
    else cast(lastDiscipline(entity) ?? h.list[0]);
  }
  const means = (/** @type {any} */ e) => eventActions(e).includes(DISCIPLINE_ACTION);
  const mouseEv = (/** @type {MouseEvent} */ e) => ({ code: `Mouse${e.button}`, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey });

  function press(code, e) {
    if (held) return false;
    if (hostPaused() === true) return false;
    const list = knownDisciplines(entity);
    if (!list.length) return false;   // not a vampire the Elder awakened: the key is nobody's
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    held = { code, at: Date.now(), list, x: 0, y: 0, spoke: -1, timer: setTimeout(openWheel, HOLD_MS) };
    return true;
  }
  function release(code, e) {
    if (!held || held.code !== code) return false;
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    close(true);
    return true;
  }
  win.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
    if (e.repeat || e.metaKey || isTextEntryTarget(e.target) || !means(e)) return;
    press(e.code, e);
  }, true);
  win.addEventListener('keyup', (/** @type {KeyboardEvent} */ e) => { release(e.code, e); }, true);
  win.addEventListener('mousedown', (/** @type {MouseEvent} */ e) => {
    if (_open && held) { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }   // a click casts the lit one
    const m = mouseEv(e);
    if (means(m)) press(m.code, e);
  }, true);
  win.addEventListener('mouseup', (/** @type {MouseEvent} */ e) => { release(`Mouse${e.button}`, e); }, true);
  win.addEventListener('mousemove', (/** @type {MouseEvent} */ e) => {
    if (!held) return;
    held.x += e.movementX || 0; held.y += e.movementY || 0;
    const r = Math.hypot(held.x, held.y);
    if (r > MAX_ARM) { held.x *= MAX_ARM / r; held.y *= MAX_ARM / r; }
    const s = spokeAt(held.x, held.y, held.list.length);
    if (s !== held.spoke) { held.spoke = s; if (_open) draw(); }
  }, true);
  win.addEventListener('blur', () => close(false));
  // a held wheel's cooldowns tick on its face
  win.setInterval?.(() => { if (_open) draw(); }, 500);
  void t;
}
