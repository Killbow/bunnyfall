// BUNNYFALL: ARENA2 soil and vegetation loaded by the normal texture pipeline.
// FARM EXPANSION PHASE 1 (docs/FARM-EXPANSION.md section 4.1): A FIELD THAT LOOKS LIKE A FIELD - worked beds draw the
// ploughed-furrow ground (302:54), darker with better soil and cooler while wet; three to six plants a bed, placed by
// the bed's own seed, grow smoothly with their crop instead of in three jumps; a bed left dry a day sprouts weeds; and
// irrigation, once the farm has it, runs as water channels along the worked rows. Every picture is in the art register.
import { gardenStage, gardenGrowth, farmSeed, FARM_BED_SIZE, FARM_WATER_S } from '../net/farmGardenLaw.js';
import { writeDecalQuad, DECAL_FLOATS } from '../combat/blood/bloodDecals.js';
export const FARM_ART = Object.freeze({ soil: [302, 54], water: [302, 0],
  grain: { seedling: [301, 23], growing: [301, 21], ripe: [301, 19] },
  mushroom: { seedling: [301, 10], growing: [301, 10], ripe: [301, 10] },
  herbs: { seedling: [301, 23], growing: [301, 13], ripe: [301, 17] },
  weeds: [[301, 20], [301, 12]] });
/** Plant heights, m: at sowing and when ripe (a crop grows between them). */
const HEIGHT = Object.freeze({ grain: [.25, 1.2], mushroom: [.12, .38], herbs: [.2, .75] });
/** A weed shows on a bed dry this long, s. */
export const WEED_DRY_S = 86400;
const SOIL_TINT = [[1, 1, 1, 1], [.88, .84, .8, 1], [.74, .7, .66, 1]];

/** A stable 0..1 stream for a bed. */
function bedRand(index) {
  let s = (index * 2654435761 + 0x9e3779b9) >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return ((s ^ (s >>> 13)) >>> 0) / 4294967296; };
}
/** Where a bed's plants stand, relative to its centre, and how many: 3-6, the same every visit. */
export function bedPlants(index) {
  const rand = bedRand(index), n = 3 + Math.floor(rand() * 4), out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * .9, d = .2 + rand() * .45;
    out.push([Math.cos(a) * d, Math.sin(a) * d, .85 + rand() * .3]);
  }
  return out;
}
/** A planted bed's height now, m, quantized so plants of a stage share a few batches. */
export function plantHeight(bed, now) {
  const seed = farmSeed(bed.crop), span = HEIGHT[bed.crop] ?? HEIGHT.grain;
  const progress = Math.min(1, gardenGrowth(bed, now) / (seed?.seconds ?? Infinity));
  return Math.round((span[0] + (span[1] - span[0]) * progress) * (1 + (bed.quality ?? 0) * .1) * 20) / 20;
}

