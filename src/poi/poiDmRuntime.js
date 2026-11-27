// @ts-check
// Runs a v2 POI's people, zones, objects, talk, trades, encounters, and events in the world, by poiDmCore.js.
// Before a trade or event takes items or gold, the player chooses what to hand over. Online, the account service
// settles them (server-account/src/poiTrade.js); offline and in Test, tradeCheck and drain repeat its checks.

import {
  createDm, fire, advance, runEvent, completeEncounter, openDialogue, dialogueNow, choose, recipeBlock, claimRule,
  createWalker, stepWalker, persists, evalWhen, enterEncounter, useInteractive, followKeptStates, eventRule, varsRead, DAY_S,
  takesOf, branchOf,
} from './poiDmCore.js';
import { takeStacks, takeChosen, handRecord, recordAccepts, leavesOf, takeGold, countOf, takeableOf, goldOf, potionKeyOf, eventClaim, recipeClaim, HAND_MAX } from './poiSettle.js';
import { tradeableRecord, recordIsOffered, recordCount, boundRecord, loadedWagonOf } from '../net/realmTradeLaw.js';
import { itemLongName, conditionWord } from '../items/itemInfo.js';
import { stampItemIds } from '../items/itemIds.js';
import { xform } from './poiRuntime.js';
import { encounterPacifiable } from './poiLawV2.js';
import { setItemFields, mintCondition } from '../items/itemTemplates.js';
import { lawTemplate, templateGroups, itemFindings, GOLD_INT_MAX } from '../items/itemLaw.js';
import { isStackable, ARROW_TEMPLATE, GLASS_BOTTLE_TEMPLATE } from '../items/inventory.js';
import { createPotion } from '../items/loot.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { createWeapon, weaponOfMaterial, armorOfMaterial } from '../combat/enemyEquipment.js';
import { createPoiDmPanel } from '../ui/poiDmPanel.js';
import { t as tr } from '../ui/textManager.js';

const byKey = (/** @type {any} */ rows, /** @type {string} */ key) => (Array.isArray(rows) ? rows.find((r) => r?.key === key) : undefined);

/** @param {any} doc */
export const hasDm = (doc) => doc?.v === 2 && (['events', 'dialogues', 'trades', 'routes', 'encounters', 'interactives'].some((k) => doc[k]?.length)
  || !!doc.npcs?.some((/** @type {any} */ n) => n?.showWhen));

/** @type {Record<string, () => string>} */
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
  offline: () => tr('poi.dm.refusal.offline', 'The server is not responding. Nothing was traded.'),
  busy: () => tr('poi.dm.refusal.busy', 'Your last action is still being processed. Try again in a moment.'),
  lease: () => tr('poi.dm.refusal.lease', 'This character is now being played in another tab or on another device.'),
  unknown: () => tr('poi.dm.refusal.unknown', 'The server did not respond, so this may or may not have gone through.'),
  'poi-hand': () => tr('poi.dm.hand.changed', 'Your items changed. Nothing was handed over.'),
  'poi-raced': () => tr('poi.dm.refusal.raced', 'Someone else is doing this right now. Try again.'),
});
const whyText = (/** @type {string} */ w) => WHY_TEXT[w]?.() ?? tr('poi.dm.refusal.other', 'That cannot be done now.');
/** @param {any} a */
const refusalOf = (a) => (a?.unknown ? 'unknown' : a?.error ?? 'offline');

/**
 * @param {number[]} out
 * @param {ArrayLike<number>} m
 * @param {ArrayLike<number>} p
 * @param {ArrayLike<number>} t
 */
function placeInto(out, m, p, t) {
  out[0] = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] + t[0];
  out[1] = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] + t[1];
  out[2] = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] + t[2];
  return out;
}
const NO_MOVE = Object.freeze([0, 0, 0]);
/** @param {string} k */
export const keptClaim = (k) => /\|(char:|acct:|day:|cool:|global$)/.test(k);

const CLAIM_NAMES = 2;
/** @param {any} saved */
export function deviceClaims(saved) {
  /** @type {Record<string, { n: number, last: number }>} */
  const out = {};
  if (!saved || typeof saved !== 'object') return out;
  for (const [k, c] of Object.entries(saved)) if (keptClaim(k) && Number.isSafeInteger(c?.n) && c.n > 0) out[k] = { n: c.n, last: Number(c.last) || 0 };
  if (saved.names === CLAIM_NAMES) return out;
  for (const [k, c] of Object.entries(out)) {
    const m = /^event\/([^/|]+)(\|.*)$/.exec(k);
    if (!m) continue;
    const to = `${recipeClaim('event', m[1])}${m[2]}`;
    const was = out[to];
    out[to] = was ? { n: Math.max(was.n, c.n), last: Math.max(was.last, c.last) } : { ...c };
  }
  return out;
}

