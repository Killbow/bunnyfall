// CREW-SIGNED (2026-10-27, the SEA-OPEN slice; bible/03-World/Shipyards.md CREW-SIGNED): a crew hall's recruit signed once
// online - the law both ends read (src/net/crewSignLaw.js), the service's routes over the real Worker and its database
// (server-account/src/crewSigns.js, migrations/0179), the clock's sweep (cron.js `crew-signs`) and the client's door
// (net/accountClient.js accountCrewSigns) through the same Worker. tools/mutants/seaopen.json (CREW-).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService, sessionStorageOf } from '../accountDb.mjs';
import { accountCrewSigns, SESSION_KEY } from '../../src/net/accountClient.js';
import { crewSignOf, crewDayAt, crewDayOk, CREW_SIGN_SLOTS, CREW_SIGN_DAY_MAX, CREW_SIGN_DAY_SPAN, CREW_SIGN_KEEP_DAYS } from '../../src/net/crewSignLaw.js';
import { RECRUITS_A_DAY, recruitsOf } from '../../src/systems/crewHall.js';
import { sharedClassicMinutes } from '../../src/net/wire.js';
import { runCron } from '../../server-account/src/cron.js';
import { ROUTES } from '../../server-account/src/service.js';

test('CREW-SIGNED the law: a recruit\'s id is his hall\'s town, day and slot - the hall\'s own ids read, nothing else; the day is the shared clock\'s, a day either side asked (mutants: the slots, the span, the shared day)', () => {
  assert.equal(CREW_SIGN_SLOTS, RECRUITS_A_DAY, 'a hall\'s sailors');
  for (const r of recruitsOf({ mapId: 4242, day: 31000, regionIndex: 17 })) assert.deepEqual(crewSignOf(r.id), { town: 4242, day: 31000, slot: Number(r.id.split(':')[2]) });
  assert.deepEqual(crewSignOf('4294967295:0:5'), { town: 4294967295, day: 0, slot: 5 });
  for (const bad of ['4242:31000:6', '4294967296:1:0', '4242:31000', '-1:3:0', '4242:31000:0:1', 'a:b:c', '', null, 42, '4242:31000:0 ']) assert.equal(crewSignOf(bad), null, String(bad));
  const ms = Date.UTC(2026, 9, 27, 12);
  assert.equal(crewDayAt(ms), Math.floor(sharedClassicMinutes(ms) / 1440));
  assert.equal(CREW_SIGN_DAY_SPAN, 1);
  const d = crewDayAt(ms);
  assert.deepEqual([d - 2, d - 1, d, d + 1, d + 2].map((x) => crewDayOk(x, ms)), [false, true, true, true, false]);
});

