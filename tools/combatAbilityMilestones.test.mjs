import assert from 'node:assert/strict';
import test from 'node:test';
import { SKILLS } from '../src/characters/skills.js';
import { ABILITIES } from '../src/combat/abilities/registry.js';
import { PlayerWeapon } from '../src/combat/playerWeapon.js';
import { abilityCooldown, claimAbilityEvents, requestHotbarAbility, stepAbilityRig } from '../src/combat/abilities/rig.js';
import {
  abilityPlayable, DAGGER_MILESTONES, milestoneDelivery, PREVIEW_THRUST, PREVIEW_JAB, PREVIEW_POWER_DRAW, PREVIEW_DEADEYE, PREVIEW_SIEGE_BOLT,
  PREVIEW_KEEP_AWAY, PREVIEW_BARRAGE, PREVIEW_ANCHORED_SIGHT, PREVIEW_ANCHOR_FIRE, PREVIEW_SHOULDER_BREAK,
  PREVIEW_PIERCING_LINE, PREVIEW_EAGLES_RHYTHM, PREVIEW_ARMOR_NEEDLE, PREVIEW_LINEBREAKER, PREVIEW_FLOW_STATE,
  PREVIEW_KINGS_MEASURE, PREVIEW_SKYFALL, PREVIEW_FINAL_VERDICT, PREVIEW_SIEGE_OF_HEAVEN, PREVIEW_HUNDRED_FIST,
} from '../src/combat/abilities/milestones.js';
import { abilityArrowAllowed, abilityFlightStep, abilityMayStrike, applyEdgeRitual, previewDamage, stepWeaponOpenings, weaponOpening } from '../src/combat/abilities/previewHits.js';
import { GRAVITY } from '../src/player/motor.js';
import { ArrowFlight, playerArrowHitFoe, techniquePierces } from '../src/combat/arrowFlight.js';
import { ballistaBurst } from '../src/combat/ballista/ballistaFlight.js';
import { abilityLoad, restoreAbilityProgress } from '../src/combat/abilities/progress.js';
import { windupDoor } from '../src/combat/hostCombat.js';
import { getPref, setPref } from '../src/ui/uiPrefs.js';
import { calculateSuccessfulHit, racialModifiers } from '../src/combat/formulas.js';
import { applySpell, breakNormalPowerConcealment, hasActiveEffect, tickActiveEffects } from '../src/magic/effects.js';
import { playerDoor, setPlayerDoor } from '../src/player/playerDoor.js';
import { createPlayerMagic } from '../src/magic/hostMagic.js';
import { liveStat } from '../src/characters/statMods.js';
import { pcaaoAttackDamage, pcaaoModules } from '../src/combat/pcaao.js';
import { createWeapon } from '../src/combat/enemyEquipment.js';
import { capstonePower, skyfallPattern } from '../src/combat/abilities/capstones.js';
import { blowSchedule } from '../src/characters/weaponStates.js';
import { BLADE_WEAVE, THOUSAND_CUTS, HUNTING_LINE, PREDATORS_CROSSING, KNOCKOUT_CHAIN, TITANS_HANDS, combinationDelivery } from '../src/combat/abilities/combinations.js';

function offline(t) {
  const location = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => {
    if (location === undefined) delete globalThis.location;
    else globalThis.location = location;
  });
}

function fighter(template, skill, rank = 25) {
  const entity = { isPlayer: true, skills: [], items: [], health: 120, fatigue: 3000,
    stats: { strength: 50, endurance: 50, agility: 50, luck: 50, speed: 50, willpower: 50 } };
  entity.skills[skill] = rank;
  const pw = new PlayerWeapon({});
  pw.weapon = template == null ? null : createWeapon(template, 3, () => 0);
  pw.sheathed = false;
  pw.update(0);
  const shots = [], swings = [];
  const tc = {
    entity, pw, rig: {}, ready: true,
    cam: { pos: [0, 1.5, 0], feet: [0, 0, 0], pitch: 0, yaw: 0 },
    startSwing(strike, offhand) {
      const began = pw.techniqueStrike(strike, offhand);
      if (began) swings.push(strike);
      return began;
    },
    door: {
      fireArrow(from, direction, options) { shots.push({ from, direction, ...options }); },
      drainFatigue(amount) { entity.fatigue -= amount; },
    },
  };
  const frame = (dt = 0.05) => {
    stepAbilityRig(dt, tc);
    return claimAbilityEvents(pw.update(dt), tc);
  };
  return { entity, pw, tc, shots, swings, frame };
}

test('every weapon style has four available milestones', () => {
  const roster = ABILITIES.filter(ability => ability.category === 'weapon');
  assert.equal(roster.length, 92);
  assert.equal(new Set(roster.map(ability => ability.templates[0])).size, 23);
  assert.ok(roster.every(ability => abilityPlayable(ability.id)));
  assert.ok([PREVIEW_THRUST, PREVIEW_JAB, PREVIEW_POWER_DRAW, PREVIEW_DEADEYE, PREVIEW_SIEGE_BOLT,
    PREVIEW_KEEP_AWAY, PREVIEW_BARRAGE, PREVIEW_ANCHORED_SIGHT, PREVIEW_ANCHOR_FIRE, PREVIEW_SHOULDER_BREAK,
    PREVIEW_PIERCING_LINE, PREVIEW_EAGLES_RHYTHM, PREVIEW_ARMOR_NEEDLE, PREVIEW_LINEBREAKER, PREVIEW_FLOW_STATE,
    PREVIEW_KINGS_MEASURE, PREVIEW_SKYFALL, PREVIEW_FINAL_VERDICT, PREVIEW_SIEGE_OF_HEAVEN, PREVIEW_HUNDRED_FIST].every(abilityPlayable));
  assert.ok(DAGGER_MILESTONES.every(abilityPlayable));
  assert.ok(abilityPlayable('weapon.tanto.hundredfold-blessing'));
  assert.equal(milestoneDelivery(PREVIEW_JAB).beats, 3);
});

test('Jab Chain uses three ordinary animation hit frames and keeps the first target', (t) => {
  offline(t);
  const { entity, pw, swings, frame } = fighter(null, SKILLS.HandToHand);
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_JAB).ok);
  let beats = 0;
  let chain;
  const primary = { entity: {} };
  for (let i = 0; i < 120; i++) {
    if (!frame().includes('hit')) continue;
    const blow = pw.techniqueBlow;
    chain ??= blow.chain;
    assert.equal(blow.chain, chain);
    if (beats > 0) assert.equal(blow.chain.target, primary.entity);
    else blow.chain.target = primary.entity;
    assert.equal(previewDamage(blow, 100, primary), 66);
    beats++;
  }
  assert.equal(beats, 3);
  assert.deepEqual(swings, ['StrikeRight', 'StrikeLeft', 'StrikeDown']);
});

test('all three ranged actions take the normal arrow out of inventory and own the bow hit', (t) => {
  offline(t);
  for (const [template, id, pierce, burstCap] of [
    [130, PREVIEW_POWER_DRAW, 2, 0],
    [563, PREVIEW_DEADEYE, 1, 0],
    [564, PREVIEW_SIEGE_BOLT, 1, 3],
  ]) {
    const { entity, frame, shots } = fighter(template, SKILLS.Archery);
    entity.items = [{ templateIndex: 131, group: 'Weapons', stackCount: 1, questItem: true }];
    frame();
    assert.equal(requestHotbarAbility(entity, id).why, 'ammo');
    entity.items.push({ templateIndex: 131, group: 'Weapons', stackCount: 2 });
    frame();
    assert.ok(requestHotbarAbility(entity, id).ok, id);
    for (let i = 0; i < 90; i++) assert.ok(!frame().includes('hit'), id);
    assert.equal(shots.length, 1, id);
    assert.equal(entity.items[1].stackCount, 1);
    const { technique, weapon, from, direction } = shots[0];
    assert.equal(technique.pierce, pierce);
    assert.equal(technique.burstCap, burstCap);
    assert.equal(technique.actor, entity);
    const flight = new ArrowFlight({ getGpuMesh: () => null });
    flight.fire(from, direction, { fromPlayer: true, technique, weapon });
    assert.equal(Boolean(flight.arrows[0].arc), template === 564);
  }
});

