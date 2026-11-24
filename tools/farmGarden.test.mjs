import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { emptyGarden, stepFarmGarden, stepFarmGardenAction, gardenGrowth, gardenStage, FARM_WATER_S, validGarden as validGardenLaw } from '../src/net/farmGardenLaw.js';
import { emptyFarmProgress, stepFarmDelivery, stepFarmUpgrade } from '../src/net/farmProgressLaw.js';
import { farmGarden } from '../server-account/src/farmGardens.js';
import { createFarmDoor } from '../src/guilds/farmDoor.js';
import { farmGardenField, farmGardenSite } from '../src/world/farmGardenSite.js';
import { registerFlatField } from '../src/world/flatFields.js';
import { createFarmGardenArt } from '../src/world/farmGardenArt.js';

test('soil preparation, seeds, water and real-time growth form a harvest loop', () => {
  let garden = emptyGarden();
  assert.ok(stepFarmGarden(garden, { op: 'plant', bed: 0 }, 100).error);
  garden = stepFarmGarden(garden, { op: 'hoe', bed: 0 }, 100).garden;
  garden = stepFarmGarden(garden, { op: 'plant', bed: 0, crop: 'grain' }, 100).garden;
  assert.equal(gardenGrowth(garden.beds[0], 100000), 0, 'Dry plants must pause');
  assert.ok(stepFarmGarden(garden, { op: 'harvest', bed: 0 }, 100).error);
  garden = stepFarmGarden(garden, { op: 'water', bed: 0 }, 100).garden;
  assert.ok(stepFarmGarden(garden, { op: 'water', bed: 0 }, 101).error, 'No rapid repeated watering');
  assert.equal(gardenGrowth(garden.beds[0], 100 + 10 * FARM_WATER_S), FARM_WATER_S);
  const ripe = 100 + 6 * 3600;
  assert.equal(gardenStage(garden.beds[0], ripe), 'ripe');
  const harvest = stepFarmGarden(garden, { op: 'harvest', bed: 0 }, ripe);
  assert.deepEqual(harvest.harvest, { crop: 'grain', material: 'food:grain', qty: 2, grade: 0, care: 0, traits: [] });   // PHASE 2: a Common crop, no strain
  assert.equal(gardenStage(harvest.garden.beds[0], ripe), 'tilled');
  assert.ok(stepFarmGarden(harvest.garden, { op: 'harvest', bed: 0 }, ripe).error);
  assert.ok(stepFarmGarden(garden, { op: 'hoe', bed: 65536 }, ripe).error);
  assert.ok(stepFarmGarden(garden, { op: 'hoe', bed: -1 }, ripe).error);
});

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE guild_members (player TEXT, char_id TEXT, guild_id TEXT, rank INTEGER, name TEXT, joined_at INTEGER);
    CREATE TABLE players (id TEXT PRIMARY KEY);
    CREATE TABLE guilds (id TEXT PRIMARY KEY, treasury INTEGER, realm_gold INTEGER, moved_by TEXT, moved_at INTEGER, moved_kind TEXT);
    CREATE TABLE company_farms (map_id INTEGER PRIMARY KEY, guild_id TEXT, name TEXT, climate INTEGER, region INTEGER);
    CREATE TABLE guild_prof_stores (guild_id TEXT, material TEXT, dep_player TEXT, dep_char TEXT, qty INTEGER, moved_by TEXT, moved_at INTEGER, PRIMARY KEY(guild_id, material, dep_player, dep_char));
    CREATE TABLE realm_tx_guard (moved INTEGER, expected INTEGER, CHECK (moved = expected));
    CREATE TABLE company_farm_chores (map_id INTEGER, day INTEGER, account TEXT, name TEXT, PRIMARY KEY(map_id, day, account));
    INSERT INTO guild_members VALUES ('tester', 'char1', 'guild1', 0, 'Tester', 1);
    INSERT INTO guilds VALUES ('guild1',1000000,1000000,NULL,0,NULL);
    INSERT INTO company_farms VALUES (42, 'guild1', 'Test farm', 223, 17);`);
  sql.exec(readFileSync(new URL('../server-account/migrations/0212_farm_gardens.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../server-account/migrations/0217_farm_work.sql', import.meta.url), 'utf8'));   // FARM EXPANSION: farm work
  sql.exec(readFileSync(new URL('../server-account/migrations/0025_marks.sql', import.meta.url), 'utf8'));
  sql.exec("INSERT INTO guild_marks VALUES ('guild1',1000)");
  const prepare = (text, args = []) => ({ bind: (...a) => prepare(text, a),
    first: async () => sql.prepare(text).get(...args) ?? null,
    all: async () => ({ results:sql.prepare(text).all(...args) }),
    run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args).changes) } }),
  });
  const db = { prepare, async batch(steps) { sql.exec('BEGIN'); try { const r=[]; for (const s of steps) r.push(await s.run()); sql.exec('COMMIT'); return r; } catch(e) { sql.exec('ROLLBACK'); throw e; } } };
  return { sql, db, ctx: { db, nowS: 100,env:{MARKS_OPEN:'on'} }, player: { id: 'tester', handle: 'Tester' } };
}
test('actual handler and SQLite keep shared revisions and credit a harvest exactly once', async () => {
  const f = fixture(); let version = 0;
  async function act(op, fields = {}) {
    const r = await farmGarden(f.ctx, f.player, { character: 'char1', mapId: 42, op, bed: 0, version, ...fields });
    if (r.ok) version = r.version; return r;
  }
  assert.deepEqual((await act('read', { version: -1 })).garden.beds, {});
  assert.ok((await act('hoe')).ok); assert.ok((await act('plant')).ok); assert.ok((await act('water')).ok);
  const old = version;
  assert.equal((await act('hoe', { bed: 1, version: 0 })).error, 'farm-bed-version');
  f.ctx.nowS += 6 * 3600;
  assert.ok((await act('harvest')).ok);
  assert.equal((await act('harvest', { version: old })).error, 'farm-bed-version');
  assert.equal(f.sql.prepare('SELECT qty FROM guild_prof_stores').get().qty, 2);
  assert.equal((await farmGarden(f.ctx, f.player, { character: 'char1', mapId: 99 })).error, 'farm-not-ours');
  assert.equal((await farmGarden(f.ctx, { id: 'stranger', handle: 'Stranger' }, { character: 'char1', mapId: 42, op:'hoe', bed:0, version })).error, 'no-guild');
  assert.ok((await act('hoe', { bed: 1 })).ok);
  assert.equal((await act('hoe', { bed: 2 })).choreAwarded, true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM company_farm_chores').get().n, 1);
  f.sql.close();
});
test('two gardeners racing to harvest cannot both commit', async () => {
  const f = fixture(); const ripe = emptyGarden(); ripe.beds[0] = { crop: 'grain', grown: 6 * 3600, wetUntil: 0, tick: 100 };
  f.sql.prepare('INSERT INTO company_farm_gardens VALUES (?, 3, ?)').run(42, JSON.stringify(ripe));
  // Both calls can read revision 3; SQL's guarded claim rolls back the loser including its store deposit.
  const request = { character: 'char1', mapId: 42, op: 'harvest', bed: 0, version: 3 };
  const results = await Promise.all([farmGarden(f.ctx, f.player, request), farmGarden(f.ctx, f.player, request)]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(f.sql.prepare('SELECT qty FROM guild_prof_stores').get().qty, 2);
  f.sql.close();
});
test('a completed legacy chore does not prevent entering Farming Mode or award another chore', () => {
  let entered = 0, chores = 0;
  const farm = { mapId: 42, choreDone: true };
  const door = createFarmDoor({ farms: () => ({ mineHere: () => farm, chore: () => { chores++; } }), begin: () => { entered++; }, say() {}, show() {} });
  assert.ok(door.rows({ townMapId: 42 }, null, 'grab').some((r) => r.label === 'Enter Farming Mode'));
  door.press({ townMapId: 42 }, door.verb, { asked: false, listed: true, mode: 'grab', onward: async () => {} });
  assert.equal(entered, 1); assert.equal(chores, 0);
});
test('all fields are workable and legacy beds keep their floating-origin coordinates', () => {
  registerFlatField(999101, { rangeX: 35, rangeZ: 35, spacing: 4, noise: 0 });
  const matrix = Array(16).fill(0); matrix[12] = 30; matrix[14] = 40;
  const block = { originX: 100, originZ: 200, layout: { models: [{ modelIdNum: 999101, matrix }] } };
  assert.equal(farmGardenField([block]).block, block);
  const site = farmGardenSite({ mapId: 42 }, { farms: { placeOf: () => ({ px: 1, py: 2 }) }, built: new Map([['1,2', { locBlocks: [block], locOrigin: [10, 0, 20] }]]), state: () => ({ pixelTranslation: () => [1000, 0, 2000] }), heightAt: () => 3 });
  assert.equal(site.beds.length, 289); assert.deepEqual(site.beds[0], [1129, 3, 2249]);
  const second = { ...matrix }; second[12] = 130;
  block.layout.models.push({ modelIdNum: 999101, matrix: second });
  const expanded = farmGardenSite({ mapId: 42 }, { farms: { placeOf: () => ({ px: 1, py: 2 }) }, built: new Map([['1,2', { locBlocks: [block], locOrigin: [10, 0, 20] }]]), state: () => ({ pixelTranslation: () => [1000, 0, 2000] }), heightAt: () => 3 });
  assert.equal(expanded.fields,2); assert.equal(expanded.beds.length,578);
  assert.ok(expanded.beds.some(b=>b[0]>1200));
  const far = stepFarmGarden(emptyGarden(),{op:'hoe',bed:577},100);
  assert.ok(far.garden.beds[577]); assert.equal(Object.keys(far.garden.beds).length,1);
  const legacy = { beds:Array(16).fill(null) };
  legacy.beds[0]={crop:'grain',grown:100,tick:100,wetUntil:10000};
  const migrated = stepFarmGarden(legacy,{op:'hoe',bed:577},200);
  assert.deepEqual(migrated.garden.beds[0],legacy.beds[0]);
  assert.ok(!Array.isArray(migrated.garden.beds));
});

test('visitors can read and poll revisions, but cannot change or harvest another Company farm',async()=>{
  const f=fixture();
  const visitor={id:'visitor',handle:'Visitor'};
  const read=await farmGarden(f.ctx,visitor,{mapId:42});
  assert.ok(read.ok);assert.deepEqual(read.garden.beds,{});
  assert.equal((await farmGarden(f.ctx,visitor,{mapId:42,details:true})).economy,undefined,'Visitor reads cannot expose private Company balances');
  const cached=await farmGarden(f.ctx,visitor,{mapId:42,version:read.version});
  assert.equal(cached.unchanged,true);assert.equal(cached.garden,undefined);
  assert.equal((await farmGarden(f.ctx,visitor,{mapId:42,character:'visitorchar',op:'hoe',bed:100,version:0})).error,'no-guild');
  await farmGarden(f.ctx,f.player,{mapId:42,character:'char1',op:'hoe',bed:100,version:0});
  const changed=await farmGarden(f.ctx,visitor,{mapId:42,version:0});
  assert.equal(changed.version,1);assert.ok(changed.garden.beds[100]);
  assert.equal((await farmGarden(f.ctx,visitor,{mapId:42,character:'visitorchar',op:'harvest',bed:100,version:1})).error,'no-guild');
  f.sql.close();
});

test('native crop masking only replaces worked beds and survives rebase and restore',()=>{
  const matrix=Array(16).fill(0);matrix[12]=30;matrix[14]=40;
  const group={batch:{},centers:[[19,0,29],[100,0,100]]},moves=[];
  const pixel={locOrigin:[0,0,0],locBlocks:[{originX:0,originZ:0,layout:{models:[{modelIdNum:999101,matrix}]}}],forest:{groups:new Map([['301_2',group]])}};
  const site=farmGardenSite({mapId:42},{farms:{placeOf:()=>({px:0,py:0})},built:new Map([['0,0',pixel]]),state:()=>({pixelTranslation:()=>[0,0,0]}),heightAt:()=>0,renderer:{moveBillboardBatch:(batch,centers)=>moves.push(structuredClone(centers))}});
  const garden={beds:{0:{crop:null,grown:0,tick:100,wetUntil:0}}};
  site.mask(garden,1);assert.equal(moves.at(-1)[0][1],-10000);assert.deepEqual(moves.at(-1)[1],[100,0,100]);
  const before=moves.length;site.mask(garden,1);assert.equal(moves.length,before);
  site.rebase([50,0,-30]);site.mask(garden,2);assert.equal(moves.at(-1)[0][1],-10000);
  site.restore();assert.deepEqual(moves.at(-1),group.centers);
});

test('thousands of worked beds share crop batches instead of a draw call per bed',async()=>{
  let batches=0;
  const renderer={textures:new Map([['302_54#opaque',{}]]),createDecalBatch:()=>({}),destroyDecalBatch(){},writeDecalSlot(){},destroyBillboardBatch(){},createBillboardBatch(a,r,size,centers){batches++;return{count:centers.length};}};
  const art=createFarmGardenArt(renderer,{getTexture:async()=>({getSize:()=>({width:32,height:32})}),uploadRecord(){}});
  await art.prepare();
  const site={beds:Array.from({length:5000},(_,i)=>[i%100*2,0,Math.floor(i/100)*2])},garden=emptyGarden();
  site.beds.forEach((_,i)=>{garden.beds[i]={crop:'grain',grown:100000,tick:100,wetUntil:100000};});
  art.update(site,garden,100,-1);assert.equal(batches,1);
  art.update(site,garden,100,3);assert.equal(batches,1,'Hover must not rebuild all crops');
  art.dispose();
});

const estate = (quantity=0) => {
  const garden=emptyGarden();garden.progress=emptyFarmProgress();
  for(const crop of ['grain','mushroom','herbs'])garden.progress.harvested[crop]=quantity;
  return garden;
};
test('estate milestones require every crop; improved tools, soil and irrigation change actual work',()=>{
  let garden=estate(10000);
  assert.equal(stepFarmUpgrade(garden,'tools').error,'farm-upgrade-goal');
  garden.progress.delivered={grain:1000,mushroom:1000,herbs:999};
  assert.equal(stepFarmUpgrade(garden,'tools').error,'farm-upgrade-goal');
  garden.progress.delivered.herbs=1000;
  garden=stepFarmUpgrade(garden,'tools').garden;
  assert.equal(garden.progress.upgrades.tools,1);
  assert.equal(stepFarmUpgrade(garden,'tools').error,'farm-upgrade-goal');
  assert.ok(stepFarmGardenAction(garden,{op:'hoe',beds:[0,1,2]},100).garden);
  assert.equal(stepFarmGardenAction(garden,{op:'hoe',beds:[0,1,2,3]},100).error,'farm-bed-bad');
  assert.equal(stepFarmGardenAction(garden,{op:'hoe',beds:[0,0]},100).error,'farm-bed-bad');
  garden.progress.upgrades={tools:2,irrigation:2,soil:2};
  garden=stepFarmGarden(garden,{op:'hoe',bed:0},100).garden;
  garden=stepFarmGarden(garden,{op:'plant',bed:0,crop:'grain'},100).garden;
  assert.equal(garden.beds[0].wetUntil,100+FARM_WATER_S);
  assert.equal(garden.beds[0].rate,1.25);
  const harvest=stepFarmGarden(garden,{op:'harvest',bed:0},100+6*3600/1.25);
  assert.equal(harvest.harvest.qty,4);
  assert.equal(harvest.garden.beds[0].crop,'grain');
  assert.equal(harvest.garden.beds[0].grown,0);
  assert.ok(harvest.garden.beds[0].wetUntil>100+6*3600/1.25);
  assert.equal(stepFarmGarden(harvest.garden,{op:'harvest',bed:0},100+6*3600/1.25).error,'farm-bed-action');
});

test('bulk orders consume stock and credit both treasuries once, even on a race or retry',async()=>{
  const f=fixture(),garden=estate(1000);
  f.sql.prepare('INSERT INTO company_farm_gardens VALUES (42,0,?)').run(JSON.stringify(garden));
  f.sql.exec("INSERT INTO guild_prof_stores VALUES ('guild1','food:grain','','',1000,'Farm',100)");
  const body={character:'char1',mapId:42,op:'deliver',crop:'grain',version:0};
  const results=await Promise.all([farmGarden(f.ctx,f.player,body),farmGarden(f.ctx,f.player,body)]);
  assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal(f.sql.prepare('SELECT qty FROM guild_prof_stores').get().qty,0);
  assert.equal(f.sql.prepare('SELECT treasury FROM guilds').get().treasury,1002000);
  assert.equal(f.sql.prepare('SELECT balance FROM guild_marks').get().balance,1010);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM marks_ledger WHERE kind='farm-order'").get().n,1);
  assert.equal((await farmGarden(f.ctx,f.player,body)).error,'farm-bed-version');
  assert.equal((await farmGarden(f.ctx,f.player,{...body,version:1})).error,'farm-order-week');
  const saved=JSON.parse(f.sql.prepare('SELECT garden FROM company_farm_gardens').get().garden);
  assert.equal(saved.progress.delivered.grain,1000);
  assert.equal(stepFarmDelivery(saved,'grain',f.ctx.nowS+7*86400).error,'farm-order-grown');
  f.sql.close();
});

test('a plain member ships a bulk order that passes every check',async()=>{
  const f=fixture();
  f.sql.exec("UPDATE guild_members SET rank=2; INSERT INTO guild_members VALUES ('captain','captainchar','guild1',0,'Captain',1)");
  f.sql.prepare('INSERT INTO company_farm_gardens VALUES (42,0,?)').run(JSON.stringify(estate(1000)));
  f.sql.exec("INSERT INTO guild_prof_stores VALUES ('guild1','food:grain','','',1000,'Farm',100)");
  const r=await farmGarden(f.ctx,f.player,{character:'char1',mapId:42,op:'deliver',crop:'grain',version:0});
  assert.ok(r.ok,JSON.stringify(r));
  assert.equal(f.sql.prepare('SELECT treasury FROM guilds').get().treasury,1002000);
  f.sql.close();
});

test('bought stock cannot replace farm-grown milestones; officers and the Argent switch are enforced',async()=>{
  const f=fixture();f.sql.exec("INSERT INTO guild_prof_stores VALUES ('guild1','food:grain','','',10000,'Bought',100)");
  let body={character:'char1',mapId:42,op:'deliver',crop:'grain',version:0};
  assert.equal((await farmGarden(f.ctx,f.player,body)).error,'farm-order-grown');
  assert.equal(f.sql.prepare('SELECT qty FROM guild_prof_stores').get().qty,10000);
  f.sql.exec("UPDATE guild_members SET rank=2; INSERT INTO guild_members VALUES ('captain','captainchar','guild1',0,'Captain',1)");
  assert.equal((await farmGarden(f.ctx,f.player,body)).error,'farm-order-grown','a plain member may ship: only the farm-grown rule stops it');
  assert.equal((await farmGarden(f.ctx,f.player,{...body,op:'upgrade',upgrade:'tools'})).error,'farm-rank','buying an improvement stays an officer\'s');
  f.sql.exec('UPDATE guild_members SET rank=0');f.ctx.env.MARKS_OPEN='off';
  assert.equal((await farmGarden(f.ctx,f.player,body)).error,'marks-closed');
  assert.equal(f.sql.prepare('SELECT version FROM company_farm_gardens').get().version,0);
  f.sql.close();
});

test('upgrade costs and progress claim roll back together if currency is short',async()=>{
  const f=fixture(),garden=estate(6000);garden.progress.delivered={grain:6000,mushroom:6000,herbs:6000};
  f.sql.prepare('INSERT INTO company_farm_gardens VALUES (42,0,?)').run(JSON.stringify(garden));
  const body={character:'char1',mapId:42,op:'upgrade',upgrade:'tools',version:0};
  f.sql.exec('UPDATE guild_marks SET balance=24');
  assert.equal((await farmGarden(f.ctx,f.player,body)).error,'farm-upgrade-funds');
  assert.equal(f.sql.prepare('SELECT version FROM company_farm_gardens').get().version,0);
  assert.equal(f.sql.prepare('SELECT treasury FROM guilds').get().treasury,1000000);
  f.sql.exec('UPDATE guild_marks SET balance=1000');
  assert.ok((await farmGarden(f.ctx,f.player,body)).ok);
  assert.equal(f.sql.prepare('SELECT treasury FROM guilds').get().treasury,980000);
  assert.equal(f.sql.prepare('SELECT balance FROM guild_marks').get().balance,975);
  assert.equal((await farmGarden(f.ctx,f.player,body)).error,'farm-bed-version');
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM marks_ledger WHERE kind='farm-upgrade'").get().n,1);
  f.sql.close();
});

test('two farms share one weekly Argent cap, guarded inside the payout transaction',async()=>{
  const f=fixture(),garden=estate(26000);garden.progress.orders={grain:2,mushroom:2,herbs:2};
  f.sql.exec("INSERT INTO company_farms VALUES (43,'guild1','Second farm',223,17)");
  for(const id of [42,43])f.sql.prepare('INSERT INTO company_farm_gardens VALUES (?,0,?)').run(id,JSON.stringify(garden));
  f.sql.exec("INSERT INTO guild_prof_stores VALUES ('guild1','food:grain','','',20000,'Farm',100);INSERT INTO guild_prof_stores VALUES ('guild1','food:mushroom','','',20000,'Farm',100)");
  f.sql.exec("INSERT INTO marks_ledger(src_kind,dst_kind,dst_id,kind,amount,day,at,actor,rid) VALUES('mint','guild','guild1','farm-order',400,0,100,'guild1','earlier')");
  const results=await Promise.all([farmGarden(f.ctx,f.player,{character:'char1',mapId:42,op:'deliver',crop:'grain',version:0}),farmGarden(f.ctx,f.player,{character:'char1',mapId:43,op:'deliver',crop:'mushroom',version:0})]);
  assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal(f.sql.prepare("SELECT SUM(amount) AS total FROM marks_ledger WHERE kind='farm-order'").get().total,600);
  assert.equal(f.sql.prepare('SELECT SUM(qty) AS total FROM guild_prof_stores').get().total,20000,'Losing order keeps all its crops');
  assert.equal(f.sql.prepare('SELECT SUM(version) AS total FROM company_farm_gardens').get().total,1);
  assert.equal(f.sql.prepare('SELECT treasury FROM guilds').get().treasury,1060000,'A rejected Argent payout cannot leave a gold payout behind');
  f.sql.close();
});

// PHASE 6: THREATS (threatLaw.js)
test('blight: the same dice on every end, stable once stamped, pulled for the crop, harvested Common at half yield', async () => {
  const { settleGarden } = await import('../src/net/farmGardenLaw.js');
  const { blightChance } = await import('../src/net/farm/threatLaw.js');
  const T0 = 1_800_000_000, g = emptyGarden(); g.threat = { at: Math.floor(T0 / 43200), prowl: 0 };
  for (let i = 0; i < 40; i++) g.beds[i] = { crop: 'herbs', grown: 0, tick: T0, wetUntil: 0, sown: T0, care: 0 };
  const later = T0 + 14 * 43200, a = settleGarden(g, 12345, later);
  assert.deepEqual(a, settleGarden(g, 12345, later), 'both ends roll alike');
  const sick = Object.keys(a.beds).filter((i) => a.beds[i].blight !== undefined);
  assert.ok(sick.length > 0 && sick.length < 40);
  const b = settleGarden(a, 12345, later + 3 * 43200);
  for (const i of sick) assert.equal(b.beds[i].blight, a.beds[i].blight, 'a stamp never moves');
  const healthy = Object.keys(a.beds).find((i) => a.beds[i].blight === undefined);
  assert.equal(stepFarmGardenAction(a, { op: 'pull', bed: Number(healthy), mapId: 12345 }, later).error, 'farm-bed-action');
  const pulled = stepFarmGardenAction(a, { op: 'pull', bed: Number(sick[0]), mapId: 12345 }, later);
  assert.equal(pulled.garden.beds[sick[0]].crop, null); assert.deepEqual(pulled.garden.rot[sick[0]], ['herbs']);
  const ripe = structuredClone(a); ripe.beds[sick[0]].grown = 99 * 3600;
  const h = stepFarmGardenAction(ripe, { op: 'harvest', bed: Number(sick[0]), mapId: 12345 }, later).harvests[0];
  assert.equal(h.grade, 0); assert.ok(h.blight);
  assert.ok(blightChance(['grain', 'grain', 'grain'], 'grain') > blightChance([], 'grain'));
  assert.ok(blightChance(['grain'], 'corn') < blightChance([], 'corn'), 'rotation halves it');
});
test('prowlers: an unchased wolf frightens the herd once it has gone; a click chases it; a content dog keeps the yard', async () => {
  const { settleGarden, stepFarmProwl } = await import('../src/net/farmGardenLaw.js');
  const { prowlWindow, prowlHere } = await import('../src/net/farm/threatLaw.js');
  let d = 1000, w; while (!(w = prowlWindow(7, d))) d++;
  const cow = { id: 1, kind: 'cow', name: 'B', tick: w.from - 3600, fedUntil: w.to + 86400, wateredUntil: w.to + 86400, content: 80 };
  const g = emptyGarden(); g.herd = [cow]; g.threat = { at: Math.floor(w.from / 43200), prowl: d - 1 };
  assert.equal(prowlHere(g, 7, w.from + 10).id, d);
  assert.equal(settleGarden(g, 7, w.from + 10).herd[0].content, 80, 'not while it is still there');
  assert.ok(settleGarden(g, 7, w.to + 60).herd[0].content < 80);
  const chased = stepFarmProwl(g, { mapId: 7 }, w.from + 10);
  assert.ok(chased.prowlChased); assert.ok(settleGarden(chased.garden, 7, w.to + 60).herd[0].content >= 80);
  assert.equal(stepFarmProwl(g, { mapId: 7 }, w.to + 500).error, 'farm-prowl-none');
  const dog = structuredClone(g); dog.herd.push({ ...cow, id: 2, kind: 'dog', content: 90 });
  assert.ok(settleGarden(dog, 7, w.to + 60).herd[0].content >= 80);
});

// ─── PHASE 5: sworn beasts on the farm ───
import { stepFarmStation, validStations, stationDaily, herdKeep, birdsWarded, truffleChance, harvestExtras, guanoCare, rankScale, pruneStations } from '../src/net/farm/stationLaw.js';
import { stepFarmPlough, validGarden } from '../src/net/farmGardenLaw.js';
import { createFarmGame, ploughLine } from '../src/net/farm/farmGameLaw.js';
import { contentAt, kindContent } from '../src/net/farm/herdLaw.js';
import { MOBILE_TYPES as MT } from '../src/characters/mobileTypes.js';

const WOLF = 262, BOAR = 278, DEXBAT = 260;
const beast = (kind, over = {}) => ({ player: 'tester', character: 'char1', revenantId: `r${kind}`, kind, name: 'Grushnak the Scarred', rank: 3, art: null, post: 0, since: 50, ...over });
const withBeasts = (...list) => ({ ...emptyGarden(), stations: list });

test('stationing: bounded to real beast kinds, six a farm, four a character, posts unique, recalled by the owner only', () => {
  let g = emptyGarden();
  const base = { act: 'station', who: 'tester', character: 'char1', revenantId: 'a', kind: MT.GrizzlyBear, name: 'Bruin', rank: 2, art: 'warcry', post: 0 };
  assert.equal(stepFarmStation(g, { ...base, kind: MT.Orc }, 100).error, 'farm-station-bad', 'an orc is never stationed');
  assert.equal(stepFarmStation(g, { ...base, rank: 9 }, 100).error, 'farm-station-bad');
  assert.equal(stepFarmStation(g, { ...base, post: 6 }, 100).error, 'farm-station-bad');
  const one = stepFarmStation(g, base, 100); assert.ok(one.garden && validGarden(one.garden)); g = one.garden;
  assert.equal(g.stations.length, 1);
  assert.equal(stepFarmStation(g, { ...base, post: 1 }, 100).error, 'farm-station-bad', 'one beast, one post');
  assert.equal(stepFarmStation(g, { ...base, revenantId: 'b', post: 0 }, 100).error, 'farm-station-post');
  g = stepFarmStation(g, { ...base, revenantId: 'b', kind: MT.Spider, post: 1 }, 100).garden;
  let four = g;   // the cap is four a character (it was two): two more do-nothing beasts, and the fifth is refused
  four = stepFarmStation(four, { ...base, revenantId: 'c', kind: MT.SabertoothTiger, post: 2 }, 100).garden;
  four = stepFarmStation(four, { ...base, revenantId: 'd', kind: MT.SabertoothTiger, post: 3 }, 100).garden;
  assert.equal(four.stations.length, 4);
  assert.equal(stepFarmStation(four, { ...base, revenantId: 'e', kind: MT.SabertoothTiger, post: 4 }, 100).error, 'farm-station-limit', 'four a character');
  assert.ok(stepFarmStation(g, { ...base, revenantId: 'c', post: 2, character: 'other', who: 'p2' }, 100).garden, 'another character may');
  assert.equal(stepFarmStation(emptyGarden(), { ...base, elsewhere: 4 }, 100).error, 'farm-station-limit', 'across the Company\'s farms');
  assert.ok(stepFarmStation(emptyGarden(), { ...base, elsewhere: 3 }, 100).garden, 'three elsewhere, one more here');
  assert.equal(stepFarmStation(g, { act: 'recall', who: 'p2', character: 'char1', revenantId: 'a' }, 100).error, 'farm-station-theirs');
  assert.equal(stepFarmStation(g, { act: 'recall', who: 'tester', character: 'char1', revenantId: 'zz' }, 100).error, 'farm-station-none');
  assert.equal(stepFarmStation(g, { act: 'recall', who: 'tester', character: 'char1', revenantId: 'a' }, 100).garden.stations.length, 1);
  assert.equal(validStations({ stations: Array.from({ length: 7 }, (_, i) => beast(MT.Spider, { revenantId: `x${i}`, post: i % 6 })) }), false);
  assert.equal(validStations({ stations: [beast(MT.Orc)] }), false);
  assert.equal(pruneStations(g, (p, c) => c === 'char1' && p === 'tester').stations.length, 2);
  assert.equal(pruneStations(g, () => false).stations, undefined, 'a keeper who left takes no place');
});

test('wolves keep the herd content and the birds off; rank scales', () => {
  const g = withBeasts(beast(WOLF));
  assert.ok(herdKeep(g) > 0 && birdsWarded(g)); assert.equal(herdKeep(emptyGarden()), 0);
  assert.ok(herdKeep(withBeasts(beast(WOLF, { rank: 5 }))) > herdKeep(withBeasts(beast(WOLF, { rank: 1 }))));
  const a = { id: 1, kind: 'dog', name: 'Rex', tick: 0, fedUntil: 0, wateredUntil: 0, content: 40 };   // tended by no one for a day
  assert.ok(contentAt(a, 86400, herdKeep(g)) > contentAt(a, 86400), 'the wolf lifts what neglect lowers');
  const tended = { ...g, herd: [{ ...a, fedUntil: 86400, wateredUntil: 86400, content: 55 }] };
  assert.equal(kindContent(tended, 'dog', 86400), true);
  assert.ok(validGarden(tended));
});

test('boars find truffles in mushroom beds only; bats add guano care; spiders and rats pay by the day, once', () => {
  const boar = withBeasts(beast(BOAR)); assert.ok(truffleChance(boar) > 0);
  let found = 0; for (let b = 0; b < 400; b++) found += harvestExtras(boar, { crop: 'mushroom' }, 42, b, 1000).length;
  assert.ok(found > 40 && found < 160, `about a fifth of mushroom harvests: ${found}`);
  assert.deepEqual(harvestExtras(boar, { crop: 'grain' }, 42, 1, 1000), []);
  assert.equal(guanoCare(withBeasts(beast(MT.GiantBat))), 1); assert.equal(guanoCare(withBeasts(beast(DEXBAT, { rank: 4 }))), 2); assert.equal(guanoCare(emptyGarden()), 0);
  let g = withBeasts(beast(MT.GiantBat)); g = stepFarmGarden(stepFarmGarden(g, { op: 'hoe', bed: 0 }, 100).garden, { op: 'plant', bed: 0, crop: 'grain' }, 100).garden;
  assert.equal(g.beds[0].care, 1, 'sown under a roosting bat: +1 care');
  const sp = { ...withBeasts(beast(MT.Spider, { rank: 5 }), beast(MT.Rat, { revenantId: 'rat', post: 1 })), stationDay: 10 };
  const d1 = stationDaily(sp, 12 * 86400 + 5);
  assert.deepEqual(d1.deposit, [{ material: 'hide:spider', qty: Math.round(2 * rankScale(5)) }]);
  assert.equal(d1.garden.manure, Math.round(2 * rankScale(3)), 'the rat turns a heap a day');
  assert.equal(d1.garden.stationDay, 12); assert.deepEqual(stationDaily(d1.garden, 12 * 86400 + 900).deposit, [], 'paid once a day');
  assert.equal(stationDaily({ ...sp, stationDay: 1 }, 100 * 86400).deposit[0].qty, Math.round(3 * rankScale(5)), 'at most three days are banked');
  assert.equal(stationDaily(emptyGarden(), 99999).deposit.length, 0);
});

test('a dragonling\'s greenhouse lets four beds grow out of climate, at full pace in winter; without it the climate refuses', () => {
  let g = withBeasts(beast(MT.Dragonling));
  for (let i = 0; i < 5; i++) g = stepFarmGarden(g, { op: 'hoe', bed: i }, 100).garden;
  const away = { op: 'plant', crop: 'grapes', climate: 226 };   // a mountain farm: grapes grow in none
  for (let i = 0; i < 4; i++) g = stepFarmGarden(g, { ...away, bed: i }, 100).garden;
  assert.equal(g.beds[0].glass, 1);
  assert.equal(stepFarmGarden(g, { ...away, bed: 4 }, 100).error, 'farm-seed-climate', 'only four beds under glass');
  assert.equal(stepFarmGarden(stepFarmGarden(emptyGarden(), { op: 'hoe', bed: 0 }, 100).garden, { ...away, bed: 0 }, 100).error, 'farm-seed-climate', 'no dragonling, no greenhouse');
  assert.equal(gardenGrowth({ ...g.beds[0], wetUntil: 100 + 10 * FARM_WATER_S }, 100 + 7200), 7200, 'full pace');
  assert.ok(validGarden(g));
});

test('the plough: a stationed grizzly, a played game, a whole row of wild beds at once with care that the sowing keeps', () => {
  const play = (score) => ({ kind: 'plough', score, ms: 12000 });
  const g = withBeasts(beast(MT.GrizzlyBear));
  assert.equal(stepFarmPlough(emptyGarden(), { beds: [0, 1], game: play(1) }, 100).error, 'farm-plough-none');
  assert.equal(stepFarmPlough(g, { beds: [0, 1], game: { ...play(1), ms: 100 } }, 100).error, 'farm-game-bad', 'a play too short to be honest');
  assert.equal(stepFarmPlough(g, { beds: [0, 1, 2, 3, 4, 5, 6], game: play(1) }, 100).error, 'farm-bed-bad', 'six at most');
  const done = stepFarmPlough(g, { beds: [0, 1, 2, 3, 4, 5], game: play(.95), who: 'a' }, 100);
  assert.deepEqual(done.worked, [0, 1, 2, 3, 4, 5]); assert.equal(done.garden.beds[3].care, 3); assert.equal(done.played.full, true);
  assert.equal(stepFarmPlough(done.garden, { beds: [0, 1], game: play(1) }, 100).error, 'farm-bed-action', 'already tilled');
  const sown = stepFarmGarden(done.garden, { op: 'plant', bed: 2, crop: 'grain' }, 100).garden;
  assert.equal(sown.beds[2].care, 3, 'the furrow\'s care is kept by the sowing');
  assert.equal(stepFarmPlough(g, { beds: [0], game: play(.2), who: 'b' }, 100).garden.beds[0].care, 1);
  // the game itself: untouched it wanders off the line; steered it holds it
  const idle = createFarmGame('plough'); for (let i = 0; i < 130; i++) idle.tick(.1);
  const steered = createFarmGame('plough'); for (let i = 0; i < 130; i++) { steered.input({ steer: Math.sign(ploughLine(steered.state.t + .2) - steered.state.pos) }); steered.tick(.1); }
  assert.ok(steered.report().score > .8 && idle.report().score < steered.report().score);
});

test('the route: station, recall, the Company\'s cross-farm cap, the silk deposit, and a keeper who left', async () => {
  const f = fixture();
  f.sql.exec("INSERT INTO company_farms VALUES (43,'guild1','Second farm',223,17)");
  for (const id of [42, 43]) f.sql.prepare('INSERT INTO company_farm_gardens VALUES (?,0,?)').run(id, JSON.stringify(emptyGarden()));
  const at = async (nowS, mapId, body) => farmGarden({ ...f.ctx, nowS }, f.player, { character: 'char1', mapId, ...body });
  const mk = (revenantId, post, kind = MT.Spider) => ({ op: 'station', revenantId, kind, name: 'Webster', rank: 5, art: null, post });
  const v = (n) => f.sql.prepare('SELECT version FROM company_farm_gardens WHERE map_id = ?').get(n).version;
  const stations = () => JSON.parse(f.sql.prepare('SELECT garden FROM company_farm_gardens WHERE map_id = 42').get().garden).stations;
  const D = 86400;
  assert.equal((await at(D * 20, 42, { ...mk('a', 0), version: v(42) })).station.revenantId, 'a');
  assert.ok((await at(D * 20, 43, { ...mk('b', 0, MT.Rat), version: v(43) })).ok);
  // four a character across the Company's farms (it was two): two more beasts that do no daily work, then the fifth is refused
  assert.ok((await at(D * 20, 42, { ...mk('c', 1, MT.SabertoothTiger), version: v(42) })).ok);
  assert.ok((await at(D * 20, 43, { ...mk('e', 1, MT.SabertoothTiger), version: v(43) })).ok);
  assert.equal((await at(D * 20, 42, { ...mk('f', 2, MT.SabertoothTiger), version: v(42) })).error, 'farm-station-limit', 'four a character across both farms');
  assert.equal((await at(D * 20, 42, { op: 'read' })).garden.stations.length, 2);
  assert.ok((await at(D * 21, 42, { op: 'hoe', bed: 0, version: v(42) })).ok);
  const silk = () => f.sql.prepare("SELECT qty FROM guild_prof_stores WHERE material = 'hide:spider'").get()?.qty;
  assert.equal(silk(), 2, 'a day on, the spider\'s silk is in the Stores');
  assert.ok((await at(D * 21 + 60, 42, { op: 'hoe', bed: 1, version: v(42) })).ok); assert.equal(silk(), 2, 'paid once a day');
  assert.equal((await at(D * 21 + 90, 42, { op: 'recall', revenantId: 'a', version: v(42) })).recalled.revenantId, 'a');
  assert.deepEqual(stations().map((s) => s.revenantId), ['c']);
  f.sql.exec("UPDATE company_farm_gardens SET garden = json_set(garden, '$.stations', json('[{\"player\":\"ghost\",\"character\":\"gone\",\"revenantId\":\"g\",\"kind\":6,\"name\":\"Old\",\"rank\":1,\"art\":null,\"post\":2,\"since\":1}]')) WHERE map_id = 42");
  assert.ok((await at(D * 21 + 99, 42, { ...mk('d', 3), version: v(42) })).ok);
  assert.deepEqual(stations().map((s) => s.revenantId), ['d'], 'the keeper who left takes no place');
  f.sql.close();
});

test('a big harvest keeps every sack: a hundred beds harvested leave a hundred sacks, and only the cap drops the oldest', async () => {
  const { liveSacks, SACKS_MAX } = await import('../src/net/farm/haulLaw.js');
  const T = 1_800_000_000, N = 100;
  let g = emptyGarden();
  for (let b = 0; b < N; b++) g.beds[b] = { crop: 'grain', grown: 9e9, tick: T, wetUntil: T, quality: 0, care: 0 };
  for (let b = 0; b < N; b++) g = stepFarmGardenAction(g, { op: 'harvest', bed: b, mapId: 7, who: 'p' }, T + 60 + b).garden;
  const beds = new Set(liveSacks(g, T + 200).map((s) => s.bed));
  assert.equal(beds.size, N, 'every harvested bed has its sack');
  assert.ok(validGardenLaw(g));
  // past the cap the oldest go, the newest stay
  const big = emptyGarden();
  for (let b = 0; b < SACKS_MAX + 10; b++) big.beds[b] = { crop: 'grain', grown: 9e9, tick: T, wetUntil: T, quality: 0, care: 0 };
  let h = big;
  for (let b = 0; b < SACKS_MAX + 10; b++) h = stepFarmGardenAction(h, { op: 'harvest', bed: b, mapId: 7, who: 'p' }, T + 60 + b).garden;
  const kept = liveSacks(h, T + 60 + SACKS_MAX + 10).map((s) => s.bed);   // right after the last harvest: none has expired yet
  assert.equal(kept.length, SACKS_MAX); assert.ok(kept.includes(SACKS_MAX + 9) && !kept.includes(0), 'the oldest ten went, the newest stay');
});

test('every crop the farm grows can be drawn, as a plant at every stage and as a sack on the ground and the shoulder', async () => {
  // a desert root harvest once crashed the sack drawing: only the first three crops had a sack picture
  const { FARM_SEED_IDS } = await import('../src/net/farm/cropLaw.js');
  const { createSackArt } = await import('../src/world/farm/sackArt.js');
  const { createFarmGardenArt, FARM_ART } = await import('../src/world/farmGardenArt.js');
  const renderer = { textures: new Map([['302_54#opaque', {}], ['302_0#opaque', {}]]), createDecalBatch: () => ({}), destroyDecalBatch() {}, writeDecalSlot() {}, drawDecalPicture() {},
    createBillboardBatch: () => ({}), moveBillboardBatch() {}, destroyBillboardBatch() {}, drawBillboards() {} };
  const assets = { getTexture: async () => ({ getSize: () => ({ width: 30, height: 40 }) }), uploadRecord() {} };
  const sacks = createSackArt(renderer, assets); await sacks.prepare();
  const lying = FARM_SEED_IDS.map((crop, i) => ({ id: i + 1, crop, pos: [i, 0, 0] })), shouldered = FARM_SEED_IDS.map((crop) => ({ crop }));
  sacks.update(lying, [], [0, 0, 0], [1, 0, 0]);
  for (const one of shouldered) { sacks.update([], [one], [0, 0, 0], [1, 0, 0]); sacks.update([], [], [0, 0, 0], [1, 0, 0]); }
  const art = createFarmGardenArt(renderer, assets); await art.prepare();
  const T = 1_800_000_000, site = { beds: FARM_SEED_IDS.map((_, i) => [i * 2, 0, 0]) };
  for (const crop of FARM_SEED_IDS) assert.ok(FARM_ART[crop]?.seedling && FARM_ART[crop].growing && FARM_ART[crop].ripe, `${crop} has art for every stage`);
  for (const when of [0, 3 * 3600, 99 * 3600]) {   // seedling, growing, ripe
    const beds = {}; FARM_SEED_IDS.forEach((crop, i) => { beds[i] = { crop, grown: when, tick: T, wetUntil: T, quality: 0, care: 0 }; });
    art.update(site, { beds }, T, -1);
  }
});
