// @ts-check
import { MobileUnit } from '../characters/mobileUnit.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { setupFoeLook } from '../characters/foeLook.js';
import { mobileBillboardSize } from './rmbFlats.js';

export const BAND_SPRITE_FAR_M = 420;
export const BAND_SPRITE_NEAR_M = 240;
export const BAND_SPRITE_FADE_RATE = 1.4;
const ALPHA_MIN = 0.02;
// Any `uConceal` mode other than 1, 2, 4, or 5 draws plain opacity in the renderer.
const PLAIN_BLEND_MODE = 3;

export function bandSpriteReach(distM) {
  if (!Number.isFinite(distM)) return 0;
  const x = (BAND_SPRITE_FAR_M - distM) / (BAND_SPRITE_FAR_M - BAND_SPRITE_NEAR_M);
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

export function stepBandAlpha(alpha, target, dt) {
  const k = 1 - Math.exp(-BAND_SPRITE_FADE_RATE * Math.max(0, dt) * 2);
  const a = alpha + (target - alpha) * k;
  return Math.abs(a - target) < 0.004 ? target : a;
}

/** @param {{ renderer: any, getTexture: (archive: number) => Promise<any>, uploadRecordFrame: (archive: number, record: number, frame: number) => void }} deps */
export function createBandSprites({ renderer, getTexture, uploadRecordFrame }) {
  const looks = new Map();
  const units = new Map();
  const drawn = [];

  function lookOf(mobileType) {
    if (looks.has(mobileType)) return looks.get(mobileType);
    const basics = ENEMY_BASICS[mobileType];
    if (!basics?.maleTexture || !getTexture) { looks.set(mobileType, null); return null; }
    const archive = basics.maleTexture;
    const p = Promise.resolve(getTexture(archive))
      .then((tex) => { looks.set(mobileType, tex ? { tex, archive, basics } : null); })
      .catch(() => { looks.set(mobileType, null); });
    looks.set(mobileType, p);
    return p;
  }

  function drop(id) {
    const r = units.get(id);
    if (r?.batch) renderer?.destroyBillboardBatch?.(r.batch);
    units.delete(id);
  }

  /**
   * @param {Array<{id: string, mobileType: number, feet: number[], distM: number}>} bands
   * @param {{ dt?: number, eye?: number[]|Float32Array|null, grow?: number, fade?: number }} [o]
   */
  function sync(bands, { dt = 0, eye = null, grow = 1, fade = 1 } = {}) {
    drawn.length = 0;
    const seen = new Set();
    for (const b of bands ?? []) {
      if (!b?.feet || !Number.isInteger(b.mobileType)) continue;
      const look = lookOf(b.mobileType);
      if (!look || typeof look.then === 'function') continue;
      seen.add(b.id);
      let r = units.get(b.id);
      if (!r || r.mobileType !== b.mobileType) {
        if (r) drop(b.id);
        r = { mobileType: b.mobileType, unit: new MobileUnit(b.mobileType, look.basics, (rec) => look.tex.getFrameCount(rec), Math.random, 'male'),
          look, batch: null, alpha: 0, yaw: 0, last: null };
        units.set(b.id, r);
      }
      const f = b.feet;
      if (r.last) {
        const dx = f[0] - r.last[0], dz = f[2] - r.last[2];
        if (dx * dx + dz * dz > 1e-4) r.yaw = Math.atan2(dx, dz);
      }
      r.last = [f[0], f[1], f[2]];
      r.alpha = stepBandAlpha(r.alpha, bandSpriteReach(b.distM) * Math.max(0, Math.min(1, fade)), dt);
      if (r.alpha < ALPHA_MIN) continue;
      const out = r.unit.update(dt, { moving: true }, r.yaw, f, eye && eye.length === 3 ? eye : f);
      const { tex, archive } = r.look;
      const rkey = `${out.record}#${out.frame}`;
      if (!renderer?.textures?.has?.(`${archive}_${rkey}`)) uploadRecordFrame?.(archive, out.record, out.frame);
      const sz = mobileBillboardSize(tex, out.record);
      const g = Math.max(1, grow || 1);
      const size = { w: (out.flip ? -sz.w : sz.w) * g, h: sz.h * g };
      if (!r.batch) {
        r.batch = setupFoeLook(renderer?.createBillboardBatch?.(archive, rkey, size, [[0, 0, 0]]) ?? null, b.mobileType);
        if (!r.batch) continue;
        r.batch.origin = [0, 0, 0];
      } else {
        r.batch.record = rkey;
        r.batch.size = size;
      }
      r.batch.origin[0] = f[0]; r.batch.origin[1] = f[1]; r.batch.origin[2] = f[2];
      r.batch.conceal = r.alpha >= 0.99 ? null : { mode: PLAIN_BLEND_MODE, alpha: r.alpha, t: 0, phase: 0 };
      drawn.push(r.batch);
    }
    for (const id of [...units.keys()]) if (!seen.has(id)) drop(id);
  }

  return {
    sync,
    batches: () => drawn,
    clear() { for (const id of [...units.keys()]) drop(id); drawn.length = 0; },
    get size() { return units.size; },
  };
}
