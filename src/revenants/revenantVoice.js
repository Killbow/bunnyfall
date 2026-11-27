// @ts-check
// A face registers here to draw revenant events. With none, or one that declines, the host's say speaks the line.
// It imports nothing, so the HUD card can call it without pulling in the revenant system.

/** @type {null | ((ev: any) => boolean)} */
let _presenter = null;
export function setRevenantPresenter(fn) { _presenter = typeof fn === 'function' ? fn : null; }
export function revenantSay(ev, say = null) {
  if (!ev) return false;
  let shown = false;
  try { shown = !!_presenter?.(ev); } catch { shown = false; }
  if (!shown && ev.line) say?.(ev.line);
  return shown;
}
