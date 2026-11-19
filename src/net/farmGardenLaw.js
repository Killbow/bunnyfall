// @ts-check
import { farmProgress, validFarmProgress, farmToolArea, FARM_CROP_TYPES } from './farmProgressLaw.js';
import { FARM_SEEDS, farmSeed, seedGrowsIn, seasonGrowth } from './farm/cropLaw.js';   // FARM EXPANSION: the climate crops and the seasons
import { CARE_MAX, WATER_CARE_S, clampCare, gradeOf, gradedYield, bedWeedy, birdsNow, birdsUnchased, BIRD_KEEP } from './farm/careLaw.js';   // PHASE 2: care and grades
import { GAMES, gameForOp, validGame, validPlays, recordPlay, careBonus } from './farm/farmGameLaw.js';   // PHASE 2: the field games
import { validHerd, kindContent } from './farm/herdLaw.js';   // PHASE 3: the herd
import { QUICK_SHARE, crossChance, crossRoll, addStrain, strainOf, validStrains, validBedStrain } from './farm/strainLaw.js';   // PHASE 2c: strains
import { validWorkshops } from './farm/workshopLaw.js';   // PHASE 4: the workshops
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
  return Math.max(0, (bed.grown ?? 0) + (to > from ? seasonGrowth(farmSeed(bed.crop), from, to, !!bed.traits?.includes('hardy')) : 0) * (bed.rate ?? 1));
}
/** A planted bed's real seconds to ripen at full pace: its seed's, a quick strain's shorter. */
export function bedSeconds(bed) {
  const s = farmSeed(bed?.crop)?.seconds ?? Infinity;
  return bed?.traits?.includes('quick') ? s * QUICK_SHARE : s;
}
export function gardenStage(bed, nowS) {
  if (!bed) return 'wild';
  if (!bed.crop) return 'tilled';
  const seed = farmSeed(bed.crop);
  const progress = seed ? gardenGrowth(bed, nowS) / bedSeconds(bed) : 0;
  return progress >= 1 ? 'ripe' : progress >= .5 ? 'growing' : 'seedling';
}
export function validGarden(value) {
  const okInt = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  if (value && value.chased !== undefined && !(Array.isArray(value.chased) && value.chased.length <= BIRD_KEEP && value.chased.every((h) => okInt(h, 2 ** 31)))) return false;
  if (value && !validPlays(value.plays)) return false;
  if (value && !validStrains(value, FARM_SEEDS.map((x) => x.id))) return false;
  if (value && !validHerd(value)) return false;
  if (value && !validWorkshops(value)) return false;   // PHASE 4
  return !!value && validFarmProgress(value.progress) && validHaul(value) && value.beds && typeof value.beds === 'object' && (!Array.isArray(value.beds) || value.beds.length === 16) && Object.entries(value.beds).length <= FARM_BEDS && Object.entries(value.beds).every(([id,b]) => /^(0|[1-9]\d*)$/.test(id) && Number(id) < FARM_BEDS && (b === null ||
    (b && typeof b === 'object' && (b.crop === null || !!farmSeed(b.crop)) &&
      ['grown', 'tick', 'wetUntil'].every((k) => Number.isFinite(b[k]) && b[k] >= 0) &&
      (b.quality === undefined || [0,1,2].includes(b.quality)) && (b.rate === undefined || [1,1.25].includes(b.rate)) &&
      (b.care === undefined || okInt(b.care, CARE_MAX)) && validBedStrain(b) && ['sown', 'weeded'].every((k) => b[k] === undefined || (Number.isFinite(b[k]) && b[k] >= 0)))));
}
/** One immutable operation; awards are returned separately for an atomic server commit. */
export function stepFarmGarden(garden, { op, bed: index, crop = 'grain', strain, climate, mapId = 0, bonus = 0 }, nowS) {
  if (!validGarden(garden) || !Number.isFinite(nowS) || nowS < 0 || !Number.isInteger(index) || index < 0 || index >= FARM_BEDS) return { error: 'farm-bed-bad' };
  const next = { ...structuredClone(garden), beds: structuredClone({ ...garden.beds }) }, bed = next.beds[index] ?? null;
  const progress = farmProgress(garden), { irrigation, soil } = progress.upgrades;
  const planted = (id, care = 0) => ({ crop:id, grown:0, tick:nowS, wetUntil:irrigation ? nowS+FARM_WATER_S : 0, quality:soil, rate:soil===2?1.25:1, sown:nowS, care:clampCare(care) });
  if (op === 'hoe' && bed === null) next.beds[index] = { crop: null, grown: 0, tick: nowS, wetUntil: 0 };
  else if (op === 'plant' && bed && !bed.crop && farmSeed(crop)) {
    if (!seedGrowsIn(farmSeed(crop), climate)) return { error: 'farm-seed-climate' };   // the service hands the farm's own climate
    const st = strain === undefined ? null : strainOf(garden, strain);
    if (strain !== undefined && (!st || st.crop !== crop)) return { error: 'farm-strain-bad' };
    // PHASE 3: the sty's manure - a sown bed takes one, +1 care
    const manured = (next.manure ?? 0) > 0;
    if (manured) next.manure -= 1;
    Object.assign(bed, planted(crop, bonus + (manured ? 1 : 0)), st ? { strain: st.id, traits: [...st.traits] } : {});   // a well-sown bed starts with care (the sowing game)
  }
  else if (op === 'water' && bed?.crop && gardenStage(bed, nowS) !== 'ripe' && bed.wetUntil <= nowS + FARM_WATER_S - 60) {
    // CARE: watered in its last hours of moisture, before it dried
    const kept = bed.wetUntil > nowS && bed.wetUntil - nowS <= WATER_CARE_S;
    Object.assign(bed, { grown: gardenGrowth(bed, nowS), tick: nowS, wetUntil: nowS + FARM_WATER_S, ...(kept ? { care: clampCare((bed.care ?? 0) + 1) } : {}) });
  } else if (op === 'weed' && bed?.crop && bedWeedy(bed, nowS, gardenStage(bed, nowS) === 'ripe')) {
    Object.assign(bed, { weeded: nowS, care: clampCare((bed.care ?? 0) + 1 + bonus) });
  } else if (op === 'harvest' && bed?.crop && gardenStage(bed, nowS) === 'ripe') {
    const seed = farmSeed(bed.crop);
    // THE GRADE: the bed's care, the scything game's, less what unchased birds took while it grew
    const toll = birdsUnchased(mapId, garden.chased, bed.sown ?? bed.tick ?? nowS, nowS, kindContent(garden, 'dog', nowS) ? 1 : undefined);   // PHASE 3: a content dog guards the field
    const grade = gradeOf(clampCare((bed.care ?? 0) + bonus - toll));
    const qty = gradedYield(seed.yield, bed.quality ?? 0, grade) + (bed.traits?.includes('heavy') ? 1 : 0);
    next.beds[index] = irrigation === 2 ? { ...planted(seed.id), ...(bed.strain ? { strain: bed.strain, traits: [...(bed.traits ?? [])] } : {}) } : { crop: null, grown: 0, tick: nowS, wetUntil: 0 };
    next.progress = structuredClone(progress);
    // the weekly orders count their own three crops; the climate crops' orders come with the workshops (Phase 4)
    if (FARM_CROP_TYPES.includes(seed.id)) next.progress.harvested[seed.id] = Math.min(2147483647, next.progress.harvested[seed.id] + qty);
    return { garden: next, harvest: { crop: seed.id, material: seed.material, qty, grade, care: clampCare((bed.care ?? 0) + bonus - toll), traits: bed.traits ?? [] } };
  } else return { error: 'farm-bed-action' };
  return { garden: next, harvest: null };
}
/** Upgraded tools apply one atomic revision to several eligible beds. */
export function stepFarmGardenAction(garden, body, nowS) {
  const ids = body.beds ?? [body.bed];
  if (!Array.isArray(ids) || !ids.length || ids.length > farmToolArea(garden) || new Set(ids).size !== ids.length || ids.some(i => !Number.isInteger(i) || i < 0 || i >= FARM_BEDS)) return { error:'farm-bed-bad' };
  // A FIELD GAME (farmGameLaw.js): judged once for the action; its care bonus only while the account's day has full plays left
  const kind = gameForOp(body.op), day = Math.floor(nowS / 86400), who = String(body.who ?? 'local');
  if (body.game !== undefined && (!kind || !validGame(body.game, body.op))) return { error: 'farm-game-bad' };
  const full = body.game !== undefined && ((garden.plays?.day === day ? garden.plays.by?.[who]?.[kind] ?? 0 : 0) < GAMES[kind].cap);
  const bonus = full ? careBonus(body.game.score) : 0;
  let next = garden, climateRefused = /** @type {string|false} */ (false); const harvests = [], worked = [];
  for (const bed of ids) {
    const step = stepFarmGarden(next, { ...body, bed, bonus }, nowS);
    if ('error' in step) { if (step.error === 'farm-seed-climate' || step.error === 'farm-strain-bad') climateRefused = step.error; continue; }
    next = step.garden; worked.push(bed); if (step.harvest) harvests.push({ ...step.harvest, bed });
  }
  if (harvests.length) { next = next === garden ? structuredClone(garden) : next; laySacks(next, harvests, nowS); }
  if (!worked.length) return { error: climateRefused || 'farm-bed-action' };   // a seed refused says why
  const played = body.game !== undefined ? { kind, full: recordPlay(next, who, kind, day) } : null;
  // A CROSS (strainLaw.js): the first bed harvested with a ripe partner of the same crop, by the roll and both beds' care
  let strain = null;
  const partner = Number.isInteger(body.partner) ? garden.beds[body.partner] : null, first = garden.beds[ids[0]];
  if (body.op === 'harvest' && partner && first && body.partner !== ids[0] && partner.crop === first.crop && gardenStage(partner, nowS) === 'ripe' && harvests.length
    && crossRoll(body.mapId ?? 0, ids[0], nowS) < crossChance(harvests[0].care, partner.care ?? 0)) {
    strain = addStrain(next, first.crop, [...(first.traits ?? []), ...(partner.traits ?? [])]);
  }
  return { garden:next, harvests, worked, played, strain };
}

