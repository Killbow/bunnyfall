import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTavernShift, stepTavernShift } from '../src/net/tavernServiceLaw.js';
import { TAVERN_ROOM_EVENTS, tavernRoomEvent, tavernRoomAvailable, tavernRoomMusicShare, tavernPatienceSeconds } from '../src/net/tavernRoomLaw.js';

const fresh = () => createTavernShift({ keeper: 'keeper', patrons: ['guest'], where: '17:42', member: true, rank: 3, nowS: 100, seed: 1 });
const ready = (encounter = 'tallTales') => { const st = fresh(); st.phase = 'served'; st.orders[0].encounter = encounter; return st; };
const respond = (st, choice) => stepTavernShift(st, { op: 'room', target: 'guest', choice }, 130);

test('six distinct encounters are seeded with each shift without changing its recipes', () => {
  const a = fresh(), b = fresh();
  assert.deepEqual(a, b);
  assert.equal(new Set(a.orders.map((o) => o.encounter)).size, 6);
  for (const o of a.orders) assert.ok(TAVERN_ROOM_EVENTS.some((e) => e.id === o.encounter));
});
test('responses are optional, validated, immutable, and resolve once per service', () => {
  const st = ready(), before = structuredClone(st);
  assert.equal(tavernRoomAvailable(st), true);
  assert.equal(respond(st, 'invented').error, 'tavern-action');
  assert.equal(stepTavernShift(st, { op: 'room', target: 'stranger', choice: 'joke' }, 130).error, 'tavern-target');
  const r = respond(st, 'listen');
  assert.deepEqual(st, before);
  assert.deepEqual(r.state.room, { warmth: 4, energy: 2, tension: 0 });
  assert.equal(r.gold, 0); assert.equal(r.favor, 0);
  assert.equal(respond(r.state, 'listen').error, 'tavern-action');
  assert.equal(tavernRoomAvailable(r.state), false);
  assert.equal(respond({ ...st, phase: 'mix' }, 'listen').error, 'tavern-action');
  assert.equal(respond({ ...st, phase: 'dirty' }, 'listen').roomResult.choice, 'listen');
});
test('loud responses backfire in a tense room, while calming choices restore it', () => {
  const st = ready(); st.room = { warmth: 2, energy: 2, tension: 4 };
  const loud = respond(st, 'joke');
  assert.equal(loud.roomResult.backfire, true);
  assert.deepEqual(loud.state.room, { warmth: 1, energy: 3, tension: 5 });
  const calm = respond(st, 'listen');
  assert.equal(calm.roomResult.backfire, false);
  assert.ok(calm.state.room.tension < st.room.tension);
});
test('room mood affects rank-scaled tips, future patience, and performance income', () => {
  const st = respond(ready(), 'listen').state;
  const collected = stepTavernShift(st, { op: 'collect', target: 'guest' }, 500).state;
  const returned = stepTavernShift(collected, { op: 'return', target: 'keeper' }, 500);
  assert.equal(returned.roomTip, 4); // 3 base goodwill gold at rank 3
  assert.equal(returned.gold, 40);
  assert.equal(returned.state.orderAt, 500);
  assert.equal(tavernPatienceSeconds(returned.state.room), 105);
  assert.ok(tavernRoomMusicShare(returned.state.room) > 1);
  assert.equal(tavernPatienceSeconds({ warmth: 0, energy: 6, tension: 6 }), 75);
  assert.equal(tavernRoomMusicShare({ warmth: 0, energy: 0, tension: 6 }), .8);
});
test('legacy shifts without encounter data remain playable', () => {
  const st = ready(); delete st.room; for (const order of st.orders) delete order.encounter;
  assert.equal(tavernRoomEvent(st), null); assert.equal(tavernRoomAvailable(st), false);
  assert.equal(stepTavernShift(st, { op: 'collect', target: 'guest' }, 130).state.phase, 'dirty');
});
