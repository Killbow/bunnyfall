// @ts-check
import { bbVertexShader, FLAT_LIGHT_FLOOR } from './renderer.js';
import { buildProgram, startPrograms, releasePrograms } from './glProgram.js';
import { getPref } from '../ui/uiPrefs.js';
import { BAYER_GLSL } from './orderedDither.js';
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { billboardKey } from './billboardKey.js';
import { windfallLawOn, swayShare } from './windfallSway.js';
import { nodeGlows, createNodeGlowState, createNodeGlowPass, NODE_GLOW_MAX } from './nodeGlow.js';
import { LPT_INSTANCE_FLOATS, lptCuts } from '../world/lowPolyTrees.js';

export const GLINT_TILE = 256;
export const GLINT_GRID = 4;
export const GLINT_MAX = GLINT_GRID * GLINT_GRID;
export const GLINT_TREE_REACH = 0.75;
// Each flat uses six u32 indices; this matches BB_QUAD_INDEX_BYTES in renderer.js.
export const GLINT_QUAD_INDEX_BYTES = 24;
export const GLINT_COUNT = 6;
export const GLINT_TRIES = 6;
export const GLINT_HOLD_PX = 1.5;
export const GLINT_ANCHORS = 8;
export const GLINT_RATE = 0.35;
export const GLINT_RATE_STEP = 0.05;
export const GLINT_FLASH = 3;
export const GLINT_STILL = 0.6;
export const GLINT_PX = 14;
export const GLINT_PX_MIN = 4;
export const GLINT_PX_FLOOR = 1.5;
export const GLINT_REF_ROWS = 1080;
export const GLINT_SHARE = 0.35;
export const GLINT_CROWN_GROWTH = 2;
export const GLINT_CROWN_COUNT = GLINT_COUNT * GLINT_CROWN_GROWTH;
export const GLINT_GAIN = Object.freeze({ core: 0.9, ray: 0.5, bloom: 0.3, sheen: 0.14 });
export const GLINT_LIGHT = Object.freeze([1, 0.95, 0.84]);
export const GLINT_TINT = 0.35;
export const GLINT_CORE_WHITE = 0.6;
export const GLINT_PULL = 0.3;
export const GLINT_SHEEN_HZ = 0.15;
export const GLINT_SHEEN_SHARE = 0.5;
export const GLINT_SHEEN_NEAR_M = 6;
export const GLINT_SHEEN_FULL_M = 18;
export const GLINT_SHEEN_DARK = 0.4;
export const GLINT_SHEEN_LIT = 0.55;

export const RESOURCE_HIGHLIGHT_PREF = 'resourceHighlights';
export const RESOURCE_HIGHLIGHTS = Object.freeze({
  glint: Object.freeze({ glint: true, ring: false }),
  outline: Object.freeze({ glint: false, ring: true }),
  both: Object.freeze({ glint: true, ring: true }),
});
export const highlightLook = (tier) => RESOURCE_HIGHLIGHTS[/** @type {keyof typeof RESOURCE_HIGHLIGHTS} */ (tier)] ?? RESOURCE_HIGHLIGHTS.glint;
export const OUTLINE_PX = 2.5;
export const OUTLINE_PX_MIN = 1.5;
export const OUTLINE_TAPS = 8;
export const OUTLINE_ALPHA = 0.95;
export const OUTLINE_BREATH = 0.12;
export const OUTLINE_BREATH_HZ = 0.25;
export const OUTLINE_RING_BACK = 0.08;

export const GLINT_NEAR_W = 1e-3;
export const GLINT_OVERHANG = 2;

if (GLINT_MAX !== NODE_GLOW_MAX) throw new Error('NODE-GLINT: the atlas holds the glow\'s budget');

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const glintPx = (rows, sidePx) => {
  const scale = rows / GLINT_REF_ROWS;
  return Math.max(GLINT_PX_FLOOR, Math.min(GLINT_PX * scale, Math.max(GLINT_PX_MIN * scale, GLINT_SHARE * sidePx)));
};
export const glintPxMax = (rows) => Math.max(GLINT_PX_FLOOR, (GLINT_PX * rows) / GLINT_REF_ROWS);
export const glintCrownGrowth = (rows, crownPx) => Math.min(GLINT_CROWN_GROWTH, Math.max(1, (crownPx / ((GLINT_PX / GLINT_SHARE) * (rows / GLINT_REF_ROWS))) ** (2 / 3)));
export const glintCrownCount = (rows, crownPx) => Math.round(GLINT_COUNT * glintCrownGrowth(rows, crownPx));
export const glintCrownPx = (rows, crownPx) => glintPx(rows, crownPx) * glintCrownGrowth(rows, crownPx);
/** @param {ArrayLike<number>} proj */
export const crownSidePx = (proj, cw, w, h, vw, vh) => (cw > GLINT_NEAR_W
  ? Math.sqrt(((w * Math.abs(proj[0]) * vw) / (2 * cw)) * ((h * Math.abs(proj[5]) * vh) / (2 * cw))) : Infinity);
/** @param {ArrayLike<number>} rgb @param {number[]} out */
export const glintTint = (rgb, out) => {
  for (let i = 0; i < 3; i++) out[i] = GLINT_LIGHT[i] + (rgb[i] - GLINT_LIGHT[i]) * GLINT_TINT;
  return out;
};
export const outlinePx = (rows) => Math.max(OUTLINE_PX_MIN, (OUTLINE_PX * rows) / GLINT_REF_ROWS);
export const outlineBreath = (seconds, still = false) => (still ? 1 : 1 - OUTLINE_BREATH * 0.5 * (1 - Math.cos(2 * Math.PI * OUTLINE_BREATH_HZ * seconds)));
export const glintSheen = (d) => GLINT_GAIN.sheen * smooth(GLINT_SHEEN_NEAR_M, GLINT_SHEEN_FULL_M, d);
export const glintLightLevel = (rgb) => rgb[1] + 0.299 * (rgb[0] - rgb[1]) + 0.114 * (rgb[2] - rgb[1]);
export const glintSheenLight = (level) => smooth(GLINT_SHEEN_DARK, GLINT_SHEEN_LIT, level);
// Every rate repeats a whole number of times in the 60 s clock, so nothing jumps when the clock wraps.
export const glintRatesWhole = () => [GLINT_SHEEN_HZ, OUTLINE_BREATH_HZ, ...Array.from({ length: GLINT_CROWN_COUNT }, (_, i) => GLINT_RATE + i * GLINT_RATE_STEP)]
  .every((r) => Math.abs(r * 60 - Math.round(r * 60)) < 1e-9);