test('weapon changes and save restore cancel an unreleased ability shot without spending ammo', (t) => {
  offline(t);
  for (const cancel of ['swap', 'load']) {
    const { entity, frame, pw, shots } = fighter(563, SKILLS.Archery);
    entity.items.push({ templateIndex: 131, group: 'Weapons', stackCount: 2 });
    frame();
    assert.ok(requestHotbarAbility(entity, PREVIEW_DEADEYE).ok);
    for (let i = 0; i < 11; i++) frame();
    assert.equal(shots.length, 0);
    if (cancel === 'swap') pw.weapon = { templateIndex: 130, group: 'Weapons' };
    else restoreAbilityProgress(entity, entity.combatAbilities, true);
    for (let i = 0; i < 100; i++) assert.ok(!frame().includes('hit'));
    assert.equal(shots.length, 0);
    assert.equal(entity.items[0].stackCount, 2);
  }
});

test('shot rules enforce a two-target pierce, cover, deduplication and no friendly fire', (t) => {
  offline(t);
  const actor = { health: 100 };
  const ref = (extra = {}) => ({ entity: {}, ai: { feet: [0, 0, 1], height: 2, isHostile: true }, ...extra });
  const primary = ref();
  const second = ref();
  const protectedFoe = ref({ entity: { team: 'PlayerAlly' } });
  const remoteFoe = ref({ puppet: true });
  assert.equal(abilityMayStrike(protectedFoe), false);
  assert.equal(abilityMayStrike(remoteFoe), false);
  assert.equal(abilityMayStrike(ref({ rival: 1 })), false);

  const pierce = { technique: { pierce: 2 } };
  assert.equal(techniquePierces(pierce, primary), true);
  assert.equal(techniquePierces(pierce, second), false);
  const bolt = {
    arc: true, age: 0.25, fromPlayer: true, pos: [0, 0, 0], dir: [0, 0, 1],
    technique: { ability: true, actor, load: abilityLoad(actor), burstCap: 3, targets: new Set([primary.entity]), rangeM: 3 },
  };
  const along = { ...bolt, dir: [0, 0, 2] };
  assert.equal(abilityFlightStep(along, 4), 1.5);
  assert.equal(abilityFlightStep(along, 0.1), 0);

  const blocked = ref({ ai: { feet: [1, 0, 0], height: 2 } });
  const landed = [];
  assert.equal(ballistaBurst(bolt, {
    targets: [primary, blocked, protectedFoe, remoteFoe, second, ref(), ref()],
    collider: { raycast: (_at, look) => look[0] > 0 ? 0.2 : Infinity },
    hit: (m, foe) => {
      assert.ok(abilityArrowAllowed(m, foe));
      m.technique.targets.add(foe.entity);
      landed.push(foe);
    },
  }), 2);
  assert.equal(landed[0], second);
  assert.ok(!landed.includes(blocked));
});

test('reach and weak-point bonuses use impact geometry and a miss remains a miss', () => {
  const foe = { ai: { feet: [0, 0, 3], height: 2 } };
  const deadeye = { mult: 2.15, weakPointBonus: milestoneDelivery(PREVIEW_DEADEYE).weakPointBonus };
  const anchored = { mult: 1.85, weakPointBonus: milestoneDelivery(PREVIEW_ANCHORED_SIGHT).weakPointBonus };
  assert.equal(previewDamage({ id: PREVIEW_THRUST, mult: 2 }, 100, foe, { distance: 3 }), 215);
  assert.equal(previewDamage(deadeye, 100, foe, { pos: [0, 1.7, 3] }), 240);
  assert.equal(previewDamage(deadeye, 0, foe, { pos: [0, 1.7, 3] }), 0);
  assert.equal(previewDamage(anchored, 100, foe, { pos: [0, 1.7, 3] }), 310);
  assert.equal(previewDamage(anchored, 100, foe, { pos: [0, 1.4, 3] }), 185);
});

test('rank 50 melee actions unlock at 50 and attach their control to the animation hit', (t) => {
  offline(t);
  for (const [template, skill, id] of [
    [120, SKILLS.LongBlade, PREVIEW_KEEP_AWAY], [null, SKILLS.HandToHand, PREVIEW_SHOULDER_BREAK],
  ]) {
    const { entity, pw, frame } = fighter(template, skill, 49);
    frame();
    assert.equal(requestHotbarAbility(entity, id).why, 'locked');
    entity.skills[skill] = 50;
    frame();
    assert.ok(requestHotbarAbility(entity, id).ok);
    let hits = 0;
    for (let i = 0; i < 70; i++) {
      if (!frame().includes('hit')) continue;
      assert.equal(pw.techniqueBlow.id, id);
      assert.deepEqual(pw.techniqueBlow.control, milestoneDelivery(id).control);
      hits++;
    }
    assert.equal(hits, 1);
  }
});

test('Broadhead Barrage checks usable stacks at release and spends three arrows for a focused volley', (t) => {
  offline(t);
  for (const lostAmmo of [false, true]) {
    const { entity, frame, shots, swings } = fighter(130, SKILLS.Archery, 50);
    const real = { templateIndex: 131, group: 'Weapons', stackCount: 2 };
    const quest = { ...real, stackCount: 10, questItem: true };
    const summoned = { templateIndex: 131, group: 'Weapons', timeForItemToDisappear: 20 };
    entity.items.push(real, quest);
    frame();
    assert.equal(requestHotbarAbility(entity, PREVIEW_BARRAGE).why, 'ammo');
    entity.items.push(summoned);
    frame();
    assert.ok(requestHotbarAbility(entity, PREVIEW_BARRAGE).ok);
    for (let i = 0; i < 60 && !swings.length; i++) frame();
    assert.equal(swings.length, 1);
    if (lostAmmo) entity.items.splice(entity.items.indexOf(summoned), 1);
    for (let i = 0; i < 80; i++) assert.ok(!frame().includes('hit'));
    assert.equal(quest.stackCount, 10);
    if (lostAmmo) {
      assert.equal(shots.length, 0);
      assert.equal(real.stackCount, 2);
    } else {
      assert.deepEqual(entity.items, [quest]);
      assert.equal(shots.length, 3);
      assert.deepEqual(shots.map(shot => shot.summoned), [true, false, false]);
      assert.ok(shots[0].direction[0] < 0 && shots[2].direction[0] > 0);
      assert.equal(shots[1].direction[0], 0);
      assert.equal(new Set(shots.map(shot => shot.technique.targets)).size, 3);
    }
  }
});

test('braced shots require ground and cancel from drift or lost aim until the actual loose', (t) => {
  offline(t);
  for (const [template, id] of [[563, PREVIEW_ANCHORED_SIGHT], [564, PREVIEW_ANCHOR_FIRE]]) {
    for (const change of ['wind-up', 'before-loose', 'none']) {
      const { entity, tc, frame, shots, swings } = fighter(template, SKILLS.Archery, 50);
      const ammo = { templateIndex: 131, group: 'Weapons', stackCount: 2 };
      entity.items.push(ammo);
      tc.cam.move = { grounded: false };
      frame();
      assert.equal(requestHotbarAbility(entity, id).why, 'stance');
      tc.cam.move.grounded = true;
      frame();
      assert.ok(requestHotbarAbility(entity, id).ok);
      if (change === 'wind-up') tc.cam.feet[0] += 0.25;
      if (change === 'before-loose') {
        for (let i = 0; i < 90 && !swings.length; i++) frame(0.02);
        assert.equal(swings.length, 1);
        assert.equal(shots.length, 0);
        if (id === PREVIEW_ANCHORED_SIGHT) tc.cam.yaw += 0.2;
        else tc.cam.move.grounded = false;
      }
      for (let i = 0; i < 150; i++) assert.ok(!frame().includes('hit'));
      assert.equal(shots.length, change === 'none' ? 1 : 0, id + ' ' + change);
      assert.equal(ammo.stackCount, change === 'none' ? 1 : 2);
      if (change === 'none') {
        assert.equal(shots[0].technique.burstCap, template === 564 ? 3 : 0);
        assert.equal(shots[0].technique.weakPointBonus, template === 563 ? 1.25 : undefined);
      }
    }
  }
});

