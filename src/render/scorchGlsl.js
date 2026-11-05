// @ts-check
// BUNNYFALL (2026-11-05, the owner: "massive chunks of burned land, basically its a warzone"): THE SCORCHED GROUND. A pixel's
// terrain surface may carry `scorch` (0 none, up to 1; systems/wild/cromwarkWaste.js sets it in the Cromwark reach). Its
// dirt and stone tiles - the grass the waste burnt (burnTilemap) among them - go to char and ash, and every other tile
// dries toward a dead straw. One float a draw; 0 draws the ground exactly as before. Shared by the classic and the enhanced
// terrain programs (render/renderer.js TERRAIN_FS, render/enhancedLighting.js EL_TERRAIN_FS), so their variants have it too.
export const SCORCH_GLSL = `
uniform float uScorch;
vec3 scorched(vec3 tex, int layer, vec2 localXZ) {
  if (uScorch <= 0.0) return tex;
  float lum = dot(tex, vec3(0.3, 0.59, 0.11));
  vec2 cell = floor(localXZ / 3.2);
  float n = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float m = fract(sin(dot(floor(localXZ / 0.8), vec2(39.346, 11.135))) * 24634.6345);
  bool burnt = layer == 1 || layer == 3;
  if (burnt) {
    vec3 charc = vec3(0.075, 0.068, 0.062) * (0.7 + 0.6 * m);
    vec3 ash = vec3(lum * 0.55 + 0.06) * vec3(1.0, 0.97, 0.93);
    vec3 c = mix(charc, ash, smoothstep(0.55, 0.95, n) * 0.8);
    return mix(tex, c, clamp(uScorch * 1.15, 0.0, 0.95));
  }
  vec3 straw = vec3(lum) * vec3(1.08, 0.95, 0.72) * 0.78;
  return mix(tex, straw, uScorch * 0.55);
}
`;
