import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createQuestlineOffers } from '../src/systems/quest/questlineOffers.js';
import { createLineRunner } from '../src/systems/questlines/qlLineRunner.js';
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
