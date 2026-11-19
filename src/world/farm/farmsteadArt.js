// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 1: THE FARMSTEAD DRAWN - each fixture's parts as Daggerfall's own flats (the art
// register's records, farmstead.js FIXTURES), standing on the ground the layout chose. Batched by picture and height,
// rebuilt only when the layout or the farm's upgrades change (a part with `min` appears with its upgrade). Drawn for
// anyone near the farm, in the normal view as in Farming Mode: the farm is a place, not a menu.
import { FIXTURE_ARCHIVES, fixtureParts } from './farmstead.js';
import { setFarmSway } from '../farmGardenArt.js';   // PHASE 4.0: wind over the haystack's shocks

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
      batches.push(setFarmSway(renderer.createBillboardBatch(a, r, dims, centers), sway));   // PHASE 4.0: a shock leans, a fixture stands
    }
  }
  return {
    prepare, update,
    get ready() { return ready; },
    /** @param {number[]} right @param {number[]} up */
    draw(right, up) { if (batches.length) renderer.drawBillboards(batches, right, up); },
    dispose() { clear(); },
  };
}
