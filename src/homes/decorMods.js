// @ts-check
// Every town mod piece stays in the catalog whatever is switched on, so no name or number moves with a switch.
// Whether a piece is offered is checked when it is offered, because the switches change mid-game.

import {
  townBedOf, TOWN_BED_COLOURS, TOWN_PAINTINGS, RMBRP_ROCKS, RMBRP_STALLS, RMBRP_HILLS, TOWN_CROP_FIELDS,
  CITY_WALL_PIECE, TOWN_CLUTTER, TOWN_CLUTTER_ARCHIVE, TOWN_GARDEN, TOWN_GARDEN_ARCHIVE, ROSYS_PICTURES,
} from '../world/townStandIns.js';
import { DET_FLAT_STAND_INS, DET_FLAT_DRAWINGS, DET_TOWN_FLATS, DET_OLD_ARCHIVES, DET_DOLPHIN_RECORDS, DET_PICTURES } from '../world/detStandIns.js';
import { TOWN_PICTURES } from '../world/townPictures.js';
import { DETAILED_SHIPS_DERIVED } from '../systems/naval/detailedShips.js';
import { customAliasFor, hasCustomModel } from '../world/customModels.js';
import { hasTextureReplacement } from '../render/textureReplacement.js';
import { decorKey, isDecorModEntry } from './decorCatalogue.js';