export const NODE_MASK_VS = bbVertexShader({
  head: 'uniform vec4 uMaskRect;   // NODE-OUTLINE: the node\'s rectangle in NDC - its centre (xy), one over its half size (zw)',
  main: '  if (!gone) gl_Position.xy = (gl_Position.xy - uMaskRect.xy * gl_Position.w) * uMaskRect.zw;   // NODE-OUTLINE (render/nodeGlint.js): the rectangle over the tile',
});

// The cut repeats LPT_FS_TEXEL in lowPolyTreesGlsl.js; keep the two in step.
export const NODE_MASK_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vShade;
in float vAlpha;
in float vFade;
uniform sampler2D uTex;
out vec4 o;
${BAYER_GLSL}
void main() {
  vec4 tex = texture(uTex, vUV);   // sampled before any branch (SPRITE-GRAD's law)
  float a = tex.a;
  if (vFade < 1.5 && (vUV.x < 0.0 || vUV.x > 1.0 || vUV.y < 0.0 || vUV.y > 1.0)) a = 0.0;   // a flat's margin clear; a tree's uv wraps
  a = vAlpha > 0.0 ? a * vAlpha : 1.0;
  if (vFade < 1.0 ? bayer4(gl_FragCoord.xy) + 0.03125 >= vFade : (vFade > 1.5 && vFade < 3.0 && bayer4(gl_FragCoord.xy) + 0.03125 < 3.0 - vFade)) discard;
  if (a < 0.5) discard;
  o = vec4(0.0);
}`;

// Glints get one varying each, written out per slot: some shader translators reject a loop-indexed output array.
const GLINT_SLOTS = Array.from({ length: GLINT_CROWN_COUNT }, (_, i) => i);
const f = (x) => x.toFixed(4);
const GLINT_HASH_GLSL = `uint glintHash(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float glintRand(uint x) { return float(glintHash(x) >> 8) * (1.0 / 16777216.0); }
float maskAt(vec2 at, ivec2 lo, ivec2 hi) { return texelFetch(uMask, clamp(ivec2(floor(at)), lo, hi), 0).r; }`;
const GLINT_LIFE_GLSL = `const float PI = 3.141592653589793;
uint glintSeed() { return uint(uSeed * 1009.0 + 0.5) * 2654435761u; }   // each node its own glints
float glintLife(int i, uint seed, float tm, out uint life) {
  uint ui = uint(i);
  float lives = ${f(GLINT_RATE * 60)} + float(i) * ${f(GLINT_RATE_STEP * 60)};   // a glint's lives a period - whole
  float cyc = tm * lives / 60.0 + glintRand(seed ^ (ui * 0x9e3779b9u));
  float c = mod(floor(cyc), lives);
  float env = uStill > 0.5 ? ${f(GLINT_STILL)} : pow(max(sin(PI * fract(cyc)), 0.0), ${f(GLINT_FLASH)});
  life = glintHash(seed + ui * 0x85ebca6bu + uint(c) * 0xc2b2ae35u);
  return env;
}
float glintTurn(uint life) {   // a life's own turn, within 17 degrees
  return (glintRand(life ^ 0x5bd1e995u) - 0.5) * 0.6;
}`;

export const NODE_GLINT_VS = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec2 aP;
uniform highp sampler2D uMask;   // the atlas (depth)
uniform vec4 uRect;              // the rectangle's NDC centre (xy) and half size (zw)
uniform vec4 uTile;              // its tile in the atlas: the corner (xy) and the size (zw), in texels
uniform float uHold;             // how far inside the silhouette a spot must stand, in the tile's texels
uniform float uSeed;             // the node's own (0..1)
uniform float uTime;             // the glow's wrapped clock (s)
uniform float uStill;            // 1 under reduced motion: every glint at its first life, steady
uniform mat4 uVP;
uniform vec3 uRight;             // the frame's billboard basis - the plane a picture stands in
uniform vec3 uUp;
uniform vec4 uAnchor[${2 * GLINT_ANCHORS}];   // each picture a glint may stand on: its base (xyz) and width (w); its height (x), and 1 (y) a flat its own picture judges
uniform int uAnchors;
uniform sampler2D uFlatTex;      // the node's flats' own picture (its first batch's)
uniform int uCount;              // NODE-CROWN: its glints - a flat's GLINT_COUNT, a big crown's more
${GLINT_SLOTS.map((i) => `flat out vec4 vGlint${i};`).join('\n')}
${GLINT_HASH_GLSL}
${GLINT_LIFE_GLSL}
// a point of a flat its own picture holds - judged at the flat's own texel, so it holds as the eye moves (the mask's
// pixels came and went under it a frame at a time)
bool opaque(vec2 uv) { return textureLod(uFlatTex, uv, 0.0).a >= 0.5; }
bool holds(vec2 at, ivec2 lo, ivec2 hi) {
  return maskAt(at + vec2(uHold, 0.0), lo, hi) < 1.0 && maskAt(at - vec2(uHold, 0.0), lo, hi) < 1.0
    && maskAt(at + vec2(0.0, uHold), lo, hi) < 1.0 && maskAt(at - vec2(0.0, uHold), lo, hi) < 1.0;
}
vec4 glintOf(int i, uint seed, float tm) {
  if (i >= uCount) return vec4(0.0, 0.0, 1.0, 0.0);   // NODE-CROWN: past the node's own count, none
  uint life;
  float env = glintLife(i, seed, tm, life);
  if (env < 0.004) return vec4(0.0, 0.0, 1.0, 0.0);
  if (uAnchors < 1) return vec4(0.0, 0.0, 1.0, 0.0);   // no picture to stand on
  ivec2 lo = ivec2(uTile.xy), hi = ivec2(uTile.xy + uTile.zw) - 1;
  for (int j = 0; j < ${GLINT_TRIES}; j++) {
    uint h = glintHash(life + uint(j) * 0x27d4eb2fu), g = glintHash(h ^ 0x68e31da4u);
    int k = int(h % uint(max(uAnchors, 1)));
    vec4 a = uAnchor[2 * k], b = uAnchor[2 * k + 1];
    vec2 uv = vec2(float(g & 0xffffu), float(g >> 16)) / 65535.0;   // a point of the picture, its own
    vec4 cp = uVP * vec4(a.xyz + uRight * ((uv.x - 0.5) * a.w) + uUp * (uv.y * b.x), 1.0);
    if (cp.w <= ${f(GLINT_NEAR_W)}) continue;   // behind the eye
    vec2 spot = (cp.xy / cp.w - uRect.xy) / uRect.zw * 0.5 + 0.5;   // the rectangle's shares
    if (spot.x < 0.0 || spot.y < 0.0 || spot.x > 1.0 || spot.y > 1.0) continue;   // off the screen
    if (b.y > 0.5) {   // a flat: its own picture judges the point, and its depth is the point's own
      if (opaque(uv)) return vec4(spot, cp.z / cp.w * 0.5 + 0.5, env);
      continue;
    }
    vec2 at = uTile.xy + spot * uTile.zw;   // a 3D tree's crown: the silhouette judges it
    float d = maskAt(at, lo, hi);
    if (d < 1.0 && holds(at, lo, hi)) return vec4(spot, d, env);
  }
  return vec4(0.0, 0.0, 1.0, 0.0);   // no try held: this life is dark
}
void main() {
  gl_Position = vec4(uRect.xy + aP * uRect.zw, 0.0, 1.0);
  float tm = uTime * (1.0 - uStill);
  uint seed = glintSeed();
${GLINT_SLOTS.map((i) => `  vGlint${i} = glintOf(${i}, seed, tm);`).join('\n')}
}`;

export const NODE_GLINT_FS = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uMask;   // the atlas (depth)
uniform vec4 uRect;              // the rectangle's NDC centre (xy) and half size (zw)
uniform vec4 uTile;              // its tile in the atlas: the corner (xy) and the size (zw), in texels
uniform vec4 uInner;             // the picture's own box in the rectangle, as its shares: x0, y0, x1, y1
uniform vec4 uViewport;          // the frame's viewport, in pixels
uniform float uGlint;            // a glint's reach, in pixels
uniform vec3 uColor;             // the light (glintTint)
uniform float uAlpha;            // its kindling, its distance's fade and the light where it stands (GLINT-LIGHT)
uniform float uSeed;             // the node's own (0..1)
uniform float uSheen;            // the sheen's gain (glintSheen - none near; glintSheenLight - none in the dark)
uniform float uTime;             // the glow's wrapped clock (s)
uniform float uStill;            // 1 under reduced motion: the glints held, no sheen
uniform mat4 uInvVP;
uniform mat4 uVP;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
${GLINT_SLOTS.map((i) => `flat in vec4 vGlint${i};`).join('\n')}
out vec4 o;
${FOG_FACTOR_GLSL}
${GLINT_HASH_GLSL}
${GLINT_LIFE_GLSL}
// a glint's star about its spot: a white-hot core in a soft bloom, and four thin rays turned by its own turn
void glintAt(vec4 g, int i, uint seed, float tm, vec2 q, vec2 rectPx, inout vec3 parts, inout float best, inout float bestDepth) {
  if (g.w <= 0.0) return;   // a dark life
  vec2 off = (q - g.xy) * rectPx;
  if (dot(off, off) > uGlint * uGlint) return;
  uint life;
  glintLife(i, seed, tm, life);   // NODE-CROWN: the life the vertex stage stood it at, its turn its own
  float th = glintTurn(life);
  off = mat2(cos(th), sin(th), -sin(th), cos(th)) * off;
  float w = max(0.75, 0.08 * uGlint), cr = max(1.0, 0.22 * uGlint), br = max(1.5, 0.4 * uGlint);
  vec2 a = max(1.0 - abs(off) / uGlint, 0.0);
  float co = exp(-dot(off, off) / (cr * cr)) * g.w;
  float ry = (exp(-off.y * off.y / (w * w)) * a.x * a.x + exp(-off.x * off.x / (w * w)) * a.y * a.y) * g.w;
  float bl = exp(-dot(off, off) / (br * br)) * g.w;
  parts += vec3(co, ry, bl);
  if (co + ry + bl > best) { best = co + ry + bl; bestDepth = g.z; }
}
void main() {
  vec2 ndc = (gl_FragCoord.xy - uViewport.xy) / uViewport.zw * 2.0 - 1.0;
  vec2 q = (ndc - uRect.xy) / uRect.zw * 0.5 + 0.5;
  ivec2 lo = ivec2(uTile.xy), hi = ivec2(uTile.xy + uTile.zw) - 1;
  vec2 rectPx = uRect.zw * uViewport.zw;
  uint seed = glintSeed();
  float tm = uTime * (1.0 - uStill);
  float here = maskAt(uTile.xy + q * uTile.zw, lo, hi);
  // THE SHEEN: a soft band rising across the picture's own box, lit only where the silhouette is
  float sheen = 0.0;
  if (here < 1.0 && uStill < 0.5) {
    vec2 qi = (q - uInner.xy) / max(uInner.zw - uInner.xy, vec2(1e-4));
    float pos = mix(-0.4, 1.4, fract(tm * ${f(GLINT_SHEEN_HZ)} + uSeed) / ${f(GLINT_SHEEN_SHARE)});   // from below the picture to past its crown, then dark
    float k = (qi.y * 0.8 + qi.x * 0.2 - pos) * 6.0;
    sheen = exp(-k * k) * uSheen;
  }
  // THE GLINTS: each its star about the spot its life stands at
  vec3 parts = vec3(0.0);   // core, rays, bloom
  float best = 0.0, bestDepth = 1.0;
${GLINT_SLOTS.map((i) => `  glintAt(vGlint${i}, ${i}, seed, tm, q, rectPx, parts, best, bestDepth);`).join('\n')}
  float lit = sheen + ${f(GLINT_GAIN.ray)} * parts.y + ${f(GLINT_GAIN.bloom)} * parts.z + ${f(GLINT_GAIN.core)} * parts.x;
  if (lit * uAlpha < 0.002) discard;   // nothing lit here
  float dep = min(here, bestDepth);   // the nearer picture: the fragment's own, or its strongest glint's
  vec4 wp = uInvVP * vec4(ndc, dep * 2.0 - 1.0, 1.0);
  vec3 at3 = wp.xyz / wp.w;
  vec3 away = at3 - uCamPos;
  float far = length(away);
  vec4 cp = uVP * vec4(at3 - away * (min(${f(GLINT_PULL)}, 0.5 * far) / max(far, 1e-4)), 1.0);   // stood toward the eye, never past half its way
  gl_FragDepth = clamp(cp.z / cp.w * 0.5 + 0.5, 0.0, 1.0);
  vec3 light = uColor * (sheen + ${f(GLINT_GAIN.ray)} * parts.y + ${f(GLINT_GAIN.bloom)} * parts.z) + mix(uColor, vec3(1.0), ${f(GLINT_CORE_WHITE)}) * ${f(GLINT_GAIN.core)} * parts.x;
  o = vec4(dwWaterFogAdd(light * uAlpha * fogFactorAt(at3), at3), 1.0);   // AUDIT NODE-GLINT: and the sea's murk, as an added light takes it (render/duelWall.js)
}`;

export const NODE_RING_VS = `#version 300 es
layout(location = 0) in vec2 aP;
uniform vec4 uRect;
void main() { gl_Position = vec4(uRect.xy + aP * uRect.zw, 0.0, 1.0); }`;

const TAP_DIRS = Array.from({ length: OUTLINE_TAPS }, (_, k) => [Math.cos((2 * Math.PI * k) / OUTLINE_TAPS), Math.sin((2 * Math.PI * k) / OUTLINE_TAPS)]);
export const NODE_RING_FS = `#version 300 es
precision highp float;
uniform highp sampler2D uMask;   // the atlas (depth)
uniform vec4 uRect;              // the rectangle's NDC centre (xy) and half size (zw)
uniform vec4 uTile;              // its tile in the atlas: the corner (xy) and the size (zw), in texels
uniform vec4 uViewport;          // the frame's viewport, in pixels
uniform float uRing;             // the ring's width, in the tile's texels
uniform vec4 uOutlineColor;      // rgb, and the ring's opacity (its kindling, its distance's fade and its breath)
uniform mat4 uInvVP;
uniform mat4 uVP;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 o;
${FOG_FACTOR_GLSL}
float maskAt(vec2 at, ivec2 lo, ivec2 hi) { return texelFetch(uMask, clamp(ivec2(floor(at)), lo, hi), 0).r; }
void main() {
  vec2 ndc = (gl_FragCoord.xy - uViewport.xy) / uViewport.zw * 2.0 - 1.0;
  vec2 at = uTile.xy + ((ndc - uRect.xy) / uRect.zw * 0.5 + 0.5) * uTile.zw;
  ivec2 lo = ivec2(uTile.xy), hi = ivec2(uTile.xy + uTile.zw) - 1;
  if (maskAt(at, lo, hi) < 1.0) discard;   // the node itself
  // a node FITTED into its tile (fewer texels than pixels): a texel is its centre's sample, so a pixel of the picture's edge
  // can fall in an empty one - the node's if any of the four texel centres round it is, and the reach half a texel more
  bool fitted = any(lessThan(uTile.zw, uRect.zw * uViewport.zw - 0.5));
  if (fitted && min(min(maskAt(at + vec2(-0.5, -0.5), lo, hi), maskAt(at + vec2(0.5, -0.5), lo, hi)), min(maskAt(at + vec2(-0.5, 0.5), lo, hi), maskAt(at + vec2(0.5, 0.5), lo, hi))) < 1.0) discard;
  float reach = uRing + (fitted ? 0.5 : 0.0);
  float d = 1.0;
${TAP_DIRS.map(([x, y]) => `  d = min(d, min(maskAt(at + vec2(${x.toFixed(6)}, ${y.toFixed(6)}) * reach, lo, hi), maskAt(at + vec2(${x.toFixed(6)}, ${y.toFixed(6)}) * (0.5 * reach), lo, hi)));`).join('\n')}
  if (d >= 1.0) discard;   // no silhouette within the ring's reach
  vec4 w = uInvVP * vec4(ndc, d * 2.0 - 1.0, 1.0);
  vec3 at3 = w.xyz / w.w;
  vec3 away = at3 - uCamPos;
  vec4 c = uVP * vec4(at3 + away * (${OUTLINE_RING_BACK.toFixed(4)} / max(length(away), 1e-4)), 1.0);   // stood behind the silhouette it borders
  gl_FragDepth = clamp(c.z / c.w * 0.5 + 0.5, 0.0, 1.0);
  o = vec4(dwWaterFog(uOutlineColor.rgb, at3), uOutlineColor.a * fogFactorAt(at3));
}`;

const MASK_UNIFORMS = ['uProj', 'uView', 'uRight', 'uUp', 'uOrigin', 'uSize', 'uFlatWind', 'uSway', 'uWindfallSway', 'uWindfallAxis', 'uTip',
  'uFacePoint', 'uElitePad', 'uTex', 'uMesh', 'uMeshScale', 'uMeshColor', 'uMeshAlpha', 'uLptCut', 'uLptBand', 'uLptSun', 'uMaskRect'];
const GLINT_UNIFORMS = ['uMask', 'uRect', 'uTile', 'uInner', 'uHold', 'uRight', 'uUp', 'uAnchor', 'uAnchors', 'uCount', 'uFlatTex', 'uViewport', 'uGlint', 'uColor', 'uAlpha', 'uSeed', 'uSheen', 'uTime', 'uStill',
  'uInvVP', 'uVP', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uFocus', 'uJungleHaze', 'uDwFog'];
const RING_UNIFORMS = ['uMask', 'uRect', 'uTile', 'uViewport', 'uRing', 'uOutlineColor', 'uInvVP', 'uVP', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uFocus', 'uJungleHaze', 'uDwFog'];
const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_FOCUS = new Float32Array(4);
const NO_WATER_FOG = new Float32Array(20);
const ZERO4 = new Float32Array(4);
const ZERO_ORIGIN = Object.freeze([0, 0, 0]);
const isVec3 = (v) => v != null && typeof v === 'object' && v.length >= 3;

/** @typedef {{ batch: any, first: number, count: number, centers?: number[][]|null, center?: number[]|null, entry?: any }} NodePicture */

/** @param {NodePicture} pic @param {ReadonlyArray<any>} frames @param {WeakMap<any[], Map<any, number>>} rows @param {Float32Array} out */
export function treeInstanceOf(pic, frames, rows, out) {
  if (!pic.center || !pic.entry) return null;
  for (const set of [pic.entry.lowPolyTrees, pic.entry.jungleTrees]) {
    if (!set?.trees || !set.centers) continue;
    let byCenter = rows.get(set.centers);
    if (!byCenter) { byCenter = new Map(); for (let k = 0; k < set.centers.length; k++) byCenter.set(set.centers[k], k); rows.set(set.centers, byCenter); }
    const k = byCenter.get(pic.center);
    if (k === undefined) continue;
    const o = k * 6, handle = set.handles[set.trees[o]];
    for (const f of frames) {
      if (!f?.cut?.has(handle)) continue;
      const run = f.runs.find((r) => r.run.handle === handle);
      if (!run) return null;
      out[0] = set.trees[o + 1] + set.ox; out[1] = set.trees[o + 2] + set.oy; out[2] = set.trees[o + 3] + set.oz; out[3] = set.trees[o + 5]; out[4] = set.trees[o + 4];
      return { frame: f, run };
    }
    return null;
  }
  return null;
}

const _clip = new Float64Array(24);
const BOX_EDGES = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7].flatMap((c) => [1, 2, 4].filter((b) => !(c & b)).map((b) => [c, c | b])));

/** @param {ReadonlyArray<ArrayLike<number>>} boxes @param {number} count @param {ArrayLike<number>} vp @param {number[]} out */
export function screenRect(boxes, count, vp, out) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (x, y, w) => {
    const px = x / w, py = y / w;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  };
  for (let i = 0; i < count; i++) {
    const b = boxes[i];
    for (let c = 0; c < 8; c++) {
      const x = c & 1 ? b[3] : b[0], y = c & 2 ? b[4] : b[1], z = c & 4 ? b[5] : b[2];
      _clip[c * 3] = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
      _clip[c * 3 + 1] = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      _clip[c * 3 + 2] = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (_clip[c * 3 + 2] > GLINT_NEAR_W) take(_clip[c * 3], _clip[c * 3 + 1], _clip[c * 3 + 2]);
    }
    for (const [a, e] of BOX_EDGES) {
      const wa = _clip[a * 3 + 2], we = _clip[e * 3 + 2];
      if ((wa > GLINT_NEAR_W) === (we > GLINT_NEAR_W)) continue;
      const t = (GLINT_NEAR_W - wa) / (we - wa);
      take(_clip[a * 3] + t * (_clip[e * 3] - _clip[a * 3]), _clip[a * 3 + 1] + t * (_clip[e * 3 + 1] - _clip[a * 3 + 1]), GLINT_NEAR_W);
    }
  }
  if (!(x1 > -1 && x0 < 1 && y1 > -1 && y0 < 1)) return null;
  x0 = Math.max(-GLINT_OVERHANG, x0); y0 = Math.max(-GLINT_OVERHANG, y0); x1 = Math.min(GLINT_OVERHANG, x1); y1 = Math.min(GLINT_OVERHANG, y1);
  out[0] = (x0 + x1) / 2; out[1] = (y0 + y1) / 2; out[2] = (x1 - x0) / 2; out[3] = (y1 - y0) / 2;
  return out;
}

export function widenRect(rect, pad, out) {
  const x0 = Math.max(-1, rect[0] - rect[2] - pad[0]), x1 = Math.min(1, rect[0] + rect[2] + pad[0]);
  const y0 = Math.max(-1, rect[1] - rect[3] - pad[1]), y1 = Math.min(1, rect[1] + rect[3] + pad[1]);
  out[0] = (x0 + x1) / 2; out[1] = (y0 + y1) / 2; out[2] = (x1 - x0) / 2; out[3] = (y1 - y0) / 2;
  return out;
}

export function snapRect(rect, vw, vh) {
  const x0 = Math.floor((rect[0] - rect[2] + 1) * 0.5 * vw), x1 = Math.ceil((rect[0] + rect[2] + 1) * 0.5 * vw);
  const y0 = Math.floor((rect[1] - rect[3] + 1) * 0.5 * vh), y1 = Math.ceil((rect[1] + rect[3] + 1) * 0.5 * vh);
  rect[0] = ((x0 + x1) / vw) - 1; rect[2] = (x1 - x0) / vw;
  rect[1] = ((y0 + y1) / vh) - 1; rect[3] = (y1 - y0) / vh;
  return rect;
}

export function innerShare(inner, rect, out) {
  const rx0 = rect[0] - rect[2], ry0 = rect[1] - rect[3], rw = 2 * rect[2], rh = 2 * rect[3];
  out[0] = (inner[0] - inner[2] - rx0) / rw; out[1] = (inner[1] - inner[3] - ry0) / rh;
  out[2] = (inner[0] + inner[2] - rx0) / rw; out[3] = (inner[1] + inner[3] - ry0) / rh;
  return out;
}

function invert4(m, out) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  const id = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * id; out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * id;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * id; out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * id;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * id; out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * id;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * id; out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * id;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * id; out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * id;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * id; out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * id;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * id; out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * id;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * id; out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * id;
  return out;
}
function mul4(a, b, out) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
}

export const NODE_GLINT_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze([[NODE_MASK_VS, NODE_MASK_FS], [NODE_GLINT_VS, NODE_GLINT_FS], [NODE_RING_VS, NODE_RING_FS]]));

export class NodeGlintRenderer {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    const [mask, light, ring] = NODE_GLINT_PROGRAMS;
    const built = [];
    try {
      built.push(this.mask = buildProgram(gl, mask[0], mask[1], 'node glint mask'));
      built.push(this.light = buildProgram(gl, light[0], light[1], 'node glint light'));
      built.push(this.ring = buildProgram(gl, ring[0], ring[1], 'node outline ring'));
    } catch (e) { for (const p of built) gl.deleteProgram(p); throw e; }
    /** @type {Record<string, WebGLUniformLocation|null>} */
    this.um = {};
    for (const n of MASK_UNIFORMS) this.um[n] = gl.getUniformLocation(this.mask, n);
    /** @type {Record<string, WebGLUniformLocation|null>} */
    this.ul = {};
    for (const n of GLINT_UNIFORMS) this.ul[n] = gl.getUniformLocation(this.light, n);
    /** @type {Record<string, WebGLUniformLocation|null>} */
    this.ur = {};
    for (const n of RING_UNIFORMS) this.ur[n] = gl.getUniformLocation(this.ring, n);
    const size = GLINT_TILE * GLINT_GRID;
    this.atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.atlas, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.quad = gl.createVertexArray();
    gl.bindVertexArray(this.quad);
    this.quadVb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, LPT_INSTANCE_FLOATS * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this._row = new Float32Array(LPT_INSTANCE_FLOATS);
    /** @type {WeakMap<any, WebGLVertexArrayObject>} */
    this._vaos = new WeakMap();
    /** @type {WebGLVertexArrayObject[]} */
    this._made = [];
    /** @type {WeakMap<any[], Map<any, number>>} */
    this._rows = new WeakMap();
    this._nodes = Array.from({ length: GLINT_MAX }, () => ({ g: null, inner: [0, 0, 0, 0], rect: [0, 0, 0, 0], tile: [0, 0, 0, 0], share: [0, 0, 0, 0], glint: 1, count: GLINT_COUNT, hold: 1, ring: 1, boxes: /** @type {number[][]} */ ([]), spans: /** @type {number[][]} */ ([]), anchors: new Float32Array(GLINT_ANCHORS * 8), anchorN: 0, flatTex: null }));
    this._vp = new Float32Array(16);
    this._inv = new Float32Array(16);
    this._pad = /** @type {[number, number]} */ ([0, 0]);
    this._tint = [0, 0, 0];
    this._lit = [1, 1, 1];
    this.drawn = 0;
    this.trees = 0;
    this.ringed = 0;
  }

  _vaoFor(gpu) {
    let vao = this._vaos.get(gpu);
    if (vao) return vao;
    const gl = this.gl;
    vao = /** @type {WebGLVertexArrayObject} */ (gl.createVertexArray());
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.ib);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    const stride = LPT_INSTANCE_FLOATS * 4;
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 0); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 16); gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this._vaos.set(gpu, vao);
    this._made.push(vao);
    return vao;
  }

  static _span(spans, i, x, y, z, w, h, own) {
    const p = spans[i] ??= [0, 0, 0, 0, 0, 0];
    p[0] = x; p[1] = y; p[2] = z; p[3] = w; p[4] = h; p[5] = own;
  }

  static _box(boxes, i, x0, y0, z0, x1, y1, z1) {
    const b = boxes[i] ??= [0, 0, 0, 0, 0, 0];
    b[0] = x0; b[1] = y0; b[2] = z0; b[3] = x1; b[4] = y1; b[5] = z1;
  }

  /**
   * @param {ReadonlyArray<any>} list
   * @param {any} r
   * @param {number} seconds
   * @param {boolean} [still]
   * @param {{ glint: boolean, ring: boolean }} [look]
   */
  draw(list, r, seconds, still = false, look = RESOURCE_HIGHLIGHTS.glint) {
    this.drawn = 0; this.trees = 0; this.ringed = 0;
    const gl = this.gl;
    if (!list.length || !r._proj || !r._view || !isVec3(r._camPos) || !(look.glint || look.ring)) return 0;
    const vpm = mul4(r._proj, r._view, this._vp);
    const view = gl.getParameter(gl.VIEWPORT), target = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const vw = Math.max(1, view[2]), vh = Math.max(1, view[3]);
    const roomPx = glintPxMax(vh) + 2, ringPx = outlinePx(vh);
    const frames = r.lptDrawnFrames?.() ?? [];
    let n = 0;
    for (const g of list) {
      if (n >= GLINT_MAX) break;
      const pics = g.mark?.pictures;
      if (!pics?.length || !(g.alpha > 0.001)) continue;
      const s = this._nodes[n];
      let k = 0, crown = 0;
      s.flatTex = null;
      for (const pic of /** @type {NodePicture[]} */ (pics)) {
        const b = pic.batch;
        const t = pic.center ? treeInstanceOf(pic, frames, this._rows, this._row) : null;
        const tex = !t && b?.vao && !b._dead && pic.count > 0 ? r.textures?.get(billboardKey(b)) ?? null : null;
        if (tex && !s.flatTex) s.flatTex = tex;
        const own = tex && tex === s.flatTex ? 1 : 0;
        if (!t && b?.size && pic.centers?.length) {
          const o = b.origin || g.mark.origin || ZERO_ORIGIN;
          for (let j = 0; j < pic.centers.length; j++) {
            const c = pic.centers[j], fs = b._scales?.[pic.first + j] ?? 1, hw = b.size.w * 0.5 * fs, h = b.size.h * fs;
            NodeGlintRenderer._span(s.spans, k, c[0] + o[0], c[1] + o[1], c[2] + o[2], 2 * hw, h, own);
            NodeGlintRenderer._box(s.boxes, k++, c[0] + o[0] - hw, c[1] + o[1], c[2] + o[2] - hw, c[0] + o[0] + hw, c[1] + o[1] + h, c[2] + o[2] + hw);
          }
        }
        if (t) {
          // The run size already includes the prototype scale, so apply only the row scale here.
          const row = this._row, reach = t.run.size[0] * GLINT_TREE_REACH * row[4], h = t.run.size[1] * row[4];
          NodeGlintRenderer._span(s.spans, k, row[0], row[1], row[2], 2 * reach, h, 0);
          NodeGlintRenderer._box(s.boxes, k++, row[0] - reach, row[1], row[2] - reach, row[0] + reach, row[1] + h, row[2] + reach);
          crown = Math.max(crown, crownSidePx(r._proj, vpm[3] * row[0] + vpm[7] * row[1] + vpm[11] * row[2] + vpm[15], t.run.size[0] * row[4], h, vw, vh));
        }
      }
      if (!k || !screenRect(s.boxes, k, vpm, s.inner)) continue;
      s.anchorN = Math.min(k, GLINT_ANCHORS);
      for (let i = 0; i < s.anchorN; i++) {
        const sp = s.spans[Math.floor((i * k) / s.anchorN)], o = i * 8;
        s.anchors[o] = sp[0]; s.anchors[o + 1] = sp[1]; s.anchors[o + 2] = sp[2]; s.anchors[o + 3] = sp[3]; s.anchors[o + 4] = sp[4]; s.anchors[o + 5] = sp[5];
      }
      if (crown > 0) { s.count = glintCrownCount(vh, crown); s.glint = glintCrownPx(vh, crown); } else { s.count = GLINT_COUNT; s.glint = glintPx(vh, Math.max(s.inner[2] * vw, s.inner[3] * vh)); }
      const room = look.glint ? Math.max(roomPx, s.glint + 2) : Math.ceil(ringPx) + 2;
      this._pad[0] = (2 * room) / vw; this._pad[1] = (2 * room) / vh;
      snapRect(widenRect(s.inner, this._pad, s.rect), vw, vh);
      innerShare(s.inner, s.rect, s.share);
      const wPx = Math.round(s.rect[2] * vw), hPx = Math.round(s.rect[3] * vh), fit = Math.min(1, GLINT_TILE / Math.max(wPx, hPx));
      s.tile[0] = (n % GLINT_GRID) * GLINT_TILE; s.tile[1] = Math.floor(n / GLINT_GRID) * GLINT_TILE;
      s.tile[2] = Math.max(1, Math.min(GLINT_TILE, Math.ceil(wPx * fit))); s.tile[3] = Math.max(1, Math.min(GLINT_TILE, Math.ceil(hPx * fit)));
      s.hold = Math.max(1, GLINT_HOLD_PX * fit);
      s.ring = Math.max(1, ringPx * fit);
      s.g = g;
      n++;
    }
    if (!n) return 0;
    const U = this.um;
    const scissor = gl.isEnabled(gl.SCISSOR_TEST);
    if (scissor) gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, GLINT_TILE * GLINT_GRID, GLINT_TILE * GLINT_GRID);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.mask);
    gl.uniformMatrix4fv(U.uProj, false, r._proj);
    gl.uniformMatrix4fv(U.uView, false, r._view);
    gl.uniform3fv(U.uRight, r._bbRight);
    gl.uniform3fv(U.uUp, r._bbUp);
    gl.uniform4fv(U.uFlatWind, r._flatWind ?? ZERO4);
    if (U.uWindfallAxis) { gl.uniform4fv(U.uWindfallSway, r._windfallSway ?? ZERO4); gl.uniform4fv(U.uWindfallAxis, r._windfallAxis ?? ZERO4); }
    gl.uniform4f(U.uFacePoint, 0, 0, 0, 0);
    gl.uniform4f(U.uElitePad, 0, 0, 0, 0);
    gl.uniform1i(U.uTex, 0);
    gl.uniform3f(U.uMeshColor, 1, 1, 1);
    gl.uniform4f(U.uLptSun, 0, 1, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    const wfLaw = windfallLawOn(r._windfall);
    let lptOn;
    const sendCut = (f) => {
      if (f === lptOn) return;
      lptOn = f;
      gl.uniform4f(U.uLptCut, f ? f.eye[0] : 0, f ? f.eye[1] : 0, f ? f.eye[2] : 0, f ? f.radius : 0);
      gl.uniform1f(U.uLptBand, f ? f.band : 0);
    };
    for (let i = 0; i < n; i++) {
      const s = this._nodes[i];
      gl.viewport(s.tile[0], s.tile[1], s.tile[2], s.tile[3]);
      gl.uniform4f(U.uMaskRect, s.rect[0], s.rect[1], 1 / s.rect[2], 1 / s.rect[3]);
      for (const pic of /** @type {NodePicture[]} */ (s.g.mark.pictures)) {
        const b = pic.batch;
        const tex = b?.vao && !b._dead && pic.count > 0 ? r.textures?.get(billboardKey(b)) ?? null : null;
        if (tex) {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.uniform1f(U.uMesh, 0);
          gl.uniform2f(U.uSize, b.size.w, b.size.h);
          const o = b.origin || s.g.mark.origin || ZERO_ORIGIN;
          gl.uniform3f(U.uOrigin, o[0], o[1], o[2]);
          gl.uniform1f(U.uSway, swayShare(b, wfLaw));
          const tp = b.tip;
          gl.uniform3f(U.uTip, tp ? tp[0] : 0, tp ? tp[1] : 0, tp ? tp[2] : 0);
          sendCut(b.lptProto ? frames.find((f) => f?.cut && lptCuts(f.cut, b.lptProto)) ?? null : null);
          gl.bindVertexArray(b.vao);
          gl.drawElements(gl.TRIANGLES, 6 * pic.count, gl.UNSIGNED_INT, (b._ibOff | 0) + pic.first * GLINT_QUAD_INDEX_BYTES);
        }
        const t = pic.center ? treeInstanceOf(pic, frames, this._rows, this._row) : null;
        if (!t) continue;
        const { frame: f, run } = t;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._row);
        gl.bindVertexArray(this._vaoFor(f.gpu));
        gl.uniform1f(U.uMesh, 1);
        gl.uniform3f(U.uTip, 0, 0, 0);
        gl.uniform3f(U.uOrigin, 0, 0, 0);
        gl.uniform3f(U.uMeshScale, run.scale[0], run.scale[1], run.scale[2]);
        gl.uniform2f(U.uSize, run.size[0], run.size[1]);
        gl.uniform1f(U.uSway, swayShare(run, wfLaw));
        sendCut(f);
        for (const sub of run.subs) {
          if (!sub.tex) continue;
          gl.bindTexture(gl.TEXTURE_2D, sub.tex);
          gl.uniform1f(U.uMeshAlpha, sub.alpha);
          gl.drawElementsInstanced(gl.TRIANGLES, sub.count, gl.UNSIGNED_INT, sub.offset, 1);
        }
        this.trees++;
      }
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.uniform1f(U.uMesh, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(view[0], view[1], view[2], view[3]);
    if (scissor) gl.enable(gl.SCISSOR_TEST);
    if (look.ring) this._rings(n, r, vpm, view, vw, vh, seconds, still);
    if (!look.glint) { for (let i = 0; i < n; i++) this._nodes[i].g = null; this._handBack(); this.drawn = n; return n; }
    const L = this.ul;
    gl.useProgram(this.light);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(L.uMask, 0);
    gl.uniform1i(L.uFlatTex, 1);
    gl.uniform4f(L.uViewport, view[0], view[1], vw, vh);
    gl.uniformMatrix4fv(L.uInvVP, false, invert4(vpm, this._inv) ?? this._inv);
    gl.uniformMatrix4fv(L.uVP, false, vpm);
    gl.uniform3fv(L.uRight, r._bbRight);
    gl.uniform3fv(L.uUp, r._bbUp);
    gl.uniform1f(L.uTime, seconds);
    gl.uniform1f(L.uStill, still ? 1 : 0);
    gl.uniform1i(L.uFogMode, r._fogMode ?? 0);
    gl.uniform1f(L.uFogDensity, r._fogDensity ?? 0);
    gl.uniform2fv(L.uFogRange, r._fogRange ?? NO_FOG_RANGE);
    gl.uniform3fv(L.uCamPos, r._camPos);
    if (L.uFocus) gl.uniform4fv(L.uFocus, r._focus ?? NO_FOCUS);
    if (L.uJungleHaze) gl.uniform4fv(L.uJungleHaze, r._haze);
    if (L.uDwFog) gl.uniform4fv(L.uDwFog, r._dwFog ?? NO_WATER_FOG);
    gl.bindVertexArray(this.quad);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    const eye = r._camPos;
    for (let i = 0; i < n; i++) {
      const s = this._nodes[i], g = s.g;
      gl.uniform4f(L.uRect, s.rect[0], s.rect[1], s.rect[2], s.rect[3]);
      gl.uniform4f(L.uTile, s.tile[0], s.tile[1], s.tile[2], s.tile[3]);
      gl.uniform4f(L.uInner, s.share[0], s.share[1], s.share[2], s.share[3]);
      gl.uniform1f(L.uHold, s.hold);
      gl.uniform4fv(L.uAnchor, s.anchors, 0, s.anchorN * 8);
      gl.uniform1i(L.uAnchors, s.anchorN);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.flatTex); gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(L.uGlint, s.glint);
      gl.uniform1i(L.uCount, s.count);
      const tint = glintTint(g.rgb, this._tint);
      gl.uniform3f(L.uColor, tint[0], tint[1], tint[2]);
      const level = r.flatLightAt ? glintLightLevel(r.flatLightAt(isVec3(g.at) ? g.at : null, FLAT_LIGHT_FLOOR, this._lit)) : 1;
      gl.uniform1f(L.uAlpha, Math.min(1, g.alpha) * level);
      gl.uniform1f(L.uSeed, Number.isFinite(g.seed) ? g.seed : 0);
      gl.uniform1f(L.uSheen, isVec3(g.at) ? glintSheen(Math.hypot(g.at[0] - eye[0], g.at[1] - eye[1], g.at[2] - eye[2])) * glintSheenLight(level) : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      s.g = null;
    }
    this._handBack();
    this.drawn = n;
    return n;
  }

  _handBack() {
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }

  _rings(n, r, vpm, view, vw, vh, seconds, still) {
    const gl = this.gl, R = this.ur;
    gl.useProgram(this.ring);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(R.uMask, 0);
    gl.uniform4f(R.uViewport, view[0], view[1], vw, vh);
    gl.uniformMatrix4fv(R.uInvVP, false, invert4(vpm, this._inv) ?? this._inv);
    gl.uniformMatrix4fv(R.uVP, false, vpm);
    gl.uniform1i(R.uFogMode, r._fogMode ?? 0);
    gl.uniform1f(R.uFogDensity, r._fogDensity ?? 0);
    gl.uniform2fv(R.uFogRange, r._fogRange ?? NO_FOG_RANGE);
    gl.uniform3fv(R.uCamPos, r._camPos);
    if (R.uFocus) gl.uniform4fv(R.uFocus, r._focus ?? NO_FOCUS);
    if (R.uJungleHaze) gl.uniform4fv(R.uJungleHaze, r._haze);
    if (R.uDwFog) gl.uniform4fv(R.uDwFog, r._dwFog ?? NO_WATER_FOG);
    gl.bindVertexArray(this.quad);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const breath = outlineBreath(seconds, still);
    for (let i = 0; i < n; i++) {
      const s = this._nodes[i], g = s.g;
      gl.uniform4f(R.uRect, s.rect[0], s.rect[1], s.rect[2], s.rect[3]);
      gl.uniform4f(R.uTile, s.tile[0], s.tile[1], s.tile[2], s.tile[3]);
      gl.uniform1f(R.uRing, s.ring);
      gl.uniform4f(R.uOutlineColor, g.rgb[0], g.rgb[1], g.rgb[2], OUTLINE_ALPHA * Math.min(1, g.alpha) * breath);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    this.ringed = n;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.mask); gl.deleteProgram(this.light); gl.deleteProgram(this.ring);
    gl.deleteFramebuffer(this.fb); gl.deleteTexture(this.atlas);
    gl.deleteVertexArray(this.quad); gl.deleteBuffer(this.quadVb); gl.deleteBuffer(this.inst);
    for (const v of this._made) gl.deleteVertexArray(v);
    this._made.length = 0;
    this.mask = null; this.light = null; this.ring = null; this.fb = null; this.atlas = null; this.quad = null; this.quadVb = null; this.inst = null;
  }
}

function reducedMotionReader() {
  let at = -Infinity, reduced = false;
  return (nowS) => {
    if (nowS - at > 1) { at = nowS; try { reduced = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { reduced = false; } }
    return reduced;
  };
}
const idleCall = (fn) => (globalThis.requestIdleCallback ? globalThis.requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 0));

/**
 * @param {any} renderer
 * @param {{ glow?: { draw: (marks: any) => number, dispose?: () => void } | null, now?: () => number, build?: (gl: any) => NodeGlintRenderer,
 *   start?: (gl: any) => () => boolean, idle?: (fn: () => void) => void, reduced?: (nowS: number) => boolean,
 *   look?: () => { glint: boolean, ring: boolean } }} [o]
 */
export function createNodeGlintPass(renderer, { glow: handed, now = () => performance.now() / 1000, build = (gl) => new NodeGlintRenderer(gl), start = (gl) => startPrograms(gl, NODE_GLINT_PROGRAMS), idle = idleCall, reduced = reducedMotionReader(),
  look = () => highlightLook(getPref(RESOURCE_HIGHLIGHT_PREF)) } = {}) {
  const glow = handed === undefined ? createNodeGlowPass(renderer) : handed;
  const state = createNodeGlowState(), list = /** @type {any[]} */ ([]), bare = /** @type {any[]} */ ([]), pictured = /** @type {any[]} */ ([]);
  let pass = /** @type {NodeGlintRenderer|null} */ (null), asked = false, dead = false, failed = false, ready = /** @type {(() => boolean)|null} */ (null);
  const make = () => {
    if (dead) return;
    try { pass = build(renderer.gl); } catch (e) { failed = true; console.warn('[prof] the nodes\' glint would not build', e?.message ?? e); pass = null; releasePrograms(renderer.gl, NODE_GLINT_PROGRAMS); }
  };
  return {
    /** @param {ReadonlyArray<any>|null|undefined} marks */
    draw(marks) {
      bare.length = 0; pictured.length = 0;
      if (marks) for (const m of marks) (failed || !m?.pictures?.length ? bare : pictured).push(m);
      glow?.draw(marks ? bare : null);
      const t = now();
      if (!asked && pictured.length && (ready ??= start(renderer.gl))()) { asked = true; idle(make); }
      if (!nodeGlows(marks ? pictured : null, renderer._camPos, t, state, list).length || !pass) return 0;
      const n = pass.draw(list, renderer, t % 60, reduced(t), look());
      renderer.markForeignPass();
      return n;
    },
    dispose() { dead = true; asked = true; pass?.dispose(); pass = null; if (handed === undefined) glow?.dispose?.(); },
    get pass() { return pass; },
  };
}
