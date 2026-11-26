import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { mineLayout } from '../src/net/mine/mineLayout.js';
import { createMineState, stepMine, MINE_ALARM } from '../src/net/mine/mineBrain.js';
import { MINE_DRILL, mineOreKey, oreRunsLeft, drillHopper, drillYield } from '../src/net/mine/mineDrill.js';
import { mintMineReceipt, readMineReceipt, verifyMineReceipt, mineReceiptId } from '../src/net/mine/mineReceipt.js';
import { validMineIn, validMineOut } from '../src/net/mine/mineWire.js';

const NOW = 1_800_000_000, MINE = 398616;
const L = mineLayout(MINE, 0);
const hole = (() => { for (const [s, sec] of L.sections.entries()) for (const [c, ch] of sec.chambers.entries()) if (ch.holes.length) return { s, c, k: 0, h: ch.holes[0] }; return null; })();
const ME = 'acct-me-0001', YOU = 'acct-you-002';

test('a drill set on a hole runs a shift, filling its hopper by the seam’s richness, to its brim', () => {
  const r = stepMine(createMineState(L, NOW), { op: 'drill', s: hole.s, c: hole.c, k: 0, by: ME }, NOW);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.events, [`drill:${hole.s}:${hole.c}:0`]);
  const d = r.state.drills[0];
  assert.equal(d.until - d.from, MINE_DRILL.shiftS);
  assert.equal(drillHopper(d, NOW + MINE_DRILL.perOreS * 3), 3 * drillYield(d.rich));
  assert.ok(drillHopper(d, NOW + 99999) <= MINE_DRILL.hopperMax);
});

test('one drill a player, one a hole; only its setter empties it, and the haul names the hole’s ore', () => {
  let st = stepMine(createMineState(L, NOW), { op: 'drill', s: hole.s, c: hole.c, k: 0, by: ME }, NOW).state;
  assert.equal(stepMine(st, { op: 'drill', s: hole.s, c: hole.c, k: 0, by: YOU }, NOW).error, 'taken');
  const other = L.sections.flatMap((sec, s) => sec.chambers.flatMap((ch, c) => ch.holes.map((_, k) => ({ s, c, k })))).find((x) => !(x.s === hole.s && x.c === hole.c && x.k === 0));
  if (other) assert.equal(stepMine(st, { op: 'drill', ...other, by: ME }, NOW).error, 'one-each');
  assert.equal(stepMine(st, { op: 'take', s: hole.s, c: hole.c, k: 0, by: ME }, NOW).error, 'empty');
  assert.equal(stepMine(st, { op: 'take', s: hole.s, c: hole.c, k: 0, by: YOU }, NOW + 60).error, 'not-yours');
  const r = stepMine(st, { op: 'take', s: hole.s, c: hole.c, k: 0, by: ME }, NOW + 60);
  assert.equal(r.haul.ore, hole.h.ore);
  assert.equal(r.haul.n, 5 * drillYield(hole.h.rich));
  assert.equal(r.haul.seq, 1);
  st = r.state;
  assert.equal(stepMine(st, { op: 'take', s: hole.s, c: hole.c, k: 0, by: ME }, NOW + 60).error, 'empty');   // taken once
});

test('a running drill roars: the minute’s tick calls waves and wears its section', () => {
  let st = stepMine(createMineState(L, NOW), { op: 'drill', s: hole.s, c: hole.c, k: 0, by: ME }, NOW).state;
  const r = stepMine(st, { op: 'tick' }, NOW + 120);
  assert.ok(r.events.some((e) => e.startsWith(`wave:${hole.s}:`)), r.events.join());
  assert.ok(r.state.stab[hole.s] < 100);
  assert.ok(MINE_DRILL.noisePerS * 60 > MINE_ALARM.strike * 20);   // a minute of drill is louder than twenty strikes
});

test('the haul’s receipt: minted by the relay, read by the page, verified once by the service; tampering refused', async () => {
  const { subtle } = webcrypto;
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const h = { mine: MINE, reset: 0, s: hole.s, c: hole.c, k: 0, ore: hole.h.ore, n: 9, by: ME, seq: 4 };
  const r = await mintMineReceipt(h, kp.privateKey, { subtle, nowS: NOW });
  assert.equal(readMineReceipt(r).n, 9);
  const v = await verifyMineReceipt(r, kp.publicKey, { subtle, nowS: NOW + 10 });
  assert.ok(v.ok);
  assert.equal(mineReceiptId(v.claims), `${MINE}:0:4:${v.claims.u}`);
  const [ver, body, sig] = r.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), n: 45 })).toString('base64url');
  assert.equal((await verifyMineReceipt(`${ver}.${forged}.${sig}`, kp.publicKey, { subtle, nowS: NOW })).why, 'signature');
  assert.equal((await verifyMineReceipt(r, kp.publicKey, { subtle, nowS: NOW + 2 * 86400 })).why, 'expired');
  assert.equal((await verifyMineReceipt(`${ver}.${body}.`, kp.publicKey, { subtle, nowS: NOW })).why, 'unsigned');
});