// Counts are how many times the mods place each piece, measured over their blocks in the player's BLOCKS.BSA.
export const DECOR_MOD_ROOMS = Object.freeze({
  models: Object.freeze({
    42069: 347, 42070: 162, 42071: 302, 42072: 185, 42073: 162, 42074: 113, 42075: 217, 42076: 238, 42077: 301,
    42078: 273, 42079: 136, 42080: 173, 42081: 249, 42082: 259, 42083: 295, 42084: 216, 42085: 186, 42086: 215,
    45008: 8, 45023: 8, 45024: 10, 45029: 4, 45034: 6, 45044: 16, 45059: 20, 45060: 14, 45065: 7, 45070: 8,
    45081: 10015, 45082: 452, 45110: 29252, 45111: 284, 45112: 93, 45114: 60, 45120: 36, 45121: 9, 45129: 4892,
    45134: 14, 45135: 89, 45136: 110, 45137: 137, 45138: 55, 45139: 44, 45140: 21, 45141: 12, 45142: 19, 45143: 20,
    45144: 25, 45145: 25, 45146: 12, 45147: 20, 45148: 16, 45150: 20, 45151: 30, 45152: 16, 45153: 24, 45154: 56,
    45155: 16, 45156: 32, 45157: 40, 45158: 62, 45159: 122, 45160: 35, 45161: 60, 45162: 76, 45163: 138, 45164: 38,
    45169: 42, 45190: 548, 45191: 363, 45192: 14, 45194: 8,
    69420: 37, 69421: 50, 69422: 71, 69423: 85, 69424: 123, 69425: 25, 69426: 98, 69427: 77, 69428: 65, 69429: 186,
    69430: 82, 69431: 83, 69432: 208, 69433: 49, 69434: 49, 69435: 115, 69436: 78, 69437: 111, 69440: 84, 69441: 186,
    69444: 81, 69445: 153, 69446: 33, 69447: 81, 69448: 35, 69449: 40, 69450: 22, 69451: 106, 69452: 32, 69453: 48,
    69454: 47, 69455: 29, 69456: 97, 69457: 37, 69458: 43, 69459: 24, 69460: 36, 69461: 72, 69462: 47, 69463: 109,
    69464: 120, 69467: 29, 69468: 139, 69469: 98, 69471: 160, 69472: 160,
    79010: 67, 79011: 57, 79012: 55, 79013: 69, 79014: 24, 79015: 93, 79016: 32, 79017: 89, 79018: 105, 79019: 27,
    79020: 55, 79021: 15, 79022: 9, 79023: 25, 79024: 21, 79025: 34, 79026: 107, 79027: 49, 79028: 19, 79029: 71,
    79030: 60,
  }),
  flats: Object.freeze({
    '1210_1': 2, '1210_3': 1, '1210_4': 1, '1210_8': 1, '1210_10': 166, '1210_11': 170, '1210_12': 113, '1210_17': 145,
    '1210_18': 22, '1210_19': 40, '1210_20': 45, '1230_30': 2,
    '10009_14': 12, '10010_36': 16, '10010_38': 8, '10010_40': 32, '10010_73': 103, '10010_74': 6, '10010_75': 11,
    '10010_77': 64, '10010_78': 65, '10021_0': 120, '10021_1': 130, '10021_2': 159, '10021_3': 126, '10021_4': 237,
    '10021_5': 17, '10021_6': 196, '10021_7': 471, '10021_8': 351, '10021_9': 46, '10021_10': 193, '10021_11': 24,
    '10021_12': 273, '10021_13': 251, '10021_14': 175, '10021_15': 152, '10021_16': 21, '10021_17': 300, '10021_22': 1,
    '10021_27': 1, '10022_4': 24, '10023_0': 11, '10024_2': 19, '10025_0': 37, '10025_2': 25, '10025_3': 146,
    '10027_0': 204, '10027_1': 47, '10027_3': 5, '10027_4': 1, '10027_5': 1, '10027_6': 8, '10027_7': 2, '10027_8': 4,
    '10027_9': 2, '10027_10': 4, '10027_11': 1, '10027_12': 1, '10027_13': 1, '10027_14': 1, '10028_4': 12,
    '56790_1': 13, '56790_2': 328, '56790_3': 151, '56790_4': 136, '56790_5': 24, '56790_7': 213, '56790_8': 289,
    '56790_9': 73, '56790_10': 122, '56790_11': 152, '56790_12': 186, '56790_13': 75, '56790_14': 45, '56790_16': 251,
    '56790_18': 133, '56790_19': 353, '56790_20': 259, '56790_21': 353, '56790_22': 533, '56790_23': 299,
    '56790_24': 237, '56790_25': 602,
  }),
});
export const DECOR_MOD_STREETS = Object.freeze({
  models: Object.freeze({
    45170: 14,
    53006: 2, 53012: 4, 53014: 3, 53017: 1, 53020: 1, 53023: 10, 53029: 18, 53030: 20, 53031: 18, 53032: 7, 53033: 14,
    53035: 6, 53036: 7, 53037: 30, 53038: 58, 53039: 20, 53040: 13, 53042: 1, 53054: 3, 53064: 3, 53083: 4, 53085: 1,
    53086: 1,
    53100: 2, 53101: 1, 53102: 2, 53103: 3, 53104: 2, 53106: 1, 53107: 2, 53108: 3, 53109: 1, 53113: 2, 53115: 1,
    53117: 1, 53118: 2, 53121: 3, 53122: 1, 53123: 3, 53124: 2,
  }),
  flats: Object.freeze({
    '10010_3': 16, '10010_4': 22, '10010_5': 12, '10010_6': 9, '10010_15': 59, '10010_16': 51, '10010_17': 54,
    '10010_18': 27, '10010_19': 15, '10010_20': 7, '10010_22': 9, '10010_23': 16, '10010_24': 16, '10010_25': 6,
    '10010_42': 363, '10010_43': 487, '10010_44': 1607, '10010_46': 321, '10010_47': 430, '10010_48': 654,
    '10010_49': 53, '10010_50': 596, '10010_51': 6, '10010_52': 5, '10024_0': 6, '10024_1': 5,
    '10035_1': 20, '10035_2': 16, '10035_3': 31, '10035_4': 29, '10035_5': 14, '10035_6': 13, '10035_7': 28,
  }),
});
export const DECOR_MOD_TWINS = Object.freeze({ 45113: 45112, 45087: 45121, 45115: 45114, 45122: 45120 });
export const DECOR_MOD_LEFT_OUT = Object.freeze({
  hills: Object.freeze(Object.keys(RMBRP_HILLS).map(Number)),
  structure: Object.freeze([53160, 53170, 53182, 53187, 53194, 53140, 53141, 53142, 53143, 53144, CITY_WALL_PIECE, 45074, 45076, 45077]),
  fields: Object.freeze(Object.keys(TOWN_CROP_FIELDS).map(Number)),
  sea: Object.freeze(DET_DOLPHIN_RECORDS.map((r) => `10009_${r}`)),
});

