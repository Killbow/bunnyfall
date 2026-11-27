// @ts-check

import { KINDS, find, freshKey } from './poiScene.js';
import { POI_V2_LIMITS } from './poiLawV2.js';
import { POI_LIMITS, POI_SHA_RE } from './poiLaw.js';

export const CLIP_TAG = 'bunnyfall-poi-clip';
export const CLIP_STORE_KEY = 'bunnyfall.poieditor.clip';
const CAPS = { parts: POI_LIMITS.parts, flats: POI_V2_LIMITS.flats, lights: POI_LIMITS.lights, npcs: POI_LIMITS.npcs };
const COLLECTIONS = /** @type {const} */ ([['parts', 'part'], ['flats', 'flat'], ['lights', 'light'], ['npcs', 'npc']]);
const NPC_LINKS = /** @type {const} */ ([['route', 'routes'], ['dialogue', 'dialogues'], ['trade', 'trades']]);

const inside = (doc, groupKey, ancestor) => {
  for (let k = groupKey, n = 0; k && n < 64; n++) { if (k === ancestor) return true; k = (doc.groups ?? []).find((x) => x.key === k)?.parent; }
  return false;
};

/** @param {any} doc */
export function topIds(doc) {
  const groups = new Set((doc?.groups ?? []).map((g) => g?.key));
  const out = (doc?.groups ?? []).filter((g) => g && !(g.parent && groups.has(g.parent))).map((g) => `group:${g.key}`);
  for (const [name, kind] of COLLECTIONS) (doc?.[name] ?? []).forEach((r, i) => { if (r && !(r.group && groups.has(r.group))) out.push(kind === 'light' ? `light:${i}` : `${kind}:${r.key}`); });
  return out;
}

/**
 * @param {any} doc
 * @param {string[]} ids
 */
export function copyNodes(doc, ids) {
  const clip = { tag: CLIP_TAG, v: 1, from: doc?.id ?? null, groups: /** @type {any[]} */ ([]), parts: /** @type {any[]} */ ([]), flats: /** @type {any[]} */ ([]), lights: /** @type {any[]} */ ([]), npcs: /** @type {any[]} */ ([]) };
  const chosen = new Set();
  const rows = { parts: new Set(), flats: new Set(), lights: new Set(), npcs: new Set() };
  for (const id of ids) {
    const f = find(doc, id);
    if (!f) continue;
    if (f.kind === 'group') { for (const g of doc.groups ?? []) if (inside(doc, g.key, f.row.key)) chosen.add(g.key); continue; }
    rows[KINDS[f.kind]].add(f.index);
  }
  for (const [name] of COLLECTIONS) (doc?.[name] ?? []).forEach((r, i) => { if (r?.group && chosen.has(r.group)) rows[name].add(i); });
  clip.groups = (doc.groups ?? []).filter((g) => chosen.has(g.key)).map((g) => structuredClone(g));
  for (const [name] of COLLECTIONS) clip[name] = [...rows[name]].sort((a, b) => a - b).map((i) => structuredClone(doc[name][i]));
  return clip;
}

/** @param {any} clip */
export const clipCount = (clip) => (clip ? clip.groups.length + clip.parts.length + clip.flats.length + clip.lights.length + clip.npcs.length : 0);
/** @param {any} clip */
export const clipRows = (clip) => (clip ? clip.parts.length + clip.flats.length + clip.lights.length + clip.npcs.length : 0);

export const clipText = (clip) => JSON.stringify(clip);

/** @param {string | null | undefined} text */
export function readClip(text) {
  if (typeof text !== 'string' || !text) return null;
  let c;
  try { c = JSON.parse(text); } catch { return null; }
  if (!c || typeof c !== 'object' || c.tag !== CLIP_TAG || c.v !== 1) return null;
  for (const k of ['groups', 'parts', 'flats', 'lights', 'npcs']) {
    if (c[k] === undefined) c[k] = [];
    if (!Array.isArray(c[k]) || c[k].some((r) => !r || typeof r !== 'object' || Array.isArray(r))) return null;
  }
  return c;
}

