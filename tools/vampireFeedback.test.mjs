import assert from 'node:assert/strict';
import test from 'node:test';
import { MINUTES_PER_DAY } from '../src/world/gameDate.js';
import { advanceOwnMinutes, ownMinutes, setWorldMinutes, worldMinutes, playerWeaponHitEntity, blowFeedDamage, tickPlayerMinutes, setSharedClock, CLASSIC_MINUTES_PER_SECOND } from '../src/world/worldTick.js';
import { clearSkippedSpans, skippedMinutesIn } from '../src/world/skippedTime.js';
import { setTimeScale } from '../src/world/timeScale.js';
import { createPlayerTicker } from '../src/scenes/shared.js';
import { thrallState, thrallRound, prisoners } from '../src/systems/vampire/thralls.js';
import { playerArrowHitFoe } from '../src/combat/arrowFlight.js';
import { createWeapon } from '../src/combat/enemyEquipment.js';
import { SKILLS } from '../src/characters/skills.js';
import { snapshotPlayer, restorePlayer } from '../src/saves/save.js';
import { VAMPIRE_CLANS } from '../src/afflictions/infection.js';
import { vitaeNow, feedVampire, spendMindCloud } from '../src/systems/vampire/vitae.js';
import {
  VITAE_DRAIN_PER_DAY, TRAVEL_DRAIN_MUL, TRAVEL_DRAIN_FLOOR, bloodQualityName, bloodTag, FEEDS, STALE_QUALITY_CAP,
  BLOOD_FADE_PER_DAY, RESONANCE_TIERS,
} from '../src/systems/vampire/bloodLaw.js';
import { feedOnPerson } from '../src/scenes/vampire/vampireFeed.js';
import { tutorialById, TUTORIALS } from '../src/ui/tutorials.js';

const vampire = (clan, vitae = 75, at = 0) => ({
  racialOverride: {},
  activeEffects: [{ kind: 'racialOverride', racial: 'vampirism', clan, awakened: true, vitae, vitaeAt: at, blood: null, statMods: {}, skillMods: {} }],
});
const { Garlythi, Thrafey, Vraseth, Lyrezi } = VAMPIRE_CLANS;

test('resting or loitering three days drains at the gentle rate, in ten-minute steps', () => {
  setWorldMinutes(0);
  clearSkippedSpans();
  const v = vampire(Lyrezi, 80);
  for (let m = 0; m < 3 * MINUTES_PER_DAY; m += 10) { advanceOwnMinutes(10); vitaeNow(v, ownMinutes()); }
  assert.equal(Math.round(vitaeNow(v, ownMinutes())), Math.round(80 - 3 * VITAE_DRAIN_PER_DAY * TRAVEL_DRAIN_MUL));
  const low = vampire(Lyrezi, 30, ownMinutes());
  for (let m = 0; m < 3 * MINUTES_PER_DAY; m += 10) { advanceOwnMinutes(10); vitaeNow(low, ownMinutes()); }
  assert.ok(30 - 3 * VITAE_DRAIN_PER_DAY * TRAVEL_DRAIN_MUL < TRAVEL_DRAIN_FLOOR, 'the rest would pass the floor without it');
  assert.equal(Math.round(vitaeNow(low, ownMinutes())), TRAVEL_DRAIN_FLOOR, 'a long rest stops at Hungry');
});

const tickBody = () => ({ isPlayer: true, skills: [], stats: { strength: 50, endurance: 50, agility: 50, luck: 50, speed: 50, willpower: 50 } });

test('every time raise records a skipped span: offline and online ticker, advanceOwnMinutes, and an accelerated journey', () => {
  setWorldMinutes(0);
  clearSkippedSpans();
  advanceOwnMinutes(30);
  assert.equal(skippedMinutesIn(0, 30), 30, 'advanceOwnMinutes');
  const ticker = createPlayerTicker(tickBody());
  ticker.advance(40);
  assert.equal(skippedMinutesIn(30, 70), 40, 'the offline ticker advance');
  const from = worldMinutes();
  setTimeScale(60);
  try { tickPlayerMinutes({ entity: tickBody(), classicMinutes: from, dt: 20 / CLASSIC_MINUTES_PER_SECOND, realSeconds: 0, sinks: {}, activity: {} }); } finally { setTimeScale(1); }
  assert.equal(skippedMinutesIn(from, from + 20), 20, 'an accelerated journey');
  clearSkippedSpans();
  const t0 = worldMinutes();
  tickPlayerMinutes({ entity: tickBody(), classicMinutes: t0, dt: 20 / CLASSIC_MINUTES_PER_SECOND, realSeconds: 20 / CLASSIC_MINUTES_PER_SECOND, sinks: {}, activity: {} });
  assert.equal(skippedMinutesIn(t0, t0 + 20), 0, 'a played frame at real speed skips nothing');
  setSharedClock(() => 5000);
  try {
    const online = tickBody();
    tickPlayerMinutes({ entity: online, classicMinutes: 5000, dt: 0, realSeconds: 0, raiseMinutes: 50, sinks: {}, activity: {} });
    assert.equal(skippedMinutesIn(ownMinutes() - 50, ownMinutes()), 50, 'the online raise');
  } finally { setSharedClock(null); }
});

