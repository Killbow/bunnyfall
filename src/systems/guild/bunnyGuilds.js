// @ts-check
// BUNNY-GUILDS (Phase 0a, 2026-10-30, the owner: "start on phase 0"): BUNNYFALL'S OWN GUILDS - who they are, and which
// house in a town is each one's hall.
//
// Seven guilds Daggerfall never had, online only (offline stays classic Daggerfall). Each is a faction of its own,
// numbered past every FACTION.TXT id so no record of the game's can be taken for one.
//
// A HALL IS A CONVERTED HOUSE (the owner's call): Daggerfall's towns have no building type for these guilds, so each
// town gives a few of its ordinary houses (House1-House4, no faction, a room inside) to the guilds it draws - more the
// bigger it is, every guild in a capital (bunnyHallPick). The pick is the town's own: the same houses, in the same order, seeded by the town, so
// every client names the same door. A town keeps HOUSES_LEFT houses at least for its people, so a hamlet holds fewer
// guilds, or none.
//
// The hall is stamped where Daggerfall stamps a guild on a building: its record's `factionId`, at the one merge every
// building list is drawn from (talkTopics.js drawNamedBuildings). Daggerfall does the same for the Thieves Guild's and
// the Dark Brotherhood's hideouts, which are ordinary House2 residences carrying their guild's faction.
//
// Pure: no DOM, no network. `isOnlinePage` is read once a call, from the page's own address.

import { isOnlinePage } from '../online/onlineLane.js';
import { BUNNY_GUILD_LAW } from '../../net/bunnyGuildLaw.js';
import { registerCustomFaction, FACTION_TYPES, GUILD_GROUPS, SOCIAL_GROUPS } from '../../formats/factionFile.js';
import { t } from '../textManager.js';

/** Houses a town keeps for its people after its guilds take theirs. */
export const HOUSES_LEFT = 6;

/** The titles of ranks 0 to 9, lowest first (8 and 9 are a chapter's seats). */
const RANKS = Object.freeze({
  adventurers: ['Wanderer', 'Sellsword', 'Pathfinder', 'Delver', 'Trailblazer', 'Veteran', 'Vanguard', 'Champion', 'Warden', 'Paragon'],
  bards: ['Busker', 'Minstrel', 'Troubadour', 'Balladeer', 'Lyricist', 'Skald', 'Virtuoso', 'Maestro', 'Loremaster', 'Archbard'],
  cartographers: ['Scribe', 'Surveyor', 'Draughtsman', 'Wayfinder', 'Chartmaker', 'Navigator', 'Geographer', 'Explorer', 'Master Cartographer', 'Grand Cartographer'],
  merchants: ['Peddler', 'Hawker', 'Trader', 'Broker', 'Factor', 'Merchant', 'Financier', 'Magnate', 'Trade Lord', 'Lord'],
  hunters: ['Beater', 'Tracker', 'Trapper', 'Stalker', 'Hunter', 'Huntsman', 'Slayer', 'Beastmaster', 'Master of the Hunt', 'Lodgemaster'],
  apothecaries: ['Herb Gatherer', 'Mortar Hand', 'Mixer', 'Brewer', 'Distiller', 'Apothecary', 'Physician', 'Alchemist', 'Master Apothecary', 'Grand Apothecary'],
  artisans: ['Apprentice', 'Journeyman', 'Craftsman', 'Fabricator', 'Artificer', 'Artisan', 'Master Craftsman', 'Mastersmith', 'Grandmaster', 'Manderville'],
});

/** BUNNY-GUILDS (2026-10-30, the owner: "the new guilds looking like houses"): each guild's arms (net/heraldryLaw.js's
 *  shape), hung as two banners beside its hall's door (scenes/bunnyHallBanners.js) - a converted house told from its
 *  street, as a Company's hall is. */
const ARMS = Object.freeze({
  adventurers: { field: 'azure', border: 'gold', device: 'swords' },
  bards: { field: 'purpure', border: 'gold', device: 'rose' },
  cartographers: { field: 'teal', border: 'argent', device: 'star' },
  merchants: { field: 'gold', border: 'sable', device: 'scales' },
  hunters: { field: 'vert', border: 'umber', device: 'bow' },
  apothecaries: { field: 'celeste', border: 'argent', device: 'chalice', charge: 'sable' },
  artisans: { field: 'umber', border: 'ochre', device: 'anvil' },
});
/** A guild's arms by its faction id, or null. */
export const bunnyHallArms = (/** @type {unknown} */ factionId) => {
  const g = BY_FACTION_ID.get(/** @type {number} */ (factionId));
  return g ? /** @type {Record<string, any>} */ (ARMS)[g.key] ?? null : null;
};
const BY_FACTION_ID = new Map(BUNNY_GUILD_LAW.map((g) => [g.factionId, g]));

