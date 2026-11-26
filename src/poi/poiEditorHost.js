// @ts-check

import {
  movePlace, rotatePlace, scalePlace, movePart, rotatePart, scalePart, partWorldQuat, worldToPlace, newPart, newLight, newNpc, selItems, selectionOf,
} from './poiEdit.js';
import { find, marksOf, movable, parseId } from './poiScene.js';
import { applyMulti, pivotOf, singleItem } from './poiMulti.js';
import { flatRoom, placeFlatAt } from './poiFlatRows.js';
import { boxPick, editorView, liftOf, npcLine, pickNpc, rectLines, spotOf } from './poiEditorSelect.js';
import { gizmoSize, POI_SNAP_DEFAULT } from './poiGizmo.js';
import { pickGizmo, gizmoDraw, viewForward, createGizmoEase, GIZMO_DIM, GIZMO_ARM_PX } from './poiGizmoLook.js';
import { beginHandleDrag, handleDragResult, cornersOf } from './poiGizmoBox.js';
import { createSelectionBoxes, createSizeBox, pointUnder } from './poiEditorFrame.js';
import { quatRotate } from '../world/quat.js';
import { lookDir } from '../homes/decorTool.js';
import { rayDirFromScreen } from '../player/tapRay.js';
import { canvasPoint } from '../player/travelPick.js';
import { capturePointer } from '../ui/pointerCapture.js';

export const POI_EYE = Object.freeze({ speed: 12, min: 0.5, max: 600, wheel: 1.25, fast: 4, look: 0.0035, pitch: 1.55 });
export const POI_EYE_ACTIONS = Object.freeze(['MoveForwards', 'MoveBackwards', 'MoveLeft', 'MoveRight', 'Jump', 'FloatUp', 'Crouch', 'FloatDown', 'Run']);
export const POI_PICK_REACH = 6000;
export const POI_CLICK_SLOP = 4;
export const POI_HANDLE_COLOR = Object.freeze({
  x: [0.9, 0.16, 0.14, 1], y: [0.2, 0.38, 1, 1], z: [0.2, 0.78, 0.18, 1],
  view: [0.92, 0.92, 0.92, 1], all: [0.85, 0.85, 0.85, 1], hover: [1, 0.86, 0.2, 1],
});
export const POI_BOX_COLOR = Object.freeze({ poi: [1, 0.7, 0.25, 0.9], part: [1, 0.86, 0.2, 1], ghost: [0.6, 0.9, 1, 1], person: [0.75, 0.6, 1, 0.9], locked: [0.6, 0.6, 0.6, 0.7] });

const AXES_WORLD = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {number[]} b */
export function boxLines(b, color) {
  const p = (i, j, k) => [i ? b[3] : b[0], j ? b[4] : b[1], k ? b[5] : b[2]];
  const out = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    out.push({ a: p(0, i, j), b: p(1, i, j), color }, { a: p(i, 0, j), b: p(i, 1, j), color }, { a: p(i, j, 0), b: p(i, j, 1), color });
  }
  return out;
}

/** @param {{
 *   edit: any, feed: any, host: any,
 *   view: () => ({ proj: Float32Array, view: Float32Array, eye: number[], fovY: number, w: number, h: number, rect?: any, canvasRect?: any } | null),
 *   translation: (px: number, py: number, out?: number[]) => number[],
 *   sceneToPixel: (p: number[]) => ({ px: number, py: number, x: number, z: number } | null),
 *   groundHit: (o: number[], d: number[]) => ({ point: number[] | null, dist: number }),
 *   surfaceAt: (x: number, z: number) => number, groundEpoch?: () => number, snowRise?: () => number,
 *   onChange?: () => void, pass?: any, actionOf?: (e: any) => (string | null),
 *   viewport?: () => (ArrayLike<number> | null), gone?: () => boolean, onGone?: () => void,
 * }} deps */
