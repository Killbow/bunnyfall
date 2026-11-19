// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 1 (docs/FARM-EXPANSION.md section 3.3): THE SACKS DRAWN - a harvest's sacks lying at
// the corner of their bed (TEXTURE.205's sacks, one picture a crop), and the ones a member has shouldered riding on
// their back as they walk to the wagon. The ground's are rebuilt when the sacks change; the carried ones move each frame.
import { FARM_BED_SIZE } from '../../net/farmGardenLaw.js';

/** A crop's sack picture (the art register's 205:17-19) and its height, m. */
export const SACK_ART = Object.freeze({ grain: [205, 17], mushroom: [205, 18], herbs: [205, 19] });
export const SACK_H = .55;
/** Where a sack lies against its bed: the bed's corner, out of the plants' way. */
export const sackSpot = (bed, n = 0) => [bed[0] + FARM_BED_SIZE / 2 - .15 - (n % 2) * .3, bed[1] + .02, bed[2] + FARM_BED_SIZE / 2 - .1 - Math.floor(n / 2) * .25];

/**
 * @param {any} renderer
 * @param {{ getTexture?: (a: number) => Promise<any>, uploadRecord?: (a: number, r: number) => void }} assets
 */
export function createSackArt(renderer, assets = {}) {
  /** @type {any[]} */ let ground = [];
  /** @type {any} */ let carried = null;
  let size = null, signature = '', carriedKey = '', ready = false;
  async function prepare() {
    if (ready || !assets.getTexture) return;
    const file = await assets.getTexture(205);
    size = Object.fromEntries(Object.entries(SACK_ART).map(([crop, [a, r]]) => [crop, file.getSize(r)]));
    ready = true;
  }
  const dims = (crop, h) => ({ w: h * size[crop].width / size[crop].height, h });
  function clearGround() { ground.forEach((b) => renderer.destroyBillboardBatch(b)); ground = []; }
  return {
    prepare,
    /**
     * @param {{ id: number, crop: string, pos: number[] }[]} lying the sacks on the ground, placed
     * @param {{ crop: string }[]} shouldered the sacks the player carries
     * @param {number[]} feet
     * @param {number[]} right the camera's right: the sacks ride on the shoulder, beside the body and not inside it
     */
    update(lying, shouldered, feet, right) {
      if (!ready) return;
      const sig = JSON.stringify(lying.map((s) => [s.id, s.pos.map((v) => Math.round(v * 100))]));
      if (sig !== signature) {
        signature = sig; clearGround();
        /** @type {Map<string, number[][]>} */
        const byCrop = new Map();
        for (const s of lying) { if (!byCrop.has(s.crop)) byCrop.set(s.crop, []); byCrop.get(s.crop).push(s.pos); }
        for (const [crop, centers] of byCrop) { const [a, r] = SACK_ART[crop]; assets.uploadRecord?.(a, r); ground.push(renderer.createBillboardBatch(a, r, dims(crop, SACK_H), centers)); }
      }
      // the shouldered sacks: stacked on the back, one picture (the first one's crop), moved with the player
      const n = shouldered.length;
      const key = n ? `${n}:${shouldered[0].crop}` : '';
      if (key !== carriedKey) { if (carried) renderer.destroyBillboardBatch(carried); carried = null; carriedKey = key; }
      if (!n) return;
      const centers = Array.from({ length: n }, (_, i) => [feet[0] + right[0] * .32, feet[1] + 1.05 + i * .28, feet[2] + right[2] * .32]);
      if (!carried) { const [a, r] = SACK_ART[shouldered[0].crop]; assets.uploadRecord?.(a, r); carried = renderer.createBillboardBatch(a, r, dims(shouldered[0].crop, .5), centers, { dynamic: true }); }
      else renderer.moveBillboardBatch(carried, centers);
    },
    /** @param {number[]} right @param {number[]} up */
    draw(right, up) { const all = carried ? [...ground, carried] : ground; if (all.length) renderer.drawBillboards(all, right, up); },
    dispose() { clearGround(); if (carried) renderer.destroyBillboardBatch(carried); carried = null; carriedKey = ''; signature = ''; },
  };
}
