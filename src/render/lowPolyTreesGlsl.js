// @ts-check
// vFade below 1 is the kept share of the far picture, and 2 plus a share is the kept share of the tree. Values 1 and
// 3 keep every fragment, so across the crossfade each pixel shows exactly one of the two.

export const LPT_FS_HEAD = `
in vec3 vShade;   // LPT1 (render/lowPolyTreesGlsl.js)
in float vAlpha;
in float vFade;
`;

// Insert right after both maps are sampled, before the flats' margin clear.
export const LPT_FS_KEEP = `  vec4 lptTexel = tex;   // LPT1: a tree's texel, kept from the flats' margin clear (render/lowPolyTreesGlsl.js)
`;

// Insert after the margin clear, with bayer4 declared above it.
export const LPT_FS_TEXEL = `
  // LPT1: a low-poly tree's own texel, its light and colour, its cut, and the crossfade with its far picture
  // (render/lowPolyTreesGlsl.js)
  if (vFade > 1.5) tex = lptTexel;
  tex.rgb *= vShade;
  tex.a = vAlpha > 0.0 ? tex.a * vAlpha : 1.0;
  if (vFade < 1.0 ? bayer4(gl_FragCoord.xy) + 0.03125 >= vFade : (vFade > 1.5 && vFade < 3.0 && bayer4(gl_FragCoord.xy) + 0.03125 < 3.0 - vFade)) discard;
`;
