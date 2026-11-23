// @ts-check
import { decodePng } from '../render/textureReplacement.js';
import { APP_ROOT } from '../platform/appRoot.js';   // the page is /play/: a bare ./art/ path asks the wrong folder (appRoot.js)
import { toColor32 } from '../formats/color32Order.js';
import { isChildNPCTexture } from '../characters/staticNpc.js';

// User-supplied artwork, in the requested guild order. Dedicated texture keys never replace an ARENA2 record.
export const GUILD_CLERK_ART = Object.freeze({ ...Object.fromEntries([
  'fighters','mages','adventurers','bards','cartographers','merchants','hunters','apothecaries','artisans',
].map((key,index)=>[key,Object.freeze({key,url:`./art/guild-clerks/${key}.png`,archive:38320+index})])),
  // MAGICAL TAVERNS: Nyx, keeping the shared hall's bar (scenes/magicTavernRoom.js); a head over the townsfolk, as at her camp
  nyx: Object.freeze({ key: 'nyx', url: './art/bunnyfall-npcs/nyx.png', archive: 38329, h: 2.15 }),
});

/** Guild service clerks use their guild art; other residents retain their own appearance.
 * @param {any[]} people @param {(pn:any)=>string|null} [nativeKey] */
export function markGuildClerkArt(people, nativeKey = () => null) {
  for(const pn of people){
    const key=pn.bunnyClerk ?? nativeKey(pn);
    if(!GUILD_CLERK_ART[key] || isChildNPCTexture(pn.textureArchive??-1,pn.textureRecord??-1))continue;
    pn.guildClerkArt=key;pn._mwLook=null;
  }
}

/** Ignore only transparent canvas padding, keeping every painted pixel and the original PNG unchanged. */
export function clerkRaster(image) {
  const {width,height,data}=image;let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left)return null;
  const w=right-left+1,h=bottom-top+1,rgba=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)rgba.set(data.subarray(((y+top)*width+left)*4,((y+top)*width+right+1)*4),y*w*4);
  return toColor32({width:w,height:h,data:rgba});
}
const pictures=new Map();
export function loadGuildClerkArt(key) {
  const art=GUILD_CLERK_ART[key];if(!art)return Promise.resolve(null);
  if(!pictures.has(key))pictures.set(key,(async()=>{try{const response=await fetch(new URL(art.url,APP_ROOT??globalThis.document?.baseURI??'http://localhost/').href);if(!response.ok)return null;return clerkRaster(await decodePng(new Uint8Array(await response.arrayBuffer())));}catch(error){console.warn('[guild clerk] artwork unavailable',key,error);return null;}})());
  return pictures.get(key);
}

/** Stand through the normal billboard renderer, with the same late-load/hide protection as other interior people. */
export async function standGuildClerkArt(pn, renderer, batches, canStand) {
  const art=GUILD_CLERK_ART[pn.guildClerkArt];if(!art)return false;
  const picture=await loadGuildClerkArt(art.key);
  if(!canStand() || !pn.stood || pn.standBatch)return true;
  if(!picture)return false;
  const hh=art.h??1.8,size={w:hh*picture.width/picture.height,h:hh};
  pn.width=size.w;pn.height=size.h;
  renderer.uploadTexture(art.archive,0,picture);
  pn.standBatch=renderer.createBillboardBatch(art.archive,0,size,[[pn.x,pn.y,pn.z]]);
  batches.push(pn.standBatch);return true;
}
