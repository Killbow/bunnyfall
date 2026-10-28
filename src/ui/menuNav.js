// @ts-check
// BUNNYFALL ACCESSIBILITY: THE KEYBOARD IN THE WINDOWS. With a window up and the pointer free, the arrows move a
// visible focus to the nearest control (plusPad.js's d-pad law), Tab walks them in order, Enter and Space press the
// focused one; Escape stays the window's. A window that moves its own choice with the arrows keeps them (its capture
// handler stops the key first, or OWN_ARROWS names it). The HUD is never walked, and a held pointer means play keys.
import { FRAME_ROLES } from './enhanced/enhancedFrame.js';

/** Where a window is: the kit's window roles, the menus' homes and the shells every enhanced window stands in. */
export const NAV_ROOTS = [...FRAME_ROLES.window, '.px-home', '.px-sys', '.cw', '.shell', '[class*="-shell"]', '[data-dom-focus]', '[role="dialog"]'].join(', ');
/** What can be pressed (plusPad's INTERACTIVE, less the hotbar's slots). A box with an `onclick` counts too. */
export const NAV_CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"]), .itemrow, .px-qrow';
/** Windows whose arrows already move their own choice (routed to them by the host, after this listener). */
export const OWN_ARROWS = '.talk-shell';
const SKIP = '.hud, .hb';
const NATIVE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);
const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const STYLE_ID = 'bf-menunav-style';
/** The controls pressed from the keyboard, newest last: where the focus goes back to when their window shuts. */
const presses = [];
const AT = 'kbnav-at';

/** @param {Element} n */
const disabled = (n) => /** @type {any} */ (n).disabled === true || n.getAttribute('aria-disabled') === 'true';

/** A key the field keeps: typing, its caret, a slider's step. @param {any} t @param {string} key */
export function fieldKeeps(t, key) {
  if (!t?.tagName) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
  if (t.tagName === 'SELECT') return key !== 'Tab';
  if (t.tagName !== 'INPUT') return false;
  const type = String(t.type || 'text').toLowerCase();
  if (['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'color', 'file'].includes(type)) return key === ' ';
  if (key === 'Tab') return false;
  if (type === 'range' || type === 'number') return true;
  return !(key === 'ArrowUp' || key === 'ArrowDown');   // a line of text keeps its caret, never the walk up and down
}

/** The pressable controls of every window on the screen, visible and uncovered, in page order. @param {Document} d */
export function navControls(d = globalThis.document) {
  if (!d?.querySelectorAll) return [];
  const w = d.defaultView ?? globalThis;
  const seen = new Set(), out = [];
  for (const root of d.querySelectorAll(NAV_ROOTS)) {
    if (root.closest(SKIP)) continue;
    for (const n of root.querySelectorAll('*')) {
      if (seen.has(n)) continue;
      if (!n.matches(NAV_CONTROLS) && typeof (/** @type {any} */ (n).onclick) !== 'function') continue;
      seen.add(n);
      if (disabled(n) || n.closest(SKIP)) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > (w.innerWidth ?? 1e9) || cy > (w.innerHeight ?? 1e9)) continue;
      const top = d.elementFromPoint?.(cx, cy);
      if (top && top !== n && !n.contains(top)) continue;   // under another window, or a box over it
      out.push(n);
    }
  }
  // a control inside another control (a label in a clickable row) is the outer one's
  return out.filter((n) => !out.some((m) => m !== n && m.contains(n)));
}

/**
 * The nearest control from `from` in a direction, measured edge to edge as the browsers' own spatial navigation does:
 * the gap ahead plus twice the gap to the side (none for a control in the same column or row), so "down" takes the
 * button straight below over a nearer one off to the side, and a wide row below a narrow tab still counts as below.
 */
export function spatialNext(/** @type {Element} */ from, /** @type {number[]} */ [vx, vy], /** @type {Element[]} */ list) {
  const a = from.getBoundingClientRect();
  const fx = a.left + a.width / 2, fy = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const n of list) {
    if (n === from || n.contains(from)) continue;
    const r = n.getBoundingClientRect();
    if ((r.left + r.width / 2 - fx) * vx + (r.top + r.height / 2 - fy) * vy <= 2) continue;   // its middle is not ahead
    const along = vy ? (vy > 0 ? r.top - a.bottom : a.top - r.bottom) : (vx > 0 ? r.left - a.right : a.left - r.right);
    if (along < -Math.min(a.height, a.width) / 2) continue;   // overlapping more than half: beside, not ahead
    const side = vy ? Math.max(0, r.left - a.right, a.left - r.right) : Math.max(0, r.top - a.bottom, a.top - r.bottom);
    const score = Math.max(0, along) + side * 2;
    if (score < bestScore) { bestScore = score; best = n; }
  }
  return best;
}

