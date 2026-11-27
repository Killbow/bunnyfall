// @ts-check

import { POI_DOC_VERSION, POI_PIXEL_M, POI_MAP, POI_PART_KEY_RE, POI_LIMITS, DEFAULT_MATERIAL, mintPoiId, poiDocBytesOf } from './poiLaw.js';
import { POI_V2_DOC_KEYS } from './poiLawV2.js';
import { quatMultiply, quatAngleAxis, quatRotate } from '../world/quat.js';
import { find as findNode, parseId } from './poiScene.js';

export const POI_UNDO_DEPTH = 200;
const POS_STEP = 1e-4;
const tidy = (v, step = POS_STEP) => { const r = Math.round(v / step) * step; return Math.abs(r) < step / 2 ? 0 : Number(r.toFixed(6)); };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function tidyQuat(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  let out = q.map((c) => c / n);
  if (out[3] < 0) out = out.map((c) => -c);
  return out.map((c) => { const r = Math.round(c * 1e6) / 1e6; return r === 0 ? 0 : r; });
}
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
const DEG = 180 / Math.PI;
const POLE_COS = 1e-5;

/** @param {number[]} q */
export function eulerOfQuat(q) {
  const [x, y, z, w] = q;
  const n = x * x + y * y + z * z + w * w || 1;
  const sx = 2 * (w * x - y * z), m02 = 2 * (x * z + w * y), m22 = w * w - x * x - y * y + z * z, cx = Math.hypot(m02, m22);
  let ex, ey, ez;
  if (cx / n < POLE_COS) {
    const s = Math.sign(sx) || 1;
    ex = s * 90;
    ey = Math.atan2(s * 2 * (x * y - w * z), w * w + x * x - y * y - z * z) * DEG;
    ez = 0;
  } else {
    ex = Math.atan2(sx, cx) * DEG;
    ey = Math.atan2(m02, m22) * DEG;
    ez = Math.atan2(2 * (w * z + x * y), w * w - x * x + y * y - z * z) * DEG;
  }
  const wrap = (a) => { const r = ((a % 360) + 360) % 360; const t = Math.round(r * 1e4) / 1e4; return t >= 360 ? 0 : t; };
  return [wrap(ex), wrap(ey), wrap(ez)];
}
/** @param {number[]} e */
export function quatOfEuler(e) {
  const qx = quatAngleAxis(e[0], [1, 0, 0]), qy = quatAngleAxis(e[1], [0, 1, 0]), qz = quatAngleAxis(e[2], [0, 0, 1]);
  return tidyQuat(quatMultiply(qy, quatMultiply(qx, qz)));
}

export const mapMetresOf = (place) => [place.px * POI_PIXEL_M + place.x, -place.py * POI_PIXEL_M + place.z];

export function placeAtMapMetres(place, X, Z) {
  const S = POI_PIXEL_M;
  const maxX = POI_MAP.w * S - POS_STEP, minZ = -(POI_MAP.h - 1) * S;
  const cx = clamp(X, 0, maxX), cz = clamp(Z, minZ, S - POS_STEP);
  let px = Math.floor(cx / S), py = -Math.floor(cz / S);
  let x = tidy(cx - px * S), z = tidy(cz + py * S);
  if (x >= S) { px += 1; x = 0; }
  if (z >= S) { py -= 1; z = 0; }
  place.px = clamp(px, 0, POI_MAP.w - 1); place.py = clamp(py, 0, POI_MAP.h - 1);
  place.x = x; place.z = z;
  return place;
}

/**
 * @param {any} place
 * @param {number[]} d
 */
export function movePlace(place, d) {
  const [X, Z] = mapMetresOf(place);
  placeAtMapMetres(place, X + d[0], Z + d[2]);
  place.y = tidy(clamp(place.y + d[1], -4000, 4000));
  return place;
}
/**
 * @param {any} place
 * @param {number[]} axis
 * @param {number} deg
 */
export function rotatePlace(place, axis, deg) {
  place.r = tidyQuat(quatMultiply(quatAngleAxis(deg, axis), place.r));
  return place;
}
export function scalePlace(place, f) {
  place.s = Number(clamp(place.s * f, 0.01, 100).toFixed(6));
  return place;
}

export const worldToPlace = (place, d) => quatRotate(conj(place.r), d).map((c) => c / place.s);
export const partWorldQuat = (place, part) => quatMultiply(place.r, part.r);
export const partWorldOffset = (place, part) => quatRotate(place.r, part.t).map((c) => c * place.s);

