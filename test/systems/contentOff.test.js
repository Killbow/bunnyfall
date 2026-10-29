// BUNNYFALL PHASE 2: the switched-off content stays off - each piece's own rule asked, as the game asks it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENT, contentOn } from '../../src/systems/contentOff.js';
import { isGateDay } from '../../src/net/gate/gateLaw.js';
import { isSerpentDay } from '../../src/net/serpent/serpentLaw.js';
import { ketchVoyageAt } from '../../src/net/ketch/ketchLaw.js';
import { sdDue } from '../../src/net/superDungeon/sdLaw.js';
import { festivalAt } from '../../src/net/festivalLaw.js';
import { usesVirtueLeveling, LEVELING_VIRTUE } from '../../src/systems/oblivionLeveling.js';
import { spineOwed } from '../../src/systems/quest/mainSpine.js';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 9, 31, 12);   // inside the Witches' Festival's own dates

test('Phase 2: everything on the list is off', () => {
  for (const [k, v] of Object.entries(CONTENT)) assert.equal(v, false, k);
  assert.equal(contentOn('skyKetch'), false);
});

test('Phase 2: no gate day and no serpent day, on any day', () => {
  for (let d = 0; d < 400; d++) { assert.equal(isGateDay(d), false); assert.equal(isSerpentDay(d), false); }
});

test('Phase 2: the Sky-Ketch is always away, its next voyage centuries out', () => {
  for (const t of [NOW, NOW + 7 * DAY, NOW + 365 * DAY]) {
    const v = ketchVoyageAt(t);
    assert.equal(v.phase, 'away');
    assert.ok(v.sightAt > t + 100 * 365 * DAY);
  }
});

test('Phase 2: no new Abyss Hollow rises; the director just looks again later', () => {
  assert.equal(sdDue(null, NOW).act, null);
  assert.ok(sdDue(null, NOW).at > NOW);
});

test('Phase 2: the Witches\' Festival is never open', () => {
  assert.equal(festivalAt(NOW), null);
});

test('Phase 2: a character who chose Oblivion leveling levels the classic way', () => {
  assert.equal(usesVirtueLeveling({ levelingSystem: LEVELING_VIRTUE }), false);
});

test('Phase 2: the main quest backbone is never owed', () => {
  assert.equal(spineOwed({ quests: new Map(), questsToInvoke: [], storyStarted: new Set(), spine: { opened: true, ran: false } }), false);
});
