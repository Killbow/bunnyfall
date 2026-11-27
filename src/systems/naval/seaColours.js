// @ts-check
import { SHIP_PAINTS, liveryOf } from './shipLivery.js';
import { fitFlag } from './shipFlag.js';

const P = (id) => SHIP_PAINTS.findIndex((p) => p?.id === id);
const paints = (strake, accent, sail, stain = strake) => Object.freeze({ strake: P(strake), accent: P(accent), sail: sail ? P(sail) : 0, stain: P(stain) });

export const CROWN_COLOURS = Object.freeze({
  Daggerfall: Object.freeze({ field: 'azure', border: 'gold', device: 'dagger', charge: 'gold', livery: paints('navy', 'gold', 'white') }),
  Wayrest: Object.freeze({ field: 'crimson', border: 'gold', device: 'rose', charge: 'gold', livery: paints('crimson', 'gold', 'white') }),
  Sentinel: Object.freeze({ field: 'gold', border: 'crimson', device: 'sun', charge: 'crimson', livery: paints('ochre', 'black', 'white') }),
  'the Isles': Object.freeze({ field: 'teal', border: 'argent', device: 'star', charge: 'argent', livery: paints('teal', 'white', 'white') }),
});
export const MERCHANT_HOUSES = Object.freeze([
  Object.freeze({ id: 'tanners', livery: paints('tan', 'white', 'tan'), colour: 'umber', division: 'fess', device: 'scales' }),
  Object.freeze({ id: 'greens', livery: paints('sea', 'gold', null), colour: 'vert', division: 'pale', device: 'ship' }),
  Object.freeze({ id: 'ochres', livery: paints('ochre', 'black', 'tan'), colour: 'ochre', division: 'bend', device: 'key' }),
  Object.freeze({ id: 'bays', livery: paints('bay', 'white', null), colour: 'celeste', division: 'fess', device: 'anchor' }),
  Object.freeze({ id: 'forests', livery: paints('forest', 'ochre', 'tan'), colour: 'vert', division: 'chevron', device: 'tree' }),
  Object.freeze({ id: 'oxbloods', livery: paints('oxblood', 'white', null), colour: 'sanguine', division: 'pale', device: 'chalice' }),
  Object.freeze({ id: 'greys', livery: paints('grey', 'gold', 'white'), colour: 'ash', division: 'quarterly', device: 'tower' }),
  Object.freeze({ id: 'whites', livery: paints('white', 'navy', null), colour: 'argent', division: 'bend-sinister', device: 'fish' }),
]);
export const PIRATE_CREWS = Object.freeze([
  Object.freeze({ id: 'bones', livery: paints('black', 'crimson', 'grey'), flag: Object.freeze({ shape: 'flag', field: 'sable', device: 'skull', charge: 'argent' }) }),
  Object.freeze({ id: 'blades', livery: paints('oxblood', 'black', 'tan'), flag: Object.freeze({ shape: 'flag', field: 'sable', device: 'swords', charge: 'argent' }) }),
  Object.freeze({ id: 'serpents', livery: paints('forest', 'black', 'grey'), flag: Object.freeze({ shape: 'swallowtail', field: 'sable', device: 'serpent', charge: 'vert' }) }),
  Object.freeze({ id: 'reds', livery: paints('black', 'gold', 'oxblood'), flag: Object.freeze({ shape: 'flag', field: 'sanguine', device: 'skull', charge: 'argent' }) }),
  Object.freeze({ id: 'knives', livery: paints('grey', 'crimson', null), flag: Object.freeze({ shape: 'swallowtail', field: 'sable', device: 'dagger', charge: 'crimson' }) }),
  Object.freeze({ id: 'bats', livery: paints('black', 'grey', 'black'), flag: Object.freeze({ shape: 'flag', field: 'sable', device: 'bat', charge: 'ash' }) }),
]);
export const LEGEND_COLOURS = Object.freeze({
  wake: Object.freeze({ livery: paints('grey', 'white', 'black'), flag: Object.freeze({ shape: 'swallowtail', field: 'ash', border: 'sable', device: 'raven', charge: 'sable' }) }),
  queen: Object.freeze({ livery: paints('sea', 'teal', 'grey'), flag: Object.freeze({ shape: 'flag', field: 'teal', border: 'argent', device: 'crown', charge: 'argent' }) }),
  hunger: Object.freeze({ livery: paints('crimson', 'black', 'oxblood'), flag: Object.freeze({ shape: 'flag', field: 'sanguine', border: 'sable', device: 'wolf', charge: 'gold' }) }),
  lantern: Object.freeze({ livery: paints('black', 'gold', 'ochre'), flag: Object.freeze({ shape: 'pennant', field: 'sable', border: 'gold', device: 'flame', charge: 'gold' }) }),
  regent: Object.freeze({ livery: paints('purple', 'gold', 'white'), flag: Object.freeze({ shape: 'flag', field: 'purpure', border: 'gold', device: 'crown', charge: 'gold' }) }),
  starless: Object.freeze({ livery: paints('black', 'black', 'black'), flag: Object.freeze({ shape: 'swallowtail', field: 'sable', device: 'star', charge: 'ash' }) }),
});
// Colors come from class and seed alone, so every client shows the same ship with nothing new on the wire.
export const HOUSE_SALT = 0x5ea1;
export const CREW_SALT = 0xc7e3;

