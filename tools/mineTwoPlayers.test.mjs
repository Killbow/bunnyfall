// BUNNYFALL (2026-11-26, caverns): TWO PLAYERS IN ONE MINE against the account service's own handlers - the report: "when
// mining with somebody also with you in the mine, it seems to create an issue with account service".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { claimMineHaul } from '../server-account/src/mineHaul.js';
import { harvestNode } from '../server-account/src/profHarvest.js';
import { mintMineReceipt } from '../src/net/mine/mineReceipt.js';
import { cveinKey, mineVeins, MINE_VEINS_PER_DAY } from '../src/net/mine/mineVeins.js';
import { mineLayout } from '../src/net/mine/mineLayout.js';
import { accountRefusalText } from '../src/net/accountClient.js';

const { subtle } = webcrypto;
const nowS = 20_000 * 86_400 + 3_600;
const A = { id: 'a1b2c3d4e5f60718', handle: 'Alya', registered_at: 0 };
const B = { id: '0f1e2d3c4b5a6978', handle: 'Nim', registered_at: 0 };
const env = { PROFESSIONS_OPEN: 'on' };

function fixture() {
  const sql = new DatabaseSync(':memory:');
  const dir = new URL('../server-account/migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(f, dir), 'utf8'));
  sql.exec('PRAGMA foreign_keys = OFF');
  const prepare = (text, args = []) => ({ bind: (...a) => prepare(text, a),
    first: async () => sql.prepare(text).get(...args.map((v) => v ?? null)) ?? null,
    all: async () => ({ results: sql.prepare(text).all(...args.map((v) => v ?? null)) }),
    run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args.map((v) => v ?? null)).changes) } }),
  });
  const db = { prepare, async batch(steps) { const r = []; for (const s of steps) { const x = await s.all(); r.push({ results: x.results, meta: { changes: sql.prepare('SELECT changes() AS n').get().n } }); } return r; } };
  return { sql, db };
}

const haul = (by, seq, over = {}) => ({ mine: 12, reset: 3, s: 0, c: 0, k: 0, ore: 'metal:iron', n: 5, by, seq, ...over });

test('two players take hauls from one mine: each is paid into their own Stores, even when the haul counts agree', async () => {
  const { sql, db } = fixture();
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const ctx = { db, nowS, subtle };
  // the relay counts a mine's hauls on one counter, but a reset that reopens a mine at the same count must never swallow a neighbour's pay
  const ra = await mintMineReceipt(haul(A.id, 1), kp.privateKey, { subtle, nowS });
  const rb = await mintMineReceipt(haul(B.id, 1, { n: 3 }), kp.privateKey, { subtle, nowS });
  const a = await claimMineHaul(ctx, A, env, { receipt: ra, character: 'char-a' }, kp.publicKey);
  const b = await claimMineHaul(ctx, B, env, { receipt: rb, character: 'char-b' }, kp.publicKey);
  assert.deepEqual(a, { paid: 5, ore: 'metal:iron' });
  assert.deepEqual(b, { paid: 3, ore: 'metal:iron' });
  const stores = (p) => sql.prepare("SELECT SUM(qty) AS n FROM prof_stores WHERE player = ? AND material = 'metal:iron'").get(p).n;
  assert.equal(stores(A.id), 5);
  assert.equal(stores(B.id), 3);
  // a receipt carried twice still pays once, and another's receipt is never paid to a bystander
  assert.deepEqual(await claimMineHaul(ctx, A, env, { receipt: ra, character: 'char-a' }, kp.publicKey), { paid: 0, why: 'claimed' });
  assert.deepEqual(await claimMineHaul(ctx, B, env, { receipt: ra, character: 'char-b' }, kp.publicKey), { error: 'not-yours' });
  assert.equal(stores(A.id), 5);
});

test('two players strike the same cave vein on the same day: both are paid, neither is refused', async () => {
  const { db } = fixture();
  const ctx = { db, nowS, rand: () => 0.5 };
  const node = cveinKey({ mine: 12, reset: 3, slot: 0 });
  const ask = (p, rid) => harvestNode(ctx, p, env, { character: `char-${p.id}`, node, kind: 'ore', act: { glints: 0 }, at: nowS, rid });
  const [x, y] = await Promise.all([ask(A, 'rid-a-000000000001'), ask(B, 'rid-b-000000000001')]);
  assert.equal(x.ok, true, JSON.stringify(x));
  assert.equal(y.ok, true, JSON.stringify(y));
  assert.equal(x.node, node);
});

test('every refusal a mine act can answer has words of its own, never the generic "account service had a problem"', () => {
  const generic = accountRefusalText('server');
  for (const code of ['no-node', 'day-full', 'node-taken', 'prof-rank', 'bad-node', 'receipt', 'not-yours', 'no-gate-key', 'stores-full', 'carried-full']) {
    assert.notEqual(accountRefusalText(code), generic, code);
  }
  assert.match(accountRefusalText('day-full'), /day|tomorrow/i);
  assert.match(accountRefusalText('no-node'), /vein|mine/i);
});

test('the day\'s count of cave veins is the account\'s own: one miner at the limit never refuses their neighbour', async () => {
  const { sql, db } = fixture();
  const ctx = { db, nowS, rand: () => 0.5 };
  const day = Math.floor(nowS / 86_400);
  const fill = sql.prepare("INSERT INTO node_harvests (day, node, kind, player, char_id, profession, material, qty, xp, at, rid, n) VALUES (?1, ?2, 'ore', ?3, 'c', 'mining', 'metal:iron', 1, 0, 0, ?4, 'n')");
  for (let i = 0; i < MINE_VEINS_PER_DAY; i++) fill.run(day, `cvein:1:1:${i}`, A.id, `fill${i}`);
  const slot = mineVeins(mineLayout(12, 3)).findIndex((v) => v.tier <= 1);
  const node = cveinKey({ mine: 12, reset: 3, slot: Math.max(0, slot) });
  const full = await harvestNode(ctx, A, env, { character: 'char-a', node, kind: 'ore', act: { glints: 0 }, at: nowS, rid: 'rid-a-full-0000001' });
  assert.deepEqual(full, { error: 'day-full' });
  const fine = await harvestNode(ctx, B, env, { character: 'char-b', node, kind: 'ore', act: { glints: 0 }, at: nowS, rid: 'rid-b-fine-0000001' });
  assert.equal(fine.ok, true, JSON.stringify(fine));
});
