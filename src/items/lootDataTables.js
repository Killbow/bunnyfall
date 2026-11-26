// Loot icon tables from classic DaggerfallLootDataTables, re-exported by loot.js.
// This file must import nothing, so inventorySession.js can use it without loading loot.js and its import chain.

export const RANDOM_TREASURE_ARCHIVE = 216;

export const DROP_ICON_ARCHIVES = Object.freeze({
  clothing: 204, boxesNbottles: 205, combat: 207, academic: 209, misc: 211,
  randomTreasure: RANDOM_TREASURE_ARCHIVE,
});

export const RANDOM_TREASURE_ICONS = Object.freeze([0, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 37, 43, 44, 45, 46, 47]);

// Keep the classic key order: the inventory icon picker cycles archives in Map insertion order.
export const DROP_ICON_IDXS = new Map([
  [DROP_ICON_ARCHIVES.clothing, Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])],
  [DROP_ICON_ARCHIVES.boxesNbottles, Object.freeze([1, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 31, 32, 33, 34, 35, 36, 42, 43, 44])],
  [DROP_ICON_ARCHIVES.combat, Object.freeze([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16])],
  [DROP_ICON_ARCHIVES.academic, Object.freeze([0, 1, 2, 3, 5, 6, 7, 8, 10])],
  [DROP_ICON_ARCHIVES.misc, Object.freeze([2, 49, 51, 57])],
  [DROP_ICON_ARCHIVES.randomTreasure, Object.freeze([0, 1, 3, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 43, 44, 45, 46, 47])],
]);