test('thrall upkeep: a three-day loiter is one day, three days played are three', () => {
  setWorldMinutes(0);
  clearSkippedSpans();
  const s = thrallState();
  const run = (skip) => {
    s.upkeepDay = Math.floor(ownMinutes() / MINUTES_PER_DAY);
    s.servants.length = 0;
    s.servants.push({ id: 'sv', name: 'Test', loyalty: 50, duty: 'idle' });
    const v = vampire(Lyrezi, 90, ownMinutes());
    if (skip) for (let m = 0; m < 3 * MINUTES_PER_DAY; m += 10) { advanceOwnMinutes(10); thrallRound(v, ownMinutes()); }
    else { setWorldMinutes(ownMinutes() + 3 * MINUTES_PER_DAY + 5); thrallRound(v, ownMinutes()); }
    return s.servants[0].loyalty;
  };
  assert.equal(run(true), 55);
  assert.equal(run(false), 65);
  s.servants.length = 0;
});

test('taking someone to the Haven needs the Kiss\'s Vitae, and a full Haven refuses before any is spent', () => {
  const town = { witnesses: () => [], slain() {}, retire() {} };
  const take = (v, fill) => {
    const person = { nameNPC: 'Ana', living: { id: `take:${Math.random()}`, town, res: { id: 'r', sex: 'female', cls: 0, town: 1, name: 'Ana' } } };
    let list = null, pick = null;
    feedOnPerson({ entity: v, target: { person, pos: [0, 0, 0] }, now: 0, say: () => {}, rolls: () => 0.99,
      showBox: (box) => { const step = box.onClick(); list = step[0].picker; pick = step[0].onPick; } });
    const i = list.findIndex((l) => /Haven/.test(l));
    assert.ok(i >= 0, 'Take is offered');
    fill();
    return pick(i).flatMap((b) => b.rows ?? []).join(' ');
  };
  prisoners().length = 0;
  const broke = vampire(Lyrezi, 0);
  assert.match(take(broke, () => {}), /too little Vitae/);
  assert.equal(prisoners().length, 0, 'no prisoner taken for free');
  const v = vampire(Lyrezi, 50);
  const rows = take(v, () => { for (let n = 0; n < 12; n++) prisoners().push({ id: `x${n}`, name: 'x', type: 'worker', quality: 30, health: 40, misery: 30, mobile: 0 }); });
  assert.match(rows, /Blood Slots are full|no more prisoners/);
  assert.equal(vitaeNow(v, 0), 50, 'the refusal spent no Vitae');
  prisoners().length = 0;
});

test('a long window that was not a raise, such as a background tab, drains at the full rate', () => {
  setWorldMinutes(0);
  clearSkippedSpans();
  const v = vampire(Lyrezi, 80);
  setWorldMinutes(3 * MINUTES_PER_DAY);
  assert.equal(Math.round(vitaeNow(v, ownMinutes())), Math.round(80 - 3 * VITAE_DRAIN_PER_DAY));
});

test('the Kiss works on the last of the Vitae', () => {
  const v = vampire(Lyrezi, 3);
  assert.equal(spendMindCloud(v, 0), true);
  assert.equal(vitaeNow(v, 0), 0);
  assert.equal(spendMindCloud(v, 0), true, 'even at nought');
});

test('a Garlythi gains three fifths from poor blood, and a Thrafey drain gives half', () => {
  const g = feedVampire(vampire(Garlythi, 20), { kind: 'sip', type: 'worker', quality: 20, now: 0 });
  assert.equal(g.vitae - 20, Math.round(FEEDS.sip.vitae * 0.6));
  const th = feedVampire(vampire(Thrafey, 20), { kind: 'drain', type: 'noble', quality: 60, now: 0 });
  assert.equal(th.vitae - 20, Math.ceil(FEEDS.drain.vitae * 0.5));
});

