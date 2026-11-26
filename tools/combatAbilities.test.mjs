import assert from 'node:assert/strict';
import test from 'node:test';
import { SKILLS } from '../src/characters/skills.js';
import { equipTableOf, EQUIP_SLOTS } from '../src/characters/equip.js';
import { ABILITIES, abilityById } from '../src/combat/abilities/registry.js';
import { learnedAbility, restoreAbilityProgress, saveAbilityProgress, syncAbilityUnlocks } from '../src/combat/abilities/progress.js';
import { createAbilityEngine } from '../src/combat/abilities/engine.js';
import { PREVIEW_THRUST, requestHotbarAbility, stepAbilityRig, abilityCooldown, offsetAbilities } from '../src/combat/abilities/rig.js';
import { PlayerWeapon } from '../src/combat/playerWeapon.js';
import { requestUtility, stepUtilityTimers, utilityCooldown } from '../src/combat/abilities/utility.js';
import { utilityProfile } from '../src/combat/abilities/utilityProfiles.js';
import { applySpell, hasActiveEffect, entityIsParalyzed } from '../src/magic/effects.js';
import { snapshotPlayer, restorePlayer } from '../src/saves/save.js';
import { makeAnchor, WORLD_CONTEXT } from '../src/travel/teleportAnchor.js';
import { ChargenFlow } from '../src/ui/chargen.js';
import { chargenHit } from '../src/ui/chargenArt.js';
import { EXTRA_RACE_TEMPLATES, PLAYABLE_RACE_TEMPLATES, RACE_TEMPLATES, artRaceOf, raceArt, raceById } from '../src/characters/races.js';
import { racialDelivery, RACIAL_FAVORITES, RACIAL_TRAITS } from '../src/combat/abilities/racialProfiles.js';
import { noteRacialReadiness, racialGuardDamage, racialPace } from '../src/combat/abilities/racialIdentity.js';
import { calculateAttackDamage, racialModifiers } from '../src/combat/formulas.js';
import { installPcaao, pcaaoRacialModifiers, uninstallPcaao } from '../src/combat/pcaao.js';
import { PlayerMotor } from '../src/player/motor.js';
import { createWeapon } from '../src/combat/enemyEquipment.js';
import { liveStat } from '../src/characters/statMods.js';
import { consumeDoorSpell, doorSpellFor } from '../src/scenes/shared.js';
import { setPlayerDoor } from '../src/player/playerDoor.js';
import { hotbarEntry, hotbarEntryForAbility, hotbarEntryForWeaponRank, hotbarPress, hotbarView, quickslotSaveData, restoreQuickslotSaveData, setHotbarSlot } from '../src/items/quickslots.js';

const longsword = { templateIndex: 120, group: 'Weapons' };
const makeEntity = () => ({ isPlayer: true, race: 'Nord', skills: [], fatigue: 1000, health: 100 });

test('extra character creation races keep their identity and racial ability when saved', (t) => {
  const previous = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => { if (previous) globalThis.location = previous; else delete globalThis.location; });
  assert.equal(RACE_TEMPLATES.length, 8);
  assert.equal(new Set(PLAYABLE_RACE_TEMPLATES.map(race => race.id)).size, 11);
  for (const [i, race] of EXTRA_RACE_TEMPLATES.entries()) {
    const flow = new ChargenFlow([]);
    flow.applyHit(chargenHit(flow, 230, 182));
    assert.equal(flow.extraRacesOpen, true);
    flow.applyHit(chargenHit(flow, 110, 80 + i * 18));
    assert.ok(flow.raceConfirm?.length);
    flow.applyHit({ confirmRace: true });
    assert.equal(flow.state, 'gender');
    assert.equal(flow.race, race);
    assert.equal(raceById(race.id), race);
    const entity = { ...makeEntity(), race: race.key, raceId: race.id, faceIndex: 7, gender: 'female', items: [] };
    const restored = makeEntity();
    restorePlayer(restored, snapshotPlayer(entity));
    assert.equal(restored.race, race.key);
    assert.equal(restored.raceId, race.id);
    assert.equal(restored.faceIndex, 7);
    assert.equal(artRaceOf(restored), race.artRace);
    assert.equal(raceArt(race.key, 'female').heads, raceArt(race.artRace, 'female').heads);
    const id = ABILITIES.find(ability => ability.race === race.key).id;
    assert.ok(learnedAbility(restored, id));
    assert.ok(racialDelivery(id));
  }
});

