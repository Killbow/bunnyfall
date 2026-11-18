// @ts-check
// BUNNYFALL (2026-11-18, the owner: "Every day the server picks 8 dungeons and makes them elite dungeons, with a big
// glowing crystal on top in the world, visible, and a purple glow around them. If in two days these dungeons are not
// cleared they begin a new purple zone around them that spreads until it's cleansed. These special elite dungeons have,
// inside, a series of Cromwark enemies that need to be killed for the cleanse to count, and then Sifrit spawns as a boss
// ... Clearing this dungeon adds 50 Nyx coins to the Nyx coins counter. The dungeon's walls and atmosphere should also
// change to be more purple."): DAILY ELITE DUNGEONS - the law both ends read.
//
//   - THE PICK: on the first read of each UTC day the account service picks ED_DAILY dungeons (server-account/src/
//     eliteDungeons.js) from its pool of sites (labyrinths, keeps and ruins of at least ED_SITE_MIN_BLOCKS blocks, never
//     in Cromwark's region, never a main-story dungeon, never a cemetery - edSiteOk), hashed from the day and a seed the
//     service keeps, never one already standing. While ED_ACTIVE_MAX stand uncleansed, fewer rise (none at the cap).
//   - THE SPREAD: one not cleansed ED_GRACE_DAYS whole days after its pick begins a purple zone about it, ED_SPREAD_START_PX
//     map pixels across and ED_SPREAD_PX_DAY more each day, up to ED_SPREAD_MAX_PX (edSpreadPx). Inside it foes wear
//     Cromwark's purple and strike ED_CORRUPT_FOE_MULT harder.
//   - INSIDE: the dungeon's foes are Cromwark's (the reach's high tiers, ED_FOE_RING's pool - systems/wild/wildDungeons.js
//     WILD_HALL_FOES), an elite dungeon's three at each marker (world/spawnedDungeons.js), ED_FOE_HEALTH_MULT and
//     ED_FOE_DAMAGE_MULT over what the elite dungeon makes them. ED kills (edKillsNeeded)
//     call the summon; the service names one summoner, whose game stands SIFRIT, boosted (ED_SIFRIT_*).
//   - THE CLEANSE: her fall, claimed by a player who asked for the summon, at least ED_FIGHT_MIN_S after it - once a
//     dungeon, the first claim: ED_REWARD_NYX Dusk Tokens on the claimant's count (the realm's Nyx counter), the crystal,
//     the glow and the spread gone.
//
// Pure: no clock, no DOM, no network. Every number is balance.

/** The dungeons picked each UTC day. */
export const ED_DAILY = 8;
/** The most standing uncleansed at once: a day picks only up to this. */
export const ED_ACTIVE_MAX = 32;
/** Whole days after its pick that an uncleansed dungeon begins to spread. */
export const ED_GRACE_DAYS = 2;
/** The spread (map pixels, a radius): its first day's, each day's more, and its cap. */
export const ED_SPREAD_START_PX = 1;
export const ED_SPREAD_PX_DAY = 0.75;
export const ED_SPREAD_MAX_PX = 6;
/** Inside a spread: how much harder a foe strikes. */
export const ED_CORRUPT_FOE_MULT = 1.15;
/** The cleanse's reward: Dusk Tokens on the claimant's count. */
export const ED_REWARD_NYX = 50;
/** The least time between the summon and a cleanse claimed for it (s) - she is not felled faster. */
export const ED_FIGHT_MIN_S = 60;
/** A summon this old (s) with no cleanse lets the next asker stand her again (a summoner who left, a party wiped). */
export const ED_RESUMMON_S = 600;
/** A site's least dungeon blocks (a one-room ruin holds no series of foes). */
export const ED_SITE_MIN_BLOCKS = 8;
/** The location types a site may be: DungeonLabyrinth, DungeonKeep, DungeonRuin (formats/mapsFile.js LOCATION_TYPES). */
export const ED_SITE_TYPES = Object.freeze([4, 7, 10]);

// ── INSIDE ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The Cromwark ring whose high tiers stand in an elite dungeon (systems/wild/wildDungeons.js WILD_HALL_FOES). */
export const ED_FOE_RING = 3;
export const ED_FOE_HEALTH_MULT = 1.5;
export const ED_FOE_DAMAGE_MULT = 1.25;
/** THE SERIES: the share of the dungeon's foes to fell before she comes, at least ED_KILLS_MIN (all, where fewer stand),
 *  at most ED_KILLS_MAX. */
export const ED_KILL_SHARE = 0.6;
export const ED_KILLS_MIN = 8;
export const ED_KILLS_MAX = 30;

// ── SIFRIT, ELITE (systems/sifrit/sifritLaw.js is her own; these stand over it in an elite dungeon alone) ─────────────
/** Her health and her blows (melee and every telegraphed one: a blow's weight is her damage times its shape's) over her own. */
export const ED_SIFRIT_HEALTH_MULT = 1.25;
export const ED_SIFRIT_DAMAGE_MULT = 1.6;
/** MORE AOES: a Grave Ring of her own every ED_SIFRIT_RING_EVERY_S in a fight (two thirds that under half her health),
 *  wound up ED_SIFRIT_RING_WINDUP_S - besides the ones she throws as she always does. */
