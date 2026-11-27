// @ts-check
// Imports nothing so the headless item law on the account service can load these rows; `soulCake.js` adds the names
// and pictures.

// Indexes must equal `SOUL_CAKE_TEMPLATE` and `HEARTH_OFFERING_TEMPLATE` in `festivalLaw.js`.
export const SOUL_CAKE_LAW_ROW = Object.freeze({
  index: 2000, baseWeight: 0.05, hitPoints: 1, basePrice: 0, rarity: 20, bound: true, stackable: true, packOnly: true,
});
export const HEARTH_OFFERING_LAW_ROW = Object.freeze({
  index: 2001, baseWeight: 2, hitPoints: 100, basePrice: 0, rarity: 20, bound: true, stackable: true, packOnly: true,
});
