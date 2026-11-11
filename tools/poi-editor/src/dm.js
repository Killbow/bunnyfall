// @ts-check

// The DM's content, as data the editor changes: routes and their waypoints, encounters and their spawns, interactive
// objects, dialogues, trades, variables and events. Pure: every function changes the document it is given, and the
// editor runs each inside one poiEdit step. Nothing here is checked twice: poiLawV2.js says whether the result is
// allowed, and the new rows start as valid as the law lets them (a trade needs a reward, a route needs two waypoints).
// Plain words for the people who read an event live here too (`actionText`, `conditionText`).

import { POI_V2_LIMITS as L, POI_INTERACTIVE_STATES, POI_FOE_RANGES } from '../../../src/poi/poiLawV2.js';
import { ENEMY_NAMES } from '../../../src/characters/enemy/enemyBasics.js';
import { freshKey } from './scene.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const keysOf = (rows) => new Set((rows ?? []).map((r) => r.key));
const list = (doc, name) => (doc[name] ??= []);
const plus = (t, dx = 0, dy = 0, dz = 0) => [r3(t[0] + dx), r3(t[1] + dy), r3(t[2] + dz)];
const refuse = (why) => ({ refused: why });

/** The collections the DM suite edits, with the most each may hold. */
export const DM_COLLECTIONS = Object.freeze({
  routes: L.routes, encounters: L.encounters, interactives: L.interactives, dialogues: L.dialogues, trades: L.trades, variables: L.variables, events: L.events,
});

/** What a foe id is called: a monster or a class by the game's own name. */
export const foeName = (id) => (id <= 42 ? ENEMY_NAMES[id] : id >= 128 && id <= 146 ? ENEMY_NAMES[43 + id - 128] : null) ?? `Foe ${id}`;
/** Every foe id the law allows, with its name, in order. */
export const FOES = Object.freeze(POI_FOE_RANGES.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => ({ id: a + i, name: foeName(a + i) }))));

function room(doc, name, wanted) {
  const rows = list(doc, name);
  if (rows.length >= DM_COLLECTIONS[/** @type {keyof typeof DM_COLLECTIONS} */ (name)]) return { refused: `No room: a POI may hold at most ${DM_COLLECTIONS[/** @type {keyof typeof DM_COLLECTIONS} */ (name)]} of these.` };
  return { key: freshKey(wanted, keysOf(rows)) };
}

// ── variables ──
const INITIAL = { boolean: false, number: 0, string: '' };
export function addVariable(doc, name, type = 'boolean', scope = 'poi_global', wantedKey = name) {
  const r = room(doc, 'variables', wantedKey); if (r.refused) return r;
  const v = { key: r.key, name: String(name).slice(0, 48), type, scope, initial: /** @type {any} */ (INITIAL)[type] };
  doc.variables.push(v);
  return { row: v };
}
/** Change a variable's type: its starting value goes back to the type's own. */
export function setVariableType(doc, key, type) { const v = doc.variables?.find((x) => x.key === key); if (!v) return false; v.type = type; v.initial = /** @type {any} */ (INITIAL)[type]; return true; }

// ── routes ──
export function addRoute(doc, name, at = [0, 0, 0]) {
  const r = room(doc, 'routes', name); if (r.refused) return r;
  const route = { key: r.key, name: String(name).slice(0, 48), mode: 'loop', waypoints: [] };
  doc.routes.push(route);
  addWaypoint(route, at, 'Start'); addWaypoint(route, plus(at, 6), 'Stop');
  return { row: route };
}
export function addWaypoint(route, t, name = `Waypoint ${route.waypoints.length + 1}`, at = route.waypoints.length) {
  if (route.waypoints.length >= L.waypoints) return refuse(`A route holds at most ${L.waypoints} waypoints.`);
  const key = freshKey(name, keysOf(route.waypoints));
  const w = { key, name: String(name).slice(0, 48), t: [...t], radius: 1.5, waitS: 0 };
  route.waypoints.splice(Math.max(0, Math.min(route.waypoints.length, at)), 0, w);
  return { row: w };
}
export function moveWaypoint(route, key, t) { const w = route.waypoints.find((x) => x.key === key); if (!w) return false; w.t = t.map(r3); return true; }
/** Move a waypoint one place earlier (-1) or later (+1) in the order. */
export function shiftWaypoint(route, key, dir) {
  const i = route.waypoints.findIndex((x) => x.key === key), j = i + dir;
  if (i < 0 || j < 0 || j >= route.waypoints.length) return false;
  [route.waypoints[i], route.waypoints[j]] = [route.waypoints[j], route.waypoints[i]];
  return true;
}
/** Wait the same time at every waypoint. */
export function setWaitAll(route, waitS) { for (const w of route.waypoints) w.waitS = Math.max(0, Math.min(3600, Math.round(waitS))); return route.waypoints.length; }

