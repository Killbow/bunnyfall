// @ts-check
// FALL.EXE map tables with no file reads, so the account service can import them without bundling a BSA reader.

export const MAX_MAP_PIXEL_X = 1000;
export const MAX_MAP_PIXEL_Y = 500;

export const REGION_NAMES = Object.freeze([
  "Alik'r Desert", 'Dragontail Mountains', 'Glenpoint Foothills', 'Daggerfall Bluffs',
  'Yeorth Burrowland', 'Dwynnen', 'Ravennian Forest', 'Devilrock',
  'Malekna Forest', 'Isle of Balfiera', 'Bantha', "Dak'fron",
  'Islands in the Western Iliac Bay', 'Tamarilyn Point', 'Lainlyn Cliffs', 'Bjoulsae River',
  'Wrothgarian Mountains', 'Daggerfall', 'Glenpoint', 'Betony', 'Sentinel', 'Anticlere', 'Lainlyn', 'Wayrest',
  'Gen Tem High Rock village', 'Gen Rai Hammerfell village', 'Orsinium Area', 'Skeffington Wood',
  'Hammerfell bay coast', 'Hammerfell sea coast', 'High Rock bay coast', 'High Rock sea coast',
  'Northmoor', 'Menevia', 'Alcaire', 'Koegria', 'Bhoriane', 'Kambria', 'Phrygias', 'Urvaius',
  'Ykalon', 'Daenia', 'Shalgora', 'Abibon-Gora', 'Kairou', 'Pothago', 'Myrkwasa', 'Ayasofya',
  'Tigonus', 'Kozanset', 'Satakalaam', 'Totambu', 'Mournoth', 'Ephesus', 'Santaki', 'Antiphyllos',
  'Bergama', 'Gavaudon', 'Tulune', 'Glenumbra Moors', 'Ilessan Hills', 'Cybiades',
]);

export const REGION_RACES = Object.freeze([
  1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1,
  0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0,
  0, 1,
]);

export const CLIMATES = Object.freeze({
  Ocean: 223,
  Desert: 224,
  Desert2: 225,
  Mountain: 226,
  Rainforest: 227,
  Swamp: 228,
  Subtropical: 229,
  MountainWoods: 230,
  Woodlands: 231,
  HauntedWoodlands: 232,
});
