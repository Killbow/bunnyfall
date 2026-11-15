// @ts-check
// Actions on the current selection in the in-game POI editor: copy, cut, paste, duplicate, delete, groups, the hide and
// lock marks, renaming, regrouping, reordering, and the arrange tools. Each change is one undo step (poi/poiEdit.js
// edit) and leaves the selection on what it made. No DOM: the panel's buttons and the editor's keys call these.
// The copy (poi/poiClip.js) is saved in this browser's localStorage (so it survives a reload and reaches other tabs)
// and written to the system clipboard when permitted. Paste reads the saved copy, or the copy this page holds when none
// is saved, and with neither, the system clipboard.

import { t } from '../../systems/textManager.js';
import { pageStorage } from './poiStorage.js';
import { selItems, selectionOf } from '../../poi/poiEdit.js';
import { find, groupNodes, marksOf, movable, moveToGroup, parseId, removeNodes, renameNode, reorderNode, setFlag, ungroup } from '../../poi/poiScene.js';
import { CLIP_STORE_KEY, clipRows, clipText, copyNodes, duplicateNodes, pasteClip, readClip, topIds } from '../../poi/poiClip.js';
import { alignNodes, distributeNodes, groundNodes, moveNodes, resetNodes } from '../../poi/poiArrange.js';

/** How long paste waits for the system clipboard before it gives up (ms). */
export const POI_CLIPBOARD_WAIT_MS = 1500;

/** Parts last, so the primary (the last item) of what was pasted is a part where there is one. @param {string[]} ids */
const partsLast = (ids) => [...ids.filter((i) => !i.startsWith('part:')), ...ids.filter((i) => i.startsWith('part:'))];

/**
 * @param {{ edit: any, say: (text: string, kind?: string) => void, facts?: any, editor?: any,
 *   storage?: Storage | null, clipboard?: { writeText?: (s: string) => Promise<void>, readText?: () => Promise<string> } | null }} deps
 *   `facts` the asset facts (a row whose model or picture the store does not have is left out of a paste); `editor` the
 *   world host (the ground under a row, for drop to ground)
 */
