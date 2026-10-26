// COURT-DEEDS (2026-10-26, Discord #feature-feedback "Better Courtship": "Compliments, giving gifts, hugging, kissing ...
// Right now it's confusing on what exactly you're supposed to use to improve relationships";
// bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md): a compliment, a gift, a hug and a kiss on the Tell me about page,
// each once a day, each saying what it moved. Through the real host (scenes/legacyHost.js topicRows) over the real
// relations (systems/livingWorld/regardClock.js characterRelations - the one construction point world.js uses).
// Mutants: tools/mutants/fb1026b_courtdeeds.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { court, wed, AFFECTION_MAX } from '../../../src/systems/legacy/marriage.js';
import { FRIEND_AT, EVENTS, createRelations } from '../../../src/systems/livingWorld/relations.js';
import { characterRelations, regardDayOf } from '../../../src/systems/livingWorld/regardClock.js';
import { personOf, MODELS } from '../../../src/systems/legacy/family.js';
import { createLegacyHost } from '../../../src/scenes/legacyHost.js';
import { DEEDS, GIFT_GOLD, KISS_AT, DEED_AFFECTION, deedsFor } from '../../../src/systems/legacy/courtDeeds.js';

const RES = Object.freeze({ id: 'L120.4', name: 'Aldo Marane', sex: 'male', race: 'Breton', face: 312, town: 120, roll: 'h' });
const DAY = 1440;

