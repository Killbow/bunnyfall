// @ts-check
// BUNNYFALL (2026-11-12, the owner: "make the entire staff panel and staff.html merged into one staff panel i can access
// in game both on the client and web version with a button? like one movable ui button"): THE STAFF DOCK. A staff-only
// button at the screen's edge (a HUD piece, moved and sized with Alt+U) opens a window over the game that holds the staff
// page itself (staff.html?embed=1, src/tools/staffPanel.js) - one panel, the same on the web and in the desktop app, and
// the same page a browser opens on its own.
//
// THE DOOR'S RELAY. The game's staff hook (net/staffHook.js staffHookDoor) speaks window messages on its own window and
// origin only - it was made for an extension's content script. The panel lives in an iframe here, so the dock carries the
// words both ways: what the iframe posts is posted again on this window (tagged `_fromPanel`, so the dock does not send it
// back), and every `dfoStaff` word this window hears that the panel did not say goes into the iframe. Follow, the live map,
// Hide me, the staff tags and the staff bar work as they did with the extension.
//
// Who is staff is the account service's word (/v1/staffcmd/vanish answers `staff-only` to anyone else): the dock asks it
// once a minute until it knows, and never makes the button or the iframe for a player.
import { staffVanish } from '../net/accountClient.js';
import { hudArranging } from './hud/hudLayout.js';
import { pauseFlowShowing } from './pauseDoor.js';
import { loadingHeld } from './loadingScreen.js';

const TAB_ID = 'bf-staff-tab', WIN_ID = 'bf-staff-dock', PLACE_KEY = 'bunnyfall.staffDock.place';
const ASK_EVERY_MS = 60_000;
const CSS = `
#${TAB_ID} { position: fixed; right: 14px; top: calc(38% + 2px); z-index: 40; width: 44px; height: 44px; padding: 0;
  border-radius: 6px; border: 2px solid rgb(201, 164, 74); cursor: pointer; font: 700 13px system-ui, sans-serif; letter-spacing: .04em;
  background: rgb(30, 22, 12); color: rgb(243, 226, 150); box-shadow: 0 0 0 1px rgb(40,28,10), 0 4px 14px rgba(0,0,0,0.55); }
#${TAB_ID}:hover { transform: scale(1.08); }
#${TAB_ID}.on { background: rgb(92, 24, 14); }
#${WIN_ID} { position: fixed; z-index: 65; display: flex; flex-direction: column; min-width: 380px; min-height: 260px;
  background: #0d1014; border: 2px solid rgb(201, 164, 74); border-radius: 6px; box-shadow: 0 14px 50px rgba(0,0,0,0.7);
  resize: both; overflow: hidden; }
#${WIN_ID} .bar { display: flex; align-items: center; gap: 8px; padding: 4px 6px 4px 10px; cursor: move; user-select: none;
  background: rgb(30, 22, 12); color: rgb(243, 226, 150); font: 700 12px system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
#${WIN_ID} .bar span { flex: 1; }
#${WIN_ID} .bar button { font: 12px system-ui, sans-serif; color: rgb(243, 226, 150); background: transparent; cursor: pointer;
  border: 1px solid rgb(120, 84, 40); border-radius: 3px; padding: 2px 8px; }
#${WIN_ID} .bar button:hover { border-color: rgb(243, 226, 150); }
#${WIN_ID} iframe { flex: 1; width: 100%; border: 0; background: #0d1014; }
#${WIN_ID}.dragging iframe { pointer-events: none; }
`;

const readPlace = () => {
  try {
    const p = JSON.parse(globalThis.localStorage?.getItem(PLACE_KEY) ?? 'null');
    if (p && [p.x, p.y, p.w, p.h].every(Number.isFinite)) return p;
  } catch { /* the default */ }
  return null;
};
const keepPlace = (/** @type {HTMLElement} */ w) => {
  try { globalThis.localStorage?.setItem(PLACE_KEY, JSON.stringify({ x: w.offsetLeft, y: w.offsetTop, w: w.offsetWidth, h: w.offsetHeight })); } catch { /* not kept */ }
};

/** The page the dock holds: staff.html beside the game, at its site's root (the web's /, the desktop app's dagger://game/). */
export function staffPageUrl(loc = globalThis.location, embed = true) {
  return `${loc.origin}/staff.html${embed ? '?embed=1' : ''}`;
}

/**
 * @param {{ io: () => any, ready?: () => boolean, win?: any, now?: () => number }} deps
 *   io     the account service's door, or null signed out
 *   ready  whether the world stands (the button hides behind a pause or a loading screen)
 */
