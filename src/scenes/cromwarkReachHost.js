// @ts-check
import { reachSite, reachDay, reachMemory } from '../world/wild/cromwarkEvents.js';
import { CAMP_REACH } from '../systems/survival/camp.js';
import { RAY_DISTANCE } from '../player/activate.js';
import { t } from '../ui/textManager.js';
import { CROMWARK_WARDKEEPER, cromwarkWardRole } from '../world/wild/cromwarkWards.js';
import { wildInside, wildRingAt } from '../world/wildZone.js';
// Shared WOD sites arbitrate competing owners. Character memory records observed
// deaths, never a disappeared foe: leaving the area is not a victory.
export function createCromwarkReachHost(d) {
  const sites=new Map(); let next=0, serial=0;
  const point=s=>{const t=d.translation(s.px,s.py);return [t[0]+s.x,d.ground(t[0]+s.x,t[2]+s.z),t[2]+s.z];};
  const mem=s=>reachMemory(s.day,s.id);
  const complete=s=>mem(s).said || mem(s).slots.length >= s.roster.length;
  function spawn(s,now) {
    if(s.pending || now<s.retry || complete(s)) return;
    const list=d.foes.list().filter(f=>f.site===s.id);
    if(list.some(f=>f.puppet&&!f.dead)) return;
    const todo=s.roster.map((id, slot) => ({ id, slot })).filter(({slot}) => !mem(s).slots.includes(slot) && !list.some(f=>f.reachSlot===slot));
    if(!todo.length) return;
    if(d.peerSprang(s.id) && !list.some(f=>!f.puppet&&!f.dead)) {
      if(d.peerHeldAgo(s.id)<10000) return;
      d.forgetPeer(s.id);
    }
    const origin=point(s); if(!Number.isFinite(origin[1])) return;
    s.retry=now+5000; s.pending=true;
    if(!list.some(f=>!f.puppet&&!f.dead)) {d.foes.reclaim(s.id);d.sprang(s.id);}
    const token=serial, camp=s.camp??=d.foes.campId();
    Promise.allSettled(todo.map(async({id, slot})=>{
      const wardRole = s.wards[slot];
      const feet = d.feet();
      const rear = Math.atan2(origin[0] - feet[0], origin[2] - feet[2]);
      const a = wardRole >= 3 ? rear + (wardRole === 3 ? -.38 : .38) + s.placementSweep * .21 : slot * 2.399963229728653;
      const radius = (wardRole >= 3 ? 14 : 5 + Math.sqrt(slot + 1) * 2.7) + s.placementSweep;
      const pos=[origin[0]+Math.sin(a)*radius,origin[2]+Math.cos(a)*radius];
      const f=await d.foes.spawn(id,pos,{site:s.id,reachSlot:slot,wardRole,yaw:a,transient:true});
      if(!f) return;
      if(token!==serial || !sites.has(s.id)) {d.foes.remove(f);return;}
      f.reachSlot=slot; f.campId=camp; f.campAlertRadius=45;
      if(f.entity) f.entity.campId=camp;
    })).finally(()=>{s.pending=false; s.placementSweep=(s.placementSweep+1)%5;});
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
      if (!sites.has(s.id)) {
        const ring = d.mask?.depth ? wildRingAt(s.px, s.py, d.mask) : 0;
        const wards = s.roster.map((_, slot) => cromwarkWardRole(ring, slot, s.roster.length, ring >= 4 || s.x % 3 === 0));
        const roster = s.roster.map((id, slot) => wards[slot] >= 3 ? CROMWARK_WARDKEEPER : id);
        sites.set(s.id, { ...s, roster, wards, retry: 0, pending: false, placementSweep: 0 });
      }
    }
    for(const [id,s] of sites) {
      if(s.pile?.items) mem(s).items=s.pile.items;
      const p=point(s),dist=Math.hypot(p[0]-feet[0],p[2]-feet[2]);
      if(dist>750 || !Number.isFinite(p[1]) || (s.day!==day&&dist>160)) {
        d.foes.drop(id); if(s.pile)d.loot.remove(s.pile); sites.delete(id); continue;
      }
      const m=mem(s), group=d.foes.list().filter(f=>f.site===id);
      for(const f of group) {
        if(f.dead) {
          const slot=f.reachSlot;
          if(f.corpse && s.roster[slot] === f.mobileType && !m.slots.includes(slot)) {
            m.slots.push(slot);
            if(!m.slain.includes(f.mobileType)) m.slain.push(f.mobileType);
          }
          continue;
        }
        if(f.puppet || !f.ai) continue;
        // The hunt physically patrols with the existing collision-aware motor.
        // Its trail moves in map space, so a floating-origin shift moves it too.
        if(s.kind===0) f.ai.follow={feet:()=>{
          const q=point(s), a=d.utc()/1000*.025+(f.reachSlot ?? 0)*2*Math.PI/s.roster.length;
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
  const firePrefix = 'reach-fire:';
  const fireAt = (key) => typeof key === 'string' && key.startsWith(firePrefix)
    ? sites.get(key.slice(firePrefix.length)) : null;
  const fireName = () => t('cromwark.fire.name', 'Purple campfire');
  function fireTargets() {
    if (!d.ready()) return [];
    return [...sites.values()].filter(s => s.purpleFire).flatMap(s => {
      const [x, y, z] = point(s);
      if (!Number.isFinite(y)) return [];
      return [{ key: firePrefix + s.id, aabb: { min: [x - .8, y, z - .8], max: [x + .8, y + 1.6, z + .8] },
        distance: RAY_DISTANCE, reach: CAMP_REACH, noSurface: true }];
    });
  }
  function activateFire(key, mode) {
    const site = fireAt(key);
    if (!d.ready() || !site?.purpleFire) return false;
    if (mode === 'info' || mode === 'dialogue') d.say(fireName());
    else d.blight?.expose(site.id);
    return true;
  }
  return { frame, reset(){serial++;for(const s of sites.values()){d.foes.drop(s.id);if(s.pile)d.loot.remove(s.pile);}sites.clear();next=0;},
    fireTargets, activateFire,
    fireHover: key => fireAt(key)?.purpleFire ? { title: fireName(), actions: [{ id: 'attune', label: t('cromwark.fire.attune', 'Take on Blight') }] } : null,
    fires:()=>[...sites.values()].filter(s=>s.purpleFire).map(point),
    beacons(){return [...sites.values()].filter(s=>!complete(s)).map(s=>{const p=point(s);return {x:p[0],y:p[1],z:p[2],radius:s.kind===0?1.3:s.kind===1?8:3,height:s.kind===0?25:s.kind===1?14:5,below:.1,kind:s.kind+1};});},
    state:()=>[...sites.values()].map(s=>({id:s.id,title:s.title,point:point(s),slain:[...mem(s).slain],complete:complete(s),pending:s.pending})),
  };
}
