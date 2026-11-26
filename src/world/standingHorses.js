// @ts-check
// Town horses and the Stable's horses are drawn as 3D horses at the base of their billboards.
// The billboard draws nothing while the 3D horse is shown.
import { poseWhereSeen } from './horseView.js';
import { lensOf } from '../net/peerBodies.js';
import { ANIMALS_ARCHIVE, ANIMAL_SOUND_BY_RECORD, SOUND } from '../audio/soundClips.js';

export const STANDING_HORSES_MAX = 8;
export const STANDING_HORSE_RANGE = 60;
export const STANDING_HORSE_HOLD = 1.15;

export const isStandingHorseFlat = (archive, record) => archive === ANIMALS_ARCHIVE && ANIMAL_SOUND_BY_RECORD[record] === SOUND.AnimalHorse;

function hashOf(key) {
  let h = 0x811c9dc5;
  const s = String(key ?? '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export const standingHorseYaw = (key) => ((hashOf(key) % 3600) / 3600) * 2 * Math.PI;
export const standingHorseSeed = (key) => 1 + (hashOf(`seed:${key}`) % 65535);

/** @param {{ renderer?: any, max?: number, range?: number }} [opts] */
export function createStandingHorses({ renderer = null, max = STANDING_HORSES_MAX, range = STANDING_HORSE_RANGE } = {}) {
  /** @type {Map<any, { horse: any, rig: any, batch: any, frame: number, phase: number, out: boolean, fresh: boolean }>} */
  const stood = new Map();
  /** @type {{ key: any, feet: number[], yaw: number, look: number, batch: any, seed: number, d2: number }[]} */
  const offers = [];
  /** @type {typeof offers} */
  const live = [];
  let n = 0, rig = null, frameNo = 0, phases = 0;
  const eye = [0, 0, 0];
  const pass = { view: null, proj: null, eye, lens: 1 };
  function letGo(key, e) {
    e.rig?.release(e.horse);
    if (e.batch) e.batch.castOnly = false;
    stood.delete(key);
  }
  return {
    begin(r, eyeAt) {
      frameNo++;
      n = 0;
      if (eyeAt) { eye[0] = eyeAt[0]; eye[1] = eyeAt[1]; eye[2] = eyeAt[2]; }
      if (r !== rig) { for (const [k, e] of stood) letGo(k, e); rig = r ?? null; }
    },
    offer(key, feet, yaw, look, batch, seed = 1) {
      const o = offers[n] ??= { key: null, feet: [0, 0, 0], yaw: 0, look: 0, batch: null, seed: 1, d2: 0 };
      n++;
      o.key = key; o.feet[0] = feet[0]; o.feet[1] = feet[1]; o.feet[2] = feet[2]; o.yaw = yaw; o.look = look | 0; o.batch = batch ?? null; o.seed = seed;
      const dx = feet[0] - eye[0], dy = feet[1] - eye[1], dz = feet[2] - eye[2];
      o.d2 = (dx * dx + dy * dy + dz * dz) / (stood.has(key) ? STANDING_HORSE_HOLD * STANDING_HORSE_HOLD : 1);
    },
    end(dt, cam = null) {
      if (cam) { pass.view = cam.view; pass.proj = cam.proj; pass.lens = lensOf(cam.proj); }
      live.length = 0;
      for (let i = 0; i < n; i++) live.push(offers[i]);
      for (let i = n; i < offers.length; i++) { offers[i].key = null; offers[i].batch = null; }
      live.sort((a, b) => a.d2 - b.d2);
      let standing = 0;
      for (const o of live) {
        const want = !!rig && standing < max && o.d2 <= range * range;
        let e = stood.get(o.key);
        if (want && !e) {
          const horse = rig.horse(o.seed);
          if (horse) { e = { horse, rig, batch: o.batch, frame: 0, phase: phases++, out: false, fresh: false }; stood.set(o.key, e); }
        }
        if (!want || !e) { if (o.batch) o.batch.castOnly = false; continue; }
        if (e.batch && e.batch !== o.batch) e.batch.castOnly = false;
        e.batch = o.batch; e.frame = frameNo;
        standing++;
        if (o.batch) o.batch.castOnly = true;
        rig.step(e.horse, { feet: o.feet, yaw: o.yaw, speed: 0, dt, look: o.look, pose: false });
        e.fresh = e.out;
        e.out = poseWhereSeen(rig, e.horse, o.feet, cam ? pass : null, eye, frameNo, e.phase);
      }
      for (const [k, e] of stood) if (e.frame !== frameNo) letGo(k, e);
      return standing;
    },
    draw(canvas, { proj, view, eye: eyeAt, up = null }) {
      if (!rig) return 0;
      let drawn = 0, open = false;
      try {
        for (const e of stood.values()) {
          if (e.frame !== frameNo || e.out) continue;
          if (!open) { renderer?.beginCharacterSpriteBatch?.(); open = true; }
          if (rig.draw(e.horse, canvas, { proj, view, eye: eyeAt, up, fresh: e.fresh })) drawn++;
        }
      } finally { if (open) renderer?.flushCharacterSpriteBatch?.(); }
      return drawn;
    },
    has(key) { return stood.has(key); },
    get size() { return stood.size; },
    destroy() { for (const [k, e] of stood) letGo(k, e); n = 0; },
  };
}
