// @ts-check
// The in-game POI editor's DM panel: a wide dock over the world, toggled from the editor's bar, for the selected POI's
// people, routes, encounters, objects, dialogues, trades, events, and variables, with the event graph and the Sandbox.
// Every control writes the document through one editor step (poi/poiEdit.js), so it undoes, and the rules of what may
// be written are the law's (poi/poiLawV2.js, poi/poiTradeLaw.js): the open row's problems are listed under its form.
// The data work is poi/poiDmEdit.js's; this file draws the forms. A spot is picked with a click on the ground (the
// editor host's pickSpot), or taken from the ground under the eye ("Here"). While the panel is open the POI's routes,
// waypoints, encounter areas, zones, and objects are drawn in the world (poi/poiDmLines.js).

import { t } from '../../systems/textManager.js';
import { POI_ROUTE_MODES, POI_AGGRESSION, POI_RESPAWN, POI_COMPLETE_RULES, POI_INTERACTIVE_KINDS, POI_INTERACTIVE_STATES, POI_VAR_TYPES, POI_VAR_SCOPES, POI_VAR_OPS, POI_LIMIT_MODES, POI_ACTION_KINDS, POI_OPTION_KINDS, POI_TRIGGER_KINDS, POI_V2_LIMITS as LIM } from '../../poi/poiLawV2.js';
import { poiDocProblems } from '../../poi/poiLaw.js';
import { poiPayProblems } from '../../poi/poiTradeLaw.js';
import { problemText, problemWhere } from '../../poi/poiText.js';
import * as DM from '../../poi/poiDmEdit.js';
import { dmLines } from '../../poi/poiDmLines.js';
import { createPoiSandbox } from './poiSandbox.js';

export const POI_DM_STYLE_ID = 'dfpoi-dm-style';
export const POI_DM_CSS = `
.dfpoi-dm[hidden] { display: none; }
.dfpoi-dm { left: calc(16px + var(--dfpoi-left-w, 250px)); right: calc(16px + var(--dfpoi-right-w, 300px)); bottom: 40px; height: var(--dfpoi-dm-h, min(56vh, 600px)); padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.dfpoi-dm-tabs { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
.dfpoi-dm-body { display: flex; gap: 8px; flex: 1 1 auto; min-height: 0; }
.dfpoi-dm-list { flex: 0 0 180px; overflow: auto; }
.dfpoi-dm-form { flex: 1 1 auto; overflow: auto; min-width: 0; }
.dfpoi-dm .dfpoi-row > label { flex: 0 0 150px; }
.dfpoi-card { border: 1px solid #3a2f20; border-radius: 4px; padding: 4px 6px; margin: 4px 0; }
.dfpoi-nest { border-left: 2px solid #4b3c27; padding-left: 6px; margin: 3px 0; }
.dfpoi-dm-cols { display: flex; gap: 8px; } .dfpoi-dm-cols > div { flex: 1 1 0; min-width: 0; }
.dfpoi-dm-log { white-space: pre-wrap; max-height: 220px; overflow: auto; margin: 0; font: 11px/1.3 ui-monospace, monospace; }
.dfpoi-dm-graph { overflow: auto; max-height: 320px; }
.dfpoi-dm-graph .dfpoi-evnode { cursor: pointer; }
`;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** @type {Record<string, () => string>} */
const TAB = {
  npcs: () => t('poi.dm.tab.people', 'People'), routes: () => t('poi.dm.tab.routes', 'Routes'), encounters: () => t('poi.dm.tab.encounters', 'Encounters'),
  interactives: () => t('poi.dm.tab.objects', 'Objects'), dialogues: () => t('poi.dm.tab.dialogues', 'Dialogues'), trades: () => t('poi.dm.tab.trades', 'Trades'),
  events: () => t('poi.dm.tab.events', 'Events'), variables: () => t('poi.dm.tab.variables', 'Variables'), sandbox: () => t('poi.dm.tab.sandbox', 'Sandbox'),
};
/** @type {Record<string, () => string>} */
const WORD = {
  loop: () => t('poi.dm.w.loop', 'Loop'), pingpong: () => t('poi.dm.w.pingpong', 'There and back'), once: () => t('poi.dm.w.once', 'Once'),
  hostile: () => t('poi.dm.w.hostile', 'Attack on sight'), passive: () => t('poi.dm.w.passive', 'Fight only when attacked'),
  never: () => t('poi.dm.w.never', 'Never'), on_reentry: () => t('poi.dm.w.onReentry', 'When a player comes back'),
  all_dead: () => t('poi.dm.w.allDead', 'All enemies are dead'), leader_dead: () => t('poi.dm.w.leaderDead', 'The leader dies'), timer_survived: () => t('poi.dm.w.timer', 'The player holds out long enough'),
  chest: () => t('poi.dm.w.chest', 'Chest'), door: () => t('poi.dm.w.door', 'Door or gate'), switch: () => t('poi.dm.w.switch', 'Switch'), quest_object: () => t('poi.dm.w.questObject', 'Quest object'), trigger: () => t('poi.dm.w.zone', 'Zone'),
  boolean: () => t('poi.dm.w.boolean', 'True or false'), number: () => t('poi.dm.w.number', 'Number'), string: () => t('poi.dm.w.string', 'Text'),
  event: () => t('poi.dm.w.scopeEvent', 'One event run'), instance: () => t('poi.dm.w.scopeVisit', 'One visit'), character: () => t('poi.dm.w.scopeChar', 'Each character, saved'), poi_global: () => t('poi.dm.w.scopeAll', 'Everyone, saved'),
  unlimited: () => t('poi.dm.w.unlimited', 'No limit'), once_per_char: () => t('poi.dm.w.oncePerChar', 'Once per character'), once_per_account: () => t('poi.dm.w.oncePerAccount', 'Once per account'),
  daily_per_char: () => t('poi.dm.w.daily', 'Once a day per character'), global_stock: () => t('poi.dm.w.stock', 'Limited stock'),
  enter_area: () => t('poi.dm.w.enterArea', 'A player walks into a zone'), interact: () => t('poi.dm.w.interact', 'A player uses an object'), npc_talk: () => t('poi.dm.w.npcTalk', 'A player talks to a person'),
  waypoint_reached: () => t('poi.dm.w.waypoint', 'A person reaches a waypoint'), chained: () => t('poi.dm.w.chained', 'Another event or link starts it'),
};
/** @type {Record<string, () => string>} */
const ACTION_WORD = {
  say: () => t('poi.dm.a.say', 'Say a line'), set_var: () => t('poi.dm.a.setVar', 'Set a variable'), set_state: () => t('poi.dm.a.setState', 'Change an object'),
  start_encounter: () => t('poi.dm.a.startEnc', 'Start an encounter'), end_encounter: () => t('poi.dm.a.endEnc', 'End an encounter'),
  start_route: () => t('poi.dm.a.startRoute', 'Start a person walking'), stop_route: () => t('poi.dm.a.stopRoute', 'Stop a person walking'),
  spawn_npc: () => t('poi.dm.a.spawnNpc', 'Show a person'), despawn_npc: () => t('poi.dm.a.despawnNpc', 'Hide a person'),
  open_dialogue: () => t('poi.dm.a.openDialogue', 'Open a dialogue'), open_trade: () => t('poi.dm.a.openTrade', 'Open a trade'),
  give_item: () => t('poi.dm.a.giveItem', 'Give an item'), take_item: () => t('poi.dm.a.takeItem', 'Take an item'), give_gold: () => t('poi.dm.a.giveGold', 'Give gold'), take_gold: () => t('poi.dm.a.takeGold', 'Take gold'),
  trigger_event: () => t('poi.dm.a.runEvent', 'Run another event'),
};
/** @type {Record<string, () => string>} */
const OPTION_WORD = {
  goto: () => t('poi.dm.o.goto', 'Go to another line'), close: () => t('poi.dm.o.close', 'End the talk'), open_trade: () => t('poi.dm.o.openTrade', 'Open a trade'),
  run_trade_recipe: () => t('poi.dm.o.runRecipe', 'Run a trade recipe'), trigger_event: () => t('poi.dm.o.runEvent', 'Run an event'),
};
/** @type {Record<string, () => string>} */
const COND_WORD = { all: () => t('poi.dm.c.all', 'All of these'), any: () => t('poi.dm.c.any', 'Any of these'), has_item: () => t('poi.dm.c.hasItem', 'Has an item'), has_gold: () => t('poi.dm.c.hasGold', 'Has gold'), var: () => t('poi.dm.c.var', 'A variable') };

const w = (/** @type {string} */ k) => WORD[k]?.() ?? k;
const groupWord = DM.groupWord;

/** The DM collections, by tab; `npcs` is the people's, which this panel links but does not add or remove. */
const COLLS = ['npcs', 'routes', 'encounters', 'interactives', 'dialogues', 'trades', 'events', 'variables'];

/**
 * What the POI inspector still lists as not editable here, once this panel edits the DM content: the counts poiEdit.js
 * poiHeldOf makes, less the DM collections and the people's links.
 * @param {any} held poiHeldOf's
 */
