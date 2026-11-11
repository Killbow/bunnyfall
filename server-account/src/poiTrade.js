// @ts-check
// POI v2 (World Builder M5): a live POI's trades and events, settled here. POST /v1/poi/trade and /v1/poi/event-claim.
// Items and gold never move on the client's word: the character's own last checkpoint is read, the recipe's goods taken
// out of it, rewards minted by staffGive.js mintGift and held to the item law, and the record written one sequence on in
// one guarded batch with the limit's count, the kept variables and the act's log row (realm.js prepareRealmRecord).
// Only a POI live at the named revision settles; the character must be the caller's, under its lease, at its sequence,
// and not held by the judge; the worth moved is witnessed. A `txnId` settles once: asked again, it is answered the same.
// The save's schema is unchanged.

import { REALM_ID_RE, LEASE_RE, realmSaveTextOf, dropObjects, dropIfUnnamed, mustChange, prepareRealmRecord, recordMovedOf } from './realm.js';
import { mintGift } from './staffGive.js';
import { POI_ID_RE } from '../../src/poi/poiLaw.js';
import { evalWhen, varsRead, persists, claimRule, eventRule, recipeWhy} from '../../src/poi/poiDmCore.js';
import { takeStacks, takeGold, giveGoods, countOf, goldOf } from '../../src/poi/poiSettle.js';
import { GOLD_INT_MAX } from '../../src/systems/item/itemLaw.js';

/** How long a settled act's answer is kept for a client asking again (cron.js poi-txn-log). */
export const POI_TXN_KEEP_S = 30 * 24 * 3600;
/** A client's own id for one act. */
export const POI_TXN_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** The most reward records one act may hand over: a recipe's eight stacks, an event's thirty-two actions. */
const GIVE_MAX = 40;

const parsed = (/** @type {any} */ text) => { try { return typeof text === 'string' ? JSON.parse(text) : null; } catch { return null; } };
const byKey = (/** @type {any} */ rows, /** @type {string} */ key) => (Array.isArray(rows) ? rows.find((r) => r?.key === key) : undefined);

/** The body's shared fields, or null. @param {any} b */
function actOf(b) {
  const { poi, rev, id, lease, seq, txnId } = b ?? {};
  if (typeof poi !== 'string' || !POI_ID_RE.test(poi) || !Number.isSafeInteger(rev) || rev < 1) return null;
  if (typeof id !== 'string' || !REALM_ID_RE.test(id) || typeof lease !== 'string' || !LEASE_RE.test(lease)) return null;
  if (!Number.isSafeInteger(seq) || seq < 1 || typeof txnId !== 'string' || !POI_TXN_RE.test(txnId)) return null;
  return { poi, rev, id, lease, seq, txnId };
}

/** The document that is live at `rev`, or the refusal. @param {any} db @param {string} poi @param {number} rev */
async function liveDoc(db, poi, rev) {
  const d = await db.prepare('SELECT live_rev FROM poi_docs WHERE id = ?').bind(poi).first();
  if (!d || d.live_rev !== rev) return { error: 'poi-not-live' };
  const r = await db.prepare("SELECT doc FROM poi_revs WHERE poi_id = ? AND rev = ? AND state = 'approved' AND kind = 'doc'").bind(poi, rev).first();
  const doc = parsed(r?.doc);
  return doc?.v === 2 ? { doc } : { error: 'poi-not-live' };
}

/** What a settled txn answered, to the account that made it. @param {any} db @param {string} txnId @param {string} player */
async function replayOf(db, txnId, player) {
  const row = await db.prepare('SELECT player, result FROM poi_txn_log WHERE txn_id = ?').bind(txnId).first();
  if (!row) return null;
  if (row.player !== player) return { error: 'txn-spent' };
  return { ...parsed(row.result), replayed: true };
}

/** The kept values of a POI's variables for a character: `char:<id>` (character scope) and `poi` (poi_global). @param {any} db @param {string} poi @param {string} char */
async function keptVars(db, poi, char) {
  const rows = (await db.prepare('SELECT scope_id, var, value FROM poi_state_vars WHERE poi_id = ? AND scope_id IN (?, ?)').bind(poi, `char:${char}`, 'poi').all())?.results ?? [];
  /** @type {Record<string, any>} */
  const out = {};
  for (const r of rows) out[r.var] = parsed(r.value);
  return out;
}

/** Where a variable is kept. @param {any} v @param {string} char */
const scopeIdOf = (v, char) => (v.scope === 'character' ? `char:${char}` : 'poi');