export function movePart(place, part, d) {
  const l = worldToPlace(place, d);
  part.t = part.t.map((c, i) => tidy(clamp(c + l[i], -2000, 2000)));
  return part;
}
export function rotatePart(place, part, axis, deg) {
  const local = quatRotate(conj(place.r), axis);
  part.r = tidyQuat(quatMultiply(quatAngleAxis(deg, local), part.r));
  return part;
}
export function scalePart(part, f) {
  part.s = part.s.map((c, i) => {
    const v = c * f[i], sign = Math.sign(v) || 1;
    return Number((sign * clamp(Math.abs(v), 0.001, 1000)).toFixed(6));
  });
  return part;
}

/**
 * @param {any} doc
 * @param {string} wanted
 */
export function uniqueKey(doc, wanted) {
  const taken = new Set((doc.parts ?? []).map((p) => p.key));
  let base = String(wanted ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+$/, '').slice(0, 28);
  if (!base) base = 'part';
  if (!taken.has(base) && POI_PART_KEY_RE.test(base)) return base;
  for (let n = 2; ; n++) { const k = `${base}-${n}`; if (!taken.has(k)) return k; }
}
/**
 * @param {any} doc
 * @param {{ name?: string, t?: number[], h?: number, look: any, lines?: string[] }} o
 */
export function newNpc(doc, { name = '', t = [0, 0, 0], h = 1.8, look, lines = [] }) {
  const taken = new Set((doc.npcs ?? []).map((n) => n.key));
  let n = 1;
  while (taken.has(`npc-${n}`)) n++;
  return { key: `npc-${n}`, name: lawName(name) || 'Stranger', t: t.map((c) => tidy(c)), yaw: 0, h, look: structuredClone(look), lines: lines.map((l) => String(l)) };
}
const NAME_UNSAID_G = /[\p{Cc}\p{Cs}\u{2028}\u{2029}\u{202a}-\u{202e}\u{2066}-\u{2069}]/gu;
export const lawName = (s, max = /** @type {number} */ (POI_LIMITS.name)) => String(s ?? '').replace(NAME_UNSAID_G, ' ').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[\uD800-\uDBFF]$/, '').trim();

export const newMaterial = (over = {}) => ({ ...structuredClone(DEFAULT_MATERIAL), ...structuredClone(over) });

/**
 * @param {any} doc
 * @param {{ mesh: string, submeshes: number, name?: string, materials?: any[], t?: number[], r?: number[], s?: number[] }} o
 */
export function newPart(doc, { mesh, submeshes, name = '', materials = null, t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1] }) {
  const n = Math.max(1, submeshes | 0);
  const mats = Array.from({ length: n }, (_, i) => newMaterial(materials?.[i] ?? {}));
  const nm = lawName(name);
  return { key: uniqueKey(doc, nm || 'part'), ...(nm ? { name: nm } : {}), mesh, t: t.map((c) => tidy(c)), r: tidyQuat(r), s: [...s], collide: 'mesh', shadow: true, materials: mats };
}
export const newLight = (t = [0, 2, 0]) => ({ t: t.map((c) => tidy(c)), color: [1, 0.85, 0.6], radius: 5, intensity: 1, flicker: false });

/** @param {{ id: string, px: number, py: number, x: number, z: number, y?: number, name: string }} o */
export function newPoiDoc({ id, px, py, x, z, y = 0, name }) {
  const place = { px, py, x: 0, z: 0, y: tidy(y), ground: 'snap', r: [0, 0, 0, 1], s: 1 };
  placeAtMapMetres(place, px * POI_PIXEL_M + x, -py * POI_PIXEL_M + z);
  return { v: POI_DOC_VERSION, id, name: lawName(name), place, parts: [], lights: [], marker: { show: false } };
}

/**
 * @param {any} doc
 * @param {any} wasV
 * @param {string | null} [saved]
 */
export function upgradeChanged(doc, wasV, saved = null) {
  if (wasV === 1 && doc && doc.v === 1 && JSON.stringify(doc) !== saved) doc.v = POI_DOC_VERSION;
  return doc;
}
/** @param {any} doc */
export function poiDocSizeOf(doc) {
  const bytes = new TextEncoder().encode(JSON.stringify(doc)).byteLength;
  return { bytes, max: poiDocBytesOf(doc?.v === 2 ? 2 : 1) };
}
const NPC_LINKS = ['route', 'dialogue', 'trade', 'radius', 'showWhen'];
/** @param {any} doc */
export function poiHeldOf(doc) {
  /** @type {Record<string, number>} */
  const kinds = {};
  for (const k of POI_V2_DOC_KEYS) if (!['interior', 'groups', 'flats'].includes(k) && Array.isArray(doc?.[k]) && doc[k].length) kinds[k] = doc[k].length;
  return {
    kinds, interior: !!doc?.interior, flats: Array.isArray(doc?.flats) ? doc.flats.length : 0,
    linked: (doc?.npcs ?? []).filter((n) => n && NPC_LINKS.some((k) => n[k] !== undefined)).length,
  };
}