test('the preview applies the same conditional racial accuracy in both combat cores', (t) => {
  const previous = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => { if (previous) globalThis.location = previous; else delete globalThis.location; });
  for (const race of PLAYABLE_RACE_TEMPLATES) {
    const entity = { ...makeEntity(), race: undefined, raceId: race.id, health: 50, maxHealth: 100 };
    const favorites = RACIAL_FAVORITES[race.key];
    assert.equal(new Set(favorites).size, 2);
    const expected = { damageMod: 0, toHitMod: 4 };
    for (const favorite of favorites) {
      const weapon = favorite === 'bare' ? null : { templateIndex: favorite };
      assert.deepEqual(racialModifiers(entity, weapon), expected);
      assert.deepEqual(pcaaoRacialModifiers(entity, weapon), expected);
    }
    const zero = { damageMod: 0, toHitMod: 0 };
    assert.deepEqual(racialModifiers(entity, { templateIndex: 122 }), zero);
    entity.health = 49;
    assert.deepEqual(pcaaoRacialModifiers(entity, { templateIndex: favorites[0] }), zero);
  }
  const redguard = { ...makeEntity(), race: 'Redguard', raceId: 2, level: 30, maxHealth: 100, _online: true };
  const classic = { damageMod: 10, toHitMod: 10 };
  assert.deepEqual(racialModifiers(redguard, longsword), classic);
  redguard._online = false;
  globalThis.location.search = '';
  assert.deepEqual(racialModifiers(redguard, longsword), classic);
});

test('each race has a conditional preview movement perk and a defensive passive', (t) => {
  const previous = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => { if (previous) globalThis.location = previous; else delete globalThis.location; });
  const hostile = {};
  for (const race of PLAYABLE_RACE_TEMPLATES) {
    const trait = RACIAL_TRAITS[race.key];
    assert.ok(trait.passive, race.key);
    const entity = { ...makeEntity(), race: race.key, maxHealth: 100, health: 30, fatigue: 4000,
      stats: { strength: 50, endurance: 50 },
      activeEffects: [{ kind: 'decoy' }] };
    if (race.key === 'Imperial') noteRacialReadiness(entity, longsword, true, false);
    else if (race.key === 'Khajiit') noteRacialReadiness(entity, null, false, false);
    else noteRacialReadiness(entity, longsword, false, true);
    const motor = { isRunning: race.key === 'Lungaris', isSneaking: race.key === 'WoodElf',
      swimming: race.key === 'Argonian' };
    assert.equal(racialPace(entity, trait.pace, motor, true), 1.06, race.key);
    assert.equal(racialPace(entity, 'levitate', motor, true), 1);
    if (trait.guard) {
      const kind = trait.guard === 'physical' ? 'melee' : trait.guard;
      assert.equal(racialGuardDamage(100, hostile, entity, kind), 94, race.key);
      assert.equal(racialGuardDamage(100, { isPlayer: true }, entity, kind), 100);
      assert.equal(racialGuardDamage(100, hostile, entity, 'spell'), 100);
      assert.equal(racialGuardDamage(1, hostile, entity, kind), 1);
    } else {
      assert.ok(race.resistanceFlags || race.immunityFlags, race.key);
    }
    entity._online = true;
    assert.equal(racialPace(entity, trait.pace, motor, true), 1);
    assert.equal(racialGuardDamage(100, hostile, entity, 'melee'), 100);
  }
});

