import assert from 'node:assert/strict';
import test from 'node:test';
import { QuestMachine } from '../src/systems/quest/machine.js';

const envelope = (uid, name, actionType) => ({
  uid, questName: name, displayName: `Display ${name}`, questComplete: false, questSuccess: false, factionId: 0,
  questStartTime: 0, questTombstoned: false, questTombstoneTime: 0, activeLogMessages: [], messages: [], resources: [],
  questors: [], oneTimeDisplayedMessages: [],
  tasks: [{
    symbol: { original: '_t_', name: '_t_' }, targetSymbol: null, triggered: false, prevTriggered: false, type: 0,
    dropped: false, globalVarName: null, globalVarLink: -1, hasTriggerConditions: false,
    actions: actionType ? [{ type: actionType, isComplete: false, isTriggerCondition: false, isAlwaysOnTriggerCondition: false, debugSource: '', actionSpecific: {} }] : [],
  }],
});

test('a quest that will not restore is kept as saved, written back and tried again, and the rest of the save loads', () => {
  const hud = [];
  const machine = new QuestMachine({ addHUDText: (t) => hud.push(t) });
  const good = envelope(1, 'GOODQ', null);
  const bad = envelope(2, 'BADQ', 'NoSuchActionType');
  const warn = console.warn;
  console.warn = () => {};
  try { machine.restoreSaveData({ siteLinks: [], quests: [bad, good] }); } finally { console.warn = warn; }
  assert.deepEqual([...machine.quests.keys()], [1], 'the good quest loads');
  assert.equal(machine.unrestored.length, 1);
  assert.match(hud.join(' '), /BADQ/);
  assert.doesNotMatch(hud.join(' '), /mod removed/);

  const saved = JSON.parse(JSON.stringify(machine.getSaveData()));
  assert.equal(saved.quests.length, 1);
  assert.equal(saved.unrestored.length, 1, 'the set-aside quest rides the next save');
  assert.equal(saved.unrestored[0].questName, 'BADQ');

  // the cause fixed (the action type is known again): the next load takes it back with no progress lost
  const again = new QuestMachine({});
  again.actionTemplates.push({ typeName: 'NoSuchActionType', constructor: class { restoreActionSaveData() {} } });
  again.restoreSaveData(saved);
  assert.deepEqual([...again.quests.keys()].sort(), [1, 2]);
  assert.equal(again.unrestored.length, 0);
});
