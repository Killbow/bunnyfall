// MAIN-SPINE (2026-10-26, Discord #feature-feedback "Main quest borked": "Level 8 and still no letter from Morgiah ...
// Other people having issues too"; bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md): the main quest's backbone
// (S0000999, which sends Morgiah's letter at level 3) is started again when its one start failed to parse - the world's
// faction records not yet loaded on the page an online birth reloads into - and a game that already lost it gets it back.
// The real quest bridge over the vendored DFU quests; the world's faction records a stand-in (every royal an individual
// at regard 0, as FACTION.TXT has Morgiah), withheld for the ticks a cold page has none. Mutants:
// tools/mutants/fb1026b_mainspine.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQuestBridge } from '../../../src/scenes/quest/questBridge.js';
import { loadQuestTables } from '../../../src/systems/quest/tables.js';
import { resetUid } from '../../../src/systems/quest/quest.js';
import { PLAYED_STEP_MAX_SECONDS } from '../../../src/systems/quest/clock.js';
import * as A from '../../../src/systems/quest/actions.js';
import { SPINE, SPINE_CHECK_TICKS, spineOwed } from '../../../src/systems/quest/mainSpine.js';

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'vendor', 'dfu-quests');
const sources = {};
for (const f of readdirSync(join(VENDOR, 'Tables'))) if (f.endsWith('.txt')) sources[f.replace('.txt', '')] = readFileSync(join(VENDOR, 'Tables', f), 'utf8').replace(/^﻿/, '');
loadQuestTables(sources);
// the stand-in world has no tavern for Brisienna: her `create npc at` / `place npc` stand done, for _BRISIEN alone
for (const C of [A.PlaceNpc, A.CreateNpcAt, A.CreateNpc]) {
  const o = C.prototype.update;
  C.prototype.update = function (c) { if (this.parentQuest?.questName === '_BRISIEN') { this.setComplete(); return; } return o.call(this, c); };
}

/** A page: the bridge as world.js wires it online, the faction records `S.ready` or none. */
function page(S) {
  const b = createQuestBridge({
    data: {
      readListTable: (n) => (existsSync(join(VENDOR, 'Tables', `${n}.txt`)) ? readFileSync(join(VENDOR, 'Tables', `${n}.txt`), 'utf8') : ''),
      getQuestSourceLines: (n) => { const f = join(VENDOR, 'Quests', `${n}.txt`); return existsSync(f) ? readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/) : null; },
    },
    world: { getFactionData: (id) => (S.ready ? { id, type: 4, rep: 0, name: 'Royal', parent: 0, flags: 0 } : null) },
    classicSeconds: () => S.now, skySeconds: () => S.sky, worldSeconds: () => S.sky, raisedSeconds: () => 0,
    questClockStepMax: () => PLAYED_STEP_MAX_SECONDS, sharedClock: () => true, ownMinutes: () => S.now / 60,
    playerEntity: { get level() { return S.level; }, name: 'Tester', gender: 'male' },
    isPlayerInTown: () => true,
    giveItemToPlayer: (it) => S.given.push([...S.b.machine.quests.values()].find((q) => q.uid === it?.questUID)?.questName ?? '?'),
    addHUDText: () => {},
  }, { label: 'mainspine' });
  return b;
}
const fresh = () => { const S = { now: 0, sky: 8 * 3600, level: 1, ready: true, given: [], b: null }; S.b = page(S); return S; };
const tick = (S, n = 1) => { for (let i = 0; i < n; i++) { S.now += 6; S.sky += 6; S.b.tick(0.11); } };
const has = (S, name) => [...S.b.machine.quests.values()].some((q) => q.questName === name);
/** The game's start: _BRISIEN begun (headless - the stand-in world has no maps for her Places), its first tick run. */
function begin(S) {
  const l = S.b.machine.deps.getQuestSourceLines('_BRISIEN');
  S.b.machine.startQuestImmediate(S.b.machine.parseQuestForLists(l, 0, { headless: true }));
  tick(S);   // tick 1: the start-up block (online the 1025 box holds the next tick, and a realm birth saves and reloads here)
}
/** Save, and load on a fresh page whose faction records are `ready`. */
function reload(S, ready) {
  const snap = JSON.parse(JSON.stringify(S.b.snapshot()));
  resetUid();
  S.ready = ready;
  S.b = page(S);
  S.b.restore(snap);
}
const silently = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
/** Play until Morgiah's letter (the backbone's) is given, or `max` ticks. */
const toLetter = (S, max = 20000) => { for (let i = 0; i < max && !S.given.includes(SPINE); i++) tick(S); return S.given.includes(SPINE); };

test('MAIN-SPINE THE REPORT: the page an online birth reloads into parses the backbone before its faction records land - the backbone is started again once the records are there, and Morgiah\'s letter comes at level 3, Brisienna met first or not (mutants: the check never run; the opener\'s start unread)', () => {
  for (const meetFirst of [true, false]) {
    const S = fresh();
    begin(S);
    reload(S, false);
    silently(() => tick(S, 3 * SPINE_CHECK_TICKS));   // the second tick's `start quest 999 999` fails, and every check's start while the records are away
    assert.equal(has(S, SPINE), false, 'the parse failed with no faction records');
    S.ready = true;
    silently(() => tick(S, SPINE_CHECK_TICKS + 1));
    assert.equal(has(S, SPINE), true, 'started again: the backbone stands');
    if (meetFirst) [...S.b.machine.quests.values()].find((q) => q.questName === '_BRISIEN').startTask({ name: 'meetladyb' });
    S.level = 3;
    assert.equal(toLetter(S), true, `Morgiah's letter (${meetFirst ? 'Brisienna met first' : 'level 3 first'})`);
  }
});

test('MAIN-SPINE A GAME THAT LOST IT: a save whose backbone was never started (the retry\'s page gone) gets it back once it is owed - the opener\'s start done, no story begun - and no game is handed a second (mutants: the lost backbone unrepaired; owed with a story begun)', () => {
  const S = fresh();
  begin(S);
  reload(S, false);
  silently(() => tick(S, 2));   // tick 2: the start fails ...
  assert.equal(has(S, SPINE), false);
  reload(S, true);   // ... and the page is gone with its retry: the save holds no backbone
  assert.equal(spineOwed(S.b.machine), true, 'the opener ran its start, and nothing stands');
  silently(() => tick(S, SPINE_CHECK_TICKS + 1));
  assert.equal(has(S, SPINE), true, 'started again');
  assert.equal(spineOwed(S.b.machine), false, 'one standing: owed no more');
  S.level = 3;
  assert.equal(toLetter(S), true, 'and Morgiah\'s letter comes');
  // a game with a step of the story begun ran its backbone once - it is never started over (its courts' quests would be)
  const T = fresh();
  begin(T);
  reload(T, false); silently(() => tick(T, 2)); reload(T, true);
  T.b.machine.storyStarted.add('S0000004');
  assert.equal(spineOwed(T.b.machine), false);
  // nor a legacy save, whose story is not known
  T.b.machine.storyStarted.clear(); T.b.machine.storyLegacy = true;
  assert.equal(spineOwed(T.b.machine), false);
  // and a game that never began the main quest owes nothing; one whose backbone is scheduled (a tick from starting) none
  assert.equal(spineOwed(fresh().b.machine), false);
  const U = fresh();
  begin(U);
  tick(U);   // tick 2: `start quest 999 999` parses - the backbone waits in the invoke list for the next tick
  assert.deepEqual(U.b.machine.questsToInvoke.map((q) => q.questName), [SPINE]);
  assert.equal(spineOwed(U.b.machine), false, 'scheduled is standing');
});
