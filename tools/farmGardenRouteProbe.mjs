// Actual account Worker and D1 route test, bundled with Rolldown to support sandboxed Windows builds.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { rolldown } from 'rolldown';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import {emptyFarmProgress} from '../src/net/farmProgressLaw.js';
const root = fileURLToPath(new URL('..', import.meta.url));
const work = resolve(process.env.BUNNYFALL_PROBE_DIR || root + '/scratch/farm-route-probe'); mkdirSync(work, { recursive: true });
const require = createRequire(root + '/server/package.json');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const wr = require('wrangler');
const build = await rolldown({ input: root + '/server-account/src/index.js', platform: 'browser', external: (id) => id.startsWith('cloudflare:') });
await build.write({ file: work + '/accounts.mjs', format: 'esm', codeSplitting: false }); await build.close();
const { workerOptions } = wr.unstable_getMiniflareWorkerOptions(root + '/selfhost/accounts.toml');
const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign','verify']);
const priv = Buffer.from(await crypto.subtle.exportKey('pkcs8',kp.privateKey)).toString('base64');
const pub = Buffer.from(await crypto.subtle.exportKey('raw',kp.publicKey)).toString('base64url');
const options = Object.fromEntries(['compatibilityDate','compatibilityFlags','bindings','r2Buckets','d1Databases','durableObjects','serviceBindings'].filter(k=>workerOptions[k]!==undefined).map(k=>[k,workerOptions[k]]));
writeFileSync(work + '/relay.mjs', 'export default {fetch(){return new Response("{}",{headers:{"content-type":"application/json"}})}}');
const mf = new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,workers:[
  {...options,name:'daggerfall-accounts',modulesRoot:work,modules:[{type:'ESModule',path:work+'/accounts.mjs'}],bindings:{...options.bindings,MARKS_OPEN:'on',IDENTITY_PRIVATE_KEY:priv,IDENTITY_PUBLIC_KEY:pub,GATE_PUBLIC_KEY:pub}},
  {name:'daggerfall-online',modulesRoot:work,modules:[{type:'ESModule',path:work+'/relay.mjs'}]},
]}));
try {
  await mf.ready;
  const db=await mf.getD1Database('DB','daggerfall-accounts');
  for(const file of readdirSync(root+'/server-account/migrations').filter(f=>f.endsWith('.sql')).sort()) {
    try {await db.exec(readFileSync(root+'/server-account/migrations/'+file,'utf8').replace(/--[^\n\r]*/g,'').replace(/[\r\n]+/g,' '));}
    catch(e){throw new Error('Migration '+file+': '+e.message);}
  }
  const worker=await mf.getWorker('daggerfall-accounts');
  let secret;
  async function req(route,body,auth=true){const r=await worker.fetch('http://localhost'+route,{method:'POST',headers:{'content-type':'application/json',...(secret&&auth?{authorization:'Bearer '+secret}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
  const guest=await req('/v1/auth/guest',{terms:true,privacy:true});assert.equal(guest.status,200,JSON.stringify(guest));secret=guest.data.secret;
  const player=await db.prepare('SELECT id FROM players LIMIT 1').first();
  await db.prepare("UPDATE players SET handle='FarmTester', handle_lc='farmtester' WHERE id=?").bind(player.id).run();
  await db.prepare("INSERT INTO guilds (id,name,name_key,tag,ranks,founded_at) VALUES ('farmtest','Farm Test','farmtest','FT','[]',1)").run();
  await db.prepare("INSERT INTO guild_members (player,char_id,guild_id,rank,name,joined_at) VALUES (?,'farmchar','farmtest',0,'Farmer',1)").bind(player.id).run();
  await db.prepare("INSERT INTO company_farms (map_id,guild_id,name,crop,climate,region,day,bought_at) VALUES (42,'farmtest','Test farm','food',223,17,1,1)").run();
  const body={character:'farmchar',mapId:42};
  const r=await req('/v1/farms/garden',body);assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.data.garden.beds,{});
  let version=r.data.version;
  for(const op of ['hoe','plant','water']){const step=await req('/v1/farms/garden',{...body,op,bed:0,crop:'grain',version});assert.equal(step.status,200,JSON.stringify(step));version=step.data.version;}
  const ready=await db.prepare('SELECT garden FROM company_farm_gardens WHERE map_id=42').first();
  const garden=JSON.parse(ready.garden);garden.beds[0].grown=6*3600;
  await db.prepare('UPDATE company_farm_gardens SET garden=? WHERE map_id=42').bind(JSON.stringify(garden)).run();
  const hbody={...body,op:'harvest',bed:0,version};
  const harvest=await req('/v1/farms/garden',hbody);assert.equal(harvest.status,200,JSON.stringify(harvest));
  assert.equal((await req('/v1/farms/garden',hbody)).status,409);
  assert.equal((await db.prepare("SELECT qty FROM guild_prof_stores WHERE guild_id='farmtest' AND material='food:grain'").first()).qty,2);
  // FARM EXPANSION: the harvest left its sack; a member carries it to the wagon once, and only once
  assert.equal(harvest.data.garden.sacks?.length,1,'A harvest must leave its sack');
  const sack=harvest.data.garden.sacks[0].id;
  const haul=await req('/v1/farms/garden',{...body,op:'haul',sacks:[sack],version:harvest.data.version});assert.equal(haul.status,200,JSON.stringify(haul));
  assert.equal(haul.data.hauled,2);assert.equal(haul.data.garden.cargo.grain,2);assert.equal(haul.data.garden.sacks.length,0);
  const again=await req('/v1/farms/garden',{...body,op:'haul',sacks:[sack],version:haul.data.version});assert.notEqual(again.status,200,'A sack hauls once');
  assert.equal((await db.prepare("SELECT qty FROM guild_prof_stores WHERE guild_id='farmtest' AND material='food:grain'").first()).qty,2,'Hauling must not add to the Stores');
  harvest.data.version=haul.data.version;
  assert.equal((await req('/v1/farms/garden',body,false)).status,401);
  // Seed an earned estate milestone after the real harvest path above, then exercise the real economy route.
  const grown=await db.prepare('SELECT garden FROM company_farm_gardens WHERE map_id=42').first(),estate=JSON.parse(grown.garden);
  estate.progress=emptyFarmProgress();estate.progress.harvested={grain:10000,mushroom:10000,herbs:10000};estate.progress.delivered={grain:0,mushroom:1000,herbs:1000};
  await db.prepare('UPDATE company_farm_gardens SET garden=? WHERE map_id=42').bind(JSON.stringify(estate)).run();
  await db.prepare("UPDATE guilds SET treasury=100000,realm_gold=100000,moved_by='Farm test',moved_at=1,moved_kind='farm' WHERE id='farmtest'").run();
  await db.prepare("INSERT INTO guild_marks (guild_id,balance) VALUES ('farmtest',500)").run();
  await db.prepare("UPDATE guild_prof_stores SET qty=1000 WHERE guild_id='farmtest' AND material='food:grain'").run();
  let current=harvest.data.version;
  const delivery=await req('/v1/farms/garden',{...body,op:'deliver',crop:'grain',version:current});assert.equal(delivery.status,200,JSON.stringify(delivery));current=delivery.data.version;
  const upgraded=await req('/v1/farms/garden',{...body,op:'upgrade',upgrade:'tools',version:current});assert.equal(upgraded.status,200,JSON.stringify(upgraded));current=upgraded.data.version;
  assert.equal(upgraded.data.garden.progress.upgrades.tools,1);
  assert.equal((await db.prepare("SELECT treasury FROM guilds WHERE id='farmtest'").first()).treasury,82000);
  assert.equal((await db.prepare("SELECT balance FROM guild_marks WHERE guild_id='farmtest'").first()).balance,485);
  assert.equal((await req('/v1/farms/garden',{...body,op:'upgrade',upgrade:'tools',version:current-1})).status,409);
  await db.prepare("INSERT INTO guild_prof_stores(guild_id,material,dep_player,dep_char,qty,moved_by,moved_at) VALUES('farmtest','p1:19','','',1000,'Farm',1)").run();
  const herbs=await req('/v1/farms/garden',{...body,op:'deliver',crop:'herbs',version:current});assert.equal(herbs.status,200,JSON.stringify(herbs));current=herbs.data.version;
  assert.equal((await db.prepare("SELECT qty FROM guild_prof_stores WHERE material='p1:19' AND guild_id='farmtest'").first()).qty,0);
  assert.equal((await db.prepare("SELECT balance FROM guild_marks WHERE guild_id='farmtest'").first()).balance,495);
  const funds=await req('/v1/farms/garden',{...body,version:current,details:true});assert.equal(funds.data.mayManage,true);assert.equal(funds.data.economy.gold,84000);assert.equal(funds.data.economy.argents,495);
  const visitor=await req('/v1/auth/guest',{terms:true,privacy:true},false);secret=visitor.data.secret;
  const seen=await req('/v1/farms/garden',{mapId:42});assert.equal(seen.status,200);assert.equal(seen.data.version,current);
  assert.equal((await req('/v1/farms/garden',{mapId:42,details:true})).data.economy,undefined);
  const unchanged=await req('/v1/farms/garden',{mapId:42,version:seen.data.version});assert.equal(unchanged.data.unchanged,true);assert.equal(unchanged.data.garden,undefined);
  assert.notEqual((await req('/v1/farms/garden',{mapId:42,character:'visitor',op:'hoe',bed:100,version:seen.data.version})).status,200);
  console.log('PASS: real Worker route, guest authentication, D1 migrations, shared bed operations, harvest credit, sacks hauled once to the wagon, replay rejection and read-only visitors.');
} finally {await mf.dispose();}
