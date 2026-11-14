// @ts-check
// The Bench and the Provisioning pot or cauldron open in this window of their own. It is a fixed 1280x800 stage scaled
// to fit the screen (letterboxed), so its layout does not depend on the UI scale. Each list scrolls on its own, and the
// Craft and Cook buttons stay in view. The pages draw their own content (craftWindow.js drawBench,
// provisioning/provPage.js drawProvPage), and this file restyles and frames them.
import { drawBench } from '../professions/craftWindow.js';
import { drawProvPage, setDownProv } from '../provisioning/provPage.js';
import { profProvider, stationHere, stationsHere } from '../professions/profPages.js';
import { overlayAction } from '../input.js';

const ID = 'bf-workstation';
const W = 1280, H = 800;

const CSS = `
#${ID} { position: fixed; inset: 0; z-index: 99990; display: flex; align-items: center; justify-content: center; background: rgba(6,7,10,.82); }
#${ID} .wsm-stage { width: ${W}px; height: ${H}px; max-width: none; max-height: none; flex: none; transform-origin: center center; display: flex; flex-direction: column; }
#${ID} .wsm-top { flex: none; display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-bottom: 2px solid #7d7460; }
#${ID} .wsm-title { font-size: 24px; letter-spacing: .12em; text-transform: uppercase; color: rgb(243,239,44); text-shadow: 1px 1px 0 rgb(93,77,12); }
#${ID} .wsm-sub { color: #b9ab93; font-size: 15px; }
#${ID} .wsm-x { margin: 0 0 0 auto; }
#${ID} .wsm-body { flex: 1 1 auto; min-height: 0; padding: 12px 16px 16px; display: flex; flex-direction: column; overflow: hidden; }
#${ID} .wsm-body > .cw, #${ID} .wsm-body > .pv { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
#${ID} .wsm-body > .cw { overflow-x: hidden; overflow-y: auto; }
#${ID} .wsm-body .cw-body, #${ID} .wsm-body .pv-body { flex: 1 1 auto; min-height: 0; display: flex; flex-wrap: nowrap; align-items: stretch; gap: 14px; }
#${ID} .wsm-body .cw-body { min-height: 320px; }
#${ID} .wsm-body .cw-list, #${ID} .wsm-body .pv-book { flex: 0 0 250px; }
#${ID} .wsm-body .pv-ings { flex: 0 0 300px; }
#${ID} .wsm-body .cw-body > .cw-card, #${ID} .wsm-body .pv-mid { flex: 1 1 0; min-width: 0; }
#${ID} .wsm-body .cw-list, #${ID} .wsm-body .wsm-card-scroll, #${ID} .wsm-body .pv-book, #${ID} .wsm-body .pv-mid, #${ID} .wsm-body .pv-ings { min-height: 0; max-height: none; overflow-x: hidden; overflow-y: auto; }
#${ID} .wsm-body .cw-list, #${ID} .wsm-body .pv-book, #${ID} .wsm-body .pv-mid, #${ID} .wsm-body .pv-ings { padding: 0 6px 0 0; }
#${ID} .wsm-body .pv-sum { flex: none; }
#${ID} .wsm-body .cw-body > .cw-card { display: flex; flex-flow: column nowrap; align-items: stretch; overflow: hidden; }
#${ID} .wsm-body .wsm-card-scroll { flex: 1 1 auto; display: flex; flex-direction: column; gap: 10px; }
#${ID} .wsm-body .cw-card.cw-ws > .wsm-card-scroll { display: grid; grid-template-columns: 1.3fr 1fr; align-content: start; gap: 12px 16px; }
#${ID} .wsm-body .cw-ws-sum { grid-column: 1 / -1; }
#${ID} .wsm-body .cw-body > .cw-card > .cw-actions { flex: none; justify-content: flex-end; padding-top: 10px; border-top: 2px solid #6b5228; }
#${ID} .wsm-body .cw-help-btn { align-self: flex-start; }
#${ID} .wsm-body > .cw-help { flex: none; max-height: 240px; overflow-y: auto; }
#${ID} .wsm-body .prof-family, #${ID} .wsm-body .act { font-size: 15px; }
#${ID} .wsm-body .prof-family { padding: 5px 11px; }
#${ID} .wsm-body .prof-search { font-size: 15px; padding: 6px 10px; }
`;

/** @type {{ root: HTMLElement, host: HTMLElement, kind: string } | null} */
let _open = null;
let _keyOff = /** @type {null | (() => void)} */ (null);

const fit = () => {
  if (!_open) return;
  const stage = /** @type {HTMLElement} */ (_open.root.querySelector('.wsm-stage'));
  const s = Math.min((globalThis.innerWidth - 16) / W, (globalThis.innerHeight - 16) / H, 1.6);
  stage.style.transform = `scale(${Math.max(0.3, s)})`;
};