test('Keep Away rewards a telegraph and Shoulder Break respects iron and stagger immunity', (t) => {
  const previous = getPref('enhancedAI');
  setPref('enhancedAI', true);
  t.after(() => setPref('enhancedAI', previous));
  const foe = (guard, extra = {}) => ({
    entity: { health: 200 }, ai: { feet: [0, 0, 2], height: 2, _tac: { state: 'windup', blow: { guard, poise: 100, taken: 0 }, ...extra } },
  });
  const counter = milestoneDelivery(PREVIEW_KEEP_AWAY);
  const counterBlow = { mult: 1 + counter.potency, counterBonus: counter.counterBonus };
  assert.equal(previewDamage(counterBlow, 100, foe('open')), 230);
  assert.equal(previewDamage(counterBlow, 100, {}), 165);
  assert.ok(counter.control.shove > 1);
  const control = milestoneDelivery(PREVIEW_SHOULDER_BREAK).control;
  const hit = (target, damage = 1) => windupDoor(target, damage, { abilityControl: control, weight: 150 });
  assert.equal(hit(foe('open'), 0), 'hold');
  assert.equal(hit(foe('iron')), 'hold');
  assert.equal(hit(foe('open', { staggerReady: Infinity })), 'break');
  const target = foe('open');
  assert.equal(hit(target), 'stagger');
  assert.equal(target.ai._tac.state, 'staggered');
  assert.equal(hit({ entity: {}, ai: {} }), null);
});

function hostile(x, z, extra = {}) {
  return { entity: { health: 200, isClass: false, armorValues: Array(7).fill(100),
    stats: { strength: 50, endurance: 50, agility: 50, luck: 50, speed: 50, willpower: 50 }, ...extra },
    ai: { feet: [x, 0, z], height: 1.8, yaw: 0, isHostile: true } };
}

const clearSight = () => ({ dist: 1, inView: true, losClear: true });

function flatDelivery(entity, tc, targets) {
  setPlayerDoor({ player: () => entity, foes: () => targets,
    castOnPlayer: bundle => applySpell(bundle, 1, entity, {}, () => 0) });
  tc.collider = { raycast(from, dir, reach = Infinity) {
    const distance = dir[1] < -1e-6 ? -from[1] / dir[1] : Infinity;
    return distance <= reach ? distance : Infinity;
  } };
  const motor = { grounded: true, techFlight: false, landing: null, techniqueLaunch(dir, along, up) {
    this.grounded = false;
    this.techFlight = true;
    const distance = along * (2 * up / GRAVITY);
    this.landing = tc.cam.feet.map((v, i) => v + dir[i] * distance);
    return true;
  } };
  tc.door.motor = () => motor;
  return () => {
    if (!motor.landing) return;
    tc.cam.feet = motor.landing;
    tc.cam.pos = [motor.landing[0], motor.landing[1] + 1.5, motor.landing[2]];
    motor.landing = null;
    motor.grounded = true;
  };
}

test('all 92 milestones unlock at their rank and reach the normal swing or projectile path', (t) => {
  offline(t);
  t.after(() => setPlayerDoor(null));
  for (const ability of ABILITIES.filter(entry => entry.category === 'weapon')) {
    const template = ability.templates[0] === 'bare' ? null : ability.templates[0];
    const { entity, frame, shots, tc } = fighter(template, ability.skills[0], ability.rank - 1);
    const profile = milestoneDelivery(ability.id);
    const foe = hostile(0, 2.7);
    entity.items.push({ group: 'Weapons', templateIndex: 131, stackCount: 30 });
    const land = flatDelivery(entity, tc, [foe]);
    if (profile.rain) tc.cam.pitch = -.26;
    frame();
    assert.equal(requestHotbarAbility(entity, ability.id).why, 'locked', ability.id);
    entity.skills[ability.skills[0]] = ability.rank;
    frame();
    assert.equal(requestHotbarAbility(entity, ability.id).ok, true, ability.id);
    let hits = 0;
    for (let i = 0; i < 160; i++) {
      land();
      if (frame().includes('hit')) hits++;
    }
    if (profile.kind === 'melee') assert.equal(hits, profile.beats, ability.id);
    if (profile.kind === 'ranged') assert.equal(shots.length, profile.ammo, ability.id);
    if (profile.kind === 'self') assert.ok(abilityCooldown(entity, ability.id) > 0, ability.id);
  }
});

test('all 30 combinations unlock and release on every eligible weapon, including linked hand swaps', (t) => {
  offline(t);
  t.after(() => setPlayerDoor(null));
  const combinations = ABILITIES.filter(ability => ability.category === 'combination');
  assert.equal(combinations.length, 30);
  const bows = [129, 130, 563, 564];
  for (const ability of combinations) {
    const ranked = ability.skills.includes(SKILLS.Archery);
    for (const template of ability.templates) {
      const isRanged = bows.includes(template);
      const opensWithBow = ranked && !isRanged;
      const weapon = template === 'bare' ? null : createWeapon(template, 3);
      const { entity, pw, tc, frame, shots } = fighter(opensWithBow ? 130 : template === 'bare' ? null : template,
        ability.skills[0], ability.rank - 1);
      const label = ability.id + ' · ' + template;
      entity.skills[ability.skills[1]] = ability.rank - 1;
      entity.items.push({ group: 'Weapons', templateIndex: 131, stackCount: 20 });
      const foe = hostile(0, 2.7);
      const decoy = hostile(.32, 2.2);
      const land = flatDelivery(entity, tc, [decoy, foe]);
      frame();
      assert.equal(requestHotbarAbility(entity, ability.id).why, 'locked', label);
      entity.skills[ability.skills[0]]++;
      frame();
      assert.equal(requestHotbarAbility(entity, ability.id).why, 'locked', label);
      entity.skills[ability.skills[1]]++;
      frame();
      assert.ok(requestHotbarAbility(entity, ability.id).ok, label);
      if (ranked) {
        const profile = combinationDelivery(ability.id, pw.restingWeapon);
        for (let i = 0; i < 110 && !shots.length; i++) frame();
        assert.equal(shots.length, profile.ammo, label);
        assert.equal(entity.items[0].stackCount, 20 - profile.ammo, label);
        if (!opensWithBow) continue;
        shots[0].technique.onResolve(10, foe);
        for (const shot of shots.slice(1)) shot.technique.onResolve(10, decoy);
        pw.weapon = weapon;
        for (let i = 0; i < 80; i++) frame();
        assert.equal(abilityCooldown(entity, ability.id), 0, label);
        assert.ok(requestHotbarAbility(entity, ability.id).ok, label);
      }
      const delivery = combinationDelivery(ability.id, weapon);
      let hits = 0;
      for (let i = 0; i < 140; i++) {
        land();
        if (frame().includes('hit')) {
          if (ranked && hits === 0) assert.equal(pw.techniqueBlow.chain.target, foe.entity, label);
          hits++;
        }
      }
      assert.equal(hits, delivery.beats, label);
    }
  }
});

