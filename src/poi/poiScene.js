// @ts-check
// The scene hierarchy of a POI document, as pure functions (no DOM, no GL), ported from the World Builder's scene.js.
// Parts, flats, lights, and people sit in groups (`group` is a group key); a group can sit in another (`parent`). A
// node's id is `kind:key` (`part:door`, `npc:npc-1`, `group:market`), or `light:index` for a light, which has no key.
// The editor runs the changing functions inside poiEdit's `edit`, so each one is a single undo step.
// `visible: false` and `locked: true` are the editor's marks, and a group's mark covers what is inside it: a hidden row
// is not drawn or picked in the editor, and a locked row is not picked, moved, or deleted there. The game stands hidden
// rows as usual.

import { POI_V2_LIMITS } from './poiLawV2.js';
import { POI_LIMITS } from './poiLaw.js';

/** The collections a scene node can live in, by node kind. */
export const KINDS = Object.freeze({ part: 'parts', flat: 'flats', light: 'lights', npc: 'npcs' });
/** Every collection whose rows may name a group: the scene nodes', and the interactive objects the DM tools place. An
 *  interactive object is not a scene node here, but ungrouping or deleting its group must not leave it naming one. */
const GROUPED = Object.freeze([...Object.values(KINDS), 'interactives']);
const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
/** The longest group name the law takes (poiLawV2.js groups). */
export const GROUP_NAME_MAX = 48;

/** A node's id: `kind:key`, or `light:index` (lights have no key). @param {string} kind @param {any} doc @param {number} i */
export const nodeId = (kind, doc, i) => `${kind}:${kind === 'light' ? i : doc[KINDS[kind]][i].key}`;

/** Split an id. @param {string} id */
export function parseId(id) {
  const c = String(id).indexOf(':');
  return { kind: String(id).slice(0, c), key: String(id).slice(c + 1) };
}

/** The document's row for an id, with its index, or null. @param {any} doc @param {string} id */
export function find(doc, id) {
  const { kind, key } = parseId(id);
  if (kind === 'group') { const i = (doc?.groups ?? []).findIndex((g) => g?.key === key); return i < 0 ? null : { kind, index: i, row: doc.groups[i] }; }
  const list = doc?.[KINDS[kind]];
  if (!Array.isArray(list)) return null;
  const i = kind === 'light' ? (/^\d+$/.test(key) ? Number(key) : -1) : list.findIndex((r) => r?.key === key);
  return i >= 0 && list[i] && typeof list[i] === 'object' ? { kind, index: i, row: list[i] } : null;
}

/** A key from a wanted word, unique among `taken`: the law's spelling, numbered while taken. @param {any} wanted @param {Set<string>} taken */
export function freshKey(wanted, taken) {
  const base = String(wanted ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/-+$/, '').slice(0, 26) || 'item';
  if (!taken.has(base) && KEY_RE.test(base)) return base;
  for (let n = 2; ; n++) { const k = `${base}-${n}`; if (!taken.has(k)) return k; }
}

/**
 * The tree for the outliner. Every node: `{ id, kind, name, children, visible, locked, hidden, frozen, index }`.
 * `hidden` and `frozen` are what the node is in fact: its own mark or that of any group above it.
 * @param {any} doc
 */
export function buildTree(doc) {
  const groups = (doc?.groups ?? []).filter((g) => g && typeof g === 'object');
  const byKey = new Map(groups.map((g) => [g.key, g]));
  /** @type {Map<string | null, any[]>} */
  const kids = new Map();
  const put = (parent, node) => { const p = parent && byKey.has(parent) ? parent : null; if (!kids.has(p)) kids.set(p, []); kids.get(p)?.push(node); };
  (doc?.groups ?? []).forEach((g, i) => { if (g && typeof g === 'object') put(g.parent ?? null, { id: `group:${g.key}`, kind: 'group', name: g.name || g.key, visible: g.visible !== false, locked: !!g.locked, children: [], index: i }); });
  for (const kind of /** @type {const} */ (['part', 'flat', 'light', 'npc'])) {
    (doc?.[KINDS[kind]] ?? []).forEach((row, i) => {
      if (!row || typeof row !== 'object') return;
      put(row.group ?? null, { id: nodeId(kind, doc, i), kind, name: row.name || row.key || `${kind} ${i + 1}`, visible: row.visible !== false, locked: !!row.locked, children: [], index: i });
    });
  }
  const walk = (parent, hidden, frozen, seen) => (kids.get(parent) ?? []).map((n) => {
    n.hidden = hidden || !n.visible; n.frozen = frozen || n.locked;
    if (n.kind === 'group' && !seen.has(n.id)) n.children = walk(n.id.slice(6), n.hidden, n.frozen, new Set(seen).add(n.id));
    return n;
  });
  return walk(null, false, false, new Set());
}

