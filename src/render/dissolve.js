// @ts-check
// Sprite dissolve GLSL shared by both billboard shaders.
// `batch.dissolve` is [share gone 0..1, r, g, b, dissolve set noShadow]; null or undefined draws the sprite whole.

export const DISSOLVE_EMBER = Object.freeze([1.0, 0.42, 0.1]);
export const DISSOLVE_ARCANE = Object.freeze([0.62, 0.4, 1.0]);

export const DISSOLVE_SHADOWLESS = 0.5;
/** @param {ArrayLike<number> | null | undefined} d */
export const dissolveShadowless = (d) => !!d && d[0] > DISSOLVE_SHADOWLESS;

export function setBatchDissolve(batch, share, colour = DISSOLVE_EMBER) {
  if (!batch) return;
  if (!(share > 0)) {
    if (batch.dissolve) { if (batch.dissolve[4]) batch.noShadow = undefined; batch.dissolve = null; }
    return;
  }
  const s = Math.min(1, share);
  const d = batch.dissolve ?? (batch.dissolve = [0, 0, 0, 0, 0]);
  // [4] records that the dissolve set noShadow, so clearing the dissolve leaves a noShadow set elsewhere in place.
  if (s > DISSOLVE_SHADOWLESS) { if (!batch.noShadow) { batch.noShadow = true; d[4] = 1; } } else if (d[4]) { batch.noShadow = undefined; d[4] = 0; }
  d[0] = s; d[1] = colour[0]; d[2] = colour[1]; d[3] = colour[2];
}

export const FLAT_DISSOLVE_GLSL = `
// uDissolve (x the share gone, 0 whole and 1 gone; yzw the edge's colour) is declared by each program that composes
// this block, beside its other per-batch uniforms (AUDIT 47: a unit declares what it uses, where the sweep reads it)
float dissolveGrain(vec2 uv) {
  vec2 cell = floor(uv * vec2(textureSize(uTex, 0)) * 0.5);   // two-texel grains: the art's own pixels
  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  return h * 0.72 + uv.y * 0.28;   // v = 0 is the feet: they go first
}
float dissolveCutAt(float x) { return x * 1.1 - 0.05; }
bool dissolveGone(vec2 uv) { return uDissolve.x > 0.0 && dissolveGrain(uv) < dissolveCutAt(uDissolve.x); }
float dissolveEdge(vec2 uv) {
  if (uDissolve.x <= 0.0) return 0.0;
  float k = 1.0 - smoothstep(0.0, 0.09, dissolveGrain(uv) - dissolveCutAt(uDissolve.x));
  return k * min(1.0, uDissolve.x * 8.0);
}
vec3 dissolveLit(vec3 lit, vec2 uv, vec3 edge) {   // edge: uDissolve.yzw in the program's own light (the lane's decoded)
  float k = dissolveEdge(uv);
  return k > 0.0 ? mix(lit, edge * 1.6, k) : lit;
}`;
