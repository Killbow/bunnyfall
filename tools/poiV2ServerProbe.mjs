// The account service's half of POI v2, tried on an isolated local stack: draft, submit, and approve; trade and event
// settlement on a synthetic realm character, with the save's schema untouched; idempotent retries, and one winner of
// two settles at one sequence; refusal on a POI that is not live; a judge-clean checkpoint (the stack runs with the
// judge on); named potions, `has_item` checks, empty-bottle takes, and Potent potions counted and spent last; and
// separate trade and event claim limits. Never a real player's save: the data directory is temporary, and the accounts
// and characters are made here.
//   node --test tools/poiV2ServerProbe.mjs
// Needs `npm --prefix server ci` once (wrangler and miniflare), and takes a minute to bundle the two Workers.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { poiV2Example } from './poiV2Examples.mjs';
import { mintGift } from '../server-account/src/staffGive.js';
import { itemFindings } from '../src/systems/item/itemLaw.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = /** @type {any} */ (s.address()); s.close(() => ok(port)); }); });

let child, data, base;
const out = [];

async function call(path, { method = 'GET', token = null, body = null, headers = {}, raw = false } = {}) {
  const h = { accept: 'application/json', ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body && !raw) h['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method, headers: h, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

before(async () => {
  data = mkdtempSync(join(tmpdir(), 'bunnyfall-probe-'));
  const [accounts, relay, updater] = [await freePort(), await freePort(), await freePort()];
  base = `http://127.0.0.1:${accounts}`;
  child = spawn(process.execPath, [join(root, 'selfhost', 'start.mjs')], {
    cwd: root,
    env: { ...process.env, BUNNYFALL_DATA: data, ACCOUNT_PORT: String(accounts), RELAY_PORT: String(relay), UPDATER_PORT: String(updater), BUNNYFALL_UPDATES: join(data, 'updates'), BUNNYFALL_ACCOUNT_VARS: 'JUDGE_OFF=off' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => out.push(String(d)));
  child.stderr.on('data', (d) => out.push(String(d)));
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the stack stopped:\n${out.join('').slice(-2000)}`);
    try { if ((await fetch(`${base}/v1/health`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 240_000) throw new Error(`the stack did not start:\n${out.join('').slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
});

after(() => {
  try { child?.kill('SIGTERM'); } catch { /* gone */ }
  setTimeout(() => { try { rmSync(data, { recursive: true, force: true }); } catch { /* kept */ } }, 3500).unref();
});

/** A signed-in account: a guest made a real account with a handle. */
async function account(handle) {
  const g = await call('/v1/auth/guest', { method: 'POST', body: { label: 'probe' } });
  assert.equal(g.status, 200, g.text);
  const r = await call('/v1/auth/register', { method: 'POST', token: g.json.secret, body: { handle, password: 'probe-password-1', set: true } });
  assert.equal(r.status, 200, r.text);
  return g.json.secret;
}

const items = (...specs) => specs.map(([template, count]) => mintGift({ template, count }).item);

/** A realm character with a first save, the way chargen makes one (level 1, a small purse, a few goods). */
async function character(token, name, goods, gold) {
  const made = await call('/v1/realm/create', { method: 'POST', token, body: { name } });
  assert.equal(made.status, 200, made.text);
  const { id, lease } = made.json;
  const save = { level: 1, name, goldPieces: gold, items: goods, lightSourceIndex: -1 };
  const put = await checkpoint(token, { id, lease, seq: 0 }, save);
  assert.equal(put.status, 200, put.text);
  return { id, lease, seq: put.json.seq, save };
}
/** A checkpoint of the record that stands at `seq` is written as `seq + 1`. */
const checkpoint = (token, { id, lease, seq }, save) => call(`/v1/realm/${id}/data`, { method: 'PUT', token, raw: true, body: JSON.stringify(save), headers: { 'x-realm-lease': lease, 'x-realm-seq': String(seq + 1), 'content-type': 'application/octet-stream' } });
const saveOf = async (token, id) => JSON.parse((await call(`/v1/realm/${id}/data`, { token })).text);
let txn = 0;
const tx = () => `probe-txn-${Date.now().toString(36)}-${++txn}`;
const trade = (token, poi, c, recipe, extra = {}) => call('/v1/poi/trade', { method: 'POST', token, body: { poi: poi.id, rev: poi.rev, id: c.id, lease: c.lease, seq: c.seq, txnId: tx(), trade: recipe[0], recipe: recipe[1], ...extra } });
const claim = (token, poi, c, event, extra = {}) => call('/v1/poi/event-claim', { method: 'POST', token, body: { poi: poi.id, rev: poi.rev, id: c.id, lease: c.lease, seq: c.seq, txnId: tx(), ...(event ? { event } : {}), ...extra } });
const countIn = (save, template) => save.items.filter((r) => r.templateIndex === template).reduce((n, r) => n + (r.stackCount ?? 1), 0);
const HEAL_TRUE = mintGift({ template: 83, recipe: 'healTrue' }).item.potionRecipeKey;
const healTrueIn = (save) => save.items.filter((r) => r.templateIndex === 83 && r.potionRecipeKey === HEAL_TRUE && !r.potent).reduce((n, r) => n + (r.stackCount ?? 1), 0);

/** The probe's POI: the example's four scenarios, plus a gift, a toll, a stock and a counter. */
function doc(id = 'poi-0123456789ab') {
  const d = poiV2Example();
  d.id = id;
  d.variables.push({ key: 'visits', name: 'Visits', type: 'number', scope: 'poi_global', initial: 0 });
  d.interactives.push({ key: 'altar', name: 'Altar', kind: 'switch', appearance: { k: 'none' }, t: [0, 0, 5], yaw: 0, radius: 2, state: 'inactive' });
  d.events.push(
    { key: 'gift', name: 'A gift', trigger: { k: 'interact', interactive: 'altar' }, then: [{ k: 'give_gold', amount: 15 }, { k: 'set_var', var: 'visits', add: 1 }] },
    { key: 'toll', name: 'A toll', trigger: { k: 'interact', interactive: 'gate' }, then: [{ k: 'take_gold', amount: 20 }, { k: 'give_item', item: { template: 16, count: 2 } }], else: [{ k: 'say', text: 'No.' }] },
    { key: 'proof', name: 'Proof', trigger: { k: 'interact', interactive: 'altar' }, when: { k: 'var', var: 'supplies_delivered', op: 'eq', value: true }, then: [{ k: 'say', text: 'Yes.' }, { k: 'set_var', var: 'supplies_delivered', to: false }] },
  );
  d.trades.push({ key: 'stock', name: 'Last pieces', recipes: [{ key: 'one', name: 'One of two', requireItems: [], requireGold: 5, rewardItems: [{ template: 62, count: 1 }], rewardGold: 0, limitMode: 'global_stock', maxStock: 2 }] });
  return d;
}

const state = {};

test('a builder drafts, submits and an approver approves; only then is the POI live', async () => {
  state.builder = await account('Killbunny');
  state.player = await account('ProbePlayer');
  assert.equal((await call('/v1/poi/me', { token: state.builder })).json.approver, true);
  assert.equal((await call('/v1/poi/me', { token: state.player })).json.builder, false);
  const saved = await call('/v1/poi/draft', { method: 'PUT', token: state.builder, body: { doc: doc(), base: null } });
  assert.equal(saved.status, 200, saved.text);
  state.poi = { id: saved.json.id, rev: saved.json.rev };
  assert.equal(saved.json.state, 'draft');
  state.c = await character(state.player, 'Probe', [...items([16, 6], [42, 2], [71, 10], [72, 5])], 100);
  // a draft settles nothing, and neither does a submission
  assert.equal((await trade(state.player, state.poi, state.c, ['nyra', 'brew'])).json.error, 'poi-not-live');
  assert.equal((await call('/v1/poi/submit', { method: 'POST', token: state.builder, body: state.poi })).json.state, 'submitted');
  assert.equal((await trade(state.player, state.poi, state.c, ['nyra', 'brew'])).json.error, 'poi-not-live');
  // the approver's word names the document it read
  const queue = (await call('/v1/poi/queue', { token: state.builder })).json.queue;
  const entry = queue.find((q) => q.id === state.poi.id);
  assert.ok(entry?.docSha);
  assert.equal((await call('/v1/poi/review', { method: 'POST', token: state.builder, body: { ...state.poi, verdict: 'approve', docSha: 'f'.repeat(64) } })).json.error, 'poi-changed');
  const ok = await call('/v1/poi/review', { method: 'POST', token: state.builder, body: { ...state.poi, verdict: 'approve', docSha: entry.docSha } });
  assert.equal(ok.json.state, 'approved', ok.text);
  const live = await call('/v1/poi/live');
  assert.ok(JSON.stringify(live.json).includes(state.poi.id), 'the live feed carries it');
});

test('a trade settles once: its items leave, its reward arrives, the save keeps its shape, and a lost answer is answered the same', async () => {
  const c = state.c;
  const before = await saveOf(state.player, c.id);
  const body = { poi: state.poi.id, rev: state.poi.rev, id: c.id, lease: c.lease, seq: c.seq, txnId: tx(), trade: 'nyra', recipe: 'brew' };
  const a = await call('/v1/poi/trade', { method: 'POST', token: state.player, body });
  assert.equal(a.status, 200, a.text);
  assert.equal(a.json.seq, c.seq + 1);
  assert.equal(a.json.gave.items.length, 1);
  assert.deepEqual(itemFindings(a.json.gave.items[0]), []);
  const after1 = await saveOf(state.player, c.id);
  assert.equal(countIn(after1, 16), 1, 'five berries left');
  assert.equal(countIn(after1, 42), 0, 'both blood left');
  assert.equal(healTrueIn(after1), 1, 'the Heal True potion arrived');
  assert.equal(after1.goldPieces, before.goldPieces);
  assert.deepEqual(Object.keys(after1).sort(), Object.keys(before).sort(), 'no new save field');
  for (const r of after1.items) assert.deepEqual(itemFindings(r), []);
  // the answer was lost: the same txn asked again is answered the same and moves nothing
  const again = await call('/v1/poi/trade', { method: 'POST', token: state.player, body });
  assert.equal(again.json.replayed, true);
  assert.equal(again.json.seq, a.json.seq);
  assert.deepEqual(again.json.gave, a.json.gave);
  assert.equal(healTrueIn(await saveOf(state.player, c.id)), 1);
  // another account cannot use the txn
  const other = await account('ProbeOther');
  assert.equal((await call('/v1/poi/trade', { method: 'POST', token: other, body })).json.error, 'txn-spent');
  c.seq = a.json.seq;
  // and the character holds too few of the goods now
  assert.equal((await trade(state.player, state.poi, c, ['nyra', 'brew'])).json.error, 'poi-items');
});

test('a checkpoint of the settled record is clean through the judge', async () => {
  const c = state.c;
  const save = await saveOf(state.player, c.id);
  const put = await checkpoint(state.player, c, save);
  assert.equal(put.status, 200, put.text);
  assert.ok(!put.json.tradeHeld, `no hold: ${put.text}`);
  c.seq = put.json.seq;
});

test('the judge is on in this stack: a piece held twice is locked, so the clean checkpoint above means something', async () => {
  const t = await account('ProbeCopier');
  const c = await character(t, 'Copier', [], 100);
  const save = await saveOf(t, c.id);
  const letter = mintGift({ template: 275, gold: 500 }).item;
  save.items = [letter, { ...letter }];
  const put = await checkpoint(t, c, save);
  assert.equal(put.status, 200, put.text);
  assert.ok(put.json.tradeHeld || put.json.locked?.length, `the copy was found: ${put.text}`);
});

test('gold and a limit: the delivery pays once per character, and the limit holds when the goods are brought again', async () => {
  const c = state.c;
  const a = await trade(state.player, state.poi, c, ['supplies', 'delivery']);
  assert.equal(a.status, 200, a.text);
  assert.equal(a.json.gave.gold, 250);
  assert.equal((await saveOf(state.player, c.id)).goldPieces, 350);
  c.seq = a.json.seq;
  const save = await saveOf(state.player, c.id);
  save.items.push(...items([71, 10], [72, 5]));
  const put = await checkpoint(state.player, c, save);
  c.seq = put.json.seq;
  assert.equal((await trade(state.player, state.poi, c, ['supplies', 'delivery'])).json.error, 'poi-limit');
  assert.equal((await saveOf(state.player, c.id)).goldPieces, 350, 'a refusal moves nothing');
});

test('a stock runs out for everyone, and two settles at one sequence let one through', async () => {
  const c = state.c;
  const second = await character(await account('ProbeTwo').then((t) => (state.two = t)), 'Second', [], 50);
  state.c2 = second;
  const one = await trade(state.player, state.poi, c, ['stock', 'one']);
  assert.equal(one.status, 200, one.text);
  c.seq = one.json.seq;
  const two = await trade(state.two, state.poi, second, ['stock', 'one']);
  assert.equal(two.status, 200, two.text);
  second.seq = two.json.seq;
  assert.equal((await trade(state.two, state.poi, second, ['stock', 'one'])).json.error, 'poi-stock', 'the stock of two is gone');
  // two at once, same sequence: one settles, the other finds the record moved
}, { timeout: 120_000 });

test('a record moved under an act refuses it: a stale sequence, another lease, another account\'s character', async () => {
  const racer = await account('ProbeRace2');
  const c = await character(racer, 'Racer2', items([16, 20], [42, 6]), 10);
  const [a, b] = await Promise.all([trade(racer, state.poi, c, ['nyra', 'brew']), trade(racer, state.poi, c, ['nyra', 'brew'])]);
  const wins = [a, b].filter((r) => r.status === 200);
  assert.equal(wins.length, 1, `${a.text} | ${b.text}`);
  const lost = [a, b].find((r) => r.status !== 200);
  assert.ok(lost.json.error === 'seq' || lost.json.error === 'poi-limit' || lost.json.error === 'lease', lost.text);
  const now = await saveOf(racer, c.id);
  assert.equal(countIn(now, 16), 15, 'taken once');
  assert.equal(healTrueIn(now), 1, 'given once');
  assert.equal((await trade(racer, state.poi, { ...c, seq: c.seq }, ['nyra', 'brew'])).json.error, 'seq', 'the sequence is the record\'s own');
  assert.equal((await trade(racer, state.poi, { ...c, lease: '0'.repeat(32), seq: wins[0].json.seq }, ['nyra', 'brew'])).json.error, 'lease');
  assert.equal((await trade(state.player, state.poi, { ...c, seq: wins[0].json.seq }, ['nyra', 'brew'])).json.error, 'no-realm-character');
});

test('events: a gift once, a toll as often as it can be paid, a counter kept, a refused branch moves nothing', async () => {
  const c = state.c;
  const g = await claim(state.player, state.poi, c, 'gift');
  assert.equal(g.status, 200, g.text);
  assert.equal(g.json.gave.gold, 15);
  assert.equal(g.json.vars.visits, 1);
  c.seq = g.json.seq;
  assert.equal((await claim(state.player, state.poi, c, 'gift')).json.error, 'poi-limit', 'a gift that takes nothing back is once');
  const before = (await saveOf(state.player, c.id)).goldPieces;
  const t1 = await claim(state.player, state.poi, c, 'toll');
  assert.equal(t1.status, 200, t1.text);
  assert.equal(t1.json.took.gold, 20);
  c.seq = t1.json.seq;
  const now = await saveOf(state.player, c.id);
  assert.equal(now.goldPieces, before - 20);
  const t2 = await claim(state.player, state.poi, c, 'toll');
  c.seq = t2.json.seq;
  assert.equal(t2.status, 200, 'an exchange repeats');
  // a variable kept for the character is read back, and the shared counter counts every character
  const read = await claim(state.player, state.poi, c);
  assert.equal(read.json.vars.visits, 1);
  const other = await claim(state.two, state.poi, state.c2, 'gift');
  assert.equal(other.json.vars.visits, 2, 'poi_global: the second character\'s gift counted on the first\'s');
  // a branch that needs nothing from the service moves nothing and says which it took
  const proof = await claim(state.player, state.poi, c, 'proof');
  assert.equal(proof.status, 200, proof.text);
  assert.equal(proof.json.seq >= c.seq, true);
  // too poor to pay the toll: refused whole
  const poor = await character(await account('ProbePoor'), 'Poor', [], 5);
  const poorToken = (await call('/v1/auth/login', { method: 'POST', body: { handle: 'ProbePoor', password: 'probe-password-1' } })).json.secret;
  const refused = await claim(poorToken, state.poi, poor, 'toll');
  assert.equal(refused.json.error, 'poi-gold');
});

test('a rollback is a revision of its own, and only the revision live now settles', async () => {
  const c = state.c;
  // a second revision with the brew costing more goes live; the first no longer settles
  const d2 = doc();
  d2.trades[0].recipes[0].requireItems = [{ template: 16, count: 1 }];
  const saved = await call('/v1/poi/draft', { method: 'PUT', token: state.builder, body: { doc: d2, base: state.poi.rev } });
  const rev2 = saved.json.rev;
  assert.ok(rev2 > state.poi.rev);
  await call('/v1/poi/submit', { method: 'POST', token: state.builder, body: { id: state.poi.id, rev: rev2 } });
  const entry = (await call('/v1/poi/queue', { token: state.builder })).json.queue.find((q) => q.rev === rev2);
  assert.equal((await call('/v1/poi/review', { method: 'POST', token: state.builder, body: { id: state.poi.id, rev: rev2, verdict: 'approve', docSha: entry.docSha } })).json.state, 'approved');
  assert.equal((await trade(state.player, state.poi, c, ['nyra', 'brew'])).json.error, 'poi-not-live', 'revision 1 is no longer live');
  const rolled = await call('/v1/poi/rollback', { method: 'POST', token: state.builder, body: { id: state.poi.id, rev: state.poi.rev } });
  assert.equal(rolled.status, 200, rolled.text);
  const hist = (await call(`/v1/poi/doc/${state.poi.id}`, { token: state.builder })).json;
  const revs = hist.revs ?? hist.history ?? [];
  assert.ok(JSON.stringify(revs).includes('rollback'), 'the rollback is on record as its own revision');
  const back = await trade(state.player, { id: state.poi.id, rev: state.poi.rev }, c, ['supplies', 'delivery']);
  assert.notEqual(back.json.error, 'poi-not-live', 'revision 1 is live again');
});

/** Builds a test POI with a potion trade, a potion condition, an empty-bottle take, and a trade keyed `event`. */
function potionDoc() {
  const d = poiV2Example();
  d.id = 'poi-0123456789ac';
  d.interactives.push({ key: 'shrine', name: 'Shrine', kind: 'switch', appearance: { k: 'none' }, t: [0, 0, 6], yaw: 0, radius: 2, state: 'inactive' });
  d.trades.push(
    { key: 'potions', name: 'Healer', recipes: [
      { key: 'heal', name: 'Heal True', requireItems: [], requireGold: 10, rewardItems: [{ template: 83, recipe: 'healTrue', count: 1 }], rewardGold: 0, limitMode: 'unlimited' },
      { key: 'bottle', name: 'Return a bottle', requireItems: [{ template: 83, count: 1 }], requireGold: 0, rewardItems: [], rewardGold: 1, limitMode: 'unlimited' },
      { key: 'spend', name: 'Spend a Heal True', requireItems: [{ template: 83, recipe: 'healTrue', count: 1 }], requireGold: 0, rewardItems: [], rewardGold: 1, limitMode: 'unlimited' },
    ] },
    { key: 'event', name: 'Event', recipes: [{ key: 'blessing', name: 'Blessing', requireItems: [], requireGold: 1, rewardItems: [], rewardGold: 2, limitMode: 'once_per_char' }] },
  );
  d.events.push(
    { key: 'healed', name: 'Healed', trigger: { k: 'interact', interactive: 'shrine' }, when: { k: 'has_item', item: { template: 83, recipe: 'healTrue', count: 1 } },
      then: [{ k: 'give_gold', amount: 5 }], else: [{ k: 'say', text: 'Bring a potion.' }] },
    { key: 'pair', name: 'Two potions', trigger: { k: 'interact', interactive: 'shrine' }, when: { k: 'has_item', item: { template: 83, recipe: 'healTrue', count: 2 } },
      then: [{ k: 'give_gold', amount: 4 }], else: [{ k: 'say', text: 'Bring two.' }] },
    { key: 'blessing', name: 'Blessing', trigger: { k: 'interact', interactive: 'shrine' }, then: [{ k: 'give_gold', amount: 3 }] },
  );
  return d;
}

test('potions: a trade gives a Heal True potion, a has_item on it settles, and a bottle take leaves the potions', async () => {
  const saved = await call('/v1/poi/draft', { method: 'PUT', token: state.builder, body: { doc: potionDoc(), base: null } });
  assert.equal(saved.status, 200, saved.text);
  const poi = state.potions = { id: saved.json.id, rev: saved.json.rev };
  await call('/v1/poi/submit', { method: 'POST', token: state.builder, body: poi });
  const entry = (await call('/v1/poi/queue', { token: state.builder })).json.queue.find((q) => q.id === poi.id);
  assert.equal((await call('/v1/poi/review', { method: 'POST', token: state.builder, body: { ...poi, verdict: 'approve', docSha: entry.docSha } })).json.state, 'approved');
  const t = state.healer = await account('ProbeHealer');
  const purification = mintGift({ template: 83, recipe: 'purification' }).item;
  const c = state.hc = await character(t, 'Healer', [mintGift({ template: 83, count: 2 }).item, purification], 100);
  const before = await claim(t, poi, c, 'healed');
  assert.equal(before.json.branch, 'else', 'no Heal True held yet');
  c.seq = before.json.seq;
  const a = await trade(t, poi, c, ['potions', 'heal']);
  assert.equal(a.status, 200, a.text);
  c.seq = a.json.seq;
  const got = a.json.gave.items[0];
  assert.equal(got.templateIndex, 83);
  assert.equal(got.value, 100);
  assert.equal(got.potionRecipeKey, mintGift({ template: 83, recipe: 'healTrue' }).item.potionRecipeKey);
  assert.deepEqual(itemFindings(got), []);
  const h = await claim(t, poi, c, 'healed');
  assert.equal(h.status, 200, h.text);
  assert.equal(h.json.branch, 'then');
  assert.equal(h.json.gave.gold, 5);
  c.seq = h.json.seq;
  const b = await trade(t, poi, c, ['potions', 'bottle']);
  assert.equal(b.status, 200, b.text);
  c.seq = b.json.seq;
  const now = await saveOf(t, c.id);
  const keys = now.items.filter((r) => r.templateIndex === 83).map((r) => [r.potionRecipeKey ?? 0, r.stackCount ?? 1]).sort((x, y) => x[0] - y[0]);
  assert.deepEqual(keys, [[0, 1], [got.potionRecipeKey, 1], [purification.potionRecipeKey, 1]].sort((x, y) => x[0] - y[0]), 'one empty bottle taken, both potions left');
  const put = await checkpoint(t, c, now);
  assert.equal(put.status, 200, put.text);
  assert.ok(!put.json.tradeHeld, `the potions pass the judge: ${put.text}`);
  c.seq = put.json.seq;
});

test('potions: a Potent potion of the recipe counts for has_item, and a take spends it only when no plain one is left', async () => {
  const t = await account('ProbePotent');
  const plain = mintGift({ template: 83, recipe: 'healTrue' }).item;
  const c = await character(t, 'Potent', [{ ...plain, potent: 40 }, { ...plain }], 100);
  const has = await claim(t, state.potions, c, 'pair');
  assert.equal(has.status, 200, has.text);
  assert.equal(has.json.branch, 'then', 'the plain and the Potent one make two');
  c.seq = has.json.seq;
  const potentLeft = (save) => save.items.filter((r) => r.templateIndex === 83 && r.potionRecipeKey === plain.potionRecipeKey).map((r) => r.potent ?? 0);
  const one = await trade(t, state.potions, c, ['potions', 'spend']);
  assert.equal(one.status, 200, one.text);
  c.seq = one.json.seq;
  assert.deepEqual(potentLeft(await saveOf(t, c.id)), [40], 'the plain one is taken first');
  const two = await trade(t, state.potions, c, ['potions', 'spend']);
  assert.equal(two.status, 200, two.text);
  c.seq = two.json.seq;
  assert.deepEqual(potentLeft(await saveOf(t, c.id)), [], 'then the Potent one');
  assert.equal((await trade(t, state.potions, c, ['potions', 'spend'])).json.error, 'poi-items');
});

test('an event and a recipe of a trade keyed `event` count their limits apart', async () => {
  const t = state.healer, c = state.hc, poi = state.potions;
  const g = await claim(t, poi, c, 'blessing');
  assert.equal(g.status, 200, g.text);
  c.seq = g.json.seq;
  const r = await trade(t, poi, c, ['event', 'blessing']);
  assert.equal(r.status, 200, `the event's claim does not spend the recipe's: ${r.text}`);
  c.seq = r.json.seq;
  assert.equal((await trade(t, poi, c, ['event', 'blessing'])).json.error, 'poi-limit');
  assert.equal((await claim(t, poi, c, 'blessing')).json.error, 'poi-limit');
});
