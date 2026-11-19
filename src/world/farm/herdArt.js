// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 3 (docs/FARM-EXPANSION.md section 5): THE HERD DRAWN - each animal as Daggerfall's own
// flat (TEXTURE.201, the art register), in its pen: cows and horses in the pen, pigs in the sty, dogs and cats about the
// yard (by the ledger). They are never still: each wanders to a new spot every few seconds, and a contented one grazes
// (its grazing picture). Seen by everyone near the farm.
import { ANIMALS, CONTENT_GOOD, contentAt } from '../../net/farm/herdLaw.js';
// PHASE 5: `keep` is the stationed herders' daily lift (stationLaw.js herdKeep)

/** Where an animal stands at `seconds`: its pen's centre and a wander inside its radius. */
export function animalSpot(a, home, radius, seconds) {
  const step = Math.floor(seconds / (5 + (a.id % 4)) + a.id * .31);
  const h = (n) => { let x = Math.imul(a.id * 7919 + step * 104729 + n, 0x9e3779b1) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0; return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };
  const ang = h(1) * Math.PI * 2, d = Math.sqrt(h(2)) * radius;
  return [home[0] + Math.cos(ang) * d, home[1] + .02, home[2] + Math.sin(ang) * d];
}

/**
 * @param {any} renderer
 * @param {{ getTexture?: (a: number) => Promise<any>, uploadRecord?: (a: number, r: number) => void }} assets
 */
export function createHerdArt(renderer, assets = {}) {
  /** @type {Map<string, any>} */ const batches = new Map();
  let file = null, ready = false;
  async function prepare() { if (ready || !assets.getTexture) return; file = await assets.getTexture(201); ready = true; }
  return {
    prepare,
    /**
     * @param {any[]} herd the garden's animals
     * @param {(a: any) => { home: number[], radius: number } | null} homeOf where each lives
     * @param {number} nowS the garden's time (contentment), @param {number} seconds the wander's clock
     * @returns {{ id: number, pos: number[], h: number }[]} where each was drawn, for picking
     */
    update(herd, homeOf, nowS, seconds, keep = 0) {
      if (!ready) return [];
      /** @type {Map<string, number[][]>} */ const groups = new Map(), placed = [];
      for (const a of herd ?? []) {
        const home = homeOf(a); if (!home) continue;
        const A = ANIMALS[a.kind], [arch, rec] = contentAt(a, nowS, keep) >= CONTENT_GOOD && a.id % 2 ? A.graze : A.art;
        const pos = animalSpot(a, home.home, home.radius, seconds), key = `${arch}_${rec}_${A.h}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(pos); placed.push({ id: a.id, pos, h: A.h });
      }
      for (const [key, b] of batches) if (!groups.has(key) || groups.get(key).length !== b._n) { renderer.destroyBillboardBatch(b); batches.delete(key); }
      for (const [key, centers] of groups) {
        const [arch, rec, h] = key.split('_').map(Number);
        let b = batches.get(key);
        if (!b) {
          assets.uploadRecord?.(arch, rec); const size = file.getSize(rec);
          b = renderer.createBillboardBatch(arch, rec, { w: h * size.width / size.height, h }, centers, { dynamic: true }); b._n = centers.length; batches.set(key, b);
        } else renderer.moveBillboardBatch(b, centers);
      }
      return placed;
    },
    /** @param {number[]} right @param {number[]} up */
    draw(right, up) { if (batches.size) renderer.drawBillboards([...batches.values()], right, up); },
    dispose() { for (const b of batches.values()) renderer.destroyBillboardBatch(b); batches.clear(); },
  };
}
