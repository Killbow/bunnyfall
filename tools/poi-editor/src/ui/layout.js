// @ts-check

// The workstation layout: a toolbar over three columns and a bottom panel, with splitters that resize and
// buttons that fold a panel away. Sizes are kept in the browser.

import { h } from './dom.js';

const KEY = 'bunnyfall.worldbuilder.layout';
const DEFAULTS = { left: 300, right: 320, bottom: 190, split: 0.5 };

export function createLayout(/** @type {HTMLElement} */ root, storage = globalThis.localStorage) {
  let sz = { ...DEFAULTS };
  try { sz = { ...DEFAULTS, ...JSON.parse(storage?.getItem(KEY) ?? '{}') }; } catch { /* default sizes */ }
  const fold = { left: false, right: false, bottom: false };
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(sz)); } catch { /* blocked */ } };
  const apply = () => {
    root.style.setProperty('--left-w', `${fold.left ? 0 : sz.left}px`);
    root.style.setProperty('--right-w', `${fold.right ? 0 : sz.right}px`);
    root.style.setProperty('--bottom-h', `${fold.bottom ? 0 : sz.bottom}px`);
    root.style.setProperty('--split', `${Math.round(sz.split * 100)}%`);
  };

  const mk = (cls) => h('div', { class: `panel ${cls}` });
  const toolbar = h('div', { class: 'toolbar' });
  const left = mk('left'), leftTop = h('div', { class: 'sub top' }), leftBottom = h('div', { class: 'sub bottom' });
  left.append(leftTop, h('div', { class: 'splitter h', 'data-s': 'split' }), leftBottom);
  const center = mk('center'), right = mk('right'), bottom = mk('bottom');
  const sp = (cls, key) => h('div', { class: `splitter ${cls}`, 'data-s': key });
  root.classList.add('workstation');
  root.append(toolbar, left, sp('v lv', 'left'), center, sp('v rv', 'right'), right, sp('h bh', 'bottom'), bottom);
  apply();

  root.addEventListener('pointerdown', (e) => {
    const s = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('.splitter'));
    if (!s) return;
    const key = s.dataset.s, start = { x: e.clientX, y: e.clientY, ...sz };
    const move = (m) => {
      if (key === 'left') sz.left = Math.max(180, Math.min(600, start.left + m.clientX - start.x));
      else if (key === 'right') sz.right = Math.max(220, Math.min(640, start.right - (m.clientX - start.x)));
      else if (key === 'bottom') sz.bottom = Math.max(80, Math.min(600, start.bottom - (m.clientY - start.y)));
      else if (key === 'split') { const r = left.getBoundingClientRect(); sz.split = Math.max(0.15, Math.min(0.85, (m.clientY - r.top) / r.height)); }
      apply();
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); save(); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    e.preventDefault();
  });

  return { toolbar, left, leftTop, leftBottom, center, right, bottom, toggle(/** @type {'left' | 'right' | 'bottom'} */ which) { fold[which] = !fold[which]; apply(); }, fold };
}
