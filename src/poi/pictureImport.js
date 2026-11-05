// @ts-check
// BUNNYFALL (2026-11-05, the owner: "how do i add a png billboard" - "i asked that as a feature"): A PICTURE AS AN IMPORT.
// A PNG (or JPEG, WebP) made into one upright, two-sided plane of the picture's own proportions, its bottom edge on the
// ground and its middle on the origin, wearing the picture as a cutout (a see-through background stays see-through).
// Handed to the POI importer in the shape the glTF reader hands it (poi/poiImport.js prepareImport's `model` and `baked`),
// so it is held to the mesh law, uploaded by its hash, placed, approved and stood like any model. It does not turn to face
// the player: it stands the way it is placed.
//
// The frame is the game's model frame (poi/poiMesh.js): +Y up, +Z forward, left-handed; UVs from the picture's top-left,
// V growing down.

/** The plane's height when none is asked (m). */
export const PICTURE_HEIGHT_M = 3;

/**
 * @param {{ width: number, height: number, data: Uint8Array | Uint8ClampedArray }} rgba the decoded picture, top row first
 * @param {Uint8Array} bytes the picture file as it is
 * @param {{ name?: string, heightM?: number, alpha?: 'opaque' | 'cutout' | 'blend', crisp?: boolean }} [o]
 */
export function pictureAsImport(rgba, bytes, { name = 'Picture', heightM = PICTURE_HEIGHT_M, alpha = 'cutout', crisp = true } = {}) {
  const h = Math.min(Math.max(Number(heightM) || PICTURE_HEIGHT_M, 0.1), 200);
  const w = h * (rgba.width / Math.max(1, rgba.height));
  const x = w / 2;
  // the four corners, bottom-left first as seen from the front (the side a viewer at -Z looks from, +X to the right)
  const positions = Float32Array.from([-x, 0, 0, -x, h, 0, x, h, 0, x, 0, 0]);
  const normals = Float32Array.from([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]);
  const uvs = Float32Array.from([0, 1, 0, 0, 1, 0, 1, 1]);
  const indices = Uint32Array.from([0, 1, 2, 0, 2, 3]);
  const mesh = { positions, normals, uvs, indices, submeshes: [{ start: 0, count: 6 }] };
  const wrap = /** @type {['clamp', 'clamp']} */ (['clamp', 'clamp']);
  const filter = crisp ? 'nearest' : 'linear';
  const material = { name, base: { image: 0, wrap, filter }, color: [1, 1, 1, 1], alpha, cutoff: 0.5, twoSided: true };
  const images = [{ name, bytes, rgba }];
  return {
    model: { name, images, materials: [material], lights: [], warnings: [] },
    baked: [{ name, position: [0, 0, 0], mesh, materials: [0] }],
    /** for poi/poiThumb.js renderThumb: the model with its pictures */
    thumb: [{ mesh, materials: [{ picture: rgba, wrap }] }],
  };
}
