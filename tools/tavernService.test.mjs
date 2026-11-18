import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTavernShift, stepTavernShift, TAVERN_RECIPES, TAVERN_INGREDIENTS, tavernMatches, tavernOrder, TAVERN_ORDER_MIN_S, TAVERN_ORDERS,
  tavernOpenChores, tavernPerfect, TAVERN_CHORE_MIN_S, TAVERN_CHORE_PLAN } from '../src/net/tavernServiceLaw.js';

const fresh = (member = true, rank = 3) => createTavernShift({ where: '17:42', keeper: 'keeper', patrons: ['alice', 'bob'], member, rank, seed: 120, nowS: 100 });
function step(state, op, extra = {}, time = 200) {
  const result = stepTavernShift(state, { op, target: state.keeper, ...extra }, time);
  assert.ok(!result.error, result.error); return result;
}
function fill(state, recipe = tavernOrder(state).recipe) {
  const r = TAVERN_RECIPES.find((r) => r.id === recipe);
  for (const ingredient of TAVERN_INGREDIENTS) for (let n = 0; n < r[ingredient]; n++) state = step(state, 'pour', { ingredient }).state;
  assert.equal(state.phase, 'carry', 'the third dose puts the cup in hand');
  return state;
}
/** Pour and serve the current order: one action pays for it. */
const serveOrder = (state, at) => step(fill(state), 'serve', { target: tavernOrder(state).patron }, at);

