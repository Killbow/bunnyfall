// @ts-check

import { wrapModes } from '../formats/mwTexture.js';

// Matches the vertex layout of createParticleEffect in renderer.js, with the color starting at float 7.
export const VFX_VERTEX_FLOATS = 12;
export const VFX_COLOR_AT = 7;
// srcBlend 0 is additive (ONE), so the color channels fade too; every other blend fades through alpha only.
/**
 * @param {Float32Array} packed
 * @param {number} count
 * @param {number} alpha
 * @param {number} srcBlend
 * @param {Float32Array} out
 */
export function vfxFade(packed, count, alpha, srcBlend, out) {
  const n = count * VFX_VERTEX_FLOATS;
  for (let i = 0; i < n; i++) out[i] = packed[i];
  for (let v = 0; v < count; v++) {
    const o = v * VFX_VERTEX_FLOATS + VFX_COLOR_AT;
    if (srcBlend === 0) { out[o] *= alpha; out[o + 1] *= alpha; out[o + 2] *= alpha; }
    out[o + 3] *= alpha;
  }
  return out;
}

/**
 * @param {any} renderer
 * @param {Map<string, any> | null | undefined} textures
 * @param {Map<string, number> | null | undefined} capacity
 */
export function createVfxGpu(renderer, textures, capacity) {
  const effects = new Map();
  const texs = new Map();
  let released = false;

  function textureFor(file, clampMode) {
    if (!file) return null;
    const key = `${file}|${clampMode}`;
    if (texs.has(key)) return texs.get(key);
    const entry = textures?.get?.(file);
    const tex = entry && entry.image && entry.image.mips ? renderer.createCharacterTexture(entry.image.mips, wrapModes(clampMode)) : null;
    texs.set(key, tex);
    return tex;
  }

  return {
    sync(streams, alpha = 1) {
      if (released) return [];
      const live = new Set();
      const out = [];
      for (const s of streams ?? []) {
        let e = effects.get(s.key);
        if (!e) {
          const vertices = capacity?.get?.(s.key) ?? s.count;
          e = renderer.createParticleEffect(Math.ceil(Math.max(vertices, s.count) / 6), s.drawState);
          effects.set(s.key, e);
        }
        e.tex = textureFor(s.texture, s.drawState?.clampMode ?? 3);
        e.blend = !!s.drawState?.blend; e.srcBlend = s.drawState?.srcBlend ?? 6; e.dstBlend = s.drawState?.dstBlend ?? 7;
        e.alphaCut = s.drawState?.alphaCut ?? 0; e.depthTest = s.drawState?.depthTest !== false; e.depthWrite = s.drawState?.depthWrite !== false;
        e.hidden = false;
        if (alpha < 1 && s.count > 0) { const need = s.count * VFX_VERTEX_FLOATS; if (!e.faded || e.faded.length < need) e.faded = new Float32Array(need); renderer.updateParticleEffect(e, vfxFade(s.packed, s.count, alpha, e.blend ? e.srcBlend : -1, e.faded), s.count); }
        else renderer.updateParticleEffect(e, s.packed, s.count);
        live.add(s.key);
        out.push(e);
      }
      for (const [key, e] of effects) if (!live.has(key)) e.hidden = true;
      return out;
    },
    effects() { return [...effects.values()]; },
    release() {
      if (released) return;
      released = true;
      // releaseParticleEffect deletes the texture an effect points at, and these textures are owned here.
      for (const e of effects.values()) { e.tex = null; renderer.releaseParticleEffect(e); }
      effects.clear();
      for (const tex of texs.values()) if (tex) renderer.releaseCharacterTexture(tex);
      texs.clear();
    },
    get released() { return released; },
  };
}
