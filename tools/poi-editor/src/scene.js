// @ts-check

import { POI_V2_LIMITS } from '../../../src/poi/poiLawV2.js';
import { freshKey } from '../../../src/poi/poiDmEdit.js';

export const KINDS = Object.freeze({ part: 'parts', flat: 'flats', light: 'lights', npc: 'npcs' });

export const nodeId = (kind, doc, i) => `${kind}:${kind === 'light' ? i : doc[KINDS[kind]][i].key}`;

/** @param {string} id */
export function parseId(id) {
  const c = id.indexOf(':');
  return { kind: id.slice(0, c), key: id.slice(c + 1) };
}

/** @param {any} doc @param {string} id */
export function find(doc, id) {
  const { kind, key } = parseId(id);
  if (kind === 'group') { const i = (doc.groups ?? []).findIndex((g) => g.key === key); return i < 0 ? null : { kind, index: i, row: doc.groups[i] }; }
  const list = doc[KINDS[kind]];
  if (!list) return null;
  const i = kind === 'light' ? Number(key) : list.findIndex((r) => r.key === key);
  return list[i] ? { kind, index: i, row: list[i] } : null;
}

export { freshKey };

/** @param {any} doc */
export function buildTree(doc) {
  const groups = doc.groups ?? [];
  const byKey = new Map(groups.map((g) => [g.key, g]));
  /** @type {Map<string | null, any[]>} */
  const kids = new Map();
  const put = (parent, node) => { const p = parent && byKey.has(parent) ? parent : null; if (!kids.has(p)) kids.set(p, []); kids.get(p)?.push(node); };
  groups.forEach((g, i) => put(g.parent ?? null, { id: `group:${g.key}`, kind: 'group', name: g.name || g.key, visible: g.visible !== false, locked: !!g.locked, children: [], index: i }));
  for (const kind of /** @type {const} */ (['part', 'flat', 'light', 'npc'])) {
    (doc[KINDS[kind]] ?? []).forEach((row, i) => put(row.group ?? null, { id: nodeId(kind, doc, i), kind, name: row.name || row.key || `${kind} ${i + 1}`, visible: row.visible !== false, locked: !!row.locked, children: [], index: i }));
  }
  const walk = (parent, hidden, frozen, seen) => (kids.get(parent) ?? []).map((n) => {
    n.hidden = hidden || !n.visible; n.frozen = frozen || n.locked;
    if (n.kind === 'group' && !seen.has(n.id)) n.children = walk(n.id.slice(6), n.hidden, n.frozen, new Set(seen).add(n.id));
    return n;
  });
  return walk(null, false, false, new Set());
}

/** @param {any} doc */
export function flatOrder(doc) {
  const out = [];
  const walk = (ns) => ns.forEach((n) => { out.push(n.id); walk(n.children); });
  walk(buildTree(doc));
  return out;
}

export function rangeIds(doc, anchor, id) {
  const order = flatOrder(doc);
  const a = order.indexOf(anchor), b = order.indexOf(id);
  if (a < 0 || b < 0) return [id];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

export function pickable(doc, ids) {
  const live = new Set();
  const walk = (ns) => ns.forEach((n) => { if (n.kind !== 'group' && !n.hidden && !n.frozen) live.add(n.id); walk(n.children); });
  walk(buildTree(doc));
  return ids.filter((i) => live.has(i));
}

const depthOf = (doc, key) => { let d = 0; const seen = new Set(); for (let g = (doc.groups ?? []).find((x) => x.key === key); g && !seen.has(g.key); g = (doc.groups ?? []).find((x) => x.key === g.parent)) { seen.add(g.key); d++; } return d; };

/** @param {any} doc @param {string[]} ids @param {'visible' | 'locked'} flag @param {boolean} value */
export function setFlag(doc, ids, flag, value) {
  for (const id of ids) { const f = find(doc, id); if (f) f.row[flag] = value; }
}

export function groupNodes(doc, ids, name = 'Group') {
  const found = ids.map((id) => find(doc, id)).filter(Boolean);
  if (!found.length) return { refused: 'nothing' };
  doc.groups ??= [];
  if (doc.groups.length >= POI_V2_LIMITS.groups) return { refused: 'groups' };
  const parent = found[0]?.row.group ?? found[0]?.row.parent ?? null;
  if (parent && depthOf(doc, parent) + 1 >= POI_V2_LIMITS.groupDepth) return { refused: 'depth' };
  const key = freshKey(name, new Set(doc.groups.map((g) => g.key)));
  doc.groups.push({ key, name, parent, visible: true, locked: false });
  for (const f of found) if (f) { if (f.kind === 'group') f.row.parent = key; else f.row.group = key; }
  return { key };
}

export function ungroup(doc, groupKey) {
  const g = (doc.groups ?? []).find((x) => x.key === groupKey);
  if (!g) return false;
  const up = g.parent ?? null;
  for (const kind of Object.values(KINDS)) for (const r of doc[kind] ?? []) if (r.group === groupKey) { if (up) r.group = up; else delete r.group; }
  for (const o of doc.groups) if (o.parent === groupKey) o.parent = up;
  doc.groups = doc.groups.filter((x) => x !== g);
  return true;
}

export function removeNodes(doc, ids) {
  const groupKeys = new Set();
  const del = { part: new Set(), flat: new Set(), light: new Set(), npc: new Set() };
  for (const id of ids) {
    const { kind, key } = parseId(id);
    if (kind === 'group') groupKeys.add(key);
    else if (del[kind]) { const f = find(doc, id); if (f) del[kind].add(f.index); }
  }
  let grew = true;
  while (grew) { grew = false; for (const g of doc.groups ?? []) if (g.parent && groupKeys.has(g.parent) && !groupKeys.has(g.key)) { groupKeys.add(g.key); grew = true; } }
  let n = 0;
  for (const [kind, set] of Object.entries(del)) {
    const name = KINDS[kind];
    for (const [i, r] of (doc[name] ?? []).entries()) if (r.group && groupKeys.has(r.group)) set.add(i);
    if (!doc[name]) continue;
    const before = doc[name].length;
    doc[name] = doc[name].filter((_, i) => !set.has(i));
    n += before - doc[name].length;
  }
  if (doc.groups) { n += doc.groups.filter((g) => groupKeys.has(g.key)).length; doc.groups = doc.groups.filter((g) => !groupKeys.has(g.key)); }
  return n;
}

export function moveToGroup(doc, ids, groupKey) {
  const target = groupKey && (doc.groups ?? []).find((g) => g.key === groupKey) ? groupKey : null;
  if (groupKey && !target) return { refused: 'nogroup' };
  for (const id of ids) {
    const f = find(doc, id);
    if (!f) continue;
    if (f.kind === 'group') {
      for (let k = target, n = 0; k && n < 16; n++) { if (k === f.row.key) return { refused: 'cycle' }; k = doc.groups.find((g) => g.key === k)?.parent ?? null; }
      if (target && depthOf(doc, target) + 1 >= POI_V2_LIMITS.groupDepth) return { refused: 'depth' };
      f.row.parent = target;
    } else if (target) f.row.group = target; else delete f.row.group;
  }
  return { ok: true };
}

export function renameNode(doc, id, name) {
  const f = find(doc, id);
  const clean = String(name).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
  if (!f || !clean) return false;
  f.row.name = clean;
  return true;
}
