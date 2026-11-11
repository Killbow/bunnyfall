// @ts-check

// The World Builder. This file wires the panels to one editing session: the document, the selection, the clipboard,
// the server and the viewport. It holds no law of its own: the law is src/poi, the rest is in the modules beside it.

import { createPoiEdit, newPoiDoc } from '../../../src/poi/poiEdit.js';
import { mintPoiId } from '../../../src/poi/poiLaw.js';
import { problemText } from '../../../src/poi/poiText.js';
import { createApi, cleanBase } from './api.js';
import { createCatalogue, createAssetPrefs } from './catalogue.js';
import { createArenaData } from './arenaData.js';
import { find, flatOrder, groupNodes, ungroup, removeNodes } from './scene.js';
import { copyNodes, pasteClip, duplicateNodes, readClip, clipText } from './clipboard.js';
import { alignNodes, distributeNodes, groundNodes, resetNodes } from './transforms.js';
import { placeAsset } from './place.js';
import { h } from './ui/dom.js';
import { createLayout } from './ui/layout.js';
import { createToolbar } from './ui/toolbar.js';
import { createAssetBrowser, DRAG_TYPE } from './ui/browser.js';
import { createHierarchy } from './ui/hierarchy.js';
import { createInspector } from './ui/inspector.js';
import { createBottom, problemsOf } from './ui/bottom.js';
import { createViewport } from './ui/viewport3d.js';
import { createCanvas2d } from './ui/canvas2d.js';
import { ask, confirmBox } from './ui/dialog.js';

const CLIP_KEY = 'bunnyfall.worldbuilder.clip';
const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const layout = createLayout(root);