// ── encounters ──
export function addEncounter(doc, name, center = [0, 0, 0]) {
  const r = room(doc, 'encounters', name); if (r.refused) return r;
  const e = { key: r.key, name: String(name).slice(0, 48), center: [...center], radius: 20, aggression: 'hostile', respawn: 'never', spawns: [], complete: { rule: 'all_dead' } };
  doc.encounters.push(e);
  addSpawn(e, 136, 1, center);
  return { row: e };
}
export function addSpawn(enc, foe, count, at, wanted = foeName(foe)) {
  if (enc.spawns.length >= L.spawns) return refuse(`An encounter holds at most ${L.spawns} spawn points.`);
  const s = { key: freshKey(wanted, keysOf(enc.spawns)), foe, count, at: [...at], spread: 2 };
  enc.spawns.push(s);
  return { row: s };
}
/** The rule that ends an encounter. A leader rule names one spawn point; a timer rule a number of seconds. */
export function setComplete(enc, rule, extra) {
  if (rule === 'all_dead') enc.complete = { rule };
  else if (rule === 'leader_dead') enc.complete = { rule, leader: extra ?? enc.spawns[0]?.key ?? '' };
  else enc.complete = { rule, seconds: Number.isFinite(extra) ? extra : 60 };
}
export const foeCount = (enc) => enc.spawns.reduce((n, s) => n + (Number.isInteger(s.count) ? s.count : 0), 0);

// ── interactive objects ──
export const DEFAULT_STATE = Object.freeze({ chest: 'closed', door: 'closed', switch: 'inactive', quest_object: 'active', trigger: 'active' });
export function addInteractive(doc, kind, name, t = [0, 0, 0]) {
  const r = room(doc, 'interactives', name); if (r.refused) return r;
  const o = { key: r.key, name: String(name).slice(0, 48), kind, appearance: { k: 'none' }, t: [...t], yaw: 0, radius: kind === 'trigger' ? 8 : 2, state: /** @type {any} */ (DEFAULT_STATE)[kind] };
  doc.interactives.push(o);
  return { row: o };
}
/** Change what an object is: its state goes to the first one the new kind has, if the old one does not fit. */
export function setInteractiveKind(o, kind) { o.kind = kind; if (!/** @type {any} */ (POI_INTERACTIVE_STATES)[kind].includes(o.state)) o.state = /** @type {any} */ (DEFAULT_STATE)[kind]; }

// ── dialogues ──
export function addDialogue(doc, name) {
  const r = room(doc, 'dialogues', name); if (r.refused) return r;
  const d = { key: r.key, name: String(name).slice(0, 48), start: 'root', nodes: [{ key: 'root', say: 'Well met.', options: [{ text: 'Goodbye.', then: { k: 'close' } }] }] };
  doc.dialogues.push(d);
  return { row: d };
}
export function addNode(dlg, say = 'Go on.') {
  if (dlg.nodes.length >= L.nodes) return refuse(`A dialogue holds at most ${L.nodes} nodes.`);
  const n = { key: freshKey('node', keysOf(dlg.nodes)), say, options: [{ text: 'Goodbye.', then: { k: 'close' } }] };
  dlg.nodes.push(n);
  return { row: n };
}
export function addOption(node, text = 'Tell me more.', then = { k: 'close' }) {
  if (node.options.length >= L.options) return refuse(`A node holds at most ${L.options} answers.`);
  const o = { text, then };
  node.options.push(o);
  return { row: o };
}
/** Who points at a node: the answers (and the dialogue's start) that lead to it. */
export function nodeReferrers(dlg, key) {
  const out = [];
  if (dlg.start === key) out.push('the start of the dialogue');
  for (const n of dlg.nodes) n.options.forEach((o, i) => { if (o.then?.k === 'goto' && o.then.node === key) out.push(`answer ${i + 1} of "${n.key}"`); });
  return out;
}
export function removeNode(dlg, key) {
  const by = nodeReferrers(dlg, key);
  if (by.length) return refuse(`Still used by ${by.join(', ')}.`);
  dlg.nodes = dlg.nodes.filter((n) => n.key !== key);
  return { ok: true };
}
/** What an answer does, with the defaults a fresh one needs. */
export function thenOf(doc, dlg, kind) {
  if (kind === 'goto') return { k: 'goto', node: dlg.nodes[0]?.key ?? '' };
  if (kind === 'open_trade') return { k: 'open_trade', trade: doc.trades?.[0]?.key ?? '' };
  if (kind === 'run_trade_recipe') { const t = doc.trades?.[0]; return { k: 'run_trade_recipe', trade: t?.key ?? '', recipe: t?.recipes?.[0]?.key ?? '' }; }
  if (kind === 'trigger_event') return { k: 'trigger_event', event: doc.events?.[0]?.key ?? '' };
  return { k: 'close' };
}

