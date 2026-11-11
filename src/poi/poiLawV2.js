// @ts-check

// The v2 part of the POI law: what a document may hold beyond the v1 scenery (parts, lights, people, marker).
// A v2 document adds groups, an interior, flat pictures, routes, encounters, interactive objects, dialogues, trades,
// variables and events. This file checks their shape and that every key they name exists. It does not check an item
// against the game's item law: that module pulls in most of the game, so poiTradeLaw.js does it where it is wanted.
// Like poiLaw.js this file imports nothing, so the account service, the game and the editor run the same rules.
// Numbers copied from other laws (decor, foes, items) are pinned to their source by tools/poiLaw.test.mjs.

export const POI_V2_LIMITS = Object.freeze({
  docBytes: 256 * 1024,
  groups: 64,
  groupDepth: 8,
  flats: 200,
  routes: 32,
  waypoints: 128,          // in one route
  encounters: 16,
  spawns: 32,              // in one encounter
  foesPerSpawn: 16,
  foesPerEncounter: 24,
  interactives: 64,
  dialogues: 32,
  nodes: 64,               // in one dialogue
  options: 8,              // on one node
  trades: 32,
  recipes: 8,              // in one trade
  stacks: 8,               // required or rewarded item stacks in one recipe
  enchants: 8,
  variables: 64,
  events: 64,
  conditions: 16,          // leaves in one condition tree
  conditionDepth: 4,
  actions: 32,             // then and else together
  text: 240,
  hiddenBase: 200,
});

/** Values this law copies from the decor, item, foe and NPC laws. tools/poiLaw.test.mjs checks each against its source. */
export const POI_V2_PINS = Object.freeze({
  decorModelMax: 999_999,
  decorArchiveMax: 99_999,
  decorRecordMax: 511,
  decorTemplateMax: 9_999,
  decorScaleMin: 0.25,
  decorScaleMax: 4,
  decorLightRangeMin: 1,
  decorLightRangeMax: 30,
  decorLightIntensityMax: 4,
  decorWeaponsGroup: 3,
  decorArmorGroup: 2,
  decorArrowTemplate: 131,
  trophyTemplate: 601,
  goldMax: 2_147_483_647,
  npcFlatArchives: Object.freeze([334, 346, 357, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184]),
  decorBaseKeyRe: /^(?:m(?:0|[1-9]\d{0,3}):(?:0|[1-9]\d{0,5})|f(?:0|[1-9]\d{0,3}):(?:0|[1-9]\d{0,4})\.(?:0|[1-9]\d{0,2}))$/,
});

/** Foe ids the game defines: monsters 0 to 42 (39 is the horse), classes 128 to 146, and the two Enemy Expansion bands. */
export const POI_FOE_RANGES = Object.freeze([[0, 38], [40, 42], [128, 146], [256, 290], [384, 398]]);
export const poiFoeIdOk = (/** @type {any} */ id) => Number.isInteger(id) && POI_FOE_RANGES.some(([a, b]) => id >= a && id <= b);

export const POI_FLAT_KINDS = Object.freeze(['billboard', 'mount', 'paperdoll']);
export const POI_ROUTE_MODES = Object.freeze(['loop', 'pingpong', 'once']);
export const POI_AGGRESSION = Object.freeze(['hostile', 'passive']);
export const POI_RESPAWN = Object.freeze(['never', 'on_reentry']);
export const POI_COMPLETE_RULES = Object.freeze(['all_dead', 'leader_dead', 'timer_survived']);
export const POI_INTERACTIVE_KINDS = Object.freeze(['chest', 'door', 'switch', 'quest_object', 'trigger']);
/** The states each kind of object can be in. */
export const POI_INTERACTIVE_STATES = Object.freeze({
  chest: Object.freeze(['closed', 'open', 'locked']),
  door: Object.freeze(['closed', 'open', 'locked']),
  switch: Object.freeze(['active', 'inactive']),
  quest_object: Object.freeze(['active', 'inactive']),
  trigger: Object.freeze(['active', 'inactive']),
});
export const POI_VAR_TYPES = Object.freeze(['boolean', 'number', 'string']);
export const POI_VAR_SCOPES = Object.freeze(['event', 'instance', 'character', 'poi_global']);
export const POI_VAR_OPS = Object.freeze(['eq', 'ne', 'gt', 'ge', 'lt', 'le']);
export const POI_LIMIT_MODES = Object.freeze(['unlimited', 'once_per_char', 'once_per_account', 'daily_per_char', 'global_stock']);
export const POI_TRIGGER_KINDS = Object.freeze(['enter_area', 'interact', 'npc_talk', 'waypoint_reached', 'chained']);
export const POI_CONDITION_KINDS = Object.freeze(['all', 'any', 'has_item', 'has_gold', 'var']);
export const POI_ACTION_KINDS = Object.freeze(['say', 'set_var', 'set_state', 'start_encounter', 'end_encounter', 'start_route', 'stop_route', 'spawn_npc', 'despawn_npc', 'open_dialogue', 'open_trade', 'give_item', 'take_item', 'give_gold', 'take_gold', 'trigger_event']);
export const POI_OPTION_KINDS = Object.freeze(['goto', 'close', 'open_trade', 'run_trade_recipe', 'trigger_event']);