test('racial pace reaches player displacement and guarded hits use both combat cores', (t) => {
  const previous = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => { uninstallPcaao(); if (previous) globalThis.location = previous; else delete globalThis.location; });
  const entity = { ...makeEntity(), race: 'Nord', maxHealth: 100, health: 30 };
  const collider = { move(pos, x, y, z) { pos[0] += x; pos[2] += z; return { grounded: y <= 0 }; } };
  const walk = () => {
    const motor = new PlayerMotor(collider, { speed: 50, running: 30, swimming: 30,
      racialPace: (mode, motor) => racialPace(entity, mode, motor) });
    motor.grounded = true;
    motor.update(.1, { forward: 1, strafe: 0 }, 0);
    return motor.pos[2];
  };
  const wounded = walk();
  entity.health = 100;
  assert.ok(Math.abs(wounded / walk() - 1.06) < 1e-6);
  const attacker = { level: 20, isClass: true, skills: new Array(35).fill(100),
    stats: { strength: 80, agility: 80, speed: 80, luck: 80 }, items: [] };
  const sword = createWeapon(120, 4);
  const damage = race => calculateAttackDamage(attacker, {
    ...entity, race, health: 30, armorValues: Array(7).fill(100), items: [], stats: { agility: 50, luck: 50 },
  }, { weapon: sword, damageMod: 85, blowShare: rolled => rolled * 10, rolls: () => 0 });
  for (const overhaul of [false, true]) {
    if (overhaul) installPcaao({ read: key => key === 'Enabled' || key === 'armorHitFormulaRedone' });
    const base = damage('Breton');
    assert.ok(base > 40);
    assert.equal(damage('Imperial'), Math.round(base * .94));
  }
});

test('registry keeps every planned action, with no firearm delivery', () => {
  assert.equal(ABILITIES.length, 145);
  assert.equal(new Set(ABILITIES.map(a => a.id)).size, ABILITIES.length);
  assert.equal(ABILITIES.filter(a => a.category === 'weapon').length, 92);
  assert.equal(ABILITIES.filter(a => a.category === 'combination').length, 30);
  const pairs = new Map();
  for (const ability of ABILITIES.filter(a => a.category === 'combination')) {
    const skillPair = [...ability.skills].sort().join(',');
    pairs.set(skillPair, [...(pairs.get(skillPair) ?? []), ability.rank]);
  }
  assert.equal(pairs.size, 15);
  assert.ok([...pairs.values()].every(ranks => ranks.length === 2 && ranks.includes(75) && ranks.includes(100)));
  assert.ok(ABILITIES.every(a => a.skills.every(Number.isInteger)));
  assert.ok(ABILITIES.every(a => !a.templates?.some(template => [560, 561, 562].includes(template))));
});

test('a veteran can gain all eligible pairs and reload with the historical path and over-cap skills intact', (t) => {
  const previous = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => { if (previous) globalThis.location = previous; else delete globalThis.location; });
  const veteran = { ...makeEntity(), characterId: 'phase4-veteran', martialPath: 'brawler', items: [] };
  for (const skill of [SKILLS.ShortBlade, SKILLS.LongBlade, SKILLS.Axe, SKILLS.BluntWeapon, SKILLS.HandToHand, SKILLS.Archery]) {
    veteran.skills[skill] = 160;
  }
  const oldSave = snapshotPlayer(veteran);
  delete oldSave.combatAbilities;
  const restored = makeEntity();
  restorePlayer(restored, oldSave);
  assert.equal(restored.combatAbilities.learned.filter(id => id.startsWith('combination.')).length, 30);
  assert.equal(restored.skills[SKILLS.ShortBlade], 160);
  assert.equal(restored.martialPath, 'brawler');
  const snapshot = snapshotPlayer(restored);
  globalThis.location = { search: '' };
  restorePlayer(restored, snapshot);
  assert.equal(restored.martialPath, 'brawler');
  assert.equal(restored.combatAbilities.learned.filter(id => id.startsWith('combination.')).length, 30);
  assert.equal(restored.skills[SKILLS.ShortBlade], 160);
});

