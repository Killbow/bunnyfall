// @ts-check

// The DM Sandbox: the POI's game logic run here, on a copy of the open document, with nothing sent to the store. The
// builder sets what a test visitor carries (items, gold, starting values), then plays: walks into zones, uses objects,
// talks, picks replies, runs trades, finishes encounters and moves the clock. Every step is written to a log. The rules
// are the game's own (src/poi/poiDmCore.js), so what happens here is what happens in the world, except that the store's
// counts (once per character, stock) start empty each time the sandbox restarts.

import { h, clear } from './dom.js';
import { itemName } from '../dm.js';
import {
  createDm, fire, runEvent, runRecipe, recipeBlock, completeEncounter, openDialogue, dialogueNow, choose, advance,
} from '../../../../src/poi/poiDmCore.js';

const WHY = { when: 'condition not met', items: 'missing items', gold: 'not enough gold', limit: 'already done', cooldown: 'cooling down', stock: 'sold out', missing: 'missing' };

/** One log line as words. @param {any} l @param {any} catalogue */
export function logText(l, catalogue) {
  const st = (/** @type {any[]} */ xs) => xs.map((s) => itemName(catalogue, s)).join(', ');
  switch (l.k) {
    case 'trigger': return `Trigger: ${l.trigger.k}${l.trigger.interactive ? ` ${l.trigger.interactive}` : ''}${l.trigger.npc ? ` ${l.trigger.npc}` : ''}${l.trigger.waypoint ? ` ${l.trigger.route}/${l.trigger.waypoint}` : ''}`;
    case 'event': return `Event "${l.name}" runs its ${l.branch === 'then' ? 'Then' : 'Else'} branch`;
    case 'say': return `  Says: ${l.text}`;
    case 'set_var': return `  ${l.var}: ${JSON.stringify(l.was)} -> ${JSON.stringify(l.now)}`;
    case 'set_state': return `  ${l.interactive} is now ${l.state}`;
    case 'start_encounter': return `  Encounter ${l.encounter} starts (${l.foes} foes)`;
    case 'end_encounter': return `  Encounter ${l.encounter} ends`;
    case 'encounter_done': return `Encounter ${l.encounter} is won`;
    case 'give_item': return `  Gives ${l.text}`;
    case 'take_item': return `  Takes ${l.text}`;
    case 'give_gold': return `  Gives ${l.amount} gold`;
    case 'take_gold': return `  Takes ${l.amount} gold`;
    case 'queued': return `  ${l.event} will run in ${l.delayS} s`;
    case 'refused': return `Event ${l.event} refused: ${/** @type {any} */ (WHY)[l.why] ?? l.why}`;
    case 'dialogue': return `Dialogue ${l.dialogue} at node ${l.node}`;
    case 'choose': return `  Picked: ${l.text}`;
    case 'open_trade': return `  Trade ${l.trade} opens`;
    case 'trade': return `Trade "${l.name}": took ${st(l.took.items) || 'nothing'}${l.took.gold ? ` and ${l.took.gold} gold` : ''}, gave ${st(l.gave.items) || 'nothing'}${l.gave.gold ? ` and ${l.gave.gold} gold` : ''}`;
    case 'trade_refused': return `Trade ${l.trade}/${l.recipe} refused: ${/** @type {any} */ (WHY)[l.why] ?? l.why}`;
    case 'start_route': return `  ${l.npc} starts route ${l.route}`;
    case 'stop_route': return `  ${l.npc} stops`;
    case 'spawn_npc': return `  ${l.npc} appears`;
    case 'despawn_npc': return `  ${l.npc} leaves`;
    default: return JSON.stringify(l);
  }
}

/**
 * @param {{ host: HTMLElement, getDoc: () => any, catalogue: any, onChange?: (active: boolean) => void }} o
 */
