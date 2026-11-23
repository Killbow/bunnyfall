// the companion-state side of Phase 5, on real revenant records read from a mirror.
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const rec = (id, mobileType, over = {}) => ({ id, rev: 1, mobileType, gender: 'male', given: 'Grushnak', epithet: 'the Scarred', name: 'Grushnak the Scarred', rank: 3, born: 1, sworn: true, fate: 'sworn', swornAt: 5, companion: { state: 'with', loyalty: 95 }, history: [], ...over });
const player = { characterId: 'cx1', name: 'Tester', items: [] };
store.set('dagger.revenant.cx1', JSON.stringify({ v: 1, lastDay: 3, list: [rec('wolf1', 262), rec('orc1', 6000 > 0 ? 8 : 8), rec('bear1', 4), rec('spider1', 6), rec('bat1', 3)] }));
const R = await import('../src/revenants/revenant.js');
const C = await import('../src/revenants/revenantCompanions.js');
C.setRetinuePlayer(player);
const heard = []; C.setRetinueListener((k, r) => heard.push([k, r.id]));
R.revenantsFor(player);
assert.equal(C.revenantsWithYou().length, 5);
assert.ok(C.stationRefusal(R.revenantRecord(player, 'orc1')), 'an orc is never stationed');
assert.equal(C.stationRefusal(R.revenantRecord(player, 'wolf1')), null);
assert.equal(C.stationRevenant('wolf1', 42, 1000), null);
const w = R.revenantRecord(player, 'wolf1');
assert.equal(w.companion.state, 'station'); assert.deepEqual(w.companion.station, { mapId: 42, sinceS: 1000 });
assert.equal(C.revenantsWithYou().length, 4, 'a station frees a companion slot');
assert.equal(R.swornRevenants().length, 5, 'but still counts toward the retinue');
assert.equal(C.retinueHasRoom(), true); // 5 of 6
assert.ok(C.stationRefusal(w), 'only one at my side is stationed');
assert.match(C.callRefusal(w, 0) ?? '', /farm/i, 'the roster cannot call it from afar');
assert.ok(C.errandRefusal(w, 0), 'no errand from a post');
assert.equal(C.releaseRevenant('wolf1'), null, 'no release from a post');
assert.ok(C.revenantsAway().includes(w) && C.revenantsStationed().includes(w));
// it never deserts while stationed: a very disloyal one, many days of festering
w.companion.loyalty = 0; R.revenantRecord(player, 'orc1').companion.loyalty = 0;
for (let i = 0; i < 40; i++) R.revenantFester(player, { now: (10 + i) * 1440, rolls: () => 0 });
assert.equal(R.revenantRecord(player, 'wolf1').sworn, true, 'it never deserts while stationed');
assert.equal(R.revenantRecord(player, 'wolf1').companion.loyalty, 0, 'and its loyalty stands where it is');
// the record survives a save/load round trip
const again = R.mergeRevenants(R.allRevenants().map((r) => JSON.parse(JSON.stringify(r))), []);
assert.deepEqual(again.find((r) => r.id === 'wolf1').companion.station, { mapId: 42, sinceS: 1000 });
assert.equal(again.find((r) => r.id === 'wolf1').companion.state, 'station');
// reconcile: the service's word wins
let out = C.reconcileStations(42, ['wolf1']); assert.deepEqual(out, { home: [], marked: [] });
out = C.reconcileStations(42, ['wolf1', 'bear1']); assert.deepEqual(out.marked, ['Grushnak the Scarred']);
assert.equal(R.revenantRecord(player, 'bear1').companion.state, 'station', 'a beast the farm holds is marked stationed');
out = C.reconcileStations(42, []); assert.equal(out.home.length, 2, 'beasts the farm no longer holds come home');
assert.equal(R.revenantRecord(player, 'wolf1').companion.state, 'with'); assert.equal(R.revenantRecord(player, 'wolf1').companion.station, null);
assert.ok(heard.some(([k, id]) => k === 'arrive' && id === 'wolf1'), 'and walk back through the portal');
// recall into a full retinue goes away, not with
C.stationRevenant('spider1', 7, 1);
const fill = R.revenantRecord(player, 'bat1'); void fill;
assert.equal(C.recallStationed('spider1'), 'with');   // 4 with + this: 5 of... slots decide
// a lost farm lets the roster call it
C.stationRevenant('spider1', 7, 1);
C.setStationHome(() => false);
assert.equal(C.callRefusal(R.revenantRecord(player, 'spider1'), 0), null, 'a farm lost: the beast may be called');
assert.equal(C.callRevenant('spider1', 0), null); assert.equal(R.revenantRecord(player, 'spider1').companion.state, 'with');
assert.equal(R.revenantRecord(player, 'spider1').companion.station, null);
console.log('PASS companion state');