test('Tanto picks its Edge Ritual rider on release and applies each rider only to damaging Tanto strikes', (t) => {
  offline(t);
  for (const crouching of [false, true]) {
    const { entity, pw, frame, tc } = fighter(114, SKILLS.ShortBlade, 50);
    const foe = hostile(0, 1);
    tc.cam.move = { crouching };
    frame();
    assert.ok(requestHotbarAbility(entity, 'weapon.tanto.edge-ritual').ok);
    for (let i = 0; i < 10; i++) frame();
    const fatigue = entity.fatigue;
    assert.equal(applyEdgeRitual(entity, pw.weapon, foe, 0), 0);
    assert.equal(applyEdgeRitual(entity, { templateIndex: 113 }, foe, 40), 40);
    for (let i = 0; i < 3; i++) assert.equal(applyEdgeRitual(entity, pw.weapon, foe, 40), crouching ? 40 : 50);
    assert.equal(entity.fatigue - fatigue, crouching ? 384 : 0);
    assert.equal(applyEdgeRitual(entity, pw.weapon, foe, 40), 40);
  }
});

test('weapon openings attach to the actor and foe and clear on reload', (t) => {
  offline(t);
  const { entity } = fighter(124, SKILLS.BluntWeapon, 100);
  const foe = hostile(0, 1), other = hostile(0, 1);
  const opening = { channel: 'sunder', share: .4, seconds: 8 };
  weaponOpening(entity, foe, { opening });
  assert.equal(weaponOpening(entity, other, { exploit: 'sunder' }), 0);
  assert.equal(weaponOpening(entity, foe, { exploit: 'sunder' }), .4);
  assert.equal(weaponOpening(entity, foe, { exploit: 'sunder' }), 0);
  weaponOpening(entity, foe, { opening });
  restoreAbilityProgress(entity, null);
  assert.equal(weaponOpening(entity, foe, { exploit: 'sunder' }), 0);
});

test('Wakizashi Crosscut strikes with the offhand only when a short blade is paired', (t) => {
  offline(t);
  for (const paired of [false, true]) {
    const { entity, pw, frame } = fighter(117, SKILLS.ShortBlade);
    const lead = pw.weapon;
    const offhand = createWeapon(paired ? 113 : 120, 3);
    pw.updateHands(lead, offhand);
    pw.applyWeapon();
    frame();
    assert.ok(requestHotbarAbility(entity, 'weapon.wakizashi.crosscut').ok);
    const hands = [];
    for (let i = 0; i < 110; i++) if (frame().includes('hit')) {
      assert.equal(pw.strikingWeapon, pw.techniqueBlow.weapon);
      hands.push(pw.strikingWeapon.templateIndex);
    }
    assert.deepEqual(hands, [117, paired ? 113 : 117]);
  }
});

test('Flail wounds tick, detonate once, and stop dealing bleed damage on detonation', (t) => {
  offline(t);
  const { entity } = fighter(125, SKILLS.BluntWeapon);
  const foe = hostile(0, 1);
  const hurt = [];
  weaponOpening(entity, foe, { opening: { channel: 'rake', share: .55, seconds: 8 }, woundDamage: 100 });
  const tick = () => stepWeaponOpenings(entity, .25, (target, damage) => hurt.push([target, damage]));
  for (let i = 0; i < 4; i++) tick();
  assert.deepEqual(hurt, [[foe, 13]]);
  assert.equal(weaponOpening(entity, foe, { exploit: 'rake' }), .55);
  for (let i = 0; i < 16; i++) tick();
  assert.equal(hurt.length, 1);
  assert.equal(weaponOpening(entity, foe, { exploit: 'rake' }), 0);
});

test('Marked for Silence primes Nightfall on one foe and its five beats share the bonus', (t) => {
  offline(t);
  const { entity, pw, frame } = fighter(113, SKILLS.ShortBlade, 99);
  const [, , mark, nightfall] = DAGGER_MILESTONES;
  const target = hostile(0, 1, { health: 30, maxHealth: 100 });
  const other = hostile(0, 1, { health: 30, maxHealth: 100 });
  const nextBlow = () => {
    for (let i = 0; i < 60; i++) if (frame().includes('hit')) return pw.techniqueBlow;
    assert.fail('No dagger hit frame');
  };
  frame();
  assert.equal(requestHotbarAbility(entity, nightfall).why, 'locked');
  entity.skills[SKILLS.ShortBlade] = 100;
  frame();
  assert.ok(requestHotbarAbility(entity, mark).ok);
  const opening = nextBlow();
  assert.equal(previewDamage(opening, 0, other), 0);
  assert.equal(previewDamage(opening, 100, target), 210);
  for (let i = 0; i < 28; i++) frame();
  assert.ok(requestHotbarAbility(entity, nightfall).ok);
  const damage = [];
  for (let i = 0; i < 5; i++) {
    const blow = nextBlow();
    assert.equal(blow.id, nightfall);
    assert.equal(previewDamage(blow, 100, other), 123);
    damage.push(previewDamage(blow, 100, target));
  }
  assert.deepEqual(damage, Array(5).fill(142));
});

test('Veil Cut applies concealment and adds damage against an unaware target', (t) => {
  offline(t);
  t.after(() => setPlayerDoor(null));
  const { entity, pw, frame } = fighter(113, SKILLS.ShortBlade, 25);
  setPlayerDoor({ player: () => entity, castOnPlayer: bundle => applySpell(bundle, 1, entity, {}, () => 0) });
  frame();
  assert.ok(requestHotbarAbility(entity, DAGGER_MILESTONES[0]).ok);
  let hit;
  for (let i = 0; i < 60 && !hit; i++) if (frame().includes('hit')) hit = pw.techniqueBlow;
  assert.ok(hit);
  breakNormalPowerConcealment(entity);
  assert.ok(hasActiveEffect(entity, 'chameleonTrue'));
  tickActiveEffects(entity, {}, () => 0);
  assert.ok(!hasActiveEffect(entity, 'chameleonTrue'));
  const foe = hostile(0, 1);
  assert.equal(previewDamage(hit, 100, foe), 165);
  assert.equal(previewDamage(hit, 100, foe, { unaware: true }), 245);
});

test('Kidney Step aims at a hostile foe and uses its rear landing for the strike', (t) => {
  offline(t);
  t.after(() => setPlayerDoor(null));
  const { entity, pw, tc, frame } = fighter(113, SKILLS.ShortBlade, 50);
  const target = hostile(0, 2.5);
  target.ai.yaw = Math.PI;
  const ally = hostile(0, 1, { team: 'PlayerAlly' });
  setPlayerDoor({ foes: () => [ally, target] });
  const motor = { grounded: true, techFlight: false, techniqueLaunch() { this.grounded = false; this.techFlight = true; return true; } };
  tc.door.motor = () => motor;
  tc.collider = { raycast: (from, dir) => dir[1] < -.99 ? from[1] : Infinity };
  frame();
  assert.ok(requestHotbarAbility(entity, DAGGER_MILESTONES[1]).ok);
  for (let i = 0; i < 20 && motor.grounded; i++) frame();
  assert.ok(motor.techFlight);
  tc.cam.feet[2] = tc.cam.pos[2] = 3.6;
  motor.grounded = true;
  let hit;
  for (let i = 0; i < 60 && !hit; i++) if (frame().includes('hit')) hit = pw.techniqueBlow;
  assert.equal(hit?.chain.target, target.entity);
  assert.equal(previewDamage(hit, 100, target), 245);
});