test('a landed blow lifts a Starving vampire out of the Starving band', () => {
  const v = vampire(Vraseth, 0);
  for (let i = 0; i < 8; i++) feedVampire(v, { kind: 'wound', type: 'beast', quality: 40, now: 0 });
  assert.ok(vitaeNow(v, 0) >= 25, 'eight blows reach Hungry');
});

test('only a blow that deals damage feeds: a blow with zero or no damage gives no Vitae', () => {
  const v = vampire(Vraseth, 30);
  playerWeaponHitEntity(v, { level: 5 }, { nowMinutes: 0, damage: 0 });
  playerWeaponHitEntity(v, { level: 5 }, { nowMinutes: 0 });
  assert.equal(vitaeNow(v, 0), 30);
  playerWeaponHitEntity(v, { level: 5 }, { nowMinutes: 0, damage: 6 });
  assert.equal(vitaeNow(v, 0), 30 + FEEDS.wound.vitae);
});

test('a blow on a bloodless enemy gives no Vitae', () => {
  const v = vampire(Vraseth, 30);
  playerWeaponHitEntity(v, { level: 5 }, { nowMinutes: 0, damage: 6, mobileType: 15 });
  playerWeaponHitEntity(v, { level: 5, basics: { bloodIndex: 2 } }, { nowMinutes: 0, damage: 6 });
  assert.equal(vitaeNow(v, 0), 30);
});

test('the melee hit sites feed nothing from a crystal or a warded stand-in', () => {
  assert.equal(blowFeedDamage({ crystal: 0, entity: {} }, 9), 0);
  assert.equal(blowFeedDamage({ host: 1, entity: { warded: true } }, 9), 0);
  assert.equal(blowFeedDamage({ boss: true, warded: true, entity: { warded: true } }, 9), 0);
  assert.equal(blowFeedDamage({ boss: true, warded: false, entity: { warded: false } }, 9), 9);
  assert.equal(blowFeedDamage({ entity: {} }, 9), 9);
});

test('an arrow feeds only from a living enemy that bleeds: not a crystal, an arena rival or the bloodless', () => {
  setWorldMinutes(0);
  const archer = () => {
    const e = vampire(Vraseth, 30);
    Object.assign(e, { isPlayer: true, skills: [], items: [], health: 120, fatigue: 3000, stats: { strength: 50, endurance: 50, agility: 50, luck: 50, speed: 50, willpower: 50 } });
    e.skills[SKILLS.Archery] = 100;
    return e;
  };
  const target = (extra) => ({ entity: { health: 200, isClass: false, armorValues: Array(7).fill(100), stats: { strength: 50, endurance: 50, agility: 50, luck: 50, speed: 50, willpower: 50 } }, ai: { feet: [0, 0, 3], height: 1.8, yaw: 0, isHostile: true }, ...extra });
  const shoot = (extra) => {
    const e = archer();
    const dmg = playerArrowHitFoe({ pos: [0, 1.4, 3], weapon: createWeapon(129, 3, () => 0) }, target(extra), { playerEntity: e, dealDamage: () => {}, rolls: () => 0 });
    assert.ok(dmg > 0, 'the shaft landed');
    return vitaeNow(e, 0);
  };
  assert.equal(shoot({ mobileType: 0 }), 30 + FEEDS.wound.vitae);
  assert.equal(shoot({ crystal: 0, mobileType: null }), 30);
  assert.equal(shoot({ rival: 1, mobileType: null }), 30);
  assert.equal(shoot({ mobileType: 15 }), 30);
});

