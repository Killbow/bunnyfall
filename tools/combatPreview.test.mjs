import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestCharacter, testEntryById, testRoomOnlineRefused, testStartsOutdoors } from '../src/characters/testRoom.js';
import { LEVEL_CAP } from '../src/characters/levelCap.js';
import { PLAYABLE_RACE_TEMPLATES } from '../src/characters/races.js';
import { SKILL_HARD_CAP } from '../src/characters/skills.js';
import { ABILITIES } from '../src/combat/abilities/registry.js';
import { hotbarEntry, switchHotbarPreset } from '../src/items/quickslots.js';
import { DUNGEON_EXIT_OFFSET } from '../src/player/enterExit.js';
import { DOOR_TYPE } from '../src/world/meshReader.js';
import { createWorldProbes } from '../src/world/worldProbes.js';

test('combat preview seeds every race at each power and clears abilities granted during character creation', async (t) => {
  const previous = globalThis.location;
  globalThis.location = { search: '?test=combat-preview' };
  t.after(() => {
    if (previous) globalThis.location = previous;
    else delete globalThis.location;
  });
  const bytes = Buffer.alloc(74);
  bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 16);
  bytes.writeUInt16LE(18, 52);
  bytes.writeUInt32LE(65536, 54);
  for (let offset = 58; offset < bytes.length; offset += 2) bytes.writeUInt16LE(50, offset);
  const fetchBytes = async (name) => name === 'CLASS16.CFG' ? bytes : Buffer.from('');

  for (const [power, level, stat, skill] of [['1', 1, 1, 1], ['50', LEVEL_CAP, 50, 50], ['max', LEVEL_CAP, 100, SKILL_HARD_CAP]]) {
    for (const race of PLAYABLE_RACE_TEMPLATES) {
      const params = new URLSearchParams({ testrace: race.key, testpower: power });
      const { preset } = testEntryById('combat-preview', params);
      const entity = { isPlayer: true };
      await applyTestCharacter(entity, preset, { fetchBytes, spellsByIndex: new Map() });
      assert.equal(entity.race, race.key);
      assert.equal(entity.raceId, race.id);
      assert.equal(entity.level, level);
      assert.ok(Object.values(entity.stats).every((value) => value === stat));
      assert.ok(entity.skills.every((value) => value === skill));
      assert.equal(entity.health, entity.maxHealth);

      const racial = ABILITIES.find((ability) => ability.race === race.key);
      const learned = entity.combatAbilities.learned.map((id) => ABILITIES.find((ability) => ability.id === id));
      assert.deepEqual(learned.filter((ability) => ability.race), [racial]);
      assert.ok(learned.every((ability) => ability.rank <= skill));
      assert.equal(hotbarEntry(0)?.rank, skill >= 25 ? 25 : undefined);
      switchHotbarPreset(2);
      assert.equal(hotbarEntry(0)?.id, racial.id);
      switchHotbarPreset(0);
    }
  }
});

test('combat preview accepts old links, defaults invalid choices, and stays offline', () => {
  const params = new URLSearchParams('test=combat-preview&testrace=unknown&testpower=100&online');
  assert.equal(testEntryById('combat-preview', params).preset.race, 'Nord');
  assert.equal(testEntryById('combat-preview', params).preset.power, 'max');
  assert.equal(testStartsOutdoors('combat-preview'), true);
  assert.equal(testStartsOutdoors('nord-warrior'), false);
  assert.equal(testRoomOnlineRefused(params), true);
});

test('combat preview lands beyond the door in the start pixel and faces out', () => {
  const door = {
    doorType: DOOR_TYPE.DUNGEON_ENTRANCE,
    matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 2, 20, 1],
    centre: { x: 0, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 },
  };
  const startPixel = { x: 109, y: 158 };
  const buildingDoors = [{ pixelKey: '108,158', door }];
  const cam = {};
  const player = {
    spawn(...pos) { this.pos = pos; },
    eyeAt() { return this.pos; },
  };
  const { spawnOutsideHold } = createWorldProbes({
    params: new URLSearchParams('test=combat-preview'),
    startPixel, buildingDoors, cam, player,
    state: { pixelTranslation: () => [30, 0, 40] },
    collider: { heightAt: () => 5 },
  });
  assert.equal(spawnOutsideHold(), false);
  buildingDoors.push({ pixelKey: '109,158', door });
  assert.equal(spawnOutsideHold(), true);
  assert.deepEqual(player.pos, [40 + DUNGEON_EXIT_OFFSET, 5.15, 60]);
  assert.equal(cam.yaw, Math.PI / 2);
  assert.equal(cam.pitch, 0);
});
