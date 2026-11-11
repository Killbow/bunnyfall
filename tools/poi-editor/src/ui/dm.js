// @ts-check

// The DM view: people, routes, encounters, objects, dialogues, trades, events and variables, one tab each, plus the
// event graph. Every control writes the document through one editor step, so it undoes, and every value is held to the
// law (poiLawV2.js) by the Problems panel. The game runs these from Milestone 5: until then the editor saves and
// validates them, and the banner says so.

import { h, clear } from './dom.js';
import { createSandbox } from './sandbox.js';
import { find } from '../scene.js';
import { POI_ROUTE_MODES, POI_AGGRESSION, POI_RESPAWN, POI_COMPLETE_RULES, POI_INTERACTIVE_KINDS, POI_INTERACTIVE_STATES, POI_VAR_TYPES, POI_VAR_SCOPES, POI_VAR_OPS, POI_LIMIT_MODES, POI_ACTION_KINDS, POI_OPTION_KINDS, POI_V2_LIMITS as LIM } from '../../../../src/poi/poiLawV2.js';
import * as DM from '../dm.js';
import { eventGraphSvg } from './eventGraph.js';
import { ask } from './dialog.js';

const TABS = [['npcs', 'People'], ['routes', 'Routes'], ['encounters', 'Encounters'], ['interactives', 'Objects'], ['dialogues', 'Dialogues'], ['trades', 'Trades'], ['events', 'Events'], ['variables', 'Variables'], ['sandbox', 'Sandbox']];
const WORD = { loop: 'Loop', pingpong: 'There and back', once: 'Once', hostile: 'Hostile', passive: 'Passive', never: 'Never', on_reentry: 'When a player comes back', all_dead: 'All dead', leader_dead: 'The leader dies', timer_survived: 'A timer runs out',
  chest: 'Chest', door: 'Door or gate', switch: 'Switch', quest_object: 'Quest object', trigger: 'Zone (trigger)', boolean: 'True or false', number: 'Number', string: 'Text', event: 'This event only', instance: 'This visit', character: 'Each character', poi_global: 'Everyone, kept',
  unlimited: 'No limit', once_per_char: 'Once per character', once_per_account: 'Once per account', daily_per_char: 'Once a day per character', global_stock: 'Limited stock', eq: 'is', ne: 'is not', gt: '>', ge: '>=', lt: '<', le: '<=' };
const ACTION_WORD = { say: 'Say a line', set_var: 'Set a variable', set_state: 'Change an object', start_encounter: 'Start an encounter', end_encounter: 'End an encounter', start_route: 'Start a person walking', stop_route: 'Stop a person', spawn_npc: 'Show a person', despawn_npc: 'Hide a person', open_dialogue: 'Open a dialogue', open_trade: 'Open a trade', give_item: 'Give an item', take_item: 'Take an item', give_gold: 'Give gold', take_gold: 'Take gold', trigger_event: 'Run another event' };
const OPTION_WORD = { goto: 'Go to another line', close: 'Close the talk', open_trade: 'Open a trade', run_trade_recipe: 'Run a trade recipe', trigger_event: 'Run an event' };
const COND_WORD = { all: 'All of', any: 'Any of', has_item: 'Has item', has_gold: 'Has gold', var: 'Variable' };
const w = (k) => /** @type {any} */ (WORD)[k] ?? k;

/**
 * @param {{ host: HTMLElement, getDoc: () => any, docId: () => string | null, edit: any, catalogue: any, say: (m: string) => void,
 *   pick: (what: string, done: (p: number[]) => void) => void, here: () => number[], getSel: () => string[], changed: () => void }} o
 */
