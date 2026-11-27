import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeChore, createTavernChores, CHORE_ART } from '../src/scenes/tavernChores.js';
import { createTavernServiceHost } from '../src/scenes/tavernServiceHost.js';
import { createTavernShift, stepTavernShift, TAVERN_RECIPES, TAVERN_INGREDIENTS, tavernOrder } from '../src/net/tavernServiceLaw.js';

const room = (table = true) => ({
  raycast(o, d, max) {
    if (d[1] !== -1) return Infinity;
    const onTable = table && o[0] > .8 && o[0] < 1.6 && Math.abs(o[2]) < .5 && o[1] > .8;
    const h = o[1] - (onTable ? .8 : 0);
    return h >= 0 && h <= max ? h : Infinity;
  },
  sphereOverlaps: () => false,
});

test('empties go on the nearest real table top; a spill, or a room without a table, uses the floor', () => {
  const onTable = placeChore(room(), 'table', [0, 0, 0], 90);
  assert.equal(onTable.onTable, true); assert.ok(Math.abs(onTable.pos[1] - .8) < 1e-9);
  assert.ok(onTable.pos[0] > .8 && onTable.pos[0] < 1.6);
  const bare = placeChore(room(false), 'table', [0, 0, 0], 90);
  assert.equal(bare.onTable, false); assert.equal(bare.pos[1], 0);
  const spill = placeChore(room(), 'spill', [0, 0, 0], 90);
  assert.equal(spill.onTable, false); assert.equal(spill.pos[1], 0);
  assert.ok(Math.hypot(spill.pos[0], spill.pos[2]) > .5, 'beside the customer, not under them');
  assert.deepEqual(placeChore(room(), 'spill', [0, 0, 0], 90), spill, 'the same chore lands in the same place after a reload');
});

function fakeRenderer() {
  const live = new Set();
  return { live, createBillboardBatch(archive, record, size, centers) { const b = { archive, record, size, centers }; live.add(b); return b; },
    destroyBillboardBatch(b) { live.delete(b); } };
}
const flush = () => new Promise((r) => setImmediate(r));
const texture = { getSize: () => ({ width: 32, height: 32 }), getScale: () => ({ width: 0, height: 0 }) };

test('chores follow the shift: set down with Daggerfall flats, shrink while worked, vanish when cleared or the room changes', async () => {
  const renderer = fakeRenderer();
  const guest = { x: 0, y: 0, z: 0 };
  const chores = createTavernChores({ renderer, getTexture: async () => texture, uploadRecordFrame: () => {}, collider: () => room(), people: () => [guest], npcId: () => 'guest' });
  const state = { chores: [{ id: 'chore0', kind: 'table', patron: 'guest', at: 0, done: false }, { id: 'chore1', kind: 'spill', patron: 'guest', at: 0, done: false }] };
  chores.sync(state, '17:42'); await flush();
  assert.equal(renderer.live.size, CHORE_ART.table.length + CHORE_ART.spill.length);
  assert.deepEqual(chores.targets().map((t) => t.key), ['tchore:chore0', 'tchore:chore1']);
  assert.equal(chores.at('tchore:chore0').onTable, true);
  chores.progress('chore0', { taken: 2 });
  assert.equal(chores.batches().filter((b) => b.archive === 200 || b.archive === 205).length, 1 + CHORE_ART.spill.length, 'two cups lifted off the table');
  const mess = () => [...renderer.live].find((b) => b.archive === 205 && b.record === 44);
  const full = mess().size.w;
  chores.progress('chore1', { scale: .5 });
  assert.ok(Math.abs(mess().size.w - full / 2) < 1e-9, 'sweeping shrinks the mess in the room');
  chores.restore('chore0'); assert.equal(renderer.live.size, CHORE_ART.table.length + CHORE_ART.spill.length);
  state.chores[0].done = true; chores.sync(state, '17:42');
  assert.equal(renderer.live.size, CHORE_ART.spill.length); assert.equal(chores.at('tchore:chore0'), null);
  chores.sync(state, '17:43'); await flush();
  chores.sync({ chores: [] }, '17:43');
  assert.equal(renderer.live.size, 0, 'a new room starts clean');
});

test('the host offers a served customer\'s chore on hover, opens it on press, and drops it with the shift', async () => {
  const keeper = { key: 'keeper', x: 5, y: 0, z: 5 }, patron = { key: 'guest', x: 0, y: 0, z: 0 };
  const renderer = fakeRenderer();
  let state, version = 0, nowS = 100, active = true;
  const service = createTavernServiceHost({
    entity: () => ({ goldPieces: 0 }), online: () => true, where: () => '17:42', buildingKey: () => 42,
    people: () => [keeper, patron], npcId: (pn) => pn.key, name: (pn) => pn.key, patron: (pn) => pn === patron,
    now: () => nowS, plaque: () => true, say: () => {}, choose: () => {}, saveSoon: () => {},
    renderer, getTexture: async () => texture, uploadRecordFrame: () => {}, collider: () => room(),
    act: async (body, apply) => {
      const result = body.op === 'start' ? { state: createTavernShift({ ...body, member: true, rank: 3, seed: 1, nowS }) } : stepTavernShift(state, body, nowS);
      assert.ok(!result.error, result.error); state = result.state;
      const reply = { ok: true, data: { ...result, version: ++version } }; apply(reply); return reply;
    },
  });
  service.innRows(keeper)[0].action(); await flush();
  while (!state.orders[state.index].chore) {
    const recipe = TAVERN_RECIPES.find((r) => r.id === tavernOrder(state).recipe);
    for (const k of TAVERN_INGREDIENTS) for (let n = 0; n < recipe[k]; n++) { service.activate(keeper, `tservice:${k}`); await flush(); }
    nowS += 21; service.activate(patron, 'tservice:serve'); await flush();
  }
  const recipe = TAVERN_RECIPES.find((r) => r.id === tavernOrder(state).recipe);
  for (const k of TAVERN_INGREDIENTS) for (let n = 0; n < recipe[k]; n++) { service.activate(keeper, `tservice:${k}`); await flush(); }
  nowS += 21; service.activate(patron, 'tservice:serve'); await flush();
  service.frame(active, false); await flush();
  const [target] = service.targets();
  assert.match(target.key, /^tchore:chore\d$/);
  assert.ok(service.batches().length > 0);
  const hover = service.hoverName(target.key);
  assert.match(hover.title, /Spilled drink|Empties to clear/); assert.match(hover.subs[0], /guest/);
  assert.equal(service.activateChore(target.key), true, 'a chore key belongs to the chores, even where no window can open');
  assert.equal(service.activateChore('tchore:nothing'), false);
  active = false; service.frame(active, false);
  assert.equal(renderer.live.size, 0, 'leaving the tavern takes the chores\' flats with it');
  service.dispose();
});
