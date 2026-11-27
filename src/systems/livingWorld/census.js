// @ts-check
// Resident ids are `L<mapId>.<slot>` for a household, `L<mapId>.t<slot>` for a traveler, and `L<mapId>.w<slot>` for
// the watch, and a newcomer adds `~<gen>`. Relations are saved under these ids, so slot order must stay stable.
// Travelers and the watch are minted from the MAPS row alone so distant readers agree.
import { PERSON_TEXTURES, PERSON_FACE_RECORDS, NUM_PERSON_FACE_VARIANTS, GUARD_TEXTURE, walkerRace } from '../../characters/mobilePerson.js';
import { fullName, getNameBankOfRegion, GENDERS } from '../../characters/nameHelper.js';
import { srand, getSeed, setSeed } from '../../formats/dfRandom.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { MOBILE_TYPES } from '../../characters/mobileTypes.js';
import { seededRng } from '../../weather/wind.js';
import { lwSeed, rollInt, pickOf, pickWeighted } from './seed.js';

export const CENSUS_MAX = 260;

export { RACE_OF_PEOPLE, raceOfPeople } from '../../characters/mobilePerson.js';

export const JOBS = Object.freeze({
  keeper: 'keeper', helper: 'helper', smith: 'smith', clerk: 'clerk', scholar: 'scholar', innkeeper: 'innkeeper',
  server: 'server', priest: 'priest', guildsman: 'guildsman', courtier: 'courtier', guard: 'guard',
  labourer: 'labourer', farmer: 'farmer', fisher: 'fisher', crafter: 'crafter', homemaker: 'homemaker', beggar: 'beggar',
  merchant: 'merchant', mercenary: 'mercenary', adventurer: 'adventurer', sailor: 'sailor', pilgrim: 'pilgrim',
  courier: 'courier', pedlar: 'pedlar',
  carter: 'carter', hunter: 'hunter', patrol: 'patrol', noble: 'noble', retainer: 'retainer', minstrel: 'minstrel',
});
export const TRAVELLER_JOBS = Object.freeze(['merchant', 'mercenary', 'adventurer', 'sailor', 'pilgrim', 'courier', 'pedlar']);
// Dealt after every `TRAVELLER_JOBS` slot, in this order. A job inserted earlier re-keys every later traveler id
// and the regard saved under it.
export const ROAD_JOBS = Object.freeze(['carter', 'hunter', 'patrol', 'noble', 'retainer', 'minstrel']);

const SHOP_JOB = Object.freeze({
  [BUILDING_TYPES.Alchemist]: 'keeper', [BUILDING_TYPES.Armorer]: 'smith', [BUILDING_TYPES.Bank]: 'clerk',
  [BUILDING_TYPES.Bookseller]: 'scholar', [BUILDING_TYPES.ClothingStore]: 'keeper', [BUILDING_TYPES.FurnitureStore]: 'keeper',
  [BUILDING_TYPES.GemStore]: 'keeper', [BUILDING_TYPES.GeneralStore]: 'keeper', [BUILDING_TYPES.Library]: 'scholar',
  [BUILDING_TYPES.PawnShop]: 'keeper', [BUILDING_TYPES.WeaponSmith]: 'smith',
});
export const isHome = (type) => type >= BUILDING_TYPES.House1 && type <= BUILDING_TYPES.House6;
export const hasShopJob = (type) => Object.prototype.hasOwnProperty.call(SHOP_JOB, type);

export const ADVENTURER_CLASSES = Object.freeze([128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145]);
export const MERCENARY_CLASSES = Object.freeze([MOBILE_TYPES.Warrior, MOBILE_TYPES.Knight, MOBILE_TYPES.Barbarian, MOBILE_TYPES.Archer,
  MOBILE_TYPES.Ranger, MOBILE_TYPES.Spellsword, MOBILE_TYPES.Battlemage]);
export const COURIER_CLASSES = Object.freeze([MOBILE_TYPES.Acrobat, MOBILE_TYPES.Ranger, MOBILE_TYPES.Rogue]);
export const HUNTER_CLASSES = Object.freeze([MOBILE_TYPES.Archer, MOBILE_TYPES.Ranger]);
export const RETAINER_CLASSES = Object.freeze([MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior, MOBILE_TYPES.Archer]);