export function createFarmGardenArt(renderer, assets = {}) {
  let decals=null, capacity=0, signature='', crops=[],ready=false,pending=null,soil=null,water=null,lastSite=null,mark=null,channels=null,channelCount=0;
  const files=new Map(); let lastGarden=null,lastSecond=-1;
  async function prepare(){
    if(ready)return;if(pending)return pending;
    pending=(async()=>{
      if(!assets.getTexture||!assets.uploadRecord)throw new Error('Farming requires the texture pipeline');
      for(const a of [301,302])files.set(a,await assets.getTexture(a));
      assets.uploadRecord(...FARM_ART.soil,{opaque:true});assets.uploadRecord(...FARM_ART.water,{opaque:true});
      soil=renderer.textures.get(`${FARM_ART.soil.join('_')}#opaque`);water=renderer.textures.get(`${FARM_ART.water.join('_')}#opaque`);
      if(!soil)throw new Error('Farm terrain textures unavailable');ready=true;
    })();
    try{await pending;}finally{pending=null;}
  }
  function update(site,garden,now,selected){
    if(!ready)return;
    if(selected>=0){
      mark??=renderer.createDecalBatch(1);
      const values=new Float32Array(DECAL_FLOATS),pos=site.beds[selected];
      writeDecalQuad(values,0,{pos:[pos[0],pos[1]+.045,pos[2]],right:[1,0,0],up:[0,0,-1],size:FARM_BED_SIZE,tint:[1,.87,.38,.6],wet:0});
      renderer.writeDecalSlot(mark,0,values);
    }
    const second=Math.floor(now);
    if(lastGarden===garden&&lastSite===site.beds&&lastSecond===second)return;
    lastGarden=garden;lastSecond=second;
    const irrigation=garden.progress?.upgrades?.irrigation??0;
    const entries=Object.entries(garden.beds).filter(([id,b])=>b&&site.beds[Number(id)]);
    const weedy=(b)=>b.crop?gardenStage(b,now)!=='ripe'&&now-(b.wetUntil||b.tick)>WEED_DRY_S:now-b.tick>2*WEED_DRY_S;
    const sig=JSON.stringify([entries.map(([id,b])=>[id,b.crop,b.crop?plantHeight(b,now):0,gardenStage(b,now),b.wetUntil>now?Math.ceil((b.wetUntil-now)/(FARM_WATER_S/4)):0,b.quality??0,weedy(b)]),irrigation]);
    if(signature===sig&&lastSite===site.beds)return;
    signature=sig;lastSite=site.beds;
    crops.forEach(b=>renderer.destroyBillboardBatch(b));crops=[];
    if(channels){renderer.destroyDecalBatch(channels);channels=null;channelCount=0;}
    if(!entries.length){if(decals)renderer.destroyDecalBatch(decals);decals=null;capacity=0;return;}
    if(capacity!==entries.length){if(decals)renderer.destroyDecalBatch(decals);capacity=entries.length;decals=renderer.createDecalBatch(capacity);}
    const values=new Float32Array(entries.length*DECAL_FLOATS),groups=new Map();
    const put=(archive,record,height,centers)=>{const key=`${archive}_${record}_${height}`;if(!groups.has(key))groups.set(key,{archive,record,height,centers:[]});groups.get(key).centers.push(...centers);};
    entries.forEach(([id,bed],slot)=>{
      const index=Number(id),pos=site.beds[index],stage=gardenStage(bed,now);
      // the soil: furrows, darker with better loam, cooler while it holds water (fading as it dries)
      const base=SOIL_TINT[bed.quality??0]??SOIL_TINT[0],left=bed.wetUntil>now?Math.min(1,(bed.wetUntil-now)/FARM_WATER_S):0;
      const tint=[base[0]*(1-.38*left),base[1]*(1-.36*left),base[2]*(1-.26*left),1];
      writeDecalQuad(values,slot*DECAL_FLOATS,{pos:[pos[0],pos[1]+.035,pos[2]],right:[1,0,0],up:[0,0,-1],size:FARM_BED_SIZE,tint,wet:0});
      const plants=bedPlants(index);
      if(bed.crop){
        const [archive,record]=FARM_ART[bed.crop][stage]??FARM_ART.grain[stage],height=plantHeight(bed,now);
        put(archive,record,height,plants.map(([x,z])=>[pos[0]+x,pos[1]+.04,pos[2]+z]));
      }
      if(weedy(bed)){
        const [archive,record]=FARM_ART.weeds[index%FARM_ART.weeds.length],[x,z]=plants[0];
        put(archive,record,.35,[[pos[0]-x*.9,pos[1]+.04,pos[2]+z*.9]]);
      }
    });
    renderer.writeDecalSlot(decals,0,values);
    // IRRIGATION CHANNELS (section 3.6): a strip of water along each worked bed's south edge - worked rows join up
    if(irrigation>0&&water){
      channelCount=entries.length;channels=renderer.createDecalBatch(channelCount);
      const strips=new Float32Array(channelCount*DECAL_FLOATS),tint=irrigation>1?[.9,1,1,.95]:[.75,.85,.9,.85];
      entries.forEach(([id],slot)=>{const pos=site.beds[Number(id)];writeDecalQuad(strips,slot*DECAL_FLOATS,{pos:[pos[0],pos[1]+.04,pos[2]+FARM_BED_SIZE/2+.12],right:[1,0,0],up:[0,0,-1],size:.24,stretch:(FARM_BED_SIZE+.36)/.24,tint,wet:0});});
      renderer.writeDecalSlot(channels,0,strips);
    }
    for(const {archive,record,height,centers}of groups.values()){
      assets.uploadRecord(archive,record);const size=files.get(archive).getSize(record);
      crops.push(renderer.createBillboardBatch(archive,record,{w:height*size.width/size.height,h:height},centers,{dynamic:true}));
    }
  }
  return{prepare,update,get ready(){return ready;},
    draw(right,up,selected=-1){if(decals)renderer.drawDecalPicture(decals,soil);if(channels)renderer.drawDecalPicture(channels,water);if(crops.length)renderer.drawBillboards(crops,right,up);if(mark&&selected>=0)renderer.drawDecalPicture(mark,soil);},
    dispose(){if(decals)renderer.destroyDecalBatch(decals);if(mark)renderer.destroyDecalBatch(mark);if(channels)renderer.destroyDecalBatch(channels);decals=mark=channels=null;capacity=channelCount=0;crops.forEach(b=>renderer.destroyBillboardBatch(b));crops=[];signature='';lastSite=null;lastGarden=null;lastSecond=-1;}
  };
}
