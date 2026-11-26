import { GLOBAL_SCALE, pickFoeHit, RAY_DISTANCE, DEFAULT_ACTIVATION_DISTANCE } from '../player/activate.js';
import { templateByIndex } from './itemTemplates.js';
import { TEMPLATES } from './useItem.js';
import { adoptLight } from '../render/lightId.js';
import { applySpell, renewRounds } from '../magic/effects.js';
import { calculateSuccessfulHit, calculateStruckBodyPart } from '../combat/formulas.js';
import { liveStat } from '../characters/statMods.js';
import { worldMinutes } from '../world/worldTick.js';
import { FlatAnim } from '../render/flatAnimation.js';
import { toColor32 } from '../formats/color32Order.js';
import { decodePng } from '../render/textureReplacement.js';
import { torchRange } from '../player/playerTorch.js';
import {
  DROPPED_ARCHIVE, DROPPED_RECORD, CLIPS, MESSAGES, SECONDS_PER_CONDITION, THROW_HAND_OFFSET, FREE_HAND, rotateAboutAxis, readTorchSettings,
  vendoredTexture,
} from './handheldTorches.js';

export const ENEMY_LIGHT_EFFECT_KEY = 'HandheldTorchesEnemyLight';
export const ENEMY_FIRE_KIND = 'handheldTorchFire';
export const PUFF = Object.freeze({ archive: 375, record: 0, fps: 15 });
export const ENEMY_LIGHT_LOCAL = Object.freeze({ back: 0.4, up: 0.6 });
export const PICKUP_REACH = 3.2;
export const PROJECTILE_FIXED_DT = 0.02;
export const PROJECTILE = Object.freeze({ gravityAccel: -9.81, restFraction: 0.2, spinRate: 20, restRaise: 0.016, audioGap: 0.2, baseSpeed: 25 });
export const WATER_HEAD = 1.25;
export const LIGHT_ABOVE_BILLBOARD = 0.5;

// The torch's record is 0, so lookups here are tested with == null, never for truthiness.
const RECORD_FOR = Object.freeze({ [TEMPLATES.Torch]: DROPPED_RECORD.Torch, [TEMPLATES.Candle]: DROPPED_RECORD.Candle, [TEMPLATES.Holy_candle]: DROPPED_RECORD.HolyCandle });
const GROUP_FOR = Object.freeze({ [TEMPLATES.Torch]: 'UselessItems2', [TEMPLATES.Candle]: 'UselessItems2', [TEMPLATES.Holy_candle]: 'ReligiousItems' });
export const droppedTextureUrl = (record, frame, emission = false) =>
  new URL(`../../vendor/handheld-torches/Textures/${DROPPED_ARCHIVE}_${record}-${frame}${emission ? '_Emission' : ''}.png`, import.meta.url).href;