test('unlock migration uses trained ranks and preserves prior unlocks with the feature off', () => {
  const entity = makeEntity();
  const combination = ABILITIES.find(a => a.id.endsWith('.blade-weave'));
  entity.skills[SKILLS.LongBlade] = 25;
  restoreAbilityProgress(entity, null, true);
  assert.ok(learnedAbility(entity, PREVIEW_THRUST));
  assert.ok(!learnedAbility(entity, combination.id));
  assert.ok(!learnedAbility(entity, 'utility.adventurers-lantern'));
  assert.ok(learnedAbility(entity, 'utility.unbound-will'));
  assert.ok(!learnedAbility(entity, 'utility.wayfarers-anchor-mark'));
  entity.skills[SKILLS.LongBlade] = 75;
  entity.skills[SKILLS.ShortBlade] = 75;
  assert.ok(syncAbilityUnlocks(entity).includes(combination.id));
  assert.deepEqual(syncAbilityUnlocks(entity), []);
  const snapshot = saveAbilityProgress(entity);
  const veteran = makeEntity();
  restoreAbilityProgress(veteran, snapshot, false);
  assert.ok(learnedAbility(veteran, combination.id));
  assert.ok(learnedAbility(veteran, PREVIEW_THRUST));
  assert.deepEqual(saveAbilityProgress(veteran), snapshot);
});

test('utility pilot uses one trained family, keeps separate saved anchors and spends no magicka', (t) => {
  const old = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => { if (old) globalThis.location = old; else delete globalThis.location; });
  const entity = { ...makeEntity(), items: [], magicka: 0, activeEffects: [{ kind: 'paralyze', rounds: 9 }] };
  entity.skills[SKILLS.Archery] = 29;
  entity.skills[SKILLS.Axe] = 20;
  restoreAbilityProgress(entity, null, true);
  const travel = [];
  const door = {
    player: () => entity, castOnPlayer: bundle => applySpell(bundle, 5, entity, {}, () => 0),
    utilityTravel: action => { travel.push(action); },
  };
  const mark = 'utility.wayfarers-anchor-mark', recall = 'utility.wayfarers-anchor-recall';
  assert.equal(requestUtility(entity, mark, door).why, 'locked');
  entity.skills[SKILLS.Archery] = 30;
  syncAbilityUnlocks(entity);
  assert.equal(requestUtility(entity, recall, door).why, 'anchor');
  assert.equal(requestUtility(entity, 'utility.adventurers-lantern', door).why, 'unavailable');
  assert.equal(requestUtility(entity, 'utility.unbound-will', door).ok, true);
  assert.equal(requestUtility(entity, 'utility.unbound-will', door).why, 'cooldown');
  assert.ok(hasActiveEffect(entity, 'freeAction'));
  assert.equal(entityIsParalyzed(entity), false);
  assert.equal(entity.magicka, 0);
  assert.equal(requestUtility(entity, mark, door).ok, true);
  entity.wayfarerAnchor = makeAnchor({ worldContext: WORLD_CONTEXT.Exterior, pixel: { x: 100, y: 100 }, nativeX: 20, nativeZ: 20, y: 2 });
  assert.equal(requestUtility(entity, recall, door).ok, true);
  assert.equal(requestUtility(entity, mark, door).why, 'cooldown');
  assert.equal(requestUtility(entity, recall, door).why, 'cooldown');
  assert.equal(requestUtility(entity, 'utility.featherstep', door).ok, true);
  assert.equal(requestUtility(entity, 'utility.featherstep', door).why, 'cooldown');
  for (let i = 0; i < 180; i++) stepUtilityTimers(entity, .25);
  assert.equal(utilityCooldown(entity, 'utility.featherstep'), 0);
  assert.equal(utilityCooldown(entity, 'utility.unbound-will'), 15000);
  assert.equal(utilityCooldown(entity, recall), 75000);
  assert.deepEqual(travel, ['mark', 'recall']);
  assert.equal(entity.anchorPosition, undefined);
  const restored = makeEntity();
  restorePlayer(restored, snapshotPlayer(entity));
  assert.deepEqual(restored.wayfarerAnchor, entity.wayfarerAnchor);
  assert.equal(restored.anchorPosition, null);
  assert.ok(learnedAbility(restored, mark));
});

