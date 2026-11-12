// @ts-check
// Runs a v2 POI's game logic in the world (World Builder M5), loaded only when a POI with DM content is present. Each
// frame it walks people along routes, fires trigger zones, offers objects to use, answers Talk with a dialogue or a
// trade, spawns encounters, and runs delayed events, following poiDmCore.js's rules (shared with the Sandbox). A realm
// character's items and gold move only on the service's response (server-account/src/poiTrade.js, via realmGoldAct);
// offline, the same rules run on the character's own pack. In preview mode (the in-game editor's Test,
// poi/poiDmTest.js), `pack` and `give` operate on a throwaway purse, nothing is sent to the service, persistent
// variables and claims stay in memory, and each settlement is logged.

import {
  createDm, fire, advance, runEvent, completeEncounter, openDialogue, dialogueNow, choose, recipeBlock, claimRule,
  createWalker, stepWalker, persists, evalWhen, enterEncounter, useInteractive, followKeptStates, eventRule,
} from './poiDmCore.js';
import { takeStacks, takeGold, countOf, goldOf } from './poiSettle.js';
import { xform } from './poiRuntime.js';
import { setItemFields, mintCondition } from '../systems/item/itemTemplates.js';
import { lawTemplate, templateGroups } from '../systems/item/itemLaw.js';
import { weaponOfMaterial, armorOfMaterial } from '../combat/enemyEquipment.js';
import { createPoiDmPanel } from '../ui/poiDmPanel.js';
import { t as tr } from '../systems/textManager.js';

const byKey = (/** @type {any} */ rows, /** @type {string} */ key) => (Array.isArray(rows) ? rows.find((r) => r?.key === key) : undefined);

/** Whether a document carries anything this runtime runs. @param {any} doc */
export const hasDm = (doc) => doc?.v === 2 && (['events', 'dialogues', 'trades', 'routes', 'encounters', 'interactives'].some((k) => doc[k]?.length)
  || !!doc.npcs?.some((/** @type {any} */ n) => n?.showWhen));

/** The words a refusal is said in: the short ones beside a trade's offer, the service's answers as sentences. @type {Record<string, () => string>} */
const WHY_TEXT = Object.freeze({
  when: () => tr('poi.dm.why.when', 'not now'),
  items: () => tr('poi.dm.why.items', 'missing items'),
  gold: () => tr('poi.dm.why.gold', 'not enough gold'),
  limit: () => tr('poi.dm.why.limit', 'already done'),
  cooldown: () => tr('poi.dm.why.cooldown', 'not yet'),
  stock: () => tr('poi.dm.why.stock', 'sold out'),
  'poi-when': () => tr('poi.dm.why.when', 'not now'),
  'poi-items': () => tr('poi.dm.refusal.items', 'You are missing items.'),
  'poi-gold': () => tr('poi.dm.refusal.gold', 'You do not have enough gold.'),
  'poi-limit': () => tr('poi.dm.refusal.limit', 'You have already done that.'),
  'poi-cooldown': () => tr('poi.dm.refusal.cooldown', 'Not yet.'),
  'poi-stock': () => tr('poi.dm.refusal.stock', 'There is none left.'),
  'poi-not-live': () => tr('poi.dm.refusal.notLive', 'This place has changed. Come back later.'),
  offline: () => tr('poi.dm.refusal.offline', 'The realm is not answering. Nothing was traded.'),
  busy: () => tr('poi.dm.refusal.busy', 'Your last dealing with the realm is still being settled. Try again in a moment.'),
  lease: () => tr('poi.dm.refusal.lease', 'This character is now being played in another tab or on another device.'),
  unknown: () => tr('poi.dm.refusal.unknown', 'The realm did not answer, so this may or may not have gone through.'),
});
const whyText = (/** @type {string} */ w) => WHY_TEXT[w]?.() ?? tr('poi.dm.refusal.other', 'That cannot be done now.');
/** A refused act's words: an answer that never came (`unknown`) is not said as nothing traded. @param {any} a */
const refusalOf = (a) => (a?.unknown ? 'unknown' : a?.error ?? 'offline');