/** @param {{ template: number, group?: string, material?: number, recipe?: string, count: number }} s */
export function mintStack(s) {
  if (!lawTemplate(s.template)) return null;
  const group = s.group ?? templateGroups(s.template)[0];
  /** @type {any} */
  let item;
  const potion = s.recipe === undefined ? null : potionKeyOf(s.recipe);
  if (s.recipe !== undefined && (potion === null || group !== 'UselessItems1' || s.template !== GLASS_BOTTLE_TEMPLATE)) return null;
  if (group === 'Weapons' && s.template === ARROW_TEMPLATE) return { ...createWeapon(ARROW_TEMPLATE, 0, () => 0), stackCount: s.count };
  if (potion !== null) item = createPotion(potion);
  else if (group === 'Weapons') item = weaponOfMaterial(s.template, s.material ?? 0);
  else if (group === 'Armor') item = armorOfMaterial(s.template, s.material ?? 0);
  else item = mintCondition(setItemFields({ group, templateIndex: s.template }));
  if (s.count > 1) item.stackCount = s.count;
  return item;
}

const GIVE_MAX = 40;
const MATERIALS = Object.freeze({
  Weapons: new Set(Object.values(WEAPON_MATERIALS).filter((v) => v >= 0)),
  Armor: new Set(Object.entries(ARMOR_MATERIAL).filter(([k, v]) => v >= 0 && k !== 'Chain2').map(([, v]) => v)),
});

/** @param {{ template: number, group?: string, material?: number, recipe?: string, count: number }[]} stacks */
function mintEvent(stacks) {
  /** @type {any[]} */
  const out = [];
  for (const s of stacks) {
    if (!lawTemplate(s.template)) return null;
    const group = s.group ?? templateGroups(s.template)[0];
    const mats = /** @type {Record<string, Set<number>>} */ (MATERIALS)[group];
    if (!templateGroups(s.template).includes(group) || (mats ? s.material !== undefined && !mats.has(s.material) : s.material !== undefined)) return null;
    const it = mintStack(s);
    if (!it || (s.count > 1 && !isStackable(it)) || itemFindings(it).length) return null;
    out.push(it);
  }
  return out.length > GIVE_MAX ? null : out;
}

/**
 * @param {any} p
 * @param {{ template: number, group?: string, material?: number, count: number }[]} stacks
 */
const takesHeld = (p, stacks) => takeStacks({ items: Array.isArray(p?.items) ? p.items.map((/** @type {any} */ it) => ({ ...it })) : p?.items, wagonItems: p?.wagonItems, lightSourceIndex: p?.lightSourceIndex }, stacks).ok;

export const HAND_IDLE_S = 60;
const VARS_RETRY_S = 10;
const LOG_KEEP = 200;
const goldTaken = (/** @type {any[]} */ actions) => actions.filter((a) => a.k === 'take_gold').reduce((n, a) => n + a.amount, 0);
const goldGiven = (/** @type {any[]} */ actions) => actions.filter((a) => a.k === 'give_gold').reduce((n, a) => n + a.amount, 0);
/**
 * @param {any} rec
 * @param {any} loaded
 */
const lockedWhy = (rec, loaded) => (rec.equipSlot != null ? 'worn' : rec.questItem ? 'quest' : boundRecord(rec) ? 'bound' : rec === loaded ? 'loaded' : tradeableRecord(rec) ? null : 'other');
/** @type {Record<string, () => string>} */
const LOCKED_TEXT = Object.freeze({
  worn: () => tr('poi.dm.hand.worn', 'Worn'),
  quest: () => tr('poi.dm.hand.quest', 'Quest item'),
  bound: () => tr('poi.dm.hand.bound', 'Bound'),
  loaded: () => tr('poi.dm.hand.loaded', 'Carrying goods'),
});

/**
 * @param {any} p
 * @param {any[]} stacks
 */
function handRows(p, stacks) {
  /** @type {{ recs: any[], why: string | null, total: number }[]} */
  const rows = [];
  const loaded = loadedWagonOf(p);
  for (const rec of Array.isArray(p?.items) ? p.items : []) {
    const why = lockedWhy(rec, loaded);
    if (why === 'other' || !stacks.some((s) => recordAccepts(rec, s))) continue;
    const row = rows.find((x) => x.why === why && recordIsOffered(x.recs[0], rec));
    if (row) { row.recs.push(rec); row.total += recordCount(rec); } else rows.push({ recs: [rec], why, total: recordCount(rec) });
  }
  const chosen = stacks.map(() => rows.map(() => 0));
  stacks.forEach((s, k) => {
    const mine = rows.filter((x) => recordAccepts(x.recs[0], s));
    if (!mine.length || !mine.every((x) => recordIsOffered(x.recs[0], mine[0].recs[0]))) return;
    for (const x of mine) {
      if (x.why) continue;
      const g = rows.indexOf(x);
      const used = chosen.reduce((n, c) => n + c[g], 0);
      chosen[k][g] = Math.min(s.count - chosen[k].reduce((a, b) => a + b, 0), x.total - used);
    }
  });
  return { rows, chosen };
}

/**
 * @param {any} doc
 * @param {any} c
 */
const readsOnlyKept = (doc, c) => [...varsRead(c)].every((k) => persists(byKey(doc.variables, k)));