test('all universal utilities use trained ranks and the nine new actions produce their game effects', (t) => {
  const old = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => { setPlayerDoor(null); if (old) globalThis.location = old; else delete globalThis.location; });
  const utilities = ABILITIES.filter(ability => ability.category === 'utility');
  assert.equal(utilities.length, 12);
  for (const ability of utilities) {
    const novice = makeEntity();
    novice.skills[SKILLS.Axe] = ability.rank - 1;
    novice.skills[SKILLS.Archery] = ability.rank - 1;
    restoreAbilityProgress(novice, null, true);
    assert.ok(utilityProfile(ability.id));
    assert.equal(learnedAbility(novice, ability.id), false);
    novice.skills[SKILLS.Archery]++;
    syncAbilityUnlocks(novice);
    assert.ok(learnedAbility(novice, ability.id));
  }
  const entity = { ...makeEntity(), level: 10, stats: { speed: 50 }, magicka: 0, activeEffects: [] };
  entity.skills[SKILLS.HandToHand] = 50;
  restoreAbilityProgress(entity, null, true);
  const foe = { entity: { health: 100 }, ai: { feet: [0, 0, 10], isHostile: true } };
  const nearby = [];
  const door = { player: () => entity, feet: () => [0, 0, 0], foes: () => nearby,
    castOnPlayer: bundle => applySpell(bundle, 10, entity, {}, () => 0, null, { bypassChance: true }) };
  setPlayerDoor(door);
  const cast = action => requestUtility(entity, 'utility.' + action);
  assert.ok(cast('trailblazer').ok);
  assert.equal(liveStat(entity, 'speed'), 62);
  nearby.push(foe);
  stepUtilityTimers(entity, .05);
  assert.equal(liveStat(entity, 'speed'), 50);
  assert.equal(cast('trailblazer').why, 'combat');
  assert.ok(cast('breakaway').ok);
  assert.equal(liveStat(entity, 'speed'), 68);
  assert.ok(hasActiveEffect(entity, 'chameleonNormal'));
  assert.equal(cast('breakaway').why, 'cooldown');
  assert.equal(utilityCooldown(entity, 'utility.breakaway'), 22000);
  for (let i = 0; i < 88; i++) stepUtilityTimers(entity, .25);
  assert.equal(utilityCooldown(entity, 'utility.breakaway'), 0);
  for (const [id, kind] of [
    ['featherstep', 'slowfall'], ['hunters-awareness', 'detectEnemy'], ['deepwater-training', 'waterBreathing'],
    ['riverstride', 'waterWalking'], ['skyward-ascent', 'levitate'],
  ]) {
    assert.ok(cast(id).ok, id);
    assert.ok(hasActiveEffect(entity, kind), kind);
  }
  entity.activeEffects.push({ kind: 'poison', roundsRemaining: 9 });
  assert.ok(cast('field-antidote').ok);
  assert.equal(hasActiveEffect(entity, 'poison'), false);
  assert.equal(doorSpellFor(entity), null);
  assert.ok(cast('lockbreaker').ok);
  assert.deepEqual(doorSpellFor(entity), { kind: 'open', holderLevel: 10, skeletonKey: false });
  consumeDoorSpell(entity, 'open');
  assert.equal(doorSpellFor(entity), null);
  door.previewUtilityRefusal = () => 'This area blocks levitation';
  assert.deepEqual(cast('skyward-ascent'), { ok: false, why: 'unavailable', message: 'This area blocks levitation' });
  assert.equal(entity.magicka, 0);
});

