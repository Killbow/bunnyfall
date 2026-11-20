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
import { awakenedVampirism } from '../../systems/vampire/vitae.js';
import { skinClass, disciplineGlyph, screenFlash, CLAN_COLOUR } from './vampKit.js';   // THE VISUAL PASS
import { PIXEL_STACK } from '../pixelifyFive.js';

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

  const cast = (d) => {
    if (!d) return;
    const was = cooldownLeft(d.id);
    say(castDiscipline(entity, d.id, { now: Math.floor(now()), region: region(), seenBy }));
    if (was === 0 && cooldownLeft(d.id) > 0) screenFlash(d.clan == null ? 'rgba(200,20,40,0.85)' : `${CLAN_COLOUR[d.clan] ?? '#b02a35'}dd`, { ms: 480, peak: 0.5, shape: 'ring' });   // THE VISUAL PASS: the cast's flash, the clan's colour
  };

  // THE VISUAL PASS: the wheel in the vampire's kit - the skin's dress (vampKit.js skinClass), the clan's colour, each
  // spoke the Discipline's glyph, name and Vitae with its cooldown swept over it, the lit one's words in the middle
  let centre = null;
  const accent = () => CLAN_COLOUR[awakenedVampirism(entity)?.clan] ?? '#b02a35';
  function draw() {
    if (!doc?.createElement) return;
    if (!root) {
      root = doc.createElement('div');
      root.className = 'discipline-wheel';
      root.setAttribute('aria-hidden', 'true');
      Object.assign(root.style, {
        position: 'fixed', left: '50%', top: '50%', width: '340px', height: '340px', margin: '-170px 0 0 -170px',
        borderRadius: '50%', pointerEvents: 'none', zIndex: '40', display: 'none',
      });
      centre = doc.createElement('div');
      Object.assign(centre.style, { position: 'absolute', left: '50%', top: '50%', width: '120px', transform: 'translate(-50%, -50%)', textAlign: 'center', fontSize: '12px', lineHeight: '1.25' });
      root.append(centre);
      doc.body?.append(root);
    }
    root.style.display = _open ? 'block' : 'none';
    if (!_open || !held) return;
    const enh = skinClass() === 'vk-enh', a = accent();
    Object.assign(root.style, enh ? {
      background: `radial-gradient(circle, rgba(14,16,19,0.92) 0 23%, transparent 23.5%), radial-gradient(circle, rgba(30,6,10,0.25) 0 30%, rgba(14,16,19,0.82) 31% 100%)`,
      border: '2px solid #2b323b', boxShadow: `0 0 0 3px ${a}66, 0 0 36px ${a}55`, font: '600 13px var(--data, system-ui, sans-serif)', color: '#e9e4d9',
    } : {
      background: 'radial-gradient(circle, #1d140d 0 23%, transparent 23.5%), repeating-conic-gradient(#2a1d14 0 10deg, #2f2117 10deg 20deg)',
      border: '3px solid #5b4630', boxShadow: '0 0 0 2px #0e0905, inset 0 0 30px #000', font: `13px ${PIXEL_STACK}`, color: '#f0d27a',
    });
    const list = held.list;
    while (cells.length < list.length) { const c = doc.createElement('div'); root.append(c); cells.push(c); }
    cells.forEach((c, i) => {
      const d = list[i];
      c.style.display = d ? 'flex' : 'none';
      if (!d) return;
      const ang = (i / list.length) * Math.PI * 2;
      const cd = cooldownLeft(d.id), lit = i === held.spoke;
      const sweep = cd > 0 ? Math.min(1, cd / Math.max(1, d.cooldownS)) : 0;
      const tone = d.clan == null ? '#e0303f' : a;
      c.innerHTML = '';
      const ring = doc.createElement('div');
      Object.assign(ring.style, {
        width: '58px', height: '58px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        background: lit ? `radial-gradient(circle, ${tone}55, ${tone}22)` : 'rgba(0,0,0,0.45)', border: `2px solid ${lit ? tone : enh ? '#2b323b' : '#5b4630'}`,
        boxShadow: lit ? `0 0 14px ${tone}` : 'none', transition: 'all 120ms',
      });
      ring.innerHTML = disciplineGlyph(d.id, cd > 0 ? '#6d5f5c' : tone, 34);
      if (sweep > 0) {
        const s2 = doc.createElement('div');
        Object.assign(s2.style, { position: 'absolute', inset: '0', borderRadius: '50%', background: `conic-gradient(rgba(0,0,0,0.72) ${sweep * 360}deg, transparent 0)` });
        const n = doc.createElement('span');
        n.textContent = `${cd}`;
        Object.assign(n.style, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', textShadow: '0 1px 2px #000' });
        ring.append(s2, n);
      }
      const name = doc.createElement('div');
      name.textContent = d.name();
      Object.assign(name.style, { marginTop: '3px', whiteSpace: 'nowrap', textShadow: '0 1px 2px #000', color: lit ? '#fff' : cd > 0 ? '#8a7d78' : '' });
      const cost = doc.createElement('div');
      cost.textContent = `${d.vitae} Vitae`;
      Object.assign(cost.style, { fontSize: '10px', opacity: '0.8', color: '#ff8a8a' });
      c.append(ring, name, cost);
      Object.assign(c.style, {
        position: 'absolute', left: `${50 + Math.sin(ang) * 34}%`, top: `${50 - Math.cos(ang) * 34}%`, transform: `translate(-50%, -50%) scale(${lit ? 1.12 : 1})`,
        flexDirection: 'column', alignItems: 'center', transition: 'transform 120ms',
      });
    });
    const sel = held.spoke >= 0 ? list[held.spoke] : null;
    if (centre) {
      centre.innerHTML = '';
      const h = doc.createElement('div');
      h.textContent = sel ? sel.name() : t('discipline.wheel.pick', 'Flick to choose');
      Object.assign(h.style, { fontSize: enh ? '17px' : '14px', fontFamily: enh ? 'var(--display, Georgia, serif)' : PIXEL_STACK, color: sel ? '#fff' : '#9a9486', marginBottom: '4px' });
      const w = doc.createElement('div');
      w.textContent = sel ? sel.words() : t('discipline.wheel.hint', 'Let go in the middle to cancel');
      Object.assign(w.style, { opacity: '0.8', fontSize: '11px' });
      centre.append(h, w);
    }
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
}
