// @ts-check

// The bottom panel: what the law says about the document, the budgets, the steps taken, the revisions the store keeps
// and a log. The UV editor tab is listed and switched off: it comes in a later milestone.

import { h, clear } from './dom.js';
import { poiDocProblems, poiDocBytesOf } from '../../../../src/poi/poiLaw.js';
import { POI_V2_LIMITS } from '../../../../src/poi/poiLawV2.js';
import { poiTradeProblems } from '../../../../src/poi/poiTradeLaw.js';
import { problemText, problemWhere } from '../../../../src/poi/poiText.js';

/** The problems for a document: shapes, then (when the shapes are sound) the items against the game. */
export function problemsOf(doc) {
  if (!doc) return [];
  const p = poiDocProblems(doc);
  return p.length ? p : poiTradeProblems(doc);
}

/** Budget rows for a document: what is used, the most allowed. */
export function budgetsOf(doc) {
  if (!doc) return [];
  const v = doc.v === 2 ? 2 : 1;
  const bytes = (() => { try { return new TextEncoder().encode(JSON.stringify(doc)).length; } catch { return 0; } })();
  const n = (k) => doc[k]?.length ?? 0;
  return [
    { name: 'Document size', used: bytes, max: poiDocBytesOf(v), unit: 'KiB', div: 1024 },
    { name: 'Models', used: n('parts'), max: 128 },
    { name: 'Flat pictures', used: n('flats'), max: POI_V2_LIMITS.flats },
    { name: 'Lights', used: n('lights'), max: 32 },
    { name: 'People', used: n('npcs'), max: 32 },
    { name: 'Groups', used: n('groups'), max: POI_V2_LIMITS.groups },
  ];
}

/**
 * @param {{ host: HTMLElement, getDoc: () => any, docId: () => string | null, api: any, log: { lines: string[] }, steps: () => string[] }} o
 */
export function createBottom({ host, getDoc, docId, api, log, steps }) {
  const TABS = [['problems', 'Problems'], ['budgets', 'Budgets'], ['history', 'History'], ['log', 'Log'], ['uv', 'UV editor']];
  let tab = 'problems';
  const bar = h('div', { class: 'tabs' });
  const pane = h('div', { class: 'pane' });
  host.append(bar, pane);
  /** @type {any[] | null} */ let revs = null;
  let revsMsg = '';

  function render() {
    clear(bar);
    for (const [k, name] of TABS) bar.append(h('button', { class: `tab${tab === k ? ' on' : ''}`, text: k === 'problems' ? `${name} (${problemsOf(getDoc()).length})` : name, disabled: k === 'uv', title: k === 'uv' ? 'The UV editor arrives in a later milestone.' : '', on: { click: () => { tab = k; render(); } } }));
    clear(pane);
    const doc = getDoc();
    if (tab === 'problems') {
      const ps = problemsOf(doc);
      if (!doc) pane.append(h('div', { class: 'dim', text: 'No POI open.' }));
      else if (!ps.length) pane.append(h('div', { class: 'good', text: 'The law finds nothing wrong with this POI.' }));
      for (const p of ps.slice(0, 200)) { const where = problemWhere(p.path, doc); pane.append(h('div', { class: 'ln bad' }, where ? `${where}: ${problemText(p)}` : problemText(p))); }
    } else if (tab === 'budgets') {
      for (const b of budgetsOf(doc)) {
        const ratio = b.max ? b.used / b.max : 0, d = b.div ?? 1;
        pane.append(h('div', { class: 'ln', text: `${b.name}: ${(b.used / d).toFixed(d > 1 ? 1 : 0)} of ${(b.max / d).toFixed(d > 1 ? 0 : 0)}${b.unit ? ` ${b.unit}` : ''}` }), h('div', { class: `meter${ratio > 1 ? ' full' : ratio > 0.85 ? ' warn' : ''}` }, h('i', { style: { width: `${Math.min(100, ratio * 100)}%` } })));
      }
    } else if (tab === 'history') {
      pane.append(h('div', { class: 'section', text: 'This session' }));
      const s = steps();
      if (!s.length) pane.append(h('div', { class: 'dim', text: 'No changes yet.' }));
      for (const l of s.slice(-60).reverse()) pane.append(h('div', { class: 'ln', text: l }));
      pane.append(h('div', { class: 'section', text: 'Revisions in the store' }));
      pane.append(h('button', { text: 'Load revisions', disabled: !api.signedIn() || !docId(), title: api.signedIn() ? '' : 'Sign in first', on: { click: async () => {
        const r = await api.history(docId());
        revsMsg = r.ok ? '' : `The store said: ${r.error}`; revs = r.ok ? (r.data.revs ?? []) : null; render();
      } } }));
      if (revsMsg) pane.append(h('div', { class: 'err', text: revsMsg }));
      for (const r of revs ?? []) pane.append(h('div', { class: 'ln', text: `Revision ${r.rev}: ${r.state}, by ${r.author ?? 'unknown'}${r.at ? `, ${new Date(r.at * 1000).toLocaleString('en')}` : ''}` }));
    } else if (tab === 'log') {
      if (!log.lines.length) pane.append(h('div', { class: 'dim', text: 'Nothing logged.' }));
      for (const l of log.lines.slice(-200).reverse()) pane.append(h('div', { class: 'ln', text: l }));
    }
  }
  return { render };
}
