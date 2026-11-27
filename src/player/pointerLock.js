import { isTextEntryTarget } from '../ui/input.js';
import { overlayOpen } from '../ui/enhancedOverlays.js';
import { isTouchDevice } from '../ui/touchDevice.js';

let _errBound = false;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

let _pageReleaseAt = -Infinity;
export const PAGE_RELEASE_MS = 500;
export const ESCAPE_DELIVERY_MS = 60;
export const REAL_ESCAPE_MS = 300;
export const TOUCH_UNLOCK_MS = 500;
const TOUCH_TYPES = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];

let _timeClosedInputBox = -Infinity;
export const INPUT_BOX_TOGGLE_REFUSAL_MS = 300;
export function noteInputBoxClosed(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  _timeClosedInputBox = now;
}
export const cursorToggleRefused = (now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) =>
  now - _timeClosedInputBox <= INPUT_BOX_TOGGLE_REFUSAL_MS;
let _cursorActive = false;
export const cursorActive = () => _cursorActive;
export const setCursorActive = (b) => { _cursorActive = !!b; };
export function toggleCursorActive(canvas) {
  _cursorActive = !_cursorActive;
  if (_cursorActive) releaseLook();
  else if (canvas) requestLook(canvas);
  return _cursorActive;
}

const _cursorHolds = new Set();
export const cursorHeld = () => _cursorHolds.size > 0;
export function holdCursor() {
  const hold = {};
  _cursorHolds.add(hold);
  releaseLook();
  return () => _cursorHolds.delete(hold) && _cursorHolds.size === 0;
}

export const FREE_MOUSE_ACTION = 'FreeMouse';

const _cursorKeyClaims = new Set();
export function claimCursorKey(takes = () => true) {
  const claim = { takes };
  _cursorKeyClaims.add(claim);
  return () => { _cursorKeyClaims.delete(claim); };
}
export function cursorKeyClaimed(e = null) {
  for (const c of _cursorKeyClaims) if (c.takes(e)) return true;
  return false;
}

export function bindCursorToggle(canvas, isWindowUp = () => false, actionsOf = null) {
  if (typeof addEventListener !== 'function' || !actionsOf) return () => {};
  setCursorActive(false);
  _cursorHolds.clear();
  let lastRealEscape = -Infinity;
  const onKey = (e) => {
    if (e.code === 'Escape' && e.isTrusted !== false && !e.dagSynthetic) lastRealEscape = nowMs();
    if (isWindowUp()) return;
    if (overlayOpen()) return;
    if (isTextEntryTarget(e.target)) return;
    const got = actionsOf(e);
    const acts = Array.isArray(got) ? got : got ? [got] : [];
    if (!acts.includes(FREE_MOUSE_ACTION) && !(acts.includes('ActivateCursor') && !cursorKeyClaimed(e))) return;
    e.preventDefault();
    if (_cursorHolds.size) return;
    if (cursorToggleRefused()) return;
    toggleCursorActive(canvas);
  };
  addEventListener('keydown', onKey, true);
  let held = typeof document !== 'undefined' && document.pointerLockElement === canvas;
  let pending = null;
  let lastTouch = -Infinity;
  const onTouch = () => { lastTouch = nowMs(); };
  const fingered = () => nowMs() - lastTouch < TOUCH_UNLOCK_MS;
  const quiet = () => isWindowUp() || overlayOpen() || _cursorActive || !pageHasFocus();
  const onLockChange = () => {
    const now = typeof document !== 'undefined' && document.pointerLockElement === canvas;
    const lost = held && !now;
    held = now;
    if (!lost) return;
    const at = nowMs();
    if (at - _pageReleaseAt < PAGE_RELEASE_MS || quiet()) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      if (held || quiet() || fingered() || nowMs() - lastRealEscape < REAL_ESCAPE_MS + ESCAPE_DELIVERY_MS) return;
      deliverEscape();
    }, ESCAPE_DELIVERY_MS);
  };
  if (typeof document !== 'undefined') {
    document.addEventListener?.('pointerlockchange', onLockChange);
    for (const t of TOUCH_TYPES) document.addEventListener?.(t, onTouch, { capture: true, passive: true });
  }
  const onDown = (e) => {
    if (e.pointerType === 'touch') return;
    if (typeof document === 'undefined' || document.pointerLockElement) return;
    const t = e.target;
    if (t !== canvas && t !== document.body && t !== document.documentElement) return;
    if (isWindowUp() || overlayOpen() || _cursorActive) return;
    requestLook(canvas);
  };
  if (typeof document !== 'undefined') document.addEventListener?.('pointerdown', onDown, true);
  return () => {
    removeEventListener('keydown', onKey, true);
    if (pending) { clearTimeout(pending); pending = null; }
    if (typeof document !== 'undefined') {
      document.removeEventListener?.('pointerdown', onDown, true);
      document.removeEventListener?.('pointerlockchange', onLockChange);
      for (const t of TOUCH_TYPES) document.removeEventListener?.(t, onTouch, true);
    }
  };
}

function pageHasFocus() {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState && document.visibilityState !== 'visible') return false;
  return typeof document.hasFocus === 'function' ? document.hasFocus() : true;
}

function deliverEscape() {
  if (typeof KeyboardEvent !== 'function') return;
  const target = globalThis.document ?? globalThis;
  for (const type of ['keydown', 'keyup']) {
    const e = new KeyboardEvent(type, { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true });
    e.dagSynthetic = true;
    target.dispatchEvent(e);
  }
}

export const SHELL_RELOCK_MS = 1000;
let _shellRelockAt = -Infinity;
function shellRelock(canvas) {
  const shell = globalThis.daggerShell;
  if (typeof shell?.relockPointer !== 'function' || _cursorActive) return;
  const at = nowMs();
  if (at - _shellRelockAt < SHELL_RELOCK_MS) return;
  _shellRelockAt = at;
  globalThis.__daggerRelock = () => { globalThis.__daggerRelock = null; requestLook(canvas); };
  try { shell.relockPointer(); } catch { }
}

let _lastRequestAt = -Infinity;
export const RELOCK_GRACE_MS = 150;

export function requestLook(canvas) {
  if (_cursorActive || _cursorHolds.size) return;
  if (isTouchDevice()) return;
  _lastRequestAt = nowMs();
  if (!_errBound && typeof document !== 'undefined') {
    document.addEventListener('pointerlockerror', () => {
      console.warn('[input] pointer lock refused (focus/cooldown); the next gesture retries');
    }, false);
    document.addEventListener('pointerlockchange', () => { if ((_cursorActive || _cursorHolds.size) && document.pointerLockElement) releaseLook(); }, false);
    _errBound = true;
  }
  if (typeof document !== 'undefined' && document.pointerLockElement === canvas) return;
  try {
    const p = canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        if (err?.name !== 'NotSupportedError') { shellRelock(canvas); return; }
        try {
          const q = canvas.requestPointerLock();
          if (q && typeof q.catch === 'function') q.catch(() => shellRelock(canvas));
        } catch { }
      });
    }
  } catch {
  }
}

export function releaseLook() {
  if (typeof document !== 'undefined' && document.pointerLockElement) {
    _pageReleaseAt = nowMs();
    try { document.exitPointerLock(); } catch { }
  }
}

export function makeLookGate(canvas) {
  let wasHeld = false;
  return (held) => {
    if (held) { if (nowMs() - _lastRequestAt > RELOCK_GRACE_MS) releaseLook(); }
    else if (wasHeld) requestLook(canvas);
    wasHeld = held;
  };
}
