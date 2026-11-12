// @ts-check
// The in-game POI editor's scene tools in its panel (ui/poi/poiEditorPanel.js hands its helpers in). The outliner's
// rows for an open POI: groups as folders, a mark for each kind, hide and lock per row and group, search inside the
// scene, Ctrl and Shift selection, drag to regroup or reorder. The inspector for several things, a group, a person, or
// a flat picture: marks, group and ungroup, and the arrange tools. The acts are ui/poi/poiSceneActs.js's, so each
// change is one undo step. Hidden is the editor's view alone (the game still stands a hidden row), and the panel says
// so where the mark is set. A locked row is not picked in the world, moved, or deleted; the outliner still selects it,
// so it can be unlocked.

import { t } from '../../systems/textManager.js';
import { selItems, selectionOf } from '../../poi/poiEdit.js';
import { buildTree, find, marksOf, nameMaxOf, parseId, rangeIds, GROUP_NAME_MAX } from '../../poi/poiScene.js';

export const POI_SCENE_STYLE_ID = 'dfpoi-scene-style';
export const POI_SCENE_CSS = `
.dfpoi-left > .dfpoi-item[data-kind]::before { flex: 0 0 auto; width: 14px; text-align: center; color: #b9b2a3; font-size: 11px; }
.dfpoi-left > .dfpoi-item[data-kind="part"]::before { content: "\\25A3"; }
.dfpoi-left > .dfpoi-item[data-kind="light"]::before { content: "\\2600"; color: #e8cf8a; }
.dfpoi-left > .dfpoi-item[data-kind="npc"]::before { content: "\\263A"; color: #c9b6f2; }
.dfpoi-left > .dfpoi-item[data-kind="flat"]::before { content: "\\25AD"; }
.dfpoi-left > .dfpoi-item[data-kind="group"]::before { content: "\\25BE"; color: #d8b77a; }
.dfpoi-left > .dfpoi-item[data-kind="group"][data-open="0"]::before { content: "\\25B8"; }
.dfpoi-left > .dfpoi-item[data-kind] > .dfpoi-nm { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfpoi-left > .dfpoi-item[data-hidden="1"] > .dfpoi-nm { opacity: .5; font-style: italic; }
.dfpoi-left > .dfpoi-item[data-frozen="1"] > .dfpoi-nm { color: #9a9488; }
.dfpoi-flag { flex: 0 0 18px; height: 16px; padding: 0; font: 11px/14px system-ui, sans-serif; color: #b9b2a3; background: none; border: 1px solid transparent; border-radius: 3px; cursor: pointer; }
.dfpoi-flag:hover { border-color: #6b5230; }
.dfpoi-flag[data-flag="visible"]::before { content: "\\25C9"; }
.dfpoi-flag[data-flag="visible"][aria-pressed="false"]::before { content: "\\25CB"; }
.dfpoi-flag[data-flag="locked"]::before { content: "\\00B7"; }
.dfpoi-flag[data-flag="locked"][aria-pressed="true"]::before { content: "\\26BF"; color: #e8cf8a; }
.dfpoi-left > .dfpoi-item.dfpoi-drop { outline: 1px dashed #d8b77a; }
`;

const DRAG_TYPE = 'text/x-bunnyfall-poi-rows';

/**
 * @param {{ doc: Document, el: Function, btn: Function, field: Function, numberInput: Function, text: Function, check: Function,
 *   edit: any, acts: any, redraw?: () => void }} c the panel's helpers, the scene acts, and the panel's redraw (a group opened or closed)
 */