// ── trades ──
export function addTrade(doc, name) {
  const r = room(doc, 'trades', name); if (r.refused) return r;
  const t = { key: r.key, name: String(name).slice(0, 48), recipes: [] };
  doc.trades.push(t);
  addRecipe(t, 'Trade');
  return { row: t };
}
/** A new recipe asks 10 gold for one iron: a trade the law accepts, for the author to change. */
export function addRecipe(trade, name = 'Trade') {
  if (trade.recipes.length >= L.recipes) return refuse(`A trade holds at most ${L.recipes} recipes.`);
  const rec = { key: freshKey(name, keysOf(trade.recipes)), name: String(name).slice(0, 48), requireItems: [], requireGold: 10, rewardItems: [{ template: 71, count: 1 }], rewardGold: 0, limitMode: 'unlimited' };
  trade.recipes.push(rec);
  return { row: rec };
}
/** Set how often a recipe may run. Stock needs a number; the other modes drop it. */
export function setLimit(rec, mode, maxStock = 10) { rec.limitMode = mode; if (mode === 'global_stock') rec.maxStock = maxStock; else delete rec.maxStock; }
export function addStack(rec, side, template, count = 1) {
  const rows = rec[side];
  if (rows.length >= L.stacks) return refuse(`A recipe holds at most ${L.stacks} item stacks on one side.`);
  const s = { template, count };
  rows.push(s);
  return { row: s };
}

