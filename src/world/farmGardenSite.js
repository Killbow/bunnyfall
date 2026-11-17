// BUNNYFALL: one small working patch in the first crop prefab, identically chosen by builder and farming mode.
import { flatFieldFor } from './flatFields.js';
import { FARM_BED_SPACING } from '../net/farmGardenLaw.js';

export function farmGardenField(blocks) {
  for (const block of blocks ?? []) for (const model of block.layout?.models ?? []) {
    const field = flatFieldFor(model.modelIdNum);
    if (!field || field.rangeX < 14 || field.rangeZ < 14) continue;
    const x = model.matrix[12] - Math.floor(field.rangeX / 2) + 5;
    const z = model.matrix[14] - Math.floor(field.rangeZ / 2) + 5;
    return { block, x, z, width: 4 * FARM_BED_SPACING };
  }
  return null;
}
export const inFarmGarden = (x, z, rect) => !!rect && x >= rect.x && x <= rect.x + rect.width && z >= rect.z && z <= rect.z + rect.width;
export function farmGardenSite(farm, { farms, built, state, heightAt }) {
  const place = farms.placeOf(farm.mapId);
  const pixel = place && built.get(`${place.px},${place.py}`);
  const field = farmGardenField(pixel?.locBlocks);
  if (!field || !pixel.locOrigin) return null;
  const tr = (typeof state === 'function' ? state() : state).pixelTranslation(place.px, place.py);
  const x = tr[0] + pixel.locOrigin[0] + field.block.originX + field.x;
  const z = tr[2] + pixel.locOrigin[2] + field.block.originZ + field.z;
  const beds = Array.from({ length: 16 }, (_, i) => {
    const bx = x + (i % 4 + .5) * FARM_BED_SPACING, bz = z + (Math.floor(i / 4) + .5) * FARM_BED_SPACING;
    return [bx, heightAt(bx, bz), bz];
  });
  return beds.every((b) => Number.isFinite(b[1])) ? { beds, center: [x + 4, heightAt(x + 4, z + 4), z + 4] } : null;
}