export function seaPick(seed, salt, n) {
  let h = Math.imul(((seed >>> 0) ^ salt) >>> 0, 0x9e3779b1) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13;
  return n > 0 ? (h >>> 0) % n : 0;
}

/** @typedef {{ cls: { faction: string, hull: number }, seed: number, crown?: string | null, legend?: string | null, disguise?: string | null }} SeaWho */

export const houseOf = (/** @type {SeaWho} */ who) => MERCHANT_HOUSES[seaPick(who.seed, HOUSE_SALT, MERCHANT_HOUSES.length)];
export const crewOf = (/** @type {SeaWho} */ who) => PIRATE_CREWS[seaPick(who.seed, CREW_SALT, PIRATE_CREWS.length)];

export function seaLiveryOf(/** @type {SeaWho} */ who) {
  if (!who?.cls) return null;
  const legend = who.legend ? LEGEND_COLOURS[who.legend] : null;
  const f = who.cls.faction;
  const raw = legend ? legend.livery
    : f === 'navy' ? CROWN_COLOURS[who.crown ?? '']?.livery ?? null
    : f === 'merchant' ? houseOf(who).livery
    : f === 'pirate' ? (who.disguise ? houseOf(who).livery : crewOf(who).livery)
    : null;
  return raw ? liveryOf(raw, who.cls.hull) : null;
}

function merchantFlag(crown, house) {
  const c = CROWN_COLOURS[crown ?? ''];
  return c ? fitFlag({ shape: 'swallowtail', field: c.field, division: house.division, field2: house.colour, border: null, device: house.device, charge: null }) : null;
}

export function seaFlagOf(/** @type {SeaWho} */ who, colours = 'hers') {
  if (!who?.cls) return null;
  if (colours === 'false') return who.disguise ? merchantFlag(who.disguise, houseOf(who)) : null;
  if (colours !== 'hers') return null;
  const legend = who.legend ? LEGEND_COLOURS[who.legend] : null;
  if (legend) return fitFlag({ division: 'plain', border: null, ...legend.flag });
  const f = who.cls.faction;
  if (f === 'navy') {
    const c = CROWN_COLOURS[who.crown ?? ''];
    return c ? fitFlag({ shape: 'flag', field: c.field, division: 'plain', border: c.border, device: c.device, charge: c.charge }) : null;
  }
  if (f === 'merchant') return merchantFlag(who.crown, houseOf(who));
  if (f === 'pirate') return fitFlag({ division: 'plain', border: null, ...crewOf(who).flag });
  return null;
}

export const SEA_FLAG_M = 450;

/**
 * @param {Iterable<any>} entries
 * @param {number[]} at
 * @param {(e: any) => SeaWho} whoOf
 */
export function seaFlagsOf(entries, at, whoOf) {
  const out = [];
  for (const e of entries) {
    const b = e?.boat;
    if (!b || b.GameObject?.activeSelf === false) continue;
    const p = b.GameObject?.position ?? e.ship?.pos;
    if (!Array.isArray(p) || !Array.isArray(at)) continue;
    const d = Math.hypot(p[0] - at[0], p[2] - at[2]);
    if (!(d <= SEA_FLAG_M)) continue;
    const flag = seaFlagOf(whoOf(e), e.colours);
    if (flag) out.push({ boat: b, flag, phase: e.ship?.seed ?? 0, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}
