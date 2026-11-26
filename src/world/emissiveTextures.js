// This table matches the DFU emissive texture table, which leaves out archive 101 record 10 and record 5 of
// archives 380 and 434. The emission map reuses the albedo with no tint.

const EMISSIVE = new Map([
  [87, [0]],
  [101, [2, 3, 5, 6, 7, 8, 9, 11, 12]],
  [190, [3, 4, 5]],
  [200, [7, 8, 9, 10]],
  [202, [2]],
  [208, [2]],
  [210, [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29]],
  [253, [10, 17, 18, 19, 22, 41, 48, 49, 50, 51, 52, 75, 77]],
  [273, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]],
  [278, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]],
  [280, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]],
  [281, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]],
  [290, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]],
  [356, [0, 2, 3]],
  [375, [0, 1]],
  [376, [0, 1]],
  [377, [0, 1]],
  [378, [0, 1]],
  [379, [0, 1]],
  [380, [3]],
  [400, [3, 2]],
  [405, [2]],
  [434, [3]],
  [473, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]],
]);

// Archive 356 builds its emission from the fire wall colors instead of the albedo, and only for the classic
// texture, never a vendor replacement.
export const FIRE_WALLS_ARCHIVE = 356;
export const FIRE_WALL_COLOR = Object.freeze([0.706, 0.271, 0.086]);
export const FIRE_WALL_SCALE = 0.3;

export function isEmissiveArchive(archive) {
  return EMISSIVE.has(archive);
}

export function isEmissive(archive, record) {
  const records = EMISSIVE.get(archive);
  return records ? records.includes(record) : false;
}