test('the wire carries a drill’s words and the state’s drills, and a receipt', () => {
  assert.deepEqual(validMineIn({ t: 'mn', k: 'drill', s: 1, c: 0, h: 2 }), { k: 'drill', s: 1, c: 0, h: 2, crew: [] });
  assert.equal(validMineIn({ t: 'mn', k: 'take', s: 1, c: 0, h: 12 }), null);
  const st = createMineState(L, NOW);
  const withDrill = stepMine(st, { op: 'drill', s: hole.s, c: hole.c, k: 0, by: ME }, NOW).state;
  assert.ok(validMineOut({ t: 'mn', k: 'st', st: withDrill }));
  assert.ok(validMineOut({ t: 'mn', k: 'rc', r: 'm1.abc.def' }));
});

test('a crew the setter names may empty the hopper; a stranger may not', () => {
  let st = stepMine(createMineState(L, NOW), { op: 'drill', s: hole.s, c: hole.c, k: 0, by: ME, crew: [YOU, ME, 7] }, NOW).state;
  assert.deepEqual(st.drills[0].crew, [YOU]);   // itself and junk left out
  assert.equal(stepMine(st, { op: 'take', s: hole.s, c: hole.c, k: 0, by: 'acct-stranger' }, NOW + 60).error, 'not-yours');
  const r = stepMine(st, { op: 'take', s: hole.s, c: hole.c, k: 0, by: YOU }, NOW + 60);
  assert.equal(r.haul.by, YOU);   // paid to the crewman who took it
});

test('a drill whose setter has left the mine stops at the next tick; one whose setter stays runs on', () => {
  const st = stepMine(createMineState(L, NOW), { op: 'drill', s: hole.s, c: hole.c, k: 0, by: ME }, NOW).state;
  assert.equal(stepMine(st, { op: 'tick', here: [ME] }, NOW + 60).state.drills[0].until, NOW + MINE_DRILL.shiftS);
  const gone = stepMine(st, { op: 'tick', here: [YOU] }, NOW + 60).state.drills[0];
  assert.equal(gone.until, NOW + 60);
  assert.equal(drillHopper(gone, NOW + 999), drillHopper(gone, NOW + 60));   // nothing more made
});

test('a lamp lights its chamber once, and no stray comes in by a lit chamber', () => {
  let st = createMineState(L, NOW);
  const r = stepMine(st, { op: 'lamp', s: 0, c: 0 }, NOW);
  assert.deepEqual(r.events, ['lamp:0:0']);
  st = r.state;
  assert.equal(stepMine(st, { op: 'lamp', s: 0, c: 0 }, NOW).error, 'lit');
  // pick 0: the first chamber, the lit one
  assert.deepEqual(stepMine(st, { op: 'tick', present: true, roll: 0, pick: 0 }, NOW + 60).events.filter((e) => e.startsWith('stray:')), []);
  assert.ok(validMineIn({ t: 'mn', k: 'lamp', s: 0, c: 0 }));
  assert.ok(validMineOut({ t: 'mn', k: 'st', st }));
  assert.deepEqual(validMineIn({ t: 'mn', k: 'drill', s: 0, c: 0, h: 1, crew: ['a-1', 'b-2'] }).crew, ['a-1', 'b-2']);
  assert.equal(validMineIn({ t: 'mn', k: 'drill', s: 0, c: 0, h: 1, crew: Array(9).fill('x') }), null);
});