export function createStaffDock({ io, ready = () => true, win = globalThis.window, now = () => Date.now() }) {
  /** null unknown, true staff, false a player */
  let staff = /** @type {boolean|null} */ (null);
  let askedAt = -Infinity, asking = false, lastIo = /** @type {any} */ (null);
  let frame = /** @type {HTMLIFrameElement|null} */ (null), box = /** @type {HTMLElement|null} */ (null), tab = /** @type {HTMLElement|null} */ (null);
  let open = false;
  const origin = win?.location?.origin;

  // ── the relay ──
  win?.addEventListener?.('message', (/** @type {MessageEvent} */ e) => {
    const m = /** @type {any} */ (e.data);
    if (!frame?.contentWindow || !m || e.origin !== origin) return;
    if (m.dfoStaffDock === 'close' && e.source === frame.contentWindow) { show(false); return; }   // Esc inside the panel
    if (typeof m.dfoStaff !== 'string') return;
    if (e.source === frame.contentWindow) { win.postMessage({ ...m, _fromPanel: true }, origin); return; }
    if (e.source === win && !m._fromPanel) frame.contentWindow.postMessage(m, origin);
  });

  function style() {
    if (document.getElementById(`${TAB_ID}-css`)) return;
    const s = document.createElement('style'); s.id = `${TAB_ID}-css`; s.textContent = CSS; document.head.append(s);
  }
  const shield = (/** @type {HTMLElement} */ n) => {
    for (const ty of ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'wheel', 'contextmenu']) n.addEventListener(ty, (e) => { if (!hudArranging()) e.stopPropagation(); });
  };

  function makeWindow() {
    if (box) return;
    style();
    box = document.createElement('div'); box.id = WIN_ID; box.style.display = 'none';
    const p = readPlace();
    const W = win.innerWidth || 1280, H = win.innerHeight || 720;
    const w = Math.min(p?.w ?? 820, W - 20), h = Math.min(p?.h ?? 600, H - 20);
    Object.assign(box.style, { width: `${w}px`, height: `${h}px`, left: `${Math.max(0, Math.min(p?.x ?? (W - w) / 2, W - 120))}px`, top: `${Math.max(0, Math.min(p?.y ?? 40, H - 40))}px` });
    const bar = document.createElement('div'); bar.className = 'bar';
    const title = document.createElement('span'); title.textContent = 'Staff panel';
    const pop = document.createElement('button'); pop.type = 'button'; pop.textContent = 'Own window'; pop.title = 'Open the staff page in its own window (Follow and the live map stay with this one)';
    pop.onclick = () => win.open(staffPageUrl(win.location, false), '_blank');
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
    close.onclick = () => show(false);
    bar.append(title, pop, close);
    frame = document.createElement('iframe');
    frame.src = staffPageUrl(win.location);
    frame.title = 'Staff panel';
    box.append(bar, frame);
    shield(box);
    // moving: by the bar; the corner's resize is the browser's own (CSS resize)
    bar.addEventListener('pointerdown', (e) => {
      if (/** @type {HTMLElement} */ (e.target).tagName === 'BUTTON' || !box) return;
      const b = box, sx = e.clientX - b.offsetLeft, sy = e.clientY - b.offsetTop;
      b.classList.add('dragging');
      const move = (/** @type {PointerEvent} */ ev) => {
        b.style.left = `${Math.max(0, Math.min(ev.clientX - sx, (win.innerWidth || 1280) - 120))}px`;
        b.style.top = `${Math.max(0, Math.min(ev.clientY - sy, (win.innerHeight || 720) - 30))}px`;
      };
      const up = () => { b.classList.remove('dragging'); win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); keepPlace(b); };
      win.addEventListener('pointermove', move); win.addEventListener('pointerup', up);
    });
    box.addEventListener('mouseup', () => { if (box && open) keepPlace(box); });   // a resize ends on a mouseup inside
    document.body.append(box);
  }

  function show(/** @type {boolean} */ on) {
    if (!box) return;
    open = on;
    box.style.display = on ? 'flex' : 'none';
    tab?.classList.toggle('on', on);
    if (on) { try { document.exitPointerLock?.(); } catch { /* not locked */ } frame?.focus(); }
  }

  function drawTab(/** @type {boolean} */ visible) {
    if (!visible) { if (tab) tab.style.display = 'none'; return; }
    if (!tab) {
      style();
      tab = document.createElement('button');
      tab.id = TAB_ID; tab.setAttribute('type', 'button'); tab.textContent = 'ST';
      tab.title = 'Staff panel';
      tab.setAttribute('aria-label', 'Open the staff panel');
      shield(tab);
      tab.addEventListener('click', (e) => { e.preventDefault(); if (hudArranging()) return; e.stopPropagation(); show(!open); });
      document.body.append(tab);
    }
    tab.style.display = '';
  }

  async function ask() {
    const door = io();
    if (!door || asking) return;
    asking = true; askedAt = now();
    try {
      const r = await staffVanish(door);
      if (r?.ok && r.data?.staff) staff = true;
      else if (r?.error === 'staff-only') staff = false;   // anything else (no network) asks again next minute
    } catch { /* again next minute */ } finally { asking = false; }
  }

  return {
    /** Each world frame: who is staff (asked again on a new sign-in), the button, and the window kept for staff only. */
    frame() {
      const door = io();
      if (door !== lastIo) { lastIo = door; staff = door ? staff : null; if (!door) askedAt = -Infinity; }
      if (staff !== true && door && now() - askedAt > ASK_EVERY_MS) ask();
      if (staff === true) makeWindow();
      else if (box && staff === false) { box.remove(); box = null; frame = null; open = false; }
      drawTab(staff === true && (ready() ?? true) && !pauseFlowShowing() && !loadingHeld());
    },
    /** Open or shut the window (a chat command may). */
    toggle: () => { if (staff === true) { makeWindow(); show(!open); } return staff === true; },
    isOpen: () => open,
  };
}
