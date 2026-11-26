// @ts-check

export const TEMPLATES = Object.freeze({
  Spellbook: 132,
  Soul_trap: 274,
  Letter_of_credit: 275,
  Potion_recipe: 278,
  House_Deed: 285,
  Ship_Deed: 286,
  Map: 287,
  Glass_Bottle: 83,
  Torch: 247,
  Lantern: 248,
  Bandage: 249,
  Oil: 252,
  Candle: 253,
  Parchment: 279,
  Holy_candle: 269,
  Arrow: 131,
  Helm: 107,
});

export const isLightSource = (it) =>
  (it?.group === 'UselessItems2' && (it.templateIndex === TEMPLATES.Torch
    || it.templateIndex === TEMPLATES.Lantern || it.templateIndex === TEMPLATES.Candle))
  || (it?.group === 'ReligiousItems' && it.templateIndex === TEMPLATES.Holy_candle);

// A potion uses the Glass_Bottle template, as in Daggerfall Unity.
export const isPotion = (it) => it?.group === 'UselessItems1' && it.templateIndex === TEMPLATES.Glass_Bottle;
