// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 5 (docs/FARM-EXPANSION.md section 6): SWORN BEASTS ON THE FARM - a sworn revenant of a
// beast kind may be STATIONED at one of the farm's beast posts, and there it does the work its kind suits. The farm keeps
// them in the garden JSON (`garden.stations`), so every member and visitor reads who stands where; the character's own
// record keeps `companion.station` (systems/revenant/revenantCompanions.js stationRevenant).
//
//   - WHO: a mobile type this table knows (the base game's beasts and Enemy Expansion's). The kind, rank, name and art are
//     the client's word - as the farm's place is today (a friends' server) - bounded here to real values.
//   - HOW MANY: STATION_MAX a farm, STATION_PER_CHARACTER a character across the Company's farms (the service counts the
//     latter over the Company's gardens: `characterStationed`).
//   - WHAT EACH DOES (`role`), while it stands, scaled by its RANK (rankScale: +20% a rank above the first):
//       herd    wolf, snow wolf, hell hound, werewolf - the herd's contentment kept up (HERD_KEEP a day, herdLaw.js), and the
//               birds take no care from a crop (their toll capped at nothing)
//       plough  grizzly bear - the PLOUGHING game: a whole row of up to PLOUGH_BEDS untilled beds hoed at once, +care
//       truffle boar, wereboar - a mushroom harvest may turn up a truffle (food:truffle, the pantry's 740)
//       silk    spider - Spider Silk (hide:spider, the loom's thread) into the Stores each day
//       guano   giant bat, bat - its own guano: +1 care on a bed sown (+2 from rank 4)
//       compost rat - the sty's manure heap grows one a day
//       glass   dragonling - the GREENHOUSE: up to GLASS_BEDS beds may grow crops of any climate, and winter does not slow them
//       ward    sabertooth tiger - the prowler's ward (Phase 6): it stands; nothing yet
//       pest    giant scorpion - the blight warden (Phase 6): it stands; nothing yet
//   Crops pause and animals never die (design rule 4): a stationed beast is never lost - it only works or idles.
// Pure: no clock, no network. Every number is balance, tunable here.
import { MOBILE_TYPES as M } from '../../characters/mobileTypes.js';

// 2026-11-20, a player (relayed by the owner: "a collaborative effort, maybe 4 people, should reach the cap"): four a character, so five
// people fill a Company's eighteen posts; the retinue's six still counts them, so a player keeps at least two sworn beasts with them
export const STATION_MAX = 6, STATION_PER_CHARACTER = 4, STATION_POSTS = 6;
/** The herd's daily contentment a herding beast adds (herdLaw.js contentAt), and the most all of them add. */
export const HERD_KEEP = 5, HERD_KEEP_MAX = 20;
export const PLOUGH_BEDS = 6, GLASS_BEDS = 4, TRUFFLE_CHANCE = .2, TRUFFLE_MAX = .6, DAILY_BANK_DAYS = 3;
export const TRUFFLE = 'food:truffle', SILK = 'hide:spider';
/** Daggerfall Enemy Expansion's beasts by their ids (its MonsterBase.mdb.csv: 260 Bat, 262 Wolf, 263 Snow Wolf, 264 Hell
 *  Hound, 278 Boar) - read without its install, as net/professionLaw.js does. */
const DEX = Object.freeze({ Bat: 260, Wolf: 262, SnowWolf: 263, HellHound: 264, Boar: 278 });

/** @typedef {'herd'|'plough'|'truffle'|'silk'|'guano'|'compost'|'glass'|'ward'|'pest'} StationRole */
/** The beasts that may be stationed: by mobile type id, a key (its words) and its role. */
export const STATION_KINDS = Object.freeze(/** @type {Record<number, { key: string, role: StationRole }>} */ ({
  [M.GrizzlyBear]: { key: 'grizzly', role: 'plough' },
  [M.SabertoothTiger]: { key: 'sabertooth', role: 'ward' },
  [M.Spider]: { key: 'spider', role: 'silk' },
  [M.GiantScorpion]: { key: 'scorpion', role: 'pest' },
  [M.Werewolf]: { key: 'werewolf', role: 'herd' },
  [M.Wereboar]: { key: 'wereboar', role: 'truffle' },
  [M.Dragonling]: { key: 'dragonling', role: 'glass' },
  [M.Dragonling_Alternate]: { key: 'dragonling', role: 'glass' },
  [M.Rat]: { key: 'rat', role: 'compost' },
  [M.GiantBat]: { key: 'bat', role: 'guano' },
  [DEX.Bat]: { key: 'bat', role: 'guano' },
  [DEX.Wolf]: { key: 'wolf', role: 'herd' },
  [DEX.SnowWolf]: { key: 'snowwolf', role: 'herd' },
  [DEX.HellHound]: { key: 'hound', role: 'herd' },
  [DEX.Boar]: { key: 'boar', role: 'truffle' },
}));
/** A beast kind's entry, or null (a person, an orc, an undead, a daedra: never stationed). */
export const stationKind = (mobileType) => (Number.isInteger(mobileType) ? STATION_KINDS[mobileType] ?? null : null);
export const isStationBeast = (mobileType) => !!stationKind(mobileType);
/** The kind's words in English; the client puts them through the text core. */
export const KIND_WORDS = Object.freeze({ grizzly: 'grizzly bear', sabertooth: 'sabertooth tiger', spider: 'spider', scorpion: 'giant scorpion', werewolf: 'werewolf', wereboar: 'wereboar', dragonling: 'dragonling', rat: 'rat', bat: 'bat', wolf: 'wolf', snowwolf: 'snow wolf', hound: 'hell hound', boar: 'boar' });
/** What a role is doing, in a line's words ("... ploughing."). */
export const ROLE_WORDS = Object.freeze({ herd: 'minding the herd', plough: 'ploughing', truffle: 'rooting for truffles', silk: 'spinning silk', guano: 'roosting over the beds', compost: 'turning the compost', glass: 'warming the greenhouse', ward: 'keeping the prowlers off', pest: 'watching for blight' });
/** The revenant arts a station row may carry (systems/revenant/revenantArts.js ARTS). */
const ARTS = Object.freeze(['mending', 'warding', 'warcry', 'siphon', 'barrage', 'nova']);