/** @param {any} r */
export function assetsOf(r) {
  const out = [];
  const add = (s) => { if (typeof s === 'string' && POI_SHA_RE.test(s)) out.push(s); };
  add(r?.mesh);
  for (const m of Array.isArray(r?.materials) ? r.materials : []) { add(m?.texture); add(m?.emissive); }
  if (r?.look?.k === 'pic') add(r.look.tex);
  return out;
}

const r4 = (v) => { const r = Math.round(v * 1e4) / 1e4; return r === 0 ? 0 : r; };

/**
 * @param {any} doc
 * @param {any} clip
 * @param {{ offset?: number[], has?: (sha: string) => boolean }} [opts]
 */
export function pasteClip(doc, clip, { offset = [0, 0, 0], has = () => true } = {}) {
  const out = { ids: /** @type {string[]} */ ([]), top: /** @type {string[]} */ ([]), missing: /** @type {string[]} */ ([]), full: /** @type {string[]} */ ([]) };
  const sameDoc = clip.from != null && clip.from === doc.id;
  const gmap = new Map();
  const had = new Set((doc.groups ?? []).map((g) => g.key));
  const taken = new Set(had);
  const room = POI_V2_LIMITS.groups - (doc.groups?.length ?? 0);
  for (const g of clip.groups) {
    if (gmap.size >= room) { out.full.push(String(g.name || g.key)); continue; }
    const key = freshKey(g.key, taken); taken.add(key); gmap.set(g.key, key);
  }
  if (gmap.size) doc.groups ??= [];
  const clipParent = new Map(clip.groups.map((g) => [g.key, g.parent]));
  const cyclic = (k) => { const seen = new Set(); for (let c = k; c && clipParent.has(c); c = clipParent.get(c)) { if (seen.has(c)) return true; seen.add(c); } return false; };
  for (const g of clip.groups) {
    if (!gmap.has(g.key)) continue;
    const parent = g.parent && gmap.has(g.parent) && !cyclic(g.key) ? gmap.get(g.parent) : null;
    doc.groups.push({ ...structuredClone(g), key: gmap.get(g.key), parent });
    out.ids.push(`group:${gmap.get(g.key)}`);
    if (!parent) out.top.push(`group:${gmap.get(g.key)}`);
  }
  for (const [name, kind] of COLLECTIONS) {
    if (!clip[name].length) continue;
    const list = Array.isArray(doc[name]) ? doc[name] : (doc[name] = []);
    const keys = new Set(list.map((r) => r?.key));
    for (const src of clip[name]) {
      const label = String(src.name || src.key || kind);
      if (assetsOf(src).some((sha) => !has(sha))) { out.missing.push(label); continue; }
      if (list.length >= CAPS[name]) { out.full.push(label); continue; }
      const r = structuredClone(src);
      if (kind !== 'light') { r.key = freshKey(r.key ?? kind, keys); keys.add(r.key); }
      if (Array.isArray(r.t) && r.t.length === 3) r.t = r.t.map((c, k) => r4(Number(c) + (offset[k] ?? 0)));
      let top = true;
      if (r.group !== undefined && gmap.has(r.group)) { r.group = gmap.get(r.group); top = false; }
      else if (r.group !== undefined && !had.has(r.group)) delete r.group;
      if (kind === 'npc' && !sameDoc) {
        for (const [link, coll] of NPC_LINKS) if (r[link] !== undefined && !(doc[coll] ?? []).some((x) => x?.key === r[link])) delete r[link];
        delete r.showWhen;
      }
      list.push(r);
      const id = kind === 'light' ? `light:${list.length - 1}` : `${kind}:${r.key}`;
      out.ids.push(id);
      if (top) out.top.push(id);
    }
    if (!list.length && (name === 'npcs' || name === 'flats')) delete doc[name];
  }
  if (doc.groups && !doc.groups.length) delete doc.groups;
  return out;
}

export function duplicateNodes(doc, ids, opts = {}) {
  return pasteClip(doc, copyNodes(doc, ids), { offset: [0, 0, 0], ...opts });
}