test('Piercing Line strikes only the traveled lane in order, with a shared target cap', (t) => {
  offline(t);
  const { entity, pw, frame, tc } = fighter(120, SKILLS.LongBlade, 74);
  const motor = { grounded: true, techFlight: false, techniqueLaunch() { this.grounded = false; this.techFlight = true; return true; } };
  tc.door.motor = () => motor;
  tc.collider = { raycast: (from, dir) => dir[1] < 0 ? from[1] : Infinity };
  frame();
  assert.equal(requestHotbarAbility(entity, PREVIEW_PIERCING_LINE).why, 'locked');
  entity.skills[SKILLS.LongBlade] = 75;
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_PIERCING_LINE).ok);
  for (let i = 0; i < 20 && motor.grounded; i++) frame();
  assert.ok(motor.techFlight);
  assert.equal(pw.techniqueBlow, null);
  tc.cam.feet[2] = 2;
  tc.cam.pos[2] = 2;
  motor.grounded = true;
  let hit = false;
  for (let i = 0; i < 30 && !hit; i++) hit = frame().includes('hit');
  assert.ok(hit);
  assert.equal(pw.techniqueBlow.lane.len, 2);
  const near = hostile(0, 0.55);
  const middle = hostile(0, 1.2);
  const far = hostile(0, 1.7);
  const extra = hostile(0, 1.9);
  const covered = hostile(0, 0.75);
  const outside = hostile(0, 3.2);
  const side = hostile(2, 1.2);
  const friend = hostile(0, 0.3, { team: 'PlayerAlly' });
  const results = pw.resolveHit([extra, far, middle, outside, side, covered, near, friend, near], entity,
    (foe) => ({ ...clearSight(), losClear: foe !== covered }), () => 0);
  assert.deepEqual(results.map(({ foe }) => foe), [near, middle, far]);
  assert.deepEqual(pw.resolveHit([extra], entity, clearSight, () => 0), []);
});

test('Flow State takes facing from each swing and can redirect the four-hit combo', (t) => {
  offline(t);
  const { entity, pw, frame, tc, swings } = fighter(null, SKILLS.HandToHand, 75);
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_FLOW_STATE).ok);
  const front = hostile(0, 1.3), back = hostile(0, -1.3);
  const targets = [];
  for (let i = 0; i < 180; i++) {
    if (!frame().includes('hit')) continue;
    const hits = pw.resolveHit([front, back], entity, clearSight, () => 0);
    assert.equal(hits.length, 1);
    targets.push(hits[0].foe);
    tc.cam.yaw += Math.PI;
  }
  assert.deepEqual(swings, ['StrikeRight', 'StrikeLeft', 'StrikeDown', 'StrikeRight']);
  assert.deepEqual(targets, [front, back, front, back]);
});

test("Eagle's Rhythm rewards consecutive hits and resets on a cover impact", (t) => {
  offline(t);
  for (const middleHit of [true, false]) {
    const { entity, frame, shots } = fighter(130, SKILLS.Archery, 75);
    entity.items.push({ templateIndex: 131, group: 'Weapons', stackCount: 4 });
    frame();
    for (let i = 0; i < 3; i++) {
      assert.ok(requestHotbarAbility(entity, PREVIEW_EAGLES_RHYTHM).ok);
      for (let j = 0; j < 80 && shots.length <= i; j++) frame();
      assert.equal(shots.length, i + 1);
      assert.ok(abilityCooldown(entity, PREVIEW_EAGLES_RHYTHM) > 0);
      const { from, direction, ...options } = shots[i];
      const flight = new ArrowFlight({
        getGpuMesh: () => null, collider: { heightAt: () => -10, raycast: () => i === 1 && !middleHit ? 0.1 : Infinity },
      });
      flight.fire(from, direction, { ...options, fromPlayer: true });
      const foe = hostile(0, 1.4);
      flight.update(0.03, { foeTargets: [foe].map(ref => ({ feet: ref.ai.feet, ref })),
        onPlayerArrowHitFoe: (m, target) => assert.ok(playerArrowHitFoe(m, target, { playerEntity: entity, rolls: () => 0 }) > 0) });
      assert.ok(flight.arrows[0].dead);
      for (let j = 0; j < 61; j++) frame();
      if (i < 2) assert.equal(abilityCooldown(entity, PREVIEW_EAGLES_RHYTHM), 0);
    }
    assert.deepEqual(shots.map(s => Math.round(100 * s.technique.mult)), [135, 180, middleHit ? 225 : 135]);
    assert.equal(entity.items[0].stackCount, 1);
    assert.equal(requestHotbarAbility(entity, PREVIEW_EAGLES_RHYTHM).why, 'cooldown');
  }
});

test('Armor Needle sends its armor penetration through both combat formula paths', (t) => {
  offline(t);
  const { entity, frame, shots } = fighter(563, SKILLS.Archery, 75);
  entity.items.push({ templateIndex: 131, group: 'Weapons', stackCount: 1 });
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_ARMOR_NEEDLE).ok);
  for (let i = 0; i < 80 && !shots.length; i++) frame();
  assert.equal(shots.length, 1);
  const armorPierce = shots[0].technique.armorPierce;
  assert.equal(armorPierce, 0.65);
  const target = hostile(0, 5, { careerIndex: 22, armorValues: Array(7).fill(20) }).entity;
  assert.equal(calculateSuccessfulHit(entity, target, 25, 0, () => 0.5), false);
  assert.equal(calculateSuccessfulHit(entity, target, 25, 0, () => 0.5, null, armorPierce), true);
  const opts = { weapon: { ...shots[0].weapon, material: 3 }, rolls: () => 0.02, modules: pcaaoModules(() => false, () => false) };
  const baseline = pcaaoAttackDamage(entity, target, opts);
  assert.ok(baseline > 0);
  assert.ok(pcaaoAttackDamage(entity, target, { ...opts, armorPierce }) > baseline);
});

test('Linebreaker sweeps through four targets in contact order and stops at cover', (t) => {
  offline(t);
  const { entity, frame, shots } = fighter(564, SKILLS.Archery, 75);
  entity.items.push({ templateIndex: 131, group: 'Weapons', stackCount: 1 });
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_LINEBREAKER).ok);
  for (let i = 0; i < 90 && !shots.length; i++) frame();
  assert.equal(shots.length, 1);
  assert.equal(entity.items.length, 0);
  const first = hostile(0, 2), second = hostile(0, 4), third = hostile(0, 6), fourth = hostile(0, 8), fifth = hostile(0, 10);
  const friend = hostile(0, 1, { team: 'PlayerAlly' });
  for (const wall of [Infinity, 5.4]) {
    const { from, direction, ...options } = shots[0];
    const flight = new ArrowFlight({ getGpuMesh: () => null, collider: { raycast: () => wall, heightAt: () => -10 } });
    flight.fire(from, direction, { ...options, technique: { ...options.technique, targets: new Set() }, fromPlayer: true });
    const missile = flight.arrows[0];
    assert.ok(!missile.arc);
    assert.ok(missile.technique.control.shove > 1);
    const hit = [];
    flight.update(0.35, {
      foeTargets: [fifth, third, first, second, friend, fourth, first].map(ref => ({ feet: ref.ai.feet, ref })),
      onPlayerArrowHitFoe: (m, foe) => { m.technique.targets.add(foe.entity); hit.push(foe); },
    });
    assert.deepEqual(hit, Number.isFinite(wall) ? [first, second] : [first, second, third, fourth]);
    assert.ok(missile.dead);
  }
});