/** Each guild's name in the player's language (literal keys, so tools/l10nExtract.mjs finds them). */
const NAMES = Object.freeze({
  adventurers: () => t('bguild.adventurers.name', 'Adventurers Guild'),
  bards: () => t('bguild.bards.name', "Bards' College"),
  cartographers: () => t('bguild.cartographers.name', "Cartographers' Society"),
  merchants: () => t('bguild.merchants.name', "Merchants' League"),
  hunters: () => t('bguild.hunters.name', "Hunters' Lodge"),
  apothecaries: () => t('bguild.apothecaries.name', "Apothecaries' Guild"),
  artisans: () => t('bguild.artisans.name', "Artisans' Guild"),
});

/**
 * The guilds (net/bunnyGuildLaw.js, the law both ends read), in the order a town gives out its houses, each with its
 * name in the player's language and its ranks' titles.
 */
export const BUNNY_GUILDS = Object.freeze(BUNNY_GUILD_LAW.map((g) => Object.freeze({
  key: g.key, factionId: g.factionId,
  get name() { return /** @type {Record<string, () => string>} */ (NAMES)[g.key]?.() ?? g.name; },
  ranks: Object.freeze([.../** @type {Record<string, string[]>} */ (RANKS)[g.key]]),
})));

const BY_FACTION = new Map(BUNNY_GUILDS.map((g) => [g.factionId, g]));
const BY_KEY = new Map(BUNNY_GUILDS.map((g) => [g.key, g]));

/** The guild a faction id is, or null. */
export const bunnyGuildOfFaction = (/** @type {unknown} */ factionId) => BY_FACTION.get(/** @type {number} */ (factionId)) ?? null;
/** The guild of a key ('adventurers'), or null. */
export const bunnyGuildOfKey = (/** @type {unknown} */ key) => BY_KEY.get(/** @type {string} */ (key)) ?? null;
/** Whether a building is one of these guilds' halls - its record carries a Bunnyfall faction. */
export const isBunnyHall = (/** @type {{ factionId?: number } | null | undefined} */ bd) => BY_FACTION.has(bd?.factionId ?? 0);

/** Whether the guilds stand on this page: online only. */
export const bunnyGuildsOn = (search = undefined) => isOnlinePage(search);

/** DFLocation.BuildingTypes House1-House4 (world/buildingNames.js BUILDING_TYPES; written here because that module
 *  names halls through this one). */
const HOUSE1 = 17, HOUSE4 = 20, PALACE = 16;
/** A house a hall can be: a residence with no guild of its own already, and a room inside. */
const hallCandidate = (/** @type {{ buildingType: number, factionId?: number }} */ d, /** @type {boolean} */ hasRoom) =>
  hasRoom && d.buildingType >= HOUSE1 && d.buildingType <= HOUSE4 && (d.factionId ?? 0) === 0;

/** A small, steady hash (FNV-1a over the numbers), so the pick is the same on every client. */
function seedOf(/** @type {number[]} */ nums) {
  let h = 0x811c9dc5;
  for (const n of nums) {
    let v = n >>> 0;
    for (let i = 0; i < 4; i++) { h ^= v & 0xff; h = Math.imul(h, 0x01000193) >>> 0; v >>>= 8; }
  }
  return h >>> 0;
}

/** How many halls a town holds, by its size (its houses that could be halls): `[least houses, fewest, most]`, the
 *  biggest band first. A capital (a town with a palace and CAPITAL_HOUSES houses or more) holds every guild. */
export const HALL_TIERS = Object.freeze([[50, 4, 6], [25, 2, 4], [12, 1, 2], [8, 0, 1]]);
export const CAPITAL_HOUSES = 40;

/** How many halls a town of `houses` holds, `palace` whether it has one, drawn by `seed`. */
export function hallCountOf(/** @type {number} */ houses, /** @type {boolean} */ palace, /** @type {number} */ seed) {
  if (palace && houses >= CAPITAL_HOUSES) return BUNNY_GUILDS.length;
  const tier = HALL_TIERS.find(([least]) => houses >= least);
  if (!tier) return 0;
  const [, lo, hi] = tier;
  return lo + (seed % (hi - lo + 1));
}

