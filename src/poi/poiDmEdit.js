// @ts-check

// The DM's content, as data the editors change: routes and their waypoints, encounters and their spawns, interactive
// objects, dialogues, trades, variables, and events. The edit functions change the document they are given in place,
// and an editor runs each inside one poiEdit step (the in-game editor's DM panel, src/ui/poi/poiDmPanel.js, and the
// World Builder's DM view). Some refuse a change themselves (a full collection, or a row something still needs);
// poiLawV2.js says whether the rest is allowed, and new rows start as valid as the law lets them (a trade needs a
// reward, a route needs two waypoints). Plain words for events and the event graph live here too (`actionText`,
// `conditionText`, `eventGraph`), through the text core.

import { POI_V2_LIMITS as L, POI_INTERACTIVE_STATES, POI_FOE_RANGES } from './poiLawV2.js';
import { POI_ITEM_CHOICES } from './poiItemChoices.js';
import { reachOf, WALK_NEAR } from './poiDmCore.js';
import { ENEMY_NAMES } from '../characters/enemy/enemyBasics.js';
import { dexEnemyNameText } from '../systems/enemyExpansion/dexNames.js';
import { ITEM_TEMPLATES } from '../systems/item/itemTemplates.js';
import { POTION_RECIPES } from '../systems/potionRecipes.js';
import { GLASS_BOTTLE_TEMPLATE } from '../systems/inventory.js';
import { templateGroups } from '../systems/item/itemLaw.js';
import { tradeableRecord } from '../net/realm/realmTradeLaw.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { ARMOR_MATERIAL } from '../systems/armorMaterials.js';
import { t } from '../systems/textManager.js';
import { freshKey } from './poiScene.js';
import { POI_PART_KEY_RE } from './poiLaw.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const keysOf = (rows) => new Set((rows ?? []).map((r) => r.key));
const list = (doc, name) => (doc[name] ??= []);
const plus = (p, dx = 0, dy = 0, dz = 0) => [r3(p[0] + dx), r3(p[1] + dy), r3(p[2] + dz)];
const refuse = (why) => ({ refused: why });

/** A key for a new row from the name it is given (poiScene.js's: lower case, plain letters, and a number added when it is
 *  taken), passed on for the World Builder's scene.js and the tests. */
export { freshKey };

/** The collections the DM suite edits, with the most each may hold. */
export const DM_COLLECTIONS = Object.freeze({
  routes: L.routes, encounters: L.encounters, interactives: L.interactives, dialogues: L.dialogues, trades: L.trades, variables: L.variables, events: L.events,
});

/** Returns the display name for an enemy ID, from the base game or Daggerfall Enemy Expansion. */
export const foeName = (id) => (id <= 42 ? ENEMY_NAMES[id] : id >= 128 && id <= 146 ? ENEMY_NAMES[43 + id - 128] : dexEnemyNameText(id)) ?? t('poi.dm.edit.foeN', 'Enemy {id}', { id });
/** Every enemy id the law allows, with its name, in order. */
export const FOES = Object.freeze(POI_FOE_RANGES.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => ({ id: a + i, name: foeName(a + i) }))));

const noRoom = (max) => t('poi.dm.edit.noRoom', 'No room: a POI may hold at most {max, number} of these.', { max });
function room(doc, name, wanted) {
  const rows = list(doc, name);
  const max = DM_COLLECTIONS[/** @type {keyof typeof DM_COLLECTIONS} */ (name)];
  if (rows.length >= max) return { refused: noRoom(max) };
  return { key: freshKey(wanted, keysOf(rows)) };
}

// ── items ──
/** @type {{ template: number, name: string, group: string, recipe?: string }[] | null} */
let itemRows = null;
/** @param {string} recipe */
export const potionName = (recipe) => {
  const r = POTION_RECIPES.find((x) => x.name === recipe);
  return r ? t('poi.dm.potionOf', 'Potion of {name}', { name: r.displayName }) : null;
};
export function itemChoices() {
  itemRows ??= [
    ...POI_ITEM_CHOICES.map(([template, group, name]) => ({ template, name, group })),
    ...POTION_RECIPES.map((r) => ({ template: GLASS_BOTTLE_TEMPLATE, recipe: r.name, name: /** @type {string} */ (potionName(r.name)), group: 'Potions' })),
  ].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  return itemRows;
}
export const takeChoices = () => itemChoices().filter((r) => tradeableRecord({ templateIndex: r.template, group: r.group }));
/** @param {{ template: number, recipe?: string }} s */
export const choiceValue = (s) => (s.recipe === undefined ? String(s.template) : `${s.template}:${s.recipe}`);
/** @param {string} v */
export const choiceItem = (v) => {
  const [template, recipe] = String(v).split(':');
  return recipe === undefined ? { template: Number(template) } : { template: Number(template), recipe };
};
/** Returns an item's name from the picker list, or from the classic item table. @param {number} template */
const itemNameOf = (template) => {
  itemNames ??= new Map(itemChoices().filter((r) => r.recipe === undefined).map((r) => [r.template, r.name]));
  return itemNames.get(template) ?? ITEM_TEMPLATES[template]?.name ?? null;
};
/** @type {Map<number, string> | null} */
let itemNames = null;
/** @param {{ template: number, recipe?: string }} s */
export const stackItemName = (s) => (s.recipe !== undefined ? potionName(s.recipe) : itemNameOf(s.template));
/** The groups an item may be made in (a few templates are minted in more than one). @param {number} template */
export const itemGroups = (template) => templateGroups(template).filter((g) => g !== 'Currency');
/** @type {Record<string, () => string>} */
const GROUP_WORD = {
  Drugs: () => t('poi.dm.g.drugs', 'Drugs'), UselessItems1: () => t('poi.dm.g.useless1', 'Odds and ends'), UselessItems2: () => t('poi.dm.g.useless2', 'Other odds and ends'), Armor: () => t('poi.dm.g.armor', 'Armor'),
  Weapons: () => t('poi.dm.g.weapons', 'Weapons'), MensClothing: () => t('poi.dm.g.mensClothing', "Men's clothing"), WomensClothing: () => t('poi.dm.g.womensClothing', "Women's clothing"), Books: () => t('poi.dm.g.books', 'Books'),
  Furniture: () => t('poi.dm.g.furniture', 'Furniture'), ReligiousItems: () => t('poi.dm.g.religious', 'Religious items'), Maps: () => t('poi.dm.g.maps', 'Maps'), Paintings: () => t('poi.dm.g.paintings', 'Paintings'),
  Gems: () => t('poi.dm.g.gems', 'Gems'), PlantIngredients1: () => t('poi.dm.g.plants1', 'Plant ingredients'), PlantIngredients2: () => t('poi.dm.g.plants2', 'More plant ingredients'),
  CreatureIngredients1: () => t('poi.dm.g.creature1', 'Creature ingredients'), CreatureIngredients2: () => t('poi.dm.g.creature2', 'More creature ingredients'), CreatureIngredients3: () => t('poi.dm.g.creature3', 'Rare creature ingredients'),
  MiscellaneousIngredients1: () => t('poi.dm.g.misc1', 'Other ingredients'), MetalIngredients: () => t('poi.dm.g.metal', 'Metals'), MiscellaneousIngredients2: () => t('poi.dm.g.misc2', 'More ingredients'),
  Potions: () => t('poi.dm.g.potions', 'Potions'), Transportation: () => t('poi.dm.g.transport', 'Transport'), Deeds: () => t('poi.dm.g.deeds', 'Deeds'), Jewellery: () => t('poi.dm.g.jewelry', 'Jewelry'), MiscItems: () => t('poi.dm.g.misc', 'Other items'), QuestItems: () => t('poi.dm.g.quest', 'Quest items'),
};
/** An item group's name as the builder reads it. @param {string} g */
export const groupWord = (g) => GROUP_WORD[g]?.() ?? g;
/** @type {Record<string, () => string>} */
const MATERIAL_WORD = {
  Leather: () => t('poi.dm.material.leather', 'Leather'), Chain: () => t('poi.dm.material.chain', 'Chain'),
  Iron: () => t('poi.dm.material.iron', 'Iron'), Steel: () => t('poi.dm.material.steel', 'Steel'), Silver: () => t('poi.dm.material.silver', 'Silver'),
  Elven: () => t('poi.dm.material.elven', 'Elven'), Dwarven: () => t('poi.dm.material.dwarven', 'Dwarven'), Mithril: () => t('poi.dm.material.mithril', 'Mithril'),
  Adamantium: () => t('poi.dm.material.adamantium', 'Adamantium'), Ebony: () => t('poi.dm.material.ebony', 'Ebony'), Orcish: () => t('poi.dm.material.orcish', 'Orcish'),
  Daedric: () => t('poi.dm.material.daedric', 'Daedric'),
};
/**
 * The materials an item of a group may be made of, as `[value, word]`: weapons and armor only (the law refuses a
 * material on anything else, and the classic second chain is not offered, as the trade law does not take it).
 * @param {string} group
 */
