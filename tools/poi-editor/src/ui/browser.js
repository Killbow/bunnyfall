// @ts-check

// The asset browser: a virtual grid or list over the whole catalogue, with search, filters, favourites,
// recent items, collections and a preview pane. Cards can be dragged into the viewport or placed with a button.

import { h, clear } from './dom.js';
import { visibleRows } from '../catalogue.js';
import { whyNotPlaceable } from '../place.js';

export const DRAG_TYPE = 'text/x-bunnyfall-asset';
const CELL = { grid: { w: 74, h: 76 }, list: { w: 9999, h: 28 } };

/**
 * @param {{ host: HTMLElement, catalogue: any, prefs: any, onPlace: (asset: any) => void }} o
 */
export function createAssetBrowser({ host, catalogue, prefs, onPlace }) {
  const st = { q: '', namespace: '', category: '', subcategory: '', tag: '', source: 'all', view: /** @type {'grid' | 'list'} */ ('grid'), sel: /** @type {string | null} */ (null), results: /** @type {any[]} */ ([]) };
  const facets = catalogue.facets();

  const q = h('input', { type: 'search', placeholder: `Search ${catalogue.assets.length.toLocaleString('en')} assets`, on: { input: () => { st.q = /** @type {HTMLInputElement} */ (q).value; refresh(); } } });
  const opt = (v, t) => h('option', { value: v, text: t });
  const nsSel = h('select', { on: { change: () => { st.namespace = /** @type {HTMLSelectElement} */ (nsSel).value; st.category = ''; fillCategories(); refresh(); } } }, opt('', 'All kinds'), ...[...facets.namespace.keys()].map((k) => opt(k, `${k} (${facets.namespace.get(k)})`)));
  const catSel = h('select', { on: { change: () => { st.category = /** @type {HTMLSelectElement} */ (catSel).value; refresh(); } } });
  const tagSel = h('select', { on: { change: () => { st.tag = /** @type {HTMLSelectElement} */ (tagSel).value; refresh(); } } }, opt('', 'Any tag'), ...[...facets.tag.keys()].sort().map((k) => opt(k, k)));
  const srcSel = h('select', { on: { change: () => { st.source = /** @type {HTMLSelectElement} */ (srcSel).value; refresh(); } } });
  const viewBtn = h('button', { text: 'List', title: 'Switch between grid and list', on: { click: () => { st.view = st.view === 'grid' ? 'list' : 'grid'; viewBtn.textContent = st.view === 'grid' ? 'List' : 'Grid'; scroller.scrollTop = 0; refresh(); } } });

  function fillCategories() {
    clear(catSel); catSel.append(opt('', 'Any category'));
    const seen = new Map();
    for (const a of catalogue.assets) if (!st.namespace || a.namespace === st.namespace) seen.set(a.category, (seen.get(a.category) ?? 0) + 1);
    for (const [k, n] of [...seen].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) catSel.append(opt(k, `${k} (${n})`));
  }
  function fillSources() {
    clear(srcSel);
    srcSel.append(opt('all', 'Everything'), opt('fav', `Favourites (${prefs.favourites().size})`), opt('recent', 'Recent'));
    for (const c of prefs.collections()) srcSel.append(opt(`col:${c}`, `Collection: ${c}`));
    srcSel.value = st.source;
  }

  const spacer = h('div');
  const cards = h('div', { class: 'cards' });
  const scroller = h('div', { class: 'scroller', on: { scroll: () => draw() } }, spacer, cards);
  const preview = h('div', { class: 'preview' }, 'Pick an asset to see its details.');
  host.append(h('div', { class: 'head' }, h('span', { class: 'grow', text: 'Assets' }), viewBtn), h('div', { class: 'filters' }, q, nsSel, catSel, tagSel, srcSel), scroller, preview);

  function refresh() {
    let ids = null;
    if (st.source === 'fav') ids = prefs.favourites();
    else if (st.source === 'recent') ids = new Set(prefs.recent());
    else if (st.source.startsWith('col:')) ids = prefs.collection(st.source.slice(4));
    st.results = catalogue.search({ q: st.q, namespace: st.namespace || null, category: st.category || null, tag: st.tag || null, ids });
    if (st.source === 'recent') { const order = prefs.recent(); st.results.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); }
    draw();
  }

  function thumb(a) {
    const t = h('div', { class: 'thumb' });
    if (a.namespace === 'df-flat' && a.preview?.atlas) {
      const [cx, cy] = a.preview.cell, s = st.view === 'grid' ? 44 / 32 : 22 / 32;
      t.style.backgroundImage = `url(./${a.preview.atlas})`;
      t.style.backgroundSize = `${16 * 32 * s}px auto`;
      t.style.backgroundPosition = `${-cx * 32 * s}px ${-cy * 32 * s}px`;
    } else t.textContent = a.namespace === 'df-arch3d' ? '3D' : a.namespace === 'paperdoll-item' ? 'item' : a.namespace === 'entity' ? 'foe' : '3D';
    return t;
  }

  function draw() {
    const cell = CELL[st.view];
    const w = Math.max(1, scroller.clientWidth), per = st.view === 'list' ? 1 : Math.max(1, Math.floor(w / cell.w));
    const v = visibleRows(st.results.length, per, cell.h, scroller.scrollTop, scroller.clientHeight || 400);
    spacer.style.height = `${v.height}px`;
    cards.style.top = `${v.first * cell.h}px`;
    cards.style.gridTemplateColumns = `repeat(${per}, 1fr)`;
    cards.className = `cards ${st.view}`;
    clear(cards);
    for (const a of st.results.slice(v.from, v.to)) {
      const f = catalogue.flags(a);
      const el = h('div', { class: `card${st.sel === a.id ? ' sel' : ''}`, draggable: !whyNotPlaceable(a), title: `${a.name}\n${a.id}`, on: {
        click: () => { st.sel = a.id; showPreview(a); draw(); },
        dblclick: () => { if (!whyNotPlaceable(a)) onPlace(a); },
        dragstart: (e) => { e.dataTransfer?.setData(DRAG_TYPE, a.id); e.dataTransfer?.setData('text/plain', a.id); },
      } }, thumb(a), h('div', { class: 'nm', text: a.name }),
      h('span', { class: 'star', text: prefs.isFavourite(a.id) ? '★' : '', title: 'Favourite' }),
      (f.duplicate || f.missing) && h('span', { class: 'flag', text: f.missing ? 'missing' : 'dup', title: f.missing ? 'A reference of this asset was not found in the game files.' : 'The archive repeats this id.' }));
      cards.append(el);
    }
  }

  function showPreview(a) {
    clear(preview);
    const kv = (k, v) => h('div', null, h('span', { class: 'kv', text: `${k}: ` }), String(v));
    const why = whyNotPlaceable(a), f = catalogue.flags(a);
    const dims = a.dimensions ? JSON.stringify(a.dimensions).replace(/"/g, '') : '';
    const colSel = h('select', null, h('option', { value: '', text: 'Add to collection...' }), ...prefs.collections().map((c) => h('option', { value: c, text: c })), h('option', { value: '\u0000new', text: 'New collection...' }));
    colSel.addEventListener('change', () => {
      let name = /** @type {HTMLSelectElement} */ (colSel).value;
      if (name === '\u0000new') name = (globalThis.prompt?.('Collection name') ?? '').trim();
      if (name) { prefs.addToCollection(name, a.id); fillSources(); }
      /** @type {HTMLSelectElement} */ (colSel).value = '';
    });
    preview.append(
      h('div', { style: { fontWeight: '700' }, text: a.name }), kv('Id', a.id), kv('Mode', a.dimensionMode), kv('Category', `${a.category}${a.subcategory ? ` / ${a.subcategory}` : ''}`), dims && kv('Size', dims),
      a.textures?.length && kv('Textures', a.textures.join(', ')), kv('Runtime', a.runtime ?? ''), kv('Old editor', a.oldEditorExposes ?? 'no'),
      f.duplicate && h('div', { class: 'why', text: 'The archive repeats this id. The first record is the one used.' }),
      f.missing && h('div', { class: 'why', text: 'A reference of this asset is missing from the game files.' }),
      why && h('div', { class: 'why', text: why }),
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
        h('button', { text: 'Place', disabled: !!why, title: why ?? 'Place at the view centre', on: { click: () => onPlace(a) } }),
        h('button', { text: prefs.isFavourite(a.id) ? 'Unfavourite' : 'Favourite', on: { click: () => { prefs.toggleFavourite(a.id); fillSources(); showPreview(a); draw(); } } }),
        colSel));
  }

  fillCategories(); fillSources(); refresh();
  new ResizeObserver(() => draw()).observe(scroller);
  return { refresh, selected: () => st.sel, select(/** @type {string} */ id) { st.sel = id; const a = catalogue.get(id); if (a) showPreview(a); draw(); } };
}
