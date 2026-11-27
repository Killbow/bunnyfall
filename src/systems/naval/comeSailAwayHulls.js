// Leaf module: the account server reads this table, so it must not import the boat renderer.
export const HULL_NAMES = Object.freeze(['Rowboat', 'Large Boat', 'Small Ship', 'Large Galley', 'Carrack']);
export const HULL_PRICES = Object.freeze([4000, 8000, 100000, 200000, 150000]);
export const HULL_WEIGHTS = Object.freeze([30, 120, 2400, 48000, 240000]);
export const VARIANT_NAMES = Object.freeze(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
export const PACKED_WEIGHT_MAX = HULL_WEIGHTS[1];
export const packedHullWeight = (hull) => Math.min(HULL_WEIGHTS[hull], PACKED_WEIGHT_MAX);
// An item's `message` is hull * 10 + variant.
export const hullFromMessage = (message) => Math.trunc(message / 10) % 10;