/**
 * @typedef {{ mapId: number, name?: string, px?: number, py?: number, type?: number, region?: number, people?: number, blocks: number, w?: number, h?: number, port?: boolean, wild?: boolean }} LwTown
 * @typedef {{ key: number, type: number, quality?: number, factionId?: number }} LwBuilding
 * @typedef {{ id: string, town: number, slot: number, roll: 'h'|'t'|'w', name: string, gender: number, sex: 'male'|'female', race: string, variant: number, archive: number, face: number, guard: boolean, job: string, home: number|null, work: number|null, temper: 0|1|2, social: number, pious: number, drink: number, cls: number|null, level: number, faction: number, civvies?: number }} Resident
 */

/**
 * `fullName` draws from the global random stream, so it is seeded per resident and the stream is restored
 * afterward.
 * @param {number} seed
 * @param {number} bank
 * @param {number} gender
 */
export function residentName(seed, bank, gender) {
  const saved = getSeed();
  try {
    srand((seed >>> 0) || 1);
    return fullName(bank, gender);
  } finally { setSeed(saved); }
}

const TEMPER_OF = Object.freeze({
  farmer: [6, 3, 0], fisher: [6, 3, 0], carter: [6, 3, 0], hunter: [6, 3, 0], minstrel: [0, 3, 6], innkeeper: [0, 2, 6], server: [0, 2, 6], guard: [2, 6, 2], beggar: [1, 4, 3],
  adventurer: [1, 5, 3], mercenary: [1, 5, 3], sailor: [4, 4, 1], priest: [5, 4, 0],
});
const DEFAULT_TEMPER = Object.freeze([2, 7, 1]);

/**
 * @param {LwTown} town
 * @param {'h'|'t'|'w'} roll
 * @param {number} slot
 * @param {string} job
 * @param {{ home?: number|null, work?: number|null, faction?: number, gen?: number|null }} [at]
 * @returns {Resident}
 */
export function mintResident(town, roll, slot, job, at = {}) {
  const gen = at.gen ?? null;
  const seed = gen == null ? lwSeed(town.mapId >>> 0, roll.charCodeAt(0), slot) : lwSeed(town.mapId >>> 0, roll.charCodeAt(0), slot, 0x67656e, gen);
  const rng = seededRng(seed);
  const race = walkerRace(town.people, town.region);
  const guard = job === 'guard';
  const female = !guard && rng() < 0.5;
  const tables = PERSON_TEXTURES[race] ?? PERSON_TEXTURES.Breton;
  const set = female ? tables.female : tables.male;
  const variant = guard ? 0 : Math.floor(rng() * set.length);
  const faces = PERSON_FACE_RECORDS[race] ?? PERSON_FACE_RECORDS.Breton;
  const face = (female ? faces.female : faces.male)[variant] + Math.floor(rng() * NUM_PERSON_FACE_VARIANTS);
  const gender = female ? GENDERS.Female : GENDERS.Male;
  const w = TEMPER_OF[/** @type {keyof typeof TEMPER_OF} */ (job)] ?? DEFAULT_TEMPER;
  const temper = /** @type {0|1|2} */ (Number(pickWeighted(rng, { 0: w[0], 1: w[1], 2: w[2] }) ?? 1));
  const social = rng(), pious = rng(), drink = rng();
  let cls = null, level = rollInt(rng, 1, 5);
  if (job === 'adventurer') { cls = pickOf(rng, ADVENTURER_CLASSES); level = 1 + Math.floor(19 * Math.pow(rng(), 1.6)); }
  else if (job === 'mercenary') { cls = pickOf(rng, MERCENARY_CLASSES); level = rollInt(rng, 3, 14); }
  else if (job === 'courier') { cls = pickOf(rng, COURIER_CLASSES); level = rollInt(rng, 2, 8); }
  else if (job === 'hunter') { cls = pickOf(rng, HUNTER_CLASSES); level = rollInt(rng, 2, 8); }
  else if (job === 'patrol') { cls = MOBILE_TYPES.Knight; level = rollInt(rng, 6, 14); }
  else if (job === 'retainer') { cls = pickOf(rng, RETAINER_CLASSES); level = rollInt(rng, 4, 12); }
  else if (job === 'minstrel') { cls = MOBILE_TYPES.Bard; level = rollInt(rng, 2, 8); }
  else if (job === 'guard') level = rollInt(rng, 5, 15);
  return {
    id: `L${town.mapId >>> 0}.${roll === 'h' ? '' : roll}${slot}${gen == null ? '' : `~${gen}`}`,
    town: town.mapId >>> 0, slot, roll,
    name: residentName(seed ^ 0x5eed1e55, getNameBankOfRegion(town.region ?? -1), gender),
    gender, sex: female ? 'female' : 'male', race, variant,
    archive: guard ? GUARD_TEXTURE : set[variant], face, guard, job,
    // Drawn from its own `lwSeed` stream, so adding it leaves every other roll of the watchman unchanged.
    ...(guard ? { civvies: tables.male[lwSeed(seed, 0x63697673) % tables.male.length] } : {}),
    home: at.home ?? null, work: at.work ?? null, temper, social, pious, drink, cls, level, faction: at.faction ?? 0,
  };
}

