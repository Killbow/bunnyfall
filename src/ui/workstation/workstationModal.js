// @ts-check
// BUNNYFALL WORKSTATION MODAL: the Bench and the Provisioning pot or cauldron as a window of their own, so neither depends on
// the pause book's UI scale. The window is a fixed 1280x800 stage scaled to fit the screen (letterboxed), so its layout is the
// same at any scale; each pane scrolls on its own and nothing else does. It hosts the pages as they are (craftWindow.js
// drawBench, provisioning/provPage.js drawProvPage): every number and call is theirs, only the room they stand in is new.
import { drawBench } from '../professions/craftWindow.js';
import { drawProvPage } from '../provisioning/provPage.js';
import { profProvider, stationHere, stationsHere } from '../professions/profPages.js';

const ID = 'bf-workstation';
const W = 1280, H = 800;

const CSS = `
#${ID} { position: fixed; inset: 0; z-index: 99990; display: flex; align-items: center; justify-content: center; background: rgba(6,7,10,.82); }
#${ID} .wsm-stage { width: ${W}px; height: ${H}px; max-width: none; max-height: none; flex: none; transform-origin: center center; display: flex; flex-direction: column; }
#${ID} .wsm-top { flex: none; display: flex; align-items: center; gap: 16px; padding: 8px 16px; border-bottom: 2px solid #7d7460; }
#${ID} .wsm-title { font-size: 24px; letter-spacing: .12em; text-transform: uppercase; color: rgb(243,239,44); text-shadow: 1px 1px 0 rgb(93,77,12); }
#${ID} .wsm-sub { color: #b9ab93; font-size: 15px; }
#${ID} .wsm-x { margin: 0 0 0 auto; }
/* one scroll for the whole window: the body scrolls, no list or card inside it does */
#${ID} .wsm-body { flex: 1 1 auto; min-height: 0; padding: 12px 16px 16px; overflow-y: auto; overflow-x: hidden; }
#${ID} .wsm-body .cw, #${ID} .wsm-body .pv { display: flex; flex-direction: column; gap: 10px; }
#${ID} .wsm-body .cw-body, #${ID} .wsm-body .pv-body { display: flex; flex-wrap: nowrap; align-items: flex-start; gap: 14px; }
#${ID} .wsm-body .cw-list, #${ID} .wsm-body .pv-book, #${ID} .wsm-body .pv-ings { max-height: none; overflow: visible; padding: 0; }
#${ID} .wsm-body .cw-list, #${ID} .wsm-body .pv-book { flex: 0 0 250px; }
#${ID} .wsm-body .pv-ings { flex: 0 0 300px; }
#${ID} .wsm-body .cw-body > .cw-card, #${ID} .wsm-body .pv-mid { flex: 1 1 0; min-width: 0; overflow: visible; }
#${ID} .wsm-body .cw-card.cw-ws { display: grid; grid-template-columns: 1.3fr 1fr; align-content: start; gap: 12px 16px; }
#${ID} .wsm-body .cw-ws-sum { grid-column: 1 / -1; }
#${ID} .wsm-body .cw-help-btn { align-self: flex-start; }
#${ID} .wsm-body .cw-help { max-height: none; overflow: visible; }
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
  // the game's keys stay out of the window (the search boxes), Esc closes it
  const stop = (/** @type {KeyboardEvent} */ e) => { if (e.type === 'keydown' && e.key === 'Escape') { e.preventDefault(); closeWorkstation(); } e.stopPropagation(); };
  for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, stop);
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
}

function draw() {
  if (!_open) return;
  const p = profProvider();
  const { host, root, kind } = _open;
  const top = host.scrollTop;
  host.replaceChildren();
  const rerender = () => draw();
  /** @type {HTMLElement} */ (root.querySelector('.wsm-title')).textContent = kind === 'bench' ? 'The Bench' : 'Provisioning';
  /** @type {HTMLElement} */ (root.querySelector('.wsm-sub')).textContent = kind === 'bench' ? 'Choose a piece, pick its materials, make it' : 'The pot and the cauldron';
  if (kind === 'bench') drawBench(host, rerender, p, stationHere(), () => closeWorkstation(), stationsHere());
  else drawProvPage(host, rerender, p, stationHere(), { go: () => closeWorkstation() });
  dress(host);
  host.scrollTop = top;
}