/** THE BIRDS CHASED (careLaw.js): while birds are at the farm, a chase played well enough sends them off for this visit -
 *  it no longer costs any bed care. The play is counted as any field game's. */
export function stepFarmBirds(garden, { mapId = 0, who = 'local', game }, nowS) {
  if (!validGarden(garden)) return { error: 'farm-bed-bad' };
  const w = birdsNow(mapId, nowS);
  if (!w) return { error: 'farm-birds-none' };
  if ((garden.chased ?? []).includes(w.id)) return { error: 'farm-birds-gone' };
  if (!validGame(game, 'birds')) return { error: 'farm-game-bad' };
  const next = structuredClone(garden), day = Math.floor(nowS / 86400);
  const played = { kind: 'birds', full: recordPlay(next, String(who), 'birds', day) }, chased = game.score >= .5;
  if (chased) next.chased = [...(garden.chased ?? []).filter((h) => h > w.id - BIRD_KEEP), w.id].slice(-BIRD_KEEP);
  return { garden: next, harvests: [], worked: [], played, chased };
}

/** BURN A STRAIN (an officer, at the seed shelf): its place freed for a new cross. Beds sown with it grow on. */
export function stepFarmBurn(garden, strainId) {
  if (!validGarden(garden)) return { error: 'farm-bed-bad' };
  if (!strainOf(garden, strainId)) return { error: 'farm-strain-bad' };
  const next = structuredClone(garden);
  next.strains = next.strains.filter((s) => s.id !== strainId);
  return { garden: next, harvests: [], worked: [] };
}