const text = (d) => (d == null ? null : JSON.stringify(d));
const sameSel = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * @param {string} id
 * @param {string[]} items
 */
export function selectionOf(id, items = []) {
  const list = [...new Set(items.map(String))];
  const last = list.length ? parseId(list[list.length - 1]) : null;
  return { id, items: list, part: last?.kind === 'part' ? last.key : null, light: last?.kind === 'light' ? Number(last.key) : null };
}
/** @param {any} s */
export function selItems(s) {
  if (!s) return [];
  if (Array.isArray(s.items)) return s.items;
  if (s.part != null) return [`part:${s.part}`];
  if (s.light != null) return [`light:${s.light}`];
  return [];
}

/**
 * @typedef {{ id: string, items?: string[], part?: string | null, light?: number | null } | null} PoiSelection
 * @typedef {{ doc: any, saved: string | null, base: number | null, rev: number | null, state: string }} PoiEntry
 */

/** @param {{ rand?: (b: Uint8Array) => Uint8Array, depth?: number }} [opts] */
export function createPoiEdit({ rand = (b) => { globalThis.crypto.getRandomValues(/** @type {any} */ (b)); return b; }, depth = POI_UNDO_DEPTH } = {}) {
  /** @type {Map<string, PoiEntry>} */
  const docs = new Map();
  /** @type {Array<{ id: string, label: string, before: string | null, after: string | null, selBefore: PoiSelection, selAfter: PoiSelection, entryBefore?: any, entryAfter?: any }>} */
  let undo = [], redo = [];
  /** @type {PoiSelection} */
  let sel = null;
  /** @type {{ id: string, label: string, start: string, selBefore: PoiSelection } | null} */
  let drag = null;
  let gen = 0;
  /** @type {Map<string, any>} */
  const shown = new Map();
  const listeners = new Set();
  const changed = () => { gen++; for (const fn of listeners) { try { fn(); } catch (e) { console.warn('[poi] an editor listener threw', e); } } };

  const setDoc = (id, json, entry = null) => {
    if (json === null) { docs.delete(id); if (sel?.id === id) sel = null; return; }
    const e = docs.get(id);
    if (e) e.doc = JSON.parse(json);
    else docs.set(id, { doc: JSON.parse(json), saved: null, base: null, rev: null, state: 'new', ...(entry ?? {}) });
  };
  const entryFields = (id) => { const e = docs.get(id); return e ? { saved: e.saved, base: e.base, rev: e.rev, state: e.state } : undefined; };
  const push = (step) => {
    undo.push(step);
    if (undo.length > depth) undo.splice(0, undo.length - depth);
    redo = [];
  };
  const validSel = (s) => {
    if (!s) return null;
    const e = docs.get(s.id);
    if (!e) return null;
    return selectionOf(s.id, selItems(s).filter((i) => !!findNode(e.doc, i)));
  };

  const api = {
    open(/** @type {string} */ id, /** @type {{ doc: any, saved?: any, base?: number | null, rev?: number | null, state?: string }} */ { doc, saved = doc, base = null, rev = null, state = 'live' }) {
      if (drag) api.commit();
      docs.set(id, { doc: structuredClone(doc), saved: text(saved), base, rev, state });
      changed();
    },
    close(/** @type {string} */ id) {
      if (drag?.id === id) drag = null;
      docs.delete(id);
      undo = undo.filter((s) => s.id !== id); redo = redo.filter((s) => s.id !== id);
      if (sel?.id === id) sel = null;
      changed();
    },
    has: (/** @type {string} */ id) => docs.has(id),
    ids: () => [...docs.keys()],
    docOf: (/** @type {string} */ id) => docs.get(id)?.doc ?? null,
    entryOf: (/** @type {string} */ id) => docs.get(id) ?? null,
    dirty(/** @type {string} */ id) { const e = docs.get(id); return !!e && text(e.doc) !== e.saved; },
    markSaved(/** @type {string} */ id, /** @type {{ rev?: number | null, state?: string, base?: number | null, doc?: any, unheld?: boolean }} */ { rev = null, state = 'draft', base, doc, unheld = false } = {}) {
      const e = docs.get(id);
      if (!e) return;
      e.saved = unheld ? null : text(doc ?? e.doc); e.rev = rev; e.state = state;
      if (base !== undefined) e.base = base;
      changed();
    },
    generation: () => gen,
    onChange(/** @type {() => void} */ fn) { listeners.add(fn); return () => listeners.delete(fn); },

    selection: () => sel,
    select(/** @type {PoiSelection} */ s) { const v = validSel(s); if (!sameSel(v, sel)) { sel = v; changed(); } },

    create(/** @type {{ px: number, py: number, x: number, z: number, y?: number, name: string }} */ at, /** @type {((doc: any) => void) | null} */ fill = null, /** @type {PoiSelection | ((id: string) => PoiSelection) | undefined} */ select = undefined) {
      if (drag) api.commit();
      const id = mintPoiId(rand);
      const doc = newPoiDoc({ id, ...at });
      fill?.(doc);
      const selBefore = sel;
      setDoc(id, text(doc));
      sel = validSel((typeof select === 'function' ? select(id) : select) ?? { id, items: [] });
      push({ id, label: 'create', before: null, after: text(doc), selBefore, selAfter: sel, entryAfter: { saved: null, base: null, rev: null, state: 'new' } });
      changed();
      return id;
    },

    remove(/** @type {string} */ id, /** @type {string} */ label = 'remove') {
      if (drag) api.commit();
      const e = docs.get(id);
      if (!e) return false;
      const { saved, base, rev, state } = e;
      const selBefore = sel;
      const before = text(e.doc);
      setDoc(id, null);
      push({ id, label, before, after: null, selBefore, selAfter: sel, entryBefore: { saved, base, rev, state } });
      changed();
      return true;
    },

    /**
     * @param {string} id
     * @param {string} label
     * @param {(doc: any) => void} fn
     * @param {PoiSelection | ((doc: any) => PoiSelection)} [select]
     */
    edit(id, label, fn, select = undefined) {
      if (drag) api.commit();
      const e = docs.get(id);
      if (!e || shown.has(id)) return false;
      const before = text(e.doc);
      const doc = JSON.parse(before);
      const wasV = doc.v;
      fn(doc);
      if (typeof select === 'function') select = select(doc);
      let after = text(doc);
      if (after === before) { if (select !== undefined) api.select(select); return false; }
      const v = doc.v;
      if (upgradeChanged(doc, wasV, e.saved).v !== v) after = text(doc);
      const selBefore = sel;
      e.doc = doc;
      sel = validSel(select === undefined ? sel : select);
      push({ id, label, before, after, selBefore, selAfter: sel });
      changed();
      return true;
    },

    begin(/** @type {string} */ id, /** @type {string} */ label) {
      if (drag) api.commit();
      const e = docs.get(id);
      if (!e || shown.has(id)) return false;
      drag = { id, label, start: text(e.doc), selBefore: sel };
      return true;
    },
    preview(/** @type {(doc: any) => void} */ fn) {
      if (!drag) return false;
      const e = docs.get(drag.id);
      if (!e) { drag = null; return false; }
      const doc = JSON.parse(drag.start);
      const wasV = doc.v;
      fn(doc);
      e.doc = wasV === 1 && text(doc) !== drag.start ? upgradeChanged(doc, wasV, e.saved) : doc;
      changed();
      return true;
    },
    commit() {
      if (!drag) return false;
      const d = drag; drag = null;
      const e = docs.get(d.id);
      if (!e) return false;
      const after = text(e.doc);
      if (after === d.start) return false;
      push({ id: d.id, label: d.label, before: d.start, after, selBefore: d.selBefore, selAfter: sel });
      changed();
      return true;
    },
    cancel() {
      if (!drag) return false;
      const d = drag; drag = null;
      setDoc(d.id, d.start);
      changed();
      return true;
    },
    dragging: () => !!drag,

    canUndo: () => undo.length > 0 && !drag,
    canRedo: () => redo.length > 0 && !drag,
    undoLabel: () => undo.at(-1)?.label ?? null,
    redoLabel: () => redo.at(-1)?.label ?? null,
    undo() {
      if (drag) { const label = drag.label; api.cancel(); return label; }
      const s = undo.pop();
      if (!s) return null;
      if (s.before === null) s.entryAfter = entryFields(s.id);
      setDoc(s.id, s.before, s.entryBefore);
      sel = validSel(s.selBefore);
      redo.push(s);
      changed();
      return s.label;
    },
    redo() {
      if (drag) { api.cancel(); return null; }
      const s = redo.pop();
      if (!s) return null;
      if (s.after === null) s.entryBefore = entryFields(s.id);
      setDoc(s.id, s.after, s.entryAfter);
      sel = validSel(s.selAfter);
      undo.push(s);
      changed();
      return s.label;
    },

    overlay() {
      const out = new Map();
      for (const [id, e] of docs) out.set(id, { doc: e.doc, rev: e.rev ?? 0 });
      for (const [id, d] of shown) out.set(id, d === null ? null : { doc: d, rev: 0 });
      return out;
    },
    showAs(/** @type {string} */ id, /** @type {any} */ d) {
      if (d === undefined) shown.delete(id); else shown.set(id, d === null ? null : structuredClone(d));
      changed();
    },
    shownAs: (/** @type {string} */ id) => shown.get(id),
  };
  return api;
}
