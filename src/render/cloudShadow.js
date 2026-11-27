// @ts-check
// This leaf imports nothing, because the renderer and the air pass both build shaders from it at module scope.

export const CLOUD_SHADOW_RIM = 0.8;

export const cloudFarOf = (deck) => (deck?.map && Number.isFinite(deck.far) ? Math.min(1, Math.max(0, deck.far)) : 1);

export const CLOUD_SHADOW_GLSL = `
uniform sampler2D uCloudShadowMap;
uniform vec4 uCloudShadowRect;   // VC4: the square's corner x, z; 1 / its side; the amount (0 = no shadow, the classic skin and every interior)
uniform vec2 uCloudShadowFar;    // OW-HORIZON: x the transmittance past the square, y 1 when told ((0, 0): full sun past it, as before)
// the transmittance of the cloud slab along the sun's ray from this
// ground point, read off the map the same field the sky is drawn from
// writes (render/volumetricClouds.js); outside the square the far law
// (OW-HORIZON), no shadow in a program never told it
float cloudShadowAt(vec3 wp) {
  if (uCloudShadowRect.w <= 0.0) return 1.0;
  vec2 uv = (wp.xz - uCloudShadowRect.xy) * uCloudShadowRect.z;
  bool told = uCloudShadowFar.y > 0.5;
  float far = told ? uCloudShadowFar.x : 1.0;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return far;
  float t = 1.0 - (1.0 - texture(uCloudShadowMap, uv).r) * uCloudShadowRect.w;
  if (!told) return t;
  vec2 e = abs(uv - 0.5) * 2.0;
  return mix(t, far, smoothstep(${CLOUD_SHADOW_RIM.toFixed(2)}, 1.0, max(e.x, e.y)));
}
// SKY-CAP: the transmittance at the texel NEAREST ground point g (x, z) the map knows - past the square, its edge. Clamped
// in the map's own UV, never in world metres: the square's far side in metres (corner + 1 / z, in fp32) carried back
// into UV lands a hair past 1.0 for some squares, where cloudShadowAt answers "outside: full sun"
float cloudShadowNearest(vec2 g) {
  if (uCloudShadowRect.w <= 0.0) return 1.0;
  vec2 uv = clamp((g - uCloudShadowRect.xy) * uCloudShadowRect.z, 0.0, 1.0);
  return 1.0 - (1.0 - texture(uCloudShadowMap, uv).r) * uCloudShadowRect.w;
}
`;

export const RING_CLOUD_GLSL = `${CLOUD_SHADOW_GLSL}
uniform float uCloudFar;   // the far transmittance the host's uSunScale already carries; 1 with no map
float ringSun() { return uSunScale * cloudShadowAt(vWorld) / max(uCloudFar, 0.05); }`;
