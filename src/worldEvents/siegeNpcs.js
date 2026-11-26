// @ts-check
// Display only: nothing here is sent. These fighters stay out of `foes`, and the server referees every hit on them.
import { SIEGE_NPC } from '../net/siegeRef.js';
import { siegeNpcShown } from '../net/siegeLink.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobileTypes.js';
import { stateAnims, HURT_ANIMS, HURT_ANIM_SPEED, PRIMARY_ATTACK_ANIM_SPEED } from '../characters/mobileUnit.js';
import { mobileBillboardSize } from '../world/rmbFlats.js';
import { bossFrame } from '../world/gateBoss.js';
import { createPopulationLane } from '../characters/npcBodies.js'; import { rosterLook } from '../characters/foeBodies.js'; import { rosterActor } from '../characters/rosterBodies.js';

export const SIEGE_NPC_LOOKS = Object.freeze({
  guard: Object.freeze({ mobiles: Object.freeze([KNIGHT_CITY_WATCH]), name: 'Town Guard', scale: 1 }),
  rebel: Object.freeze({ mobiles: Object.freeze([136, 143, 138]), name: 'Rebel', scale: 1 }),
  captain: Object.freeze({ mobiles: Object.freeze([144]), name: 'Rebel Captain', scale: 1.2 }),
});
export function siegeNpcLook(n) {
  const L = SIEGE_NPC_LOOKS[n?.kind] ?? SIEGE_NPC_LOOKS.rebel;
  const i = Math.max(0, Number(String(n?.id ?? 'n0').slice(1)) || 0);
  return { mobile: L.mobiles[i % L.mobiles.length], name: L.name, scale: L.scale };
}
export const SIEGE_NPC_BODY = Object.freeze({ radius: 0.45, height: 1.8 });
export const SIEGE_NPC_FLINCH_MS = 350;
export const SIEGE_NPC_FALL_MS = 900;
export const SIEGE_NPC_STRIKE_MS = 600;

/**
 * @param {any} n
 * @param {number} now
 * @param {{ mobile: number }} look
 */
export function siegeNpcAct(n, now, look) {
  const tab = (state) => stateAnims(state, look.mobile, !!ENEMY_BASICS[look.mobile]?.hasIdle, false, false, true, false);
  if (n.down) {
    const since = now - n.at;
    if (since >= SIEGE_NPC_FALL_MS || since < 0) return { act: 'gone', anims: HURT_ANIMS, frame: 0, loop: false };
    return { act: 'fall', anims: HURT_ANIMS, frame: Math.floor((since / SIEGE_NPC_FALL_MS) * 4), loop: false };
  }
  const K = SIEGE_NPC[n.kind];
  if (n.atk > 0 && K) {
    const start = n.atk - K.windupMs;
    if (now >= start && now < n.atk) return { act: 'windup', anims: tab('attack'), frame: now - start >= K.windupMs / 2 ? 1 : 0, loop: false };
    if (now >= n.atk && now - n.atk < SIEGE_NPC_STRIKE_MS) return { act: 'strike', anims: tab('attack'), frame: 2 + Math.floor(((now - n.atk) / 1000) * PRIMARY_ATTACK_ANIM_SPEED), loop: false };
  }
  if (now - n.hurtAt >= 0 && now - n.hurtAt < SIEGE_NPC_FLINCH_MS) return { act: 'flinch', anims: tab('hurt'), frame: Math.floor(((now - n.hurtAt) / 1000) * HURT_ANIM_SPEED), loop: false };
  const [x, z] = siegeNpcShown(n, now);
  if (Math.hypot(n.tx - x, n.tz - z) > 1) { const t = tab('move'); return { act: 'walk', anims: t, frame: Math.floor((now / 1000) * t[0].fps), loop: true }; }
  const t = tab('idle');
  return { act: 'idle', anims: t, frame: Math.floor((now / 1000) * t[0].fps), loop: true };
}