/** Every node's `{ hidden, frozen }` by id. @param {any} doc @returns {Map<string, { hidden: boolean, frozen: boolean }>} */
export function marksOf(doc) {
  const out = new Map();
  const walk = (ns) => ns.forEach((n) => { out.set(n.id, { hidden: n.hidden, frozen: n.frozen }); walk(n.children); });
  walk(buildTree(doc));
  return out;
}

/** Every id in the document, tree order, for shift-click ranges. @param {any} doc */
export function flatOrder(doc) {
  const out = [];
  const walk = (ns) => ns.forEach((n) => { out.push(n.id); walk(n.children); });
  walk(buildTree(doc));
  return out;
}

/** The ids from `anchor` to `id` in tree order, or `[id]` when either is not in the tree. */
export function rangeIds(doc, anchor, id) {
  const order = flatOrder(doc);
  const a = order.indexOf(anchor), b = order.indexOf(id);
  if (a < 0 || b < 0) return [id];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** The ids among `ids` that a click or a box in the world may take: not groups, not hidden, not locked. */
export function pickable(doc, ids) {
  const m = marksOf(doc);
  return ids.filter((i) => { const k = m.get(i); return !!k && !k.hidden && !k.frozen && !i.startsWith('group:'); });
}

/** The rows `ids` stand for, a group standing for everything inside it: parts, flats, lights, and people, each once,
 *  locked ones left out (a locked row is not moved) unless `locked` asks for them too.
 *  @param {any} doc @param {string[]} ids @param {boolean} [locked] */
export function movable(doc, ids, locked = false) {
  const asked = new Set(ids);
  const out = [];
  const walk = (ns, inside) => ns.forEach((n) => {
    const i = inside || asked.has(n.id);
    if (n.kind !== 'group' && i && (locked || !n.frozen)) out.push(n.id);
    walk(n.children, i);
  });
  walk(buildTree(doc), false);
  return out;
}

/** A document for the editor's own view: a copy without the rows that are hidden (by their own mark or a group's). The
 *  game is never handed this; it stands every row. @param {any} doc */
export function viewDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const m = marksOf(doc);
  let any = false;
  for (const v of m.values()) if (v.hidden) { any = true; break; }
  if (!any) return doc;
  const out = { ...doc };
  for (const kind of /** @type {const} */ (['part', 'flat', 'light', 'npc'])) {
    const name = KINDS[kind];
    if (!Array.isArray(doc[name])) continue;
    out[name] = doc[name].filter((_, i) => !m.get(nodeId(kind, doc, i))?.hidden);
  }
  return out;
}

const depthOf = (doc, key) => { let d = 0; const seen = new Set(); for (let g = (doc.groups ?? []).find((x) => x.key === key); g && !seen.has(g.key); g = (doc.groups ?? []).find((x) => x.key === g.parent)) { seen.add(g.key); d++; } return d; };

/** Set a mark on nodes. @param {any} doc @param {string[]} ids @param {'visible' | 'locked'} flag @param {boolean} value */
export function setFlag(doc, ids, flag, value) {
  let n = 0;
  for (const id of ids) {
    const f = find(doc, id);
    if (!f) continue;
    // a row's default (shown, unlocked) is written by leaving the key out; a group always carries both
    if (f.kind !== 'group' && value === (flag === 'visible')) delete f.row[flag]; else f.row[flag] = value;
    n++;
  }
  return n;
}

/** Put the nodes in a new group, under the group the first one sat in. Answers `{ key }`, or a refusal `{ refused }`. */
export function groupNodes(doc, ids, name = 'Group') {
  const found = ids.map((id) => find(doc, id)).filter(Boolean);
  if (!found.length) return { refused: 'nothing' };
  doc.groups ??= [];
  if (doc.groups.length >= POI_V2_LIMITS.groups) return { refused: 'groups' };
  const first = found[0];
  const parent = (first?.kind === 'group' ? first.row.parent : first?.row.group) ?? null;
  const deepest = Math.max(0, ...found.filter((f) => f?.kind === 'group').map((f) => subtreeDepth(doc, f?.row.key)));
  if ((parent ? depthOf(doc, parent) : 0) + 1 + deepest > POI_V2_LIMITS.groupDepth) return { refused: 'depth' };
  const clean = cleanName(name, GROUP_NAME_MAX) || 'Group';
  const key = freshKey(clean, new Set(doc.groups.map((g) => g.key)));
  doc.groups.push({ key, name: clean, parent, visible: true, locked: false });
  for (const f of found) if (f) { if (f.kind === 'group') f.row.parent = key; else f.row.group = key; }
  return { key };
}

