// @ts-check
import { workshopAssets } from './workshopAssets.js';

/** Compose the game's own textured furnishings; keep timing feedback independent of asset loading. */
export function createWorkshopScene(host, station, name, available) {
  const doc=host.ownerDocument, box=doc.createElement('div'), canvas=doc.createElement('canvas');
  box.className='wk-scene';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${name} — crafting work surface`);
  const caption=doc.createElement('div');caption.className='wk-scene-caption';
  const title=doc.createElement('span'),status=doc.createElement('span');title.textContent=name;caption.append(title,status);box.append(canvas,caption);
  const ctx=canvas.getContext('2d');if(!ctx)return {el:box,stop(){}};
  let assets={},raf=0,stopped=false,attached=false,last=0,flash=0,heat=.35;
  const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  workshopAssets(station).then((loaded)=>{if(!stopped){assets=loaded;box.dataset.assets=loaded.wall?'ready':'unavailable';}});
  const feedback=(e)=>{if(e.detail?.result)flash=1;if(Number.isFinite(e.detail?.heat))heat=e.detail.heat;};
  host.addEventListener('bf-workshop-feedback',feedback);
  function stop(){stopped=true;cancelAnimationFrame(raf);host.removeEventListener('bf-workshop-feedback',feedback);}
  const prop=(key,x,y,w,h)=>{const image=assets[key];if(!image)return;const scale=Math.min(w/image.width,h/image.height);ctx.drawImage(image,x+(w-image.width*scale)/2,y+h-image.height*scale,image.width*scale,image.height*scale);};
  function draw(time){
    if(stopped)return;if(host.isConnected)attached=true;else if(attached){stop();return;}
    const bounds=box.getBoundingClientRect(),ratio=Math.min(globalThis.devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(bounds.width*ratio)),h=Math.max(1,Math.round(bounds.height*ratio));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(w/900,0,0,h/420,0,0);ctx.imageSmoothingEnabled=false;ctx.fillStyle='#191713';ctx.fillRect(0,0,900,420);
    if(assets.wall){ctx.fillStyle=ctx.createPattern(assets.wall,'repeat');ctx.fillRect(0,0,900,300);}
    if(assets.floor){ctx.save();ctx.translate(0,270);ctx.scale(1,.65);ctx.fillStyle=ctx.createPattern(assets.floor,'repeat');ctx.fillRect(0,0,900,240);ctx.restore();}
    const shade=ctx.createLinearGradient(0,0,0,420);shade.addColorStop(0,'rgba(0,0,0,.48)');shade.addColorStop(.7,'rgba(0,0,0,.12)');shade.addColorStop(1,'rgba(0,0,0,.6)');ctx.fillStyle=shade;ctx.fillRect(0,0,900,420);
    prop('shelf',625,30,220,280);prop('forge',45,80,285,265);prop('table',210,190,490,195);prop('tool',260,140,330,230);prop('candle',585,190,32,90);
    const working=!!host.querySelector('.cw-act,.pv-sim');
    if(assets.forge){const glow=ctx.createRadialGradient(185,275,0,185,275,160);glow.addColorStop(0,`rgba(255,147,45,${.08+(working&&!reduced?Math.sin(time/170)*.015:0)+heat*.05})`);glow.addColorStop(1,'rgba(255,147,45,0)');ctx.fillStyle=glow;ctx.fillRect(20,110,330,300);}
    const image=host.querySelector('.cw-ws-pic img');if(image?.complete&&image.naturalWidth){const scale=Math.min(125/image.naturalWidth,85/image.naturalHeight);ctx.drawImage(image,450-image.naturalWidth*scale/2,260-image.naturalHeight*scale/2,image.naturalWidth*scale,image.naturalHeight*scale);}
    if(flash>.05&&!reduced){ctx.fillStyle='#ffdc86';ctx.globalAlpha=flash;for(let i=0;i<12;i++){const a=i*2.4,d=(1-flash)*85;ctx.fillRect(450+Math.cos(a)*d,260+Math.sin(a)*d,3,3);}ctx.globalAlpha=1;}
    if(last)flash=Math.max(0,flash-(time-last)/500);last=time;
    status.textContent=working?'Working · timing affects the result':available?'Station available':'Planning · matching station required';raf=requestAnimationFrame(draw);
  }
  raf=requestAnimationFrame(draw);return {el:box,stop};
}