/** @param {any} pool */
export function poolFoes(pool) {
  return {
    spawnFoe: (/** @type {number} */ foe, /** @type {number[]} */ at, /** @type {any} */ o) => pool.spawnFoe(foe, at, { level: o.level ?? null, allied: false, placed: true, transient: true, groundAlign: { hitDist: null } })
      .then((/** @type {any} */ f) => {
        if (f?.ai && o.hostile === false) f.ai.isHostile = false;
        if (f?.entity && o.pacifiable === false) f.entity.pacifyImmune = true;
        return f;
      }),
    isDown: (/** @type {any} */ f) => !!f?.corpse,
    removeFoe: (/** @type {any} */ f) => pool.removeFoe(f),
  };
}

/** @param {any} deps */
export function createPoiDm(deps) {
  const { say, pack, give, feet, now = () => performance.now() / 1000 } = deps;
  const preview = !!deps.preview;
  const act = preview ? null : deps.act ?? null;
  const wall = deps.wall ?? (() => Date.now() / 1000);
  /** @type {Map<string, any>} */
  const kept = new Map();
  const store = preview ? { get: (/** @type {string} */ k) => kept.get(k) ?? null, set: (/** @type {string} */ k, /** @type {any} */ v) => { kept.set(k, structuredClone(v)); } } : deps.store;
  /** @type {Map<string,
   *  any>} */
  const claimsKept = new Map();
  /**
   * @param {any} r
   * @param {any} line
   */
  const logSettle = (r, line) => { if (preview) r.dm.log.push(line); };
  const panel = deps.panel ?? createPoiDmPanel({ cursor: deps.cursor });
  const txn = deps.txn ?? (() => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
  /** @type {Map<string, any>} */
  const runs = new Map();
  const spot = [0, 0, 0];
  let busy = false;
  /** @type {any} */
  let onPanel = null;
  /** @type {Set<any>} */
  const owed = new Set();

  /** @param {any} dm */
  const reader = (dm) => () => {
    const p = pack() ?? { items: [], goldPieces: 0 };
    return { count: (/** @type {any} */ s) => countOf(p, s), takeable: (/** @type {any} */ s) => takeableOf(p, s), gold: goldOf(p), getVar: (/** @type {string} */ k) => dm.vars[k] };
  };
  const storeKey = (/** @type {any} */ r) => `bunnyfall.poi.${r.id}.${deps.character?.() ?? 'local'}`;
  /** @param {any} r */
  const claimsKey = (/** @type {any} */ r) => `${storeKey(r)}.claims`;

  /** @param {any} s */
  function runOf(s) {
    let r = runs.get(s.id);
    if (r && r.rev === s.rev) return r;
    if (r) dropRun(r);
    const dm = createDm(s.doc, { char: deps.character?.() ?? 'local', player: 'local', ...(!act && !preview ? { now: wall() } : {}) });
    dm.service = true;
    if (preview) { if (!claimsKept.has(s.id)) claimsKept.set(s.id, dm.claims); dm.claims = claimsKept.get(s.id); }
    r = { id: s.id, rev: s.rev, doc: s.doc, dm, walkers: new Map(), foes: new Map(), left: new Map(), waiting: new Map(), inside: new Set(), inEnc: new Set(), off: new Set(), last: now(), extras: [], extraOf: new Map(), shown: [], loaded: false, timers: new Map() };
    dm.read = reader(dm);
    runs.set(s.id, r);
    loadVars(r);
    return r;
  }
  function dropRun(/** @type {any} */ r) {
    if (asking?.r === r) endHand(null, false);
    for (const list of r.foes.values()) for (const f of list) deps.removeFoe?.(f);
    for (const list of r.left.values()) for (const f of list) deps.removeFoe?.(f);
    runs.delete(r.id);
  }

  /** @param {any} r */
  async function readVars(r) {
    const a = await act('/v1/poi/event-claim', { poi: r.id, rev: r.rev, txnId: txn() }, { read: true }).catch(() => null);
    const vars = a?.ok ? a.data?.vars : null;
    if (vars) for (const [k, v] of Object.entries(vars)) if (k in r.dm.vars) r.dm.vars[k] = v;
    return a;
  }
  /** @param {any} r */
  async function loadVars(r) {
    if (act) {
      r.loading = true;
      const a = await readVars(r);
      r.loading = false;
      if (!a || a.error === 'offline' || a.error === 'busy') { r.retryAt = now() + VARS_RETRY_S; return; }
    } else {
      const was = store?.get(storeKey(r));
      if (was && typeof was === 'object') for (const [k, v] of Object.entries(was)) if (k in r.dm.vars) r.dm.vars[k] = v;
      if (!preview) Object.assign(r.dm.claims, deviceClaims(store?.get(claimsKey(r))));
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


  /**
   * @param {{ items: any[], gold: number, picks?: any[] }} took
   * @param {{ items: any[], gold: number }} gave
   * @param {any} [held]
   */
  function applyLocal(took, gave, held = null) {
    const p = pack();
    if (p) {
      if (held && !took.picks) held.undo?.();
      if (!held || !took.picks) takeStacks(p, took.items);
      takeGold(p, took.gold);
    }
    give(gave.items, gave.gold);
    deps.changed?.();
  }


  let asking = /** @type {any} */ (null);

  /**
   * @param {any} r
   * @param {string} title
   * @param {string} line
   * @param {any[]} stacks
   * @param {number} gold
   * @param {() => boolean} still
   */
  function askHand(r, title, line, stacks, gold, still) {
    return new Promise((done) => {
      const p = pack();
      asking = { r, title, line, stacks, gold, still, done, at: now(), note: '', ...handRows(p, stacks) };
      drawHand();
    });
  }
  /**
   * @param {any} answer
   * @param {boolean} [redraw]
   */
  function endHand(answer, redraw = true) {
    const a = asking;
    if (!a) return;
    asking = null;
    if (redraw && (a.r.dm.dialogue || a.r.dm.trade)) show(a.r); else panel.close();
    a.done(answer);
  }
  function declineHand() { say(tr('poi.dm.hand.declined', 'Nothing was handed over.')); endHand(null); }

  /** @param {any} a */
  function picksNow(a) {
    const p = pack();
    const list = Array.isArray(p?.items) ? p.items : [];
    const leaves = leavesOf(p);
    if (goldOf(p) < a.gold) return null;
    /** @type {Map<any, number>} */
    const used = new Map();
    /** @type {{ rec: any, at: number, n: number }[][]} */
    const out = [];
    for (let k = 0; k < a.stacks.length; k++) {
      const picks = [];
      for (let g = 0; g < a.rows.length; g++) {
        let left = a.chosen[k][g];
        for (const rec of a.rows[g].recs) {
          if (left <= 0) break;
          const at = list.indexOf(rec);
          if (at < 0 || !leaves(rec) || !recordAccepts(rec, a.stacks[k])) continue;
          const n = Math.min(left, recordCount(rec) - (used.get(rec) ?? 0));
          if (n <= 0) continue;
          used.set(rec, (used.get(rec) ?? 0) + n);
          picks.push({ rec, at, n });
          left -= n;
        }
        if (left > 0) return null;
      }
      out.push(picks);
    }
    return out;
  }
  function giveHand() {
    const a = asking;
    if (!a) return;
    if (!a.still()) { say(whyText('poi-hand')); endHand(null); return; }
    const picks = picksNow(a);
    if (!picks) {
      const p = pack();
      Object.assign(a, handRows(p, a.stacks), { note: tr('poi.dm.hand.redo', 'Your items changed. Choose again.'), at: now() });
      drawHand();
      return;
    }
    if (act && picks.flat().length > HAND_MAX) {
      Object.assign(a, { note: tr('poi.dm.hand.many', 'Too many separate items. Choose larger stacks.'), at: now() });
      drawHand();
      return;
    }
    endHand({ picks });
  }
  function setHand(/** @type {number} */ k, /** @type {number} */ g, /** @type {number} */ n) {
    const a = asking;
    if (!a || !a.rows[g] || a.rows[g].why) return;
    const others = a.chosen.reduce((m, c, j) => m + (j === k ? 0 : c[g]), 0);
    const mine = a.chosen[k].reduce((m, x, j) => m + (j === g ? 0 : x), 0);
    a.chosen[k][g] = Math.max(0, Math.min(n, a.rows[g].total - others, a.stacks[k].count - mine));
    a.at = now();
    a.note = '';
    drawHand();
  }
  function drawHand() {
    const a = asking;
    if (!a) return;
    const nameOf = (/** @type {any} */ s) => { const it = mintStack(s); return it ? itemLongName(it) : tr('poi.dm.hand.item', 'Item'); };
    const sections = a.stacks.map((s, k) => {
      const chosen = a.chosen[k].reduce((m, x) => m + x, 0);
      const rows = a.rows.flatMap((x, g) => {
        if (!recordAccepts(x.recs[0], s)) return [];
        const rec = x.recs[0];
        const cond = rec.maxCondition > 0 && (rec.group === 'Weapons' || rec.group === 'Armor') ? conditionWord(rec) : '';
        const others = a.chosen.reduce((m, c, j) => m + (j === k ? 0 : c[g]), 0);
        return [{ g, text: cond ? `${itemLongName(rec)} (${cond})` : itemLongName(rec), n: a.chosen[k][g], max: x.why ? 0 : Math.min(x.total - others, s.count - chosen + a.chosen[k][g]), total: x.total, why: x.why ? LOCKED_TEXT[x.why]?.() ?? null : null }];
      });
      return { text: tr('poi.dm.hand.stack', '{count} × {name}', { count: s.count, name: nameOf(s) }), chosen, count: s.count, rows };
    });
    const ready = sections.every((x) => x.chosen === x.count);
    panel.hand?.(a.title, a.line, { sections, gold: a.gold, note: a.note, ready }, { set: setHand, give: giveHand, cancel: declineHand });
  }
  /** @param {{ rec: any, at: number, n: number }[][]} picks */
  function handOf(picks) {
    if (act) stampItemIds({ items: picks.flat().map((x) => x.rec) });
    return picks.map((l) => l.map((x) => ({ at: x.at, n: x.n, rec: handRecord(x.rec) })));
  }
  /** @param {{ rec: any, n: number }[][]} picks */
  function holdOf(picks) {
    /** @type {any} */
    const held = { undo: null };
    held.reserve = () => {
      const p = pack();
      if (!Array.isArray(p?.items)) return null;
      const lit = p.items[p.lightSourceIndex];
      /** @type {Map<any, number>} */
      const n = new Map();
      for (const x of picks.flat()) n.set(x.rec, (n.get(x.rec) ?? 0) + x.n);
      /** @type {{ rec: any, n: number, at: number, whole: boolean }[]} */
      const out = [];
      for (const [rec, k] of n) {
        const at = p.items.indexOf(rec);
        if (at < 0) continue;
        const whole = k >= recordCount(rec);
        if (whole) p.items.splice(at, 1); else rec.stackCount = recordCount(rec) - k;
        out.push({ rec, n: k, at, whole });
      }
      const relight = (/** @type {any} */ to) => { if (Number.isSafeInteger(p.lightSourceIndex)) p.lightSourceIndex = to ? p.items.indexOf(to) : -1; };
      relight(lit);
      deps.changed?.();
      held.undo = () => {
        held.undo = null;
        for (const x of [...out].reverse()) {
          if (x.whole) p.items.splice(Math.min(x.at, p.items.length), 0, x.rec);
          else if (p.items.includes(x.rec)) x.rec.stackCount = recordCount(x.rec) + x.n;
          else p.items.push({ ...x.rec, stackCount: x.n });
        }
        relight(lit);
        deps.changed?.();
      };
      return held.undo;
    };
    return held;
  }

  /**
   * @param {any} r
   * @param {any} rec
   */
  function tradeCheck(r, rec) {
    if (!readsOnlyKept(r.doc, rec.when)) return { why: 'scope', word: 'poi-var-scope' };
    const p = pack();
    if (!p) return { why: 'pack', word: '' };
    if (!takesHeld(p, rec.requireItems ?? [])) return { why: 'items', word: 'poi-items' };
    if (goldOf(p) < (rec.requireGold ?? 0)) return { why: 'gold', word: 'gold' };
    const records = mintEvent(rec.rewardItems ?? []);
    if (!records) return { why: 'reward', word: 'poi-reward' };
    if (goldOf(p) - (rec.requireGold ?? 0) + (rec.rewardGold ?? 0) > GOLD_INT_MAX) return { why: 'goldFull', word: 'poi-gold-full' };
    return { p, records };
  }

  /**
   * @param {any} r
   * @param {string} trade
   * @param {string} recipe
   */
  async function runTrade(r, trade, recipe) {
    if (busy) { say(whyText('busy')); return; }
    const t = byKey(r.doc.trades, trade);
    const rec = byKey(t?.recipes, recipe);
    if (!rec) return;
    const why = recipeBlock(r.dm, trade, recipe);
    const later = (/** @type {string | null} */ w) => !w || w === 'limit' || w === 'cooldown' || w === 'stock';
    if (!later(why)) { say(whyText(/** @type {string} */ (why))); logSettle(r, { k: 'trade_refused', trade, recipe, why }); return; }
    const refuse = (/** @type {string} */ w, /** @type {string} */ word) => { if (word) say(whyText(word)); logSettle(r, { k: 'trade_refused', trade, recipe, why: w }); };
    busy = true;
    try {
      if (!act) {
        if (why) { refuse(why, why); return; }
        const c = tradeCheck(r, rec);
        if (!c.p) { refuse(c.why, c.word); return; }
      }
      const stacks = rec.requireItems ?? [], needGold = rec.requireGold ?? 0;
      let chosen = null;
      if (stacks.length || needGold) {
        if (act && (!takesHeld(pack(), stacks) || goldOf(pack()) < needGold)) { say(whyText(stacks.length && !takesHeld(pack(), stacks) ? 'poi-items' : 'poi-gold')); return; }
        chosen = await askHand(r, r.talkingTo ?? t.name ?? '', rec.name ?? recipe, stacks, needGold, () => later(recipeBlock(r.dm, trade, recipe)));
        if (!chosen) { logSettle(r, { k: 'trade_refused', trade, recipe, why: 'declined' }); return; }
      }
      if (act) {
        const held = chosen ? holdOf(chosen.picks) : null;
        const a = await act('/v1/poi/trade', { poi: r.id, rev: r.rev, trade, recipe, txnId: txn(), ...(chosen ? { hand: handOf(chosen.picks) } : {}) }, held ? { reserve: held.reserve } : {});
        if (!a?.ok) { say(whyText(refusalOf(a))); return; }
        applyLocal(a.data?.took ?? { items: stacks, gold: needGold }, a.data?.gave ?? { items: [], gold: 0 }, held);
      } else {
        const c = tradeCheck(r, rec);
        if (!c.p) { refuse(c.why, c.word); return; }
        if (chosen && !takeChosen(c.p, stacks, handOf(chosen.picks)).ok) { refuse('hand', 'poi-hand'); return; }
        takeGold(c.p, needGold);
        give(c.records, rec.rewardGold ?? 0);
        deps.changed?.();
        logSettle(r, { k: 'trade', name: rec.name, took: { items: stacks, gold: needGold }, gave: { items: rec.rewardItems ?? [], gold: rec.rewardGold ?? 0 } });
      }
      const rules = claimRule(rec, { char: r.dm.char, player: r.dm.player, nowS: r.dm.now });
      for (const c of rules) {
        const k = `${recipeClaim(trade, recipe)}|${c.scope}`;
        r.dm.claims[k] = { n: (r.dm.claims[k]?.n ?? 0) + 1, last: r.dm.now };
      }
      if (rules.length && !act && !preview) saveClaims(r);
      say(tr('poi.dm.done', '{name} complete.', { name: rec.name }));
      if (rec.onSuccessEvent) {
        const live = runs.get(r.id);
        const to = live?.rev === r.rev ? live : r;
        runEvent(to.dm, rec.onSuccessEvent);
        if (to !== live) owed.add(to);
      }
      saveVars(r);
    } finally { busy = false; }
  }

  function eventTitle(/** @type {any} */ r, /** @type {any} */ ev) {
    const tg = ev.trigger ?? {};
    if (tg.k === 'interact') return byKey(r.doc.interactives, tg.interactive)?.name ?? r.doc.name ?? '';
    if (tg.k === 'npc_talk') return byKey(r.doc.npcs, tg.npc)?.name ?? r.doc.name ?? '';
    return r.doc.name ?? '';
  }

  /** @param {any} r */
  async function drain(r) {
    if (busy || !r.dm.pending.length) return;
    const key = r.dm.pending.shift();
    const ev = byKey(r.doc.events, key);
    if (!ev) return;
    busy = true;
    try {
      const refuse = (/** @type {string} */ why, /** @type {string} */ word) => { if (word) say(whyText(word)); logSettle(r, { k: 'refused', event: key, why }); };
      if (!act && !readsOnlyKept(r.doc, ev.when)) { refuse('scope', 'poi-var-scope'); return; }
      const branch = branchOf(ev, r.dm);
      const actions = ev[branch] ?? [];
      const takes = takesOf(actions), gold = goldTaken(actions);
      const rules = eventRule(actions, r.dm.char);
      const claim = () => { for (const x of rules) { const k = `${eventClaim(key)}|${x.scope}`; r.dm.claims[k] = { n: (r.dm.claims[k]?.n ?? 0) + 1, last: r.dm.now }; } };
      if (rules.some((c) => (r.dm.claims[`${eventClaim(key)}|${c.scope}`]?.n ?? 0) >= c.max)) { refuse('limit', ''); return; }
      const check = () => {
        const p = pack();
        if (!p || !takesHeld(p, takes)) return { why: 'items', word: 'poi-items' };
        if (goldOf(p) < gold) return { why: 'gold', word: 'poi-gold' };
        const records = mintEvent(actions.filter((/** @type {any} */ x) => x.k === 'give_item').map((/** @type {any} */ x) => x.item));
        if (!records) return { why: 'reward', word: 'poi-reward' };
        if (goldOf(p) - gold + goldGiven(actions) > GOLD_INT_MAX) return { why: 'goldFull', word: 'poi-gold-full' };
        return { p, records };
      };
      if (!act) { const c = check(); if (!c.p) { refuse(c.why, c.word); return; } }
      let chosen = null;
      if (takes.length || gold) {
        if (owed.has(r)) { refuse('gone', ''); return; }
        if (act && (!takesHeld(pack(), takes) || goldOf(pack()) < gold)) { say(whyText(!takesHeld(pack(), takes) ? 'poi-items' : 'poi-gold')); return; }
        chosen = await askHand(r, eventTitle(r, ev), ev.name ?? key, takes, gold, () => branchOf(ev, r.dm) === branch);
        for (let i; (i = r.dm.pending.indexOf(key)) >= 0;) r.dm.pending.splice(i, 1);
        if (!chosen) { logSettle(r, { k: 'refused', event: key, why: 'declined' }); return; }
      }
      if (act) {
        const held = chosen ? holdOf(chosen.picks) : null;
        const asks = ['then', 'else'].some((b) => (ev[b] ?? []).some((/** @type {any} */ x) => x.k === 'take_item' || x.k === 'take_gold'));
        const a = await act('/v1/poi/event-claim', { poi: r.id, rev: r.rev, event: key, txnId: txn(), ...(asks ? { branch, hand: chosen ? handOf(chosen.picks) : [] } : {}) }, held ? { reserve: held.reserve } : {});
        if (a?.ok ? (a.data?.branch ?? 'then') === branch : a?.error === 'poi-limit') claim();
        const again = r.reread === key;
        r.reread = null;
        if (a?.error === 'poi-hand' && !again) {
          await readVars(r);
          if (runs.get(r.id) === r && branchOf(ev, r.dm) !== branch) { r.reread = key; r.dm.pending.unshift(key); return; }
        }
        if (!a?.ok) { if (a?.error !== 'poi-limit') say(whyText(refusalOf(a))); return; }
        const d = a.data ?? {};
        if (!d.nothing) applyLocal(d.took ?? { items: [], gold: 0 }, d.gave ?? { items: [], gold: 0 }, held);
        runEvent(r.dm, key, { branch: d.branch ?? 'then', settled: !d.nothing });
        for (const [k, v] of Object.entries(d.vars ?? {})) if (k in r.dm.vars) r.dm.vars[k] = v;
      } else {
        const c = check();
        if (!c.p) { refuse(c.why, c.word); return; }
        if (chosen && !takeChosen(c.p, takes, handOf(chosen.picks)).ok) { refuse('hand', 'poi-hand'); return; }
        takeGold(c.p, gold);
        give(c.records, goldGiven(actions));
        deps.changed?.();
        claim();
        if (rules.length && !preview) saveClaims(r);
        runEvent(r.dm, key, { branch, settled: true });
        saveVars(r);
      }
    } finally {
      busy = false;
      if (runs.get(r.id) === r && (r.dm.dialogue || r.dm.trade)) show(r);
    }
  }
  /** @param {any} r */
  function saveClaims(r) {
    if (!store) return;
    /** @type {Record<string, any>} */
    const out = { names: CLAIM_NAMES };
    const today = Math.floor(r.dm.now / DAY_S);
    for (const [k, c] of Object.entries(r.dm.claims)) {
      const day = /\|day:[^|]*:(\d+)$/.exec(k);
      if (keptClaim(k) && !(day && Number(day[1]) < today)) out[k] = c;
    }
    store.set(claimsKey(r), out);
  }


  /**
   * @param {string} id
   * @param {string} npcKey
   */
  function talk(id, npcKey) {
    const r = runs.get(id);
    if (!r) return false;
    const n = byKey(r.doc.npcs, npcKey);
    if (!n) return false;
    if (r.talkKey !== npcKey) { r.dm.dialogue = null; r.dm.trade = null; }
    r.talkKey = npcKey;
    const heard = fire(r.dm, { k: 'npc_talk', npc: npcKey }).length > 0;
    if (!r.dm.dialogue && n.dialogue) openDialogue(r.dm, n.dialogue);
    if (!r.dm.dialogue && !r.dm.trade && n.trade) r.dm.trade = n.trade;
    r.talkingTo = n.name ?? npcKey;
    show(r);
    panel.hold?.();
    return heard || !!n.dialogue || !!n.trade;
  }

  /** @param {any} r */
  function show(r) {
    if (asking) return;
    onPanel = r;
    r.opened = r.dm.dialogue ?? r.dm.trade;
    sayLog(r);
    if (r.dm.dialogue) {
      const d = dialogueNow(r.dm);
      if (!d) { r.dm.dialogue = null; panel.close(); return; }
      panel.dialogue(r.talkingTo ?? '', d.say, d.options, (i) => {
        const th = choose(r.dm, i, { run: false });
        if (th?.k === 'run_trade_recipe') runTrade(r, th.trade, th.recipe).then(() => showLive(r));
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
      panel.trade(t.name, rows, (k) => { runTrade(r, t.key, k).then(() => showLive(r)); }, () => { r.dm.trade = null; panel.close(); });
      return;
    }
    panel.close();
  }

  /** @param {any} r */
  const showLive = (r) => { if (runs.get(r.id) === r) show(r); };

  /** @param {any} r */
  function sayLog(r) {
    r.said ??= 0;
    for (; r.said < r.dm.log.length; r.said++) {
      const l = r.dm.log[r.said];
      if (l.k === 'say') say(l.text);
    }
    if (!preview && r.said >= 2 * LOG_KEEP) { r.dm.log.splice(0, LOG_KEEP); r.said -= LOG_KEEP; }
  }


  /**
   * @param {any} s
   * @param {number[]} t
   * @param {any[] | null} people
   */
  function frame(s, t, people) {
    const r = runOf(s);
    if (!r.loaded) {
      if (!r.loading && now() >= (r.retryAt ?? Infinity)) loadVars(r);
      return people;
    }
    if (asking?.r === r) {
      if (deps.alive?.() === false) endHand(null);
      else if (now() - asking.at >= HAND_IDLE_S) declineHand();
    }
    const nowS = now(), dt = Math.min(1, Math.max(0, nowS - r.last));
    r.last = nowS;
    advance(r.dm, !act && !preview ? Math.max(0, wall() - r.dm.now) : dt);
    followKeptStates(r.dm);
    const f = feet();
    for (const o of r.doc.interactives ?? []) {
      if (o.kind !== 'trigger' || !f) continue;
      const at = placeInto(spot, s.place, o.t, t);
      const inNow = r.dm.states[o.key] !== 'inactive' && Math.hypot(f[0] - at[0], f[2] - at[2]) <= o.radius;
      if (inNow && !r.inside.has(o.key)) { r.inside.add(o.key); fire(r.dm, { k: 'enter_area', interactive: o.key }); }
      else if (!inNow) r.inside.delete(o.key);
    }
    r.extras.length = 0;
    for (const o of r.doc.interactives ?? []) {
      if (o.kind === 'trigger' || (o.kind === 'quest_object' && r.dm.states[o.key] === 'inactive')) continue;
      let x = r.extraOf.get(o.key);
      if (!x) { x = { key: `poidm:${r.id}:${o.key}`, name: o.name, at: [0, 0, 0], h: 1.5, w: Math.min(3, o.radius ?? 1), reach: o.radius, activate: () => useObject(r, o) }; r.extraOf.set(o.key, x); }
      const look = o.appearance?.k === 'part' ? byKey(r.doc.parts, o.appearance.key) : null;
      placeInto(x.at, s.place, look?.t ?? o.t, t);
      r.extras.push(x);
    }
    r.off.clear();
    for (const o of r.doc.interactives ?? []) if (o.kind === 'door' && o.appearance?.k === 'part' && r.dm.states[o.key] === 'open') r.off.add(o.appearance.key);
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
        p.walks = true;
      }
      list.push(p);
    }
    tickEncounters(r, s, t, dt);
    const opened = r.dm.dialogue ?? r.dm.trade;
    if (!asking) {
      if (opened && opened !== r.opened) show(r);
      r.opened = opened;
    }
    sayLog(r);
    drain(r);
    return list;
  }

  /**
   * @param {any} r
   * @param {any} o
   */
  function useObject(r, o) {
    const was = r.dm.dialogue ?? r.dm.trade;
    const u = useInteractive(r.dm, o.key);
    if (u.locked && !u.ran.length) say(tr('poi.dm.locked', '{name} is locked.', { name: o.name }));
    if (was || r.dm.dialogue || r.dm.trade) show(r); else if (!asking) sayLog(r);
    if ((r.dm.dialogue ?? r.dm.trade) && (r.dm.dialogue ?? r.dm.trade) !== was) panel.hold?.();
  }

  /**
   * @param {any} s
   * @param {number[]} t
   * @param {any} e
   */
  function inArea(s, t, e) {
    const f = feet();
    if (!f || !e.center) return false;
    const at = placeInto(spot, s.place, e.center, t);
    return Math.hypot(f[0] - at[0], f[2] - at[2]) <= e.radius;
  }

  /**
   * @param {any} r
   * @param {any} s
   * @param {number[]} t
   * @param {number} dt
   */
  function tickEncounters(r, s, t, dt) {
    for (const e of r.doc.encounters ?? []) {
      if (inArea(s, t, e)) { if (!r.inEnc.has(e.key)) { r.inEnc.add(e.key); enterEncounter(r.dm, e.key); } }
      else r.inEnc.delete(e.key);
      const state = r.dm.encounters[e.key];
      const have = r.foes.get(e.key);
      if (state === 'active' && !have && deps.spawnFoe) {
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
            deps.spawnFoe(sp.foe, [at[0] + t[0], at[1] + t[1], at[2] + t[2]], { level: sp.level, hostile: e.aggression !== 'passive', pacifiable: encounterPacifiable(e) })
              .then((f) => {
                settled();
                if (!f) return;
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
      for (const f of have) f.poiDown ||= deps.isDown?.(f) ?? false;
      const down = (/** @type {any} */ f) => f.poiDown;
      let done = false;
      if (c.rule === 'timer_survived') {
        const held = (r.timers.get(e.key) ?? 0) + (inArea(s, t, e) ? dt : 0);
        r.timers.set(e.key, held);
        done = held >= c.seconds;
      }
      else if (c.rule === 'leader_dead') done = have.some((f) => f.poiSpawn === c.leader && down(f));
      else if (r.waiting.get(e.key) === 0 && !have.length) {
        r.dm.encounters[e.key] = 'idle';
        r.foes.delete(e.key);
        continue;
      }
      else done = r.waiting.get(e.key) === 0 && have.every(down);
      if (done) {
        completeEncounter(r.dm, e.key);
        if (r.dm.encounters[e.key] !== 'active') { r.left.set(e.key, have); r.foes.delete(e.key); }
      }
    }
  }

  return {
    hasDm,
    frame,
    talk,
    tick() { for (const o of owed) { sayLog(o); if (o.dm.pending.length) drain(o); else if (!busy) owed.delete(o); } },
    /** @param {string} id */
    extras: (id) => runs.get(id)?.extras ?? null,
    /** @param {string} id */
    off: (id) => runs.get(id)?.off ?? null,
    close() { endHand(null, false); for (const r of runs.values()) { r.dm.dialogue = null; r.dm.trade = null; r.opened = null; } panel.close(); },
    /** @param {string} id */
    drop(id) {
      const r = runs.get(id);
      if (!r) return;
      const mine = asking ? asking.r === r : onPanel === r;
      dropRun(r);
      if (mine) panel.close();
    },
    /** @param {string} id */
    modelOf: (id) => runs.get(id)?.dm ?? null,
  };
}