/** @param {LwTown} town */
export function travellerCounts(town) {
  const b = Math.max(1, town.blocks | 0);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return {
    merchant: b >= 4 ? clamp(1 + Math.floor(b / 8), 1, 5) : (b >= 2 ? 1 : 0),
    mercenary: b >= 9 ? clamp(Math.floor(b / 8), 1, 6) : 0,
    adventurer: b >= 4 ? clamp(1 + Math.floor(b / 10), 1, 6) : 0,
    sailor: town.port ? clamp(2 + Math.floor(b / 10), 2, 6) : 0,
    pilgrim: b >= 2 ? 1 + (b >= 16 ? 1 : 0) : 0,
    courier: b >= 16 ? 1 + (b >= 36 ? 1 : 0) : 0,
    pedlar: clamp(1 + Math.floor(b / 6), 1, 6),
  };
}

const CITY = 0, HAMLET = 1, VILLAGE = 2, FARM = 3;
export const CITY_COURT_BLOCKS = 16;
/** @param {LwTown} town */
export function roadCounts(town) {
  const b = Math.max(1, town.blocks | 0);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rural = town.type === HAMLET || town.type === VILLAGE || town.type === FARM;
  const court = town.type === CITY && b >= CITY_COURT_BLOCKS;
  return {
    carter: town.type === FARM ? 1 : rural ? clamp(1 + Math.floor(b / 4), 1, 3) : 0,
    hunter: rural ? 1 : 0,
    patrol: court ? clamp(2 + Math.floor(b / 32), 2, 4) : 0,
    noble: court ? 1 : 0,
    retainer: court ? 2 : 0,
    minstrel: town.type === CITY && b >= 9 ? 1 : 0,
  };
}

/**
 * Dealt after `ROAD_JOBS` so earlier ids stay put. Never add merchants or sellswords here: sellswords are dealt to
 * merchants by count, and one more merchant moves every sellsword contract.
 * @param {LwTown} town
 */
export function moreCounts(town) {
  const b = Math.max(1, town.blocks | 0);
  return {
    pedlar: b >= 2 ? Math.max(1, Math.min(4, Math.floor(b / 6))) : 0,
    pilgrim: b >= 4 ? 1 : 0,
    courier: b >= 9 ? 1 : 0,
  };
}
export const MORE_JOBS = Object.freeze(['pedlar', 'pilgrim', 'courier']);

export const WATCH_COMPANIES = 4;
/** @param {LwTown} town */
export const watchShiftSize = (town) => {
  const b = Math.max(1, town.blocks | 0);
  return b >= 2 ? Math.max(1, Math.min(6, 1 + Math.floor(b / 9))) : 0;
};
/** @param {LwTown} town */
export const townWatchCount = (town) => WATCH_COMPANIES * watchShiftSize(town);

/**
 * @param {LwTown} town
 * @returns {Resident[]}
 */
export function travellerRoster(town) {
  const counts = travellerCounts(town);
  const out = [];
  let slot = 0;
  for (const job of TRAVELLER_JOBS) {
    for (let i = 0; i < counts[/** @type {keyof ReturnType<typeof travellerCounts>} */ (job)]; i++) out.push(mintResident(town, 't', slot++, job));
  }
  const more = roadCounts(town);
  for (const job of ROAD_JOBS) {
    for (let i = 0; i < more[/** @type {keyof ReturnType<typeof roadCounts>} */ (job)]; i++) out.push(mintResident(town, 't', slot++, job));
  }
  const again = moreCounts(town);
  for (const job of MORE_JOBS) {
    for (let i = 0; i < again[/** @type {keyof ReturnType<typeof moreCounts>} */ (job)]; i++) out.push(mintResident(town, 't', slot++, job));
  }
  return out;
}

/** @param {LwTown} town */
export function watchRoster(town) {
  const out = [];
  for (let i = 0, n = townWatchCount(town); i < n; i++) out.push(mintResident(town, 'w', i, 'guard'));
  return out;
}

/**
 * @param {LwTown} town
 * @param {readonly LwBuilding[]} buildings
 * @returns {Resident[]}
 */