export function createPoiScenePanel(c) {
  const { doc, el, btn, field, numberInput, text, check, edit, acts } = c;
  if (!doc.getElementById?.(POI_SCENE_STYLE_ID)) { const s = doc.createElement('style'); s.id = POI_SCENE_STYLE_ID; s.textContent = POI_SCENE_CSS; (doc.head ?? doc.body).append(s); }
  let filter = '';
  /** The row a plain or Ctrl click leaves as the anchor of a Shift range, by POI. */
  const anchor = new Map();
  /** Closed groups, as `poi id|group id`. */
  const closed = new Set();
  /** The rows drawn, for the search to show and hide without drawing them again: `{ el, names, above }`. */
  let drawn = [];

  const namesUnder = (n) => n.children.flatMap((k) => [nameOf(k).toLowerCase(), ...namesUnder(k)]);
  const nameOf = (n) => (n.kind === 'light' ? t('poi.where.light', 'Light {n}', { n: n.index + 1 }) : String(n.name));
  const kindText = (k) => (k === 'part' ? t('poi.scene.kindPart', 'Part') : k === 'light' ? t('poi.scene.kindLight', 'Light') : k === 'npc' ? t('poi.scene.kindPerson', 'Person') : k === 'flat' ? t('poi.scene.kindFlat', 'Flat picture') : t('poi.scene.kindGroup', 'Group'));

  /** A click on a row: plain selects it, Ctrl adds or takes it out, Shift the range from the last click. */
  function clickRow(id, rowId, e) {
    const sel = edit.selection();
    const now = sel?.id === id ? selItems(sel) : [];
    const d = edit.docOf(id);
    if (e.shiftKey && anchor.get(id) && d) edit.select(selectionOf(id, [...new Set([...(e.ctrlKey || e.metaKey ? now : []), ...rangeIds(d, anchor.get(id), rowId)])]));
    else if (e.ctrlKey || e.metaKey) { edit.select(selectionOf(id, now.includes(rowId) ? now.filter((i) => i !== rowId) : [...now, rowId])); anchor.set(id, rowId); }
    else { edit.select(selectionOf(id, [rowId])); anchor.set(id, rowId); }
  }

  const flagButton = (id, n, flag) => {
    const on = flag === 'visible' ? n.visible : n.locked;
    const b = btn('', () => acts.flag(id, [n.id], flag, !on), 'dfpoi-flag');
    b.dataset.flag = flag;
    b.setAttribute('aria-pressed', String(on));
    const label = flag === 'visible'
      ? (on ? t('poi.scene.hide', 'Hide in the editor (it still shows in the game)') : t('poi.scene.show', 'Show in the editor'))
      : (on ? t('poi.scene.unlock', 'Unlock') : t('poi.scene.lock', 'Lock (it cannot be picked or moved)'));
    b.title = label; b.setAttribute('aria-label', label);
    return b;
  };

  /**
   * The outliner's rows for one open POI, flat (each a child of the dock, indented by its depth), in tree order.
   * @param {string} id @param {any} d the document
   */
  function rows(id, d) {
    const sel = edit.selection();
    const picked = new Set(sel?.id === id ? selItems(sel) : []);
    const out = [];
    const walk = (ns, depth, above) => {
      for (const n of ns) {
        const row = el('div', 'dfpoi-item dfpoi-sub');
        row.dataset.kind = n.kind;
        row.dataset.id = n.id;
        if (n.hidden) row.dataset.hidden = '1';
        if (n.frozen) row.dataset.frozen = '1';
        row.style.paddingLeft = `${14 + depth * 12}px`;
        row.title = kindText(n.kind);
        row.setAttribute('aria-selected', String(picked.has(n.id)));
        const key = `${id}|${n.id}`;
        if (n.kind === 'group') row.dataset.open = closed.has(key) ? '0' : '1';
        row.append(el('span', 'dfpoi-nm', nameOf(n)), flagButton(id, n, 'visible'), flagButton(id, n, 'locked'));
        row.addEventListener('click', (e) => {
          // a press on a group's mark (the row's own left edge) opens or closes it
          if (n.kind === 'group' && e.clientX - row.getBoundingClientRect().left < 14 + depth * 12 + 14) { if (closed.has(key)) closed.delete(key); else closed.add(key); c.redraw?.(); return; }
          clickRow(id, n.id, e);
        });
        row.draggable = true;
        row.addEventListener('dragstart', (e) => { const ids = picked.has(n.id) ? [...picked] : [n.id]; e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify({ id, ids })); });
        row.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes(DRAG_TYPE)) { e.preventDefault(); row.classList.add('dfpoi-drop'); } });
        row.addEventListener('dragleave', () => row.classList.remove('dfpoi-drop'));
        row.addEventListener('drop', (e) => {
          e.preventDefault(); row.classList.remove('dfpoi-drop');
          let got = null;
          try { got = JSON.parse(e.dataTransfer?.getData(DRAG_TYPE) ?? 'null'); } catch { got = null; }
          if (!got || got.id !== id || !Array.isArray(got.ids)) return;
          // onto a group: into it; onto another row: before it, in its group
          if (n.kind === 'group') acts.regroup(id, got.ids.filter((i) => i !== n.id), parseId(n.id).key);
          else if (got.ids.length === 1 && parseId(got.ids[0]).kind === n.kind) acts.reorder(id, got.ids[0], n.id);
          else acts.regroup(id, got.ids, find(d, n.id)?.row.group ?? null);
        });
        const names = [nameOf(n).toLowerCase(), ...namesUnder(n)];
        out.push(row);
        drawn.push({ el: row, names, above });
        if (n.kind === 'group' && !closed.has(key)) walk(n.children, depth + 1, [...above, names]);
      }
    };
    walk(buildTree(d), 0, []);
    applyFilter();
    return out;
  }

  /** Search inside the scene: a row shows when its name, a name inside it, or a group above it matches. */
  function applyFilter() {
    const q = filter.trim().toLowerCase();
    for (const r of drawn) r.el.hidden = !!q && !r.names.some((s) => s.includes(q)) && !r.above.some((a) => a[0].includes(q));
  }

  /** The scene search field, drawn once at the top of the outliner. */
  function searchRow() {
    drawn = [];
    const find2 = el('input', 'dfpoi-grow');
    find2.type = 'search'; find2.value = filter; find2.placeholder = t('poi.scene.search', 'Search the open POIs');
    find2.addEventListener('input', () => { filter = find2.value; applyFilter(); });
    const r = el('div', 'dfpoi-row');
    r.append(find2);
    return r;
  }

  /** The marks of what is selected, as two boxes: hidden in the editor, and locked. */
  function markRows(id, d, items) {
    const rowsAt = items.map((i) => find(d, i)?.row).filter(Boolean);
    if (!rowsAt.length) return [];
    const hidden = rowsAt.every((r) => r.visible === false), locked = rowsAt.every((r) => r.locked === true);
    const out = [field(t('poi.scene.hidden', 'Hidden here'), check(hidden, (v) => acts.flag(id, items, 'visible', !v))),
      field(t('poi.scene.locked', 'Locked'), check(locked, (v) => acts.flag(id, items, 'locked', v)))];
    out.push(el('div', 'dfpoi-sub', t('poi.scene.hiddenNote', 'Hidden is for the editor only; it still shows in the game. Locked things cannot be picked in the world, moved, or deleted.')));
    return out;
  }

  /** The arrange tools for what is selected (in the POI's own frame). */
  function arrangeRows(count) {
    const out = [el('div', 'dfpoi-h', t('poi.scene.arrange', 'Arrange'))];
    const axisName = ['X', 'Y', 'Z'];
    if (count >= 2) {
      for (let a = 0; a < 3; a++) {
        const r = el('div', 'dfpoi-row');
        r.append(el('label', '', t('poi.scene.alignAxis', 'Align {axis}', { axis: axisName[a] })),
          btn(t('poi.scene.alignMin', 'Lowest'), () => acts.arrange('align', a, 'min')),
          btn(t('poi.scene.alignMid', 'Middle'), () => acts.arrange('align', a, 'mid')),
          btn(t('poi.scene.alignMax', 'Highest'), () => acts.arrange('align', a, 'max')));
        out.push(r);
      }
    }
    if (count >= 3) {
      const r = el('div', 'dfpoi-row');
      r.append(el('label', '', t('poi.scene.spread', 'Spread evenly')), ...[0, 1, 2].map((a) => btn(axisName[a], () => acts.arrange('distribute', a))));
      out.push(r);
    }
    const by = [0, 0, 0];
    const moveRow = field(t('poi.scene.moveBy', 'Move by (m)'), ...by.map((v, k) => numberInput(v, (x) => { by[k] = x; }, { step: 0.1, min: -2000, max: 2000 })),
      btn(t('poi.scene.moveGo', 'Move'), () => { if (by.some((x) => x !== 0)) acts.arrange('move', [...by]); }));
    out.push(moveRow);
    const r2 = el('div', 'dfpoi-row');
    r2.append(btn(t('poi.scene.reset', 'Reset turn and size'), () => acts.arrange('reset')), btn(t('poi.scene.ground', 'Drop to the ground'), () => acts.arrange('ground')));
    out.push(r2);
    return out;
  }

  /** Group, ungroup, duplicate, copy, and delete buttons for what is selected. */
  function groupRows(items) {
    const r = el('div', 'dfpoi-row');
    r.append(btn(t('poi.scene.group', 'Group (Ctrl+G)'), () => acts.group()));
    if (items.some((i) => i.startsWith('group:'))) r.append(btn(t('poi.scene.ungroup', 'Ungroup'), () => acts.ungroup()));
    const r2 = el('div', 'dfpoi-row');
    r2.append(btn(t('poi.scene.duplicate', 'Duplicate (Ctrl+D)'), () => acts.duplicate()), btn(t('poi.scene.copy', 'Copy (Ctrl+C)'), () => acts.copy(false)), btn(t('poi.scene.delete', 'Delete'), () => acts.remove()));
    return [r, r2];
  }

  /**
   * The inspector for a selection of several things, a group, a person, or a flat picture: null for one part or one
   * light (the panel's own fields) or the POI itself.
   * @param {any} d @param {any} sel
   */
  function inspector(d, sel) {
    const items = selItems(sel);
    if (!items.length) return null;
    const one = items.length === 1 ? find(d, items[0]) : null;
    if (one && (one.kind === 'part' || one.kind === 'light')) return null;
    const out = [];
    if (one?.kind === 'group') {
      out.push(el('div', 'dfpoi-h', t('poi.scene.kindGroup', 'Group')));
      out.push(field(t('poi.editor.name', 'Name'), text(one.row.name ?? '', (v) => acts.rename(sel.id, items[0], v), GROUP_NAME_MAX)));
      const inside = buildTree(d);
      const count = (ns) => ns.reduce((a, n) => a + (n.id === items[0] ? countAll(n.children) : count(n.children)), 0);
      const countAll = (ns) => ns.reduce((a, n) => a + (n.kind === 'group' ? countAll(n.children) : 1 + countAll(n.children)), 0);
      out.push(el('div', 'dfpoi-sub', t('poi.scene.groupHolds', 'It holds {n, plural, one {# thing} other {# things}}.', { n: count(inside) })));
    } else if (one?.kind === 'npc') {
      out.push(el('div', 'dfpoi-h', t('poi.scene.kindPerson', 'Person')));
      out.push(field(t('poi.editor.name', 'Name'), text(one.row.name ?? '', (v) => acts.rename(sel.id, items[0], v), nameMaxOf('npc'))));
      const offset = field(t('poi.editor.offset', 'Offset (m)'), ...one.row.t.map((v, k) => numberInput(v, (x) => edit.edit(sel.id, 'person', (doc2) => { const q = find(doc2, items[0])?.row; if (q) q.t = q.t.map((o, j) => (j === k ? x : o)); }), { step: 0.1, min: -2000, max: 2000 })));
      // a locked person's spot is read-only, as a locked part's is
      if (marksOf(d).get(items[0])?.frozen) { for (const i of offset.querySelectorAll?.('input') ?? []) i.disabled = true; out.push(el('div', 'dfpoi-sub', t('poi.scene.lockedNote', 'Locked: unlock it in the list to move it.'))); }
      out.push(offset);
      out.push(el('div', 'dfpoi-sub', t('poi.scene.personFacing', 'People always face the player, so they have no turn.')));
    } else {
      out.push(el('div', 'dfpoi-h', t('poi.scene.many', '{n, plural, one {# thing} other {# things}} selected', { n: items.length })));
      out.push(el('div', 'dfpoi-sub', t('poi.scene.manyHint', 'Move, turn, and size them together with the gizmo. Shift+click in the world or Ctrl+click in the list adds or removes one; Shift+click in the list selects a range.')));
    }
    out.push(...markRows(sel.id, d, items));
    out.push(...groupRows(items));
    out.push(...arrangeRows(items.length > 1 || one?.kind === 'group' ? 3 : 1));
    return out;
  }

  /** The marks, the group, duplicate, copy, and delete buttons, and the arrange rows the panel adds under one part's
   *  or one light's own fields. */
  function extras(d, sel) {
    const items = selItems(sel);
    if (items.length !== 1) return [];
    return [...markRows(sel.id, d, items), ...groupRows(items), ...arrangeRows(1)];
  }

  return { rows, searchRow, inspector, extras };
}
