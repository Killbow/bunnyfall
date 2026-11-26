// @ts-check
// The fog math every world pass shares. Each shader declares its own fog uniforms; renderer.js setFog is their one
// producer. Keep this a leaf so the classic page's static graph grows by this file alone.

import { HAZE_LAW_GLSL } from './hazeGlsl.js';

// `uFocus.w` 0 (never uploaded, or no travel view) falls back to uCamPos. Declare uFocus only here: a second
// declaration is a compile error.
export const FOCUS_GLSL = `uniform vec4 uFocus;
vec3 focusOrigin() { return uFocus.w > 0.5 ? uFocus.xyz : uCamPos; }`;

export const FOG_GLSL = `${FOCUS_GLSL}
${HAZE_LAW_GLSL}
float weatherFogAt(vec3 worldPos) {
  if (uFogMode == 0) return 1.0;
  float d = length(worldPos - focusOrigin());   // TV1: the traveller's eye under the travel view, the camera otherwise
  if (uFogMode == 1) {
    return clamp((uFogRange.y - d) / max(uFogRange.y - uFogRange.x, 1e-4), 0.0, 1.0);
  }
  if (uFogMode == 3) { float f = uFogDensity * d; return exp(-f * f); }   // DS1: FogMode.ExponentialSquared
  return exp(-uFogDensity * d);
}
float fogFactorAt(vec3 worldPos) { return weatherFogAt(worldPos) * hazeAt(worldPos, focusOrigin()); }   // BANTHA1
uniform vec4 uDwFog[5];   // DW-C: on, sea Y, vision, strength | absorb rgb, scatter per m | in-scatter rgb, darkening | fog rgb, far factor | far start, far end, sky distance, -
float dwWaterDistance(vec3 worldPos) {   // the ray's length in the water: capped where it climbs through the surface
  vec3 r = worldPos - uCamPos;
  float dist = length(r);
  float toSurface = uDwFog[0].y - uCamPos.y;
  float dy = r.y / max(dist, 1e-6);
  return (dy > 1e-4 && toSurface > 0.0) ? min(toSurface / dy, dist) : dist;
}
float dwWaterClose(float d) {   // the two bands' closing to the fog colour
  float v = uDwFog[0].z;
  return max(smoothstep(0.5 * v, 1.45 * v, d), uDwFog[3].w * smoothstep(uDwFog[4].x, uDwFog[4].y, d));
}
vec3 dwWaterFogAt(vec3 col, float d) {
  vec3 c = (col * exp(-d * uDwFog[1].xyz) + (1.0 - exp(-d * uDwFog[1].w)) * uDwFog[2].xyz) * uDwFog[2].w;
  return mix(c, uDwFog[3].xyz, dwWaterClose(d));
}
vec3 dwWaterFog(vec3 col, vec3 worldPos) {
  if (uDwFog[0].x < 0.5) return col;
  return dwWaterFogAt(col, dwWaterDistance(worldPos));
}
vec3 dwWaterFogAdd(vec3 add, vec3 worldPos) {
  if (uDwFog[0].x < 0.5) return add;
  float d = dwWaterDistance(worldPos);
  return add * exp(-d * uDwFog[1].xyz) * uDwFog[2].w * (1.0 - dwWaterClose(d));
}`;