// ── events ──
export const TRIGGERS = Object.freeze({
  enter_area: 'A player enters a zone', interact: 'A player uses an object', npc_talk: 'A player talks to a person', waypoint_reached: 'A person reaches a waypoint', chained: 'Another event or link starts it',
});
export function triggerOf(doc, kind) {
  if (kind === 'enter_area') return { k: kind, interactive: doc.interactives?.find((o) => o.kind === 'trigger')?.key ?? '' };
  if (kind === 'interact') return { k: kind, interactive: doc.interactives?.find((o) => o.kind !== 'trigger')?.key ?? '' };
  if (kind === 'npc_talk') return { k: kind, npc: doc.npcs?.[0]?.key ?? '' };
  if (kind === 'waypoint_reached') { const r = doc.routes?.[0]; return { k: kind, route: r?.key ?? '', waypoint: r?.waypoints?.[0]?.key ?? '' }; }
  return { k: 'chained' };
}
export function addEvent(doc, name, triggerKind = 'chained') {
  const r = room(doc, 'events', name); if (r.refused) return r;
  const e = { key: r.key, name: String(name).slice(0, 48), trigger: triggerOf(doc, triggerKind), then: [{ k: 'say', text: 'Something happens.' }] };
  doc.events.push(e);
  return { row: e };
}
/** What each action asks for, so a fresh one is shaped right. */
export function actionOf(doc, kind) {
  const first = (name) => doc[name]?.[0]?.key ?? '';
  switch (kind) {
    case 'say': return { k: kind, text: 'Hello.' };
    case 'set_var': { const v = doc.variables?.[0]; return { k: kind, var: v?.key ?? '', to: v ? INITIAL_OF(v) : true }; }
    case 'set_state': { const o = doc.interactives?.[0]; return { k: kind, interactive: o?.key ?? '', state: o ? /** @type {any} */ (POI_INTERACTIVE_STATES)[o.kind][0] : 'open' }; }
    case 'start_encounter': case 'end_encounter': return { k: kind, encounter: first('encounters') };
    case 'start_route': return { k: kind, npc: first('npcs'), route: first('routes') };
    case 'stop_route': case 'spawn_npc': case 'despawn_npc': return { k: kind, npc: first('npcs') };
    case 'open_dialogue': return { k: kind, dialogue: first('dialogues') };
    case 'open_trade': return { k: kind, trade: first('trades') };
    case 'give_item': case 'take_item': return { k: kind, item: { template: 71, count: 1 } };
    case 'give_gold': case 'take_gold': return { k: kind, amount: 10 };
    default: return { k: 'trigger_event', event: first('events'), delayS: 0 };
  }
}
const INITIAL_OF = (v) => /** @type {any} */ (INITIAL)[v.type];
export function addAction(ev, branch, kind, doc) {
  if ((ev.then?.length ?? 0) + (ev.else?.length ?? 0) >= L.actions) return refuse(`An event holds at most ${L.actions} actions in all.`);
  const a = actionOf(doc, kind);
  if (branch === 'else') (ev.else ??= []).push(a); else ev.then.push(a);
  return { row: a };
}
export function removeAction(ev, branch, index) {
  const rows = branch === 'else' ? ev.else : ev.then;
  if (!rows?.[index]) return false;
  rows.splice(index, 1);
  if (branch === 'else' && !ev.else.length) delete ev.else;
  return true;
}
/** A condition of a kind, ready to be filled in. */
export function conditionOf(doc, kind) {
  if (kind === 'all' || kind === 'any') return { k: kind, of: [conditionOf(doc, 'has_gold')] };
  if (kind === 'has_item') return { k: kind, item: { template: 71, count: 1 } };
  if (kind === 'has_gold') return { k: kind, amount: 10 };
  const v = doc.variables?.[0];
  return { k: 'var', var: v?.key ?? '', op: 'eq', value: v ? INITIAL_OF(v) : true };
}
/** How deep a condition tree is, and how many leaves: what the law limits. */
export function conditionSize(c) {
  if (!c) return { depth: 0, leaves: 0 };
  if (c.k === 'all' || c.k === 'any') { const parts = (c.of ?? []).map(conditionSize); return { depth: 1 + Math.max(0, ...parts.map((p) => p.depth)), leaves: parts.reduce((n, p) => n + p.leaves, 0) }; }
  return { depth: 1, leaves: 1 };
}

// ── who points at what ──
/**
 * Every place the document names a DM row by key. Each is `{ coll, key, where, optional, clear }`: `optional` ones may be
 * left out, and `clear()` drops them; the rest are part of an action, a trigger or an answer that cannot stand without it.
 */