export const workstationOpen = () => !!_open;

export function closeWorkstation() {
  if (!_open) return;
  setDownProv();
  _open.root.remove();
  _open = null;
  _keyOff?.(); _keyOff = null;
  globalThis.removeEventListener?.('resize', fit);
}

/** Opens the window: kind 'bench' or 'prov'. A second call redraws the one that is up. */
export function openWorkstation(/** @type {'bench'|'prov'} */ kind) {
  const doc = globalThis.document;
  const p = profProvider();
  if (!doc || !p) return;
  if (_open && _open.kind === kind) { draw(); return; }
  closeWorkstation();
  try { doc.exitPointerLock?.(); } catch { /* none held */ }
  if (!doc.getElementById(`${ID}-style`)) { const st = doc.createElement('style'); st.id = `${ID}-style`; st.textContent = CSS; doc.head.append(st); }
  const root = doc.createElement('div');
  root.id = ID;
  root.innerHTML = `<div class="wsm-stage px-win px-sys"><div class="wsm-top"><span class="wsm-title"></span><span class="wsm-sub"></span><button type="button" class="act wsm-x">Close (Esc)</button></div><div class="wsm-body"></div></div>`;
  root.addEventListener('mousedown', (e) => { if (e.target === root) closeWorkstation(); });
  /** @type {HTMLElement} */ (root.querySelector('.wsm-x')).onclick = closeWorkstation;
  const stop = (/** @type {KeyboardEvent} */ e) => e.stopPropagation();
  for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, stop);
  // A running Bench minigame handles Escape itself, on the document after this listener. The pause menu's window
  // listener can be added after this one (a station key opens both), so stopImmediatePropagation keeps it from also
  // resuming the game.
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || overlayAction(e) !== 'back' || root.querySelector('.cw-act')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat && !setDownProv()) closeWorkstation();
  };
  globalThis.addEventListener('keydown', onKey, { capture: true });
  _keyOff = () => globalThis.removeEventListener('keydown', onKey, { capture: true });
  doc.body.append(root);
  _open = { root, host: /** @type {HTMLElement} */ (root.querySelector('.wsm-body')), kind };
  globalThis.addEventListener?.('resize', fit);
  draw();
  fit();
}

/** The pages' own buttons, chips and boxes wear the game's: the pause window's Act, chip and search. */
function dress(/** @type {HTMLElement} */ host) {
  for (const e of host.querySelectorAll('.cw-btn, .cw-tab, .pv-btn')) { e.classList.add('act'); if (e.classList.contains('cw-primary') || e.classList.contains('primary') || e.classList.contains('cw-on')) e.classList.add('primary'); }
  for (const e of host.querySelectorAll('.cw-chip, .pv-chip:not(input), .cw-look-chip')) { e.classList.add('prof-family'); if (e.classList.contains('cw-on') || e.classList.contains('on')) e.classList.add('on'); }
  for (const e of host.querySelectorAll('input.cw-search, input.pv-chip')) e.classList.add('prof-search');
  const card = host.querySelector('.cw-body > .cw-card');
  if (card) {
    const bar = [...card.children].find((e) => e.classList?.contains('cw-actions')) ?? card.querySelector('.cw-ws-sum > .cw-actions');
    const scroll = globalThis.document.createElement('div');
    scroll.className = 'wsm-card-scroll';
    scroll.append(...[...card.children].filter((e) => e !== bar));
    card.replaceChildren(scroll, ...(bar ? [bar] : []));
  }
}

const PANES = ['.cw', '.cw-body > .cw-list', '.wsm-card-scroll', '.pv-book', '.pv-mid', '.pv-ings'];

function draw() {
  if (!_open) return;
  const p = profProvider();
  const { host, root, kind } = _open;
  const tops = PANES.map((s) => host.querySelector(s)?.scrollTop ?? 0);
  host.replaceChildren();
  const rerender = () => draw();
  /** @type {HTMLElement} */ (root.querySelector('.wsm-title')).textContent = kind === 'bench' ? 'The Bench' : 'Provisioning';
  /** @type {HTMLElement} */ (root.querySelector('.wsm-sub')).textContent = kind === 'bench' ? 'Choose a piece, pick its materials, make it' : 'The pot and the cauldron';
  if (kind === 'bench') drawBench(host, rerender, p, stationHere(), () => closeWorkstation(), stationsHere());
  else drawProvPage(host, rerender, p, stationHere(), { go: () => closeWorkstation() });
  dress(host);
  PANES.forEach((s, i) => { const e = host.querySelector(s); if (e) e.scrollTop = tops[i]; });
}
