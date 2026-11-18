// @ts-check
import { loadModelPicture } from '../modelIcon.js';
import { textureArchive, loadIcon } from '../textureCanvas.js';
import { color32Canvas } from '../bitmapCanvas.js';

// References only: the player's own game data and texture replacements supply the art.
const cache = new Map();
const model = (id) => loadModelPicture(id, { size:384, yaw:-.2, pitch:.22 }).then((pic)=>pic ? color32Canvas(pic) : null);
const texture = async (archive,record) => {
  const got=await textureArchive(archive); if(!got)return null;
  return color32Canvas(got.file.getColor32(got.file.getDFBitmap(record,0),-1));
};
const flat = async (archive,record) => {
  const url=await loadIcon(archive,record);if(!url)return null;
  const image=new globalThis.Image();image.src=url;await image.decode();return image;
};
export function workshopAssets(station) {
  if(cache.has(station))return cache.get(station);
  /** @type {Array<[string,number]>} */
  const props = station==='anvil' ? [['forge',41116],['tool',41118]]
    : station==='loom' ? [['tool',41401]]
    : station==='mason' ? [['tool',41309]]
    : [['table',41108]];
  if(station==='fire')props.push(['forge',41116]);
  props.push(['shelf',station==='alchemy'||station==='enchant'?41025:41045]);
  /** @type {Array<[string,()=>Promise<any>]>} */
  const tasks=[['wall',()=>texture(87,2)],['floor',()=>texture(67,0)],['candle',()=>flat(210,3)],...props.map(([key,id])=>/** @type {[string,()=>Promise<any>]} */([key,()=>model(id)]))];
  const pending=Promise.all(tasks.map(async([key,load])=>{try{return [key,await load()];}catch{return [key,null];}})).then(Object.fromEntries);
  cache.set(station,pending);return pending;
}