async function boot() {
  let json;
  try { const r = await fetch('./asset-catalogue.json'); if (!r.ok) throw new Error(String(r.status)); json = await r.json(); } catch (e) {
    root.append(h('div', { class: 'pane bad', text: `The asset catalogue is missing (${e}). Run: ARENA2_PATH=... node tools/poi-editor/scripts/buildAssetCatalogue.mjs` }));
    return;
  }
  const catalogue = createCatalogue(json);
  const prefs = createAssetPrefs(globalThis.localStorage);
  const api = createApi();
  const edit = createPoiEdit();
  const arena = createArenaData();
  const log = { lines: /** @type {string[]} */ ([]) };
  const stepsLog = /** @type {string[]} */ ([]);
  const say = (m) => { log.lines.push(`${new Date().toLocaleTimeString('en')}  ${m}`); queue(); };
  const S = { docId: /** @type {string | null} */ (null), sel: /** @type {string[]} */ ([]), mode: 'move', space: 'world', camera: 'persp', view: '3d', pasteN: 0 };

  const getDoc = () => (S.docId ? edit.docOf(S.docId) : null);
  const docId = () => S.docId;
  const getSel = () => S.sel;
  const alive = () => { const d = getDoc(); S.sel = d ? S.sel.filter((id) => find(d, id)) : []; };
  const act = (label, fn, after = null) => { if (!S.docId) return; edit.edit(S.docId, label, fn); stepsLog.push(`${new Date().toLocaleTimeString('en')}  ${label}`); if (after) S.sel = after(getDoc()) ?? S.sel; alive(); queue(); };
  const select = (ids, how) => {
    if (how === 'set') S.sel = [...new Set(ids)];
    else if (how === 'add') S.sel = [...new Set([...S.sel, ...ids])];
    else S.sel = ids.reduce((a, id) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]), S.sel);
    queue();
  };

  // ── panels ──
  const stage = h('div', { class: 'stage' });
  const glCanvas = /** @type {HTMLCanvasElement} */ (h('canvas', { id: 'viewport-gl' }));
  const hudCanvas = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'hud' }));
  const stage2d = h('div', { class: 'stage', style: { display: 'none' } });
  stage.append(glCanvas, hudCanvas);
  layout.center.append(stage, stage2d);
  const browser = createAssetBrowser({ host: layout.leftTop, catalogue, prefs, onPlace: (a) => place(a, null) });
  const hierarchy = createHierarchy({ host: layout.leftBottom, getDoc, docId, edit, getSel, select, say });
  const inspector = createInspector({ host: layout.right, getDoc, docId, edit, getSel });
  const bottom = createBottom({ host: layout.bottom, getDoc, docId, api, log, steps: () => stepsLog });
  const viewport = createViewport({ canvas: glCanvas, hud: hudCanvas, arena, getDoc, getSel, edit, docId: () => S.docId, on: { select, changed: () => { stepsLog.push(`${new Date().toLocaleTimeString('en')}  transform`); queue(); } } });
  const c2d = createCanvas2d({ host: stage2d, arena, getDoc, getSel, catalogue });

  // ── clipboard ──
  const remember = async (clip) => { const t = clipText(clip); try { globalThis.localStorage?.setItem(CLIP_KEY, t); } catch { /* blocked */ } try { await navigator.clipboard?.writeText(t); } catch { /* the page may not write the system clipboard */ } };
  const recall = async () => { let t = null; try { t = await navigator.clipboard?.readText(); } catch { /* denied */ } let c = t ? readClip(t) : null; if (!c) { try { c = readClip(globalThis.localStorage?.getItem(CLIP_KEY) ?? ''); } catch { c = null; } } return c; };

  function place(asset, at) {
    if (!S.docId) { say('Open or create a POI first.'); return; }
    let spot = at;
    if (!spot) { const t = viewport?.camera.target ?? [0, 0, 0]; spot = [Math.round(t[0] * 4) / 4, 0, Math.round(t[2] * 4) / 4]; }
    let made = null;
    act(`place ${asset.name}`, (d) => { made = placeAsset(d, asset, spot); }, () => (made?.id ? [made.id] : null));
    if (made?.refused) { say(made.refused); return; }
    prefs.noteUsed(asset.id);
  }

  // ── actions ──
  const A = {
    run(name) { const [fn, ...args] = String(name).split(':'); const f = /** @type {any} */ (A)[fn]; if (typeof f === 'function') return f(...args); return undefined; },
    async newDoc() {
      const v = await ask('New POI', [{ name: 'name', label: 'Name', value: 'New POI' }, { name: 'px', label: 'Map pixel x', type: 'number', value: '500', hint: '0 to 999' }, { name: 'py', label: 'Map pixel y', type: 'number', value: '250', hint: '0 to 499' }], { ok: 'Create', validate: (x) => (!x.name.trim() ? 'Give it a name.' : !(+x.px >= 0 && +x.px <= 999 && +x.py >= 0 && +x.py <= 499) ? 'Pixel is outside the 1000 x 500 map.' : null) });
      if (!v) return;
      const id = mintPoiId((b) => { globalThis.crypto.getRandomValues(b); return b; });
      const doc = newPoiDoc({ id, px: Math.round(+v.px), py: Math.round(+v.py), x: 0, z: 0, name: v.name.trim().slice(0, 64) });
      doc.v = 2; doc.groups = [];
      edit.open(id, { doc, saved: doc, state: 'new' });
      const e = edit.entryOf(id); if (e) e.saved = null;
      S.docId = id; S.sel = []; stepsLog.length = 0; say(`Created ${doc.name}.`); viewport?.frameSelection();
    },
    async openDoc() {
      const r = await api.list();
      if (!r.ok) { say(`The store said: ${r.error}`); return; }
      const pois = r.data.pois ?? [];
      if (!pois.length) { say('The store holds no POIs you may see.'); return; }
      const v = await ask('Open from the store', [{ name: 'id', label: 'POI', options: pois.map((p) => [p.id, `${p.id}  (newest revision ${p.newestRev ?? '-'}${p.liveRev ? `, live ${p.liveRev}` : ''})`]) }], { ok: 'Open' });
      if (!v) return;
      const hr = await api.history(v.id);
      if (!hr.ok) { say(`The store said: ${hr.error}`); return; }
      const revs = (hr.data.revs ?? []).filter((x) => x.doc);
      const newest = revs.sort((a, b) => b.rev - a.rev)[0];
      if (!newest) { say('That POI has no document to open.'); return; }
      const doc = structuredClone(newest.doc);
      if (doc.v === 1) { doc.v = 2; say('This POI was version 1. It is open as version 2 (the same content).'); }
      const live = pois.find((p) => p.id === v.id)?.liveRev ?? null;
      edit.open(v.id, { doc, saved: newest.doc, base: live, rev: newest.rev, state: newest.state });
      S.docId = v.id; S.sel = []; stepsLog.length = 0; say(`Opened ${doc.name} at revision ${newest.rev}.`); viewport?.frameSelection();
    },
    async save() {
      const doc = getDoc();
      if (!doc || !S.docId) return null;
      const r = await api.saveDraft(doc, edit.entryOf(S.docId)?.base ?? null);
      if (r.ok) { edit.markSaved(S.docId, { rev: r.data.rev, state: r.data.state }); say(`Saved draft, revision ${r.data.rev}.`); queue(); return r.data; }
      say(`Not saved: ${r.error}${r.why ? ` (${r.why})` : ''}`);
      for (const p of r.problems ?? []) say(`  ${problemText(p)}`);
      return null;
    },
    async submit() {
      if (!S.docId) return;
      const saved = await A.save();
      if (!saved) return;
      if (!(await confirmBox('Submit for approval', 'An approver will review this revision. You can withdraw it later.', 'Submit'))) return;
      const r = await api.submit(S.docId, saved.rev);
      if (r.ok) { edit.markSaved(S.docId, { rev: saved.rev, state: 'submitted' }); say(`Submitted revision ${saved.rev}.`); } else say(`Not submitted: ${r.error}`);
      queue();
    },
    closeDoc() { if (S.docId) edit.close(S.docId); S.docId = null; S.sel = []; queue(); },
    undo() { const l = edit.undo(); if (l) say(`Undid ${l}.`); alive(); queue(); },
    redo() { const l = edit.redo(); if (l) say(`Redid ${l}.`); alive(); queue(); },
    async copy() { const d = getDoc(); if (d && S.sel.length) { await remember(copyNodes(d, S.sel)); say(`Copied ${S.sel.length}.`); } },
    async cut() { await A.copy(); A.remove(); },
    async paste() {
      const d = getDoc(); if (!d) return;
      const clip = await recall();
      if (!clip) { say('The clipboard holds no POI items.'); return; }
      S.pasteN++;
      let out = null;
      act('paste', (doc) => { out = pasteClip(doc, clip, { offset: [S.pasteN, 0, S.pasteN], has: (id) => !catalogue.assets.length || catalogue.has(id) }); }, () => out?.ids?.filter((i) => !i.startsWith('group:')) ?? null);
      for (const m of out?.missing ?? []) say(`Left out ${m.what}: ${m.why}.`);
      for (const f of out?.full ?? []) say(`No room for ${f}.`);
    },
    duplicate() { if (!S.sel.length) return; let out = null; act('duplicate', (d) => { out = duplicateNodes(d, S.sel, { offset: [1, 0, 1] }); }, () => out?.ids ?? null); },
    remove() { if (!S.sel.length) return; const ids = [...S.sel]; act('delete', (d) => { removeNodes(d, ids); }, () => []); },
    group() { if (!S.sel.length) return; const ids = [...S.sel]; let r = null; act('group', (d) => { r = groupNodes(d, ids, 'Group'); }, () => (r?.key ? [`group:${r.key}`] : null)); if (r?.refused) say(`Cannot group: ${r.refused}.`); },
    ungroup() { const g = S.sel.find((i) => i.startsWith('group:')); if (g) act('ungroup', (d) => { ungroup(d, g.slice(6)); }, () => []); },
    selectAll() { const d = getDoc(); if (d) select(flatOrder(d).filter((i) => !i.startsWith('group:')), 'set'); },
    mode(m) { S.mode = m; viewport?.setMode(m); queue(); },
    space() { S.space = S.space === 'world' ? 'local' : 'world'; if (viewport) viewport.state.space = /** @type {any} */ (S.space); viewport?.dirty(); queue(); },
    snapOn(v) { if (viewport) viewport.state.snapOn = !!v; viewport?.dirty(); queue(); },
    snapStep(k, v) { if (viewport && Number.isFinite(v) && v >= 0) { viewport.state.snap[k] = v; viewport.dirty(); } queue(); },
    camera(m) { S.camera = m; viewport?.setCamera(m); queue(); },
    frame() { viewport?.frameSelection(); },
    view(v) { S.view = v; stage.style.display = v === '3d' ? '' : 'none'; stage2d.style.display = v === '2d' ? '' : 'none'; if (v === '2d') c2d.draw(); queue(); },
    align(i, mode) { act('align', (d) => { alignNodes(d, S.sel, Number(i), mode); }); },
    distribute(i) { act('distribute', (d) => { distributeNodes(d, S.sel, Number(i)); }); },
    ground() { act('set height', (d) => { groundNodes(d, S.sel, 0); }); },
    reset() { act('reset turn and size', (d) => { resetNodes(d, S.sel); }); },
    async env(id) {
      if (id === 'custom') { const v = await ask('Server', [{ name: 'base', label: 'Address', value: api.environment().id === 'custom' ? api.environment().base : 'https://', hint: 'The account service, for example https://staging.example.org' }], { validate: (x) => (cleanBase(x.base) ? null : 'That is not an http or https address.') }); if (!v) { queue(); return; } api.setEnvironment('custom', v.base); } else api.setEnvironment(id);
      queue();
    },
    async signIn() {
      const v = await ask(`Sign in to ${api.environment().base}`, [{ name: 'handle', label: 'Username' }, { name: 'password', label: 'Password', type: 'password' }], { ok: 'Sign in', validate: (x) => (!x.handle || !x.password ? 'Both are needed.' : null) });
      if (!v) return;
      const r = await api.signIn(v.handle, v.password);
      say(r.ok ? `Signed in as ${r.me?.handle}. ${r.me?.builder || r.me?.approver ? '' : 'This account has no builder role.'}` : `Sign-in failed: ${r.error}`);
      queue();
    },
    async signOut() { await api.signOut(); say('Signed out.'); queue(); },
    panels() { const all = layout.fold.left && layout.fold.right && layout.fold.bottom; for (const k of /** @type {const} */ (['left', 'right', 'bottom'])) if (layout.fold[k] === !all) layout.toggle(k); viewport?.dirty(); },
  };

  // ── toolbar ──
  const toolbar = createToolbar({ host: layout.toolbar, actions: /** @type {any} */ (A), getState: () => {
    const d = getDoc(), e = S.docId ? edit.entryOf(S.docId) : null, dirtyNow = !!S.docId && edit.dirty(S.docId);
    const st = e?.state ?? 'none';
    const badge = !d ? { cls: 'none', text: 'NO POI', why: 'Open or create a POI.' }
      : st === 'new' || dirtyNow ? { cls: 'draft', text: dirtyNow && st !== 'new' ? 'DRAFT, UNSAVED CHANGES' : 'DRAFT, NOT SAVED', why: 'Only you can see this. Nothing is published.' }
        : st === 'draft' ? { cls: 'draft', text: `DRAFT REV ${e?.rev}`, why: 'Saved as a draft. Not submitted.' }
          : st === 'submitted' ? { cls: 'draft', text: 'SUBMITTED', why: 'Waiting for an approver.' }
            : st === 'approved' ? { cls: 'live', text: 'LIVE', why: 'Approved by an approver and shown to players.' } : { cls: 'draft', text: String(st).toUpperCase(), why: '' };
    return { docId: S.docId, sel: S.sel.length, mode: S.mode, space: S.space, camera: S.camera, view: S.view, snapOn: viewport?.state.snapOn ?? true, snap: viewport?.state.snap ?? { move: 0.25, turn: 15 }, env: api.environment(), signedIn: api.signedIn(), me: api.me(), canUndo: edit.canUndo(), canRedo: !!edit.redoLabel(), problems: d ? problemsOf(d).length : 0, badge };
  } });

  let pending = false;
  function queue() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; refresh(); }); }
  function refresh() { alive(); toolbar.render(); hierarchy.render(); inspector.render(); bottom.render(); viewport?.dirty(); if (S.view === '2d') c2d.draw(); }
  edit.onChange(queue); api.onChange(queue);

  // ── keyboard and drops ──
  document.addEventListener('keydown', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) A.redo(); else A.undo(); }
    else if (mod && k === 'y') { e.preventDefault(); A.redo(); }
    else if (mod && k === 'c') { e.preventDefault(); A.copy(); } else if (mod && k === 'x') { e.preventDefault(); A.cut(); } else if (mod && k === 'v') { e.preventDefault(); A.paste(); }
    else if (mod && k === 'd') { e.preventDefault(); A.duplicate(); } else if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) A.ungroup(); else A.group(); }
    else if (mod && k === 'a') { e.preventDefault(); A.selectAll(); } else if (mod && k === 's') { e.preventDefault(); A.save(); }
    else if (k === 'delete' || k === 'backspace') { A.remove(); }
    else if (!mod && !e.altKey && document.activeElement !== glCanvas) { if (k === 'q') A.mode('select'); else if (k === 'w') A.mode('move'); else if (k === 'e') A.mode('turn'); else if (k === 'r') A.mode('size'); else if (k === 'f') A.frame(); }
    else if (!mod && document.activeElement === glCanvas && !e.altKey) { if (k === 'q' && !e.buttons) A.mode('select'); else if (k === 'f') A.frame(); else if (k === 'r' && !e.buttons) A.mode('size'); }
  });
  glCanvas.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes(DRAG_TYPE)) e.preventDefault(); });
  glCanvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const a = catalogue.get(e.dataTransfer?.getData(DRAG_TYPE) ?? '');
    if (!a) return;
    const g = viewport?.groundAtClient(e.clientX, e.clientY);
    place(a, g ? [Math.round(g[0] * 4) / 4, 0, Math.round(g[2] * 4) / 4] : null);
  });
  addEventListener('beforeunload', (e) => { if (S.docId && edit.dirty(S.docId)) e.preventDefault(); });

  await arena.open();
  say(arena.state() === 'loaded' ? 'Game files found.' : 'Game files not found. Set ARENA2_PATH to the ARENA2 folder and restart.');
  if (api.signedIn()) api.refreshMe();
  /** @type {any} */ (globalThis).__builder = { S, A, edit, catalogue, viewport, getDoc, api, arena, prefs, browser };   // for the headless probe
  refresh();
}
boot();