export function createPoiEditorHost({ edit, feed, host, view, translation, sceneToPixel, groundHit, surfaceAt, groundEpoch = () => 0, snowRise = () => 0, onChange = () => {}, pass = null, actionOf = () => null, viewport = () => null, gone = () => false, onGone = () => {} }) {
  let on = false;
  /** @type {'select' | 'move' | 'turn' | 'size'} */
  let mode = 'move';
  /** @type {'world' | 'local'} */
  let space = 'world';
  let snapOn = false;
  const snap = { ...POI_SNAP_DEFAULT };
  const eye = { speed: /** @type {number} */ (POI_EYE.speed), look: false, pan: false, orbit: false, keys: new Set(), lastX: 0, lastY: 0 };
  let ctrlHeld = false;
  /** @type {string | null} */
  let hover = null;
  const ease = createGizmoEase();
  /** @type {null | { handle: string, state: any, id: string, part: string | null, light: number | null, start: any, px: number, py: number, frame: number[], now: number[], multi: null | { ids: string[], pivot: number[], axes: number[][] }, last: any }} */
  let drag = null;
  /** @type {null | { x: number, y: number, moved: boolean, button: number, shift?: boolean, at?: number[] }} */
  let press = null;
  /** @type {null | { kind: 'poi', name: string } | { kind: 'part', asset: any, fallbackName?: string } | { kind: 'spot', id: string, done: (p: number[]) => void } | { kind: 'flat', flat: any, fallbackName?: string } | { kind: 'npc', npc: any, fallbackName?: string }} */
  let placing = null;
  /** @type {((placeOf: (id: string) => any, groundAt: (x: number, z: number) => number, groundEpoch: number) => ({ inWorld: any[], onTop: any[] } | null)) | null} */
  let overlay = null;
  /** @type {number[] | null} */
  let placeAt = null;
  let overlayGen = -1;
  /** @type {string | null} */
  let lastPoi = null;
  /** @type {'away' | 'shown' | 'full' | null} */
  let refusedLast = null;
  edit.onChange(() => { const s = edit.selection(); if (s) lastPoi = s.id; else if (lastPoi && !edit.has(lastPoi)) lastPoi = null; });
  const placeInto = () => edit.selection() ?? (lastPoi && edit.has(lastPoi) ? { id: lastPoi, items: [] } : null);
  const refusalOf = (/** @type {string} */ id) => (edit.shownAs?.(id) !== undefined ? 'shown' : !originOfDoc(edit.docOf(id)) ? 'away' : null);
  const told = () => { try { onChange(); } catch (e) { console.warn('[poi] editor listener', e); } };
  const boxesOf = createSelectionBoxes({ edit, host, boxLines, colors: POI_BOX_COLOR }), sizeBoxOf = createSizeBox({ edit, host });

  function rayAt(clientX, clientY) {
    const v = view();
    if (!v) return null;
    const [sx, sy] = canvasPoint(clientX, clientY, v.canvasRect);
    const d = rayDirFromScreen(sx, sy, v.w, v.h, v.proj, v.view, v.eye, v.rect ?? null);
    return d ? { o: [...v.eye], d } : null;
  }

  function originOfDoc(doc) {
    const t = translation(doc.place.px, doc.place.py, [0, 0, 0]);
    let ground = 0;
    if (doc.place.ground === 'snap') {
      const g = surfaceAt(t[0] + doc.place.x, t[2] + doc.place.z);
      if (!Number.isFinite(g)) return null;
      ground = g - t[1];
    }
    return [t[0] + doc.place.x, t[1] + ground + doc.place.y, t[2] + doc.place.z];
  }

  function target() {
    const sel = edit.selection();
    if (!sel) return null;
    const doc = edit.docOf(sel.id);
    if (!doc) return null;
    const origin = originOfDoc(doc);
    if (!origin) return null;
    const items = selItems(sel);
    if (items.length && (!singleItem(items) || marksOf(doc).get(items[0])?.frozen)) {
      const ids = movable(doc, items);
      const pivot = ids.length ? pivotOf(doc, ids) : null;
      if (!pivot) return null;
      const lastPart = [...ids].reverse().map((i) => find(doc, i)).find((f) => f?.kind === 'part')?.row;
      const q = lastPart ? partWorldQuat(doc.place, lastPart) : doc.place.r;
      const axes = space === 'local' || mode === 'size' ? AXES_WORLD.map((a) => quatRotate(q, a)) : AXES_WORLD;
      return { c: spotOf(doc, origin, pivot), axes, doc, sel, multi: { ids, pivot }, moveOnly: !ids.some((i) => i.startsWith('part:') || i.startsWith('flat:')) };
    }
    if (sel.light != null) {
      const l = doc.lights?.[sel.light];
      if (!l) return null;
      return { c: add(origin, mul(quatRotate(doc.place.r, l.t), doc.place.s)), axes: AXES_WORLD, doc, sel, light: l };
    }
    if (sel.part == null) {
      const axes = space === 'local' || mode === 'size' ? AXES_WORLD.map((a) => quatRotate(doc.place.r, a)) : AXES_WORLD;
      return { c: origin, axes, doc, sel };
    }
    const part = doc.parts.find((p) => p.key === sel.part);
    if (!part) return null;
    const c = add(origin, mul(quatRotate(doc.place.r, part.t), doc.place.s));
    const q = partWorldQuat(doc.place, part);
    const axes = space === 'local' || mode === 'size' ? AXES_WORLD.map((a) => quatRotate(q, a)) : AXES_WORLD;
    return { c, axes, doc, sel, part };
  }

  function gizmo() {
    if (mode === 'select') return null;
    const tg = target();
    const v = view();
    if (!tg || !v || ((tg.light || tg.moveOnly) && mode !== 'move')) return null;
    if (edit.shownAs?.(tg.sel.id) !== undefined) return null;
    const vd = sub(tg.c, v.eye);
    const l = Math.hypot(vd[0], vd[1], vd[2]) || 1;
    const viewDir = mul(vd, 1 / l);
    const L = gizmoSize(v.eye, viewDir, tg.c, v.fovY, v.h, GIZMO_ARM_PX);
    const F = (v.proj[5] * v.h * (v.rect?.h ?? 1)) / 2;
    const box = mode === 'size' ? sizeBoxOf(tg, boxPoints) : null;
    return { mode, c: tg.c, axes: tg.axes, L, viewDir, pxWorld: L / GIZMO_ARM_PX, tg, eye: v.eye, fwd: viewForward(v.view, viewDir), F, box, grow: ease.grow };
  }
  function boxPoints(tg) {
    const ids = tg.multi ? tg.multi.ids : tg.part ? [`part:${tg.part.key}`] : [...tg.doc.parts.map((p) => `part:${p.key}`), ...(tg.doc.flats ?? []).map((f) => `flat:${f?.key}`)];
    const out = [];
    for (const id of ids) {
      const key = id.slice(id.indexOf(':') + 1), p = id.startsWith('part:') ? host.partOf(tg.sel.id, key) : null;
      const b = id.startsWith('flat:') ? host.flatBox?.(tg.sel.id, key) : null;
      if (p?.min && p.max) out.push(...cornersOf(p.min, p.max, p.scene));
      else if (b) out.push(...cornersOf(b.slice(0, 3), b.slice(3), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    }
    return out;
  }

  function apply(doc, r, sel) {
    if (sel.multi) { applyMulti(doc, sel.multi.ids, r, sel.multi); return; }
    if (sel.light != null) { const l = doc.lights?.[sel.light]; if (l && r.move) movePart(doc.place, l, r.move); return; }
    const part = sel.part == null ? null : doc.parts.find((p) => p.key === sel.part);
    if (r.move) { if (part) movePart(doc.place, part, r.move); else movePlace(doc.place, r.move); }
    if (r.turn && r.turn.deg) { if (part) rotatePart(doc.place, part, r.turn.axis, r.turn.deg); else rotatePlace(doc.place, r.turn.axis, r.turn.deg); }
    if (r.size) {
      if (part) scalePart(part, r.size);
      else scalePlace(doc.place, r.size.find((f) => f !== 1) ?? 1);
    }
  }

  const snapNow = () => (snapOn !== ctrlHeld ? snap : null);

  function pickAt(clientX, clientY, additive = false) {
    const ray = rayAt(clientX, clientY);
    if (!ray) return;
    const held = edit.selection();
    const heldDoc = held ? edit.docOf(held.id) : null;
    const skip = (id, key, kind) => { const d = edit.docOf(id); if (!d) return false; const m = marksOf(d).get(`${kind ?? 'part'}:${key}`); return !!m && (m.hidden || m.frozen); };
    let hit = host.pick(ray.o, ray.d, POI_PICK_REACH, skip);
    const o = heldDoc ? originOfDoc(heldDoc) : null;
    const person = heldDoc && o ? pickNpc(heldDoc, o, ray.o, ray.d, hit ? hit.dist : POI_PICK_REACH) : null;
    const item = person ? `npc:${person.key}` : hit ? `${hit.kind ?? 'part'}:${hit.key}` : null;
    if (person) hit = { id: held.id, key: person.key, dist: person.dist };
    if (!hit) {
      const under = host.pick(ray.o, ray.d, POI_PICK_REACH);
      if (!additive) edit.select(under && edit.has(under.id) ? { id: under.id, items: [] } : null);
      told();
      return;
    }
    if (!edit.has(hit.id)) { told(); api.wantsOpen?.(hit.id); return; }
    if (edit.shownAs?.(hit.id) !== undefined) { told(); return; }
    const sel = edit.selection();
    if (sel?.id !== hit.id) edit.select({ id: hit.id, items: [] });
    else if (!additive) edit.select(selectionOf(hit.id, [item]));
    else { const now = selItems(sel); edit.select(selectionOf(hit.id, now.includes(item) ? now.filter((i) => i !== item) : [...now, item])); }
    told();
  }
  function boxSelect(from, to, additive) {
    const best = boxPick({ edit, host, frame: view(), originOf: originOfDoc }, from, to);
    if (!best) return;
    const sel = edit.selection();
    if (additive && sel?.id === best.id) edit.select(selectionOf(best.id, [...selItems(sel), ...best.got]));
    else if (best.got.length || sel) edit.select(selectionOf(best.id, best.got));
    told();
  }

  function groundUnder(clientX, clientY) {
    const ray = rayAt(clientX, clientY);
    if (!ray) return null;
    return pointUnder(ray, groundHit, surfaceAt, placing?.kind === 'spot' ? snowRise() : 0);
  }

  function place(at) {
    const px = sceneToPixel(at);
    if (!px || !placing) return;
    if (placing.kind === 'spot') {
      const { id, done } = placing, doc = edit.docOf(id), o = doc ? originOfDoc(doc) : null;
      placing = null; placeAt = null;
      if (o) done(worldToPlace(doc.place, sub(at, o)));
      told();
      return;
    }
    const ground = surfaceAt(at[0], at[2]);
    const lift = Number.isFinite(ground) ? Math.max(0, at[1] - ground) : 0;
    const sel = placing.kind === 'poi' ? null : placeInto();
    const refused = !sel ? null : refusalOf(sel.id) ?? (placing.kind === 'flat' && !flatRoom(edit.docOf(sel.id)) ? 'full' : null);
    refusedLast = refused;
    if (refused) { api.placeRefused?.(refused, sel.id); return; }
    if (placing.kind === 'poi') {
      edit.create({ px: px.px, py: px.py, x: px.x, z: px.z, y: lift, name: placing.name });
    } else if (placing.kind === 'npc') {
      if (!sel && !Number.isFinite(ground)) return;
      const who = placing.npc;
      const fill = (doc) => {
        const o = originOfDoc(doc);
        if (!o) return;
        (doc.npcs ??= []).push(newNpc(doc, { ...who, t: worldToPlace(doc.place, sub(at, o)) }));
      };
      const held = (id) => ({ id, part: null });
      if (!sel) edit.create({ px: px.px, py: px.py, x: px.x, z: px.z, y: lift, name: who.name || placing.fallbackName || '' }, fill, held);
      else edit.edit(sel.id, 'add person', fill);
    } else if (placing.kind === 'flat') {
      if (!placeFlatAt({ edit, originOf: originOfDoc, at, spot: px, lift, ground, want: placing.flat, fallbackName: placing.fallbackName, sel })) return;
    } else {
      const asset = placing.asset;
      if (!sel && !Number.isFinite(ground)) return;
      const pieces = asset.parts ?? [asset];
      let key = null;
      const fill = (doc) => {
        const o = originOfDoc(doc);
        if (!o) return;
        const local = worldToPlace(doc.place, sub(at, o));
        for (const piece of pieces) {
          const off = piece.t ?? [0, 0, 0];
          const part = newPart(doc, {
            mesh: piece.mesh, submeshes: piece.submeshes ?? piece.materials?.length ?? 1, name: piece.name, materials: piece.materials ?? null,
            t: [local[0] + off[0], local[1] + off[1], local[2] + off[2]], r: piece.r, s: piece.s,
          });
          if (piece.collide) part.collide = piece.collide;
          if (typeof piece.shadow === 'boolean') part.shadow = piece.shadow;
          key ??= part.key;
          doc.parts.push(part);
        }
        if (asset.lights?.length) doc.lights ??= [];
        for (const l of asset.lights ?? []) doc.lights.push({ ...structuredClone(l), t: newLight([local[0] + l.t[0], local[1] + l.t[1], local[2] + l.t[2]]).t });
      };
      const held = (id) => ({ id, part: pieces.length > 1 ? null : key });
      if (!sel) edit.create({ px: px.px, py: px.py, x: px.x, z: px.z, y: lift, name: asset.name || placing.fallbackName || '' }, fill, held);
      else if (edit.edit(sel.id, pieces.length > 1 ? 'add parts' : 'add part', fill) && key) edit.select(held(sel.id));
    }
    placing = null; placeAt = null;
    told();
  }

  const api = {
    active: () => on,
    enter() { on = true; eye.keys.clear(); told(); },
    exit() {
      if (drag) { edit.cancel(); drag = null; }
      placing = null; placeAt = null; press = null; hover = null;
      eye.look = eye.pan = eye.orbit = false; eye.keys.clear(); ctrlHeld = false;
      on = false; told();
    },
    letGo() {
      const held = !!drag || eye.look || eye.pan || eye.orbit || eye.keys.size > 0 || !!press || ctrlHeld;
      if (drag) { edit.commit(); drag = null; }
      eye.look = eye.pan = eye.orbit = false; eye.keys.clear(); press = null; ctrlHeld = false;
      if (held) told();
      return held;
    },
    worldGone() {
      if (!on || !gone()) return false;
      onGone();
      return true;
    },
    /** @type {((id: string) => void) | null} */
    wantsOpen: null,
    /** @type {((why: 'away' | 'shown' | 'full', id: string) => void) | null} */
    placeRefused: null,

    mode: () => mode,
    setMode(/** @type {'select' | 'move' | 'turn' | 'size'} */ m) { mode = m; hover = null; told(); },
    space: () => space,
    setSpace(/** @type {'world' | 'local'} */ s) { space = s; told(); },
    snapOn: () => snapOn,
    setSnap(/** @type {boolean} */ v, /** @type {{ move?: number, turn?: number, size?: number }} */ steps = {}) {
      snapOn = !!v;
      for (const k of ['move', 'turn', 'size']) if (Number.isFinite(steps[k]) && steps[k] > 0) snap[k] = steps[k];
      told();
    },
    snapSteps: () => ({ ...snap }),
    eyeSpeed: () => eye.speed,
    setEyeSpeed(/** @type {number} */ v) { eye.speed = clamp(v, POI_EYE.min, POI_EYE.max); told(); },
    hovered: () => hover,
    dragging: () => !!drag,
    placing: () => placing,
    placeNew(/** @type {string} */ name) { placing = { kind: 'poi', name }; told(); },
    placeNpc(npc, fallbackName = '') { placing = { kind: 'npc', npc, fallbackName }; told(); },
    placeAsset(asset, fallbackName = '') { placing = { kind: 'part', asset, fallbackName }; told(); },
    placeFlat(flat, fallbackName = '') { placing = { kind: 'flat', flat, fallbackName }; told(); },
    placeInto,
    /** @returns {'away' | 'shown' | 'full' | null} */
    refusedLast: () => refusedLast,
    /** @type {(id: string) => ('away' | 'shown' | null)} */
    refusalOf,
    cancelPlacing() { placing = null; placeAt = null; told(); },
    standAt(/** @type {number} */ x, /** @type {number} */ y) { return api.standOn(api.spotAt(x, y)); },
    spotAt(/** @type {number} */ x, /** @type {number} */ y) {
      const at = on ? groundUnder(x, y) : null, px = at ? sceneToPixel(at) : null;
      return at && px ? { at, px: px.px, py: px.py, x: px.x, z: px.z, frame: translation(px.px, px.py, [0, 0, 0]) } : null;
    },
    /** @param {any} spot */
    standOn(spot) {
      if (!on || !placing || !spot) return false;
      const now = translation(spot.px, spot.py, [0, 0, 0]);
      place(spot.at.map((/** @type {number} */ v, /** @type {number} */ i) => v + now[i] - spot.frame[i]));
      return !placing;
    },
    pickSpot(/** @type {string} */ id, /** @type {(p: number[]) => void} */ done) { placing = { kind: 'spot', id, done }; told(); },
    /** @param {string} id */
    spotUnderEye(id) {
      const v = view(), doc = edit.docOf(id), o = doc ? originOfDoc(doc) : null;
      if (!v || !o) return null;
      const g = surfaceAt(v.eye[0], v.eye[2]);
      return worldToPlace(doc.place, sub([v.eye[0], Number.isFinite(g) ? g : o[1], v.eye[2]], o));
    },
    /** @param {any} fn */
    setOverlay(fn) { overlay = fn ?? null; },

    /**
     * @param {number} dt
     * @param {{ pos: number[], yaw: number, pitch: number }} cam
     */
    cameraFrame(dt, cam) {
      if (!on || !eye.look) return;
      const k = eye.keys;
      const f = lookDir(cam.yaw, cam.pitch), r = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
      let mv = [0, 0, 0];
      if (k.has('MoveForwards')) mv = add(mv, f);
      if (k.has('MoveBackwards')) mv = sub(mv, f);
      if (k.has('MoveRight')) mv = add(mv, r);
      if (k.has('MoveLeft')) mv = sub(mv, r);
      if (k.has('Jump') || k.has('FloatUp')) mv = add(mv, [0, 1, 0]);
      if (k.has('Crouch') || k.has('FloatDown')) mv = sub(mv, [0, 1, 0]);
      const l = Math.hypot(mv[0], mv[1], mv[2]);
      if (!(l > 0)) return;
      const sp = eye.speed * (k.has('Run') ? POI_EYE.fast : 1);
      const step = mul(mv, (sp * dt) / l);
      for (let a = 0; a < 3; a++) cam.pos[a] += step[a];
    },
    /** @param {{ pos: number[], yaw: number, pitch: number }} cam */
    lookBy(dx, dy, cam) {
      if (eye.look) {
        cam.yaw += dx * POI_EYE.look;
        cam.pitch = clamp(cam.pitch - dy * POI_EYE.look, -POI_EYE.pitch, POI_EYE.pitch);
      } else if (eye.pan) {
        const r = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)], f = lookDir(cam.yaw, cam.pitch);
        const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
        const k = eye.speed * 0.004;
        for (let a = 0; a < 3; a++) cam.pos[a] += -r[a] * dx * k + u[a] * dy * k;
      } else if (eye.orbit) {
        const tg = target();
        const pivot = tg ? tg.c : null;
        if (!pivot) return;
        const off = sub(cam.pos, pivot), dist = Math.hypot(off[0], off[1], off[2]);
        cam.yaw += dx * POI_EYE.look;
        cam.pitch = clamp(cam.pitch - dy * POI_EYE.look, -POI_EYE.pitch, POI_EYE.pitch);
        const f = lookDir(cam.yaw, cam.pitch);
        const p = sub(pivot, mul(f, dist));
        cam.pos[0] = p[0]; cam.pos[1] = p[1]; cam.pos[2] = p[2];
      }
    },
    frameSelection(cam) {
      const tg = target();
      if (!tg) return false;
      let r = 4;
      const sel = edit.selection();
      if (sel.part != null && !tg.multi) { const p = host.partOf(sel.id, sel.part); if (p?.box) r = Math.hypot(p.box[3] - p.box[0], p.box[4] - p.box[1], p.box[5] - p.box[2]) / 2; }
      else {
        const ids = tg.multi ? tg.multi.ids.filter((i) => i.startsWith('part:') || i.startsWith('flat:')) : tg.doc.parts.map((p) => `part:${p.key}`);
        let any = false; const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
        for (const id of ids) { const { kind, key } = parseId(id); const box = kind === 'flat' ? host.flatBox?.(sel.id, key) : host.partOf(sel.id, key)?.box; if (box) { any = true; for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], box[i]); b[i + 3] = Math.max(b[i + 3], box[i + 3]); } } }
        if (any) r = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2;
      }
      const f = lookDir(cam.yaw, cam.pitch), d = Math.max(2, r * 3);
      const p = sub(tg.c, mul(f, d));
      cam.pos[0] = p[0]; cam.pos[1] = p[1]; cam.pos[2] = p[2];
      return true;
    },

    pointerDown(/** @type {{ clientX: number, clientY: number, button: number, altKey?: boolean, shiftKey?: boolean }} */ e) {
      if (!on) return false;
      eye.lastX = e.clientX; eye.lastY = e.clientY;
      if (e.button === 2) { eye.look = true; return true; }
      if (e.button === 1) { eye.pan = true; return true; }
      if (e.button !== 0) return false;
      if (e.altKey) { eye.orbit = true; return true; }
      if (placing) { const at = groundUnder(e.clientX, e.clientY); if (at) place(at); return true; }
      const g = gizmo(), ray = g ? rayAt(e.clientX, e.clientY) : null, h = g && ray ? pickGizmo(g, ray.o, ray.d) : null;
      if (h !== hover) { hover = h; told(); }
      if (g && ray && h) {
        const state = beginHandleDrag(g, h, ray.o, ray.d);
        const sel = edit.selection();
        if (state && edit.begin(sel.id, mode === 'move' ? 'move' : mode === 'turn' ? 'turn' : 'size')) {
          const { px, py } = g.tg.doc.place;
          drag = { handle: h, state, id: sel.id, part: sel.part ?? null, light: sel.light ?? null, start: null, px, py, frame: translation(px, py, [0, 0, 0]), now: [0, 0, 0], multi: g.tg.multi ? { ...g.tg.multi, axes: g.axes } : null, last: null };
          told();
          return true;
        }
      }
      press = { x: e.clientX, y: e.clientY, moved: false, button: 0, shift: !!e.shiftKey };
      return true;
    },
    /**
     * @param {{ clientX: number, clientY: number, ctrlKey?: boolean }} e
     * @param {any} cam
     */
    pointerMove(e, cam) {
      if (!on) return false;
      const dx = e.clientX - eye.lastX, dy = e.clientY - eye.lastY;
      eye.lastX = e.clientX; eye.lastY = e.clientY;
      ctrlHeld = !!e.ctrlKey;
      if (eye.look || eye.pan || eye.orbit) { api.lookBy(dx, dy, cam); return true; }
      if (drag) {
        const ray = rayAt(e.clientX, e.clientY);
        if (ray) { translation(drag.px, drag.py, drag.now); for (let a = 0; a < 3; a++) ray.o[a] -= drag.now[a] - drag.frame[a]; }
        const r = ray ? handleDragResult(drag.state, ray.o, ray.d, snapNow()) : null;
        if (r) { drag.last = r; const sel = { id: drag.id, part: drag.part, light: drag.light, multi: drag.multi }; edit.preview((doc) => apply(doc, r, sel)); }
        return true;
      }
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > POI_CLICK_SLOP) press.moved = true;
      if (press?.moved) { press.at = [e.clientX, e.clientY]; told(); return true; }
      if (placing) { placeAt = groundUnder(e.clientX, e.clientY); return true; }
      const g = gizmo();
      const ray = g ? rayAt(e.clientX, e.clientY) : null;
      const h = g && ray ? pickGizmo(g, ray.o, ray.d) : null;
      if (h !== hover) { hover = h; told(); }
      return true;
    },
    pointerUp(/** @type {{ clientX: number, clientY: number, button: number, shiftKey?: boolean }} */ e) {
      if (!on) return false;
      if (e.button === 2) { eye.look = false; eye.keys.clear(); return true; }
      if (e.button === 1) { eye.pan = false; return true; }
      if (eye.orbit) { eye.orbit = false; return true; }
      if (drag) { edit.commit(); drag = null; told(); return true; }
      if (press && !press.moved) pickAt(e.clientX, e.clientY, !!e.shiftKey);
      else if (press?.moved && !placing) boxSelect([press.x, press.y], [e.clientX, e.clientY], !!press.shift || !!e.shiftKey);
      press = null;
      return true;
    },
    wheel(/** @type {{ deltaY: number }} */ e, cam) {
      if (!on) return false;
      if (eye.look) { api.setEyeSpeed(eye.speed * (e.deltaY < 0 ? POI_EYE.wheel : 1 / POI_EYE.wheel)); return true; }
      const f = lookDir(cam.yaw, cam.pitch), step = (e.deltaY < 0 ? 1 : -1) * Math.max(0.5, eye.speed * 0.25);
      for (let a = 0; a < 3; a++) cam.pos[a] += f[a] * step;
      return true;
    },
    /**
     * @param {{ code: string, key?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean, repeat?: boolean }} e
     * @param {any} cam
     * @param {{ save?: () => void, del?: () => void, duplicate?: () => void, copy?: () => void, cut?: () => void, paste?: () => void, group?: () => void, ungroup?: () => void }} [acts]
     */
    keyDown(e, cam, acts = {}) {
      if (!on) return false;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') ctrlHeld = true;
      if (eye.look) { const a = actionOf(e); if (a && POI_EYE_ACTIONS.includes(a)) { eye.keys.add(a); return true; } return false; }
      if (mod && (e.code === 'KeyZ' || e.code === 'KeyY') && drag) { edit.cancel(); drag = null; told(); return true; }
      if (mod && e.code === 'KeyZ') { if (e.shiftKey) edit.redo(); else edit.undo(); told(); return true; }
      if (mod && e.code === 'KeyY') { edit.redo(); told(); return true; }
      if (mod && e.code === 'KeyS') { acts.save?.(); return true; }
      if (mod && e.code === 'KeyD') { acts.duplicate?.(); return true; }
      if (mod && e.code === 'KeyC') { acts.copy?.(); return true; }
      if (mod && e.code === 'KeyX') { acts.cut?.(); return true; }
      if (mod && e.code === 'KeyV') { acts.paste?.(); return true; }
      if (mod && e.code === 'KeyG') { if (e.shiftKey) acts.ungroup?.(); else acts.group?.(); return !!(acts.group || acts.ungroup); }
      if (mod || e.altKey) return false;
      switch (e.code) {
        case 'KeyQ': api.setMode('select'); return true;
        case 'KeyW': api.setMode('move'); return true;
        case 'KeyE': api.setMode('turn'); return true;
        case 'KeyR': api.setMode('size'); return true;
        case 'KeyX': api.setSpace(space === 'world' ? 'local' : 'world'); return true;
        case 'KeyF': api.frameSelection(cam); return true;
        case 'Delete': case 'Backspace': acts.del?.(); return true;
        case 'Escape':
          if (drag) { edit.cancel(); drag = null; }
          else if (placing) { placing = null; placeAt = null; }
          else edit.select(null);
          told();
          return true;
        default: return false;
      }
    },
    keyUp(/** @type {{ code: string }} */ e) {
      if (!on) return false;
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') ctrlHeld = false;
      const a = actionOf(e);
      return !!a && eye.keys.delete(a);
    },

    frame() {
      if (api.worldGone()) return;
      const g = on ? edit.generation() : -1 - edit.generation();
      if (g !== overlayGen) { overlayGen = g; feed.setOverlay(on ? editorView(edit.overlay()) : edit.overlay()); }
    },
    collideDrafts: () => !drag,

    lineSets() {
      if (!on) return { inWorld: [], onTop: [], dm: null };
      const sel = edit.selection();
      const items = selItems(sel);
      const doc = sel ? edit.docOf(sel.id) : null;
      const { picked, marks, inWorld: boxIn, onTop: boxTop } = boxesOf(sel, doc, items);
      let dm = null;
      const inWorld = boxIn.slice(), onTop = boxTop.slice();
      const origin = doc ? originOfDoc(doc) : null;
      if (doc && origin) {
        (doc.lights ?? []).forEach((l, i) => {
          if (!Array.isArray(l?.t) || marks.get(`light:${i}`)?.hidden) return;
          const c = spotOf(doc, origin, l.t), k = 0.35;
          const color = picked.has(`light:${i}`) ? POI_HANDLE_COLOR.hover : [l.color[0], l.color[1], l.color[2], 0.9];
          for (const a of AXES_WORLD) onTop.push({ a: sub(c, mul(a, k)), b: add(c, mul(a, k)), color });
        });
        for (const n of doc.npcs ?? []) {
          const id = `npc:${n?.key}`;
          if (!Array.isArray(n?.t) || marks.get(id)?.hidden) continue;
          const { feet, head } = npcLine(doc, origin, n), k = 0.3;
          const color = picked.has(id) ? POI_HANDLE_COLOR.hover : marks.get(id)?.frozen ? POI_BOX_COLOR.locked : POI_BOX_COLOR.person;
          onTop.push({ a: feet, b: head, color }, { a: sub(feet, [k, 0, 0]), b: add(feet, [k, 0, 0]), color }, { a: sub(feet, [0, 0, k]), b: add(feet, [0, 0, k]), color });
        }
      }
      if (overlay) {
        const placeOf = (/** @type {string} */ id) => { const doc = edit.docOf(id), o = doc ? originOfDoc(doc) : null; return o ? (/** @type {number[]} */ p) => add(o, mul(quatRotate(doc.place.r, p), doc.place.s)) : null; };
        dm = overlay(placeOf, surfaceAt, groundEpoch()) ?? null;
      }
      if (press?.moved && press.at) onTop.push(...rectLines({ x0: press.x, y0: press.y, x1: press.at[0], y1: press.at[1] }, rayAt, POI_HANDLE_COLOR.view));
      if (placing && placeAt) {
        const k = 0.6, c = POI_BOX_COLOR.ghost, at = placing.kind === 'spot' ? add(placeAt, [0, snowRise(), 0]) : placeAt;
        onTop.push({ a: add(at, [-k, 0, 0]), b: add(at, [k, 0, 0]), color: c }, { a: add(at, [0, 0, -k]), b: add(at, [0, 0, k]), color: c }, { a: at, b: add(at, [0, 2, 0]), color: c });
      }
      const g = gizmo();
      const sweep = g && drag?.state?.mode === 'turn' && !drag.state.along && drag.last?.turn ? { handle: drag.handle, from: sub(drag.state.hit0, drag.state.c), axis: drag.state.axis, deg: drag.last.turn.deg } : null;
      const guide = g && drag?.state?.mode === 'move' && drag.state.axis ? { axis: drag.state.axis, from: sub(g.c, drag.last?.move ?? [0, 0, 0]), step: snapNow()?.move ?? 0 } : null;
      const hot = drag ? drag.handle : hover;
      ease.step(mode, g ? hot : null, (globalThis.performance?.now?.() ?? 0) / 1000);
      const gizmoSet = g ? gizmoDraw(g, { hot, dragging: !!drag, colors: POI_HANDLE_COLOR, sweep, snapDeg: snapNow()?.turn ?? 0, guide }) : null;
      return { inWorld, onTop, dm, gizmo: gizmoSet };
    },
    drawLines(proj, viewM) {
      if (!on || !pass) return false;
      const { inWorld, onTop, dm, gizmo: gz } = api.lineSets();
      const vp = viewport(), vw = vp ? vp[2] : 0, vh = vp ? vp[3] : 0;
      const v = view(), scale = v && vh ? vh / (v.h * (v.rect?.h ?? 1)) : 0, px = 3;
      const lift = snowRise(), a = pass.draw(proj, viewM, inWorld, { onTop: false, vw, vh, scale, px, toEye: 0.4 });
      const e = dm ? pass.draw(proj, viewM, dm.inWorld, { onTop: false, vw, vh, scale, px, toEye: 0.4, lift }) : false;
      const f = dm ? pass.draw(proj, viewM, dm.onTop, { onTop: true, vw, vh, scale, px, lift }) : false, b = pass.draw(proj, viewM, onTop, { onTop: true, vw, vh, scale, px });
      const c = gz ? pass.draw(proj, viewM, gz.lines, { onTop: false, hidden: true, vw, vh, scale, alpha: GIZMO_DIM, tris: gz.tris, toEye: gz.L }) : false;
      const d = gz ? pass.draw(proj, viewM, gz.lines, { onTop: false, vw, vh, scale, tris: gz.tris, toEye: gz.L }) : false;
      return a || b || c || d || e || f;
    },
    pivot: () => target()?.c ?? null,
    liftToGround: (/** @type {string} */ id, /** @type {string} */ rowId) => liftOf({ edit, host, originOf: originOfDoc, surfaceAt }, id, rowId),
    boxing: () => (press?.moved && press.at ? { x0: press.x, y0: press.y, x1: press.at[0], y1: press.at[1] } : null),
  };
  return api;
}

