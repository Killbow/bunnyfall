// @ts-check
// Manages the in-game POI editor's panel sizes and persistent preferences. Splitters resize the left panel, right
// panel, and DM panel height, double-clicking a splitter resets that panel to its default size, and sizes are saved in
// localStorage and applied as CSS variables on the document root so the panels, game notices, and tips button
// (ui/poi/poiEditorPanel.js POI_PANEL_CSS) stay aligned. Any side panel widened under the top toolbar shifts down below
// the toolbar so buttons remain visible. Also saves and restores the editor's snap steps and camera speed, falling back
// to defaults when storage is unavailable.

import { t } from '../../systems/textManager.js';
import { pageStorage } from './poiStorage.js';

/** localStorage keys for saved panel sizes, snap steps, and camera speed. */
export const POI_LAYOUT_KEY = 'bunnyfall.poieditor.layout';
export const POI_PREFS_KEY = 'bunnyfall.poieditor.prefs';
/** Default panel sizes in pixels: left and right panel widths, and DM panel height (null uses the stylesheet
 *  default). */
export const POI_LAYOUT_DEFAULTS = Object.freeze({ left: 250, right: 300, dm: /** @type {number | null} */ (null) });
/** Minimum and maximum panel sizes in pixels, plus the minimum viewport gap (`gap`) preserved between the left and
 *  right panels. */
export const POI_LAYOUT_BOUNDS = Object.freeze({ left: [200, 560], right: [240, 640], dm: [160, 900], gap: 360 });
/** The side panels' top offset and bottom margin in pixels (the status line sits below them), plus the room reserved
 *  for the tips button above the DM panel (poiEditorPanel.js POI_PANEL_CSS). */
const DOCK_TOP = 56, DOCK_BOTTOM = 40, TIPS_ROOM = 52;

export const POI_LAYOUT_STYLE_ID = 'dfpoi-layout-style';
export const POI_LAYOUT_CSS = `
.dfpoi-split { pointer-events: auto; position: absolute; touch-action: none; border-radius: 3px; }
.dfpoi-split:hover, .dfpoi-split[data-drag="1"] { background: rgba(216, 183, 122, .35); }
/* the side splitters lie on the docks' own inner edges, so they cover nothing the docks do not already cover */
.dfpoi-split-v { bottom: ${DOCK_BOTTOM}px; width: 6px; cursor: col-resize; }
.dfpoi-split-left { top: var(--dfpoi-left-top, ${DOCK_TOP}px); left: calc(2px + var(--dfpoi-left-w, 250px)); }
.dfpoi-split-right { top: var(--dfpoi-right-top, ${DOCK_TOP}px); right: calc(2px + var(--dfpoi-right-w, 300px)); }
.dfpoi-split-dm { height: 8px; cursor: row-resize; left: calc(16px + var(--dfpoi-left-w, 250px)); right: calc(16px + var(--dfpoi-right-w, 300px)); bottom: calc(${DOCK_BOTTOM}px + var(--dfpoi-dm-h, min(56vh, 600px))); }
.dfpoi-split[hidden], .dfpoi[data-on="0"] .dfpoi-split { display: none; }
`;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (/** @type {number} */ v, /** @type {readonly number[]} */ r) => Math.min(r[1], Math.max(r[0], v));
/** Returns the provided storage object, or the page's `localStorage` when omitted (null if unavailable). */
const storageOf = (/** @type {any} */ s) => (s !== undefined ? s : pageStorage());

/** Reads saved panel sizes from `storage`, falling back to `POI_LAYOUT_DEFAULTS` for any missing or non-numeric
 *  field. @param {Storage | null} storage */
export function readPoiLayout(storage) {
  let got = {};
  try { got = JSON.parse(storage?.getItem(POI_LAYOUT_KEY) ?? '{}') ?? {}; } catch { got = {}; }
  return { left: num(got.left) ?? POI_LAYOUT_DEFAULTS.left, right: num(got.right) ?? POI_LAYOUT_DEFAULTS.right, dm: num(got.dm) ?? POI_LAYOUT_DEFAULTS.dm };
}

/**
 * Clamps panel sizes `sz` to fit a `w` by `h` pixel viewport: clamps each panel to `POI_LAYOUT_BOUNDS`, shrinks the
 * right panel and then the left panel to preserve the minimum center gap, and caps the DM panel height so it stays
 * below `top` and leaves room for the tips button above it.
 * @param {{ left: number, right: number, dm: number | null }} sz @param {number} w @param {number} h @param {number} [top]
 */