export function materialChoices(group) {
  const table = group === 'Weapons' ? WEAPON_MATERIALS : group === 'Armor' ? ARMOR_MATERIAL : null;
  if (!table) return [];
  return Object.entries(table).filter(([k, v]) => v >= 0 && k !== 'Chain2').map(([k, v]) => /** @type {[number, string]} */ ([v, MATERIAL_WORD[k]?.() ?? k]));
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
/**
 * Creates a per-character persistent text variable starting at the object's initial state, and sets the object to take
 * its state from that variable. An object's state is a word (open, locked, active), so only a text variable holds one.
 * @param {any} doc @param {string} objectKey
 */
export function addStateVariable(doc, objectKey) {
  const o = doc.interactives?.find((x) => x.key === objectKey);
  if (!o) return refuse(t('poi.dm.edit.noSuchRow', 'There is no such row.'));
  const r = addVariable(doc, t('poi.dm.edit.stateOf', '{name} state', { name: o.name }), 'string', 'character', `${o.key}-state`);
  if (r.refused) return r;
  r.row.initial = o.state;
  o.stateVar = r.row.key;
  return r;
}
/**
 * Renames a variable's key to a valid unused key (1 to 32 of a-z, 0-9, hyphen, and underscore, starting with a letter
 * or digit) and updates every reference to it across conditions, set actions, and objects that take their state from
 * it. Returns `{ ok, key, moved }` (where `moved` is the number of references updated) or a refusal.
 * @param {any} doc @param {string} from @param {string} to
 */
export function renameVariableKey(doc, from, to) {
  const v = doc.variables?.find((x) => x.key === from);
  if (!v) return refuse(t('poi.dm.edit.noSuchRow', 'There is no such row.'));
  const k = String(to ?? '').trim();
  if (k === from) return { ok: true, key: k, moved: 0 };
  const why = keyProblem(k, keysOf(doc.variables));
  if (why) return refuse(why);
  const uses = refsOf(doc).filter((r) => r.coll === 'variables' && r.key === from);
  for (const u of uses) u.set?.(k);
  v.key = k;
  return { ok: true, key: k, moved: uses.length };
}

// ── routes ──
export function addRoute(doc, name, at = [0, 0, 0]) {
  const r = room(doc, 'routes', name); if (r.refused) return r;
  const route = { key: r.key, name: String(name).slice(0, 48), mode: 'loop', waypoints: [] };
  doc.routes.push(route);
  addWaypoint(route, at, t('poi.dm.edit.wpStart', 'Start')); addWaypoint(route, plus(at, 6), t('poi.dm.edit.wpStop', 'Stop'));
  return { row: route };
}
export function addWaypoint(route, p, name = t('poi.dm.edit.wpN', 'Waypoint {n}', { n: route.waypoints.length + 1 }), at = route.waypoints.length) {
  if (route.waypoints.length >= L.waypoints) return refuse(t('poi.dm.edit.maxWaypoints', 'A route holds at most {max, number} waypoints.', { max: L.waypoints }));
  const key = freshKey(name, keysOf(route.waypoints));
  const w = { key, name: String(name).slice(0, 48), t: p.map(r3), radius: 1.5, waitS: 0 };
  route.waypoints.splice(Math.max(0, Math.min(route.waypoints.length, at)), 0, w);
  return { row: w };
}
export function moveWaypoint(route, key, p) { const w = route.waypoints.find((x) => x.key === key); if (!w) return false; w.t = p.map(r3); return true; }
/** Move a waypoint one place earlier (-1) or later (+1) in the order. */
export function shiftWaypoint(route, key, dir) {
  const i = route.waypoints.findIndex((x) => x.key === key), j = i + dir;
  if (i < 0 || j < 0 || j >= route.waypoints.length) return false;
  [route.waypoints[i], route.waypoints[j]] = [route.waypoints[j], route.waypoints[i]];
  return true;
}
export function loopStopsTwice(route) {
  const w = route?.waypoints ?? [];
  if (route?.mode !== 'loop' || w.length < 3) return false;
  let p = w[0].t;
  for (let k = 1; k <= 2 * w.length; k++) {
    const q = w[k % w.length].t, r = reachOf(w[k % w.length]);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (d - r > WALK_NEAR) p = q.map((x, i) => x + (p[i] - x) * (r / d));
    else if (k % w.length === 0) return true;
  }
  return false;
}
/** Wait the same time at every waypoint. */
export function setWaitAll(route, waitS) { for (const w of route.waypoints) w.waitS = Math.max(0, Math.min(3600, Math.round(waitS))); return route.waypoints.length; }

// ── encounters ──
export function addEncounter(doc, name, center = [0, 0, 0]) {
  const r = room(doc, 'encounters', name); if (r.refused) return r;
  const e = { key: r.key, name: String(name).slice(0, 48), center: center.map(r3), radius: 20, aggression: 'hostile', respawn: 'never', spawns: [], complete: { rule: 'all_dead' } };
  doc.encounters.push(e);
  addSpawn(e, 136, 1, center);
  return { row: e };
}
export function addSpawn(enc, foe, count, at, wanted = foeName(foe)) {
  if (enc.spawns.length >= L.spawns) return refuse(t('poi.dm.edit.maxSpawns', 'An encounter holds at most {max, number} spawn points.', { max: L.spawns }));
  const s = { key: freshKey(wanted, keysOf(enc.spawns)), foe, count, at: at.map(r3), spread: 2 };
  enc.spawns.push(s);
  return { row: s };
}
/** @param {any} enc @param {boolean} on */
export function setPacifiable(enc, on) {
  if (on) delete enc.pacifiable; else enc.pacifiable = false;
}
/** The rule that ends an encounter. A leader rule names one spawn point; a timer rule a number of seconds. */
export function setComplete(enc, rule, extra) {
  if (rule === 'all_dead') enc.complete = { rule };
  else if (rule === 'leader_dead') enc.complete = { rule, leader: extra ?? enc.spawns[0]?.key ?? '' };
  else enc.complete = { rule, seconds: Number.isFinite(extra) ? extra : 60 };
}
/** Returns why a key is refused (invalid format or already used in this list), or null. */
function keyProblem(k, taken) {
  if (!POI_PART_KEY_RE.test(k)) return t('poi.dm.edit.badKey', 'A key is up to 32 lowercase letters, digits, hyphens, and underscores, and starts with a letter or digit.');
  if (taken.has(k)) return t('poi.dm.edit.keyTakenHere', 'Another row here has the key {key}.', { key: k });
  return null;
}
/**
 * Renames a spawn point's key to a valid key unused in its encounter, updating the encounter's leader rule if it
 * named the old key. Returns `{ ok, key }` or a refusal.
 * @param {any} enc @param {string} from @param {string} to
 */
export function renameSpawnKey(enc, from, to) {
  const s = enc?.spawns?.find((x) => x.key === from);
  if (!s) return refuse(t('poi.dm.edit.noSuchRow', 'There is no such row.'));
  const k = String(to ?? '').trim();
  if (k === from) return { ok: true, key: k };
  const why = keyProblem(k, keysOf(enc.spawns));
  if (why) return refuse(why);
  s.key = k;
  if (enc.complete?.leader === from) enc.complete.leader = k;
  return { ok: true, key: k };
}
/**
 * Sets a spawn point's enemy. If its key still matches the default derived from the old enemy's name (such as `rogue`
 * or `rogue-2`), renames it to match the new enemy; a custom key stays as set.
 * @param {any} enc @param {string} key @param {number} foe
 */
export function setSpawnFoe(enc, key, foe) {
  const s = enc?.spawns?.find((x) => x.key === key);
  if (!s) return refuse(t('poi.dm.edit.noSuchRow', 'There is no such row.'));
  const was = freshKey(foeName(s.foe), new Set());
  s.foe = foe;
  if (s.key === was || (s.key.startsWith(`${was}-`) && /^\d+$/.test(s.key.slice(was.length + 1)))) {
    renameSpawnKey(enc, s.key, freshKey(foeName(foe), keysOf(enc.spawns.filter((x) => x !== s))));
  }
  return { ok: true, key: s.key };
}
export const foeCount = (enc) => enc.spawns.reduce((n, s) => n + (Number.isInteger(s.count) ? s.count : 0), 0);
/** Removes a spawn point (refused when the encounter has only one left); a leader rule that named it switches to the
 *  first remaining spawn point. */
export function removeSpawn(enc, key) {
  if (enc.spawns.length < 2 || !enc.spawns.some((s) => s.key === key)) return false;
  enc.spawns = enc.spawns.filter((s) => s.key !== key);
  if (enc.complete?.rule === 'leader_dead' && enc.complete.leader === key) enc.complete.leader = enc.spawns[0]?.key ?? '';
  return true;
}

/** Returns whether a variable is persistent across visits (for each character, or for everyone). */
const keptVar = (v) => v?.scope === 'character' || v?.scope === 'poi_global';
/** Returns the branches an event can take (`['then']`, or `['then', 'else']` when it has a condition). */
const endBranches = (ev) => (ev?.when ? ['then', 'else'] : ['then']);
/** Returns whether an event sets the given variable to true in every branch it can take. */
const setsTrue = (ev, key) => endBranches(ev).every((b) => (ev[b] ?? []).some((a) => a.k === 'set_var' && a.var === key && a.to === true));
/** Returns the start event that keepWon made for an encounter (ending it while a variable is true), or null. */
export const wonStartEvent = (doc, enc) => {
  const ev = doc.events?.find((e) => e.key === enc?.onStart);
  const c = ev?.when;
  return ev && c?.k === 'var' && c.op === 'eq' && c.value === true && (ev.then ?? []).some((a) => a.k === 'end_encounter' && a.encounter === enc.key) ? ev : null;
};
/**
 * Returns the persistent true-or-false variable that keeps an encounter won across visits, or null. The encounter's
 * start event ends it at once while that variable is true, so no enemy spawns, and its end event sets the variable
 * true in every branch.
 * @param {any} doc @param {any} enc
 */
export function wonKeeper(doc, enc) {
  const ev = wonStartEvent(doc, enc);
  if (!ev) return null;
  const v = doc.variables?.find((x) => x.key === ev.when.var);
  const end = doc.events?.find((e) => e.key === enc.onComplete);
  return v && v.type === 'boolean' && keptVar(v) && end && setsTrue(end, v.key) ? v : null;
}
/**
 * Keeps a won encounter won across visits. An encounter's runtime state lasts only while its POI stays loaded, so a
 * persistent true-or-false variable records the win: the end event sets it true in each branch (reusing one it already
 * sets true, or creating a per-character variable), and a new start event ends the encounter at once while the
 * variable is true or runs the previous start event otherwise.
 * @param {any} doc @param {string} encKey
 */
export function keepWon(doc, encKey) {
  const e = doc.encounters?.find((x) => x.key === encKey);
  if (!e) return refuse(t('poi.dm.edit.noSuchRow', 'There is no such row.'));
  if (wonKeeper(doc, e)) return { ok: true };
  const events = list(doc, 'events');
  if (events.length + (e.onComplete ? 1 : 2) > L.events) return refuse(noRoom(L.events));
  let end = events.find((x) => x.key === e.onComplete) ?? null;
  // Reuse a persistent true-or-false variable the end event already sets true, or create one for it.
  let v = (doc.variables ?? []).find((x) => x.type === 'boolean' && keptVar(x) && end && (end.then ?? []).some((a) => a.k === 'set_var' && a.var === x.key && a.to === true)) ?? null;
  const missing = end ? endBranches(end).filter((b) => !v || !(end[b] ?? []).some((a) => a.k === 'set_var' && a.var === v.key && a.to === true)) : ['then'];
  if (end && (end.then?.length ?? 0) + (end.else?.length ?? 0) + missing.length > L.actions) return refuse(t('poi.dm.edit.fullEvent', 'Its end event already holds {max, number} actions.', { max: L.actions }));
  if (!v) {
    const r = addVariable(doc, t('poi.dm.edit.wonName', '{name} won', { name: e.name }), 'boolean', 'character', `${e.key}-won`);
    if (r.refused) return r;
    v = r.row;
  }
  if (!end) {
    const made = addEvent(doc, t('poi.dm.edit.wonName', '{name} won', { name: e.name }));
    if (made.refused) return made;
    end = made.row;
    end.then = [];
    e.onComplete = end.key;
  }
  for (const b of missing) (end[b] ??= []).push({ k: 'set_var', var: v.key, to: true });
  const start = addEvent(doc, t('poi.dm.edit.wonAlready', '{name} already won', { name: e.name }));
  if (start.refused) return start;
  start.row.when = { k: 'var', var: v.key, op: 'eq', value: true };
  start.row.then = [{ k: 'end_encounter', encounter: e.key }];
  if (e.onStart) start.row.else = [{ k: 'trigger_event', event: e.onStart, delayS: 0 }];
  e.onStart = start.row.key;
  return { ok: true, row: v };
}
/**
 * Removes the start event that keepWon added to an encounter and restores the previous start event, if any. The
 * variable and the end event's set action are left in place in case the builder uses them elsewhere.
 * @param {any} doc @param {string} encKey
 */
export function unkeepWon(doc, encKey) {
  const e = doc.encounters?.find((x) => x.key === encKey);
  const ev = e ? wonStartEvent(doc, e) : null;
  if (!ev) return refuse(t('poi.dm.edit.noSuchRow', 'There is no such row.'));
  return removeRow(doc, 'events', ev.key);
}
/** Returns the prior start event that a keepWon start event chains to, or undefined. @param {any} ev */
const wonStartsInstead = (ev) => (ev?.else?.length === 1 && ev.else[0].k === 'trigger_event' ? ev.else[0].event : undefined);

// ── interactive objects ──
export const DEFAULT_STATE = Object.freeze({ chest: 'closed', door: 'closed', switch: 'inactive', quest_object: 'active', trigger: 'active' });
export function addInteractive(doc, kind, name, p = [0, 0, 0]) {
  const r = room(doc, 'interactives', name); if (r.refused) return r;
  const o = { key: r.key, name: String(name).slice(0, 48), kind, appearance: { k: 'none' }, t: p.map(r3), yaw: 0, radius: kind === 'trigger' ? 8 : 2, state: /** @type {any} */ (DEFAULT_STATE)[kind] };
  doc.interactives.push(o);
  return { row: o };
}
/** Change what an object is: its state goes to the first one the new kind has, if the old one does not fit. */
export function setInteractiveKind(o, kind) { o.kind = kind; if (!/** @type {any} */ (POI_INTERACTIVE_STATES)[kind].includes(o.state)) o.state = /** @type {any} */ (DEFAULT_STATE)[kind]; }

// ── dialogues ──
export function addDialogue(doc, name) {
  const r = room(doc, 'dialogues', name); if (r.refused) return r;
  const d = { key: r.key, name: String(name).slice(0, 48), start: 'root', nodes: [{ key: 'root', say: t('poi.dm.edit.wellMet', 'Well met.'), options: [{ text: t('poi.dm.edit.goodbye', 'Goodbye.'), then: { k: 'close' } }] }] };
  doc.dialogues.push(d);
  return { row: d };
}
export function addNode(dlg, say = t('poi.dm.edit.goOn', 'Go on.')) {
  if (dlg.nodes.length >= L.nodes) return refuse(t('poi.dm.edit.maxNodes', 'A dialogue holds at most {max, number} lines.', { max: L.nodes }));
  const n = { key: freshKey('node', keysOf(dlg.nodes)), say, options: [{ text: t('poi.dm.edit.goodbye', 'Goodbye.'), then: { k: 'close' } }] };
  dlg.nodes.push(n);
  return { row: n };
}
export function addNodeFrom(dlg, nodeKey, i) {
  const o = dlg.nodes.find((n) => n.key === nodeKey)?.options?.[i];
  if (!o) return refuse(t('poi.dm.edit.noSuchAnswer', 'There is no such answer.'));
  const r = addNode(dlg);
  if (r.refused) return r;
  o.then = { k: 'goto', node: r.row.key };
  return r;
}
export function addOption(node, text = t('poi.dm.edit.tellMore', 'Tell me more.'), then = { k: 'close' }) {
  if (node.options.length >= L.options) return refuse(t('poi.dm.edit.maxOptions', 'A line holds at most {max, number} answers.', { max: L.options }));
  const o = { text, then };
  node.options.push(o);
  return { row: o };
}
/** Who points at a node: the answers (and the dialogue's start) that lead to it. */
export function nodeReferrers(dlg, key) {
  const out = [];
  if (dlg.start === key) out.push(t('poi.dm.edit.refStart', 'the start of the dialogue'));
  for (const n of dlg.nodes) n.options.forEach((o, i) => { if (o.then?.k === 'goto' && o.then.node === key) out.push(t('poi.dm.edit.refAnswer', 'answer {n} of "{line}"', { n: i + 1, line: n.key })); });
  return out;
}
const stillUsed = (by) => t('poi.dm.edit.stillUsed', 'Still used by {list}.', { list: by.join('; ') });
export function removeNode(dlg, key) {
  const by = nodeReferrers(dlg, key);
  if (by.length) return refuse(stillUsed(by));
  dlg.nodes = dlg.nodes.filter((n) => n.key !== key);
  return { ok: true };
}
/** What an answer does, with the defaults a fresh one needs. */
export function thenOf(doc, dlg, kind) {
  if (kind === 'goto') return { k: 'goto', node: dlg.nodes[0]?.key ?? '' };
  if (kind === 'open_trade') return { k: 'open_trade', trade: doc.trades?.[0]?.key ?? '' };
  if (kind === 'run_trade_recipe') { const tr = doc.trades?.[0]; return { k: 'run_trade_recipe', trade: tr?.key ?? '', recipe: tr?.recipes?.[0]?.key ?? '' }; }
  if (kind === 'trigger_event') return { k: 'trigger_event', event: doc.events?.[0]?.key ?? '' };
  return { k: 'close' };
}

// ── trades ──
export function addTrade(doc, name) {
  const r = room(doc, 'trades', name); if (r.refused) return r;
  const tr = { key: r.key, name: String(name).slice(0, 48), recipes: [] };
  doc.trades.push(tr);
  addRecipe(tr, t('poi.dm.edit.trade', 'Trade'));
  return { row: tr };
}
/** A new recipe asks 10 gold for one iron: a trade the law accepts, for the author to change. */
export function addRecipe(trade, name = t('poi.dm.edit.trade', 'Trade')) {
  if (trade.recipes.length >= L.recipes) return refuse(t('poi.dm.edit.maxRecipes', 'A trade holds at most {max, number} recipes.', { max: L.recipes }));
  const rec = { key: freshKey(name, keysOf(trade.recipes)), name: String(name).slice(0, 48), requireItems: [], requireGold: 10, rewardItems: [{ template: 71, count: 1 }], rewardGold: 0, limitMode: 'unlimited' };
  trade.recipes.push(rec);
  return { row: rec };
}
/** Set how often a recipe may run. Stock needs a number; the other modes drop it. */
export function setLimit(rec, mode, maxStock = 10) { rec.limitMode = mode; if (mode === 'global_stock') rec.maxStock = maxStock; else delete rec.maxStock; }
export function addStack(rec, side, template, count = 1) {
  const rows = rec[side];
  if (rows.length >= L.stacks) return refuse(t('poi.dm.edit.maxStacks', 'A recipe holds at most {max, number} item stacks on one side.', { max: L.stacks }));
  const s = { template, count };
  rows.push(s);
  return { row: s };
}
/**
 * @param {any} s @param {{ template?: number, recipe?: string, group?: string | null, material?: number | null }} to
 */
export function setStackItem(s, to) {
  if (to.template !== undefined) {
    s.template = to.template;
    if (to.recipe === undefined) delete s.recipe; else s.recipe = to.recipe;
  }
  if (s.template !== GLASS_BOTTLE_TEMPLATE) delete s.recipe;
  const groups = itemGroups(s.template);
  const group = to.group !== undefined ? to.group : s.group;
  if (group && groups.length > 1 && groups.includes(group)) s.group = group; else delete s.group;
  const mats = materialChoices(s.group ?? groups[0] ?? '');
  const material = to.material !== undefined ? to.material : s.material;
  if (material != null && mats.some(([v]) => v === material)) s.material = material; else delete s.material;
}

// ── events ──
export const TRIGGERS = Object.freeze({
  enter_area: t('poi.dm.trigger.enterArea', 'A player enters a zone'), interact: t('poi.dm.trigger.interact', 'A player uses an object'), npc_talk: t('poi.dm.trigger.npcTalk', 'A player talks to a person'),
  waypoint_reached: t('poi.dm.trigger.waypoint', 'A person reaches a waypoint'), chained: t('poi.dm.trigger.chained', 'Another event or link starts it'),
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
  const e = { key: r.key, name: String(name).slice(0, 48), trigger: triggerOf(doc, triggerKind), then: [{ k: 'say', text: t('poi.dm.edit.happens', 'Something happens.') }] };
  doc.events.push(e);
  return { row: e };
}
/** What each action asks for, so a fresh one is shaped right. */
export function actionOf(doc, kind) {
  const first = (name) => doc[name]?.[0]?.key ?? '';
  switch (kind) {
    case 'say': return { k: kind, text: t('poi.dm.edit.hello', 'Hello.') };
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
  if ((ev.then?.length ?? 0) + (ev.else?.length ?? 0) >= L.actions) return refuse(t('poi.dm.edit.maxActions', 'An event holds at most {max, number} actions in all.', { max: L.actions }));
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
 * Lists every place where the document names a DM row by key, each as `{ coll, key, where, optional, clear }`. An
 * `optional` one may be left out, and `clear()` drops it; the rest belong to an action, trigger, answer, or condition
 * that needs them. A variable's reference also has `set(key)`, which points it at another variable.
 */
export function refsOf(doc) {
  /** @type {{ coll: string, key: string, sub?: string, where: string, optional: boolean, clear: () => void, set?: (key: string) => void }[]} */
  const out = [];
  const add = (coll, key, where, optional, clear, sub, set) => { if (typeof key === 'string') out.push({ coll, key, where, optional, clear, ...(sub ? { sub } : {}), ...(set ? { set } : {}) }); };
  /** Returns a setter that updates field `f` on `o` to a new variable key. @param {any} o @param {string} f */
  const setField = (o, f) => (/** @type {string} */ k) => { o[f] = k; };
  const dropField = (o, f) => () => { delete o[f]; };
  const none = () => {};
  const FIELD = { route: t('poi.dm.ref.route', 'route'), dialogue: t('poi.dm.ref.dialogue', 'dialogue'), trade: t('poi.dm.ref.trade', 'trade') };
  for (const n of doc.npcs ?? []) {
    for (const [f, coll] of [['route', 'routes'], ['dialogue', 'dialogues'], ['trade', 'trades']]) add(coll, n[f], `${n.name} (${FIELD[f]})`, true, dropField(n, f));
    walkWhen(n.showWhen, (c) => add('variables', c.var, t('poi.dm.ref.shownWhen', '{name} (shown when)', { name: n.name }), false, none, undefined, setField(c, 'var')));
  }
  for (const r of doc.routes ?? []) for (const w of r.waypoints ?? []) add('events', w.onArriveEvent, t('poi.dm.ref.onArrive', '{route}, {waypoint} (on arrival)', { route: r.name, waypoint: w.name }), true, dropField(w, 'onArriveEvent'));
  for (const e of doc.encounters ?? []) {
    add('events', e.onStart, t('poi.dm.ref.onStart', '{name} (on start)', { name: e.name }), true, dropField(e, 'onStart'));
    add('events', e.onComplete, t('poi.dm.ref.onComplete', '{name} (on end)', { name: e.name }), true, dropField(e, 'onComplete'));
    for (const s of e.spawns ?? []) add('routes', s.route, t('poi.dm.ref.patrol', '{name}, {spawn} (patrol)', { name: e.name, spawn: s.key }), true, dropField(s, 'route'));
  }
  for (const o of doc.interactives ?? []) add('variables', o.stateVar, t('poi.dm.ref.keptIn', '{name} (state saved in)', { name: o.name }), true, dropField(o, 'stateVar'), undefined, setField(o, 'stateVar'));
  for (const tr of doc.trades ?? []) for (const r of tr.recipes ?? []) {
    add('events', r.onSuccessEvent, t('poi.dm.ref.onSuccess', '{trade}, {recipe} (on success)', { trade: tr.name, recipe: r.name }), true, dropField(r, 'onSuccessEvent'));
    walkWhen(r.when, (c) => add('variables', c.var, t('poi.dm.ref.onlyWhen', '{trade}, {recipe} (only when)', { trade: tr.name, recipe: r.name }), false, none, undefined, setField(c, 'var')));
  }
  for (const d of doc.dialogues ?? []) for (const n of d.nodes ?? []) (n.options ?? []).forEach((o, i) => {
    const at = t('poi.dm.ref.answer', '{dialogue}, {line}, answer {n}', { dialogue: d.name, line: n.key, n: i + 1 }), th = o.then ?? {};
    if (th.k === 'open_trade') add('trades', th.trade, at, false, none);
    if (th.k === 'run_trade_recipe') { add('trades', th.trade, at, false, none); add('recipes', th.recipe, at, false, none, th.trade); }
    if (th.k === 'trigger_event') add('events', th.event, at, false, none);
    walkWhen(o.when, (c) => add('variables', c.var, t('poi.dm.ref.answerWhen', '{at} (shown when)', { at }), false, none, undefined, setField(c, 'var')));
  });
  for (const e of doc.events ?? []) {
    const tg = e.trigger ?? {}, at = t('poi.dm.ref.event', 'event "{name}"', { name: e.name ?? e.key });
    const trig = t('poi.dm.ref.trigger', '{at} (trigger)', { at });
    if (tg.k === 'enter_area' || tg.k === 'interact') add('interactives', tg.interactive, trig, false, none);
    if (tg.k === 'npc_talk') add('npcs', tg.npc, trig, false, none);
    if (tg.k === 'waypoint_reached') { add('routes', tg.route, trig, false, none); add('waypoints', tg.waypoint, trig, false, none, tg.route); }
    walkWhen(e.when, (c) => add('variables', c.var, t('poi.dm.ref.eventWhen', '{at} (only when)', { at }), false, none, undefined, setField(c, 'var')));
    for (const a of [...(e.then ?? []), ...(e.else ?? [])]) {
      if (a.k === 'set_var') add('variables', a.var, at, false, none, undefined, setField(a, 'var'));
      if (a.k === 'set_state') add('interactives', a.interactive, at, false, none);
      if (a.k === 'start_encounter' || a.k === 'end_encounter') add('encounters', a.encounter, at, false, none);
      if (a.k === 'start_route') { add('npcs', a.npc, at, false, none); add('routes', a.route, at, false, none); }
      if (a.k === 'stop_route' || a.k === 'spawn_npc' || a.k === 'despawn_npc') add('npcs', a.npc, at, false, none);
      if (a.k === 'open_dialogue') add('dialogues', a.dialogue, at, false, none);
      if (a.k === 'open_trade') add('trades', a.trade, at, false, none);
      if (a.k === 'trigger_event') add('events', a.event, at, false, none);
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
  if (!rows?.some((r) => r.key === key)) return refuse(t('poi.dm.edit.noSuchRow', 'There is no such row.'));
  const uses = refsOf(doc).filter((r) => r.coll === coll && r.key === key);
  const hard = uses.filter((u) => !u.optional);
  if (hard.length) return refuse(stillUsed([...new Set(hard.map((u) => u.where))].slice(0, 4)));
  // When removing a start event made by keepWon, restore the prior start event it chained to.
  const relink = coll === 'events' ? (doc.encounters ?? []).filter((e) => e.onStart === key && wonStartEvent(doc, e)) : [];
  const instead = relink.length ? wonStartsInstead(rows.find((r) => r.key === key)) : undefined;
  for (const u of uses) u.clear();
  if (instead) for (const e of relink) e.onStart = instead;
  doc[coll] = rows.filter((r) => r.key !== key);
  if (!doc[coll].length) delete doc[coll];
  return { ok: true, cleared: uses.length };
}

// ── plain words ──
const nameOf = (doc, coll, key) => (doc[coll] ?? []).find((r) => r.key === key)?.name ?? key ?? '?';
/** Returns a waypoint's display name for the given route and waypoint key, falling back to the key. */
export const waypointName = (doc, route, key) => (doc.routes ?? []).find((r) => r.key === route)?.waypoints?.find((w) => w.key === key)?.name ?? key ?? '?';
/**
 * A stack as words: "2 x Iron". `names` is the World Builder's asset catalog, or null for the game's own item names.
 * @param {any} names @param {any} s
 */
export const itemName = (names, s) => {
  const known = names && s.recipe === undefined ? names.assets?.find((a) => a.namespace === 'paperdoll-item' && a.template === s.template)?.name : stackItemName(s);
  return t('poi.dm.text.stack', '{count, number} x {item}', { count: s.count ?? 1, item: known ?? t('poi.dm.text.itemN', 'item {n}', { n: s.template }) });
};
const OP_WORD = { eq: () => t('poi.dm.op.eq', 'is'), ne: () => t('poi.dm.op.ne', 'is not'), gt: () => '>', ge: () => '>=', lt: () => '<', le: () => '<=' };
/** A comparison's word ("is", "is not", ">"). @param {string} op */
export const opWord = (op) => /** @type {any} */ (OP_WORD)[op]?.() ?? op;

export function conditionText(doc, c, names = null) {
  if (!c) return t('poi.dm.text.always', 'always');
  if (c.k === 'all') return t('poi.dm.text.all', 'all of ({list})', { list: (c.of ?? []).map((x) => conditionText(doc, x, names)).join(t('poi.dm.text.and', ' and ')) });
  if (c.k === 'any') return t('poi.dm.text.any', 'any of ({list})', { list: (c.of ?? []).map((x) => conditionText(doc, x, names)).join(t('poi.dm.text.or', ' or ')) });
  if (c.k === 'has_item') return t('poi.dm.text.hasItem', 'has {stack}', { stack: itemName(names, c.item) });
  if (c.k === 'has_gold') return t('poi.dm.text.hasGold', 'has {amount, number} gold', { amount: c.amount });
  return `${nameOf(doc, 'variables', c.var)} ${opWord(c.op)} ${String(c.value)}`;
}
export function actionText(doc, a, names = null) {
  switch (a.k) {
    case 'say': return t('poi.dm.text.say', 'say "{text}"', { text: a.text });
    case 'set_var': return a.add !== undefined ? t('poi.dm.text.addVar', 'add {n} to {var}', { n: a.add, var: nameOf(doc, 'variables', a.var) }) : t('poi.dm.text.setVar', 'set {var} to {value}', { var: nameOf(doc, 'variables', a.var), value: String(a.to) });
    case 'set_state': return t('poi.dm.text.setState', '{name} becomes {state}', { name: nameOf(doc, 'interactives', a.interactive), state: stateWord(a.state, kindOf(doc, a.interactive)) });
    case 'start_encounter': return t('poi.dm.text.startEnc', 'start {name}', { name: nameOf(doc, 'encounters', a.encounter) });
    case 'end_encounter': return t('poi.dm.text.endEnc', 'end {name}', { name: nameOf(doc, 'encounters', a.encounter) });
    case 'start_route': return t('poi.dm.text.startRoute', '{npc} starts {route}', { npc: nameOf(doc, 'npcs', a.npc), route: nameOf(doc, 'routes', a.route) });
    case 'stop_route': return t('poi.dm.text.stopRoute', '{npc} stops walking', { npc: nameOf(doc, 'npcs', a.npc) });
    case 'spawn_npc': return t('poi.dm.text.spawnNpc', '{npc} appears', { npc: nameOf(doc, 'npcs', a.npc) });
    case 'despawn_npc': return t('poi.dm.text.despawnNpc', '{npc} leaves', { npc: nameOf(doc, 'npcs', a.npc) });
    case 'open_dialogue': return t('poi.dm.text.openDialogue', 'open dialogue {name}', { name: nameOf(doc, 'dialogues', a.dialogue) });
    case 'open_trade': return t('poi.dm.text.openTrade', 'open trade {name}', { name: nameOf(doc, 'trades', a.trade) });
    case 'give_item': return t('poi.dm.text.giveItem', 'give {stack}', { stack: itemName(names, a.item) });
    case 'take_item': return t('poi.dm.text.takeItem', 'take {stack}', { stack: itemName(names, a.item) });
    case 'give_gold': return t('poi.dm.text.giveGold', 'give {amount, number} gold', { amount: a.amount });
    case 'take_gold': return t('poi.dm.text.takeGold', 'take {amount, number} gold', { amount: a.amount });
    default: return a.delayS ? t('poi.dm.text.runAfter', 'after {s, number} s, run {name}', { s: a.delayS, name: nameOf(doc, 'events', a.event) }) : t('poi.dm.text.run', 'run {name}', { name: nameOf(doc, 'events', a.event) });
  }
}
export const triggerText = (doc, tg) => {
  switch (tg?.k) {
    case 'enter_area': return t('poi.dm.text.enters', 'enters {name}', { name: nameOf(doc, 'interactives', tg.interactive) });
    case 'interact': return t('poi.dm.text.uses', 'uses {name}', { name: nameOf(doc, 'interactives', tg.interactive) });
    case 'npc_talk': return t('poi.dm.text.talksTo', 'talks to {name}', { name: nameOf(doc, 'npcs', tg.npc) });
    case 'waypoint_reached': return t('poi.dm.text.reaches', '{route} reaches {waypoint}', { route: nameOf(doc, 'routes', tg.route), waypoint: waypointName(doc, tg.route, tg.waypoint) });
    case 'chained': return t('poi.dm.text.chained', 'started by something else');
    default: return '?';
  }
};
/** @type {Record<string, () => string>} */
const STATE_WORD = {
  closed: () => t('poi.dm.state.closed', 'closed'), open: () => t('poi.dm.state.open', 'open'), locked: () => t('poi.dm.state.locked', 'locked'),
  active: () => t('poi.dm.state.active', 'active'), inactive: () => t('poi.dm.state.inactive', 'inactive'),
};
/** An object's state as a word; a switch's two are its off and on positions. @param {string} s @param {string} [kind] */
export const stateWord = (s, kind) => (kind === 'switch' && s === 'inactive' ? t('poi.dm.state.off', 'off') : kind === 'switch' && s === 'active' ? t('poi.dm.state.on', 'on') : STATE_WORD[s]?.() ?? s);
const kindOf = (doc, key) => (doc.interactives ?? []).find((o) => o.key === key)?.kind;

// ── the event graph ──
/** @param {any} doc @param {any} ev */
export function asksAway(doc, ev) {
  const takes = ['then', 'else'].some((b) => (ev?.[b] ?? []).some((/** @type {any} */ a) => a.k === 'take_item' || a.k === 'take_gold'));
  if (!takes) return false;
  if (ev.trigger?.k === 'waypoint_reached') return true;
  const named = (/** @type {any} */ k) => k === ev.key;
  if ((doc.routes ?? []).some((/** @type {any} */ r) => (r.waypoints ?? []).some((/** @type {any} */ w) => named(w.onArriveEvent)))) return true;
  if ((doc.encounters ?? []).some((/** @type {any} */ e) => named(e.onStart) || named(e.onComplete))) return true;
  return (doc.events ?? []).some((/** @type {any} */ e) => ['then', 'else'].some((b) => (e[b] ?? []).some((/** @type {any} */ a) => a.k === 'trigger_event' && a.delayS > 0 && named(a.event))));
}

/**
 * The events and what starts them, as a graph for an editor to draw. Nodes: every event, plus a source node for each
 * thing that starts one (a zone, an object, a person, a route, an encounter, a trade, or an answer in a dialogue).
 * Edges run from a source to the event it starts, and from an event to the events its actions run. Columns are the
 * longest way in.
 * @returns {{ nodes: { id: string, kind: 'event' | 'source', label: string, sub: string[], col: number, row: number }[], edges: { from: string, to: string, label: string }[] }}
 */
export function eventGraph(doc, names = null) {
  const nodes = new Map(), edges = [];
  const node = (id, kind, label, sub = []) => { if (!nodes.has(id)) nodes.set(id, { id, kind, label, sub, col: 0, row: 0 }); return id; };
  const evId = (k) => `event:${k}`;
  for (const e of doc.events ?? []) {
    const sub = [e.when ? t('poi.dm.graph.onlyIf', 'only if {cond}', { cond: conditionText(doc, e.when, names) }) : '', ...(e.then ?? []).map((a) => actionText(doc, a, names)),
      ...(e.else ?? []).length ? [t('poi.dm.graph.otherwise', 'otherwise:'), ...(e.else ?? []).map((a) => actionText(doc, a, names))] : []].filter(Boolean);
    node(evId(e.key), 'event', e.name ?? e.key, sub);
  }
  const link = (src, key, label) => { if (typeof key === 'string' && nodes.has(evId(key))) edges.push({ from: src, to: evId(key), label }); };
  for (const e of doc.events ?? []) {
    const tg = e.trigger ?? {};
    if (tg.k === 'enter_area' || tg.k === 'interact') link(node(`obj:${tg.interactive}`, 'source', nameOf(doc, 'interactives', tg.interactive)), e.key, tg.k === 'enter_area' ? t('poi.dm.graph.enters', 'enters') : t('poi.dm.graph.uses', 'uses'));
    else if (tg.k === 'npc_talk') link(node(`npc:${tg.npc}`, 'source', nameOf(doc, 'npcs', tg.npc)), e.key, t('poi.dm.graph.talks', 'talks'));
    else if (tg.k === 'waypoint_reached') link(node(`wp:${tg.route}.${tg.waypoint}`, 'source', `${nameOf(doc, 'routes', tg.route)}: ${waypointName(doc, tg.route, tg.waypoint)}`), e.key, t('poi.dm.graph.reached', 'reached'));
    for (const a of [...(e.then ?? []), ...(e.else ?? [])]) if (a.k === 'trigger_event') link(evId(e.key), a.event, a.delayS ? t('poi.dm.graph.after', 'after {s, number} s', { s: a.delayS }) : t('poi.dm.graph.then', 'then'));
  }
  for (const r of doc.routes ?? []) for (const w of r.waypoints ?? []) if (w.onArriveEvent) link(node(`wp:${r.key}.${w.key}`, 'source', `${r.name}: ${w.name}`), w.onArriveEvent, t('poi.dm.graph.arrive', 'arrive'));
  for (const c of doc.encounters ?? []) { if (c.onStart) link(node(`enc:${c.key}`, 'source', c.name), c.onStart, t('poi.dm.graph.starts', 'starts')); if (c.onComplete) link(node(`enc:${c.key}`, 'source', c.name), c.onComplete, t('poi.dm.graph.ends', 'ends')); }
  for (const tr of doc.trades ?? []) for (const r of tr.recipes ?? []) if (r.onSuccessEvent) link(node(`trade:${tr.key}.${r.key}`, 'source', `${tr.name}: ${r.name}`), r.onSuccessEvent, t('poi.dm.graph.traded', 'traded'));
  for (const d of doc.dialogues ?? []) for (const n of d.nodes ?? []) for (const o of n.options ?? []) if (o.then?.k === 'trigger_event') link(node(`dlg:${d.key}.${n.key}`, 'source', `${d.name}: "${o.text}"`), o.then.event, t('poi.dm.graph.says', 'says'));
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
  if (!route?.waypoints.some((w) => w.key === key)) return refuse(t('poi.dm.edit.noSuchWaypoint', 'There is no such waypoint.'));
  const by = referrers(doc, 'waypoints', key, routeKey);
  if (by.length) return refuse(stillUsed(by.map((b) => b.where)));
  route.waypoints = route.waypoints.filter((w) => w.key !== key);
  return { ok: true };
}

/** Remove a recipe, unless an answer in a dialogue runs it. */
export function removeRecipe(doc, tradeKey, key) {
  const trade = doc.trades?.find((x) => x.key === tradeKey);
  if (!trade?.recipes.some((r) => r.key === key)) return refuse(t('poi.dm.edit.noSuchRecipe', 'There is no such recipe.'));
  const by = referrers(doc, 'recipes', key, tradeKey);
  if (by.length) return refuse(stillUsed(by.map((b) => b.where)));
  trade.recipes = trade.recipes.filter((r) => r.key !== key);
  return { ok: true };
}

// ── what the in-game editor still cannot change ──
/**
 * The DM fields a document holds that the in-game DM panel does not offer, because the game does not act on them yet:
 * a spawn point's patrol route, an object's facing, and an object that looks like a flat picture.
 * @param {any} doc @returns {{ patrols: number, facing: number, flatLooks: number }}
 */
export function dmHeldOf(doc) {
  const spawns = (doc?.encounters ?? []).flatMap((e) => e?.spawns ?? []);
  const objects = doc?.interactives ?? [];
  return {
    patrols: spawns.filter((s) => s?.route !== undefined).length,
    facing: objects.filter((o) => Number.isFinite(o?.yaw) && o.yaw !== 0).length,
    flatLooks: objects.filter((o) => o?.appearance?.k === 'flat').length,
  };
}
