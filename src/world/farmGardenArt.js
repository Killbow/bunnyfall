// BUNNYFALL: ARENA2 soil and vegetation loaded by the normal texture pipeline.
import { gardenStage, FARM_BED_SIZE } from '../net/farmGardenLaw.js';
import { writeDecalQuad, DECAL_FLOATS } from '../combat/blood/bloodDecals.js';
export const FARM_ART = Object.freeze({ soil: [302, 1], grass: [302, 2],
  grain: { seedling: [301, 9], growing: [301, 2], ripe: [301, 19] },
  mushroom: { seedling: [301, 10], growing: [301, 10], ripe: [301, 10] },
  herbs: { seedling: [301, 8], growing: [301, 13], ripe: [301, 14] } });
export function createFarmGardenArt(renderer, assets = {}) {
  let decals = null, signature = '', crops = [], ready = false, pending = null, soil = null, grass = null, soilRanges = [], grassRanges = [];
  const files = new Map();
  async function prepare() {
    if (ready) return; if (pending) return pending;
    pending = (async () => {
      if (!assets.getTexture || !assets.uploadRecord) throw new Error('Farming requires the texture pipeline');
      for (const a of [301, 302]) files.set(a, await assets.getTexture(a));
      assets.uploadRecord(...FARM_ART.soil, { opaque: true }); assets.uploadRecord(...FARM_ART.grass, { opaque: true });
      soil = renderer.textures.get(`${FARM_ART.soil.join('_')}#opaque`); grass = renderer.textures.get(`${FARM_ART.grass.join('_')}#opaque`);
      if (!soil || !grass) throw new Error('Farm terrain textures unavailable'); ready = true;
    })();
    try { await pending; } finally { pending = null; }
  }
  function update(site, garden, now, selected) {
    if (!ready) return;
    const sig = JSON.stringify([site.beds, garden.beds.map((b) => [gardenStage(b, now), b?.crop, b?.wetUntil > now]), selected]);
    if (sig === signature) return; signature = sig; decals ??= renderer.createDecalBatch(16);
    crops.forEach((b) => renderer.destroyBillboardBatch(b)); crops = []; soilRanges = []; grassRanges = [];
    const values = new Float32Array(16 * DECAL_FLOATS);
    site.beds.forEach((pos, i) => {
      const bed = garden.beds[i], stage = gardenStage(bed, now);
      const tint = i === selected ? [1,.92,.68,1] : bed?.wetUntil > now ? [.57,.55,.5,1] : [1,1,1,1];
      writeDecalQuad(values, i * DECAL_FLOATS, { pos: [pos[0],pos[1]+.035,pos[2]], right: [1,0,0], up: [0,0,-1], size: FARM_BED_SIZE, tint, wet: 0 });
      (bed ? soilRanges : grassRanges).push([i,i+1]); if (!bed?.crop) return;
      const [archive, record] = FARM_ART[bed.crop][stage]; assets.uploadRecord(archive, record);
      const size = files.get(archive).getSize(record);
      const height = bed.crop === 'mushroom' ? (stage === 'seedling' ? .14 : stage === 'ripe' ? .38 : .25) : stage === 'seedling' ? .3 : stage === 'ripe' ? 1.2 : .7;
      const centers = [-.4,.4].flatMap((x) => [-.4,.4].map((z) => [pos[0]+x,pos[1]+.04,pos[2]+z]));
      crops.push(renderer.createBillboardBatch(archive, record, { w: height * size.width / size.height, h: height }, centers, { dynamic: true }));
    }); renderer.writeDecalSlot(decals,0,values);
  }
  return { prepare, update,
    draw(right,up) { if (decals && soilRanges.length) renderer.drawDecalPicture(decals,soil,soilRanges); if (decals && grassRanges.length) renderer.drawDecalPicture(decals,grass,grassRanges); if (crops.length) renderer.drawBillboards(crops,right,up); },
    dispose() { if (decals) renderer.destroyDecalBatch(decals); decals = null; crops.forEach((b) => renderer.destroyBillboardBatch(b)); crops = []; signature = ''; } };
}