const words = (name) => name.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, (c) => c.toUpperCase());
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MODEL_NAMES = Object.freeze({
  45081: 'Wooden pillar', 45110: 'Wooden pillar', 45111: 'Wooden pillar', 45112: 'Wooden pillar', 45129: 'Stone pillar',
  45082: 'Ensign staff', 45114: 'Stump', 45120: 'Flower pot', 45121: 'Wind vane', 45169: 'Column drum', 45170: 'Column head',
  45190: 'Sea chest', 45191: 'Weapon rack',
});
const OWN_ART_NAMES = Object.freeze({ '1210_10': 'Green bottle', '1210_11': 'Blue bottle', '1210_12': 'Brown bottle', '1230_30': 'Statuette' });

export function decorModFlatSource(archive, record) {
  const a = DET_OLD_ARCHIVES[archive] ?? archive;
  const det = DET_FLAT_STAND_INS[a]?.[record] ?? DET_TOWN_FLATS[a]?.[record] ?? null;
  if (det) return [det[0], det[1]];
  if (a === TOWN_CLUTTER_ARCHIVE) return TOWN_CLUTTER[record] ? [...TOWN_CLUTTER[record]] : null;
  if (a === TOWN_GARDEN_ARCHIVE) return TOWN_GARDEN[record] ? [...TOWN_GARDEN[record]] : null;
  const derived = DETAILED_SHIPS_DERIVED[`${a}_${record}-0`];
  return derived?.from ? [derived.from[0], derived.from[1]] : null;
}

// Names come from tables alone, never from a switch or a built model, so a piece is named while its mod is off.
export function decorModNaming(what) {
  if (what.model != null) {
    const id = what.model;
    const bed = townBedOf(id);
    if (bed) return { base: `${capital(TOWN_BED_COLOURS[bed.colour].name)} bed`, as: bed.model };
    if (TOWN_PAINTINGS[id]) return { base: 'Painting', as: id };
    if (RMBRP_ROCKS[id]) return { base: 'Boulder', as: id };
    if (RMBRP_STALLS[id]) return { base: 'Market stall', as: id };
    if (MODEL_NAMES[id]) return { base: MODEL_NAMES[id], as: id };
    const pic = DET_PICTURES[id] ?? ROSYS_PICTURES[id];
    return { base: pic != null ? capital(TOWN_PICTURES[pic]?.name ?? '') || null : null, as: id };
  }
  const [archive, record] = what.flat;
  const k = `${archive}_${record}`;
  if (OWN_ART_NAMES[k]) return { base: OWN_ART_NAMES[k], as: archive === 1210 ? 205 : archive };
  const drawn = DET_FLAT_DRAWINGS[DET_OLD_ARCHIVES[archive] ?? archive]?.[record];
  if (drawn) return { base: words(drawn[0]), as: archive };
  const from = decorModFlatSource(archive, record);
  return { base: null, as: from ? from[0] : archive };
}

export function decorModLive(what) {
  if (what.model != null) return !!(customAliasFor(what.model) || hasCustomModel(what.model));
  return hasTextureReplacement(what.flat[0], what.flat[1]);
}

export const DECOR_MODS_LIVE_S = 1;
/**
 * @param {readonly any[]|null} entries
 * @param {(what: any) => boolean} [live]
 */
export function decorModsLive(entries, live = decorModLive) {
  const out = new Set();
  for (const e of entries ?? []) if (isDecorModEntry(e) && live(e)) out.add(e.key);
  return out;
}

/** @param {Map<string, any>} [into] */
export function addDecorMods(into = new Map()) {
  const put = (what, count, from) => {
    const key = decorKey(what);
    if (into.has(key)) return;
    into.set(key, { ...what, count, from, ...decorModNaming(what) });
  };
  for (const { table, from } of [{ table: DECOR_MOD_ROOMS, from: 'mod' }, { table: DECOR_MOD_STREETS, from: 'modstreet' }]) {
    for (const [id, count] of Object.entries(table.models)) put({ model: Number(id), flat: null }, count, from);
    for (const [k, count] of Object.entries(table.flats)) put({ model: null, flat: k.split('_').map(Number) }, count, from);
  }
  return into;
}