/** The claims the rules count, read before the settle. @param {any} db @param {string} poi @param {string} claim @param {{ scope: string }[]} rules */
async function keptClaims(db, poi, claim, rules) {
  /** @type {Map<string, { n: number, last: number }>} */
  const out = new Map();
  if (!rules.length) return out;
  const m = rules.map((_, i) => `?${i + 3}`).join(', ');
  const rows = (await db.prepare(`SELECT scope, n, last_at FROM poi_trade_claims WHERE poi_id = ?1 AND claim = ?2 AND scope IN (${m})`).bind(poi, claim, ...rules.map((r) => r.scope)).all())?.results ?? [];
  for (const r of rows) out.set(r.scope, { n: r.n, last: r.last_at });
  return out;
}

/** The statements that count one run against each rule, each guarded: no room, and the batch rolls back. @param {any} db @param {string} poi @param {string} claim @param {{ scope: string, max: number, cooldownS?: number }[]} rules @param {number} nowS */
function claimSteps(db, poi, claim, rules, nowS) {
  return rules.flatMap((r) => [
    db.prepare(`INSERT INTO poi_trade_claims (poi_id, claim, scope, n, last_at) VALUES (?1, ?2, ?3, 1, ?4)
      ON CONFLICT (poi_id, claim, scope) DO UPDATE SET n = n + 1, last_at = ?4 WHERE n < ?5 AND last_at <= ?6`)
      .bind(poi, claim, r.scope, nowS, r.max, r.cooldownS === undefined ? nowS : nowS - r.cooldownS),
    mustChange(db),
  ]);
}

/**
 * The shared settle: the record changed by `change(save)`, the act's own statements beside it, one batch. `change` answers
 * null or a refusal's word; `after` is what the act writes (`steps`) and answers (`result`), built when the change is done.
 * @param {any} ctx @param {string} player @param {{ poi: string, rev: number, id: string, lease: string, seq: number, txnId: string }} a @param {'trade' | 'event'} kind
 * @param {(save: any) => string | null} change @param {() => { steps: any[], result: any }} after
 */