export function refsOf(doc) {
  /** @type {{ coll: string, key: string, sub?: string, where: string, optional: boolean, clear: () => void }[]} */
  const out = [];
  const add = (coll, key, where, optional, clear, sub) => { if (typeof key === 'string') out.push({ coll, key, where, optional, clear, ...(sub ? { sub } : {}) }); };
  const dropField = (o, f) => () => { delete o[f]; };
  for (const n of doc.npcs ?? []) {
    for (const [f, coll] of [['route', 'routes'], ['dialogue', 'dialogues'], ['trade', 'trades']]) add(coll, n[f], `${n.name} (${f})`, true, dropField(n, f));
    walkWhen(n.showWhen, (c) => add('variables', c.var, `${n.name} (shows when)`, false, () => {}));
  }
  for (const r of doc.routes ?? []) for (const w of r.waypoints ?? []) add('events', w.onArriveEvent, `${r.name}, ${w.name} (on arrive)`, true, dropField(w, 'onArriveEvent'));
  for (const e of doc.encounters ?? []) {
    add('events', e.onStart, `${e.name} (on start)`, true, dropField(e, 'onStart'));
    add('events', e.onComplete, `${e.name} (on complete)`, true, dropField(e, 'onComplete'));
    for (const s of e.spawns ?? []) add('routes', s.route, `${e.name}, ${s.key} (patrol)`, true, dropField(s, 'route'));
  }
  for (const t of doc.trades ?? []) for (const r of t.recipes ?? []) {
    add('events', r.onSuccessEvent, `${t.name}, ${r.name} (on success)`, true, dropField(r, 'onSuccessEvent'));
    walkWhen(r.when, (c) => add('variables', c.var, `${t.name}, ${r.name} (only when)`, false, () => {}));
  }
  for (const d of doc.dialogues ?? []) for (const n of d.nodes ?? []) (n.options ?? []).forEach((o, i) => {
    const at = `${d.name}, ${n.key}, answer ${i + 1}`, th = o.then ?? {};
    if (th.k === 'open_trade') add('trades', th.trade, at, false, () => {});
    if (th.k === 'run_trade_recipe') { add('trades', th.trade, at, false, () => {}); add('recipes', th.recipe, at, false, () => {}, th.trade); }
    if (th.k === 'trigger_event') add('events', th.event, at, false, () => {});
    walkWhen(o.when, (c) => add('variables', c.var, `${at} (shown when)`, false, () => {}));
  });
  for (const e of doc.events ?? []) {
    const t = e.trigger ?? {}, at = `event "${e.name ?? e.key}"`;
    if (t.k === 'enter_area' || t.k === 'interact') add('interactives', t.interactive, `${at} (trigger)`, false, () => {});
    if (t.k === 'npc_talk') add('npcs', t.npc, `${at} (trigger)`, false, () => {});
    if (t.k === 'waypoint_reached') { add('routes', t.route, `${at} (trigger)`, false, () => {}); add('waypoints', t.waypoint, `${at} (trigger)`, false, () => {}, t.route); }
    walkWhen(e.when, (c) => add('variables', c.var, `${at} (only when)`, false, () => {}));
    for (const a of [...(e.then ?? []), ...(e.else ?? [])]) {
      if (a.k === 'set_var') add('variables', a.var, at, false, () => {});
      if (a.k === 'set_state') add('interactives', a.interactive, at, false, () => {});
      if (a.k === 'start_encounter' || a.k === 'end_encounter') add('encounters', a.encounter, at, false, () => {});
      if (a.k === 'start_route') { add('npcs', a.npc, at, false, () => {}); add('routes', a.route, at, false, () => {}); }
      if (a.k === 'stop_route' || a.k === 'spawn_npc' || a.k === 'despawn_npc') add('npcs', a.npc, at, false, () => {});
      if (a.k === 'open_dialogue') add('dialogues', a.dialogue, at, false, () => {});
      if (a.k === 'open_trade') add('trades', a.trade, at, false, () => {});
      if (a.k === 'trigger_event') add('events', a.event, at, false, () => {});
    }
  }
  return out;
}
function walkWhen(c, fn) { if (!c) return; if (c.k === 'var') fn(c); else for (const x of c.of ?? []) walkWhen(x, fn); }

/** Who uses a row: `[{ where, optional }]`. Waypoints and recipes are asked as `collection` 'waypoints' or 'recipes' with `sub` the route or trade. */
export function referrers(doc, coll, key, sub) {
  return refsOf(doc).filter((r) => r.coll === coll && r.key === key && (sub === undefined || r.sub === sub)).map((r) => ({ where: r.where, optional: r.optional }));
}

/** Remove a row. A row something needs is refused, with who needs it; links that may be left out are dropped with it. */
export function removeRow(doc, coll, key) {
  const rows = doc[coll];
  if (!rows?.some((r) => r.key === key)) return refuse('There is no such row.');
  const uses = refsOf(doc).filter((r) => r.coll === coll && r.key === key);
  const hard = uses.filter((u) => !u.optional);
  if (hard.length) return refuse(`Still used by ${[...new Set(hard.map((u) => u.where))].slice(0, 4).join('; ')}.`);
  for (const u of uses) u.clear();
  doc[coll] = rows.filter((r) => r.key !== key);
  if (!doc[coll].length) delete doc[coll];
  return { ok: true, cleared: uses.length };
}