/** Output scale by rank (1..5): 1 at the first, +20% each. */
export const rankScale = (rank) => 1 + .2 * (Math.max(1, Math.min(5, Math.floor(Number(rank)) || 1)) - 1);

/** @returns {any[]} the garden's stationed beasts */
export const stationsOf = (garden) => (Array.isArray(garden?.stations) ? garden.stations : []);
const ofRole = (garden, role) => stationsOf(garden).filter((s) => STATION_KINDS[s.kind]?.role === role);
/** The role's total scale across the beasts standing in it (0 with none). */
const roleScale = (garden, role) => ofRole(garden, role).reduce((n, s) => n + rankScale(s.rank), 0);

/** The herd's contentment a day the herding beasts add. */
export const herdKeep = (garden) => Math.min(HERD_KEEP_MAX, HERD_KEEP * roleScale(garden, 'herd'));
/** Whether a herding beast stands guard on the crops: the birds take no care. */
export const birdsWarded = (garden) => ofRole(garden, 'herd').length > 0;
/** Whether a ploughing beast stands at the farm. */
export const ploughReady = (garden) => ofRole(garden, 'plough').length > 0;
/** The chance a mushroom harvest turns up a truffle. */
export const truffleChance = (garden) => Math.min(TRUFFLE_MAX, TRUFFLE_CHANCE * roleScale(garden, 'truffle'));
/** The care a bed sown gains from the roosting bat: 0, 1, or 2 from rank 4. */
export const guanoCare = (garden) => { const bats = ofRole(garden, 'guano'); return !bats.length ? 0 : bats.some((s) => s.rank >= 4) ? 2 : 1; };
/** Whether a dragonling warms the greenhouse, and how many beds are under glass now. */
export const greenhouse = (garden) => ofRole(garden, 'glass').length > 0;
export const glassBedsIn = (garden) => Object.values(garden?.beds ?? {}).filter((b) => b?.crop && b.glass === 1).length;
/** Whether the greenhouse has room for one more bed under glass. */
export const glassRoom = (garden) => greenhouse(garden) && glassBedsIn(garden) < GLASS_BEDS;

