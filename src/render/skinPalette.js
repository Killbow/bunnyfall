// @ts-check
// GPU skin palette layout, shared by the skinning shader, the palette writer, and the uploader.

// Each entry takes three texels, so entry e sits at texel (3 * (e % 341), floor(e / 341)) of a 1023-texel row.
export const SKIN_PAL_ROW = 341;

// The unit always holds a complete RGBA32F texture because the sampler is read even when its branch does not run.
export const SKIN_PALETTE_UNIT = 21;