// every key set the law knows, so an unknown field is a problem at any depth
const set = (/** @type {string[]} */ ...k) => new Set(k);
const KEYS = Object.freeze({
  group: set('key', 'name', 'parent', 'visible', 'locked'),
  interior: set('shellModel', 'hiddenBaseKeys'),
  flat: set('key', 'name', 'kind', 'flat', 'item', 't', 'rot', 'scale', 'layer', 'pivot', 'collide', 'light', 'group', 'visible', 'locked'),
  item: set('t', 'g', 'm', 'v', 'a', 'p'),
  flatLight: set('color', 'radius', 'intensity', 'flicker'),
  route: set('key', 'name', 'mode', 'waypoints'),
  waypoint: set('key', 'name', 't', 'radius', 'waitS', 'onArriveEvent'),
  encounter: set('key', 'name', 'center', 'radius', 'aggression', 'spawns', 'respawn', 'complete', 'onStart', 'onComplete'),
  spawn: set('key', 'foe', 'count', 'level', 'at', 'spread', 'route'),
  complete: set('rule', 'leader', 'seconds'),
  interactive: set('key', 'name', 'kind', 'appearance', 't', 'yaw', 'radius', 'state', 'keyItem', 'group', 'visible', 'locked'),
  appearance: set('k', 'key', 'flat'),
  dialogue: set('key', 'name', 'start', 'nodes'),
  node: set('key', 'say', 'options'),
  option: set('text', 'when', 'cooldownS', 'then'),
  variable: set('key', 'name', 'type', 'scope', 'initial'),
  trade: set('key', 'name', 'recipes'),
  recipe: set('key', 'name', 'requireItems', 'requireGold', 'when', 'rewardItems', 'rewardGold', 'limitMode', 'maxStock', 'cooldownS', 'onSuccessEvent'),
  stack: set('template', 'group', 'material', 'count', 'enchant'),
  enchant: set('key', 'param'),
  event: set('key', 'name', 'trigger', 'when', 'then', 'else'),
});
/** Keys v2 adds to v1 parts, lights and people. poiLaw.js reads these. */
export const POI_V2_PART_KEYS = Object.freeze(['arch3d', 'group', 'visible', 'locked']);
export const POI_V2_LIGHT_KEYS = Object.freeze(['group', 'visible', 'locked']);
export const POI_V2_NPC_KEYS = Object.freeze(['route', 'dialogue', 'trade', 'radius', 'showWhen', 'group', 'visible', 'locked']);
/** The collections a v2 document may hold beyond v1's. */
export const POI_V2_DOC_KEYS = Object.freeze(['groups', 'interior', 'flats', 'routes', 'encounters', 'interactives', 'dialogues', 'trades', 'variables', 'events']);

/**
 * What poiLaw.js hands in so the two files share one set of helpers.
 * @typedef {{ say: (path: string, code: string, args?: any) => void, textOk: (s: any, max: number, min?: number) => boolean,
 *   vec: (v: any, n: number) => boolean, finite: (v: any) => boolean, enumOk: (v: any, list: readonly string[]) => boolean,
 *   unknown: (o: any, known: Set<string>, at: string) => void, keyRe: RegExp }} Kit
 */

