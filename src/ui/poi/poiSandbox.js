// @ts-check
// Runs the open POI's game logic in the in-game POI editor's DM Sandbox on a copy of its document, using the game's own
// rules (poi/poiDmCore.js). The builder sets what a test visitor carries (items, gold, starting values), then plays:
// walks into zones and encounter areas, uses objects, talks, picks answers, runs trades, wins fights, fires events by
// hand, moves the clock, and reads every step in a log. The visitor's purse and pack are the sandbox's own: nothing
// here touches the character, its save, or the realm, and nothing is given or sent. The counts a realm tracks (once per
// character, stock) start empty each time the sandbox starts again.

import { t } from '../../systems/textManager.js';
import { itemName, itemChoices, stateWord, groupWord } from '../../poi/poiDmEdit.js';
import {
  createDm, fire, runEvent, runRecipe, recipeBlock, completeEncounter, openDialogue, dialogueNow, choose, advance,
  enterEncounter, useInteractive, followKeptStates,
} from '../../poi/poiDmCore.js';

/** @type {Record<string, () => string>} */
const WHY = {
  when: () => t('poi.sandbox.why.when', 'its condition is not met'), items: () => t('poi.sandbox.why.items', 'missing items'), gold: () => t('poi.sandbox.why.gold', 'not enough gold'),
  limit: () => t('poi.sandbox.why.limit', 'already done'), cooldown: () => t('poi.sandbox.why.cooldown', 'cooling down'), stock: () => t('poi.sandbox.why.stock', 'sold out'),
  missing: () => t('poi.sandbox.why.missing', 'it is missing'), depth: () => t('poi.sandbox.why.depth', 'too many events started one another'), service: () => t('poi.sandbox.why.service', 'the realm settles it'),
  scope: () => t('poi.sandbox.why.scope', 'its condition reads a variable the realm does not save'), reward: () => t('poi.sandbox.why.reward', 'an item it gives cannot be made'),
  goldFull: () => t('poi.sandbox.why.goldFull', 'the purse cannot hold that much gold'),
};
const why = (/** @type {string} */ w) => WHY[w]?.() ?? w;
const kindIn = (/** @type {any} */ doc, /** @type {string} */ key) => (doc.interactives ?? []).find((/** @type {any} */ o) => o.key === key)?.kind;
const nameIn = (/** @type {any} */ doc, /** @type {string} */ coll, /** @type {string} */ key) => (doc[coll] ?? []).find((/** @type {any} */ r) => r.key === key)?.name ?? key;

