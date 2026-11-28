import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createQuestlineOffers } from '../src/systems/quest/questlineOffers.js';
import { createLineRunner, retireDisabledLineQuests } from '../src/systems/questlines/qlLineRunner.js';
import { GUILD_GROUPS } from '../src/formats/factionFile.js';
import { setPref } from '../src/ui/uiPrefs.js';

test('disabled event questlines cannot be offered or resumed', () => {
  setPref('questlines', true);
  const parsed = [];
  const scheduled = [];
  const machine = {
    quests: new Map(),
    deps: { getQuestSourceLines: (name) => name },
    parseQuestForLists(name) {
      parsed.push(name);
      return {
        resources: new Map([['letter', { isItem: true, itemName: 'letter', usedMessageID: 1 }]]),
        getMessage: () => ({ getTextTokens: () => ['Offer'] }),
      };
    },
    scheduleQuestByName(name) { scheduled.push(name); },
  };
  const ctx = { online: () => true, level: () => 20, nowSeconds: () => 7200 };
  const runner = createLineRunner({ machine, ctx, service: {} });
  const offers = createQuestlineOffers({ machine, questlines: { runner, takeLine: runner.takeLine }, rowsOf: (tokens) => tokens, ctx });

  assert.equal(offers.atTavern({ nameSeed: 1 }), null);
  assert.equal(offers.atGuild(GUILD_GROUPS.HolyOrder), null);
  assert.equal(offers.atGuild(GUILD_GROUPS.MagesGuild), null);
  for (const id of ['burningDoors', 'weirRoad', 'hourThatWasNot', 'skyKetch', 'oldCoil', 'thirteenthFrostfall']) {
    assert.equal(runner.onOffer(id), false, id);
    assert.equal(runner.offerQuest(id), null, id);
    assert.equal(runner.takeLine(id).reason, 'closed', id);
  }
  assert.deepEqual(parsed, []);
  assert.ok(offers.board().cards.some(({ id }) => id === 'introCrafts'));

  runner.restore({ skyKetch: { taken: true, step: 1 } });
  runner.look();
  assert.equal(runner.snapshot().skyKetch.step, 1);
  assert.ok(!runner.rows().some(({ id }) => id === 'skyKetch'));
  assert.deepEqual(scheduled, []);
});

test('loading a save retires unfinished disabled quests and their queued letters', () => {
  const active = { uid: 1, questName: 'QLSK01' };
  const setAside = { uid: 2, questName: 'QLOC02', shelvedAt: 100 };
  const finished = { uid: 3, questName: 'QLHR01', questComplete: true };
  const temple = { uid: 4, questName: 'c0b00y00' };
  const queued = { uid: 5, questName: 'qlsk02' };
  const board = { uid: 6, questName: 'QLIP01' };
  const removed = [];
  const machine = {
    quests: new Map([active, setAside, finished, temple].map((q) => [q.uid, q])),
    questsToInvoke: [queued, board],
    removeQuest(q) { removed.push(q); this.quests.delete(q.uid); },
  };
  retireDisabledLineQuests(machine);
  retireDisabledLineQuests(machine);
  assert.deepEqual(removed, [queued, active, setAside]);
  assert.deepEqual([...machine.quests.values()], [finished, temple]);
  assert.deepEqual(machine.questsToInvoke, [board]);
});