/** Which control this is, across a window drawn again: its kind and its words. @param {Element} n */
const sameKey = (n) => `${n.tagName}|${(n.textContent || '').trim().slice(0, 60)}`;

/** The control a key starts from: the focused one, or the one holding the focus inside it. */
const holder = (/** @type {Element[]} */ list, /** @type {Element|null} */ active) => (active ? list.find((n) => n === active || n.contains(active)) ?? null : null);

/** Put the focus on a control, made focusable if it was only clickable, and say it. @param {any} n */
function land(n, d) {
  if (!n) return;
  if (!NATIVE.has(n.tagName) && !n.hasAttribute('tabindex')) n.setAttribute('tabindex', '0');
  if (!NATIVE.has(n.tagName) && !n.hasAttribute('role')) n.setAttribute('role', 'button');
  d.querySelectorAll(`.${AT}`).forEach((m) => m.classList.remove(AT));
  n.classList.add(AT);
  d.documentElement.classList.add('kbnav');
  n.focus?.({ preventScroll: true });
  n.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** The focus ring: the theme's brass, only while the keyboard is the hand. */
function navStyle(d) {
  if (d.getElementById?.(STYLE_ID)) return;
  const s = d.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `html.kbnav .${AT}, html.kbnav .${AT}:focus { outline: 2px solid #f3cf86 !important; outline-offset: 2px !important; box-shadow: 0 0 0 4px rgba(12,14,18,0.85) !important; }`;
  d.head?.append(s);
}

/**
 * One key: true when it was the walk's (prevented and stopped), false when it goes on to the window and the host.
 * @param {KeyboardEvent} e @param {Document} [d]
 */
export function menuNavKey(e, d = globalThis.document) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  const key = e.key;
  const dir = DIRS[key];
  if (!dir && key !== 'Tab' && key !== 'Enter' && key !== ' ') return false;
  if (d.pointerLockElement) return false;   // the game has the mouse: these are play keys
  if (fieldKeeps(e.target, key)) return false;
  const list = navControls(d);
  if (!list.length) return false;
  const at = holder(list, d.activeElement);
  if (key === 'Enter' || key === ' ') {
    if (at) presses.push(at);
    if (presses.length > 8) presses.shift();
    if (!at || at !== d.activeElement) return false;
    if (NATIVE.has(at.tagName)) { keepAfter(at, d); return false; }   // a native control presses itself
    /** @type {any} */ (at).click();
    keepAfter(at, d);
  } else if (dir) {
    if ((at ?? list[0]).closest(OWN_ARROWS)) return false;
    // a window closed under the focus: back to the control that opened it, else the window's first
    let back = null;
    for (let i = presses.length - 1; !at && !back && i >= 0; i--) back = list.includes(presses[i]) ? presses[i] : null;
    if (!at) land(back ?? list.find((n) => n.matches('.primary, [autofocus]')) ?? list[0], d);
    else land(spatialNext(at, dir, list), d);
  } else {
    const i = at ? list.indexOf(at) : -1;
    const n = list.length;
    land(list[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + n) % n], d);
  }
  e.preventDefault();
  e.stopPropagation();
  return true;
}

/** A press that draws its window again takes the focus with the old control: give it to the new one, the same words
 *  in the same place, once the press has run. @param {Element} at @param {Document} d */
function keepAfter(at, d) {
  const k = sameKey(at);
  setTimeout(() => {
    if (at.isConnected || (d.activeElement && d.activeElement !== d.body)) return;
    const n = navControls(d).find((m) => sameKey(m) === k);
    if (n) land(n, d);
  }, 0);
}

let installed = false;
/** Once, at boot: the listener on the document (after every window's own capture, before the hosts on the window). */
export function installMenuNav(d = globalThis.document) {
  if (installed || !d?.addEventListener) return;
  installed = true;
  navStyle(d);
  d.addEventListener('keydown', (e) => { try { menuNavKey(e, d); } catch (err) { console.warn('[menuNav]', err); } });
  d.addEventListener('pointerdown', () => d.documentElement.classList.remove('kbnav'), true);
}
