import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTavernServiceHost } from '../src/scenes/tavernServiceHost.js';
import { createTavernShift, stepTavernShift, TAVERN_RECIPES, tavernOrder, TAVERN_INGREDIENTS } from '../src/net/tavernServiceLaw.js';

test('NPC plaque actions complete service and apply a server payment before the next checkpoint', async () => {
  const keeper = { key: 'keeper' }, patron = { key: 'guest' };
  const people = [keeper, patron], entity = { goldPieces: 0 }, said = [];
  let state, version = 0, nowS = 100, checkpointGold = null;
  const service = createTavernServiceHost({
    entity: () => entity, online: () => true, where: () => '17:42', buildingKey: () => 42,
    people: () => people, npcId: (pn) => pn.key, name: (pn) => pn.key, patron: (pn) => pn === patron,
    now: () => nowS, plaque: () => true, say: (s) => said.push(s), choose: () => {}, saveSoon: () => {},
    act: async (body, apply) => {
      let result;
      if (body.op === 'start') result = { state: createTavernShift({ ...body, member: true, rank: 3, seed: 1, nowS }) };
      else result = stepTavernShift(state, body, nowS);
      assert.ok(!result.error, result.error); state = result.state;
      const reply = { ok: true, data: { ...result, version: ++version } };
      apply(reply); // the actual world host's realmGoldAct calls apply BEFORE its final checkpoint
      if (result.gold) checkpointGold = entity.goldPieces;
      return reply;
    },
  });
  const flush = () => new Promise((r) => setImmediate(r));
  service.innRows(keeper)[0].action(); await flush();
  const recipe = TAVERN_RECIPES.find((r) => r.id === tavernOrder(state).recipe);
  for (const k of TAVERN_INGREDIENTS) for (let n = 0; n < recipe[k]; n++) {
    assert.ok(service.hoverName('person:0').actions.some((a) => a.id === `tservice:${k}`));
    assert.equal(service.activate(keeper, `tservice:${k}`), true); await flush();
  }
  service.activate(keeper, 'tservice:carry'); await flush(); nowS += 21;
  service.activate(patron, 'tservice:serve'); await flush();
  service.activate(patron, 'tservice:collect'); await flush();
  service.activate(keeper, 'tservice:return'); await flush();
  assert.equal(entity.goldPieces, 24); assert.equal(checkpointGold, 24);
  assert.equal(state.index, 1); assert.ok(said.length);
  assert.equal(service.activate(keeper, 'tservice:talk'), false);
  service.dispose();
});