/** How many levels of groups sit at and under a group (1 for a group with no group inside). */
function subtreeDepth(doc, key, seen = new Set()) {
  if (seen.has(key)) return 0;
  seen.add(key);
  let d = 0;
  for (const g of doc.groups ?? []) if (g.parent === key) d = Math.max(d, subtreeDepth(doc, g.key, seen));
  return d + 1;
}

/** Dissolve a group: its children go to the group above it. */
export function ungroup(doc, groupKey) {
  const g = (doc.groups ?? []).find((x) => x.key === groupKey);
  if (!g) return false;
  const up = g.parent ?? null;
  for (const kind of GROUPED) for (const r of doc[kind] ?? []) if (r?.group === groupKey) { if (up) r.group = up; else delete r.group; }
  for (const o of doc.groups) if (o.parent === groupKey) o.parent = up;
  doc.groups = doc.groups.filter((x) => x !== g);
  if (!doc.groups.length) delete doc.groups;
  return true;
}

/** Delete nodes. A group's children are deleted with it. Answers how many rows and groups went. */
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
    if (!Array.isArray(doc[name])) continue;
    for (const [i, r] of doc[name].entries()) if (r?.group && groupKeys.has(r.group)) set.add(i);
    const before = doc[name].length;
    doc[name] = doc[name].filter((_, i) => !set.has(i));
    n += before - doc[name].length;
    // the optional collections go when emptied; parts and lights stay as lists
    if (!doc[name].length && (name === 'npcs' || name === 'flats')) delete doc[name];
  }
  // an interactive object stays when its group goes, outside every group (events may name it)
  for (const r of doc.interactives ?? []) if (r?.group && groupKeys.has(r.group)) delete r.group;
  if (doc.groups) {
    n += doc.groups.filter((g) => groupKeys.has(g.key)).length;
    doc.groups = doc.groups.filter((g) => !groupKeys.has(g.key));
    if (!doc.groups.length) delete doc.groups;
  }
  return n;
}

/** Move nodes into a group (null: out of every group). A group cannot go into itself or what is inside it, nor deeper
 *  than the law's depth. */
export function moveToGroup(doc, ids, groupKey) {
  const target = groupKey && (doc.groups ?? []).find((g) => g.key === groupKey) ? groupKey : null;
  if (groupKey && !target) return { refused: 'nogroup' };
  for (const id of ids) {
    const f = find(doc, id);
    if (!f) continue;
    if (f.kind === 'group') {
      for (let k = target, n = 0; k && n < 64; n++) { if (k === f.row.key) return { refused: 'cycle' }; k = doc.groups.find((g) => g.key === k)?.parent ?? null; }
      if ((target ? depthOf(doc, target) : 0) + subtreeDepth(doc, f.row.key) > POI_V2_LIMITS.groupDepth) return { refused: 'depth' };
      f.row.parent = target;
    } else if (target) f.row.group = target; else delete f.row.group;
  }
  return { ok: true };
}

/** Move a node before another of the same collection (the outliner's reorder). `before` null: to the end. Answers the
 *  node's id after the move (a light's id is its place in the list). */
export function reorderNode(doc, id, before) {
  const f = find(doc, id);
  if (!f) return null;
  const listName = f.kind === 'group' ? 'groups' : KINDS[f.kind];
  const list = doc[listName];
  const row = list[f.index];
  list.splice(f.index, 1);
  let at = list.length;
  if (before) {
    const b = parseId(before);
    if (b.kind === f.kind) {
      const i = f.kind === 'light' ? Number(b.key) - (Number(b.key) > f.index ? 1 : 0) : list.findIndex((r) => r?.key === b.key);
      if (i >= 0 && i <= list.length) at = i;
    }
  }
  list.splice(at, 0, row);
  return f.kind === 'light' ? `light:${at}` : id;
}

const cleanName = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[\uD800-\uDBFF]$/, '').trim();

/** The longest name the law takes for a node of a kind: 48 for a group, the label limit for a person, and the name
 *  limit for a part or a flat picture. @param {string} kind */
export const nameMaxOf = (kind) => /** @type {number} */ (kind === 'group' ? GROUP_NAME_MAX : kind === 'npc' ? POI_LIMITS.label : POI_LIMITS.name);

/** Rename a node. Groups, parts, flats, and people use the `name` field. An empty name removes the field on a part
 *  or flat; a group or person keeps its name. */
export function renameNode(doc, id, name) {
  const f = find(doc, id);
  if (!f) return false;
  const clean = cleanName(name, nameMaxOf(f.kind));
  if (!clean) { if (f.kind === 'group' || f.kind === 'npc') return false; delete f.row.name; return true; }
  f.row.name = clean;
  return true;
}
