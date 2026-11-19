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
  // FARM WORK (docs/FARM-EXPANSION.md 10): hoe, plant and water a bed (3), harvest 2 crops (2), haul a sack (2)
  const fw=async()=>await db.prepare('SELECT farm_work,farm_work_day,farm_work_today FROM players WHERE id=?').bind(player.id).first();
  assert.equal((await fw()).farm_work,7,'Farm work counts every kind of work: '+JSON.stringify(await fw()));
  assert.equal(haul.data.work.total,7);
  // the day's cap: at 399 today, one more bed counts 1; past it, nothing
  const today=(await fw()).farm_work_day;
  await db.prepare('UPDATE players SET farm_work=2999, farm_work_today=399 WHERE id=?').bind(player.id).run();
  const capped=await req('/v1/farms/garden',{...body,op:'hoe',bed:1,version:harvest.data.version});assert.equal(capped.status,200,JSON.stringify(capped));
  assert.deepEqual(await fw(),{farm_work:3000,farm_work_day:today,farm_work_today:400},'The cap holds at 400 a day');
  assert.equal(capped.data.work.title,'furrowhand','Crossing 3,000 earns Furrowhand');
  const over=await req('/v1/farms/garden',{...body,op:'hoe',bed:2,version:capped.data.version});assert.equal(over.status,200);
  assert.equal((await fw()).farm_work,3000,'Nothing past the cap');
  // a new day counts again; the titles and First Light follow the count
  await db.prepare('UPDATE players SET farm_work=44999, farm_work_day=farm_work_day-1 WHERE id=?').bind(player.id).run();
  const sovereign=await req('/v1/farms/garden',{...body,op:'hoe',bed:3,version:over.data.version});assert.equal(sovereign.status,200);
  assert.equal(sovereign.data.work.title,'sheafsovereign');
  const row=await db.prepare('SELECT * FROM players WHERE id=?').bind(player.id).first();
  const { titlesHeld, aurasHeld } = await import('../server-account/src/titles.js');
  for (const t of ['furrowhand','harvestwarden','sheafsovereign']) assert.ok(titlesHeld(row,{}).includes(t),'holds '+t);
  assert.ok(aurasHeld(row,{}).includes('firstlight'),'Sovereign of the Sheaf carries First Light');
  const ledger=await req('/v1/farms/garden',{...body,details:true});assert.equal(ledger.data.work.total,45000,'The ledger reads my farm work');
  harvest.data.version=sovereign.data.version;
  // CLIMATE CROPS (docs/FARM-EXPANSION.md 4.2): the farm's own climate decides, never the client's word
  const tilled=await req('/v1/farms/garden',{...body,op:'hoe',bed:4,version:harvest.data.version});assert.equal(tilled.status,200);
  const refused=await req('/v1/farms/garden',{...body,op:'plant',bed:4,crop:'corn',climate:231,version:tilled.data.version});
  assert.equal(refused.data?.error??refused.error,'farm-seed-climate','Corn will not take on an ocean farm, whatever the client says: '+JSON.stringify(refused));
  await db.prepare('UPDATE company_farms SET climate=231 WHERE map_id=42').run();
  const corn=await req('/v1/farms/garden',{...body,op:'plant',bed:4,crop:'corn',version:tilled.data.version});assert.equal(corn.status,200,JSON.stringify(corn));
  assert.equal(corn.data.garden.beds[4].crop,'corn');
  harvest.data.version=corn.data.version;
  // CARE AND GRADES (docs/FARM-EXPANSION.md 4.2-4.4): a perfect sowing and a perfect scything make a better crop
  let v=corn.data.version;
  const tl=async(b)=>{const r=await req('/v1/farms/garden',{...body,...b,version:v});assert.equal(r.status,200,JSON.stringify(r));v=r.data.version;return r;};
  await tl({op:'hoe',bed:6});
  const sowR=await tl({op:'plant',bed:6,crop:'grain',game:{kind:'sow',score:1,ms:6000}});
  assert.equal(sowR.data.garden.beds[6].care,2,'A perfect sowing gives the bed care');assert.deepEqual(sowR.data.played,{kind:'sow',full:true});
  const quick=await req('/v1/farms/garden',{...body,op:'hoe',bed:8,game:{kind:'sow',score:1,ms:10},version:v});assert.notEqual(quick.status,200,'An impossible play is refused');
  const g6=JSON.parse((await db.prepare('SELECT garden FROM company_farm_gardens WHERE map_id=42').first()).garden);
  g6.beds[6].grown=6*3600;g6.beds[6].wetUntil=g6.beds[6].tick;
  await db.prepare('UPDATE company_farm_gardens SET garden=? WHERE map_id=42').bind(JSON.stringify(g6)).run();
  const reaped=await tl({op:'harvest',bed:6,game:{kind:'scythe',score:1,ms:5000}});
  assert.ok(reaped.data.grades[0]>=1&&reaped.data.harvested>=3,'Sown and scythed with care, the crop grades Fine or better: '+JSON.stringify([reaped.data.grades,reaped.data.harvested]));
  // weeds: a planted bed dry for two days is weeded with the hoe
  await tl({op:'hoe',bed:7});await tl({op:'plant',bed:7,crop:'herbs'});
  const g7=JSON.parse((await db.prepare('SELECT garden FROM company_farm_gardens WHERE map_id=42').first()).garden);
  g7.beds[7].tick-=3*86400;g7.beds[7].sown-=3*86400;
  await db.prepare('UPDATE company_farm_gardens SET garden=? WHERE map_id=42').bind(JSON.stringify(g7)).run();
  const weeded=await tl({op:'weed',bed:7});assert.equal(weeded.data.garden.beds[7].care,1,'Weeding is care');
  // birds: the law says whether they are here this hour; the service agrees
  const { birdsNow } = await import('../src/net/farm/careLaw.js');
  const here=birdsNow(42,Math.floor(Date.now()/1000));
  const chase=await req('/v1/farms/garden',{...body,op:'birds',game:{kind:'birds',score:1,ms:9000},version:v});
  if(here){assert.equal(chase.status,200,JSON.stringify(chase));assert.ok(chase.data.chased&&chase.data.garden.chased.includes(here.id));v=chase.data.version;}
  else assert.equal(chase.data?.error??chase.error,'farm-birds-none','No birds, no chase: '+JSON.stringify(chase));
  // THREATS (Phase 6): a blighted bed is pulled with the hoe's own op, healthy ones refuse it; the prowler is chased only while there
  await tl({op:'hoe',bed:12});await tl({op:'plant',bed:12,crop:'herbs'});
  const healthyPull=await req('/v1/farms/garden',{...body,op:'pull',bed:12,version:v});assert.notEqual(healthyPull.status,200,'A healthy bed is not pulled');
  const gB=JSON.parse((await db.prepare('SELECT garden FROM company_farm_gardens WHERE map_id=42').first()).garden);
  gB.beds[12].blight=Math.floor(Date.now()/43200000);
  await db.prepare('UPDATE company_farm_gardens SET garden=? WHERE map_id=42').bind(JSON.stringify(gB)).run();
  const pulled=await tl({op:'pull',bed:12});assert.equal(pulled.data.garden.beds[12].crop,null,'Pulling clears the bed');assert.deepEqual(pulled.data.garden.rot[12],['herbs']);
  const { prowlNow } = await import('../src/net/farm/threatLaw.js');
  const prowl=await req('/v1/farms/garden',{...body,op:'prowl',version:v});
  if(prowlNow(42,Math.floor(Date.now()/1000))){assert.equal(prowl.status,200,JSON.stringify(prowl));assert.ok(prowl.data.prowlChased);v=prowl.data.version;}
  else assert.equal(prowl.data?.error??prowl.error,'farm-prowl-none','No prowler, no chase: '+JSON.stringify(prowl));
  // STRAINS (2c): a strain on the shelf is sown with its traits; an officer burns it
  const gS=JSON.parse((await db.prepare('SELECT garden FROM company_farm_gardens WHERE map_id=42').first()).garden);
  gS.strains=[{id:1,crop:'grain',name:'Golden Ear',traits:['quick','heavy']}];gS.nextStrain=2;
  await db.prepare('UPDATE company_farm_gardens SET garden=? WHERE map_id=42').bind(JSON.stringify(gS)).run();
  await tl({op:'hoe',bed:10});
  const sownS=await tl({op:'plant',bed:10,crop:'grain',strain:1});assert.deepEqual(sownS.data.garden.beds[10].traits,['quick','heavy']);
  const wrongS=await req('/v1/farms/garden',{...body,op:'plant',bed:10,crop:'grain',strain:9,version:v});assert.notEqual(wrongS.status,200,'An unknown strain is refused');
  const burnt=await tl({op:'burn',strain:1});assert.equal(burnt.data.garden.strains.length,0,'An officer burns a strain');
  // THE HERD (Phase 3): the drover by his day; a cow fed from the Stores, watered, milked; the sty mucked for manure
  const { droverHere } = await import('../src/net/farm/herdLaw.js'); const { farmWeek } = await import('../src/net/farmProgressLaw.js');
  const dr=droverHere({},42,Math.floor(Date.now()/1000),farmWeek);
  const buy=await req('/v1/farms/garden',{...body,op:'herd',act:'buy',offer:0,version:v});
  if(dr){assert.equal(buy.status,200,JSON.stringify(buy));v=buy.data.version;}else assert.equal(buy.data?.error??buy.error,'farm-drover-away');
  const gH=JSON.parse((await db.prepare('SELECT garden FROM company_farm_gardens WHERE map_id=42').first()).garden), tN=Math.floor(Date.now()/1000);
  gH.herd=[...(gH.herd??[]),{id:50,kind:'cow',name:'Bessie',tick:tN,fedUntil:tN,wateredUntil:tN,content:70},{id:51,kind:'pig',name:'Snout',tick:tN,fedUntil:tN,wateredUntil:tN,content:70}];
  await db.prepare('UPDATE company_farm_gardens SET garden=? WHERE map_id=42').bind(JSON.stringify(gH)).run();
  await db.prepare("INSERT INTO guild_prof_stores (guild_id,material,dep_player,dep_char,qty,moved_by,moved_at) VALUES ('farmtest','food:corn','','',10,'t',1) ON CONFLICT (guild_id,material,dep_player,dep_char) DO UPDATE SET qty=10").run();
  await tl({op:'herd',act:'feed',animal:50});
  assert.equal((await db.prepare("SELECT qty FROM guild_prof_stores WHERE guild_id='farmtest' AND material='food:corn'").first()).qty,8,'Feeding takes two corn from the Stores');
  await tl({op:'herd',act:'water',animal:50});
  const milkBefore=Number((await db.prepare("SELECT COALESCE(SUM(qty),0) AS q FROM guild_prof_stores WHERE guild_id='farmtest' AND material='food:milk'").first()).q);
  const milked=await tl({op:'herd',act:'milk',animal:50,game:{kind:'milk',score:1,ms:4000}});
  assert.ok(milked.data.milk>=3,'A good milking: '+milked.data.milk);
  assert.equal(Number((await db.prepare("SELECT COALESCE(SUM(qty),0) AS q FROM guild_prof_stores WHERE guild_id='farmtest' AND material='food:milk'").first()).q),milkBefore+milked.data.milk,'Milk goes to the Stores');
  const again2=await req('/v1/farms/garden',{...body,op:'herd',act:'milk',animal:50,version:v});assert.notEqual(again2.status,200,'Once a day');
  const mucked=await tl({op:'herd',act:'muck',pen:'sty'});assert.equal(mucked.data.garden.manure,2,'A content pig gives manure');
  harvest.data.version=v;
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
  console.log('PASS: real Worker route, guest authentication, D1 migrations, shared bed operations, harvest credit, sacks hauled once to the wagon, farm work with its daily cap, the farm titles and First Light, climate crops by the farm climate, care and grades from the field games, weeding and the birds, strains sown and burnt, the herd fed, watered, milked and mucked out, replay rejection and read-only visitors.');
} finally {await mf.dispose();}