export const ED_SIFRIT_RING_EVERY_S = 12;
export const ED_SIFRIT_RING_WINDUP_S = 2.0;
/** HER SUMMONS: Cromwark's foes (ED_FOE_RING's pool), ED_SIFRIT_SUMMON_N every ED_SIFRIT_SUMMON_EVERY_S (a quarter faster
 *  under half her health), never more than ED_SIFRIT_SUMMONS_MAX of hers standing, ED_SIFRIT_SUMMON_RING metres off. */
export const ED_SIFRIT_SUMMON_EVERY_S = 11;
export const ED_SIFRIT_SUMMON_N = 2;
export const ED_SIFRIT_SUMMONS_MAX = 6;
export const ED_SIFRIT_SUMMON_RING = Object.freeze([4, 9]);

// ── THE LOOK ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The crystal and the glow, seen from this many map pixels round (Chebyshev). */
export const ED_SEEN_PX = 5;
/** The map's and the glow's purple. */
export const ED_CSS = '#b05cff';
export const ED_RGB = Object.freeze([0.69, 0.36, 1.0]);

// ── KEYS AND SITES ────────────────────────────────────────────────────────────────────────────────────────────────────
const KEY_RE = /^(\d{1,6}):(\d{1,3})$/;
/** An instance's key: its pick's day and slot. */
export const edKey = (/** @type {number} */ day, /** @type {number} */ slot) => `${day}:${slot}`;
/** A key read back - `{ day, slot }` - or null. @param {unknown} key */
export function edKeyOf(key) {
  const m = typeof key === 'string' ? KEY_RE.exec(key) : null;
  return m ? { day: Number(m[1]), slot: Number(m[2]) } : null;
}
/** A dungeon's place key (its region and its location index in MAPS.BSA). */
export const edPlaceKey = (/** @type {number} */ region, /** @type {number} */ location) => `${region}:${location}`;

/** May this dungeon be an elite dungeon? @param {{ regionIndex: number, wildRegion: number, locationType: number,
 *  dungeonType: number, blocks: number, mainStory: boolean }} s */
export function edSiteOk(s) {
  return !!s && s.regionIndex !== s.wildRegion && ED_SITE_TYPES.includes(s.locationType) && s.dungeonType !== 18 && s.blocks >= ED_SITE_MIN_BLOCKS && !s.mainStory;
}

/** A small hash (the same on every machine): uint32 from three numbers. */
export function edHash(/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ c) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((c | 0) + 0x165667b1, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * THE DAY'S PICKS: `want` site indices out of `siteCount`, hashed from `day` and `seed`, never one in `taken` (the
 * standing ones' indices) nor twice. Fewer only where the pool runs out.
 * @param {number} day @param {number} seed @param {number} siteCount @param {Set<number>} taken @param {number} [want]
 */
export function edPickSites(day, seed, siteCount, taken, want = ED_DAILY) {
  const out = [];
  if (!(siteCount > 0)) return out;
  const used = new Set(taken);
  for (let slot = 0; slot < want && used.size < siteCount; slot++) {
    let i = edHash(day, seed, slot) % siteCount;
    while (used.has(i)) i = (i + 1) % siteCount;
    used.add(i);
    out.push(i);
  }
  return out;
}
/** How many a day picks while `standing` stand uncleansed. */
export const edWantToday = (/** @type {number} */ standing) => Math.max(0, Math.min(ED_DAILY, ED_ACTIVE_MAX - Math.max(0, standing | 0)));

/** THE SPREAD's radius (map pixels) on `today` for one picked on `pickDay` - 0 inside the grace. */
export function edSpreadPx(/** @type {number} */ pickDay, /** @type {number} */ today) {
  const past = today - pickDay - ED_GRACE_DAYS;
  if (!(past >= 0)) return 0;
  return Math.min(ED_SPREAD_MAX_PX, ED_SPREAD_START_PX + ED_SPREAD_PX_DAY * past);
}
/** Days left before a dungeon picked on `pickDay` begins to spread (0: it spreads). */
export const edGraceLeft = (/** @type {number} */ pickDay, /** @type {number} */ today) => Math.max(0, pickDay + ED_GRACE_DAYS - today);

/** THE SERIES: how many of `total` foes must fall before she comes. */
export function edKillsNeeded(/** @type {number} */ total) {
  const n = Math.max(0, total | 0);
  if (n <= ED_KILLS_MIN) return n;
  return Math.max(ED_KILLS_MIN, Math.min(ED_KILLS_MAX, Math.round(n * ED_KILL_SHARE)));
}

/**
 * An entry as the service answers it, read back: `{ key, day, slot, region, location, px, py, name, spread }` with every
 * field in bounds, or null. `today` the service's day (for its spread).
 * @param {any} raw @param {number} today
 */
export function edEntryOf(raw, today) {
  const k = edKeyOf(raw?.key);
  if (!k) return null;
  const int = (/** @type {any} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => (Number.isSafeInteger(v) && v >= lo && v <= hi ? v : null);
  const region = int(raw.region, 0, 255), location = int(raw.location, 0, 65535), px = int(raw.px, 0, 999), py = int(raw.py, 0, 499);
  if (region == null || location == null || px == null || py == null) return null;
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 48) : '';
  return { key: raw.key, day: k.day, slot: k.slot, region, location, px, py, name, spread: edSpreadPx(k.day, today) };
}
