// World hover: what the crosshair is on, resolved to a plain record from the activation race's winner.
// Pure, with no DOM; ui/worldPlaque.js draws the frame.
import { rarityAttr } from '../items/lootRarity.js';
import { isPersonalLoot } from '../items/roomLoot.js';
import { itemNameParts } from '../items/itemInfo.js';

export const HOVER_MAX = 6;

export const ITEMISED_KEYS = Object.freeze(['loot:', 'corpse:', 'droppedLoot:', 'foeCorpse:', 'guardCorpse:', 'dwFish:', 'spoil:']);

export const keyItemises = (key) => typeof key === 'string' && ITEMISED_KEYS.some((p) => key.startsWith(p));

export const PREVIEW_KEYS = Object.freeze(['container:', 'decor:']);

export const keyPreviews = (key) => typeof key === 'string' && PREVIEW_KEYS.some((p) => key.startsWith(p));

// The take and the plaque must find a row through this same walk, or a hole in the pack moves the wrong item.
export const hoverItems = (items) => (items ?? []).filter(Boolean);

export function hoverItemAt(items, row, max = HOVER_MAX) {
  if (!Number.isInteger(row) || row < 0 || row >= max) return null;
  return hoverItems(items)[row] ?? null;
}

export function hoverLines(items, max = HOVER_MAX) {
  const rows = hoverItems(items).map((it) => ({
    name: itemNameParts(it).name || 'Something',
    stack: (it.stackCount ?? 1) > 1 ? it.stackCount : 0,
    rarity: rarityAttr(it),
    mine: isPersonalLoot(it),
    item: it,
  }));
  const shown = rows.slice(0, max);
  const rest = rows.length - shown.length;
  return { shown, rest, empty: rows.length === 0 };
}

export function composeActivationTargets(own, producers) {
  const targets = [...(own ?? [])];
  for (const fn of producers ?? []) {
    const t = fn?.();
    if (t?.length) targets.push(...t);
  }
  return targets;
}

export function composeNamer(namers) {
  return (key, hit) => {
    for (const fn of namers ?? []) {
      const r = fn?.(key, hit);
      if (r?.title) return r;
    }
    return null;
  };
}

export function composeContents(readers) {
  return (key) => {
    for (const fn of readers ?? []) {
      const r = fn?.(key);
      if (r) return r;
    }
    return null;
  };
}

const frame = (key, kind, title, subs, rows = [], rest = 0, empty = false) =>
  ({ key, kind, title, subs, rows, rest, empty });

function resolvePreview(key, hit, name, contents) {
  const named = name?.(key, hit) ?? null;
  if (!named?.title) return null;
  if (Array.isArray(named.actions) && named.actions.some((a) => a?.id != null && a.label)) return null;
  const held = contents?.(key);
  const tone = (f) => {
    if (typeof named.tone === 'string' && named.tone) f.tone = named.tone;
    return f;
  };
  if (!Array.isArray(held)) return tone(frame(key, 'name', named.title, named.subs ?? []));
  const { shown, rest, empty } = hoverLines(held, Infinity);
  const f = frame(key, 'items', named.title, named.subs ?? [], shown, rest, empty);
  f.preview = true;
  return tone(f);
}