export function createPoiSceneActs({ edit, say, facts = null, editor = null, storage = pageStorage(), clipboard = globalThis.navigator?.clipboard ?? null }) {
  /** The last copy made on this page (the stored one is read first: another tab may have copied since). */
  let held = null;

  const current = () => { const s = edit.selection(); const d = s ? edit.docOf(s.id) : null; return s && d ? { s, d, items: selItems(s) } : null; };
  const stored = () => { try { return readClip(storage?.getItem(CLIP_STORE_KEY)); } catch { return null; } };

  function keep(clip) {
    held = clip;
    const text = clipText(clip);
    try { storage?.setItem(CLIP_STORE_KEY, text); } catch { /* storage blocked or full: held in page memory only */ }
    try { clipboard?.writeText?.(text)?.catch?.(() => {}); } catch { /* the page may not write the system clipboard */ }
  }

  const acts = {
    /** Copy what is selected (the POI itself: everything in it). Cut takes the selected things out after. */
    copy(cut = false) {
      const c = current();
      if (!c) { say(t('poi.editor.copyNone', 'Select something to copy first.'), 'bad'); return false; }
      const ids = c.items.length ? c.items : topIds(c.d);
      const clip = copyNodes(c.d, ids);
      if (!clipRows(clip)) { say(t('poi.editor.copyNone', 'Select something to copy first.'), 'bad'); return false; }
      keep(clip);
      say(t('poi.editor.copied', '{n, plural, one {Copied # thing. Ctrl+V pastes it into the selected POI.} other {Copied # things. Ctrl+V pastes them into the selected POI.}}', { n: clipRows(clip) }));
      if (cut && c.items.length) acts.remove();
      return true;
    },
    /** Paste the copy into the selected POI, what was pasted selected. Answers whether it pasted (a promise when it must
     *  ask the system clipboard first). */
    paste() {
      const clip = stored() ?? held;
      if (clip) return pasteInto(clip);
      if (!clipboard?.readText) { say(t('poi.editor.pasteNone', 'Nothing copied yet. Select something and press Ctrl+C.'), 'bad'); return false; }
      let read;
      try { read = clipboard.readText(); } catch { read = Promise.resolve(''); }
      return Promise.race([read, new Promise((r) => setTimeout(() => r(''), POI_CLIPBOARD_WAIT_MS))]).then((text) => {
        const got = readClip(/** @type {string} */ (text));
        if (!got) { say(t('poi.editor.pasteNone', 'Nothing copied yet. Select something and press Ctrl+C.'), 'bad'); return false; }
        held = got;
        return pasteInto(got);
      }, () => { say(t('poi.editor.pasteNone', 'Nothing copied yet. Select something and press Ctrl+C.'), 'bad'); return false; });
    },
    /** Copies of what is selected, where it stands, in its own groups; the copies selected. */
    duplicate() {
      const c = current();
      if (!c || !c.items.length) return false;
      let out = null;
      edit.edit(c.s.id, 'duplicate', (x) => { out = duplicateNodes(x, c.items, { has }); }, () => made(c.s.id, out));
      return told(out);
    },
    /** Take what is selected out (a group with everything in it). The POI itself: a new one thrown away, a saved one not. */
    remove() {
      const c = current();
      if (!c) return false;
      if (c.items.length) {
        // a locked row is not deleted (by its own lock, its group's, or inside a group being deleted): unlocked first
        if (lockedIn(c.d, c.items)) { say(t('poi.scene.deleteLocked', 'Locked things cannot be deleted. Unlock them first.'), 'bad'); return false; }
        const one = c.items.length === 1 ? parseId(c.items[0]) : null;
        const label = one?.kind === 'part' ? 'remove part' : one?.kind === 'npc' ? 'remove person' : one?.kind === 'light' ? 'light' : 'delete';
        return edit.edit(c.s.id, label, (x) => { removeNodes(x, c.items); }, { id: c.s.id, items: [] });
      }
      if (edit.entryOf(c.s.id)?.state === 'new' && !edit.entryOf(c.s.id)?.saved) return edit.remove(c.s.id);
      say(t('poi.editor.deleteSaved', 'To take a saved POI out of the world, ask to retire it.'), 'bad');
      return false;
    },
    /** What is selected put in a new group, the group selected. */
    group() {
      const c = current();
      if (!c || !c.items.length) { say(t('poi.scene.groupNone', 'Select the things to group first.'), 'bad'); return false; }
      const name = t('poi.scene.groupName', 'Group');
      const r = groupNodes(structuredClone(c.d), c.items, name);
      if ('refused' in r) { say(refusedText(/** @type {string} */ (r.refused)), 'bad'); return false; }
      return edit.edit(c.s.id, 'group', (x) => { groupNodes(x, c.items, name); }, { id: c.s.id, items: [`group:${r.key}`] });
    },
    /** The selected groups dissolved: what was in them selected. */
    ungroup() {
      const c = current();
      const groups = c ? c.items.filter((i) => i.startsWith('group:')).map((i) => parseId(i).key) : [];
      if (!c || !groups.length) return false;
      const freed = [];
      for (const k of groups) {
        for (const g of c.d.groups ?? []) if (g.parent === k) freed.push(`group:${g.key}`);
        for (const [name, kind] of [['parts', 'part'], ['lights', 'light'], ['npcs', 'npc'], ['flats', 'flat']]) (c.d[name] ?? []).forEach((r, i) => { if (r?.group === k) freed.push(kind === 'light' ? `light:${i}` : `${kind}:${r.key}`); });
      }
      return edit.edit(c.s.id, 'ungroup', (x) => { for (const k of groups) ungroup(x, k); }, { id: c.s.id, items: freed });
    },
    /** A mark (`visible` or `locked`) set on rows or groups of a POI. */
    flag(/** @type {string} */ id, /** @type {string[]} */ ids, /** @type {'visible' | 'locked'} */ flag, /** @type {boolean} */ value) {
      return edit.edit(id, flag === 'visible' ? 'visibility' : 'lock', (x) => { setFlag(x, ids, flag, value); });
    },
    /** A row or group renamed. */
    rename(/** @type {string} */ id, /** @type {string} */ rowId, /** @type {string} */ name) {
      return edit.edit(id, 'rename', (x) => { renameNode(x, rowId, name); });
    },
    /** Rows moved into a group (null: out of every group). */
    regroup(/** @type {string} */ id, /** @type {string[]} */ ids, /** @type {string | null} */ groupKey) {
      const d = edit.docOf(id);
      if (!d) return false;
      const probe = structuredClone(d);
      const r = moveToGroup(probe, ids, groupKey);
      if (r.refused) { say(refusedText(r.refused), 'bad'); return false; }
      return edit.edit(id, 'regroup', (x) => { moveToGroup(x, ids, groupKey); });
    },
    /** A row moved before another of its kind (into that one's group too); `before` null: to the end. */
    reorder(/** @type {string} */ id, /** @type {string} */ rowId, /** @type {string | null} */ before) {
      const d = edit.docOf(id), f = d ? find(d, rowId) : null, b = d && before ? find(d, before) : null;
      if (!f) return false;
      const sel = edit.selection();
      let now = rowId;
      // a light's id is its place in the list: every selected light is renamed for its new place
      const lightAt = (i) => {
        const from = f.index, to = Number(parseId(now).key);
        if (i === from) return to;
        const j = i > from ? i - 1 : i;
        return j >= to ? j + 1 : j;
      };
      const remap = (i) => (f.kind === 'light' && i.startsWith('light:') ? `light:${lightAt(Number(parseId(i).key))}` : i);
      return edit.edit(id, 'reorder', (x) => {
        if (b && f.kind !== 'group' && b.kind !== 'group') moveToGroup(x, [rowId], b.row.group ?? null);
        now = reorderNode(x, rowId, before) ?? rowId;
      }, sel?.id === id ? () => ({ id, items: selItems(sel).map(remap) }) : undefined);
    },
    /** The arrange tools on what is selected: `align` (axis, 'min' | 'mid' | 'max'), `distribute` (axis), `reset`,
     *  `move` (a delta in the POI's frame), `ground`. Answers how many rows changed. */
    arrange(/** @type {'align' | 'distribute' | 'reset' | 'move' | 'ground'} */ how, /** @type {any} */ a = null, /** @type {any} */ b = null) {
      const c = current();
      if (!c || !c.items.length) { say(t('poi.scene.arrangeNone', 'Select the things to arrange first.'), 'bad'); return 0; }
      let n = 0;
      edit.edit(c.s.id, 'arrange', (x) => {
        if (how === 'align') n = alignNodes(x, c.items, a, b);
        else if (how === 'distribute') n = distributeNodes(x, c.items, a);
        else if (how === 'reset') n = resetNodes(x, c.items);
        else if (how === 'move') n = moveNodes(x, c.items, a);
        else if (how === 'ground') n = groundNodes(x, c.items, (rowId) => editor?.liftToGround?.(c.s.id, rowId) ?? null);
      });
      if (!n) say(arrangeNone(how, c.d, c.items), 'bad');
      return n;
    },
    /** The copy paste would use now, or null. */
    clip: () => stored() ?? held,
  };

  /** Why an arrange tool changed nothing, in the builder's words: what the selection is, not a guess. */
  function arrangeNone(how, d, items) {
    const free = movable(d, items), all = movable(d, items, true);
    const kinds = new Set(free.map((i) => parseId(i).kind));
    if (!free.length && all.length) return t('poi.scene.arrangeLocked', 'Nothing was changed: what is selected is locked.');
    if (how === 'align') return t('poi.scene.alignTwo', 'Align needs two things that are not locked.');
    if (how === 'distribute') return t('poi.scene.spreadThree', 'Spread needs three things that are not locked.');
    if (how === 'reset') return t('poi.scene.resetNone', 'Nothing was changed: people and lights have no turn or size to reset.');
    if (how === 'ground' && [...kinds].every((k) => k === 'light')) return t('poi.scene.groundLights', 'Nothing was moved: lights stay where they shine from.');
    if (how === 'ground') return t('poi.scene.groundUnknown', 'Nothing was moved: the ground under it has not loaded yet.');
    return t('poi.scene.arrangeNothing', 'Nothing was changed.');
  }

  /** Whether an asset may be pasted: false only for one the store is known not to have. */
  function has(/** @type {string} */ sha) { return !(facts?.known?.(sha) && facts.of(sha) === null); }

  function pasteInto(clip) {
    const c = current();
    if (!c) { say(t('poi.editor.pasteWhere', 'Select the POI to paste into first.'), 'bad'); return false; }
    if (!clipRows(clip)) { say(t('poi.editor.pasteNone', 'Nothing copied yet. Select something and press Ctrl+C.'), 'bad'); return false; }
    let out = null;
    edit.edit(c.s.id, 'paste', (x) => { out = pasteClip(x, clip, { has }); }, () => made(c.s.id, out));
    return told(out);
  }
  /** The selection a paste or duplicate leaves: what it made (undefined: as it was, when nothing was made). */
  const made = (id, out) => (out && out.top.length ? selectionOf(id, partsLast(out.top)) : undefined);
  function told(out) {
    if (!out) return false;
    if (out.missing.length) say(t('poi.clip.missing', 'Left out {n, plural, one {# thing} other {# things}} whose model or picture the store does not have: {names}.', { n: out.missing.length, names: out.missing.slice(0, 4).join(', ') }), 'bad');
    else if (out.full.length) say(t('poi.editor.pasteFull', 'The POI is full: {n, plural, one {# thing was} other {# things were}} left out.', { n: out.full.length }), 'bad');
    return out.ids.length > 0;
  }
  return acts;
}

/** Whether `ids` hold a locked row or group, or a group with a locked row or group inside it. @param {any} d @param {string[]} ids */
export function lockedIn(d, ids) {
  const marks = marksOf(d);
  if (ids.some((i) => marks.get(i)?.frozen)) return true;
  return movable(d, ids, true).some((i) => marks.get(i)?.frozen);
}

/** A refused group change in the builder's words. @param {string} why */
export function refusedText(why) {
  if (why === 'groups') return t('poi.scene.tooManyGroups', 'A POI holds {n} groups at most.', { n: 64 });
  if (why === 'depth') return t('poi.scene.tooDeep', 'Groups go {n} deep at most.', { n: 8 });
  if (why === 'cycle') return t('poi.scene.cycle', 'A group cannot go inside itself.');
  return t('poi.scene.refused', 'That cannot be grouped.');
}
