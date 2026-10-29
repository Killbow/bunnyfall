// BUNNYFALL SAVE-ON-EXIT: offline, leaving writes the AutoSave slot only, never while dead, and never throws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXIT_SAVE_NAME, offlineExitSaveNames, offlineExitSave } from '../../../src/systems/save/exitSave.js';
import { QUICK_SAVE_NAME } from '../../../src/systems/save/saveSlots.js';

test('exit save: a living character writes AutoSave, never QuickSave', () => {
  assert.equal(EXIT_SAVE_NAME, 'AutoSave');
  assert.notEqual(EXIT_SAVE_NAME, QUICK_SAVE_NAME);
  assert.deepEqual(offlineExitSaveNames({ health: 10 }), ['AutoSave']);
});

test('exit save: nothing while dead or on a death screen', () => {
  assert.deepEqual(offlineExitSaveNames({ health: 0 }), []);
  assert.deepEqual(offlineExitSaveNames(null), []);
  assert.deepEqual(offlineExitSaveNames({ health: 10 }, { deathUp: true }), []);
});

test('exit save: offlineExitSave writes quietly, and a failing save is logged, not thrown', () => {
  const calls = [];
  offlineExitSave({ health: 5 }, false, (name, opts) => calls.push([name, opts]));
  assert.deepEqual(calls, [['AutoSave', { quiet: true }]]);
  offlineExitSave({ health: 5 }, true, () => calls.push('no'));
  assert.equal(calls.length, 1, 'death screen: no write');
  const err = console.error; console.error = () => {};
  try { assert.doesNotThrow(() => offlineExitSave({ health: 5 }, false, () => { throw new Error('disk full'); })); }
  finally { console.error = err; }
});
