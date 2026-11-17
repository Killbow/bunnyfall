import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { emptyGarden, stepFarmGarden, gardenGrowth, gardenStage, FARM_WATER_S } from '../src/net/farmGardenLaw.js';
import { farmGarden } from '../server-account/src/farmGardens.js';
import { createFarmDoor } from '../src/systems/farmDoor.js';
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
  assert.deepEqual(harvest.harvest, { crop: 'grain', material: 'food:grain', qty: 2 });
  assert.equal(gardenStage(harvest.garden.beds[0], ripe), 'tilled');
  assert.ok(stepFarmGarden(harvest.garden, { op: 'harvest', bed: 0 }, ripe).error);
  assert.ok(stepFarmGarden(garden, { op: 'hoe', bed: 65536 }, ripe).error);
  assert.ok(stepFarmGarden(garden, { op: 'hoe', bed: -1 }, ripe).error);
});

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE guild_members (player TEXT, char_id TEXT, guild_id TEXT, rank INTEGER, name TEXT, joined_at INTEGER);
    CREATE TABLE company_farms (map_id INTEGER PRIMARY KEY, guild_id TEXT, name TEXT, climate INTEGER, region INTEGER);
    CREATE TABLE guild_prof_stores (guild_id TEXT, material TEXT, dep_player TEXT, dep_char TEXT, qty INTEGER, moved_by TEXT, moved_at INTEGER, PRIMARY KEY(guild_id, material, dep_player, dep_char));
    CREATE TABLE realm_tx_guard (moved INTEGER, expected INTEGER, CHECK (moved = expected));
    CREATE TABLE company_farm_chores (map_id INTEGER, day INTEGER, account TEXT, name TEXT, PRIMARY KEY(map_id, day, account));
    INSERT INTO guild_members VALUES ('tester', 'char1', 'guild1', 0, 'Tester', 1);
    INSERT INTO company_farms VALUES (42, 'guild1', 'Test farm', 223, 17);`);
  sql.exec(readFileSync(new URL('../server-account/migrations/0212_farm_gardens.sql', import.meta.url), 'utf8'));
  const prepare = (text, args = []) => ({ bind: (...a) => prepare(text, a),
    first: async () => sql.prepare(text).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args).changes) } }),
  });
  const db = { prepare, async batch(steps) { sql.exec('BEGIN'); try { const r=[]; for (const s of steps) r.push(await s.run()); sql.exec('COMMIT'); return r; } catch(e) { sql.exec('ROLLBACK'); throw e; } } };
  return { sql, db, ctx: { db, nowS: 100 }, player: { id: 'tester', handle: 'Tester' } };
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
  const renderer={textures:new Map([['302_1#opaque',{}]]),createDecalBatch:()=>({}),destroyDecalBatch(){},writeDecalSlot(){},destroyBillboardBatch(){},createBillboardBatch(a,r,size,centers){batches++;return{count:centers.length};}};
  const art=createFarmGardenArt(renderer,{getTexture:async()=>({getSize:()=>({width:32,height:32})}),uploadRecord(){}});
  await art.prepare();
  const site={beds:Array.from({length:5000},(_,i)=>[i%100*2,0,Math.floor(i/100)*2])},garden=emptyGarden();
  site.beds.forEach((_,i)=>{garden.beds[i]={crop:'grain',grown:100000,tick:100,wetUntil:100000};});
  art.update(site,garden,100,-1);assert.equal(batches,1);
  art.update(site,garden,100,3);assert.equal(batches,1,'Hover must not rebuild all crops');
  art.dispose();
});