test("King's Measure unlocks at 100 and gives each phase its own reach and target cap", (t) => {
  offline(t);
  const { entity, pw, frame, swings } = fighter(120, SKILLS.LongBlade, 99);
  frame();
  assert.equal(requestHotbarAbility(entity, PREVIEW_KINGS_MEASURE).why, 'locked');
  entity.skills[SKILLS.LongBlade] = 100;
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_KINGS_MEASURE).ok);
  const sweep = [hostile(2, 2), hostile(-2, 2), hostile(2, 3), hostile(-2, 3), hostile(0, 2.5)];
  const thrust = [hostile(0, 4.8), hostile(0, 5.7), hostile(0, 6.5), hostile(0, 7), hostile(1.1, 5.4)];
  let hit = 0;
  for (let i = 0; i < 100; i++) {
    if (!frame().includes('hit')) continue;
    const blow = pw.techniqueBlow;
    assert.ok(blow.damageMod > 0);
    if (!hit) {
      assert.equal(blow.lane, undefined);
      assert.deepEqual(pw.resolveHit(sweep, entity, clearSight, () => 0).map(r => r.foe), sweep.slice(0, 4));
    } else {
      assert.equal(blow.lane.len, 7.1);
      assert.deepEqual(pw.resolveHit([...thrust].reverse(), entity, clearSight, () => 0).map(r => r.foe), thrust.slice(0, 3));
      assert.ok(blow.mult > 2);
    }
    hit++;
  }
  assert.equal(hit, 2);
  assert.deepEqual(swings, ['StrikeRight', 'StrikeUp']);
});

test('Skyfall fits the barrage under cover, spends actual arrows and caps contacts per target', (t) => {
  offline(t);
  const { entity, tc, frame, shots } = fighter(130, SKILLS.Archery, 100);
  tc.cam.pitch = -0.17;
  const collider = { heightAt: () => 0, raycast: (origin, dir) => {
    if (dir[1] < 0 && origin[1] > 0) return origin[1] / -dir[1];
    if (dir[1] > 0) return (3 - origin[1]) / dir[1];
    return Infinity;
  } };
  tc.collider = collider;
  entity.items.push({ templateIndex: 131, group: 'Weapons', stackCount: 6 });
  frame();
  assert.equal(requestHotbarAbility(entity, PREVIEW_SKYFALL).why, 'ammo');
  entity.items[0].stackCount = 7;
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_SKYFALL).ok);
  for (let i = 0; i < 100; i++) assert.ok(!frame().includes('hit'));
  assert.equal(shots.length, 7);
  assert.equal(entity.items.length, 0);
  assert.ok(shots.every(shot => shot.sky && shot.from[1] < 3 && shot.from[1] > 2));
  assert.ok(shots.every(shot => shot.direction[1] === -1));
  const foe = hostile(0, 7);
  for (const [index, shot] of shots.entries()) {
    const m = { pos: [0, 1.5, 7], ...shot };
    assert.equal(abilityArrowAllowed(m, foe), index < 3);
    if (index < 3) assert.ok(playerArrowHitFoe(m, foe, { playerEntity: entity, rolls: () => 0 }) > 0);
  }
  const blocked = { ...collider, raycast: (pos, dir) => dir[2] > 0 ? 0.5 : collider.raycast(pos, dir) };
  assert.equal(skyfallPattern(tc.cam, blocked, milestoneDelivery(PREVIEW_SKYFALL)), null);
  const billboardCover = { ...collider, cover: { on: () => true, hit: () => 0.5 } };
  assert.equal(skyfallPattern(tc.cam, billboardCover, milestoneDelivery(PREVIEW_SKYFALL)), null);
});

test('Final Verdict measures swept contact distance and only executes at a distant weak point', (t) => {
  offline(t);
  const { entity, tc, frame, shots } = fighter(563, SKILLS.Archery, 100);
  tc.cam.pos[1] = 1.76;
  entity.items.push({ templateIndex: 131, group: 'Weapons', stackCount: 1 });
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_FINAL_VERDICT).ok);
  for (let i = 0; i < 110 && !shots.length; i++) frame();
  assert.equal(shots.length, 1);
  const { from, direction, ...options } = shots[0];
  const flight = new ArrowFlight({ getGpuMesh: () => null });
  flight.fire(from, direction, { ...options, fromPlayer: true });
  const target = hostile(0, 34, { health: 39, maxHealth: 100 });
  flight.update(0.6, {
    foeTargets: [{ feet: target.ai.feet, ref: target }],
    onPlayerArrowHitFoe(m, foe) {
      assert.ok(m.abilityContactDistance > 32 && m.abilityContactDistance < 34);
      assert.equal(previewDamage(m.technique, 100, foe, { pos: m.pos, distance: m.abilityContactDistance }), 660);
      assert.equal(previewDamage(m.technique, 100, foe, { pos: m.pos, distance: 20 }), 505);
      assert.equal(previewDamage(m.technique, 100, foe, { pos: [0, 1, 34], distance: 33 }), 380);
      assert.ok(playerArrowHitFoe(m, foe, { playerEntity: entity, rolls: () => 0 }) > 100);
    },
  });
  assert.ok(flight.arrows[0].dead);
});

test('Siege of Heaven braces, retains its arc, and hits the nearest eligible splash targets', (t) => {
  offline(t);
  const { entity, tc, frame, shots } = fighter(564, SKILLS.Archery, 100);
  entity.items.push({ templateIndex: 131, group: 'Weapons', stackCount: 2 });
  tc.cam.move = { grounded: true };
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_SIEGE_OF_HEAVEN).ok);
  for (let i = 0; i < 29; i++) frame();
  assert.equal(shots.length, 0);
  tc.cam.feet[0] = 0.2;
  frame();
  assert.equal(shots.length, 0);
  assert.equal(entity.items[0].stackCount, 2);
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_SIEGE_OF_HEAVEN).ok);
  for (let i = 0; i < 100 && !shots.length; i++) frame();
  assert.equal(shots.length, 1);
  const { from, direction, ...options } = shots[0];
  const flight = new ArrowFlight({ getGpuMesh: () => null });
  flight.fire(from, direction, { ...options, fromPlayer: true });
  const bolt = flight.arrows[0];
  assert.ok(bolt.arc);
  bolt.pos = [0, 0.5, 0];
  const primary = hostile(0, 0), covered = hostile(1.5, 0);
  bolt.technique.targets.add(primary.entity);
  const arranged = [1, 2, 3, 4, 5, 5.5, 6.5].map(z => hostile(0, z));
  const hit = [];
  const shares = [];
  assert.equal(ballistaBurst(bolt, {
    targets: [...arranged].reverse().concat([primary, covered]),
    collider: { raycast: (pos, dir) => dir[0] > 0 ? 0.5 : Infinity },
    hit(m, foe) { m.technique.targets.add(foe.entity); hit.push(foe); shares.push(m.splashShare); },
  }), 5);
  assert.deepEqual(hit, arranged.slice(0, 5));
  assert.ok(shares[0] > shares[4]);
  assert.equal(ballistaBurst(bolt), 0);
});

test('Hundred-Fist Ascension speeds up real hit frames and keeps one target through the finisher', (t) => {
  offline(t);
  const { entity, pw, frame } = fighter(null, SKILLS.HandToHand, 100);
  frame();
  assert.ok(requestHotbarAbility(entity, PREVIEW_HUNDRED_FIST).ok);
  const first = hostile(0, 1), next = hostile(0, 0.7);
  const landed = [];
  for (let i = 0; i < 360; i++) {
    if (!frame(1 / 60).includes('hit')) continue;
    const blow = pw.techniqueBlow;
    assert.ok(pw.strikeSchedule().step < blowSchedule(pw.machine, pw.liveSpeed).step);
    assert.equal(blow.control.poiseShare, landed.length < 6 ? 0.26 : 1);
    const results = pw.resolveHit(landed.length ? [next, first] : [first], entity,
      foe => ({ ...clearSight(), dist: foe === next ? 0.7 : 1 }), () => 0);
    landed.push(results[0]?.foe);
  }
  assert.deepEqual(landed, Array(7).fill(first));
});

test('capstone power grows with skill, level, weapon material and style attribute', () => {
  const { capstone } = milestoneDelivery(PREVIEW_FINAL_VERDICT);
  const low = { skills: [], stats: { agility: 40 }, level: 4 };
  low.skills[SKILLS.Archery] = 75;
  const high = { ...low, skills: [...low.skills], stats: { agility: 90 }, level: 25 };
  high.skills[SKILLS.Archery] = 100;
  const power = (entity, material) => capstonePower(capstone, entity, SKILLS.Archery, { material });
  assert.ok(power(high, 8) > power(high, 0));
  assert.ok(power(high, 0) > power(low, 0));
});