export const POI_EDITOR_EVENTS = Object.freeze(['pointerdown', 'pointermove', 'pointerup', 'wheel', 'contextmenu', 'keydown', 'keyup', 'lostpointercapture', 'blur']);

/** @param {{ editor: any, canvas: any, cam: any, acts: () => any, owns: (t: any) => boolean, overlayUp: () => boolean,
 *   textEntry: (t: any) => boolean, win?: any }} deps */
export function createPoiEditorRouter({ editor, canvas, cam, acts, owns, overlayUp, textEntry, win = globalThis }) {
  const pickerOpen = (/** @type {any} */ t) => { try { return (t?.tagName === 'SELECT' || t?.type === 'color') && t.matches(':open'); } catch { return false; } };
  function onEvent(e) {
    if (!editor.active() || editor.worldGone()) return;
    if (e.type === 'lostpointercapture' || e.type === 'blur') { if (e.type === 'lostpointercapture' || e.target === win) editor.letGo(); return; }
    if (overlayUp() || owns(e.target)) { if (e.type === 'pointerup') editor.letGo(); return; }
    let took = false;
    switch (e.type) {
      case 'pointerdown': if (e.target !== canvas) return; took = editor.pointerDown(e); if (took) capturePointer(canvas, e.pointerId); break;
      case 'pointermove': took = editor.pointerMove(e, cam); break;
      case 'pointerup': took = editor.pointerUp(e); break;
      case 'wheel': if (e.target !== canvas) return; took = editor.wheel(e, cam); break;
      case 'contextmenu': if (e.target === canvas) { e.preventDefault?.(); took = true; } break;
      case 'keydown': if (textEntry(e.target)) return; took = editor.keyDown(e, cam, acts()); break;
      case 'keyup': if (textEntry(e.target)) return; took = editor.keyUp(e); break;
      default: break;
    }
    if (!took && e.type !== 'keydown' && e.type !== 'keyup') return;
    e.stopImmediatePropagation?.();
    if (took && e.type !== 'pointermove') e.preventDefault?.();
  }
  function onPanelKey(e) {
    if (!editor.active() || overlayUp()) return;
    e.stopPropagation?.();
    if (textEntry(e.target)) return;
    if (e.code === 'Escape' && pickerOpen(e.target)) return;
    if (e.type === 'keydown' ? editor.keyDown(e, cam, acts()) : editor.keyUp(e)) e.preventDefault?.();
  }
  return { onEvent, onPanelKey };
}
