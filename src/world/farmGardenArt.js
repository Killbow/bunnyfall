import { gardenStage, gardenGrowth, farmSeed, bedSeconds, FARM_BED_SIZE, FARM_WATER_S } from '../net/farmGardenLaw.js';
import { writeDecalQuad, DECAL_FLOATS, DECAL_FLOATS_PER_VERTEX } from '../combat/bloodDecals.js';
import { bedWeedy, WEED_DRY_S } from '../net/farm/careLaw.js';
export const FARM_ART = Object.freeze({ soil: [302, 54], water: [302, 0],
  grain: { seedling: [301, 23], growing: [301, 21], ripe: [301, 19] },
  mushroom: { seedling: [301, 10], growing: [301, 10], ripe: [301, 10] },
  herbs: { seedling: [301, 23], growing: [301, 13], ripe: [301, 17] },
  corn: { seedling: [301, 23], growing: [301, 2], ripe: [301, 2] },
  cabbage: { seedling: [301, 23], growing: [301, 18], ripe: [301, 18] },
  tomato: { seedling: [301, 23], growing: [301, 12], ripe: [301, 12], fruit: [213, 1] },
  sunflower: { seedling: [301, 23], growing: [301, 4], ripe: [301, 3] },
  berries: { seedling: [301, 23], growing: [301, 22], ripe: [301, 14] },
  root: { seedling: [301, 23], growing: [301, 20], ripe: [301, 20] },
  flax: { seedling: [301, 23], growing: [301, 19], ripe: [301, 15] },
  gourd: { seedling: [301, 23], growing: [301, 12], ripe: [301, 12], fruit: [213, 0] },
  grapes: { seedling: [301, 9], growing: [301, 8], ripe: [301, 7] },
  weeds: [[301, 20], [301, 12]],
  blight: [301, 12] });
const HEIGHT = Object.freeze({ grain: [.25, 1.2], mushroom: [.12, .38], herbs: [.2, .75],
  corn: [.3, 1.9], cabbage: [.15, .45], tomato: [.2, .6], sunflower: [.3, 1.6], berries: [.25, .9], root: [.2, .6], flax: [.2, .85], gourd: [.15, .4], grapes: [.3, 1.5] });
const FRUIT_H = .26;
export { WEED_DRY_S };
export const FARM_SWAY = 6, FARM_WINDFALL = .6;
export function setFarmSway(batch, on = true) {
  if (batch && on) { batch.sway = FARM_SWAY; batch.windfall = FARM_WINDFALL; }
  return batch;
}
const MARK_MAX = 9;
const SOIL_TINT = [[1, 1, 1, 1], [.88, .84, .8, 1], [.74, .7, .66, 1], [.62, .58, .55, 1]];

function bedRand(index) {
  let s = (index * 2654435761 + 0x9e3779b9) >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return ((s ^ (s >>> 13)) >>> 0) / 4294967296; };
}
export function bedPlants(index) {
  const rand = bedRand(index), n = 3 + Math.floor(rand() * 4), out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * .9, d = .2 + rand() * .45;
    out.push([Math.cos(a) * d, Math.sin(a) * d, .85 + rand() * .3]);
  }
  return out;
}
export function plantHeight(bed, now) {
  const seed = farmSeed(bed.crop), span = HEIGHT[bed.crop] ?? HEIGHT.grain;
  const progress = seed ? Math.min(1, gardenGrowth(bed, now) / bedSeconds(bed)) : 0;
  return Math.round((span[0] + (span[1] - span[0]) * progress) * (1 + (bed.quality ?? 0) * .1) * 20) / 20;
}