/** The host over a made member, a purse of `gold`, and the Living World's relations on the member's own clock. */
function world({ gold = 200 } = {}) {
  const store = new Map();
  const storage = { get length() { return store.size; }, key: (i) => [...store.keys()][i] ?? null, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const w = { own: 10 * DAY, said: [] };
  w.e = {
    name: 'Ysolde Hlaalu', race: 'DarkElf', gender: 'female', faceIndex: 2, level: 4, chargenDone: true, characterId: 'c1', goldPieces: gold, items: [],
    stats: { Strength: 50, Intelligence: 60, Willpower: 50, Agility: 55, Endurance: 50, Personality: 70, Speed: 50, Luck: 50 },
    skills: Array.from({ length: 35 }, (_, i) => (i === 1 ? 40 : 20)),
    career: { name: 'Bard', primarySkills: [1], majorSkills: [2], minorSkills: [3] }, careerIndex: 1,
  };
  w.rel = characterRelations(null, () => w.own, false);
  w.host = createLegacyHost({
    entity: w.e, storage: () => storage, tab: () => storage, on: () => true, online: () => false, now: () => w.own, own: () => w.own,
    here: () => ({ pixel: { x: 1, y: 1 }, region: 'Daggerfall', mode: 'exterior', loc: 'Ashbury', locationType: 0 }), town: () => null,
    nearestTown: () => ({ region: 'Daggerfall', loc: 'Ashbury' }), gold: () => w.e.goldPieces, say: (l) => w.said.push(l), boot: () => {}, search: () => '?world',
    loadCharacter: () => false, saveNow: () => true, inFight: () => false, rng: () => 0, livingWorld: () => true,
    regards: () => w.rel, regardDay: () => w.rel.today(),
  });
  w.host.found(MODELS.enduring);
  w.host.family.people = w.host.family.people.slice(0, 1);
  w.me = personOf(w.host.family, w.host.family.currentId);
  w.ctx = () => ({ regard: w.rel.regard(RES.id), personality: 70, etiquette: 40, townName: 'Ashbury' });
  w.rows = () => w.host.topicRows(RES, w.ctx());
  w.deed = (kind, taste = 0) => w.rows().find((r) => r.topic === `deed:${kind}`).legacy.answer(1, taste);
  return w;
}

test('COURT-DEEDS THE ROWS: a stranger of a household is offered all four after the courtship\'s rows - never one of the watch or a traveller (mutant: the deeds unoffered)', () => {
  const w = world();
  assert.deepEqual(w.rows().map((r) => r.label), ['Pay a compliment', `Give a gift (${GIFT_GOLD} gold)`, 'Hug', 'Kiss'], 'a stranger: no Courtship yet, every deed');
  assert.deepEqual(w.host.topicRows({ ...RES, roll: 'w', guard: true }, w.ctx()), []);
  assert.deepEqual(w.host.topicRows({ ...RES, roll: 't' }, w.ctx()), []);
  w.rel.note(RES.id, 'talk', 0, FRIEND_AT);
  assert.deepEqual(w.rows().map((r) => r.topic), ['court', 'deed:compliment', 'deed:gift', 'deed:embrace', 'deed:kiss'], 'a friend: Courtship first');
  assert.deepEqual(DEEDS, ['compliment', 'gift', 'embrace', 'kiss']);
});

test('COURT-DEEDS EACH DEED SAYS WHAT IT MOVED, ONCE A DAY: a compliment +2, a gift +8 for its gold, a hug and a kiss refused kindly with what they wait on - and the next day again (mutants: a deed counted twice a day; the gift free; the tally unsaid)', () => {
  const w = world();
  assert.match(w.deed('compliment'), /Flatterer.*\(Regard \+2, now \+2\.\)$/);
  assert.equal(w.rel.regard(RES.id), EVENTS.compliment);
  assert.match(w.deed('compliment'), /Once a day is plenty/, 'once a day');
  assert.equal(w.rel.regard(RES.id), EVENTS.compliment, 'nothing more today');
  assert.match(w.deed('gift'), /For me\?.*\(Regard \+8, now \+10\.\)$/);
  assert.equal(w.e.goldPieces, 200 - GIFT_GOLD, 'the gift\'s gold taken');
  assert.match(w.deed('gift'), /Once a day/);
  assert.equal(w.e.goldPieces, 200 - GIFT_GOLD, 'a gift refused for the day costs nothing');
  assert.match(w.deed('embrace'), /We hardly know each other.*regard \+40/, 'a hug waits on a friend - and says so');
  assert.match(w.deed('kiss'), /Not yet.*courtship of 34 or more/, 'a kiss waits on a courtship - and says so');
  assert.equal(w.rel.regard(RES.id), 10, 'a refusal costs nothing');
  w.own += DAY;   // the next day of the member's own clock
  assert.match(w.deed('compliment'), /\(Regard \+2, now \+11\.\)$/, 'counted again the next day (10 eased half a point for the day apart, then 2)');
  // a compliment in a tone they take ill falls flat: nothing gained, the day spent
  w.own += DAY;
  assert.match(w.deed('compliment', -1), /Is that meant to be a compliment\?.*\(Regard \+0/);
  // and a purse short of a gift is told so, nothing taken
  const poor = world({ gold: GIFT_GOLD - 1 });
  assert.match(poor.deed('gift'), new RegExp(`haven't the ${GIFT_GOLD} gold`));
  assert.equal(poor.e.goldPieces, GIFT_GOLD - 1);
  assert.equal(poor.rel.regard(RES.id), 0);
});

test('COURT-DEEDS A COURTSHIP WARMED: while courting, each deed adds its affection and says the courtship\'s count; a hug is welcome from the first day courted, a kiss from KISS_AT; a full courtship takes no more (mutants: the affection unwarmed; the kiss\'s gate unread)', () => {
  const w = world();
  w.rel.note(RES.id, 'talk', 0, FRIEND_AT);
  court(w.me, RES, { day: 0, townName: 'Ashbury', personality: 70, etiquette: 40, taste: 0, roll: 0 });
  const c = w.me.courting[RES.id];
  const a0 = c.affection;
  assert.match(w.deed('compliment', 1), new RegExp(`Courtship \\+${DEED_AFFECTION.compliment + 1}, now ${a0 + DEED_AFFECTION.compliment + 1} of ${AFFECTION_MAX}\\.\\)$`), 'a tone taken kindly: one more');
  assert.match(w.deed('embrace'), /holds you close.*Courtship \+5/);
  assert.ok(c.affection < KISS_AT, `under the kiss's mark (${c.affection})`);
  assert.match(w.deed('kiss'), /Not yet/);
  c.affection = KISS_AT;
  assert.match(w.deed('kiss'), new RegExp(`kisses you back.*Courtship \\+${DEED_AFFECTION.kiss}, now ${KISS_AT + DEED_AFFECTION.kiss} of`));
  c.affection = AFFECTION_MAX - 2;
  assert.match(w.deed('gift'), new RegExp(`Courtship \\+2, now ${AFFECTION_MAX} of ${AFFECTION_MAX}`), 'held to the full mark');
  assert.equal(c.affection, AFFECTION_MAX);
});

test('COURT-DEEDS THE DAYS ARE KEPT: each deed\'s day rides the regard\'s own record through the save, so a reload never hands a second one (mutant: a stamp unsaved)', () => {
  const rel = createRelations();
  rel.note('L1.0', 'compliment', 5);
  rel.note('L1.0', 'gift', 5);
  rel.note('L1.0', 'embrace', 5);
  rel.note('L1.0', 'kiss', 5);
  const back = createRelations(JSON.parse(JSON.stringify(rel.snapshot())));
  for (const k of DEEDS) assert.equal(back.deedDay('L1.0', k), 5, k);
  const r = back.regard('L1.0', 5);
  for (const k of DEEDS) back.note('L1.0', k, 5);
  assert.equal(back.regard('L1.0', 5), r, 'none counts twice on the day');
  assert.equal(regardDayOf(0) < regardDayOf(DAY), true);
});

test('COURT-DEEDS WHO IS OFFERED WHAT: a spouse every deed, a kiss welcome without a courtship and no courtship counted; a member wed offers anyone else no kiss (mutants: the spouse\'s kiss refused; a kiss offered past a marriage)', () => {
  const w = world();
  wed(w.host.family, w.me, { id: RES.id, name: RES.name, sex: RES.sex, race: RES.race, face: RES.face, mapId: RES.town }, w.own, { takeName: false });
  assert.deepEqual(deedsFor(w.host.family, w.me, RES), [...DEEDS]);
  assert.deepEqual(w.rows().map((r) => r.topic), ['family', 'deed:compliment', 'deed:gift', 'deed:embrace', 'deed:kiss']);
  assert.match(w.deed('kiss'), /kisses you back\. \(Regard \+4, now \+4\.\)$/, 'a spouse: no courtship to count');
  const other = { ...RES, id: 'L120.5', name: 'Bena Toll' };
  assert.deepEqual(deedsFor(w.host.family, w.me, other), ['compliment', 'gift', 'embrace']);
  assert.deepEqual(deedsFor(null, w.me, RES), []);
});
