// @ts-check
import { farmProgress, validFarmProgress, farmToolArea, FARM_CROP_TYPES } from './farmProgressLaw.js';
import { FARM_SEEDS, farmSeed, seedGrowsIn, seasonGrowth } from './farm/cropLaw.js';   // FARM EXPANSION: the climate crops and the seasons
import { laySacks, validHaul } from './farm/haulLaw.js';   // FARM EXPANSION: a harvest's sacks, for the wagon
// BUNNYFALL: persistent, shared beds. Real server time grows watered crops; neglected crops pause, never die.
// A sparse address space: farms allocate as many beds as their actual fields contain.
export const FARM_BEDS = 65536;
export const FARM_BED_SPACING = 2;
export const FARM_BED_SIZE = 1.65;
export const FARM_WORK_REACH = 3.5;
export const FARM_WATER_S = 24 * 3600;
export { FARM_SEEDS, farmSeed };   // the seeds live in net/farm/cropLaw.js (Phase 2: the climate crops)
export const emptyGarden = () => ({ beds: {} });
export function gardenGrowth(bed, nowS) {
  if (!bed?.crop) return 0;
  // FARM EXPANSION: the watered time, paced by the shared calendar's seasons (the first three crops: unchanged)
  const from = bed.tick ?? nowS, to = Math.min(nowS, bed.wetUntil ?? 0);
  return Math.max(0, (bed.grown ?? 0) + (to > from ? seasonGrowth(farmSeed(bed.crop), from, to) : 0) * (bed.rate ?? 1));
}
export function gardenStage(bed, nowS) {
  if (!bed) return 'wild';
  if (!bed.crop) return 'tilled';
  const seed = farmSeed(bed.crop);
  const progress = gardenGrowth(bed, nowS) / (seed?.seconds ?? Infinity);
  return progress >= 1 ? 'ripe' : progress >= .5 ? 'growing' : 'seedling';
}
export function validGarden(value) {
  return !!value && validFarmProgress(value.progress) && validHaul(value) && value.beds && typeof value.beds === 'object' && (!Array.isArray(value.beds) || value.beds.length === 16) && Object.entries(value.beds).length <= FARM_BEDS && Object.entries(value.beds).every(([id,b]) => /^(0|[1-9]\d*)$/.test(id) && Number(id) < FARM_BEDS && (b === null ||
    (b && typeof b === 'object' && (b.crop === null || !!farmSeed(b.crop)) &&
      ['grown', 'tick', 'wetUntil'].every((k) => Number.isFinite(b[k]) && b[k] >= 0) &&
      (b.quality === undefined || [0,1,2].includes(b.quality)) && (b.rate === undefined || [1,1.25].includes(b.rate)))));
}
/** One immutable operation; awards are returned separately for an atomic server commit. */
export function stepFarmGarden(garden, { op, bed: index, crop = 'grain', climate }, nowS) {
  if (!validGarden(garden) || !Number.isFinite(nowS) || nowS < 0 || !Number.isInteger(index) || index < 0 || index >= FARM_BEDS) return { error: 'farm-bed-bad' };
  const next = { ...structuredClone(garden), beds: structuredClone({ ...garden.beds }) }, bed = next.beds[index] ?? null;
  const progress = farmProgress(garden), { irrigation, soil } = progress.upgrades;
  const planted = (id) => ({ crop:id, grown:0, tick:nowS, wetUntil:irrigation ? nowS+FARM_WATER_S : 0, quality:soil, rate:soil===2?1.25:1 });
  if (op === 'hoe' && bed === null) next.beds[index] = { crop: null, grown: 0, tick: nowS, wetUntil: 0 };
  else if (op === 'plant' && bed && !bed.crop && farmSeed(crop)) {
    if (!seedGrowsIn(farmSeed(crop), climate)) return { error: 'farm-seed-climate' };   // the service hands the farm's own climate
    Object.assign(bed, planted(crop));
  }
  else if (op === 'water' && bed?.crop && gardenStage(bed, nowS) !== 'ripe' && bed.wetUntil <= nowS + FARM_WATER_S - 60) {
    Object.assign(bed, { grown: gardenGrowth(bed, nowS), tick: nowS, wetUntil: nowS + FARM_WATER_S });
  } else if (op === 'harvest' && bed?.crop && gardenStage(bed, nowS) === 'ripe') {
    const seed = farmSeed(bed.crop);
    const qty = seed.yield + (bed.quality ?? 0);
    next.beds[index] = irrigation === 2 ? planted(seed.id) : { crop: null, grown: 0, tick: nowS, wetUntil: 0 };
    next.progress = structuredClone(progress);
    // the weekly orders count their own three crops; the climate crops' orders come with the workshops (Phase 4)
    if (FARM_CROP_TYPES.includes(seed.id)) next.progress.harvested[seed.id] = Math.min(2147483647, next.progress.harvested[seed.id] + qty);
    return { garden: next, harvest: { crop: seed.id, material: seed.material, qty } };
  } else return { error: 'farm-bed-action' };
  return { garden: next, harvest: null };
}
/** Upgraded tools apply one atomic revision to several eligible beds. */
export function stepFarmGardenAction(garden, body, nowS) {
  const ids = body.beds ?? [body.bed];
  if (!Array.isArray(ids) || !ids.length || ids.length > farmToolArea(garden) || new Set(ids).size !== ids.length || ids.some(i => !Number.isInteger(i) || i < 0 || i >= FARM_BEDS)) return { error:'farm-bed-bad' };
  let next = garden, climateRefused = false; const harvests = [], worked = [];
  for (const bed of ids) {
    const step = stepFarmGarden(next, { ...body, bed }, nowS);
    if ('error' in step) { if (step.error === 'farm-seed-climate') climateRefused = true; continue; }
    next = step.garden; worked.push(bed); if (step.harvest) harvests.push({ ...step.harvest, bed });
  }
  if (harvests.length) { next = next === garden ? structuredClone(garden) : next; laySacks(next, harvests, nowS); }
  return worked.length ? { garden:next, harvests, worked } : { error: climateRefused ? 'farm-seed-climate' : 'farm-bed-action' };
}
