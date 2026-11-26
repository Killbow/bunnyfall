// @ts-check
// Imports nothing so the headless item law on the account service can load this row; `weirKey.js` adds the name and
// picture.

export const WEIR_KEY_TEMPLATE = 575;
// Template 575 must stay listed in `BOUND_TEMPLATES` in `realmTradeLaw.js`; `packOnly` is set because
// `restackWeirKeys` reads only the pack.
export const WEIR_KEY_LAW_ROW = Object.freeze({
  index: WEIR_KEY_TEMPLATE, baseWeight: 0.25, hitPoints: 1000, basePrice: 500, rarity: 20, bound: true, stackable: true,
  packOnly: true,
});
