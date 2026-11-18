import { createCromwarkBlight, cromwarkBlightEliteChance, cromwarkBlightLoot } from '../src/systems/wild/cromwarkBlight.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cromwarkSeal, sealCrossed, sealOutside } from '../src/systems/wild/cromwarkBarrier.js';
import { reachSite, reachDay, reachMemory } from '../src/systems/wild/cromwarkEvents.js';
import { createCromwarkReachHost } from '../src/scenes/cromwarkReachHost.js';
import { restoreModSaveRecords, modSaveRecords } from '../src/systems/modSaveData.js';
import { validSites, validSiteTags } from '../src/world/worldOfDaggerfall/wodShared.js';
import { cromwarkQuestSiteBlocked, cromwarkSettlementRemoved } from '../src/systems/wild/cromwarkSettlements.js';
import { nearestTown } from '../src/systems/legacy/places.js';
import { MapsFile } from '../src/formats/mapsFile.js';

test('city seal covers every corner, blocks tunnelling and excludes vertical shortcuts',()=>{
  const s=cromwarkSeal({width:7,height:6}), r=s.radius;
  for(const x of [-358.4,358.4])for(const z of [-307.2,307.2])assert.ok(sealCrossed(s,null,[s.x+x,0,s.z+z]));
  assert.ok(sealCrossed(s,[s.x-r-10,0,s.z],[s.x+r+10,0,s.z]));
  assert.ok(sealCrossed(s,null,[s.x,10000,s.z]));
  assert.ok(!sealCrossed(s,[s.x-r-10,0,s.z-20],[s.x-r-10,0,s.z+20]));
  const p=sealOutside(s,[s.x,0,s.z]);assert.ok(!sealCrossed(s,null,p));
  assert.equal(cromwarkSeal(null),null);
});
test('real city geometry and south-pixel fallback agree', {skip:!process.env.ARENA2_PATH},()=>{
  const maps=new MapsFile();maps.load(...['MAPS.BSA','CLIMATE.PAK','POLITIC.PAK'].map(n=>new Uint8Array(readFileSync(resolve(process.env.ARENA2_PATH,n)))));
  const loc=maps.getLocation(16,482);assert.equal(loc.name,'Cromwark Hamlet');
  const s=cromwarkSeal(loc.exterior.exteriorData);assert.ok(s.radius>450);
  assert.ok(!sealCrossed(s,null,[409.6,0,409.6-819.2]));
});
test('reach destinations are deterministic, rotate daily and use shared site validation',()=>{
  const seen=new Set();
  for(let x=255;x<280;x++)for(let y=0;y<30;y++){
    const a=reachSite(x,y,20000),b=reachSite(x,y,20000);
    assert.deepEqual(a,b);assert.equal(a.roster.length,a.kind===0?20:25);assert.ok(a.px>=x*3&&a.px<x*3+3);assert.ok(a.py>=y*3&&a.py<y*3+3);
    assert.equal(validSites([[a.id,0]]).length,1);assert.equal(validSiteTags([[0,a.id]]).get(0),a.id);
    seen.add(a.kind);
  }
  assert.equal(seen.size,3);assert.notDeepEqual(reachSite(270,15,20000),reachSite(270,15,20001));
  assert.equal(reachDay(86400000),1);
});
function fixture(kind=2, purple=false) {
  restoreModSaveRecords({});
  let site;for(let x=260;x<280&&!site;x++)for(let y=5;y<30;y++){const s=reachSite(x,y,20000);if(s.kind===kind && (!purple || s.purpleFire)){site=s;break;}}
  let tick=1000,peer=false,age=0,fail=null,delay=null,claims=0;
  const list=[],piles=[],notices=[];
  const mask={width:1000,height:500,inside:new Uint8Array(500000).fill(1)};
  const feet=[site.x,20,site.z];
  const d={mask,ready:()=>true,now:()=>tick,utc:()=>20000*86400000,feet:()=>feet,pixel:()=>({x:site.px,y:site.py}),
    translation:(x,y)=>[(x-site.px)*819.2,0,(site.py-y)*819.2],ground:()=>20,dry:()=>true,allowed:(x,y)=>x===site.px&&y===site.py,
    peerSprang:()=>peer,peerHeldAgo:()=>age,forgetPeer:()=>{peer=false;},sprang:()=>{claims++;},say:t=>notices.push(t),save:()=>{},
    foes:{list:()=>list,reclaim:()=>{},campId:()=>1,drop:id=>{for(let i=list.length-1;i>=0;i--)if(list[i].site===id&&!list[i].puppet)list.splice(i,1);},remove:f=>{const i=list.indexOf(f);if(i>=0)list.splice(i,1);},
      spawn:async(id,pos,o)=>{if(delay)await delay;if(id===fail && o.reachSlot===1)return null;const f={mobileType:id,site:o.site,dead:false,ai:{},entity:{}};list.push(f);return f;}},
    loot:{items:()=>[{group:'test',templateIndex:1,stackCount:3}],seed:(items,p)=>{const pile={items,pos:p};piles.push(pile);return pile;},remove:p=>{p.dead=true;}}};
  const host=createCromwarkReachHost(d);
  return {host,d,site,list,piles,notices,feet,claims:()=>claims,advance:()=>{tick+=6000;},peer:(v,a=0)=>{peer=v;age=a;},fail:id=>{fail=id;},delay:p=>{delay=p;}};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('cache requires actual corpses, mints once and retains unclaimed contents through a save',async()=>{
  const f=fixture();f.host.frame();await settle();assert.equal(f.list.length,25);
  f.advance();f.host.frame();assert.equal(f.piles.length,0);
  for(const foe of f.list){foe.dead=true;foe.corpse=true;}
  f.advance();f.host.frame();assert.equal(f.piles.length,1);
  f.advance();f.host.frame();assert.equal(f.piles.length,1);
  const saved=modSaveRecords();f.host.reset();restoreModSaveRecords(saved);
  f.advance();f.host.frame();assert.equal(f.list.length,0);assert.equal(f.piles.length,2);
  f.piles[1].items.length=0;f.advance();f.host.frame();
  const empty=modSaveRecords();f.host.reset();restoreModSaveRecords(empty);f.advance();f.host.frame();assert.equal(f.piles.length,2);
});
test('missing foes do not count as victories; failed slots retry without duplicating survivors',async()=>{
  const f=fixture();f.fail(f.site.roster[1]);f.host.frame();await settle();assert.equal(f.list.length,24);
  f.fail(null);f.advance();f.host.frame();await settle();assert.equal(f.list.length,25);assert.equal(f.claims(),1);
  f.advance();f.host.frame();await settle();assert.equal(f.claims(),1);
  f.list.length=0;f.advance();f.host.frame();await settle();assert.equal(f.piles.length,0);assert.equal(f.list.length,25);
});
test('peer owns encounter until stale; in-flight spawns cannot survive reset',async()=>{
  const f=fixture();f.peer(true);f.host.frame();await settle();assert.equal(f.list.length,0);
  f.peer(true,11000);f.advance();f.host.frame();await settle();assert.equal(f.list.length,25);
  f.host.reset();let release;f.delay(new Promise(r=>{release=r;}));f.advance();f.host.frame();f.host.reset();release();await settle();assert.equal(f.list.length,0);
});
test('hunts patrol through the existing motor; midnight preserves yesterday’s active progress',async()=>{
  const f=fixture(0);f.host.frame();await settle();f.advance();f.host.frame();assert.equal(typeof f.list[0].ai.follow.feet,'function');
  const old=reachMemory(20000,f.site.id);old.slain.push(f.site.roster[0]);reachMemory(20001,'800,20:reach.20001.0');
  assert.ok(reachMemory(20000,f.site.id).slain.includes(f.site.roster[0]));
});

test('sealed city remains renderable but cannot be rolled as a new quest or birth destination',()=>{
  assert.equal(cromwarkSettlementRemoved(505449455),false);
  assert.equal(cromwarkQuestSiteBlocked(505449455),true);
  assert.equal(cromwarkQuestSiteBlocked(0),false);
  const region={mapNames:['Sealed city','Open town'],mapTable:[{mapId:505449455,locationType:0,longitude:128,latitude:498*128},{mapId:123456,locationType:0,longitude:256,latitude:498*128}],locationCount:2};
  assert.equal(nearestTown(region,'Wrothgarian Mountains',{x:1,y:1}).loc,'Open town');
});

test('Blight stacks once per fire, triggers Rodney, and resets on leaving the Reach', () => {
  const hits = [], warnings = [];
  const blight = createCromwarkBlight({ roll: () => 0, toward: () => 0,
    hurt: (share) => hits.push(share), warn: () => warnings.push(true) });
  blight.expose('fire-a'); blight.expose('fire-a'); blight.expose('fire-b');
  assert.equal(blight.level(), 2);
  assert.equal(cromwarkBlightLoot(2), 1.15);
  assert.ok(cromwarkBlightEliteChance(2) > cromwarkBlightEliteChance(0));
  blight.frame(24, [0, 0, 0], true, true);
  assert.equal(warnings.length, 1);
  assert.ok(blight.marks().length);
  for (let i = 0; i < 5; i++) blight.frame(.25, [0, 0, 0], true, true);
  assert.deepEqual(hits, [.4]);
  blight.frame(.1, [0, 0, 0], false, true);
  assert.equal(blight.level(), 0);
  assert.deepEqual(blight.marks(), []);
});

test('purple fires require activation, even when standing on them', async () => {
  const f = fixture(2, true), exposed = [];
  f.d.blight = { expose: id => exposed.push(id) };
  f.host.frame();
  await settle();
  assert.deepEqual(exposed, []);
  const [fire] = f.host.fireTargets();
  assert.ok(fire.reach > 0);
  assert.equal(f.host.activateFire(fire.key, 'info'), true);
  assert.deepEqual(exposed, []);
  assert.equal(f.host.activateFire(fire.key, 'grab'), true);
  assert.deepEqual(exposed, [f.site.id]);
});