test('Blade Weave draws the opening lane at contact and hits an enemy overlapping its edge', (t) => {
  offline(t);
  const { entity, pw, frame, tc } = fighter(120, SKILLS.LongBlade, 75);
  entity.skills[SKILLS.ShortBlade] = 75;
  let points;
  tc.door.fx = (recipe, _origin, options) => {
    if (recipe === 'ability-contact') points = options.points;
  };
  frame();
  assert.ok(requestHotbarAbility(entity, BLADE_WEAVE).ok);
  for (let i = 0; i < 60 && !points; i++) frame();
  assert.ok(points?.some(([x, , z]) => x === .75 && z === 3.4));
  const graze = hostile(1.12, 2);
  const outside = hostile(1.25, 2);
  const blocked = hostile(.7, 1);
  const hits = pw.resolveHit([outside, blocked, graze], entity,
    foe => ({ ...clearSight(), losClear: foe !== blocked }), () => 0);
  assert.deepEqual(hits.map(hit => hit.foe), [graze]);
});

test('Shared Resolve raises capped Endurance temporarily without raising the base stat', (t) => {
  offline(t);
  t.after(() => setPlayerDoor(null));
  const { entity, frame } = fighter(114, SKILLS.ShortBlade, 75);
  entity.stats.endurance = 100;
  setPlayerDoor({ player: () => entity, castOnPlayer: bundle => applySpell(bundle, 1, entity, {}, () => 0) });
  frame();
  assert.ok(requestHotbarAbility(entity, 'weapon.tanto.shared-resolve').ok);
  for (let i = 0; i < 15; i++) frame();
  assert.equal(liveStat(entity, 'endurance'), 108);
  assert.equal(entity.stats.endurance, 100);
  tickActiveEffects(entity, {}, () => 0);
  tickActiveEffects(entity, {}, () => 0);
  assert.equal(liveStat(entity, 'endurance'), 100);
});

test('Blade Weave learns from both blades and works independently of the legacy path', (t) => {
  offline(t);
  for (const [template, skill, other] of [[120, SKILLS.LongBlade, SKILLS.ShortBlade], [113, SKILLS.ShortBlade, SKILLS.LongBlade]]) {
    const { entity, pw, frame } = fighter(template, skill, 100);
    entity.martialPath = 'brawler';
    entity.skills[other] = 74;
    frame();
    assert.equal(requestHotbarAbility(entity, BLADE_WEAVE).why, 'locked');
    entity.skills[other] = 75;
    frame();
    assert.equal(requestHotbarAbility(entity, THOUSAND_CUTS).why, 'locked');
    assert.ok(requestHotbarAbility(entity, BLADE_WEAVE).ok);
    const marked = hostile(0, 1.2), nearer = hostile(0, .8);
    const targets = [];
    for (let i = 0; i < 100; i++) {
      if (!frame().includes('hit')) continue;
      const blow = pw.techniqueBlow;
      assert.equal(blow.id, BLADE_WEAVE);
      if (!targets.length) assert.ok(blow.lane);
      else assert.ok(blow.tempo > 1);
      const hits = pw.resolveHit(targets.length ? [nearer, marked] : [marked], entity, clearSight, () => 0);
      targets.push(hits[0]?.foe);
    }
    assert.deepEqual(targets, [marked, marked]);
    assert.equal(entity.martialPath, 'brawler');
  }
});

test('Thousand Cuts uses the traveled lane for the opening hit and fresh aim for the follow-ups', (t) => {
  offline(t);
  const { entity, pw, frame, tc } = fighter(113, SKILLS.ShortBlade, 100);
  entity.skills[SKILLS.LongBlade] = 100;
  const motor = { grounded: true, techFlight: false, techniqueLaunch() { this.grounded = false; this.techFlight = true; return true; } };
  tc.door.motor = () => motor;
  tc.collider = { raycast: (from, dir) => dir[1] < 0 ? from[1] : Infinity };
  frame();
  assert.ok(requestHotbarAbility(entity, THOUSAND_CUTS).ok);
  for (let i = 0; i < 20 && motor.grounded; i++) frame();
  assert.ok(motor.techFlight);
  tc.cam.feet[2] = 1.9;
  tc.cam.pos[2] = 1.9;
  motor.grounded = true;
  const lanes = [];
  for (let i = 0; i < 90; i++) {
    if (!frame().includes('hit')) continue;
    lanes.push(pw.techniqueBlow.lane?.len ?? null);
  }
  assert.deepEqual(lanes, [1.9, null, null]);
});

test('racial advances use the traveled lane, with a charge, a placed decoy, or a leap', (t) => {
  offline(t);
  t.after(() => setPlayerDoor(null));
  for (const [race, id, cap] of [
    ['Nord', 'racial.nord.frostborn-charge', 3],
    ['Lilmothit', 'racial.lilmothit.foxfire-feint', undefined],
    ['Lungaris', 'racial.lungaris.harebound', undefined],
  ]) {
    const { entity, pw, frame, tc } = fighter(120, SKILLS.LongBlade, 1);
    entity.race = race;
    const motor = { grounded: true, techFlight: false, techniqueLaunch(_dir, _along, up) {
      this.grounded = false;
      this.techFlight = true;
      this.up = up;
      return true;
    } };
    tc.door.motor = () => motor;
    tc.collider = { raycast: (from, dir) => dir[1] < 0 ? from[1] : Infinity };
    let placement;
    setPlayerDoor({ player: () => entity, castOnPlayer(bundle, options) {
      applySpell(bundle, 1, entity, {}, () => 0);
      placement = options.placement;
    } });
    frame();
    assert.equal(requestHotbarAbility(entity, 'racial.breton.wardbreaker').why, 'race');
    assert.ok(requestHotbarAbility(entity, id).ok, id);
    for (let i = 0; i < 20 && motor.grounded; i++) frame();
    assert.ok(motor.up > 0, id);
    if (race === 'Lilmothit') {
      assert.ok(hasActiveEffect(entity, 'decoy'));
      assert.deepEqual(placement.dir, [0, 0, 1]);
    }
    tc.cam.feet[2] = 1.9;
    tc.cam.pos[2] = 1.9;
    motor.grounded = true;
    let hit;
    for (let i = 0; i < 60 && !hit; i++) if (frame().includes('hit')) hit = pw.techniqueBlow;
    assert.equal(hit?.id, id);
    assert.equal(hit.lane.len, 1.9);
    assert.equal(hit.targetCap, cap);
  }
});

test('Sword-Song commits once and its temporary accuracy expires in simulation time', (t) => {
  offline(t);
  const { entity, pw, frame, swings } = fighter(120, SKILLS.LongBlade, 1);
  entity.race = 'Redguard';
  entity.maxHealth = entity.health;
  frame();
  const id = 'racial.redguard.sword-song';
  assert.ok(requestHotbarAbility(entity, id).ok);
  for (let i = 0; i < 10; i++) frame();
  assert.equal(racialModifiers(entity, pw.weapon).toHitMod, 9);
  assert.ok(abilityCooldown(entity, id) > 0);
  assert.deepEqual(swings, []);
  for (let i = 0; i < 44; i++) frame(.25);
  assert.equal(racialModifiers(entity, pw.weapon).toHitMod, 4);
});

