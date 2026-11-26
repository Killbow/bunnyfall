// @ts-check

import { freshKey } from './poiScene.js';
import { POI_DOC_VERSION, POI_LIMITS } from './poiLaw.js';
import { lawName } from './poiEdit.js';

export const POI_KEYED = Object.freeze(['groups', 'parts', 'flats', 'npcs', 'routes', 'encounters', 'interactives', 'dialogues', 'trades', 'variables', 'events']);

export const POI_DUPLICATE_SHIFT_M = 8;
const SQUARE_M = 819.19;

const LINKS = Object.freeze({ npc: 'npcs', route: 'routes', dialogue: 'dialogues', trade: 'trades', encounter: 'encounters', interactive: 'interactives', event: 'events', var: 'variables' });

/**
 * @param {any} src
 * @param {{ id: string, name: string }} o
 */
export function duplicatePoiDoc(src, { id, name }) {
  const doc = structuredClone(src);
  doc.id = id;
  doc.v = POI_DOC_VERSION;
  doc.name = lawName(name) || lawName(src.name) || 'Copy';
  /** @type {Record<string, Map<string, string>>} */
  const maps = {};
  for (const kind of POI_KEYED) {
    const rows = Array.isArray(doc[kind]) ? doc[kind] : [];
    const taken = new Set(rows.map((r) => r?.key).filter((k) => typeof k === 'string'));
    const m = new Map();
    for (const r of rows) {
      if (!r || typeof r.key !== 'string' || m.has(r.key)) continue;
      const k = freshKey(r.key, taken);
      taken.add(k);
      m.set(r.key, k);
      r.key = k;
    }
    maps[kind] = m;
  }
  const to = (kind, v) => (typeof v === 'string' && maps[kind].has(v) ? maps[kind].get(v) : v);
  const links = (o) => { if (o && typeof o === 'object') for (const [f, kind] of Object.entries(LINKS)) if (typeof o[f] === 'string') o[f] = to(kind, o[f]); };
  const cond = (c, depth = 0) => {
    if (!c || typeof c !== 'object' || depth > 16) return;
    if (Array.isArray(c.of)) for (const x of c.of) cond(x, depth + 1);
    if (c.k === 'var') c.var = to('variables', c.var);
  };
  const each = (v, fn) => { if (Array.isArray(v)) for (const x of v) if (x && typeof x === 'object') fn(x); };

  each(doc.groups, (g) => { if (g.parent != null) g.parent = to('groups', g.parent); });
  for (const kind of ['parts', 'lights', 'npcs', 'flats', 'interactives']) each(doc[kind], (r) => { if (r.group !== undefined) r.group = to('groups', r.group); });
  each(doc.npcs, (n) => {
    if (n.route !== undefined) n.route = to('routes', n.route);
    if (n.dialogue !== undefined) n.dialogue = to('dialogues', n.dialogue);
    if (n.trade !== undefined) n.trade = to('trades', n.trade);
    cond(n.showWhen);
  });
  each(doc.routes, (r) => each(r.waypoints, (w) => { if (w.onArriveEvent !== undefined) w.onArriveEvent = to('events', w.onArriveEvent); }));
  each(doc.encounters, (e) => {
    each(e.spawns, (s) => { if (s.route !== undefined) s.route = to('routes', s.route); });
    if (e.onStart !== undefined) e.onStart = to('events', e.onStart);
    if (e.onComplete !== undefined) e.onComplete = to('events', e.onComplete);
  });
  each(doc.interactives, (o) => {
    if (o.appearance?.k === 'part') o.appearance.key = to('parts', o.appearance.key);
    if (o.stateVar !== undefined) o.stateVar = to('variables', o.stateVar);
  });
  each(doc.dialogues, (d) => each(d.nodes, (n) => each(n.options, (o) => { cond(o.when); links(o.then); })));
  each(doc.trades, (tr) => each(tr.recipes, (r) => { cond(r.when); if (r.onSuccessEvent !== undefined) r.onSuccessEvent = to('events', r.onSuccessEvent); }));
  each(doc.events, (e) => { links(e.trigger); cond(e.when); each(e.then, links); each(e.else, links); });

  if (doc.place && Number.isFinite(doc.place.x)) {
    const east = doc.place.x + POI_DUPLICATE_SHIFT_M;
    doc.place.x = east <= SQUARE_M ? east : Math.max(0, doc.place.x - POI_DUPLICATE_SHIFT_M);
  }
  return doc;
}

/**
 * @param {string} name
 * @param {(base: string) => string} say
 */
export function duplicateName(name, say) {
  const max = /** @type {number} */ (POI_LIMITS.name);
  const base = lawName(name) || 'POI';
  for (let n = base.length; n > 0; n--) {
    const s = lawName(say(base.slice(0, n).trim()), 4096);
    if (s.length <= max) return s;
  }
  return lawName(say(''), max);
}