function fixture() {
  const events = [];
  const entity = makeEntity();
  entity.skills[SKILLS.LongBlade] = 100;
  syncAbilityUnlocks(entity);
  let available = 5;
  let accept = true;
  let releases = 0;
  const ctx = {
    enabled: true, ready: true, online: false, duel: false, entity,
    weapon: longsword, fatigue: 10, ammo: 3, owner: {},
  };
  const engine = createAbilityEngine({
    deliveryFor: () => ({ fatigue: 4, ammo: 1, cooldownMs: 700, windUpMs: 120, activeMs: 80, recoveryMs: 150, impactsMs: [0, 75] }),
    reserve: () => { available--; return () => { available++; }; },
    release: () => { releases++; return accept; },
    event: (name, cast, beat) => events.push([name, cast.id, beat]),
  });
  return { engine, ctx, events, spent: () => 5 - available, releases: () => releases, refuse: () => { accept = false; } };
}

test('successful weapon capstones delay combination capstones and leave lower ranks usable', () => {
  const { engine, ctx } = fixture();
  ctx.entity.skills[SKILLS.ShortBlade] = 100;
  syncAbilityUnlocks(ctx.entity);
  const combination = ABILITIES.find(a => a.category === 'combination' && a.rank === 100 && a.skills.includes(SKILLS.LongBlade) && a.skills.includes(SKILLS.ShortBlade));
  assert.ok(engine.request('weapon.longsword.kings-measure', ctx).ok);
  engine.step(120, ctx);
  engine.step(250, ctx);
  assert.equal(engine.request(combination.id, ctx).why, 'cooldown');
  assert.equal(engine.cooldown(PREVIEW_THRUST), 0);
  for (let i = 0; i < 112; i++) engine.step(250, ctx);
  assert.ok(engine.request(combination.id, ctx).ok);
});

test('casts own their cue order, cooldown, and one resource commit', () => {
  const { engine, ctx, events, spent, releases } = fixture();
  assert.deepEqual(engine.request(PREVIEW_THRUST, ctx), { ok: true, castId: 1 });
  assert.equal(engine.request(PREVIEW_THRUST, ctx).why, 'busy');
  engine.step(119, ctx);
  assert.equal(releases(), 0);
  engine.step(1, ctx);
  assert.equal(releases(), 1);
  assert.equal(spent(), 1);
  assert.deepEqual(events.map(e => e[0]), ['wind-up', 'release', 'impact-cue']);
  engine.step(80, ctx);
  engine.step(150, ctx);
  assert.deepEqual(events.map(e => e[0]), ['wind-up', 'release', 'impact-cue', 'impact-cue', 'recovery', 'done']);
  assert.equal(engine.request(PREVIEW_THRUST, ctx).why, 'cooldown');
});

test('online and untrusted actors cannot cast, and release rechecks its own context', () => {
  const { engine, ctx, spent, releases, refuse } = fixture();
  assert.equal(engine.request(PREVIEW_THRUST, { ...ctx, online: true }).why, 'unavailable');
  assert.equal(engine.request(PREVIEW_THRUST, { ...ctx, duel: true }).why, 'unavailable');
  assert.equal(engine.request(PREVIEW_THRUST, { ...ctx, entity: { ...ctx.entity, peer: true } }).why, 'unavailable');
  assert.equal(engine.request(PREVIEW_THRUST, { ...ctx, weapon: null }).why, 'weapon');
  assert.equal(engine.request(PREVIEW_THRUST, { ...ctx, ammo: 0 }).why, 'ammo');
  assert.ok(engine.request(PREVIEW_THRUST, ctx).ok);
  engine.step(120, { ...ctx, owner: {} });
  assert.equal(spent(), 0);
  assert.equal(releases(), 0);
  assert.ok(engine.request(PREVIEW_THRUST, ctx).ok);
  engine.step(120, { ...ctx, fatigue: 0 });
  assert.equal(releases(), 0);
  assert.ok(engine.request(PREVIEW_THRUST, ctx).ok);
  refuse();
  engine.step(120, ctx);
  assert.equal(spent(), 0);
  assert.equal(releases(), 1);
  assert.equal(engine.cooldown(PREVIEW_THRUST), 0);
});