export function resolveHover(hit, { name = null, contents = null } = {}) {
  if (!hit) return null;
  if (!(hit.distance <= hit.reach)) return null;
  const key = hit.key;
  if (key == null) return null;
  if (keyPreviews(key) && !keyItemises(key)) { const glanced = resolvePreview(key, hit, name, contents); if (glanced) return glanced; }
  if (keyItemises(key)) {
    const named = name?.(key, hit) ?? null;
    // A namer's `unlisted` key is a container this reader cannot read: it draws as a name, never as an empty list.
    if (named?.title && named.unlisted) {
      const f = frame(key, 'name', named.title, named.subs ?? []);
      if (typeof named.tone === 'string' && named.tone) f.tone = named.tone;
      return f;
    }
    if (!named?.title) return null;
    const { shown, rest, empty } = hoverLines(contents?.(key) ?? null, Infinity);
    return frame(key, 'items', named.title, named.subs ?? [], shown, rest, empty);
  }
  const named = name?.(key, hit) ?? null;
  if (!named?.title) return null;
  const acts = Array.isArray(named.actions) ? named.actions.filter((a) => a?.id != null && a.label) : [];
  const renowned = (f) => { if (Number.isSafeInteger(named.renown) && named.renown > 0) f.renown = named.renown; return f; };
  if (acts.length) {
    const subs = [...(named.subs ?? [])];
    if (typeof key === 'string' && (key.startsWith('decor:') || key.startsWith('container:'))) {
      const held = contents?.(key);
      if (Array.isArray(held)) {
        if (!held.length) subs.push('Empty');
        else {
          let n = 0;
          for (const it of held) {
            if (n === 6) { subs.push('...'); break; }
            const label = typeof it === 'string' ? it : (it?.shortName || it?.name);
            if (!label) continue;
            const count = it?.stackCount;
            subs.push(count > 1 ? `${label} x${count}` : String(label));
            n += 1;
          }
        }
      }
    }
    const f = frame(key, 'actions', named.title, subs, acts.map((a) => ({
      name: a.disabled ? (a.why === '' ? a.label : `${a.label} (${a.why || 'not now'})`) : a.label, id: a.id, disabled: !!a.disabled, stack: 0, rarity: null, item: null,
    })));
    if (named.actionsUnlit) f.startUnlit = true;
    else if (Number.isInteger(named.actionsStart) && named.actionsStart > 0 && named.actionsStart < acts.length) f.startRow = named.actionsStart;
    return renowned(f);
  }
  const f = frame(key, 'name', named.title, named.subs ?? []);
  if (typeof named.tone === 'string' && named.tone) f.tone = named.tone;
  return renowned(f);
}

export function nextSelection(prev, frame, delta = 0) {
  const rows = frame?.rows?.length ?? 0;
  if (!frame || !rows) return null;
  const d = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const floor = frame.startUnlit ? -1 : 0;
  const start = Number.isInteger(frame.startRow) && frame.startRow < rows ? frame.startRow : floor;
  let row = start;
  if (prev && prev.key === frame.key) {
    const at = prev.id != null ? frame.rows.findIndex((r) => r.id === prev.id) : -1;
    // A lit row with an id that is gone restarts at the start row; it never lights a neighbor.
    row = prev.id != null && at < 0 ? start : Math.max(floor, Math.min(rows - 1, (at >= 0 ? at : prev.row) + d));
  }
  const id = row >= 0 ? frame.rows[row]?.id : undefined;
  return id != null ? { key: frame.key, row, id } : { key: frame.key, row };
}

export function selectedRow(sel, frame) {
  if (!sel || !frame || sel.key !== frame.key) return -1;
  const rows = frame.rows?.length ?? 0;
  return sel.row >= 0 && sel.row < rows ? sel.row : -1;
}

export function plaqueWindow(f, lit = -1, from = 0, max = HOVER_MAX) {
  const n = f?.rows?.length ?? 0;
  if (!f || f.kind !== 'items' || n <= max) return { frame: f, from: 0 };
  let top = Math.max(0, Math.min(Number.isInteger(from) ? from : 0, n - max));
  if (lit >= 0 && lit < top) top = lit;
  else if (lit >= top + max) top = lit - max + 1;
  return { frame: { ...f, rows: f.rows.slice(top, top + max), above: top, rest: n - top - max + (f.rest ?? 0) }, from: top };
}

export function frameSignature(f) {
  if (!f) return null;
  const rows = f.rows.map((r) => `${r.name}\u0002${r.stack}\u0002${r.rarity ?? ''}${r.mine ? '\u0002m' : ''}`).join('\u001f');
  return `${f.key}|${f.kind}|${f.renown ?? ''}|${f.title}|${f.subs.join('\u001f')}|${rows}|${f.rest}|${f.empty ? 'e' : ''}${f.tone ? `|${f.tone}` : ''}`;
}
