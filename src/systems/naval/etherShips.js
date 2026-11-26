// @ts-check
import { mulberry32 } from '../../combat/bloodArt.js';
import { classById, shipNames } from './navalShips.js';
import { BANDS, LEAGUE_PX, VEIL_X, veilhaven, etherHash, etherRng, inEther, compassPoint } from '../../world/ethericSea.js';

export const ISLES_FLAG = 'the Isles';
const PIRATE_FIRSTS = ['Gloam', 'Void', 'Starving', 'Pale', 'Ashen', 'Hollow', 'Black', 'Sable', 'Crooked', 'Mourning', 'Weeping', 'Amber', 'Drowned', 'Grim', 'Red', 'Last'];
const PIRATE_LASTS = ['Reaver', 'Cutter', 'Tide', 'Lantern', 'Gull', 'Wind', 'Fang', 'Blade', 'Aurora', 'Wraith', 'Psalm', 'Comet', 'Star', 'Tern', 'Mercy', 'Shard'];
const MERCHANT_FIRSTS = ['Amber', 'Starglass', 'Patient', 'Silver', 'Quiet', 'Dawn', 'Voidsilk', 'Faithful', 'Morning', 'Gentle', 'Far', 'Willow', 'Golden', 'Lucky', 'Bright', 'Steady'];
const MERCHANT_LASTS = ['Wind', 'Maiden', 'Tide', 'Wanderer', 'Swan', 'Fortune', 'Trader', 'Rose', 'Shoal', 'Glass', 'Aether', 'Harbour', 'Lantern', 'Heron', 'Promise', 'Gull'];
const twoWords = (firsts, lasts) => Object.freeze(firsts.flatMap((a) => lasts.map((b) => `${a} ${b}`)));
export const ETHER_PIRATE_NAMES = twoWords(PIRATE_FIRSTS, PIRATE_LASTS);
export const ETHER_MERCHANT_NAMES = twoWords(MERCHANT_FIRSTS, MERCHANT_LASTS);
// The name has its own salt, so it never shifts the captain's name or any other draw on the seed.
export const ETHER_NAME_SALT = 0xe7a3e;
/** @param {any} cls @param {number} seed */
export function etherShipNames(cls, seed) {
  const legend = legendOfClass(cls?.id);
  if (legend) return { name: legend.name, captain: legend.captain, crown: null };
  const captain = shipNames(cls, seed, { regionIndex: 17 }).captain;
  const list = cls?.faction === 'merchant' ? ETHER_MERCHANT_NAMES : ETHER_PIRATE_NAMES;
  const r = mulberry32(((seed >>> 0) ^ ETHER_NAME_SALT) >>> 0);
  return { name: list[Math.floor(r() * list.length) % list.length], captain, crown: null };
}
export const etherFlagOf = (cls) => (cls?.faction === 'merchant' ? ISLES_FLAG : null);

export const ETHER_FACTION_WEIGHTS = Object.freeze({ pirate: 30, merchant: 45 });
export const ETHER_PORT_WEIGHTS = Object.freeze({ merchant: 30, pirateK: 0.5 });
export function etherFactionWeights(band, { nearPort = false } = {}) {
  const w = { pirate: ETHER_FACTION_WEIGHTS.pirate * (band?.pirate ?? 1), merchant: ETHER_FACTION_WEIGHTS.merchant };
  if (nearPort) { w.merchant += ETHER_PORT_WEIGHTS.merchant; w.pirate *= ETHER_PORT_WEIGHTS.pirateK; }
  return w;
}

