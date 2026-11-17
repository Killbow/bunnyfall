// BUNNYFALL: ARENA2 soil and vegetation loaded by the normal texture pipeline.
import { gardenStage, FARM_BED_SIZE } from '../net/farmGardenLaw.js';
import { writeDecalQuad, DECAL_FLOATS } from '../combat/blood/bloodDecals.js';
export const FARM_ART = Object.freeze({ soil: [302, 1], grass: [302, 2],
  grain: { seedling: [301, 9], growing: [301, 2], ripe: [301, 19] },
  mushroom: { seedling: [301, 10], growing: [301, 10], ripe: [301, 10] },
  herbs: { seedling: [301, 8], growing: [301, 13], ripe: [301, 14] } });
export function createFarmGardenArt(renderer, assets = {}) {
  let decals=null, capacity=0, signature='', crops=[],ready=false,pending=null,soil=null,lastSite=null,mark=null;
  const files=new Map(); let lastGarden=null,lastSecond=-1;
  async function prepare(){
    if(ready)return;if(pending)return pending;
    pending=(async()=>{
      if(!assets.getTexture||!assets.uploadRecord)throw new Error('Farming requires the texture pipeline');
      for(const a of [301,302])files.set(a,await assets.getTexture(a));
      assets.uploadRecord(...FARM_ART.soil,{opaque:true});
      soil=renderer.textures.get(`${FARM_ART.soil.join('_')}#opaque`);
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
    const entries=Object.entries(garden.beds).filter(([id,b])=>b&&site.beds[Number(id)]);
    const sig=JSON.stringify(entries.map(([id,b])=>[id,gardenStage(b,now),b.crop,b.wetUntil>now]));
    if(signature===sig&&lastSite===site.beds)return;
    signature=sig;lastSite=site.beds;
    crops.forEach(b=>renderer.destroyBillboardBatch(b));crops=[];
    if(!entries.length){if(decals)renderer.destroyDecalBatch(decals);decals=null;capacity=0;return;}
    if(capacity!==entries.length){if(decals)renderer.destroyDecalBatch(decals);capacity=entries.length;decals=renderer.createDecalBatch(capacity);}
    const values=new Float32Array(entries.length*DECAL_FLOATS),groups=new Map();
    entries.forEach(([id,bed],slot)=>{
      const pos=site.beds[Number(id)],stage=gardenStage(bed,now);
      writeDecalQuad(values,slot*DECAL_FLOATS,{pos:[pos[0],pos[1]+.035,pos[2]],right:[1,0,0],up:[0,0,-1],size:FARM_BED_SIZE,tint:bed.wetUntil>now?[.57,.55,.5,1]:[1,1,1,1],wet:0});
      if(!bed.crop)return;
      const [archive,record]=FARM_ART[bed.crop][stage];
      const height=bed.crop==='mushroom'?(stage==='seedling'?.14:stage==='ripe'?.38:.25):stage==='seedling'?.3:stage==='ripe'?1.2:.7;
      const key=`${archive}_${record}_${height}`;
      if(!groups.has(key))groups.set(key,{archive,record,height,centers:[]});
      const group=groups.get(key);
      for(const x of [-.4,.4])for(const z of [-.4,.4])group.centers.push([pos[0]+x,pos[1]+.04,pos[2]+z]);
    });
    renderer.writeDecalSlot(decals,0,values);
    for(const {archive,record,height,centers}of groups.values()){
      assets.uploadRecord(archive,record);const size=files.get(archive).getSize(record);
      crops.push(renderer.createBillboardBatch(archive,record,{w:height*size.width/size.height,h:height},centers,{dynamic:true}));
    }
  }
  return{prepare,update,get ready(){return ready;},
    draw(right,up,selected=-1){if(decals)renderer.drawDecalPicture(decals,soil);if(crops.length)renderer.drawBillboards(crops,right,up);if(mark&&selected>=0)renderer.drawDecalPicture(mark,soil);},
    dispose(){if(decals)renderer.destroyDecalBatch(decals);if(mark)renderer.destroyDecalBatch(mark);decals=mark=null;capacity=0;crops.forEach(b=>renderer.destroyBillboardBatch(b));crops=[];signature='';lastSite=null;lastGarden=null;lastSecond=-1;}
  };
}
