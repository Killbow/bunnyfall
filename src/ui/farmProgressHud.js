import { t } from '../systems/textManager.js';
import { FARM_CROP_TYPES, FARM_UPGRADES, farmProgress, farmOrder, farmWeek, FARM_ARGENTS_PER_WEEK } from '../net/farmProgressLaw.js';

export const farmUpgradeName = (key,tier) => ({
  tools:[t('farm.progress.tools1','Tempered tools'),t('farm.progress.tools2','Masterwork tools')],
  irrigation:[t('farm.progress.water1','Irrigation channels'),t('farm.progress.water2','Living irrigation')],
  soil:[t('farm.progress.soil1','Compost beds'),t('farm.progress.soil2','Rich loam')],
})[key]?.[tier];
const effect = (key,tier) => ({
  tools:[t('farm.progress.area3','Work up to 3 nearby beds per click.'),t('farm.progress.area5','Work up to 5 nearby beds per click.')],
  irrigation:[t('farm.progress.autoWater','New seeds are watered automatically.'),t('farm.progress.autoPlant','Harvest replants and waters the same crop.')],
  soil:[t('farm.progress.yield1','New crops yield 1 extra item.'),t('farm.progress.yield2','New crops yield 2 extra items and grow 25% faster.')],
})[key]?.[tier];
const total = values => Object.values(values).reduce((a,b)=>a+b,0);

export function createFarmProgressHud({ root, belt, act, cropName }) {
  let open=false,armed='',signature='',tab='orders';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='farm-tool';toggle.textContent=t('farm.progress.open','Progress & orders');belt.append(toggle);
  const panel=document.createElement('aside');panel.className='wplaque on farm-progress';panel.hidden=true;root.append(panel);
  toggle.onclick=()=>{open=!open;panel.hidden=!open;root.classList.toggle('farm-progress-open',open);toggle.setAttribute('aria-expanded',String(open));armed='';signature='';};
  toggle.setAttribute('aria-expanded','false');
  const add=(tag,text,host=panel)=>{const el=document.createElement(tag);el.textContent=text;host.append(el);return el;};
  function actionButton(host,label,key,enabled,body) {
    const b=add('button',armed===key?t('farm.progress.confirm','Confirm: {label}',{label}):label,host);b.type='button';b.className='farm-tool';b.disabled=!enabled;
    b.onclick=()=>{if(armed===key){armed='';act(body);}else armed=key;signature='';};
  }
  return {
    get open(){return open;},
    update(garden,now,mayManage,busy,economy) {
      if(!open)return;
      const p=farmProgress(garden),week=farmWeek(now),sig=JSON.stringify([p,week,mayManage,busy,armed,tab,economy]);
      if(sig===signature)return;signature=sig;panel.replaceChildren();
      add('h2',t('farm.progress.title','Grow a farming estate'));
      add('p',t('farm.progress.totals','Harvested: {harvested} · Delivered: {delivered}',{harvested:total(p.harvested),delivered:total(p.delivered)}));
      add('p',t('farm.progress.shared','Company officers buy upgrades and fill orders from shared Stores. Rewards go to Company gold and Argent treasuries.'));
      if(economy)add('p',t('farm.progress.wallet','Company funds: {gold} gold · {argents} Argents · farm Argents earned this week: {earned}/{cap}',{...economy,cap:FARM_ARGENTS_PER_WEEK}));
      if(!mayManage)add('p',t('farm.progress.officers','Only your Company captain or officers may purchase or deliver.'));
      const tabs=add('nav','');
      for(const [id,label]of [['orders',t('farm.progress.orders','Bulk crop orders')],['upgrades',t('farm.progress.upgrades','Farm improvements')]]){
        const b=add('button',label,tabs);b.type='button';b.className='farm-tool';b.classList.toggle('on',tab===id);b.setAttribute('aria-pressed',String(tab===id));b.onclick=()=>{tab=id;armed='';signature='';};
      }
      if(tab==='orders'){
      add('h3',t('farm.progress.orders','Bulk crop orders'));
      add('p',t('farm.progress.weekly','One order per crop each week. Resets Monday UTC. Up to {cap} Argents per Company per week.',{cap:FARM_ARGENTS_PER_WEEK}));
      for(const crop of FARM_CROP_TYPES) {
        const card=add('section','');card.className='farm-project';const order=farmOrder(p,crop),grown=Math.max(0,p.harvested[crop]-p.delivered[crop]),done=p.weeks[crop]===week;
        add('h3',cropName(crop),card);
        add('p',t('farm.progress.orderGoal','Harvested here: {grown} available toward this {needed}-crop order. Keep enough in communal Company Stores to ship.',{grown,needed:order.quantity}),card);
        const label=done?t('farm.progress.nextWeek','Filled · next order Monday'):t('farm.progress.deliver','Deliver {quantity} {crop} · earn {gold} gold + {argents} Argents',{...order,crop:cropName(crop)});
        actionButton(card,label,'deliver:'+crop,mayManage&&!busy&&!done&&grown>=order.quantity&&!!economy&&economy.earned+order.argents<=FARM_ARGENTS_PER_WEEK,{op:'deliver',crop});
      }
      }else{
      add('h3',t('farm.progress.upgrades','Farm improvements'));
      for(const key of Object.keys(FARM_UPGRADES)) {
        const tier=p.upgrades[key],card=add('section','');card.className='farm-project';
        if(tier>=2){add('h3',farmUpgradeName(key,1),card);add('p',t('farm.progress.complete','Fully upgraded'),card);continue;}
        const price=FARM_UPGRADES[key][tier];add('h3',farmUpgradeName(key,tier),card);add('p',effect(key,tier),card);
        add('p',t('farm.progress.upgradeGoal','Requires {needed} delivered grain, mushrooms AND herbs. Your totals: {grain} / {mushroom} / {herbs}.',{needed:price.delivered,...p.delivered}),card);
        const label=t('farm.progress.buy','Buy · {gold} gold + {argents} Argents',price);
        actionButton(card,label,'upgrade:'+key,mayManage&&!busy&&!!economy&&economy.gold>=price.gold&&economy.argents>=price.argents&&FARM_CROP_TYPES.every(k=>p.delivered[k]>=price.delivered),{op:'upgrade',upgrade:key});
      }
      }
    },
  };
}