/** @typedef {{ id: string, name: string, captain: string, classId: string, band: string, trait: string, purse: number, lore: string }} Legend */
/** @type {readonly Legend[]} */
export const LEGENDS = Object.freeze([
  Object.freeze({ id: 'wake', name: "Sorrow's Wake", captain: 'Ysolde the Unmourned', classId: 'legendWake', band: 'reaches', trait: 'swift', purse: 2500, lore: 'The fastest hull afloat. It runs down whatever it hunts and runs from nothing.' }),
  Object.freeze({ id: 'queen', name: 'The Drowned Queen', captain: 'Maraveth, Thrice Drowned', classId: 'legendQueen', band: 'reaches', trait: 'mends', purse: 3000, lore: 'Sunk and raised by the aether three times. Its timbers repair themselves between broadsides.' }),
  Object.freeze({ id: 'hunger', name: 'Ninefold Hunger', captain: 'Ghorvak Ninefold', classId: 'legendHunger', band: 'deep', trait: 'boarders', purse: 5000, lore: 'A galley packed rail to rail with hands who board, and board again.' }),
  Object.freeze({ id: 'lantern', name: 'The Lantern-Eater', captain: 'the Hooded Pilot', classId: 'legendLantern', band: 'deep', trait: 'night', purse: 5500, lore: 'It sails only at night, shows no light, and hunts ships that do.' }),
  Object.freeze({ id: 'regent', name: 'The Pale Regent', captain: 'Lord Aumbrel the Pale', classId: 'legendRegent', band: 'abyss', trait: 'gunnery', purse: 9000, lore: 'Its gunners have not missed in a hundred years.' }),
  Object.freeze({ id: 'starless', name: 'The Starless', captain: 'no one living', classId: 'legendStarless', band: 'abyss', trait: 'veiled', purse: 12000, lore: 'Black sails under a black sky. Even a spyglass can\'t find it until it is right on top of you.' }),
]);
export const LEGEND_MEND_PER_S = 0.004;
export const LEGEND_MEND_QUIET_S = 8;
export const LEGEND_RELOAD_K = 0.7;
export const LEGEND_VEIL_K = 0.35;
export const LEGEND_RISE_DAYS = 30;
export const LEGEND_CHANCE = 0.3;
export const LEGEND_SALT = 0x1e6e;
export const HAUNT_PX = 36;
export const HAUNT_SPREAD = Object.freeze({ reaches: 60, deep: 160, abyss: 320 });
export const ABYSS_HAUNT_LEAGUES = 120;

export const legendById = (id) => LEGENDS.find((l) => l.id === id) ?? null;
export const legendOfClass = (classId) => LEGENDS.find((l) => l.classId === classId) ?? null;
export const legendClass = (legend) => classById(legend?.classId);

/** @type {Map<string, { px: number, py: number }>} */
const _haunts = new Map();
// Seeded by the legend alone, so every client places her haunt in the same sea.
/** @param {Legend} legend */
export function hauntOf(legend) {
  const hit = _haunts.get(legend.id);
  if (hit) return hit;
  const i = BANDS.findIndex((b) => b.id === legend.band);
  const band = BANDS[Math.max(0, i)];
  const next = BANDS[i + 1];
  const from = band.from + HAUNT_PX / LEAGUE_PX, to = (next ? next.from : band.from + ABYSS_HAUNT_LEAGUES) - HAUNT_PX / LEAGUE_PX;
  const r = etherRng(etherHash(LEGEND_SALT, LEGENDS.indexOf(legend), 3));
  const leagues = from + (Math.max(from, to) - from) * r();
  const spread = HAUNT_SPREAD[legend.band] ?? HAUNT_SPREAD.reaches;
  const at = { px: Math.round(VEIL_X - leagues * LEAGUE_PX), py: Math.round(veilhaven().py + (r() * 2 - 1) * spread) };
  _haunts.set(legend.id, at);
  return at;
}
export const legendSails = (endedDay, day) => !Number.isFinite(endedDay) || (day | 0) - (endedDay | 0) >= LEGEND_RISE_DAYS;
export function legendAt(px, py) {
  if (!inEther(px, py)) return null;
  let best = null, bd = Infinity;
  for (const l of LEGENDS) {
    const h = hauntOf(l);
    const d = Math.max(Math.abs(h.px - px), Math.abs(h.py - py));
    if (d <= HAUNT_PX && d < bd) { bd = d; best = l; }
  }
  return best;
}
export const legendAbroad = (legend, { night = false } = {}) => legend?.trait !== 'night' || !!night;

/**
 * @param {Legend} legend
 * @param {{ px: number, py: number }} from
 * @param {{ endedDay?: number|null, day?: number }} [o]
 */
export function rumourOf(legend, from, { endedDay = null, day = 0 } = {}) {
  if (!legendSails(endedDay, day)) {
    const ago = Math.max(0, (day | 0) - (endedDay | 0));
    return `${legend.name} went down ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}. They say the aether will raise it again.`;
  }
  const h = hauntOf(legend);
  const dx = h.px - from.px, dy = h.py - from.py;
  const far = Math.hypot(dx, dy) / LEAGUE_PX;
  const night = legend.trait === 'night' ? ' By night.' : '';
  if (far < 0.5) return `${legend.name} has been seen hereabouts.${night}`;
  const leagues = Math.max(1, Math.round(far));
  return `${legend.name} has been seen some ${leagues} ${leagues === 1 ? 'league' : 'leagues'} ${compassPoint(dx, dy)} of here.${night}`;
}