// ── plain words ──
const nameOf = (doc, coll, key) => (doc[coll] ?? []).find((r) => r.key === key)?.name ?? key ?? '?';
export const itemName = (catalogue, s) => `${s.count ?? 1} x ${catalogue?.assets?.find((a) => a.namespace === 'paperdoll-item' && a.template === s.template)?.name ?? `item ${s.template}`}`;

export function conditionText(doc, c, catalogue = null) {
  if (!c) return 'always';
  if (c.k === 'all' || c.k === 'any') return `${c.k === 'all' ? 'all' : 'any'} of (${(c.of ?? []).map((x) => conditionText(doc, x, catalogue)).join(c.k === 'all' ? ' and ' : ' or ')})`;
  if (c.k === 'has_item') return `has ${itemName(catalogue, c.item)}`;
  if (c.k === 'has_gold') return `has ${c.amount} gold`;
  return `${nameOf(doc, 'variables', c.var)} ${{ eq: 'is', ne: 'is not', gt: '>', ge: '>=', lt: '<', le: '<=' }[c.op] ?? c.op} ${String(c.value)}`;
}
export function actionText(doc, a, catalogue = null) {
  switch (a.k) {
    case 'say': return `say "${a.text}"`;
    case 'set_var': return a.add !== undefined ? `add ${a.add} to ${nameOf(doc, 'variables', a.var)}` : `set ${nameOf(doc, 'variables', a.var)} to ${String(a.to)}`;
    case 'set_state': return `${nameOf(doc, 'interactives', a.interactive)} becomes ${a.state}`;
    case 'start_encounter': return `start ${nameOf(doc, 'encounters', a.encounter)}`;
    case 'end_encounter': return `end ${nameOf(doc, 'encounters', a.encounter)}`;
    case 'start_route': return `${nameOf(doc, 'npcs', a.npc)} starts ${nameOf(doc, 'routes', a.route)}`;
    case 'stop_route': return `${nameOf(doc, 'npcs', a.npc)} stops walking`;
    case 'spawn_npc': return `${nameOf(doc, 'npcs', a.npc)} appears`;
    case 'despawn_npc': return `${nameOf(doc, 'npcs', a.npc)} leaves`;
    case 'open_dialogue': return `open dialogue ${nameOf(doc, 'dialogues', a.dialogue)}`;
    case 'open_trade': return `open trade ${nameOf(doc, 'trades', a.trade)}`;
    case 'give_item': return `give ${itemName(catalogue, a.item)}`;
    case 'take_item': return `take ${itemName(catalogue, a.item)}`;
    case 'give_gold': return `give ${a.amount} gold`;
    case 'take_gold': return `take ${a.amount} gold`;
    default: return `${a.delayS ? `after ${a.delayS}s ` : ''}run ${nameOf(doc, 'events', a.event)}`;
  }
}
export const triggerText = (doc, t) => ({
  enter_area: `enters ${nameOf(doc, 'interactives', t.interactive)}`, interact: `uses ${nameOf(doc, 'interactives', t.interactive)}`, npc_talk: `talks to ${nameOf(doc, 'npcs', t.npc)}`,
  waypoint_reached: `${nameOf(doc, 'routes', t.route)} reaches ${t.waypoint}`, chained: 'started by something else',
}[t?.k] ?? '?');

// ── the event graph ──
/**
 * The events and what starts them, as a graph for the editor to draw. Nodes: every event, plus a source node for each
 * thing that starts one (a zone, a person, a route, an encounter, a trade, an answer in a dialogue). Edges run from a
 * source to the event it starts, and from an event to the events its actions run. Columns are the longest way in.
 * @returns {{ nodes: { id: string, kind: 'event' | 'source', label: string, sub: string[], col: number, row: number }[], edges: { from: string, to: string, label: string }[] }}
 */
