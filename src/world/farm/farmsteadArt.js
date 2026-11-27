// @ts-check
import { FIXTURE_ARCHIVES, fixtureParts } from './farmstead.js';
import { setFarmSway } from '../farmGardenArt.js';

/**
 * @param {any} renderer
 * @param {{ getTexture?: (a: number) => Promise<any>, uploadRecord?: (a: number, r: number, o?: any) => void }} assets
 */
export function createFarmsteadArt(renderer, assets = {}) {
  /** @type {any[]} */ let batches = [];
  let ready = false, pending = /** @type {Promise<void>|null} */ (null), signature = '';
  const files = new Map();
  async function prepare() {
    if (ready) return;
    if (pending) return pending;
    pending = (async () => {
      if (!assets.getTexture || !assets.uploadRecord) throw new Error('The farmstead requires the texture pipeline');
      for (const a of FIXTURE_ARCHIVES) files.set(a, await assets.getTexture(a));
      ready = true;
    })();
    try { await pending; } finally { pending = null; }
  }
  function clear() { batches.forEach((b) => renderer.destroyBillboardBatch(b)); batches = []; signature = ''; }
  /**
   * @param {{ fixtures: { id: string, def: any, pos: number[] }[], seeds?: string[] } | null} stead
   * @param {Record<string, number>} upgrades
   */
  function update(stead, upgrades) {
    if (!ready || !stead) return;
    const sig = JSON.stringify([stead.fixtures.map((f) => [f.id, f.pos.map((v) => Math.round(v * 100))]), upgrades, stead.seeds]);
    if (sig === signature) return;
    clear(); signature = sig;
    /** @type {Map<string, { a: number, r: number, h?: number, w?: number, sway?: boolean, centers: number[][] }>} */
    const groups = new Map();
    for (const f of stead.fixtures) for (const p of fixtureParts(f, upgrades, stead.seeds)) {
      const key = `${p.a}_${p.r}_${p.h ?? 'w' + p.w}${p.sway ? 's' : ''}`;
      if (!groups.has(key)) groups.set(key, { a: p.a, r: p.r, h: p.h, w: p.w, sway: !!p.sway, centers: [] });
      groups.get(key).centers.push([f.pos[0] + (p.dx ?? 0), f.pos[1] + (p.dy ?? 0) + .02, f.pos[2] + (p.dz ?? 0)]);
    }
    for (const { a, r, h, w, sway, centers } of groups.values()) {
      const file = files.get(a), size = file?.getSize?.(r);
      if (!size?.width || !size?.height) continue;
      assets.uploadRecord(a, r);
      const dims = h != null ? { w: h * size.width / size.height, h } : { w, h: w * size.height / size.width };
      batches.push(setFarmSway(renderer.createBillboardBatch(a, r, dims, centers), sway));
    }
  }
  return {
    prepare, update,
    get ready() { return ready; },
    /**
     * @param {number[]} right
     * @param {number[]} up
     */
    draw(right, up) { if (batches.length) renderer.drawBillboards(batches, right, up); },
    dispose() { clear(); },
  };
}
