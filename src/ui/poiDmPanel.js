// @ts-check
// A POI's talk, trade, and hand-over panel at the bottom of the screen (src/poi/poiDmRuntime.js). Plain DOM with no
// state of its own: the runtime calls `dialogue`, `trade`, or `hand` again after every change, and `close` when done.

import { t } from './textManager.js';

const HAND_ARM_MS = 500;

/** @param {{ parent?: HTMLElement, doc?: Document, cursor?: (() => (() => void) | null) | null }} [o] */
export function createPoiDmPanel({ parent = undefined, doc = globalThis.document, cursor = null } = {}) {
  /** @type {HTMLElement | null} */
  let box = null;
  /** @type {(() => void) | null} */
  let release = null;
  let handAt = 0;
  const make = () => {
    if (box || !doc) return box;
    box = doc.createElement('div');
    box.setAttribute('data-poi-dm', '');
    Object.assign(box.style, {
      position: 'fixed', left: '50%', bottom: '12%', transform: 'translateX(-50%)', maxWidth: '34rem', width: '90%', zIndex: '60',
      background: 'rgba(20,14,8,0.92)', color: '#f1e6cc', border: '1px solid #8a7345', borderRadius: '6px', padding: '0.8rem 1rem', font: '15px/1.4 serif',
    });
    (parent ?? doc.body).appendChild(box);
    return box;
  };
  const hold = () => { if (box && !release) release = cursor?.() ?? null; };
  const button = (/** @type {string} */ text, /** @type {() => void} */ onClick, /** @type {boolean} */ on = true) => {
    const b = /** @type {HTMLButtonElement} */ (doc.createElement('button'));
    b.textContent = text;
    b.disabled = !on;
    Object.assign(b.style, { display: 'block', width: '100%', textAlign: 'left', margin: '0.25rem 0', padding: '0.3rem 0.5rem', background: on ? '#3a2d18' : '#241c10', color: on ? '#f1e6cc' : '#8c8068', border: '1px solid #6b5a38', cursor: on ? 'pointer' : 'default', font: 'inherit' });
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  };
  const head = (/** @type {string} */ name) => { const h = doc.createElement('div'); h.textContent = name; h.style.fontWeight = 'bold'; h.style.marginBottom = '0.3rem'; return h; };
  return {
    /** A person's line and the replies on offer: `options` each `{ i, text }`; `onPick(i)`; `onClose()` for the leave button. */
    dialogue(/** @type {string} */ name, /** @type {string} */ line, /** @type {{ i: number, text: string }[]} */ options, /** @type {(i: number) => void} */ onPick, /** @type {() => void} */ onClose) {
      const b = make(); if (!b) return;
      b.replaceChildren(head(name));
      b.removeAttribute('data-poi-hand');
      const p = doc.createElement('div'); p.textContent = line; p.style.marginBottom = '0.5rem'; b.appendChild(p);
      for (const o of options) b.appendChild(button(o.text, () => onPick(o.i)));
      b.appendChild(button(t('poi.dm.leave', 'Leave'), onClose));
    },
    /** A trader's offers: `recipes` each `{ key, text, why }` - `why` set when it cannot be done now; `onRun(key)`. */
    trade(/** @type {string} */ name, /** @type {{ key: string, text: string, why: string | null }[]} */ recipes, /** @type {(key: string) => void} */ onRun, /** @type {() => void} */ onClose, /** @type {string} */ note = '') {
      const b = make(); if (!b) return;
      b.replaceChildren(head(name));
      b.removeAttribute('data-poi-hand');
      if (note) { const n = doc.createElement('div'); n.textContent = note; n.style.marginBottom = '0.4rem'; b.appendChild(n); }
      for (const r of recipes) b.appendChild(button(r.why ? `${r.text} (${r.why})` : r.text, () => onRun(r.key), !r.why));
      b.appendChild(button(t('poi.dm.leave', 'Leave'), onClose));
    },
    hand(/** @type {string} */ name, /** @type {string} */ line, /** @type {any} */ view, /** @type {{ set: (k: number, g: number, n: number) => void, give: () => void, cancel: () => void }} */ on) {
      const b = make(); if (!b) return;
      hold();
      if (!b.hasAttribute('data-poi-hand')) handAt = performance.now();
      b.replaceChildren(head(name));
      b.setAttribute('data-poi-hand', '');
      const text = (/** @type {string} */ s, /** @type {Record<string, string>} */ st = {}) => { const d = doc.createElement('div'); d.textContent = s; Object.assign(d.style, st); return d; };
      if (line) b.appendChild(text(line, { marginBottom: '0.4rem' }));
      const small = (/** @type {string} */ s, /** @type {() => void} */ fn, /** @type {boolean} */ on2) => {
        const x = /** @type {HTMLButtonElement} */ (doc.createElement('button'));
        x.textContent = s; x.disabled = !on2;
        Object.assign(x.style, { minWidth: '1.8rem', margin: '0 0.15rem', background: on2 ? '#3a2d18' : '#241c10', color: on2 ? '#f1e6cc' : '#8c8068', border: '1px solid #6b5a38', cursor: on2 ? 'pointer' : 'default', font: 'inherit' });
        x.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        return x;
      };
      view.sections.forEach((/** @type {any} */ sec, /** @type {number} */ k) => {
        const h = text(`${sec.text}: ${t('poi.dm.hand.chosen', '{chosen} of {count} chosen', { chosen: sec.chosen, count: sec.count })}`, { marginTop: '0.3rem', fontWeight: 'bold' });
        h.setAttribute('data-hand-section', String(k));
        b.appendChild(h);
        for (const r of sec.rows) {
          const row = doc.createElement('div');
          row.setAttribute('data-hand-row', `${k}:${r.g}`);
          Object.assign(row.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.15rem 0 0.15rem 0.6rem' });
          row.appendChild(text(r.total > 1 ? t('poi.dm.hand.held', '{name}, {n, number} held', { name: r.text, n: r.total }) : r.text, r.why ? { color: '#8c8068' } : {}));
          const ctl = doc.createElement('div');
          if (r.why) ctl.appendChild(text(r.why, { color: '#8c8068' }));
          else if (r.total === 1) {
            const c = /** @type {HTMLInputElement} */ (doc.createElement('input'));
            c.type = 'checkbox'; c.checked = r.n > 0; c.disabled = r.n === 0 && r.max === 0;
            c.addEventListener('click', (e) => { e.stopPropagation(); on.set(k, r.g, c.checked ? 1 : 0); });
            ctl.appendChild(c);
          } else {
            ctl.append(small('-', () => on.set(k, r.g, r.n - 1), r.n > 0), text(String(r.n), { display: 'inline-block', minWidth: '1.6rem', textAlign: 'center' }), small('+', () => on.set(k, r.g, r.n + 1), r.n < r.max));
          }
          row.appendChild(ctl);
          b.appendChild(row);
        }
      });
      if (view.gold) b.appendChild(text(t('poi.dm.hand.gold', '{n, number} gold', { n: view.gold }), { marginTop: '0.3rem', fontWeight: 'bold' }));
      if (view.note) b.appendChild(text(view.note, { marginTop: '0.3rem', color: '#e0a060' }));
      const give = button(t('poi.dm.hand.give', 'Hand over'), () => { if (performance.now() - handAt >= HAND_ARM_MS) on.give(); }, view.ready);
      give.setAttribute('data-hand-give', '');
      const cancel = button(t('poi.dm.hand.cancel', 'Cancel'), on.cancel);
      cancel.setAttribute('data-hand-cancel', '');
      b.append(give, cancel);
    },
    hold,
    close() { box?.remove(); box = null; release?.(); release = null; },
    open: () => !!box,
  };
}
