// Where the chat box sits and how big it is: the size presets and Reset in Settings > Chat, and the pointer drags.
// Those resize the box, move it, and move the drawer's split. A saved place is drawn inside a smaller window without
// being lost, and the chat's own window keeps its size and place.
import { getPref, setPref } from '../systems/uiPrefs.js';
import { capturePointer, releasePointer } from './pointerCapture.js';

/** Width x list height in CSS px; Medium is the sheet's own size (no prefs). */
export const CHAT_BOX_PRESETS = Object.freeze({
  small: Object.freeze([352, 140]),
  medium: Object.freeze([null, null]),
  large: Object.freeze([600, 360]),
});
export const CHAT_BOX_CUSTOM = 'custom';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

export function chatBoxPreset(w = num(getPref('chatWidth')), h = num(getPref('chatListHeight'))) {
  for (const [id, [pw, ph]] of Object.entries(CHAT_BOX_PRESETS)) if (pw === w && ph === h) return id;
  return CHAT_BOX_CUSTOM;
}
export function setChatBoxPreset(id) {
  const p = Object.hasOwn(CHAT_BOX_PRESETS, id) ? CHAT_BOX_PRESETS[id] : null;
  if (!p) return false;
  setPref('chatWidth', p[0]);
  setPref('chatListHeight', p[1]);
  return true;
}
export function resetChatBox() {
  for (const k of ['chatWidth', 'chatListHeight', 'chatLeft', 'chatTop', 'chatDrawerW']) setPref(k, null);
}

export function savedChatPlace() {
  const x = getPref('chatLeft'), y = getPref('chatTop');
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Clamps a place into a vw x vh window: the whole box width inside it, and at least 120px of its top on screen. */
export function shownPlace(x, y, w, h, vw, vh) {
  return {
    x: Math.round(Math.min(Math.max(0, x), Math.max(0, vw - w))),
    y: Math.round(Math.min(Math.max(0, y), Math.max(0, vh - Math.min(h, 120)))),
  };
}

/** True when a press in the top bar landed on its empty part (the bar or the tab strip), not on a tab or a button. */
export const isBarGap = (target, bar, strip) => target === bar || target === strip;

/**
 * A pointer drag on `node`, captured to it. `start(e)` returns the drag state, or null for no drag.
 * `move(state, dx, dy)` gets the travel from the press, and `end(state)` runs on release.
 */
export function pointerDrag(node, { start, move, end = null }) {
  let d = null;
  node.addEventListener('pointerdown', (e) => {
    if (d || (e.button != null && e.button !== 0)) return;
    const st = start(e);
    if (st == null) return;
    e.preventDefault?.();
    d = { st, id: e.pointerId ?? null, x: Number(e.clientX) || 0, y: Number(e.clientY) || 0 };
    if (d.id != null) capturePointer(node, d.id);
  });
  node.addEventListener('pointermove', (e) => {
    if (!d || (d.id != null && e.pointerId != null && e.pointerId !== d.id)) return;
    move(d.st, (Number(e.clientX) || 0) - d.x, (Number(e.clientY) || 0) - d.y);
  });
  const stop = () => {
    if (!d) return;
    const { st, id } = d;
    d = null;
    if (id != null) releasePointer(node, id);
    end?.(st);
  };
  node.addEventListener('pointerup', stop);
  node.addEventListener('pointercancel', stop);
  return { active: () => !!d };
}

export const CHAT_POP_SIZE = Object.freeze({ w: 560, h: 640, minW: 300, minH: 240 });

/** The pop-out's window.open features: its saved size and screen place, else the default size. */
export function chatPopFeatures() {
  const w = num(getPref('chatPopW')), h = num(getPref('chatPopH'));
  const x = getPref('chatPopX'), y = getPref('chatPopY');
  let f = `popup=yes,width=${Math.round(Math.max(CHAT_POP_SIZE.minW, w ?? CHAT_POP_SIZE.w))},height=${Math.round(Math.max(CHAT_POP_SIZE.minH, h ?? CHAT_POP_SIZE.h))}`;
  if (Number.isFinite(x) && Number.isFinite(y)) f += `,left=${Math.round(x)},top=${Math.round(y)}`;
  return f;
}

/** The pop-out's last seen size and place: `sample` reads it off the window while it is open, `save` writes it. */
export function createPopMemory() {
  let seen = null;
  return {
    sample(pw) {
      try {
        const g = { chatPopW: pw.innerWidth, chatPopH: pw.innerHeight, chatPopX: pw.screenX, chatPopY: pw.screenY };
        if (Object.values(g).every(Number.isFinite) && g.chatPopW > 0 && g.chatPopH > 0) seen = g;
      } catch { /* the window went */ }
    },
    save() {
      if (!seen) return;
      for (const [k, v] of Object.entries(seen)) if (getPref(k) !== Math.round(v)) setPref(k, Math.round(v));
    },
  };
}