test('Forest Ambush requires a bow, spends one arrow and applies concealment', (t) => {
  offline(t);
  t.after(() => setPlayerDoor(null));
  const id = 'racial.wood-elf.forest-ambush';
  const { entity, pw, frame, shots } = fighter(120, SKILLS.Archery, 1);
  entity.race = 'WoodElf';
  entity.items.push({ group: 'Weapons', templateIndex: 131, stackCount: 2 });
  setPlayerDoor({ player: () => entity, castOnPlayer: bundle => applySpell(bundle, 1, entity, {}, () => 0) });
  frame();
  assert.equal(requestHotbarAbility(entity, id).why, 'weapon');
  pw.weapon = createWeapon(130, 3, () => 0);
  frame();
  frame();
  assert.ok(requestHotbarAbility(entity, id).ok);
  for (let i = 0; i < 80 && !shots.length; i++) frame();
  assert.equal(shots.length, 1);
  assert.equal(entity.items[0].stackCount, 1);
  assert.ok(hasActiveEffect(entity, 'chameleonNormal'));
});

test("Commander's Call buffs the Imperial and only nearby companions in sight", (t) => {
  offline(t);
  t.after(() => setPlayerDoor(null));
  const { entity, pw, frame } = fighter(118, SKILLS.LongBlade, 1);
  entity.race = 'Imperial';
  entity.maxHealth = entity.health;
  const companion = (feet, extra = {}) => ({ entity: { health: 100, stats: { speed: 50 } },
    ai: { feet, height: 1.8 }, ...extra });
  const near = companion([0, 0, 4]);
  const blocked = companion([4, 0, 0]);
  const far = companion([0, 0, 12]);
  const down = companion([1, 0, 0], { _knockedOut: true });
  const crews = [near, blocked, far, down];
  const hostileNear = companion([0, 0, 2]);
  const magic = createPlayerMagic({
    renderer: {}, audio: {}, getTexture: () => null,
    collider: { raycast: (_pos, dir) => dir[0] > .9 ? 1 : Infinity },
    playerEntity: entity, playerSinks: {}, say: () => {}, surfacePlayer: () => {},
    foes: () => [hostileNear], foeSinks: () => ({}), absorbCtx: () => ({}),
    companionBodies: () => crews, rolls: () => 0,
  });
  magic.update(0, [0, 0, 0]);
  assert.ok(playerDoor());
  frame();
  const id = 'racial.imperial.commanders-call';
  assert.ok(requestHotbarAbility(entity, id).ok);
  for (let i = 0; i < 10; i++) frame();
  assert.equal(racialModifiers(entity, pw.weapon).toHitMod, 8);
  assert.equal(liveStat(entity, 'speed'), 56);
  assert.equal(liveStat(near.entity, 'speed'), 56);
  tickActiveEffects(near.entity, {}, () => 0);
  assert.equal(liveStat(near.entity, 'speed'), 56);
  tickActiveEffects(near.entity, {}, () => 0);
  assert.equal(liveStat(near.entity, 'speed'), 50);
  for (const excluded of [hostileNear, blocked, far, down]) assert.equal(liveStat(excluded.entity, 'speed'), 50);
});

test('Hunting Line supports all four ranged weapons and binds a sword follow-up to the marked foe', (t) => {
  offline(t);
  for (const template of [129, 130, 563, 564]) {
    const { entity, frame, pw, shots } = fighter(template, SKILLS.Archery, 100);
    entity.skills[SKILLS.LongBlade] = 100;
    entity.items.push({ group: 'Weapons', templateIndex: 131, stackCount: 2 });
    frame();
    assert.ok(requestHotbarAbility(entity, HUNTING_LINE).ok);
    for (let i = 0; i < 80 && !shots.length; i++) frame();
    assert.equal(shots.length, 1);
    assert.equal(entity.items[0].stackCount, 1);
    const { from, direction, ...options } = shots[0];
    const flight = new ArrowFlight({ getGpuMesh: () => null });
    flight.fire(from, direction, { ...options, fromPlayer: true });
    const missile = flight.arrows[0];
    assert.equal(!!missile.arc, template === 564);
    const target = hostile(0, 3), other = hostile(0, 1);
    missile.pos = [0, 1.4, 3];
    assert.ok(playerArrowHitFoe(missile, target, { playerEntity: entity, rolls: () => 0 }) > 0);
    assert.ok(abilityCooldown(entity, HUNTING_LINE) > 0);
    pw.weapon = createWeapon(120, 3, () => 0);
    for (let i = 0; i < 75; i++) frame();
    assert.equal(abilityCooldown(entity, HUNTING_LINE), 0);
    assert.ok(requestHotbarAbility(entity, HUNTING_LINE).ok);
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) hit = frame().includes('hit');
    assert.ok(hit);
    assert.deepEqual(pw.resolveHit([other, target], entity, clearSight, () => 0).map(r => r.foe), [target]);
    for (let i = 0; i < 40; i++) frame();
    assert.equal(requestHotbarAbility(entity, HUNTING_LINE).why, 'followup');
    assert.equal(entity.items[0].stackCount, 1);
  }
});

test('Predator’s Crossing follows its target through a dash and loses its mark on expiry or reload', (t) => {
  offline(t);
  for (const outcome of ['dash', 'expiry', 'load']) {
    const { entity, frame, pw, shots, tc } = fighter(130, SKILLS.Archery, 100);
    entity.skills[SKILLS.LongBlade] = 100;
    entity.items.push({ group: 'Weapons', templateIndex: 131, stackCount: 2 });
    frame();
    assert.ok(requestHotbarAbility(entity, PREDATORS_CROSSING).ok);
    for (let i = 0; i < 80 && !shots.length; i++) frame();
    const missile = { pos: [0, 1.4, 3], ...shots[0] };
    const foe = hostile(0, 3);
    assert.ok(playerArrowHitFoe(missile, foe, { playerEntity: entity, rolls: () => 0 }) > 0);
    pw.weapon = createWeapon(120, 3, () => 0);
    if (outcome === 'load') restoreAbilityProgress(entity, entity.combatAbilities, true);
    for (let i = 0; i < (outcome === 'expiry' ? 320 : 90); i++) frame();
    if (outcome === 'dash') {
      const motor = { grounded: true, techFlight: false,
        techniqueLaunch() { this.grounded = false; this.techFlight = true; return true; } };
      tc.door.motor = () => motor;
      tc.collider = { raycast: (from, dir) => dir[1] < 0 ? from[1] : Infinity };
      assert.ok(requestHotbarAbility(entity, PREDATORS_CROSSING).ok);
      for (let i = 0; i < 24 && motor.grounded; i++) frame();
      assert.equal(motor.techFlight, true);
      tc.cam.feet[2] = tc.cam.pos[2] = 3.5;
      motor.grounded = true;
      let hit = false;
      for (let i = 0; i < 36 && !hit; i++) hit = frame().includes('hit');
      assert.ok(hit);
      assert.deepEqual(pw.resolveHit([hostile(0, 2), foe], entity, clearSight, () => 0).map(r => r.foe), [foe]);
    } else {
      assert.equal(requestHotbarAbility(entity, PREDATORS_CROSSING).why, 'followup');
    }
  }
});

test('Titan’s Hands opens on one target and sweeps multiple foes with blunt or unarmed delivery', (t) => {
  offline(t);
  for (const [template, skill] of [[null, SKILLS.HandToHand], [124, SKILLS.BluntWeapon]]) {
    const { entity, pw, frame } = fighter(template, skill, 100);
    entity.skills[SKILLS.BluntWeapon] = entity.skills[SKILLS.HandToHand] = 100;
    frame();
    assert.ok(combinationDelivery(KNOCKOUT_CHAIN, pw.weapon).stages[0].control.poiseShare > 0);
    assert.ok(requestHotbarAbility(entity, TITANS_HANDS).ok);
    const targets = [hostile(0, 1.4), hostile(-1, 1.2), hostile(1, 1.2)];
    const hits = [];
    for (let i = 0; i < 100; i++) {
      if (!frame().includes('hit')) continue;
      hits.push(pw.resolveHit(targets, entity, clearSight, () => 0).length);
    }
    assert.deepEqual(hits, [1, 3]);
  }
});