/** @param {{ renderer?: any, getTexture?: ((archive: number) => Promise<any>)|null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void)|null, audio?: any, cam?: () => number[]|null, toScene?: (x: number, z: number) => number[]|null, wantBodies?: () => boolean, makeBodies?: (() => any)|null }} deps */
export function createSiegeNpcs({ renderer = null, getTexture = null, uploadRecordFrame = null, audio = null, cam = () => null, toScene = () => null, wantBodies = undefined, makeBodies = null } = {}) {
  const bodiesLane = createPopulationLane({ laneName: 'siege', renderer, ...(wantBodies ? { want: wantBodies } : {}), make: makeBodies });
  const bodies = new Map(), textures = new Map();
  const idSeed = (id) => [...String(id)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);
  const _targets = [], _batches = [], _live = new Set();
  function texture(mobile) {
    const archive = ENEMY_BASICS[mobile]?.maleTexture;
    if (!archive || !getTexture) return null;
    const had = textures.get(archive);
    if (had && !(had instanceof Promise)) return had.failed ? null : had;
    if (!had) {
      const p = Promise.resolve().then(() => getTexture(archive)).then(
        (tex) => { textures.set(archive, tex ? { tex, archive } : { failed: true }); },
        (e) => { textures.set(archive, { failed: true }); console.warn('[siege] a sprite', e?.message ?? e); });
      textures.set(archive, p);
    }
    return null;
  }
  function play(clip, p, volume = 1) {
    if (!audio || !p || clip == null) return;
    try { audio.play3d?.(clip, p, volume, { maxDistance: 40, distanceModel: 'linear' }); } catch { }
  }
  function destroyBatch(b) { if (b?.batch) { renderer?.destroyBillboardBatch?.(b.batch); b.batch = null; } }
  function draw(b, act, feet, yaw) {
    b.act = act.act;
    const T = texture(b.look.mobile);
    if (!T || !renderer?.createBillboardBatch || act.act === 'gone') { b.shown = false; return; }
    const fr = bossFrame(/** @type {any} */ (act), yaw, feet, cam() ?? feet, (rec) => T.tex.getFrameCount?.(rec) ?? 1);
    const rkey = `${fr.record}#${fr.frame}`;
    if (!renderer.textures?.has?.(`${T.archive}_${rkey}`)) uploadRecordFrame?.(T.archive, fr.record, fr.frame);
    const sz = mobileBillboardSize(T.tex, fr.record), w = sz.w * b.look.scale, h = sz.h * b.look.scale;
    if (!b.batch) { b.batch = renderer.createBillboardBatch(T.archive, rkey, { w, h }, [[0, 0, 0]]); b.batch.origin = [0, 0, 0]; }
    b.shown = true;
    b.batch.record = rkey;
    b.batch.size = { w: fr.flip ? -w : w, h };
    if (b.batch.bounds) b.batch.bounds[3] = Math.hypot(w, h) * 0.5;
    b.batch.origin[0] = feet[0]; b.batch.origin[1] = feet[1]; b.batch.origin[2] = feet[2];
  }
  function clear() { for (const b of bodies.values()) destroyBatch(b); bodies.clear(); _targets.length = 0; _batches.length = 0; }
  return {
    frame(npcs, now) {
      _targets.length = 0; _batches.length = 0; _live.clear();
      for (const n of npcs ?? []) {
        _live.add(n.id);
        let b = bodies.get(n.id);
        if (!b || b.kind !== n.kind) { destroyBatch(b); b = { id: n.id, seed: idSeed(n.id), kind: n.kind, look: siegeNpcLook(n), batch: null, shown: false, atk: n.atk, hurtAt: n.hurtAt, down: n.down, yaw: 0 }; bodies.set(n.id, b); }
        const [x, z] = siegeNpcShown(n, now);
        const feet = toScene(x, z);
        if (!feet) { b.shown = false; continue; }
        const E = ENEMY_BASICS[b.look.mobile];
        if (n.atk && n.atk !== b.atk) play(E?.attackSound, feet);
        // The City Watch bark is the "Halt!" line, so a hurt Town Guard plays its move sound instead.
        if (n.hurtAt !== b.hurtAt && Number.isFinite(n.hurtAt)) play(b.look.mobile === KNIGHT_CITY_WATCH ? E?.moveSound : E?.barkSound, feet, 0.8);
        // Clip 15 is `SOUND.BodyFall` in audio/soundClips.js.
        if (n.down && !b.down) play(15, feet);
        b.atk = n.atk; b.hurtAt = n.hurtAt; b.down = n.down;
        if (Math.hypot(n.tx - x, n.tz - z) > 1) b.yaw = Math.atan2(n.tx - x, n.tz - z);
        else { const c = cam(); if (c) { const to = Math.atan2(c[0] - feet[0], c[2] - feet[2]); b.yaw = to; } }
        const act = siegeNpcAct(n, now, b.look);
        draw(b, act, feet, b.yaw);
        if (b.shown && b.batch) _batches.push(b.batch);
        if (!n.down) {
          const T = (b.target ??= { id: n.id, feet: [0, 0, 0], height: SIEGE_NPC_BODY.height * b.look.scale, radius: SIEGE_NPC_BODY.radius, name: b.look.name });
          T.feet[0] = feet[0]; T.feet[1] = feet[1]; T.feet[2] = feet[2];
          _targets.push(T);
        }
      }
      for (const [id, b] of bodies) if (!_live.has(id)) { destroyBatch(b); bodies.delete(id); }
    },
    targets: () => _targets,
    body: (id) => _targets.find((t) => t.id === id) ?? null,
    batches: () => _batches,
    drawBodies(canvas, proj, view, eye, dt) {
      bodiesLane.frame();
      for (const b of bodies.values()) {
        if (!b.shown || !b.batch) continue;
        const look = rosterLook(b, { mobileType: b.look.mobile, gender: 'male', seed: b.seed });
        if (!look) continue;
        bodiesLane.offer(rosterActor(b, { id: b.id, look, feet: b.batch.origin, yaw: b.yaw, moving: b.act === 'walk', swingKey: b.down || !(b.atk > 0) ? null : b.atk, hitKey: b.down ? null : b.hurtAt,
          dead: b.down ? 1 + (b.seed % 3) : 0, scale: b.look.scale }), b.batch);
      }
      bodiesLane.draw(canvas, proj, view, eye, dt);
    },
    offsetBodies(o) { bodiesLane.offsetAll(o); },
    leave() { clear(); bodiesLane.destroy(); },
    state: () => ({ bodies: [...bodies.keys()], shown: _batches.length, targets: _targets.length }),
  };
}