test('nine distinct recipes, each three doses, all exactly recognisable', () => {
  assert.equal(TAVERN_RECIPES.length, 9);
  assert.equal(new Set(TAVERN_RECIPES.map((r) => TAVERN_INGREDIENTS.map((k) => r[k]).join(':'))).size, 9);
  for (const r of TAVERN_RECIPES) {
    assert.equal(TAVERN_INGREDIENTS.reduce((n, k) => n + r[k], 0), 3);
    assert.equal(tavernMatches(r, r.id), true);
  }
  assert.equal(tavernMatches({ wine: 0, cream: 3, beer: 0 }, 'dibella'), false);
});
test('a shift varies both drinks and patrons without repeating a recipe', () => {
  const a = fresh(); assert.deepEqual(a, fresh());
  assert.equal(a.orders.length, TAVERN_ORDERS);
  assert.equal(new Set(a.orders.map((o) => o.recipe)).size, TAVERN_ORDERS);
  assert.ok(a.orders.every((o) => ['alice', 'bob'].includes(o.patron)));
});
test('a fourth dose, partial cup, invalid ingredient and remote counter cannot advance', () => {
  const a = fresh();
  assert.equal(stepTavernShift(a, { op: 'carry', target: 'keeper' }, 200).error, 'tavern-action');
  assert.equal(stepTavernShift(a, { op: 'pour', ingredient: 'milk', target: 'keeper' }, 200).error, 'tavern-action');
  assert.equal(stepTavernShift(a, { op: 'pour', ingredient: 'wine', target: 'alice' }, 200).error, 'tavern-action');
  let b = a; for (let i = 0; i < 3; i++) b = step(b, 'pour', { ingredient: 'cream' }).state;
  assert.equal(b.phase, 'carry');
  assert.equal(stepTavernShift(b, { op: 'pour', ingredient: 'wine', target: 'keeper' }, 200).error, 'tavern-action');
  assert.equal(stepTavernShift(b, { op: 'carry', target: 'keeper' }, 200).error, 'tavern-action');
  assert.deepEqual(a.mix, { wine: 0, cream: 0, beer: 0 });
});
test('a wrong recipe stays in hand and must be discarded as a whole', () => {
  const a = fresh(); const wrong = TAVERN_RECIPES.find((r) => r.id !== tavernOrder(a).recipe);
  const b = fill(a, wrong.id);
  const r = step(b, 'serve', { target: tavernOrder(b).patron });
  assert.equal(r.refused, true); assert.equal(r.gold, 0); assert.equal(r.state.phase, 'carry');
  assert.deepEqual(r.state.mix, b.mix);
  const discarded = step(r.state, 'discard');
  assert.equal(discarded.state.wasted, 1); assert.equal(discarded.state.phase, 'mix');
  assert.deepEqual(discarded.state.mix, { wine: 0, cream: 0, beer: 0 });
});
test('correct recipe for the wrong NPC pays nothing', () => {
  const a = fill(fresh());
  const wrong = tavernOrder(a).patron === 'alice' ? 'bob' : 'alice';
  assert.equal(stepTavernShift(a, { op: 'serve', target: wrong }, 200).error, 'tavern-target');
});
test('one serve pays the drink, earns its Favor and calls the next order', () => {
  const a = fill(fresh());
  assert.equal(stepTavernShift(a, { op: 'serve', target: tavernOrder(a).patron }, 100 + TAVERN_ORDER_MIN_S - 1).error, 'tavern-too-soon');
  const r = step(a, 'serve', { target: tavernOrder(a).patron });
  assert.equal(r.served, true); assert.equal(r.gold, 29); assert.equal(r.favor, 1); assert.equal(r.localRep, 0);
  assert.equal(r.state.index, 1); assert.equal(r.state.phase, 'mix'); assert.deepEqual(r.state.mix, { wine: 0, cream: 0, beer: 0 });
  assert.deepEqual(r.state.lastServed, { index: 0, patron: tavernOrder(a).patron });
  assert.equal(stepTavernShift(r.state, { op: 'return', target: 'keeper' }, 200).error, 'tavern-action');
  assert.equal(stepTavernShift(r.state, { op: 'collect', target: tavernOrder(a).patron }, 200).error, 'tavern-target');
});
test('a shift saved mid cup round trip still collects, returns and pays once', () => {
  let a = fresh(); a.phase = 'served';
  assert.equal(stepTavernShift(a, { op: 'return', target: 'keeper' }, 200).error, 'tavern-action');
  a = step(a, 'collect', { target: tavernOrder(a).patron }).state;
  const r = step(a, 'return'); assert.equal(r.gold, 36); assert.equal(r.favor, 1); // wage 29 + streak tip 7 assert.equal(r.state.index, 1);
  assert.equal(stepTavernShift(r.state, { op: 'return', target: 'keeper' }, 200).error, 'tavern-action');
  const legacy = fresh(); legacy.mix = { wine: 3, cream: 0, beer: 0 };
  assert.equal(step(legacy, 'carry').state.phase, 'carry');
});
/** A whole shift: each drink served `late` seconds after it was ordered, chores cleared as they appear when `tidy`. */
function playShift(a, { late, tidy }) {
  let at = 100, rep = 0, favor = 0, localRep = 0, choreGold = 0;
  for (let n = 0; n < TAVERN_ORDERS; n++) {
    at = a.orderAt + late;
    const r = serveOrder(a, at); a = r.state; rep += r.rep; favor += r.favor; localRep += r.localRep;
    if (tidy && a.phase !== 'done') for (const c of tavernOpenChores(a)) {
      const done = step(a, 'chore', { target: c.id }, at + TAVERN_CHORE_MIN_S); a = done.state; choreGold += done.gold;
    }
  }
  return { a, rep, favor, localRep, choreGold };
}
test('Favor comes with every drink; Bards standing with each clean drink and more for a perfect shift', () => {
  const perfect = playShift(fresh(), { late: 30, tidy: true });
  assert.equal(perfect.a.phase, 'done'); assert.equal(perfect.favor, TAVERN_ORDERS); assert.equal(perfect.localRep, 1);
  assert.equal(tavernPerfect(perfect.a), true);
  assert.equal(perfect.rep, TAVERN_ORDERS + 3, 'six clean drinks and the perfect-shift bonus');
  assert.equal(perfect.choreGold, TAVERN_CHORE_PLAN.length * 9, 'rank 3 pays 6 x 1.45, rounded, a chore');
  const untidy = playShift(fresh(), { late: 30, tidy: false });
  assert.equal(tavernOpenChores(untidy.a).length, TAVERN_CHORE_PLAN.length); assert.equal(tavernPerfect(untidy.a), false);
  assert.equal(untidy.rep, TAVERN_ORDERS + 1, 'chores left undone forfeit the perfect bonus');
  const slow = playShift(fresh(), { late: 120, tidy: true });
  assert.equal(slow.rep, 3, 'late drinks earn no standing of their own (a tidy room is more patient, so 120s)');
  const mistaken = fresh(); mistaken.mistakes = 1;
  assert.equal(playShift(mistaken, { late: 120, tidy: true }).rep, 1);
  assert.equal(playShift(fresh(false), { late: 30, tidy: true }).rep, 0, 'only College members earn its standing');
  for (const mistakes of [0, 1]) {
    let a = fresh(); a.mistakes = mistakes;
    for (let n = 0; n < TAVERN_ORDERS; n++) a = serveOrder(a, 200 + n * 100).state;
    assert.equal(a.phase, 'done'); assert.equal(a.earned, 174);
    assert.equal(stepTavernShift(a, { op: 'serve', target: 'alice' }, 999).error, 'tavern-no-shift');
  }
});
test('chores appear where served customers leave them, and pay once when cleared', () => {
  const a = fresh();
  assert.equal(a.orders.at(-1).chore, '', 'the last customer leaves nothing behind');
  assert.deepEqual(a.orders.slice(0, -1).map((o) => o.chore).sort(), [...TAVERN_CHORE_PLAN].sort());
  const r = serveOrder(a, 200);
  const [chore] = r.state.chores;
  assert.deepEqual(chore, { id: 'chore0', kind: a.orders[0].chore, patron: a.orders[0].patron, at: 200, done: false });
  assert.equal(stepTavernShift(r.state, { op: 'chore', target: 'chore0' }, 200 + TAVERN_CHORE_MIN_S - 1).error, 'tavern-too-soon');
  assert.equal(stepTavernShift(r.state, { op: 'chore', target: 'chore9' }, 300).error, 'tavern-target');
  const done = step(r.state, 'chore', { target: 'chore0' }, 300);
  assert.equal(done.gold, 9); assert.equal(done.favor, 0); assert.equal(done.state.earned, r.state.earned + 9);
  assert.equal(done.state.room.warmth, r.state.room.warmth + 1);
  assert.equal(tavernOpenChores(done.state).length, 0);
  assert.equal(stepTavernShift(done.state, { op: 'chore', target: 'chore0' }, 300).error, 'tavern-target');
  const legacy = structuredClone(r.state); delete legacy.chores; for (const o of legacy.orders) delete o.chore;
  assert.equal(serveOrder(legacy, 400).state.chores, undefined, 'shifts saved before chores keep working');
});
test('nonmembers can work, stopping keeps earned gold, expiry refuses further actions', () => {
  const a = fresh(false); const stopped = step(a, 'stop');
  assert.equal(stopped.rep, 0); assert.equal(stopped.state.earned, 0);
  assert.equal(stepTavernShift(a, { op: 'pour', target: 'keeper', ingredient: 'wine' }, 4000).error, 'tavern-expired');
});

