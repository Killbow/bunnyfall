// Browser probe for the guild clerk art: the PNGs, selection rules, texture orientation, and billboard lifecycle.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0}});await server.listen();
let browser;
try{
 browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:process.platform==='win32'?{channel:'chrome'}:{});
 const page=await browser.newPage({viewport:{width:1550,height:470}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__guild_clerks',r=>r.fulfill({contentType:'text/html',body:'<body style="background:#27211b;color:#eddbba;display:flex;gap:12px;padding:12px;margin:0;font:14px sans-serif"></body>'}));
 await page.goto(server.resolvedUrls.local[0]+'__guild_clerks');
 const result=await page.evaluate(async()=>{
  const {GUILD_CLERK_ART,markGuildClerkArt,loadGuildClerkArt,standGuildClerkArt,clerkRaster}=await import('/src/guilds/guildClerkArt.js');
  const {personLook}=await import('/src/characters/peopleBodies.js');
  const {color32Canvas}=await import('/src/ui/bitmapCanvas.js');
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const data=new Uint8Array(4*4*4);data.set([255,0,0,255],(1*4+1)*4);data.set([0,0,255,255],(2*4+1)*4);
  const cropped=clerkRaster({width:4,height:4,data});check(cropped.width===1&&cropped.height===2,'Transparent border was retained');check(cropped.colors[2]===255&&cropped.colors[4]===255,'Texture rows were flipped incorrectly');
  const child={textureArchive:182,textureRecord:4,native:'mages'},mage={textureArchive:182,textureRecord:0,native:'mages',_mwLook:{race:'Breton'}},other={textureArchive:182,textureRecord:0},bard={textureArchive:182,textureRecord:0,bunnyClerk:'bards'};
  markGuildClerkArt([child,mage,other,bard],p=>p.native??null);
  check(!child.guildClerkArt&&!other.guildClerkArt,'Replaced a child or unrelated resident');
  check(mage.guildClerkArt==='mages'&&bard.guildClerkArt==='bards','Clerk selection failed');
  check(personLook(mage,null,null)===null,'3D body overrides supplied paperdoll');
  const rows=[];
  for(const [key,art]of Object.entries(GUILD_CLERK_ART)){
   const pic=await loadGuildClerkArt(key);check(pic&&pic.width>0&&pic.height>0,'Missing artwork: '+key);
   check(await loadGuildClerkArt(key)===pic,'Decoded art was not cached');
   const pn={guildClerkArt:key,stood:true,x:1,y:2,z:3},batches=[],calls=[];
   const renderer={uploadTexture:(a,r,p)=>calls.push({a,r,p}),createBillboardBatch:(a,r,size,centers)=>({archive:a,record:r,size,centers})};
   check(await standGuildClerkArt(pn,renderer,batches,()=>true),'Did not stand '+key);
   check(calls.length===1&&calls[0].a===art.archive&&calls[0].p===pic,'Wrong uploaded texture');
   check(batches.length===1&&pn.height===1.8&&pn.width===1.8*pic.width/pic.height,'Wrong extent');
   await standGuildClerkArt(pn,renderer,batches,()=>true);check(batches.length===1,'Duplicated billboard');
   const hidden={guildClerkArt:key,stood:false};await standGuildClerkArt(hidden,renderer,batches,()=>true);
   const gone={guildClerkArt:key,stood:true};await standGuildClerkArt(gone,renderer,batches,()=>false);check(batches.length===1,'Late stand after hide/destroy');
   const card=document.createElement('div');card.style='text-align:center;flex:none';card.append(key);const canvas=color32Canvas(pic);canvas.style='display:block;width:auto;height:400px;margin-top:8px;image-rendering:pixelated';card.append(canvas);document.body.append(card);
   rows.push({key,width:pic.width,height:pic.height});
  }
  return rows;
 });
 assert.deepEqual(result.map(r=>r.key),['fighters','mages','adventurers','bards','cartographers','merchants','hunters','apothecaries','artisans']);assert.deepEqual(errors,[]);
 if(process.env.SHOTS_DIR){await mkdir(process.env.SHOTS_DIR,{recursive:true});await page.screenshot({path:join(process.env.SHOTS_DIR,'guild-clerks.png')});}
 console.log('Nine guild clerk sprites, selection and stand lifecycle passed',result);
}finally{await browser?.close();await server.close();}