export function fitPoiLayout(sz, w, h, top = DOCK_TOP) {
  const B = POI_LAYOUT_BOUNDS;
  let left = clamp(sz.left, B.left), right = clamp(sz.right, B.right);
  const room = (Number.isFinite(w) ? w : Infinity) - 32 - B.gap;
  if (left + right > room) right = Math.max(B.right[0], room - left);
  if (left + right > room) left = Math.max(B.left[0], room - right);
  const tallest = Math.max(B.dm[0], (Number.isFinite(h) ? h : Infinity) - Math.max(DOCK_TOP, top) - TIPS_ROOM - DOCK_BOTTOM);
  const dm = sz.dm == null ? null : Math.min(clamp(sz.dm, B.dm), tallest);
  return { left: Math.round(left), right: Math.round(right), dm: dm == null ? null : Math.round(dm) };
}

/**
 * Computes each side panel's top offset in a `w`-pixel-wide window given the top toolbar's bounding rect `bar` (null or
 * zero-height when hidden). Any side panel overlapped horizontally by `bar` starts below it, while non-overlapping
 * panels start at `DOCK_TOP`; `free` is the Y coordinate just below `bar` used to cap the DM panel's height.
 * @param {{ left: number, right: number, bottom: number, height: number } | null | undefined} bar
 * @param {{ left: number, right: number }} f the docks' widths @param {number} w
 */
export function dockTops(bar, f, w) {
  if (!bar || !(bar.height > 0)) return { left: DOCK_TOP, right: DOCK_TOP, free: DOCK_TOP };
  const below = Math.max(DOCK_TOP, Math.ceil(bar.bottom) + 8);
  return { left: bar.left < 16 + f.left ? below : DOCK_TOP, right: bar.right > w - 16 - f.right ? below : DOCK_TOP, free: below };
}

/**
 * Creates the resize splitters for the editor panels and applies the current panel dimensions as CSS variables on the
 * document root.
 * @param {{ doc?: Document, root: HTMLElement, storage?: Storage | null, win?: any }} o
 */
export function createPoiLayout({ doc = document, root, storage = undefined, win = globalThis }) {
  const store = storageOf(storage);
  if (doc.getElementById && !doc.getElementById(POI_LAYOUT_STYLE_ID)) {
    const st = doc.createElement('style');
    st.id = POI_LAYOUT_STYLE_ID;
    st.textContent = POI_LAYOUT_CSS;
    (doc.head ?? doc.body)?.append(st);
  }
  let sz = readPoiLayout(store);
  const view = () => [Number(win?.innerWidth), Number(win?.innerHeight)];
  const page = /** @type {any} */ (doc.documentElement)?.style;
  const barOf = () => /** @type {any} */ (root.querySelector?.('.dfpoi-bar'));
  /** the sizes as they fit the window now */
  const fit = () => {
    const [w, h] = view();
    const widths = fitPoiLayout(sz, w, h);
    const top = dockTops(barOf()?.getBoundingClientRect?.(), widths, w);
    return { ...fitPoiLayout(sz, w, h, top.free), top };
  };
  /** the sizes written on the page */
  const apply = () => {
    const f = fit();
    page?.setProperty?.('--dfpoi-left-w', `${f.left}px`);
    page?.setProperty?.('--dfpoi-right-w', `${f.right}px`);
    page?.setProperty?.('--dfpoi-left-top', `${f.top.left}px`);
    page?.setProperty?.('--dfpoi-right-top', `${f.top.right}px`);
    if (f.dm == null) page?.removeProperty?.('--dfpoi-dm-h'); else page?.setProperty?.('--dfpoi-dm-h', `${f.dm}px`);
    return f;
  };
  const save = () => { try { store?.setItem(POI_LAYOUT_KEY, JSON.stringify(sz)); } catch { /* storage blocked or full: the sizes last this session */ } };

  const swallow = (e) => e.stopPropagation?.();
  /** @param {'left' | 'right' | 'dm'} which @param {string} cls */
  const splitter = (which, cls) => {
    const s = doc.createElement('div');
    s.className = `dfpoi-split ${cls}`;
    s.dataset.split = which;
    s.setAttribute('role', 'separator');
    s.setAttribute('aria-orientation', which === 'dm' ? 'horizontal' : 'vertical');
    s.title = t('poi.layout.splitHint', 'Drag to resize. Double-click to reset.');
    for (const ty of ['pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu', 'touchstart']) s.addEventListener(ty, swallow);
    s.addEventListener('pointerdown', (e) => {
      e.stopPropagation?.(); e.preventDefault?.();
      const start = { x: e.clientX, y: e.clientY, ...apply() };
      // the DM panel's own sheet height, as drawn when the drag starts
      if (start.dm == null) start.dm = domHeight();
      s.dataset.drag = '1';
      try { s.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer event */ }
      const move = (m) => {
        const dx = m.clientX - start.x, dy = m.clientY - start.y;
        if (which === 'left') sz.left = start.left + dx;
        else if (which === 'right') sz.right = start.right - dx;
        else sz.dm = start.dm - dy;
        const f = apply();
        sz = { left: f.left, right: f.right, dm: f.dm };
      };
      const up = () => {
        s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); s.removeEventListener('pointercancel', up);
        delete s.dataset.drag;
        save();
      };
      s.addEventListener('pointermove', move); s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up);
    });
    s.addEventListener('dblclick', (e) => { e.stopPropagation?.(); sz = { ...sz, [which]: POI_LAYOUT_DEFAULTS[which] }; apply(); save(); });
    return s;
  };
  /** the DM panel's height as drawn (its sheet's own, before it was first dragged) */
  const domHeight = () => {
    const dm = /** @type {any} */ (root.querySelector?.('.dfpoi-dm'));
    const h = dm?.getBoundingClientRect?.().height;
    return Number.isFinite(h) && h > 0 ? h : Math.min(0.56 * (view()[1] || 1000), 600);
  };
  const splitters = [splitter('left', 'dfpoi-split-v dfpoi-split-left'), splitter('right', 'dfpoi-split-v dfpoi-split-right'), splitter('dm', 'dfpoi-split-dm')];
  splitters[2].hidden = true;
  const onResize = () => apply();
  win?.addEventListener?.('resize', onResize);
  // the bar wraps onto more rows as the window or its buttons change: the docks under it follow
  const watch = typeof win?.ResizeObserver === 'function' ? new win.ResizeObserver(() => apply()) : null;
  if (barOf()) watch?.observe(barOf());
  apply();
  return {
    splitters,
    /** Shows or hides the DM panel's horizontal resize splitter. @param {boolean} on */
    setDm(on) { if (splitters[2].hidden === on) splitters[2].hidden = !on; },
    /** Returns the current viewport-fitted panel sizes. */
    sizes: () => fit(),
    destroy() {
      win?.removeEventListener?.('resize', onResize);
      watch?.disconnect();
      for (const p of ['--dfpoi-left-w', '--dfpoi-right-w', '--dfpoi-left-top', '--dfpoi-right-top', '--dfpoi-dm-h']) page?.removeProperty?.(p);
      for (const s of splitters) s.remove?.();
    },
  };
}

