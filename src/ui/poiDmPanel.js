// @ts-check
// A POI's talk and trade windows (src/poi/poiDmRuntime.js): one small panel at the bottom of the screen that shows a
// person's line with the replies to pick, or a list of what a trader offers with a button for each. Plain DOM, no state of
// its own: the runtime calls `dialogue` or `trade` again after every pick, and `close` when the talk is over.

/** @param {{ parent?: HTMLElement, doc?: Document }} [o] */
export function createPoiDmPanel({ parent = undefined, doc = globalThis.document } = {}) {
  /** @type {HTMLElement | null} */
  let box = null;
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
      const p = doc.createElement('div'); p.textContent = line; p.style.marginBottom = '0.5rem'; b.appendChild(p);
      for (const o of options) b.appendChild(button(o.text, () => onPick(o.i)));
      b.appendChild(button('Leave', onClose));
    },
    /** A trader's offers: `recipes` each `{ key, text, why }` - `why` set when it cannot be done now; `onRun(key)`. */
    trade(/** @type {string} */ name, /** @type {{ key: string, text: string, why: string | null }[]} */ recipes, /** @type {(key: string) => void} */ onRun, /** @type {() => void} */ onClose, /** @type {string} */ note = '') {
      const b = make(); if (!b) return;
      b.replaceChildren(head(name));
      if (note) { const n = doc.createElement('div'); n.textContent = note; n.style.marginBottom = '0.4rem'; b.appendChild(n); }
      for (const r of recipes) b.appendChild(button(r.why ? `${r.text} (${r.why})` : r.text, () => onRun(r.key), !r.why));
      b.appendChild(button('Leave', onClose));
    },
    close() { box?.remove(); box = null; },
    open: () => !!box,
  };
}
