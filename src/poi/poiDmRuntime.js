// @ts-check
// A v2 POI's game logic, running in the world (World Builder, Milestone 5). Loaded only when a standing POI carries DM
// content (scenes/poiHost.js asks for it the first time one does), so the world's own bundle does not grow.
//
// What it does each frame for every standing v2 POI: walks the people along their routes and reports the waypoints they
// reach, fires `enter_area` when the player steps into a trigger zone, offers the POI's objects as things to use,
// answers Talk with the person's dialogue or trade, stands encounters' foes and watches them fall, and runs the clock for
// delayed events. The rules are poiDmCore.js's, the same ones the editor's Sandbox runs.
//
// Items and gold never move on the client's word when a realm character plays: a recipe is settled by
// POST /v1/poi/trade and an event that gives or takes by POST /v1/poi/event-claim (server-account/src/poiTrade.js), each
// through the realm session's act (systems/realmSaves.js realmGoldAct), and the pack follows the service's answer. An
// offline character runs the same rules on its own pack (poiSettle.js).

import {
  createDm, fire, advance, runEvent, completeEncounter, openDialogue, dialogueNow, choose, recipeBlock, claimRule,
  createWalker, stepWalker, persists, evalWhen,
} from './poiDmCore.js';
import { takeStacks, takeGold, countOf, goldOf } from './poiSettle.js';
import { xform } from './poiRuntime.js';
import { setItemFields, mintCondition } from '../systems/item/itemTemplates.js';
import { lawTemplate, templateGroups } from '../systems/item/itemLaw.js';
import { weaponOfMaterial, armorOfMaterial } from '../combat/enemyEquipment.js';
import { createPoiDmPanel } from '../ui/poiDmPanel.js';

const byKey = (/** @type {any} */ rows, /** @type {string} */ key) => (Array.isArray(rows) ? rows.find((r) => r?.key === key) : undefined);

/** Whether a document carries anything this runtime runs. @param {any} doc */
export const hasDm = (doc) => doc?.v === 2 && ['events', 'dialogues', 'trades', 'routes', 'encounters', 'interactives'].some((k) => doc[k]?.length);

/** The words a refusal is said in. */
const WHY_TEXT = Object.freeze({
  when: 'not now', items: 'missing items', gold: 'not enough gold', limit: 'already done', cooldown: 'not yet', stock: 'sold out',
  'poi-when': 'not now', 'poi-items': 'You are missing items.', 'poi-gold': 'You do not have enough gold.', 'poi-limit': 'You have already done that.',
  'poi-cooldown': 'Not yet.', 'poi-stock': 'There is none left.', 'poi-not-live': 'This place has changed. Come back later.', offline: 'The realm is not answering. Nothing was traded.',
});
const whyText = (/** @type {string} */ w) => /** @type {any} */ (WHY_TEXT)[w] ?? 'That cannot be done now.';

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
 * The runtime for every v2 POI the host stands.
 * @param {{
 *   say: (line: string) => void,
 *   pack: () => ({ items: any[], goldPieces?: number } | null),
 *   give: (records: any[], gold: number) => void,
 *   changed?: () => void,
 *   feet: () => (number[] | null),
 *   spawnFoe?: ((foe: number, at: number[], o: { level?: number, hostile: boolean }) => Promise<any>) | null,
 *   isDown?: (foe: any) => boolean,
 *   removeFoe?: ((foe: any) => void) | null,
 *   act?: ((path: string, body: any, opts: { reserve?: () => (() => void) }) => Promise<any>) | null,
 *   character?: () => (string | null),
 *   store?: { get: (k: string) => any, set: (k: string, v: any) => void } | null,
 *   now?: () => number,
 *   panel?: ReturnType<typeof createPoiDmPanel>,
 *   txn?: () => string,
 * }} deps `act` the realm session's act (null offline): `act(path, body)` answers the service's `{ ok, data }` or `{ ok: false, error }`
 */