const int = (/** @type {any} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isObj = (/** @type {any} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Every way the v2 parts of `raw` fall short. People, parts and lights are read by poiLaw.js; this reads the rest, and the
 * keys those three name (group, route, dialogue, trade, event).
 * @param {any} raw @param {Kit} kit
 */
export function poiV2Problems(raw, kit) {
  const { say, textOk, vec, finite, enumOk, unknown, keyRe } = kit;
  const L = POI_V2_LIMITS;
  const P = POI_V2_PINS;
  const list = (/** @type {any} */ v, /** @type {number} */ max, /** @type {string} */ at, /** @type {string} */ code) => {
    if (!Array.isArray(v) || v.length > max) { say(at, code, { max }); return null; }
    return /** @type {any[]} */ (v);
  };
  /** the keys of an array's members that are well formed, in order, each once */
  const keysOf = (/** @type {any} */ arr) => {
    const out = new Set();
    if (Array.isArray(arr)) for (const o of arr) if (isObj(o) && typeof o.key === 'string' && keyRe.test(o.key)) out.add(o.key);
    return out;
  };
  const keyed = (/** @type {any} */ o, /** @type {string} */ at, /** @type {Set<string>} */ seen) => {
    if (typeof o.key !== 'string' || !keyRe.test(o.key)) say(`${at}.key`, 'key');
    else if (seen.has(o.key)) say(`${at}.key`, 'key-twice', { key: o.key });
    else seen.add(o.key);
  };
  const ctx = {
    groups: keysOf(raw.groups), parts: keysOf(raw.parts), npcs: keysOf(raw.npcs), routes: keysOf(raw.routes), encounters: keysOf(raw.encounters),
    interactives: keysOf(raw.interactives), dialogues: keysOf(raw.dialogues), trades: keysOf(raw.trades), events: keysOf(raw.events),
    /** @type {Map<string, any>} */ vars: new Map(), /** @type {Map<string, Set<string>>} */ waypoints: new Map(), /** @type {Map<string, Set<string>>} */ recipes: new Map(),
    /** @type {Map<string, string>} */ kinds: new Map(), /** @type {Map<string, Set<string>>} */ spawns: new Map(),
  };
  if (Array.isArray(raw.variables)) for (const v of raw.variables) if (isObj(v) && typeof v.key === 'string' && keyRe.test(v.key)) ctx.vars.set(v.key, v);
  if (Array.isArray(raw.routes)) for (const r of raw.routes) if (isObj(r) && typeof r.key === 'string') ctx.waypoints.set(r.key, keysOf(r.waypoints));
  if (Array.isArray(raw.trades)) for (const r of raw.trades) if (isObj(r) && typeof r.key === 'string') ctx.recipes.set(r.key, keysOf(r.recipes));
  if (Array.isArray(raw.interactives)) for (const o of raw.interactives) if (isObj(o) && typeof o.key === 'string') ctx.kinds.set(o.key, String(o.kind));
  if (Array.isArray(raw.encounters)) for (const e of raw.encounters) if (isObj(e) && typeof e.key === 'string') ctx.spawns.set(e.key, keysOf(e.spawns));

  /** @param {any} v @param {Set<string>} keys @param {string} at */
  const ref = (v, keys, at) => {
    if (typeof v !== 'string' || !keyRe.test(v)) say(at, 'key');
    else if (!keys.has(v)) say(at, 'ref-missing', { key: v });
  };
  /** the optional group, visible and locked an object may carry */
  const layout = (/** @type {any} */ o, /** @type {string} */ at) => {
    if (o.group !== undefined) ref(o.group, ctx.groups, `${at}.group`);
    for (const f of ['visible', 'locked']) if (o[f] !== undefined && typeof o[f] !== 'boolean') say(`${at}.${f}`, 'bool');
  };
  const at3 = (/** @type {any} */ v, /** @type {string} */ at) => { if (!vec(v, 3) || v.some((c) => Math.abs(c) > 2000)) say(at, 'offset', { max: 2000 }); };
  const count = (/** @type {any} */ v, /** @type {string} */ at, /** @type {number} */ max) => { if (!int(v, 1, max)) say(at, 'count', { max }); };

  // a variable's value must match its type
  const valueOk = (/** @type {any} */ v, /** @type {string} */ type) => (type === 'boolean' ? typeof v === 'boolean'
    : type === 'number' ? finite(v) && Math.abs(v) <= 1e9 : type === 'string' ? textOk(v, 64) : false);

  /** an item stack: the game's own numbers, as the server mints them */
  const stack = (/** @type {any} */ s, /** @type {string} */ at, /** @type {boolean} */ reward) => {
    if (!isObj(s)) { say(at, 'not-object'); return; }
    if (!int(s.template, 0, P.decorTemplateMax)) say(`${at}.template`, 'template', { max: P.decorTemplateMax });
    if (s.group !== undefined && !(typeof s.group === 'string' && /^[A-Za-z0-9]{1,32}$/.test(s.group))) say(`${at}.group`, 'item-group');
    if (s.material !== undefined && !int(s.material, 0, 0xffff)) say(`${at}.material`, 'size', { max: 0xffff });
    count(s.count, `${at}.count`, 9999);
    if (s.enchant !== undefined) {
      const rows = reward ? list(s.enchant, L.enchants, `${at}.enchant`, 'enchants') : (say(`${at}.enchant`, 'unknown'), null);
      rows?.forEach((e, i) => {
        if (!isObj(e)) { say(`${at}.enchant[${i}]`, 'not-object'); return; }
        if (!textOk(e.key, 48, 1)) say(`${at}.enchant[${i}].key`, 'key');
        if (e.param !== null && !int(e.param, 0, 0xffff)) say(`${at}.enchant[${i}].param`, 'size', { max: 0xffff });
        unknown(e, KEYS.enchant, `${at}.enchant[${i}]`);
      });
    }
    unknown(s, KEYS.stack, at);
  };

  /** a condition tree, at most L.conditions leaves and L.conditionDepth deep */
  const condition = (/** @type {any} */ c, /** @type {string} */ at, /** @type {{ n: number }} */ budget, /** @type {number} */ depth) => {
    if (!isObj(c)) { say(at, 'not-object'); return; }
    if (depth > L.conditionDepth) { say(at, 'too-deep', { max: L.conditionDepth }); return; }
    if (!enumOk(c.k, POI_CONDITION_KINDS)) { say(`${at}.k`, 'unknown'); return; }
    if (c.k === 'all' || c.k === 'any') {
      const rows = list(c.of, L.conditions, `${at}.of`, 'conditions');
      if (rows && !rows.length) say(`${at}.of`, 'conditions', { max: L.conditions });
      rows?.forEach((x, i) => condition(x, `${at}.of[${i}]`, budget, depth + 1));
      unknown(c, set('k', 'of'), at);
      return;
    }
    if (++budget.n > L.conditions) { say(at, 'conditions', { max: L.conditions }); return; }
    if (c.k === 'has_item') { stack(c.item, `${at}.item`, false); unknown(c, set('k', 'item'), at); }
    else if (c.k === 'has_gold') { if (!int(c.amount, 1, P.goldMax)) say(`${at}.amount`, 'gold', { max: P.goldMax }); unknown(c, set('k', 'amount'), at); }
    else {
      ref(c.var, new Set(ctx.vars.keys()), `${at}.var`);
      const v = ctx.vars.get(c.var);
      if (!enumOk(c.op, POI_VAR_OPS)) say(`${at}.op`, 'op');
      else if (v && (v.type === 'boolean' || v.type === 'string') && c.op !== 'eq' && c.op !== 'ne') say(`${at}.op`, 'op');
      if (v && !valueOk(c.value, v.type)) say(`${at}.value`, 'var-value', { type: v.type });
      unknown(c, set('k', 'var', 'op', 'value'), at);
    }
  };
  const when = (/** @type {any} */ c, /** @type {string} */ at) => { if (c !== undefined) condition(c, at, { n: 0 }, 1); };

  // zero-delay edges between events, for the cycle check
  /** @type {Map<string, Set<string>>} */
  const instant = new Map();
  /** every event named by a link other than a trigger: an action, a route, an encounter, a trade or a dialogue */
  const linked = new Set();

  /** @param {any} a @param {string} at @param {string | null} from the event the action belongs to, for the cycle check */
  const action = (a, at, from) => {
    if (!isObj(a)) { say(at, 'not-object'); return; }
    if (!enumOk(a.k, POI_ACTION_KINDS)) { say(`${at}.k`, 'unknown'); return; }
    const only = (/** @type {string[]} */ ...k) => unknown(a, set('k', ...k), at);
    switch (a.k) {
      case 'say': if (!textOk(a.text, L.text, 1)) say(`${at}.text`, 'text', { max: L.text }); only('text'); break;
      case 'set_var': {
        ref(a.var, new Set(ctx.vars.keys()), `${at}.var`);
        const v = ctx.vars.get(a.var);
        const hasTo = a.to !== undefined, hasAdd = a.add !== undefined;
        if (hasTo === hasAdd) say(at, 'set-var-one');
        else if (v && hasTo && !valueOk(a.to, v.type)) say(`${at}.to`, 'var-value', { type: v.type });
        else if (v && hasAdd && (v.type !== 'number' || !finite(a.add) || Math.abs(a.add) > 1e9)) say(`${at}.add`, 'var-value', { type: v.type });
        only('var', 'to', 'add');
        break;
      }
      case 'set_state': {
        ref(a.interactive, ctx.interactives, `${at}.interactive`);
        const states = /** @type {Record<string, readonly string[]>} */ (POI_INTERACTIVE_STATES)[ctx.kinds.get(a.interactive) ?? ''];
        if (states && !states.includes(a.state)) say(`${at}.state`, 'state');
        else if (!states && !enumOk(a.state, [...new Set(Object.values(POI_INTERACTIVE_STATES).flat())])) say(`${at}.state`, 'state');
        only('interactive', 'state');
        break;
      }
      case 'start_encounter': case 'end_encounter': ref(a.encounter, ctx.encounters, `${at}.encounter`); only('encounter'); break;
      case 'start_route': ref(a.npc, ctx.npcs, `${at}.npc`); ref(a.route, ctx.routes, `${at}.route`); only('npc', 'route'); break;
      case 'stop_route': case 'spawn_npc': case 'despawn_npc': ref(a.npc, ctx.npcs, `${at}.npc`); only('npc'); break;
      case 'open_dialogue': ref(a.dialogue, ctx.dialogues, `${at}.dialogue`); only('dialogue'); break;
      case 'open_trade': ref(a.trade, ctx.trades, `${at}.trade`); only('trade'); break;
      case 'give_item': case 'take_item': stack(a.item, `${at}.item`, a.k === 'give_item'); only('item'); break;
      case 'give_gold': case 'take_gold': if (!int(a.amount, 1, P.goldMax)) say(`${at}.amount`, 'gold', { max: P.goldMax }); only('amount'); break;
      default: {   // trigger_event
        ref(a.event, ctx.events, `${at}.event`);
        if (!int(a.delayS, 0, 86400)) say(`${at}.delayS`, 'seconds', { max: 86400 });
        else if (typeof a.event === 'string') {
          linked.add(a.event);
          if (a.delayS === 0 && from) (instant.get(from) ?? instant.set(from, new Set()).get(from))?.add(a.event);
        }
        only('event', 'delayS');
      }
    }
  };
  const link = (/** @type {any} */ ev, /** @type {string} */ at) => { if (ev === undefined) return; ref(ev, ctx.events, at); if (typeof ev === 'string') linked.add(ev); };

  // ── groups ──────────────────────────────────────────────────────
  if (raw.groups !== undefined) {
    const rows = list(raw.groups, L.groups, 'groups', 'groups');
    const seen = new Set();
    rows?.forEach((g, i) => {
      const at = `groups[${i}]`;
      if (!isObj(g)) { say(at, 'not-object'); return; }
      keyed(g, at, seen);
      if (!textOk(g.name, 48, 1)) say(`${at}.name`, 'part-name', { max: 48 });
      if (g.parent !== null) ref(g.parent, ctx.groups, `${at}.parent`);
      for (const f of ['visible', 'locked']) if (typeof g[f] !== 'boolean') say(`${at}.${f}`, 'bool');
      unknown(g, KEYS.group, at);
    });
    if (rows) {
      const parentOf = new Map(rows.filter((g) => isObj(g) && typeof g.key === 'string').map((g) => [g.key, g.parent]));
      for (const [key] of parentOf) {
        let depth = 0, cur = key;
        while (typeof cur === 'string' && parentOf.has(cur) && depth <= L.groupDepth + rows.length) { cur = parentOf.get(cur); depth++; }
        if (depth > L.groupDepth) { say('groups', depth > rows.length ? 'group-cycle' : 'too-deep', { max: L.groupDepth }); break; }
      }
    }
  }

  // ── interior ────────────────────────────────────────────────────
  if (raw.interior !== undefined) {
    const it = raw.interior;
    if (!isObj(it)) say('interior', 'not-object');
    else {
      if (it.shellModel !== null && !int(it.shellModel, 1, P.decorModelMax)) say('interior.shellModel', 'model', { max: P.decorModelMax });
      const rows = list(it.hiddenBaseKeys, L.hiddenBase, 'interior.hiddenBaseKeys', 'hidden-many');
      rows?.forEach((k, i) => { if (typeof k !== 'string' || !P.decorBaseKeyRe.test(k)) say(`interior.hiddenBaseKeys[${i}]`, 'base-key'); });
      unknown(it, KEYS.interior, 'interior');
    }
  }

  // ── flat pictures ───────────────────────────────────────────────
  const flatPair = (/** @type {any} */ f) => Array.isArray(f) && f.length === 2 && int(f[0], 0, P.decorArchiveMax) && int(f[1], 0, P.decorRecordMax);
  const isMount = (/** @type {any} */ it) => it.t === P.trophyTemplate || (it.g === P.decorWeaponsGroup && it.t !== P.decorArrowTemplate) || it.g === P.decorArmorGroup;
  if (raw.flats !== undefined) {
    const rows = list(raw.flats, L.flats, 'flats', 'flats');
    const seen = new Set();
    rows?.forEach((f, i) => {
      const at = `flats[${i}]`;
      if (!isObj(f)) { say(at, 'not-object'); return; }
      keyed(f, at, seen);
      if (f.name !== undefined && !textOk(f.name, 64)) say(`${at}.name`, 'part-name', { max: 64 });
      if (!enumOk(f.kind, POI_FLAT_KINDS)) say(`${at}.kind`, 'flat-kind');
      else if (f.kind === 'billboard') {
        if (!flatPair(f.flat)) say(`${at}.flat`, 'flat-ref');
        if (f.item !== undefined) say(`${at}.item`, 'unknown');
      } else {
        const it = f.item;
        if (!isObj(it)) say(`${at}.item`, 'item-ref');
        else {
          if (!int(it.t, 0, P.decorTemplateMax)) say(`${at}.item.t`, 'template', { max: P.decorTemplateMax });
          for (const [k, max] of /** @type {[string, number][]} */ ([['g', 63], ['m', 0xffff], ['v', 255], ['a', 255], ['p', 0xffff]])) {
            if (it[k] !== undefined && it[k] !== null && !int(it[k], 0, max)) say(`${at}.item.${k}`, 'size', { max });
          }
          unknown(it, KEYS.item, `${at}.item`);
          if (int(it.t, 0, P.decorTemplateMax) && (f.kind === 'mount') !== isMount(it)) say(`${at}.kind`, 'flat-kind');
        }
        if (f.flat !== undefined && !flatPair(f.flat)) say(`${at}.flat`, 'flat-ref');
      }
      at3(f.t, `${at}.t`);
      if (!vec(f.rot, 3) || f.rot.some((c) => Math.abs(c) > 720)) say(`${at}.rot`, 'turn', { max: 720 });
      const figure = f.kind === 'billboard' && Array.isArray(f.flat) && P.npcFlatArchives.includes(f.flat[0]);
      if (figure ? f.scale !== 1 : !finite(f.scale) || f.scale < P.decorScaleMin || f.scale > P.decorScaleMax) say(`${at}.scale`, figure ? 'figure-scale' : 'size', { min: P.decorScaleMin, max: P.decorScaleMax });
      if (!int(f.layer, -100, 100)) say(`${at}.layer`, 'layer', { max: 100 });
      if (f.pivot !== undefined && (!vec(f.pivot, 2) || f.pivot.some((c) => c < 0 || c > 1))) say(`${at}.pivot`, 'pivot');
      if (typeof f.collide !== 'boolean') say(`${at}.collide`, 'bool');
      if (f.light !== undefined) {
        const l = f.light;
        if (!isObj(l)) say(`${at}.light`, 'not-object');
        else {
          if (!vec(l.color, 3) || l.color.some((c) => c < 0 || c > 1)) say(`${at}.light.color`, 'color3');
          if (!finite(l.radius) || l.radius < P.decorLightRangeMin || l.radius > P.decorLightRangeMax) say(`${at}.light.radius`, 'radius', { min: P.decorLightRangeMin, max: P.decorLightRangeMax });
          if (!finite(l.intensity) || l.intensity < 0 || l.intensity > P.decorLightIntensityMax) say(`${at}.light.intensity`, 'intensity', { max: P.decorLightIntensityMax });
          if (typeof l.flicker !== 'boolean') say(`${at}.light.flicker`, 'bool');
          unknown(l, KEYS.flatLight, `${at}.light`);
        }
      }
      layout(f, at);
      unknown(f, KEYS.flat, at);
    });
  }

  // ── variables ───────────────────────────────────────────────────
  if (raw.variables !== undefined) {
    const rows = list(raw.variables, L.variables, 'variables', 'variables');
    const seen = new Set();
    rows?.forEach((v, i) => {
      const at = `variables[${i}]`;
      if (!isObj(v)) { say(at, 'not-object'); return; }
      keyed(v, at, seen);
      if (v.name !== undefined && !textOk(v.name, 48)) say(`${at}.name`, 'part-name', { max: 48 });
      if (!enumOk(v.type, POI_VAR_TYPES)) say(`${at}.type`, 'var-type');
      else if (!valueOk(v.initial, v.type)) say(`${at}.initial`, 'var-value', { type: v.type });
      if (!enumOk(v.scope, POI_VAR_SCOPES)) say(`${at}.scope`, 'var-scope');
      unknown(v, KEYS.variable, at);
    });
  }

  // ── routes ──────────────────────────────────────────────────────
  if (raw.routes !== undefined) {
    const rows = list(raw.routes, L.routes, 'routes', 'routes');
    const seen = new Set();
    rows?.forEach((r, i) => {
      const at = `routes[${i}]`;
      if (!isObj(r)) { say(at, 'not-object'); return; }
      keyed(r, at, seen);
      if (!textOk(r.name, 48, 1)) say(`${at}.name`, 'part-name', { max: 48 });
      if (!enumOk(r.mode, POI_ROUTE_MODES)) say(`${at}.mode`, 'route-mode');
      const pts = list(r.waypoints, L.waypoints, `${at}.waypoints`, 'waypoints');
      if (pts && pts.length < 2) say(`${at}.waypoints`, 'waypoints-few', { min: 2 });
      const wseen = new Set();
      pts?.forEach((w, k) => {
        const wat = `${at}.waypoints[${k}]`;
        if (!isObj(w)) { say(wat, 'not-object'); return; }
        keyed(w, wat, wseen);
        if (!textOk(w.name, 48, 1)) say(`${wat}.name`, 'part-name', { max: 48 });
        at3(w.t, `${wat}.t`);
        if (!finite(w.radius) || w.radius < 0.5 || w.radius > 50) say(`${wat}.radius`, 'radius', { min: 0.5, max: 50 });
        if (!int(w.waitS, 0, 3600)) say(`${wat}.waitS`, 'seconds', { max: 3600 });
        link(w.onArriveEvent, `${wat}.onArriveEvent`);
        unknown(w, KEYS.waypoint, wat);
      });
      unknown(r, KEYS.route, at);
    });
  }

  // ── interactive objects ─────────────────────────────────────────
  if (raw.interactives !== undefined) {
    const rows = list(raw.interactives, L.interactives, 'interactives', 'interactives');
    const seen = new Set();
    rows?.forEach((o, i) => {
      const at = `interactives[${i}]`;
      if (!isObj(o)) { say(at, 'not-object'); return; }
      keyed(o, at, seen);
      if (!textOk(o.name, 48, 1)) say(`${at}.name`, 'part-name', { max: 48 });
      if (!enumOk(o.kind, POI_INTERACTIVE_KINDS)) say(`${at}.kind`, 'interactive-kind');
      else if (!/** @type {Record<string, readonly string[]>} */ (POI_INTERACTIVE_STATES)[o.kind].includes(o.state)) say(`${at}.state`, 'state');
      const a = o.appearance;
      if (!isObj(a)) say(`${at}.appearance`, 'not-object');
      else if (a.k === 'none') unknown(a, set('k'), `${at}.appearance`);
      else if (a.k === 'part') { ref(a.key, ctx.parts, `${at}.appearance.key`); unknown(a, set('k', 'key'), `${at}.appearance`); }
      else if (a.k === 'flat') { if (!flatPair(a.flat)) say(`${at}.appearance.flat`, 'flat-ref'); unknown(a, set('k', 'flat'), `${at}.appearance`); }
      else say(`${at}.appearance.k`, 'unknown');
      at3(o.t, `${at}.t`);
      if (!finite(o.yaw) || Math.abs(o.yaw) > 720) say(`${at}.yaw`, 'size', { max: 720 });
      if (!finite(o.radius) || o.radius < 0.5 || o.radius > 200) say(`${at}.radius`, 'radius', { min: 0.5, max: 200 });
      if (o.keyItem !== undefined) stack(o.keyItem, `${at}.keyItem`, false);
      layout(o, at);
      unknown(o, KEYS.interactive, at);
    });
  }

  // ── trades ──────────────────────────────────────────────────────
  if (raw.trades !== undefined) {
    const rows = list(raw.trades, L.trades, 'trades', 'trades');
    const seen = new Set();
    rows?.forEach((t, i) => {
      const at = `trades[${i}]`;
      if (!isObj(t)) { say(at, 'not-object'); return; }
      keyed(t, at, seen);
      if (!textOk(t.name, 48, 1)) say(`${at}.name`, 'part-name', { max: 48 });
      const recs = list(t.recipes, L.recipes, `${at}.recipes`, 'recipes');
      if (recs && !recs.length) say(`${at}.recipes`, 'recipes', { max: L.recipes });
      const rseen = new Set();
      recs?.forEach((r, k) => {
        const rat = `${at}.recipes[${k}]`;
        if (!isObj(r)) { say(rat, 'not-object'); return; }
        keyed(r, rat, rseen);
        if (!textOk(r.name, 48, 1)) say(`${rat}.name`, 'part-name', { max: 48 });
        const needs = list(r.requireItems, L.stacks, `${rat}.requireItems`, 'stacks');
        needs?.forEach((s, n) => stack(s, `${rat}.requireItems[${n}]`, false));
        const gives = list(r.rewardItems, L.stacks, `${rat}.rewardItems`, 'stacks');
        gives?.forEach((s, n) => stack(s, `${rat}.rewardItems[${n}]`, true));
        if (!int(r.requireGold, 0, P.goldMax)) say(`${rat}.requireGold`, 'gold', { max: P.goldMax });
        if (!int(r.rewardGold, 0, P.goldMax)) say(`${rat}.rewardGold`, 'gold', { max: P.goldMax });
        if (gives && int(r.rewardGold, 0, P.goldMax) && !gives.length && r.rewardGold === 0) say(rat, 'no-reward');
        if (!enumOk(r.limitMode, POI_LIMIT_MODES)) say(`${rat}.limitMode`, 'limit-mode');
        else {
          const free = needs && !needs.length && r.requireGold === 0;
          if (free && r.limitMode === 'unlimited') say(rat, 'free-unlimited');
          if (r.limitMode === 'global_stock') { if (!int(r.maxStock, 1, 1_000_000)) say(`${rat}.maxStock`, 'stock', { max: 1_000_000 }); }
          else if (r.maxStock !== undefined) say(`${rat}.maxStock`, 'unknown');
        }
        if (r.cooldownS !== undefined && !int(r.cooldownS, 0, 2_592_000)) say(`${rat}.cooldownS`, 'seconds', { max: 2_592_000 });
        when(r.when, `${rat}.when`);
        link(r.onSuccessEvent, `${rat}.onSuccessEvent`);
        unknown(r, KEYS.recipe, rat);
      });
      unknown(t, KEYS.trade, at);
    });
  }

  // ── dialogues ───────────────────────────────────────────────────
  if (raw.dialogues !== undefined) {
    const rows = list(raw.dialogues, L.dialogues, 'dialogues', 'dialogues');
    const seen = new Set();
    rows?.forEach((d, i) => {
      const at = `dialogues[${i}]`;
      if (!isObj(d)) { say(at, 'not-object'); return; }
      keyed(d, at, seen);
      if (!textOk(d.name, 48, 1)) say(`${at}.name`, 'part-name', { max: 48 });
      const nodes = list(d.nodes, L.nodes, `${at}.nodes`, 'nodes');
      const nodeKeys = keysOf(nodes);
      if (nodes && !nodes.length) say(`${at}.nodes`, 'nodes', { max: L.nodes });
      ref(d.start, nodeKeys, `${at}.start`);
      /** @type {Map<string, Set<string>>} */
      const edges = new Map();
      const nseen = new Set();
      nodes?.forEach((n, k) => {
        const nat = `${at}.nodes[${k}]`;
        if (!isObj(n)) { say(nat, 'not-object'); return; }
        keyed(n, nat, nseen);
        if (!textOk(n.say, L.text, 1)) say(`${nat}.say`, 'text', { max: L.text });
        const opts = list(n.options, L.options, `${nat}.options`, 'options');
        if (opts && !opts.length) say(`${nat}.options`, 'options', { max: L.options });
        const out = new Set();
        opts?.forEach((o, m) => {
          const oat = `${nat}.options[${m}]`;
          if (!isObj(o)) { say(oat, 'not-object'); return; }
          if (!textOk(o.text, L.text, 1)) say(`${oat}.text`, 'text', { max: L.text });
          when(o.when, `${oat}.when`);
          if (o.cooldownS !== undefined && !int(o.cooldownS, 0, 86400)) say(`${oat}.cooldownS`, 'seconds', { max: 86400 });
          const th = o.then;
          if (!isObj(th)) say(`${oat}.then`, 'not-object');
          else if (!enumOk(th.k, POI_OPTION_KINDS)) say(`${oat}.then.k`, 'unknown');
          else if (th.k === 'goto') { ref(th.node, nodeKeys, `${oat}.then.node`); if (typeof th.node === 'string') out.add(th.node); unknown(th, set('k', 'node'), `${oat}.then`); }
          else if (th.k === 'close') unknown(th, set('k'), `${oat}.then`);
          else if (th.k === 'open_trade') { ref(th.trade, ctx.trades, `${oat}.then.trade`); unknown(th, set('k', 'trade'), `${oat}.then`); }
          else if (th.k === 'run_trade_recipe') {
            ref(th.trade, ctx.trades, `${oat}.then.trade`);
            ref(th.recipe, ctx.recipes.get(th.trade) ?? new Set(), `${oat}.then.recipe`);
            unknown(th, set('k', 'trade', 'recipe'), `${oat}.then`);
          } else { link(th.event, `${oat}.then.event`); unknown(th, set('k', 'event'), `${oat}.then`); }
          unknown(o, KEYS.option, oat);
        });
        unknown(n, KEYS.node, nat);
        if (typeof n.key === 'string') edges.set(n.key, out);
      });
      // a node nobody can reach from the start is a mistake, not a feature
      if (typeof d.start === 'string' && nodeKeys.has(d.start)) {
        const reached = new Set([d.start]);
        const todo = [d.start];
        for (let k = todo.pop(); k !== undefined; k = todo.pop()) for (const to of edges.get(k) ?? []) if (!reached.has(to)) { reached.add(to); todo.push(to); }
        nodes?.forEach((n, k) => { if (isObj(n) && typeof n.key === 'string' && !reached.has(n.key)) say(`${at}.nodes[${k}]`, 'node-unreachable', { key: n.key }); });
      }
      unknown(d, KEYS.dialogue, at);
    });
  }

  // ── encounters ──────────────────────────────────────────────────
  if (raw.encounters !== undefined) {
    const rows = list(raw.encounters, L.encounters, 'encounters', 'encounters');
    const seen = new Set();
    rows?.forEach((e, i) => {
      const at = `encounters[${i}]`;
      if (!isObj(e)) { say(at, 'not-object'); return; }
      keyed(e, at, seen);
      if (!textOk(e.name, 48, 1)) say(`${at}.name`, 'part-name', { max: 48 });
      at3(e.center, `${at}.center`);
      if (!finite(e.radius) || e.radius < 1 || e.radius > 500) say(`${at}.radius`, 'radius', { min: 1, max: 500 });
      if (!enumOk(e.aggression, POI_AGGRESSION)) say(`${at}.aggression`, 'aggression');
      if (!enumOk(e.respawn, POI_RESPAWN)) say(`${at}.respawn`, 'respawn');
      const spawns = list(e.spawns, L.spawns, `${at}.spawns`, 'spawns');
      if (spawns && !spawns.length) say(`${at}.spawns`, 'spawns', { max: L.spawns });
      const sseen = new Set();
      let foes = 0;
      spawns?.forEach((s, k) => {
        const sat = `${at}.spawns[${k}]`;
        if (!isObj(s)) { say(sat, 'not-object'); return; }
        keyed(s, sat, sseen);
        if (!poiFoeIdOk(s.foe)) say(`${sat}.foe`, 'foe');
        if (!int(s.count, 1, L.foesPerSpawn)) say(`${sat}.count`, 'count', { max: L.foesPerSpawn });
        else foes += s.count;
        if (s.level !== undefined && !int(s.level, 1, 99)) say(`${sat}.level`, 'size', { min: 1, max: 99 });
        at3(s.at, `${sat}.at`);
        if (!finite(s.spread) || s.spread < 0 || s.spread > 50) say(`${sat}.spread`, 'radius', { max: 50 });
        if (s.route !== undefined) ref(s.route, ctx.routes, `${sat}.route`);
        unknown(s, KEYS.spawn, sat);
      });
      if (foes > L.foesPerEncounter) say(`${at}.spawns`, 'foes-many', { max: L.foesPerEncounter });
      const c = e.complete;
      if (!isObj(c)) say(`${at}.complete`, 'not-object');
      else {
        if (!enumOk(c.rule, POI_COMPLETE_RULES)) say(`${at}.complete.rule`, 'complete-rule');
        else if (c.rule === 'leader_dead') ref(c.leader, ctx.spawns.get(e.key) ?? new Set(), `${at}.complete.leader`);
        else if (c.leader !== undefined) say(`${at}.complete.leader`, 'unknown');
        if (c.rule === 'timer_survived') { if (!int(c.seconds, 1, 3600)) say(`${at}.complete.seconds`, 'seconds', { max: 3600 }); }
        else if (c.seconds !== undefined) say(`${at}.complete.seconds`, 'unknown');
        unknown(c, KEYS.complete, `${at}.complete`);
      }
      link(e.onStart, `${at}.onStart`);
      link(e.onComplete, `${at}.onComplete`);
      unknown(e, KEYS.encounter, at);
    });
  }

  // ── events ──────────────────────────────────────────────────────
  /** @type {Map<string, string>} */
  const triggerKinds = new Map();
  if (raw.events !== undefined) {
    const rows = list(raw.events, L.events, 'events', 'events');
    const seen = new Set();
    rows?.forEach((e, i) => {
      const at = `events[${i}]`;
      if (!isObj(e)) { say(at, 'not-object'); return; }
      keyed(e, at, seen);
      if (e.name !== undefined && !textOk(e.name, 48)) say(`${at}.name`, 'part-name', { max: 48 });
      const t = e.trigger;
      if (!isObj(t)) say(`${at}.trigger`, 'not-object');
      else if (!enumOk(t.k, POI_TRIGGER_KINDS)) say(`${at}.trigger.k`, 'unknown');
      else {
        if (typeof e.key === 'string') triggerKinds.set(e.key, t.k);
        const tat = `${at}.trigger`;
        if (t.k === 'enter_area') {
          ref(t.interactive, ctx.interactives, `${tat}.interactive`);
          if (ctx.kinds.has(t.interactive) && ctx.kinds.get(t.interactive) !== 'trigger') say(`${tat}.interactive`, 'wrong-kind');
          unknown(t, set('k', 'interactive'), tat);
        } else if (t.k === 'interact') {
          ref(t.interactive, ctx.interactives, `${tat}.interactive`);
          if (ctx.kinds.get(t.interactive) === 'trigger') say(`${tat}.interactive`, 'wrong-kind');
          unknown(t, set('k', 'interactive'), tat);
        } else if (t.k === 'npc_talk') { ref(t.npc, ctx.npcs, `${tat}.npc`); unknown(t, set('k', 'npc'), tat); }
        else if (t.k === 'waypoint_reached') {
          ref(t.route, ctx.routes, `${tat}.route`);
          ref(t.waypoint, ctx.waypoints.get(t.route) ?? new Set(), `${tat}.waypoint`);
          unknown(t, set('k', 'route', 'waypoint'), tat);
        } else unknown(t, set('k'), tat);
      }
      when(e.when, `${at}.when`);
      const then = list(e.then, L.actions, `${at}.then`, 'actions');
      const other = e.else === undefined ? [] : list(e.else, L.actions, `${at}.else`, 'actions');
      if (then && !then.length) say(`${at}.then`, 'actions-none');
      if (then && other && then.length + other.length > L.actions) say(at, 'actions', { max: L.actions });
      const from = typeof e.key === 'string' ? e.key : null;
      then?.forEach((a, k) => action(a, `${at}.then[${k}]`, from));
      other?.forEach((a, k) => action(a, `${at}.else[${k}]`, from));
      unknown(e, KEYS.event, at);
    });
    // an event only others can start must be started by something, or it never runs
    rows?.forEach((e, i) => { if (isObj(e) && typeof e.key === 'string' && triggerKinds.get(e.key) === 'chained' && !linked.has(e.key)) say(`events[${i}].trigger`, 'event-unreachable', { key: e.key }); });
    // an event that starts another with no delay, round to itself, would run without end in one tick
    const state = new Map();
    const walk = (/** @type {string} */ k) => {
      state.set(k, 1);
      for (const to of instant.get(k) ?? []) {
        if (state.get(to) === 1) return to;
        if (!state.has(to) && ctx.events.has(to)) { const hit = walk(to); if (hit) return hit; }
      }
      state.set(k, 2);
      return null;
    };
    for (const k of instant.keys()) if (!state.has(k) && walk(k)) { say('events', 'event-cycle'); break; }
  }

  // ── what the people, parts and lights name ─────────────────────
  const rowsAt = (/** @type {any} */ arr, /** @type {(o: any, at: string) => void} */ fn, /** @type {string} */ name) => {
    if (Array.isArray(arr)) arr.forEach((o, i) => { if (isObj(o)) fn(o, `${name}[${i}]`); });
  };
  rowsAt(raw.npcs, (n, at) => {
    layout(n, at);
    if (n.route !== undefined) ref(n.route, ctx.routes, `${at}.route`);
    if (n.dialogue !== undefined) ref(n.dialogue, ctx.dialogues, `${at}.dialogue`);
    if (n.trade !== undefined) ref(n.trade, ctx.trades, `${at}.trade`);
    if (n.radius !== undefined && (!finite(n.radius) || n.radius < 1 || n.radius > 20)) say(`${at}.radius`, 'radius', { min: 1, max: 20 });
    when(n.showWhen, `${at}.showWhen`);
  }, 'npcs');
  rowsAt(raw.parts, (p, at) => layout(p, at), 'parts');
  rowsAt(raw.lights, (l, at) => layout(l, at), 'lights');
}

/** The arch3d model id of a v2 part: a number the game's ARCH3D.BSA holds. */
export const poiArch3dOk = (/** @type {any} */ id) => int(id, 1, POI_V2_PINS.decorModelMax);