/** One log line as words. @param {any} doc @param {any} l */
export function logText(doc, l) {
  const st = (/** @type {any[]} */ xs) => xs.map((s) => itemName(null, s)).join(', ');
  switch (l.k) {
    case 'trigger': {
      const tg = l.trigger;
      if (tg.k === 'enter_area') return t('poi.sandbox.log.enters', 'The visitor walks into {name}.', { name: nameIn(doc, 'interactives', tg.interactive) });
      if (tg.k === 'interact') return t('poi.sandbox.log.uses', 'The visitor uses {name}.', { name: nameIn(doc, 'interactives', tg.interactive) });
      if (tg.k === 'npc_talk') return t('poi.sandbox.log.talks', 'The visitor talks to {name}.', { name: nameIn(doc, 'npcs', tg.npc) });
      if (tg.k === 'waypoint_reached') return t('poi.sandbox.log.reaches', 'A walker reaches {waypoint} on {route}.', { waypoint: tg.waypoint, route: nameIn(doc, 'routes', tg.route) });
      return t('poi.sandbox.log.trigger', 'Something starts an event.');
    }
    case 'event': return l.branch === 'then' ? t('poi.sandbox.log.eventThen', 'Event "{name}" runs.', { name: l.name }) : t('poi.sandbox.log.eventElse', 'Event "{name}" runs its Otherwise actions.', { name: l.name });
    case 'say': return t('poi.sandbox.log.say', '  Says: {text}', { text: l.text });
    case 'set_var': return t('poi.sandbox.log.setVar', '  {var}: {was} becomes {now}', { var: nameIn(doc, 'variables', l.var), was: JSON.stringify(l.was), now: JSON.stringify(l.now) });
    case 'set_state': return t('poi.sandbox.log.setState', '  {name} is now {state}.', { name: nameIn(doc, 'interactives', l.interactive), state: stateWord(l.state, kindIn(doc, l.interactive)) });
    case 'locked': return t('poi.sandbox.log.locked', '  {name} is locked.', { name: nameIn(doc, 'interactives', l.interactive) });
    case 'inactive': return t('poi.sandbox.log.inactive', '  {name} is inactive and does nothing.', { name: nameIn(doc, 'interactives', l.interactive) });
    case 'enter_encounter': return t('poi.sandbox.log.enterEnc', 'The visitor walks into the area of {name}.', { name: nameIn(doc, 'encounters', l.encounter) });
    case 'start_encounter': return t('poi.sandbox.log.startEnc', '  Encounter {name} starts ({n, plural, one {# enemy} other {# enemies}}).', { name: nameIn(doc, 'encounters', l.encounter), n: l.foes });
    case 'end_encounter': return t('poi.sandbox.log.endEnc', '  Encounter {name} ends.', { name: nameIn(doc, 'encounters', l.encounter) });
    case 'encounter_done': return t('poi.sandbox.log.encDone', 'Encounter {name} is won.', { name: nameIn(doc, 'encounters', l.encounter) });
    case 'give_item': return t('poi.sandbox.log.give', '  Gives {what}.', { what: itemName(null, l.item) });
    case 'take_item': return t('poi.sandbox.log.take', '  Takes {what}.', { what: itemName(null, l.item) });
    case 'give_gold': return t('poi.sandbox.log.giveGold', '  Gives {n, number} gold.', { n: l.amount });
    case 'take_gold': return t('poi.sandbox.log.takeGold', '  Takes {n, number} gold.', { n: l.amount });
    case 'queued': return t('poi.sandbox.log.queued', '  {name} will run in {s, number} s.', { name: nameIn(doc, 'events', l.event), s: l.delayS });
    case 'refused': return t('poi.sandbox.log.refused', 'Event {name} does not run: {why}.', { name: nameIn(doc, 'events', l.event), why: why(l.why) });
    case 'to_service': return t('poi.sandbox.log.toService', 'Event {name} would be settled by the realm.', { name: nameIn(doc, 'events', l.event) });
    case 'dialogue': return t('poi.sandbox.log.dialogue', 'Dialogue {name} is at line {line}.', { name: nameIn(doc, 'dialogues', l.dialogue), line: l.node });
    case 'choose': return t('poi.sandbox.log.choose', '  The visitor answers: {text}', { text: l.text });
    case 'open_trade': return t('poi.sandbox.log.openTrade', '  Trade {name} opens.', { name: nameIn(doc, 'trades', l.trade) });
    case 'trade': return t('poi.sandbox.log.trade', 'Trade "{name}": took {took}, gave {gave}.', {
      name: l.name,
      took: [st(l.took.items), l.took.gold ? t('poi.sandbox.log.gold', '{n, number} gold', { n: l.took.gold }) : ''].filter(Boolean).join(', ') || t('poi.sandbox.log.nothing', 'nothing'),
      gave: [st(l.gave.items), l.gave.gold ? t('poi.sandbox.log.gold', '{n, number} gold', { n: l.gave.gold }) : ''].filter(Boolean).join(', ') || t('poi.sandbox.log.nothing', 'nothing'),
    });
    case 'trade_refused': return t('poi.sandbox.log.tradeRefused', 'Trade {name} is refused: {why}.', { name: nameIn(doc, 'trades', l.trade), why: why(l.why) });
    case 'start_route': return t('poi.sandbox.log.startRoute', '  {npc} starts walking {route}.', { npc: nameIn(doc, 'npcs', l.npc), route: nameIn(doc, 'routes', l.route) });
    case 'stop_route': return t('poi.sandbox.log.stopRoute', '  {npc} stops walking.', { npc: nameIn(doc, 'npcs', l.npc) });
    case 'spawn_npc': return t('poi.sandbox.log.spawnNpc', '  {npc} appears.', { npc: nameIn(doc, 'npcs', l.npc) });
    case 'despawn_npc': return t('poi.sandbox.log.despawnNpc', '  {npc} leaves.', { npc: nameIn(doc, 'npcs', l.npc) });
    default: return JSON.stringify(l);
  }
}