export function createFarmGardenArt(renderer, assets = {}) {
  let decals=null, capacity=0, signature='', crops=[],ready=false,pending=null,soil=null,water=null,lastSite=null,mark=null,channels=null,channelCount=0;
  let markAt=null,decalValues=null,channelValues=null,cropCenters=[];
  const files=new Map(); let lastGarden=null,lastSecond=-1;
  async function prepare(){
    if(ready)return;if(pending)return pending;
    pending=(async()=>{
      if(!assets.getTexture||!assets.uploadRecord)throw new Error('Farming requires the texture pipeline');
      for(const a of [213,301,302])files.set(a,await assets.getTexture(a));
      assets.uploadRecord(...FARM_ART.soil,{opaque:true});assets.uploadRecord(...FARM_ART.water,{opaque:true});
      soil=renderer.textures.get(`${FARM_ART.soil.join('_')}#opaque`);water=renderer.textures.get(`${FARM_ART.water.join('_')}#opaque`);
      if(!soil)throw new Error('Farm terrain textures unavailable');ready=true;
    })();
    try{await pending;}finally{pending=null;}
  }
  function update(site,garden,now,selected,marked=[selected]){
    if(!ready)return;
    const spots=selected>=0?marked.map(i=>site.beds[i]).filter(Boolean):[];
    if(spots.length&&!(markAt&&markAt.length===spots.length&&spots.every((p,n)=>p[0]===markAt[n][0]&&p[1]===markAt[n][1]&&p[2]===markAt[n][2]))){markAt=spots.map(p=>[...p]);writeMark();}
    const second=Math.floor(now);
    if(lastGarden===garden&&lastSite===site.beds&&lastSecond===second)return;
    lastGarden=garden;lastSecond=second;
    const irrigation=garden.progress?.upgrades?.irrigation??0;
    const entries=Object.entries(garden.beds).filter(([id,b])=>b&&site.beds[Number(id)]);
    const weedy=(b)=>b.crop?bedWeedy(b,now,gardenStage(b,now)==='ripe'):now-b.tick>2*WEED_DRY_S;
    const sig=JSON.stringify([entries.map(([id,b])=>[id,b.crop,b.crop?plantHeight(b,now):0,gardenStage(b,now),b.wetUntil>now?Math.ceil((b.wetUntil-now)/(FARM_WATER_S/4)):0,b.quality??0,weedy(b),Number.isSafeInteger(b.blight)]),irrigation]);
    if(signature===sig&&lastSite===site.beds)return;
    signature=sig;lastSite=site.beds;
    crops.forEach(b=>renderer.destroyBillboardBatch(b));crops=[];cropCenters=[];decalValues=channelValues=null;
    if(channels){renderer.destroyDecalBatch(channels);channels=null;channelCount=0;}
    if(!entries.length){if(decals)renderer.destroyDecalBatch(decals);decals=null;capacity=0;return;}
    if(capacity!==entries.length){if(decals)renderer.destroyDecalBatch(decals);capacity=entries.length;decals=renderer.createDecalBatch(capacity);}
    const values=new Float32Array(entries.length*DECAL_FLOATS),groups=new Map();
    const put=(archive,record,height,centers,sway=true)=>{const key=`${archive}_${record}_${height}${sway?'s':''}`;if(!groups.has(key))groups.set(key,{archive,record,height,sway,centers:[]});groups.get(key).centers.push(...centers);};
    entries.forEach(([id,bed],slot)=>{
      const index=Number(id),pos=site.beds[index],stage=gardenStage(bed,now);
      const base=SOIL_TINT[bed.quality??0]??SOIL_TINT[0],left=bed.wetUntil>now?Math.min(1,(bed.wetUntil-now)/FARM_WATER_S):0;
      const sick=bed.crop&&Number.isSafeInteger(bed.blight);
      const tint=sick?[base[0]*(1-.2*left)*1.25,base[1]*(1-.3*left)*1.1,base[2]*.6,1]:[base[0]*(1-.38*left),base[1]*(1-.36*left),base[2]*(1-.26*left),1];
      writeDecalQuad(values,slot*DECAL_FLOATS,{pos:[pos[0],pos[1]+.035,pos[2]],right:[1,0,0],up:[0,0,-1],size:FARM_BED_SIZE,tint,wet:0});
      const plants=bedPlants(index);
      if(bed.crop){
        const [archive,record]=sick?FARM_ART.blight:(FARM_ART[bed.crop][stage]??FARM_ART.grain[stage]),height=Math.round(plantHeight(bed,now)*(sick?.55:1)*20)/20;
        put(archive,record,height,plants.map(([x,z])=>[pos[0]+x,pos[1]+.04,pos[2]+z]),bed.crop!=='mushroom'&&!sick);
        const fruit=FARM_ART[bed.crop]?.fruit;
        if(fruit&&stage==='ripe')put(fruit[0],fruit[1],FRUIT_H,plants.slice(0,2).map(([x,z])=>[pos[0]+x*.6+.12,pos[1]+.03,pos[2]+z*.6+.1]),false);
      }
      if(weedy(bed)){
        const [archive,record]=FARM_ART.weeds[index%FARM_ART.weeds.length],[x,z]=plants[0];
        put(archive,record,.35,[[pos[0]-x*.9,pos[1]+.04,pos[2]+z*.9]]);
      }
    });
    renderer.writeDecalSlot(decals,0,values);decalValues=values;
    if(irrigation>0&&water){
      channelCount=entries.length;channels=renderer.createDecalBatch(channelCount);
      const strips=new Float32Array(channelCount*DECAL_FLOATS),tint=irrigation>1?[.9,1,1,.95]:[.75,.85,.9,.85];
      entries.forEach(([id],slot)=>{const pos=site.beds[Number(id)];writeDecalQuad(strips,slot*DECAL_FLOATS,{pos:[pos[0],pos[1]+.04,pos[2]+FARM_BED_SIZE/2+.12],right:[1,0,0],up:[0,0,-1],size:.24,stretch:(FARM_BED_SIZE+.36)/.24,tint,wet:0});});
      renderer.writeDecalSlot(channels,0,strips);channelValues=strips;
    }
    for(const {archive,record,height,sway,centers}of groups.values()){
      assets.uploadRecord(archive,record);const size=files.get(archive).getSize(record);
      crops.push(setFarmSway(renderer.createBillboardBatch(archive,record,{w:height*size.width/size.height,h:height},centers,{dynamic:true}),sway));cropCenters.push(centers);
    }
  }
  function writeMark(){
    mark??=renderer.createDecalBatch(MARK_MAX);
    const values=new Float32Array(MARK_MAX*DECAL_FLOATS);
    markAt.forEach((p,n)=>writeDecalQuad(values,n*DECAL_FLOATS,{pos:[p[0],p[1]+.045,p[2]],right:[1,0,0],up:[0,0,-1],size:FARM_BED_SIZE,tint:[1,.87,.38,.6],wet:0}));
    renderer.writeDecalSlot(mark,0,values);
  }
  const shift=(batch,values,delta)=>{for(let o=0;o<values.length;o+=DECAL_FLOATS_PER_VERTEX)for(let i=0;i<3;i++)values[o+i]+=delta[i];renderer.writeDecalSlot(batch,0,values);};
  // `site.beds` moves in place on an origin shift and `update()` keeps these batches, so rebase the site and the
  // art together.
  function rebase(delta){
    if(decals&&decalValues)shift(decals,decalValues,delta);
    if(channels&&channelValues)shift(channels,channelValues,delta);
    cropCenters.forEach((centers,n)=>{for(const c of centers)for(let i=0;i<3;i++)c[i]+=delta[i];renderer.moveBillboardBatch(crops[n],centers);});
    if(markAt){for(const p of markAt)for(let i=0;i<3;i++)p[i]+=delta[i];if(mark)writeMark();}
  }
  return{prepare,update,rebase,get ready(){return ready;},
    draw(right,up,selected=-1){if(decals)renderer.drawDecalPicture(decals,soil);if(channels)renderer.drawDecalPicture(channels,water);if(crops.length)renderer.drawBillboards(crops,right,up);if(mark&&selected>=0)renderer.drawDecalPicture(mark,soil);},
    dispose(){if(decals)renderer.destroyDecalBatch(decals);if(mark)renderer.destroyDecalBatch(mark);if(channels)renderer.destroyDecalBatch(channels);decals=mark=channels=markAt=decalValues=channelValues=null;capacity=channelCount=0;crops.forEach(b=>renderer.destroyBillboardBatch(b));crops=[];cropCenters=[];signature='';lastSite=null;lastGarden=null;lastSecond=-1;}
  };
}