export function createDm({ host, getDoc, docId, edit, catalogue, say, pick, here, getSel, changed, onSandbox = () => {} }) {
  const sandboxBox = h('div', { class: 'sbx' });
  const sandbox = createSandbox({ host: sandboxBox, getDoc, catalogue, onChange: onSandbox });
  const ui = { tab: 'routes', key: /** @type {string | null} */ (null), sub: /** @type {string | null} */ (null) };

  // ── reading and writing the document by path ──
  // a path step is a property name, an index, or { key } to find a row of an array by its key
  const step = (o, s) => (o == null ? undefined : typeof s === 'object' ? o.find?.((r) => r.key === s.key) : o[s]);
  const get = (d, path) => path.reduce(step, d);
  const set = (path, v) => (d) => { const parent = get(d, path.slice(0, -1)), last = path.at(-1); if (parent == null) return; if (v === undefined) delete parent[last]; else parent[last] = v; };
  const run = (label, fn) => { const id = docId(); if (!id) return; edit.edit(id, label, fn); changed(); };
  const put = (label, path, v) => run(label, set(path, v));
  const doc = () => getDoc();

  // ── controls ──
  const field = (label, ...els) => h('div', { class: 'field' }, h('label', { text: label }), h('div', { class: 'vec' }, ...els));
  const text = (label, path, value, max = 48) => field(label, h('input', { type: 'text', value: value ?? '', maxLength: max, on: { change: (e) => { const v = e.target.value.trim(); if (v) put(label, path, v); } } }));
  const para = (label, path, value) => field(label, h('textarea', { rows: 2, maxLength: LIM.text, value: value ?? '', on: { change: (e) => { const v = e.target.value.trim(); if (v) put(label, path, v); } } }));
  const num = (label, path, value, { min, max, step: st = 1, whole = true, none = false } = {}) => field(label, h('input', { type: 'number', value: value ?? '', step: st, min, max, placeholder: none ? 'none' : '', on: { change: (e) => { const raw = e.target.value.trim(); if (raw === '' && none) { put(label, path, undefined); return; } let v = Number(raw); if (!Number.isFinite(v)) return; if (whole) v = Math.round(v); if (min !== undefined) v = Math.max(min, v); if (max !== undefined) v = Math.min(max, v); put(label, path, v); } } }));
  const select = (label, path, value, options, { none = null, onPick = null } = {}) => field(label, h('select', { on: { change: (e) => { const v = e.target.value; if (onPick) onPick(v); else put(label, path, v === '' ? undefined : v); } } },
    ...(none ? [h('option', { value: '', text: none, selected: value === undefined })] : []),
    ...options.map(([v, t]) => h('option', { value: v, text: t, selected: v === value })),
    ...(value !== undefined && value !== '' && !options.some(([v]) => v === value) ? [h('option', { value, text: `${value} (missing)`, selected: true })] : [])));
  const words = (list) => list.map((k) => [k, w(k)]);
  const rows = (coll) => (doc()?.[coll] ?? []).map((r) => [r.key, r.name ?? r.key]);
  const ref = (label, path, value, coll, none = null) => select(label, path, value, rows(coll), { none });
  const check = (label, path, value) => field(label, h('input', { type: 'checkbox', checked: !!value, on: { change: (e) => put(label, path, e.target.checked) } }));
  const point = (label, path, value, what) => field(label, ...value.map((c, i) => h('input', { type: 'number', value: Number(c.toFixed?.(3) ?? c), step: 0.25, on: { change: (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) put(label, [...path, i], Math.round(v * 1000) / 1000); } } })),
    h('button', { text: 'Pick', title: 'Click the ground in the 3D view', on: { click: () => pick(what, (p) => put(label, path, p)) } }));
  const btn = (text_, click, title = '', off = false) => h('button', { text: text_, title, disabled: off, on: { click } });
  const section = (t) => h('div', { class: 'section', text: t });
  const note = (t) => h('div', { class: 'pane dim', text: t });
  const refused = (r) => { if (r?.refused) say(r.refused); return r; };

  // an item stack: the game's item, a count
  const items = catalogue.assets.filter((a) => a.namespace === 'paperdoll-item' && Number.isInteger(a.template)).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const itemSelect = (stack, path, label) => {
    const cats = [...new Set(items.map((a) => a.category))];
    const known = items.some((a) => a.template === stack.template);
    return field(label, h('select', { on: { change: (e) => put(label, [...path, 'template'], Number(e.target.value)) } },
      ...cats.map((c) => h('optgroup', { label: c }, ...items.filter((a) => a.category === c).map((a) => h('option', { value: a.template, text: a.name, selected: a.template === stack.template })))),
      known ? null : h('option', { value: stack.template, text: `item ${stack.template} (not in the catalogue)`, selected: true })),
    h('input', { type: 'number', min: 1, max: 99999, value: stack.count ?? 1, title: 'How many', on: { change: (e) => { const v = Math.round(Number(e.target.value)); if (v >= 1) put(label, [...path, 'count'], v); } } }));
  };
  const stacks = (label, path, list, { max = LIM.stacks } = {}) => h('div', null,
    ...list.map((s, i) => h('div', { class: 'row2' }, itemSelect(s, [...path, i], label), btn('x', () => run('remove item', (d) => { get(d, path).splice(i, 1); }), 'Remove this item'))),
    btn(`Add ${label.toLowerCase()}`, () => run('add item', (d) => { const a = get(d, path); if (a.length < max) a.push({ template: items[0]?.template ?? 71, count: 1 }); else say(`At most ${max} here.`); }), '', list.length >= max));

  // a condition tree, edited in place
  function cond(label, path, c, onDrop) {
    const box = h('div', { class: 'cond' });
    box.append(select(label, [], c?.k, [...Object.entries(COND_WORD)], { none: 'Always', onPick: (v) => (v === '' ? (onDrop ? onDrop() : put(label, path, undefined)) : put(label, path, DM.conditionOf(doc(), v))) }));
    if (!c) return box;
    if (c.k === 'all' || c.k === 'any') {
      const size = DM.conditionSize(c);
      (c.of ?? []).forEach((x, i) => box.append(h('div', { class: 'nest' }, cond(`${i + 1}.`, [...path, 'of', i], x, () => run('remove condition', (d) => { get(d, [...path, 'of']).splice(i, 1); })))));
      box.append(btn('Add condition', () => run('add condition', (d) => { const o = get(d, [...path, 'of']); if (o.length < LIM.conditions) o.push(DM.conditionOf(d, 'has_gold')); else say(`At most ${LIM.conditions} conditions.`); }), size.depth >= LIM.conditionDepth ? '' : '', size.leaves >= LIM.conditions));
    } else if (c.k === 'has_item') box.append(itemSelect(c.item, [...path, 'item'], 'Item'));
    else if (c.k === 'has_gold') box.append(num('Gold', [...path, 'amount'], c.amount, { min: 1, max: 1_000_000 }));
    else {
      const v = doc().variables?.find((x) => x.key === c.var);
      box.append(ref('Variable', [...path, 'var'], c.var, 'variables'));
      box.append(select('Is', [...path, 'op'], c.op, words(v && v.type !== 'number' ? ['eq', 'ne'] : POI_VAR_OPS)));
      box.append(valueIn('Value', [...path, 'value'], c.value, v?.type ?? typeof c.value));
    }
    return box;
  }
  const valueIn = (label, path, value, type) => type === 'boolean'
    ? select(label, path, String(value), [['true', 'True'], ['false', 'False']], { onPick: (v) => put(label, path, v === 'true') })
    : type === 'number' ? num(label, path, value, { whole: false, step: 1 })
      : field(label, h('input', { type: 'text', maxLength: 48, value: String(value ?? ''), on: { change: (e) => put(label, path, e.target.value) } }));

  // ── lists ──
  function listPane(coll, label, kids, { add, extra } = {}) {
    const d = doc(), rowsOf = d?.[coll] ?? [];
    const list = h('div', { class: 'dmlist' });
    for (const r of rowsOf) list.append(h('button', { class: `c2d-row ${ui.key === r.key ? 'on' : ''}`, text: r.name ?? r.key, title: r.key, on: { click: () => { ui.key = r.key; ui.sub = null; render(); changed(); } } }));
    const limit = DM.DM_COLLECTIONS[/** @type {keyof typeof DM.DM_COLLECTIONS} */ (coll)];
    const left = h('div', { class: 'dmside' },
      h('div', { class: 'c2d-title', text: `${label} (${rowsOf.length}${limit ? ` of ${limit}` : ''})` }), list,
      add ? btn(`Add`, add, '', limit !== undefined && rowsOf.length >= limit) : null,
      coll !== 'npcs' && ui.key ? btn('Delete', () => { const r = DM.removeRow(structuredClone(doc()), coll, ui.key); if (r.refused) { say(r.refused); return; } run('delete', (dd) => { DM.removeRow(dd, coll, ui.key); }); ui.key = null; render(); }, 'Delete the selected one') : null, extra);
    return h('div', { class: 'dmbody' }, left, h('div', { class: 'dmform' }, ...kids));
  }
  const named = async (title, def) => { const v = await ask(title, [{ name: 'name', label: 'Name', value: def }], { ok: 'Add', validate: (x) => (!x.name.trim() ? 'Give it a name.' : null) }); return v?.name.trim() ?? null; };
  const adder = (coll, make, label) => async () => {
    const name = await named(`New ${label}`, label); if (!name) return;
    let made = null;
    run(`add ${label}`, (d) => { made = make(d, name); });
    if (made?.refused) { say(made.refused); return; }
    ui.key = made?.row?.key ?? null; render(); changed();
  };

  // ── tabs ──
  const tabs = {
    npcs() {
      const d = doc(), n = d.npcs?.find((x) => x.key === ui.key) ?? null, p = ['npcs', { key: ui.key }];
      return listPane('npcs', 'People', n ? [
        section(n.name), note('Add or move people in the 3D view. Here you give them a route, a dialogue or a trade.'),
        ref('Walks route', [...p, 'route'], n.route, 'routes', 'none'), ref('Dialogue', [...p, 'dialogue'], n.dialogue, 'dialogues', 'none'), ref('Trade', [...p, 'trade'], n.trade, 'trades', 'none'),
        num('Talk range (m)', [...p, 'radius'], n.radius, { min: 1, max: 20, none: true, whole: false, step: 0.5 }),
        cond('Shown only when', [...p, 'showWhen'], n.showWhen),
      ] : [note('Pick a person.')]);
    },
    routes() {
      const d = doc(), r = d.routes?.find((x) => x.key === ui.key) ?? null, p = ['routes', { key: ui.key }];
      const kids = r ? [
        section(r.name), text('Name', [...p, 'name'], r.name), select('Walk', [...p, 'mode'], r.mode, words(POI_ROUTE_MODES)),
        field('Wait at every stop (s)', h('input', { type: 'number', min: 0, max: 3600, placeholder: 'set all', on: { change: (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) run('wait everywhere', (dd) => { DM.setWaitAll(dd.routes.find((x) => x.key === r.key), v); }); } } })),
        note(`${r.waypoints.length} of ${LIM.waypoints} waypoints. The path is drawn in the 3D view.`),
        ...r.waypoints.map((wp, i) => h('div', { class: 'card' },
          h('div', { class: 'row2' }, h('b', { text: `${i + 1}.` }), h('input', { type: 'text', value: wp.name, maxLength: 48, on: { change: (e) => { if (e.target.value.trim()) put('waypoint name', [...p, 'waypoints', { key: wp.key }, 'name'], e.target.value.trim()); } } }),
            btn('Up', () => run('move waypoint', (dd) => { DM.shiftWaypoint(dd.routes.find((x) => x.key === r.key), wp.key, -1); }), '', i === 0), btn('Down', () => run('move waypoint', (dd) => { DM.shiftWaypoint(dd.routes.find((x) => x.key === r.key), wp.key, 1); }), '', i === r.waypoints.length - 1),
            btn('x', () => { const res = DM.removeWaypoint(structuredClone(doc()), r.key, wp.key); if (res.refused) { say(res.refused); return; } run('remove waypoint', (dd) => { DM.removeWaypoint(dd, r.key, wp.key); }); })),
          point('Spot', [...p, 'waypoints', { key: wp.key }, 't'], wp.t, `waypoint ${i + 1}`),
          num('Reach (m)', [...p, 'waypoints', { key: wp.key }, 'radius'], wp.radius, { min: 0.5, max: 50, whole: false, step: 0.5 }), num('Wait (s)', [...p, 'waypoints', { key: wp.key }, 'waitS'], wp.waitS, { min: 0, max: 3600 }),
          ref('When reached, run', [...p, 'waypoints', { key: wp.key }, 'onArriveEvent'], wp.onArriveEvent, 'events', 'nothing'))),
        h('div', { class: 'row2' }, btn('Add waypoint at the view', () => run('add waypoint', (dd) => { refused(DM.addWaypoint(dd.routes.find((x) => x.key === r.key), here())); }), '', r.waypoints.length >= LIM.waypoints),
          btn('Add waypoint on the ground', () => pick('the new waypoint', (pt) => run('add waypoint', (dd) => { refused(DM.addWaypoint(dd.routes.find((x) => x.key === r.key), pt)); })), '', r.waypoints.length >= LIM.waypoints)),
      ] : [note('Pick a route or add one.')];
      return listPane('routes', 'Routes', kids, { add: adder('routes', (dd, name) => DM.addRoute(dd, name, here()), 'Route') });
    },
    encounters() {
      const d = doc(), e = d.encounters?.find((x) => x.key === ui.key) ?? null, p = ['encounters', { key: ui.key }];
      const kids = e ? [
        section(e.name), text('Name', [...p, 'name'], e.name), point('Centre', [...p, 'center'], e.center, 'the encounter centre'), num('Wakes within (m)', [...p, 'radius'], e.radius, { min: 1, max: 500, whole: false }),
        select('Foes are', [...p, 'aggression'], e.aggression, words(POI_AGGRESSION)), select('Comes back', [...p, 'respawn'], e.respawn, words(POI_RESPAWN)),
        select('Ends when', [], e.complete.rule, words(POI_COMPLETE_RULES), { onPick: (v) => run('end rule', (dd) => { DM.setComplete(dd.encounters.find((x) => x.key === e.key), v); }) }),
        e.complete.rule === 'leader_dead' ? select('Leader', [...p, 'complete', 'leader'], e.complete.leader, e.spawns.map((s) => [s.key, `${s.key} (${DM.foeName(s.foe)})`])) : null,
        e.complete.rule === 'timer_survived' ? num('Seconds', [...p, 'complete', 'seconds'], e.complete.seconds, { min: 1, max: 3600 }) : null,
        ref('When it starts, run', [...p, 'onStart'], e.onStart, 'events', 'nothing'), ref('When it ends, run', [...p, 'onComplete'], e.onComplete, 'events', 'nothing'),
        note(`${DM.foeCount(e)} of ${LIM.foesPerEncounter} foes, ${e.spawns.length} of ${LIM.spawns} spawn points. Foes are the game's own. A level is optional.`),
        ...e.spawns.map((s) => h('div', { class: 'card' },
          h('div', { class: 'row2' }, h('b', { text: s.key }), btn('x', () => run('remove spawn', (dd) => { const en = dd.encounters.find((x) => x.key === e.key); en.spawns = en.spawns.filter((x) => x.key !== s.key); if (en.complete.rule === 'leader_dead' && en.complete.leader === s.key) en.complete.leader = en.spawns[0]?.key ?? ''; }), '', e.spawns.length < 2)),
          select('Foe', [...p, 'spawns', { key: s.key }, 'foe'], s.foe, DM.FOES.map((f) => [f.id, `${f.name} (${f.id})`]).map(([v, t]) => [v, t]), { onPick: (v) => put('foe', [...p, 'spawns', { key: s.key }, 'foe'], Number(v)) }),
          num('How many', [...p, 'spawns', { key: s.key }, 'count'], s.count, { min: 1, max: LIM.foesPerSpawn }), num('Level (optional)', [...p, 'spawns', { key: s.key }, 'level'], s.level, { min: 1, max: 99, none: true }),
          point('Spot', [...p, 'spawns', { key: s.key }, 'at'], s.at, 'the spawn spot'), num('Spread (m)', [...p, 'spawns', { key: s.key }, 'spread'], s.spread, { min: 0, max: 50, whole: false, step: 0.5 }),
          ref('Patrols route', [...p, 'spawns', { key: s.key }, 'route'], s.route, 'routes', 'none'))),
        btn('Add spawn point', () => run('add spawn', (dd) => { refused(DM.addSpawn(dd.encounters.find((x) => x.key === e.key), 136, 1, here())); }), '', e.spawns.length >= LIM.spawns),
      ] : [note('Pick an encounter or add one.')];
      return listPane('encounters', 'Encounters', kids, { add: adder('encounters', (dd, name) => DM.addEncounter(dd, name, here()), 'Encounter') });
    },
    interactives() {
      const d = doc(), o = d.interactives?.find((x) => x.key === ui.key) ?? null, p = ['interactives', { key: ui.key }];
      const kids = o ? [
        section(o.name), text('Name', [...p, 'name'], o.name),
        select('Kind', [], o.kind, words(POI_INTERACTIVE_KINDS), { onPick: (v) => run('object kind', (dd) => { DM.setInteractiveKind(dd.interactives.find((x) => x.key === o.key), v); }) }),
        select('Starts', [...p, 'state'], o.state, /** @type {any} */ (POI_INTERACTIVE_STATES)[o.kind].map((s) => [s, s])),
        select('Looks like', [], o.appearance.k, [['none', 'Nothing (invisible)'], ['part', 'One of my models'], ['flat', 'A flat picture']], { onPick: (v) => put('appearance', [...p, 'appearance'], v === 'none' ? { k: 'none' } : v === 'part' ? { k: 'part', key: d.parts?.[0]?.key ?? '' } : { k: 'flat', flat: [200, 0] }) }),
        o.appearance.k === 'part' ? select('Model', [...p, 'appearance', 'key'], o.appearance.key, (d.parts ?? []).map((x) => [x.key, x.name ?? x.key])) : null,
        o.appearance.k === 'flat' ? field('Picture (archive, record)', ...o.appearance.flat.map((c, i) => h('input', { type: 'number', min: 0, value: c, on: { change: (e) => { const v = Math.round(Number(e.target.value)); if (v >= 0) put('picture', [...p, 'appearance', 'flat', i], v); } } }))) : null,
        point('Spot', [...p, 't'], o.t, 'the object'), num('Facing (deg)', [...p, 'yaw'], o.yaw, { whole: false }), num(o.kind === 'trigger' ? 'Zone radius (m)' : 'Reach (m)', [...p, 'radius'], o.radius, { min: 0.5, max: 200, whole: false, step: 0.5 }),
        o.kind !== 'trigger' ? h('div', null, section('Key item (optional)'), o.keyItem ? h('div', { class: 'row2' }, itemSelect(o.keyItem, [...p, 'keyItem'], 'Key'), btn('x', () => put('key item', [...p, 'keyItem'], undefined))) : btn('Needs a key item', () => put('key item', [...p, 'keyItem'], { template: items[0]?.template ?? 71, count: 1 }))) : null,
        note(o.kind === 'trigger' ? 'A zone starts events when a player walks in. Make an event with the trigger "A player enters a zone".' : 'Events can be started when a player uses this object.'),
      ] : [note('Pick an object or add one.')];
      return listPane('interactives', 'Objects', kids, { add: async () => {
        const v = await ask('New object', [{ name: 'name', label: 'Name', value: 'Object' }, { name: 'kind', label: 'Kind', options: words(POI_INTERACTIVE_KINDS), value: 'chest' }], { ok: 'Add', validate: (x) => (!x.name.trim() ? 'Give it a name.' : null) });
        if (!v) return;
        let made = null; run('add object', (dd) => { made = DM.addInteractive(dd, v.kind, v.name.trim(), here()); });
        if (made?.refused) say(made.refused); else { ui.key = made?.row?.key ?? null; render(); changed(); }
      } });
    },
    dialogues() {
      const d = doc(), dl = d.dialogues?.find((x) => x.key === ui.key) ?? null, p = ['dialogues', { key: ui.key }];
      const kids = dl ? [
        section(dl.name), text('Name', [...p, 'name'], dl.name), select('Starts at', [...p, 'start'], dl.start, dl.nodes.map((n) => [n.key, n.key])),
        ...dl.nodes.map((n) => {
          const np = [...p, 'nodes', { key: n.key }];
          return h('div', { class: 'card' },
            h('div', { class: 'row2' }, h('b', { text: n.key }), btn('Delete line', () => { const dd = structuredClone(doc()); const r = DM.removeNode(dd.dialogues.find((x) => x.key === dl.key), n.key); if (r.refused) { say(r.refused); return; } run('delete line', (x) => { DM.removeNode(x.dialogues.find((y) => y.key === dl.key), n.key); }); }, '', dl.nodes.length < 2)),
            para('They say', [...np, 'say'], n.say),
            ...n.options.map((o, i) => {
              const op = [...np, 'options', i], th = o.then;
              return h('div', { class: 'nest' },
                h('div', { class: 'row2' }, h('input', { type: 'text', value: o.text, maxLength: LIM.text, on: { change: (e) => { if (e.target.value.trim()) put('answer', [...op, 'text'], e.target.value.trim()); } } }), btn('x', () => run('remove answer', (dd) => { get(dd, [...np, 'options']).splice(i, 1); }), '', n.options.length < 2)),
                select('Then', [], th.k, [...Object.entries(OPTION_WORD)], { onPick: (v) => put('answer action', [...op, 'then'], DM.thenOf(doc(), dl, v)) }),
                th.k === 'goto' ? select('Go to', [...op, 'then', 'node'], th.node, dl.nodes.map((x) => [x.key, x.key])) : null,
                th.k === 'open_trade' || th.k === 'run_trade_recipe' ? ref('Trade', [...op, 'then', 'trade'], th.trade, 'trades') : null,
                th.k === 'run_trade_recipe' ? select('Recipe', [...op, 'then', 'recipe'], th.recipe, (d.trades?.find((t) => t.key === th.trade)?.recipes ?? []).map((r) => [r.key, r.name])) : null,
                th.k === 'trigger_event' ? ref('Event', [...op, 'then', 'event'], th.event, 'events') : null,
                cond('Shown when', [...op, 'when'], o.when), num('Cooldown (s)', [...op, 'cooldownS'], o.cooldownS, { min: 0, max: 86400, none: true }));
            }),
            btn('Add answer', () => run('add answer', (dd) => { refused(DM.addOption(dd.dialogues.find((x) => x.key === dl.key).nodes.find((x) => x.key === n.key))); }), '', n.options.length >= LIM.options));
        }),
        btn('Add line', () => run('add line', (dd) => { refused(DM.addNode(dd.dialogues.find((x) => x.key === dl.key))); }), '', dl.nodes.length >= LIM.nodes),
        note('A line nobody can reach from the start is a problem. Link each new line from an answer.'),
      ] : [note('Pick a dialogue or add one.')];
      return listPane('dialogues', 'Dialogues', kids, { add: adder('dialogues', (dd, name) => DM.addDialogue(dd, name), 'Dialogue') });
    },
    trades() {
      const d = doc(), t = d.trades?.find((x) => x.key === ui.key) ?? null, p = ['trades', { key: ui.key }];
      const kids = t ? [
        section(t.name), text('Name', [...p, 'name'], t.name),
        ...t.recipes.map((r) => {
          const rp = [...p, 'recipes', { key: r.key }];
          return h('div', { class: 'card' },
            h('div', { class: 'row2' }, h('input', { type: 'text', value: r.name, maxLength: 48, on: { change: (e) => { if (e.target.value.trim()) put('recipe name', [...rp, 'name'], e.target.value.trim()); } } }),
              btn('x', () => { const res = DM.removeRecipe(structuredClone(doc()), t.key, r.key); if (res.refused) { say(res.refused); return; } run('remove recipe', (dd) => { DM.removeRecipe(dd, t.key, r.key); }); }, '', t.recipes.length < 2)),
            section('Player gives'), stacks('Item', [...rp, 'requireItems'], r.requireItems), num('Gold', [...rp, 'requireGold'], r.requireGold, { min: 0, max: 1_000_000 }),
            section('Player gets'), stacks('Reward', [...rp, 'rewardItems'], r.rewardItems), num('Gold', [...rp, 'rewardGold'], r.rewardGold, { min: 0, max: 1_000_000 }),
            select('How often', [], r.limitMode, words(POI_LIMIT_MODES), { onPick: (v) => run('limit', (dd) => { DM.setLimit(dd.trades.find((x) => x.key === t.key).recipes.find((x) => x.key === r.key), v); }) }),
            r.limitMode === 'global_stock' ? num('Stock', [...rp, 'maxStock'], r.maxStock, { min: 1, max: 1_000_000 }) : null,
            num('Cooldown (s)', [...rp, 'cooldownS'], r.cooldownS, { min: 0, max: 2_592_000, none: true }), cond('Only when', [...rp, 'when'], r.when), ref('On success, run', [...rp, 'onSuccessEvent'], r.onSuccessEvent, 'events', 'nothing'));
        }),
        btn('Add recipe', () => run('add recipe', (dd) => { refused(DM.addRecipe(dd.trades.find((x) => x.key === t.key))); }), '', t.recipes.length >= LIM.recipes),
        note('Items are the game\'s own and are checked against its item law. The server settles the trade, so it cannot be repeated past its limit.'),
      ] : [note('Pick a trade or add one.')];
      return listPane('trades', 'Trades', kids, { add: adder('trades', (dd, name) => DM.addTrade(dd, name), 'Trade') });
    },
    events() {
      const d = doc(), e = d.events?.find((x) => x.key === ui.key) ?? null, p = ['events', { key: ui.key }], t = e?.trigger;
      const actions = (branch) => (e[branch] ?? []).map((a, i) => {
        const ap = [...p, branch, i];
        return h('div', { class: 'nest' },
          h('div', { class: 'row2' }, select('Do', [], a.k, [...Object.entries(ACTION_WORD)], { onPick: (v) => put('action', ap, DM.actionOf(doc(), v)) }), btn('x', () => run('remove action', (dd) => { DM.removeAction(dd.events.find((x) => x.key === e.key), branch, i); }), '', branch === 'then' && e.then.length < 2)),
          ...actionFields(a, ap));
      });
      const kids = e ? [
        section(e.name ?? e.key), text('Name', [...p, 'name'], e.name),
        select('Starts when', [], t.k, Object.entries(DM.TRIGGERS), { onPick: (v) => put('trigger', [...p, 'trigger'], DM.triggerOf(doc(), v)) }),
        t.k === 'enter_area' || t.k === 'interact' ? select('Object', [...p, 'trigger', 'interactive'], t.interactive, (d.interactives ?? []).filter((o) => (t.k === 'enter_area') === (o.kind === 'trigger')).map((o) => [o.key, o.name])) : null,
        t.k === 'npc_talk' ? select('Person', [...p, 'trigger', 'npc'], t.npc, (d.npcs ?? []).map((n) => [n.key, n.name])) : null,
        t.k === 'waypoint_reached' ? select('Route', [], t.route, rows('routes'), { onPick: (v) => put('route', [...p, 'trigger'], { k: t.k, route: v, waypoint: d.routes.find((r) => r.key === v)?.waypoints[0]?.key ?? '' }) }) : null,
        t.k === 'waypoint_reached' ? select('Waypoint', [...p, 'trigger', 'waypoint'], t.waypoint, (d.routes?.find((r) => r.key === t.route)?.waypoints ?? []).map((x) => [x.key, x.name])) : null,
        t.k === 'chained' ? note('It runs when another event, a route, an encounter, a trade or an answer starts it.') : null,
        cond('Only when', [...p, 'when'], e.when),
        section(`Then (${(e.then ?? []).length + (e.else ?? []).length} of ${LIM.actions} actions in all)`), ...actions('then'),
        field('Add an action', h('select', { on: { change: (ev) => { const v = ev.target.value; if (v) run('add action', (dd) => { refused(DM.addAction(dd.events.find((x) => x.key === e.key), 'then', v, dd)); }); ev.target.value = ''; } } }, h('option', { value: '', text: 'Choose...' }), ...Object.entries(ACTION_WORD).map(([k, tx]) => h('option', { value: k, text: tx })))),
        section('Otherwise (when the condition is not met)'), ...actions('else'),
        field('Add an action', h('select', { on: { change: (ev) => { const v = ev.target.value; if (v) run('add action', (dd) => { refused(DM.addAction(dd.events.find((x) => x.key === e.key), 'else', v, dd)); }); ev.target.value = ''; } } }, h('option', { value: '', text: 'Choose...' }), ...Object.entries(ACTION_WORD).map(([k, tx]) => h('option', { value: k, text: tx })))),
      ] : [note('Pick an event or add one.')];
      const pane = listPane('events', 'Events', kids, { add: adder('events', (dd, name) => DM.addEvent(dd, name, 'chained'), 'Event') });
      pane.append(h('div', { class: 'dmgraph' }, section('Event graph'), eventGraphSvg(DM.eventGraph(d, catalogue), ui.key ? `event:${ui.key}` : null, (id) => { if (id.startsWith('event:')) { ui.key = id.slice(6); render(); changed(); } })));
      return pane;
    },
    variables() {
      const d = doc(), v = d.variables?.find((x) => x.key === ui.key) ?? null, p = ['variables', { key: ui.key }];
      return listPane('variables', 'Variables', v ? [
        section(v.name ?? v.key), text('Name', [...p, 'name'], v.name),
        select('Holds', [], v.type, words(POI_VAR_TYPES), { onPick: (x) => run('variable type', (dd) => { DM.setVariableType(dd, v.key, x); }) }),
        select('Kept for', [...p, 'scope'], v.scope, words(POI_VAR_SCOPES)), valueIn('Starts as', [...p, 'initial'], v.initial, v.type),
        note('Only "Everyone, kept" and "Each character" survive a visit. Conditions and events read and set variables by name.'),
      ] : [note('Pick a variable or add one.')], { add: async () => {
        const x = await ask('New variable', [{ name: 'name', label: 'Name', value: 'Variable' }, { name: 'type', label: 'Holds', options: words(POI_VAR_TYPES), value: 'boolean' }, { name: 'scope', label: 'Kept for', options: words(POI_VAR_SCOPES), value: 'poi_global' }], { ok: 'Add', validate: (y) => (!y.name.trim() ? 'Give it a name.' : null) });
        if (!x) return;
        let made = null; run('add variable', (dd) => { made = DM.addVariable(dd, x.name.trim(), x.type, x.scope); });
        if (made?.refused) say(made.refused); else { ui.key = made?.row?.key ?? null; render(); changed(); }
      } });
    },
  };

  /** The fields one action asks for. */
  function actionFields(a, ap) {
    const d = doc();
    switch (a.k) {
      case 'say': return [para('Line', [...ap, 'text'], a.text)];
      case 'set_var': {
        const v = d.variables?.find((x) => x.key === a.var), add = a.add !== undefined;
        return [ref('Variable', [...ap, 'var'], a.var, 'variables'),
          v?.type === 'number' ? select('How', [], add ? 'add' : 'to', [['to', 'Set to'], ['add', 'Add']], { onPick: (m) => put('set variable', ap, m === 'add' ? { k: a.k, var: a.var, add: 1 } : { k: a.k, var: a.var, to: 0 }) }) : null,
          add ? num('Add', [...ap, 'add'], a.add, { whole: false }) : valueIn('To', [...ap, 'to'], a.to, v?.type ?? typeof a.to)];
      }
      case 'set_state': { const o = d.interactives?.find((x) => x.key === a.interactive); return [ref('Object', [...ap, 'interactive'], a.interactive, 'interactives'), select('Becomes', [...ap, 'state'], a.state, (o ? /** @type {any} */ (POI_INTERACTIVE_STATES)[o.kind] : [...new Set(Object.values(POI_INTERACTIVE_STATES).flat())]).map((s) => [s, s]))]; }
      case 'start_encounter': case 'end_encounter': return [ref('Encounter', [...ap, 'encounter'], a.encounter, 'encounters')];
      case 'start_route': return [select('Person', [...ap, 'npc'], a.npc, (d.npcs ?? []).map((n) => [n.key, n.name])), ref('Route', [...ap, 'route'], a.route, 'routes')];
      case 'stop_route': case 'spawn_npc': case 'despawn_npc': return [select('Person', [...ap, 'npc'], a.npc, (d.npcs ?? []).map((n) => [n.key, n.name]))];
      case 'open_dialogue': return [ref('Dialogue', [...ap, 'dialogue'], a.dialogue, 'dialogues')];
      case 'open_trade': return [ref('Trade', [...ap, 'trade'], a.trade, 'trades')];
      case 'give_item': case 'take_item': return [itemSelect(a.item, [...ap, 'item'], 'Item')];
      case 'give_gold': case 'take_gold': return [num('Gold', [...ap, 'amount'], a.amount, { min: 1, max: 1_000_000 })];
      default: return [ref('Event', [...ap, 'event'], a.event, 'events'), num('After (s)', [...ap, 'delayS'], a.delayS, { min: 0, max: 86400 })];
    }
  }

  function render() {
    clear(host);
    const d = doc();
    host.append(h('div', { class: 'dmbar' }, ...TABS.map(([k, t]) => h('button', { class: ui.tab === k ? 'on' : '', text: t, on: { click: () => { ui.tab = k; ui.key = null; render(); changed(); } } })),
      h('span', { class: 'dim', text: 'The game runs these on approved POIs. Try them in the Sandbox first.' })));
    if (!d) { host.append(note('No POI open.')); return; }
    if (d.v !== 2) { host.append(note('This POI is version 1. Open or create a version 2 POI to use the DM tools.')); return; }
    if (ui.tab === 'sandbox') { sandbox.render(); host.append(sandboxBox); return; }
    if (ui.tab === 'npcs' && !ui.key) ui.key = d.npcs?.[0]?.key ?? null;
    host.append(tabs[/** @type {keyof typeof tabs} */ (ui.tab)]());
  }
  void find; void getSel;
  return { render, sandbox, show: () => ({ tab: ui.tab, key: ui.key }), open: (tab, key) => { ui.tab = tab; ui.key = key ?? null; render(); } };
}
