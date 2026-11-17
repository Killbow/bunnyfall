// @ts-check
// BUNNYFALL: persistent, shared beds. Real server time grows watered crops; neglected crops pause, never die.
export const FARM_BEDS = 16;
export const FARM_BED_SPACING = 2;
export const FARM_BED_SIZE = 1.65;
export const FARM_WORK_REACH = 3.5;
export const FARM_WATER_S = 24 * 3600;
export const FARM_SEEDS = Object.freeze([
  Object.freeze({ id: 'grain', seconds: 6 * 3600, material: 'food:grain', yield: 2 }),
  Object.freeze({ id: 'mushroom', seconds: 12 * 3600, material: 'food:mushroom', yield: 3 }),
  Object.freeze({ id: 'herbs', seconds: 18 * 3600, material: null, yield: 2 }),
]);
export const farmSeed = (id) => FARM_SEEDS.find((s) => s.id === id) ?? null;
export const emptyGarden = () => ({ beds: Array.from({ length: FARM_BEDS }, () => null) });
export function gardenGrowth(bed, nowS) {
  if (!bed?.crop) return 0;
  return Math.max(0, (bed.grown ?? 0) + Math.max(0, Math.min(nowS, bed.wetUntil ?? 0) - (bed.tick ?? nowS)));
}
export function gardenStage(bed, nowS) {
  if (!bed) return 'wild';
  if (!bed.crop) return 'tilled';
  const seed = farmSeed(bed.crop);
  const progress = gardenGrowth(bed, nowS) / (seed?.seconds ?? Infinity);
  return progress >= 1 ? 'ripe' : progress >= .5 ? 'growing' : 'seedling';
}
export function validGarden(value) {
  return !!value && Array.isArray(value.beds) && value.beds.length === FARM_BEDS && value.beds.every((b) => b === null ||
    (b && typeof b === 'object' && (b.crop === null || !!farmSeed(b.crop)) &&
      ['grown', 'tick', 'wetUntil'].every((k) => Number.isFinite(b[k]) && b[k] >= 0)));
}
/** One immutable operation; awards are returned separately for an atomic server commit. */
export function stepFarmGarden(garden, { op, bed: index, crop = 'grain' }, nowS) {
  if (!validGarden(garden) || !Number.isFinite(nowS) || nowS < 0 || !Number.isInteger(index) || index < 0 || index >= FARM_BEDS) return { error: 'farm-bed-bad' };
  const next = structuredClone(garden), bed = next.beds[index];
  if (op === 'hoe' && bed === null) next.beds[index] = { crop: null, grown: 0, tick: nowS, wetUntil: 0 };
  else if (op === 'plant' && bed && !bed.crop && farmSeed(crop)) Object.assign(bed, { crop, grown: 0, tick: nowS, wetUntil: 0 });
  else if (op === 'water' && bed?.crop && gardenStage(bed, nowS) !== 'ripe' && bed.wetUntil <= nowS + FARM_WATER_S - 60) {
    Object.assign(bed, { grown: gardenGrowth(bed, nowS), tick: nowS, wetUntil: nowS + FARM_WATER_S });
  } else if (op === 'harvest' && bed?.crop && gardenStage(bed, nowS) === 'ripe') {
    const seed = farmSeed(bed.crop);
    next.beds[index] = { crop: null, grown: 0, tick: nowS, wetUntil: 0 };
    return { garden: next, harvest: { crop: seed.id, material: seed.material, qty: seed.yield } };
  } else return { error: 'farm-bed-action' };
  return { garden: next, harvest: null };
}