/** A stable 0..1 for (map, bed, time), for the truffle's roll. */
export function truffleRoll(mapId, bed, nowS) {
  let h = (Math.imul((mapId >>> 0) || 1, 0x9e3779b1) ^ Math.imul(bed | 0, 0x85ebca6b) ^ Math.imul(Math.floor(nowS) | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/** A harvest's extras from the stationed beasts: [{ material, qty }]. Today: a boar's truffle from a mushroom bed. */
export function harvestExtras(garden, harvest, mapId, bed, nowS) {
  if (harvest.crop !== 'mushroom') return [];
  const p = truffleChance(garden);
  return p > 0 && truffleRoll(mapId, bed, nowS) < p ? [{ material: TRUFFLE, qty: 1 }] : [];
}

/**
 * THE DAYS GONE BY: the silk the spiders spun and the heaps the rats turned since the garden last counted (a UTC day each,
 * at most DAILY_BANK_DAYS banked), added to a copy. Answers { garden, deposit: [{ material, qty }] } - the garden itself
 * when nothing is due. The first count only starts the clock: nothing is back-paid.
 */
export function stationDaily(garden, nowS) {
  const stations = stationsOf(garden);
  if (!stations.length) return { garden, deposit: [] };
  const day = Math.floor(nowS / 86400), last = Number.isSafeInteger(garden.stationDay) ? garden.stationDay : day;
  const days = Math.max(0, Math.min(DAILY_BANK_DAYS, day - last));
  if (last === day && garden.stationDay === day) return { garden, deposit: [] };
  const next = structuredClone(garden); next.stationDay = day;
  const deposit = [];
  if (days > 0) {
    const silk = Math.round(days * roleScale(garden, 'silk'));
    if (silk > 0) deposit.push({ material: SILK, qty: silk });
    const heaps = Math.round(days * roleScale(garden, 'compost'));
    if (heaps > 0) next.manure = Math.min(20, (next.manure ?? 0) + heaps);   // herdLaw.js MANURE_MAX
  }
  return { garden: next, deposit };
}

/** One entry of the stations list is well formed. */
const okEntry = (s) => !!s && typeof s === 'object'
  && typeof s.player === 'string' && s.player.length >= 1 && s.player.length <= 64
  && typeof s.character === 'string' && s.character.length >= 1 && s.character.length <= 64
  && typeof s.revenantId === 'string' && s.revenantId.length >= 1 && s.revenantId.length <= 64
  && Number.isSafeInteger(s.kind) && !!STATION_KINDS[s.kind]
  && typeof s.name === 'string' && s.name.length >= 1 && s.name.length <= 60
  && Number.isSafeInteger(s.rank) && s.rank >= 1 && s.rank <= 5
  && (s.art === null || s.art === undefined || (typeof s.art === 'string' && ARTS.includes(s.art)))
  && Number.isSafeInteger(s.post) && s.post >= 0 && s.post < STATION_POSTS
  && Number.isFinite(s.since) && s.since >= 0;
/** Whether a garden's stations are well formed (absent is fine): at most STATION_MAX, no post or revenant twice. */
export function validStations(garden) {
  if (garden.stationDay !== undefined && !(Number.isSafeInteger(garden.stationDay) && garden.stationDay >= 0)) return false;
  if (garden.stations === undefined) return true;
  const list = garden.stations;
  return Array.isArray(list) && list.length <= STATION_MAX && list.every(okEntry)
    && new Set(list.map((s) => s.post)).size === list.length && new Set(list.map((s) => s.revenantId)).size === list.length;
}

/** How many beasts this character has stationed in `gardens` (the Company's farms' gardens). */
export const characterStationed = (gardens, character) => gardens.reduce((n, g) => n + stationsOf(g).filter((s) => s.character === character).length, 0);

/**
 * STATION or RECALL one beast. `act` 'station' takes { who, character, revenantId, kind, name, rank, art, post } (all the
 * client's word but `who` and `character`, which the service sets, and each bounded); 'recall' takes { who, character,
 * revenantId } - a beast comes home only at its own owner's call. `elsewhere` how many the character has at the Company's
 * other farms (the service's count). Answers { garden, worked: [], station | recalled } or an error.
 */
export function stepFarmStation(garden, { act, who, character, revenantId, kind, name, rank, art, post, elsewhere = 0 }, nowS) {
  const list = stationsOf(garden);
  if (act === 'recall') {
    const at = list.findIndex((s) => s.revenantId === revenantId);
    if (at < 0) return { error: 'farm-station-none' };
    if (list[at].player !== who || list[at].character !== character) return { error: 'farm-station-theirs' };
    const next = structuredClone(garden); next.stations = list.filter((_, i) => i !== at);
    if (!next.stations.length) delete next.stations;
    return { garden: next, worked: [], recalled: { revenantId, name: list[at].name } };
  }
  if (act !== 'station') return { error: 'farm-station-bad' };
  const entry = { player: String(who ?? ''), character: String(character ?? ''), revenantId, kind, name: typeof name === 'string' ? name.trim().slice(0, 60) : name, rank, art: art ?? null, post, since: Math.floor(nowS) };
  if (!okEntry(entry)) return { error: 'farm-station-bad' };
  if (list.some((s) => s.revenantId === revenantId)) return { error: 'farm-station-bad' };
  if (list.some((s) => s.post === post)) return { error: 'farm-station-post' };
  if (list.length >= STATION_MAX) return { error: 'farm-station-full' };
  if (list.filter((s) => s.character === character).length + Math.max(0, elsewhere | 0) >= STATION_PER_CHARACTER) return { error: 'farm-station-limit' };
  const next = structuredClone(garden); next.stations = [...list, entry];
  if (!list.length || !Number.isSafeInteger(next.stationDay)) next.stationDay = Math.floor(nowS / 86400);   // the daily clock starts with the first beast
  return { garden: next, worked: [], station: entry };
}

/** The garden without the stations of anyone who is no longer in the Company (`isMember(player, character)`): a beast whose
 *  keeper has left comes home on their next load (the record's side: revenantCompanions.js reconcileStations). */
export function pruneStations(garden, isMember) {
  const list = stationsOf(garden), kept = list.filter((s) => isMember(s.player, s.character));
  if (kept.length === list.length) return garden;
  const next = structuredClone(garden);
  if (kept.length) next.stations = kept; else delete next.stations;
  return next;
}
