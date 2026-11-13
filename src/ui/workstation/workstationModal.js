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
#${ID} { position: fixed; inset: 0; z-index: 99990; display: flex; align-items: center; justify-content: center; background: rgba(6,7,10,.82);
  font-family: var(--dfo-text-font, 'Alegreya', Georgia, serif); color: #e8e2d0; }
#${ID} .wsm-stage { width: ${W}px; height: ${H}px; flex: none; transform-origin: center center; display: flex; flex-direction: column;
  background: #16130e; border: 2px solid #8a6a32; box-shadow: 0 10px 50px rgba(0,0,0,.7); overflow: hidden; }
#${ID} .wsm-top { flex: none; height: 52px; display: flex; align-items: center; gap: 16px; padding: 0 16px; border-bottom: 2px solid #6b5228; background: #1c150e; }
#${ID} .wsm-title { font-size: 24px; letter-spacing: 1px; color: #d9b45a; font-variant: small-caps; }
#${ID} .wsm-sub { color: #b8b09a; font-size: 14px; }
#${ID} .wsm-x { margin-left: auto; font: inherit; font-size: 15px; padding: 5px 14px; color: #e8e2d0; background: rgba(10,12,17,.55); border: 1px solid #6b5228; cursor: pointer; }
#${ID} .wsm-x:hover { border-color: #d9b45a; }
#${ID} .wsm-body { flex: 1 1 auto; min-height: 0; padding: 12px 16px; display: flex; flex-direction: column; overflow: hidden; font-size: 15px; }
/* one scrollbar per pane: the pages' own lists and cards scroll, the body does not */
#${ID} .wsm-body > .cw, #${ID} .wsm-body > .pv, #${ID} .wsm-body > div { flex: 1 1 auto; min-height: 0; }
#${ID} .wsm-body .cw, #${ID} .wsm-body .pv { display: flex; flex-direction: column; gap: 10px; min-height: 0; height: 100%; }
#${ID} .wsm-body .cw-body, #${ID} .wsm-body .pv-body { flex: 1 1 auto; min-height: 0; display: flex; flex-wrap: nowrap; align-items: stretch; gap: 14px; }
#${ID} .wsm-body .cw-list { flex: 0 0 250px; max-height: none; min-height: 0; overflow-y: auto; }
#${ID} .wsm-body .cw-body > .cw-card { flex: 1 1 0; min-width: 0; min-height: 0; overflow-y: auto; }
#${ID} .wsm-body .cw-card.cw-ws { display: grid; grid-template-columns: 1.3fr 1fr; grid-auto-rows: min-content; align-content: start; gap: 12px 16px; }
#${ID} .wsm-body .cw-ws-sum { grid-column: 1 / -1; }
#${ID} .wsm-body .pv-book { flex: 0 0 250px; max-height: none; min-height: 0; overflow-y: auto; }
#${ID} .wsm-body .pv-mid { flex: 1 1 0; min-width: 0; min-height: 0; overflow-y: auto; }
#${ID} .wsm-body .pv-ings { flex: 0 0 300px; max-height: none; min-height: 0; overflow-y: auto; }
#${ID} .wsm-body .pv-sum { flex: none; }
#${ID} .wsm-body .cw-help-btn { align-self: flex-start; margin-bottom: 0; }
#${ID} .wsm-body .cw-help { max-height: 260px; overflow-y: auto; }
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
  root.innerHTML = `<div class="wsm-stage"><div class="wsm-top"><span class="wsm-title"></span><span class="wsm-sub"></span><button type="button" class="wsm-x">Close (Esc)</button></div><div class="wsm-body"></div></div>`;
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

function draw() {
  if (!_open) return;
  const p = profProvider();
  const { host, root, kind } = _open;
  const keep = /** @type {HTMLElement[]} */ ([...host.querySelectorAll('.cw-list, .cw-card, .pv-book, .pv-mid, .pv-ings')]);
  const tops = keep.map((e) => e.scrollTop);
  host.replaceChildren();
  const rerender = () => draw();
  /** @type {HTMLElement} */ (root.querySelector('.wsm-title')).textContent = kind === 'bench' ? 'The Bench' : 'Provisioning';
  /** @type {HTMLElement} */ (root.querySelector('.wsm-sub')).textContent = kind === 'bench' ? 'Choose a piece, pick its materials, make it' : 'The pot and the cauldron';
  if (kind === 'bench') drawBench(host, rerender, p, stationHere(), () => closeWorkstation(), stationsHere());
  else drawProvPage(host, rerender, p, stationHere(), { go: () => closeWorkstation() });
  const now = /** @type {HTMLElement[]} */ ([...host.querySelectorAll('.cw-list, .cw-card, .pv-book, .pv-mid, .pv-ings')]);
  now.forEach((e, i) => { if (tops[i]) e.scrollTop = tops[i]; });
}