export function eventGraph(doc, catalogue = null) {
  const nodes = new Map(), edges = [];
  const node = (id, kind, label, sub = []) => { if (!nodes.has(id)) nodes.set(id, { id, kind, label, sub, col: 0, row: 0 }); return id; };
  const evId = (k) => `event:${k}`;
  for (const e of doc.events ?? []) {
    const sub = [e.when ? `only if ${conditionText(doc, e.when, catalogue)}` : '', ...(e.then ?? []).map((a) => actionText(doc, a, catalogue)), ...(e.else ?? []).length ? ['otherwise:', ...(e.else ?? []).map((a) => actionText(doc, a, catalogue))] : []].filter(Boolean);
    node(evId(e.key), 'event', e.name ?? e.key, sub);
  }
  const link = (src, key, label) => { if (typeof key === 'string' && nodes.has(evId(key))) edges.push({ from: src, to: evId(key), label }); };
  for (const e of doc.events ?? []) {
    const t = e.trigger ?? {};
    if (t.k === 'enter_area' || t.k === 'interact') link(node(`obj:${t.interactive}`, 'source', nameOf(doc, 'interactives', t.interactive)), e.key, t.k === 'enter_area' ? 'enters' : 'uses');
    else if (t.k === 'npc_talk') link(node(`npc:${t.npc}`, 'source', nameOf(doc, 'npcs', t.npc)), e.key, 'talks');
    else if (t.k === 'waypoint_reached') link(node(`wp:${t.route}.${t.waypoint}`, 'source', `${nameOf(doc, 'routes', t.route)}: ${t.waypoint}`), e.key, 'reached');
    for (const a of [...(e.then ?? []), ...(e.else ?? [])]) if (a.k === 'trigger_event') link(evId(e.key), a.event, a.delayS ? `after ${a.delayS}s` : 'then');
  }
  for (const r of doc.routes ?? []) for (const w of r.waypoints ?? []) if (w.onArriveEvent) link(node(`wp:${r.key}.${w.key}`, 'source', `${r.name}: ${w.name}`), w.onArriveEvent, 'arrive');
  for (const c of doc.encounters ?? []) { if (c.onStart) link(node(`enc:${c.key}`, 'source', c.name), c.onStart, 'starts'); if (c.onComplete) link(node(`enc:${c.key}`, 'source', c.name), c.onComplete, 'completes'); }
  for (const t of doc.trades ?? []) for (const r of t.recipes ?? []) if (r.onSuccessEvent) link(node(`trade:${t.key}.${r.key}`, 'source', `${t.name}: ${r.name}`), r.onSuccessEvent, 'traded');
  for (const d of doc.dialogues ?? []) for (const n of d.nodes ?? []) for (const o of n.options ?? []) if (o.then?.k === 'trigger_event') link(node(`dlg:${d.key}.${n.key}`, 'source', `${d.name}: "${o.text}"`), o.then.event, 'says');
  // columns: the longest way in from a node nothing leads to (a cycle falls back to column 0)
  const into = new Map();
  for (const ed of edges) (into.get(ed.to) ?? into.set(ed.to, []).get(ed.to)).push(ed.from);
  const memo = new Map(), busy = new Set();
  const col = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (busy.has(id)) return 0;
    busy.add(id);
    const v = Math.max(-1, ...(into.get(id) ?? []).map(col)) + 1;
    busy.delete(id); memo.set(id, v);
    return v;
  };
  const rows = new Map();
  for (const n of nodes.values()) { n.col = col(n.id); n.row = rows.get(n.col) ?? 0; rows.set(n.col, n.row + 1); }
  return { nodes: [...nodes.values()], edges };
}

/** Remove a waypoint, unless an event waits for someone to reach it. */
export function removeWaypoint(doc, routeKey, key) {
  const route = doc.routes?.find((r) => r.key === routeKey);
  if (!route?.waypoints.some((w) => w.key === key)) return refuse('There is no such waypoint.');
  const by = referrers(doc, 'waypoints', key, routeKey);
  if (by.length) return refuse(`Still used by ${by.map((b) => b.where).join('; ')}.`);
  route.waypoints = route.waypoints.filter((w) => w.key !== key);
  return { ok: true };
}

/** Remove a recipe, unless an answer in a dialogue runs it. */
export function removeRecipe(doc, tradeKey, key) {
  const trade = doc.trades?.find((t) => t.key === tradeKey);
  if (!trade?.recipes.some((r) => r.key === key)) return refuse('There is no such recipe.');
  const by = referrers(doc, 'recipes', key, tradeKey);
  if (by.length) return refuse(`Still used by ${by.map((b) => b.where).join('; ')}.`);
  trade.recipes = trade.recipes.filter((r) => r.key !== key);
  return { ok: true };
}
