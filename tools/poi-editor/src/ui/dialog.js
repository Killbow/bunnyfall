// @ts-check

// A small modal form. `ask` resolves with the field values, or null when the builder cancels.

import { h } from './dom.js';

/**
 * @param {string} title
 * @param {{ name: string, label: string, type?: string, value?: string, options?: [string, string][], hint?: string }[]} fields
 * @param {{ ok?: string, validate?: (v: Record<string, string>) => string | null }} [opts]
 * @returns {Promise<Record<string, string> | null>}
 */
export function ask(title, fields, { ok = 'OK', validate } = {}) {
  return new Promise((resolve) => {
    const inputs = {};
    const err = h('div', { class: 'err' });
    const rows = fields.map((f) => {
      const el = f.options
        ? h('select', null, ...f.options.map(([v, t]) => h('option', { value: v, text: t, selected: v === f.value })))
        : h('input', { type: f.type ?? 'text', value: f.value ?? '', autocomplete: 'off' });
      inputs[f.name] = el;
      return h('div', { class: 'field' }, h('label', { text: f.label }), h('div', null, el, f.hint && h('div', { class: 'dim', text: f.hint })));
    });
    const done = (v) => { back.remove(); resolve(v); };
    const submit = () => {
      const v = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, /** @type {HTMLInputElement} */ (el).value]));
      const bad = validate?.(v);
      if (bad) { err.textContent = bad; return; }
      done(v);
    };
    const back = h('div', { class: 'dialog', on: { keydown: (e) => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') submit(); } } },
      h('div', null, h('h3', { text: title }), ...rows, err, h('div', { class: 'acts' }, h('button', { text: 'Cancel', on: { click: () => done(null) } }), h('button', { class: 'on', text: ok, on: { click: submit } }))));
    document.body.append(back);
    /** @type {HTMLElement | null} */ (back.querySelector('input,select'))?.focus();
  });
}

/** Ask a yes or no question. */
export const confirmBox = (title, text, ok = 'Yes') => new Promise((resolve) => {
  const done = (v) => { back.remove(); resolve(v); };
  const back = h('div', { class: 'dialog' }, h('div', null, h('h3', { text: title }), h('div', { text }), h('div', { class: 'acts' }, h('button', { text: 'Cancel', on: { click: () => done(false) } }), h('button', { class: 'on', text: ok, on: { click: () => done(true) } }))));
  document.body.append(back);
});