async function settle(ctx, player, a, kind, change, after) {
  const { db, bucket, nowS } = ctx;
  const prep = await prepareRealmRecord(ctx, player, { id: a.id, lease: a.lease, seq: a.seq }, change, { outbound: true, escrow: false });
  if ('error' in prep) return prep;
  const { steps, result } = after();
  const answer = { ok: true, seq: prep.seq, realm: { seq: prep.seq }, ...result };   // `realm.seq`: where the record stands now, as every realm act answers it (systems/realmSaves.js realmGoldAct)
  try {
    await db.batch([
      ...prep.steps,
      ...steps,
      db.prepare('INSERT INTO poi_txn_log (txn_id, player, char_id, poi_id, rev, kind, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(a.txnId, player, a.id, a.poi, a.rev, kind, JSON.stringify(answer), nowS),
    ]);
  } catch {
    // the record moved under the settle, a limit had no room left, or it all landed and the answer was lost: the record's
    // own object goes only if no row names it (realm.js dropIfUnnamed), and a logged txn is answered as it was
    await dropIfUnnamed(db, bucket, player, a.id, prep.key);
    const again = await replayOf(db, a.txnId, player);
    if (again) return again;
    const moved = await recordMovedOf(db, player, { id: a.id, lease: a.lease, seq: a.seq });
    return moved ?? { error: 'poi-limit' };
  }
  await dropObjects(bucket, [prep.prev]);
  return answer;
}

/** The refusal for a recipe's why-word. */
const WHY = Object.freeze({ when: 'poi-when', items: 'poi-items', gold: 'poi-gold', limit: 'poi-limit', cooldown: 'poi-cooldown', stock: 'poi-stock' });

/**
 * Mint what a stack list gives: the records, or a refusal. @param {any[]} stacks @param {(b: Uint8Array<ArrayBuffer>) => Uint8Array} rand
 */
function mint(stacks, rand) {
  /** @type {any[]} */
  const records = [];
  for (const s of stacks) {
    const g = mintGift({ template: s.template, group: s.group, material: s.material, count: s.count }, rand);
    if ('error' in g) return { error: 'poi-reward' };
    if (g.findings.length) return { error: 'poi-unlawful' };
    records.push(g.item);
  }
  return records.length > GIVE_MAX ? { error: 'poi-reward' } : { records };
}

/** The counts and gold a save holds, as the conditions read them, with the kept variables. @param {any} save @param {any} doc @param {Record<string, any>} kept */
const ctxOfSave = (save, doc, kept) => ({
  count: (/** @type {any} */ s) => countOf(save, s),
  gold: goldOf(save),
  getVar: (/** @type {string} */ k) => (k in kept ? kept[k] : byKey(doc.variables, k)?.initial),
});

/** A condition that reads a variable the service does not keep (event, instance) cannot be judged here. @param {any} doc @param {any} c */
const readsOnlyKept = (doc, c) => [...varsRead(c)].every((k) => persists(byKey(doc.variables, k)));

/**
 * ONE RECIPE RUN. Answers `{ ok, seq, took: { items, gold }, gave: { items: [records], gold }, vars }`, or `{ error }`.
 * @param {any} ctx @param {string} player @param {any} body
 */
export async function tradePoi(ctx, player, body) {
  if (!ctx.bucket) return { error: 'no-storage' };
  const a = actOf(body);
  if (!a || typeof body.trade !== 'string' || typeof body.recipe !== 'string') return { error: 'body' };
  const { db, nowS } = ctx;
  const again = await replayOf(db, a.txnId, player);
  if (again) return again;
  const live = await liveDoc(db, a.poi, a.rev);
  if (live.error) return live;
  const doc = live.doc;
  const recipe = byKey(byKey(doc.trades, body.trade)?.recipes, body.recipe);
  if (!recipe) return { error: 'poi-no-recipe' };
  if (!readsOnlyKept(doc, recipe.when)) return { error: 'poi-var-scope' };
  const char = a.id;
  const who = { char, player, nowS };
  const claim = `${body.trade}/${body.recipe}`;
  const rules = claimRule(recipe, who);
  const [claims, kept] = await Promise.all([keptClaims(db, a.poi, claim, rules), keptVars(db, a.poi, char)]);
  /** @type {any[]} */
  let given = [];
  const change = (/** @type {any} */ save) => {
    const why = recipeWhy(recipe, who, ctxOfSave(save, doc, kept), (scope) => claims.get(scope) ?? null);
    if (why) return /** @type {any} */ (WHY)[why];
    const stacks = recipe.requireItems ?? [];
    if (!takeStacks(save, stacks).ok) return WHY.items;
    if (!takeGold(save, recipe.requireGold ?? 0)) return WHY.gold;
    const m = mint(recipe.rewardItems ?? [], ctx.rand);
    if (m.error) return m.error;
    if (goldOf(save) + (recipe.rewardGold ?? 0) > GOLD_INT_MAX) return 'poi-gold-full';
    given = m.records ?? [];
    giveGoods(save, given, recipe.rewardGold ?? 0);
    return null;
  };
  return settle(ctx, player, a, 'trade', change, () => ({
    steps: claimSteps(db, a.poi, claim, rules, nowS),
    result: { took: { items: recipe.requireItems ?? [], gold: recipe.requireGold ?? 0 }, gave: { items: given, gold: recipe.rewardGold ?? 0 }, vars: kept },
  }));
}

/**
 * ONE EVENT'S ITEMS, GOLD AND KEPT VARIABLES. The branch (`then` or `else`) is chosen here, from the character's own record
 * and kept variables; its give and take actions and its writes to kept variables are settled, and the answer names the
 * branch so the client runs the rest (a line said, a door opened) with the money already moved. With no `event`, answers
 * the variables the character holds. An event with nothing for the service in its branch answers `{ ok, branch }` and moves nothing.
 * @param {any} ctx @param {string} player @param {any} body
 */
export async function eventClaimPoi(ctx, player, body) {
  if (!ctx.bucket) return { error: 'no-storage' };
  const a = actOf(body);
  if (!a || (body.event !== undefined && typeof body.event !== 'string')) return { error: 'body' };
  const { db, nowS } = ctx;
  const again = await replayOf(db, a.txnId, player);
  if (again) return again;
  const live = await liveDoc(db, a.poi, a.rev);
  if (live.error) return live;
  const doc = live.doc;
  const row = await db.prepare('SELECT seq, lease, obj FROM realm_characters WHERE id = ? AND player = ?').bind(a.id, player).first();
  if (!row) return { error: 'no-realm-character' };
  const kept = await keptVars(db, a.poi, a.id);
  if (body.event === undefined) return { ok: true, vars: kept, seq: row.seq };
  const ev = byKey(doc.events, body.event);
  if (!ev) return { error: 'poi-no-event' };
  if (!readsOnlyKept(doc, ev.when)) return { error: 'poi-var-scope' };
  const char = a.id;
  /** @type {'then' | 'else'} */
  let branch = 'then';
  /** @type {any[]} */
  let given = [];
  /** @type {Record<string, any>} */
  const now = { ...kept };
  /** @type {Map<string, { to?: any, delta: number }>} */
  const writes = new Map();
  let value = null;
  // the branch is chosen from the record, then the act is shaped by it - so the rules (the once an event gives in) are
  // read with the actions in hand, and the claim row for them read before the record is touched
  const rulesFor = (/** @type {any[]} */ actions) => eventRule(actions, char);
  const claimName = `event/${body.event}`;
  const claims = await keptClaims(db, a.poi, claimName, [...rulesFor(ev.then ?? []), ...rulesFor(ev.else ?? [])]);
  const change = (/** @type {any} */ save) => {
    branch = evalWhen(ev.when, ctxOfSave(save, doc, kept)) ? 'then' : 'else';
    const actions = ev[branch] ?? [];
    for (const act of actions) {
      if (act.k !== 'set_var') continue;
      const v = byKey(doc.variables, act.var);
      if (!persists(v)) continue;
      const w = writes.get(act.var) ?? { delta: 0 };
      if (act.to !== undefined) { w.to = act.to; w.delta = 0; now[act.var] = act.to; }
      else { w.delta += act.add; now[act.var] = (Number(now[act.var] ?? v.initial) || 0) + act.add; }
      writes.set(act.var, w);
    }
    const takesStacks = actions.filter((x) => x.k === 'take_item').map((x) => x.item);
    const takeAmount = actions.filter((x) => x.k === 'take_gold').reduce((n, x) => n + x.amount, 0);
    const giveStacks = actions.filter((x) => x.k === 'give_item').map((x) => x.item);
    const giveAmount = actions.filter((x) => x.k === 'give_gold').reduce((n, x) => n + x.amount, 0);
    value = { takeStacks: takesStacks, takeAmount, giveAmount, rules: rulesFor(actions) };
    for (const r of value.rules) { const c = claims.get(r.scope); if (c && c.n >= r.max) return WHY.limit; }
    if (!takeStacks(save, takesStacks).ok) return WHY.items;
    if (!takeGold(save, takeAmount)) return WHY.gold;
    const m = mint(giveStacks, ctx.rand);
    if (m.error) return m.error;
    if (goldOf(save) + giveAmount > GOLD_INT_MAX) return 'poi-gold-full';
    given = m.records ?? [];
    giveGoods(save, given, giveAmount);
    return null;
  };
  // an event with nothing for the service to settle: the branch is read from the record, and nothing is written
  const nothingFor = (/** @type {'then' | 'else'} */ b) => !(ev[b] ?? []).some((x) => /^(give|take)_(item|gold)$/.test(x.k) || (x.k === 'set_var' && persists(byKey(doc.variables, x.var))));
  if (nothingFor('then') && nothingFor('else')) {
    const object = await ctx.bucket.get(row.obj);
    const save = parsed(await realmSaveTextOf(object));
    if (!save) return { error: 'no-data' };
    return { ok: true, seq: row.seq, branch: evalWhen(ev.when, ctxOfSave(save, doc, kept)) ? 'then' : 'else', nothing: true };
  }
  return settle(ctx, player, a, 'event', change, () => {
    const steps = [
      ...claimSteps(db, a.poi, claimName, value?.rules ?? [], nowS),
    ];
    for (const [key, w] of writes) {
      const v = byKey(doc.variables, key);
      const scopeId = scopeIdOf(v, char);
      if (w.to === undefined && v.scope === 'poi_global') {
        // a shared counter moves by arithmetic, so two characters adding at once both count
        steps.push(db.prepare(`INSERT INTO poi_state_vars (poi_id, scope_id, var, value) VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT (poi_id, scope_id, var) DO UPDATE SET value = printf('%.15g', CAST(value AS REAL) + ?5)`)
          .bind(a.poi, scopeId, key, JSON.stringify((Number(v.initial) || 0) + w.delta), w.delta));
      } else {
        steps.push(db.prepare(`INSERT INTO poi_state_vars (poi_id, scope_id, var, value) VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT (poi_id, scope_id, var) DO UPDATE SET value = excluded.value`)
          .bind(a.poi, scopeId, key, JSON.stringify(now[key])));
      }
    }
    return {
      steps,
      result: { branch, took: { items: value?.takeStacks ?? [], gold: value?.takeAmount ?? 0 }, gave: { items: given, gold: value?.giveAmount ?? 0 }, vars: now },
    };
  });
}
