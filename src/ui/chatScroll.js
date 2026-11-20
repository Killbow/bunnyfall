// BUNNYFALL CHAT-REWORK (2026-11-20, the owner: "scrolling sucks"): SMOOTH WHEEL SCROLLING for the chat's lists.
//
// A mouse wheel's notch (a line, or a jump of 50px and more) is eased over a few frames instead of snapping, so a
// reader keeps their place by eye. A touchpad's small pixel steps are already smooth and are left to the browser, as
// is a wheel at the list's end (the page under it is the box's own swallow's business, ui/chatPanel.js). The frames
// are asked of the window the list stands in, so a chat popped out into its own window (ui/chatPopout.js) eases on
// that window's clock and not on the game's, which may be in the background.

/** Eased wheel scrolling on `el`. Answers `{ target, to, stop }`: where an easing is heading (null when none), an eased
 *  scroll to a place (the "new messages" pill), and a stop (a jump that must land at once). */
export function smoothWheel(el) {
  let target = null;
  let frame = 0;
  const view = () => el.ownerDocument?.defaultView ?? globalThis;
  const maxTop = () => Math.max(0, (el.scrollHeight ?? 0) - (el.clientHeight ?? 0));
  const step = () => {
    frame = 0;
    if (target == null) return;
    const cur = el.scrollTop;
    const goal = Math.max(0, Math.min(maxTop(), target));
    const d = goal - cur;
    if (Math.abs(d) < 1) { el.scrollTop = goal; target = null; return; }
    el.scrollTop = cur + d * 0.28;
    if (el.scrollTop === cur) { target = null; return; }   // the engine would not move it (rounding at an end)
    frame = view().requestAnimationFrame?.(step) ?? 0;
  };
  const go = (to) => {
    target = to;
    if (!frame) frame = view().requestAnimationFrame?.(step) ?? 0;
    if (!frame) { el.scrollTop = to; target = null; }   // no frames to ask (a test's fake): land at once
  };
  el.addEventListener('wheel', (e) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const lines = e.deltaMode === 1, pages = e.deltaMode === 2;
    const dy = e.deltaY * (lines ? 18 : pages ? (el.clientHeight || 200) : 1);
    if (!dy) return;
    if (!lines && !pages && Math.abs(dy) < 50) { target = null; return; }   // a touchpad: the browser's own glide
    const base = target ?? el.scrollTop;
    const next = Math.max(0, Math.min(maxTop(), base + dy));
    if (next === base) return;
    e.preventDefault?.();
    go(next);
  }, { passive: false });
  return {
    target: () => target,
    to: (top) => go(Math.max(0, Math.min(maxTop(), top))),
    stop: () => { target = null; },
  };
}