/** `out` set to the point `p` of a POI's own frame, placed by its matrix `m` and moved by `t`: no new array. @param {number[]} out @param {ArrayLike<number>} m @param {ArrayLike<number>} p @param {ArrayLike<number>} t */
function placeInto(out, m, p, t) {
  out[0] = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] + t[0];
  out[1] = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] + t[1];
  out[2] = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] + t[2];
  return out;
}
const NO_MOVE = Object.freeze([0, 0, 0]);

/**
 * An offline stack, made as the service's mintGift makes a plain one (no enchantments, no ledger id: those are the realm's).
 * @param {{ template: number, group?: string, material?: number, count: number }} s
 */
export function mintStack(s) {
  if (!lawTemplate(s.template)) return null;
  const group = s.group ?? templateGroups(s.template)[0];
  /** @type {any} */
  let item;
  if (group === 'Weapons') item = weaponOfMaterial(s.template, s.material ?? 0);
  else if (group === 'Armor') item = armorOfMaterial(s.template, s.material ?? 0);
  else item = mintCondition(setItemFields({ group, templateIndex: s.template }));
  if (s.count > 1) item.stackCount = s.count;
  return item;
}

/**
 * The outdoor enemy pool as the runtime uses it: a POI's enemy stands as a placed, unsaved enemy, counts as down once
 * it is a corpse, and is removed with no corpse when its encounter resets or its POI is taken down. A passive
 * encounter's enemy (`hostile: false`) spawns non-hostile like a non-hostile quest enemy: it stays peaceful until the
 * player attacks any non-hostile enemy in the area, which turns the area's peaceful enemies hostile.
 * @param {any} pool scenes/exteriorFoes.js createExteriorFoes
 */
export function poolFoes(pool) {
  return {
    spawnFoe: (/** @type {number} */ foe, /** @type {number[]} */ at, /** @type {any} */ o) => pool.spawnFoe(foe, at, { level: o.level ?? null, allied: false, placed: true, transient: true, groundAlign: { hitDist: null } })
      .then((/** @type {any} */ f) => { if (f?.ai && o.hostile === false) f.ai.isHostile = false; return f; }),
    isDown: (/** @type {any} */ f) => !!f?.corpse,
    removeFoe: (/** @type {any} */ f) => pool.removeFoe(f),
  };
}

/**
 * The runtime for every v2 POI the host runs. `act(path, body, opts)` is the realm session's act (null offline);
 * `pack()` returns the live player entity; `give` adds items and gold to it; `spawnFoe`, `isDown`, and `removeFoe` come
 * from the outdoor enemy pool (`poolFoes`). With `preview: true` (the editor's Test), `act` and `store` are unused,
 * persistent variables and claims stay in memory, an event that moves items, gold, or a persistent variable settles on
 * `pack()` by the service's rules (a gift-only event, once), and the log records trades and settles.
 * @param {any} deps
 */