export function householdCensus(town, buildings) {
  const rng = seededRng(lwSeed(town.mapId >>> 0, 0x686f));
  const list = [...(buildings ?? [])].filter((b) => b && Number.isFinite(b.key)).sort((a, b) => a.key - b.key);
  const houses = list.filter((b) => isHome(b.type));
  /** @type {{ job: string, work: number|null, faction: number, livesAt: number|null }[]} */
  const trades = [];
  for (const b of list) {
    const q = b.quality ?? 0;
    if (hasShopJob(b.type)) {
      trades.push({ job: SHOP_JOB[b.type], work: b.key, faction: b.factionId ?? 0, livesAt: null });
      if (q >= 12 && rng() < 0.5) trades.push({ job: 'helper', work: b.key, faction: b.factionId ?? 0, livesAt: null });
    } else if (b.type === BUILDING_TYPES.Tavern) {
      trades.push({ job: 'innkeeper', work: b.key, faction: b.factionId ?? 0, livesAt: b.key });
      for (let i = 0, n = q >= 12 ? 2 : 1; i < n; i++) trades.push({ job: 'server', work: b.key, faction: b.factionId ?? 0, livesAt: b.key });
    } else if (b.type === BUILDING_TYPES.Temple) {
      for (let i = 0; i < 2; i++) trades.push({ job: 'priest', work: b.key, faction: b.factionId ?? 0, livesAt: b.key });
    } else if (b.type === BUILDING_TYPES.GuildHall) {
      for (let i = 0; i < 2; i++) trades.push({ job: 'guildsman', work: b.key, faction: b.factionId ?? 0, livesAt: null });
    } else if (b.type === BUILDING_TYPES.Palace) {
      for (let i = 0; i < 2; i++) trades.push({ job: 'courtier', work: b.key, faction: b.factionId ?? 0, livesAt: b.key });
    }
  }
  /** @type {number[]} */
  const people = [];
  for (const h of houses) {
    const r = rng();
    const n = r < 0.25 ? 1 : r < 0.75 ? 2 : 3;
    for (let i = 0; i < n; i++) people.push(h.key);
  }
  const order = people.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const blocks = Math.max(1, town.blocks | 0);
  const commonJob = () => {
    const w = {
      labourer: blocks >= 9 ? 5 : 2, farmer: blocks >= 16 ? 0.5 : 5, fisher: town.port ? 3 : 0, crafter: 3, homemaker: 4,
      beggar: blocks >= 16 ? 0.6 : 0,
    };
    return pickWeighted(rng, w) ?? 'labourer';
  };
  /** @type {{ job: string, home: number|null, work: number|null, faction: number }[]} */
  const placed = [];
  let k = 0;
  for (const t of trades) {
    if (t.livesAt != null) { placed.push({ job: t.job, home: t.livesAt, work: t.work, faction: t.faction }); continue; }
    if (k < order.length) { placed.push({ job: t.job, home: people[order[k++]], work: t.work, faction: t.faction }); continue; }
    placed.push({ job: t.job, home: t.work, work: t.work, faction: t.faction });
  }
  const common = [];
  for (; k < order.length; k++) common.push({ job: commonJob(), home: people[order[k]], work: null, faction: 0 });
  const keep = placed.concat(common.slice(0, Math.max(0, CENSUS_MAX - placed.length)));
  return keep.map((p, slot) => mintResident(town, 'h', slot, p.job, { home: p.home, work: p.work, faction: p.faction }));
}

/**
 * @param {LwTown} town
 * @param {readonly LwBuilding[]} buildings
 * @param {ReadonlySet<number>|null} [opens]
 * @returns {Resident[]}
 */
export function townCensus(town, buildings, opens = null) {
  const households = householdCensus(town, buildings);
  const open = (/** @type {LwBuilding} */ b) => !opens || opens.has(b.key);
  const houses = (buildings ?? []).filter((b) => b && isHome(b.type) && open(b)).map((b) => b.key).sort((a, b) => a - b);
  const palace = (buildings ?? []).find((b) => b?.type === BUILDING_TYPES.Palace && open(b))?.key ?? null;
  const tavern = (buildings ?? []).filter((b) => b?.type === BUILDING_TYPES.Tavern && open(b)).map((b) => b.key).sort((a, b) => a - b);
  const homeOf = (r) => {
    const pick = lwSeed(r.town, r.roll.charCodeAt(0), r.slot, 0x686d);
    if (r.guard && palace != null) return palace;
    if (r.job === 'adventurer' && tavern.length && (!houses.length || (pick & 3) === 0)) return tavern[pick % tavern.length];
    return houses.length ? houses[pick % houses.length] : (tavern.length ? tavern[pick % tavern.length] : null);
  };
  const others = [...watchRoster(town), ...travellerRoster(town)].map((r) => ({ ...r, home: homeOf(r) }));
  return households.concat(others);
}
