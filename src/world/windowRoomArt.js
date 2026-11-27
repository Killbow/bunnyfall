// @ts-check
// The rooms seen behind house windows, painted from numbers: palettes and patterns, no raster.

export const ROOM_TEXELS_PER_M = 12;

export const ROOM_COLOR_SLOTS = Object.freeze(['wall', 'wall2', 'wainscot', 'floor', 'floor2', 'ceiling', 'beam', 'furniture']);

export const ROOM_PATTERNS = Object.freeze({ wall: Object.freeze(['plaster', 'stripes', 'stone', 'boards']), floor: Object.freeze(['planks', 'flags', 'tiles']) });

export const ROOM_STYLES = Object.freeze([
  Object.freeze({ name: 'plaster and oak', colors: [[182, 160, 124], [168, 146, 112], [96, 64, 40], [118, 82, 50], [104, 72, 44], [150, 128, 98], [78, 52, 32], [70, 46, 28]], pattern: [0, 0, 1, 1] }),
  Object.freeze({ name: 'whitewash and flags', colors: [[196, 190, 172], [184, 178, 160], [120, 112, 98], [112, 108, 100], [92, 88, 82], [176, 170, 154], [96, 72, 48], [84, 58, 36]], pattern: [0, 1, 0, 1] }),
  Object.freeze({ name: "merchant's green", colors: [[92, 112, 78], [104, 124, 88], [70, 52, 36], [126, 92, 58], [110, 80, 50], [160, 142, 110], [84, 60, 40], [64, 40, 26]], pattern: [1, 0, 1, 0] }),
  Object.freeze({ name: 'red ochre', colors: [[150, 78, 54], [138, 70, 48], [84, 52, 34], [104, 70, 44], [90, 60, 38], [140, 112, 84], [70, 46, 30], [58, 36, 22]], pattern: [0, 2, 1, 1] }),
  Object.freeze({ name: 'blue paper', colors: [[80, 96, 132], [104, 120, 158], [64, 48, 34], [132, 98, 64], [116, 84, 54], [172, 160, 136], [88, 64, 44], [72, 48, 30]], pattern: [1, 0, 1, 0] }),
  Object.freeze({ name: 'stone hall', colors: [[128, 124, 116], [112, 108, 100], [90, 84, 76], [96, 92, 86], [80, 76, 70], [110, 98, 84], [70, 50, 34], [80, 56, 34]], pattern: [2, 1, 0, 1] }),
  Object.freeze({ name: 'bare timber', colors: [[138, 104, 70], [124, 92, 60], [100, 72, 46], [110, 78, 48], [96, 68, 42], [120, 90, 60], [74, 52, 32], [66, 44, 26]], pattern: [3, 0, 0, 1] }),
  Object.freeze({ name: 'yellow lime', colors: [[200, 176, 112], [186, 162, 100], [108, 78, 50], [140, 120, 96], [70, 60, 50], [184, 170, 140], [92, 66, 42], [76, 52, 32]], pattern: [0, 2, 1, 0] }),
]);

export const ROOM_PIECES = Object.freeze(['none', 'bed', 'table', 'shelf', 'hearth', 'painting', 'wardrobe']);

export const ROOM_FABRICS = Object.freeze([[140, 40, 36], [52, 82, 120], [168, 128, 52], [74, 104, 62], [118, 60, 110], [196, 170, 110]]);

export const ROOM_LIT_SHARE = 0.62;
export const ROOM_CURTAIN_SHARE = 0.5;
export const ROOM_HEARTH_GLOW = Object.freeze([255, 120, 40]);

const pick = (seed, n) => Math.min(n - 1, Math.max(0, Math.floor(seed * n)));
export const roomStyleOf = (seed) => pick(seed, ROOM_STYLES.length);
export const roomPieceOf = (seed) => pick(seed, ROOM_PIECES.length);
export const roomFabricOf = (seed) => pick(seed, ROOM_FABRICS.length);
export const roomLitAt = (seed) => seed < ROOM_LIT_SHARE;
export const roomCurtained = (seed) => seed < ROOM_CURTAIN_SHARE;

export function roomColorTable() {
  const out = [];
  for (const s of ROOM_STYLES) for (const c of s.colors) out.push(c);
  return out;
}
