// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 5 (docs/FARM-EXPANSION.md section 6.4): THE STATIONED BEASTS DRAWN - each at its beast
// post, as its own kind's foe sprite (the enemy archive the revenant itself wears: ENEMY_BASICS' maleTexture, the same
// MobileUnit the bands and the foes stand as) at a calm idle. Seen by everyone near the farm, as the herd is.
import { MobileUnit } from '../../characters/mobileUnit.js';
import { ENEMY_BASICS } from '../../characters/enemyBasics.js';
import { setupFoeLook } from '../../characters/foeLook.js';
import { mobileBillboardSize } from '../rmbFlats.js';

/**
 * @param {any} renderer
 * @param {{ getTexture?: (a: number) => Promise<any>, uploadRecordFrame?: (a: number, r: number, f: number) => void }} assets
 */
export function createStationArt(renderer, assets = {}) {
  /** mobileType -> { tex, archive, basics } | null (no art) | Promise */
  const looks = new Map();
  /** revenantId -> its drawn state */
  const units = new Map();
  /** @type {any[]} */ let drawn = [];
  function lookOf(mobileType) {
    if (looks.has(mobileType)) return looks.get(mobileType);
    const basics = ENEMY_BASICS[mobileType];
    if (!basics?.maleTexture || !assets.getTexture) { looks.set(mobileType, null); return null; }
    const archive = basics.maleTexture;
    const p = Promise.resolve(assets.getTexture(archive)).then((tex) => { looks.set(mobileType, tex ? { tex, archive, basics } : null); }).catch(() => { looks.set(mobileType, null); });
    looks.set(mobileType, p);
    return p;
  }
  function drop(id) { const r = units.get(id); if (r?.batch) renderer.destroyBillboardBatch?.(r.batch); units.delete(id); }
  return {
    /**
     * @param {{ id: string, mobileType: number, pos: number[], post: number }[]} beasts each beast with the ground it stands on
     * @param {{ dt?: number, eye?: number[] | null }} [o]
     * @returns {{ id: string, pos: number[], h: number }[]} where each was drawn (its picture's height), for picking
     */
    update(beasts, { dt = 0, eye = null } = {}) {
      drawn = []; const seen = new Set(), spots = [];
      for (const b of beasts ?? []) {
        const look = lookOf(b.mobileType);
        if (!look || typeof look.then === 'function') continue;   // loading, or no art for this kind
        try {
          seen.add(b.id);
          let r = units.get(b.id);
          if (!r || r.mobileType !== b.mobileType) {
            if (r) drop(b.id);
            r = { mobileType: b.mobileType, unit: new MobileUnit(b.mobileType, look.basics, (rec) => look.tex.getFrameCount(rec), Math.random, 'male'), look, batch: null };
            units.set(b.id, r);
          }
          const f = [b.pos[0], b.pos[1] + .02, b.pos[2]], yaw = b.post * 1.3 + .4;   // lying where it was chained, turned a little differently each
          const out = r.unit.update(dt, { moving: false }, yaw, f, eye && eye.length === 3 ? eye : f);
          const { tex, archive } = look, rkey = `${out.record}#${out.frame}`;
          if (!renderer?.textures?.has?.(`${archive}_${rkey}`)) assets.uploadRecordFrame?.(archive, out.record, out.frame);
          const sz = mobileBillboardSize(tex, out.record), size = { w: out.flip ? -sz.w : sz.w, h: sz.h };
          if (!r.batch) {
            r.batch = setupFoeLook(renderer?.createBillboardBatch?.(archive, rkey, size, [[0, 0, 0]]) ?? null, b.mobileType);
            if (!r.batch) continue;
            r.batch.origin = [0, 0, 0];
          } else { r.batch.record = rkey; r.batch.size = size; }
          r.batch.origin[0] = f[0]; r.batch.origin[1] = f[1]; r.batch.origin[2] = f[2];
          drawn.push(r.batch); spots.push({ id: b.id, pos: f, h: sz.h });
        } catch { looks.set(b.mobileType, null); drop(b.id); seen.delete(b.id); }   // art that will not load is no beast's failure: it is simply not drawn
      }
      for (const id of [...units.keys()]) if (!seen.has(id)) drop(id);
      return spots;
    },
    /** @param {number[]} right @param {number[]} up */
    draw(right, up) { if (drawn.length) renderer.drawBillboards(drawn, right, up); },
    dispose() { for (const id of [...units.keys()]) drop(id); drawn = []; },
  };
}
