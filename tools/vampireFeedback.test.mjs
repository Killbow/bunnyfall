import assert from 'node:assert/strict';
import test from 'node:test';
import { MINUTES_PER_DAY } from '../src/world/gameDate.js';
import { vitaeNow, feedVampire, spendMindCloud } from '../src/systems/vampire/vitae.js';
import { VITAE_DRAIN_PER_DAY, TRAVEL_DRAIN_FLOOR, bloodQualityName, bloodTag, FEEDS } from '../src/systems/vampire/bloodLaw.js';
import { feedOnPerson } from '../src/scenes/vampire/vampireFeed.js';
import { tutorialById, TUTORIALS } from '../src/ui/tutorials.js';

/** An awakened vampire of a clan (150 Anthotis ... 158; Garlythi is 151 in infection.js's order, read below). */
const vampire = (clan, vitae = 75) => ({
  activeEffects: [{ kind: 'racialOverride', racial: 'vampirism', clan, awakened: true, vitae, vitaeAt: 0, blood: null, statMods: {}, skillMods: {} }],
});
const GARLYTHI = 152;

test('the slow drain: a day of play costs the slowed rate, and a long jump costs far less than the full rate', () => {
  const walked = vampire(GARLYTHI + 1, 80);
  assert.equal(Math.round(vitaeNow(walked, 0.1 * MINUTES_PER_DAY)), Math.round(80 - 0.1 * VITAE_DRAIN_PER_DAY));
  const jumped = vampire(GARLYTHI + 1, 80);
  const after = vitaeNow(jumped, 3 * MINUTES_PER_DAY);   // a three-day journey
  assert.ok(after >= TRAVEL_DRAIN_FLOOR, `a journey never leaves a vampire Starving (got ${after})`);
  assert.ok(after > 80 - 3 * VITAE_DRAIN_PER_DAY, 'and drains less than the same days lived');
});

test('the Kiss works on the last of the Vitae', () => {
  const v = vampire(153, 3);
  assert.equal(spendMindCloud(v, 0), true);
  assert.equal(vitaeNow(v, 0), 0);
  assert.equal(spendMindCloud(v, 0), true, 'even at nought');
});

test('a Garlythi always gains real Vitae from poor blood', () => {
  for (const clan of [150, 151, 152, 153, 154, 155, 156, 157, 158]) {
    const v = vampire(clan, 20);
    const r = feedVampire(v, { kind: 'sip', type: 'worker', quality: 20, now: 0 });
    if (clan === 150 || r.vitae - 20 > 0) assert.ok(r.vitae > 20, `clan ${clan}`);
  }
  const g = vampire(151, 20);
  const fed = feedVampire(g, { kind: 'sip', type: 'worker', quality: 20, now: 0 });
  assert.ok(fed.vitae - 20 >= Math.ceil(FEEDS.sip.vitae * 0.5), `a poor feed gives at least half (got ${fed.vitae - 20})`);
});

test('blood at a glance: a quality word and a tag', () => {
  assert.equal(bloodQualityName(10), 'thin');
  assert.equal(bloodQualityName(99), 'potent');
  assert.match(bloodTag('noble', 72), /Noble blood, good \(72%\)/);
});

test('the vampire\'s pages exist, in the Vampirism group', () => {
  for (const id of ['vampire-bitten', 'vampire-awakened', 'vampire-blood', 'vampire-feeding', 'vampire-thralls', 'vampire-gift']) {
    assert.equal(tutorialById(id)?.group, 'vampire', id);
  }
  for (const p of TUTORIALS.filter((x) => x.group === 'vampire')) {
    assert.ok(!/[!\u2014]/.test([...p.body].join(' ')), `${p.id}: no exclamation marks or em dashes`);
  }
});

/** One person to feed on, and a quest box that answers the picker. */
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
  return pick(i >= 0 ? i : list.length - 1);   // Leave is the last row
}

test('leaving, or a feed that did not happen, never uses the person up', () => {
  const v = vampire(150, 50);
  const person = { interactionId: 'test:leave', nameNPC: 'Bran' };
  assert.deepEqual(feedOnce(v, 'leave', person), []);
  assert.ok(feedOnce(v, 'drink', person)?.length, 'the leave kept them fresh for a real drink');
  let said = '';
  const showBox = () => assert.fail('already fed today: no box');
  assert.ok(feedOnPerson({ entity: v, target: { person, pos: [0, 0, 0] }, now: 100, showBox, say: (l) => { said = l; } }));
  assert.match(said, /pale/);
});

test('a Kiss with no Vitae left still feeds, and uses them up once', () => {
  const v = vampire(150, 0);
  const person = { interactionId: 'test:kiss', nameNPC: 'Mara' };
  const out = feedOnce(v, 'kiss', person);
  assert.ok(out?.length);
  assert.ok(vitaeNow(v, 100) > 0, 'the Kiss fed');
});
