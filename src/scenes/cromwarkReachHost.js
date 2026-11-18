// @ts-check
import { reachSite, reachDay, reachMemory } from '../systems/wild/cromwarkEvents.js';
import { wildInside } from '../systems/wild/wildZone.js';
// Shared WOD sites arbitrate competing owners. Character memory records observed
// deaths, never a disappeared foe: leaving the area is not a victory.
export function createCromwarkReachHost(d) {
  const sites=new Map(); let next=0, serial=0;
  const point=s=>{const t=d.translation(s.px,s.py);return [t[0]+s.x,d.ground(t[0]+s.x,t[2]+s.z),t[2]+s.z];};
  const mem=s=>reachMemory(s.day,s.id);
  const complete=s=>mem(s).said || s.roster.every(id=>mem(s).slain.includes(id));
  function spawn(s,now) {
    if(s.pending || now<s.retry || complete(s)) return;
    const list=d.foes.list().filter(f=>f.site===s.id);
    if(list.some(f=>f.puppet&&!f.dead)) return;
    const todo=s.roster.filter(id=>!mem(s).slain.includes(id) && !list.some(f=>f.mobileType===id));
    if(!todo.length) return;
    if(d.peerSprang(s.id) && !list.some(f=>!f.puppet&&!f.dead)) {
      if(d.peerHeldAgo(s.id)<10000) return;
      d.forgetPeer(s.id);
    }
    const origin=point(s); if(!Number.isFinite(origin[1])) return;
    s.retry=now+5000; s.pending=true;
    if(!list.some(f=>!f.puppet&&!f.dead)) {d.foes.reclaim(s.id);d.sprang(s.id);}
    const token=serial, camp=s.camp??=d.foes.campId();
    Promise.allSettled(todo.map(async(id)=>{
      const a=s.roster.indexOf(id)*2*Math.PI/s.roster.length, pos=[origin[0]+Math.sin(a)*9,origin[2]+Math.cos(a)*9];
      const f=await d.foes.spawn(id,pos,{site:s.id,yaw:a,transient:true});
      if(!f) return;
      if(token!==serial || !sites.has(s.id)) {d.foes.remove(f);return;}
      f.campId=camp; f.campAlertRadius=45;
      if(f.entity) f.entity.campId=camp;
    })).finally(()=>{s.pending=false;});
  }
  function frame() {
    if(!d.ready()) return;
    const now=d.now(), feet=d.feet(), pixel=d.pixel();
    if(now<next || !feet) return; next=now+250;
    const day=reachDay(d.utc()), sx=Math.floor(pixel.x/3),sy=Math.floor(pixel.y/3);
    for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++) {
      const s=reachSite(sx+ox,sy+oy,day);
      if(!wildInside(d.mask,s.px,s.py) || !d.allowed(s.px,s.py) || (Math.abs(s.px-823)<=1&&Math.abs(s.py-35)<=1)) continue;
      const p=point(s), dist=Math.hypot(p[0]-feet[0],p[2]-feet[2]);
      if(dist>600 || !Number.isFinite(p[1]) || !d.dry(p)) continue;
      if(!sites.has(s.id)) sites.set(s.id,{...s,retry:0,pending:false});
    }
    for(const [id,s] of sites) {
      if(s.pile?.items) mem(s).items=s.pile.items;
      const p=point(s),dist=Math.hypot(p[0]-feet[0],p[2]-feet[2]);
      if(dist>750 || !Number.isFinite(p[1]) || (s.day!==day&&dist>160)) {
        d.foes.drop(id); if(s.pile)d.loot.remove(s.pile); sites.delete(id); continue;
      }
      const m=mem(s), group=d.foes.list().filter(f=>f.site===id);
      for(const f of group) {
        if(f.dead) {if(f.corpse&&!m.slain.includes(f.mobileType)) m.slain.push(f.mobileType);continue;}
        if(f.puppet || !f.ai) continue;
        // The hunt physically patrols with the existing collision-aware motor.
        // Its trail moves in map space, so a floating-origin shift moves it too.
        if(s.kind===0) f.ai.follow={feet:()=>{
          const q=point(s), a=d.utc()/1000*.025+s.roster.indexOf(f.mobileType)*.3;
          return [q[0]+Math.sin(a)*35,q[1],q[2]+Math.cos(a)*35];
        },stop:2,leash:130};
      }
      if(dist<100&&!s.announced) {s.announced=true;d.say(`${s.title} — ${s.hint}`);}
      if(complete(s)) {
        if(!m.said) {m.said=true;d.say(s.kind===2?'The cache’s guards have fallen. Recover the supplies.':`${s.title}: the threat is ended.`);d.save();}
        if(s.kind===2&&dist<35) {
          // Each participating character gets one ordinary supply cache per site
          // per day, like the existing rite chest. Mark BEFORE seeding the pile.
          if(!m.opened) {m.items=d.loot.items();m.opened=true;d.save();}
          if(m.items?.length && (!s.pile||s.pile.dead)) s.pile=d.loot.seed(m.items,p,`${s.px},${s.py}`);
        }
      } else if(dist<110) spawn(s,now);
    }
  }
  return { frame, reset(){serial++;for(const s of sites.values()){d.foes.drop(s.id);if(s.pile)d.loot.remove(s.pile);}sites.clear();next=0;},
    beacons(){return [...sites.values()].filter(s=>!complete(s)).map(s=>{const p=point(s);return {x:p[0],y:p[1],z:p[2],radius:s.kind===0?1.3:s.kind===1?8:3,height:s.kind===0?25:s.kind===1?14:5,below:.1,kind:s.kind+1};});},
    state:()=>[...sites.values()].map(s=>({id:s.id,title:s.title,point:point(s),slain:[...mem(s).slain],complete:complete(s),pending:s.pending})),
  };
}
