// All crop prefabs on a farm, in stable layout order. Legacy addresses keep their positions.
import { flatFieldFor } from './flatFields.js';
import { FARM_BEDS, FARM_BED_SPACING, FARM_BED_SIZE } from '../net/farmGardenLaw.js';
export function farmGardenFields(blocks) {
  const fields = [];
  for (const block of blocks ?? []) for (const model of block.layout?.models ?? []) {
    const field = flatFieldFor(model.modelIdNum);
    if (!field || field.rangeX < 14 || field.rangeZ < 14) continue;
    fields.push({ block, x: model.matrix[12]-Math.floor(field.rangeX/2), z: model.matrix[14]-Math.floor(field.rangeZ/2), width: field.rangeX, depth: field.rangeZ });
  }
  return fields;
}
export const farmGardenField = (blocks) => farmGardenFields(blocks)[0] ?? null;
export const inFarmGarden = (x,z,r) => !!r && x>=r.x && x<=r.x+r.width && z>=r.z && z<=r.z+(r.depth ?? r.width);
export function farmGardenSite(farm, { farms, built, state, heightAt, renderer }) {
  const place=farms.placeOf(farm.mapId), pixel=place && built.get(`${place.px},${place.py}`);
  const fields=farmGardenFields(pixel?.locBlocks);
  if (!fields.length || !pixel.locOrigin) return null;
  const tr=(typeof state==='function'?state():state).pixelTranslation(place.px,place.py);
  const origin=[tr[0]+pixel.locOrigin[0],tr[2]+pixel.locOrigin[2]], beds=[], used=new Set();
  function add(f,x,z) {
    const lx=f.block.originX+x,lz=f.block.originZ+z,key=`${lx},${lz}`;
    if(used.has(key))return;
    if(beds.length>=FARM_BEDS)throw new Error('Farm layout exceeds supported address space');
    used.add(key);const bx=origin[0]+lx,bz=origin[1]+lz;
    beds.push([bx,heightAt(bx,bz),bz]);
  }
  const first=fields[0];
  for(let i=0;i<16;i++)add(first,first.x+6+(i%4)*2,first.z+6+Math.floor(i/4)*2);
  for(const f of fields)for(let z=2;z<f.depth;z+=FARM_BED_SPACING)for(let x=2;x<f.width;x+=FARM_BED_SPACING)add(f,f.x+x,f.z+z);
  if(!beds.every(b=>Number.isFinite(b[1])))return null;
  let masked=[],signature='',groupsSeen=null;
  function restore(){for(const g of masked)if(!g.batch._dead)renderer?.moveBillboardBatch(g.batch,g.centers);masked=[];signature='';}
  const site={beds,pixel,fields:fields.length,center:[...beds[0]],restore,
    rebase(delta){tr[0]+=delta[0];tr[2]+=delta[2];site.center=site.center.map((v,i)=>v+delta[i]);site.beds=site.beds.map(b=>b.map((v,i)=>v+delta[i]));},
    mask(garden,revision){
      const groups=pixel.forest?.groups;
      if(!renderer||!groups||(signature===String(revision)&&groupsSeen===groups))return;
      restore();signature=String(revision);groupsSeen=groups;
      const touched=new Map();
      for(const [id,bed]of Object.entries(garden.beds)){
        const pos=site.beds[Number(id)];if(!bed||!pos)continue;
        const x=pos[0]-tr[0],z=pos[2]-tr[2],key=`${Math.floor(x/2)},${Math.floor(z/2)}`;
        if(!touched.has(key))touched.set(key,[]);touched.get(key).push([x,z]);
      }
      const occupied=c=>{
        const bx=Math.floor(c[0]/2),bz=Math.floor(c[2]/2);
        for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)
          if(touched.get(`${x},${z}`)?.some(p=>Math.abs(p[0]-c[0])<=FARM_BED_SIZE/2&&Math.abs(p[1]-c[2])<=FARM_BED_SIZE/2))return true;
        return false;
      };
      for(const [key,g]of groups){
        if(!key.startsWith('301_')&&key!=='511_22')continue;
        let changed=false;
        const centers=g.centers.map(c=>{if(!occupied(c))return c;changed=true;return[c[0],c[1]-10000,c[2]];});
        if(changed){renderer.moveBillboardBatch(g.batch,centers);masked.push(g);}
      }
    },
  };
  return site;
}