test('CREW-SIGNED the service: the first account to sign a recruit holds him for his day - asked again, the same; another is refused `crew-taken`; the hall says whose; a release by another lets nothing go, by the holder frees him; a bad id, a far day, a squatter refused (mutants: the holder unread, the release unowned, the cap, the day)', async () => {
  const S = await standService();
  const day = crewDayAt(Date.now());
  const a = await S.registered('Ashby'), b = await S.registered('Brannoc');
  const id = `4242:${day}:3`;
  const sign = (who, x) => S.call('/v1/crew/sign', { id: x }, who.secret);
  assert.ok(ROUTES.has('/v1/crew/sign') && ROUTES.has('/v1/crew/hall') && ROUTES.has('/v1/crew/release'));
  assert.deepEqual(await sign(a, id), { status: 200, body: { signed: true, fresh: true } });
  assert.deepEqual(await sign(a, id), { status: 200, body: { signed: true, fresh: false } }, 'asked again: his already');
  assert.deepEqual(await sign(b, id), { status: 409, body: { error: 'crew-taken' } });
  assert.deepEqual((await S.call('/v1/crew/hall', { town: 4242, day }, b.secret)).body, { taken: [3], mine: [] });
  assert.deepEqual((await S.call('/v1/crew/hall', { town: 4242, day }, a.secret)).body, { taken: [], mine: [3] });
  assert.deepEqual((await S.call('/v1/crew/hall', { town: 4243, day }, a.secret)).body, { taken: [], mine: [] }, 'another town\'s hall');
  assert.deepEqual((await S.call('/v1/crew/release', { id }, b.secret)).body, { released: false }, 'not his to let go');
  assert.deepEqual(await sign(b, id), { status: 409, body: { error: 'crew-taken' } });
  assert.deepEqual((await S.call('/v1/crew/release', { id }, a.secret)).body, { released: true });
  assert.deepEqual(await sign(b, id), { status: 200, body: { signed: true, fresh: true } }, 'back at the hall, signed by the next');
  // a row another account holds, however it came there
  S.env.DB._raw.prepare('INSERT INTO crew_signed (town, day, slot, player, at) VALUES (?, ?, ?, ?, ?)').run(4242, day, 0, b.id, 1);
  assert.deepEqual(await sign(a, `4242:${day}:0`), { status: 409, body: { error: 'crew-taken' } });
  // the refusals
  for (const bad of ['4242:1:9', 'nope', `4242:${day}:6`]) assert.deepEqual(await sign(a, bad), { status: 400, body: { error: 'crew-bad' } }, bad);
  assert.deepEqual(await sign(a, `4242:${day + CREW_SIGN_DAY_SPAN + 1}:1`), { status: 400, body: { error: 'crew-day' } });
  assert.deepEqual(await sign(a, `4242:${day - CREW_SIGN_DAY_SPAN - 1}:1`), { status: 400, body: { error: 'crew-day' } });
  assert.equal((await sign(a, `4242:${day - CREW_SIGN_DAY_SPAN}:1`)).status, 200, 'yesterday\'s, a clock a little behind');
  assert.equal((await S.call('/v1/crew/hall', { town: 4242, day: day + 5 }, a.secret)).body.error, 'crew-day');
  assert.equal((await S.call('/v1/crew/sign', { id }, null)).status, 401, 'behind a session');
  // the squatter: CREW_SIGN_DAY_MAX a day, then refused - his own again still answered
  let n = 0;
  for (let town = 1; n < CREW_SIGN_DAY_MAX; town++) for (let slot = 0; slot < CREW_SIGN_SLOTS && n < CREW_SIGN_DAY_MAX; slot++, n++) assert.equal((await sign(a, `${town}:${day}:${slot}`)).status, 200);
  assert.deepEqual(await sign(a, `999:${day}:0`), { status: 429, body: { error: 'crew-many' } });
  assert.deepEqual(await sign(a, `1:${day}:0`), { status: 200, body: { signed: true, fresh: false } });
  assert.equal((await sign(b, `999:${day}:0`)).status, 200, 'another account\'s day its own');
});

test('CREW-SIGNED the sweep: the clock lets a row go CREW_SIGN_KEEP_DAYS past its day, never sooner (mutants: the keep)', async () => {
  const S = await standService();
  const nowS = Math.floor(Date.now() / 1000), day = crewDayAt(nowS * 1000);
  const put = S.env.DB._raw.prepare('INSERT INTO crew_signed (town, day, slot, player, at) VALUES (?, ?, ?, ?, ?)');
  for (const [i, d] of [day, day - CREW_SIGN_KEEP_DAYS, day - CREW_SIGN_KEEP_DAYS - 1, day - 40].entries()) put.run(7, d, i, 'p', 1);
  const jobs = (await import('../../server-account/src/cron.js')).HOUR_JOBS.filter(([name]) => name === 'crew-signs');
  assert.equal(jobs.length, 1);
  const [r] = await runCron(S.env, { cron: 'x', nowS, jobs });
  assert.equal(r.ok, true);
  assert.equal(r.changed, 2);
  assert.deepEqual(S.env.DB._raw.prepare('SELECT day FROM crew_signed ORDER BY day DESC').all().map((x) => x.day), [day, day - CREW_SIGN_KEEP_DAYS]);
});

test('CREW-SIGNED the door (accountClient.js accountCrewSigns): the hall, a sign and a release through the real Worker behind the device\'s session (mutants: the routes)', async () => {
  const S = await standService();
  const a = await S.registered('Corwen'), b = await S.registered('Dalla');
  const day = crewDayAt(Date.now());
  const doorOf = (who) => accountCrewSigns({ fetch: S.fetch, storage: sessionStorageOf(SESSION_KEY, who) });
  const A = doorOf(a), B = doorOf(b);
  const id = `77:${day}:2`;
  const said = async (p) => { const r = await p; return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, status: r.status }; };
  assert.deepEqual(await said(A.sign({ id })), { ok: true, data: { signed: true, fresh: true } });
  assert.deepEqual(await said(B.sign({ id })), { ok: false, error: 'crew-taken', status: 409 });
  assert.deepEqual(await said(B.hall({ town: 77, day })), { ok: true, data: { taken: [2], mine: [] } });
  assert.deepEqual(await said(A.release({ id })), { ok: true, data: { released: true } });
  assert.deepEqual(await said(B.hall({ town: 77, day })), { ok: true, data: { taken: [], mine: [] } });
});
