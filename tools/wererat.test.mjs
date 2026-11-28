import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WERERAT, rollWererat } from '../src/characters/wererat.js';
import { collectDungeonEnemies } from '../src/characters/dungeonEnemies.js';
import { EnemyCaster } from '../src/characters/enemyCasting.js';
import { callWereratRats } from '../src/characters/wereratSummon.js';
import { validFoeRecord, validSharedFoe } from '../src/net/wire.js';

test('dungeon Rat slots get a stable rare Wererat roll', () => {
  const rat = { record: 16, factionOrMobileId: 0, x: 1, y: 0, z: 1, rawY: 0, flags: 0 };
  const block = { markers: [rat, { ...rat, actionByte: 99 }, { ...rat, factionOrMobileId: 3 }],
    originX: 0, originZ: 0, waterLevel: 10000 };
  let bosses = 0;
  for (let locationId = 1; locationId <= 1000; locationId++) {
    const options = { dungeonType: 0, locationId, alternate: true };
    const enemies = collectDungeonEnemies([block], options);
    assert.equal(enemies[1].mobileType, 0);
    assert.equal(enemies[2].mobileType, 3);
    assert.equal(enemies[0].mobileType, collectDungeonEnemies([block], options)[0].mobileType);
    if (enemies[0].mobileType === WERERAT) {
      assert.equal(enemies[0].gender, 'female');
      bosses++;
    }
  }
  assert.ok(bosses > 10 && bosses < 80, `expected a rare replacement, saw ${bosses}`);
  assert.equal(rollWererat(0, () => 0.0399), WERERAT);
  assert.equal(rollWererat(0, () => 0.04), 0);
  assert.equal(rollWererat(3, () => assert.fail('non-Rats should spend no roll')), 3);
});

test('Wererat has a ranged cast window in a short room', () => {
  const fireball = { rangeType: 4, effects: [{ type: 4, subType: 0 }] };
  const entity = { mobileType: WERERAT, spells: [fireball], magicka: 130 };
  const caster = new EnemyCaster(entity, () => 0.5);
  const ai = { _dist: 5, inSight: true, detected: true, giveUpTimer: 10, feet: [0, 0, 0], yaw: 0 };
  const attack = { machine: { state: 'Idle' } };
  const target = [0, 0, 5];
  assert.equal(caster.update(1, ai, attack, target, {}), null);
  assert.equal(caster.update(0.5, ai, attack, target, {})?.spell, fireball);
  assert.equal(caster.update(1, ai, attack, target, {}), null);
});

test('the half-health call stands ten lootless Rats once and survives projection', async () => {
  const rats = [];
  const foe = { mobileType: WERERAT, ai: { detected: true, isHostile: true, feet: [0, 0, 0], yaw: 0 },
    entity: { health: 26, maxHealth: 50 } };
  const options = {
    collider: {
      sphereOverlaps: () => false,
      raycastHit: (at, direction) => direction[1] === -1 ? { dist: at[1], normal: [0, 1, 0] } : { dist: Infinity },
    },
    targetFeet: [0, 0, 10],
    spawn: async (type, feet) => {
      const rat = { type, feet, entity: { items: ['loot'] }, ai: { makeHostileToPlayer() {} } };
      rats.push(rat);
      return rat;
    },
  };
  assert.equal(callWereratRats(foe, options), false);
  foe.entity.health = 25;
  assert.equal(callWereratRats(foe, options), true);
  assert.equal(callWereratRats(foe, options), false);
  await Promise.resolve();
  assert.equal(rats.length, 10);
  assert.ok(rats.every(rat => rat.type === 0 && rat.entity.summoned && rat.entity.items.length === 0));
  assert.equal(validFoeRecord({ i: 1, t: WERERAT, wrc: 1 }).wrc, 1);
  assert.equal(validFoeRecord({ i: 2, t: 0, sm: 1 }).sm, 1);
  assert.equal(validSharedFoe({ mobileType: WERERAT, wereratCalled: true }).wereratCalled, true);
});
