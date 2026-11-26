// @ts-check

export const MESH_ALPHA_GLSL = `uniform float uMeshAlpha;   // POI-2: 0 the opaque world (alpha 1, INCIDENT 2026-09-04's law); above 0 a translucent draw (render/meshAlpha.js)
float meshAlphaOf(float a) { return uMeshAlpha > 0.0 ? a * uMeshAlpha : 1.0; }`;

// These match POI_WRAP and POI_FILTER in src/poi/poiLaw.js.
export const SAMPLER_WRAPS = Object.freeze(['repeat', 'clamp', 'mirror']);
export const SAMPLER_FILTERS = Object.freeze(['nearest', 'linear']);

/**
 * @param {any} gl
 * @param {{ wrapS?: string, wrapT?: string, filter?: string }} s
 * @param {boolean} mips
 */
export function samplerParams(gl, s, mips) {
  const wrap = (w) => (w === 'clamp' ? gl.CLAMP_TO_EDGE : w === 'mirror' ? gl.MIRRORED_REPEAT : gl.REPEAT);
  const linear = s?.filter === 'linear';
  const mag = linear ? gl.LINEAR : gl.NEAREST;
  const min = mips ? (linear ? (gl.LINEAR_MIPMAP_LINEAR ?? mag) : (gl.NEAREST_MIPMAP_NEAREST ?? mag)) : mag;
  return { wrapS: wrap(s?.wrapS), wrapT: wrap(s?.wrapT), mag, min };
}

// The sampler is part of the cache key, so one picture under two samplers uploads as two textures.
/** @param {{ wrapS?: string, wrapT?: string, filter?: string }} s */
export const samplerKey = (s) => `#s:${SAMPLER_WRAPS.includes(s?.wrapS) ? s.wrapS : 'repeat'},${SAMPLER_WRAPS.includes(s?.wrapT) ? s.wrapT : 'repeat'},${SAMPLER_FILTERS.includes(s?.filter) ? s.filter : 'nearest'}`;