test('patience and clean service build tips; late service and mistakes reset the streak', () => {
  let st = fresh();
  function serveAt(at) { const result = serveOrder(st, at); st = result.state; return result; }
  assert.equal(serveAt(130).tip, 7);
  assert.equal(serveAt(160).tip, 15);
  assert.equal(serveAt(260).tip, 0);
  assert.equal(st.streak, 0);
  assert.equal(serveAt(290).tip, 7);
  st = step(st, 'pour', { ingredient: 'wine' }, 300).state;
  st = step(st, 'discard', {}, 300).state;
  assert.equal(serveAt(320).tip, 0);
  assert.equal(st.bestStreak, 2);
});
test('abandoning a shift never awards Favor or city reputation', () => {
  const r = step(fresh(), 'stop'); assert.equal(r.favor, 0); assert.equal(r.localRep, 0);
});

test('Bard rank scales wages and streak tips through Archbard; nonmembers receive base pay', () => {
  for (const [member, rank, wage, tip] of [[true, 0, 20, 5], [true, 3, 29, 7], [true, 7, 41, 10], [true, 8, 44, 11], [true, 9, 47, 12], [false, 9, 20, 5]]) {
    const result = serveOrder(fresh(member, rank), 130);
    assert.equal(result.tip, tip); assert.equal(result.gold, wage + tip);
  }
});
