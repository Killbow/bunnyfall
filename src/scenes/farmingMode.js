// BUNNYFALL: the farming camera, tool input, shared bed state and world presentation live here, not in bootWorld.
import { mwViewHoldThird } from '../player/mwView.js';
import { holdCursor } from '../player/pointerLock.js';
import { eyeFor, leanedUp } from '../player/travelCamera.js';
import { rayDirFromScreen, projectToScreen } from '../player/tapRay.js';
import { farmGardenSite } from '../world/farmGardenSite.js';
import { createFarmGardenArt } from '../world/farmGardenArt.js';
import { createFarmingHud, farmToolName, farmCropName } from '../ui/farmingHud.js';
import { FARM_SEEDS, FARM_WORK_REACH, FARM_BED_SIZE, FARM_BED_SPACING, emptyGarden, validGarden, gardenStage, gardenGrowth, farmSeed } from '../net/farmGardenLaw.js';
import { t } from '../systems/textManager.js';
import { holdHotbar } from '../ui/enhanced/enhancedHotbar.js';
import { farmToolArea } from '../net/farmProgressLaw.js';

const TOOLS = ['hoe', 'plant', 'water', 'harvest'];
export function createFarmingMode(deps) {
  const holdThird = deps.holdThird ?? mwViewHoldThird;
  const art = createFarmGardenArt(deps.renderer, deps);
  let releaseHotbar = null, entering = false, mayManage = false, economy = null;
  let farm = null, site = null, garden = emptyGarden(), version = -1, serverOffset = 0;
  let active = false, busy = false, reading = false, epoch = 0, nextRead = 0, selected = -1;
  let tool = 'hoe', crop = 'grain', height = 8, yaw = 0, eye = null, fwd = null, hud = null, freeCursor = null, message = '';
  let frame = null, pointer = null, attached = false, disposed = false, noticeUntil = 0, heldBody = false;
  const observers = new Map(); let nextObservers = 0;
  const now = () => Date.now() / 1000 + serverOffset;
  const ownHere = () => deps.farms()?.mine()?.farms?.find((f) => deps.farms().atFarm(f.mapId)) ?? null;
  function nearbyObservers() {
    if (deps.passive || Date.now() < nextObservers) return;
    nextObservers = Date.now()+1000;
    const book=deps.farms(), wanted=new Set();
    for(const f of book?.all?.() ?? []) {
      const p=book.placeOf(f.mapId),pixel=p&&deps.built.get(`${p.px},${p.py}`);
      if(book.atFarm(f.mapId)||!pixel?.locOrigin||!pixel.locBlocks||pixel._stride>1)continue;
      wanted.add(f.mapId);
      if(!observers.has(f.mapId))observers.set(f.mapId,createFarmingMode({...deps,passive:true,farms:()=>({...book,visibleHere:()=>f,atFarm:()=>false})}));
    }
    for(const [id,observer]of observers)if(!wanted.has(id)){observer.dispose();observers.delete(id);}
  }
  function accept(r, token) {
    if(token!==epoch||!r?.ok||!r.data||r.data.version<version)return false;
    if(typeof r.data.mayManage==='boolean')mayManage=r.data.mayManage;
    if(r.data.economy)economy=r.data.economy;
    if(!mayManage)economy=null;
    if (token === epoch && r?.ok && r.data?.unchanged && r.data.version === version) { serverOffset = r.data.nowS - Date.now()/1000; return true; }
    if (token !== epoch || !r?.ok || !validGarden(r.data?.garden)) return false;
    const data = r.data;
    if (data.version < version) return false;
    garden = data.garden; version = data.version; serverOffset = data.nowS - Date.now() / 1000; return true;
  }
  async function read() {
    if (!farm || reading || busy) return;
    reading = true; const token = epoch, id = farm.mapId;
    try {
      const r = await deps.farms().garden(id, { version,details:!!hud?.progressOpen });
      if (token !== epoch) return;
      if (!accept(r, token) && ['farm-not-ours', 'no-guild', 'guilds-need-account'].includes(r?.error)) { leave(); site?.restore(); art.dispose(); garden = emptyGarden(); version = -1; }
      else if (!r?.ok) notice(t('farm.mode.loadFailed', 'The farm could not be read. Try again in a moment.'));
    } catch { if (token === epoch) notice(t('farm.mode.loadFailed', 'The farm could not be read. Try again in a moment.')); }
    finally { if (token === epoch) { reading = false; nextRead = Date.now() + (version < 0 ? 5000 : 1000); } }
  }
  function notice(text) { message = text; noticeUntil = Date.now() + 4000; }
  function leave() {
    active = false; selected = -1; eye = null; fwd = null; frame = null; pointer = null;
    hud?.dispose(); hud = null; freeCursor?.(); freeCursor = null;
    releaseHotbar?.(); releaseHotbar = null;
    if (heldBody) holdThird(false); heldBody = false; detach();
  }
  function clear() { epoch++; site?.restore(); farm = null; site = null; version = -1; economy=null; reading = busy = mayManage = false; art.dispose(); }
  function key(e) {
    if (!active || deps.blocked()) return;
    if (e.target?.matches?.('input,textarea,[contenteditable=true]') || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === 'Escape') { leave(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (i >= 0 || ['KeyQ', 'KeyE'].includes(e.code)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (i >= 0) tool = TOOLS[i];
      else yaw += (e.code === 'KeyQ' ? -1 : 1) * .14;
    }
  }
  function point(e) {
    if (!active || deps.blocked() || e.target !== deps.canvas) return;
    pointer = [e.clientX, e.clientY];
    if (e.buttons & 2) yaw -= (e.movementX ?? 0) * .005;
  }
  function wheel(e) {
    if (!active || deps.blocked() || e.target !== deps.canvas) return;
    e.preventDefault(); e.stopImmediatePropagation(); height = Math.max(5, Math.min(14, height + Math.sign(e.deltaY) * .8));
  }
  function down(e) {
    if (!active || deps.blocked() || e.target !== deps.canvas) return;
    e.preventDefault(); e.stopImmediatePropagation(); pointer = [e.clientX, e.clientY]; pick();
    if (e.button === 0) work();
  }
  function context(e) { if (active && e.target === deps.canvas) e.preventDefault(); }
  function attach() {
    if (attached) return; attached = true;
    window.addEventListener('keydown', key, true); window.addEventListener('pointermove', point, true);
    window.addEventListener('pointerdown', down, true); window.addEventListener('wheel', wheel, { capture: true, passive: false });
    window.addEventListener('contextmenu', context);
  }
  function detach() {
    if (!attached) return; attached = false;
    window.removeEventListener('keydown', key, true); window.removeEventListener('pointermove', point, true);
    window.removeEventListener('pointerdown', down, true); window.removeEventListener('wheel', wheel, true); window.removeEventListener('contextmenu', context);
  }
  function pick() {
    selected = -1;
    if (!site || !frame || !pointer) return;
    const rect = deps.canvas.getBoundingClientRect();
    const dir = rayDirFromScreen(pointer[0] - rect.left, pointer[1] - rect.top, rect.width, rect.height, frame.proj, frame.view, eye, deps.renderer.worldViewportRect);
    if (!dir) return;
    if (Math.abs(dir[1]) < 1e-6) return;
    let nearest = Infinity;
    site.beds.forEach((b, i) => {
      const distance = (b[1] - eye[1]) / dir[1];
      if (distance <= 0 || distance >= nearest) return;
      const x = eye[0] + dir[0] * distance, z = eye[2] + dir[2] * distance;
      if (Math.abs(x - b[0]) <= FARM_BED_SIZE / 2 && Math.abs(z - b[2]) <= FARM_BED_SIZE / 2 && deps.collider.raycast(eye, dir, distance) >= distance - .1) {
        selected = i; nearest = distance;
      }
    });
  }
  async function work() {
    if (!active || selected < 0 || busy || version < 0 || ownHere()?.mapId !== farm.mapId) return;
    const feet = deps.feet(), bed = site.beds[selected];
    if (Math.hypot(feet[0] - bed[0], feet[2] - bed[2]) > FARM_WORK_REACH) { notice(t('farm.mode.closer', 'Walk closer to work this bed.')); return; }
    if (deps.collider.raycast([feet[0], feet[1] + .8, feet[2]], directionTo(feet, bed), Math.hypot(feet[0] - bed[0], feet[2] - bed[2])) < Math.hypot(feet[0] - bed[0], feet[2] - bed[2]) - .3) {
      notice(t('farm.mode.blocked', 'Something is between you and this bed.')); return;
    }
    const ids=[selected],area=farmToolArea(garden);
    if(area>1){
      const candidates=site.beds.map((p,i)=>({p,i,d:Math.hypot(p[0]-bed[0],p[2]-bed[2])})).filter(({p,i,d})=>i!==selected&&d<=FARM_BED_SPACING+.1&&Math.hypot(p[0]-feet[0],p[2]-feet[2])<=FARM_WORK_REACH).sort((a,b)=>a.d-b.d||a.i-b.i);
      for(const {p,i}of candidates){
        const distance=Math.hypot(p[0]-feet[0],p[2]-feet[2]);
        if(deps.collider.raycast([feet[0],feet[1]+.8,feet[2]],directionTo(feet,p),distance)>=distance-.3)ids.push(i);
        if(ids.length>=area)break;
      }
    }
    await perform({op:tool,bed:selected,beds:ids,crop});
  }
  async function perform(action) {
    if(!active||busy||version<0)return;
    const token = epoch; busy = true;
    try {
      const r = await deps.farms().garden(farm.mapId, {...action,version});
      if (token !== epoch) return;
      if (accept(r, token)) {
        if (r.data.choreAwarded||r.data.reward||r.data.upgraded) deps.farms().refresh(true);
        if(action.op==='upgrade'||action.op==='deliver')nextRead=0;
        notice(r.data.reward?t('farm.progress.reward','Order filled. Company treasury: +{gold} gold, +{argents} Argents.',r.data.reward):r.data.upgraded?t('farm.progress.installed','Farm improvement installed for everyone.'):r.data.harvested ? t('farm.mode.harvested', '{n} harvested into Company Stores.', { n: r.data.harvested }) : t('farm.mode.worked', 'Done. Your work is saved.'));
        deps.sound?.(tool);
      } else {
        notice(progressError(r?.error) ?? (r?.error === 'farm-bed-version' ? t('farm.mode.changed', 'A friend changed the bed. Refreshing the farm...') : t('farm.mode.wrongTool', 'This bed is not ready for that action.')));
        nextRead = 0;
      }
    } catch { if (token === epoch) { notice(t('farm.mode.uncertain', 'The answer was lost. Refreshing before another action.')); nextRead = 0; } }
    finally { if (token === epoch) { busy = false; if (!nextRead) read(); } }
  }
  function progressError(error) {
    return {
      'farm-upgrade-funds':t('farm.progress.noFunds','The Company needs more gold or Argents for this improvement.'),
      'farm-upgrade-goal':t('farm.progress.noGoal','Deliver the required amount of every crop before this upgrade.'),
      'farm-upgrade-max':t('farm.progress.max','This improvement is already complete.'),
      'farm-order-grown':t('farm.progress.notGrown','Grow and harvest more of this crop at this farm first.'),
      'farm-order-stock':t('farm.progress.noStock','The communal Company Stores do not hold enough of this crop.'),
      'farm-order-week':t('farm.progress.weekDone','This crop order is already filled this week.'),
      'farm-order-cap':t('farm.progress.cap','The Company has reached its weekly farm Argent limit.'),
      'farm-order-full':t('farm.progress.full','Make room in the Company treasuries before filling the order.'),
      'farm-rank':t('farm.progress.rankNeeded','Only Company officers may spend farm funds or fill bulk orders.'),
      'marks-closed':t('farm.progress.closed','Argent orders and upgrades are unavailable on this server.'),
    }[error];
  }
  function directionTo(feet, bed) {
    const dx = bed[0] - feet[0], dz = bed[2] - feet[2], len = Math.hypot(dx, dz);
    return len > .001 ? [dx / len, 0, dz / len] : [0, -1, 0];
  }
  function status() {
    if (Date.now() < noticeUntil) return message;
    if (version < 0) return t('farm.mode.loading', 'Reading the shared beds...');
    if (busy) return t('farm.mode.saving', 'Saving your work...');
    const feet=deps.feet();let nearest=Infinity;
    for(const bed of site.beds)nearest=Math.min(nearest,(feet[0]-bed[0])**2+(feet[2]-bed[2])**2);
    const distance=Math.round(Math.sqrt(nearest));
    return distance > 10 ? t('farm.mode.findBeds', 'Working beds: {n} m away.', { n: distance }) : t('farm.mode.hint', 'Hoe a bed, plant seeds, then water. Crops grow while you are away.');
  }
  return {
    inspect: () => ({ active, farm: farm ? { ...farm } : null, version, fields: site?.fields ?? 0, beds: site?.beds.map((b) => [...b]) ?? [], center: site ? [...site.center] : null, observers: [...observers.keys()] }),
    get active() { return active; }, get eye() { return eye; }, get look() { return fwd; },
    get pitch() { return active && fwd ? Math.asin(Math.max(-1, Math.min(1, fwd[1]))) : null; },
    get face() { return active ? { yaw, up: leanedUp(yaw, .8), grow: 1 } : null; },
    async enter(value) {
      if (active || entering || disposed || !deps.available()) return;
      const found = farmGardenSite(value, { ...deps, farms: deps.farms() });
      if (!found) { deps.say(t('farm.mode.noField', 'The crop fields are not ready here yet.')); return; }
      entering = true;
      try { await art.prepare(); } catch { deps.say(t('farm.mode.noTextures', 'The farm textures could not be loaded. Please try again.')); return; } finally { entering = false; }
      if (disposed || !deps.available()) return;
      if (!holdThird(true)) { holdThird(false); deps.say(t('farm.mode.noBody', 'Your third-person character must be ready before entering Farming Mode.')); return; }
      heldBody = true;
      if (farm?.mapId !== value.mapId) { clear(); farm = value; site = found; }
      else { farm = value; site = found; }
      active = true; yaw = deps.cam.yaw; height = 8; selected = -1; freeCursor = holdCursor();
      releaseHotbar = holdHotbar();
      hud = createFarmingHud({ tool: (v) => { tool = v; }, seed: () => { crop = FARM_SEEDS[(FARM_SEEDS.findIndex((s) => s.id === crop) + 1) % FARM_SEEDS.length].id; }, leave, progressAct:action=>perform(action) });
      attach(); nextRead = 0; await read();
    },
    frame() {
      if (disposed) return;
      if (!deps.alive()) { this.dispose(); return; }
      nearbyObservers();for(const observer of observers.values())observer.frame();
      const here = deps.farms()?.visibleHere?.() ?? ownHere();
      if (!here || !(deps.viewAvailable?.() ?? deps.available())) { if (farm) { leave(); clear(); } return; }
      const foundPlace = deps.farms().placeOf(here.mapId);
      const pixel = foundPlace && deps.built.get(`${foundPlace.px},${foundPlace.py}`);
      if (farm?.mapId !== here.mapId || site?.pixel !== pixel) {
        leave(); clear();
        const found = farmGardenSite(here, { ...deps, farms: deps.farms() });
        if (!found) return;
        farm = here; site = found;
        art.prepare().catch(() => {});
      }
      if (active && (!deps.available() || ownHere()?.mapId !== farm.mapId)) leave();
      if (!busy && !reading && Date.now() >= nextRead) read();
      if (active) {
        deps.cam.yaw = yaw;
        hud.update(farm, tool, crop, status(), deps.blocked(),garden,now(),mayManage,busy,economy);
      }
    },
    camera(out, dt, normalFwd) {
      if (!active) return;
      const feet = deps.feet(), focus = [feet[0], feet[1] + .6, feet[2]];
      let desired = eyeFor(focus, yaw, .8, height).eye;
      const d = desired.map((v, i) => v - focus[i]), len = Math.hypot(...d);
      const hit = deps.collider.raycast(focus, d.map((v) => v / len), len);
      if (Number.isFinite(hit) && hit < len) desired = focus.map((v, i) => v + d[i] * Math.max(.1, (hit - .3) / len));
      if (!eye) eye = [...out.eye];
      const blend = 1 - Math.exp(-Math.max(0, dt) * 8);
      eye = eye.map((v, i) => v + (desired[i] - v) * blend); out.eye = eye;
      const to = focus.map((v, i) => v - eye[i]), distance = Math.hypot(...to);
      fwd = distance > .01 ? to.map((v) => v / distance) : normalFwd;
    },
    draw(proj, view, right, up) {
      for(const observer of observers.values())observer.draw(proj,view,right,up);
      if (!farm || !site || version < 0 || !art.ready) return;
      frame = { proj, view }; if (active && !deps.blocked()) pick(); else selected = -1;
      site.mask(garden,version); art.update(site, garden, now(), selected); art.draw(right, up, selected);
      if (!active || !hud) return;
      const rect = deps.canvas.getBoundingClientRect(), i = selected;
      const pos = i >= 0 ? site.beds[i] : site.center;
      const at = projectToScreen([pos[0], pos[1] + .9, pos[2]], rect.width, rect.height, proj, view, deps.renderer.worldViewportRect);
      at.x += rect.left; at.y += rect.top;
      let label = t('farm.mode.beds', 'Working beds');
      if (i >= 0) {
        const bed = garden.beds[i] ?? null, stage = gardenStage(bed, now());
        const growing = bed?.crop && stage !== 'ripe';
        const info = stage === 'wild' ? t('farm.mode.untilled', 'Untilled soil') : stage === 'tilled' ? t('farm.mode.tilled', 'Tilled soil') :
          stage === 'ripe' ? t('farm.mode.ready', 'Ready to harvest') : bed.wetUntil <= now() ? t('farm.mode.thirsty', 'Needs water') :
            t('farm.mode.hours', '{n}h to harvest', { n: Math.max(1, Math.ceil((farmSeed(bed.crop).seconds - gardenGrowth(bed, now())) / (3600*(bed.rate??1)))) });
        label = `${farmToolName(tool)} · ${bed?.crop ? farmCropName(bed.crop) : info}${bed?.crop ? ` · ${info}` : ''}`;
        if (growing && tool === 'plant') label = t('farm.mode.alreadyPlanted', 'This bed is already planted.');
      }
      hud.target(label, at);
    },
    rebase(delta) { if (eye) eye = eye.map((v, i) => v + delta[i]); site?.rebase(delta);for(const observer of observers.values())observer.rebase(delta); },
    dispose() { leave(); clear();for(const observer of observers.values())observer.dispose();observers.clear(); disposed = true; },
    leave,
  };
}
