// Exercises the actual workshop renderers with recorded service calls; no realm or ARENA2 required.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0}});await server.listen();
let browser;
try{
 browser=await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : process.platform==='win32' ? {channel:'chrome'} : {});const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__workshop_probe',r=>r.fulfill({contentType:'text/html',body:'<html><head></head><body style="margin:0;background:#29231c"><main class="px-win px-win-pause-wide px-win-growth" style="position:relative;inset:auto;margin:20px;width:calc(100vw - 40px);height:calc(100vh - 40px);padding:16px;box-sizing:border-box"><div id="host" class="px-body" style="height:100%"></div></main></body></html>'}));
 await page.goto(server.resolvedUrls.local[0]+'__workshop_probe');
 await page.evaluate(async()=>{
 const {setPref}=await import('/src/systems/uiPrefs.js');setPref('enhancedPlus',true);setPref('plusDress','grimoire');const mod=await import('/src/ui/crafting/craftTab.js');const {setProfessionsPages}=await import('/src/ui/professions/profPages.js');const {injectEnhancedStyle}=await import('/src/ui/enhanced/enhancedStyle.js');injectEnhancedStyle();
 const el=(tag,cls,word)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(word!=null)e.textContent=word;return e;};
 const book={state:{open:true,stores:new Map()},track:()=>({rank:60,xp:0,specs:[]}),held:()=>1000,workable:()=>1000,focus:()=>({crafts:['smithing','building']}),chooseFocus:async()=>({ok:true}),isFocus:()=>true,made:()=>false,carrying:()=>false,provState:()=>({book:[],known:{}})};
 const calls=[];const record=(kind,value)=>{calls.push({kind,value});return Promise.resolve({ok:true,text:kind});};const item={name:'Test dagger',group:'Weapons',templateIndex:113,material:0,rarity:'common'};const offer={item,name:item.name,recipe:'dagger:iron',quality:1,provenance:'probe'};const p={book,name:k=>k,purse:()=>100000,forge:()=>({fee:0}),workbench:()=>({fee:0}),loom:()=>({fee:0}),mason:()=>({fee:0}),jeweller:()=>({fee:0}),fire:()=>({fee:0}),alchemy:()=>({fee:0}),enchanter:()=>({fee:0}),temperable:()=>[offer],upgradable:()=>[{item,name:item.name,cost:{key:'ingot:steel',n:2},gold:1,next:{madeOf:'Steel',rank:10}}],salvageable:()=>[{item,name:item.name,materials:true}],temper:o=>record('temper',o),upgrade:o=>record('upgrade',o),salvage:items=>record('salvage',items),disenchantable:()=>[],reforgeable:()=>[],craft:(id,options)=>record('craft',{id,options}),smelt:(id,n)=>record('smelt',{id,n}),provision:plan=>record('provision',plan),reforgeKit:()=>({items:()=>[],payer:()=>({}),gold:()=>100000,reforge:()=>({ok:true}),salvage:()=>({ok:true})})};
 setProfessionsPages(p);const host=document.querySelector('#host');const render=()=>{host.replaceChildren();mod.drawCraftTab(host,{el,divider:w=>el('h3','',w),meter:()=>el('div'),render});};window.probe={mod,p,render,calls};render();
 });
 await page.waitForTimeout(400);
 const shot=async(name)=>{if(process.env.SHOTS_DIR){await mkdir(process.env.SHOTS_DIR,{recursive:true});await page.screenshot({path:join(process.env.SHOTS_DIR,name+'.png')});}};if(process.env.ARENA2_PATH)await page.locator('.wk-scene[data-assets="ready"]').waitFor();await shot('make');
 await page.getByRole('button',{name:'Begin work',exact:true}).click();
 await page.waitForTimeout(100);
 assert.ok(await page.locator('.cw-work').evaluate(e=>e.getBoundingClientRect().width>=280),'Timing dial is too small');
 assert.ok(await page.locator('.cw-work-caption b').textContent(),'Part label missing');
 assert.ok(await page.locator('.cw-work').evaluate(e=>e.getBoundingClientRect().height>=280),'Timing dial is too short');
 assert.ok(await page.locator('.cw-act-row').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.wk-work-controls').getBoundingClientRect().bottom+1),'Timing controls are clipped');
 await shot('active-work');
 assert.equal(await page.evaluate(()=>window.probe.mod.craftWorkshopBusy()),true);
 assert.ok(await page.locator('[data-workshop-page="store"]').isDisabled());
 await page.evaluate(()=>window.probe.mod.setDownCraftWorkshop());
 assert.equal(await page.evaluate(()=>window.probe.calls.length),0,'Cancel spent materials');
 await page.getByText('Make without timing',{exact:true}).click();await page.getByRole('button',{name:'Make at base odds',exact:true}).click();
 await page.locator('[data-workshop-operation="upgrade"]').click();await page.getByRole('button',{name:'Raise',exact:true}).click();await page.getByRole('button',{name:'Rework',exact:true}).click();
 await page.locator('[data-workshop-operation="salvage"]').click();await page.locator('.cw-line').getByRole('button',{name:'Salvage',exact:true}).click();
 await page.locator('[data-workshop-operation="refine"]').click();await page.locator('.cw-line button:enabled').first().click();
 assert.deepEqual(await page.evaluate(()=>window.probe.calls.map(c=>c.kind)),['craft','temper','upgrade','salvage','smelt']);
 for(const craft of ['smithing','building','outfitting','cooking','alchemy','enchanting']){
 await page.locator(`[data-workshop-craft="${craft}"]`).click();
 const operations=await page.locator('[data-workshop-operation]').evaluateAll(es=>es.map(e=>e.dataset.workshopOperation));
 for(const operation of operations){await page.locator(`[data-workshop-operation="${operation}"]`).click();assert.ok((await page.locator('.wk-content').textContent()).length>0,`${craft}/${operation} blank`);}
 }
 for(const [craft,station] of [['smithing','jeweller'],['building','mason']]){
 await page.locator('[data-workshop-craft="'+craft+'"]').click();await page.locator('.wk-crafts select').selectOption(station);
 assert.ok(await page.locator('.cw-row').count()>0,station+' recipes missing');
 const ops=await page.locator('[data-workshop-operation]').evaluateAll(es=>es.map(e=>e.dataset.workshopOperation));
 for(const op of ops) await page.locator('[data-workshop-operation="'+op+'"]').click();
 }
 await page.locator('[data-workshop-craft="cooking"]').click();
 await page.locator('.pv-ing').nth(0).click();await page.locator('.pv-ing:not(.in)').first().click();
 await page.getByRole('button',{name:'Cook (The Simmer)',exact:true}).click();assert.ok(await page.locator('[data-workshop-craft="smithing"]').isDisabled());
 await page.getByRole('button',{name:'Take it off the heat',exact:true}).click();await page.waitForTimeout(80);
 assert.equal(await page.evaluate(()=>window.probe.calls.some(c=>c.kind==='provision')),false);
 await page.getByRole('button',{name:'Cook, skip the game',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.probe.calls.at(-1).value.kind),'pot');
 await shot('pot');
 await page.locator('[data-workshop-page="store"]').click();await page.locator('[data-workshop-page="mastery"]').click();
 await page.locator('[data-workshop-page="make"]').click();
 await page.locator('[data-workshop-craft="enchanting"]').click();
 for(const name of ['Reforge','Imbue','Salvage','Imprint','Codex','Scry','Sockets']) {await page.getByRole('tab',{name,exact:true}).click();}
 await shot('item-work');
 for(const [width,height] of [[1920,1080],[1366,768],[768,900],[390,844]]){
 await page.setViewportSize({width,height});await page.locator('[data-workshop-craft="smithing"]').click();await page.locator('[data-workshop-operation="craft"]').click();
 assert.ok(await page.evaluate(()=>{const r=document.querySelector('.wk').getBoundingClientRect();return r.right<=innerWidth&&r.left>=0;}),'Workshop exceeds viewport');
 await page.getByRole('button',{name:'Begin work',exact:true}).scrollIntoViewIfNeeded();
 }
 await page.setViewportSize({width:1366,height:768});
 await page.evaluate(async()=>{const {setPlusDress}=await import('/src/ui/grimoireDress.js');setPlusDress('none');});
 await shot('stone');
 assert.ok(await page.getByRole('button',{name:'Begin work',exact:true}).isVisible());
 await page.evaluate(()=>{for(const id of ['forge','workbench','loom','mason','jeweller','fire','alchemy','enchanter'])window.probe.p[id]=()=>null;window.probe.render();});
 assert.ok(await page.getByRole('button',{name:'Begin work',exact:true}).isDisabled(),'Allowed creation away from a station');
 await page.locator('[data-workshop-operation="upgrade"]').click();
 assert.ok(await page.getByRole('button',{name:'Raise',exact:true}).isDisabled(),'Allowed tempering away from a station');
 await page.locator('[data-workshop-craft="cooking"]').click();
 assert.ok(await page.getByRole('button',{name:'Cook (The Simmer)',exact:true}).isDisabled(),'Allowed cooking away from a fire');
 assert.deepEqual(errors,[]);console.log('Workshop routes passed');
}finally{await browser?.close();await server.close();}