test('a partly worked deposit survives a stopped drill and breaks after its remaining cycles', () => {
  const { s, c, k } = hole;
  const spot = { s, c, k, by: ME };
  const deposit = mineOreKey(s, c, k);
  let state = createMineState(L, NOW);
  state.weak[s][c] = [0];
  state = stepMine(state, { op: 'drill', ...spot }, NOW).state;
  const stopped = stepMine(state, { op: 'tick', here: [] }, NOW + 60).state;
  assert.ok(Math.abs(stopped.stab[s] - (100 - MINE_DRILL.wearPerS * 60 * 1.5)) < 1e-9);
  assert.equal(oreRunsLeft(stopped.oreWork, deposit), 10);
  const taken = stepMine(stopped, { op: 'take', ...spot }, NOW + 60);
  assert.ok(taken.haul.n > 0);
  state = stepMine(taken.state, { op: 'drill', ...spot }, NOW + 60).state;
  assert.equal(state.drills[0].until, NOW + 180);
  const finished = stepMine(state, { op: 'tick', here: [ME] }, NOW + 180);
  assert.ok(finished.events.includes('ore-depleted'));
  assert.equal(oreRunsLeft(finished.state.oreWork, deposit), 0);
  const finalHaul = stepMine(finished.state, { op: 'take', ...spot }, NOW + 180);
  assert.ok(finalHaul.haul.n > 0);
  assert.equal(stepMine(finalHaul.state, { op: 'drill', ...spot }, NOW + 180).error, 'depleted');
});

test('a hole’s examine text names the ore a drill will make, and a drill runs to exactly that', async () => {
  const { MINE_CLIENT_TEXT } = await import('../src/systems/mine/mineClient.js');
  const { mineOreLeft } = await import('../src/net/mine/mineDrill.js');
  const { s, c, k, h } = hole, key = mineOreKey(s, c, k);
  const total = mineOreLeft({}, key, h.rich);
  assert.equal(total, (MINE_DRILL.shiftS / MINE_DRILL.perOreS) * drillYield(h.rich));
  assert.match(MINE_CLIENT_TEXT.hole('Iron', h.rich, 155, 160, total), new RegExp(`${total} ore`));
  assert.match(MINE_CLIENT_TEXT.hole('Iron', h.rich, 155, 160, total), /155 of 160/);   // shored rock holds past 100
  // set the drill, empty the hopper whenever it nears its brim, and the hauls add to the number the text showed
  let st = stepMine(createMineState(L, NOW), { op: 'drill', s, c, k, by: ME }, NOW).state, got = 0, t = NOW;
  for (let i = 0; i < 200; i++) {
    t += 20;
    st = stepMine(st, { op: 'tick', here: [ME] }, t).state;
    const r = stepMine(st, { op: 'take', s, c, k, by: ME }, t);
    if (r.haul) { got += r.haul.n; st = r.state; }
  }
  assert.equal(got, total);
  assert.equal(mineOreLeft(st.oreWork, key, h.rich), 0);
});

test('a drill yields a half more than the seam�s richness, and a full shift fits the hopper', () => {
  assert.deepEqual([1, 2, 3].map(drillYield), [2, 3, 5]);   // slightly above clicking a node by hand (2 to 4 ore)
  assert.equal(MINE_DRILL.perOreS, 12);   // speed unchanged
  assert.ok((MINE_DRILL.shiftS / MINE_DRILL.perOreS) * drillYield(3) <= MINE_DRILL.hopperMax);   // a whole deposit of the richest seam fits
  assert.equal(MINE_DRILL.hopperMax, 75);
});

test('a drill haul takes the Firmament’s mining yield and pays a little mining XP, half what a hand node pays per ore', async () => {
  const { drillHaulPaid, MINE_XP_SHARE } = await import('../src/net/mine/mineHaulLaw.js');
  assert.equal(MINE_XP_SHARE, 0.5);
  assert.deepEqual(drillHaulPaid(20, 'metal:iron', {}, 0.5), { qty: 20, xp: 20 * 0.5 * 5 });   // iron tier 1: 5 XP an ore by hand
  assert.deepEqual(drillHaulPaid(20, 'ore:ebony', {}, 0.5), { qty: 20, xp: 20 * 0.5 * 5 * 6 });
  assert.equal(drillHaulPaid(20, 'metal:iron', { 'yield.mining': 10 }, 0.99).qty, 22);   // 20 +10%
  assert.equal(drillHaulPaid(5, 'metal:iron', { 'yield.mining': 10 }, 0.0).qty, 6);   // the fraction (5.5) is a chance
  assert.equal(drillHaulPaid(5, 'metal:iron', { 'yield.mining': 10 }, 0.99).qty, 5);
  assert.equal(drillHaulPaid(20, 'metal:iron', { 'xp.mining': 20 }, 0.5).xp, 60);
  assert.equal(drillHaulPaid(20, 'wood:oak', {}, 0.5).xp, 0);   // not an ore: no mining XP
});