/**
 * @param {{ doc: Document, getDoc: () => any, el: (tag: string, cls?: string, text?: string | null) => any, btn: (text: string, fn: () => void, cls?: string) => any, redraw: () => void }} o
 */
export function createPoiSandbox({ doc, getDoc, el, btn, redraw }) {
  /** @type {any} */
  let dm = null;
  /** what the test visitor starts with */
  const start = { items: /** @type {any[]} */ ([]), gold: 100, vars: /** @type {Record<string, any>} */ ({}) };
  /** Creates a button that runs `fn`, syncs objects with their persistent state variables (`followKeptStates`), and
   *  redraws the panel. @param {string} text @param {() => void} fn */
  const press = (text, fn) => btn(text, () => { fn(); if (dm) followKeptStates(dm); redraw(); });
  const section = (/** @type {string} */ title, /** @type {any[]} */ ...kids) => { const s = el('div', 'dfpoi-card'); s.append(el('div', 'dfpoi-h', title), ...kids.filter(Boolean)); return s; };
  const row = (/** @type {any[]} */ ...kids) => { const r = el('div', 'dfpoi-row'); r.append(...kids.filter(Boolean)); return r; };

  function restart() {
    const d = getDoc();
    if (!d) { dm = null; return; }
    dm = createDm(structuredClone(d), { items: structuredClone(start.items), gold: start.gold, vars: { ...start.vars }, char: 'sandbox', player: 'sandbox' });
    followKeptStates(dm);
  }

  function setup() {
    const d = getDoc();
    const gold = el('input');
    gold.type = 'number'; gold.min = '0'; gold.value = String(start.gold);
    gold.addEventListener('change', () => { start.gold = Math.max(0, Math.floor(Number(gold.value)) || 0); });
    const pick = el('select');
    let group = null, og = null;
    for (const it of itemChoices()) {
      if (it.group !== group) { group = it.group; og = el('optgroup'); og.label = groupWord(group); pick.append(og); }
      const op = el('option', '', it.name); op.value = String(it.template); og.append(op);
    }
    pick.value = '71';
    const count = el('input');
    count.type = 'number'; count.min = '1'; count.value = '1';
    const held = start.items.map((s, i) => { const c = el('span', 'dfpoi-chip', `${itemName(null, s)} `); c.append(btn('x', () => { start.items.splice(i, 1); redraw(); })); return c; });
    const vars = (d?.variables ?? []).map((/** @type {any} */ v) => {
      const i = el('input');
      i.value = JSON.stringify(v.key in start.vars ? start.vars[v.key] : v.initial);
      i.title = t('poi.sandbox.varHint', 'Its starting value: true or false, a number, or text in quotes.');
      i.addEventListener('change', () => { try { start.vars[v.key] = JSON.parse(i.value); } catch { delete start.vars[v.key]; } });
      const l = el('label', '', v.name ?? v.key);
      return row(l, i);
    });
    return section(t('poi.sandbox.startsWith', 'The visitor starts with'),
      row(el('label', '', t('poi.sandbox.gold', 'Gold')), gold),
      held.length ? row(...held) : null,
      row(el('label', '', t('poi.sandbox.addItem', 'Add an item')), pick, count, btn(t('poi.sandbox.add', 'Add'), () => {
        start.items.push({ template: Number(pick.value), count: Math.max(1, Math.floor(Number(count.value)) || 1) }); redraw();
      })),
      ...vars,
      row(btn(dm ? t('poi.sandbox.restart', 'Start again') : t('poi.sandbox.start', 'Start the sandbox'), () => { restart(); redraw(); }), dm ? btn(t('poi.sandbox.stop', 'Stop'), () => { dm = null; redraw(); }) : null));
  }

  function controls() {
    const d = dm.doc, out = [];
    const zones = (d.interactives ?? []).filter((/** @type {any} */ o) => o.kind === 'trigger');
    const objects = (d.interactives ?? []).filter((/** @type {any} */ o) => o.kind !== 'trigger');
    if (zones.length) out.push(section(t('poi.sandbox.walkInto', 'Walk into'), row(...zones.map((/** @type {any} */ o) => press(o.name, () => { if (dm.states[o.key] !== 'inactive') fire(dm, { k: 'enter_area', interactive: o.key }); })))));
    if (d.encounters?.length) out.push(section(t('poi.sandbox.walkIntoArea', 'Walk into the area of'), row(...d.encounters.map((/** @type {any} */ e) => press(e.name, () => { enterEncounter(dm, e.key); })))));
    if (objects.length) out.push(section(t('poi.sandbox.use', 'Use'), objects.some((/** @type {any} */ o) => o.kind === 'switch') ? el('div', 'dfpoi-sub', t('poi.sandbox.leverHint', 'A switch is off or on, and each use flips it.')) : null, row(...objects.map((/** @type {any} */ o) => press(t('poi.sandbox.useState', '{name} ({state})', { name: o.name, state: stateWord(dm.states[o.key], o.kind) }), () => { useInteractive(dm, o.key); })))));
    const people = (d.npcs ?? []).filter((/** @type {any} */ n) => dm.npcs[n.key]?.on !== false);
    if (people.length) {
      out.push(section(t('poi.sandbox.talkTo', 'Talk to'), row(...people.map((/** @type {any} */ n) => press(n.name, () => {
        fire(dm, { k: 'npc_talk', npc: n.key });
        if (!dm.dialogue && n.dialogue) openDialogue(dm, n.dialogue);
        if (!dm.dialogue && !dm.trade && n.trade) dm.trade = n.trade;
      })))));
    }
    const wps = (d.routes ?? []).flatMap((/** @type {any} */ r) => (r.waypoints ?? []).map((/** @type {any} */ w) => [r, w]));
    if (wps.length) out.push(section(t('poi.sandbox.walkerReaches', 'A walker reaches'), row(...wps.map(([r, w]) => press(`${r.name}: ${w.name ?? w.key}`, () => { fire(dm, { k: 'waypoint_reached', route: r.key, waypoint: w.key }); if (w.onArriveEvent) runEvent(dm, w.onArriveEvent); })))));
    const active = (d.encounters ?? []).filter((/** @type {any} */ e) => dm.encounters[e.key] === 'active');
    if (active.length) out.push(section(t('poi.sandbox.win', 'Win the fight'), row(...active.map((/** @type {any} */ e) => press(e.name, () => { completeEncounter(dm, e.key); })))));
    if (d.events?.length) out.push(section(t('poi.sandbox.runEvent', 'Run an event by hand'), row(...d.events.map((/** @type {any} */ e) => press(e.name ?? e.key, () => { runEvent(dm, e.key); })))));
    out.push(section(t('poi.sandbox.clock', 'Clock'), row(el('span', '', t('poi.sandbox.now', '{s, number} s', { s: dm.now })), press(t('poi.sandbox.plus10', '+10 s'), () => advance(dm, 10)),
      press(t('poi.sandbox.plusMin', '+1 min'), () => advance(dm, 60)), press(t('poi.sandbox.plusDay', '+1 day'), () => advance(dm, 86400)),
      dm.queue.length ? el('span', '', t('poi.sandbox.waiting', '{n, plural, one {# event waits} other {# events wait}}', { n: dm.queue.length })) : null)));
    return out;
  }

  function talk() {
    if (dm.dialogue) {
      const now = dialogueNow(dm);
      if (!now) { dm.dialogue = null; return null; }
      return section(t('poi.sandbox.dialogue', 'Dialogue'), el('div', 'dfpoi-sub', now.say), ...now.options.map((/** @type {any} */ o) => row(press(o.text, () => { choose(dm, o.i); }))),
        row(press(t('poi.sandbox.leave', 'Leave'), () => { dm.dialogue = null; })));
    }
    if (dm.trade) {
      const tr = dm.doc.trades?.find((/** @type {any} */ x) => x.key === dm.trade);
      if (!tr) { dm.trade = null; return null; }
      return section(t('poi.sandbox.trade', 'Trade: {name}', { name: tr.name }), ...(tr.recipes ?? []).map((/** @type {any} */ r) => {
        const w = recipeBlock(dm, tr.key, r.key);
        return row(press(w ? t('poi.sandbox.recipeWhy', '{name} ({why})', { name: r.name, why: why(w) }) : r.name, () => { runRecipe(dm, tr.key, r.key); }));
      }), row(press(t('poi.sandbox.leave', 'Leave'), () => { dm.trade = null; })));
    }
    return null;
  }

  function state() {
    const d = dm.doc;
    return section(t('poi.sandbox.visitorNow', 'The visitor now'),
      el('div', '', t('poi.sandbox.goldNow', 'Gold: {n, number}', { n: dm.gold })),
      el('div', '', t('poi.sandbox.itemsNow', 'Items: {list}', { list: dm.items.map((/** @type {any} */ s) => itemName(null, s)).join(', ') || t('poi.sandbox.none', 'none') })),
      el('div', '', t('poi.sandbox.valuesNow', 'Values: {list}', { list: Object.entries(dm.vars).map(([k, v]) => `${nameIn(d, 'variables', k)} = ${JSON.stringify(v)}`).join(', ') || t('poi.sandbox.none', 'none') })),
      el('div', '', t('poi.sandbox.objectsNow', 'Objects: {list}', { list: Object.entries(dm.states).map(([k, v]) => `${nameIn(d, 'interactives', k)} ${stateWord(String(v), kindIn(d, k))}`).join(', ') || t('poi.sandbox.none', 'none') })),
      el('div', '', t('poi.sandbox.encountersNow', 'Encounters: {list}', { list: Object.entries(dm.encounters).map(([k, v]) => `${nameIn(d, 'encounters', k)} ${ENC_WORD[String(v)]?.() ?? v}`).join(', ') || t('poi.sandbox.none', 'none') })));
  }
  /** @type {Record<string, () => string>} */
  const ENC_WORD = { idle: () => t('poi.sandbox.enc.idle', 'waiting'), active: () => t('poi.sandbox.enc.active', 'fighting'), done: () => t('poi.sandbox.enc.done', 'won') };

  /** The sandbox's view, drawn fresh. */
  function view() {
    const box = el('div', 'dfpoi-sandbox');
    box.append(el('div', 'dfpoi-warn', dm ? t('poi.sandbox.onBanner', 'Sandbox: a test visitor with a purse and pack of their own. Nothing here changes your character or is sent to the realm.')
      : t('poi.sandbox.offBanner', 'Sandbox: try this POI on a test visitor. Nothing is saved, given, or sent.')));
    box.append(setup());
    if (!dm) return box;
    const cols = el('div', 'dfpoi-dm-cols');
    const a = el('div'), b = el('div');
    a.append(...controls());
    b.append(...[talk(), state()].filter(Boolean));
    cols.append(a, b);
    const log = el('pre', 'dfpoi-dm-log', dm.log.map((/** @type {any} */ l) => logText(dm.doc, l)).join('\n') || t('poi.sandbox.empty', 'Nothing has happened yet.'));
    box.append(cols, section(t('poi.sandbox.log', 'Log ({n, plural, one {# step} other {# steps}})', { n: dm.log.length }), log));
    void doc;
    return box;
  }

  return { view, restart, stop: () => { dm = null; }, active: () => !!dm, model: () => dm, start };
}