/**
 * Which guild each candidate house gets, as `buildingKey -> factionId`. `houses` is the town's candidate houses, each
 * `{ buildingKey }`, in any order; the town is named by `locationIndex` and its own houses, so two towns with the same
 * index in different regions still differ. CITIES DIFFER (the owner: "not every city will have the same halls"): a town
 * holds a few halls by its size (hallCountOf) - a capital all of them - and WHICH guilds is the town's own draw, so a
 * player travels to find every service. Never fewer than HOUSES_LEFT houses are left to the town's people.
 *
 * @param {{ buildingKey: number }[]} houses
 * @param {number} locationIndex
 * @param {{ palace?: boolean }} [o]
 * @returns {Map<number, number>}
 */
export function bunnyHallPick(houses, locationIndex, { palace = false } = {}) {
  const out = new Map();
  const free = [...new Set(houses.map((h) => h.buildingKey))].sort((a, b) => a - b);
  if (!free.length) return out;
  const seed = seedOf([locationIndex, free.length, free[0], free[free.length - 1]]);
  const count = Math.min(hallCountOf(free.length, palace, seed), free.length - HOUSES_LEFT);
  if (count <= 0) return out;
  // the town's own order of the guilds: each ranked by its own draw from the town's seed
  const order = [...BUNNY_GUILDS].sort((g1, g2) => seedOf([seed, g1.factionId, 7]) - seedOf([seed, g2.factionId, 7]));
  for (const g of order.slice(0, count)) {
    const at = seedOf([seed, g.factionId]) % free.length;
    out.set(free[at], g.factionId);
    free.splice(at, 1);
  }
  return out;
}

/**
 * Stamp the halls onto a location's merged building lists (talkTopics.js drawNamedBuildings's `out`, one list per block
 * instance), in place. Online only; offline the lists are left as Daggerfall drew them.
 *
 * @param {Map<any, Array<{ buildingType: number, factionId?: number }>>} merged block instance -> its merged list
 * @param {Array<{ x?: number, y?: number, dfBlock: any }>} blocks the location's block instances, in order
 * @param {object} opts
 * @param {number} [opts.locationIndex]
 * @param {(block: any, recordIndex: number) => number} opts.keyOf the building key of a block's record
 * @param {(block: any, recordIndex: number) => boolean} opts.hasRoom whether that record has a room inside
 * @param {(block: any) => number} opts.countOf how many records of the block are buildings
 * @param {string} [opts.search] the page's query, for tests
 */
export function stampBunnyHalls(merged, blocks, { locationIndex = 0, keyOf, hasRoom, countOf, search = undefined }) {
  if (!bunnyGuildsOn(search)) return 0;
  /** @type {{ buildingKey: number, rec: { factionId?: number } }[]} */
  const houses = [];
  let palace = false;
  for (const b of blocks) {
    const list = merged.get(b) ?? [];
    const count = Math.min(list.length, countOf(b));
    for (let i = 0; i < count; i++) {
      const d = list[i];
      if (d?.buildingType === PALACE) palace = true;
      if (d && hallCandidate(d, hasRoom(b, i))) houses.push({ buildingKey: keyOf(b, i), rec: d });
    }
  }
  const pick = bunnyHallPick(houses, locationIndex, { palace });
  for (const h of houses) {
    const f = pick.get(h.buildingKey);
    if (f) h.rec.factionId = f;
  }
  return pick.size;
}

/** DFLocation.BuildingTypes.GuildHall. */
const GUILD_HALL = 11;
/** The type a building keeps its hours and its people by: a hall of these guilds is a guild hall, whatever house it was. */
export const hallTypeOf = (/** @type {{ buildingType?: number, factionId?: number } | null | undefined} */ bd) =>
  (isBunnyHall(bd) ? GUILD_HALL : bd?.buildingType ?? -1);

/**
 * Phase 0c: the guilds as factions of the player's dictionary - DFU's own door for a mod's faction (FactionFile
 * .RegisterCustomFaction, which every fresh dictionary takes in), so a reputation with one is kept, saved and carried
 * onto the Roll as any guild's is. Online only, and before the dictionary is built at the load. A Group of no guild
 * group: Daggerfall's guild code never takes them for one of its own.
 */
export function installBunnyGuilds(search = undefined) {
  if (!bunnyGuildsOn(search)) return 0;
  let n = 0;
  for (const g of BUNNY_GUILD_LAW) {
    if (registerCustomFaction(g.factionId, { parent: 0, type: FACTION_TYPES.Group, name: g.name, ggroup: GUILD_GROUPS.None, sgroup: SOCIAL_GROUPS.GuildMembers, power: 10 })) n++;
  }
  return n;
}
