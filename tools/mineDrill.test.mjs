import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { mineLayout } from '../src/net/mine/mineLayout.js';
import { createMineState, stepMine, MINE_ALARM } from '../src/net/mine/mineBrain.js';
import { MINE_DRILL, drillHopper } from '../src/net/mine/mineDrill.js';
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
  assert.equal(drillHopper(d, NOW + MINE_DRILL.perOreS * 3), 3 * d.rich);
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
  assert.equal(r.haul.n, 5 * Math.max(1, Math.min(3, hole.h.rich)));
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
  assert.equal(mineReceiptId(v.claims), `${MINE}:0:4`);
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
