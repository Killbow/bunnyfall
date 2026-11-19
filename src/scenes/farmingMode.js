// BUNNYFALL: the farming camera, tool input, shared bed state and world presentation live here, not in bootWorld.
import { mwViewHoldThird } from '../player/mwView.js';
import { holdCursor } from '../player/pointerLock.js';
import { eyeFor, leanedUp } from '../player/travelCamera.js';
import { rayDirFromScreen, projectToScreen } from '../player/tapRay.js';
import { farmGardenSite } from '../world/farmGardenSite.js';
import { createFarmGardenArt } from '../world/farmGardenArt.js';
import { createFarmingHud, farmToolName, farmCropName } from '../ui/farmingHud.js';
import { bedSeconds, FARM_WORK_REACH, FARM_BED_SIZE, FARM_BED_SPACING, emptyGarden, validGarden, gardenStage, gardenGrowth, farmSeed } from '../net/farmGardenLaw.js';
import { t } from '../systems/textManager.js';
import { ChoiceWindow } from '../ui/talkWindow.js';
import { TITLE_TEXT } from '../ui/playerBadge.js';
import { holdHotbar } from '../ui/enhanced/enhancedHotbar.js';
import { farmToolArea } from '../net/farmProgressLaw.js';
import { layFarmstead, farmsteadTargets, rayHitsTarget, cargoLevel, farmsteadLamps, LAMP_RANGE } from '../world/farm/farmstead.js';
import { adoptLight } from '../render/lightId.js';
import { seedsFor } from '../net/farm/cropLaw.js';   // PHASE 2: the seeds this farm's climate grows
import { bedWeedy, birdsNow, GRADES, gradeOf, clampCare } from '../net/farm/careLaw.js';   // PHASE 2: care, weeds and birds
import { createFarmGame, gameForOp } from '../net/farm/farmGameLaw.js';   // PHASE 2: the field games
import { createFarmGameWidget } from '../ui/farmGames.js';
import { createBirdArt } from '../world/farm/birdArt.js';
import { strainOf } from '../net/farm/strainLaw.js';   // PHASE 2c: strains
import { ANIMALS, contentIn, droverHere, CONTENT_GOOD, FED_S, WATERED_S } from '../net/farm/herdLaw.js';   // PHASE 3: the herd
import { createHerdArt } from '../world/farm/herdArt.js';
import { farmWeek } from '../net/farmProgressLaw.js';
import { traitWord } from './farm/farmsteadActs.js';
import { createSackArt, sackSpot, SACK_H } from '../world/farm/sackArt.js';
import { liveSacks, wagonCargo, cargoTotal, CARRY_MAX, SACK_GATHER_M } from '../net/farm/haulLaw.js';   // FARM EXPANSION PHASE 1: the farm as a place
import { createFarmsteadArt } from '../world/farm/farmsteadArt.js';
import { createFarmsteadActs } from './farm/farmsteadActs.js';
import { createStationActs } from './farm/stationActs.js';   // PHASE 5: sworn beasts on the farm
import { createStationArt } from '../world/farm/stationArt.js';
import { stationsOf, ploughReady, herdKeep, greenhouse } from '../net/farm/stationLaw.js';
import { setStationHome } from '../systems/revenant/revenantCompanions.js';
import { postIndexOf } from '../world/farm/farmstead.js';
import { FARM_SEEDS } from '../net/farm/cropLaw.js';