export function createSandbox({ host, getDoc, catalogue, onChange = () => {} }) {
  /** @type {any} */
  let dm = null;
  /** what the visitor starts with */
  const start = { items: /** @type {any[]} */ ([]), gold: 100, vars: /** @type {Record<string, any>} */ ({}) };

  function restart() {
    const d = getDoc();
    if (!d) { dm = null; return; }
    dm = createDm(structuredClone(d), { items: structuredClone(start.items), gold: start.gold, vars: { ...start.vars }, char: 'sandbox', player: 'sandbox' });
    onChange(true);
  }
  function stop() { dm = null; onChange(false); render(); }

  const btn = (/** @type {string} */ text, /** @type {() => void} */ fn, title = '') => h('button', { text, title, on: { click: () => { fn(); render(); } } });
  const section = (/** @type {string} */ title, ...kids) => h('div', { class: 'sbx-sec' }, h('div', { class: 'sbx-h', text: title }), ...kids);

  function setup() {
    const d = getDoc();
    const tpl = h('input', { type: 'number', value: '71', min: 0, style: { width: '5em' }, title: 'Item template' });
    const cnt = h('input', { type: 'number', value: '1', min: 1, style: { width: '4em' }, title: 'How many' });
    return section('The visitor starts with',
      h('div', null, 'Gold ', h('input', { type: 'number', value: String(start.gold), min: 0, style: { width: '7em' }, on: { change: (e) => { start.gold = Math.max(0, Math.floor(Number(e.target.value)) || 0); } } })),
      h('div', null, ...start.items.map((s, i) => h('span', { class: 'chip' }, itemName(catalogue, s), ' ', h('button', { text: 'x', on: { click: () => { start.items.splice(i, 1); render(); } } })))),
      h('div', null, 'Add item ', tpl, ' x ', cnt, ' ', btn('Add', () => {
        const t = Math.floor(Number(/** @type {HTMLInputElement} */ (tpl).value)), c = Math.max(1, Math.floor(Number(/** @type {HTMLInputElement} */ (cnt).value)) || 1);
        if (Number.isInteger(t) && t >= 0) start.items.push({ template: t, count: c });
      })),
      ...(d?.variables ?? []).map((/** @type {any} */ v) => h('div', null, `${v.name} (${v.scope}) `, h('input', {
        value: JSON.stringify(v.key in start.vars ? start.vars[v.key] : v.initial), style: { width: '8em' }, title: 'Starting value, as JSON (true, 3, "text")',
        on: { change: (e) => { try { start.vars[v.key] = JSON.parse(e.target.value); } catch { delete start.vars[v.key]; } } },
      }))),
      h('div', null, btn(dm ? 'Restart the sandbox' : 'Start the sandbox', restart), dm ? btn('Stop', stop) : null),
    );
  }

  function controls() {
    const d = dm.doc;
    const out = [];
    const zones = (d.interactives ?? []).filter((/** @type {any} */ o) => o.kind === 'trigger');
    const objects = (d.interactives ?? []).filter((/** @type {any} */ o) => o.kind !== 'trigger');
    if (zones.length) out.push(section('Walk into', ...zones.map((/** @type {any} */ o) => btn(o.name, () => fire(dm, { k: 'enter_area', interactive: o.key })))));
    if (objects.length) out.push(section('Use', ...objects.map((/** @type {any} */ o) => btn(`${o.name} (${dm.states[o.key]})`, () => fire(dm, { k: 'interact', interactive: o.key })))));
    if (d.npcs?.length) {
      out.push(section('Talk to', ...d.npcs.filter((/** @type {any} */ n) => dm.npcs[n.key]?.on !== false).map((/** @type {any} */ n) => btn(n.name, () => {
        fire(dm, { k: 'npc_talk', npc: n.key });
        if (!dm.dialogue && n.dialogue) openDialogue(dm, n.dialogue);
        if (!dm.dialogue && !dm.trade && n.trade) dm.trade = n.trade;
      }))));
    }
    const wps = (d.routes ?? []).flatMap((/** @type {any} */ r) => (r.waypoints ?? []).map((/** @type {any} */ w) => [r, w]));
    if (wps.length) out.push(section('A walker reaches', ...wps.map(([r, w]) => btn(`${r.name}: ${w.name ?? w.key}`, () => { fire(dm, { k: 'waypoint_reached', route: r.key, waypoint: w.key }); if (w.onArriveEvent) runEvent(dm, w.onArriveEvent); }))));
    const active = (d.encounters ?? []).filter((/** @type {any} */ e) => dm.encounters[e.key] === 'active');
    if (active.length) out.push(section('Win the fight', ...active.map((/** @type {any} */ e) => btn(e.name, () => completeEncounter(dm, e.key)))));
    const chained = (d.events ?? []).filter((/** @type {any} */ e) => e.trigger?.k === 'chained');
    if (chained.length) out.push(section('Run an event', ...chained.map((/** @type {any} */ e) => btn(e.name ?? e.key, () => runEvent(dm, e.key)))));
    out.push(section('Clock', `${dm.now} s `, btn('+10 s', () => advance(dm, 10)), btn('+1 min', () => advance(dm, 60)), btn('+1 day', () => advance(dm, 86400)), dm.queue.length ? ` (${dm.queue.length} waiting)` : ''));
    return out;
  }

  function talk() {
    if (dm.dialogue) {
      const now = dialogueNow(dm);
      if (!now) { dm.dialogue = null; return null; }
      return section('Dialogue', h('div', { class: 'sbx-say', text: now.say }),
        ...now.options.map((/** @type {any} */ o) => btn(o.text, () => choose(dm, o.i))), btn('Leave', () => { dm.dialogue = null; }));
    }
    if (dm.trade) {
      const t = dm.doc.trades?.find((/** @type {any} */ x) => x.key === dm.trade);
      if (!t) { dm.trade = null; return null; }
      return section(`Trade: ${t.name}`, ...(t.recipes ?? []).map((/** @type {any} */ r) => {
        const why = recipeBlock(dm, t.key, r.key);
        return btn(why ? `${r.name} (${/** @type {any} */ (WHY)[why] ?? why})` : r.name, () => runRecipe(dm, t.key, r.key));
      }), btn('Leave', () => { dm.trade = null; }));
    }
    return null;
  }

  function state() {
    return section('The visitor now',
      h('div', null, `Gold: ${dm.gold}`),
      h('div', null, `Items: ${dm.items.map((/** @type {any} */ s) => itemName(catalogue, s)).join(', ') || 'none'}`),
      h('div', null, `Values: ${Object.entries(dm.vars).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ') || 'none'}`),
      h('div', null, `Encounters: ${Object.entries(dm.encounters).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`),
    );
  }

  function render() {
    clear(host);
    host.append(h('div', { class: 'sbx-banner', text: dm ? 'SANDBOX: nothing here is saved or sent to players.' : 'Sandbox: try this POI here. Nothing is saved or published.' }));
    host.append(setup());
    if (!dm) return;
    const t = talk();
    host.append(h('div', { class: 'sbx-cols' }, h('div', null, ...controls()), h('div', null, t, state())));
    host.append(section(`Log (${dm.log.length} steps)`, h('pre', { class: 'sbx-log', text: dm.log.map((/** @type {any} */ l) => logText(l, catalogue)).join('\n') || 'Nothing has happened yet.' })));
  }

  return { render, restart, stop, active: () => !!dm, model: () => dm };
}
