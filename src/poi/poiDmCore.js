// @ts-check

// A v2 POI's game logic as plain functions over data: conditions, events, dialogues, trades, limits and patrols. No DOM,
// network or game imports, so the editor's Sandbox, the game (poiDmRuntime.js) and the service read the same rules.
// `createDm` models one visit (items, gold, variables, object states, people, encounters, trade counts); events change
// it and write what they did to `log`.

/** How deep events may start events with no delay in one go; the law refuses a cycle, this stops a mistake the law cannot see. */
export const EVENT_DEPTH_MAX = 16;
export const DAY_S = 86400;

const clone = (/** @type {any} */ v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const byKey = (/** @type {any} */ rows, /** @type {string} */ key) => (Array.isArray(rows) ? rows.find((r) => r?.key === key) : undefined);

// ── conditions ──────────────────────────────────────────────────

/**
 * Whether a condition tree holds. `ctx`: `count(stack)` how many of an item is held, `gold`, `getVar(key)`. No condition holds.
 * @param {any} c @param {{ count: (s: any) => number, gold: number, getVar: (k: string) => any }} ctx @returns {boolean}
 */
export function evalWhen(c, ctx) {
  if (!c) return true;
  switch (c.k) {
    case 'all': return (c.of ?? []).every((/** @type {any} */ x) => evalWhen(x, ctx));
    case 'any': return (c.of ?? []).some((/** @type {any} */ x) => evalWhen(x, ctx));
    case 'has_item': return ctx.count(c.item) >= (c.item?.count ?? 1);
    case 'has_gold': return ctx.gold >= c.amount;
    case 'var': {
      const v = ctx.getVar(c.var);
      switch (c.op) {
        case 'eq': return v === c.value;
        case 'ne': return v !== c.value;
        case 'gt': return v > c.value;
        case 'ge': return v >= c.value;
        case 'lt': return v < c.value;
        case 'le': return v <= c.value;
        default: return false;
      }
    }
    default: return false;
  }
}

/** The variable keys a condition tree reads. @param {any} c @param {Set<string>} [out] */
export function varsRead(c, out = new Set()) {
  if (c?.k === 'var') out.add(c.var);
  else for (const x of c?.of ?? []) varsRead(x, out);
  return out;
}

/** The value a variable starts with, and where it is kept: `character` and `poi_global` persist, the rest is one visit's. @param {any} v */
export const persists = (v) => v?.scope === 'character' || v?.scope === 'poi_global';

// ── limits ──────────────────────────────────────────────────────

/**
 * Where a recipe's limit counts: the claims rows (`scope`, at most `max`) one run must find room in, and the cooldown's.
 * The service keeps the same rows in poi_trade_claims.
 * @param {any} recipe @param {{ char: string, player: string, nowS: number }} who
 * @returns {{ scope: string, max: number, cooldownS?: number }[]}
 */
export function claimRule(recipe, { char, player, nowS }) {
  /** @type {{ scope: string, max: number, cooldownS?: number }[]} */
  const rules = [];
  switch (recipe?.limitMode) {
    case 'once_per_char': rules.push({ scope: `char:${char}`, max: 1 }); break;
    case 'once_per_account': rules.push({ scope: `acct:${player}`, max: 1 }); break;
    case 'daily_per_char': rules.push({ scope: `day:${char}:${Math.floor(nowS / DAY_S)}`, max: 1 }); break;
    case 'global_stock': rules.push({ scope: 'global', max: recipe.maxStock }); break;
    default: break;
  }
  if (recipe?.cooldownS > 0) rules.push({ scope: `cool:${char}`, max: Number.MAX_SAFE_INTEGER, cooldownS: recipe.cooldownS });
  return rules;
}

/** An event that gives and takes nothing back is claimed once per character; one that takes something is an exchange. */
export function eventRule(/** @type {any[]} */ actions, /** @type {string} */ char) {
  const gives = actions.some((a) => a.k === 'give_item' || a.k === 'give_gold');
  const takes = actions.some((a) => a.k === 'take_item' || a.k === 'take_gold');
  return gives && !takes ? [{ scope: `char:${char}`, max: 1 }] : [];
}

/**
 * Why a recipe cannot run now, or null: 'when', 'items', 'gold', 'limit', 'cooldown', 'stock'.
 * `claimOf(scope)` is the `{ n, last }` kept for a scope, or null.
 * @param {any} recipe @param {{ char: string, player: string, nowS: number }} who
 * @param {{ count: (s: any) => number, gold: number, getVar: (k: string) => any }} ctx @param {(scope: string) => ({ n: number, last: number } | null)} claimOf
 */
export function recipeWhy(recipe, who, ctx, claimOf) {
  if (!evalWhen(recipe.when, ctx)) return 'when';
  for (const s of recipe.requireItems ?? []) if (ctx.count(s) < s.count) return 'items';
  if (ctx.gold < (recipe.requireGold ?? 0)) return 'gold';
  for (const r of claimRule(recipe, who)) {
    const c = claimOf(r.scope);
    if (r.cooldownS !== undefined) { if (c && who.nowS - c.last < r.cooldownS) return 'cooldown'; }
    else if (c && c.n >= r.max) return r.scope === 'global' ? 'stock' : 'limit';
  }
  return null;
}

// ── the model of one visit ──────────────────────────────────────

/**
 * @typedef {{ template: number, group?: string, material?: number, count: number }} Stack
 * @typedef {ReturnType<typeof createDm>} Dm
 */

/**
 * A visit's model over a document. `start`: `items` (stacks), `gold`, `vars` (values that replace a variable's own start),
 * and who is playing (`char`, `player`) for the limits.
 * @param {any} doc @param {{ items?: Stack[], gold?: number, vars?: Record<string, any>, char?: string, player?: string, now?: number }} [start]
 */
export function createDm(doc, start = {}) {
  /** @type {Record<string, any>} */
  const vars = {};
  for (const v of doc.variables ?? []) vars[v.key] = start.vars && v.key in start.vars ? start.vars[v.key] : v.initial;
  /** @type {Record<string, string>} */
  const states = {};
  for (const o of doc.interactives ?? []) states[o.key] = o.state;
  /** @type {Record<string, { on: boolean, route: string | null }>} */
  const npcs = {};
  (doc.npcs ?? []).forEach((/** @type {any} */ n, /** @type {number} */ i) => { npcs[n.key ?? `npc${i}`] = { on: true, route: n.route ?? null }; });
  return {
    doc,
    /** @type {Stack[]} */ items: clone(start.items ?? []),
    gold: start.gold ?? 0,
    vars, states, npcs,
    /** @type {Record<string, 'idle' | 'active' | 'done'>} */ encounters: Object.fromEntries((doc.encounters ?? []).map((/** @type {any} */ e) => [e.key, 'idle'])),
    /** @type {Record<string, { n: number, last: number }>} */ claims: {},
    /** @type {Record<string, number>} */ optionAt: {},
    /** @type {{ at: number, event: string }[]} */ queue: [],
    /** @type {any[]} */ log: [],
    /** @type {Set<string>} */ dirty: new Set(),
    /** The game sets this: an event whose branch moves items, gold or a kept variable is not run here but handed to `pending`, for the service to settle. */
    service: false,
    /** The game sets this: what a condition reads of the live pack (`{ count, gold, getVar }`). */
    /** @type {null | (() => { count: (s: any) => number, gold: number, getVar: (k: string) => any })} */ read: null,
    /** @type {string[]} */ pending: [],
    /** @type {{ dialogue: string, node: string } | null} */ dialogue: null,
    /** @type {string | null} */ trade: null,
    now: start.now ?? 0,
    char: start.char ?? 'sandbox', player: start.player ?? 'sandbox',
  };
}

/** Is a held stack the item another names? A group or material counts only where both give one. @param {any} it @param {any} s */
const itemIs = (it, s) => it.template === s.template && (s.group === undefined || it.group === undefined || it.group === s.group) && (s.material === undefined || it.material === s.material);

/** What a model's items and gold look like to a condition. @param {Dm} dm */
export function ctxOf(dm) {
  if (dm.read) return dm.read();   // the game: the live pack, not the model's stacks
  return {
    count: (/** @type {any} */ s) => dm.items.reduce((n, it) => n + (itemIs(it, s) ? it.count : 0), 0),
    gold: dm.gold,
    getVar: (/** @type {string} */ k) => dm.vars[k],
  };
}

const note = (/** @type {Dm} */ dm, /** @type {any} */ entry) => { dm.log.push({ t: dm.now, ...entry }); };
const stackName = (/** @type {Stack} */ s) => `${s.count} × item ${s.template}`;

/** The model's claim rows as the limit rules read them. @param {Dm} dm @param {string} claim */
const claimOfDm = (dm, claim) => (/** @type {string} */ scope) => dm.claims[`${claim}|${scope}`] ?? null;
const bump = (/** @type {Dm} */ dm, /** @type {string} */ claim, /** @type {{ scope: string }[]} */ rules) => {
  for (const r of rules) { const k = `${claim}|${r.scope}`; dm.claims[k] = { n: (dm.claims[k]?.n ?? 0) + 1, last: dm.now }; }
};

/** Add a stack to the model's items, merging a plain one. @param {Dm} dm @param {Stack} s */
export function giveStack(dm, s) {
  const same = dm.items.find((it) => it.template === s.template && it.group === s.group && it.material === s.material);
  if (same) same.count += s.count; else dm.items.push({ ...s });
}
/** Take a stack from the model's items; false, and nothing taken, when it holds fewer. @param {Dm} dm @param {Stack} s */
export function takeStack(dm, s) {
  if (ctxOf(dm).count(s) < s.count) return false;
  let need = s.count;
  for (const it of [...dm.items].sort((a, b) => a.count - b.count)) {
    if (!itemIs(it, s)) continue;
    const n = Math.min(need, it.count);
    it.count -= n; need -= n;
    if (need <= 0) break;
  }
  dm.items = dm.items.filter((it) => it.count > 0);
  return true;
}

// ── events ──────────────────────────────────────────────────────

/** The actions of the branch an event takes, given what the model holds now. @param {any} ev @param {Dm} dm */
export function branchOf(ev, dm) { return evalWhen(ev.when, ctxOf(dm)) ? 'then' : 'else'; }

/** Whether an event's branch moves the player's items or gold, or a variable the service keeps: those are settled on the service. @param {any} doc @param {any[]} actions */
export function needsService(doc, actions) {
  return actions.some((a) => a.k === 'give_item' || a.k === 'take_item' || a.k === 'give_gold' || a.k === 'take_gold'
    || (a.k === 'set_var' && persists(byKey(doc.variables, a.var))));
}

/** The totals an action list takes and gives. @param {any[]} actions */
export function valueOf(actions) {
  /** @type {{ takeItems: Stack[], giveItems: Stack[], takeGold: number, giveGold: number }} */
  const v = { takeItems: [], giveItems: [], takeGold: 0, giveGold: 0 };
  for (const a of actions) {
    if (a.k === 'take_item') v.takeItems.push(a.item);
    else if (a.k === 'give_item') v.giveItems.push(a.item);
    else if (a.k === 'take_gold') v.takeGold += a.amount;
    else if (a.k === 'give_gold') v.giveGold += a.amount;
  }
  return v;
}

/** Run one action on the model. `settled`: items and gold were already moved (on the service), so they are only noted. @param {Dm} dm @param {any} a @param {number} depth @param {boolean} settled */
function act(dm, a, depth, settled) {
  const doc = dm.doc;
  switch (a.k) {
    case 'say': note(dm, { k: 'say', text: a.text }); break;
    case 'set_var': {
      const was = dm.vars[a.var];
      dm.vars[a.var] = a.add !== undefined ? (Number(was) || 0) + a.add : a.to;
      dm.dirty.add(a.var);
      note(dm, { k: 'set_var', var: a.var, was, now: dm.vars[a.var] });
      break;
    }
    case 'set_state': dm.states[a.interactive] = a.state; note(dm, { k: 'set_state', interactive: a.interactive, state: a.state }); break;
    case 'start_encounter': startEncounter(dm, a.encounter, depth); break;
    case 'end_encounter': dm.encounters[a.encounter] = 'idle'; note(dm, { k: 'end_encounter', encounter: a.encounter }); break;
    case 'start_route': if (dm.npcs[a.npc]) dm.npcs[a.npc].route = a.route; note(dm, { k: 'start_route', npc: a.npc, route: a.route }); break;
    case 'stop_route': if (dm.npcs[a.npc]) dm.npcs[a.npc].route = null; note(dm, { k: 'stop_route', npc: a.npc }); break;
    case 'spawn_npc': case 'despawn_npc': if (dm.npcs[a.npc]) dm.npcs[a.npc].on = a.k === 'spawn_npc'; note(dm, { k: a.k, npc: a.npc }); break;
    case 'open_dialogue': openDialogue(dm, a.dialogue); break;
    case 'open_trade': dm.trade = a.trade; note(dm, { k: 'open_trade', trade: a.trade }); break;
    case 'give_item': if (!settled) giveStack(dm, a.item); note(dm, { k: 'give_item', item: a.item, text: stackName(a.item) }); break;
    case 'take_item': if (!settled) takeStack(dm, a.item); note(dm, { k: 'take_item', item: a.item, text: stackName(a.item) }); break;
    case 'give_gold': if (!settled) dm.gold += a.amount; note(dm, { k: 'give_gold', amount: a.amount }); break;
    case 'take_gold': if (!settled) dm.gold -= a.amount; note(dm, { k: 'take_gold', amount: a.amount }); break;
    case 'trigger_event':
      if (a.delayS > 0) { dm.queue.push({ at: dm.now + a.delayS, event: a.event }); note(dm, { k: 'queued', event: a.event, delayS: a.delayS }); }
      else runEvent(dm, a.event, { depth: depth + 1 });
      break;
    default: break;
  }
  void doc;
}

/**
 * Run an event. `branch` forces the branch (the service decided it), `settled` says the items and gold of the branch were
 * moved already. Answers `{ ran, branch }` or `{ ran: false, why }` ('missing', 'depth', 'items', 'gold', 'service': handed to the service).
 * @param {Dm} dm @param {string} key @param {{ branch?: 'then' | 'else', settled?: boolean, depth?: number }} [opts]
 */
export function runEvent(dm, key, { branch, settled = false, depth = 0 } = {}) {
  const ev = byKey(dm.doc.events, key);
  if (!ev) return { ran: false, why: 'missing' };
  if (depth > EVENT_DEPTH_MAX) { note(dm, { k: 'refused', event: key, why: 'depth' }); return { ran: false, why: 'depth' }; }
  const taken = branch ?? branchOf(ev, dm);
  const actions = (taken === 'then' ? ev.then : ev.else) ?? [];
  if (!settled && dm.service && needsService(dm.doc, actions)) {
    if (!dm.pending.includes(key)) dm.pending.push(key);
    note(dm, { k: 'to_service', event: key });
    return { ran: false, why: 'service' };
  }
  if (!settled) {
    const v = valueOf(actions);
    if (v.takeGold > dm.gold) { note(dm, { k: 'refused', event: key, why: 'gold' }); return { ran: false, why: 'gold' }; }
    const c = ctxOf(dm);
    for (const s of v.takeItems) if (c.count(s) < s.count) { note(dm, { k: 'refused', event: key, why: 'items' }); return { ran: false, why: 'items' }; }
  }
  note(dm, { k: 'event', event: key, name: ev.name ?? key, branch: taken });
  for (const a of actions) act(dm, a, depth, settled);
  return { ran: true, branch: taken };
}

/** Fire a trigger - `{ k: 'interact', interactive }`, `{ k: 'enter_area', interactive }`, `{ k: 'npc_talk', npc }`, `{ k: 'waypoint_reached', route, waypoint }` - and run each event listening to it. Answers the keys run. @param {Dm} dm @param {any} trigger */
export function fire(dm, trigger) {
  /** @type {string[]} */
  const ran = [];
  note(dm, { k: 'trigger', trigger });
  for (const ev of dm.doc.events ?? []) {
    const t = ev.trigger;
    if (!t || t.k !== trigger.k) continue;
    if (Object.keys(t).some((f) => f !== 'k' && t[f] !== trigger[f])) continue;
    if (runEvent(dm, ev.key).ran) ran.push(ev.key);
  }
  return ran;
}

/** Move the model's clock on: events queued with a delay that come due run, in order. Answers the keys run. @param {Dm} dm @param {number} dt */
export function advance(dm, dt) {
  dm.now += dt;
  /** @type {string[]} */
  const ran = [];
  for (;;) {
    const i = dm.queue.findIndex((q) => q.at <= dm.now);
    if (i < 0) break;
    const [q] = dm.queue.splice(i, 1);
    if (runEvent(dm, q.event).ran) ran.push(q.event);
  }
  return ran;
}

// ── encounters ──────────────────────────────────────────────────

/** @param {Dm} dm @param {string} key @param {number} depth */
function startEncounter(dm, key, depth) {
  const e = byKey(dm.doc.encounters, key);
  if (!e) return;
  dm.encounters[key] = 'active';
  note(dm, { k: 'start_encounter', encounter: key, foes: (e.spawns ?? []).reduce((/** @type {number} */ n, /** @type {any} */ s) => n + s.count, 0) });
  if (e.onStart) runEvent(dm, e.onStart, { depth: depth + 1 });
}

/** The encounter's rule is met (the game saw it; a sandbox presses the button): it ends and its completion event runs. @param {Dm} dm @param {string} key */
export function completeEncounter(dm, key) {
  const e = byKey(dm.doc.encounters, key);
  if (!e || dm.encounters[key] !== 'active') return false;
  dm.encounters[key] = e.respawn === 'on_reentry' ? 'idle' : 'done';
  note(dm, { k: 'encounter_done', encounter: key });
  if (e.onComplete) runEvent(dm, e.onComplete);
  return true;
}

// ── dialogues ───────────────────────────────────────────────────

/** @param {Dm} dm @param {string} key */
export function openDialogue(dm, key) {
  const d = byKey(dm.doc.dialogues, key);
  if (!d) return false;
  dm.dialogue = { dialogue: key, node: d.start };
  note(dm, { k: 'dialogue', dialogue: key, node: d.start });
  return true;
}

/** The node a dialogue stands at and the options the visitor may pick now (`when` holds, no cooldown running). @param {Dm} dm */
export function dialogueNow(dm) {
  if (!dm.dialogue) return null;
  const d = byKey(dm.doc.dialogues, dm.dialogue.dialogue);
  const node = byKey(d?.nodes, dm.dialogue.node);
  if (!node) return null;
  const c = ctxOf(dm);
  const options = (node.options ?? []).map((/** @type {any} */ o, /** @type {number} */ i) => ({ i, text: o.text, then: o.then, ok: evalWhen(o.when, c) && !(o.cooldownS && dm.now - (dm.optionAt[`${dm.dialogue?.dialogue}/${node.key}/${i}`] ?? -Infinity) < o.cooldownS) }))
    .filter((/** @type {any} */ o) => o.ok);
  return { say: node.say, node: node.key, options };
}

/**
 * Pick an option. goto and close are applied here; an event and a recipe run too unless `run` is false (the game settles
 * those on the service and runs them itself). Answers the option's `then`, or null for a pick that is not offered.
 * @param {Dm} dm @param {number} i @param {{ run?: boolean }} [opts]
 */
export function choose(dm, i, { run = true } = {}) {
  const now = dialogueNow(dm);
  const o = now?.options.find((/** @type {any} */ x) => x.i === i);
  if (!now || !dm.dialogue || !o) return null;
  dm.optionAt[`${dm.dialogue.dialogue}/${now.node}/${i}`] = dm.now;
  note(dm, { k: 'choose', text: o.text, then: o.then.k });
  const th = o.then;
  if (th.k === 'goto') { dm.dialogue.node = th.node; note(dm, { k: 'dialogue', dialogue: dm.dialogue.dialogue, node: th.node }); }
  else if (th.k === 'close') dm.dialogue = null;
  else if (th.k === 'open_trade') { dm.trade = th.trade; note(dm, { k: 'open_trade', trade: th.trade }); }
  else if (run && th.k === 'run_trade_recipe') runRecipe(dm, th.trade, th.recipe);
  else if (run && th.k === 'trigger_event') runEvent(dm, th.event);
  return th;
}

// ── trades ──────────────────────────────────────────────────────

/** Why a recipe cannot run on the model now (recipeWhy's words), or null. @param {Dm} dm @param {string} tradeKey @param {string} recipeKey */
export function recipeBlock(dm, tradeKey, recipeKey) {
  const r = byKey(byKey(dm.doc.trades, tradeKey)?.recipes, recipeKey);
  if (!r) return 'missing';
  return recipeWhy(r, { char: dm.char, player: dm.player, nowS: dm.now }, ctxOf(dm), claimOfDm(dm, `${tradeKey}/${recipeKey}`));
}

/** Run a recipe on the model, as the service would settle it. Answers `{ ok: true }` or `{ ok: false, why }`. @param {Dm} dm @param {string} tradeKey @param {string} recipeKey */
export function runRecipe(dm, tradeKey, recipeKey) {
  const why = recipeBlock(dm, tradeKey, recipeKey);
  if (why) { note(dm, { k: 'trade_refused', trade: tradeKey, recipe: recipeKey, why }); return { ok: false, why }; }
  const r = byKey(byKey(dm.doc.trades, tradeKey)?.recipes, recipeKey);
  for (const s of r.requireItems ?? []) takeStack(dm, s);
  dm.gold -= r.requireGold ?? 0;
  for (const s of r.rewardItems ?? []) giveStack(dm, s);
  dm.gold += r.rewardGold ?? 0;
  bump(dm, `${tradeKey}/${recipeKey}`, claimRule(r, { char: dm.char, player: dm.player, nowS: dm.now }));
  note(dm, { k: 'trade', trade: tradeKey, recipe: recipeKey, name: r.name, took: { items: r.requireItems ?? [], gold: r.requireGold ?? 0 }, gave: { items: r.rewardItems ?? [], gold: r.rewardGold ?? 0 } });
  if (r.onSuccessEvent) runEvent(dm, r.onSuccessEvent);
  return { ok: true };
}

// ── patrols ─────────────────────────────────────────────────────

/** Walking speed along a route, metres a second - a person's stroll. */
export const WALK_MPS = 1.4;

/**
 * A walker along a route: where it is, which waypoint it heads for, how long it still waits there. `mode`: loop, pingpong, once.
 * @param {any} route
 */
export function createWalker(route) {
  const first = route.waypoints?.[0]?.t ?? [0, 0, 0];
  return { route, at: 0, dir: 1, pos: /** @type {number[]} */ ([...first]), wait: route.waypoints?.[0]?.waitS ?? 0, done: false, arrived: /** @type {string[]} */ ([]) };
}

/**
 * Step a walker `dt` seconds. Answers the keys of waypoints reached in the step (`onArriveEvent` is the caller's to run).
 * @param {ReturnType<typeof createWalker>} w @param {number} dt @param {number} [speed]
 */
export function stepWalker(w, dt, speed = WALK_MPS) {
  /** @type {string[]} */
  const reached = [];
  const wps = w.route.waypoints ?? [];
  let left = dt;
  while (left > 0 && !w.done && wps.length > 1) {
    if (w.wait > 0) { const s = Math.min(w.wait, left); w.wait -= s; left -= s; continue; }
    const next = w.at + w.dir;
    if (next < 0 || next >= wps.length) {
      if (w.route.mode === 'loop') { w.at = -1; w.dir = 1; continue; }
      if (w.route.mode === 'pingpong') { w.dir = -w.dir; continue; }
      w.done = true; break;
    }
    const target = wps[next].t;
    const d = Math.hypot(target[0] - w.pos[0], target[1] - w.pos[1], target[2] - w.pos[2]);
    const reach = Math.max(0.05, wps[next].radius ?? 0.5);
    if (d <= reach) {
      w.at = next; w.pos = [...target]; w.wait = wps[next].waitS ?? 0;
      reached.push(wps[next].key);
      continue;
    }
    const go = Math.min(d, speed * left);
    for (let i = 0; i < 3; i++) w.pos[i] += (target[i] - w.pos[i]) * (go / d);
    left -= go / speed;
  }
  return reached;
}
