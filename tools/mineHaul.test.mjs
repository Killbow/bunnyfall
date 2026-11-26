import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { d1Sqlite, seedPlayer } from './lib/d1Sqlite.mjs';
import { mintMineReceipt } from '../src/net/mine/mineReceipt.js';
import { claimMineHaul } from '../server-account/src/mineHaul.js';

const NOW = 1_800_000_000, CHAR = 'char-0001', { subtle } = webcrypto;

test('a drill haul pays its ore into the Stores and its mining XP into the track, once', async () => {
  const { db, sqlite } = d1Sqlite();
  seedPlayer(sqlite, 'acct-me-0001', 'Miner');
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const player = { id: 'acct-me-0001', handle: 'Miner' }, env = { PROFESSIONS_OPEN: 'on' }, ctx = { db, nowS: NOW, subtle };
  const r = await mintMineReceipt({ mine: 398616, reset: 0, s: 0, c: 0, k: 0, ore: 'ore:ebony', n: 30, by: 'acct-me-0001', seq: 1 }, kp.privateKey, { subtle, nowS: NOW });
  const paid = await claimMineHaul(ctx, player, env, { receipt: r, character: CHAR }, kp.publicKey);
  assert.equal(paid.paid, 30);
  assert.equal(paid.xp, 30 * 0.5 * 15 * 6 / 3);
  assert.equal(sqlite.prepare("SELECT qty FROM prof_stores WHERE player = 'acct-me-0001' AND material = 'ore:ebony' AND origin = 'own'").get().qty, 30);
  assert.equal(sqlite.prepare("SELECT xp FROM prof_tracks WHERE player = 'acct-me-0001' AND char_id = ? AND profession = 'mining'").get(CHAR).xp, paid.xp);
  const again = await claimMineHaul(ctx, player, env, { receipt: r, character: CHAR }, kp.publicKey);
  assert.equal(again.paid, 0);   // the same receipt twice pays once, XP included
  assert.equal(sqlite.prepare("SELECT xp FROM prof_tracks WHERE player = 'acct-me-0001' AND char_id = ? AND profession = 'mining'").get(CHAR).xp, paid.xp);
});
