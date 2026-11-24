import assert from 'node:assert/strict';
import test from 'node:test';
import { ABILITIES } from '../src/combat/abilities/registry.js';
import { showAbilityArt } from '../src/combat/abilities/abilityArt.js';
import { SpellImpactFx } from '../src/render/spellImpactFx.js';
import { poseStrikeRect, strikePose } from '../src/combat/abilities/strikeMotion.js';

test('every registered ability has renderable art with finite geometry and a bounded lifetime', () => {
  for (const ability of ABILITIES) {
    const fx = new SpellImpactFx({ rng: () => .4 });
    const door = { fx: fx.technique.bind(fx) };
    const phases = ability.category === 'utility' ? ['self'] : ['wind-up','stroke','impact'];
    for (const phase of phases) {
      showAbilityArt(door, ability.id, phase, [2,1,-3], { yaw:.7, len:2 });
      fx.step(.1);
      assert.ok(fx.build() > 0, ability.id + ' ' + phase);
      assert.ok(fx.buf.every(Number.isFinite), ability.id);
      for (let i=0; i<60; i++) fx.step(1/60);
      assert.equal(fx.live, false, ability.id);
    }
  }
});

test('rapid chains clear old trails and leave room for a new hit', () => {
  const fx = new SpellImpactFx({ rng: () => .4 });
  const door = { fx: fx.technique.bind(fx) };
  for (const ability of ABILITIES) {
    showAbilityArt(door, ability.id, 'wind-up', [0,1,0]);
    showAbilityArt(door, ability.id, 'stroke', [0,1,0]);
    showAbilityArt(door, ability.id, 'impact', [0,1,2]);
    for (let frame=0; frame<6; frame++) fx.step(.015);
    assert.ok(fx.build() > 0, ability.id);
    assert.ok(fx.parts.length < 250, ability.id);
  }
  for (let i=0; i<24; i++) fx.step(1/60);
  assert.equal(fx.live, false);
});

test('strike poses accent contact, mirror the striking hand and settle at recovery', () => {
  const rect = { x:10, y:10, w:40, h:60 };
  const kinds = ['thrust','sweep','chop','jab','lash'];
  const contacts = new Set();
  for (const kind of kinds) {
    const motion = { kind, start:0, hit:.3, duration:.7, side:1 };
    const contact = strikePose(motion,.3,1);
    contacts.add(JSON.stringify(contact));
    assert.notDeepEqual(poseStrikeRect(rect,contact,100),poseStrikeRect(rect,contact,100,true));
    assert.equal(strikePose(motion,.71,1),null);
    assert.equal(strikePose(motion,.3,0),null);
  }
  assert.equal(contacts.size,kinds.length);
});
