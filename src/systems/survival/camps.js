import { GLOBAL_SCALE, RAY_DISTANCE } from '../../player/activate.js';
import { worldMinutes, sharedClockOn } from '../../world/worldTick.js';
import { FlatAnim } from '../../render/flatAnimation.js';
import { trs, multiply, wrapAngle } from '../../world/mat4.js';
import { intoDeck, outOfDeck } from '../naval/navalDeck.js';
import { localAabb, transformedAabb } from '../../render/frustum.js';
import { drawSeen } from '../../homes/decorRoom.js';
import { ListPickerWindow } from '../../ui/listPicker.js';
import { DecisionBoxWindow } from '../../ui/decisionBox.js';
import { t } from '../../ui/textManager.js';
import { survivalOn } from './switch.js';
import {
  TENT_MODEL, FIRE_FLAT, FIRE_LIGHT_RANGE, CAMP_REACH, CAMP_KIND, CAMP_TEXT, CAMPS_PER_OWNER,
  placeCampItem, packCamp, stokeFire, canStoke, fireLit, campExpired, tentNear as tentInReach, tentPos, nearestFire, campInfoText, campMenu, campSpot, campDecision,
  cookables, cookFood, hasSkillet, campWire, mergeOwnerCamps, BY_FIRE_REACH, FIRE_MINUTES, spendCampNight,
  strikeCamp,
  validDeck, deckYaw, TENT_BEHIND,
} from './camp.js';
import { isCampfireKit, isCampingEquipment, CAMPFIRE_USES } from './items.js';
import { isBedroll, isEmberJar, isFirewood, spendCharge, REST_ITEM_TEXT, FIREWOOD_NIGHTS, BEDROLL_CHANNEL_SECONDS } from './restItems.js';
import { REST_KIND } from './rest.js';
import { hearthNear, hearthAabb } from './hearth.js';
import { adoptLight } from '../../render/lightId.js';
import { hasBag } from '../../net/bagLaw.js';

export const FIRE_LIGHT_UP = 0.6;
export const FIRE_HALF = 0.5;
export const CAMP_LIGHT_REACH = 64;
// Only the nearest few fires join the host light list, ahead of the 16 renderer lights, so far camps take no lamps.
export const CAMP_LIGHTS_MAX = 4;
const within = (a, b, reach) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= reach;
const NO_CAMPS = Object.freeze([]);
// surfaceHit answers the nearer of mesh and terrain; raycast sees only mesh buckets and finds no ground outdoors.
const groundProbe = (col) => (col?.surfaceHit ? (o, d, m) => col.surfaceHit(o, d, m).dist
  : (col?.raycast ? (o, d, m) => col.raycast(o, d, m) : null));
// Seconds a boat must stay gone, with the boats settled, before this player's camp on her goes back into the pack.
export const DECK_GONE_S = 2;
const HEARTH_ROWS = Object.freeze([Object.freeze({ key: 'rest', text: CAMP_TEXT.menuRest }), Object.freeze({ key: 'cook', text: CAMP_TEXT.menuCook })]);

