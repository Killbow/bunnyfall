// @ts-check
// Copy, cut, paste, and duplicate for a POI's scene nodes as JSON text, so a copy survives a reload and reaches another
// POI, another tab, or the system clipboard. Ported from the World Builder's clipboard.js. Paste never trusts the text:
// keys are made fresh, links to things the target lacks are dropped, and a row whose model or picture the store does
// not have is left out and named. Pure (no DOM).
// Groups: a group copied itself (selected, or inside a selected group) comes along with what is in it, under a fresh
// key. A row copied on its own retains its group only where the POI pasted into has a group with that key (pasted into
// its own POI, it sits beside its original); elsewhere it lands outside every group.

import { KINDS, find, freshKey } from './poiScene.js';
import { POI_V2_LIMITS } from './poiLawV2.js';
import { POI_LIMITS, POI_SHA_RE } from './poiLaw.js';

export const CLIP_TAG = 'bunnyfall-poi-clip';
/** The `localStorage` key where the editor saves the last copied selection in this browser. */
export const CLIP_STORE_KEY = 'bunnyfall.poieditor.clip';
const CAPS = { parts: POI_LIMITS.parts, flats: POI_V2_LIMITS.flats, lights: POI_LIMITS.lights, npcs: POI_LIMITS.npcs };
const COLLECTIONS = /** @type {const} */ ([['parts', 'part'], ['flats', 'flat'], ['lights', 'light'], ['npcs', 'npc']]);
/** Links a person carries to other collections, by the collection they name. */
const NPC_LINKS = /** @type {const} */ ([['route', 'routes'], ['dialogue', 'dialogues'], ['trade', 'trades']]);

const inside = (doc, groupKey, ancestor) => {
  for (let k = groupKey, n = 0; k && n < 64; n++) { if (k === ancestor) return true; k = (doc.groups ?? []).find((x) => x.key === k)?.parent; }
  return false;
};

/** The ids of everything at the top of a document's tree: what copying the whole POI takes. @param {any} doc */
export function topIds(doc) {
  const groups = new Set((doc?.groups ?? []).map((g) => g?.key));
  const out = (doc?.groups ?? []).filter((g) => g && !(g.parent && groups.has(g.parent))).map((g) => `group:${g.key}`);
  for (const [name, kind] of COLLECTIONS) (doc?.[name] ?? []).forEach((r, i) => { if (r && !(r.group && groups.has(r.group))) out.push(kind === 'light' ? `light:${i}` : `${kind}:${r.key}`); });
  return out;
}

/** Copy the nodes into a clip: the rows asked for, every row inside a group asked for, and those groups.
 *  @param {any} doc @param {string[]} ids */
export function copyNodes(doc, ids) {
  const clip = { tag: CLIP_TAG, v: 1, from: doc?.id ?? null, groups: /** @type {any[]} */ ([]), parts: /** @type {any[]} */ ([]), flats: /** @type {any[]} */ ([]), lights: /** @type {any[]} */ ([]), npcs: /** @type {any[]} */ ([]) };
  // group keys copied as groups
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

/** How many rows and groups a clip holds. @param {any} clip */
export const clipCount = (clip) => (clip ? clip.groups.length + clip.parts.length + clip.flats.length + clip.lights.length + clip.npcs.length : 0);
/** How many rows (not groups) a clip holds. @param {any} clip */
export const clipRows = (clip) => (clip ? clip.parts.length + clip.flats.length + clip.lights.length + clip.npcs.length : 0);

export const clipText = (clip) => JSON.stringify(clip);

/** Clip text back into a clip, or null when it is not one. @param {string | null | undefined} text */
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

/** The uploaded assets a clip row needs (its model, its pictures, a person's picture), as sha256 names. @param {any} r */
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
 * Put a clip into a document. Answers `{ ids, top, missing, full }`: every new node's id, the new nodes at the top of
 * what was pasted (what the editor selects), what was left out for an asset the store does not have, and what was left
 * out because the document is full. `has(sha)` answers false for an asset known to be missing.
 * @param {any} doc @param {any} clip @param {{ offset?: number[], has?: (sha: string) => boolean }} [opts]
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
  // a group whose parents in the clip lead back to itself (only a clip made by hand) stands at the top instead
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
        // its conditions name the source POI's variables
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

/** Copies of nodes in the same document, where they stand (Ctrl+D). A selected group is copied with what is in it. */
export function duplicateNodes(doc, ids, opts = {}) {
  return pasteClip(doc, copyNodes(doc, ids), { offset: [0, 0, 0], ...opts });
}
