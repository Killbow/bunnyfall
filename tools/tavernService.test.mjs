import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTavernShift, stepTavernShift, TAVERN_RECIPES, TAVERN_INGREDIENTS, tavernMatches, tavernOrder, TAVERN_ORDER_MIN_S, TAVERN_ORDERS } from '../src/net/tavernServiceLaw.js';

const fresh = (member = true, rank = 3) => createTavernShift({ where: '17:42', keeper: 'keeper', patrons: ['alice', 'bob'], member, rank, seed: 120, nowS: 100 });
function step(state, op, extra = {}, time = 200) {
  const result = stepTavernShift(state, { op, target: state.keeper, ...extra }, time);
  assert.ok(!result.error, result.error); return result;
}
function fill(state, recipe = tavernOrder(state).recipe) {
  const r = TAVERN_RECIPES.find((r) => r.id === recipe);
  for (const ingredient of TAVERN_INGREDIENTS) for (let n = 0; n < r[ingredient]; n++) state = step(state, 'pour', { ingredient }).state;
  return step(state, 'carry').state;
}

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
  assert.equal(stepTavernShift(b, { op: 'pour', ingredient: 'wine', target: 'keeper' }, 200).error, 'tavern-action');
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
test('minimum time and empty-cup return gate the payment', () => {
  let a = fill(fresh());
  assert.equal(stepTavernShift(a, { op: 'serve', target: tavernOrder(a).patron }, 100 + TAVERN_ORDER_MIN_S - 1).error, 'tavern-too-soon');
  let r = step(a, 'serve', { target: tavernOrder(a).patron });
  assert.equal(r.gold, 0); a = r.state;
  assert.equal(stepTavernShift(a, { op: 'return', target: 'keeper' }, 200).error, 'tavern-action');
  a = step(a, 'collect', { target: tavernOrder(a).patron }).state;
  r = step(a, 'return'); assert.equal(r.gold, 29); assert.equal(r.state.index, 1);
  assert.equal(stepTavernShift(r.state, { op: 'return', target: 'keeper' }, 200).error, 'tavern-action');
});
test('reputation is earned once at shift completion, with a smaller award after mistakes', () => {
  for (const mistakes of [0, 1]) {
    let a = fresh(); a.mistakes = mistakes; let totalRep = 0;
    for (let n = 0; n < TAVERN_ORDERS; n++) {
      a = fill(a); const time = 200 + n * 100;
      a = step(a, 'serve', { target: tavernOrder(a).patron }, time).state;
      a = step(a, 'collect', { target: tavernOrder(a).patron }, time).state;
      const r = step(a, 'return', {}, time); a = r.state; totalRep += r.rep;
    }
    assert.equal(a.phase, 'done'); assert.equal(a.earned, 174); assert.equal(totalRep, mistakes ? 1 : 2);
    assert.equal(stepTavernShift(a, { op: 'return', target: 'keeper' }, 999).error, 'tavern-no-shift');
  }
});
test('nonmembers can work, stopping keeps earned gold, expiry refuses further actions', () => {
  const a = fresh(false); const stopped = step(a, 'stop');
  assert.equal(stopped.rep, 0); assert.equal(stopped.state.earned, 0);
  assert.equal(stepTavernShift(a, { op: 'pour', target: 'keeper', ingredient: 'wine' }, 4000).error, 'tavern-expired');
});

test('patience and clean service build tips; late service and mistakes reset the streak', () => {
  let st = fresh();
  function serveAt(at) {
    st = fill(st);
    st = step(st, 'serve', { target: tavernOrder(st).patron }, at).state;
    st = step(st, 'collect', { target: tavernOrder(st).patron }, at).state;
    const result = step(st, 'return', {}, at); st = result.state; return result;
  }
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
    let st = fill(fresh(member, rank));
    st = step(st, 'serve', { target: tavernOrder(st).patron }, 130).state;
    st = step(st, 'collect', { target: tavernOrder(st).patron }, 130).state;
    const result = step(st, 'return', {}, 130);
    assert.equal(result.tip, tip); assert.equal(result.gold, wage + tip);
  }
});