export function createDroppedTorches({
  renderer, audio = null, getTexture = null, uploadRecordFrame = null, collider = () => null, foes = () => [], foeSinks = null, makeEnemiesHostile = null,
  entity = null, camera = () => null, inside = () => true, waterLevel = () => null, pixelKeyAt = () => null,
  settings = readTorchSettings, rolls = Math.random, say = () => {}, loadTexture = defaultLoadTexture,
  onPickedUp = null,
} = {}) {
  const dropped = [];
  const projectiles = [];
  const flames = new Map();
  let _nextId = 0;
  let _lastMinutes = null;
  let _time = 0;
  const frames = new Map();
  const framesLoading = new Map();

  function ensureRecord(record) {
    if (frames.has(record)) return frames.get(record);
    if (!framesLoading.has(record)) {
      framesLoading.set(record, (async () => {
        let count = 0, size = null;
        // An upload that throws leaves an empty record, so the pool runs without sprites instead of rejecting.
        try {
          for (let f = 0; f < 16; f++) {
            const img = await loadTexture(record, f).catch(() => null);
            if (!img) break;
            renderer?.uploadTexture?.(DROPPED_ARCHIVE, `${record}#${f}`, img);
            if (record < DROPPED_RECORD.DousedOffset) renderer?.uploadEmissionTexture?.(DROPPED_ARCHIVE, `${record}#${f}`, img, { white: true });
            size ??= { w: img.width * GLOBAL_SCALE, h: img.height * GLOBAL_SCALE };
            count++;
          }
        } catch (e) {
          console.warn('[dropped torches] the sprites would not load', e);
        }
        const entry = { count, size };
        frames.set(record, entry);
        return entry;
      })());
    }
    return null;
  }
  const s = () => settings();
  const scale = () => (s().scaleTextureFactor || 1);

  function mount(d) {
    const ready = ensureRecord(d.record);
    const build = (entry) => {
      if (d.dead || !entry?.count || !renderer?.createBillboardBatch) return;
      d.size = { w: entry.size.w / scale() * (d.mirrored ? -1 : 1), h: entry.size.h / scale() };
      d.batch = renderer.createBillboardBatch(DROPPED_ARCHIVE, d.record, d.size, [d.pos]);
      d.batch.frame = 0;
      d.anim = entry.count > 1 ? new FlatAnim(DROPPED_ARCHIVE, entry.count, false) : null;
    };
    if (ready) build(ready); else framesLoading.get(d.record).then(build).catch(() => {});
  }
  function unmount(d) {
    if (d.batch) { renderer?.destroyBillboardBatch?.(d.batch); d.batch = null; }
    if (d.loop) { d.loop.stop?.(); d.loop = null; }
  }

  function recordAt(template, pos) {
    let record = RECORD_FOR[template];
    if (record == null) return null;
    const wl = waterLevel?.();
    if (inside?.() && Number.isFinite(wl) && wl !== 10000 && pos[1] + WATER_HEAD < -wl * GLOBAL_SCALE) record += DROPPED_RECORD.DousedOffset;
    return record;
  }
  const lit = (d) => d.record < DROPPED_RECORD.DousedOffset;

  function spawnLightSource(template, pos, time) {
    const record = recordAt(template, pos);
    if (record == null) return null;
    const d = { id: ++_nextId, template, record, pos: [pos[0], pos[1], pos[2]], time, batch: null, anim: null, size: null, loop: null,
      mirrored: rolls() > 0.5, pixelKey: inside?.() ? null : (pixelKeyAt?.(pos) ?? null), dead: false };
    // The first light into an empty pool starts the burn clock, so hours with no lights burn nothing.
    if (!dropped.length) _lastMinutes = worldMinutes();
    dropped.push(d);
    mount(d);
    if (lit(d) && template === TEMPLATES.Torch) d.loop = audio?.loop3d?.(CLIPS.burning, d.pos, s().sfxVolume, { maxDistance: 5, distanceModel: 'linear' }) ?? null;
    return d;
  }

  function spawnLightSourceProjectile(template, time, pos, dir, strength, freeHand = FREE_HAND.Right) {
    const cam = camera?.() ?? {};
    const right = cam.right ?? [Math.cos(cam.yaw || 0), 0, -Math.sin(cam.yaw || 0)];
    const up = cam.up ?? [0, 1, 0];
    const side = freeHand === FREE_HAND.Right ? THROW_HAND_OFFSET : -THROW_HAND_OFFSET;
    const at = [pos[0] + right[0] * side, pos[1] + right[1] * side, pos[2] + right[2] * side];
    const record = recordAt(template, at);
    if (record == null) return null;
    const st = s();
    const range = () => st.throwSpread * (rolls() * 2 - 1);
    let d0 = rotateAboutAxis(dir, right, -st.throwAngle + range());
    d0 = rotateAboutAxis(d0, up, range());
    const speedStart = PROJECTILE.baseSpeed * (liveStat(entity, 'strength') / 100) * st.throwStrength * strength;
    const p = { template, time, record, pos: at, dirStart: d0, speedStart, speedCurrent: speedStart, gravityDrag: 0.05 * st.throwGravity,
      bounce: st.throwBounce, gravity: [0, 0, 0], batch: null, size: null, base: null, lastAudio: -Infinity, dead: false, acc: 0, loop: null };
    projectiles.push(p);
    const ready = ensureRecord(record);
    const build = (entry) => {
      if (p.dead || !entry?.count) return;
      p.base = { w: entry.size.w / scale(), h: entry.size.h / scale() };
      p.size = { ...p.base };
      // Built once about the origin: flight and spin move it through origin and size, so no step rebuilds it.
      p.batch = renderer?.createBillboardBatch?.(DROPPED_ARCHIVE, record, p.size, [[0, 0, 0]]) ?? null;
      if (p.batch) { p.batch.frame = 0; p.batch.origin = flightBase(p); }
      p.anim = entry.count > 1 ? new FlatAnim(DROPPED_ARCHIVE, entry.count, false) : null;
    };
    if (ready) build(ready); else framesLoading.get(record).then(build).catch(() => {});
    if (lit({ record }) && template === TEMPLATES.Torch) p.loop = audio?.loop3d?.(CLIPS.burning, p.pos, st.sfxVolume, { maxDistance: 5, distanceModel: 'linear' }) ?? null;
    return p;
  }

  // The thrown quad is centered on the flight point, so its base sits half a height below it.
  const flightBase = (p) => [p.pos[0], p.pos[1] - Math.abs(p.base?.h ?? 0) / 2, p.pos[2]];

  function stepProjectile(p) {
    p.gravity = [p.gravity[0], p.gravity[1] + PROJECTILE.gravityAccel * p.gravityDrag * PROJECTILE_FIXED_DT, p.gravity[2]];
    const step = [p.dirStart[0] * p.speedCurrent * PROJECTILE_FIXED_DT + p.gravity[0], p.dirStart[1] * p.speedCurrent * PROJECTILE_FIXED_DT + p.gravity[1], p.dirStart[2] * p.speedCurrent * PROJECTILE_FIXED_DT + p.gravity[2]];
    if (p.base) p.size = { w: p.base.w * Math.sin(_time * PROJECTILE.spinRate), h: p.base.h };
    const len = Math.hypot(step[0], step[1], step[2]);
    if (!(len > 0)) return;
    const dir = [step[0] / len, step[1] / len, step[2] / len];
    const col = collider?.();
    const wall = col?.raycastHit ? col.raycastHit(p.pos, dir, len) : { dist: col?.raycast?.(p.pos, dir, len) ?? Infinity, normal: null };
    const wallD = Number.isFinite(wall?.dist) ? wall.dist : Infinity;
    const foe = pickFoeHit(p.pos, dir, foes?.() ?? [], col, len);
    if (foe && foe.distance <= wallD) {
      const f = foe.foe;
      const point = [p.pos[0] + dir[0] * foe.distance, p.pos[1] + dir[1] * foe.distance, p.pos[2] + dir[2] * foe.distance];
      if (s().fire && f?.entity) {
        if (f.ai && f.ai.isHostile === false) makeEnemiesHostile?.();
        f.ai?.makeEnemyHostileToAttacker?.(entity, camera?.()?.feet ?? null);
        const hit = calculateSuccessfulHit(entity, f.entity, s().fireAccuracy, calculateStruckBodyPart(rolls()), rolls);
        if (hit) igniteFoe(f);
        audio?.play3d?.(CLIPS.ignite, point, 1);
      }
      retireProjectile(p);
      return;
    }
    if (Number.isFinite(wallD)) {
      const point = [p.pos[0] + dir[0] * wallD, p.pos[1] + dir[1] * wallD, p.pos[2] + dir[2] * wallD];
      if (p.speedCurrent < p.speedStart * PROJECTILE.restFraction) {
        spawnLightSource(p.template, point, p.time);
        if (_time - p.lastAudio > PROJECTILE.audioGap) { audio?.play3d?.(CLIPS.drop, point, 1); p.lastAudio = _time; }
        retireProjectile(p);
        return;
      }
      const n = wall.normal ?? [0, 1, 0];
      const v = [p.dirStart[0], p.gravity[1], p.dirStart[2]];
      const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
      p.dirStart = [v[0] - 2 * vn * n[0], v[1] - 2 * vn * n[1], v[2] - 2 * vn * n[2]];
      p.speedCurrent *= p.bounce;
      p.gravity = [0, 0, 0];
      if (_time - p.lastAudio > PROJECTILE.audioGap) { audio?.play3d?.(CLIPS.drop, point, 1); p.lastAudio = _time; }
      const h = (p.base?.h ?? 0) / GLOBAL_SCALE;
      const k = h * PROJECTILE.restRaise / scale();
      p.pos = [point[0] + n[0] * k, point[1] + n[1] * k, point[2] + n[2] * k];
    } else {
      p.pos = [p.pos[0] + step[0], p.pos[1] + step[1], p.pos[2] + step[2]];
    }
    if (p.batch) { p.batch.origin = flightBase(p); p.batch.size = p.size; }
    p.loop?.move?.(p.pos);
  }
  function retireProjectile(p) {
    p.dead = true;
    if (p.batch) { renderer?.destroyBillboardBatch?.(p.batch); p.batch = null; }
    p.loop?.stop?.(); p.loop = null;
    const i = projectiles.indexOf(p);
    if (i >= 0) projectiles.splice(i, 1);
  }

  function igniteFoe(f) {
    const st = s();
    const e = {
      type: 1, subType: 0, key: 'ContinuousDamage-Health',
      durationBase: st.fireDuration, durationMod: 0, durationPerLevel: 1,
      chanceBase: st.fireChance, chanceMod: 0, chancePerLevel: 1,
      magnitudeBaseLow: st.fireDamageRange[0], magnitudeBaseHigh: st.fireDamageRange[1], magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
    };
    const level = f.entity.level ?? 1;
    const sinks = foeSinks?.(f) ?? { hurt: (n) => { f.entity.health = Math.max(0, (f.entity.health ?? 0) - n); } };
    // Continuous Damage-Health has no chance roll, so the fire takes on every landed hit, as in the mod.
    applySpell({ effects: [e], element: 0, rangeType: 0 }, level, f.entity, sinks, rolls, { entity: f.entity });
    if (st.fireLight) {
      const list = (f.entity.activeEffects ??= []);
      const inc = list.find((a) => a.kind === ENEMY_FIRE_KIND);
      // A re-hit renews the light effect's rounds and never stacks them.
      if (inc) renewRounds(inc, st.fireDuration);
      else list.push({ kind: ENEMY_FIRE_KIND, key: ENEMY_LIGHT_EFFECT_KEY, roundsRemaining: st.fireDuration });
    }
  }
  const foeBurning = (f) => !!f?.entity?.activeEffects?.some((a) => a.kind === ENEMY_FIRE_KIND && a.roundsRemaining > 0);
  function foeLightPos(f) {
    const feet = f.ai?.feet;
    if (!feet) return null;
    const yaw = f.ai?.yaw ?? 0;
    return [feet[0] - Math.sin(yaw) * ENEMY_LIGHT_LOCAL.back, feet[1] + ENEMY_LIGHT_LOCAL.up, feet[2] - Math.cos(yaw) * ENEMY_LIGHT_LOCAL.back];
  }
  function tickFlames(dt) {
    const live = foes?.() ?? [];
    for (const f of live) {
      const burning = !f.dead && foeBurning(f);
      const fl = flames.get(f);
      if (burning && !fl) {
        const entry = { batch: null, anim: null, pos: foeLightPos(f) ?? [0, 0, 0], size: null };
        flames.set(f, entry);
        getTexture?.(PUFF.archive)?.then((t) => {
          if (!flames.has(f) || !t) return;
          const count = t.getFrameCount?.(PUFF.record) ?? 1;
          for (let i = 0; i < count; i++) uploadRecordFrame?.(PUFF.archive, PUFF.record, i);
          const size = t.getSize(PUFF.record);
          entry.size = { w: size.width * GLOBAL_SCALE, h: -size.height * GLOBAL_SCALE };
          entry.batch = renderer.createBillboardBatch(PUFF.archive, PUFF.record, entry.size, [[0, 0, 0]]);
          entry.batch.frame = 0;
          entry.batch.origin = entry.pos;
          entry.anim = count > 1 ? new FlatAnim(PUFF.archive, count, false, PUFF.fps) : null;
        }).catch(() => {});
      } else if (!burning && fl) {
        if (fl.batch) renderer?.destroyBillboardBatch?.(fl.batch);
        flames.delete(f);
      } else if (burning && fl?.batch) {
        const at = foeLightPos(f);
        if (at) { fl.pos = at; fl.batch.origin = at; }
        if (fl.anim) fl.batch.frame = fl.anim.tick(dt);
      }
    }
    for (const [f, fl] of [...flames]) if (!live.includes(f)) { if (fl.batch) renderer?.destroyBillboardBatch?.(fl.batch); flames.delete(f); }
  }

  function tick(dt) {
    _time += dt;
    const now = worldMinutes();
    // Lights burn world seconds over 12, so a rest ages them; loads and transitions re-latch the clock instead.
    const burn = _lastMinutes == null ? 0 : Math.max(0, (now - _lastMinutes) * 60 / 12);
    _lastMinutes = now;
    for (let i = dropped.length - 1; i >= 0; i--) {
      const d = dropped[i];
      d.time -= burn;
      if (d.time <= 0) { d.template = 0; d.dead = true; unmount(d); dropped.splice(i, 1); continue; }
      if (d.batch && d.anim) d.batch.frame = d.anim.tick(dt);
    }
    for (const p of [...projectiles]) {
      p.acc += dt;
      while (p.acc >= PROJECTILE_FIXED_DT && !p.dead) { p.acc -= PROJECTILE_FIXED_DT; stepProjectile(p); }
      if (!p.dead && p.batch && p.anim) p.batch.frame = p.anim.tick(dt);
    }
    tickFlames(dt);
  }

  function lights() {
    const out = [];
    for (const d of dropped) {
      if (!lit(d)) continue;
      const t = templateByIndex(d.template);
      const full = (t?.hitPoints ?? 1) * SECONDS_PER_CONDITION;
      // The mod scales this range by PlayerTorchLightScale; the game keeps that brightness setting inert.
      out.push(adoptLight({ x: d.pos[0], y: d.pos[1] + Math.abs(d.size?.h ?? 0) / 2 + LIGHT_ABOVE_BILLBOARD, z: d.pos[2], range: 1 + (t?.capacityOrTarget ?? 0) * (d.time / full) }, d));
    }
    for (const p of projectiles) if (lit(p)) out.push(adoptLight({ x: p.pos[0], y: p.pos[1] + LIGHT_ABOVE_BILLBOARD, z: p.pos[2], range: templateByIndex(p.template)?.capacityOrTarget ?? 0 }, p));
    const playerRange = entity?.lightSource ? torchRange(entity.lightSource) : (templateByIndex(TEMPLATES.Torch)?.capacityOrTarget ?? 14);
    for (const [f, fl] of flames) if (!f.dead) out.push(adoptLight({ x: fl.pos[0], y: fl.pos[1], z: fl.pos[2], range: playerRange }, fl));
    return out;
  }
  const batches = () => [...dropped.map((d) => d.batch), ...projectiles.map((p) => p.batch), ...[...flames.values()].map((fl) => fl.batch)].filter(Boolean);

  function targets() {
    return dropped.filter((d) => d.batch).map((d) => ({
      key: `droppedTorch:${d.id}`,
      aabb: { min: [d.pos[0] - 0.4, d.pos[1], d.pos[2] - 0.4], max: [d.pos[0] + 0.4, d.pos[1] + Math.abs(d.size?.h ?? 0.8), d.pos[2] + 0.4] },
      distance: RAY_DISTANCE, reach: PICKUP_REACH,
    }));
  }
  const forKey = (key) => dropped.find((d) => `droppedTorch:${d.id}` === key) ?? null;
  function hoverName(key) {
    const d = forKey(key);
    if (!d) return null;
    const t = templateByIndex(d.template)?.name;
    return t ? { title: t } : null;
  }
  function activate(key, mode) {
    const d = forKey(key);
    if (!d) return false;
    if (mode === 'grab' || mode === 'steal') { pickupLightSource(d); return true; }
    if (mode === 'info' || mode === 'dialogue') { say(MESSAGES.examine + (templateByIndex(d.template)?.name ?? '').toLowerCase()); return true; }
    return false;
  }
  function pickupLightSource(d) {
    const item = { group: GROUP_FOR[d.template], templateIndex: d.template };
    const t = templateByIndex(d.template);
    item.maxCondition = t?.hitPoints ?? 0;
    item.currentCondition = Math.ceil(d.time / SECONDS_PER_CONDITION);
    d.template = 0; d.dead = true; unmount(d);
    const i = dropped.indexOf(d);
    if (i >= 0) dropped.splice(i, 1);
    onPickedUp?.(item);
    return item;
  }

  function destroyAll() {
    _lastMinutes = worldMinutes();
    for (const d of dropped) unmount(d);
    dropped.length = 0;
    for (const p of [...projectiles]) retireProjectile(p);
    for (const [, fl] of flames) if (fl.batch) renderer?.destroyBillboardBatch?.(fl.batch);
    flames.clear();
  }
  function collectPixel(key) {
    for (let i = dropped.length - 1; i >= 0; i--) if (dropped[i].pixelKey === key) { unmount(dropped[i]); dropped[i].dead = true; dropped.splice(i, 1); }
  }
  function offsetAll(offset) {
    const [dx, dy, dz] = offset;
    for (const d of dropped) {
      d.pos[0] += dx; d.pos[1] += dy; d.pos[2] += dz;
      if (d.batch) { renderer.destroyBillboardBatch(d.batch); d.batch = renderer.createBillboardBatch(DROPPED_ARCHIVE, d.record, d.size, [d.pos]); d.batch.frame = d.anim?.frame ?? 0; }
      d.loop?.move?.(d.pos);
    }
    for (const p of projectiles) {
      p.pos = [p.pos[0] + dx, p.pos[1] + dy, p.pos[2] + dz];
      if (p.batch) p.batch.origin = flightBase(p);
      p.loop?.move?.(p.pos);
    }
    for (const [, fl] of flames) {
      fl.pos = [fl.pos[0] + dx, fl.pos[1] + dy, fl.pos[2] + dz];
      if (fl.batch) fl.batch.origin = fl.pos;
    }
  }
  function groundMoved(x0, z0, x1, z1, dy) {
    for (const d of dropped) {
      if (!(d.pos[0] >= x0 && d.pos[0] < x1 && d.pos[2] >= z0 && d.pos[2] < z1)) continue;
      const m = dy(d.pos[0], d.pos[2]);
      if (!m) continue;
      d.pos[1] += m;
      if (d.batch) { renderer.destroyBillboardBatch(d.batch); d.batch = renderer.createBillboardBatch(DROPPED_ARCHIVE, d.record, d.size, [d.pos]); d.batch.frame = d.anim?.frame ?? 0; }
      d.loop?.move?.(d.pos);
    }
  }
  const snapshot = (toWorld = (p) => p) => dropped.filter((d) => d.template).map((d) => { const p = toWorld(d.pos); return { position: [p[0], p[1], p[2]], time: d.time, itemTemplateIndex: d.template }; });
  function restore(list, fromWorld = (p) => p) {
    destroyAll();
    _lastMinutes = worldMinutes();
    for (const r of list ?? []) {
      if (!r || RECORD_FOR[r.itemTemplateIndex] == null || !(r.time > 0)) continue;
      const p = fromWorld(r.position);
      spawnLightSource(r.itemTemplateIndex, [p[0], p[1], p[2]], r.time);
    }
  }

  return {
    spawnLightSource, spawnLightSourceProjectile, tick, lights, batches, targets, hoverName, activate, destroyAll, collectPixel, offsetAll, groundMoved, snapshot, restore,
    igniteFoe, foeBurning,
    get dropped() { return dropped; }, get projectiles() { return projectiles; },
    setOnPickedUp(fn) { onPickedUp = typeof fn === 'function' ? fn : null; },
  };
}

async function defaultLoadTexture(record, frame) {
  if (!vendoredTexture(`${DROPPED_ARCHIVE}_${record}-${frame}.png`)) return null;
  const res = await fetch(droppedTextureUrl(record, frame));
  if (!res.ok) return null;
  return toColor32(await decodePng(new Uint8Array(await res.arrayBuffer())));
}
