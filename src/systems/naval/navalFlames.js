// @ts-check
import { FIRE_FLAT } from '../survival/camp.js';
import { FlatAnim } from '../../render/flatAnimation.js';
import { GLOBAL_SCALE } from '../../player/activate.js';

export const FLAME_SCALE = 1.8;

/**
 * @param {{ renderer: any, getTexture?: ((archive: number) => any) | null, uploadRecordFrame?: ((archive: number, record: number, frame: number) => void) | null }} deps
 */
export function createNavalFlames({ renderer, getTexture = null, uploadRecordFrame = null }) {
  /** @type {Set<{ pos: number[], batch: any, anim: any, dead: boolean, hidden?: boolean }>} */
  const live = new Set();
  /** @type {{ count: number, size: { w: number, h: number } } | null} */
  let art = null;
  /** @type {Promise<void> | null} */
  let loading = null;

  function ensureArt() {
    if (art || loading || !getTexture) return;
    loading = Promise.resolve(getTexture(FIRE_FLAT.archive)).then((t) => {
      if (!t) return;
      const count = t.getFrameCount?.(FIRE_FLAT.record) ?? 1;
      for (let i = 0; i < count; i++) uploadRecordFrame?.(FIRE_FLAT.archive, FIRE_FLAT.record, i);
      const size = t.getSize(FIRE_FLAT.record);
      art = { count, size: { w: size.width * GLOBAL_SCALE * FLAME_SCALE, h: size.height * GLOBAL_SCALE * FLAME_SCALE } };
      for (const f of live) mount(f);
    }).catch((e) => { console.warn('[naval] the deck fire would not load', e); });
  }
  function mount(f) {
    if (f.batch || f.dead || !art || !renderer?.createBillboardBatch) return;
    f.batch = renderer.createBillboardBatch(FIRE_FLAT.archive, FIRE_FLAT.record, art.size, [[0, 0, 0]]);
    f.batch.origin = f.pos;
    f.batch.frame = 0;
    f.anim = art.count > 1 ? new FlatAnim(FIRE_FLAT.archive, art.count, false) : null;
  }
  function unmount(f) {
    if (f.batch) renderer?.destroyBillboardBatch?.(f.batch);
    f.batch = null;
  }

  return {
    flame(pos) {
      const f = { pos: [pos[0], pos[1], pos[2]], batch: null, anim: null, dead: false, hidden: false };
      live.add(f);
      ensureArt();
      mount(f);
      return {
        move(p) { f.pos[0] = p[0]; f.pos[1] = p[1]; f.pos[2] = p[2]; },
        show(on) { f.hidden = !on; },
        retire() { f.dead = true; unmount(f); live.delete(f); },
      };
    },
    tick(dt) { for (const f of live) if (f.batch && f.anim) f.batch.frame = f.anim.tick(dt); },
    batches() { const out = []; for (const f of live) if (f.batch && !f.hidden) out.push(f.batch); return out; },
    offsetAll(o) { for (const f of live) { f.pos[0] += o[0]; f.pos[1] += o[1]; f.pos[2] += o[2]; } },
    clear() { for (const f of [...live]) { f.dead = true; unmount(f); } live.clear(); },
    get count() { return live.size; },
  };
}
