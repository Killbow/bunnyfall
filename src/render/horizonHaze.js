// @ts-check

const MOON_PATH_GAIN = 1.6;

// The water surface and the far ring's sea share this text, so the two seas match where the streamed grid ends.
export const SEA_LOOK_GLSL = `
float seaFresnel(float ndv, float f0) { return f0 + (0.85 - f0) * pow(1.0 - clamp(ndv, 0.0, 1.0), 5.0); }
vec3 seaSkyRefl(float ry, vec3 zenith, vec3 horizon) { return mix(horizon, zenith, clamp(0.2 + ry * 1.4, 0.0, 1.0)); }
vec3 seaLight(vec3 ambient, vec3 sunColor, float sunDiff, vec3 moonColor, float moonDiff) {
  return ambient + sunColor * (sunDiff * 0.6) + moonColor * moonDiff;
}
float seaSunLobe(float nh) { return pow(max(nh, 0.0), 180.0); }
float seaMoonLobe(float nh) { float c = max(nh, 0.0); return pow(c, 220.0) + 0.16 * pow(c, 40.0); }
// A light's path down the sea toward the eye, along the reflected ray R. The moon's grows with its light.
float seaPath(vec3 R, vec3 L, float across, float along) {
  float c = dot(normalize(R.xz + vec2(1e-5, 0.0)), normalize(L.xz + vec2(1e-5, 0.0)));
  float dy = R.y - L.y;
  return exp((c - 1.0) * across) * exp(-dy * dy * along);
}
float seaMoonPath(vec3 R, vec3 moonDir, float moonScale) {
  return seaPath(R, moonDir, 350.0, 7.0) * ${MOON_PATH_GAIN.toFixed(2)} * smoothstep(0.03, 0.2, moonScale);
}
// The sunset's glow low on the sun's side, as a reflected ray sees it.
vec3 seaSkyGlow(vec3 R, vec3 glow, vec2 dir) {
  if (glow.r + glow.g + glow.b <= 0.0) return vec3(0.0);
  float c = max(dot(normalize(R.xz + vec2(1e-5, 0.0)), dir), 0.0);
  return glow * (c * c * c * c * (1.0 - smoothstep(0.0, 0.45, R.y)));
}
vec3 seaGlints(vec3 sunColor, float sun, vec3 moonColor, float moon) { return sunColor * (1.6 * sun) + moonColor * (0.7 * moon); }
vec3 seaSky(vec3 lit, float ndv, vec3 zenith, vec3 horizon, float f0) {
  float F = seaFresnel(ndv, f0);
  return lit * (1.0 - F) + seaSkyRefl(ndv, zenith, horizon) * F;
}`;

export const HORIZON_HAZE_GLSL = `
float horizonHaze(float d, float fogStart, float fogEnd, float rimStart, float rimEnd, float hold) {
  float ramp = clamp((d - fogStart) / max(fogEnd - fogStart, 1.0), 0.0, 1.0);
  return min(min(ramp, hold) + (1.0 - hold) * smoothstep(rimStart, rimEnd, d), 1.0);
}`;

// Water within this band of sea level takes the horizon haze; other water fogs as the land around it does.
export const SEA_HAZE_BAND = 1.0;

// ringSea reads uLightDir, uMoonDir, and uMoonScale, which the including shader declares before this block.
export const RING_SEA_GLSL = `in float vSea;
in vec3 vWorld;
in vec3 vSeaBody;
uniform vec3 uEye;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform float uSeaF0;
uniform float uSeaLook;   // 1 with a sky to reflect (and the Enhanced water on), 0 without (the sea lit as ground, as before)
${SEA_LOOK_GLSL}
${HORIZON_HAZE_GLSL}
vec3 ringSea(vec3 ambient, vec3 sunColor, vec3 moonColor, float sunScale) {
  vec3 V = normalize(uEye - vWorld);   // the normal is up: the facing and the reflected ray's height are V.y
  vec3 lit = vSeaBody * seaLight(ambient, sunColor, sunScale * max(uLightDir.y, 0.0), moonColor, uMoonScale * max(uMoonDir.y, 0.0));
  vec3 H = normalize(uLightDir + V);
  vec3 Hm = normalize(uMoonDir + V);
  vec3 R = vec3(-V.x, V.y, -V.z);
  return seaSky(lit, V.y, uSkyZenith, uSkyHorizon, uSeaF0) + seaGlints(sunColor, seaSunLobe(H.y) * sunScale, moonColor, seaMoonLobe(Hm.y) * uMoonScale)
    + moonColor * (uMoonScale * seaMoonPath(R, uMoonDir, uMoonScale));
}`;
