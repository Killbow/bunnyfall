// PHASE 4: the workshop yard - built on a staked plot, a batch from the Stores, collected once, one product order a week
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { emptyGarden } from '../src/net/farmGardenLaw.js';
import { farmGarden } from '../server-account/src/farmGardens.js';
import { stepFarmWorkshop, workshopStages, productOrder, WORKSHOPS, validWorkshops } from '../src/net/farm/workshopLaw.js';
import { farmWeek } from '../src/net/farmProgressLaw.js';

function fixture(rank = 0) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE guild_members (player TEXT, char_id TEXT, guild_id TEXT, rank INTEGER, name TEXT, joined_at INTEGER);
    CREATE TABLE players (id TEXT PRIMARY KEY);
    CREATE TABLE guilds (id TEXT PRIMARY KEY, treasury INTEGER, realm_gold INTEGER, moved_by TEXT, moved_at INTEGER, moved_kind TEXT);
    CREATE TABLE company_farms (map_id INTEGER PRIMARY KEY, guild_id TEXT, name TEXT, climate INTEGER, region INTEGER);
    CREATE TABLE guild_prof_stores (guild_id TEXT, material TEXT, dep_player TEXT, dep_char TEXT, qty INTEGER, moved_by TEXT, moved_at INTEGER, PRIMARY KEY(guild_id, material, dep_player, dep_char));
    CREATE TABLE realm_tx_guard (moved INTEGER, expected INTEGER, CHECK (moved = expected));
    CREATE TABLE company_farm_chores (map_id INTEGER, day INTEGER, account TEXT, name TEXT, PRIMARY KEY(map_id, day, account));
    INSERT INTO guild_members VALUES ('tester', 'char1', 'guild1', ${rank}, 'Tester', 1);
    INSERT INTO guilds VALUES ('guild1',1000000,1000000,NULL,0,NULL);
    INSERT INTO company_farms VALUES (42, 'guild1', 'Test farm', 223, 17);`);
  sql.exec(readFileSync(new URL('../server-account/migrations/0212_farm_gardens.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../server-account/migrations/0217_farm_work.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../server-account/migrations/0025_marks.sql', import.meta.url), 'utf8'));
  const prepare = (text, args = []) => ({ bind: (...a) => prepare(text, a),
    first: async () => sql.prepare(text).get(...args) ?? null,
    all: async () => ({ results: sql.prepare(text).all(...args) }),
    run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args).changes) } }),
  });
  const db = { prepare, async batch(steps) { sql.exec('BEGIN'); try { const r = []; for (const s of steps) r.push(await s.run()); sql.exec('COMMIT'); return r; } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
  sql.prepare('INSERT INTO company_farm_gardens VALUES (42,0,?)').run(JSON.stringify(emptyGarden()));
  return { sql, ctx: { db, nowS: 100, env: { MARKS_OPEN: 'on' } }, player: { id: 'tester', handle: 'Tester' } };
}

test('a workshop rises over real time; its batch takes inputs, waits on the shelf and is collected once', () => {
  let g = emptyGarden();
  assert.equal(stepFarmWorkshop(g, { act: 'start', workshop: 'windmill', recipe: 'flour' }, 1000).error, 'farm-workshop-rising', 'No batch before it is built');
  const built = stepFarmWorkshop(g, { act: 'build', workshop: 'churn' }, 1000);
  assert.equal(built.gold, WORKSHOPS.churn.gold); g = built.garden;
  assert.equal(workshopStages(g, 1000).wk_churn, 2, 'rising: scaffold'); assert.equal(stepFarmWorkshop(g, { act: 'build', workshop: 'churn' }, 1001).error, 'farm-workshop-built');
  assert.equal(stepFarmWorkshop(g, { act: 'start', workshop: 'churn', recipe: 'butter' }, 1000 + WORKSHOPS.churn.buildS - 1).error, 'farm-workshop-rising');
  const t0 = 1000 + WORKSHOPS.churn.buildS;
  assert.equal(workshopStages(g, t0).wk_churn, 3, 'built');
  const go = stepFarmWorkshop(g, { act: 'start', workshop: 'churn', recipe: 'butter' }, t0);
  assert.deepEqual(go.consume, { key: 'food:milk', units: 6 }); assert.equal(go.started, 1); g = go.garden; assert.ok(validWorkshops(g));
  assert.equal(workshopStages(g, t0 + 60).wo_churn, 1, 'working');
  assert.equal(stepFarmWorkshop(g, { act: 'start', workshop: 'churn', recipe: 'cheesewheel' }, t0 + 60).error, 'farm-workshop-busy');
  assert.equal(stepFarmWorkshop(g, { act: 'collect', workshop: 'churn' }, t0 + 60).error, 'farm-workshop-nothing');
  const done = t0 + 4 * 3600, got = stepFarmWorkshop(g, { act: 'collect', workshop: 'churn' }, done);
  assert.equal(workshopStages(g, done).wo_churn, 2, 'shelf full');
  assert.deepEqual(got.deposit, [{ material: 'food:butter', qty: 3 }]); assert.equal(got.garden.batches, undefined);
  assert.equal(stepFarmWorkshop(got.garden, { act: 'collect', workshop: 'churn' }, done).error, 'farm-workshop-nothing', 'A shelf is collected once');
  // a late start collects the finished batch first, so nothing is lost
  const next = stepFarmWorkshop(g, { act: 'start', workshop: 'churn', recipe: 'cheesewheel' }, done + 99999);
  assert.deepEqual(next.deposit, [{ material: 'food:butter', qty: 3 }]); assert.equal(next.garden.batches.churn.out, 'food:cheesewheel');
  assert.equal(stepFarmWorkshop(g, { act: 'start', workshop: 'churn', recipe: 'nope' }, done).error, 'farm-workshop-bad');
  assert.equal(validWorkshops({ built: { mill: 5 } }), false);
  assert.equal(validWorkshops({ batches: { churn: { r: 'x', t0: 0, t1: 1, out: 'a', qty: 1 } } }), false);
});

test('the workshop handler spends gold and Stores exactly once, pays one product order a week, and counts farm work', async () => {
  const f = fixture();
  f.sql.exec("INSERT INTO players (id) VALUES ('tester')");
  let version = 0;
  const go = async (fields, nowS) => { const r = await farmGarden({ ...f.ctx, nowS }, f.player, { character: 'char1', mapId: 42, op: 'workshop', version, ...fields }); if (r.ok) version = r.version; return r; };
  const T = 100000;
  const b = await go({ act: 'build', workshop: 'brewery' }, T); assert.ok(b.ok, JSON.stringify(b));
  assert.equal(f.sql.prepare('SELECT treasury FROM guilds').get().treasury, 1000000 - WORKSHOPS.brewery.gold);
  assert.equal((await go({ act: 'build', workshop: 'brewery' }, T)).error, 'farm-workshop-built');
  const ready = T + WORKSHOPS.brewery.buildS;
  assert.equal((await go({ act: 'start', workshop: 'brewery', recipe: 'ale' }, ready)).error, 'farm-workshop-nostock', 'No grain, no batch');
  assert.equal(version, 1, 'A refused batch leaves the garden alone');
  f.sql.exec("INSERT INTO guild_prof_stores VALUES ('guild1','food:grain','','',25,'t',1)");
  const s = await go({ act: 'start', workshop: 'brewery', recipe: 'ale' }, ready); assert.ok(s.ok, JSON.stringify(s));
  assert.equal(f.sql.prepare("SELECT qty FROM guild_prof_stores WHERE material='food:grain'").get().qty, 15, 'The batch takes ten grain');
  assert.equal(f.sql.prepare('SELECT farm_work FROM players').get().farm_work, 10, 'A started batch is 10 farm work');
  assert.equal((await go({ act: 'collect', workshop: 'brewery' }, ready + 100)).error, 'farm-workshop-nothing');
  const c = await go({ act: 'collect', workshop: 'brewery' }, ready + 12 * 3600); assert.ok(c.ok);
  assert.equal(f.sql.prepare("SELECT qty FROM guild_prof_stores WHERE material='food:ale'").get().qty, 5);
  assert.equal(f.sql.prepare('SELECT farm_work FROM players').get().farm_work, 10, 'Collecting is no extra work');
  assert.equal((await go({ act: 'collect', workshop: 'brewery' }, ready + 12 * 3600)).error, 'farm-workshop-nothing', 'Ale is credited once');
  // the product order: stock-checked, paid once a week, an officer's
  const week = farmWeek(ready), o = productOrder(42, week);
  assert.equal((await go({ act: 'order' }, ready)).error, 'farm-workshop-nostock');
  f.sql.prepare("INSERT INTO guild_prof_stores VALUES ('guild1',?,'','',?,'t',1) ON CONFLICT (guild_id,material,dep_player,dep_char) DO UPDATE SET qty=?").run(o.key, o.qty + 5, o.qty + 5);
  const before = f.sql.prepare('SELECT treasury FROM guilds').get().treasury;
  assert.ok((await go({ act: 'order' }, ready)).ok);
  assert.equal(f.sql.prepare('SELECT treasury FROM guilds').get().treasury, before + o.gold);
  assert.equal(f.sql.prepare('SELECT qty FROM guild_prof_stores WHERE material=?').get(o.key).qty, 5);
  assert.equal((await go({ act: 'order' }, ready)).error, 'farm-order-week', 'One order a week');
  const stale = await farmGarden({ ...f.ctx, nowS: ready }, f.player, { character: 'char1', mapId: 42, op: 'workshop', act: 'order', version: version - 1 });
  assert.equal(stale.error, 'farm-bed-version', 'A replayed claim pays nothing');
  assert.equal(f.sql.prepare('SELECT treasury FROM guilds').get().treasury, before + o.gold);
  f.sql.close();
  const m = fixture(3); m.sql.exec("INSERT INTO guild_members VALUES ('boss', 'bosschar', 'guild1', 0, 'Boss', 1)");
  const denied = await farmGarden({ ...m.ctx, nowS: T }, m.player, { character: 'char1', mapId: 42, op: 'workshop', act: 'build', workshop: 'press', version: 0 });
  assert.equal(denied.error, 'farm-rank', 'Building is an officer\'s');
  m.sql.close();
  const p = fixture(); p.sql.exec('UPDATE guilds SET treasury = 100');
  const poor = await farmGarden({ ...p.ctx, nowS: T }, p.player, { character: 'char1', mapId: 42, op: 'workshop', act: 'build', workshop: 'press', version: 0 });
  assert.equal(poor.error, 'farm-gold', 'A treasury short of the price is refused as gold, not a version clash');
  assert.equal(p.sql.prepare('SELECT version FROM company_farm_gardens').get().version, 0);
  p.sql.close();
});

test('the apiary makes honey from nothing; the loom and the press have recipes a desert farm can run', async () => {
  // 2026-11-20, a player: no honey on a farm for the brewery's mead; the loom and press useless in the desert
  const f = fixture();
  f.sql.exec("INSERT INTO players (id) VALUES ('tester')");
  let version = 0;
  const go = async (fields, nowS) => { const r = await farmGarden({ ...f.ctx, nowS }, f.player, { character: 'char1', mapId: 42, op: 'workshop', version, ...fields }); if (r.ok) version = r.version; return r; };
  const stores = (material) => f.sql.prepare('SELECT COALESCE(SUM(qty), 0) AS q FROM guild_prof_stores WHERE material = ?').get(material).q;
  const T = 100000;
  assert.ok((await go({ act: 'build', workshop: 'apiary' }, T)).ok);
  assert.equal(f.sql.prepare('SELECT treasury FROM guilds').get().treasury, 1000000 - WORKSHOPS.apiary.gold);
  const ready = T + WORKSHOPS.apiary.buildS;
  assert.equal(WORKSHOPS.apiary.recipes[0].in, null, 'bees need no input');
  const s = await go({ act: 'start', workshop: 'apiary', recipe: 'honey' }, ready);
  assert.ok(s.ok, 'a batch starts with an empty Stores: ' + JSON.stringify(s));
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM guild_prof_stores').get().n, 0, 'and takes nothing from them');
  assert.equal((await go({ act: 'start', workshop: 'apiary', recipe: 'honey' }, ready + 60)).error, 'farm-workshop-busy');
  assert.ok((await go({ act: 'collect', workshop: 'apiary' }, ready + 12 * 3600)).ok);
  assert.equal(stores('food:honey'), 4, 'four honey for the brewery');
  assert.equal(f.sql.prepare('SELECT farm_work FROM players').get().farm_work, 10);
  // the loom: desert root and grain straw both make linen, each taking exactly its own input
  assert.ok((await go({ act: 'build', workshop: 'loom' }, ready)).ok);
  const woven = ready + WORKSHOPS.loom.buildS;
  f.sql.exec("INSERT INTO guild_prof_stores VALUES ('guild1','food:root','','',20,'t',1), ('guild1','food:grain','','',30,'t',1)");
  assert.ok((await go({ act: 'start', workshop: 'loom', recipe: 'rootlinen' }, woven)).ok);
  assert.equal(stores('food:root'), 12, 'eight desert root'); assert.equal(stores('food:grain'), 30, 'and no grain');
  assert.ok((await go({ act: 'collect', workshop: 'loom' }, woven + 3 * 3600)).ok);
  assert.equal(stores('cloth:linen'), 2);
  assert.ok((await go({ act: 'start', workshop: 'loom', recipe: 'strawlinen' }, woven + 4 * 3600)).ok);
  assert.equal(stores('food:grain'), 18, 'twelve grain of straw');
  // the press: root oil and grain oil
  assert.ok((await go({ act: 'build', workshop: 'press' }, woven + 5 * 3600)).ok);
  const pressed = woven + 5 * 3600 + WORKSHOPS.press.buildS;
  assert.ok((await go({ act: 'start', workshop: 'press', recipe: 'rootoil' }, pressed)).ok);
  assert.equal(stores('food:root'), 4);
  assert.ok((await go({ act: 'collect', workshop: 'press' }, pressed + 6 * 3600)).ok);
  assert.equal(stores('food:oil'), 3);
  assert.ok((await go({ act: 'start', workshop: 'press', recipe: 'grainoil' }, pressed + 7 * 3600)).ok);
  assert.equal(stores('food:grain'), 6, 'twelve grain pressed');
  f.sql.close();
});