/** Maximum saved snap step for each gizmo mode: move in meters, rotate in degrees, and scale. */
export const POI_SNAP_KEPT_MAX = Object.freeze({ move: 100, turn: 180, size: 10 });

/** Reads saved snap steps and camera speed from `storage`, omitting any snap step outside `(0, POI_SNAP_KEPT_MAX]`
 *  and returning null for camera speed when missing or non-positive. @param {Storage | null} storage */
export function readPoiPrefs(storage) {
  let got = {};
  try { got = JSON.parse(storage?.getItem(POI_PREFS_KEY) ?? '{}') ?? {}; } catch { got = {}; }
  /** @type {{ move?: number, turn?: number, size?: number }} */
  const snap = {};
  for (const k of ['move', 'turn', 'size']) { const v = num(got?.snap?.[k]); if (v != null && v > 0 && v <= POI_SNAP_KEPT_MAX[k]) snap[k] = v; }
  const speed = num(got?.speed);
  return { snap, speed: speed != null && speed > 0 ? speed : null };
}

/**
 * Restores the editor's saved snap steps and camera speed from browser storage when the panel is created, and saves
 * them whenever they change.
 * @param {{ storage?: Storage | null }} [o]
 */
export function createPoiPrefs({ storage = undefined } = {}) {
  const store = storageOf(storage);
  let last = null;
  const now = (editor) => JSON.stringify({ snap: editor.snapSteps(), speed: editor.eyeSpeed?.() ?? null });
  return {
    /** Applies the saved snap steps and camera speed to `editor`. @param {any} editor */
    restore(editor) {
      if (typeof editor?.snapSteps !== 'function') return;
      const p = readPoiPrefs(store);
      if (Object.keys(p.snap).length) editor.setSnap?.(editor.snapOn?.() ?? false, p.snap);
      if (p.speed != null) editor.setEyeSpeed?.(p.speed);
      last = now(editor);
    },
    /** Saves the editor's current snap steps and camera speed if they have changed since the last save. @param {any}
     *  editor */
    note(editor) {
      if (typeof editor?.snapSteps !== 'function') return;
      const v = now(editor);
      if (v === last) return;
      last = v;
      try { store?.setItem(POI_PREFS_KEY, v); } catch { /* storage blocked or full: applies to this session only */ }
    },
  };
}