export function createPoiDm(deps) {
  const { say, pack, give, feet, now = () => performance.now() / 1000 } = deps;
  const panel = deps.panel ?? createPoiDmPanel();
  const txn = deps.txn ?? (() => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
  /** @type {Map<string, any>} id -> the run of one standing POI */
  const runs = new Map();
  let busy = false;

  /** The pack, as the conditions read it. @param {any} dm */
  const reader = (dm) => () => {
    const p = pack() ?? { items: [], goldPieces: 0 };
    return { count: (/** @type {any} */ s) => countOf(p, s), gold: goldOf(p), getVar: (/** @type {string} */ k) => dm.vars[k] };
  };
  const storeKey = (/** @type {any} */ r) => `bunnyfall.poi.${r.id}.${deps.character?.() ?? 'local'}`;

  /** A run made for a POI the first time it stands, and made again when its revision changes. @param {any} s */
  function runOf(s) {
    let r = runs.get(s.id);
    if (r && r.rev === s.rev && r.doc === s.doc) return r;
    if (r) dropRun(r);
    const dm = createDm(s.doc, { char: deps.character?.() ?? 'local', player: 'local' });
    dm.service = !!deps.act;
    r = { id: s.id, rev: s.rev, doc: s.doc, dm, walkers: new Map(), foes: new Map(), inside: new Set(), last: now(), extras: [], loaded: false, timers: new Map() };
    dm.read = reader(dm);
    runs.set(s.id, r);
    loadVars(r);
    return r;
  }
  function dropRun(/** @type {any} */ r) {
    for (const list of r.foes.values()) for (const f of list) deps.removeFoe?.(f);
    runs.delete(r.id);
  }

  /** The kept variables: the service's for a realm character, this device's offline. @param {any} r */
  async function loadVars(r) {
    if (deps.act) {
      const a = await deps.act('/v1/poi/event-claim', { poi: r.id, rev: r.rev, txnId: txn() }, { read: true }).catch(() => null);
      const vars = a?.ok ? a.data?.vars : null;
      if (vars) for (const [k, v] of Object.entries(vars)) if (k in r.dm.vars) r.dm.vars[k] = v;
    } else {
      const kept = deps.store?.get(storeKey(r));
      if (kept && typeof kept === 'object') for (const [k, v] of Object.entries(kept)) if (k in r.dm.vars) r.dm.vars[k] = v;
    }
    r.loaded = true;
  }
  function saveVars(/** @type {any} */ r) {
    if (deps.act || !deps.store) return;
    /** @type {Record<string, any>} */
    const out = {};
    for (const v of r.doc.variables ?? []) if (persists(v)) out[v.key] = r.dm.vars[v.key];
    deps.store.set(storeKey(r), out);
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
    if (why && why !== 'limit' && why !== 'cooldown' && why !== 'stock') { say(whyText(why)); return; }   // the service keeps the counts; the pack's own lacks are said here
    busy = true;
    try {
      if (deps.act) {
        const a = await deps.act('/v1/poi/trade', { poi: r.id, rev: r.rev, trade, recipe, txnId: txn() }, {});
        if (!a?.ok) { say(whyText(a?.error ?? 'offline')); return; }
        applyLocal(a.data?.took ?? { items: rec.requireItems ?? [], gold: rec.requireGold ?? 0 }, a.data?.gave ?? { items: [], gold: 0 });
      } else {
        if (why) { say(whyText(why)); return; }
        const p = pack();
        if (!p) return;
        if (!takeStacks(p, rec.requireItems ?? []).ok || !takeGold(p, rec.requireGold ?? 0)) { say(whyText('items')); return; }
        give((rec.rewardItems ?? []).map(mintStack).filter(Boolean), rec.rewardGold ?? 0);
        deps.changed?.();
      }
      for (const c of claimRule(rec, { char: r.dm.char, player: r.dm.player, nowS: r.dm.now })) {
        const k = `${trade}/${recipe}|${c.scope}`;
        r.dm.claims[k] = { n: (r.dm.claims[k]?.n ?? 0) + 1, last: r.dm.now };
      }
      say(`${rec.name}: done.`);
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
      if (deps.act) {
        const a = await deps.act('/v1/poi/event-claim', { poi: r.id, rev: r.rev, event: key, txnId: txn() }, {});
        if (!a?.ok) { if (a?.error && a.error !== 'poi-limit') say(whyText(a.error)); return; }
        const d = a.data ?? {};
        if (!d.nothing) applyLocal(d.took ?? { items: [], gold: 0 }, d.gave ?? { items: [], gold: 0 });
        for (const [k, v] of Object.entries(d.vars ?? {})) if (k in r.dm.vars) r.dm.vars[k] = v;
        runEvent(r.dm, key, { branch: d.branch ?? 'then', settled: !d.nothing });
      } else {
        // offline: the same rules, on this pack
        const branch = evalWhen(ev.when, r.dm.read()) ? 'then' : 'else';
        const actions = ev[branch] ?? [];
        const p = pack();
        const takes = actions.filter((/** @type {any} */ x) => x.k === 'take_item').map((/** @type {any} */ x) => x.item);
        const gold = actions.filter((/** @type {any} */ x) => x.k === 'take_gold').reduce((/** @type {number} */ n, /** @type {any} */ x) => n + x.amount, 0);
        if (!p || countShort(p, takes) || goldOf(p) < gold) { say(whyText('poi-items')); return; }
        takeStacks(p, takes); takeGold(p, gold);
        give(actions.filter((/** @type {any} */ x) => x.k === 'give_item').map((/** @type {any} */ x) => mintStack(x.item)).filter(Boolean),
          actions.filter((/** @type {any} */ x) => x.k === 'give_gold').reduce((/** @type {number} */ n, /** @type {any} */ x) => n + x.amount, 0));
        deps.changed?.();
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
        return { key: x.key, text: x.name, why: why && why !== 'limit' && why !== 'cooldown' && why !== 'stock' ? /** @type {any} */ (WHY_TEXT)[why] ?? why : null };
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
    const f = feet();
    // the trigger zones the player stepped into
    for (const o of r.doc.interactives ?? []) {
      if (o.kind !== 'trigger' || !f) continue;
      const at = xform(s.place, o.t);
      const inNow = r.dm.states[o.key] !== 'inactive' && Math.hypot(f[0] - at[0] - t[0], f[2] - at[2] - t[2]) <= o.radius;
      if (inNow && !r.inside.has(o.key)) { r.inside.add(o.key); fire(r.dm, { k: 'enter_area', interactive: o.key }); }
      else if (!inNow) r.inside.delete(o.key);
    }
    // the objects to use, as targets the world's Use key reaches
    r.extras.length = 0;
    for (const o of r.doc.interactives ?? []) {
      if (o.kind === 'trigger') continue;
      const at = xform(s.place, o.t);
      r.extras.push({ key: `poidm:${r.id}:${o.key}`, name: o.name, at: [at[0] + t[0], at[1] + t[1], at[2] + t[2]], h: 1.5, w: Math.min(3, o.radius ?? 1), activate: () => useObject(r, o) });
    }
    // the walkers
    const list = [];
    for (const p of people ?? []) {
      const st = r.dm.npcs[p.key];
      if (st && !st.on) continue;
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
        const at = xform(s.place, w.pos);
        p.at = at;
      }
      list.push(p);
    }
    tickEncounters(r, s, t);
    sayLog(r);
    drain(r);
    return list;
  }

  /** Use an object: its key, if it needs one, then its `interact` events. @param {any} r @param {any} o */
  function useObject(r, o) {
    if (o.keyItem && r.dm.states[o.key] === 'locked') {
      const p = pack();
      if (!p || countOf(p, o.keyItem) < (o.keyItem.count ?? 1)) { say(`${o.name} is locked.`); return; }
      r.dm.states[o.key] = 'closed';
    }
    if (!fire(r.dm, { k: 'interact', interactive: o.key }).length && r.dm.states[o.key] === 'locked') say(`${o.name} is locked.`);
    show(r);
  }

  /** Encounters started by events: their foes stood, then watched until the rule is met. @param {any} r @param {any} s @param {number[]} t */
  function tickEncounters(r, s, t) {
    for (const e of r.doc.encounters ?? []) {
      const state = r.dm.encounters[e.key];
      const have = r.foes.get(e.key);
      if (state === 'active' && !have && deps.spawnFoe) {
        /** @type {any[]} */
        const list = [];
        r.foes.set(e.key, list);
        r.timers.set(e.key, now());
        for (const sp of e.spawns ?? []) {
          for (let i = 0; i < sp.count; i++) {
            const a = (i / Math.max(1, sp.count)) * Math.PI * 2;
            const local = [sp.at[0] + Math.cos(a) * (sp.spread ?? 0), sp.at[1], sp.at[2] + Math.sin(a) * (sp.spread ?? 0)];
            const at = xform(s.place, local);
            deps.spawnFoe(sp.foe, [at[0] + t[0], at[1] + t[1], at[2] + t[2]], { level: sp.level, hostile: e.aggression !== 'passive' })
              .then((f) => { if (f) { f.poiSpawn = sp.key; list.push(f); } }, () => {});
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
      const asked = (e.spawns ?? []).reduce((/** @type {number} */ n, /** @type {any} */ sp) => n + sp.count, 0);
      let done = false;
      if (c.rule === 'timer_survived') done = now() - (r.timers.get(e.key) ?? now()) >= c.seconds;
      else if (c.rule === 'leader_dead') done = have.some((f) => f.poiSpawn === c.leader && down(f));
      else done = have.length >= asked && have.every(down);
      if (done) {
        completeEncounter(r.dm, e.key);
        if (r.dm.encounters[e.key] !== 'active') r.foes.delete(e.key);
      }
    }
  }

  return {
    hasDm,
    frame,
    talk,
    /** The objects a POI offers to use this frame (scenes/poiNpcs.js setExtras). @param {string} id */
    extras: (id) => runs.get(id)?.extras ?? null,
    /** A POI taken down: its run, its foes and its panel go. @param {string} id */
    drop(id) { const r = runs.get(id); if (r) { dropRun(r); panel.close(); } },
    /** For tests: a POI's model. @param {string} id */
    modelOf: (id) => runs.get(id)?.dm ?? null,
  };
}
