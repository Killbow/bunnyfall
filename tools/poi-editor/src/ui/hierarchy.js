// @ts-check

// The scene hierarchy: groups and the things in them, searchable, with visibility and lock toggles, rename,
// shift and ctrl selection, and drag to regroup. Every change is one editor step, so it undoes.

import { h, clear } from './dom.js';
import { buildTree, rangeIds, setFlag, moveToGroup, renameNode } from '../scene.js';

const MARK = { group: 'group', part: 'model', flat: 'flat', light: 'light', npc: 'person' };

/**
 * @param {{ host: HTMLElement, getDoc: () => any, docId: () => string | null, edit: any, getSel: () => string[], select: (ids: string[], how: 'set' | 'add' | 'toggle') => void, say: (msg: string) => void }} o
 */
export function createHierarchy({ host, getDoc, docId, edit, getSel, select, say }) {
  let filter = '';
  let anchor = /** @type {string | null} */ (null);
  const collapsed = new Set();
  const search = h('input', { type: 'search', placeholder: 'Search the scene', on: { input: () => { filter = /** @type {HTMLInputElement} */ (search).value.toLowerCase(); render(); } } });
  const tree = h('div', { class: 'tree' });
  host.append(h('div', { class: 'head' }, h('span', { class: 'grow', text: 'Scene' })), h('div', { class: 'filters' }, search), tree);

  const run = (label, fn) => { const id = docId(); if (id) edit.edit(id, label, fn); };

  function matches(n) { return !filter || n.name.toLowerCase().includes(filter) || n.children.some(matches); }

  function row(n, depth, sel) {
    const el = h('div', { class: `row${sel.has(n.id) ? ' sel' : ''}${n.hidden ? ' hid' : ''}`, style: { paddingLeft: `${6 + depth * 14}px` }, draggable: true, on: {
      click: (e) => {
        if (e.shiftKey && anchor) select(rangeIds(getDoc(), anchor, n.id), 'set');
        else { select([n.id], e.ctrlKey || e.metaKey ? 'toggle' : 'set'); anchor = n.id; }
      },
      dblclick: () => { const to = globalThis.prompt?.('Name', n.name); if (to) run('rename', (d) => { renameNode(d, n.id, to); }); },
      dragstart: (e) => { const ids = sel.has(n.id) ? [...sel] : [n.id]; e.dataTransfer?.setData('text/x-bunnyfall-nodes', JSON.stringify(ids)); },
      dragover: (e) => { if (n.kind === 'group' || e.currentTarget) e.preventDefault(); },
      drop: (e) => {
        e.preventDefault(); e.stopPropagation();
        let ids = []; try { ids = JSON.parse(e.dataTransfer?.getData('text/x-bunnyfall-nodes') ?? '[]'); } catch { return; }
        const into = n.kind === 'group' ? n.id.slice(6) : (getDoc().groups ?? []).length ? (find(n)?.group ?? null) : null;
        run('move to group', (d) => { const r = moveToGroup(d, ids, into); if (r.refused) say(`Cannot move there: ${r.refused}.`); });
      },
    } },
    n.kind === 'group' ? h('span', { text: collapsed.has(n.id) ? '▸' : '▾', style: { width: '12px', cursor: 'pointer' }, on: { click: (e) => { e.stopPropagation(); if (collapsed.has(n.id)) collapsed.delete(n.id); else collapsed.add(n.id); render(); } } }) : h('span', { style: { width: '12px' } }),
    h('span', { class: 'k', text: MARK[n.kind] }), h('span', { class: 'nm', text: n.name }),
    h('span', { class: 'eye', title: 'Show or hide', text: n.visible ? '◉' : '○', on: { click: (e) => { e.stopPropagation(); run('visibility', (d) => setFlag(d, [n.id], 'visible', !n.visible)); } } }),
    h('span', { class: 'lock', title: 'Lock or unlock', text: n.locked ? '⚿' : '·', on: { click: (e) => { e.stopPropagation(); run('lock', (d) => setFlag(d, [n.id], 'locked', !n.locked)); } } }));
    return el;
  }
  const find = (n) => { const d = getDoc(); const list = d?.[{ part: 'parts', flat: 'flats', light: 'lights', npc: 'npcs' }[n.kind]]; return list?.[n.index]; };

  function render() {
    clear(tree);
    const doc = getDoc();
    if (!doc) { tree.append(h('div', { class: 'pane dim', text: 'No POI open.' })); return; }
    const sel = new Set(getSel());
    const walk = (ns, depth) => { for (const n of ns) { if (!matches(n)) continue; tree.append(row(n, depth, sel)); if (n.kind === 'group' && !collapsed.has(n.id)) walk(n.children, depth + 1); } };
    const t = buildTree(doc);
    walk(t, 0);
    if (!t.length) tree.append(h('div', { class: 'pane dim', text: 'Empty. Place an asset from the browser.' }));
    tree.ondragover = (e) => e.preventDefault();
    tree.ondrop = (e) => { let ids = []; try { ids = JSON.parse(e.dataTransfer?.getData('text/x-bunnyfall-nodes') ?? '[]'); } catch { return; } if (ids.length) run('move out of group', (d) => { moveToGroup(d, ids, null); }); };
  }
  return { render };
}
