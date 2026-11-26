import assert from 'node:assert/strict';
import test from 'node:test';
import { createMineClient, mineKey, MINE_COLLAPSE_S } from '../src/systems/mine/mineClient.js';
import { mineLayout } from '../src/net/mine/mineLayout.js';
import { createMineState, stepMine } from '../src/net/mine/mineBrain.js';

const L = mineLayout(398616, 0);
function rig({ stores = {}, spendOk = true } = {}) {
  const log = { said: [], sent: [], shakes: [], fades: [], closed: 0, left: 0, spent: [] };
  let now = 0;
  const client = createMineClient({
    layout: L, say: (x) => log.said.push(x), send: (k, f) => { log.sent.push({ k, ...f }); return true; },
    planks: (m) => stores[m] ?? 0, spend: async (m) => { log.spent.push(m); return spendOk; },
    shake: (k) => log.shakes.push(k), fade: (on) => log.fades.push(on), closeWindows: () => { log.closed++; }, leave: () => { log.left++; },
    nowMs: () => now,
  });
  return { client, log, tick: (ms) => { now += ms; client.frame(); } };
}
const fresh = () => createMineState(L, 1_800_000_000);

test('a collapse closes every window, shakes and fades, then leaves for the mouth exactly once', () => {
  const { client, log, tick } = rig();
  client.heard({ k: 'st', st: { ...fresh(), sealedUntil: 1_800_003_600 }, ev: ['collapse'] });
  assert.equal(log.closed, 1);
  for (let i = 0; i < 40; i++) tick(100);
  assert.equal(log.left, 1);
  assert.ok(log.fades.includes(true));
  assert.ok(Math.max(...log.shakes) > 0.2);
  assert.ok(log.said.some((x) => /reopens in about an hour/.test(x)));
  tick(1000);
  assert.equal(log.left, 1);
  assert.equal(MINE_COLLAPSE_S, 2.5);
});

test('a newcomer to a mine already sealed is put out too', () => {
  const { client, log, tick } = rig();
  client.heard({ k: 'st', st: { ...fresh(), sealedUntil: 1_800_003_600 } });
  for (let i = 0; i < 30; i++) tick(100);
  assert.equal(log.left, 1);
});

test('warnings shake harder each time and say what the rock is doing', () => {
  const { client, log } = rig();
  client.heard({ k: 'st', st: fresh(), ev: ['warn:dust'] });
  client.heard({ k: 'st', st: fresh(), ev: ['warn:creak'] });
  client.heard({ k: 'st', st: fresh(), ev: ['warn:rumble'] });
  assert.deepEqual(log.shakes, [0.02, 0.05, 0.1]);
  assert.equal(log.said.length, 3);
});

test('shoring with no planks in the Stores sends nothing and says so', async () => {
  const { client, log } = rig();
  client.heard({ k: 'st', st: fresh() });
  assert.equal(await client.press(mineKey('wall', 0, 0, 0)), true);
  assert.deepEqual(log.sent, []);
  assert.deepEqual(log.spent, []);
  assert.ok(/no planks/.test(log.said[0]));
});

test('shoring spends the strongest plank held and tells the room; a spend that fails sends nothing', async () => {
  const a = rig({ stores: { 'plank:pine': 5, 'plank:ironwood': 1, 'plank:oak': 2 } });
  a.client.heard({ k: 'st', st: fresh() });
  await a.client.press(mineKey('wall', 0, 0, 1));
  assert.deepEqual(a.log.spent, ['plank:ironwood']);
  assert.deepEqual(a.log.sent, [{ k: 'prop', s: 0, c: 0, w: 1, wood: 'ironwood' }]);
  const b = rig({ stores: { 'plank:oak': 2 }, spendOk: false });
  b.client.heard({ k: 'st', st: fresh() });
  await b.client.press(mineKey('wall', 0, 0, 1));
  assert.deepEqual(b.log.sent, []);
});

test('a wall already shored is named so and turns a plank away without spending it', async () => {
  const st = stepMine(fresh(), { op: 'prop', s: 0, c: 0, w: 2, wood: 'oak', by: 'x' }, 1_800_000_001).state;
  const { client, log } = rig({ stores: { 'plank:oak': 2 } });
  client.heard({ k: 'st', st });
  assert.equal(client.name(mineKey('wall', 0, 0, 2)).title, 'Shored');
  await client.press(mineKey('wall', 0, 0, 2));
  assert.deepEqual(log.spent, []);
});

test('a hole names its ore, its seam and how well the rock holds', async () => {
  const { client, log } = rig();
  client.heard({ k: 'st', st: { ...fresh(), stab: fresh().stab.map(() => 73) } });
  const h = L.sections[0].chambers[0].holes[0];
  await client.press(mineKey('hole', 0, 0, 0));
  assert.ok(log.said[0].includes('73 of 100'));
  assert.ok(log.said[0].toLowerCase().includes(h.ore.split(':')[1]));
});

test('a strike is told to the room by its section and chamber, but not during a collapse', () => {
  const { client, log } = rig();
  client.struck({ s: 1, c: 2 });
  assert.deepEqual(log.sent, [{ k: 'strike', s: 1, c: 2 }]);
  client.heard({ k: 'st', st: { ...fresh(), sealedUntil: 1 }, ev: ['collapse'] });
  client.struck({ s: 1, c: 2 });
  assert.equal(log.sent.length, 1);
});

test('shared lamp state supplies a stable point light until the mine is left', async () => {
  const { createMineHost } = await import('../src/systems/mine/mineHost.js');
  const { mineLocation, MINE_LAMP_M } = await import('../src/world/mine/mineLocation.js');
  const host = createMineHost({ renderer: { createMesh: () => ({}) } });
  const teardown = [];
  const ctx = { dynamicDraws: [], addTeardown: (fn) => teardown.push(fn) };
  host.stand(ctx, mineLocation({ px: 100, py: 100 }));
  const [x, y, z] = host.layout().sections[0].chambers[0].c;
  const eye = [x, y + 1, z];
  assert.deepEqual(host.lampLights(eye), []);

  const state = { k: 'st', st: { reset: 0, lamps: [{ s: 0, c: 0 }] } };
  host.heard(state);
  const [light] = host.lampLights(eye);
  assert.equal(light.range, MINE_LAMP_M);
  assert.ok(Math.abs(light.x - (x + 1.56)) < 0.001);
  assert.ok(Math.abs(light.y - (y + 1.59)) < 0.001);
  assert.deepEqual(host.lampLights([x + 100, y, z]), []);

  host.heard(state);
  assert.deepEqual(host.lampLights(eye), [light]);
  assert.equal(host.lampLights(eye)[0], light);
  teardown[0]();
  assert.deepEqual(host.lampLights(eye), []);
});