test('ability slots save, move and refuse activation while the feature is off', () => {
  const entry = hotbarEntryForAbility(PREVIEW_THRUST);
  assert.equal(entry.name, abilityById(PREVIEW_THRUST).name);
  restoreQuickslotSaveData({ hotbar: [entry] });
  assert.ok(setHotbarSlot(2, entry));
  assert.equal(hotbarEntry(0), null);
  assert.deepEqual(quickslotSaveData().hotbar[2], entry);
  assert.equal(hotbarPress(2, { entity: makeEntity() }).kind, 'refused');
});

test('the same four saved hotbar slots follow the active weapon', (t) => {
  const previous = quickslotSaveData();
  const oldLocation = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => {
    restoreQuickslotSaveData(previous);
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
  });
  const entity = makeEntity();
  const worn = equipTableOf(entity);
  const ranks = [25, 50, 75, 100].map(hotbarEntryForWeaponRank);
  const spell = { type: 'spell', index: 12, name: 'Heal' };
  const capstone = hotbarEntryForAbility('weapon.longsword.kings-measure');
  restoreQuickslotSaveData({ hotbar: [...ranks, spell, capstone] });
  worn[EQUIP_SLOTS.RightHand] = longsword;
  const pw = new PlayerWeapon({});
  pw.weapon = longsword;
  const tc = { entity, pw, rig: {} };
  const ids = style => ABILITIES.filter(ability => ability.id.startsWith('weapon.' + style + '.')).map(ability => ability.id);
  assert.deepEqual(hotbarView(entity).slice(0, 4).map(slot => slot.id), ids('longsword'));
  stepAbilityRig(0, tc);
  pw.weapon = { templateIndex: 113, group: 'Weapons' };
  assert.deepEqual(hotbarView(entity).slice(0, 4).map(slot => slot.id), ids('dagger'));
  assert.deepEqual(quickslotSaveData().hotbar.slice(0, 6), [...ranks, spell, capstone]);
});

test('offline preview reaches the weapon machine and restores cleanly between saves', (t) => {
  const previous = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => {
    if (previous === undefined) delete globalThis.location;
    else globalThis.location = previous;
  });
  const entity = makeEntity();
  entity.skills[SKILLS.LongBlade] = 25;
  const pw = new PlayerWeapon({});
  pw.weapon = longsword;
  pw.sheathed = false;
  const tc = {
    entity, pw, rig: {}, ready: true, cam: { feet: [0, 0, 0], yaw: 0 },
    startSwing: strike => pw.techniqueStrike(strike),
  };
  stepAbilityRig(0, tc);
  assert.ok(requestHotbarAbility(entity, PREVIEW_THRUST).ok);
  assert.equal(pw.machine.state, 'Idle');
  assert.ok(stepAbilityRig(0.25, tc));
  assert.equal(pw.machine.state, 'StrikeUp');
  assert.equal(entity.fatigue, 936);
  assert.ok(abilityCooldown(entity, PREVIEW_THRUST) > 0);
  assert.deepEqual(pw.resolveHit([{ entity: { isPlayer: true } }, { entity: {}, puppet: true }], entity,
    () => assert.fail('A player or puppet reached the ability hit test')), []);
  const save = saveAbilityProgress(entity);
  restoreAbilityProgress(entity, save, true);
  assert.equal(abilityCooldown(entity, PREVIEW_THRUST), 0);
  assert.equal(requestHotbarAbility(entity, PREVIEW_THRUST).why, 'busy');
  stepAbilityRig(0, tc);
  assert.equal(pw.techniqueBlow.cancelled, true);
});

