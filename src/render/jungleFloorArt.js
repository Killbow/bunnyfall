// @ts-check
import { fitSprite, meadowSpriteBox, buildMeadowAtlas, buildMeadowMips, cardMeasures, MEADOW_SLOTS, MEADOW_GREEN, MEADOW_LUSH, MEADOW_PATCH_SCALE, MEADOW_BLADES_PER_TUFT } from './grassMeadow.js';
import { MEADOW_SPRITES } from './meadowArt.js';
import { ladderPick, heightFloor, heightSpan, LAB_GRASS } from './labGrass.js';
import { smoothstep } from '../world/mathf.js';

export const JUNGLE_FLOOR_ARCHIVE = 500;
// Atlas order. A record is an archive 500 picture, or null for the tall meadow tuft, and `judged` holds the share
// at the poor and the lush end of a patch.
const JUDGED_PLANTS = [
  { name: 'grass', record: null, height: 0.5, stiff: 1, sway: 1, grass: true, judged: [0.42, 0.3] },
  { name: 'sedge', record: 7, height: 0.5, stiff: 1, sway: 1, grass: true, judged: [0.16, 0.1] },
  { name: 'fern', record: 9, height: 1.2, stiff: 0.6, sway: 0.8, grass: false, judged: [0.12, 0.2] },
  { name: 'frond', record: 10, height: 0.95, stiff: 0.6, sway: 0.8, grass: false, judged: [0.1, 0.16] },
  { name: 'broadleaf', record: 1, height: 0.9, stiff: 0.3, sway: 0.6, grass: false, judged: [0.05, 0.08] },
  { name: 'palmlet', record: 27, height: 1, stiff: 0.5, sway: 0.7, grass: false, judged: [0.06, 0.07] },
  { name: 'bloom', record: 21, height: 0.9, stiff: 0.5, sway: 0.7, grass: false, judged: [0.04, 0.05] },
  { name: 'spike', record: 6, height: 1.1, stiff: 0.4, sway: 0.7, grass: false, judged: [0.05, 0.04] },
];
export const JUNGLE_FLOOR_JUDGED = 1.8;
export const JUNGLE_FLOOR_GRASS = LAB_GRASS.density / MEADOW_BLADES_PER_TUFT / (2 * LAB_GRASS.densitySpan) ** 2;
const floraShare = (end) => JUDGED_PLANTS.reduce((s, p) => s + (p.grass ? 0 : p.judged[end]), 0);
const grassShare = (end) => 1 - floraShare(end);
export const JUNGLE_FLOOR_PLANTS_M2 = JUNGLE_FLOOR_GRASS + (JUNGLE_FLOOR_JUDGED * (floraShare(0) + floraShare(1))) / 2;
export const JUNGLE_FLOOR_PLANTS = Object.freeze(JUDGED_PLANTS.map((p) => Object.freeze({
  name: p.name, record: p.record, height: p.height, stiff: p.stiff, sway: p.sway, grass: p.grass,
  share: Object.freeze([0, 1].map((end) => (p.grass
    ? (p.judged[end] / grassShare(end)) * (1 - (floraShare(end) * JUNGLE_FLOOR_JUDGED) / JUNGLE_FLOOR_PLANTS_M2)
    : (p.judged[end] * JUNGLE_FLOOR_JUDGED) / JUNGLE_FLOOR_PLANTS_M2))),
})));
export const FLOOR_MEAN_BLADE = heightFloor(LAB_GRASS.height) + heightSpan(LAB_GRASS.height) / 2;

/** @param {(record: number) => ({ width: number, height: number, data: Uint8Array | Uint8ClampedArray } | null)} pictureOf */
export function jungleFloorArt(pictureOf) {
  const sprites = [];
  for (const p of JUNGLE_FLOOR_PLANTS) {
    if (p.record == null) { sprites.push(MEADOW_SPRITES[0]); continue; }
    const pic = pictureOf(p.record);
    if (!pic?.width || !pic.height) return null;
    sprites.push(fitSprite(pic, p.name));
  }
  const boxes = sprites.map((s) => Object.freeze(meadowSpriteBox(s)));
  const variants = JUNGLE_FLOOR_PLANTS.map((p, i) => Object.freeze({ name: p.name, scale: p.height / (FLOOR_MEAN_BLADE * Math.max(boxes[i].v1, 1e-3)), stiff: p.stiff, sway: p.sway }));
  const atlas = buildMeadowAtlas({ sprites });
  return Object.freeze({
    name: 'jungle-floor', variants: Object.freeze(variants), boxes: Object.freeze(boxes), sprites,
    pick: ladderPick(JUNGLE_FLOOR_PLANTS.map((p, i) => [i, p.share[0], p.share[1]])),
    green: MEADOW_GREEN, hue: 0, ...cardMeasures(variants, boxes), mips: () => buildMeadowMips(atlas), slots: MEADOW_SLOTS,
  });
}

// CPU copy of the vertex stage's ladderPick; the two must pick the same plant for the same tuft.
export function floorPick(art, r, tint) {
  const lush = smoothstep(MEADOW_LUSH[0], MEADOW_LUSH[1], tint);
  let at = 0, variant = JUNGLE_FLOOR_PLANTS.length - 1;
  for (let i = 0; i < JUNGLE_FLOOR_PLANTS.length - 1; i++) {
    const [poor, rich] = JUNGLE_FLOOR_PLANTS[i].share;
    at += poor * (1 - lush) + rich * lush;
    if (r < at) { variant = i; break; }
  }
  return { variant, scale: art.variants[variant].scale * (MEADOW_PATCH_SCALE[0] * (1 - lush) + MEADOW_PATCH_SCALE[1] * lush), lush };
}