export function createPoiDm(deps) {
  const { say, pack, give, feet, now = () => performance.now() / 1000 } = deps;
  const preview = !!deps.preview;
  const act = preview ? null : deps.act ?? null;
  /** @type {Map<string, any>} */
  const kept = new Map();
  const store = preview ? { get: (/** @type {string} */ k) => kept.get(k) ?? null, set: (/** @type {string} */ k, /** @type {any} */ v) => { kept.set(k, structuredClone(v)); } } : deps.store;
  /** In preview mode, holds each POI's claims in memory across runs for the runtime's lifetime. @type {Map<string,
   *  any>} */
  const claimsKept = new Map();
  /** A settle's line in the run's log, in preview alone (the Test panel reads it). @param {any} r @param {any} line */
  const logSettle = (r, line) => { if (preview) r.dm.log.push(line); };
  const panel = deps.panel ?? createPoiDmPanel();
  const txn = deps.txn ?? (() => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
  /** @type {Map<string, any>} id -> the run of one standing POI */
  const runs = new Map();
  /** A point worked out and read at once (a trigger zone's, an encounter's center). */
  const spot = [0, 0, 0];
  let busy = false;

  /** The pack, as the conditions read it. @param {any} dm */
  const reader = (dm) => () => {
    const p = pack() ?? { items: [], goldPieces: 0 };
    return { count: (/** @type {any} */ s) => countOf(p, s), gold: goldOf(p), getVar: (/** @type {string} */ k) => dm.vars[k] };
  };
  const storeKey = (/** @type {any} */ r) => `bunnyfall.poi.${r.id}.${deps.character?.() ?? 'local'}`;

  /**
   * A run made for a POI the first time it stands, and made again when its revision changes. An approved revision never
   * changes, so the feed reading the same revision again (a new document object) keeps the run and its fights.
   * @param {any} s
   */
  function runOf(s) {
    let r = runs.get(s.id);
    if (r && r.rev === s.rev) return r;
    if (r) dropRun(r);
    const dm = createDm(s.doc, { char: deps.character?.() ?? 'local', player: 'local' });
    // in preview an event that moves items or gold is settled on the throwaway purse, by the service's rules
    dm.service = preview || !!act;
    if (preview) { if (!claimsKept.has(s.id)) claimsKept.set(s.id, dm.claims); dm.claims = claimsKept.get(s.id); }
    r = { id: s.id, rev: s.rev, doc: s.doc, dm, walkers: new Map(), foes: new Map(), left: new Map(), waiting: new Map(), inside: new Set(), inEnc: new Set(), off: new Set(), last: now(), extras: [], extraOf: new Map(), shown: [], loaded: false, timers: new Map() };
    dm.read = reader(dm);
    runs.set(s.id, r);
    loadVars(r);
    return r;
  }
  function dropRun(/** @type {any} */ r) {
    for (const list of r.foes.values()) for (const f of list) deps.removeFoe?.(f);
    for (const list of r.left.values()) for (const f of list) deps.removeFoe?.(f);
    runs.delete(r.id);
  }

  /** The kept variables: the service's for a realm character, this device's offline. @param {any} r */
  async function loadVars(r) {
    if (act) {
      const a = await act('/v1/poi/event-claim', { poi: r.id, rev: r.rev, txnId: txn() }, { read: true }).catch(() => null);
      const vars = a?.ok ? a.data?.vars : null;
      if (vars) for (const [k, v] of Object.entries(vars)) if (k in r.dm.vars) r.dm.vars[k] = v;
    } else {
      const was = store?.get(storeKey(r));
      if (was && typeof was === 'object') for (const [k, v] of Object.entries(was)) if (k in r.dm.vars) r.dm.vars[k] = v;
    }
    r.loaded = true;
  }
  function saveVars(/** @type {any} */ r) {
    if (act || !store) return;
    /** @type {Record<string, any>} */
    const out = {};
    for (const v of r.doc.variables ?? []) if (persists(v)) out[v.key] = r.dm.vars[v.key];
    store.set(storeKey(r), out);
  }

  // ── settling items and gold ────────────────────────────────────

  /** The pack follows a settled answer: what it took, out; what it gave, in. @param {{ items: any[], gold: number }} took @param {{ items: any[], gold: number }} gave */
  function applyLocal(took, gave) {
    const p = pack();
    if (p) { takeStacks(p, took.items); takeGold(p, took.gold); }
    give(gave.items, gave.gold);
    deps.changed?.();
  }

  /** A recipe, settled. @param {any} r @param {string} trade @param {string} recipe */
  async function runTrade(r, trade, recipe) {
    if (busy) return;
    const rec = byKey(byKey(r.doc.trades, trade)?.recipes, recipe);
    if (!rec) return;
    const why = recipeBlock(r.dm, trade, recipe);
    if (why && why !== 'limit' && why !== 'cooldown' && why !== 'stock') { say(whyText(why)); logSettle(r, { k: 'trade_refused', trade, why }); return; }   // the service keeps the counts; the pack's own lacks are said here
    busy = true;
    try {
      if (act) {
        const a = await act('/v1/poi/trade', { poi: r.id, rev: r.rev, trade, recipe, txnId: txn() }, {});
        if (!a?.ok) { say(whyText(refusalOf(a))); return; }
        applyLocal(a.data?.took ?? { items: rec.requireItems ?? [], gold: rec.requireGold ?? 0 }, a.data?.gave ?? { items: [], gold: 0 });
      } else {
        if (why) { say(whyText(why)); logSettle(r, { k: 'trade_refused', trade, why }); return; }
        const p = pack();
        if (!p) return;
        if (!takeStacks(p, rec.requireItems ?? []).ok || !takeGold(p, rec.requireGold ?? 0)) { say(whyText('items')); logSettle(r, { k: 'trade_refused', trade, why: 'items' }); return; }
        give((rec.rewardItems ?? []).map(mintStack).filter(Boolean), rec.rewardGold ?? 0);
        deps.changed?.();
        logSettle(r, { k: 'trade', name: rec.name, took: { items: rec.requireItems ?? [], gold: rec.requireGold ?? 0 }, gave: { items: rec.rewardItems ?? [], gold: rec.rewardGold ?? 0 } });
      }
      for (const c of claimRule(rec, { char: r.dm.char, player: r.dm.player, nowS: r.dm.now })) {
        const k = `${trade}/${recipe}|${c.scope}`;
        r.dm.claims[k] = { n: (r.dm.claims[k]?.n ?? 0) + 1, last: r.dm.now };
      }
      say(tr('poi.dm.done', '{name}: done.', { name: rec.name }));
      if (rec.onSuccessEvent) runEvent(r.dm, rec.onSuccessEvent);
      saveVars(r);
    } finally { busy = false; }
  }

  /** The events the core handed to the service, settled one at a time. @param {any} r */
  async function drain(r) {
    if (busy || !r.dm.pending.length) return;
    const key = r.dm.pending.shift();
    const ev = byKey(r.doc.events, key);
    if (!ev) return;
    busy = true;
    try {
      if (act) {
        const a = await act('/v1/poi/event-claim', { poi: r.id, rev: r.rev, event: key, txnId: txn() }, {});
        // an event already claimed is passed over in silence
        if (!a?.ok) { if (a?.error !== 'poi-limit') say(whyText(refusalOf(a))); return; }
        const d = a.data ?? {};
        if (!d.nothing) applyLocal(d.took ?? { items: [], gold: 0 }, d.gave ?? { items: [], gold: 0 });
        for (const [k, v] of Object.entries(d.vars ?? {})) if (k in r.dm.vars) r.dm.vars[k] = v;
        runEvent(r.dm, key, { branch: d.branch ?? 'then', settled: !d.nothing });
      } else {
        // offline: the same rules, on this pack; an event that only gives (it takes nothing) is claimed once per
        // character, as the service claims it, and one already claimed is passed over (the service's answer is
        // `poi-limit`)
        const branch = evalWhen(ev.when, r.dm.read()) ? 'then' : 'else';
        const actions = ev[branch] ?? [];
        const rules = eventRule(actions, r.dm.char);
        if (rules.some((c) => (r.dm.claims[`event/${key}|${c.scope}`]?.n ?? 0) >= c.max)) { logSettle(r, { k: 'refused', event: key, why: 'limit' }); return; }
        const p = pack();
        const takes = actions.filter((/** @type {any} */ x) => x.k === 'take_item').map((/** @type {any} */ x) => x.item);
        const gold = actions.filter((/** @type {any} */ x) => x.k === 'take_gold').reduce((/** @type {number} */ n, /** @type {any} */ x) => n + x.amount, 0);
        if (!p || countShort(p, takes) || goldOf(p) < gold) { say(whyText('poi-items')); logSettle(r, { k: 'refused', event: key, why: !p || countShort(p, takes) ? 'items' : 'gold' }); return; }
        takeStacks(p, takes); takeGold(p, gold);
        give(actions.filter((/** @type {any} */ x) => x.k === 'give_item').map((/** @type {any} */ x) => mintStack(x.item)).filter(Boolean),
          actions.filter((/** @type {any} */ x) => x.k === 'give_gold').reduce((/** @type {number} */ n, /** @type {any} */ x) => n + x.amount, 0));
        deps.changed?.();
        for (const c of rules) { const k = `event/${key}|${c.scope}`; r.dm.claims[k] = { n: (r.dm.claims[k]?.n ?? 0) + 1, last: r.dm.now }; }
        runEvent(r.dm, key, { branch, settled: true });
        saveVars(r);
      }
    } finally { busy = false; }
  }
  const countShort = (/** @type {any} */ p, /** @type {any[]} */ stacks) => stacks.some((s) => countOf(p, s) < s.count);

  // ── what the player sees ───────────────────────────────────────

  /** Talk to a person: their dialogue, else their trade. Answers whether this runtime answered. @param {string} id @param {string} npcKey */
  function talk(id, npcKey) {
    const r = runs.get(id);
    if (!r) return false;
    const n = byKey(r.doc.npcs, npcKey);
    if (!n) return false;
    const heard = fire(r.dm, { k: 'npc_talk', npc: npcKey }).length > 0;
    if (!r.dm.dialogue && n.dialogue) openDialogue(r.dm, n.dialogue);
    if (!r.dm.dialogue && !r.dm.trade && n.trade) r.dm.trade = n.trade;
    r.talkingTo = n.name ?? npcKey;
    show(r);
    return heard || !!n.dialogue || !!n.trade;
  }

  /** The panel as the run stands: a dialogue, a trade, or nothing. @param {any} r */
  function show(r) {
    // what is on the screen, so the frame does not show it again
    r.opened = r.dm.dialogue ?? r.dm.trade;
    sayLog(r);
    if (r.dm.dialogue) {
      const d = dialogueNow(r.dm);
      if (!d) { r.dm.dialogue = null; panel.close(); return; }
      panel.dialogue(r.talkingTo ?? '', d.say, d.options, (i) => {
        const th = choose(r.dm, i, { run: false });
        if (th?.k === 'run_trade_recipe') runTrade(r, th.trade, th.recipe).then(() => show(r));
        else if (th?.k === 'trigger_event') runEvent(r.dm, th.event);
        show(r);
      }, () => { r.dm.dialogue = null; r.dm.trade = null; panel.close(); });
      return;
    }
    if (r.dm.trade) {
      const t = byKey(r.doc.trades, r.dm.trade);
      if (!t) { r.dm.trade = null; panel.close(); return; }
      const rows = (t.recipes ?? []).map((/** @type {any} */ x) => {
        const why = recipeBlock(r.dm, t.key, x.key);
        return { key: x.key, text: x.name, why: why && why !== 'limit' && why !== 'cooldown' && why !== 'stock' ? whyText(why) : null };
      });
      panel.trade(t.name, rows, (k) => { runTrade(r, t.key, k).then(() => show(r)); }, () => { r.dm.trade = null; panel.close(); });
      return;
    }
    panel.close();
  }

  /** The lines the run's events said, said once. @param {any} r */
  function sayLog(r) {
    r.said ??= 0;
    for (; r.said < r.dm.log.length; r.said++) {
      const l = r.dm.log[r.said];
      if (l.k === 'say') say(l.text);
    }
  }

  // ── the frame ──────────────────────────────────────────────────

  /**
   * One standing POI this frame. `s` the host's stand (`id, rev, doc, place`, its people `npcs`), `t` the pixel's
   * translation (scene = pixel frame + t). Answers the people to stand (despawned ones left out, walkers where they are).
   * @param {any} s @param {number[]} t @param {any[] | null} people
   */
  function frame(s, t, people) {
    const r = runOf(s);
    if (!r.loaded) return people;
    const nowS = now(), dt = Math.min(1, Math.max(0, nowS - r.last));
    r.last = nowS;
    advance(r.dm, dt);
    followKeptStates(r.dm);
    const f = feet();
    // the trigger zones the player stepped into
    for (const o of r.doc.interactives ?? []) {
      if (o.kind !== 'trigger' || !f) continue;
      const at = placeInto(spot, s.place, o.t, t);
      const inNow = r.dm.states[o.key] !== 'inactive' && Math.hypot(f[0] - at[0], f[2] - at[2]) <= o.radius;
      if (inNow && !r.inside.has(o.key)) { r.inside.add(o.key); fire(r.dm, { k: 'enter_area', interactive: o.key }); }
      else if (!inNow) r.inside.delete(o.key);
    }
    // the objects to use, as targets the world's Use key reaches: each made once a run, moved each frame
    r.extras.length = 0;
    for (const o of r.doc.interactives ?? []) {
      // a zone is no object to use, nor is an inactive quest object (a switch is used off or on)
      if (o.kind === 'trigger' || (o.kind === 'quest_object' && r.dm.states[o.key] === 'inactive')) continue;
      let x = r.extraOf.get(o.key);
      if (!x) { x = { key: `poidm:${r.id}:${o.key}`, name: o.name, at: [0, 0, 0], h: 1.5, w: Math.min(3, o.radius ?? 1), reach: o.radius, activate: () => useObject(r, o) }; r.extraOf.set(o.key, x); }
      // an object that looks like one of the POI's parts is used where that part stands
      const look = o.appearance?.k === 'part' ? byKey(r.doc.parts, o.appearance.key) : null;
      placeInto(x.at, s.place, look?.t ?? o.t, t);
      r.extras.push(x);
    }
    // an open door whose look is one of the POI's parts: that part is not drawn and does not block (the host reads `off`)
    r.off.clear();
    for (const o of r.doc.interactives ?? []) if (o.kind === 'door' && o.appearance?.k === 'part' && r.dm.states[o.key] === 'open') r.off.add(o.appearance.key);
    // the walkers, and the people shown only while their condition holds (read once a frame, and only when one has one)
    const list = r.shown;
    list.length = 0;
    const seen = r.doc.npcs?.some((/** @type {any} */ n) => n?.showWhen) ? r.dm.read() : null;
    for (const p of people ?? []) {
      const st = r.dm.npcs[p.key];
      if (st && !st.on) continue;
      const when = seen ? byKey(r.doc.npcs, p.key)?.showWhen : null;
      if (when && !evalWhen(when, seen)) continue;
      const route = st?.route ? byKey(r.doc.routes, st.route) : null;
      if (route) {
        let w = r.walkers.get(p.key);
        if (!w || w.route !== route) { w = createWalker(route); r.walkers.set(p.key, w); }
        if (!r.dm.dialogue || r.talkingTo !== p.name) {
          for (const wp of stepWalker(w, dt)) {
            fire(r.dm, { k: 'waypoint_reached', route: route.key, waypoint: wp });
            const ev = byKey(route.waypoints, wp)?.onArriveEvent;
            if (ev) runEvent(r.dm, ev);
          }
        }
        p.at = placeInto(w.scene ??= [0, 0, 0], s.place, w.pos, NO_MOVE);
      }
      list.push(p);
    }
    tickEncounters(r, s, t, dt);
    // a dialogue or trade an event opened (a zone, a waypoint, a timer, an encounter) is shown, once, as Talk's is
    const opened = r.dm.dialogue ?? r.dm.trade;
    if (opened && opened !== r.opened) show(r);
    r.opened = opened;
    sayLog(r);
    drain(r);
    // offline, a persistent variable an event set with nothing to settle is saved on this device at once
    if (!act && r.dm.dirty.size) { if ((r.doc.variables ?? []).some((/** @type {any} */ v) => r.dm.dirty.has(v.key) && persists(v))) saveVars(r); r.dm.dirty.clear(); }
    return list;
  }

  /** Use an object: a door or chest opens (with its key item when it is locked), a door shuts, or a switch flips,
   *  then its `interact` events run, by poiDmCore.js useInteractive. @param {any} r @param {any} o */
  function useObject(r, o) {
    const u = useInteractive(r.dm, o.key);
    if (u.locked && !u.ran.length) say(tr('poi.dm.locked', '{name} is locked.', { name: o.name }));
    show(r);
  }

  /**
   * Whether the player stands in an encounter's own area (its `center` and `radius`, on the ground plane, as trigger zones
   * are measured).
   * @param {any} s @param {number[]} t @param {any} e
   */
  function inArea(s, t, e) {
    const f = feet();
    if (!f || !e.center) return false;
    const at = placeInto(spot, s.place, e.center, t);
    return Math.hypot(f[0] - at[0], f[2] - at[2]) <= e.radius;
  }

  /**
   * Encounters started by events or by the player walking into their area: spawns their enemies, then watches them
   * until the completion rule is met. A survival timer counts only the time the player spends in the encounter's area.
   * @param {any} r @param {any} s @param {number[]} t @param {number} dt
   */
  function tickEncounters(r, s, t, dt) {
    for (const e of r.doc.encounters ?? []) {
      // walking into its area starts an idle encounter (one set to come back starts again on the next walk in)
      if (inArea(s, t, e)) { if (!r.inEnc.has(e.key)) { r.inEnc.add(e.key); enterEncounter(r.dm, e.key); } }
      else r.inEnc.delete(e.key);
      const state = r.dm.encounters[e.key];
      const have = r.foes.get(e.key);
      if (state === 'active' && !have && deps.spawnFoe) {
        // the enemies still standing from the encounter's last win go before it stands again, so two groups never stack
        for (const f of r.left.get(e.key) ?? []) deps.removeFoe?.(f);
        r.left.delete(e.key);
        /** @type {any[]} */
        const list = [];
        r.foes.set(e.key, list);
        r.timers.set(e.key, 0);
        r.waiting.set(e.key, (e.spawns ?? []).reduce((/** @type {number} */ n, /** @type {any} */ sp) => n + sp.count, 0));
        const settled = () => { if (r.foes.get(e.key) === list) r.waiting.set(e.key, (r.waiting.get(e.key) ?? 1) - 1); };
        for (const sp of e.spawns ?? []) {
          for (let i = 0; i < sp.count; i++) {
            const a = (i / Math.max(1, sp.count)) * Math.PI * 2;
            const local = [sp.at[0] + Math.cos(a) * (sp.spread ?? 0), sp.at[1], sp.at[2] + Math.sin(a) * (sp.spread ?? 0)];
            const at = xform(s.place, local);
            deps.spawnFoe(sp.foe, [at[0] + t[0], at[1] + t[1], at[2] + t[2]], { level: sp.level, hostile: e.aggression !== 'passive' })
              .then((f) => {
                settled();
                if (!f) return;
                // an enemy that finishes spawning after its encounter was reset or its POI taken down is removed at once
                if (runs.get(r.id) !== r || r.foes.get(e.key) !== list) { deps.removeFoe?.(f); return; }
                f.poiSpawn = sp.key; list.push(f);
              }, settled);
          }
        }
        continue;
      }
      if (state !== 'active' || !have) {
        if (state === 'idle' && have) { for (const f of have) deps.removeFoe?.(f); r.foes.delete(e.key); }
        continue;
      }
      const c = e.complete ?? { rule: 'all_dead' };
      const down = (/** @type {any} */ f) => deps.isDown?.(f) ?? false;
      let done = false;
      if (c.rule === 'timer_survived') {
        const held = (r.timers.get(e.key) ?? 0) + (inArea(s, t, e) ? dt : 0);
        r.timers.set(e.key, held);
        done = held >= c.seconds;
      }
      else if (c.rule === 'leader_dead') done = have.some((f) => f.poiSpawn === c.leader && down(f));
      else if (r.waiting.get(e.key) === 0 && !have.length) {
        // every spawn answered and none stood: nothing was fought, so the encounter waits for its next start
        r.dm.encounters[e.key] = 'idle';
        r.foes.delete(e.key);
        continue;
      }
      // every spawn answered, and every enemy that stood is down: a spawn the pool could not place is not waited for
      else done = r.waiting.get(e.key) === 0 && have.every(down);
      if (done) {
        completeEncounter(r.dm, e.key);
        // a won encounter's living enemies stay where they are; they go when it stands again, when its POI goes, or
        // when a new revision replaces the POI's run
        if (r.dm.encounters[e.key] !== 'active') { r.left.set(e.key, have); r.foes.delete(e.key); }
      }
    }
  }

  return {
    hasDm,
    frame,
    talk,
    /** The objects a POI offers to use this frame (scenes/poiNpcs.js setExtras). @param {string} id */
    extras: (id) => runs.get(id)?.extras ?? null,
    /** The keys of a POI's parts that are not drawn and do not block this frame: the looks of its open doors. @param {string} id */
    off: (id) => runs.get(id)?.off ?? null,
    /** Every run's dialogue and trade closed and the panel put away (the editor's Test holding the live POIs). */
    close() { for (const r of runs.values()) { r.dm.dialogue = null; r.dm.trade = null; r.opened = null; } panel.close(); },
    /** A POI taken down: its run, its foes and its panel go. @param {string} id */
    drop(id) { const r = runs.get(id); if (r) { dropRun(r); panel.close(); } },
    /** For tests: a POI's model. @param {string} id */
    modelOf: (id) => runs.get(id)?.dm ?? null,
  };
}