test('Wayfarer’s Anchor Mark leaves a lantern on the ground there until Recall consumes the anchor', (t) => {
  const old = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => { if (old) globalThis.location = old; else delete globalThis.location; setPlayerDoor(null); });
  const entity = { ...makeEntity(), items: [], magicka: 0 };
  entity.skills[SKILLS.Archery] = 30;
  restoreAbilityProgress(entity, null, true);
  syncAbilityUnlocks(entity);
  let feet = [4, 1, 9];
  const lanterns = [];
  const door = {
    player: () => entity, feet: () => feet, fx: (recipe, at) => { if (recipe === 'wayfarer-lantern') lanterns.push([...at]); },
    utilityTravel: action => {
      if (action === 'mark') entity.wayfarerAnchor = makeAnchor({ pixel: { x: 1, y: 1 }, nativeX: 4, nativeZ: 9, y: 1 });
      else entity.wayfarerAnchor = null;
      return true;
    },
  };
  setPlayerDoor(door);
  assert.equal(requestUtility(entity, 'utility.wayfarers-anchor-mark', door).ok, true);
  feet = [20, 1, 30];
  for (let i = 0; i < 8; i++) stepUtilityTimers(entity, .25);
  assert.ok(lanterns.length >= 3, 'the lantern keeps burning while the player is near');
  assert.ok(lanterns.every(at => at[0] === 4 && at[1] === 1 && at[2] === 9), 'at the marked spot, not the player');
  feet = [400, 1, 30];
  const seen = lanterns.length;
  for (let i = 0; i < 8; i++) stepUtilityTimers(entity, .25);
  assert.equal(lanterns.length, seen, 'not drawn from far away');
  setPlayerDoor({ ...door });
  feet = [4, 1, 9];
  for (let i = 0; i < 8; i++) stepUtilityTimers(entity, .25);
  assert.equal(lanterns.length, seen, 'not drawn in another scene');
  setPlayerDoor(door);
  assert.equal(requestUtility(entity, 'utility.wayfarers-anchor-recall', door).ok, true);
  for (let i = 0; i < 8; i++) stepUtilityTimers(entity, .25);
  assert.equal(lanterns.length, seen, 'Recall puts the lantern out');
});

test('the Wayfarer lantern moves with the floating origin of the scene it was set in', (t) => {
  const old = globalThis.location;
  globalThis.location = { search: '?abilities' };
  t.after(() => { if (old) globalThis.location = old; else delete globalThis.location; setPlayerDoor(null); });
  const entity = { ...makeEntity(), items: [], magicka: 0 };
  entity.skills[SKILLS.Archery] = 30;
  restoreAbilityProgress(entity, null, true);
  syncAbilityUnlocks(entity);
  let feet = [810, 1, 9];
  const lanterns = [];
  const door = {
    player: () => entity, feet: () => feet, fx: (recipe, at) => { if (recipe === 'wayfarer-lantern') lanterns.push([...at]); },
    utilityTravel: action => {
      if (action === 'mark') entity.wayfarerAnchor = makeAnchor({ pixel: { x: 1, y: 1 }, nativeX: 810, nativeZ: 9, y: 1 });
      return true;
    },
  };
  setPlayerDoor(door);
  assert.equal(requestUtility(entity, 'utility.wayfarers-anchor-mark', door).ok, true);
  offsetAbilities([-819.2, 0, 0], entity);
  feet = [830 - 819.2, 1, 9];
  for (let i = 0; i < 8; i++) stepUtilityTimers(entity, .25);
  assert.ok(lanterns.length >= 3, 'still burning 20 m away after the shift');
  assert.ok(lanterns.every(at => Math.abs(at[0] - (810 - 819.2)) < 1e-9 && at[2] === 9), 'at the shifted mark');
  setPlayerDoor({ ...door });
  offsetAbilities([819.2, 0, 0], entity);
  setPlayerDoor(door);
  lanterns.length = 0;
  for (let i = 0; i < 4; i++) stepUtilityTimers(entity, .25);
  assert.ok(lanterns.every(at => Math.abs(at[0] - (810 - 819.2)) < 1e-9), "another scene's shift leaves it in place");
});
