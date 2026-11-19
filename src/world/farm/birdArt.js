// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 2 (docs/FARM-EXPANSION.md section 8.3): THE BIRDS AT THE CROP - while a visit lasts and
// nobody has chased it off (net/farm/careLaw.js birdsNow, the garden's `chased`), a few birds hop from bed to bed over
// the field. ARENA2's one bird (TEXTURE.201 record 11, the seagull; the art register) - the farm calls them birds. Seen
// by everyone near, as the farm is; chased from the scarecrow in Farming Mode.
export const BIRD_ART = Object.freeze([201, 11]);
export const BIRD_COUNT = 6, BIRD_H = .45;

/**
 * @param {any} renderer
 * @param {{ getTexture?: (a: number) => Promise<any>, uploadRecord?: (a: number, r: number) => void }} assets
 */
export function createBirdArt(renderer, assets = {}) {
  /** @type {any} */ let batch = null;
  let size = null, ready = false;
  async function prepare() {
    if (ready || !assets.getTexture) return;
    size = (await assets.getTexture(BIRD_ART[0])).getSize(BIRD_ART[1]);
    ready = true;
  }
  /** A stable 0..1 for (visit, bird, hop). */
  const rnd = (a, b, c) => { let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1) ^ Math.imul(c + 7, 0x9e3779b1)) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0; return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
  return {
    prepare,
    /**
     * @param {{ id: number } | null} visit the birds' visit, or null (none, or chased off)
     * @param {number[][]} beds the beds they may land on (the planted ones)
     * @param {number} seconds the time now, s
     */
    update(visit, beds, seconds) {
      if (!ready || !visit || !beds.length) { if (batch) renderer.destroyBillboardBatch(batch); batch = null; return; }
      const centers = Array.from({ length: BIRD_COUNT }, (_, i) => {
        // each bird keeps a bed for a few seconds, then hops to another; a little bob as it pecks
        const hop = Math.floor(seconds / (3 + rnd(visit.id, i, 0) * 3) + i * .37), bed = beds[Math.floor(rnd(visit.id, i, hop) * beds.length)];
        const bob = Math.abs(Math.sin(seconds * 5 + i)) * .12;
        return [bed[0] + (rnd(visit.id, i, hop + 99) - .5) * 1.2, bed[1] + .04 + bob, bed[2] + (rnd(visit.id, i, hop + 199) - .5) * 1.2];
      });
      if (!batch) { assets.uploadRecord?.(BIRD_ART[0], BIRD_ART[1]); batch = renderer.createBillboardBatch(BIRD_ART[0], BIRD_ART[1], { w: BIRD_H * size.width / size.height, h: BIRD_H }, centers, { dynamic: true }); }
      else renderer.moveBillboardBatch(batch, centers);
    },
    /** @param {number[]} right @param {number[]} up */
    draw(right, up) { if (batch) renderer.drawBillboards([batch], right, up); },
    dispose() { if (batch) renderer.destroyBillboardBatch(batch); batch = null; },
  };
}
