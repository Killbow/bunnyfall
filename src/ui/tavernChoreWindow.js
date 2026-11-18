// BUNNYFALL: the two tavern chores as short hands-on games, in a low panel so the room (and the mess in it) stays in view.
// Sweeping: alternate left and right strokes. Clearing a table: gather each empty, then wipe in circles.
// The work is reported as it happens (the mess shrinks, the cups leave the table); only the finish is sent to the law.
import { t } from '../systems/textManager.js';
import { windowShell, el } from './tavernServiceWindow.js';

export const SWEEP_STROKES = 8;
export const WIPE_STEPS = 8;
const CIRCLE = Object.freeze([['ArrowUp', 'KeyW'], ['ArrowRight', 'KeyD'], ['ArrowDown', 'KeyS'], ['ArrowLeft', 'KeyA']]);
const ARROWS = ['↑', '→', '↓', '←'];
const KEYS = ['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE', 'Space', 'Enter'];

function svg(parent, viewBox, shapes, className = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', viewBox); node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  for (const [tag, attrs] of shapes) {
    const s = document.createElementNS(node.namespaceURI, tag);
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, String(v));
    node.append(s);
  }
  parent.append(node);
  return node;
}

/** @param {{ kind: 'table'|'spill', who: string, progress: (p: any) => void, restore: () => void, finish: () => Promise<boolean> }} o */
export function createTavernChoreWindow({ kind, who, progress, restore, finish }) {
  if (typeof document === 'undefined') return null;
  const sweeping = kind === 'spill';
  const title = sweeping ? t('tavern.chore.sweepTitle', 'Sweep up the spill') : t('tavern.chore.tableTitle', 'Clear the table');
  let finished = false, sending = false;
  // However the panel goes away (Escape, Tab, leaving the room), unfinished work puts the mess back as it was.
  const w = windowShell('ts-chore', title, KEYS, () => { if (!finished) restore(); });
  w.shell.classList.add('ts-low');
  const head = el('header', '', undefined, w.body);
  el('p', 'ts-kicker', sweeping ? t('tavern.chore.spillBy', 'Knocked over by {name}', { name: who }) : t('tavern.chore.leftBy', 'Left by {name}', { name: who }), head);
  el('h1', '', title, head);
  const rule = el('p', 'ts-rule', '', head);
  const stage = el('div', 'ts-chore-stage', undefined, w.body);
  const meter = el('div', 'ts-chore-meter', undefined, w.body); const fill = el('i', '', undefined, meter);
  meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100');
  const status = el('p', 'ts-status', '', w.body); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const pads = el('footer', 'ts-chore-pads', undefined, w.body);
  const setMeter = (k) => { fill.style.width = `${Math.round(k * 100)}%`; meter.setAttribute('aria-valuenow', String(Math.round(k * 100))); };
  const puff = (cls) => { const p = el('span', `ts-puff ${cls}`, undefined, stage); setTimeout(() => p.remove(), 700); };
  async function complete(done) {
    if (sending || finished) return;
    sending = true; status.textContent = t('tavern.chore.checking', 'Done. Letting the innkeeper know...');
    const ok = await finish().catch(() => false);
    sending = false;
    if (ok) { finished = true; stage.classList.add('ts-clean'); status.textContent = done; setTimeout(() => w.close(), 900); }
    else status.textContent = t('tavern.chore.retry', 'That did not go through. Try the last stroke again.');
  }

  if (sweeping) {
    rule.textContent = t('tavern.chore.sweepRule', 'Sweep with alternating strokes: ← then →, or A then D. Clicking the two pads works too.');
    const broom = svg(stage, '0 0 120 120', [
      ['path', { d: 'M58 4h5l4 70h-13z', fill: '#8a5a2e', stroke: '#4a2e17', 'stroke-width': 2 }],
      ['path', { d: 'M44 72h33l14 40H30z', fill: '#d9b46a', stroke: '#7a5a28', 'stroke-width': 2 }],
      ['path', { d: 'M44 80h33M40 92h41M35 104h50', stroke: '#9c7a3a', 'stroke-width': 2 }],
    ], 'ts-broom');
    const pile = svg(stage, '0 0 140 40', [['ellipse', { cx: 70, cy: 26, rx: 64, ry: 12, fill: '#3b2a1c' }], ['ellipse', { cx: 58, cy: 22, rx: 30, ry: 8, fill: '#5a3d24' }],
      ['circle', { cx: 96, cy: 22, r: 4, fill: '#9fc4c8' }], ['circle', { cx: 40, cy: 28, r: 3, fill: '#9fc4c8' }]], 'ts-pile');
    let strokes = 0, last = '';
    const stroke = (side) => {
      if (finished || sending) return;
      broom.classList.remove('ts-left', 'ts-right'); void broom.getBoundingClientRect(); broom.classList.add(side === 'L' ? 'ts-left' : 'ts-right');
      if (side === last) { status.textContent = t('tavern.chore.sweepAlternate', 'Switch sides to sweep.'); return; }
      last = side; strokes++; puff(side === 'L' ? 'ts-puff-left' : 'ts-puff-right');
      const k = strokes / SWEEP_STROKES;
      pile.style.transform = `scale(${1 - .85 * k})`; setMeter(k); status.textContent = '';
      progress({ scale: 1 - .85 * k });
      if (strokes >= SWEEP_STROKES) void complete(t('tavern.chore.swept', 'Swept clean.'));
    };
    w.button(pads, t('tavern.chore.left', '◀ Sweep'), () => stroke('L'));
    w.button(pads, t('tavern.chore.right', 'Sweep ▶'), () => stroke('R'));
    w.overlay.input = (code) => {
      if (code === 'Escape') { w.close(); return; }
      if (code === 'ArrowLeft' || code === 'KeyA') stroke('L');
      if (code === 'ArrowRight' || code === 'KeyD') stroke('R');
    };
  } else {
    const cups = el('div', 'ts-cups', undefined, stage);
    const cupEls = [0, 1, 2].map(() => svg(cups, '0 0 40 48', [['path', { d: 'M6 6h24v34q0 4-4 4H10q-4 0-4-4z', fill: '#a9a397', stroke: '#4d473e', 'stroke-width': 2 }],
      ['path', { d: 'M30 14h5q3 0 3 4v10q0 4-3 4h-5', fill: 'none', stroke: '#4d473e', 'stroke-width': 3 }], ['path', { d: 'M6 12h24M6 34h24', stroke: '#4d473e', 'stroke-width': 2 }]], 'ts-cup'));
    const board = svg(stage, '0 0 160 60', [['rect', { x: 2, y: 8, width: 156, height: 44, rx: 4, fill: '#7a5230', stroke: '#3d2716', 'stroke-width': 3 }],
      ['ellipse', { cx: 80, cy: 30, rx: 34, ry: 12, fill: '#4a3015', class: 'ts-stain' }]], 'ts-board');
    const rag = svg(stage, '0 0 40 30', [['path', { d: 'M4 8q10-8 20 0t14 2l-4 16q-10 4-26-2z', fill: '#e8dcc0', stroke: '#8d7a55', 'stroke-width': 2 }]], 'ts-rag');
    const hint = el('div', 'ts-arrows', undefined, stage); const hints = ARROWS.map((a) => el('span', '', a, hint));
    let taken = 0, step = 0;
    const showStep = () => hints.forEach((h, i) => h.classList.toggle('ts-next', taken >= 3 && i === step % 4));
    const gather = () => {
      if (finished || sending || taken >= 3) return;
      cupEls[taken].classList.add('ts-taken'); taken++;
      progress({ taken }); setMeter(taken / 3 * .4);
      if (taken === 3) { rule.textContent = t('tavern.chore.wipeRule', 'Now wipe in circles: ↑ → ↓ ←, or W D S A. Two full circles.'); stage.classList.add('ts-wiping'); }
      showStep();
    };
    const wipe = (code) => {
      if (finished || sending || taken < 3) return;
      if (!CIRCLE[step % 4].includes(code)) { rag.classList.remove('ts-slip'); void rag.getBoundingClientRect(); rag.classList.add('ts-slip'); return; }
      step++; rag.dataset.q = String(step % 4); puff('ts-puff-shine');
      const k = step / WIPE_STEPS;
      board.querySelector('.ts-stain')?.setAttribute('opacity', String(1 - k)); setMeter(.4 + .6 * k); showStep();
      if (step >= WIPE_STEPS) void complete(t('tavern.chore.wiped', 'The table shines.'));
    };
    rule.textContent = t('tavern.chore.gatherRule', 'Gather the empties: press E or Space for each cup, or click them.');
    cupEls.forEach((c) => c.addEventListener('click', gather));
    const quadrant = [['ArrowUp', '↑'], ['ArrowRight', '→'], ['ArrowDown', '↓'], ['ArrowLeft', '←']];
    for (const [code, label] of quadrant) w.button(pads, label, () => (taken < 3 ? gather() : wipe(code)));
    w.overlay.input = (code) => {
      if (code === 'Escape') { w.close(); return; }
      if (taken < 3 && ['KeyE', 'Space', 'Enter'].includes(code)) gather();
      else wipe(code);
    };
  }
  // The panel itself takes focus: Space and Enter are moves here, never a press of whichever pad was focused.
  w.shell.tabIndex = -1; setMeter(0); w.shell.focus({ preventScroll: true });
  return w.overlay;
}