export function heldNotEditable(held) {
  const kinds = { ...held.kinds };
  for (const k of COLLS) delete kinds[k];
  return { ...held, kinds, linked: 0 };
}
/** The DM fields a POI holds that this panel does not offer, as lines. @param {any} doc */
export function dmHeldLines(doc) {
  const h = DM.dmHeldOf(doc), out = [];
  if (h.patrols) out.push(t('poi.dm.held.patrols', '{n, plural, one {# spawn point has} other {# spawn points have}} a patrol route, which the game does not walk yet.', { n: h.patrols }));
  if (h.facing) out.push(t('poi.dm.held.facing', '{n, plural, one {# object has} other {# objects have}} a facing, which the game does not use.', { n: h.facing }));
  if (h.flatLooks) out.push(t('poi.dm.held.flatLooks', '{n, plural, one {# object looks} other {# objects look}} like a flat picture, which the game does not draw yet.', { n: h.flatLooks }));
  return out;
}

/** The sheet, once. @param {Document} doc */
function injectStyle(doc) {
  if (doc.getElementById?.(POI_DM_STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = POI_DM_STYLE_ID; s.textContent = POI_DM_CSS;
  (doc.head ?? doc.body).append(s);
}

/**
 * @param {{ doc?: Document, root: HTMLElement, edit: any, editor: any, say: (text: string, kind?: string) => void }} o
 */
export function createPoiDmPanel({ doc = document, root, edit, editor, say }) {
  injectStyle(doc);
  const el = (/** @type {string} */ tag, cls = '', /** @type {string | null} */ text = null) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (/** @type {string} */ text, /** @type {() => void} */ fn, cls = 'dfpoi-btn') => { const b = /** @type {HTMLButtonElement} */ (el('button', cls, text)); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation?.(); fn(); }); return b; };
  const dock = el('div', 'dfpoi-dock dfpoi-dm');
  const swallow = (/** @type {Event} */ e) => e.stopPropagation?.();
  for (const ty of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu', 'touchstart']) dock.addEventListener(ty, swallow);
  dock.hidden = true;
  root.append(dock);
  const ui = { on: false, tab: 'routes', key: /** @type {string | null} */ (null) };
  const sandbox = createPoiSandbox({ doc, getDoc: () => getDoc(), el, btn, redraw: () => schedule() });

  const id = () => edit.selection()?.id ?? null;
  const getDoc = () => { const i = id(); return i ? edit.docOf(i) : null; };

  // ── drawing again: after a change, never while a field is typed in, never under a press ──
  let queued = false, pressAt = -Infinity, gone = false;
  dock.addEventListener('pointerdown', () => { pressAt = Date.now(); }, true);
  dock.addEventListener('pointerup', () => { setTimeout(() => { pressAt = -Infinity; schedule(); }, 0); }, true);
  dock.addEventListener('focusout', () => schedule());
  const typing = () => { const a = /** @type {any} */ (doc.activeElement); return !!a && dock.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'button'].includes(a.type))); };
  function schedule() {
    if (queued || gone) return;
    queued = true;
    Promise.resolve().then(() => {
      queued = false;
      if (!ui.on || gone) return;
      if (Date.now() - pressAt < 1500 || typing()) { setTimeout(schedule, 120); return; }
      render();
    });
  }
  const offEdit = edit.onChange(() => schedule());

  // ── reading and writing the document by path ──
  // a path step is a property name, an index, or { key } to find a row of an array by its key
  const step = (/** @type {any} */ o, /** @type {any} */ s) => (o == null ? undefined : typeof s === 'object' ? o.find?.((/** @type {any} */ r) => r.key === s.key) : o[s]);
  const get = (/** @type {any} */ d, /** @type {any[]} */ path) => path.reduce(step, d);
  /** One step of the undo; answers what `fn` answered (a refusal is said). @param {(d: any) => any} fn */
  const run = (fn) => {
    const i = id();
    if (!i) return null;
    let out = null;
    edit.edit(i, 'dm', (/** @type {any} */ d) => { out = fn(d); });
    if (out?.refused) say(out.refused, 'bad');
    return out;
  };
  const put = (/** @type {any[]} */ path, /** @type {any} */ v) => run((d) => { const parent = get(d, path.slice(0, -1)), last = path.at(-1); if (parent == null) return; if (v === undefined) delete parent[last]; else parent[last] = v; });
  /** A change tried on a copy first: a refusal is said and nothing is changed. @param {(d: any) => any} fn */
  const tryRun = (fn) => { const d = getDoc(); if (!d) return; const r = fn(structuredClone(d)); if (r?.refused) { say(r.refused, 'bad'); return; } run(fn); };

  // ── controls ──
  const row = (/** @type {string} */ label, /** @type {any[]} */ ...kids) => { const r = el('div', 'dfpoi-row'); const l = el('label', '', label); r.append(l, ...kids.filter(Boolean)); r.dataset.f = label; return r; };
  const section = (/** @type {string} */ text) => el('div', 'dfpoi-h', text);
  const note = (/** @type {string} */ text) => el('div', 'dfpoi-sub', text);
  const input = (/** @type {string} */ type, /** @type {any} */ value, /** @type {(v: string) => void} */ commit) => { const i = /** @type {HTMLInputElement} */ (el('input')); i.type = type; i.value = value == null ? '' : String(value); i.addEventListener('change', () => commit(i.value)); return i; };
  const text = (/** @type {string} */ label, /** @type {any[]} */ path, /** @type {any} */ value, max = 48) => { const i = input('text', value, (v) => { const s = v.trim(); if (s) put(path, s.slice(0, max)); }); i.maxLength = max; i.className = 'dfpoi-grow'; return row(label, i); };
  const para = (/** @type {string} */ label, /** @type {any[]} */ path, /** @type {any} */ value) => {
    const a = /** @type {HTMLTextAreaElement} */ (el('textarea')); a.rows = 2; a.maxLength = LIM.text; a.value = value ?? '';
    a.addEventListener('change', () => { const s = a.value.trim(); if (s) put(path, s); });
    const r = row(label); r.append(a); return r;
  };
  /** @param {string} label @param {any[]} path @param {any} value @param {{ min?: number, max?: number, step?: number, whole?: boolean, none?: boolean }} [o] */
  const num = (label, path, value, { min, max, step: st = 1, whole = true, none = false } = {}) => {
    const i = input('number', value, (raw) => {
      if (raw.trim() === '' && none) { put(path, undefined); return; }
      let v = Number(raw);
      if (!Number.isFinite(v)) return;
      if (whole) v = Math.round(v);
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      put(path, v);
    });
    i.step = String(st);
    if (none) i.placeholder = t('poi.dm.none', 'none');
    return row(label, i);
  };
  /** @param {string} label @param {any[] | null} path @param {any} value @param {[any, string][]} options @param {{ none?: string | null, onPick?: ((v: string) => void) | null }} [o] */
  const select = (label, path, value, options, { none = null, onPick = null } = {}) => {
    const s = /** @type {HTMLSelectElement} */ (el('select'));
    const add = (/** @type {any} */ v, /** @type {string} */ tx) => { const op = /** @type {HTMLOptionElement} */ (el('option', '', tx)); op.value = String(v); if (String(v) === String(value ?? '')) op.selected = true; s.append(op); };
    if (none) add('', none);
    for (const [v, tx] of options) add(v, tx);
    if (value !== undefined && value !== '' && !options.some(([v]) => String(v) === String(value))) add(value, t('poi.dm.missingRow', '{key} (missing)', { key: String(value) }));
    s.addEventListener('change', () => { const v = s.value; if (onPick) onPick(v); else if (path) put(path, v === '' ? undefined : v); });
    return row(label, s);
  };
  const words = (/** @type {readonly string[]} */ list) => /** @type {[string, string][]} */ (list.map((k) => [k, w(k)]));
  const rowsOf = (/** @type {string} */ coll) => /** @type {[string, string][]} */ ((getDoc()?.[coll] ?? []).map((/** @type {any} */ r) => [r.key, r.name ?? r.key]));
  const ref = (/** @type {string} */ label, /** @type {any[]} */ path, /** @type {any} */ value, /** @type {string} */ coll, /** @type {string | null} */ none = null) => select(label, path, value, rowsOf(coll), { none });
  /** A spot in the POI's own frame: three numbers, Pick (a click on the ground), and Here (the ground under the eye). */
  const point = (/** @type {string} */ label, /** @type {any[]} */ path, /** @type {number[]} */ value) => {
    const r = row(label, ...value.map((c, i) => input('number', Number(c.toFixed?.(2) ?? c), (raw) => { const v = Number(raw); if (Number.isFinite(v)) put([...path, i], r3(v)); })));
    r.append(btn(t('poi.dm.pick', 'Pick'), () => { const i = id(); if (!i) return; editor.pickSpot?.(i, (/** @type {number[]} */ p) => put(path, p.map(r3))); say(t('poi.dm.pickHint', 'Click the ground where it goes. Esc to stop.')); }),
      btn(t('poi.dm.here', 'Here'), () => { const p = here(); if (p) put(path, p); }));
    return r;
  };
  /** The ground under the eye in the POI's frame, or null (said) while it is not built. */
  const here = () => { const i = id(); const p = i ? editor.spotUnderEye?.(i) : null; if (!p) { say(t('poi.dm.noGround', 'The ground under the eye is not ready yet.'), 'bad'); return null; } return p.map(r3); };

  // an item stack: the game's item, its group where it has more than one, its material where it takes one, a count
  const itemPick = (/** @type {any} */ stack, /** @type {any[]} */ path, /** @type {string} */ label, { counted = true } = {}) => {
    const s = /** @type {HTMLSelectElement} */ (el('select'));
    let group = null, og = null;
    for (const it of DM.itemChoices()) {
      if (it.group !== group) { group = it.group; og = /** @type {HTMLOptGroupElement} */ (el('optgroup')); og.label = DM.groupWord(group); s.append(og); }
      const op = /** @type {HTMLOptionElement} */ (el('option', '', it.name)); op.value = String(it.template); if (it.template === stack.template) op.selected = true; og?.append(op);
    }
    if (!DM.itemChoices().some((it) => it.template === stack.template)) { const op = /** @type {HTMLOptionElement} */ (el('option', '', t('poi.dm.itemUnknown', 'item {n} (not known)', { n: stack.template }))); op.value = String(stack.template); op.selected = true; s.append(op); }
    // Explain in the picker why potions and gold are not offered (see DM.itemChoices).
    const off = /** @type {HTMLOptGroupElement} */ (el('optgroup')); off.label = t('poi.dm.notOffered', 'Not offered');
    for (const tx of [t('poi.dm.noPotion', 'Potions: a potion is a bottle with a recipe, and a recipe cannot be set here'), t('poi.dm.noGold', 'Gold: give or take it as an amount')]) {
      const op = /** @type {HTMLOptionElement} */ (el('option', '', tx)); op.disabled = true; op.value = ''; off.append(op);
    }
    s.append(off);
    const change = (/** @type {any} */ to) => run((d) => { const x = get(d, path); if (x) DM.setStackItem(x, to); });
    s.addEventListener('change', () => change({ template: Number(s.value) }));
    const r = row(label, s);
    const groups = DM.itemGroups(stack.template);
    if (groups.length > 1) {
      const g = /** @type {HTMLSelectElement} */ (el('select'));
      for (const x of groups) { const op = /** @type {HTMLOptionElement} */ (el('option', '', groupWord(x))); op.value = x; if (x === (stack.group ?? groups[0])) op.selected = true; g.append(op); }
      g.addEventListener('change', () => change({ group: g.value }));
      r.append(g);
    }
    const mats = DM.materialChoices(stack.group ?? groups[0] ?? '');
    if (mats.length) {
      const m = /** @type {HTMLSelectElement} */ (el('select'));
      const none = /** @type {HTMLOptionElement} */ (el('option', '', t('poi.dm.anyMaterial', 'any material'))); none.value = ''; m.append(none);
      for (const [v, tx] of mats) { const op = /** @type {HTMLOptionElement} */ (el('option', '', tx)); op.value = String(v); if (v === stack.material) op.selected = true; m.append(op); }
      m.addEventListener('change', () => change({ material: m.value === '' ? null : Number(m.value) }));
      r.append(m);
    }
    if (counted) {
      const c = input('number', stack.count ?? 1, (raw) => { const v = Math.round(Number(raw)); if (v >= 1) put([...path, 'count'], Math.min(99999, v)); });
      c.min = '1'; c.title = t('poi.dm.howMany', 'How many');
      r.append(c);
    }
    return r;
  };
  const stacks = (/** @type {string} */ label, /** @type {any[]} */ path, /** @type {any[]} */ list) => {
    const box = el('div');
    list.forEach((s, i) => { const r = itemPick(s, [...path, i], label); r.append(btn('x', () => run((d) => { get(d, path).splice(i, 1); }))); box.append(r); });
    const add = btn(t('poi.dm.addItem', 'Add an item'), () => run((d) => { const a = get(d, path); if (a.length < LIM.stacks) a.push({ template: 71, count: 1 }); else return { refused: t('poi.dm.maxHere', 'At most {max, number} here.', { max: LIM.stacks }) }; return null; }));
    add.disabled = list.length >= LIM.stacks;
    box.append(add);
    return box;
  };

  // a condition tree, edited in place
  function cond(/** @type {string} */ label, /** @type {any[]} */ path, /** @type {any} */ c, /** @type {(() => void) | null} */ onDrop = null) {
    const box = el('div', 'dfpoi-nest');
    box.append(select(label, null, c?.k, Object.entries(COND_WORD).map(([k, f]) => /** @type {[string, string]} */ ([k, f()])), {
      none: t('poi.dm.always', 'Always'), onPick: (v) => (v === '' ? (onDrop ? onDrop() : put(path, undefined)) : put(path, DM.conditionOf(getDoc(), v))),
    }));
    if (!c) return box;
    if (c.k === 'all' || c.k === 'any') {
      const size = DM.conditionSize(c);
      (c.of ?? []).forEach((/** @type {any} */ x, /** @type {number} */ i) => box.append(cond(`${i + 1}.`, [...path, 'of', i], x, () => run((d) => { get(d, [...path, 'of']).splice(i, 1); }))));
      const add = btn(t('poi.dm.addCondition', 'Add a condition'), () => run((d) => { const o = get(d, [...path, 'of']); if (o.length < LIM.conditions) o.push(DM.conditionOf(d, 'has_gold')); }));
      add.disabled = size.leaves >= LIM.conditions || size.depth > LIM.conditionDepth;
      box.append(add);
    } else if (c.k === 'has_item') box.append(itemPick(c.item, [...path, 'item'], t('poi.dm.item', 'Item')));
    else if (c.k === 'has_gold') box.append(num(t('poi.dm.gold', 'Gold'), [...path, 'amount'], c.amount, { min: 1, max: 1_000_000 }));
    else {
      const v = getDoc()?.variables?.find((/** @type {any} */ x) => x.key === c.var);
      box.append(ref(t('poi.dm.variable', 'Variable'), [...path, 'var'], c.var, 'variables'));
      box.append(select(t('poi.dm.is', 'Is'), [...path, 'op'], c.op, (v && v.type !== 'number' ? ['eq', 'ne'] : POI_VAR_OPS).map((k) => /** @type {[string, string]} */ ([k, DM.opWord(k)]))));
      box.append(valueIn(t('poi.dm.value', 'Value'), [...path, 'value'], c.value, v?.type ?? typeof c.value));
    }
    return box;
  }
  const valueIn = (/** @type {string} */ label, /** @type {any[]} */ path, /** @type {any} */ value, /** @type {string} */ type) => (type === 'boolean'
    ? select(label, null, String(value), [['true', t('poi.dm.true', 'True')], ['false', t('poi.dm.false', 'False')]], { onPick: (v) => put(path, v === 'true') })
    : type === 'number' ? num(label, path, value, { whole: false })
      : (() => { const i = input('text', value, (v) => put(path, v.slice(0, 48))); i.maxLength = 48; return row(label, i); })());

  // ── the open row's problems, said where they are ──
  /** Returns the keys of an encounter's start and end events, and of any events those trigger directly.
   *  @param {any} d @param {any} e */
  function linkedEvents(d, e) {
    const out = new Set([e?.onStart, e?.onComplete].filter(Boolean));
    for (const k of [...out]) for (const a of [...(d.events?.find((/** @type {any} */ x) => x.key === k)?.then ?? []), ...(d.events?.find((/** @type {any} */ x) => x.key === k)?.else ?? [])]) if (a.k === 'trigger_event') out.add(a.event);
    return out;
  }
  function rowProblems(/** @type {string} */ coll, /** @type {number} */ index) {
    const d = getDoc();
    if (!d || index < 0) return [];
    const own = (/** @type {string} */ c, /** @type {number} */ i) => (/** @type {any} */ p) => p.path === `${c}[${i}]` || p.path.startsWith(`${c}[${i}].`) || p.path.startsWith(`${c}[${i}][`);
    // An encounter's form also lists problems on its start and end events and the events they trigger, so it does
    // not report "Nothing is wrong with it." while a linked event blocks saving.
    const mine = [own(coll, index)];
    if (coll === 'encounters') for (const k of linkedEvents(d, d.encounters[index])) mine.push(own('events', (d.events ?? []).findIndex((/** @type {any} */ x) => x.key === k)));
    const ps = poiPayProblems(d, poiDocProblems(d)).filter((p) => mine.some((f) => f(p)));
    if (!ps.length) return [el('div', 'dfpoi-ok', t('poi.dm.rowOk', 'Nothing is wrong with it.'))];
    return [section(t('poi.editor.problems', 'What is wrong')), ...ps.slice(0, 20).map((p) => { const r = el('div', 'dfpoi-problem'); const where = problemWhere(p.path, d); r.textContent = where ? `${where}: ${problemText(p)}` : problemText(p); r.title = p.path; return r; })];
  }

  // ── lists ──
  function listPane(/** @type {string} */ coll, /** @type {any[]} */ kids, /** @type {{ add?: (() => void) | null, extra?: any }} */ { add = null, extra = null } = {}) {
    const d = getDoc(), rows = d?.[coll] ?? [];
    const left = el('div', 'dfpoi-dm-list');
    const limit = /** @type {any} */ (DM.DM_COLLECTIONS)[coll];
    left.append(el('div', 'dfpoi-h', limit ? t('poi.dm.countOf', '{name} ({n, number} of {max, number})', { name: TAB[coll](), n: rows.length, max: limit }) : TAB[coll]()));
    for (const r of rows) {
      const it = el('div', 'dfpoi-item', r.name ?? r.key);
      it.setAttribute('aria-selected', String(ui.key === r.key));
      it.title = r.key;
      it.addEventListener('click', () => { ui.key = r.key; render(); });
      left.append(it);
    }
    const bar = el('div', 'dfpoi-row');
    if (add) { const b = btn(t('poi.dm.add', 'Add'), add); b.disabled = limit !== undefined && rows.length >= limit; bar.append(b); }
    if (coll !== 'npcs' && ui.key && rows.some((/** @type {any} */ r) => r.key === ui.key)) bar.append(btn(t('poi.dm.delete', 'Delete'), () => { const k = ui.key; tryRun((dd) => DM.removeRow(dd, coll, k)); ui.key = null; }));
    if (extra) bar.append(extra);
    left.append(bar);
    const form = el('div', 'dfpoi-dm-form');
    const index = rows.findIndex((/** @type {any} */ r) => r.key === ui.key);
    form.append(...kids.filter(Boolean), ...(index >= 0 ? rowProblems(coll, index) : []));
    const body = el('div', 'dfpoi-dm-body');
    body.append(left, form);
    return body;
  }
  /** Add a row with a fresh name, and open it. @param {(d: any, name: string) => any} make @param {string} name */
  const adder = (make, name) => () => { const r = run((d) => make(d, name)); if (r?.row) { ui.key = r.row.key; render(); } };
  const here0 = () => { const i = id(); return (i && editor.spotUnderEye?.(i)?.map(r3)) ?? [0, 0, 0]; };

  // ── tabs ──
  // Only the fields the game acts on are offered: a spawn point's patrol route, an object's facing, and a flat picture
  // look are not (the POI inspector lists them when a POI from the World Builder holds them).
  /** @type {Record<string, () => any>} */
  const tabs = {
    npcs() {
      const d = getDoc(), n = d.npcs?.find((/** @type {any} */ x) => x.key === ui.key) ?? null, p = ['npcs', { key: ui.key }];
      return listPane('npcs', n ? [
        section(n.name), note(t('poi.dm.peopleHint', 'Add and place people with the bar\'s Person button. Here they get a route, a dialogue, a trade, a talk range, and when they are shown.')),
        ref(t('poi.dm.walksRoute', 'Walks route'), [...p, 'route'], n.route, 'routes', t('poi.dm.none', 'none')),
        ref(t('poi.dm.dialogue', 'Dialogue'), [...p, 'dialogue'], n.dialogue, 'dialogues', t('poi.dm.none', 'none')),
        ref(t('poi.dm.trade', 'Trade'), [...p, 'trade'], n.trade, 'trades', t('poi.dm.none', 'none')),
        num(t('poi.dm.talkRange', 'Talk range (m)'), [...p, 'radius'], n.radius, { min: 1, max: 20, none: true, whole: false, step: 0.5 }),
        cond(t('poi.dm.shownWhen', 'Shown only when'), [...p, 'showWhen'], n.showWhen),
      ] : [note(d.npcs?.length ? t('poi.dm.pickPerson', 'Pick a person.') : t('poi.dm.noPeople', 'This POI has no people yet. Add one with the bar\'s Person button.'))]);
    },
    routes() {
      const d = getDoc(), r = d.routes?.find((/** @type {any} */ x) => x.key === ui.key) ?? null, p = ['routes', { key: ui.key }];
      const kids = r ? [
        section(r.name), text(t('poi.dm.name', 'Name'), [...p, 'name'], r.name), select(t('poi.dm.walk', 'Walk'), [...p, 'mode'], r.mode, words(POI_ROUTE_MODES)),
        row(t('poi.dm.waitAll', 'Wait at every stop (s)'), input('number', '', (raw) => { const v = Number(raw); if (Number.isFinite(v)) run((dd) => { DM.setWaitAll(get(dd, p), v); }); })),
        note(t('poi.dm.waypointsOf', '{n, number} of {max, number} waypoints. The path is drawn in the world.', { n: r.waypoints.length, max: LIM.waypoints })),
        DM.loopStopsTwice(r) ? note(t('poi.dm.loopTwice', 'A loop walks back to the first waypoint on its own, so a last waypoint on that spot makes the person stop there twice. Remove it to stop once.')) : null,
        ...r.waypoints.map((/** @type {any} */ wp, /** @type {number} */ i) => {
          const wpp = [...p, 'waypoints', { key: wp.key }];
          const card = el('div', 'dfpoi-card');
          const head = el('div', 'dfpoi-row');
          const name = input('text', wp.name, (v) => { if (v.trim()) put([...wpp, 'name'], v.trim().slice(0, 48)); });
          name.className = 'dfpoi-grow';
          const up = btn(t('poi.dm.up', 'Up'), () => run((dd) => { DM.shiftWaypoint(get(dd, p), wp.key, -1); })); up.disabled = i === 0;
          const down = btn(t('poi.dm.down', 'Down'), () => run((dd) => { DM.shiftWaypoint(get(dd, p), wp.key, 1); })); down.disabled = i === r.waypoints.length - 1;
          const del = btn('x', () => tryRun((dd) => DM.removeWaypoint(dd, r.key, wp.key))); del.title = t('poi.dm.removeWaypoint', 'Remove this waypoint'); del.disabled = r.waypoints.length < 3;
          head.append(el('b', '', `${i + 1}.`), name, up, down, del);
          card.append(head, point(t('poi.dm.spot', 'Spot'), [...wpp, 't'], wp.t),
            num(t('poi.dm.reach', 'Reached within (m)'), [...wpp, 'radius'], wp.radius, { min: 0.5, max: 50, whole: false, step: 0.5 }),
            num(t('poi.dm.wait', 'Wait (s)'), [...wpp, 'waitS'], wp.waitS, { min: 0, max: 3600 }),
            ref(t('poi.dm.whenReached', 'When reached, run'), [...wpp, 'onArriveEvent'], wp.onArriveEvent, 'events', t('poi.dm.nothing', 'nothing')));
          return card;
        }),
        (() => { const b = btn(t('poi.dm.addWaypointHere', 'Add a waypoint here'), () => { const pt = here(); if (pt) run((dd) => DM.addWaypoint(get(dd, p), pt)); }); b.disabled = r.waypoints.length >= LIM.waypoints; return b; })(),
        (() => { const b = btn(t('poi.dm.addWaypointPick', 'Add a waypoint on the ground...'), () => { const i = id(); if (!i) return; editor.pickSpot?.(i, (/** @type {number[]} */ pt) => run((dd) => DM.addWaypoint(get(dd, p), pt))); say(t('poi.dm.pickHint', 'Click the ground where it goes. Esc to stop.')); }); b.disabled = r.waypoints.length >= LIM.waypoints; return b; })(),
        note(t('poi.dm.waypointDragHint', 'A waypoint is moved by its numbers, Pick, or Here, not by the world\'s handles.')),
      ] : [note(t('poi.dm.pickRoute', 'Pick a route or add one.'))];
      return listPane('routes', kids, { add: adder((dd, name) => DM.addRoute(dd, name, here0()), t('poi.dm.newRoute', 'Route')) });
    },
    encounters() {
      const d = getDoc(), e = d.encounters?.find((/** @type {any} */ x) => x.key === ui.key) ?? null, p = ['encounters', { key: ui.key }];
      const kids = e ? [
        section(e.name), text(t('poi.dm.name', 'Name'), [...p, 'name'], e.name), point(t('poi.dm.center', 'Center'), [...p, 'center'], e.center),
        num(t('poi.dm.encRadius', 'Starts when a player comes within (m)'), [...p, 'radius'], e.radius, { min: 1, max: 500, whole: false }),
        select(t('poi.dm.aggression', 'Its enemies'), [...p, 'aggression'], e.aggression, words(POI_AGGRESSION)),
        (() => {
          const c = /** @type {HTMLInputElement} */ (el('input')); c.type = 'checkbox'; c.checked = e.pacifiable !== false;
          c.title = t('poi.dm.pacifiableHint', 'When unchecked, language skills and Pacify or Charm spells do not work on these enemies.');
          c.addEventListener('change', () => run((dd) => { DM.setPacifiable(get(dd, p), c.checked); }));
          return row(t('poi.dm.pacifiable', 'Enemies can be pacified'), c);
        })(),
        select(t('poi.dm.respawn', 'Starts again'), [...p, 'respawn'], e.respawn, words(POI_RESPAWN)),
        ...wonRows(d, e),
        select(t('poi.dm.endsWhen', 'Ends when'), null, e.complete.rule, words(POI_COMPLETE_RULES), { onPick: (v) => run((dd) => { DM.setComplete(get(dd, p), v); }) }),
        e.complete.rule === 'leader_dead' ? select(t('poi.dm.leader', 'Leader'), [...p, 'complete', 'leader'], e.complete.leader, e.spawns.map((/** @type {any} */ s) => /** @type {[string, string]} */ ([s.key, `${s.key} (${DM.foeName(s.foe)})`]))) : null,
        e.complete.rule === 'timer_survived' ? num(t('poi.dm.seconds', 'Seconds inside its area'), [...p, 'complete', 'seconds'], e.complete.seconds, { min: 1, max: 3600 }) : null,
        ref(t('poi.dm.onStart', 'When it starts, run'), [...p, 'onStart'], e.onStart, 'events', t('poi.dm.nothing', 'nothing')),
        ref(t('poi.dm.onEnd', 'When it ends, run'), [...p, 'onComplete'], e.onComplete, 'events', t('poi.dm.nothing', 'nothing')),
        note(t('poi.dm.foesOf', '{n, number} of {max, number} enemies, {s, number} of {smax, number} spawn points. An event can also start it. A level is optional.', { n: DM.foeCount(e), max: LIM.foesPerEncounter, s: e.spawns.length, smax: LIM.spawns })),
        ...e.spawns.map((/** @type {any} */ s) => {
          const sp = [...p, 'spawns', { key: s.key }];
          const card = el('div', 'dfpoi-card');
          const head = el('div', 'dfpoi-row');
          const del = btn('x', () => run((dd) => { DM.removeSpawn(get(dd, p), s.key); })); del.disabled = e.spawns.length < 2;
          head.append(el('b', '', s.key), del);
          // Let the builder edit the spawn key; default keys still follow the chosen enemy's name.
          const key = keyInput(s.key, () => !!getDoc()?.encounters?.find((/** @type {any} */ x) => x.key === e.key)?.spawns?.some((/** @type {any} */ x) => x.key === s.key),
            (to) => run((dd) => DM.renameSpawnKey(get(dd, p), s.key, to)));
          card.append(head,
            select(t('poi.dm.enemy', 'Enemy'), null, s.foe, DM.FOES.map((f) => /** @type {[number, string]} */ ([f.id, f.name])), { onPick: (v) => run((dd) => DM.setSpawnFoe(get(dd, p), s.key, Number(v))) }),
            row(t('poi.dm.key', 'Key'), key),
            num(t('poi.dm.howMany', 'How many'), [...sp, 'count'], s.count, { min: 1, max: LIM.foesPerSpawn }),
            num(t('poi.dm.level', 'Level (optional)'), [...sp, 'level'], s.level, { min: 1, max: 99, none: true }),
            point(t('poi.dm.spot', 'Spot'), [...sp, 'at'], s.at),
            num(t('poi.dm.spread', 'Spread (m)'), [...sp, 'spread'], s.spread, { min: 0, max: 50, whole: false, step: 0.5 }));
          return card;
        }),
        (() => { const b = btn(t('poi.dm.addSpawn', 'Add a spawn point here'), () => { const pt = here(); if (pt) run((dd) => DM.addSpawn(get(dd, p), 136, 1, pt)); }); b.disabled = e.spawns.length >= LIM.spawns; return b; })(),
      ] : [note(t('poi.dm.pickEncounter', 'Pick an encounter or add one.'))];
      return listPane('encounters', kids, { add: adder((dd, name) => DM.addEncounter(dd, name, here0()), t('poi.dm.newEncounter', 'Encounter')) });
    },
    interactives() {
      const d = getDoc(), o = d.interactives?.find((/** @type {any} */ x) => x.key === ui.key) ?? null, p = ['interactives', { key: ui.key }];
      const kept = (d.variables ?? []).filter((/** @type {any} */ v) => v.type === 'string' && (v.scope === 'character' || v.scope === 'poi_global'));
      const kids = o ? [
        section(o.name), text(t('poi.dm.name', 'Name'), [...p, 'name'], o.name),
        select(t('poi.dm.kind', 'Kind'), null, o.kind, words(POI_INTERACTIVE_KINDS), { onPick: (v) => run((dd) => { DM.setInteractiveKind(get(dd, p), v); }) }),
        select(t('poi.dm.starts', 'Starts'), [...p, 'state'], o.state, /** @type {any} */ (POI_INTERACTIVE_STATES)[o.kind].map((/** @type {string} */ s) => [s, DM.stateWord(s, o.kind)])),
        o.kind !== 'trigger' ? select(t('poi.dm.looksLike', 'Looks like'), null, o.appearance?.k === 'part' ? o.appearance.key : '', (d.parts ?? []).map((/** @type {any} */ x) => /** @type {[string, string]} */ ([x.key, x.name || x.key])), {
          none: t('poi.dm.lookNone', 'Nothing (used at its spot)'), onPick: (v) => put([...p, 'appearance'], v === '' ? { k: 'none' } : { k: 'part', key: v }),
        }) : null,
        o.appearance?.k === 'part' ? note(o.kind === 'door' ? t('poi.dm.lookDoor', 'It is used where that part stands. Open, the part is not drawn and does not block.') : t('poi.dm.lookPart', 'It is used where that part stands.')) : point(t('poi.dm.spot', 'Spot'), [...p, 't'], o.t),
        num(o.kind === 'trigger' ? t('poi.dm.zoneRadius', 'Zone radius (m)') : t('poi.dm.useReach', 'Used from within (m)'), [...p, 'radius'], o.radius, { min: 0.5, max: 200, whole: false, step: 0.5 }),
        o.kind === 'door' || o.kind === 'chest' ? note(t('poi.dm.doorHint', 'Using a closed one opens it; using an open door shuts it. A locked one opens with its key item, or by an event.')) : null,
        o.kind === 'switch' ? note(t('poi.dm.switchHint', 'A switch is off or on, and each use flips it, then its events run. With a key item, only a player who holds the key can use it.')) : null,
        o.kind === 'quest_object' ? note(t('poi.dm.questHint', 'While inactive it cannot be used. With a key item, only a player who holds the key can use it.')) : null,
        o.kind !== 'trigger' ? (o.keyItem
          ? (() => { const r = itemPick(o.keyItem, [...p, 'keyItem'], t('poi.dm.keyItem', 'Key item')); r.append(btn('x', () => put([...p, 'keyItem'], undefined))); return r; })()
          : btn(t('poi.dm.needsKey', 'Needs a key item'), () => put([...p, 'keyItem'], { template: 71, count: 1 }))) : null,
        select(t('poi.dm.stateVar', 'State saved in'), [...p, 'stateVar'], o.stateVar, kept.map((/** @type {any} */ v) => /** @type {[string, string]} */ ([v.key, v.name ?? v.key])), { none: t('poi.dm.stateVarNone', 'not saved (each visit starts as set above)') }),
        note(t('poi.dm.stateVarHint', 'A persistent text variable carries the object\'s state from visit to visit. An event sets it to a state\'s name, such as open or locked, and the object takes it. For a switch, it holds inactive (off) or active (on).')),
        // The law takes only a persistent text variable here. Say why when the POI has a persistent true-or-false or
        // number variable, and offer to make a text one for the object while it has none.
        (d.variables ?? []).some((/** @type {any} */ v) => v.type !== 'string' && (v.scope === 'character' || v.scope === 'poi_global'))
          ? note(t('poi.dm.stateVarOnlyText', 'True-or-false and number variables are not offered: a state is a word, so only a text variable holds it. To open this when something is true, set a text variable to a state in the same event.')) : null,
        o.stateVar ? null : btn(t('poi.dm.stateVarMake', 'Make persistent text variable'), () => run((dd) => DM.addStateVariable(dd, o.key))),
        note(o.kind === 'trigger' ? t('poi.dm.zoneHint', 'A zone starts events when a player walks in. Make an event that starts when a player walks into a zone.') : t('poi.dm.objectHint', 'Events can start when a player uses this object.')),
      ] : [note(t('poi.dm.pickObject', 'Pick an object or add one.'))];
      const kind = /** @type {HTMLSelectElement} */ (el('select'));
      for (const k of POI_INTERACTIVE_KINDS) { const op = /** @type {HTMLOptionElement} */ (el('option', '', w(k))); op.value = k; kind.append(op); }
      return listPane('interactives', kids, { add: () => { const r = run((dd) => DM.addInteractive(dd, kind.value, w(kind.value), here0())); if (r?.row) { ui.key = r.row.key; render(); } }, extra: kind });
    },
    dialogues() {
      const d = getDoc(), dl = d.dialogues?.find((/** @type {any} */ x) => x.key === ui.key) ?? null, p = ['dialogues', { key: ui.key }];
      const kids = dl ? [
        section(dl.name), text(t('poi.dm.name', 'Name'), [...p, 'name'], dl.name),
        select(t('poi.dm.startsAt', 'Starts at'), [...p, 'start'], dl.start, dl.nodes.map((/** @type {any} */ n) => /** @type {[string, string]} */ ([n.key, n.key]))),
        ...dl.nodes.map((/** @type {any} */ n) => {
          const np = [...p, 'nodes', { key: n.key }];
          const card = el('div', 'dfpoi-card');
          const head = el('div', 'dfpoi-row');
          const del = btn(t('poi.dm.deleteLine', 'Delete line'), () => tryRun((dd) => DM.removeNode(get(dd, p), n.key))); del.disabled = dl.nodes.length < 2;
          head.append(el('b', '', n.key), del);
          card.append(head, para(t('poi.dm.theySay', 'They say'), [...np, 'say'], n.say));
          n.options.forEach((/** @type {any} */ o, /** @type {number} */ i) => {
            const op = [...np, 'options', i], th = o.then;
            const nest = el('div', 'dfpoi-nest');
            const ans = input('text', o.text, (v) => { if (v.trim()) put([...op, 'text'], v.trim().slice(0, LIM.text)); });
            ans.className = 'dfpoi-grow'; ans.maxLength = LIM.text;
            const x = btn('x', () => run((dd) => { get(dd, [...np, 'options']).splice(i, 1); })); x.disabled = n.options.length < 2;
            nest.append(row(t('poi.dm.answer', 'Answer {n}', { n: i + 1 }), ans, x),
              select(t('poi.dm.then', 'Then'), null, th.k, POI_OPTION_KINDS.map((k) => /** @type {[string, string]} */ ([k, OPTION_WORD[k]()])), { onPick: (v) => put([...op, 'then'], DM.thenOf(getDoc(), dl, v)) }));
            if (th.k === 'goto') nest.append(select(t('poi.dm.goTo', 'Go to'), [...op, 'then', 'node'], th.node, dl.nodes.map((/** @type {any} */ x2) => /** @type {[string, string]} */ ([x2.key, x2.key]))));
            if (th.k === 'open_trade' || th.k === 'run_trade_recipe') nest.append(ref(t('poi.dm.trade', 'Trade'), [...op, 'then', 'trade'], th.trade, 'trades'));
            if (th.k === 'run_trade_recipe') nest.append(select(t('poi.dm.recipe', 'Recipe'), [...op, 'then', 'recipe'], th.recipe, (d.trades?.find((/** @type {any} */ x2) => x2.key === th.trade)?.recipes ?? []).map((/** @type {any} */ r) => /** @type {[string, string]} */ ([r.key, r.name]))));
            if (th.k === 'trigger_event') nest.append(ref(t('poi.dm.event', 'Event'), [...op, 'then', 'event'], th.event, 'events'));
            nest.append(cond(t('poi.dm.shownWhenAnswer', 'Offered only when'), [...op, 'when'], o.when), num(t('poi.dm.cooldown', 'Cooldown (s)'), [...op, 'cooldownS'], o.cooldownS, { min: 0, max: 86400, none: true }));
            card.append(nest);
          });
          const add = btn(t('poi.dm.addAnswer', 'Add an answer'), () => run((dd) => DM.addOption(get(dd, np)))); add.disabled = n.options.length >= LIM.options;
          card.append(add);
          return card;
        }),
        (() => { const b = btn(t('poi.dm.addLine', 'Add a line'), () => run((dd) => DM.addNode(get(dd, p)))); b.disabled = dl.nodes.length >= LIM.nodes; return b; })(),
        note(t('poi.dm.lineHint', 'A line nobody can reach from the start is a problem. Link each new line from an answer.')),
      ] : [note(t('poi.dm.pickDialogue', 'Pick a dialogue or add one.'))];
      return listPane('dialogues', kids, { add: adder((dd, name) => DM.addDialogue(dd, name), t('poi.dm.newDialogue', 'Dialogue')) });
    },
    trades() {
      const d = getDoc(), tr = d.trades?.find((/** @type {any} */ x) => x.key === ui.key) ?? null, p = ['trades', { key: ui.key }];
      const kids = tr ? [
        section(tr.name), text(t('poi.dm.name', 'Name'), [...p, 'name'], tr.name),
        ...tr.recipes.map((/** @type {any} */ r) => {
          const rp = [...p, 'recipes', { key: r.key }];
          const card = el('div', 'dfpoi-card');
          const name = input('text', r.name, (v) => { if (v.trim()) put([...rp, 'name'], v.trim().slice(0, 48)); });
          name.className = 'dfpoi-grow';
          const x = btn('x', () => tryRun((dd) => DM.removeRecipe(dd, tr.key, r.key))); x.disabled = tr.recipes.length < 2;
          card.append(row(t('poi.dm.recipe', 'Recipe'), name, x),
            section(t('poi.dm.playerGives', 'The player gives')), stacks(t('poi.dm.item', 'Item'), [...rp, 'requireItems'], r.requireItems), num(t('poi.dm.gold', 'Gold'), [...rp, 'requireGold'], r.requireGold, { min: 0, max: 1_000_000 }),
            section(t('poi.dm.playerGets', 'The player gets')), stacks(t('poi.dm.reward', 'Reward'), [...rp, 'rewardItems'], r.rewardItems), num(t('poi.dm.gold', 'Gold'), [...rp, 'rewardGold'], r.rewardGold, { min: 0, max: 1_000_000 }),
            select(t('poi.dm.howOften', 'How often'), null, r.limitMode, words(POI_LIMIT_MODES), { onPick: (v) => run((dd) => { DM.setLimit(get(dd, rp), v); }) }),
            r.limitMode === 'global_stock' ? num(t('poi.dm.stock', 'Stock'), [...rp, 'maxStock'], r.maxStock, { min: 1, max: 1_000_000 }) : null,
            num(t('poi.dm.cooldown', 'Cooldown (s)'), [...rp, 'cooldownS'], r.cooldownS, { min: 0, max: 2_592_000, none: true }),
            cond(t('poi.dm.onlyWhen', 'Only when'), [...rp, 'when'], r.when),
            ref(t('poi.dm.onSuccess', 'On success, run'), [...rp, 'onSuccessEvent'], r.onSuccessEvent, 'events', t('poi.dm.nothing', 'nothing')));
          return card;
        }),
        (() => { const b = btn(t('poi.dm.addRecipe', 'Add a recipe'), () => run((dd) => DM.addRecipe(get(dd, p)))); b.disabled = tr.recipes.length >= LIM.recipes; return b; })(),
        note(t('poi.dm.tradeHint', 'Items come from the game\'s own item list. A recipe needs a reward, and a free recipe needs a limit.')),
      ] : [note(t('poi.dm.pickTrade', 'Pick a trade or add one.'))];
      return listPane('trades', kids, { add: adder((dd, name) => DM.addTrade(dd, name), t('poi.dm.newTrade', 'Trade')) });
    },
    events() {
      const d = getDoc(), e = d.events?.find((/** @type {any} */ x) => x.key === ui.key) ?? null, p = ['events', { key: ui.key }], tg = e?.trigger;
      const actions = (/** @type {'then' | 'else'} */ branch) => (e[branch] ?? []).map((/** @type {any} */ a, /** @type {number} */ i) => {
        const ap = [...p, branch, i];
        const nest = el('div', 'dfpoi-nest');
        const r = select(t('poi.dm.do', 'Do'), null, a.k, POI_ACTION_KINDS.map((k) => /** @type {[string, string]} */ ([k, ACTION_WORD[k]()])), { onPick: (v) => put(ap, DM.actionOf(getDoc(), v)) });
        const x = btn('x', () => run((dd) => { DM.removeAction(get(dd, p), branch, i); })); x.disabled = branch === 'then' && e.then.length < 2;
        r.append(x);
        nest.append(r, ...actionFields(a, ap));
        return nest;
      });
      const addAction = (/** @type {'then' | 'else'} */ branch) => {
        const s = /** @type {HTMLSelectElement} */ (el('select'));
        const first = /** @type {HTMLOptionElement} */ (el('option', '', t('poi.dm.choose', 'Choose...'))); first.value = ''; s.append(first);
        for (const k of POI_ACTION_KINDS) { const op = /** @type {HTMLOptionElement} */ (el('option', '', ACTION_WORD[k]())); op.value = k; s.append(op); }
        s.addEventListener('change', () => { const v = s.value; if (v) run((dd) => DM.addAction(get(dd, p), branch, v, dd)); s.value = ''; });
        return row(t('poi.dm.addAction', 'Add an action'), s);
      };
      const kids = e ? [
        section(e.name ?? e.key), text(t('poi.dm.name', 'Name'), [...p, 'name'], e.name),
        select(t('poi.dm.startsWhen', 'Starts when'), null, tg.k, words(POI_TRIGGER_KINDS), { onPick: (v) => put([...p, 'trigger'], DM.triggerOf(getDoc(), v)) }),
        tg.k === 'enter_area' || tg.k === 'interact' ? select(t('poi.dm.object', 'Object'), [...p, 'trigger', 'interactive'], tg.interactive, (d.interactives ?? []).filter((/** @type {any} */ o) => (tg.k === 'enter_area') === (o.kind === 'trigger')).map((/** @type {any} */ o) => /** @type {[string, string]} */ ([o.key, o.name]))) : null,
        tg.k === 'npc_talk' ? select(t('poi.dm.person', 'Person'), [...p, 'trigger', 'npc'], tg.npc, (d.npcs ?? []).map((/** @type {any} */ n) => /** @type {[string, string]} */ ([n.key, n.name]))) : null,
        tg.k === 'waypoint_reached' ? select(t('poi.dm.route', 'Route'), null, tg.route, rowsOf('routes'), { onPick: (v) => put([...p, 'trigger'], { k: tg.k, route: v, waypoint: getDoc().routes.find((/** @type {any} */ r) => r.key === v)?.waypoints[0]?.key ?? '' }) }) : null,
        tg.k === 'waypoint_reached' ? select(t('poi.dm.waypoint', 'Waypoint'), [...p, 'trigger', 'waypoint'], tg.waypoint, (d.routes?.find((/** @type {any} */ r) => r.key === tg.route)?.waypoints ?? []).map((/** @type {any} */ x) => /** @type {[string, string]} */ ([x.key, x.name]))) : null,
        tg.k === 'chained' ? note(t('poi.dm.chainedHint', 'It runs when another event, a waypoint, an encounter, a trade, or an answer starts it.')) : null,
        cond(t('poi.dm.onlyWhen', 'Only when'), [...p, 'when'], e.when),
        section(t('poi.dm.thenN', 'Then ({n, number} of {max, number} actions in all)', { n: (e.then ?? []).length + (e.else ?? []).length, max: LIM.actions })), ...actions('then'), addAction('then'),
        section(t('poi.dm.otherwise', 'Otherwise (when the condition is not met)')), ...actions('else'), addAction('else'),
      ] : [note(t('poi.dm.pickEvent', 'Pick an event or add one.'))];
      const pane = listPane('events', kids, { add: adder((dd, name) => DM.addEvent(dd, name, 'chained'), t('poi.dm.newEvent', 'Event')) });
      const graph = el('div', 'dfpoi-dm-graph');
      graph.append(section(t('poi.dm.graph', 'Event graph')), eventGraphSvg(doc, DM.eventGraph(d), ui.key ? `event:${ui.key}` : null, (gid) => { if (gid.startsWith('event:')) { ui.key = gid.slice(6); render(); } }));
      pane.querySelector('.dfpoi-dm-form')?.append(graph);
      return pane;
    },
    variables() {
      const d = getDoc(), v = d.variables?.find((/** @type {any} */ x) => x.key === ui.key) ?? null, p = ['variables', { key: ui.key }];
      return listPane('variables', v ? [
        section(v.name ?? v.key), text(t('poi.dm.name', 'Name'), [...p, 'name'], v.name), keyRow(v),
        select(t('poi.dm.holds', 'Holds'), null, v.type, words(POI_VAR_TYPES), { onPick: (x) => run((dd) => { DM.setVariableType(dd, v.key, x); }) }),
        select(t('poi.dm.keptFor', 'Lasts for'), [...p, 'scope'], v.scope, words(POI_VAR_SCOPES)), valueIn(t('poi.dm.startsAs', 'Starts as'), [...p, 'initial'], v.initial, v.type),
        note(t('poi.dm.scopeHintEvent', 'One event run: fresh for each event started by a trigger, waypoint, delay, answer, or trade, or by walking into or winning an encounter. Events it runs at once share it.')),
        note(t('poi.dm.scopeHintVisit', 'One visit: while the POI stays loaded around the player.')),
        note(t('poi.dm.scopeHintKept', 'Persistent variables are saved from visit to visit, for everyone or for each character.')),
      ] : [note(t('poi.dm.pickVariable', 'Pick a variable or add one.'))], { add: adder((dd, name) => DM.addVariable(dd, name, 'boolean', 'poi_global'), t('poi.dm.newVariable', 'Variable')) });
    },
  };

  /**
   * Builds the encounter form's rows for keeping a win across visits. For Never, they say whether a persistent variable
   * keeps it won and offer to set that up (DM.keepWon); once it is set up, they offer to take it back (DM.unkeepWon).
   * @param {any} d @param {any} e
   */
  function wonRows(d, e) {
    const made = DM.wonStartEvent(d, e);
    const undo = () => btn(t('poi.dm.letStartAgain', 'Let it start again'), () => run((dd) => DM.unkeepWon(dd, e.key)));
    // the start event keepWon made still ends the encounter after Starts again leaves Never: say so, and offer removal
    if (e.respawn !== 'never') return made ? [note(t('poi.dm.wonStillKept', 'Its start event still ends it while {name} is true, so once won it does not start again.', { name: d.variables?.find((/** @type {any} */ x) => x.key === made.when.var)?.name ?? made.when.var })), undo()] : [];
    const v = DM.wonKeeper(d, e);
    if (v) return [note(t('poi.dm.wonKept', 'It stays won across visits. Winning it sets {name}, and while that is true it ends as soon as it starts, with no enemies.', { name: v.name ?? v.key })), undo()];
    return [
      note(t('poi.dm.respawnHint', 'A won encounter set to never start again stays won while the POI stays loaded. Once the player has gone far enough for it to unload, it can start again unless a persistent variable remembers the win.')),
      btn(t('poi.dm.keepWon', 'Keep won across visits'), () => run((dd) => DM.keepWon(dd, e.key))),
    ];
  }

  /** Returns whether the open POI has a live approved revision (or is a draft of one). */
  const isLive = () => { const i = id(), e = i ? edit.entryOf?.(i) : null; return !!e && (e.state === 'live' || e.base != null); };
  /**
   * Builds a key input field that lowercases typed text and passes it to `rename`, unless the row's key has already
   * changed since the field was rendered (such as on blur after Enter).
   * @param {string} key @param {() => boolean} stillThere @param {(to: string) => any} rename
   */
  const keyInput = (key, stillThere, rename) => {
    const i = input('text', key, (raw) => { if (stillThere()) rename(raw.trim().toLowerCase()); schedule(); });
    i.maxLength = 32; i.className = 'dfpoi-grow';
    return i;
  };
  /**
   * Builds a variable's key field and hint. Renaming the key updates every condition, set action, and object that
   * takes its state from the variable; on a live POI, the hint warns that renaming resets saved values.
   * @param {any} v
   */
  function keyRow(v) {
    const i = keyInput(v.key, () => !!getDoc()?.variables?.some((/** @type {any} */ x) => x.key === v.key), (to) => {
      const r = run((dd) => DM.renameVariableKey(dd, v.key, to));
      if (r?.ok && r.key !== v.key) { ui.key = r.key; say(t('poi.dm.keyChanged', 'The key is now {key}, and {n, plural, one {# place} other {# places}} that named it changed with it.', { key: r.key, n: r.moved })); }
    });
    const box = el('div');
    box.append(row(t('poi.dm.key', 'Key'), i));
    const kept = v.scope === 'character' || v.scope === 'poi_global';
    if (kept && isLive()) box.append(note(t('poi.dm.keyLive', 'This POI is live, and players\' saved values are stored under this key. With a new key, every saved value of {name} resets to {initial} once the change is approved.', { name: v.name ?? v.key, initial: JSON.stringify(v.initial) })));
    else box.append(note(t('poi.dm.keyHint', 'The key is how the POI names this variable. Changing it changes every place that uses it.')));
    return box;
  }

  /** The fields one action asks for. @param {any} a @param {any[]} ap */
  function actionFields(a, ap) {
    const d = getDoc();
    const people = (d.npcs ?? []).map((/** @type {any} */ n) => /** @type {[string, string]} */ ([n.key, n.name]));
    switch (a.k) {
      case 'say': return [para(t('poi.dm.line', 'Line'), [...ap, 'text'], a.text)];
      case 'set_var': {
        const v = d.variables?.find((/** @type {any} */ x) => x.key === a.var), add = a.add !== undefined;
        return [ref(t('poi.dm.variable', 'Variable'), [...ap, 'var'], a.var, 'variables'),
          v?.type === 'number' ? select(t('poi.dm.how', 'How'), null, add ? 'add' : 'to', [['to', t('poi.dm.setTo', 'Set to')], ['add', t('poi.dm.addTo', 'Add')]], { onPick: (m) => put(ap, m === 'add' ? { k: a.k, var: a.var, add: 1 } : { k: a.k, var: a.var, to: 0 }) }) : null,
          add ? num(t('poi.dm.addTo', 'Add'), [...ap, 'add'], a.add, { whole: false }) : valueIn(t('poi.dm.to', 'To'), [...ap, 'to'], a.to, v?.type ?? typeof a.to)].filter(Boolean);
      }
      case 'set_state': {
        const o = d.interactives?.find((/** @type {any} */ x) => x.key === a.interactive);
        return [ref(t('poi.dm.object', 'Object'), [...ap, 'interactive'], a.interactive, 'interactives'),
          select(t('poi.dm.becomes', 'Becomes'), [...ap, 'state'], a.state, (o ? /** @type {any} */ (POI_INTERACTIVE_STATES)[o.kind] : [...new Set(Object.values(POI_INTERACTIVE_STATES).flat())]).map((/** @type {string} */ s) => [s, DM.stateWord(s, o?.kind)]))];
      }
      case 'start_encounter': case 'end_encounter': return [ref(t('poi.dm.encounter', 'Encounter'), [...ap, 'encounter'], a.encounter, 'encounters')];
      case 'start_route': return [select(t('poi.dm.person', 'Person'), [...ap, 'npc'], a.npc, people), ref(t('poi.dm.route', 'Route'), [...ap, 'route'], a.route, 'routes')];
      case 'stop_route': case 'spawn_npc': case 'despawn_npc': return [select(t('poi.dm.person', 'Person'), [...ap, 'npc'], a.npc, people)];
      case 'open_dialogue': return [ref(t('poi.dm.dialogue', 'Dialogue'), [...ap, 'dialogue'], a.dialogue, 'dialogues')];
      case 'open_trade': return [ref(t('poi.dm.trade', 'Trade'), [...ap, 'trade'], a.trade, 'trades')];
      case 'give_item': case 'take_item': return [itemPick(a.item, [...ap, 'item'], t('poi.dm.item', 'Item'))];
      case 'give_gold': case 'take_gold': return [num(t('poi.dm.gold', 'Gold'), [...ap, 'amount'], a.amount, { min: 1, max: 1_000_000 })];
      default: return [ref(t('poi.dm.event', 'Event'), [...ap, 'event'], a.event, 'events'), num(t('poi.dm.after', 'After (s)'), [...ap, 'delayS'], a.delayS, { min: 0, max: 86400 })];
    }
  }

  function render() {
    if (gone) return;
    dock.hidden = !ui.on;
    if (!ui.on) return;
    const d = getDoc();
    const bar = el('div', 'dfpoi-dm-tabs');
    for (const k of Object.keys(TAB)) { const b = btn(TAB[k](), () => { ui.tab = k; ui.key = null; render(); }); b.setAttribute('aria-pressed', String(ui.tab === k)); bar.append(b); }
    bar.append(el('span', 'dfpoi-sep'), btn(t('poi.dm.close', 'Close'), () => api.close()));
    const out = [bar];
    // a run is of the POI it started on
    if (sandbox.model() && sandbox.model().doc.id !== d?.id) sandbox.stop();
    if (!d) out.push(note(t('poi.dm.selectPoi', 'Select a POI in the world or the list to give it DM content.')));
    else if (ui.tab === 'sandbox') out.push(sandbox.view());
    else {
      if (ui.tab === 'npcs' && !ui.key) ui.key = d.npcs?.[0]?.key ?? null;
      out.push(tabs[ui.tab]());
    }
    dock.replaceChildren(...out);
  }

  const api = {
    /** Shown or put away (the bar's DM button). */
    toggle() { if (ui.on) api.close(); else api.open(ui.tab, ui.key); },
    /** Shown at a tab and row. @param {string} tab @param {string | null} [key] */
    open(tab, key = null) { ui.on = true; ui.tab = tab in TAB ? tab : 'routes'; ui.key = key; editor.setOverlay?.((/** @type {(id: string) => any} */ placeOf, /** @type {(x: number, z: number) => number} */ groundAt, /** @type {number} */ epoch) => lines(placeOf, groundAt, epoch)); render(); },
    close() { ui.on = false; editor.setOverlay?.(null); sandbox.stop(); render(); },
    isOn: () => ui.on,
    /** A problem's path (`events[2].then[0].var`): its tab and row opened, when it is a DM row. @param {string} path */
    jumpTo(path) {
      const m = /^(npcs|routes|encounters|interactives|dialogues|trades|events|variables)\[(\d+)\]/.exec(path);
      const row0 = m ? getDoc()?.[m[1]]?.[Number(m[2])] : null;
      if (!m || !row0) return false;
      api.open(m[1], row0.key ?? null);
      return true;
    },
    refresh: () => schedule(),
    sandbox,
    destroy() { gone = true; offEdit(); editor.setOverlay?.(null); dock.remove?.(); },
  };
  /** @param {(id: string) => any} placeOf
   *  @param {(x: number, z: number) => number} [groundAt] @param {number} [epoch] */
  function lines(placeOf, groundAt, epoch = 0) {
    const i = id(), d = getDoc();
    const toScene = i ? placeOf(i) : null;
    if (!ui.on || !d || !toScene) return null;
    return dmLines(d, { tab: ui.tab, key: ui.key }, toScene, groundAt, epoch);
  }
  return api;
}

