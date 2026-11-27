// @ts-check
import { t } from '../textManager.js';
import { drawOverviewPage, drawStoresPage, drawWorkshopStation, takeCraftStationFocus, stationHere, stationsHere, profPagesShown, profProvider, profActUnderWay, setDownProfAct, workshopStationBusy } from '../profPages.js';
import { drawCraftWindow, craftWindowBusy, setDownCraftWork } from '../craftWindow.js';
import { drawProvPage, provisioningBusy, selectProvisioningKind, setDownProv } from '../provisioning/provPage.js';
import { mountReforgeWindow } from '../reforgeWindow.js';
import { ensureGrowthStyle } from '../growth/growthTab.js';
import { ensureWorkshopStyle } from './workshopStyle.js';
import { createWorkshopScene } from './workshopScene.js';
import { WORKSHOP_CRAFTS, WORKSHOP_STATIONS, workshopCraftOf, workshopOperations, workshopPageOf, workshopStationOf } from './workshopModel.js';

/** @type {ReadonlyArray<readonly [string, () => string]>} */
export const CRAFT_TAB_SECTIONS = Object.freeze([['make', () => t('workshop.make', 'Make')], ['store', () => t('workshop.store', 'Store')], ['mastery', () => t('workshop.mastery', 'Mastery')]]);
const landings = ['professions','bench','crafting','stores','provisioning','make','store','mastery'];
let sec = 'make', station = 'anvil', operation = 'craft', scene = null, itemWindow = null;
export const craftPageAt = (id) => typeof id === 'string' && landings.includes(id);
export const craftTabShown = () => profPagesShown();
export const craftSection = () => sec;
export const craftWorkshopBusy = () => craftWindowBusy() || provisioningBusy() || profActUnderWay() || workshopStationBusy();
export function setDownCraftWorkshop() { return setDownCraftWork() || setDownProv() || setDownProfAct(); }
export function setCraftSection(id) { if (craftPageAt(id) && !craftWorkshopBusy()) sec = workshopPageOf(id); }
export function resetCraftTab(at = null) {
  sec = workshopPageOf(at);
  if (at === 'crafting' || at === 'provisioning') station = workshopStationOf(takeCraftStationFocus() ?? stationHere() ?? (at === 'provisioning' ? 'fire' : station));
  operation = workshopOperations(station)[0][0];
}
const h = (tag, cls, text = null) => { const e = globalThis.document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const button = (word, run, on = false) => { const b = h('button', `act${on ? ' on' : ''}`, word); b.type = 'button'; b.setAttribute('aria-pressed',String(on)); b.onclick = run; b.disabled = craftWorkshopBusy(); return b; };

/** Same pause-tab entry, one workspace; no extra modal or second pause window. */
export function drawCraftTab(body, kit) {
  ensureGrowthStyle(); ensureWorkshopStyle();
  scene?.stop(); itemWindow?.unmount(); itemWindow = null;
  const p = profProvider(); if (!p) return;
  const root = h('section','wk'); root.setAttribute('aria-label', 'Crafting workshop');
  const header = h('header','wk-header'), words = h('div',null);
  words.append(h('div','wk-eyebrow',t('workshop.journal','Crafting journal')),h('h2',null,t('workshop.title','Your workshop')));
  const nav = h('nav','wk-pages'); nav.setAttribute('aria-label','Crafting pages');
  for (const [id,label] of CRAFT_TAB_SECTIONS) { const b=button(label(),()=>{sec=id;kit.render();},sec===id);b.dataset.workshopPage=id;b.setAttribute('aria-pressed',String(sec===id));nav.append(b); }
  const available = stationsHere();
  header.append(words,nav,h('span','wk-location',available.size ? [...available].map((s)=>WORKSHOP_STATIONS[workshopStationOf(s)]).join(' · ') : t('workshop.planning','Planning: visit a station to craft')));
  root.append(header);
  const pageKit={...kit,go:(id)=>{if(craftWorkshopBusy())return;if(id==='crafting'&&(station==='fire'||station==='alchemy')){operation='traditional';sec='make';}else sec=workshopPageOf(id);kit.render();}};
  if (sec === 'store') { const content=h('div','wk-other wk-store');drawStoresPage(content,kit.render,pageKit);root.append(content); }
  else if (sec === 'mastery') { const content=h('div','wk-other wk-mastery');drawOverviewPage(content,kit.render,pageKit);root.append(content); }
  else drawMake(root,p,kit.render,pageKit,available);
  body.append(root);
}

function drawMake(root,p,rerender,kit,available) {
  const layout=h('div','wk-layout'), rail=h('aside','wk-crafts'), workspace=h('main','wk-workspace');
  rail.setAttribute('aria-label','Crafting professions');
  const selected=workshopCraftOf(station);
  for(const craft of WORKSHOP_CRAFTS){
    const rank=p.book.track?.(craft.track)?.rank ?? 0;
    const b=button(craft.name,()=>{station=craft.stations[0];operation=workshopOperations(station)[0][0];rerender();},craft.id===selected.id);
    b.classList.add('wk-craft'); b.dataset.workshopCraft=craft.id;b.setAttribute('aria-pressed',String(craft.id===selected.id));
    b.append(h('small',null,`Rank ${rank}`));rail.append(b);
    if(craft.id===selected.id&&craft.stations.length>1){
      const select=h('select','prof-search');select.setAttribute('aria-label',`${craft.name} station`);select.disabled=craftWorkshopBusy();
      for(const id of craft.stations){const o=h('option',null,WORKSHOP_STATIONS[id]);o.value=id;select.append(o);}select.value=station;
      select.onchange=()=>{station=select.value;operation=workshopOperations(station)[0][0];rerender();};rail.append(select);
    }
  }
  const operations=workshopOperations(station);if(!operations.some(([id])=>id===operation))operation=operations[0][0];
  const bar=h('div','wk-operation-bar');
  for(const [id,name] of operations){const b=button(name,()=>{operation=id;rerender();},operation===id);b.dataset.workshopOperation=id;bar.append(b);}
  const here=available.has(station);
  bar.append(h('span','wk-status',here?t('workshop.stationReady','Station available'):t('workshop.stationAway','Matching station required')));
  const content=h('div','wk-content'); workspace.append(bar,content);layout.append(rail,workspace);root.append(layout);
  if(station==='enchant'&&operation==='gear'){
    const deps=p.reforgeKit?.();
    if(!deps) content.append(h('p','px-note','Stand at an enchanting station to reforge, imbue, salvage, imprint, scry or work with sockets.'));
    else {
      itemWindow=mountReforgeWindow(content,{...deps,embedded:true});
      const controller=itemWindow;
      const observer=new globalThis.MutationObserver(()=>{if(!content.isConnected){controller.unmount();observer.disconnect();}});observer.observe(globalThis.document.body,{childList:true,subtree:true});
    }
  } else if(station==='enchant'||operation==='traditional'){
    content.classList.add('wk-legacy');drawWorkshopStation(content,rerender,kit,station,operation);
    if(!content.children.length)content.append(h('p','px-note','Stand at the matching station to use this service.'));
    dress(content);
  } else if(station==='fire'||station==='alchemy'){
    selectProvisioningKind(station==='fire'?'pot':'cauldron');
    drawProvPage(content,rerender,p,here?station:null,kit,{workshop:true,kind:station==='fire'?'pot':'cauldron'});
    layoutProvisioning(content,station,here);
  } else {
    drawCraftWindow(content,rerender,p,station,()=>{operation='refine';rerender();},!here,{workshop:true,operation});
    layoutBench(content,station,here);
    if(!here&&operation!=='craft'&&operation!=='salvage')for(const b of content.querySelectorAll('button'))b.disabled=true;
  }
}

function dress(content){
  for(const b of content.querySelectorAll('.cw-btn,.cw-tab,.pv-btn')) { b.classList.add('act'); if(b.classList.contains('cw-primary')||b.classList.contains('primary'))b.classList.add('primary'); }
  for(const b of content.querySelectorAll('.cw-chip,.pv-chip:not(input),.cw-look-chip')){b.classList.add('prof-family');if(b.classList.contains('cw-on')||b.classList.contains('on'))b.classList.add('on');}
  for(const i of content.querySelectorAll('.cw-search,input.pv-chip'))i.classList.add('prof-search');
}
function addScene(content, target, station, available){scene=createWorkshopScene(content,station,WORKSHOP_STATIONS[station],available);target.prepend(scene.el);}
function layoutBench(content,station,available){
  dress(content);const body=content.querySelector('.cw-body');
  if(!body){content.classList.add('wk-legacy');return;}
  addScene(content,body,station,available);
  const sum=body.querySelector('.cw-ws-sum');
  if(sum){const info=[...sum.children].filter(e=>!e.classList.contains('cw-actions')&&!e.classList.contains('cw-word'));if(info.length){const details=h('details','wk-quality');details.append(h('summary',null,'Potential, quality odds & experience'),...info);sum.prepend(details);}}
  const act=body.querySelector('.cw-act');
  if(act){const work=h('div','wk-work-controls');work.append(act);body.append(work);body.classList.add('wk-working');content.classList.add('wk-working');}
}
function layoutProvisioning(content,station,available){
  dress(content);const body=content.querySelector('.pv-body');if(!body)return;addScene(content,body,station,available);
  const book=body.querySelector('.pv-book'), mid=body.querySelector('.pv-mid');
  if(book&&mid){const detail=h('details','wk-recipe-book');detail.append(h('summary',null,'Recipe book & traditional recipes'),book);mid.prepend(detail);}
  if(mid){const pantry=[...mid.children].filter((el)=>el.classList.contains('pv-chips')||el.tagName==='SMALL');if(pantry.length){const more=h('details','wk-pantry');more.append(h('summary',null,'Prepare ingredients & buy pantry supplies'),...pantry);mid.append(more);}}
  const act=content.querySelector('.pv-sim');if(act){body.querySelector('.wk-scene').after(act);body.classList.add('wk-simmering');}
}