test('fed today survives a same-day save and reload; an old or bad save loads as nobody fed', () => {
  setWorldMinutes(0);
  const person = { interactionId: 'test:saved', nameNPC: 'Ilse' };
  const v = { ...vampire(Vraseth, 50), isPlayer: true, race: 'Nord', skills: [], fatigue: 1000, health: 100, items: [] };
  assert.ok(feedOnce(v, 'drink', person)?.length);
  const snap = snapshotPlayer(v, { classicMinutes: 100 });
  const again = { isPlayer: true, race: 'Nord', skills: [], fatigue: 1000, health: 100 };
  restorePlayer(again, JSON.parse(JSON.stringify(snap)));
  let said = '';
  assert.ok(feedOnPerson({ entity: again, target: { person, pos: [0, 0, 0] }, now: 100, showBox: () => assert.fail('fed today: no box'), say: (l) => { said = l; } }));
  assert.match(said, /pale/);
  for (const fed of [undefined, 'junk', { day: 'x', ids: 5 }, { day: -1, ids: ['test:saved'] }]) {
    const old = JSON.parse(JSON.stringify(snap));
    const row = old.activeEffects.find((a) => a.kind === 'racialOverride');
    if (fed === undefined) delete row.fedToday; else row.fedToday = fed;
    const loaded = { isPlayer: true, race: 'Nord', skills: [], fatigue: 1000, health: 100 };
    restorePlayer(loaded, old);
    assert.ok(feedOnce(loaded, 'drink', person)?.length, `fed today ${JSON.stringify(fed)} reads as nobody fed`);
  }
});

test('blood at a glance: a quality word and a tag', () => {
  assert.equal(bloodQualityName(10), 'thin');
  assert.equal(bloodQualityName(99), 'potent');
  assert.match(bloodTag('noble', 72), /Noble blood, good \(72%\)/);
});

test('the vampire\'s pages exist, in the Vampirism group, with the law\'s own numbers', () => {
  for (const id of ['vampire-bitten', 'vampire-awakened', 'vampire-blood', 'vampire-feeding', 'vampire-thralls', 'vampire-gift']) {
    assert.equal(tutorialById(id)?.group, 'vampire', id);
  }
  for (const p of TUTORIALS.filter((x) => x.group === 'vampire')) {
    assert.ok(!/[!\u2014]/.test([...p.body].join(' ')), `${p.id}: no exclamation marks or em dashes`);
  }
  const awakened = [...tutorialById('vampire-awakened').body].join(' ');
  assert.match(awakened, new RegExp(`about ${VITAE_DRAIN_PER_DAY} a game day`));
  assert.match(awakened, new RegExp(`drink gives about ${FEEDS.drink.vitae} Vitae and a drain about ${FEEDS.drain.vitae}`));
  const blood = [...tutorialById('vampire-blood').body].join(' ');
  assert.match(blood, new RegExp(`drops ${BLOOD_FADE_PER_DAY} points a day`));
  assert.match(blood, new RegExp(`capped at ${STALE_QUALITY_CAP} percent`));
  const [fair, good, rich, potent] = RESONANCE_TIERS;
  assert.match(blood, new RegExp(`thin under ${fair}, fair from ${fair}, good from ${good}, rich from ${rich}, and potent from ${potent}`));
});

function feedOnce(entity, choiceId, person, { now = 100 } = {}) {
  let list = null, pick = null;
  const showBox = (box) => { const step = box.onClick(); list = step[0].picker; pick = step[0].onPick; };
  const handled = feedOnPerson({
    entity, target: { person, pos: [0, 0, 0] }, now, showBox, say: () => {}, onCrime: () => {}, rolls: () => 0.99,
  });
  assert.ok(handled);
  if (!list) return null;
  const key = { kiss: 'the kiss', drink: 'drink', leave: 'leave them be' }[choiceId];
  const i = list.findIndex((l) => l.toLowerCase().startsWith(key));
  // The last row is Leave.
  return pick(i >= 0 ? i : list.length - 1);
}

test('leaving, or a feed that did not happen, never uses the person up', () => {
  const v = vampire(Vraseth, 50);
  const person = { interactionId: 'test:leave', nameNPC: 'Bran' };
  assert.deepEqual(feedOnce(v, 'leave', person), []);
  assert.ok(feedOnce(v, 'drink', person)?.length, 'the leave kept them fresh for a real drink');
  let said = '';
  const showBox = () => assert.fail('already fed today: no box');
  assert.ok(feedOnPerson({ entity: v, target: { person, pos: [0, 0, 0] }, now: 100, showBox, say: (l) => { said = l; } }));
  assert.match(said, /pale/);
});

test('a Kiss with no Vitae left still feeds, and uses them up once', () => {
  const v = vampire(Vraseth, 0);
  const person = { interactionId: 'test:kiss', nameNPC: 'Mara' };
  const out = feedOnce(v, 'kiss', person);
  assert.ok(out?.length);
  assert.ok(vitaeNow(v, 100) > 0, 'the Kiss fed');
});
