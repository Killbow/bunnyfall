// @ts-check

import { EL_LANE } from './enhancedLighting.js';

// Throws when the signature is missing, so a changed lane shader fails loudly, not with half the enhanced look.
export function replaceGlslFunction(src, signature, body) {
  const at = src.indexOf(signature);
  if (at < 0) throw new Error(`classic shadow lane: '${signature}' is not in the shader`);
  const open = src.indexOf('{', at);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return `${src.slice(0, open)}{\n  ${body}\n}${src.slice(i + 1)}`;
}

/** @type {ReadonlyArray<[string, string, { optional?: boolean }?]>} */
export const CLASSIC_LOOK = Object.freeze([
  ['vec3 elDecode(vec3 c)', 'return c;'],
  ['vec3 elEncode(vec3 c)', 'return clamp(c, 0.0, 1.0);'],
  ['vec3 elTonemapRGB(vec3 c)', 'return clamp(c, 0.0, 1.0);'],
  ['float elAttenuation(float d, float range)', 'float a = clamp(1.0 - d / max(range, 1e-4), 0.0, 1.0); return a * a;'],
  ['float elAdapt()', 'return 1.0;'],
  ['float elSpecLobe(float x)', 'return 0.0;', { optional: true }],
]);

export function classicLook(src) {
  let out = src;
  for (const [sig, body, opts] of CLASSIC_LOOK) {
    if (opts?.optional && !out.includes(sig)) continue;
    out = replaceGlslFunction(out, sig, body);
  }
  return out;
}

const identity3 = (src, out) => { out[0] = src[0]; out[1] = src[1]; out[2] = src[2]; return out; };
const identityN = (src, out, count) => { for (let i = 0; i < count * 3; i++) out[i] = src[i]; return out.subarray ? out.subarray(0, count * 3) : out; };

let _lane = null;
export function classicShadowLane() {
  _lane ??= Object.freeze({
    ...EL_LANE,
    key: 'classic-shadows',
    // renderer.lightingLane returns null for a classicLook lane, so the hosts keep their classic colors and fog.
    classicLook: true,
    meshFs: classicLook(EL_LANE.meshFs),
    bbFs: classicLook(EL_LANE.bbFs),
    terrainFs: classicLook(EL_LANE.terrainFs),
    charFs: classicLook(EL_LANE.charFs),
    decalFs: classicLook(EL_LANE.decalFs),
    farRingFs: classicLook(EL_LANE.farRingFs),
    shadows: true,
    air: false,
    decode3: identity3,
    decodeN: identityN,
    scatter: 0,
    scatterDensity: () => 0,
  });
  return _lane;
}

// Hosts call this every frame before they compose their lights; setLightingLane does nothing when nothing changes.
export function syncClassicShadowLane(renderer, want) {
  const key = renderer.installedLaneKey;
  if (key && key !== 'classic-shadows') return false;
  if (want && key !== 'classic-shadows') {
    renderer.setLightingLane(classicShadowLane());
    renderer.setExposure?.(1);
    renderer.setAir?.(false);
    renderer.setContact?.(false);
    renderer.setVolumetrics?.(false);
    renderer.setHaze?.(false);
  } else if (!want && key === 'classic-shadows') {
    renderer.setLightingLane(null);
  }
  return want;
}
