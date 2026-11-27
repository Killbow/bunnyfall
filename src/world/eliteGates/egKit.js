// @ts-check

// These share each band archive with the `EG_DRESS` records (0, 1, 2, 4, 31, 32, 33, and 56), so the numbers must
// not overlap.
export const EG_KIT_RECORD = Object.freeze({
  shaft: 60,
  moulding: 61,
  voussoir: 62,
  relief: 63,
  banner: 64,
  coffer: 65,
  statue: 66,
  fixture: 67,
  found: 68,
  wreck: 69,
  crystal: 70,
  inlay: 71,
  chain: 81,
});
/** @type {ReadonlyArray<number>} */
export const EG_KIT_RECORDS = Object.freeze(Object.values(EG_KIT_RECORD));

export const EG_KIT_STYLE = Object.freeze([
  Object.freeze({ column: 'fluted', capital: 'scroll', cornice: 'egg-and-dart', arch: 'round', statue: 'battlemage', fixture: 'tripod', found: 'courses', hanging: 'chandelier', among: null, sigil: 'star', wreck: Object.freeze(['rotunda', 'belltower', 'arcade', 'spiral']) }),
  Object.freeze({ column: 'bone', capital: 'skull', cornice: 'skulls', arch: 'pointed', statue: 'mourner', fixture: 'lantern', found: 'ossuary', hanging: 'cage', among: 'obelisk', sigil: 'gem', wreck: Object.freeze(['tomb', 'crypt', 'gem', 'sunken']) }),
  Object.freeze({ column: 'glass', capital: 'crescent', cornice: 'facets', arch: 'lancet', statue: 'raven', fixture: 'moonlamp', found: 'stalactites', hanging: 'shards', among: 'thorns', sigil: 'crescent', wreck: Object.freeze(['thorntower', 'shard', 'observatory', 'shard']) }),
  Object.freeze({ column: 'basalt', capital: 'spiked', cornice: 'straps', arch: 'squat', statue: 'dremora', fixture: 'basket', found: 'prisms', hanging: 'girders', among: 'pylon', sigil: 'dagon', wreck: Object.freeze(['siegetower', 'wargate', 'crag', 'crag']) }),
]);
export const egKitStyle = (band) => EG_KIT_STYLE[Math.max(0, Math.min(3, band | 0))];

// Scales only the drawn sprite; the body `scale` from `EG_LORDS` stays the size the relay and the client hit target
// use.
export const EG_LORD_PRESENCE = Object.freeze({ lord: 1.6, valkynaz: 1.8, champion: 1.4 });
