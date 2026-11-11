// @ts-check

// Copy, cut and paste of scene nodes, as text. The text is JSON, so it survives a reload and goes to another
// POI, another tab or the system clipboard. Paste never trusts it: keys are made fresh, groups are rebuilt,
// links to things the target does not have are dropped and a node that needs an asset the catalogue lacks is
// left out and named.

import { KINDS, find, parseId, freshKey } from './scene.js';
import { POI_V2_LIMITS } from '../../../src/poi/poiLawV2.js';

export const CLIP_TAG = 'bunnyfall-poi-clip';
const CAPS = { parts: 128, flats: POI_V2_LIMITS.flats, lights: 32, npcs: 32 };
/** Links a person carries to other collections. They only make sense where the target has the same key. */
const NPC_LINKS = /** @type {const} */ (['route', 'dialogue', 'trade']);

/** Copy the nodes (and the groups they stand in) into clip text. @param {any} doc @param {string[]} ids */
export function copyNodes(doc, ids) {
  const clip = { tag: CLIP_TAG, v: 1, from: doc.id ?? null, groups: [], parts: [], flats: [], lights: [], npcs: [] };
  const groupKeys = new Set();
  const wantGroup = (k) => {
    for (let g = (doc.groups ?? []).find((x) => x.key === k), n = 0; g && !groupKeys.has(g.key) && n < 16; g = (doc.groups ?? []).find((x) => x.key === g.parent), n++) groupKeys.add(g.key);
  };
  for (const id of ids) {
    const f = find(doc, id);
    if (!f) continue;
    if (f.kind === 'group') { wantGroup(f.row.key); for (const g of doc.groups ?? []) if (inside(doc, g.key, f.row.key)) wantGroup(g.key); for (const kind of Object.values(KINDS)) for (const r of doc[kind] ?? []) if (inside(doc, r.group, f.row.key)) (/** @type {any} */ (clip))[kind].push(structuredClone(r)); continue; }
    (/** @type {any} */ (clip))[KINDS[f.kind]].push(structuredClone(f.row));
    if (f.row.group) wantGroup(f.row.group);
  }
  for (const kind of Object.values(KINDS)) {
    const seen = new Set();
    (/** @type {any} */ (clip))[kind] = (/** @type {any} */ (clip))[kind].filter((r) => { const k = JSON.stringify(r); if (seen.has(k)) return false; seen.add(k); return true; });
    for (const r of (/** @type {any} */ (clip))[kind]) if (r.group) wantGroup(r.group);
  }
  clip.groups = (doc.groups ?? []).filter((g) => groupKeys.has(g.key)).map((g) => structuredClone(g));
  return clip;
}

function inside(doc, groupKey, ancestor) {
  for (let k = groupKey, n = 0; k && n < 16; n++) { if (k === ancestor) return true; k = (doc.groups ?? []).find((x) => x.key === k)?.parent; }
  return false;
}

export const clipText = (clip) => JSON.stringify(clip);

/** Clip text back into a clip, or null when it is not one. @param {string} text */
export function readClip(text) {
  let c;
  try { c = JSON.parse(text); } catch { return null; }
  if (!c || c.tag !== CLIP_TAG || c.v !== 1) return null;
  for (const k of ['groups', 'parts', 'flats', 'lights', 'npcs']) if (!Array.isArray(c[k])) return null;
  return c;
}

/**
 * Put a clip into a document. Answers `{ ids, missing, full }`: the new nodes' ids, what was left out for a missing asset
 * and what was left out because the document is full. `has` answers whether an asset is in the catalogue:
 * `has('df-arch3d:123')`, `has('df-flat:334.2')`.
 * @param {any} doc @param {any} clip @param {{ offset?: number[], has?: (id: string) => boolean, into?: string | null, keepGroups?: boolean }} [opts]
 */
export function pasteClip(doc, clip, { offset = [1, 0, 1], has = () => true, into = null, keepGroups = false } = {}) {
  const out = { ids: /** @type {string[]} */ ([]), missing: /** @type {{ what: string, why: string }[]} */ ([]), full: /** @type {string[]} */ ([]) };
  doc.groups ??= [];
  const gmap = new Map();
  const taken = new Set(doc.groups.map((g) => g.key));
  const room = POI_V2_LIMITS.groups - doc.groups.length;
  let made = 0;
  for (const g of clip.groups) {
    if (made >= room) { out.full.push(`group ${g.key}`); continue; }
    const key = freshKey(g.key, taken); taken.add(key); gmap.set(g.key, key); made++;
  }
  for (const g of clip.groups) {
    if (!gmap.has(g.key)) continue;
    const parent = g.parent && gmap.has(g.parent) ? gmap.get(g.parent) : into;
    doc.groups.push({ ...structuredClone(g), key: gmap.get(g.key), parent: parent ?? null });
    out.ids.push(`group:${gmap.get(g.key)}`);
  }
  const need = (kind, r) => {
    if (kind === 'parts' && typeof r.arch3d === 'number') return `df-arch3d:${r.arch3d}`;
    if (kind === 'flats' && Array.isArray(r.flat)) return `df-flat:${r.flat[0]}.${r.flat[1]}`;
    return null;
  };
  for (const [kind, nodeKind] of /** @type {const} */ ([['parts', 'part'], ['flats', 'flat'], ['lights', 'light'], ['npcs', 'npc']])) {
    const list = (doc[kind] ??= []);
    const keys = new Set(list.map((r) => r.key));
    for (const src of clip[kind]) {
      const asset = need(kind, src);
      if (asset && !has(asset)) { out.missing.push({ what: src.name || src.key || kind, why: `${asset} is not in the catalogue` }); continue; }
      if (list.length >= CAPS[kind]) { out.full.push(src.name || src.key || kind); continue; }
      const r = structuredClone(src);
      if (r.key !== undefined) { r.key = freshKey(r.key, keys); keys.add(r.key); }
      if (r.t) r.t = [r.t[0] + offset[0], r.t[1] + offset[1], r.t[2] + offset[2]];
      if (r.group && gmap.has(r.group)) r.group = gmap.get(r.group);
      else if (keepGroups && r.group && doc.groups.some((g) => g.key === r.group)) { /* the copy stays beside its original */ }
      else if (into) r.group = into; else delete r.group;
      if (kind === 'npcs') for (const link of NPC_LINKS) if (r[link] !== undefined && !(doc[link === 'route' ? 'routes' : link === 'dialogue' ? 'dialogues' : 'trades'] ?? []).some((x) => x.key === r[link])) delete r[link];
      if (kind === 'npcs') delete r.showWhen;
      list.push(r);
      out.ids.push(`${nodeKind}:${nodeKind === 'light' ? list.length - 1 : r.key}`);
    }
  }
  return out;
}

/** Copy of nodes in the same document (Ctrl+D). The copies stand in the same groups. A group that was itself chosen is copied with what is in it. */
export function duplicateNodes(doc, ids, opts = {}) {
  const clip = copyNodes(doc, ids);
  const chosen = ids.filter((i) => i.startsWith('group:')).map((i) => i.slice(6));
  clip.groups = clip.groups.filter((g) => chosen.some((c) => c === g.key || inside(doc, g.key, c)));
  return pasteClip(doc, clip, { ...opts, keepGroups: true });
}

export { parseId };
