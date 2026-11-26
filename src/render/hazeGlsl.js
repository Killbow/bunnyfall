// @ts-check

// hazeAt is the shader copy of hazeTransmittance in src/world/jungle/jungleHaze.js; change both together.
export const HAZE_LAW_GLSL = `
uniform vec4 uJungleHaze[2];   // BANTHA1: [0] the floor's extinction (1/m), the floor's height, 1 / the falloff (1/m), the clear start (m) | [1].x on
float hazeMean(float a, float b) {   // the mean density over a ray from height a to b (in falloffs over the floor), the floor's 1
  float lo = min(a, b), hi = max(a, b);
  if (hi <= 0.0) return 1.0;
  float span = hi - lo;
  if (span < 1e-4) return exp(-max(lo, 0.0));
  float lo0 = max(lo, 0.0);
  return ((lo0 - lo) + (exp(-lo0) - exp(-hi))) / span;
}
float hazeAt(vec3 worldPos, vec3 origin) {
  if (uJungleHaze[1].x < 0.5) return 1.0;
  float run = length(worldPos - origin) - uJungleHaze[0].w;
  if (run <= 0.0) return 1.0;
  float k = uJungleHaze[0].z;
  return exp(-uJungleHaze[0].x * run * hazeMean((origin.y - uJungleHaze[0].y) * k, (worldPos.y - uJungleHaze[0].y) * k));
}`;

export const HAZE_SKY_GLSL = `
uniform vec4 uHazeSky;   // BANTHA1: rgb the haze's colour, w its optical depth straight up from the eye (0 none)
float hazeSkyMix(float y) {
  if (uHazeSky.w <= 0.0) return 0.0;
  return 1.0 - exp(-uHazeSky.w / max(y, 0.004));
}
vec3 hazeSky(vec3 c, vec3 dir) { return mix(c, uHazeSky.rgb, hazeSkyMix(dir.y)); }`;

// The including shader must declare vWorld before this block, as RING_SEA_GLSL in horizonHaze.js does.
export const RING_HAZE_GLSL = `${HAZE_LAW_GLSL}
uniform vec3 uHazeEye;
float ringHaze(float m) { return 1.0 - (1.0 - m) * hazeAt(vWorld, uHazeEye); }`;