// ── the event graph ──
/**
 * The event graph as an SVG picture: sources on the left (a zone, an object, a person, a route, an encounter, a trade,
 * or an answer), events to their right, an arrow for each thing that starts another. Columns come from poiDmEdit.js
 * eventGraph. Click an event to open it. It draws what the document says and has no state of its own.
 * @param {Document} doc @param {ReturnType<typeof DM.eventGraph>} graph @param {string | null} selected a node id @param {(id: string) => void} onPick
 */
export function eventGraphSvg(doc, graph, selected, onPick) {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (/** @type {string} */ tag, /** @type {Record<string, any>} */ attrs = {}, /** @type {string | undefined} */ text = undefined) => { const e = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (text !== undefined) e.textContent = text; return e; };
  const clip = (/** @type {string} */ s, /** @type {number} */ n) => (s.length > n ? `${s.slice(0, n - 1)}...` : s);
  const W = 230, GAP_X = 70, GAP_Y = 16, LINE = 14, PAD = 10;
  const box = new Map(), colY = new Map();
  for (const n of [...graph.nodes].sort((a, b) => a.col - b.col || a.row - b.row)) {
    const lines = Math.min(n.sub.length, 7) + (n.sub.length > 7 ? 1 : 0);
    const hgt = PAD * 2 + LINE * (1 + lines);
    const y = colY.get(n.col) ?? PAD;
    box.set(n.id, { x: PAD + n.col * (W + GAP_X), y, h: hgt });
    colY.set(n.col, y + hgt + GAP_Y);
  }
  const width = PAD * 2 + (Math.max(0, ...graph.nodes.map((n) => n.col)) + 1) * (W + GAP_X) - GAP_X;
  const height = Math.max(60, ...[...colY.values()].map((v) => v + PAD));
  const svg = mk('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': t('poi.dm.graph', 'Event graph') });
  const defs = mk('defs'), arrow = mk('marker', { id: 'dfpoi-arr', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' });
  arrow.append(mk('path', { d: 'M0,0 L8,4 L0,8 z', fill: '#b9b2a3' })); defs.append(arrow); svg.append(defs);
  if (!graph.nodes.length) svg.append(mk('text', { x: PAD, y: 24, fill: '#b9b2a3' }, t('poi.dm.graphEmpty', 'No events yet.')));
  for (const e of graph.edges) {
    const a = box.get(e.from), b = box.get(e.to);
    if (!a || !b) continue;
    const forward = a.x < b.x;
    const x1 = forward ? a.x + W : a.x, y1 = a.y + a.h / 2, x2 = forward ? b.x : b.x + W, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
    svg.append(mk('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, fill: 'none', stroke: '#b9b2a3', 'stroke-width': 1.4, 'marker-end': 'url(#dfpoi-arr)' }));
    svg.append(mk('text', { x: mx, y: (y1 + y2) / 2 - 4, fill: '#b9b2a3', 'font-size': 10, 'text-anchor': 'middle' }, e.label));
  }
  for (const n of graph.nodes) {
    const b = box.get(n.id);
    if (!b) continue;
    const g = mk('g', { class: n.kind === 'event' ? 'dfpoi-evnode' : 'dfpoi-evsrc' });
    g.append(mk('rect', { x: b.x, y: b.y, width: W, height: b.h, rx: 6, fill: n.kind === 'event' ? '#2a2620' : '#1d2a22', stroke: selected === n.id ? '#ffb347' : '#6b5230', 'stroke-width': selected === n.id ? 2 : 1 }));
    g.append(mk('text', { x: b.x + PAD, y: b.y + PAD + 10, fill: '#e9e4d9', 'font-size': 12, 'font-weight': 600 }, clip(n.label, 32)));
    n.sub.slice(0, 7).forEach((s, i) => g.append(mk('text', { x: b.x + PAD, y: b.y + PAD + 10 + LINE * (i + 1), fill: '#b9b2a3', 'font-size': 11 }, clip(s, 38))));
    if (n.sub.length > 7) g.append(mk('text', { x: b.x + PAD, y: b.y + PAD + 10 + LINE * 8, fill: '#8a8373', 'font-size': 11 }, t('poi.dm.graphMore', 'and {n, number} more', { n: n.sub.length - 7 })));
    if (n.kind === 'event') g.addEventListener('click', () => onPick(n.id));
    svg.append(g);
  }
  return svg;
}