const TOOLS = ['hoe', 'plant', 'water', 'harvest'];
/** The farmyard's lanterns lit at night: within this reach of me, m, and at most this many (the town's lamps keep the rest). */
const FARM_LAMP_REACH = 60, FARM_LAMPS_MAX = 3;
export function createFarmingMode(deps) {
  const holdThird = deps.holdThird ?? mwViewHoldThird;
  const art = createFarmGardenArt(deps.renderer, deps);
  const stead = createFarmsteadArt(deps.renderer, deps);   // the fixtures, drawn for anyone near the farm
  const sacks = createSackArt(deps.renderer, deps);   // a harvest's sacks, and the ones shouldered for the wagon
  let fixture = null, detailsUntil = 0, carried = [];
  // PHASE 2: Careful work turns sowing, weeding and scything into the field games; `game` the one being played
  let careful = false, game = null;
  const birds = createBirdArt(deps.renderer, deps);
  const herdArt = createHerdArt(deps.renderer, deps); let herdSpots = [];   // PHASE 3: where each animal was drawn this frame   // the fixture under the pointer; officers' Company funds read while they use one
  const stationArt = createStationArt(deps.renderer, deps); let stationSpots = [], stationLast = performance.now();   // PHASE 5: where each stationed beast was drawn this frame
  if (!deps.passive) setStationHome((mapId) => { const own = deps.farms()?.mine()?.farms; return own ? own.some((f) => f.mapId === mapId) : undefined; });   // PHASE 5: a lost farm's post lets its beast come home
  let releaseHotbar = null, entering = false, mayManage = false, economy = null, farmWork = null;   // farmWork: my farm work, read with the ledger
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
    if(r.data.work)farmWork={total:r.data.work.total,today:r.data.work.today};
    if(!mayManage)economy=null;
    if (token === epoch && r?.ok && r.data?.unchanged && r.data.version === version) { serverOffset = r.data.nowS - Date.now()/1000; return true; }
    if (token !== epoch || !r?.ok || !validGarden(r.data?.garden)) return false;
    const data = r.data;
    if (data.version < version) return false;
    garden = data.garden; version = data.version; serverOffset = data.nowS - Date.now() / 1000; stationActs.sync(garden); return true;   // PHASE 5: the service's word wins for where a beast stands
  }
  async function read() {
    if (!farm || reading || busy) return;
    reading = true; const token = epoch, id = farm.mapId;
    try {
      const r = await deps.farms().garden(id, { version, details: Date.now() < detailsUntil });
      if (token !== epoch) return;
      if (!accept(r, token) && ['farm-not-ours', 'no-guild', 'guilds-need-account'].includes(r?.error)) { leave(); site?.restore(); art.dispose(); garden = emptyGarden(); version = -1; }
      else if (!r?.ok) notice(t('farm.mode.loadFailed', 'The farm could not be read. Try again in a moment.'));
    } catch { if (token === epoch) notice(t('farm.mode.loadFailed', 'The farm could not be read. Try again in a moment.')); }
    finally { if (token === epoch) { reading = false; nextRead = Date.now() + (version < 0 ? 5000 : 1000); } }
  }
  function notice(text) { message = text; noticeUntil = Date.now() + 4000; }
  function leave() {
    if (game) { game.widget.dispose(); game = null; }
    active = false; selected = -1; carried = []; eye = null; fwd = null; frame = null; pointer = null;
    hud?.dispose(); hud = null; freeCursor?.(); freeCursor = null;
    releaseHotbar?.(); releaseHotbar = null;
    if (heldBody) holdThird(false); heldBody = false; detach();
  }
  function clear() { epoch++; site?.restore(); farm = null; site = null; version = -1; economy=null; reading = busy = mayManage = false; fixture = null; carried = []; art.dispose(); stead.dispose(); sacks.dispose(); birds.dispose(); herdArt.dispose(); herdSpots = []; stationArt.dispose(); stationSpots = []; }
  function key(e) {
    if (!active || deps.blocked()) return;
    if (e.target?.matches?.('input,textarea,[contenteditable=true]') || e.ctrlKey || e.altKey || e.metaKey) return;
    if (game) {   // a field game holds the keys: Space plays it, Escape lays it down
      if (game.engine.state.kind === 'milk' && (e.code === 'KeyA' || e.code === 'KeyD')) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) game.engine.input({ key: e.code === 'KeyA' ? 'a' : 'd' }); return; }
      if (game.engine.state.kind === 'plough' && (e.code === 'KeyA' || e.code === 'KeyD')) { e.preventDefault(); e.stopImmediatePropagation(); game.engine.input({ steer: e.code === 'KeyA' ? -1 : 1 }); return; }   // PHASE 5
      if (e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) game.engine.input(game.engine.state.kind === 'scythe' ? { hold: true } : { press: true }); return; }
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); endGame(false); return; }
    }
    if (e.code === 'Escape') { leave(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.code === 'KeyF') { e.preventDefault(); e.stopImmediatePropagation(); setCareful(!careful); return; }
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
  function keyUp(e) {
    if (game?.engine.state.kind === 'plough' && (e.code === 'KeyA' || e.code === 'KeyD')) { e.preventDefault(); e.stopImmediatePropagation(); game.engine.input({ steer: 0 }); return; }   // PHASE 5
    if (game && e.code === 'Space' && game.engine.state.kind === 'scythe') { e.preventDefault(); e.stopImmediatePropagation(); game.engine.input({ hold: false }); }
  }
  function up(e) { if (game && e.button === 0 && game.engine.state.kind === 'scythe') game.engine.input({ hold: false }); }
  function down(e) {
    if (!active || deps.blocked() || e.target !== deps.canvas) return;
    if (game) {   // a click on the field plays the game; it never works a bed meanwhile
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.button === 0) game.engine.input(game.engine.state.kind === 'scythe' ? { hold: true } : { press: true });
      return;
    }
    e.preventDefault(); e.stopImmediatePropagation(); pointer = [e.clientX, e.clientY]; pick();
    if (e.button === 0) { if (fixture) useFixture(fixture); else work(); }
  }
  function context(e) { if (active && e.target === deps.canvas) e.preventDefault(); }
  function attach() {
    if (attached) return; attached = true;
    window.addEventListener('keydown', key, true); window.addEventListener('keyup', keyUp, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointermove', point, true);
    window.addEventListener('pointerdown', down, true); window.addEventListener('wheel', wheel, { capture: true, passive: false });
    window.addEventListener('contextmenu', context);
  }
  function detach() {
    if (!attached) return; attached = false;
    window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', keyUp, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointermove', point, true);
    window.removeEventListener('pointerdown', down, true); window.removeEventListener('wheel', wheel, true); window.removeEventListener('contextmenu', context);
  }
  function pick() {
    selected = -1; fixture = null;
    if (!site || !frame || !pointer) return;
    const rect = deps.canvas.getBoundingClientRect();
    const dir = rayDirFromScreen(pointer[0] - rect.left, pointer[1] - rect.top, rect.width, rect.height, frame.proj, frame.view, eye, deps.renderer.worldViewportRect);
    if (!dir) return;
    let nearest = Infinity;
    // FARM EXPANSION: a fixture before a bed when it stands nearer along the ray
    for (const target of [...farmsteadTargets(site.farmstead).filter((x) => x.id !== 'drover' || droverNow()).map((x) => stationActs.target(x, stationHeights)), ...sackTargets(), ...herdSpots.map((h) => ({ id: `animal:${h.id}`, animal: h.id, pos: h.pos, r: .8, h: h.h }))]) {
      const distance = rayHitsTarget(eye, dir, target);
      if (distance < nearest && deps.collider.raycast(eye, dir, distance) >= distance - .3) { nearest = distance; fixture = target; }
    }
    if (Math.abs(dir[1]) < 1e-6) return;
    site.beds.forEach((b, i) => {
      const distance = (b[1] - eye[1]) / dir[1];
      if (distance <= 0 || distance >= nearest) return;
      const x = eye[0] + dir[0] * distance, z = eye[2] + dir[2] * distance;
      if (Math.abs(x - b[0]) <= FARM_BED_SIZE / 2 && Math.abs(z - b[2]) <= FARM_BED_SIZE / 2 && deps.collider.raycast(eye, dir, distance) >= distance - .1) {
        selected = i; nearest = distance; fixture = null;
      }
    });
  }
  /** FARM EXPANSION: a fixture used where it stands - within reach, as a bed is. */
  function useFixture(target) {
    if (!active || version < 0 || ownHere()?.mapId !== farm.mapId) return;
    const feet = deps.feet();
    if (Math.hypot(feet[0] - target.pos[0], feet[2] - target.pos[2]) > FARM_WORK_REACH + target.r) { notice(t('farm.stead.closer', 'Walk closer to use it.')); return; }
    if (target.id.startsWith('sack:')) { shoulder(target); return; }
    if (target.id === 'wagon' && carried.length) { if (!busy) perform({ op: 'haul', sacks: [...carried] }); return; }
    if (target.id === 'scarecrow' && birdsHere()) { startGame('birds', { op: 'birds' }, target.pos); return; }
    if (target.animal) { tendAnimal(target.animal, target.pos); return; }
    if (target.id === 'pen' || target.id === 'sty') { if (!busy) perform({ op: 'herd', act: 'muck', pen: target.id }); return; }
    if (target.id === 'drover') { drover(); return; }
    if (postIndexOf(target.id) >= 0) { stationActs.use(target); return; }   // PHASE 5: a beast post
    acts.use(target.id);
  }
  /** The sacks lying at their beds, placed (several at one bed side by side), less the ones on my shoulder. */
  function lyingSacks() {
    if (!site) return [];
    const at = new Map();
    return liveSacks(garden, now()).filter((s) => !carried.includes(s.id) && site.beds[s.bed]).map((s) => {
      const n = at.get(s.bed) ?? 0; at.set(s.bed, n + 1);
      return { id: s.id, crop: s.crop, qty: s.qty, pos: sackSpot(site.beds[s.bed], n) };
    });
  }
  const sackTargets = () => (active ? lyingSacks().map((s) => ({ id: `sack:${s.id}`, sack: s, pos: s.pos, r: .4, h: SACK_H + .1 })) : []);
  /** A sack clicked: shoulder it and the ones lying near it, up to CARRY_MAX. */
  function shoulder(target) {
    const room = CARRY_MAX - carried.length;
    if (room <= 0) { notice(t('farm.stead.sackFull', 'Your arms are full. Carry these to the wagon first.')); return; }
    const near = lyingSacks().filter((s) => Math.hypot(s.pos[0] - target.pos[0], s.pos[2] - target.pos[2]) <= SACK_GATHER_M)
      .sort((a, b) => (a.id === target.sack.id ? -1 : b.id === target.sack.id ? 1 : Math.hypot(a.pos[0] - target.pos[0], a.pos[2] - target.pos[2]) - Math.hypot(b.pos[0] - target.pos[0], b.pos[2] - target.pos[2]))).slice(0, room);
    carried.push(...near.map((s) => s.id));
    notice(t('farm.stead.sackTaken', 'You shoulder {n} sack(s). Carry them to the factor\'s wagon.', { n: carried.length }));
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
    // PHASE 2: the hoe on a weedy planted bed weeds it; with Careful work on, sowing, weeding and scything are played
    const here = garden.beds[selected], op = tool === 'hoe' && here?.crop && bedWeedy(here, now(), gardenStage(here, now()) === 'ripe') ? 'weed' : tool;
    // PHASE 5: with a grizzly stationed and Careful work on, the hoe on wild ground is the ploughing game - a whole row at once
    if (careful && tool === 'hoe' && !here && ploughReady(garden)) { const row = stationActs.ploughRow(selected); if (row.length) { startGame('plough', { op: 'plough', beds: row }, bed); return; } }
    const [cropId, sid] = crop.split('#'), action = { op, bed: selected, beds: ids, crop: cropId, ...(sid ? { strain: Number(sid) } : {}) }, kind = gameForOp(op);
    // PHASE 2c: a harvest names the nearest other ripe bed of the same crop as its partner, for a cross
    if (op === 'harvest' && here?.crop) {
      let best = -1, bestD = 2.6;
      for (const [k, b] of Object.entries(garden.beds)) { const i = Number(k), p = site.beds[i]; if (!b || ids.includes(i) || !p || b.crop !== here.crop || gardenStage(b, now()) !== 'ripe') continue; const dd = Math.hypot(p[0] - bed[0], p[2] - bed[2]); if (dd < bestD) { bestD = dd; best = i; } }
      if (best >= 0) action.partner = best;
    }
    if (careful && kind && kind !== 'birds' && readyFor(op, here)) { startGame(kind, action, bed); return; }
    await perform(action);
  }
  /** Whether a bed is ready for this work - a game is only started where the work itself would succeed. */
  function readyFor(op, bed) {
    const stage = gardenStage(bed ?? null, now());
    return op === 'plant' ? stage === 'tilled' : op === 'harvest' ? stage === 'ripe' : op === 'weed';
  }
  function setCareful(on) { careful = on; notice(on ? t('farm.game.carefulOn', 'Careful work: sowing, weeding and scything become a little game, for better crops.') : t('farm.game.carefulOff', 'Careful work off.')); }
  const birdsHere = () => { const w = farm && birdsNow(farm.mapId, now()); return w && !(garden.chased ?? []).includes(w.id) ? w : null; };
  /** A field game begun on the thing it is played on; its report rides the work when it ends. */
  function startGame(kind, action, pos) {
    if (game || busy) return;
    const engine = createFarmGame(kind);
    game = { engine, widget: createFarmGameWidget(hudRoot(), engine), action, pos, last: performance.now() };
  }
  function endGame(play) {
    if (!game) return;
    const { engine, widget, action } = game; game = null; widget.dispose();
    if (play) perform({ ...action, game: engine.report() });
    else notice(t('farm.game.laidDown', 'You leave it for now.'));
  }
  const hudRoot = () => document.querySelector('.farming-hud') ?? document.body;
  // ─── PHASE 3: THE HERD ───
  const droverNow = () => (farm ? droverHere(garden, farm.mapId, now(), farmWeek) : null);
  const animalOf = (id) => (garden.herd ?? []).find((a) => a.id === id) ?? null;
  const kindName = (k) => ({ cow: t('farm.herd.cow', 'cow'), horse: t('farm.herd.horse', 'horse'), pig: t('farm.herd.pig', 'pig'), dog: t('farm.herd.dog', 'dog'), cat: t('farm.herd.cat', 'cat') })[k] ?? k;
  /** Where an animal lives: its pen's or sty's centre, or the yard by the ledger. */
  function homeOf(a) {
    const f = site?.farmstead?.fixtures, pen = ANIMALS[a.kind].pen, fx = f?.find((x) => x.id === (pen === 'yard' ? 'ledger' : pen));
    return fx ? { home: fx.pos, radius: pen === 'pen' ? 2.2 : pen === 'sty' ? 1.4 : 3 } : null;
  }
  /** An animal's need, first first: feed, water, milk - or nothing. */
  function needOf(a) {
    const t0 = now();
    if (a.fedUntil <= t0 + FED_S / 2) return 'feed';
    if (a.wateredUntil <= t0 + WATERED_S / 2) return 'water';
    if (a.kind === 'cow' && a.milked !== Math.floor(t0 / 86400) && contentIn(garden, a, t0) >= CONTENT_GOOD / 2) return 'milk';
    return null;
  }
  function tendAnimal(id, pos) {
    const a = animalOf(id); if (!a || busy) return;
    const need = needOf(a);
    if (!need) { notice(t('farm.herd.content', '{name} the {kind} is content for now.', { name: a.name, kind: kindName(a.kind) })); return; }
    const action = { op: 'herd', act: need, animal: id };
    if (need === 'milk' && careful) { startGame('milk', action, pos); return; }
    perform(action);
  }
  function drover() {
    const d = droverNow(); if (!d) return;
    const left = [0, 1, 2].filter((i) => !d.sold.includes(i));
    if (!left.length) { notice(t('farm.herd.droverSold', 'The drover has sold all he brought this week.')); return; }
    const list = left.map((i) => t('farm.herd.offer', 'a {kind} ({gold} gold)', { kind: kindName(d.kinds[i]), gold: ANIMALS[d.kinds[i]].price.toLocaleString('en-US') })).join(', ');
    if (!mayManage) { notice(t('farm.herd.droverLine', 'The drover has {list}. A Captain or an Officer can buy.', { list })); return; }
    const i = left[droverPick++ % left.length], kind = d.kinds[i];
    deps.show?.(new ChoiceWindow({ lines: [t('farm.herd.buyAsk', 'Buy a {kind} from the drover for {gold} gold from the Company treasury?', { kind: kindName(kind), gold: ANIMALS[kind].price.toLocaleString('en-US') }), t('farm.herd.buyMore', 'He also has: {list}.', { list })], options: [
      { code: 'KeyY', label: t('farm.stead.yes', 'Y: yes'), action: () => perform({ op: 'herd', act: 'buy', offer: i }) },
      { code: 'KeyN', label: t('farm.stead.no', 'N: no'), action: () => {} },
    ] }));
  }
  let droverPick = 0;
  function animalLine(a) {
    const c = contentIn(garden, a, now()), need = needOf(a);
    const mood = c >= 80 ? t('farm.herd.happy', 'Happy') : c >= CONTENT_GOOD ? t('farm.herd.contentWord', 'Content') : c >= 25 ? t('farm.herd.restless', 'Restless') : t('farm.herd.unhappy', 'Unhappy');
    const what = need === 'feed' ? t('farm.herd.hungry', 'hungry - click to feed') : need === 'water' ? t('farm.herd.thirsty', 'thirsty - click to water') : need === 'milk' ? t('farm.herd.milkReady', 'ready to milk') : '';
    return `${a.name} the ${kindName(a.kind)} · ${mood}${what ? ` · ${what}` : ''}`;
  }
  /** The seed in hand in words: a crop, or a strain by its name. */
  function seedName(id) { const [c, sid] = id.split('#'), st = sid ? strainOf(garden, Number(sid)) : null; return st ? st.name : farmCropName(c) ?? c; }
  const gradeName = (g) => [t('farm.grade.common', 'Common'), t('farm.grade.fine', 'Fine'), t('farm.grade.choice', 'Choice'), t('farm.grade.prize', 'Prize')][g] ?? GRADES[g];
  async function perform(action) {
    if(!active||busy||version<0)return;
    const token = epoch; busy = true;
    try {
      const r = await deps.farms().garden(farm.mapId, {...action,version});
      if (token !== epoch) return;
      if (accept(r, token)) {
        if (r.data.choreAwarded||r.data.reward||r.data.upgraded) deps.farms().refresh(true);
        // FARM EXPANSION (10.2): a farm title earned is said where it happens, by the factor
        if (r.data.work?.title) { deps.say?.(t('farm.stead.titleEarned', 'The factor tips his hat: "They\'re calling you {title} in town now."', { title: TITLE_TEXT[r.data.work.title] ?? r.data.work.title })); deps.titleEarned?.(r.data.work.title); }
        if(action.op==='upgrade'||action.op==='deliver')nextRead=0;
        if(r.data.strain)deps.say?.(t('farm.stead.cross','A cross seed! The farm names it {name} - {traits}. It has a sack on the seed shelf now.',{name:r.data.strain.name,traits:r.data.strain.traits.map(traitWord).join(', ')}));
        if(action.op==='station'||action.op==='recall'){stationActs.done(action,r.data);return;}   // PHASE 5
        if(action.op==='plough'){notice(t('farm.beast.ploughed','The plough turns a row of {n} beds.',{n:action.beds.length}));deps.sound?.('hoe');return;}
        if(action.op==='herd'){notice(r.data.bought?t('farm.herd.bought','The drover hands over {name} the {kind}.',{name:r.data.bought.name,kind:kindName(r.data.bought.kind)}):r.data.milk?t('farm.herd.milked','{n} pails of milk go to the Company Stores.',{n:r.data.milk}):action.act==='muck'?t('farm.herd.mucked','You muck out the pen. The animals are glad of it.'):action.act==='feed'?t('farm.herd.fed','You fill the trough from the Company Stores.'):t('farm.herd.watered','You fill the water bucket at the well.'));return;}
        if(action.op==='burn'){notice(t('farm.stead.burnt','The seed is burnt; its place on the shelf is free.'));return;}
        if(action.op==='birds'){notice(r.data.chased?t('farm.game.birdsGone','The birds scatter and wheel away over the fields.'):t('farm.game.birdsStay','The birds hop back to the rows. Try again.'));return;}
        if(action.game&&r.data.played&&!r.data.played.full)notice(t('farm.game.noBonus','Done - but you have had your fill of that game today, so no bonus care.'));
        if(action.op==='haul'){carried=carried.filter(id=>!action.sacks.includes(id));notice(t('farm.stead.hauled','You load the sacks onto the wagon: {n} crops for this week\'s orders.',{n:r.data.hauled}));deps.sound?.('haul');return;}
        notice(r.data.reward?t('farm.progress.reward','Order filled. Company treasury: +{gold} gold, +{argents} Argents.',r.data.reward):r.data.upgraded?t('farm.progress.installed','Farm improvement installed for everyone.'):r.data.harvested ? t('farm.mode.harvestedGrade', '{n} harvested into Company Stores ({grade}).', { n: r.data.harvested, grade: gradeName(Math.max(0, ...(r.data.grades ?? [0]))) }) : t('farm.mode.worked', 'Done. Your work is saved.'));
        deps.sound?.(tool);
      } else {
        if (action.op === 'haul' && r?.error === 'farm-haul-gone') carried = [];
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
      'farm-haul-gone':t('farm.stead.sackGone','Those sacks have already gone to the Company Stores.'),
      'farm-seed-climate':t('farm.stead.seedClimate','That seed will not take in this climate.'),
      'farm-birds-none':t('farm.game.birdsNone','The birds have already flown.'),
      'farm-birds-gone':t('farm.game.birdsChased','Someone has already chased them off.'),
      'farm-game-bad':t('farm.game.bad','That did not take. Try it again.'),
      'farm-strain-bad':t('farm.stead.strainBad','That seed is not on the shelf any more.'),
      'farm-herd-done':t('farm.herd.done','That is already done for today.'),
      'farm-herd-nofeed':t('farm.herd.noFeed','The Company Stores hold no feed for her. Grain or corn for cows and horses; any food for the rest.'),
      'farm-herd-full':t('farm.herd.full','The pens have no room for another of those.'),
      'farm-herd-unhappy':t('farm.herd.unhappyMilk','She is too unhappy to give milk. Feed and water her first.'),
      'farm-drover-away':t('farm.herd.away','The drover has gone on his way.'),
      'farm-drover-sold':t('farm.herd.sold','The drover has already sold that one.'),
      'farm-herd-bad':t('farm.herd.bad','That cannot be done here.'),
      'farm-haul-bad':t('farm.stead.sackGone','Those sacks have already gone to the Company Stores.'),
      'farm-station-full':t('farm.beast.full','Every post on this farm is taken.'),
      'farm-station-post':t('farm.beast.postTaken','Another beast already stands at that post.'),
      'farm-station-limit':t('farm.beast.limit','You already have two beasts stationed at the Company\'s farms.'),
      'farm-station-none':t('farm.beast.none','That beast is not at the farm any more.'),
      'farm-station-theirs':t('farm.beast.theirs','That beast is another\'s to call.'),
      'farm-station-bad':t('farm.beast.bad','The farm will not take that beast.'),
      'farm-plough-none':t('farm.beast.noPlough','No ploughing beast is stationed here.'),
      'farm-rank':t('farm.progress.rankNeeded','Only Company officers may spend farm funds or fill bulk orders.'),
      'marks-closed':t('farm.progress.closed','Argent orders and upgrades are unavailable on this server.'),
    }[error];
  }
  /** Whether a fixture of radius `r` at (x, y, z) would stand in a wall: rays across its footprint at knee and head
   *  height, and down onto it from above (a roof, a tree's crown). */
  function steadBlocked(x, y, z, r) {
    const c = deps.collider;
    for (const h of [.5, 1.6]) for (const [dx, dz] of [[1, 0], [0, 1], [.7071, .7071], [.7071, -.7071]]) {
      if (Number.isFinite(c.raycast([x - dx * r, y + h, z - dz * r], [dx, 0, dz], 2 * r))) return true;
    }
    return Number.isFinite(c.raycast([x, y + 3, z], [0, -1, 0], 2.8));
  }
  function projectTo(pos, lift, rect, proj, view) {
    const at = projectToScreen([pos[0], pos[1] + lift, pos[2]], rect.width, rect.height, proj, view, deps.renderer.worldViewportRect);
    at.x += rect.left; at.y += rect.top; return at;
  }
  function directionTo(feet, bed) {
    const dx = bed[0] - feet[0], dz = bed[2] - feet[2], len = Math.hypot(dx, dz);
    return len > .001 ? [dx / len, 0, dz / len] : [0, -1, 0];
  }
  /** DFU's own Y/N question: where Company money moves, and where a sworn beast is stationed or called back. */
  const askYN = (lines, yes) => { if (!deps.show) return; deps.show(new ChoiceWindow({ lines, options: [
      { code: 'KeyY', label: t('farm.stead.yes', 'Y: yes'), action: yes },
      { code: 'KeyN', label: t('farm.stead.no', 'N: no'), action: () => {} },
    ] })); };
  const acts = createFarmsteadActs({
    garden: () => garden, now, mayManage: () => mayManage, busy: () => busy, economy: () => economy, work: () => farmWork, say: notice,
    setSeed: (id) => { crop = id; tool = 'plant'; }, held: () => crop,
    ask: askYN,
    act: (action) => perform(action),
    wantFunds: () => { detailsUntil = Date.now() + 60000; nextRead = 0; },
  });
  // PHASE 5: sworn beasts on the farm - the posts, the Y/N, the ploughing row; their drawing is stationArt's
  const stationHeights = new Map();
  const stationActs = createStationActs({ garden: () => garden, farm: () => farm, now, say: notice, busy: () => busy, ask: askYN, act: (a) => perform(a), passive: !!deps.passive, beds: () => site?.beds ?? [] });
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
    inspect: () => ({ active, farm: farm ? { ...farm } : null, version, fields: site?.fields ?? 0, beds: site?.beds.map((b) => [...b]) ?? [], center: site ? [...site.center] : null, observers: [...observers.keys()],
      fixtures: farmsteadTargets(site?.farmstead).map((f) => ({ id: f.id, pos: [...f.pos], r: f.r, h: f.h })),
      sacks: lyingSacks().map((x) => ({ id: x.id, crop: x.crop, pos: [...x.pos] })), carried: [...carried], animals: herdSpots.map((h) => ({ id: h.id, pos: [...h.pos], h: h.h })), stations: stationSpots.map((h) => ({ id: h.id, pos: [...h.pos], h: h.h })), stationEntries: stationsOf(garden).map((e) => ({ ...e })) }),
    get active() { return active; }, get eye() { return eye; }, get look() { return fwd; },
    get pitch() { return active && fwd ? Math.asin(Math.max(-1, Math.min(1, fwd[1]))) : null; },
    get face() { return active ? { yaw, up: leanedUp(yaw, .8), grow: 1 } : null; },
    async enter(value) {
      if (active || entering || disposed || !deps.available()) return;
      const found = farmGardenSite(value, { ...deps, farms: deps.farms() });
      if (!found) { deps.say(t('farm.mode.noField', 'The crop fields are not ready here yet.')); return; }
      entering = true;
      try { await art.prepare(); await stead.prepare(); await sacks.prepare(); await birds.prepare(); await herdArt.prepare(); } catch { deps.say(t('farm.mode.noTextures', 'The farm textures could not be loaded. Please try again.')); return; } finally { entering = false; }
      if (disposed || !deps.available()) return;
      if (!holdThird(true)) { holdThird(false); deps.say(t('farm.mode.noBody', 'Your third-person character must be ready before entering Farming Mode.')); return; }
      heldBody = true;
      if (farm?.mapId !== value.mapId) { clear(); farm = value; site = found; }
      else { farm = value; site = found; }
      active = true; yaw = deps.cam.yaw; height = 8; selected = -1; freeCursor = holdCursor();
      releaseHotbar = holdHotbar();
      hud = createFarmingHud({ tool: (v) => { tool = v; }, leave, careful: () => setCareful(!careful) });
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
        art.prepare().catch(() => {}); stead.prepare().catch(() => {}); sacks.prepare().catch(() => {}); birds.prepare().catch(() => {}); herdArt.prepare().catch(() => {});
      }
      if (active && (!deps.available() || ownHere()?.mapId !== farm.mapId)) leave();
      if (!busy && !reading && Date.now() >= nextRead) read();
      if (game) { const t1 = performance.now(); game.engine.tick((t1 - game.last) / 1000); game.last = t1; if (game.engine.done) endGame(true); }
      if (carried.length) { const live = new Set(liveSacks(garden, now()).map((s) => s.id)); const kept = carried.filter((id) => live.has(id)); if (kept.length < carried.length) { carried = kept; notice(t('farm.stead.sackGone', 'Those sacks have already gone to the Company Stores.')); } }
      if (active) {
        deps.cam.yaw = yaw;
        hud.update(farm, tool, seedName(crop), status(), deps.blocked(), careful);
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
      frame = { proj, view }; if (active && !deps.blocked()) pick(); else { selected = -1; fixture = null; }
      site.mask(garden,version); art.update(site, garden, now(), selected); art.draw(right, up, selected);
      if (stead.ready) {
        if (!site.farmstead) {
          site.farmstead = layFarmstead(site, { heightAt: deps.heightAt, blocked: steadBlocked });
          if (site.farmstead) site.farmstead.climateBase = seedsFor(deps.farms()?.climateOf?.(farm.mapId) ?? null).map((s) => s.id);
        }
        // PHASE 5: a stationed dragonling's greenhouse puts every seed on the shelf (a few beds under glass take them)
        if (site.farmstead?.climateBase) { const base = greenhouse(garden) ? FARM_SEEDS.map((x) => x.id) : site.farmstead.climateBase; if (base.join() !== site.farmstead.base?.join()) site.farmstead.base = base; }
        // the shelf: the farm's seeds, then its strains of them (PHASE 2c)
        if (site.farmstead?.base) { const all = [...site.farmstead.base, ...(garden.strains ?? []).filter((x) => site.farmstead.base.includes(x.crop)).map((x) => `${x.crop}#${x.id}`)]; if (all.join() !== site.farmstead.seeds?.join()) site.farmstead.seeds = all; }
        if (site.farmstead?.seeds && !site.farmstead.seeds.includes(crop)) crop = site.farmstead.seeds[0] ?? 'grain';
        stead.update(site.farmstead, { ...(garden.progress?.upgrades ?? {}), cargo: cargoLevel(cargoTotal(wagonCargo(garden, now()))), drover: droverNow() ? 1 : 0 }); stead.draw(right, up);
      }
      const bySack = new Map(liveSacks(garden, now()).map((s) => [s.id, s]));
      sacks.update(lyingSacks(), carried.map((id) => bySack.get(id)).filter(Boolean), deps.feet(), right); sacks.draw(right, up);
      herdSpots = herdArt.update(garden.herd ?? [], homeOf, now(), performance.now() / 1000, herdKeep(garden)); herdArt.draw(right, up);
      // PHASE 5: each stationed beast at its post, as its own kind's foe sprite
      const posts = new Map((site.farmstead?.fixtures ?? []).map((f) => [postIndexOf(f.id), f.pos]));
      stationSpots = stationArt.update(stationsOf(garden).filter((e) => posts.has(e.post)).map((e) => ({ id: e.revenantId, mobileType: e.kind, pos: posts.get(e.post), post: e.post })), { dt: Math.min(.1, (performance.now() - stationLast) / 1000), eye }); stationLast = performance.now(); stationArt.draw(right, up);
      stationHeights.clear(); for (const sp of stationSpots) stationHeights.set(sp.id, sp.h);
      birds.update(birdsHere(), Object.entries(garden.beds).filter(([, b]) => b?.crop).map(([id]) => site.beds[Number(id)]).filter(Boolean), now()); birds.draw(right, up);
      if (!active || !hud) return;
      const rect = deps.canvas.getBoundingClientRect(), i = selected;
      if (game) { game.widget.update(projectTo(game.pos, game.engine.state.kind === 'birds' ? 2.6 : 1.1, rect, proj, view)); hud.target('', null); return; }
      const pos = i >= 0 ? site.beds[i] : site.center;
      const at = projectToScreen([pos[0], pos[1] + .9, pos[2]], rect.width, rect.height, proj, view, deps.renderer.worldViewportRect);
      at.x += rect.left; at.y += rect.top;
      let label = t('farm.mode.beds', 'Working beds');
      if (fixture) {
        const text = fixture.sack ? t('farm.stead.sackLabel', 'Sack of {crop} · {n} · carry it to the wagon', { crop: farmCropName(fixture.sack.crop), n: fixture.sack.qty })
          : fixture.id === 'wagon' && carried.length ? t('farm.stead.wagonLoad', 'The factor\'s wagon · load your sacks')
          : fixture.id === 'scarecrow' && birdsHere() ? t('farm.game.birdsLabel', 'Birds at the crop! Chase them off')
          : fixture.animal ? (animalOf(fixture.animal) ? animalLine(animalOf(fixture.animal)) : '')
          : fixture.id === 'pen' || fixture.id === 'sty' ? t('farm.herd.penLabel', 'The {pen} · click to muck it out', { pen: fixture.id === 'pen' ? t('farm.herd.pen', 'pen') : t('farm.herd.sty', 'sty') })
          : fixture.id === 'drover' ? t('farm.herd.droverLabel', 'The drover, with animals for sale') : postIndexOf(fixture.id) >= 0 ? stationActs.label(fixture.id) : acts.label(fixture.id);
        hud.target(text, projectTo(fixture.pos, fixture.h + .3, rect, proj, view)); return;
      }
      if (i >= 0) {
        const bed = garden.beds[i] ?? null, stage = gardenStage(bed, now());
        const growing = bed?.crop && stage !== 'ripe';
        const info = stage === 'wild' ? t('farm.mode.untilled', 'Untilled soil') : stage === 'tilled' ? t('farm.mode.tilled', 'Tilled soil') :
          stage === 'ripe' ? t('farm.mode.ready', 'Ready to harvest') : bed.wetUntil <= now() ? t('farm.mode.thirsty', 'Needs water') :
            t('farm.mode.hours', '{n}h to harvest', { n: Math.max(1, Math.ceil((bedSeconds(bed) - gardenGrowth(bed, now())) / (3600*(bed.rate??1)))) });
        label = `${farmToolName(tool)} · ${bed?.crop ? farmCropName(bed.crop) : info}${bed?.crop ? ` · ${info}` : ''}`;
        if (bed?.crop) label += ` · ${gradeName(gradeOf(clampCare(bed.care ?? 0)))}`;   // the grade it is on course for
        if (bed?.crop && bedWeedy(bed, now(), stage === 'ripe')) label += ` · ${t('farm.mode.weedy', 'Weeds! Hoe them out')}`;
        if (growing && tool === 'plant') label = t('farm.mode.alreadyPlanted', 'This bed is already planted.');
      }
      hud.target(label, at);
    },
    /** FARM EXPANSION: the farmyard's lanterns, for the host's night lights - the nearest few within reach of me. */
    lights() {
      if (!site?.farmstead) return [];
      const feet = deps.feet();
      return farmsteadLamps(site.farmstead).map((l) => [l, Math.hypot(l.pos[0] - feet[0], l.pos[2] - feet[2])]).filter(([, d]) => d <= FARM_LAMP_REACH)
        .sort((a, b) => a[1] - b[1]).slice(0, FARM_LAMPS_MAX).map(([l]) => adoptLight({ x: l.pos[0], y: l.pos[1], z: l.pos[2], range: LAMP_RANGE }, l.key));
    },
    rebase(delta) { if (eye) eye = eye.map((v, i) => v + delta[i]); site?.rebase(delta);for(const observer of observers.values())observer.rebase(delta); },
    dispose() { leave(); clear();for(const observer of observers.values())observer.dispose();observers.clear(); disposed = true; },
    leave,
  };
}