export function createCamps({
  renderer = null, getTexture = null, uploadRecordFrame = null, meshes = null, entity = null,
  camera = () => null, collider = () => null, place = () => ({}), pixelKeyAt = () => null,
  say = () => {}, showOverlay = null, openRest = null, advanceMinutes = null, selfId = () => null, onChanged = null,
  hearths = null,
  fieldCook = null,
  deck = null,
} = {}) {
  const camps = [];
  let _nextId = 0;
  let _fire = null;
  let _fireLoading = null;
  let _tent = null;
  let _tentLoading = null;
  const _owners = new Map();
  const now = () => worldMinutes();
  // An entry with no owner is this player's: online ids are minted per tab, so the record's owner cannot tell.
  const mine = (c) => c.owner == null;
  let keeper = null;
  // Set while the cap question is pending; another placing at the cap is refused until it clears.
  let capAsk = null;

  function ensureFire() {
    if (_fire || _fireLoading || !getTexture) return;
    _fireLoading = Promise.resolve(getTexture(FIRE_FLAT.archive)).then((t) => {
      if (!t) return;
      const count = t.getFrameCount?.(FIRE_FLAT.record) ?? 1;
      for (let i = 0; i < count; i++) uploadRecordFrame?.(FIRE_FLAT.archive, FIRE_FLAT.record, i);
      const size = t.getSize(FIRE_FLAT.record);
      _fire = { count, size: { w: size.width * GLOBAL_SCALE, h: size.height * GLOBAL_SCALE } };
      for (const c of camps) if (!c.batch) mountFire(c);
    }).catch((e) => console.warn('[camps] the fire would not load', e));
  }
  function ensureTent() {
    if (_tent || _tentLoading || !meshes?.getGpuMesh) return;
    _tentLoading = Promise.resolve(meshes.getGpuMesh(TENT_MODEL)).then((gpu) => {
      const cpu = meshes.cpuModels?.get?.(TENT_MODEL);
      _tent = { gpu: gpu ?? null, box: cpu?.positions ? localAabb(cpu.positions) : null };
    }).catch((e) => console.warn('[camps] the tent would not load', e));
  }
  function mountFire(c) {
    if (c.batch || !_fire || !renderer?.createBillboardBatch) return;
    c.batch = renderer.createBillboardBatch(FIRE_FLAT.archive, FIRE_FLAT.record, _fire.size, [c.rec.deck ? [0, 0, 0] : c.rec.pos]);
    // A fire on a deck is built about its own foot and moved by the batch origin each frame, never rebuilt.
    if (c.rec.deck) c.batch.origin = [c.rec.pos[0], c.rec.pos[1], c.rec.pos[2]];
    c.batch.frame = 0;
    c.anim = _fire.count > 1 ? new FlatAnim(FIRE_FLAT.archive, _fire.count, false) : null;
  }
  function unmount(c) {
    if (c.batch) { renderer?.destroyBillboardBatch?.(c.batch); c.batch = null; }
  }
  function remount(c) { unmount(c); mountFire(c); }

  function stand(rec, { owner = null } = {}) {
    // A camp on a deck is the boat's, so the streaming sweep never takes it.
    const c = { rec, batch: null, anim: null, pixelKey: rec.deck ? null : pixelKeyAt?.(rec.pos) ?? null, owner, hidden: !!rec.deck, deckM: null, goneFor: 0 };
    camps.push(c);
    ensureFire(); mountFire(c);
    if (rec.kind === CAMP_KIND.Tent) ensureTent();
    return c;
  }
  function drop(c) {
    unmount(c);
    const i = camps.indexOf(c);
    if (i >= 0) camps.splice(i, 1);
  }
  const own = () => camps.filter(mine).map((c) => c.rec);
  const usable = () => survivalOn() || sharedClockOn();
  const visible = (c) => !c.hidden;
  // `seen` is every visible camp in every tier; `shown`, which warms, also needs the arc or the shared clock.
  const shown = () => (usable() ? camps.filter(visible) : NO_CAMPS);
  const seen = () => camps.filter(visible);

  function placeItem(item, list, cleared = null) {
    if (isFirewood(item)) return feedFire(item, list);
    if (isBedroll(item)) return layBedroll(item, list);
    if (cleared != null && (!list?.includes(item) || !((item.stackCount ?? 1) >= 1))) return false;
    const oldTent = keeper && (isCampingEquipment(item) || isCampfireKit(item) || isEmberJar(item))
      ? camps.filter(mine).slice(0, Math.max(0, own().length - CAMPS_PER_OWNER + 1)).find((c) => c.rec.kind === CAMP_KIND.Tent) : null;
    if (oldTent && oldTent.rec.id !== cleared) {
      if (capAsk) { if (!capAsk.shown) say(t('camp.capWarn.wait', 'Still checking your oldest camp.')); return false; }
      const ask = { shown: false };
      const go = () => { if (capAsk === ask) capAsk = null; return placeItem(item, list, oldTent.rec.id); };
      const decide = (kept) => {
        if (!(kept?.pieces > 0) || !showOverlay) return go();
        // A question that opens late must not replace a window the player opened meanwhile.
        if (keeper.free && !keeper.free()) {
          if (capAsk === ask) capAsk = null;
          say(t('camp.capWarn.notPlaced', 'Placing this would pack up your oldest camp and its decorations, so nothing was placed. Use it again to decide.'));
          return false;
        }
        capAsk = ask;
        ask.shown = true;
        const win = new DecisionBoxWindow({
          rows: [t('camp.capWarn.oldest', 'Placing this will pack up your oldest camp.'), t('camp.capWarn.decorations', 'Its decorations will be lost.'), t('camp.capWarn.ask', 'Place it anyway?')],
          onYes: go,
        });
        win.dispose = () => { if (capAsk === ask) capAsk = null; };
        showOverlay(win);
        return false;
      };
      const kept = keeper.kept(oldTent.rec);
      if (typeof kept?.then !== 'function') return decide(kept);
      capAsk = ask;
      kept.catch(() => ({ pieces: 1 })).then(decide);
      return false;
    }
    const cam = camera?.();
    // Using an item always says something, so a refusal is never silent.
    if (!cam?.feet) { say(CAMP_TEXT.noSpot); return false; }
    const col = collider?.();
    const r = placeCampItem(item, list, {
      now: now(), owner: selfId?.() ?? null, feet: cam.feet, yaw: cam.yaw ?? 0,
      probe: groundProbe(col),
      place: place?.() ?? {}, standing: own().length, id: `${selfId?.() ?? 'me'}:${++_nextId}:${Math.trunc(now())}`,
    });
    if (r.text) say(r.text);
    if (!r.ok) return false;
    const struck = strikeOldest(r.strike);
    const on = deck?.at?.(r.camp.pos) ?? null;
    if (on?.m && on.ref) {
      const d = validDeck({ ...on.ref, local: intoDeck(on.m, r.camp.pos, [0, 0, 0]), yaw: r.camp.yaw - deckYaw(on.m) });
      if (d) r.camp.deck = d;
    }
    const c = stand(r.camp);
    if (r.camp.deck && on?.m) { c.hidden = false; c.deckM = on.m; }
    if (struck) say(struck);
    onChanged?.();
    return true;
  }
  // The pool keeps placing order, so the first of mine are the oldest. Each goes into the pack before the placing's
  // one onChanged tells the room, so no store mints the gear twice.
  function strikeOldest(n) {
    let line = null;
    for (const c of camps.filter(mine).slice(0, n | 0)) {
      const r = strikeCamp(c.rec);
      if (r.item && entity) (entity.items ??= []).push(r.item);
      drop(c);
      if (c.rec.kind === CAMP_KIND.Tent) keeper?.struck?.(c.rec);
      line = r.text;
    }
    return line;
  }

  function ride(dt = 0) {
    if (!deck?.resolve) return;
    let changed = false;
    for (let i = camps.length - 1; i >= 0; i--) {
      const c = camps[i], d = c.rec.deck;
      if (!d) continue;
      const at = deck.resolve(d) ?? { hidden: true };
      if (at.m) {
        c.deckM = at.m;
        c.rec.pos = outOfDeck(at.m, d.local, c.rec.pos);
        c.rec.yaw = wrapAngle(deckYaw(at.m) + d.yaw);
        c.hidden = false; c.goneFor = 0;
        if (c.batch) c.batch.origin = [c.rec.pos[0], c.rec.pos[1], c.rec.pos[2]];
        continue;
      }
      c.hidden = true; c.deckM = null;
      if (!at.gone || !mine(c)) { c.goneFor = 0; continue; }
      c.goneFor += Math.max(0, dt);
      if (c.goneFor < DECK_GONE_S) continue;
      const r = packCamp(c.rec);
      if (r.item && entity) (entity.items ??= []).push(r.item);
      say(CAMP_TEXT.packedWithBoat);
      drop(c);
      changed = true;
    }
    if (changed) onChanged?.();
  }

  function feedFire(item, list) {
    const feet = camera?.()?.feet;
    const t = now();
    const near = feet ? camps.filter((c) => mine(c) && visible(c) && c.rec.kind === CAMP_KIND.Fire && !c.rec.jar && !!c.rec.fuel && within(c.rec.pos, feet, BY_FIRE_REACH)) : [];
    const placed = near.filter((c) => (c.rec.wear | 0) < CAMPFIRE_USES).sort((a, b) => (a.rec.wear | 0) - (b.rec.wear | 0))[0] ?? null;
    // A kit holds what its own maxCondition says; an old save's kit holds fewer nights.
    const capOf = (it) => Math.min(CAMPFIRE_USES, it.maxCondition ?? CAMPFIRE_USES);
    const kits = (entity?.items ?? []).filter((it) => isCampfireKit(it));
    const packed = kits.filter((it) => (it.currentCondition ?? 0) < capOf(it)).sort((a, b) => (a.currentCondition ?? 0) - (b.currentCondition ?? 0))[0] ?? null;
    const take = () => { if ((item.stackCount ?? 1) > 1) item.stackCount -= 1; else { const i = (list ?? []).indexOf(item); if (i >= 0) list.splice(i, 1); } };
    if (placed) {
      placed.rec.wear = Math.min(CAMPFIRE_USES, (placed.rec.wear | 0) + FIREWOOD_NIGHTS);
      if (!fireLit(placed.rec, t)) { stokeFire(placed.rec, t); if (_fire && !placed.batch) mountFire(placed); }
      take(); onChanged?.();
      say(REST_ITEM_TEXT.firewoodFed(placed.rec.wear));
      return true;
    }
    if (packed) {
      packed.currentCondition = Math.min(capOf(packed), (packed.currentCondition ?? 0) + FIREWOOD_NIGHTS);
      take();
      say(REST_ITEM_TEXT.firewoodFed(packed.currentCondition));
      return true;
    }
    say(near.length || kits.length ? REST_ITEM_TEXT.firewoodFull : REST_ITEM_TEXT.firewoodNone);
    return false;
  }
  // The Bedroll is a spot, not a camp: nothing goes on the wire or into the save.
  let _bedroll = null;
  function layBedroll(item, list) {
    if ((item.currentCondition ?? 0) <= 0) { say(REST_ITEM_TEXT.bedrollWorn); return false; }
    const cam = camera?.();
    if (!cam?.feet) { say(CAMP_TEXT.noSpot); return false; }
    const col = collider?.();
    const spot = campSpot(cam.feet, cam.yaw ?? 0, groundProbe(col));
    const d = campDecision(CAMP_KIND.Fire, { ...(place?.() ?? {}), ground: spot.ground });
    if (!d.ok) { say(d.text); return false; }
    _bedroll = { item, list: list ?? entity?.items ?? null, pos: spot.pos };
    say(REST_ITEM_TEXT.bedrollLaid);
    openRest?.(null);
    return true;
  }
  const bedrollNear = (pos) => !!_bedroll && !!pos && (entity?.items ?? []).includes(_bedroll.item) && within(_bedroll.pos, pos, BY_FIRE_REACH);
  const restPointAt = (pos) => (fireNear(pos) ? { kind: 'camp', where: 'fire' }
    : bedrollNear(pos) ? { kind: 'rough', where: 'bedroll', channelSeconds: BEDROLL_CHANNEL_SECONDS } : null);

  function tick(dt) {
    const t = now();
    tendWhileResting(t);
    for (let i = camps.length - 1; i >= 0; i--) {
      const c = camps[i];
      // Only my own expire here; a peer camp goes when its owner says so.
      if (c.owner == null && campExpired(c.rec, t)) { drop(c); onChanged?.(); continue; }
      if (c.batch) {
        if (!fireLit(c.rec, t)) { unmount(c); continue; }
        if (c.anim) c.batch.frame = c.anim.tick(dt);
      } else if (fireLit(c.rec, t) && _fire) mountFire(c);
    }
  }
  // A rest at my own tent, or my own Campfire with fuel, keeps its fire burning through the night and past waking.
  function tendWhileResting(t) {
    if (!entity?.isResting || entity.restKind !== REST_KIND.Camp) return;
    const feet = camera?.()?.feet;
    if (!feet) return;
    for (const c of camps) {
      const tended = c.rec.kind === CAMP_KIND.Tent || (c.rec.kind === CAMP_KIND.Fire && !!c.rec.fuel);
      if (!mine(c) || !visible(c) || !tended || (c.rec.wear | 0) <= 0 || !fireLit(c.rec, t) || !within(c.rec.pos, feet, BY_FIRE_REACH)) continue;
      // Tended at most once an hour, so the wire hears one message an hour, not one a frame.
      if ((c.rec.litUntil ?? 0) - t > FIRE_MINUTES - 60) continue;
      c.rec.litUntil = t + FIRE_MINUTES;
      onChanged?.();
    }
  }
  const tend = () => tendWhileResting(now());
  const batches = () => seen().map((c) => c.batch).filter(Boolean);
  function lights() {
    const t = now();
    const feet = camera?.()?.feet;
    const lit = seen().filter((c) => fireLit(c.rec, t));
    const near = feet
      ? lit.map((c) => [c, Math.hypot(c.rec.pos[0] - feet[0], c.rec.pos[1] - feet[1], c.rec.pos[2] - feet[2])]).filter(([, d]) => d <= CAMP_LIGHT_REACH).sort((a, b) => a[1] - b[1]).map(([c]) => c)
      : lit;
    return near.slice(0, CAMP_LIGHTS_MAX).map((c) => adoptLight({ x: c.rec.pos[0], y: c.rec.pos[1] + FIRE_LIGHT_UP, z: c.rec.pos[2], range: FIRE_LIGHT_RANGE }, c.rec));
  }
  const tentMatrix = (c) => {
    const rec = c.rec, d = rec.deck;
    if (d && c.deckM) {
      // Her node's rotation alone, with unit columns: a hull's model scale is hers, never the tent's.
      const m = c.deckM, R = new Float32Array(16);
      for (let k = 0; k < 3; k++) {
        const n = Math.hypot(m[4 * k], m[4 * k + 1], m[4 * k + 2]) || 1;
        for (let i = 0; i < 3; i++) R[4 * k + i] = m[4 * k + i] / n;
      }
      const at = outOfDeck(m, [d.local[0] - Math.sin(d.yaw) * TENT_BEHIND, d.local[1], d.local[2] - Math.cos(d.yaw) * TENT_BEHIND], [0, 0, 0]);
      R[12] = at[0]; R[13] = at[1]; R[14] = at[2]; R[15] = 1;
      return multiply(R, trs(0, 0, 0, 0, d.yaw * 180 / Math.PI, 0));
    }
    const p = tentPos(rec);
    return trs(p[0], p[1], p[2], 0, rec.yaw * 180 / Math.PI, 0);
  };
  function draw(r = renderer, texRemap = null, cull = null) {
    if (!_tent?.gpu || !r?.drawMesh) return 0;
    let n = 0;
    for (const c of seen()) if (c.rec.kind === CAMP_KIND.Tent) {
      const m = tentMatrix(c);
      if (drawSeen(r, cull, cull && _tent.box ? transformedAabb(_tent.box, m) : null, _tent.gpu, m, texRemap)) n++;
    }
    return n;
  }

  function targets() {
    const out = [];
    const wf = worldFires();
    if (wf) for (let i = 0; i < wf.length; i++) {
      const aabb = hearthAabb(wf[i]);
      // `noSurface`: a flat has no collider, so a wall the ray meets in front of it is always a wall.
      if (aabb) out.push({ key: `hearth:${i}`, aabb, distance: RAY_DISTANCE, reach: CAMP_REACH, noSurface: true });
    }
    for (const c of seen()) {
      const p = c.rec.pos;
      out.push({ key: `camp:${c.rec.id}`, aabb: { min: [p[0] - FIRE_HALF, p[1], p[2] - FIRE_HALF], max: [p[0] + FIRE_HALF, p[1] + 1, p[2] + FIRE_HALF] }, distance: RAY_DISTANCE, reach: CAMP_REACH });
      if (c.rec.kind === CAMP_KIND.Tent) {
        const m = tentMatrix(c);
        const tp = tentPos(c.rec);
        const box = _tent?.box ? transformedAabb(_tent.box, m) : [tp[0] - 1.5, tp[1], tp[2] - 1.5, tp[0] + 1.5, tp[1] + 2, tp[2] + 1.5];
        out.push({ key: `camp:${c.rec.id}`, aabb: { min: [box[0], box[1], box[2]], max: [box[3], box[4], box[5]] }, distance: RAY_DISTANCE, reach: CAMP_REACH });
      }
    }
    return out;
  }
  const forKey = (key) => seen().find((c) => `camp:${c.rec.id}` === key) ?? null;
  function hoverName(key) {
    // A namer is handed every key the ray can win, including the exterior's numeric door keys.
    if (typeof key !== 'string') return null;
    if (key.startsWith('hearth:')) {
      const title = hearths?.()?.[Number(key.slice(7))]?.placed ? 'Campfire' : 'Fire';
      return usable() ? { title, actions: HEARTH_ROWS.map((r) => ({ id: r.key, label: r.text })) } : { title };
    }
    const c = forKey(key);
    if (!c) return null;
    const jar = c.rec.kind === CAMP_KIND.Fire && !!c.rec.jar;
    const out = { title: c.rec.kind === CAMP_KIND.Tent ? 'Camp' : jar ? (mine(c) ? 'Your Ember Jar fire' : 'Ember Jar fire') : mine(c) ? 'Your Campfire' : 'Campfire' };
    if (c.rec.kind === CAMP_KIND.Fire && mine(c) && !jar) out.subs = [CAMP_TEXT.fuelLeft(c.rec.wear | 0)];
    out.actions = campMenu(c.rec, now(), mine(c), { online: sharedClockOn() }).map((r) => ({ id: r.key, label: r.text }));
    return out;
  }
  function activate(key, mode, lit = null) {
    if (typeof key === 'string' && key.startsWith('hearth:')) {
      if (mode === 'info' || mode === 'dialogue') { say(CAMP_TEXT.seeHearth); return true; }
      if (lit === 'rest') { restAtHearth(); return true; }
      if (lit === 'cook' || !sharedClockOn()) { openCook(null); return true; }
      openHearthMenu();
      return true;
    }
    const c = forKey(key);
    if (!c) return false;
    if (mode === 'info' || mode === 'dialogue') { say(campInfoText(c.rec, now(), mine(c))); return true; }
    if (lit && campMenu(c.rec, now(), mine(c), { online: sharedClockOn() }).some((r) => r.key === lit)) { act(c, lit); return true; }
    openMenu(c);
    return true;
  }
  function restAtHearth() {
    const feet = camera?.()?.feet;
    if (!feet || !fireNear(feet)) { say(CAMP_TEXT.restCloser); return; }
    openRest?.(null);
  }
  function openHearthMenu() {
    const win = new ListPickerWindow({ items: HEARTH_ROWS.map((r) => r.text), onPick: (i) => { if (HEARTH_ROWS[i]?.key === 'rest') restAtHearth(); else openCook(null); } });
    if (showOverlay) showOverlay(win); else openCook(null);
    return win;
  }
  function spendNightNear(pos) {
    if (!pos) return false;
    let best = null, bestD = BY_FIRE_REACH;
    for (const c of camps) {
      if (!mine(c) || !visible(c) || !fireLit(c.rec, now())) continue;
      const d = Math.hypot(c.rec.pos[0] - pos[0], c.rec.pos[1] - pos[1], c.rec.pos[2] - pos[2]);
      if (d <= bestD) { best = c; bestD = d; }
    }
    if (!best) {
      if (fireNear(pos) || !bedrollNear(pos)) return false;
      if (spendCharge(_bedroll.item, _bedroll.list)) { say(REST_ITEM_TEXT.bedrollWorn); _bedroll = null; }
      return true;
    }
    const r = spendCampNight(best.rec, now(), fieldCook?.() === true);
    if (r.kept) return true;
    if (!r.spent) return false;
    if (r.empty) { say(best.rec.jar ? CAMP_TEXT.embersOut : best.rec.kind === CAMP_KIND.Fire ? CAMP_TEXT.outOfFuel : CAMP_TEXT.campWorn); unmount(best); }
    onChanged?.();
    return true;
  }
  function openMenu(c) {
    const rows = campMenu(c.rec, now(), mine(c), { online: sharedClockOn() });
    if (!rows.length) { say(campInfoText(c.rec, now(), mine(c))); return null; }
    const win = new ListPickerWindow({ items: rows.map((r) => r.text), onPick: (i) => act(c, rows[i]?.key) });
    if (showOverlay) showOverlay(win); else act(c, rows[0]?.key);
    return win;
  }
  function act(c, key, tell = true) {
    if (!camps.includes(c)) return;
    if (key === 'rest') {
      const feet = camera?.()?.feet;
      if (!feet || !within(c.rec.pos, feet, BY_FIRE_REACH)) { say(CAMP_TEXT.restCloser); return; }
      if (canStoke(c.rec, now(), mine(c)) && stokeFire(c.rec, now())) { remount(c); say(c.rec.kind === CAMP_KIND.Fire ? CAMP_TEXT.relit : CAMP_TEXT.stoked); onChanged?.(); }
      openRest?.(c.rec);
      return;
    }
    if (key === 'stoke') {
      if (!stokeFire(c.rec, now())) { say(CAMP_TEXT.noFuel); return; }
      remount(c); say(c.rec.kind === CAMP_KIND.Fire ? CAMP_TEXT.relit : CAMP_TEXT.stoked); if (c.owner == null) onChanged?.();
      return;
    }
    if (key === 'pack') {
      if (!mine(c)) { say(CAMP_TEXT.notYours); return; }
      const r = packCamp(c.rec);
      if (r.item && entity) (entity.items ??= []).push(r.item);
      drop(c); say(r.text); onChanged?.();
      if (tell && c.rec.kind === CAMP_KIND.Tent) keeper?.struck?.(c.rec);
      return;
    }
    if (key === 'cook') openCook(c);
  }
  function packTent(id) {
    const c = camps.find((x) => mine(x) && x.rec.id === id && x.rec.kind === CAMP_KIND.Tent);
    if (c) act(c, 'pack', false);
    return !!c;
  }
  function openCook(c) {
    const items = entity?.items ?? [];
    // Raw food from the pack, then from the Materials Bag while the pack holds one; cooked food goes in the pack.
    const bag = hasBag(items) ? (entity?.bagItems ?? []) : [];
    const raw = [...cookables(items).map((it) => [it, items]), ...cookables(bag).map((it) => [it, bag])];
    if (!raw.length) { say(CAMP_TEXT.nothingToCook); return null; }
    if (c && !fireLit(c.rec, now())) { say(CAMP_TEXT.cold); return null; }
    const win = new ListPickerWindow({
      items: raw.map(([it]) => ((it.stackCount ?? 1) > 1 ? `${it.name} (${it.stackCount})` : it.name)),
      onPick: (i) => {
        const [it, from] = raw[i];
        const r = cookFood(it, from, { skillet: hasSkillet(items), into: items });
        if (!r) return;
        say(r.text);
        advanceMinutes?.(r.minutes);
      },
    });
    if (showOverlay) showOverlay(win);
    return win;
  }

  // World fires answer only while the arc or the shared clock is on; otherwise every seam stays classic.
  const worldFires = () => (usable() && hearths ? hearths() : null);

  // `byFire` is what this player uses (warmth); `fireNear` answers for the place of a rest, in every tier.
  const byFire = (pos) => !!nearestFire(shown().map((c) => c.rec), pos, now())
    || hearthNear(worldFires(), pos, BY_FIRE_REACH);
  const fireNear = (pos) => !!nearestFire(seen().map((c) => c.rec), pos, now())
    || hearthNear(hearths ? hearths() : null, pos, BY_FIRE_REACH);
  const tentNear = (pos) => tentInReach(shown().map((c) => c.rec), pos);

  function destroyAll() {
    for (const c of camps) unmount(c);
    camps.length = 0;
    _bedroll = null;
    _owners.clear();
  }
  function collectPixel(key) {
    for (let i = camps.length - 1; i >= 0; i--) if (camps[i].pixelKey === key) { unmount(camps[i]); camps.splice(i, 1); }
  }
  function offsetAll(offset) {
    const [dx, dy, dz] = offset;
    for (const c of camps) {
      c.rec.pos[0] += dx; c.rec.pos[1] += dy; c.rec.pos[2] += dz;
      if (c.rec.deck) { if (c.batch) c.batch.origin = [c.rec.pos[0], c.rec.pos[1], c.rec.pos[2]]; }
      else if (c.batch) remount(c);
    }
    if (_bedroll) { _bedroll.pos[0] += dx; _bedroll.pos[1] += dy; _bedroll.pos[2] += dz; }
  }
  function groundMoved(x0, z0, x1, z1, dy) {
    const inBox = (p) => p[0] >= x0 && p[0] < x1 && p[2] >= z0 && p[2] < z1;
    for (const c of camps) {
      if (c.rec.deck || !inBox(c.rec.pos)) continue;
      const d = dy(c.rec.pos[0], c.rec.pos[2]);
      if (!d) continue;
      c.rec.pos[1] += d;
      if (c.batch) remount(c);
    }
    if (_bedroll && inBox(_bedroll.pos)) _bedroll.pos[1] += dy(_bedroll.pos[0], _bedroll.pos[2]);
  }
  const snapshot = (toWorld = (p) => p) => own().map((rec) => { const p = toWorld(rec.pos); return { ...rec, pos: [p[0], p[1], p[2]] }; });
  function restore(list, fromWorld = (p) => p) {
    for (const r of Array.isArray(list) ? list : []) {
      if (!r || typeof r !== 'object' || !Array.isArray(r.pos) || r.pos.length !== 3 || !(r.kind === CAMP_KIND.Tent || r.kind === CAMP_KIND.Fire)) continue;
      if (r.id != null && camps.some((c) => c.owner == null && c.rec.id === String(r.id))) continue;
      // Merged by id, and the id counter continues from the save's, so a new camp never reuses a saved id.
      const n = /^[^:]+:(\d+)(?::|$)/.exec(String(r.id ?? ''));
      if (n) _nextId = Math.max(_nextId, Number(n[1]));
      const p = fromWorld(r.pos);
      const deckAt = validDeck(r.deck);
      stand({ id: String(r.id ?? `me:${++_nextId}`), owner: r.owner ?? null, kind: r.kind, pos: [p[0], p[1], p[2]], yaw: Number(r.yaw) || 0, litUntil: Number.isFinite(r.litUntil) ? r.litUntil : null, wear: r.wear | 0, placedAt: r.placedAt ?? null, ...(r.jar === true ? { jar: true } : {}), ...(r.fuel === true ? { fuel: true } : {}), ...(deckAt ? { deck: deckAt } : {}) });
      if (own().length >= CAMPS_PER_OWNER) break;
    }
  }

  // A load drops the camps of this player before it restores; peer camps stay until their owners say otherwise.
  function dropOwn() {
    let n = 0;
    for (let i = camps.length - 1; i >= 0; i--) if (mine(camps[i])) { drop(camps[i]); n++; }
    _bedroll = null;
    keeper?.loaded?.();
    if (n) onChanged?.();
  }
  function packOwnFires({ quiet = false } = {}) {
    let n = 0;
    for (let i = camps.length - 1; i >= 0; i--) {
      const c = camps[i];
      if (!mine(c) || c.rec.kind !== CAMP_KIND.Fire || c.rec.jar || !c.rec.fuel) continue;
      const r = packCamp(c.rec);
      if (r.item && entity) { (entity.items ??= []).push(r.item); n++; }
      drop(c);
    }
    if (n) { if (!quiet) say(CAMP_TEXT.carriedOut); onChanged?.(); }
    return n;
  }

  const wireRecords = (toWire = (p) => p) => own().map((rec) => campWire(rec, toWire));
  function applyOwner(owner, records, toScene = (p) => p, nowMs = 0) {
    if (typeof owner !== 'string' || !owner || owner === (selfId?.() ?? null)) return false;
    // A record matching one of this player's own camps stays theirs, whoever relays it.
    const ownIds = new Set(own().map((rec) => rec.id));
    const theirs = Array.isArray(records) ? records.filter((r) => !ownIds.has(r?.i)) : records;
    const fresh = mergeOwnerCamps([], owner, theirs, toScene, selfId?.() ?? null);
    // An unchanged batch stays in place; a deck camp is unchanged while it stays at the same point on her.
    const moved = (r, rec) => (r.deck || rec.deck
      ? !r.deck || !rec.deck || !!r.deck.mine !== !!rec.deck.mine || r.deck.peer !== rec.deck.peer || r.deck.uid !== rec.deck.uid
        || r.deck.local.some((v, i) => Math.abs(v - rec.deck.local[i]) > 0.01)
      : r.pos.some((v, i) => Math.abs(v - rec.pos[i]) > 0.01));
    for (const c of camps.filter((x) => x.owner === owner)) {
      const r = fresh.find((x) => x.id === c.rec.id);
      if (!r || r.kind !== c.rec.kind || moved(r, c.rec)) drop(c);
      else { c.rec.litUntil = r.litUntil; c.rec.wear = r.wear; if (!c.rec.deck) c.rec.yaw = r.yaw; fresh.splice(fresh.indexOf(r), 1); }
    }
    for (const r of fresh) stand(r, { owner });
    _owners.set(owner, { at: nowMs });
    return true;
  }
  // A cold peer fire whose owner left the room goes, so no ghost fire stays in the room memory.
  function sweepColdAbsent(alive) {
    if (!alive?.has) return 0;
    const t = now();
    let n = 0;
    for (let i = camps.length - 1; i >= 0; i--) {
      const c = camps[i];
      if (c.owner == null || alive.has(c.owner) || c.rec.kind !== CAMP_KIND.Fire || fireLit(c.rec, t)) continue;
      drop(c);
      n++;
    }
    return n;
  }
  function sweepOwners(alive, nowMs, staleMs = 0) {
    for (const [owner, o] of [..._owners]) {
      if (alive?.has?.(owner) && !(staleMs > 0 && nowMs - o.at > staleMs)) continue;
      for (let i = camps.length - 1; i >= 0; i--) if (camps[i].owner === owner) drop(camps[i]);
      _owners.delete(owner);
    }
  }

  return {
    placeItem, ride, tick, tend, batches, lights, draw, targets, hoverName, activate, openMenu, openCook, byFire, fireNear, tentNear, spendNightNear,
    restPointAt, bedrollNear, packOwnFires,
    destroyAll, dropOwn, collectPixel, offsetAll, groundMoved, snapshot, restore, wireRecords, applyOwner, sweepOwners, sweepColdAbsent,
    get camps() { return camps; }, own,
    keepCamps: (k) => { keeper = k; },
    packTent,
    usable,
  };
}
