// This module imports nothing: the renderer imports it, and importing combat visuals would pull in a large graph.

export const BLEND_ALPHA = 0.22;
export const BLEND_SHIMMER = 0.08;
export const BLEND_HZ = 1.3;
export const SHADE_ALPHA = 0.55;
// SHADE_DARK is interpolated into a shader, so it must stay a decimal: GLSL ES 3.00 cannot scale a vec3 by an int.
export const SHADE_DARK = 0.12;
export const REVEAL_SECONDS = 0.35;
export const REVEAL_ALPHA = 0.8;
