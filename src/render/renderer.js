// @ts-check
// WebGL2 renderer for world geometry. Textures arrive bottom-up, GL's texel order, and upload with flipY off.
// UVs may leave 0..1 (REPEAT), indexed color samples NEAREST, and alpha-0 texels are cutouts the shaders discard.

import { CLOUD_SHADOW_GLSL, cloudFarOf } from './cloudShadow.js';
import { BAYER_GLSL, DISSOLVE_GLSL } from './orderedDither.js';
import { LPT_FS_HEAD, LPT_FS_KEEP, LPT_FS_TEXEL } from './lowPolyTreesGlsl.js';
import { FOG_GLSL } from './fogGlsl.js';
import { WINDFALL_SWAY_GLSL, windfallLawOn, swayShare } from './windfallSway.js';
import { COLUMN_GLSL } from './columnGlsl.js';
import { buildProgram, startPrograms, parallelCompile } from './glProgram.js';
import { realWindowsGlsl, RW_MAIN_DERIVS, RW_MAIN_CUTOUT, RW_MAIN_GLASS, RW_MAIN_ROOM, GLASS_NONE, GLASS_EXTERIOR, GLASS_INTERIOR, winModeFor, roomLightFor, sphereNdcRect, cropProjection, viewTargetSize, viewSkyFrom, viewRays, VIEW_BG_VS, VIEW_BG_FS, VIEW_PANES_MAX, VIEW_PANE_UNIT, VIEW_PANE_VS, VIEW_PANE_FS } from './realWindows.js';
import { MESH_ALPHA_GLSL, samplerParams, samplerKey } from './meshAlpha.js';
import { frameTarget, setFrameTarget } from './renderTarget.js';
import { CLIP_SENTINEL } from '../world/terrainSurface.js';
const NO_SCREEN_OFFSET = Object.freeze([0, 0]);
export const TILE_LAYERS_A_STEP = 8;

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vNormal;
out vec2 vUV;
out vec3 vWorldPos;
void main() {
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV;
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorldPos = world.xyz;
  gl_Position = uProj * uView * world;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPos;
uniform sampler2D uTex;
uniform sampler2D uEmissionTex;
uniform vec3 uLightDir;
uniform vec3 uAmbient;
uniform vec3 uAmbientSky;     // BA1: Unity's AmbientMode.Trilight - sky for a normal facing up, ground facing down,
uniform vec3 uAmbientGround;  //      uAmbient (the equator) sideways, blended by n.y; uTrilight 0 is the flat ambient
uniform float uTrilight;
uniform float uSunScale;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;    // EV5: the second directional term - the masser
uniform float uMoonScale; // 0 = no moon (classic, indoors, daytime)
uniform vec3 uMoonColor;
// ROAD-C c2: the THIRD directional term, and the only pass in the game
// that lights it - DFU's automap beacons take THREE directional lights
// (CreateLightsForAutomapGeometry, Automap.cs:2025-2076) where the world
// has two. 0 = off, which is every other pass.
uniform vec3 uLight3Dir;
uniform float uLight3Scale;
uniform vec3 uLight3Color;
uniform vec3 uEmissionColor;
uniform int uPointCount;
uniform vec4 uPointLights[16]; // xyz scene-space, w range
uniform vec3 uPointColors[16]; // LT1: per-light colour x intensity (AddLight's second switch)
uniform vec4 uIndirect;       // R12: xyz player pos, w range (0 = off)
uniform vec3 uIndirectColor;  // color x intensity x daylight scale
uniform vec3 uFogColor;
uniform int uFogMode; // 0 off, 1 linear, 2 exp, 3 exp2 (DS1: Unity's ExponentialSquared, which Dynamic Skies' fog presets use)
uniform float uFogDensity;
uniform vec2 uFogRange; // start, end
uniform vec3 uCamPos;
uniform float uClipY;  // A1: the automap slice plane (_SclicingPositionY's law) - fragments above it discard; 1e9 = off
// A2 + ROAD-C c2/S6: the SIX automap presentations, which are DFU's two
// SubShader passes crossed with RENDER_IN_GRAYSCALE
// (Assets/Shaders/DaggerfallAutomap.shader):
//   0            off - the world
//   1 / 2        BELOW the slice, colour / grayscale        (pass 1)
//   3 / 4        ABOVE the slice, TRANSPARENT (alpha 0.75)  (pass 2)
//   5 / 6        ABOVE the slice, WIREFRAME constant colour (pass 2)
// Cutout is not a mode: DFU's #else clip(-1.0) arm means "draw the
// above-slice group not at all", and the port simply does not issue it.
// The EVEN modes are the grayscale halves, which is why the tests below
// read amMode % 2 == 0.
uniform float uAutomapMode;
uniform float uAutomapWaterLevel;   // _WaterLevel: AddWater's per-block level (:1982-2001); the shader's own default is -10000
uniform vec4 uAutomapWaterColor;    // _WaterColor: UnderwaterFog.waterMapColor, which Automap.cs:2590 injects into the one automap material
${CLOUD_SHADOW_GLSL}
${BAYER_GLSL}
${DISSOLVE_GLSL}
${realWindowsGlsl('c')}
${MESH_ALPHA_GLSL}
out vec4 outColor;
${FOG_GLSL}
void main() {
${RW_MAIN_DERIVS}
  int amMode = int(uAutomapMode + 0.5);
  // A1: the ceiling cut (Automap.cs UpdateSlicingPositionY). c2/S6: the
  // above-slice pass INVERTS it - DFU's second pass keeps exactly the
  // fragments the first one threw away (if worldPos.y > slice {...}
  // else discard), so the two passes are a partition of the geometry
  // and never draw the same fragment twice.
  if (amMode >= 3) { if (vWorldPos.y <= uClipY) discard; }
  else if (vWorldPos.y > uClipY) discard;
  dissolveCut();   // SHIP-FADE: a ship sailing into the world or out of it, her share of her fragments (orderedDither.js)
  vec4 tex = texture(uTex, vUV);
  // INCIDENT 2026-09-04: no alpha clip here - DaggerfallDefault.shader is
  // RenderType Opaque with no clip(); the mortar runs of a wall texture
  // are palette index 0 and were being discarded as cutouts.
${RW_MAIN_CUTOUT}
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, uLightDir), 0.0);
  diff *= cloudShadowAt(vWorldPos);   // VC4: the cloud's shadow on the sun term
  float mdiff = max(dot(n, uMoonDir), 0.0);
  float l3diff = max(dot(n, uLight3Dir), 0.0);
  // AUDIT 39r R17: DaggerfallDefault.shader:83-85 - "Emission cancels out
  // other lights". The lit term runs on albedo.rgb - emission, NOT on
  // the raw albedo, so an auto-emissive record (whose mask IS its albedo,
  // TextureReader.cs:301-308, worn at EmissionColor = Color.white) lands
  // at exactly its albedo whatever the scene light is. Adding on top of
  // full lighting put a lantern at ~2.3x albedo outdoors. The clamp is
  // ours: a window mask can be brighter than the glass texel under it,
  // and a negative albedo has no honest meaning here.
  vec3 emission = texture(uEmissionTex, vUV).rgb * uEmissionColor;
${RW_MAIN_GLASS}
  vec3 albedo = max(tex.rgb - emission, vec3(0.0));
  vec3 ambient = uTrilight > 0.5 ? (n.y >= 0.0 ? mix(uAmbient, uAmbientSky, n.y) : mix(uAmbient, uAmbientGround, -n.y)) : uAmbient;   // BA1: Trilight
  vec3 lit = albedo * (ambient + uSunColor * (uSunScale * diff) + uMoonColor * (uMoonScale * mdiff)
    + uLight3Color * (uLight3Scale * l3diff));
  // Point lights (city lanterns): N.L with a squared linear falloff to the
  // range - documented equivalence to the Unity point light this replaces.
  vec3 pointAcc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uPointCount) break;
    vec3 L = uPointLights[i].xyz - vWorldPos;
    float d = length(L);
    float att = clamp(1.0 - d / uPointLights[i].w, 0.0, 1.0);
    pointAcc += att * att * max(dot(n, L / max(d, 1e-4)), 0.0) * uPointColors[i];
  }
  lit += albedo * pointAcc;
  // R12: the player-following indirect point light (SunlightRig's
  // IndirectLight) - same falloff shape as the lantern lights; the
  // zeroed default color makes this a no-op in unlit scenes.
  vec3 iL = uIndirect.xyz - vWorldPos;
  float iD = length(iL);
  float iAtt = clamp(1.0 - iD / max(uIndirect.w, 1e-4), 0.0, 1.0);
  lit += albedo * (iAtt * iAtt * max(dot(n, iL / max(iD, 1e-4)), 0.0)) * uIndirectColor;
${RW_MAIN_ROOM}
  // The emission (window style from getWindowColors32, or an auto-emissive
  // record's own albedo at Color.white) goes back on top of the lighting
  // its subtraction above paid for - o.Emission = emission.
  outColor = vec4(dwWaterFog(mix(uFogColor, lit + emission, fogFactorAt(vWorldPos)), vWorldPos), meshAlphaOf(tex.a));   // DW-C: the sea's distance fog over the finished colour; POI-2: alpha 1 but in a translucent draw
  // A2: the Daggerfall/Automap shader's presentation, verbatim
  // (DaggerfallAutomap.shader:102-110): brightness falls with vertical
  // distance from the slice plane (floored at 40%), then the
  // RENDER_IN_GRAYSCALE variant collapses to the 0.3/0.59/0.11
  // luminance. A maxed-out slice (1e9) dims everything to the 40%
  // floor - DFU's own AlwaysMaxOutSliceLevel behavior, bug for bug.
  if (amMode > 0) {
    // c2/S6: THE WATER TINT, which both DFU passes carry and the port
    // omitted. It lands BEFORE the dim and before the mode's own
    // colour decision, so wireframe's constant overwrites it exactly as
    // the C# does (the tint is only ever visible above the slice in
    // TRANSPARENT mode - that is DFU, not an omission).
    if (vWorldPos.y <= uAutomapWaterLevel) {
      outColor.rgb = mix(outColor.rgb, uAutomapWaterColor.rgb, uAutomapWaterColor.a);
    }
    // the above-slice arms, in the C#'s own order: WIREFRAME replaces
    // the fragment outright, TRANSPARENT only rewrites the alpha.
    if (amMode >= 5) outColor = (amMode >= 6) ? vec4(0.25, 0.25, 0.25, 0.6) : vec4(0.9, 0.9, 0.7, 0.6);
    else if (amMode >= 3) outColor.a = 0.75;
    // THE ABOVE-SLICE PASS NEVER DIMS, and this expression is why:
    // DFU's second pass writes distance(min(worldPos.y, slice),
    // slice), which is IDENTICALLY ZERO for every fragment it keeps
    // (they are all above the slice, so the min IS the slice). Below
    // the slice min(y, slice) == y and this is the first pass's
    // distance(worldPos.y, slice) unchanged. One expression, both
    // passes, bug for bug - a port that dims the above-slice group is
    // wrong.
    float sliceDist = distance(min(vWorldPos.y, uClipY), uClipY);
    outColor.rgb *= 1.0 - clamp(sliceDist / 20.0, 0.0, 0.6);
    if (amMode % 2 == 0) {
      float grayValue = dot(outColor.rgb, vec3(0.3, 0.59, 0.11));
      outColor.rgb = vec3(grayValue);
    }
  }
}`;

const CHAR_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aColor;
layout(location=2) in vec3 aNormal;
// MW-D11: the OPTIONAL fourth channel. A VAO that never enables it reads
// the constant attribute, so every voxel caller draws exactly what it
// drew before - the layout is additive, not a variant.
layout(location=3) in vec2 aUV;
// MWT2: the OPTIONAL fifth channel, additive exactly as aUV is - a VAO
// that never enables it reads the constant attribute, which is zero, and
// zero emission is what every caller before this one had.
layout(location=4) in vec3 aEmissive;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vColor;
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vUV;
out vec3 vEmissive;
void main() {
  vColor = aColor;
  vEmissive = aEmissive;
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV;
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorldPos = world.xyz;
  gl_Position = uProj * uView * world;
}`;

// Skinned variant of CHAR_VS; mwGpuSkin.js skinPoint and skinNormal mirror its skinning in JS and must match.
// The palette is RGBA32F, three texels an entry, SKIN_PAL_ROW entries a row; texelFetch reads it unfiltered.
const CHAR_SKIN_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aColor;
layout(location=2) in vec3 aNormal;
layout(location=3) in vec2 aUV;
layout(location=4) in vec3 aEmissive;
layout(location=5) in vec4 aSkinI0;
layout(location=6) in vec4 aSkinW0;
layout(location=7) in vec4 aSkinI1;
layout(location=8) in vec4 aSkinW1;
layout(location=9) in float aSkinPost;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform float uSkin;
uniform highp sampler2D uSkinPalette;
out vec3 vColor;
out vec3 vNormalV;
out vec3 vRel;
out vec3 vWorldPos;
out vec2 vUV;
out vec3 vEmissive;
void skinEntry(float e, out vec4 r0, out vec4 r1, out vec4 r2) {
  int g = int(e + 0.5);
  int row = g / ${SKIN_PAL_ROW};
  int col = (g - row * ${SKIN_PAL_ROW}) * 3;
  r0 = texelFetch(uSkinPalette, ivec2(col, row), 0);
  r1 = texelFetch(uSkinPalette, ivec2(col + 1, row), 0);
  r2 = texelFetch(uSkinPalette, ivec2(col + 2, row), 0);
}
void skinRows(out vec4 c0, out vec4 c1, out vec4 c2) {
  vec4 a0 = vec4(0.0);
  vec4 a1 = vec4(0.0);
  vec4 a2 = vec4(0.0);
  vec4 r0; vec4 r1; vec4 r2;
  for (int k = 0; k < 4; k++) {
    float w = aSkinW0[k];
    skinEntry(aSkinI0[k], r0, r1, r2);
    a0 += r0 * w; a1 += r1 * w; a2 += r2 * w;
  }
  if (uSkin > 1.5) {
    for (int k = 0; k < 4; k++) {
      float w = aSkinW1[k];
      skinEntry(aSkinI1[k], r0, r1, r2);
      a0 += r0 * w; a1 += r1 * w; a2 += r2 * w;
    }
  }
  vec4 q0; vec4 q1; vec4 q2;
  skinEntry(aSkinPost, q0, q1, q2);
  c0 = q0.x * a0 + q0.y * a1 + q0.z * a2 + vec4(0.0, 0.0, 0.0, q0.w);
  c1 = q1.x * a0 + q1.y * a1 + q1.z * a2 + vec4(0.0, 0.0, 0.0, q1.w);
  c2 = q2.x * a0 + q2.y * a1 + q2.z * a2 + vec4(0.0, 0.0, 0.0, q2.w);
}
void main() {
  vec3 p = aPos;
  vec3 n = aNormal;
  if (uSkin > 0.5) {
    vec4 c0; vec4 c1; vec4 c2;
    skinRows(c0, c1, c2);
    p = vec3(dot(c0.xyz, aPos) + c0.w, dot(c1.xyz, aPos) + c1.w, dot(c2.xyz, aPos) + c2.w);
    vec3 m = vec3(dot(c0.xyz, aNormal), dot(c1.xyz, aNormal), dot(c2.xyz, aNormal));
    float l2 = dot(m, m);
    n = l2 > 1e-24 ? m * inversesqrt(l2) : vec3(0.0);
  }
  vColor = aColor;
  vEmissive = aEmissive;
  vNormalV = mat3(uModel) * n;
  vRel = mat3(uModel) * p;
  vUV = aUV;
  vec4 world = uModel * vec4(p, 1.0);
  vWorldPos = world.xyz;
  gl_Position = uProj * uView * world;
}`;

// packSpriteTiles below leaves a texel of gutter between tiles, so a NEAREST sample at a tile's edge never reads
// the next tile.
const SPRITE_CLEAR = new Float32Array([0, 0, 0, 0]);

export function packSpriteTiles(items, start, size, gutter = 1) {
  let x = 0, y = 0, row = 0, n = 0;
  for (let i = start; i < items.length; i++) {
    const it = items[i];
    if (x > 0 && x + it.pw > size) { x = 0; y += row + gutter; row = 0; }
    if (n > 0 && y + it.ph > size) break;
    it.tx = x; it.ty = y;
    x += it.pw + gutter;
    if (it.ph > row) row = it.ph;
    n++;
  }
  return n;
}

export function skinNormalMatrix(m, out = new Float32Array(9)) {
  const a = m[0], b = m[4], c = m[8];
  const d = m[1], e = m[5], f = m[9];
  const g = m[2], h = m[6], k = m[10];
  const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
  const sg = det < 0 ? -1 : 1;
  out[0] = sg * (a * a + b * b + c * c); out[3] = sg * (a * d + b * e + c * f); out[6] = sg * (a * g + b * h + c * k);
  out[1] = out[3]; out[4] = sg * (d * d + e * e + f * f); out[7] = sg * (d * g + e * h + f * k);
  out[2] = out[6]; out[5] = out[7]; out[8] = sg * (g * g + h * h + k * k);
  return out;
}

// Rewrites the source so main() fills vNormal first, before any discard, keeping the derivatives in uniform
// control flow.
export function skinFaceFs(fs) {
  const decl = 'in vec3 vNormal;';
  const main = 'void main() {';
  const n = (needle) => fs.split(needle).length - 1;
  if (n(decl) !== 1 || n(main) !== 1) {
    throw new Error(`MWNPC1: a character fragment shader needs one "${decl}" and one "${main}" (has ${n(decl)} and ${n(main)})`);
  }
  return fs.replace(decl, SKIN_FACE_DECL).replace(main, `${main}\n  vNormal = charFaceNormal();`);
}
const SKIN_FACE_DECL = `in vec3 vNormalV;
in vec3 vRel;
uniform float uSkin;
uniform mat3 uSkinNrm;
uniform float uSkinFlip;
uniform float uFrontCW;
vec3 vNormal;
vec3 charFaceNormal() {
  vec3 d = cross(dFdx(vRel), dFdy(vRel));
  if (uSkin < 0.5) return vNormalV;
  if (dot(vNormalV, vNormalV) > 1e-20) return vNormalV;
  bool ccw = gl_FrontFacing != (uFrontCW > 0.5);
  vec3 nw = ccw ? d : -d;
  if (dot(nw, nw) < 1e-36) return vec3(0.0, 1.0, 0.0);
  return normalize(uSkinFlip * (uSkinNrm * nw));
}`;

const PARTICLE_VS = `#version 300 es
layout(location=0) in vec3 aCenter;
layout(location=1) in vec2 aCorner;
layout(location=2) in vec2 aUV;
layout(location=3) in vec4 aColor;
layout(location=4) in float aSize;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec2 vUV;
out vec4 vColor;
void main() {
  mat3 mv = mat3(uView * uModel);
  // the view's x and y axes, expressed in the model's space: the ROWS of the model-view rotation
  vec3 right = normalize(vec3(mv[0][0], mv[1][0], mv[2][0]));
  vec3 up = normalize(vec3(mv[0][1], mv[1][1], mv[2][1]));
  vec3 p = aCenter + (right * aCorner.x + up * aCorner.y) * aSize;
  vUV = aUV;
  vColor = aColor;
  gl_Position = uProj * uView * uModel * vec4(p, 1.0);
}`;
const PARTICLE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
uniform sampler2D uTex;
uniform float uUseTex;
uniform float uAlphaCut;
out vec4 outColor;
void main() {
  vec4 texel = uUseTex > 0.5 ? texture(uTex, vUV) : vec4(1.0);
  vec4 c = texel * vColor;
  if (uAlphaCut > 0.0 && c.a < uAlphaCut) discard;
  outColor = c;
}`;

// The reference NIF loader's blend-mode table, including its SRC_ALPHA fallback for an unknown index.
export const NIF_BLEND_MODES = Object.freeze([
  'ONE', 'ZERO', 'SRC_COLOR', 'ONE_MINUS_SRC_COLOR', 'DST_COLOR', 'ONE_MINUS_DST_COLOR',
  'SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA', 'DST_ALPHA', 'ONE_MINUS_DST_ALPHA', 'SRC_ALPHA_SATURATE',
]);
export const nifBlendMode = (mode) => NIF_BLEND_MODES[mode] ?? 'SRC_ALPHA';
// A typed array cannot be frozen, so nothing may write this one.
const WORLD_IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// Emission joins the lighting sum before the texel multiplies it, as in the reference shaders.
const CHAR_FS = `#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vUV;
in vec3 vEmissive;
uniform sampler2D uTex;
uniform float uUseTex;      // MW-D11: 0 for the voxel rigs, 1 for a textured mesh
uniform float uAlphaCut;    // 0 = opaque; above it, discard below this alpha
uniform vec3 uLightDir;
uniform vec3 uAmbient;
uniform float uSunScale;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;    // EV5: the second directional term - the masser
uniform float uMoonScale; // 0 = no moon (classic, indoors, daytime)
uniform vec3 uMoonColor;
uniform int uPointCount;
uniform vec4 uPointLights[16];
uniform vec3 uPointColors[16]; // LT1: per-light colour x intensity (AddLight's second switch)
uniform vec4 uIndirect;       // R12: xyz player pos, w range (0 = off)
uniform vec3 uIndirectColor;  // color x intensity x daylight scale
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
${CLOUD_SHADOW_GLSL}
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec3 n = normalize(vNormal);
  // MW-D11: the texture MULTIPLIES the vertex colour, which is how a
  // Morrowind body part gets its skin - the pack writes white there for
  // a textured piece, so the product is the texel.
  vec4 texel = uUseTex > 0.5 ? texture(uTex, vUV) : vec4(1.0);
  if (uAlphaCut > 0.0 && texel.a < uAlphaCut) discard;
  vec3 albedo = vColor * texel.rgb;
  float diff = max(dot(n, uLightDir), 0.0);
  diff *= cloudShadowAt(vWorldPos);   // VC4: the cloud's shadow on the sun term
  float mdiff = max(dot(n, uMoonDir), 0.0);
  vec3 lit = albedo * (uAmbient + uSunColor * (uSunScale * diff) + uMoonColor * (uMoonScale * mdiff));
  vec3 pointAcc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uPointCount) break;
    vec3 L = uPointLights[i].xyz - vWorldPos;
    float d = length(L);
    float att = clamp(1.0 - d / uPointLights[i].w, 0.0, 1.0);
    pointAcc += att * att * max(dot(n, L / max(d, 1e-4)), 0.0) * uPointColors[i];
  }
  lit += albedo * pointAcc;
  // R12: the player-following indirect light (see the mesh FS).
  vec3 iL = uIndirect.xyz - vWorldPos;
  float iD = length(iL);
  float iAtt = clamp(1.0 - iD / max(uIndirect.w, 1e-4), 0.0, 1.0);
  lit += albedo * (iAtt * iAtt * max(dot(n, iL / max(iD, 1e-4)), 0.0)) * uIndirectColor;
  // MWT2: the EMISSION, times the texel and nothing else. The reference
  // adds it into the lighting sum before the texture multiply, so an
  // emissive surface keeps its picture and owes the room nothing - which
  // is the whole of what "self-illuminated" means. It is the one term
  // above that the vertex colour does NOT gate: LightMode_Emissive has
  // already forced that colour to black.
  lit += vEmissive * texel.rgb;
  outColor = vec4(dwWaterFog(mix(uFogColor, lit, fogFactorAt(vWorldPos)), vWorldPos), 1.0);   // DW-C
}`;

const BB_VS = `#version 300 es
layout(location=0) in vec3 aCenter;
layout(location=1) in vec2 aCorner;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uOrigin;
uniform vec2 uSize;
uniform vec4 uFlatWind;   // WIND3: the wind's rate x, z (m/s, the lab's rate from systems/wind/windDrive.js), the clock, the gust
uniform float uSway;      // WIND3: this batch's share of the lean (0 = stands still); WINDFALL1: its wind mask while the mod's law stands
${WINDFALL_SWAY_GLSL}
uniform vec3 uTip;        // PROF4: a felled tree's fall - x, z the way it falls, the angle it has leaned (0 = stands)
uniform vec4 uFacePoint;  // DISC29-E: a lamp's position (w = 1) - each flat turns to face it; w = 0 in every other pass
uniform vec4 uElitePad;   // ELITE FOES: the quad widened past the sprite (left, bottom, right, top, as fractions of it) - 0 in every other pass
uniform sampler2D uTex;   // ELITE FOES: the sprite's own size, for the pad's floor in texels (the fragment shader's same sampler)
// LPT1 (bible/07-Rendering/Low-Poly-Trees.md): A LOW-POLY TREE IS DRAWN BY THIS PROGRAM TOO, so it is lit, fogged and
// shadowed as the flats are, under either lane. uMesh 1: aCenter is its mesh's vertex, aCorner its uv; the instance's
// root and turn ride aInst, its scale aScale (render/lowPolyTreesRender.js). uLptCut: the eye (xyz) and the radius
// (w, 0 off) inside which the 3D tree stands for its far picture, uLptBand the crossfade past it. A submesh's material:
// uMeshColor (its _Color), uMeshAlpha (0 an opaque card; else what its alpha is multiplied by so its cut lands on the
// flats' 0.5 - 0.5 / its _Cutoff).
layout(location=2) in vec3 aNormal;
layout(location=3) in vec4 aInst;
layout(location=4) in float aScale;
uniform float uMesh;
uniform vec3 uMeshScale;
uniform vec3 uMeshColor;
uniform float uMeshAlpha;
uniform vec4 uLptCut;
uniform float uLptBand;
uniform vec4 uLptSun;   // the sun's direction (xyz) and its share of the faces' light (w, 0..1 - the far picture's own light the rest)
out vec2 vUV;
out vec3 vBBWorld;
out vec3 vBBBase;   // EL2: the flat's placement base, where the lane's shadow is read for the whole sprite (the classic FS declares it not, which GLSL allows)
out vec3 vShade;    // LPT1: a tree's light on its own faces times its material's colour (1 on a flat)
out float vAlpha;   // LPT1: what a texel's alpha is multiplied by (1 on a flat; 0 an opaque card, which no cut takes)
out float vFade;    // LPT1: the crossfade - 1 whole; below 1 a far picture's share; 2..3 a tree's, 2 plus its share
void main() {
  // Bottom-anchored: centre sits half a height above the placement base.
  vBBBase = aCenter + uOrigin;
  // DISC29-E (Kristian B on Discord: interior light flickering, worst in the Mages Guild): A LAMP'S REPLAY TURNS EACH
  // FLAT TO FACE IT FROM ITS OWN CENTRE. One uRight a batch faced the lamp from the batch's origin - and a batch whose
  // centres are baked into its vertices has none (every interior flat: createBillboardBatch, origin null), so each card
  // faced the lamp from the world's origin, often edge-on, and shadowed its own base: the sprite went dark for that
  // lamp. right = up x (lamp - flat), as the replay's own per-batch law; the lamp straight overhead keeps uRight.
  vec3 right = uRight;
  if (uFacePoint.w > 0.5) {
    vec2 toLamp = uFacePoint.xz - vBBBase.xz;
    float lampDist = length(toLamp);
    if (lampDist > 1e-4) right = vec3(toLamp.y, 0.0, -toLamp.x) / lampDist;
  }
  // ELITE FOES: an elite's quad reaches past its sprite on every side (room for the outline and the embers); the UVs run
  // past 0..1 with it and the fragment shader reads that margin as empty. Zero pad is the plain quad, exactly.
  // A small sprite (a rat, a bat) still gets room: at least 2 texels round it and 20 above for the embers to climb.
  vec4 ep = uElitePad;
  if (ep.x > 0.0) { vec2 ts = vec2(textureSize(uTex, 0)); ep = max(ep, vec4(2.0, 2.0, 2.0, ep.w > 0.1 ? 20.0 : 2.0) / vec4(ts, ts)); }   // a corpse's pad (top 0.03) needs no room for embers   // a corpse's pad (top 0.03) needs no room for embers
  // LPT1: A FLAT'S OWN SCALE RIDES ON ITS CORNER - |x| twice over is its share of the batch's size: 1 for every flat
  // but a low-poly tree's far picture, whose batch is sized for the tallest tree it stands (renderer
  // createBillboardBatch scales). The quad grows about its base; the picture's uv does not.
  float fs = abs(aCorner.x) * 2.0;
  vec2 ac = vec2(aCorner.x < 0.0 ? -0.5 : 0.5, aCorner.y);
  vec2 cu = vec2(mix(-0.5 - ep.x, 0.5 + ep.z, ac.x + 0.5), mix(-0.5 - ep.y, 0.5 + ep.w, ac.y + 0.5));
  vec2 cn = vec2(cu.x * fs, (cu.y + 0.5) * fs - 0.5);
  vec3 world = aCenter + uOrigin
    + right * (cn.x * uSize.x)
    + uUp * ((cn.y + 0.5) * uSize.y);
  // WIND3: THE FLATS LEAN WITH THE WIND. The lab's grass law (labGrass.js:
  // a steady push plus a gust that travels ACROSS the field as a wave, the
  // phase carrying the position along the wind), on the crown: the offset
  // is weighted by the height up the quad, squared, so the root stands and
  // the crown moves, and the per-flat phase keeps a wood from moving as a
  // sheet. A tree's lean is a few percent of its height at most - the
  // grass's 0.055 scaled to a trunk - and uSway is 0 for every batch that
  // is not the climate's flora, which is the shader's off switch.
  // WINDFALL1 (render/windfallSway.js): WHILE WINDFALL IS ON, ITS LAW IN WIND3'S PLACE - the top corners alone move,
  // by the flat's height (its own share of the batch's, LPT1) and its record's mask (uSway).
  if (uSway > 0.0 && windfallLaw()) {
    world += windfallLean((aCenter + uOrigin).xz, right) * (uSway * uSize.y * fs * (aCorner.y + 0.5));
  } else if (uSway > 0.0) {
    vec2 wv = uFlatWind.xy;
    float wl = length(wv);
    vec2 wdir = wl > 1e-4 ? wv / wl : vec2(1.0, 0.0);
    vec3 root = aCenter + uOrigin;
    float along = dot(root.xz, wdir);
    float ph = fract(root.x * 0.37 + root.z * 0.91) * 6.2832;
    float gust = sin(uFlatWind.z * 1.7 - along * 0.35 + ph) * 0.5 + 0.5;
    float push = wl * (0.55 + gust * 0.75) * 0.0015 * uSway;
    push *= fs;   // LPT1: a smaller tree leans less
    float top = aCorner.y + 0.5;
    world.xz += wdir * push * top * top * uSize.y;
  }
  // PROF4 (bible/06-Systems/Professions-Arc.md 25): A FELLED TREE TIPS OVER. The quad turns about its root, the height
  // up it laid along the fall's way by the angle; 0 for every batch but a falling tree's.
  if (uTip.z != 0.0) {
    float up = (cn.y + 0.5) * uSize.y;
    world = aCenter + uOrigin + uRight * (cn.x * uSize.x)
      + vec3(uTip.x * sin(uTip.z) * up, cos(uTip.z) * up, uTip.y * sin(uTip.z) * up);
  }
  // Textures are bottom-up (v=0 = image bottom), so the quad top
  // (aCorner.y = +0.5) samples v = 1 - matching the mesh path's negated-V
  // convention. The previous 0.5 - aCorner.y flipped every billboard.
  vUV = vec2(cu.x + 0.5, cu.y + 0.5);
  vShade = vec3(1.0);
  vAlpha = 1.0;
  vFade = 1.0;
  bool gone = false;
  // LPT1: A FAR PICTURE NEAR THE EYE GIVES WAY to its 3D tree: none inside the radius, crossfading across the band
  if (uLptCut.w > 0.0 && uMesh < 0.5) {
    vFade = clamp((distance(vBBBase.xz, uLptCut.xz) - uLptCut.w) / max(uLptBand, 1e-3), 0.0, 1.0);
    gone = vFade <= 0.0;
  }
  // LPT1: A LOW-POLY TREE - its vertex turned about +Y and scaled at its root, its uv, its light and its share
  if (uMesh > 0.5) {
    float tc = cos(aInst.w), tsn = sin(aInst.w);
    vec3 p = aCenter * uMeshScale * aScale;
    vec3 nm = normalize(aNormal / uMeshScale);
    world = vec3(tc * p.x + tsn * p.z, p.y, -tsn * p.x + tc * p.z) + aInst.xyz;
    vec3 wn = vec3(tc * nm.x + tsn * nm.z, nm.y, -tsn * nm.x + tc * nm.z);
    if (uSway > 0.0 && windfallLaw()) {   // WINDFALL1: the mod's lean, as the tree's far picture takes it - up the tree linearly, as up its quad
      world += windfallLean(aInst.xz, uRight) * (uSway * uSize.y * aScale * clamp(p.y / max(uSize.y * aScale, 1e-3), 0.0, 1.0));
    } else if (uSway > 0.0) {
      vec2 wv = uFlatWind.xy;
      float wl = length(wv);
      vec2 wdir = wl > 1e-4 ? wv / wl : vec2(1.0, 0.0);
      float along = dot(aInst.xz, wdir);
      float ph = fract(aInst.x * 0.37 + aInst.z * 0.91) * 6.2832;
      float gust = sin(uFlatWind.z * 1.7 - along * 0.35 + ph) * 0.5 + 0.5;
      float lean = clamp(p.y / max(uSize.y * aScale, 1e-3), 0.0, 1.0);   // AUDIT LPT A3: up THIS tree's height, as its far picture's quad
      world.xz += wdir * wl * (0.55 + gust * 0.75) * 0.0015 * uSway * lean * lean * uSize.y * aScale;
    }
    vBBBase = aInst.xyz;
    vUV = aCorner;
    // its faces' light (AUDIT LPT A2): the far picture's own - from above and the eye's side, LPT_IMPOSTOR_LIGHT turned to
    // face the eye - crossfaded to the sun's by its share, so at night and at the handover the two are one picture
    vec2 toEye = uLptCut.xz - aInst.xz;
    vec2 fe = length(toEye) > 1e-4 ? normalize(toEye) * 0.8 : vec2(0.0, 0.8);
    float faceEye = clamp(0.72 + 0.28 * dot(wn, vec3(fe.x, 0.6, fe.y)), 0.5, 1.0);
    float faceSun = clamp(0.72 + 0.28 * dot(wn, uLptSun.xyz), 0.5, 1.0);
    vShade = uMeshColor * mix(faceEye, faceSun, uLptSun.w);
    vAlpha = uMeshAlpha;
    vFade = uLptCut.w > 0.0 ? 3.0 - clamp((distance(aInst.xz, uLptCut.xz) - uLptCut.w) / max(uLptBand, 1e-3), 0.0, 1.0) : 3.0;
  }
  vBBWorld = world;
  gl_Position = uProj * uView * vec4(world, 1.0);
  if (gone) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // LPT1: wholly given way - off the clip volume, no fragment
}`;

/** @param {any} src @returns {[string, string][]} */
function worldSetPrograms(src) {
  return [[VS, src.meshFs], [CHAR_SKIN_VS, skinFaceFs(src.charFs)], [bbVertexShader(src.bbVs), src.bbFs], [TERRAIN_VS, src.terrainFs], [DECAL_VS, src.decalFs ?? DECAL_FS]];
}

/** @param {{ head: string, main: string }|null} [ext] */
export function bbVertexShader(ext = null) {
  if (!ext) return BB_VS;
  const at = BB_VS.indexOf('void main() {'), end = BB_VS.lastIndexOf('}');
  return `${BB_VS.slice(0, at)}${ext.head}\n${BB_VS.slice(at, end)}${ext.main}\n${BB_VS.slice(end)}`;
}

import { createClusterSpace, buildLightClusters, CLUSTER_GRID_W, CLUSTER_GRID_H, CLUSTER_LIST_W, CLUSTER_LIST_ROWS, CLUSTER_X, CLUSTER_Y, CLUSTER_NEAR, CLUSTER_Z_SCALE, CLUSTER_GRID_UNIT, CLUSTER_LIST_UNIT } from './lightClusters.js';
import { ShadowPass, SHADOW_GLSL, SHADOW_VIEW_SCALE } from './shadowPass.js';
import { boundsOf, spherePlanes, batchVisible, batchSphere, ZERO_ORIGIN, placementGrid, quadHalfDiagonal } from './bounds.js';
import { billboardKey, sortByKey } from './billboardKey.js';
import { cullDisabled } from './frustum.js';
import { getPref } from '../ui/uiPrefs.js';

export function anisotropyFor(tier, driverMax = 1) {
  const cap = Math.max(1, driverMax || 1);
  if (tier === 'off') return 1;
  if (tier === 'max') return cap;
  return Math.min(4, cap);
}
// Anisotropic tiers keep trilinear filtering, because anisotropy needs a linear filter within the level.
export function groundSamplerFor(tier, driverMax = 1) {
  return { aniso: anisotropyFor(tier, driverMax), minFilter: tier === 'off' ? 'NEAREST_MIPMAP_NEAREST' : 'LINEAR_MIPMAP_LINEAR' };
}
export function groundSharpnessTier(search = globalThis.location?.search ?? '') {
  return pageParam('ground', search) ?? getPref('groundSharpness');
}
// Read once at construction, because getParameter is a round trip to the GPU process.
export function gpuNameOf(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const v = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    if (typeof v === 'string' && v) return v;
    const r = gl.getParameter(gl.RENDERER);
    return typeof r === 'string' && r ? r : null;
  } catch { return null; }
}
import { multiply as mat4Multiply } from '../world/mat4.js';
import { PerfMeter, perfOn, perfZones, perfCpu, setMeter } from './perfMeter.js';
import { AirPass, AIR_ADAPT_UNIT as ADAPT_UNIT, AIR_CONTACT_UNIT as CONTACT_UNIT } from './airPass.js';
import { RetroPass } from './retroPass.js';
import { decalIndices, DECAL_FLOATS_PER_VERTEX } from '../combat/bloodDecals.js';
import { BLOOD_ABSORB_ENCODED, INK_DEPTH } from '../combat/bloodArt.js';
// glslFloat keeps a whole-number dial a float literal, since vec3 * int does not compile in GLSL.
import { glslFloat } from './airPass.js';
// Imported from the leaf module, not combatVisuals.js, to keep this module's import graph small.
import { SHADE_DARK } from './concealDraw.js';
import { FLAT_DISSOLVE_GLSL } from './dissolve.js';
import { FLAT_CRACK_GLSL } from '../professions/veinCrack.js';
import { HIT_FLASH_GLSL, ELITE_GLOW_GLSL, GLINT_GLSL, TELL_GLINT_PAD } from '../combat/hitFlash.js';

const BB_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vBBWorld;
${LPT_FS_HEAD}
${BAYER_GLSL}
uniform sampler2D uTex;
uniform sampler2D uEmissionTex;
uniform int uSpectral;
uniform vec4 uConceal;  // ECV1: x mode (0 plain, 1 chameleon, 2 shade, 3 hit reveal), y opacity, z seconds, w phase
uniform float uHitFlash;  // HITFLASH1: a body struck, 0..1 (batch.hitFlash)
uniform float uEliteGlow;  // ELITE FOES: the glow's pulse, 0 off (batch.eliteGlow)
uniform float uEliteTime;  // ELITE FOES: seconds, for the embers
uniform vec4 uGlint;  // TELL2: a wind-up's glint - rgb the blow's colour, a its strength (0 off; batch.glint)
uniform vec4 uDissolve;  // DISSOLVE: x the share gone (0 whole, 1 gone), yzw the edge's colour (systems/dissolve.js)
uniform vec2 uCrack;  // VEIN-CRACKS: x the share worked (0 whole), y the pattern's seed (systems/veinCrack.js)
uniform vec3 uBatchTint;  // ARENA5: the batch's own wash (batch.tint), white for every flat but the arena crowd's half in a banner's colours
uniform float uBatchDye;  // VEIN-HUE: how far the wash is the flat's colour rather than a multiply (batch.dye, 0..1; 0 for every flat but an ore's)
uniform vec3 uTint; // time-of-day: ambient (+ the moon's half); VC4: the sun's half rides uBBSun so a cloud's shadow can take it
uniform vec3 uBBSun;
uniform int uPointCount;
uniform vec4 uPointLights[16]; // xyz scene-space, w range
uniform vec3 uPointColors[16]; // LT1: per-light colour x intensity (AddLight's second switch)
uniform vec4 uIndirect;       // R12: xyz player pos, w range (0 = off)
uniform vec3 uIndirectColor;  // color x intensity x daylight scale
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
${CLOUD_SHADOW_GLSL}
out vec4 outColor;
${FOG_GLSL}
${COLUMN_GLSL}
${HIT_FLASH_GLSL}
${ELITE_GLOW_GLSL}
${GLINT_GLSL}
${FLAT_DISSOLVE_GLSL}
${FLAT_CRACK_GLSL}
void main() {
  // ECV1: a chameleoned foe ripples - a slow horizontal wobble across
  // the sprite, phased per foe - so it reads as blending in, not as a
  // faded sprite.
  vec2 uv = vUV;
  if (uConceal.x == 1.0) uv.x += sin(vUV.y * 28.0 + uConceal.z * 7.0 + uConceal.w) * 0.008;
  // SPRITE-GRAD (FIELD BUGS 2026-10-02c, Discord: "Black boxes around sprites in newer builds ... on a Mac M3"):
  // BOTH MAPS ARE SAMPLED HERE, before any branch or discard. A flat's texture carries its whole mip chain, and
  // texture() picks the level off the 2x2 quad's derivatives - which GLSL ES 3.00 leaves undefined inside non-uniform
  // control flow. ELITE FOES sampled under a ?: (the widened quad's margin), and the quads along a sprite's edge, half
  // their lanes past it, took the other arm: where a GPU does not keep those lanes' uv (Apple's, under Metal), the level
  // was garbage, a tiny mip of dark RGB and middling alpha passed the cut, and every flat wore a dark box. The same
  // for the emission map, read after the cut's discard.
  vec4 tex = texture(uTex, uv);
  vec3 emissionTexel = texture(uEmissionTex, uv).rgb;
${LPT_FS_KEEP}  // ELITE FOES: an elite's widened quad reaches past its sprite - the margin is empty, never a wrapped texel; ECV1: nor
  // is the chameleon's ripple past the edge (the texture wraps REPEAT: never pull the far edge onto this one)
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) tex = vec4(0.0);
${LPT_FS_TEXEL}  // Spectral flats keep their 180-alpha translucency (blended pass);
  // opaque flats keep the classic 0.5 cutout. ECV1's concealed pass is
  // blended too and takes the spectral threshold.
  if (tex.a < ((uSpectral == 1 || uConceal.x > 0.0) ? 0.1 : 0.5)) {
    // TELL2: a wind-up's glint outlines the sprite in its blow's colour - over an elite's halo while it lasts
    if (uGlint.a > 0.0 && uConceal.x == 0.0 && uDissolve.x <= 0.0 && eliteRim(uTex, uv) > 0.0) { outColor = vec4(mix(uFogColor, glintRimColor(uGlint), fogFactorAt(vBBWorld)), 1.0); return; }
    // ELITE FOES: the rim - a cut-out texel beside the silhouette is the halo's - and the embers rising off it
    if (uEliteGlow != 0.0 && uConceal.x == 0.0 && uDissolve.x <= 0.0) {   // negative: an elite's corpse - the rim alone; DISSOLVE: none round a body burning away or through a portal
      if (eliteRim(uTex, uv) > 0.0) { outColor = vec4(mix(uFogColor, eliteRimColor(eliteRimK(uEliteGlow, uEliteTime)), fogFactorAt(vBBWorld)), 1.0); return; }
      float em = uEliteGlow > 0.0 ? eliteEmber(uTex, uv, uEliteTime) : 0.0;
      if (em > 0.0) { outColor = vec4(mix(uFogColor, eliteRimColor(uEliteGlow) * (0.55 + 0.6 * em), fogFactorAt(vBBWorld)), 1.0); return; }
    }
    discard;
  }
  if (dissolveGone(uv)) discard;   // DISSOLVE: burnt away, or not yet through its portal
  // Point lights on flats: billboards have no normal, so the term is
  // attenuation-only (squared linear falloff) - documented equivalence
  // to Unity's vertex-lit billboards.
  vec3 pointAcc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uPointCount) break;
    float d = length(uPointLights[i].xyz - vBBWorld);
    float att = clamp(1.0 - d / uPointLights[i].w, 0.0, 1.0);
    pointAcc += att * att * uPointColors[i];
  }
  // spectral eyes/body glow, or an auto-emissive flat's own albedo (black
  // tex otherwise). AUDIT 39r R17: DaggerfallBillboard.shader:56-58 lights
  // albedo.rgb - emission and adds the emission back - "Emission cancels
  // out other lights" - so a self-lit flat draws at exactly its albedo in
  // any light. Adding it on top of the exterior tint (~1.31 at noon) put
  // every missile, impact flash and fire daedra at ~2.3x albedo, clipped
  // to white. The clamp is ours; a negative albedo has no meaning here.
  vec3 emission = emissionTexel;   // SPRITE-GRAD: sampled above the cut
  vec3 albedo = max(tex.rgb - emission, vec3(0.0)) * veinCrackShade(uv);   // VEIN-CRACKS: a worked vein's seams, lit as the ore is
  // R12: the indirect term, attenuation-only like the lantern term
  // (billboards have no normal).
  float iD = length(uIndirect.xyz - vBBWorld);
  float iAtt = clamp(1.0 - iD / max(uIndirect.w, 1e-4), 0.0, 1.0);
  vec3 lit = albedo * (uTint + uBBSun * cloudShadowAt(vBBWorld) + pointAcc + iAtt * iAtt * uIndirectColor) + emission;   // VC4
  // ARENA5: the batch's wash, multiplied in after both maps were sampled above the cut (SPRITE-GRAD's law) and once the
  // flat is lit - white leaves every other flat as it was
  float undyed = dot(lit, vec3(0.299, 0.587, 0.114));   // VEIN-HUE: the lit flat's brightness, before its wash
  lit *= uBatchTint;
  // VEIN-HUE (FIELD BUGS 2026-10-12b): a dyed batch's wash is its colour - the flat's brightness in the wash's hue - where
  // a multiply keeps the picture's own hue (a brown lump times a blue wash is a brown lump)
  if (uBatchDye > 0.0) lit = mix(lit, undyed * uBatchTint, uBatchDye);
  // ECV1: a shade is its silhouette - the lit colour pulled to black;
  // every concealed draw takes the visual's opacity over the texel's.
  // AUDIT 65 PN-3: SHADE_DARK itself (keep it a decimal - GLSL will not
  // multiply a vec3 by an int literal).
  if (uConceal.x == 2.0) lit *= ${SHADE_DARK};
  if (uConceal.x == 5.0) lit = mix(lit, vec3(0.95, 0.06, 0.04), uConceal.z);   // PEERFX3: a player struck flashes red for a moment (z the strength, fading)
  lit = eliteGlowLit(lit, albedo + emission, max(uEliteGlow, 0.0));   // ELITE FOES: the sprite warmed toward gold (never a corpse)
  lit = glintLit(lit, albedo + emission, uGlint);   // TELL2: the body lifted toward its blow's colour as it winds up
  lit = hitFlashLit(lit, albedo + emission, uHitFlash);   // HITFLASH1: over any concealment, never instead of it
  lit = dissolveLit(lit, uv, uDissolve.yzw);   // DISSOLVE: the edge it burns along blazes
  if (uConceal.x == 4.0) lit = vec3(0.0);   // EOTB-IL: Eye Of The Beholder's shade - Color.black at the batch's alpha (UpdateMaterial, IL_4f69)
  float alpha = uSpectral == 1 ? tex.a : 1.0;
  if (uConceal.x > 0.0) alpha = tex.a * uConceal.y;
  // DW-F: the column's share for a flat the host found in a carved sea (the batch's switch), as the floor takes it
  outColor = vec4(dwWaterFog(dwColumn(mix(uFogColor, lit, fogFactorAt(vBBWorld)), vBBWorld), vBBWorld), alpha);   // DW-C
}`;

const WATER_VS = `#version 300 es
layout(location=0) in vec2 aXZ; // unit quad 0..1
uniform mat4 uProj;
uniform mat4 uView;
uniform vec4 uRect; // x0, z0, size, y
out vec2 vWaterXZ;
out vec3 vWaterWorld;
void main() {
  vec3 world = vec3(uRect.x + aXZ.x * uRect.z, uRect.w, uRect.y + aXZ.y * uRect.z);
  vWaterXZ = world.xz;
  vWaterWorld = world;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const WATER_FS = `#version 300 es
precision highp float;
in vec2 vWaterXZ;
in vec3 vWaterWorld;
uniform vec4 uWaterColor; // rgb tint (1,1,1 for plain classic), a = blend
uniform sampler2D uWaterTex; // classic water tile (ground record 0)
uniform float uWaterScroll; // slow classic flow, in tiles
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 outColor;
${FOG_GLSL}
void main() {
  // World xz -> classic tile UVs: 6.4 units per 64px tile, REPEAT wrap,
  // scrolled diagonally.
  vec2 uv = vWaterXZ / 6.4 + vec2(uWaterScroll);
  vec3 tex = texture(uWaterTex, uv).rgb;
  outColor = vec4(dwWaterFog(mix(uFogColor, tex * uWaterColor.rgb, fogFactorAt(vWaterWorld)), vWaterWorld), uWaterColor.a);   // DW-C
}`;

// Tile decode matches DFU's TilemapTextureArray shader: the tile index is data >> 2 and the transform data & 3.
const TERRAIN_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vLocalXZ;
void main() {
  vNormal = mat3(uModel) * aNormal;
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorldPos = world.xyz;
  vLocalXZ = aPos.xz;
  gl_Position = uProj * uView * world;
}`;

const TERRAIN_FS = `#version 300 es
precision highp float;
precision highp usampler2D;
precision highp sampler2DArray;
in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vLocalXZ;
uniform sampler2DArray uTileArr;
uniform usampler2D uTilemap;
uniform float uTileSize; // world units per tile (6.4)
uniform vec3 uLightDir;
uniform vec3 uAmbient;
uniform float uSunScale;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;    // EV5: the second directional term - the masser
uniform float uMoonScale; // 0 = no moon (classic, indoors, daytime)
uniform vec3 uMoonColor;
${CLOUD_SHADOW_GLSL}
uniform int uPointCount;
uniform vec4 uPointLights[16];
uniform vec3 uPointColors[16]; // LT1: per-light colour x intensity (AddLight's second switch)
uniform vec4 uIndirect;       // R12: xyz player pos, w range (0 = off)
uniform vec3 uIndirectColor;  // color x intensity x daylight scale
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 outColor;
${FOG_GLSL}
${ecotoneGlsl()}
${snowCoverGlsl()}
${SCORCH_GLSL}
${WATER_BED_GLSL}
// DFU's HLSL float2x2 initializers are row-major; GLSL mat2 is
// column-major, so these are the TRANSPOSES of the shader source
// (caught in R9 build: rotated tiles sampled the wrong direction).
const mat2 ROT[4] = mat2[4](
  mat2(1.0, 0.0, 0.0, 1.0),
  mat2(0.0, -1.0, 1.0, 0.0),
  mat2(-1.0, 0.0, 0.0, -1.0),
  mat2(0.0, 1.0, -1.0, 0.0));
const vec2 TRANS[4] = vec2[4](
  vec2(0.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0), vec2(1.0, 0.0));
void main() {
  vec2 unwrapped = vLocalXZ / uTileSize;
  ivec2 cell = clamp(ivec2(floor(unwrapped)), ivec2(0), ivec2(127));
  uint data = texelFetch(uTilemap, cell, 0).r;
  int layer = int(data >> 2u);
  int t = int(data & 3u);
  vec2 tileUV = fract(unwrapped);
  vec2 tuv = ROT[t] * tileUV + TRANS[t];
  // GRAIN1 (2026-09-19, Mac: "distance terrian has a weird grain look"):
  // THE TILE ARRAY IS MIPMAPPED, AND THE GRADIENT IS THE UNWRAPPED ONE.
  //
  // The grain is minification aliasing: past a few tiles out a screen
  // pixel covers many texels and NEAREST picks one of them, so the ground
  // boils as the camera moves. The cure is a mipmap - and the reason
  // there was none is right here. tileUV is fract(unwrapped), so it
  // jumps 1 -> 0 at every tile edge, and texture() picks its mip from
  // the screen-space derivative of the coordinate it is handed: at each
  // of those jumps the derivative is a whole tile wide, the hardware
  // reads that as "this pixel covers the entire texture", and it samples
  // the coarsest mip. That is a blurred line drawn around all 16,384
  // tiles of every pixel - far worse than the grain.
  //
  // unwrapped does not jump. Its derivative is the true footprint, and
  // ROT[t] is constant across the fragment, so rotating it gives the
  // footprint in the rotated tile's own frame. textureGrad takes that
  // directly and the seams cannot happen. One sample either way.
  vec2 gx = ROT[t] * dFdx(unwrapped);
  vec2 gy = ROT[t] * dFdy(unwrapped);
  vec3 tex = textureGrad(uTileArr, vec3(tuv, float(layer)), gx, gy).rgb;
  vec4 ew = ecoWeights(vLocalXZ);   // ECOTONE1: the border's shares, once (AUDIT PRECIP GROUND-6: the snow crosses it by the same)
  tex = ecotone(tex, ew, vec3(tuv, float(layer)), gx, gy);   // ECOTONE1: a border's ground, its neighbours' share
  float snowC = snowCover(vLocalXZ, vWorldPos.y, gx, gy);   // PRECIP4: the snow the ground keeps (the bed below reads it too)
  tex = snowGround(tex, ew, snowC, vec3(tuv, float(layer)), gx, gy);
  tex = scorched(tex, layer, vLocalXZ);   // BUNNYFALL: the reach's burnt ground (render/scorchGlsl.js)
  ${waterBedMix()}
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, uLightDir), 0.0);
  // EE5: the deck's field, sampled where this ground's ray to the sun
  // crosses the cloud plane - so a bank overhead drags its shadow across
  // the land, and the shadow and the cloud that casts it are ONE field.
  // A cloud dims the SUN and leaves the ambient alone, which is what a
  // cloud does; the shadow moves with the weather (the one drift
  // integral) and with the bank overhead, which VC4 made one field.
  // uCloudShadowRect.w is 0 for the classic skin and every interior: the
  // branch does not run and classic draws exactly what it drew. VC4: the
  // shadow is the slab's own transmittance off the map, not a noise.
  diff *= cloudShadowAt(vWorldPos);
  float mdiff = max(dot(n, uMoonDir), 0.0);
  vec3 lit = tex * (uAmbient + uSunColor * (uSunScale * diff) + uMoonColor * (uMoonScale * mdiff));
  vec3 pointAcc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uPointCount) break;
    vec3 L = uPointLights[i].xyz - vWorldPos;
    float d = length(L);
    float att = clamp(1.0 - d / uPointLights[i].w, 0.0, 1.0);
    pointAcc += att * att * max(dot(n, L / max(d, 1e-4)), 0.0) * uPointColors[i];
  }
  lit += tex * pointAcc;
  // R12: the player-following indirect light (see the mesh FS).
  vec3 iL = uIndirect.xyz - vWorldPos;
  float iD = length(iL);
  float iAtt = clamp(1.0 - iD / max(uIndirect.w, 1e-4), 0.0, 1.0);
  lit += tex * (iAtt * iAtt * max(dot(n, iL / max(iD, 1e-4)), 0.0)) * uIndirectColor;
  outColor = vec4(dwWaterFog(mix(uFogColor, lit, fogFactorAt(vWorldPos)), vWorldPos), 1.0);   // DW-C
}`;

// The clip variant discards texels marked CLIP_SENTINEL. Only pixels the deep-water cap patched use it, so every
// other pixel keeps the plain program and its early depth test.

// The clip discard goes after this line: a derivative next to a discarded fragment is undefined in GLSL ES 3.00.
const CLIP_AFTER = 'vec2 gy = ROT[t] * dFdy(unwrapped);\n';

/**
 * @param {string} fs
 * @returns {string}
 */
export function terrainClipFs(fs) {
  const at = fs.indexOf(CLIP_AFTER);
  if (at < 0 || fs.indexOf(CLIP_AFTER, at + 1) >= 0) throw new Error('FAR-CLIP1: a terrain program ends its tile decode with ONE gradient line, which the clip goes after');
  const cut = at + CLIP_AFTER.length;
  return `${fs.slice(0, cut)}  if (data == ${CLIP_SENTINEL}u) discard;   // FAR-CLIP1: the cap's clipped tile (TilemapTextureArrayClipWater)\n${fs.slice(cut)}`;
}

const ZERO_CONTACT = new Float32Array(4);
// Shared by createBillboardBatch and moveBillboardBatch, which must agree on the winding.
const BB_CORNERS = Object.freeze([
  Object.freeze([-0.5, -0.5]),
  Object.freeze([-0.5, 0.5]),
  Object.freeze([0.5, 0.5]),
  Object.freeze([0.5, -0.5]),
]);
export const bbCornerX = (x, scale = 1) => x * scale;

// Still billboard batches share arena buffers; each arena quad's indices match the six createBillboardBatch writes.
export const BB_ARENA_QUADS = 16384;
export const BB_ARENA_MAX_QUADS = 262144;
export const BB_ARENA_HOMES_MAX = 4096;
const BB_QUAD_VERT_BYTES = 4 * 5 * 4, BB_QUAD_INDEX_BYTES = 6 * 4;
export function arenaTake(free, quads) {
  for (let i = 0; i < free.length; i += 2) {
    if (free[i + 1] < quads) continue;
    const at = free[i];
    if (free[i + 1] === quads) free.splice(i, 2); else { free[i] += quads; free[i + 1] -= quads; }
    return at;
  }
  return -1;
}
export function arenaGive(free, at, quads) {
  let i = 0;
  while (i < free.length && free[i] < at) i += 2;
  const joinsPrev = i > 0 && free[i - 2] + free[i - 1] === at;
  const joinsNext = i < free.length && at + quads === free[i];
  if (joinsPrev && joinsNext) { free[i - 1] += quads + free[i + 1]; free.splice(i, 2); } else if (joinsPrev) free[i - 1] += quads;
  else if (joinsNext) { free[i] = at; free[i + 1] += quads; } else free.splice(i, 0, at, quads);
}
export const WORLD_FRAME = Object.freeze({ world: true });
const DECAL_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in vec4 aColor;
layout(location=3) in float aWet;   // BLOOD2f: one fresh, zero dried - the lane's glint, nothing to the classic set
uniform mat4 uProj, uView;
out vec2 vUV; out vec4 vColor; out vec3 vWorld; out float vWet;
void main() { vUV = aUV; vColor = aColor; vWorld = aPos; vWet = aWet; gl_Position = uProj * uView * vec4(aPos, 1.0); }`;
// Classic set only; the lane uses EL_DECAL_FS, because its uploaded colors arrive decoded to linear.
const DECAL_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vColor; in vec3 vWorld;
uniform sampler2D uTex;
uniform vec3 uTint;
// MAC-BUG W4: the SAME terms the billboard pass gives a flat, and
// spelled the same way on purpose - a mark on a floor and a chunk in
// the air above it are the same blood, and they were lit by different
// amounts of the scene.
uniform vec3 uDecalSun;
uniform int uPointCount;
uniform vec4 uPointLights[16];   // xyz scene-space, w range
uniform vec3 uPointColors[16];
uniform vec4 uIndirect;
uniform vec3 uIndirectColor;
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
uniform vec3 uLightDir;
uniform vec3 uDecalMoon;   // BLOOD AUDIT 5: the moon by N.L, as the mesh takes it - W4 folded its Lambert half into the ambient, so a mark on a wall facing away from Masser glowed at night
uniform vec3 uMoonDir;
uniform float uTrilight;   // BLOOD AUDIT 5: and the trilight ambient (BA1), as the mesh takes it
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform float uPicture;   // WEAPON-MOUNT: a mounted PICTURE (the decorator's hung weapons and armour), not a film of blood
${CLOUD_SHADOW_GLSL}
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec4 t = texture(uTex, vUV);
  // A DEGENERATE SLOT still rasterises nothing, but a live one whose
  // texel is fully clear must not draw a black square either.
  if (t.a < 0.01) discard;
  // MAC-BUG W4 (Mac: "Also blood is black"). THIS TOOK AMBIENT AND
  // NOTHING ELSE, and the line that set it said what it was for - "the
  // scene's own light, so a mark on a dungeon floor is as dark as the
  // floor". It was darker than the floor by every term it left out: the
  // floor is a mesh lit by ambient AND the sun AND the point lights,
  // and a dungeon's ambient is 0.12, so a red mark came out at about
  // two units of red. Black. Worse, the GIBS from the same kill go
  // through drawBillboards and were lit in full, so one hit put lit
  // chunks over a black smear.
  //
  // BLOOD AUDIT 4: A DECAL HAS A NORMAL - IT LIES ON A SURFACE. W4 gave
  // it the billboard's model, "a decal has no normal, exactly as a
  // billboard has none", and that was the inconsistency Mac saw
  // outdoors: the mark on a sunlit floor and the mark on a shaded wall
  // took the same Lambert-average half of the sun, while the floor and
  // the wall under them took N.L - so blood was one brightness on
  // every surface of a world that was not. The quad's own normal is in
  // its derivatives (the lane's twin has read it since AUDIT 3), and
  // the mark takes THE SURFACE'S terms now, as MESH_FS spells them: the
  // sun by N.L, the lanterns and the indirect by N.L on the same
  // squared falloff. The ambient stays the flat's (no trilight on a
  // quad that is not a mesh). A quad seen edge-on has no derivative to
  // speak of, so it takes up rather than NaN.
  vec3 c = cross(dFdx(vWorld), dFdy(vWorld));
  vec3 n = dot(c, c) > 1e-12 ? normalize(c) : vec3(0.0, 1.0, 0.0);
  if (dot(n, uCamPos - vWorld) < 0.0) n = -n;
  float diff = max(dot(n, uLightDir), 0.0);
  float mdiff = max(dot(n, uMoonDir), 0.0);
  vec3 ambient = uTrilight > 0.5 ? (n.y >= 0.0 ? mix(uTint, uAmbientSky, n.y) : mix(uTint, uAmbientGround, -n.y)) : uTint;   // BA1: Trilight, as MESH_FS has it
  vec3 pointAcc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uPointCount) break;
    vec3 L = uPointLights[i].xyz - vWorld;
    float d = length(L);
    float att = clamp(1.0 - d / uPointLights[i].w, 0.0, 1.0);
    pointAcc += att * att * max(dot(n, L / max(d, 1e-4)), 0.0) * uPointColors[i];
  }
  vec3 iL = uIndirect.xyz - vWorld;
  float iD = length(iL);
  float iAtt = clamp(1.0 - iD / max(uIndirect.w, 1e-4), 0.0, 1.0);
  // BLOOD1 AUDIT 3: the CLOUD'S SHADOW on the sun term, as every other
  // classic world shader has it (BB_FS's sun term, under cloudShadowAt). The
  // deck rides the Environments pref and this program rides the
  // Lighting one being OFF, so a player with the deck and the classic
  // set watched the ground go dark under a cloud while the blood on it
  // stayed bright - W4's fault with the sign reversed.
  vec3 lightAcc = ambient + uDecalSun * (diff * cloudShadowAt(vWorld)) + uDecalMoon * mdiff + pointAcc + (iAtt * iAtt * max(dot(n, iL / max(iD, 1e-4)), 0.0)) * uIndirectColor;
  // BLOOD3 (Mac: "the blood is too shiny and flat"): THE MARK IS A
  // FILM here too. The atlas's alpha is a thickness and the ink over it
  // is white, so a mark was one flat red; Beer-Lambert through the film
  // brightens a thinning rim toward orange and leaves the body the
  // maroon it was (at full thickness the factor is exactly 1). The
  // LANE's twin carries the rest of the slice - the meniscus normal and
  // the sheen's Fresnel - because a classic mark has no glint to temper
  // and no lantern rig to catch a rim with. See combat/blood/bloodArt.js.
  // AUDIT BLOOD3 F1: the ink is the thickness INVERTED (bloodArt.js), so
  // the film reads it out rather than taking it for a density - BLOOD3
  // had this running backwards over every shape in the sheet. And the
  // ink is no longer an albedo factor: it WAS the shape's depth painted
  // as a grey darkening, and the film is that darkening done properly,
  // per channel. AUDIT BLOOD3 F3: the absorption is the ENCODED one,
  // because this set has no decode and no encode - it works in display
  // space end to end, where a gain of G shows as G and not G^(1/2.2).
  // The same constant in both lanes made a thin rim up to 1.7x brighter
  // here than on the lane, which is W6's fault with the sign reversed.
  float thick = t.a * clamp((1.0 - t.r) / ${glslFloat(INK_DEPTH)}, 0.0, 1.0);
  vec3 rgb = vColor.rgb * exp(vec3(${glslFloat(BLOOD_ABSORB_ENCODED[0])}, ${glslFloat(BLOOD_ABSORB_ENCODED[1])}, ${glslFloat(BLOOD_ABSORB_ENCODED[2])}) * (1.0 - thick)) * lightAcc;
  // WEAPON-MOUNT (2026-09-26, Mac: "weapons dont show in houses properly"): a picture's colour IS its texel. The
  // film above reads the texel's red as a blood thickness and paints the tint through it, so a hung sword came out
  // a pale lit silhouette of itself - the pack's picture with its colours thrown away.
  if (uPicture > 0.5) rgb = t.rgb * vColor.rgb * lightAcc;
  float a = t.a * vColor.a;
  float f = fogFactorAt(vWorld);
  outColor = vec4(dwWaterFog(mix(uFogColor, rgb, f), vWorld), a);   // DW-C
}`;
const CLASSIC_MAX_LIGHTS = 16;
const DECAL_STRIDE = DECAL_FLOATS_PER_VERTEX * 4;
const ZERO_FLAT_WIND = new Float32Array(4);
// DFU's EmissionColor for auto-emissive materials (MaterialReader).
const EMISSION_WHITE = new Float32Array([1, 1, 1]);

import { TextureFile } from '../formats/textureFile.js';
const isSpectralArchive = TextureFile.isSpectralArchive;

export const CHAR_PIXEL = 9;

export const ghostShaded = (b) => isSpectralArchive(b.archive) || b.ghost === true;
export const billboardBlended = (b) => !!b && !b.castOnly && !!(b.conceal || ghostShaded(b));
// Blended batches write no depth, so the host draws them after passes that would paint over them, such as grass.
export function holdBlendedBillboards(batches, out = []) {
  out.length = 0;
  let keep = 0;
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];
    if (billboardBlended(b)) out.push(b); else batches[keep++] = b;
  }
  batches.length = keep;
  return out;
}

export const STUDIO_AMBIENT = 0.6;
export const STUDIO_KEY = 0.7;
// uLightDir points toward the light and a view's third row toward the camera, so the key light sits at the camera.
export function studioLight(view) {
  const back = [view[2], view[6], view[10]];
  const bl = Math.hypot(back[0], back[1], back[2]) || 1;
  return {
    lightDir: new Float32Array([back[0] / bl, back[1] / bl, back[2] / bl]),
    ambient: new Float32Array([STUDIO_AMBIENT, STUDIO_AMBIENT, STUDIO_AMBIENT]),
    sunScale: STUDIO_KEY,
    sunColor: new Float32Array([1, 1, 1]),
    pointLights: new Float32Array(0),
    indirect: new Float32Array([0, 0, 0, 0]),
  };
}
export const CHAR_SPRITE_RT_SIZE = 1024;
export const CHAR_SPRITE_RT_MAX = 4096;

export const MW_ARM_PIXEL = 3;

// Respects byteOffset and byteLength, which `new Uint8Array(view.buffer)` ignores.
export function asBytes(view) {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function color32Bytes(color32, where) {
  if (!color32?.colors) {
    const shape = color32 ? `{ ${Object.keys(color32).map((k) => (k === 'colors' ? 'colors: undefined' : k)).join(', ')} }` : String(color32);
    throw new Error(`${where}: the image carries no \`colors\` (got ${shape}) - a decoded PNG's { width, height, data } crosses toColor32 (formats/color32Order.js) on the way in`);
  }
  return asBytes(color32.colors);
}

export const FLAT_LIGHT_FLOOR = 0.25;

export const SKY_CLEAR = Object.freeze([0.53, 0.7, 0.92, 1.0]);
export const INTERIOR_CLEAR = Object.freeze([0, 0, 0, 1.0]);
export const VIEW_OUT_CLEAR = Object.freeze([0, 0, 0, 0]);

// Unit 15 sits above the nine units Dynamic Skies binds; WebGL2 guarantees 16 fragment texture units.
// GRASS_CLOUD_UNIT in labGrass.js and RING_CLOUD_UNIT in farRing.js repeat 15, so change all three together.
export const CLOUD_SHADOW_UNIT = 15;

const BED_MASK = packWaterMask(WATER_DRAW_MASK_TABLE);

// No billboard program samples anything else on unit 6; drawBillboards binds it before every call that needs it.
export const BB_SURFACE_UNIT = 6;
/** @type {Readonly<Record<string, WebGLUniformLocation | null>>} */
const NO_COLUMN_LOCS = Object.freeze({});
const NO_LPT_LOCS = Object.freeze({ uMesh: null, uMeshScale: null, uMeshColor: null, uMeshAlpha: null, uLptCut: null, uLptBand: null, uLptSun: null, uSunLift: null });
export const LPT_SUN_FULL = 0.25;

export function textureParams(gl, opts = {}) {
  if (opts.smooth) return { wrap: gl.CLAMP_TO_EDGE, filter: gl.LINEAR };
  // A screen quad that never tiles (the casting hands) clamps: under REPEAT some GPUs sample a hair past u=1 and
  // wrap to the art's first column.
  if (opts.clamp) return { wrap: gl.CLAMP_TO_EDGE, filter: gl.NEAREST };
  return { wrap: gl.REPEAT, filter: gl.NEAREST };
}

export function screenQuadBlends(tex, color, opts = {}, alphaArt = false) {
  return (!tex && (color[3] ?? 1) < 1) || Boolean(tex && (opts.blend || alphaArt));
}

// 'exp2' is Unity's ExponentialSquared fog.
const FOG_MODE_NAMES = ['off', 'linear', 'exp', 'exp2'];

// DFU's default camera background; its 5/255 alpha lets the automap's background art show through.
export const PANEL_CLEAR_RGBA = Object.freeze([49 / 255, 77 / 255, 121 / 255, 5 / 255]);

import { WATER_MAP_COLOR } from './underwaterFog.js';
import { WATER_SURFACE_VS, waterSurfaceFs } from './waterSurface.js';
import { WATER_LAYER_UNITS, WATER_SCENE_UNIT, WATER_SCENE_DEPTH_UNIT, NO_BED_DEPTH, WATER_RIPPLE_UNIT } from './waterSurface.js';
import { WATER_BED_GLSL, waterBedMix } from './waterBedGlsl.js';
import { packWaterMask, WATER_DRAW_MASK_TABLE } from '../world/waterCorners.js';
import { pageParam } from '../platform/pageQuery.js';
import { SKIN_PAL_ROW, SKIN_PALETTE_UNIT } from './skinPalette.js';
import { lightIdsOf, lightList, packLight } from './lightId.js';
import { ecotoneGlsl, ECO_UNITS } from './ecotoneGlsl.js';
import { SCORCH_GLSL } from './scorchGlsl.js';
import { snowCoverGlsl, TWIN_LAYERS, SNOW_LINES_UNIT } from './snowCoverGlsl.js';
import { SNOW_VS, snowTerrainFs, SNOW_UNITS, SNOW_LAYER, snowSurfaceRise } from './snowfallGlsl.js';
import { GLOW_SPRITE_VS, GLOW_SPRITE_FS, GLOW_FIELD_VS, GLOW_FIELD_FS, GLOW_FIELDS_MAX, GLOW_REACH_MAX, glowFieldReach, GLOW_MESH_FS, GLOW_CLOCK_PERIOD, GLOW_CHARGE_PULL, GLOW_DRAWS_MAX, GLOW_DEPTH_FLOOR, glowUnit, glowMeshVs, glowRingDraws } from './weaponGlowGlsl.js';
const SNOW_UNIT_LIST = Object.entries(SNOW_UNITS);

export const glowSeconds = (now = globalThis.performance?.now?.() ?? Date.now()) => (now / 1000) % GLOW_CLOCK_PERIOD;
const _glowDraws = new Map();
const glowDrawsFor = (look) => { let d = _glowDraws.get(look); if (!d) { d = glowRingDraws(look); _glowDraws.set(look, d); } return d; };

export const AUTOMAP_PANEL_NATIVE_RECT = Object.freeze({ x: 1, y: 1, w: 318, h: 169 });

// Cutout is not a mode: DFU's cutout pass clips every fragment, so the game does not issue that group.
export const AUTOMAP_MODE = Object.freeze({
  OFF: 0,
  BELOW_COLOUR: 1,
  BELOW_GRAY: 2,
  ABOVE_TRANSPARENT_COLOUR: 3,
  ABOVE_TRANSPARENT_GRAY: 4,
  ABOVE_WIREFRAME_COLOUR: 5,
  ABOVE_WIREFRAME_GRAY: 6,
});

export const AUTOMAP_NO_WATER = -10000;
// DFU overrides the shader default with UnderwaterFog.waterMapColor, so this reads it from underwaterFog.js.
export const AUTOMAP_WATER_COLOR = WATER_MAP_COLOR;

// Shared edges appear twice on purpose: DFU draws each triangle's three edges, quad diagonals included.
export function buildWireIndices(triIndices, subMeshes) {
  let total = 0;
  for (const sm of subMeshes) total += sm.primitiveCount * 6;
  const indices = new Uint32Array(total);
  const ranges = [];
  let w = 0;
  for (const sm of subMeshes) {
    const start = w;
    for (let t = 0; t < sm.primitiveCount; t++) {
      const b = sm.startIndex + t * 3;
      const i0 = triIndices[b], i1 = triIndices[b + 1], i2 = triIndices[b + 2];
      indices[w++] = i0; indices[w++] = i1;
      indices[w++] = i1; indices[w++] = i2;
      indices[w++] = i2; indices[w++] = i0;
    }
    ranges.push({ start, count: w - start });
  }
  return { indices, ranges };
}


// '#opaque' keys mesh uploads (alphaIndex -1) apart from flats (alphaIndex 0), because the billboard shader
// discards on alpha; '#ui' does the same for the mip chain.
export const textureKeyOf = (archive, record, opts = {}) =>
  `${archive}_${record}${opts.smooth ? '#smooth' : ''}${opts.opaque ? '#opaque' : ''}${opts.mips === false ? (opts.variant ?? '#ui') : ''}${opts.alpha ? '#alpha' : ''}${opts.clamp && !opts.smooth ? '#clamp' : ''}${opts.sampler && !opts.smooth ? samplerKey(opts.sampler) : ''}`;

export class Renderer {
  /** @type {Array<any>|null} */ _bbOpaque = null;
  /** @type {Set<string>|null} */ _missingMeshes = null;

  constructor(canvas) {
    this.canvas = canvas;
    // Prefer the discrete GPU on dual-GPU machines; the desktop app requests the same at launch.
    const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 required');
    this.gl = gl;
    this._shadowCacheWanted = true;

    // The world program set is built and installed as a unit, since a lighting lane replaces all its fragment shaders.
    this._csLoc = {};
    this._lane = null;
    this._laneSet = null;
    this._exposure = 1;
    this._shadows = null;
    this._shadowPass = null;
    this._air = null;
    this._airPass = null;
    this._sceneGrade = null;
    this._airWanted = false;
    this._frameFbo = null;
    this._retro = null;
    this._retroSource = null;
    this._retroFrame = null;
    this._retroOwed = false;
    this._retroMips = true;
    this._scaleSource = null;
    this.gpuName = gpuNameOf(gl);
    this._replacements = new WeakSet();
    this._scissor = null;
    this._spriteDepth = 0;
    this._clusters = null;
    this._clusterTex = null;
    this._clustersLive = false;
    this._clustersWanted = true;
    this._clusterRect = new Float32Array(4);
    this._clusterZ = new Float32Array([1 / CLUSTER_NEAR, CLUSTER_Z_SCALE]);
    this._camFwd = new Float32Array(4);
    this._panelLane = null;
    this._studioDepth = 0;
    this._adaptOneTex = null;
    this.maxPointLights = CLASSIC_MAX_LIGHTS;
    this._decA = new Float32Array(3); this._decB = new Float32Array(3); this._decC = new Float32Array(3);
    this._pointColorDec = new Float32Array(CLASSIC_MAX_LIGHTS * 3);
    // viewDraws counts the view out, which draws before the room's beginFrame; that beginFrame takes over its count.
    this.stats = { draws: 0, programBinds: 0, vaoBinds: 0, texBinds: 0, bbCulled: 0, spriteBinds: 0, viewDraws: 0, shadowDraws: 0 };
    this._skinNrm = new Float32Array(9);
    this._spriteBatch = { items: [], open: false, depth: 0 };
    this._csEdge = CHAR_SPRITE_RT_SIZE;
    this._csMost = 0;
    /** @type {WebGLTexture|null} */ this._skinIdentity = null;
    /** @type {WebGLTexture|null} */ this._skinUnitHolds = null;
    this._classicSet = this._buildWorldSet({ key: 'classic', meshFs: FS, bbFs: BB_FS, terrainFs: TERRAIN_FS, charFs: CHAR_FS, decalFs: DECAL_FS });
    this._installWorldSet(this._classicSet);
    this._ambientTri = null;

    this.textures = new Map();
    this.lptAtlases = new Set();
    this._alphaArt = new WeakSet();
    this._texKeysByBase = new Map();
    this._texBaseOf = new Map();
    this._uploadSink = null;
    this.textureMiss = null;
    /** @type {Set<string> | undefined} */
    this._placeholders = new Set();
    this.emissionTextures = new Map();
    this.emissionWhite = new Set();
    this.windowMasks = new Set();
    this.glassMasks = new Map();
    this._cutoutArt = new WeakSet();
    this._rw = { rooms: false, watch: false, live: false, rect: new Float32Array(4), rectGen: 0 };
    this._rwAcc = { n: 0, holes: false, rect: [1, 1, -1, -1], panes: [], np: 0 };
    this.outsideViewDraws = new Set();
    this.outsideViewSkip = new Set();
    this._rwExterior = null; this._rwTarget = null; this._rwOutside = null; this._rwBg = null; this._rwEmptyVao = null;
    this._portalPv = null; this._portalPlanes = null;
    this._rwPv = null; this._rwQ = null; this._rwPanes = []; this._rwPaneN = 0; this._rwPaneOn = false; this._rwPaneProg = null; this._rwViewDraws = 0;
    // The last value uploaded to the solid program's uEmissionColor; uniforms are program state, so it persists.
    this._emissionColorUp = null;
    /** @type {(WebGLTexture|null)[]} */
    this._tEcoTex = [null, null, null];
    /** @type {boolean|null} */
    this._tEcoOn = null;
    /** @type {boolean|null} */
    this._tSnowOn = null;
    this._tSnowArr = [-1, -1, -1, -1];
    this._snowFrame = null; this._snowTex = null; this._snowTexSide = 0; this._snowGen = -1;
    this._forgetTextureShadows();
    // Any texture or emission upload bumps this, so cached sub-mesh lookups re-resolve a texture that streams in later.
    this._texGen = 1;
    this._perf = perfOn() ? setMeter(gl, new PerfMeter(gl, perfZones(), perfCpu())) : null;
    this._perfOpen = false;
    this._frameStamp = 0;
    // null means not asked yet and false means the driver has none, so an absent extension is asked once.
    this._anisoExt = null;
    this._anisoMax = 1;
    this._bbPlanes = new Float32Array(24);
    this._reachSphere = new Float64Array(4);
    this._bbPv = new Float32Array(16);
    this._bbCullOff = cullDisabled();
    this._tFrameStamp = -1;
    this._bbFrameStamp = -1;
    this._dFrameStamp = -1;
    this._cFrameStamp = -1;
    // Every writer of the point colors bumps _pointColorGen: setPointLights, setFlashLight, and setLightingLane.
    this._pointColorGen = 0;
    this._pointColorDecGen = -1;
    this._pointColorDecCount = 0;
    this._pointColorDecLane = null;
    this._windowEmission = new Float32Array([0, 0, 0]);
    this._pointLights = new Float32Array(0);
    this._flashLight = null;
    this._flashLightScratch = lightList(CLASSIC_MAX_LIGHTS);
    this._flashColorScratch = new Float32Array(CLASSIC_MAX_LIGHTS * 3);
    this._flashCarriedScratch = new Uint8Array(CLASSIC_MAX_LIGHTS);
    this._pointCarried = null;
    this._pointIds = null;
    this._everyLightNow = false;
    this._everyLightPrev = false;
    this._pointColor = new Float32Array([1, 1, 1]);
    this._pointColors = null;
    this._pointColorScratch = new Float32Array(CLASSIC_MAX_LIGHTS * 3);
    this._indirect = new Float32Array([0, 0, 0, 0]);
    this._indirectColor = new Float32Array([0, 0, 0]);
    this._fogMode = 0;
    this._fogDensity = 0;
    this._fogRange = new Float32Array([0, 1]);
    // Frame state: beginFrame clears it and the exterior host sets it after.
    this._dwFog = new Float32Array(20);
    // Frame state: a beginFrame that setJungleHaze did not arm clears it, so other scenes never inherit the haze.
    this._haze = new Float32Array(8);
    this._hazeArmed = false;
    this._hazeOn = new WeakMap();
    this._lptSlots = [null, null];
    this._seaHaze = new Float32Array(2);
    this._dwColumn = null;
    this._snowRise = 0;
    this._bbColumnOn = 0;
    this._bbTipOn = false;
    this._bbDissolveOn = false;
    this._bbCrackOn = false;
    this._bbGlintOn = false;
    this._bbTintOn = false;
    this._heldFlats = [];
    this._dwCamFwd = new Float32Array(3);
    this._fogColor = new Float32Array([0, 0, 0]);
    this._camPos = new Float32Array(3);
    this._focus = new Float32Array(4);
    /** @type {any} */
    this._foeTelegraph = null;
    /** @type {Promise<void>|null} */
    this._foeTelegraphLoad = null;
    this._focusArmed = false;
    this._focusWide = false;
    this._clipY = 1e9;
    this._automapMode = 0;
    this._automapWaterLevel = AUTOMAP_NO_WATER;
    this._automapWaterColor = new Float32Array(AUTOMAP_WATER_COLOR);
    this._ambient = new Float32Array([0.45, 0.45, 0.45]);
    this._sunScale = 0.55;
    this._sunColor = new Float32Array([1, 1, 1]);
    this._moonDir = new Float32Array([0, 1, 0]);
    this._moonScale = 0;
    this._moonColor = new Float32Array([1, 1, 1]);
    this._light3Dir = new Float32Array([0, 1, 0]);
    this._light3Scale = 0;
    this._light3Color = new Float32Array([1, 1, 1]);
    // Billboards stay full-bright until a scene installs the clock with setLighting.
    this._clockLit = false;
    this._blackTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._blackTex);
    this._tex0Bound = null;
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );

    this._csStamp = 0; this._csUploaded = {}; this._csRect = new Float32Array(4);
    this.tileArrays = new Map();
    /** @type {Map<any, number[]>} */
    this._tileDims = new Map();
    /** @type {WeakMap<WebGLTexture, number>} */
    this._arrLayers = new WeakMap();
    this._cloudShadow = null;
    this._deckOwed = null;
    this._terrainIndexSets = new Map();

    // Both programs start before either status is read, so the compiles overlap.
    startPrograms(this.gl, [[WATER_VS, WATER_FS], [WATER_SURFACE_VS, waterSurfaceFs(CLOUD_SHADOW_GLSL)]]);
    this.waterProgram = this._buildProgram(WATER_VS, WATER_FS);
    this.waterSurfaceProgram = this._buildProgram(WATER_SURFACE_VS, waterSurfaceFs(CLOUD_SHADOW_GLSL));
    this.waterSurfaceProgramLane = null; this._wsLane = null;
    this._ws = this._waterLocs(this.waterSurfaceProgram);
    this._waterSurfaceFog = this._ws.fog;
    this._csLoc.water = this._ws.cloud;
    this._waterFog = {
      fogColor: gl.getUniformLocation(this.waterProgram, 'uFogColor'),
      fogMode: gl.getUniformLocation(this.waterProgram, 'uFogMode'),
      fogDensity: gl.getUniformLocation(this.waterProgram, 'uFogDensity'),
      fogRange: gl.getUniformLocation(this.waterProgram, 'uFogRange'),
      camPos: gl.getUniformLocation(this.waterProgram, 'uCamPos'),
      focus: gl.getUniformLocation(this.waterProgram, 'uFocus'),
      dwFog: gl.getUniformLocation(this.waterProgram, 'uDwFog'),
      haze: gl.getUniformLocation(this.waterProgram, 'uJungleHaze'),
    };
    this.waterUProj = gl.getUniformLocation(this.waterProgram, 'uProj');
    this.waterUView = gl.getUniformLocation(this.waterProgram, 'uView');
    this.waterURect = gl.getUniformLocation(this.waterProgram, 'uRect');
    this.waterUTex = gl.getUniformLocation(this.waterProgram, 'uWaterTex');
    this.waterUScroll = gl.getUniformLocation(this.waterProgram, 'uWaterScroll');
    this.waterUColor = gl.getUniformLocation(this.waterProgram, 'uWaterColor');
    {
      this.waterVao = gl.createVertexArray();
      this._bindVao(this.waterVao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER,
        new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      this._bindVao(null);
    }
    this._flatWind = new Float32Array(4);
    this._windfall = new Float32Array(8);
    this._bbRight = new Float32Array([1, 0, 0]);
    this._bbUp = new Float32Array([0, 1, 0]);
    this._lptDrawn = [null, null];
    this._windfallSway = this._windfall.subarray(0, 4);
    this._windfallAxis = this._windfall.subarray(4, 8);
    this._proj = null;
    this._view = null;

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    // The projection mirrors NDC x, so world front faces arrive clockwise. Only world passes may cull; every other
    // pass must turn CULL_FACE off around its draw.
    gl.frontFace(gl.CW);
    gl.clearColor(0.53, 0.7, 0.92, 1.0);
    // JS copy of the clear color, so no pass queries GL for it; every borrower restores what it took.
    this._clearColor = new Float32Array([0.53, 0.7, 0.92, 1.0]);
    // Program and VAO binds go through _use and _bindVao, which skip redundant binds; the shadows reset at
    // beginFrame and markForeignPass.
    this._lastProgram = null;
    this._lastVao = null;
    this._bbArenas = [];
    this._bbArenaOfKey = new Map();
    this._bbIndex = null;
    this._bindVaoFn = (/** @type {WebGLVertexArrayObject|null} */ vao) => this._bindVao(vao);
    this._holdSkinFn = (/** @type {WebGLTexture|null} */ tex) => this._holdSkin(tex);
    this._worldViewportPending = null;
    this._worldViewportPx = null;
    this._worldViewportFrame = null;
  }

  // Consumed by the next beginFrame, so a host that sets none gets the full canvas.
  setWorldViewport(rect) {
    this._worldViewportPending = rect && (rect.x !== 0 || rect.y !== 0 || rect.w !== 1 || rect.h !== 1)
      ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null;
  }

  get worldViewportPx() { return this._worldViewportPx ? [...this._worldViewportPx] : null; }

  // Outlives endWorldPass; 2D drawing that must line up with the world maps through it (tapRay.js worldRectPx).
  get worldViewportRect() { return this._worldViewportFrame ? { ...this._worldViewportFrame } : null; }

  _restoreWorldViewport() {
    const gl = this.gl, p = this._worldViewportPx;
    if (p) gl.viewport(p[0], p[1], p[2], p[3]);
    else gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  endWorldPass() {
    this._close2D();
    if (!this._worldViewportPx) return;
    this._forgetTextureShadows();
    this._worldViewportPx = null;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  // Leaves unit 0 active, which every draw path expects on entry and exit.
  _bindEmission(tex) {
    if (this._tex1Bound === tex) return;
    const gl = this.gl;
    this._activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._activeTexture(gl.TEXTURE0);
    this._tex1Bound = tex;
    this.stats.texBinds++;
  }

  // The only raw gl.activeTexture call in this file; every other unit change goes through here.
  _activeTexture(unit) {
    if (this._activeUnit === unit) return;
    this.gl.activeTexture(unit);
    this._activeUnit = unit;
  }

  _bindTex0(tex) {
    if (this._tex0Bound === tex) return;
    this._activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this._tex0Bound = tex;
    this.stats.texBinds++;
  }

  _use(program) {
    if (this._lastProgram === program) return;
    this.gl.useProgram(program);
    this._lastProgram = program;
    this.stats.programBinds++;
  }

  // Uses batchVisible, as the shadow and emission replays do, so every pass culls the same batches.
  _bbVisible(b) {
    return batchVisible(this._bbPlanes, b);
  }

  _bindVao(vao) {
    if (this._lastVao === vao) return;
    this.gl.bindVertexArray(vao);
    this._lastVao = vao;
    if (vao) this.stats.vaoBinds++;
  }

  // A foreign pass may move any program, VAO, or texture unit, so every shadow and cloud-shadow upload stamp resets.
  markForeignPass() {
    // Hosts call this after a foreign pass; a 2D run still open here means the pass drew without the baseline state.
    if (this._2dVao && !this._warned2dForeign) {
      this._warned2dForeign = true;
      console.warn('PERF-2D: a foreign pass ran inside an open 2D run - it drew with DEPTH_TEST and CULL_FACE off. Call renderer.endUiRun() before the pass.',
        `\n  the pass that found it: ${new Error().stack?.split('\n').slice(2, 6).join(' <- ') ?? '?'}`,
        `\n  the run it found: ${this._2dOpenedBy?.stack?.split('\n').slice(2, 8).join(' <- ') ?? '?'}`);
    }
    this._close2D();
    this.gl.bindVertexArray(null);
    this._lastProgram = null;
    this._lastVao = null;
    this._csUploaded = {};
    this._forgetTextureShadows();
  }

  _buildWorldSet(src) {
    // Every program is handed to the driver before the first status read, so the compiles run in parallel.
    startPrograms(this.gl, worldSetPrograms(src));
    return {
      key: src.key,
      mesh: this._buildProgram(VS, src.meshFs),
      char: this._charSkinProgram(src.charFs),
      bb: this._buildProgram(bbVertexShader(src.bbVs), src.bbFs),
      terrain: this._buildProgram(TERRAIN_VS, src.terrainFs),
      terrainFs: src.terrainFs,
      terrainClip: null,
      terrainSnow: null,
      decal: this._buildProgram(DECAL_VS, src.decalFs ?? DECAL_FS),
      decalLights: src.decalFs ? (src.maxLights ?? CLASSIC_MAX_LIGHTS) : CLASSIC_MAX_LIGHTS,
      locate: null,
    };
  }

  // The palette unit and front-face flag are set once at link, so draws send neither.
  _charSkinProgram(fs) {
    const gl = this.gl;
    const program = this._buildProgram(CHAR_SKIN_VS, skinFaceFs(fs));
    this._use(program);
    gl.uniform1i(gl.getUniformLocation(program, 'uSkinPalette'), SKIN_PALETTE_UNIT);
    gl.uniform1f(gl.getUniformLocation(program, 'uFrontCW'), 1);
    this._skinIdentityTex();
    this._activeTexture(gl.TEXTURE0);
    return program;
  }

  // Locations are fixed at link and a set's programs never re-link, so the memo lives on the set.
  _locations(set = this._worldSet) {
    if (set.locate) return set.locate;
    const gl = this.gl, byProgram = new Map();
    return (set.locate = {
      getUniformLocation(program, name) {
        let byName = byProgram.get(program);
        if (!byName) byProgram.set(program, (byName = new Map()));
        let loc = byName.get(name);
        // A null location (an undeclared uniform) is cached too.
        if (loc === undefined) byName.set(name, (loc = gl.getUniformLocation(program, name)));
        return loc;
      },
    });
  }

  _fogLocs(program) {
    const gl = this._locations();
    return {
      fogColor: gl.getUniformLocation(program, 'uFogColor'),
      fogMode: gl.getUniformLocation(program, 'uFogMode'),
      clipY: gl.getUniformLocation(program, 'uClipY'),
      amMode: gl.getUniformLocation(program, 'uAutomapMode'),
      amWaterLevel: gl.getUniformLocation(program, 'uAutomapWaterLevel'),
      amWaterColor: gl.getUniformLocation(program, 'uAutomapWaterColor'),
      fogDensity: gl.getUniformLocation(program, 'uFogDensity'),
      fogRange: gl.getUniformLocation(program, 'uFogRange'),
      camPos: gl.getUniformLocation(program, 'uCamPos'),
      focus: gl.getUniformLocation(program, 'uFocus'),
      dwFog: gl.getUniformLocation(program, 'uDwFog'),
      haze: gl.getUniformLocation(program, 'uJungleHaze'),
    };
  }

  // Every cached upload stamp and bind shadow belonged to the old set, so installing drops them all.
  _installWorldSet(set) {
    const gl = this._locations(set);
    this._worldSet = set;
    this.program = set.mesh;
    this.uProj = gl.getUniformLocation(this.program, 'uProj');
    this.uView = gl.getUniformLocation(this.program, 'uView');
    this.uModel = gl.getUniformLocation(this.program, 'uModel');
    this.uLightDir = gl.getUniformLocation(this.program, 'uLightDir');
    this.uAmbient = gl.getUniformLocation(this.program, 'uAmbient');
    this.uAmbientSky = gl.getUniformLocation(this.program, 'uAmbientSky');
    this.uAmbientGround = gl.getUniformLocation(this.program, 'uAmbientGround');
    this.uTrilight = gl.getUniformLocation(this.program, 'uTrilight');
    this.uSunScale = gl.getUniformLocation(this.program, 'uSunScale');
    this.uSunColor = gl.getUniformLocation(this.program, 'uSunColor');
    this.uMoonDir = gl.getUniformLocation(this.program, 'uMoonDir');
    this.uMoonScale = gl.getUniformLocation(this.program, 'uMoonScale');
    this.uMoonColor = gl.getUniformLocation(this.program, 'uMoonColor');
    this.uLight3Dir = gl.getUniformLocation(this.program, 'uLight3Dir');
    this.uLight3Scale = gl.getUniformLocation(this.program, 'uLight3Scale');
    this.uLight3Color = gl.getUniformLocation(this.program, 'uLight3Color');
    this.uTex = gl.getUniformLocation(this.program, 'uTex');
    this.uEmissionTex = gl.getUniformLocation(this.program, 'uEmissionTex');
    this.uEmissionColor = gl.getUniformLocation(this.program, 'uEmissionColor');
    this.uPointCount = gl.getUniformLocation(this.program, 'uPointCount');
    this.uPointLights = gl.getUniformLocation(this.program, 'uPointLights');
    this.uPointColors = gl.getUniformLocation(this.program, 'uPointColors');
    this.uIndirect = gl.getUniformLocation(this.program, 'uIndirect');
    this.uIndirectColor = gl.getUniformLocation(this.program, 'uIndirectColor');
    this._solidFog = this._fogLocs(this.program);
    this.uDissolveCut = gl.getUniformLocation(this.program, 'uDissolveCut');
    this.uMeshAlpha = gl.getUniformLocation(this.program, 'uMeshAlpha');
    this.rwLocs = {
      mode: gl.getUniformLocation(this.program, 'uWinMode'), cut: gl.getUniformLocation(this.program, 'uCutout'),
      rect: gl.getUniformLocation(this.program, 'uGlassRect'), lamp: gl.getUniformLocation(this.program, 'uRoomLamp'),
      day: gl.getUniformLocation(this.program, 'uRoomDay'),
      pane: gl.getUniformLocation(this.program, 'uPaneDepth'), paneOn: gl.getUniformLocation(this.program, 'uPaneOn'),
    };
    this._rwModeUp = -1; this._rwCutUp = -1; this._rwRectUp = -1; this._rwLightE = null; this._rwLightA = null;
    this.charProgram = set.char;
    const cp = this.charProgram;
    this._char = {
      proj: gl.getUniformLocation(cp, 'uProj'),
      view: gl.getUniformLocation(cp, 'uView'),
      model: gl.getUniformLocation(cp, 'uModel'),
      lightDir: gl.getUniformLocation(cp, 'uLightDir'),
      ambient: gl.getUniformLocation(cp, 'uAmbient'),
      sunScale: gl.getUniformLocation(cp, 'uSunScale'),
      sunColor: gl.getUniformLocation(cp, 'uSunColor'),
      moonDir: gl.getUniformLocation(cp, 'uMoonDir'),
      moonScale: gl.getUniformLocation(cp, 'uMoonScale'),
      moonColor: gl.getUniformLocation(cp, 'uMoonColor'),
      pointCount: gl.getUniformLocation(cp, 'uPointCount'),
      pointLights: gl.getUniformLocation(cp, 'uPointLights'),
      pointColors: gl.getUniformLocation(cp, 'uPointColors'),
      indirect: gl.getUniformLocation(cp, 'uIndirect'),
      indirectColor: gl.getUniformLocation(cp, 'uIndirectColor'),
      tex: gl.getUniformLocation(cp, 'uTex'),
      useTex: gl.getUniformLocation(cp, 'uUseTex'),
      alphaCut: gl.getUniformLocation(cp, 'uAlphaCut'),
      skin: gl.getUniformLocation(cp, 'uSkin'),
      skinNrm: gl.getUniformLocation(cp, 'uSkinNrm'),
      skinFlip: gl.getUniformLocation(cp, 'uSkinFlip'),
    };
    this._charFog = this._fogLocs(cp);
    this.bbProgram = set.bb;
    this._terrainClip = !!(this._terrainClip && set.terrainClip);
    this.terrainProgram = this._terrainClip ? set.terrainClip : set.terrain;
    this.tUProj = gl.getUniformLocation(this.terrainProgram, 'uProj');
    this.tUView = gl.getUniformLocation(this.terrainProgram, 'uView');
    this.tUModel = gl.getUniformLocation(this.terrainProgram, 'uModel');
    this._csLoc.terrain = [gl.getUniformLocation(this.terrainProgram, 'uCloudShadowMap'), gl.getUniformLocation(this.terrainProgram, 'uCloudShadowRect'), gl.getUniformLocation(this.terrainProgram, 'uCloudShadowFar')];
    this._csLoc.mesh = [gl.getUniformLocation(this.program, 'uCloudShadowMap'), gl.getUniformLocation(this.program, 'uCloudShadowRect'), gl.getUniformLocation(this.program, 'uCloudShadowFar')];
    this._csLoc.char = [gl.getUniformLocation(this.charProgram, 'uCloudShadowMap'), gl.getUniformLocation(this.charProgram, 'uCloudShadowRect'), gl.getUniformLocation(this.charProgram, 'uCloudShadowFar')];
    this._csLoc.bb = [gl.getUniformLocation(this.bbProgram, 'uCloudShadowMap'), gl.getUniformLocation(this.bbProgram, 'uCloudShadowRect'), gl.getUniformLocation(this.bbProgram, 'uCloudShadowFar')];
    this.decalProgram = set.decal;
    this._decal = this._decalLocs(set.decal);
    this._decalLights = set.decalLights ?? CLASSIC_MAX_LIGHTS;
    this._csLoc.decal = [gl.getUniformLocation(set.decal, 'uCloudShadowMap'), gl.getUniformLocation(set.decal, 'uCloudShadowRect'), gl.getUniformLocation(set.decal, 'uCloudShadowFar')];
    this.tUTileArr = gl.getUniformLocation(this.terrainProgram, 'uTileArr');
    this.tUTilemap = gl.getUniformLocation(this.terrainProgram, 'uTilemap');
    this.tUTileSize = gl.getUniformLocation(this.terrainProgram, 'uTileSize');
    this.tUWaterBed = gl.getUniformLocation(this.terrainProgram, 'uWaterBed');
    this.tUScorch = gl.getUniformLocation(this.terrainProgram, 'uScorch'); this._tScorch = null;
    this.tUBedMask = gl.getUniformLocation(this.terrainProgram, 'uBedMask');
    this.tEco = {
      arr: ECO_UNITS.map((_, k) => gl.getUniformLocation(this.terrainProgram, `uEcoArr${k + 1}`)),
      side: gl.getUniformLocation(this.terrainProgram, 'uEcoSide'),
      corner: gl.getUniformLocation(this.terrainProgram, 'uEcoCorner'),
      origin: gl.getUniformLocation(this.terrainProgram, 'uEcoOrigin'),
    };
    this._tEcoOn = null;
    this.tSnow = Object.fromEntries(['Lines', 'Set', 'Win', 'Arr'].map((n) => [n, gl.getUniformLocation(this.terrainProgram, `uSnow${n}`)]));
    this._tSnowOn = null; this._tSnowArr = [-1, -1, -1, -1];
    this.tULightDir = gl.getUniformLocation(this.terrainProgram, 'uLightDir');
    this.tUAmbient = gl.getUniformLocation(this.terrainProgram, 'uAmbient');
    this.tUSunScale = gl.getUniformLocation(this.terrainProgram, 'uSunScale');
    this.tUSunColor = gl.getUniformLocation(this.terrainProgram, 'uSunColor');
    this.tUMoonDir = gl.getUniformLocation(this.terrainProgram, 'uMoonDir');
    this.tUMoonScale = gl.getUniformLocation(this.terrainProgram, 'uMoonScale');
    this.tUMoonColor = gl.getUniformLocation(this.terrainProgram, 'uMoonColor');
    this.tUPointCount = gl.getUniformLocation(this.terrainProgram, 'uPointCount');
    this.tUPointLights = gl.getUniformLocation(this.terrainProgram, 'uPointLights');
    this.tUPointColors = gl.getUniformLocation(this.terrainProgram, 'uPointColors');
    this.tUIndirect = gl.getUniformLocation(this.terrainProgram, 'uIndirect');
    this.tUIndirectColor = gl.getUniformLocation(this.terrainProgram, 'uIndirectColor');
    this._bbFog = this._fogLocs(this.bbProgram);
    this._terrainFog = this._fogLocs(this.terrainProgram);
    this.bbUProj = gl.getUniformLocation(this.bbProgram, 'uProj');
    this.bbUView = gl.getUniformLocation(this.bbProgram, 'uView');
    this.bbURight = gl.getUniformLocation(this.bbProgram, 'uRight');
    this.bbUUp = gl.getUniformLocation(this.bbProgram, 'uUp');
    this.bbUSize = gl.getUniformLocation(this.bbProgram, 'uSize');
    this.bbUOrigin = gl.getUniformLocation(this.bbProgram, 'uOrigin');
    this.bbUTex = gl.getUniformLocation(this.bbProgram, 'uTex');
    this.bbUEmissionTex = gl.getUniformLocation(this.bbProgram, 'uEmissionTex');
    this.bbUSpectral = gl.getUniformLocation(this.bbProgram, 'uSpectral');
    this.bbUConceal = gl.getUniformLocation(this.bbProgram, 'uConceal');
    this.bbUHitFlash = gl.getUniformLocation(this.bbProgram, 'uHitFlash');
    this.bbUDissolve = gl.getUniformLocation(this.bbProgram, 'uDissolve');
    this.bbUCrack = gl.getUniformLocation(this.bbProgram, 'uCrack');
    this.bbUEliteGlow = gl.getUniformLocation(this.bbProgram, 'uEliteGlow');
    this.bbUGlint = gl.getUniformLocation(this.bbProgram, 'uGlint');
    this.bbUEliteTime = gl.getUniformLocation(this.bbProgram, 'uEliteTime');
    this.bbUElitePad = gl.getUniformLocation(this.bbProgram, 'uElitePad');
    this.bbUTint = gl.getUniformLocation(this.bbProgram, 'uTint');
    this.bbUBatchTint = gl.getUniformLocation(this.bbProgram, 'uBatchTint');
    this.bbUBatchDye = gl.getUniformLocation(this.bbProgram, 'uBatchDye');
    this.bbUSun = gl.getUniformLocation(this.bbProgram, 'uBBSun');
    this.bbUPointCount = gl.getUniformLocation(this.bbProgram, 'uPointCount');
    this.bbUPointLights = gl.getUniformLocation(this.bbProgram, 'uPointLights');
    this.bbUPointColors = gl.getUniformLocation(this.bbProgram, 'uPointColors');
    this.bbUIndirect = gl.getUniformLocation(this.bbProgram, 'uIndirect');
    this.bbUIndirectColor = gl.getUniformLocation(this.bbProgram, 'uIndirectColor');
    this.bbUFlatWind = gl.getUniformLocation(this.bbProgram, 'uFlatWind');
    this.bbUSway = gl.getUniformLocation(this.bbProgram, 'uSway');
    this.bbUWindfallSway = gl.getUniformLocation(this.bbProgram, 'uWindfallSway');
    this.bbUWindfallAxis = gl.getUniformLocation(this.bbProgram, 'uWindfallAxis');
    this.bbUTip = gl.getUniformLocation(this.bbProgram, 'uTip');
    this.bbLpt = Object.fromEntries(['uMesh', 'uMeshScale', 'uMeshColor', 'uMeshAlpha', 'uLptCut', 'uLptBand', 'uLptSun', 'uSunLift'].map((n) => [n, gl.getUniformLocation(this.bbProgram, n)]));
    this.bbColumn = Object.fromEntries(['uColumnOn', 'uSurfaceTex', 'uDwCamFwd', 'uSeaY', 'uTopColor', 'uTopVision', 'uSurfaceScroll', 'uPixelOrigin'].map((n) => [n, gl.getUniformLocation(this.bbProgram, n)]));
    const elLocs = (p) => {
      /** @type {any[] & { shadow?: object, ao?: object, contact?: object, cluster?: object }} */
      const a = [gl.getUniformLocation(p, 'uELExposure'), gl.getUniformLocation(p, 'uELScatter')];
      a.shadow = {
        sunShadow: gl.getUniformLocation(p, 'uSunShadow'), sunVP: gl.getUniformLocation(p, 'uSunVP'), sunParams: gl.getUniformLocation(p, 'uSunShadowParams'), sunTexel: gl.getUniformLocation(p, 'uSunTexel'), sunOrigin: gl.getUniformLocation(p, 'uSunOrigin'),
        pointShadow: gl.getUniformLocation(p, 'uPointShadow'), pointParams: gl.getUniformLocation(p, 'uPointShadowParams'), shadowIndex: gl.getUniformLocation(p, 'uShadowIndex'),
        casterOf: gl.getUniformLocation(p, 'uCasterOf'),
        pointShadowLo: gl.getUniformLocation(p, 'uPointShadowLo'),
      };
      a.ao = { adapt: gl.getUniformLocation(p, 'uAdapt') };
      a.cluster = { grid: gl.getUniformLocation(p, 'uClusterGrid'), list: gl.getUniformLocation(p, 'uClusterList'), rect: gl.getUniformLocation(p, 'uClusterRect'), z: gl.getUniformLocation(p, 'uClusterZ'), fwd: gl.getUniformLocation(p, 'uCamFwd'), on: gl.getUniformLocation(p, 'uClusterOn') };
      a.contact = { prevDepth: gl.getUniformLocation(p, 'uPrevDepth'), prevVP: gl.getUniformLocation(p, 'uPrevVP'), prevProjInfo: gl.getUniformLocation(p, 'uPrevProjInfo'), prevRect: gl.getUniformLocation(p, 'uPrevRect'), contactParams: gl.getUniformLocation(p, 'uContactParams') };
      return a;
    };
    this._el = { mesh: elLocs(set.mesh), char: elLocs(set.char), bb: elLocs(set.bb), terrain: elLocs(this.terrainProgram), decal: elLocs(set.decal) };
    this._elLocsOf = elLocs;
    this._tFrameStamp = -1;
    this._bbFrameStamp = -1; this._dFrameStamp = -1; this._cFrameStamp = -1;
    this._csUploaded = {};
    this._emissionColorUp = null;
    this._forgetTextureShadows();
    this._lastProgram = null;
  }

  /** @param {any} lane @param {ReadonlyArray<readonly [string, string]>} [extraPairs]
   *  @param {{ clip?: boolean, snow?: boolean, air?: boolean }} [builds] */
  startWorldPrograms(lane, extraPairs = [], { clip = true, snow = true, air = true } = {}) {
    if (!parallelCompile(this.gl)) return;
    const set = !lane ? this._classicSet : this._laneSet?.key === lane.key ? this._laneSet : null;
    const terrainFs = set ? set.terrainFs : lane.terrainFs;
    const pairs = set ? [] : worldSetPrograms(lane);
    if (clip && !set?.terrainClip) pairs.push([TERRAIN_VS, terrainClipFs(terrainFs)]);
    if (snow && !set?.terrainSnow) pairs.push([SNOW_VS, snowTerrainFs(terrainFs)]);
    if (lane?.shadows) {
      if (!this._shadowPass) pairs.push(...ShadowPass.bootPrograms(this._shadowVs()));
      if (!this.waterSurfaceProgramLane) pairs.push([WATER_SURFACE_VS, waterSurfaceFs(CLOUD_SHADOW_GLSL, SHADOW_GLSL)]);
      if (air && lane.air && !this._airPass) pairs.push(...AirPass.bootPrograms(this.gl, this._airOpts(lane, lane.maxLights)));
    }
    startPrograms(this.gl, [...pairs, ...extraPairs]);
  }
  _shadowVs() { return { mesh: VS, bb: BB_VS, terrain: TERRAIN_VS, char: CHAR_VS, charSkin: CHAR_SKIN_VS }; }
  _airOpts(lane, maxLights) {
    return { build: (vs, fs) => this._buildProgram(vs, fs), vs: { mesh: VS, bb: BB_VS }, glsl: { shadow: SHADOW_GLSL, tonemap: lane.tonemapGlsl, scatter: lane.scatterGlsl }, maxLights };
  }

  setLightingLane(lane) {
    lane = lane ?? null;
    if (lane === this._lane) return;
    if (lane) {
      if (!this._laneSet || this._laneSet.key !== lane.key) this._laneSet = this._buildWorldSet(lane);
      this._installWorldSet(this._laneSet);
    } else {
      this._installWorldSet(this._classicSet);
    }
    this._lane = lane;
    if (lane?.shadows) {
      this._shadows = this._shadowPass ??= new ShadowPass(this.gl, { build: (vs, fs) => this._buildProgram(vs, fs), vs: this._shadowVs() });
      this._shadows.cacheOn = this._shadowCacheWanted !== false;
      if (lane.shadows && !this.waterSurfaceProgramLane) {
        this.waterSurfaceProgramLane = this._buildProgram(WATER_SURFACE_VS, waterSurfaceFs(CLOUD_SHADOW_GLSL, SHADOW_GLSL));
        this._wsLane = this._waterLocs(this.waterSurfaceProgramLane);
        const p = this.waterSurfaceProgramLane, gl = this.gl;
        this._wsLane.shadow = {
          sunShadow: gl.getUniformLocation(p, 'uSunShadow'), sunVP: gl.getUniformLocation(p, 'uSunVP'), sunParams: gl.getUniformLocation(p, 'uSunShadowParams'), sunTexel: gl.getUniformLocation(p, 'uSunTexel'), sunOrigin: gl.getUniformLocation(p, 'uSunOrigin'),
          pointShadow: gl.getUniformLocation(p, 'uPointShadow'), pointParams: gl.getUniformLocation(p, 'uPointShadowParams'), shadowIndex: gl.getUniformLocation(p, 'uShadowIndex'),
          pointShadowLo: gl.getUniformLocation(p, 'uPointShadowLo'),
        };
      }
    } else {
      this._shadows?.discard();
      this._shadows = null;
    }
    this._syncAir();
    // A lane program's usampler must always have an integer texture bound.
    if (lane) this._ensureClusters();
    this.maxPointLights = lane ? lane.maxLights : CLASSIC_MAX_LIGHTS;
    const n = this.maxPointLights;
    if (this._flashLightScratch.length < n * 4) {
      this._flashLightScratch = lightList(n);
      this._flashColorScratch = new Float32Array(n * 3);
      this._flashCarriedScratch = new Uint8Array(n);
      this._pointColorScratch = new Float32Array(n * 3);
      this._pointColorDec = new Float32Array(n * 3);
    }
    if (this._pointLights.length > n * 4) this._pointLights = this._pointLights.subarray ? this._pointLights.subarray(0, n * 4) : this._pointLights.slice(0, n * 4);
    if (this._pointColors && this._pointColors.length > n * 3) this._pointColors = this._pointColors.subarray ? this._pointColors.subarray(0, n * 3) : this._pointColors.slice(0, n * 3);
    this._pointColorGen++;
  }

  // A classic-look lane keeps the hosts' classic colors, ambients, and fog, so it reports null here.
  get lightingLane() { return this._lane?.classicLook ? null : this._lane; }
  get installedLaneKey() { return this._lane?.key ?? null; }
  get exposure() { return this._exposure; }

  setAir(on) { this._airWanted = !!on; this._syncAir(); }
  setContact(on) { this._contactWanted = !!on; this._frameStamp++; }
  setVolumetrics(on) { this._volumetricsWanted = !!on; if (this._airPass) this._airPass.volOn = this._volumetricsWanted; this._frameStamp++; }
  setHaze(on) { this._hazeWanted = !!on; if (this._airPass) this._airPass.hazeOn = this._hazeWanted; }
  _scatterGain() { const lane = this._lane; return lane ? lane.scatter * Math.min(lane.scatterDensity(this._fogMode, this._fogDensity, this._fogRange[0], this._fogRange[1]), lane.scatterDensityMax ?? Infinity) : 0; }
  _airGlows() { return !!this._air && !!this._air.programs.vol && this._air.fresh && this._volumetricsWanted !== false && this._spriteDepth === 0 && this._studioDepth === 0 && !this._panelSaved; }
  setClusters(on) { this._clustersWanted = !!on; }
  setShadowCache(on) { this._shadowCacheWanted = !!on; if (this._shadowPass) this._shadowPass.cacheOn = this._shadowCacheWanted; }
  // Call each frame before beginFrame; the world frame consumes it.
  everyLightCasts() { this._everyLightNow = true; }
  // Moves the stamp too, so a shift between beginFrame and a draw re-uploads the held view-projection.
  shadowOriginShift(offset) { this._shadowPass?.shiftOrigin(offset); this._air?.shiftOrigin(offset); this._frameStamp++; }
  shadowReach(box, ox = 0, oy = 0, oz = 0) { return this._casting && this._shadows.reaches(box, ox, oy, oz); }
  shadowReachBatch(b) {
    if (!this._casting) return false;
    const c = batchSphere(b, this._reachSphere);
    return !c || this._shadows.reachesSphere(c[0], c[1], c[2], c[3]);
  }
  shadowReachSphere(x, y, z, r) { return this._casting && this._shadows.reachesSphere(x, y, z, r); }
  recordShadowMesh(mesh, modelMatrix, texRemap = null) { if (this._casting && mesh?.vao) this._shadows.recordMesh(mesh, modelMatrix, texRemap, 1 - (this._dissolve ?? 1)); }
  recordShadowTerrain(surface, modelMatrix, arrayTex, tilemapTex, tileSize) { if (this._casting && surface?.vao) this._shadows.recordTerrain(surface, modelMatrix, arrayTex, tilemapTex, tileSize); }
  recordShadowBillboards(batches, camRight, camUp) { if (this._casting && batches?.length) this._shadows.recordBillboards(batches, this._flatWind, camRight, camUp, this._windfall); }
  // Bodies draw only through the sprite target, which records no shadow casters, so their draw records them here.
  recordShadowBody(mesh, modelMatrix, sphere, anchored = false) { if (this._casting && mesh?.vao) this._shadows.recordCharacter(mesh, modelMatrix, sphere, true, anchored); }
  // The shadow pass selects units raw, so the active-unit shadow is dropped before this selects one.
  _holdSkin(tex) {
    const want = tex ?? this._skinIdentityTex();
    if (this._skinUnitHolds === want) return;
    const gl = this.gl;
    this._activeUnit = null;
    this._activeTexture(gl.TEXTURE0 + SKIN_PALETTE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, want);
    this._skinUnitHolds = want;
    this._activeTexture(gl.TEXTURE0);
  }
  _ensureClusters() {
    if (this._clusterTex) return;
    const gl = this.gl;
    const make = (unit, internal, w, h, format, type) => {
      const tex = gl.createTexture();
      this._activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    this._clusterTex = {
      grid: make(CLUSTER_GRID_UNIT, gl.RG16UI, CLUSTER_GRID_W, CLUSTER_GRID_H, gl.RG_INTEGER, gl.UNSIGNED_SHORT),
      list: make(CLUSTER_LIST_UNIT, gl.R8UI, CLUSTER_LIST_W, CLUSTER_LIST_ROWS, gl.RED_INTEGER, gl.UNSIGNED_BYTE),
    };
    this._activeTexture(gl.TEXTURE0);
    this._clusters = createClusterSpace();
  }
  _buildClusters(proj, view) {
    if (!this._clusters || !this._clustersWanted) return false;
    const count = this._pointLights.length >> 2;
    const ok = buildLightClusters(this._pointLights, count, view, proj, this._clusters);
    if (!ok) return false;
    const gl = this.gl, sp = this._clusters;
    this._activeTexture(gl.TEXTURE0 + CLUSTER_GRID_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this._clusterTex.grid);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CLUSTER_GRID_W, CLUSTER_GRID_H, gl.RG_INTEGER, gl.UNSIGNED_SHORT, sp.grid);
    if (sp.rows > 0) {
      this._activeTexture(gl.TEXTURE0 + CLUSTER_LIST_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this._clusterTex.list);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CLUSTER_LIST_W, sp.rows, gl.RED_INTEGER, gl.UNSIGNED_BYTE, sp.list.subarray(0, sp.rows * CLUSTER_LIST_W));
    }
    this._activeTexture(gl.TEXTURE0);
    const vp = this._worldViewportPx ?? [0, 0, this.canvas.width, this.canvas.height];
    this._clusterRect[0] = vp[0]; this._clusterRect[1] = vp[1];
    this._clusterRect[2] = CLUSTER_X / Math.max(vp[2], 1); this._clusterRect[3] = CLUSTER_Y / Math.max(vp[3], 1);
    // View depth of point p is -(view row 2 . p + view[14]), so the row is negated for dot() + w in the shader.
    this._camFwd[0] = -view[2]; this._camFwd[1] = -view[6]; this._camFwd[2] = -view[10]; this._camFwd[3] = -view[14];
    return true;
  }
  _uploadClusters(loc, on) {
    if (!loc?.grid || !this._clusterTex) return;
    const gl = this.gl;
    this._activeTexture(gl.TEXTURE0 + CLUSTER_GRID_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this._clusterTex.grid);
    this._activeTexture(gl.TEXTURE0 + CLUSTER_LIST_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this._clusterTex.list);
    this._activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.grid, CLUSTER_GRID_UNIT);
    gl.uniform1i(loc.list, CLUSTER_LIST_UNIT);
    gl.uniform4fv(loc.rect, this._clusterRect);
    gl.uniform2fv(loc.z, this._clusterZ);
    gl.uniform4fv(loc.fwd, this._camFwd);
    gl.uniform1i(loc.on, on ? 1 : 0);
  }
  _syncAir() {
    const want = this._airWanted && !!this._lane?.air && !!this._shadows;
    if (want) {
      // The air pass imports neither the lane nor shadowPass.js, so the glow curve and shadow block are passed in.
      this._air = this._airPass ??= new AirPass(this.gl, this._airOpts(this._lane, this.maxPointLights));
      this._air.volOn = this._volumetricsWanted !== false;
      this._air.hazeOn = this._hazeWanted !== false;
    }
    else { if (this._air) { this._air.release(); this._frameFbo = null; } this._air = null; }
    this._frameStamp++;
  }
  get adaptTexture() { return this._air?.adaptTexture ?? null; }
  get air() { return this._air; }

  setExposure(v) { this._exposure = v > 0 ? v : 1; this._frameStamp++; }

  _c3(src, scratch = this._decA) {
    return this._lane ? this._lane.decode3(src, scratch) : src;
  }

  _uploadEl(key) {
    const lane = this._lane;
    if (!lane) return;
    const gl = this.gl, [expLoc, scLoc] = this._el[key];
    gl.uniform1f(expLoc, this._exposure);
    gl.uniform1f(scLoc, this._airGlows() ? 0 : this._scatterGain());
    if (this._shadows) this._shadows.upload(this._el[key].shadow);
    this._uploadAdapt(this._el[key].ao);
    // World-frame draws only: a sprite pass, bake, or panel is another view and would read the wrong depth.
    if (this._air) this._air.uploadContact(this._el[key].contact, this._contactWanted !== false && this._spriteDepth === 0 && this._studioDepth === 0 && !this._panelSaved);
    else this._uploadNoContact(this._el[key].contact);
    this._uploadClusters(this._el[key].cluster, this._clustersLive && this._spriteDepth === 0 && this._studioDepth === 0 && !this._panelSaved);
  }
  _uploadNoContact(loc) {
    if (!loc?.prevDepth) return;
    const gl = this.gl;
    this._activeTexture(gl.TEXTURE0 + CONTACT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this._adaptOne());
    this._activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.prevDepth, CONTACT_UNIT);
    gl.uniform4fv(loc.contactParams, ZERO_CONTACT);
  }

  // Every lane shader samples uAdapt, so a 1x1 image holding 1 stays bound with the air off and for UI bakes.
  _uploadAdapt(loc) {
    if (!loc?.adapt) return;
    const gl = this.gl;
    const tex = this._air && this._studioDepth === 0 ? this._air.adaptTexture : this._adaptOne();
    this._activeTexture(gl.TEXTURE0 + ADAPT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.adapt, ADAPT_UNIT);
  }
  _adaptOne() {
    if (this._adaptOneTex) return this._adaptOneTex;
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._tex0Bound = null;
    // 128 is the log encoding's midpoint: a multiplier of 1.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this._tex0Bound = null;
    return (this._adaptOneTex = tex);
  }

  // A non-world beginFrame resolves the owed world frame first and keeps the world's records for its next frame.
  _beginLane(proj, view, lightDir, world) {
    // The owed frame resolves first, under its own clock and counters, before this frame resets them.
    if (this._retroOwed && !this._panelSaved) this._compositeAir();
    if (this._perfOpen && !this._air?.pending) this._perfClose();
    if (this._air?.pending && !this._panelSaved) this._compositeAir();
    this._deckOwed = null;
    const retro = world && !this._panelSaved ? this._retroBegin() : null;
    if (world && this._perf) { this._perf.begin(); this._perf.mark('shadow'); this.stats.draws = 0; this._perfOpen = true; }
    if (this._shadows && world) this._renderPasses(proj, view, lightDir);
    this._frameFbo = this._air && !this._panelSaved ? this._air.beginFrameTarget(retro ? retro.width : this.canvas.width, retro ? retro.height : this.canvas.height, retro ? 'retro' : 'canvas') : null;
    if (retro && this._air) { this._air.resolveTo = this._retro.resolveTarget(retro.width, retro.height, this._frameFbo); retro.depth = this._air.frame?.depth ?? null; }
    else if (retro) this._frameFbo = this._retro.beginFrameTarget(retro.width, retro.height);
    else if (this._air) this._air.resolveTo = null;
    this._retroOwed = !!retro;
  }

  _retroBegin() {
    const cfg = this._retroSource?.() ?? null;
    this._applyRetroMips(cfg ? cfg.mipmaps : true);
    const view = this._worldViewportFrame, docked = !!view && view.y > 0;
    const scaled = cfg ? null : this._scaledImage();
    const width = scaled ? scaled.width : docked ? cfg?.hudWidth : cfg?.width, height = scaled ? scaled.height : docked ? cfg?.hudHeight : cfg?.height;
    if (!(cfg || scaled) || !(width > 0) || !(height > 0)) {
      if (this._retroFrame) this._restoreWorldViewport();
      if (this._retroFrame) this._dropWorldImage();
      this._retroFrame = null;
      this._retro?.dropLut();
      return null;
    }
    this._retroPass();
    if (scaled) { this._retro.dropLut(); this._retroFrame = { kind: 'scale', scale: scaled.scale, width, height, post: 0, lutShift: 0, mipmaps: true, view: view ? { ...view } : null, depth: null }; }
    else this._retroFrame = { kind: 'retro', width, height, post: cfg.post, lutShift: cfg.lutShift, mipmaps: cfg.mipmaps, view: view ? { ...view } : null, depth: null };
    this._worldViewportPx = [0, 0, width, height];
    this._restoreWorldViewport();
    return this._retroFrame;
  }

  _scaledImage() {
    const scale = this._scaleOn();
    if (scale === null) return null;
    const p = this._worldViewportPx ?? [0, 0, this.canvas.width, this.canvas.height];
    if (!(p[2] > 0 && p[3] > 0)) return null;
    return { scale, width: Math.max(1, Math.round(p[2] * scale)), height: Math.max(1, Math.round(p[3] * scale)) };
  }

  _scaleOn() {
    const scale = Number(this._scaleSource?.() ?? 1);
    return scale > 0 && scale < 1 ? scale : null;
  }

  // Frees through _airPass, the cached pass, because _air is null while the lane or the air is off.
  _dropWorldImage() {
    this._retro?.dropTarget();
    this._airPass?.dropFrame('retro');
  }

  _retroPass() { return (this._retro ??= new RetroPass(this.gl, { build: (vs, fs) => this._buildProgram(vs, fs) })); }

  _viewportPx(r) {
    const W = this.canvas.width, H = this.canvas.height;
    return r
      ? [Math.round(r.x * W), Math.round(r.y * H), Math.max(0, Math.round(r.w * W)), Math.max(0, Math.round(r.h * H))]
      : null;
  }

  // The present binds units 0 to 2, a program, and a VAO, so the shadows are forgotten after it.
  _presentRetroFrame() {
    if (this._perfOpen) this._perf?.mark('retro');
    this._retroOwed = false;
    this._close2D();
    const f = this._retroFrame;
    try {
      if (this._retro && f) {
        this._retro.present({
          depth: f.depth, rect: this._viewportPx(f.view) ?? [0, 0, this.canvas.width, this.canvas.height], canvasW: this.canvas.width, canvasH: this.canvas.height,
          post: f.post, lutShift: f.lutShift, clear: this._clearColor, scissor: this._scissor,
          smooth: f.kind === 'scale',
        });
      } else this._retro?.release();
    } finally {
      this._forgetTextureShadows();
      this._frameFbo = null;
      this._lastProgram = null; this._lastVao = null;
    }
  }

  _applyRetroMips(want) {
    if (want === this._retroMips) return;
    this._retroMips = want;
    // 1000 is GL's default TEXTURE_MAX_LEVEL.
    const gl = this.gl, level = want ? 1000 : 0;
    this._activeTexture(gl.TEXTURE0);
    for (const tex of [...this.textures.values(), ...this.emissionTextures.values(), ...(this.lptAtlases ?? [])]) { if (this._replacements.has(tex)) continue; gl.bindTexture(gl.TEXTURE_2D, tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, level); }
    gl.bindTexture(gl.TEXTURE_2D, null);
    this._tex0Bound = null;
    for (const tex of this.tileArrays.values()) { gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, level); }
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    this._tArrayTex = null;
  }

  setRetroSource(fn) { this._retroSource = typeof fn === 'function' ? fn : null; }
  setRenderScaleSource(fn) { this._scaleSource = typeof fn === 'function' ? fn : null; }
  get frameInfo() {
    const f = this._retroFrame, c = this.canvas, p = this._worldViewportFrame ? this._viewportPx(this._worldViewportFrame) : null;
    return {
      gpu: this.gpuName,
      world: f ? [f.width, f.height] : p ? [p[2], p[3]] : [c.width, c.height],
      canvas: [c.width, c.height],
      dpr: Number(globalThis.devicePixelRatio) || 1,
      scale: f?.kind === 'scale' ? f.scale : 1,
      retro: f?.kind === 'retro',
    };
  }
  get retroFrame() { return this._retroFrame ? { ...this._retroFrame } : null; }
  get retroImageSpan() {
    const f = this._retroFrame;
    return this._retroOwed && f ? [f.height, Math.max(1, Math.round((f.view ? f.view.h : 1) * this.canvas.height))] : null;
  }
  get worldImageSize() {
    const f = this._retroOwed ? this._retroFrame : null, p = this._worldViewportPx;
    return f ? [f.width, f.height] : p ? [p[2], p[3]] : [this.canvas.width, this.canvas.height];
  }
  get retro() { return this._retro; }
  get worldProjAspect() { const p = this._proj; return p && p[0] ? Math.abs(p[5] / p[0]) : null; }

  _renderPasses(proj, view, lightDir) {
    const sp = this._shadows;
    const v = view;
    this._camPos[0] = -(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]);
    this._camPos[1] = -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]);
    this._camPos[2] = -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14]);
    const bindVao = this._bindVaoFn;
    // On the first frame through a door the replayed records are the other side's, so that frame drops them.
    const everyLight = this._everyLightNow;
    const cut = this._everyLightNow !== this._everyLightPrev;
    if (cut) sp.discard();
    if (this._everyLightNow !== this._everyLightPrev) { this._air?.invalidatePrev(); } this._everyLightPrev = this._everyLightNow; this._everyLightNow = false;
    sp.render({
      eye: this._shadowEye(), lightDir, sunScale: this._sunScale, pointLights: this._pointLights, carried: this._pointCarried,
      ids: this._pointIds,
      cascadeScale: this._focus[3] > 0.5 && this._focusWide ? SHADOW_VIEW_SCALE : 1,
      textures: this.textures, isSpectral: isSpectralArchive, bindVao, everyLight, cut,
      holdSkin: this._holdSkinFn,
    });
    if (this._air) {
      const count = this._pointLights.length / 4;
      this._air.prepare({
        proj, view, lightDir, eye: this._camPos, sunScale: this._sunScale, sunColor: this._sunColor,
        pointLights: this._pointLights, pointColors: count > 0 ? this._pointColorData(count) : null, carried: this._pointCarried,
        viewport: this._worldViewportPx ?? [0, 0, this.canvas.width, this.canvas.height],
        shadows: sp, textures: this.textures, emissionTextures: this.emissionTextures, blackTex: this._blackTex,
        windowEmission: this._windowEmission, isSpectral: isSpectralArchive, bindVao, clearColor: this._clearColor,
        windowRooms: !!this._rw?.rooms,
        scatter: this._scatterGain(), exposure: this._exposure,
        haze: this._lane ? this._lane.scatterDensity(this._fogMode, this._fogDensity, this._fogRange[0], this._fogRange[1]) : 0,
      });
    }
    this.stats.shadowDraws = (sp.stats.sunDraws | 0) + (sp.stats.pointDraws | 0);
    this._perf?.mark('world');
    sp.discard();
    this._restoreWorldViewport();
    // markForeignPass unbinds the last replayed VAO for real; nulling only the shadow would leave it bound.
    this.markForeignPass();
  }

  resolveFrame() { this._compositeAir(); }
  setSceneGrade(g) { this._sceneGrade = g ?? null; }

  snapshotAoDepth() {
    if (!this._air || !this._frameFbo) return false;
    const took = this._air.snapshotAoDepth();
    this._forgetUnitShadows();
    return took;
  }
  // Air pass snapshots allocate on the active unit behind the bind shadows, so the shadows are dropped after.
  _forgetUnitShadows() { this._tex0Bound = null; this._tex1Bound = null; }

  _compositeAir() {
    if (this._retroOwed && !this._air?.pending) this._presentRetroFrame();
    if (this._perfOpen && !this._air?.pending) this._perfClose();
    if (!this._air?.pending) return;
    // Close the 2D run only after the early return, because drawScreenQuad calls this at the head of every quad.
    this._close2D();
    this._underWater = undefined;
    this._air.setGrade?.(this._sceneGrade); this._sceneGrade = null;
    const sc = this._scissor;
    if (sc) this.gl.disable(this.gl.SCISSOR_TEST);
    this._air.meter = this._perfOpen ? this._perf : null;
    if (this._perfOpen) this._perf?.mark('air');
    // The host sets the frame's deck after beginFrame, so the shafts read it here.
    this._air.setCloudShadow(this._cloudShadow ?? this._deckOwed);
    this._air.composite();
    // The composite binds units 0 to 4 and leaves its own unit active, so the texture shadows are forgotten after it.
    this._forgetTextureShadows();
    if (this._retroOwed) this._presentRetroFrame();
    this._perfClose();
    if (sc) { this.gl.enable(this.gl.SCISSOR_TEST); this.gl.scissor(sc[0], sc[1], sc[2], sc[3]); }
    this._frameFbo = null;
    this._lastProgram = null; this._lastVao = null;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  _perfClose() {
    if (!this._perfOpen) return;
    this._perfOpen = false;
    this._perf.end();
    this._perf.stop();
    const line = this._perf.frame({ draws: this.stats.draws, shadows: this._shadows ? { ...this._shadows.stats, casters: this._shadows.casters } : null, air: this._air ? { ...this._air.stats } : null });
    if (line) console.info(line);
  }

  get _casting() { return !!this._shadows && !this._panelSaved; }

  get shadows() { return this._shadows; }

  // Every method here that issues a gl.draw* is a 2D primitive or calls _close2D() first, as is every seam where
  // foreign GL can run.
  _open2D(vao) {
    if (!this._2dVao) {
      const gl = this.gl;
      // The run keeps an Error from where it opened, so the warning names the draw that opened it.
      if (!this._warned2dForeign) this._2dOpenedBy = new Error('PERF-2D: the 2D run opened here');
      gl.disable(gl.DEPTH_TEST);
      // CULL_FACE must be off here: with frontFace(CW), culling drops every screen quad.
      gl.disable(gl.CULL_FACE);
    }
    this._bindVao(vao);
    this._2dVao = vao;
  }

  endUiRun() { this._close2D(); }

  // Every seam where something else may touch GL calls this; a stale texture shadow draws the wrong texture.
  _forgetTextureShadows() {
    this._tex1Bound = null;
    this._tex0Bound = null; this._activeUnit = null;
    this._sq = {};
    this._tArrayTex = null;
    this._tTileSize = null;
    (this._tEcoTex ??= [null, null, null]).fill(null);
    this._tEcoOn = null;
    this._tSnowOn = null; this._tSnowArr = [-1, -1, -1, -1];
    // The frame blocks bind lane images on units 8 to 14 and trust them until the stamp moves, so forget them too.
    this._frameStamp++;
  }

  _close2D() {
    if (!this._2dVao) return;
    const gl = this.gl;
    this._bindVao(null);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    this._2dVao = null;
  }

  _buildProgram(vsSrc, fsSrc) { return buildProgram(this.gl, vsSrc, fsSrc); }

  warmSteps() {
    return [
      () => this._ensureScreenQuadProgram(),
      () => this._ensureScreenQuadRunProgram(),
      () => this._ensureCharQuadProgram(),
      () => this._ensureParticleProgram(),
      () => this._ensureOverlayProgram(),
      ...(this._retroSource || this._scaleSource ? [() => this._warmRetro()] : []),
    ];
  }

  _loadFoeTelegraph() {
    this._foeTelegraphLoad ??= import('./foeTelegraph.js').then((m) => { this._foeTelegraph ??= new m.FoeTelegraphPass(this.gl); }).catch((e) => console.warn('[tact] the ground pass failed to load:', e?.message ?? e));
    return this._foeTelegraphLoad;
  }

  lazyWarmSteps() {
    return [
      () => { if (parallelCompile(this.gl)) { void import('./playPrograms.js').then((m) => m.startPlayPrograms(this.gl)).catch(() => {}); this.startTerrainSnow(); } },
      () => { this._loadFoeTelegraph(); },
      () => { this._rwBg ??= this._rwBgProgram(); },
      () => this._ensureWeaponGlowMeshProgram(),
      () => this._ensureWeaponGlowQuadProgram(),
    ];
  }

  _warmRetro() {
    if (!this._retroSource?.() && this._scaleOn() === null) return;
    this._retroPass()._program();
    this._lastProgram = null; this._lastVao = null;
  }

  createCharacterMesh(packed, opts = {}) {
    const gl = this.gl;
    const uv = !!opts.uv;
    const emissive = uv && opts.emissive !== false;
    const floats = uv ? (emissive ? 14 : 11) : 9;
    const vao = gl.createVertexArray();
    this._bindVao(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, packed, gl.STATIC_DRAW);
    const stride = floats * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    if (uv) {
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    }
    if (emissive) {
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 44);
    }
    this._bindVao(null);
    return { vao, count: packed.length / floats, buffers: [vbo], vbo, floats, bounds: opts.bounds === false ? null : boundsOf(packed, null, 0, -1, floats) };
  }

  createSkinnedCharacterMesh(stream, { floats, pairs, width, height }) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    this._bindVao(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, stream, gl.STATIC_DRAW);
    const stride = floats * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 36);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 44);
    gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.FLOAT, false, stride, 56);
    gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, stride, 72);
    if (pairs > 1) {
      gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 4, gl.FLOAT, false, stride, 88);
      gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 4, gl.FLOAT, false, stride, 104);
    }
    gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 1, gl.FLOAT, false, stride, (floats - 1) * 4);
    this._bindVao(null);
    return { vao, count: stream.length / floats, buffers: [vbo], vbo, floats, bounds: null,
      skin: this.createSkinPalette({ pairs, width, height }) };
  }

  // Each mesh gets its own palette, since a sprite batch draws at the flush and a shared palette shows the last pose.
  createSkinPalette({ pairs, width, height }) {
    const gl = this.gl;
    const tex = gl.createTexture();
    this._activeTexture(gl.TEXTURE0 + SKIN_PALETTE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this._skinUnitHolds = tex;
    this._activeTexture(gl.TEXTURE0);
    return { tex, pairs, width, height };
  }

  updateSkinStream(mesh, offset, data) {
    const gl = this.gl;
    if (!mesh || !mesh.skin || !mesh.vbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, offset * 4, data);
    mesh._poseGen = (mesh._poseGen ?? 0) + 1;
  }

  updateSkinPalette(mesh, data) {
    const gl = this.gl;
    const skin = mesh && mesh.skin;
    if (!skin) return;
    this._activeTexture(gl.TEXTURE0 + SKIN_PALETTE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, skin.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, skin.width, skin.height, gl.RGBA, gl.FLOAT, data);
    this._skinUnitHolds = skin.tex;
    this._activeTexture(gl.TEXTURE0);
    mesh._poseGen = (mesh._poseGen ?? 0) + 1;
  }

  // Puts the identity palette back on the unit first, so no later draw reads a deleted texture.
  releaseCharacterSkin(mesh) {
    const skin = mesh && mesh.skin;
    if (!skin || !skin.tex) return;
    const gl = this.gl;
    if (this._skinUnitHolds === skin.tex) {
      this._activeTexture(gl.TEXTURE0 + SKIN_PALETTE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this._skinIdentityTex());
      this._skinUnitHolds = this._skinIdentity;
      this._activeTexture(gl.TEXTURE0);
    }
    gl.deleteTexture(skin.tex);
    skin.tex = null;
  }

  _skinIdentityTex() {
    if (this._skinIdentity) return this._skinIdentity;
    const gl = this.gl;
    const tex = gl.createTexture();
    this._activeTexture(gl.TEXTURE0 + SKIN_PALETTE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 3, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this._skinIdentity = tex;
    this._skinUnitHolds = tex;
    return tex;
  }

  createCharacterTexture(mips, { wrapS = 0x812f, wrapT = 0x812f } = {}) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._tex0Bound = null;
    for (let i = 0; i < mips.length; i++) {
      const m = mips[i];
      gl.texImage2D(gl.TEXTURE_2D, i, gl.RGBA, m.width, m.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, m.rgba);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, mips.length - 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER,
      mips.length > 1 ? gl.NEAREST_MIPMAP_LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this._tex0Bound = null;
    return tex;
  }

  createParticleEffect(capacity, state = {}) {
    const gl = this.gl;
    const floats = 12;
    const vao = gl.createVertexArray();
    this._bindVao(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, Math.max(1, capacity) * 6 * floats * 4, gl.DYNAMIC_DRAW);
    const stride = floats * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 28);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 44);
    this._bindVao(null);
    return {
      vao, vbo, capacity: Math.max(1, capacity), count: 0, floats, hidden: false,
      tex: null,
      blend: !!state.blend, srcBlend: state.srcBlend ?? 6, dstBlend: state.dstBlend ?? 7,
      alphaCut: state.alphaCut ?? 0, depthTest: state.depthTest !== false, depthWrite: state.depthWrite !== false,
    };
  }

  // `count` is in vertices.
  updateParticleEffect(effect, packed, count) {
    const gl = this.gl;
    const cap = effect.capacity * 6;
    effect.count = Math.min(count, cap);
    if (!effect.count) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, effect.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, packed.subarray ? packed.subarray(0, effect.count * effect.floats) : packed);
  }

  releaseCharacterTexture(tex) {
    if (!tex) return;
    if (this._tex0Bound === tex) this._tex0Bound = null;
    this.gl.deleteTexture(tex);
  }

  drawWorldParticleEffects(list) {
    if (!list || !list.length) return;
    const gl = this.gl;
    gl.disable(gl.CULL_FACE);
    this._drawParticleEffects({ effects: list }, WORLD_IDENTITY);
    gl.enable(gl.CULL_FACE);
  }

  releaseParticleEffect(effect) {
    const gl = this.gl;
    if (!effect) return;
    if (effect.vao) gl.deleteVertexArray(effect.vao);
    if (effect.vbo) gl.deleteBuffer(effect.vbo);
    if (effect.tex) gl.deleteTexture(effect.tex);
    effect.vao = null; effect.vbo = null; effect.tex = null; effect.count = 0;
  }

  _drawParticleEffects(mesh, modelMatrix) {
    this._close2D();
    const gl = this.gl;
    const list = mesh.effects;
    if (!list || !list.length) return;
    this._ensureParticleProgram();
    let any = false;
    for (const e of list) {
      if (!e || e.hidden || !e.count) continue;
      if (!any) {
        any = true;
        this._use(this.particleProgram);
        const u = this._particle;
        gl.uniformMatrix4fv(u.proj, false, this._proj);
        gl.uniformMatrix4fv(u.view, false, this._view);
        gl.uniformMatrix4fv(u.model, false, modelMatrix);
        this._activeTexture(gl.TEXTURE0);
        gl.uniform1i(u.tex, 0);
        gl.depthMask(false);
      }
      const u = this._particle;
      gl.uniform1f(u.useTex, e.tex ? 1 : 0);
      gl.uniform1f(u.alphaCut, e.alphaCut || 0);
      gl.bindTexture(gl.TEXTURE_2D, e.tex || this._blackTex);
      this._tex0Bound = null;
      if (e.blend) { gl.enable(gl.BLEND); gl.blendFunc(gl[nifBlendMode(e.srcBlend)], gl[nifBlendMode(e.dstBlend)]); }
      else gl.disable(gl.BLEND);
      if (e.depthTest) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
      if (e.depthWrite) gl.depthMask(true); else gl.depthMask(false);
      this._bindVao(e.vao);
      gl.drawArrays(gl.TRIANGLES, 0, e.count);
      this.stats.draws++;
    }
    if (any) {
      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this._tex0Bound = null;
      this._bindVao(null);
      this._use(this.charProgram);
    }
  }

  _ensureParticleProgram() {
    const gl = this.gl;
    if (!this.particleProgram) {
      this.particleProgram = this._buildProgram(PARTICLE_VS, PARTICLE_FS);
      const pp = this.particleProgram;
      this._particle = {
        proj: gl.getUniformLocation(pp, 'uProj'), view: gl.getUniformLocation(pp, 'uView'), model: gl.getUniformLocation(pp, 'uModel'),
        tex: gl.getUniformLocation(pp, 'uTex'), useTex: gl.getUniformLocation(pp, 'uUseTex'), alphaCut: gl.getUniformLocation(pp, 'uAlphaCut'),
      };
    }
  }

  // bufferSubData writes in place, so packed must keep the layout and length the mesh was created with.
  updateCharacterMesh(mesh, packed) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, packed);
    mesh._poseGen = (mesh._poseGen ?? 0) + 1;
    if (mesh.bounds) boundsOf(packed, null, 0, -1, mesh.floats).forEach((v, i) => { mesh.bounds[i] = v; });
  }

  // Rig faces have inconsistent winding, so culling is off for the draw and restored after.
  drawCharacter(mesh, modelMatrix) {
    this._close2D();
    const gl = this.gl;
    const c = this._char;
    if (this._casting && this._spriteDepth === 0 && this._studioDepth === 0) this._shadows.recordCharacter(mesh, modelMatrix);
    this._use(this.charProgram);
    this._uploadCloudShadow('char');
    gl.uniformMatrix4fv(c.model, false, modelMatrix);
    // The frame block uploads once per stamp; a sprite pass forgets it on the way in and out.
    if (this._cFrameStamp !== this._frameStamp) {
      this._cFrameStamp = this._frameStamp;
      gl.uniformMatrix4fv(c.proj, false, this._proj);
      gl.uniformMatrix4fv(c.view, false, this._view);
      gl.uniform3fv(c.lightDir, this._lightDir);
      gl.uniform3fv(c.ambient, this._c3(this._ambient));
      gl.uniform1f(c.sunScale, this._sunScale);
      gl.uniform3fv(c.sunColor, this._c3(this._sunColor));
      gl.uniform3fv(c.moonDir, this._moonDir);
      gl.uniform1f(c.moonScale, this._moonScale);
      gl.uniform3fv(c.moonColor, this._c3(this._moonColor));
      const count = this._pointLights.length / 4;
      gl.uniform1i(c.pointCount, count);
      if (count > 0) gl.uniform4fv(c.pointLights, this._pointLights);
      if (count > 0) gl.uniform3fv(c.pointColors, this._pointColorData(count));
      gl.uniform4fv(c.indirect, this._indirect);
      gl.uniform3fv(c.indirectColor, this._c3(this._indirectColor));
      this._uploadFog(this._charFog);
      this._uploadEl('char');
    }
    gl.disable(gl.CULL_FACE);
    this._bindVao(mesh.vao);
    // A sampler counts as used even when its branch does not run, so the palette unit always holds a complete texture.
    const skin = mesh.skin || null;
    if (skin) {
      gl.uniform1f(c.skin, skin.pairs);
      this._activeTexture(gl.TEXTURE0 + SKIN_PALETTE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, skin.tex);
      this._skinUnitHolds = skin.tex;
      this.stats.texBinds++;
      gl.uniformMatrix3fv(c.skinNrm, false, skinNormalMatrix(modelMatrix, this._skinNrm));
    } else if (this._skinUnitHolds !== this._skinIdentity) {
      this._activeTexture(gl.TEXTURE0 + SKIN_PALETTE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this._skinIdentityTex());
      this._skinUnitHolds = this._skinIdentity;
    }
    // Unit 0 must always hold a complete texture; with nothing bound the driver silently drops the draw.
    this._activeTexture(gl.TEXTURE0);
    gl.uniform1i(c.tex, 0);
    const glow = !!(mesh.weaponGlow || mesh.offWeaponGlow) && this._spriteDepth > 0 && this._studioDepth === 0 && this._glowVpH > 0 && !!mesh.ranges;
    if (glow) this._drawWeaponGlows(mesh, modelMatrix, skin, false);
    if (mesh.ranges && mesh.ranges.length) {
      for (const r of mesh.ranges) {
        if (r.hidden) continue;
        if (skin) gl.uniform1f(c.skinFlip, r.piece && r.piece.mirrored ? -1 : 1);
        gl.uniform1f(c.useTex, r.tex ? 1 : 0);
        gl.uniform1f(c.alphaCut, r.alphaCut || 0);
        gl.bindTexture(gl.TEXTURE_2D, r.tex || this._blackTex);
        this._tex0Bound = null;
        gl.drawArrays(gl.TRIANGLES, r.first, r.count);
        this.stats.texBinds++; this.stats.draws++;
      }
    } else {
      gl.uniform1f(c.useTex, 0);
      gl.uniform1f(c.alphaCut, 0);
      gl.bindTexture(gl.TEXTURE_2D, this._blackTex);
      this._tex0Bound = null;
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      this.stats.texBinds++; this.stats.draws++;
    }
    if (glow) this._drawWeaponGlows(mesh, modelMatrix, skin, true);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this._tex0Bound = null;
    gl.uniform1f(c.useTex, 0);
    gl.uniform1f(c.alphaCut, 0);
    if (skin) {
      gl.uniform1f(c.skin, 0);
      this._activeTexture(gl.TEXTURE0 + SKIN_PALETTE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this._skinIdentityTex());
      this._skinUnitHolds = this._skinIdentity;
    }
    this._activeTexture(gl.TEXTURE0);
    this._bindVao(null);
    if (mesh.effects && mesh.effects.length) this._drawParticleEffects(mesh, modelMatrix);
    gl.enable(gl.CULL_FACE);
  }

  // Hands back charProgram and drawCharacter's state: blend off, depth LESS and written, and every color channel.
  _drawWeaponGlow(mesh, modelMatrix, skin, charge, slot = 'weapon', g = mesh.weaponGlow) {
    this._close2D();
    if (!g) return;
    let any = false;
    for (const r of mesh.ranges) if (r.slot === slot && !r.hidden) { any = true; break; }
    if (!any || !g.ramp || !(g.code > 0)) return;
    const gl = this.gl;
    this._ensureWeaponGlowMeshProgram();
    this._use(this.weaponGlowMeshProgram);
    const u = this._wgm;
    gl.uniformMatrix4fv(u.proj, false, this._proj);
    gl.uniformMatrix4fv(u.view, false, this._view);
    gl.uniformMatrix4fv(u.model, false, modelMatrix);
    gl.uniform1f(u.skin, skin ? skin.pairs : 0);
    gl.uniform1i(u.look, g.code);
    gl.uniform1f(u.level, g.level);
    gl.uniform1f(u.time, glowSeconds());
    gl.uniform3fv(u.ramp, g.ramp);
    const unit = mesh.glowUnit > 0 ? mesh.glowUnit : glowUnit(this._glowVpH);
    gl.uniform1f(u.unit, unit);
    gl.uniform2f(u.origin, this._glowOx || 0, this._glowOy || 0);
    this._tex0Bound = null;
    let n = 1;
    if (!charge) {
      const draws = glowDrawsFor(g.look);
      const sx = (2 * unit) / this._glowVpW, sy = (2 * unit) / this._glowVpH;
      if (!this._glowDrawRows) this._glowDrawRows = new Float32Array(GLOW_DRAWS_MAX * 4);
      const rows = this._glowDrawRows;
      n = Math.min(draws.length, GLOW_DRAWS_MAX);
      for (let i = 0; i < n; i++) {
        const d = draws[i];
        rows[i * 4] = d.shift[0] * sx; rows[i * 4 + 1] = d.shift[1] * sy; rows[i * 4 + 2] = d.far; rows[i * 4 + 3] = d.ring;
      }
      gl.uniform4fv(u.draws, rows, 0, n * 4);
      gl.uniform1i(u.instanced, 1);
      gl.uniform1f(u.pull, 0);
      gl.uniform1f(u.mode, 0);
    } else {
      gl.uniform1i(u.instanced, 0);
      gl.uniform1f(u.pull, GLOW_CHARGE_PULL);
      gl.uniform1f(u.mode, 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.colorMask(true, true, true, false);
      gl.depthMask(false);
      gl.depthFunc(gl.LEQUAL);
    }
    for (const r of mesh.ranges) {
      if (r.slot !== slot || r.hidden) continue;
      gl.uniform1f(u.useTex, r.tex ? 1 : 0);
      gl.uniform1f(u.alphaCut, r.alphaCut || 0);
      gl.bindTexture(gl.TEXTURE_2D, r.tex || this._blackTex);
      this._tex0Bound = null;
      if (charge) { gl.drawArrays(gl.TRIANGLES, r.first, r.count); this.stats.draws++; }
      else { gl.drawArraysInstanced(gl.TRIANGLES, r.first, r.count, n); this.stats.draws++; }
    }
    if (charge) {
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.colorMask(true, true, true, true);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.BLEND);
    }
    this._use(this.charProgram);
  }

  _drawWeaponGlows(mesh, modelMatrix, skin, charge) {
    if (mesh.weaponGlow) this._drawWeaponGlow(mesh, modelMatrix, skin, charge, 'weapon', mesh.weaponGlow);
    if (mesh.offWeaponGlow) this._drawWeaponGlow(mesh, modelMatrix, skin, charge, 'offweapon', mesh.offWeaponGlow);
  }

  _ensureWeaponGlowMeshProgram() {
    if (this.weaponGlowMeshProgram) return;
    const gl = this.gl;
    const p = this._buildProgram(glowMeshVs(CHAR_SKIN_VS), GLOW_MESH_FS);
    const at = (n) => gl.getUniformLocation(p, n);
    this._wgm = {
      proj: at('uProj'), view: at('uView'), model: at('uModel'), skin: at('uSkin'), draws: at('uGlowDraw'), instanced: at('uGlowInstanced'),
      pull: at('uGlowPull'), useTex: at('uUseTex'), alphaCut: at('uAlphaCut'), look: at('uLook'), level: at('uLevel'), time: at('uTime'),
      ramp: at('uRamp'), mode: at('uMode'), unit: at('uUnit'), origin: at('uGlowOrigin'),
    };
    this._use(p);
    gl.uniform1i(at('uTex'), 0);
    gl.uniform1i(at('uSkinPalette'), SKIN_PALETTE_UNIT);
    this.weaponGlowMeshProgram = p;
  }

  _charSpriteRT() {
    const gl = this.gl;
    let cs = this._csRT;
    if (!cs) {
      const S = this._csEdge;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      this._tex0Bound = null;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // A 24-bit depth texture: the composite reads it back, and 16 bits would sink a cropped body's feet.
      const depth = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, depth);
      this._tex0Bound = null;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, S, S, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameFbo ?? null);
      cs = this._csRT = { fbo, tex, depth };
    }
    // The depth texture must leave unit 1 before the target is drawn into, or WebGL refuses the feedback loop.
    if (this._depthOnUnit1) { this._activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); this._activeTexture(gl.TEXTURE0); this._tex1Bound = null; this._depthOnUnit1 = false; }
    return cs;
  }

  get charSpriteEdge() { return this._csEdge; }

  charSpriteRoom(n) {
    if (!(n > this._csEdge)) return this._csEdge;
    const gl = this.gl;
    if (!this._csMost) this._csMost = Math.min(CHAR_SPRITE_RT_MAX, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || CHAR_SPRITE_RT_SIZE);
    const edge = Math.min(this._csMost, Math.ceil(n / 256) * 256);
    if (edge > this._csEdge) {
      this._csEdge = edge;
      const cs = this._csRT;
      this._csRT = null;
      if (cs) { gl.deleteFramebuffer(cs.fbo); gl.deleteTexture(cs.tex); gl.deleteTexture(cs.depth); }
    }
    return this._csEdge;
  }

  renderCharacterSprite(mesh, modelMatrix, proj, view, pw, ph, { lensLocal = false, viewmodelLight = null, also = null } = {}) {
    const gl = this.gl;
    const vmSaved = viewmodelLight ? {
      lightDir: this._lightDir, ambient: this._ambient, sunScale: this._sunScale,
      sunColor: this._sunColor, pointLights: this._pointLights, indirect: this._indirect,
      moonScale: this._moonScale,
    } : null;
    if (viewmodelLight) {
      const st = studioLight(view);
      this._lightDir = st.lightDir;
      this._ambient = new Float32Array([
        STUDIO_AMBIENT * viewmodelLight[0], STUDIO_AMBIENT * viewmodelLight[1], STUDIO_AMBIENT * viewmodelLight[2]]);
      this._sunScale = STUDIO_KEY;
      this._sunColor = new Float32Array([viewmodelLight[0], viewmodelLight[1], viewmodelLight[2]]);
      this._pointLights = st.pointLights;
      this._indirect = st.indirect;
      this._moonScale = 0;
    }
    try {
      return this._renderCharacterSprite(mesh, modelMatrix, proj, view, pw, ph, { lensLocal, also });
    } finally {
      if (vmSaved) {
        this._lightDir = vmSaved.lightDir; this._ambient = vmSaved.ambient; this._sunScale = vmSaved.sunScale;
        this._sunColor = vmSaved.sunColor; this._pointLights = vmSaved.pointLights; this._indirect = vmSaved.indirect;
        this._moonScale = vmSaved.moonScale;
      }
    }
  }

  _renderCharacterSprite(mesh, modelMatrix, proj, view, pw, ph, { lensLocal = false, also = null } = {}) {
    const gl = this.gl;
    const cs = this._charSpriteRT();
    gl.bindFramebuffer(gl.FRAMEBUFFER, cs.fbo);
    gl.viewport(0, 0, this._csEdge, this._csEdge);
    // The clear color is global GL state and beginFrame clears without setting one, so it is borrowed and returned.
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, pw, ph);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, pw, ph);
    // Fog is off here because the composite quad fogs the finished sprite; lens-local passes drop the cloud deck too.
    const sp = this._proj, sv = this._view, sf = this._fogMode;
    const sw = this._dwFog[0];
    const sh = this._haze[4];
    const sd = lensLocal ? this._cloudShadow : null;
    if (sd) { this._cloudShadow = null; this._csStamp++; }
    this._proj = proj; this._view = view; this._fogMode = 0; this._dwFog[0] = 0; this._haze[4] = 0;
    this._spriteDepth++;
    this._cFrameStamp = -1;
    // Every borrow is returned in one finally, because drawCharacter can throw and the icon path swallows the error.
    this._glowVpW = pw; this._glowVpH = ph; this._glowOx = 0; this._glowOy = 0;
    try {
      this.drawCharacter(mesh, modelMatrix);
      if (also) for (const o of also) this.drawCharacter(o.mesh, o.model);
    }
    finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameFbo ?? null);
      // Runs inside the world pass, so it restores the borrowed world viewport rather than the full canvas.
      this._restoreWorldViewport();
      const cc = this._clearColor;
      gl.clearColor(cc[0], cc[1], cc[2], cc[3]);
      this._proj = sp; this._view = sv; this._fogMode = sf; this._dwFog[0] = sw; this._haze[4] = sh;
      this._spriteDepth--;
      this._cFrameStamp = -1;
      if (sd) { this._cloudShadow = sd; this._csStamp++; }
    }
    return cs.tex;
  }

  beginCharacterSpriteBatch() {
    const b = this._spriteBatch;
    // A batch opened inside an open one joins it; the outer flush draws every queued body.
    if (b.open) { b.depth++; return; }
    b.items.length = 0;
    b.open = true;
    b.depth = 0;
  }

  get characterSpriteBatchOpen() { return this._spriteBatch.open; }

  // Refuses a picture whose size is not a finite texel count, since one NaN would misplace every later tile.
  queueCharacterSprite(item) {
    if (!Number.isFinite(item?.pw) || !Number.isFinite(item?.ph)) {
      if (!this._spriteRefusedSaid) { this._spriteRefusedSaid = true; console.warn(`[mw] a body's picture could not be measured (${item?.pw} x ${item?.ph}) - left out of the batch`); }
      return false;
    }
    this._spriteBatch.items.push(item);
    return true;
  }

  flushCharacterSpriteBatch() {
    const b = this._spriteBatch;
    if (!b.open) return 0;
    if (b.depth > 0) { b.depth--; return 0; }
    b.open = false;
    const items = b.items;
    let at = 0, binds = 0;
    try {
      const S = this._csEdge;
      while (at < items.length) {
        const n = packSpriteTiles(items, at, S);
        const tex = this._renderCharacterSpriteTiles(items, at, at + n);
        binds++;
        for (let i = at; i < at + n; i++) {
          const it = items[i], q = it.quad;
          this.drawCharacterSpriteQuad(tex, q.at, q.halfW, q.halfH, q.right, it.pw / S, it.ph / S,
            q.hitFlash, q.conceal, q.up, [it.tx / S, it.ty / S], q.fx, q.depth);
        }
        at += n;
      }
    } finally {
      items.length = 0;
    }
    this.stats.spriteBinds += binds;
    return binds;
  }

  _renderCharacterSpriteTiles(items, from, to) {
    const gl = this.gl;
    const cs = this._charSpriteRT();
    gl.bindFramebuffer(gl.FRAMEBUFFER, cs.fbo);
    gl.enable(gl.SCISSOR_TEST);
    const sp = this._proj, sv = this._view, sf = this._fogMode;
    const sw = this._dwFog[0], sh = this._haze[4];
    this._fogMode = 0; this._dwFog[0] = 0; this._haze[4] = 0;
    this._spriteDepth++;
    try {
      for (let i = from; i < to; i++) {
        const it = items[i];
        gl.viewport(it.tx, it.ty, it.pw, it.ph);
        gl.scissor(it.tx, it.ty, it.pw, it.ph);
        gl.clearBufferfv(gl.COLOR, 0, SPRITE_CLEAR);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        this._proj = it.proj; this._view = it.view;
        this._cFrameStamp = -1;
        this._glowVpW = it.pw; this._glowVpH = it.ph; this._glowOx = it.tx; this._glowOy = it.ty;
        this.drawCharacter(it.mesh, it.model);
        if (it.also) for (const o of it.also) this.drawCharacter(o.mesh, o.model);
      }
    } finally {
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameFbo ?? null);
      this._restoreWorldViewport();
      this._proj = sp; this._view = sv; this._fogMode = sf; this._dwFog[0] = sw; this._haze[4] = sh;
      this._spriteDepth--;
      this._cFrameStamp = -1;
    }
    return cs.tex;
  }

  renderCharacterSpriteImage(mesh, modelMatrix, proj, view, pw, ph, { studio = true } = {}) {
    this._close2D();
    const gl = this.gl;
    const saved = studio ? {
      lightDir: this._lightDir, ambient: this._ambient, sunScale: this._sunScale,
      sunColor: this._sunColor, pointLights: this._pointLights, indirect: this._indirect,
      moonScale: this._moonScale,
      cloudShadow: this._cloudShadow,
    } : null;
    if (studio) {
      if (this._cloudShadow) { this._cloudShadow = null; this._csStamp++; }
      const st = studioLight(view);
      this._lightDir = st.lightDir; this._ambient = st.ambient; this._sunScale = st.sunScale;
      this._sunColor = st.sunColor; this._pointLights = st.pointLights; this._indirect = st.indirect;
      this._moonScale = 0;
    }
    if (studio) this._studioDepth++;
    try {
      this.renderCharacterSprite(mesh, modelMatrix, proj, view, pw, ph);
    } finally {
      if (saved) {
        this._lightDir = saved.lightDir; this._ambient = saved.ambient; this._sunScale = saved.sunScale;
        this._sunColor = saved.sunColor; this._pointLights = saved.pointLights; this._indirect = saved.indirect;
        this._moonScale = saved.moonScale;
        if (saved.cloudShadow) { this._cloudShadow = saved.cloudShadow; this._csStamp++; }
      }
      if (studio) this._studioDepth--;
      if (studio) this._frameStamp++;
    }
    const cs = this._charSpriteRT();
    gl.bindFramebuffer(gl.FRAMEBUFFER, cs.fbo);
    const raw = new Uint8Array(pw * ph * 4);
    try { gl.readPixels(0, 0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, raw); }
    finally { gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameFbo ?? null); }
    const out = new Uint8ClampedArray(pw * ph * 4);
    for (let y = 0; y < ph; y++) out.set(raw.subarray(y * pw * 4, (y + 1) * pw * 4), (ph - 1 - y) * pw * 4);
    return { width: pw, height: ph, data: out };
  }

  drawCharacterSpriteQuad(tex, center, halfW, halfH, right, u1 = 1, v1 = 1, hitFlash = 0, conceal = null, up = null, origin = null, fx = null, depth = null) {
    this._close2D();
    const gl = this.gl;
    this._ensureCharQuadProgram();
    const [cx, cy, cz] = center, [rx, ry, rz] = right;
    const ux = up ? up[0] * halfH : 0, uy = up ? up[1] * halfH : halfH, uz = up ? up[2] * halfH : 0;
    const v = new Float32Array([
      cx - rx*halfW - ux, cy - ry*halfW - uy, cz - rz*halfW - uz, 0, 0,
      cx - rx*halfW + ux, cy - ry*halfW + uy, cz - rz*halfW + uz, 0, v1,
      cx + rx*halfW + ux, cy + ry*halfW + uy, cz + rz*halfW + uz, u1, v1,
      cx + rx*halfW - ux, cy + ry*halfW - uy, cz + rz*halfW - uz, u1, 0,
    ]);
    this._use(this.charQuadProgram);
    const c = this._charQuad;
    gl.uniformMatrix4fv(c.proj, false, this._proj);
    gl.uniformMatrix4fv(c.view, false, this._view);
    this._bindTex0(tex);
    gl.uniform1i(c.tex, 0);
    gl.uniform1f(c.hitFlash, hitFlash > 0 ? hitFlash : 0);
    this._uploadFog(this._charQuad);
    gl.uniform4f(c.conceal, conceal ? conceal.mode : 0, conceal ? conceal.alpha : 0, conceal ? conceal.t : 0, conceal ? conceal.phase : 0);
    gl.uniform2f(c.span, u1, v1);
    gl.uniform2f(c.origin, origin ? origin[0] : 0, origin ? origin[1] : 0);
    const g = fx?.glint, d = fx?.dissolve;
    gl.uniform4f(c.glint, g ? g[0] : 0, g ? g[1] : 0, g ? g[2] : 0, g ? g[3] : 0);
    gl.uniform2f(c.elite, fx?.elite || 0, fx?.time || 0);
    gl.uniform4f(c.dissolve, d ? d[0] : 0, d ? d[1] : 0, d ? d[2] : 0, d ? d[3] : 0);
    const dtex = this._csRT?.depth ?? null;
    if (dtex) { this._bindEmission(dtex); this._depthOnUnit1 = true; }
    gl.uniform1i(c.depthTex, 1);
    const dp = dtex && depth ? depth : null, ray = dp && !dp.window ? dp : null;
    gl.uniform4f(c.depthK, ray ? ray.near : 0, ray ? ray.range : 0, ray ? ray.base : 0, dp ? (dp.window ? 2 : 1) : 0);
    gl.uniform3f(c.depthDir, ray ? ray.dir[0] : 0, ray ? ray.dir[1] : 0, ray ? ray.dir[2] : 0);
    this._bindVao(this._charQuadVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._charQuadVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
    gl.disable(gl.CULL_FACE);
    if (conceal) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    if (conceal) { gl.depthMask(true); gl.disable(gl.BLEND); }
    this.stats.texBinds++; this.stats.draws++;
    gl.enable(gl.CULL_FACE);
    this._bindVao(null);
  }

  _ensureCharQuadProgram() {
    const gl = this.gl;
    if (!this.charQuadProgram) {
      const vs = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uProj, uView;
out vec2 vUV; out vec3 vWorld;
void main() { vUV = aUV; vWorld = aPos; gl_Position = uProj * uView * vec4(aPos, 1.0); }`;
      const fs = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vWorld;
uniform sampler2D uTex;
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
uniform vec4 uConceal;   // INVIS-LOOK: ECV1's record - the mode, the opacity, the clock, the phase (0: plain)
uniform vec2 uSpan;      // INVIS-LOOK: the sub-rect of the RT the picture fills
uniform vec2 uOrigin;    // MWNPC2: where that sub-rect starts - a batched body's tile (0,0 for the corner every lone pass draws in)
uniform float uHitFlash;   // HITFLASH1: a Morrowind body struck
// MWNPC5 (bible/04-Characters/Morrowind-NPCs.md section 10): A FOE'S TELLS ON ITS BODY - the three the billboard shader
// draws on a foe that this quad did not: the wind-up's glint (TELL2), the elite's glow, outline and embers (ELITE FOES),
// and the burn or the portal's gathering (DISSOLVE). The colour terms are the billboards' own (GLINT_GLSL,
// ELITE_GLOW_GLSL); the texel reads - the outline, the embers, the grain - are their twins inside the picture's TILE, so
// a batched body's outline never reads its neighbour's (MWNPC2's tiles stand a texel apart; the box is padded for the
// room the outline and the embers take - characterSprite.js bodyFxPad)
uniform vec4 uGlint;      // TELL2: rgb the blow's colour, a its strength (0 off)
uniform vec2 uElite;      // ELITE FOES: x the glow's pulse (0 off; negative an elite's corpse - the rim alone), y seconds
uniform vec4 uDissolve;   // DISSOLVE: x the share gone (0 whole, 1 gone), yzw the edge's colour
// BODY-DEPTH: the picture's depth (the sprite target's own) and how to read it - x the ortho's near, y its far - near, z
// the quad's own distance along the picture's ray, w 1 when this picture says where its texels stand (0: the quad's depth;
// BODY-CROP: 2, a picture taken through the frame's own lens - its depth is the frame's, x, y and z unread)
uniform sampler2D uDepthTex;
uniform vec4 uDepthK;
uniform vec3 uDepthDir;   // the picture's ray, unit
uniform mat4 uProj, uView;
out vec4 outColor;
${FOG_GLSL}
${HIT_FLASH_GLSL}
${ELITE_GLOW_GLSL}
${GLINT_GLSL}
ivec2 tileLo() { return ivec2(floor(uOrigin * vec2(textureSize(uTex, 0)) + 0.5)); }
ivec2 tileSize() { return ivec2(floor(uSpan * vec2(textureSize(uTex, 0)) + 0.5)); }
// eliteAlphaAt's twin: the base texel's alpha, 0 outside the TILE (not the target)
float tileAlpha(ivec2 p) {
  ivec2 lo = tileLo(), hi = lo + tileSize();
  if (p.x < lo.x || p.y < lo.y || p.x >= hi.x || p.y >= hi.y) return 0.0;
  return texelFetch(uTex, p, 0).a;
}
// BODY-DEPTH: the window depth of a texel whose picture depth is d - the quad's point moved along the picture's ray to
// where the texel stands, as the world's camera sees it; the quad's own where the picture says nothing (or the point is
// behind the eye)
float bodyDepth(float d) {
  if (uDepthK.w < 0.5) return gl_FragCoord.z;
  if (d >= ${GLOW_DEPTH_FLOOR.toFixed(8)}) return gl_FragCoord.z;   // AUDIT WEAPON-GLOW MW-1: a weapon glow's ring stands at the back of its picture - its texel the quad's own, never a reach behind the body
  if (uDepthK.w > 1.5) return d;   // BODY-CROP: the frame's own depth, as the picture took it
  vec4 c = uProj * uView * vec4(vWorld + uDepthDir * (uDepthK.x + d * uDepthK.y - uDepthK.z), 1.0);
  return c.w > 1e-4 ? clamp(c.z / c.w * 0.5 + 0.5, 0.0, 1.0) : gl_FragCoord.z;
}
// eliteRim's twin: a texel within 2 of the silhouette (dx*dx + dy*dy <= 4) - BODY-DEPTH: answered as the nearest such
// silhouette texel's picture depth, so the outline stands where the body does; -1.0 where there is none
float bodyRim(ivec2 p) {
  float best = -1.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      if ((dx == 0 && dy == 0) || dx * dx + dy * dy > 4) continue;
      ivec2 q = p + ivec2(dx, dy);
      if (tileAlpha(q) >= 0.5) { float d = texelFetch(uDepthTex, q, 0).r; best = best < 0.0 ? d : min(best, d); }
    }
  }
  return best;
}
// eliteEmber's twin: its column the tile's own (a column of the picture, wherever the tile stands this frame)
float bodyEmber(ivec2 p, float secs) {
  int col = p.x - tileLo().x;
  float c = float(col);
  float d = -1.0;
  for (int i = 1; i <= 18; i++) {
    int y = p.y - i;
    if (y < tileLo().y) break;
    if (tileAlpha(ivec2(p.x, y)) >= 0.5) { d = float(i); break; }
  }
  if (d < 3.0) return 0.0;
  float speed = 5.0 + 7.0 * eliteHash(vec2(c, 1.7));
  float cyc = secs * speed / ELITE_RISE + eliteHash(vec2(c, 9.1));
  float n = floor(cyc);
  if (eliteHash(vec2(c, n + 3.0)) > 0.3) return 0.0;
  float h = 3.0 + floor(fract(cyc) * ELITE_RISE);
  if (d != h) return 0.0;
  return 1.0 - fract(cyc);
}
// FLAT_DISSOLVE_GLSL's grain, in the tile's own texels (two-texel grains) and its height (v 0 the feet: they go first)
float bodyGrain(ivec2 p, float v) {
  vec2 cell = floor(vec2(p - tileLo()) * 0.5);
  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  return h * 0.72 + v * 0.28;
}
vec4 bodyFogged(vec3 c) { return vec4(dwWaterFog(mix(uFogColor, c, fogFactorAt(vWorld)), vWorld), 1.0); }
// the target texel under the fragment - asked only by a body with a tell, so a plain body reads exactly what it did
ivec2 bodyTexel(vec2 uv) { return ivec2(floor((uOrigin + uv) * vec2(textureSize(uTex, 0)))); }
void main() {
  // INVIS-LOOK: the billboard shader's ripple (BB_FS), measured in the picture's own span of the RT
  vec2 uv = vUV;
  if (uConceal.x == 1.0) {
    vec2 n = vUV / max(uSpan, vec2(1e-6));
    uv.x += sin(n.y * 28.0 + uConceal.z * 7.0 + uConceal.w) * 0.008 * uSpan.x;
    if (uv.x < 0.0 || uv.x > uSpan.x) discard;
  }
  vec4 t = texture(uTex, uOrigin + uv);
  if (t.a < (uConceal.x > 0.0 ? 0.1 : 0.5)) {
    // MWNPC5: the outline and the embers stand where the body does not - never on a concealed body nor one burning away
    if (uConceal.x == 0.0 && uDissolve.x <= 0.0) {
      float rim = uGlint.a > 0.0 || uElite.x != 0.0 ? bodyRim(bodyTexel(uv)) : -1.0;   // BODY-DEPTH: and where it stands
      if (uGlint.a > 0.0 && rim >= 0.0) { gl_FragDepth = bodyDepth(rim); outColor = bodyFogged(glintRimColor(uGlint)); return; }
      if (uElite.x != 0.0) {
        ivec2 p = bodyTexel(uv);
        if (rim >= 0.0) { gl_FragDepth = bodyDepth(rim); outColor = bodyFogged(eliteRimColor(eliteRimK(uElite.x, uElite.y))); return; }
        float em = uElite.x > 0.0 ? bodyEmber(p, uElite.y) : 0.0;
        if (em > 0.0) { gl_FragDepth = gl_FragCoord.z; outColor = bodyFogged(eliteRimColor(uElite.x) * (0.55 + 0.6 * em)); return; }
      }
    }
    discard;
  }
  gl_FragDepth = uDepthK.w > 0.5 ? bodyDepth(texelFetch(uDepthTex, bodyTexel(uv), 0).r) : gl_FragCoord.z;   // BODY-DEPTH: the texel where it stands (no read for a card)
  float edge = 0.0;
  if (uDissolve.x > 0.0) {   // MWNPC5: burnt away, the feet first - and the edge it burns along (dissolveEdge)
    float g = bodyGrain(bodyTexel(uv), uv.y / max(uSpan.y, 1e-6)) - (uDissolve.x * 1.1 - 0.05);   // dissolveCutAt
    if (g < 0.0) discard;
    edge = (1.0 - smoothstep(0.0, 0.09, g)) * min(1.0, uDissolve.x * 8.0);
  }
  vec3 rgb = t.rgb;
  if (uConceal.x == 2.0) rgb *= ${SHADE_DARK};   // INVIS-LOOK: a shade, ECV1's dark
  rgb = eliteGlowLit(rgb, t.rgb, max(uElite.x, 0.0));   // MWNPC5: the elite's warmth (never a corpse)
  rgb = glintLit(rgb, t.rgb, uGlint);   // MWNPC5: lifted toward the blow's colour as it winds up
  rgb = hitFlashLit(rgb, t.rgb, uHitFlash);   // HITFLASH1: over any concealment, never instead of it (the billboards' law)
  if (edge > 0.0) rgb = mix(rgb, uDissolve.yzw * 1.6, edge);   // MWNPC5: the edge blazes (dissolveLit)
  outColor = vec4(dwWaterFog(mix(uFogColor, rgb, fogFactorAt(vWorld)), vWorld), uConceal.x > 0.0 ? t.a * uConceal.y : 1.0);   // DW-C
}`;
      this.charQuadProgram = this._buildProgram(vs, fs);
      const P = this.charQuadProgram;
      this._charQuad = {
        proj: gl.getUniformLocation(P, 'uProj'),
        view: gl.getUniformLocation(P, 'uView'),
        tex: gl.getUniformLocation(P, 'uTex'),
        fogColor: gl.getUniformLocation(P, 'uFogColor'),
        fogMode: gl.getUniformLocation(P, 'uFogMode'),
        fogDensity: gl.getUniformLocation(P, 'uFogDensity'),
        fogRange: gl.getUniformLocation(P, 'uFogRange'),
        camPos: gl.getUniformLocation(P, 'uCamPos'),
        focus: gl.getUniformLocation(P, 'uFocus'),
        dwFog: gl.getUniformLocation(P, 'uDwFog'),
        haze: gl.getUniformLocation(P, 'uJungleHaze'),
        conceal: gl.getUniformLocation(P, 'uConceal'),
        span: gl.getUniformLocation(P, 'uSpan'),
        origin: gl.getUniformLocation(P, 'uOrigin'),
        hitFlash: gl.getUniformLocation(P, 'uHitFlash'),
        glint: gl.getUniformLocation(P, 'uGlint'),
        elite: gl.getUniformLocation(P, 'uElite'),
        dissolve: gl.getUniformLocation(P, 'uDissolve'),
        depthTex: gl.getUniformLocation(P, 'uDepthTex'),
        depthK: gl.getUniformLocation(P, 'uDepthK'),
        depthDir: gl.getUniformLocation(P, 'uDepthDir'),
      };
      const vao = gl.createVertexArray();
      this._bindVao(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, 4 * 5 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      this._bindVao(null);
      this._charQuadVAO = vao; this._charQuadVBO = vbo;
    }
  }

  // Decals depth-test without depth writes: each sits 2 cm off its surface (bloodDecals.js SURFACE_LIFT), and
  // overlapping marks layer instead of fighting.

  /** @param {number} capacity */
  createDecalBatch(capacity) {
    const gl = this.gl;
    const cap = Math.max(1, Math.floor(capacity));
    const vao = gl.createVertexArray();
    this._bindVao(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, cap * 4 * DECAL_STRIDE, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, DECAL_STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, DECAL_STRIDE, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, DECAL_STRIDE, 20);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, DECAL_STRIDE, 36);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, decalIndices(cap), gl.STATIC_DRAW);
    this._bindVao(null);
    return { vao, vb, ib, capacity: cap };
  }

  writeDecalSlot(batch, slot, floats) {
    if (!batch || slot < 0 || slot >= batch.capacity) return false;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, batch.vb);
    gl.bufferSubData(gl.ARRAY_BUFFER, slot * 4 * DECAL_STRIDE, floats);
    return true;
  }

  // `ranges` lists slot ranges in age order, so a wrapped ring draws its oldest marks first.
  drawDecalPicture(batch, tex, ranges = null) {
    this._decalPicture = true;
    try { this.drawDecals(batch, tex, ranges); } finally { this._decalPicture = false; }
  }

  // Lifted over this frame's snow, which writes depth and would hide the telegraphs.
  drawFoeTelegraphs(list) {
    if (!list?.length || !this._proj || !this._view) return 0;
    if (!this._foeTelegraph) { this._loadFoeTelegraph(); return 0; }
    this._close2D();
    const n = this._foeTelegraph.draw(list, this._proj, this._view, { mode: this._fogMode, density: this._fogDensity, range: this._fogRange, camPos: this._camPos, focus: this._focus, haze: this._haze }, { snowRise: this._snowRise });
    this.markForeignPass();
    return n;
  }

  drawDecals(batch, tex, ranges = null) {
    if (!batch || !tex) return;
    this._close2D();
    const gl = this.gl;
    this._use(this.decalProgram);
    this._uploadCloudShadow('decal');
    const d = this._decal;
    this._bindTex0(tex);
    gl.uniform1f(d.picture, this._decalPicture ? 1 : 0);
    if (this._dFrameStamp !== this._frameStamp) {
      this._dFrameStamp = this._frameStamp;
      gl.uniformMatrix4fv(d.proj, false, this._proj);
      gl.uniformMatrix4fv(d.view, false, this._view);
      gl.uniform1i(d.tex, 0);
      this._uploadFog(this._decal);
      // Marks take the flats' light term for term, so a mark is as dark as the surface it lies on.
      if (this._clockLit) {
        // Three decoded colors need three scratches; two decodes into one scratch overwrite each other.
        const am = this._c3(this._ambient, this._decA);
        const mc = this._c3(this._moonColor, this._decB);
        const sc = this._c3(this._sunColor, this._decC);
        gl.uniform3f(d.tint, am[0], am[1], am[2]);
        gl.uniform3f(d.moon, mc[0] * this._moonScale, mc[1] * this._moonScale, mc[2] * this._moonScale);
        gl.uniform3f(d.sun, sc[0] * this._sunScale, sc[1] * this._sunScale, sc[2] * this._sunScale);
      } else {
        gl.uniform3f(d.tint, 1, 1, 1);
        gl.uniform3f(d.sun, 0, 0, 0);
        gl.uniform3f(d.moon, 0, 0, 0);
      }
      if (d.lightDir) gl.uniform3fv(d.lightDir, this._lightDir);
      if (d.moonDir) gl.uniform3fv(d.moonDir, this._moonDir);
      const tri = this._ambientTri;
      gl.uniform1f(d.trilight, tri ? 1 : 0);
      if (tri) { gl.uniform3fv(d.ambientSky, this._c3(tri.sky)); gl.uniform3fv(d.ambientGround, this._c3(tri.ground)); }
      // The cap is the installed decal program's, since a lane with no decal twin runs the classic 16-light program.
      const dCount = Math.min(this._pointLights.length >> 2, this._decalLights);
      gl.uniform1i(d.pointCount, dCount);
      if (dCount > 0) {
        gl.uniform4fv(d.pointLights, this._pointLights.subarray ? this._pointLights.subarray(0, dCount * 4) : this._pointLights.slice(0, dCount * 4));
        gl.uniform3fv(d.pointColors, this._pointColorData(dCount));
      }
      gl.uniform4fv(d.indirect, this._indirect);
      gl.uniform3fv(d.indirectColor, this._c3(this._indirectColor));
      this._uploadEl('decal');
    }
    this._bindVao(batch.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    // Culling is off because a mark on a ceiling is seen from behind its own normal.
    gl.disable(gl.CULL_FACE);
    if (ranges && ranges.length) {
      for (const [a, b] of ranges) {
        const lo = Math.max(0, a | 0), hi = Math.min(batch.capacity, b | 0);
        if (hi > lo) { gl.drawElements(gl.TRIANGLES, (hi - lo) * 6, gl.UNSIGNED_INT, lo * 6 * 4); this.stats.draws++; }
      }
    } else {
      gl.drawElements(gl.TRIANGLES, batch.capacity * 6, gl.UNSIGNED_INT, 0);
      this.stats.draws++;
    }
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    this._bindVao(null);
  }

  destroyDecalBatch(batch) {
    if (!batch) return;
    const gl = this.gl;
    gl.deleteBuffer(batch.vb);
    gl.deleteBuffer(batch.ib);
    gl.deleteVertexArray(batch.vao);
  }

  _decalLocs(P) {
    const gl = this._locations();
    return {
      proj: gl.getUniformLocation(P, 'uProj'),
      view: gl.getUniformLocation(P, 'uView'),
      tex: gl.getUniformLocation(P, 'uTex'),
      tint: gl.getUniformLocation(P, 'uTint'),
      sun: gl.getUniformLocation(P, 'uDecalSun'),
      lightDir: gl.getUniformLocation(P, 'uLightDir'),
      moon: gl.getUniformLocation(P, 'uDecalMoon'),
      moonDir: gl.getUniformLocation(P, 'uMoonDir'),
      trilight: gl.getUniformLocation(P, 'uTrilight'),
      ambientSky: gl.getUniformLocation(P, 'uAmbientSky'),
      ambientGround: gl.getUniformLocation(P, 'uAmbientGround'),
      pointCount: gl.getUniformLocation(P, 'uPointCount'),
      pointLights: gl.getUniformLocation(P, 'uPointLights'),
      pointColors: gl.getUniformLocation(P, 'uPointColors'),
      indirect: gl.getUniformLocation(P, 'uIndirect'),
      indirectColor: gl.getUniformLocation(P, 'uIndirectColor'),
      picture: gl.getUniformLocation(P, 'uPicture'),
      ...this._fogLocs(P),
    };
  }

  // Set it, draw, and reset it; never leave it on.
  setScreenOffset(x, y) {
    const o = this._screenOffset;
    if (o) { o[0] = x; o[1] = y; } else this._screenOffset = [x, y];
  }
  // Returns the renderer's own pair, moved in place, so copy the numbers rather than keeping the array.
  get screenOffset() { return this._screenOffset ?? NO_SCREEN_OFFSET; }

  // SCISSOR_TEST also gates gl.clear, so close every set with clearScreenScissor before returning.
  setScreenScissor(x, y, w, h) {
    const gl = this.gl;
    const ox = this._screenOffset?.[0] ?? 0, oy = this._screenOffset?.[1] ?? 0;
    const yTop = Math.round(y + oy), hh = Math.max(0, Math.round(h));
    gl.enable(gl.SCISSOR_TEST);
    this._scissor = [Math.round(x + ox), gl.drawingBufferHeight - yTop - hh, Math.max(0, Math.round(w)), hh];
    gl.scissor(this._scissor[0], this._scissor[1], this._scissor[2], this._scissor[3]);
  }

  clearScreenScissor() { this._scissor = null; this.gl.disable(this.gl.SCISSOR_TEST); }

  // For drawing over chrome already on the canvas, where beginPanelFrame's clear would wipe it; clears in a finally.
  screenScissor(rect, body) {
    this.setScreenScissor(rect.x, rect.y, rect.w, rect.h);
    try { return body(); } finally { this.clearScreenScissor(); }
  }

  drawScreenQuad(tex, dst, src = { u0: 0, v0: 0, u1: 1, v1: 1 }, color = [1, 1, 1, 1], opts = {}) {
    const gl = this.gl;
    // The first screen quad after a shrunk world pass restores the full canvas.
    if (this._worldViewportPx) this.endWorldPass();
    this._compositeAir();
    this._ensureScreenQuadProgram();
    this._use(this.screenQuadProgram);
    this._open2D(this._screenQuadVao);
    const ox = this._screenOffset?.[0] ?? 0, oy = this._screenOffset?.[1] ?? 0;
    gl.uniform4f(this._screenQuad.dst, dst.x + ox, dst.y + oy, dst.w, dst.h);
    const q = this._sq;
    if (q.cw !== gl.drawingBufferWidth || q.ch !== gl.drawingBufferHeight) {
      gl.uniform2f(this._screenQuad.canvas, gl.drawingBufferWidth, gl.drawingBufferHeight);
      q.cw = gl.drawingBufferWidth; q.ch = gl.drawingBufferHeight;
    }
    gl.uniform4f(this._screenQuad.src, src.u0, src.v0, src.u1, src.v1);
    // Callers may pass an RGB triple; an absent alpha must be 1, since uniform4f would upload NaN.
    const a = color[3] ?? 1;
    if (q.r !== color[0] || q.g !== color[1] || q.b !== color[2] || q.a !== a) {
      gl.uniform4f(this._screenQuad.color, color[0], color[1], color[2], a);
      q.r = color[0]; q.g = color[1]; q.b = color[2]; q.a = a;
    }
    const alphaArt = !!tex && !!this._alphaArt?.has(tex);
    const useTex = tex ? 1 : 0, blendTex = (tex && (opts.blend || alphaArt)) ? 1 : 0;
    if (q.useTex !== useTex) { gl.uniform1i(this._screenQuad.useTex, useTex); q.useTex = useTex; }
    if (q.blendTex !== blendTex) { gl.uniform1i(this._screenQuad.blendTex, blendTex); q.blendTex = blendTex; }
    // opts.rotate's pivot is in dst's space, so the screen offset moves both together.
    const rot = opts.rotate ?? null;
    const rotOn = rot ? 1 : 0;
    if (q.rotOn !== rotOn) { gl.uniform1i(this._screenQuad.rotOn, rotOn); q.rotOn = rotOn; }
    if (rot) {
      gl.uniform4f(this._screenQuad.rot, Math.cos(rot.rad), Math.sin(rot.rad), rot.px + ox, rot.py + oy);
    }
    if (tex) this._bindTex0(tex);
    const blend = screenQuadBlends(tex, color, opts, alphaArt);
    if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    this.stats.draws++;
    if (blend) gl.disable(gl.BLEND);
  }

  drawScreenQuadGlow(tex, dst, src = { u0: 0, v0: 0, u1: 1, v1: 1 }, glow = null, frame = null) {
    if (!tex || !glow?.ramp || !(glow.code > 0) || !glow.win) return;
    const gl = this.gl;
    if (this._worldViewportPx) this.endWorldPass();
    this._compositeAir();
    this._ensureScreenQuadProgram();
    this._ensureWeaponGlowQuadProgram();
    this._open2D(this._screenQuadVao);
    const aw = Math.max(1, Math.round(frame?.art?.[0] ?? (dst.w * 320) / gl.drawingBufferWidth));
    const ah = Math.max(1, Math.round(frame?.art?.[1] ?? (dst.h * 200) / gl.drawingBufferHeight));
    const cutL = dst.x <= 0.5, cutR = dst.x + dst.w >= (frame?.view?.[0] ?? Infinity) - 0.5;
    // The field belongs to the texture, so a mirrored frame's screen-left is its right.
    const mirror = src.u1 < src.u0;
    const field = this._glowField(tex, glow, aw, ah, mirror ? cutR : cutL, mirror ? cutL : cutR);
    const [wx, , down] = glow.win;
    this._use(this.weaponGlowQuadProgram);
    const u = this._wgq;
    const ox = this._screenOffset?.[0] ?? 0, oy = this._screenOffset?.[1] ?? 0;
    gl.uniform4f(u.dst, dst.x + ox, dst.y + oy, dst.w, dst.h);
    gl.uniform2f(u.canvas, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform4f(u.src, src.u0, src.v0, src.u1, src.v1);
    gl.uniform4f(u.pad, cutL ? 0 : wx, down, cutR ? 0 : wx, 0);
    gl.uniform2i(u.art, aw, ah);
    gl.uniform2i(u.fieldAt, wx, down);
    gl.uniform1i(u.look, glow.code);
    gl.uniform1f(u.level, glow.level);
    gl.uniform1f(u.time, glowSeconds());
    gl.uniform1f(u.dmax, glowFieldReach(glow.look));
    gl.uniform1f(u.reachMax, GLOW_REACH_MAX[glow.look]);
    gl.uniform3fv(u.ramp, glow.ramp);
    this._bindEmission(field);
    this._bindTex0(tex);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    this.stats.draws++;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.BLEND);
  }

  _glowField(tex, glow, aw, ah, cutL, cutR) {
    const gl = this.gl;
    let byTex = this._glowFields.get(tex);
    if (!byTex) { byTex = new Map(); this._glowFields.set(tex, byTex); }
    const key = glow.code + 8 * ((cutL ? 1 : 0) + (cutR ? 2 : 0)) + 32 * (aw * 4096 + ah);
    const hit = byTex.get(key);
    if (hit) { hit.used = ++this._glowFieldClock; return hit.tex; }
    const [wx, up, down] = glow.win;
    // No pad below, since the bottom is always a cut.
    const fw = aw + 2 * wx, fh = ah + down;
    const ftex = gl.createTexture();
    this._activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ftex);
    this._tex0Bound = null;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (!this._glowFbo) this._glowFbo = gl.createFramebuffer();
    const sc = this._scissor;
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._glowFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ftex, 0);
      if (sc) gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, fw, fh);
      gl.disable(gl.BLEND);
      this._use(this.weaponGlowFieldProgram);
      const u = this._wgf;
      gl.uniform2i(u.art, aw, ah);
      gl.uniform4i(u.fieldPad, wx, down, wx, 0);
      gl.uniform3i(u.win, wx, up, down);
      gl.uniform3i(u.cut, cutL ? 1 : 0, cutR ? 1 : 0, 1);
      gl.uniform1i(u.look, glow.code);
      gl.uniform1f(u.dmax, glowFieldReach(glow.look));
      this._bindTex0(tex);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      this.stats.draws++;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._frameFbo ?? null);
      this._restoreWorldViewport();
      if (sc) gl.enable(gl.SCISSOR_TEST);
    }
    const entry = { tex: ftex, used: ++this._glowFieldClock, byTex, key };
    byTex.set(key, entry);
    const list = this._glowFieldList;
    list.push(entry);
    if (list.length > GLOW_FIELDS_MAX) {
      let old = 0;
      for (let i = 1; i < list.length; i++) if (list[i].used < list[old].used) old = i;
      const gone = list.splice(old, 1)[0];
      gone.byTex.delete(gone.key);
      gl.deleteTexture(gone.tex);
    }
    return ftex;
  }

  _ensureWeaponGlowQuadProgram() {
    if (this.weaponGlowQuadProgram) return;
    const gl = this.gl;
    const p = this._buildProgram(GLOW_SPRITE_VS, GLOW_SPRITE_FS);
    const at = (n) => gl.getUniformLocation(p, n);
    this._wgq = {
      dst: at('uDst'), canvas: at('uCanvas'), src: at('uSrc'), pad: at('uPad'), art: at('uArt'), fieldAt: at('uFieldAt'),
      look: at('uLook'), level: at('uLevel'), time: at('uTime'), ramp: at('uRamp'), dmax: at('uDmax'), reachMax: at('uReachMax'),
    };
    this._use(p);
    gl.uniform1i(at('uTex'), 0);
    gl.uniform1i(at('uField'), 1);
    const f = this._buildProgram(GLOW_FIELD_VS, GLOW_FIELD_FS);
    const fat = (n) => gl.getUniformLocation(f, n);
    this._wgf = { art: fat('uArt'), fieldPad: fat('uFieldPad'), win: fat('uWin'), cut: fat('uCut'), look: fat('uLook'), dmax: fat('uDmax') };
    this._use(f);
    gl.uniform1i(fat('uTex'), 0);
    this.weaponGlowFieldProgram = f;
    this._glowFields = new WeakMap();
    this._glowFieldList = [];
    this._glowFieldClock = 0;
    this.weaponGlowQuadProgram = p;
  }

  _ensureScreenQuadProgram() {
    const gl = this.gl;
    if (!this.screenQuadProgram) {
      const vs = `#version 300 es
layout(location=0) in vec2 aPos;
uniform vec4 uDst;      // x, y, w, h in pixels (top-left origin)
uniform vec2 uCanvas;
uniform vec4 uSrc;      // u0, v0, u1, v1
uniform vec4 uRot;      // cos, sin, pivotX, pivotY (screen pixels)
uniform int uRotOn;
out vec2 vUV;
void main() {
  vec2 p = aPos * 0.5 + 0.5;                     // 0..1
  vUV = mix(uSrc.xy, uSrc.zw, vec2(p.x, p.y));
  vec2 px = uDst.xy + p * uDst.zw;
  // ROAD-C c2/S10: the ONE new GL of the exterior automap. DFU's town
  // map is a world quad seen by an orthographic camera that is rotated
  // about -up, so its layout texture, its arrow and its stamp all draw
  // TURNED. This is that turn, in the screen-quad's own space: a plain
  // 2D rotation about a pixel pivot, applied AFTER uDst places the
  // rect. It deliberately does NOT touch mirrorProjectionX - screen
  // quads run with CULL_FACE disabled and have no facing to mirror.
  if (uRotOn == 1) {
    vec2 d = px - uRot.zw;
    px = uRot.zw + vec2(d.x * uRot.x - d.y * uRot.y, d.x * uRot.y + d.y * uRot.x);
  }
  vec2 ndc = vec2(px.x / uCanvas.x * 2.0 - 1.0, 1.0 - px.y / uCanvas.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;
      const fs = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform int uUseTex;
uniform int uBlendTex;
uniform vec4 uColor;
out vec4 outColor;
void main() {
  if (uUseTex == 1) {
    vec4 t = texture(uTex, vUV);
    // U21c: the opt-in arm. Classic art is a 1-BIT cutout (palette index
    // 0 transparent, every other index fully opaque), so the default
    // discards and forces alpha 1 - correct for every IMG/CIF/texture in
    // the game. Art authored OUTSIDE that palette (our logo) carries real
    // partial alpha: anti-aliased edges and a soft shadow, which the
    // threshold would turn into jagged gold and a hard silhouette.
    if (uBlendTex == 1) { outColor = vec4(t.rgb * uColor.rgb, t.a * uColor.a); }
    else { if (t.a < 0.5) discard; outColor = vec4(t.rgb, 1.0) * uColor; }
  }
  else outColor = uColor;
}`;
      this.screenQuadProgram = this._buildProgram(vs, fs);
      this._screenQuad = {
        dst: gl.getUniformLocation(this.screenQuadProgram, 'uDst'),
        canvas: gl.getUniformLocation(this.screenQuadProgram, 'uCanvas'),
        src: gl.getUniformLocation(this.screenQuadProgram, 'uSrc'),
        tex: gl.getUniformLocation(this.screenQuadProgram, 'uTex'),
        useTex: gl.getUniformLocation(this.screenQuadProgram, 'uUseTex'),
        blendTex: gl.getUniformLocation(this.screenQuadProgram, 'uBlendTex'),
        color: gl.getUniformLocation(this.screenQuadProgram, 'uColor'),
        rot: gl.getUniformLocation(this.screenQuadProgram, 'uRot'),
        rotOn: gl.getUniformLocation(this.screenQuadProgram, 'uRotOn'),
      };
      // uTex is always unit 0, so the sampler binding goes up once per program.
      this._sq = {};
      this._use(this.screenQuadProgram);
      gl.uniform1i(this._screenQuad.tex, 0);
      const vao = gl.createVertexArray();
      this._bindVao(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      this._bindVao(null);
      this._screenQuadVao = vao;
    }
  }

  drawScreenQuadRun(tex, quads, color = [1, 1, 1, 1]) {
    const gl = this.gl;
    const n = quads?.length ?? 0;
    if (!tex || !n) return;
    if (this._worldViewportPx) this.endWorldPass();
    this._compositeAir();
    this._ensureScreenQuadRunProgram();
    if (this._screenQuadRunData.length < n * 8) this._screenQuadRunData = new Float32Array(n * 8);
    const a = this._screenQuadRunData;
    const ox = this._screenOffset?.[0] ?? 0, oy = this._screenOffset?.[1] ?? 0;
    for (let i = 0; i < n; i++) {
      const { dst, src } = quads[i], o = i * 8;
      a[o] = dst.x + ox; a[o + 1] = dst.y + oy; a[o + 2] = dst.w; a[o + 3] = dst.h;
      a[o + 4] = src.u0; a[o + 5] = src.v0; a[o + 6] = src.u1; a[o + 7] = src.v1;
    }
    this._use(this.screenQuadRunProgram);
    this._open2D(this._screenQuadRunVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._screenQuadRunVbo);
    if (this._screenQuadRunCap < n) { gl.bufferData(gl.ARRAY_BUFFER, a.byteLength, gl.STREAM_DRAW); this._screenQuadRunCap = a.length / 8; }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, a, 0, n * 8);
    gl.uniform2f(this._screenQuadRun.canvas, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform4f(this._screenQuadRun.color, color[0], color[1], color[2], color[3]);
    this._bindTex0(tex); gl.uniform1i(this._screenQuadRun.tex, 0);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, n);
    this.stats.draws++;
  }

  _ensureScreenQuadRunProgram() {
    const gl = this.gl;
    if (!this.screenQuadRunProgram) {
      const vs = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in vec4 aDst;   // x, y, w, h in pixels (top-left origin), per INSTANCE
layout(location=2) in vec4 aSrc;   // u0, v0, u1, v1, per INSTANCE
uniform vec2 uCanvas;
out vec2 vUV;
void main() {
  vec2 p = aPos * 0.5 + 0.5;                     // 0..1
  vUV = mix(aSrc.xy, aSrc.zw, vec2(p.x, p.y));
  vec2 px = aDst.xy + p * aDst.zw;
  vec2 ndc = vec2(px.x / uCanvas.x * 2.0 - 1.0, 1.0 - px.y / uCanvas.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;
      // A run always uses the non-blend cutout arm, because its only caller is text, which is classic art.
      const fs = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec4 uColor;
out vec4 outColor;
void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.5) discard;
  outColor = vec4(t.rgb, 1.0) * uColor;
}`;
      this.screenQuadRunProgram = this._buildProgram(vs, fs);
      this._screenQuadRun = {
        canvas: gl.getUniformLocation(this.screenQuadRunProgram, 'uCanvas'),
        tex: gl.getUniformLocation(this.screenQuadRunProgram, 'uTex'),
        color: gl.getUniformLocation(this.screenQuadRunProgram, 'uColor'),
      };
      const vao = gl.createVertexArray();
      this._bindVao(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      this._screenQuadRunVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._screenQuadRunVbo);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
      gl.vertexAttribDivisor(2, 1);
      this._bindVao(null);
      this._screenQuadRunVao = vao;
      this._screenQuadRunData = new Float32Array(0);
      this._screenQuadRunCap = 0;
    }
  }

    drawScreenOverlayQuad(tex, u1, v1) {
    const gl = this.gl;
    // A retro world is presented before the first-person overlay, so the arm draws at the canvas's resolution.
    let strip = null;
    if (this._retroOwed) {
      const v = this._worldViewportFrame;
      if (this._worldViewportPx) this.endWorldPass();
      this._compositeAir();
      strip = v && v.y > 0 ? this._viewportPx({ x: 0, y: v.y, w: 1, h: v.h }) : null;
      if (strip) gl.viewport(strip[0], strip[1], strip[2], strip[3]);
    }
    this._ensureOverlayProgram();
    this._use(this.overlayProgram);
    this._activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._tex0Bound = null;
    gl.uniform1i(this._overlay.tex, 0);
    gl.uniform2f(this._overlay.uv1, u1, v1);
    this._open2D(this._overlayVAO);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    this.stats.texBinds++; this.stats.draws++;
    if (strip) gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  _ensureOverlayProgram() {
    const gl = this.gl;
    if (!this.overlayProgram) {
      const vs = `#version 300 es
layout(location=0) in vec2 aPos;
uniform vec2 uUV1;
out vec2 vUV;
void main() { vUV = (aPos * 0.5 + 0.5) * uUV1; gl_Position = vec4(aPos, 0.0, 1.0); }`;
      const fs = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
out vec4 outColor;
void main() { vec4 t = texture(uTex, vUV); if (t.a < 0.5) discard; outColor = vec4(t.rgb, 1.0); }`;
      this.overlayProgram = this._buildProgram(vs, fs);
      this._overlay = {
        tex: gl.getUniformLocation(this.overlayProgram, 'uTex'),
        uv1: gl.getUniformLocation(this.overlayProgram, 'uUV1'),
      };
      const vao = gl.createVertexArray();
      this._bindVao(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this._bindVao(null);
      this._overlayVAO = vao;
    }
  }

  heldTexture(archive, record, opts = {}) {
    const key = textureKeyOf(archive, record, opts);
    if (!this.textures.has(key) || this._placeholders?.has(key)) return false;
    this._uploadSink?.(false, key);
    return true;
  }
  uploadTexture(archive, record, color32, opts = {}) {
    // The sampling mode is part of the key, so a smooth request never gets a cached NEAREST texture.
    const key = textureKeyOf(archive, record, opts);
    this._uploadSink?.(false, key);
    if (opts.cutout) this._markCutout(this.textures.get(key));
    if (color32?.pending) { if (!this.textures.has(key)) color32.pending(); return this.textures.get(key) ?? null; }
    if (this.textures.has(key)) {
      // A stand-in's placeholder never owns the key; a real picture asked for later replaces it.
      if (!this._placeholders?.has(key) || opts.placeholder) return this.textures.get(key);
      this._placeholders.delete(key);
      const old = this.textures.get(key);
      this.textures.delete(key);
      if (old) this.gl.deleteTexture(old);
    }
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._tex0Bound = null;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, color32.width, color32.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, color32Bytes(color32, `uploadTexture(${archive}, ${record})`)
    );
    const { wrap, filter } = textureParams(gl, opts);
    const own = opts.sampler && !opts.smooth ? samplerParams(gl, opts.sampler, !opts.smooth && (opts.mips ?? (typeof archive === 'number'))) : null;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, own ? own.wrapS : wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, own ? own.wrapT : wrap);
    // World archives get a mip chain sampled nearest-mip, as in DFU's TextureReader and MaterialReader; UI art
    // keeps a single NEAREST level.
    const mips = !opts.smooth && (opts.mips ?? (typeof archive === 'number'));
    if (mips) gl.generateMipmap?.(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, own ? own.min : mips ? (gl.NEAREST_MIPMAP_NEAREST ?? filter) : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, own ? own.mag : filter);
    if (opts.replacement) { if (tex) this._replacements.add(tex); }
    else if (mips && !this._retroMips) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
    this.textures.set(key, tex);
    if (opts.placeholder) (this._placeholders ??= new Set()).add(key);
    if (opts.alpha && tex) (this._alphaArt ??= new WeakSet()).add(tex);
    if (opts.cutout) this._markCutout(tex);
    const base = `${archive}_${record}`;
    let keys = this._texKeysByBase.get(base);
    if (!keys) this._texKeysByBase.set(base, keys = new Set());
    keys.add(key);
    (this._texBaseOf ??= new Map()).set(key, base);
    this._texGen++;
    return tex;
  }

  _markCutout(tex) {
    if (!tex || this._cutoutArt?.has(tex)) return;
    (this._cutoutArt ??= new WeakSet()).add(tex);
    this._texGen++;
  }

  evictTexture(key) {
    const tex = this.textures.get(key);
    if (tex === undefined) return false;
    this.textures.delete(key);
    this._placeholders?.delete(key);
    const base = this._texBaseOf?.get(key);
    this._texBaseOf?.delete(key);
    const keys = base === undefined ? null : this._texKeysByBase.get(base);
    if (keys) { keys.delete(key); if (!keys.size) this._texKeysByBase.delete(base); }
    if (tex) this.gl.deleteTexture(tex);
    if (this._tex0Bound === tex) this._tex0Bound = null;
    this._texGen++;
    return true;
  }

  evictEmissionTexture(key) {
    if (!this.emissionTextures.has(key) && this.glassMasks?.has(key)) {
      const glass = this.glassMasks.get(key);
      this.glassMasks.delete(key);
      if (glass) this.gl.deleteTexture(glass);
      if (this._tex1Bound === glass) this._tex1Bound = null;
      this._texGen++;
      return true;
    }
    const tex = this.emissionTextures.get(key);
    if (tex === undefined) return false;
    this.emissionTextures.delete(key);
    this.emissionWhite.delete(key);
    this.windowMasks?.delete(key);
    if (tex) this.gl.deleteTexture(tex);
    if (this._tex1Bound === tex) this._tex1Bound = null;
    this._texGen++;
    return true;
  }

  releaseTileArray(archive) {
    const tex = this.tileArrays.get(archive);
    if (tex === undefined) return false;
    this.tileArrays.delete(archive);
    this._tileDims.delete(archive);
    if (tex) this.gl.deleteTexture(tex);
    this._tArrayTex = null;
    (this._tEcoTex ??= [null, null, null]).fill(null);
    return true;
  }

  _textureMissed(key) {
    if (!this.textureMiss) return null;
    this._activeTexture(this.gl.TEXTURE0);
    return this.textureMiss(key) ?? null;
  }

  releaseTexture(archive, record) {
    // Frees every variant key the uploads recorded under this base, not a suffix list.
    const base = record === undefined ? archive : `${archive}_${record}`;
    const keys = this._texKeysByBase.get(base);
    let freed = false;
    if (keys) {
      this._texKeysByBase.delete(base);
      for (const key of keys) {
        this._texBaseOf?.delete(key);
        const tex = this.textures.get(key);
        if (!tex) continue;
        this.textures.delete(key);
        this.gl.deleteTexture(tex);
        freed = true;
      }
    }
    // Deletes bump the generation too, or a stamped sub-mesh keeps binding a deleted texture.
    if (freed) this._texGen++;
    return freed;
  }

  /**
   * @param {any} model
   * @param {{ bounds?: ?{ whole: Float32Array, subs: Float32Array[] } }} [opts]
   */
  createMesh(model, { bounds: measured = null } = {}) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    this._bindVao(vao);

    const buffers = [];
    const buf = (target, data) => {
      const b = gl.createBuffer();
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      buffers.push(b);
      return b;
    };
    buf(gl.ARRAY_BUFFER, model.positions);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    buf(gl.ARRAY_BUFFER, model.normals);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    buf(gl.ARRAY_BUFFER, model.uvs);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    // Every draw of a bundle reads gl.UNSIGNED_INT, so indices are widened to 32 bits here; triIndices stays the
    // model's own array.
    buf(gl.ELEMENT_ARRAY_BUFFER, model.indices instanceof Uint32Array ? model.indices : Uint32Array.from(model.indices));
    let shadowVao = null, shadowCells = null;
    if (model.shadowIndices) {
      shadowVao = gl.createVertexArray();
      this._bindVao(shadowVao);
      for (let a = 0; a < 3; a++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[a]);
        gl.enableVertexAttribArray(a);
        gl.vertexAttribPointer(a, a === 2 ? 2 : 3, gl.FLOAT, false, 0, 0);
      }
      buf(gl.ELEMENT_ARRAY_BUFFER, model.shadowIndices);
      shadowCells = model.shadowCells.map((c) => ({ ...c, _bounds: boundsOf(model.positions, model.shadowIndices, c.startIndex, c.primitiveCount * 3) }));
    }

    this._bindVao(null);
    const bounds = measured ? measured.whole : boundsOf(model.positions);
    const subMeshes = model.subMeshes.map((sm, i) => ({ ...sm, _bounds: measured ? measured.subs[i] : boundsOf(model.positions, model.indices, sm.startIndex, sm.primitiveCount * 3) }));
    // Sub-meshes are copied, because drawMesh stamps cache fields on them and a caller's may be frozen.
    const bundle = /** @type {any} */ ({ vao, subMeshes, buffers, triIndices: model.indices, bounds });
    if (shadowVao) { bundle.shadowVao = shadowVao; bundle.shadowCells = shadowCells; }
    return bundle;
  }

  meshView(mesh, subMeshes) {
    if (!mesh?.vao || mesh._dead || mesh.viewOf) return null;
    return { vao: mesh.vao, subMeshes: subMeshes.map((sm) => ({ ...sm })), buffers: [], triIndices: mesh.triIndices, bounds: mesh.bounds, viewOf: mesh };
  }

  // A bake never changes the vertex count, so the new data fits the buffers createMesh made.
  updateMeshVertices(mesh, positions, normals) {
    if (!mesh?.buffers || mesh._dead) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[0]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[1]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, normals);
    boundsOf(positions).forEach((v, i) => { mesh.bounds[i] = v; });
    for (const sm of mesh.subMeshes) boundsOf(positions, mesh.triIndices, sm.startIndex, sm.primitiveCount * 3).forEach((v, i) => { sm._bounds[i] = v; });
    // A bake that moves a vertex bumps the vertex generation; a re-bake that moves nothing does not.
    const was = mesh._vertWas;
    if (!was || was.length !== positions.length || !was.every((v, i) => v === positions[i])) {
      mesh._vertGen = (mesh._vertGen ?? 0) + 1;
      if (was && was.length === positions.length) was.set(positions); else mesh._vertWas = Float32Array.from(positions);
    }
  }

  setClearColor(rgba) {
    // Compare at Float32Array precision, or 0.53 never matches its stored copy.
    const cc = this._clearColor;
    if (cc[0] === Math.fround(rgba[0]) && cc[1] === Math.fround(rgba[1]) && cc[2] === Math.fround(rgba[2]) && cc[3] === Math.fround(rgba[3])) return;
    cc[0] = rgba[0]; cc[1] = rgba[1]; cc[2] = rgba[2]; cc[3] = rgba[3];
    this.gl.clearColor(rgba[0], rgba[1], rgba[2], rgba[3]);
  }

  beginFrame(proj, view, lightDir, opts = null) {
    this._close2D();
    const s = this.stats;
    s.draws = 0; s.programBinds = 0; s.vaoBinds = 0; s.texBinds = 0; s.bbCulled = 0; s.shadowDraws = 0;
    // Per-frame state: hosts set it after beginFrame, so a frame that sets none inherits none.
    if (this._cloudShadow) { this._deckOwed = this._cloudShadow; this._cloudShadow = null; this._csStamp++; }
    this._dwFog[0] = 0;
    if (!this._hazeArmed && this._haze[4] !== 0) this._haze[4] = 0;
    this._hazeArmed = false;
    this._seaHaze[0] = 0;
    this._underWater = undefined;
    if (!this._focusArmed && this._focus[3] !== 0) this._focus.fill(0);
    this._focusArmed = false;
    this._dwColumn = null;
    this._lptDrawn?.fill(null);
    this._lastProgram = null;
    this._lastVao = null;
    this._csUploaded = {};
    const gl = this.gl;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // The pending viewport is consumed here; gl.clear ignores the viewport, so the strip under the bar still clears.
    {
      const r = this._worldViewportPending;
      this._worldViewportPending = null;
      this._worldViewportFrame = r ? { ...r } : null;
      this._worldViewportPx = this._viewportPx(r);
      if (this._worldViewportPx) this._restoreWorldViewport();
    }
    this._beginLane(proj, view, lightDir, opts?.world === true);
    this._clustersLive = !!this._lane && opts?.world === true && !this._panelSaved && this._spriteDepth === 0 && this._studioDepth === 0 && this._buildClusters(proj, view);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    s.viewDraws = this._rwOutside ? 0 : this._rwViewDraws;
    this._rwViewDraws = 0;
    this._use(this.program);
    gl.uniformMatrix4fv(this.uProj, false, proj);
    gl.uniformMatrix4fv(this.uView, false, view);
    gl.uniform3fv(this.uLightDir, lightDir);
    this._lightDir = lightDir;
    this._frameStamp++;
    this._ripples = null;
    this._snowRise = 0;
    gl.uniform3fv(this.uAmbient, this._c3(this._ambient));
    this._uploadTrilight();
    gl.uniform1f(this.uSunScale, this._sunScale);
    gl.uniform3fv(this.uSunColor, this._c3(this._sunColor));
    gl.uniform3fv(this.uMoonDir, this._moonDir);
    gl.uniform1f(this.uMoonScale, this._moonScale);
    gl.uniform3fv(this.uMoonColor, this._c3(this._moonColor));
    gl.uniform3fv(this.uLight3Dir, this._light3Dir);
    gl.uniform1f(this.uLight3Scale, this._light3Scale);
    gl.uniform3fv(this.uLight3Color, this._c3(this._light3Color));
    gl.uniform1i(this.uTex, 0);
    gl.uniform1i(this.uEmissionTex, 1);
    gl.uniform3fv(this.uEmissionColor, this._c3(this._windowEmission));
    this._emissionColorUp = this._windowEmission;
    this._forgetTextureShadows();
    const count = this._pointLights.length / 4;
    gl.uniform1i(this.uPointCount, count);
    if (count > 0) gl.uniform4fv(this.uPointLights, this._pointLights);
    if (count > 0) gl.uniform3fv(this.uPointColors, this._pointColorData(count));
    gl.uniform4fv(this.uIndirect, this._indirect);
    gl.uniform3fv(this.uIndirectColor, this._c3(this._indirectColor));
    this._uploadEl('mesh');
    // Camera position from the view matrix (view = R^T * T(-eye)).
    const v = view;
    this._camPos[0] = -(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]);
    this._camPos[1] = -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]);
    this._camPos[2] = -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14]);
    this._uploadFog(this._solidFog);
    this._activeTexture(gl.TEXTURE0);
    this._proj = proj;
    this._view = view;
    // A body batch no pass flushed is dropped here; left open, every later batch would join it and never draw.
    const sb = this._spriteBatch;
    if (sb?.open) {
      sb.open = false; sb.depth = 0; sb.items.length = 0;
      if (!this._spriteBatchLeft) { this._spriteBatchLeft = true; console.warn('[mw] a character batch was left open - shut at the frame\'s start'); }
    }
    this._rwFrame();
  }

  // The scissor goes on before beginFrame, since it gates beginFrame's clear; the viewport goes on after, since
  // beginFrame sets a full-canvas one.
  beginPanelFrame(proj, view, lightDir, rect, clearRGBA = PANEL_CLEAR_RGBA, setup = null) {
    this._close2D();
    if (this._panelSaved) throw new Error('beginPanelFrame: already inside a panel frame');
    // Show the owed world image before a panel draws over the canvas.
    if (this._retroOwed || this._air?.pending) { if (this._worldViewportPx) this.endWorldPass(); this._compositeAir(); }
    const gl = this.gl;
    // Every global this pass can touch is saved by name, so a new renderer global must be added here too.
    this._panelSaved = {
      screenOffset: this._screenOffset ? [...this._screenOffset] : [0, 0],
      clipY: this._clipY,
      automapMode: this._automapMode,
      automapWaterLevel: this._automapWaterLevel,
      automapWaterColor: [...this._automapWaterColor],
      fogMode: this._fogMode,
      fogDensity: this._fogDensity,
      fogRange: [this._fogRange[0], this._fogRange[1]],
      fogColor: this._fogColor,
      dwFog: Float32Array.from(this._dwFog),
      haze: Float32Array.from(this._haze),
      seaHaze: Float32Array.from(this._seaHaze),
      ambient: this._ambient,
      // setLighting's fourth argument defaults to null, so the trilight is saved and passed back with it.
      ambientTri: this._ambientTri ? { sky: Array.from(this._ambientTri.sky), ground: Array.from(this._ambientTri.ground) } : null,
      sunScale: this._sunScale,
      sunColor: this._sunColor,
      clockLit: this._clockLit,
      moonScale: this._moonScale,
      moonDir: [...this._moonDir],
      moonColor: [...this._moonColor],
      light3Scale: this._light3Scale,
      light3Dir: [...this._light3Dir],
      light3Color: [...this._light3Color],
      windowEmission: this._windowEmission,
      pointLights: this._pointLights,
      // The hand's mask and light ids are saved beside the lights, since a snapshot array carries neither.
      pointCarried: this._pointCarried,
      pointIds: this._pointIds,
      pointColor: this._pointColor,
      pointColors: this._pointColors,
      indirect: [this._indirect[0], this._indirect[1], this._indirect[2], this._indirect[3]],
      indirectColor: this._indirectColor,
      clearColor: [this._clearColor[0], this._clearColor[1], this._clearColor[2], this._clearColor[3]],
      proj: this._proj,
      view: this._view,
      lightDir: this._lightDir,
      camPos: [this._camPos[0], this._camPos[1], this._camPos[2]],
      worldViewportPx: this._worldViewportPx,
      realWindows: this._rw ? { rooms: this._rw.rooms, watch: this._rw.watch, live: this._rw.live } : null,
      rect,
    };
    this.setScreenOffset(0, 0);
    // `setup` runs after the save and before beginFrame, the only point where a pass can set its own fog and lighting.
    if (setup) setup();
    // Panels draw on the classic set; the lane is suspended for the bracket and restored after.
    this._panelLane = this._lane;
    if (this._lane) { this._lane = null; this._installWorldSet(this._classicSet); }
    this.setScreenScissor(rect.x, rect.y, rect.w, rect.h);
    gl.colorMask(false, false, false, false);
    this.beginFrame(proj, view, lightDir);
    gl.colorMask(true, true, true, true);
    // beginFrame may have resized the canvas, so re-arm the scissor and set the viewport again.
    this.setScreenScissor(rect.x, rect.y, rect.w, rect.h);
    // The DFU clear quad draws under beginFrame's full-canvas viewport, since screen quads use canvas pixels.
    if (clearRGBA) {
      this.drawScreenQuad(null, { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, undefined,
        [clearRGBA[0], clearRGBA[1], clearRGBA[2], clearRGBA[3]]);
    }
    gl.viewport(
      Math.round(rect.x), Math.round(this.canvas.height - (rect.y + rect.h)),
      Math.max(0, Math.round(rect.w)), Math.max(0, Math.round(rect.h)),
    );
  }

  endPanelFrame() {
    this._close2D();
    const s = this._panelSaved;
    if (!s) return;
    this._panelSaved = null;
    if (this._panelLane) { this._lane = this._panelLane; this._installWorldSet(this._laneSet); }
    this._panelLane = null;
    const gl = this.gl;
    this.setClipY(s.clipY);
    this.setAutomapMode(s.automapMode);
    this.setAutomapWater(s.automapWaterLevel, s.automapWaterColor);
    this.setFog(FOG_MODE_NAMES[s.fogMode] ?? 'off', s.fogDensity, s.fogRange[0], s.fogRange[1], s.fogColor);
    this._dwFog.set(s.dwFog);
    this._haze.set(s.haze);
    this._seaHaze.set(s.seaHaze);
    this.setLighting(s.ambient, s.sunScale, s.sunColor);
    this.setAmbientTrilight(s.ambientTri);
    this._clockLit = s.clockLit;
    this.setMoonlight(s.moonScale ? { scale: s.moonScale, dir: s.moonDir, color: s.moonColor } : null);
    this._moonDir[0] = s.moonDir[0]; this._moonDir[1] = s.moonDir[1]; this._moonDir[2] = s.moonDir[2];
    this._moonColor[0] = s.moonColor[0]; this._moonColor[1] = s.moonColor[1]; this._moonColor[2] = s.moonColor[2];
    this.setThirdLight(s.light3Scale ? { scale: s.light3Scale, dir: s.light3Dir, color: s.light3Color } : null);
    this._light3Dir[0] = s.light3Dir[0]; this._light3Dir[1] = s.light3Dir[1]; this._light3Dir[2] = s.light3Dir[2];
    this._light3Color[0] = s.light3Color[0]; this._light3Color[1] = s.light3Color[1];
    this._light3Color[2] = s.light3Color[2];
    this.setWindowEmission(s.windowEmission);
    this.setPointLights(s.pointLights, s.pointColor, s.pointColors);
    // setPointLights reads the mask off the array and a snapshot's has none, so it is restored here.
    this._pointCarried = s.pointCarried ?? null;
    this._pointIds = s.pointIds ?? null;
    this.setIndirectLight([s.indirect[0], s.indirect[1], s.indirect[2]], s.indirect[3], s.indirectColor);
    this._proj = s.proj; this._view = s.view; this._lightDir = s.lightDir;
    this._frameStamp++;
    this._camPos[0] = s.camPos[0]; this._camPos[1] = s.camPos[1]; this._camPos[2] = s.camPos[2];
    this._clearColor[0] = s.clearColor[0]; this._clearColor[1] = s.clearColor[1];
    this._clearColor[2] = s.clearColor[2]; this._clearColor[3] = s.clearColor[3];
    gl.clearColor(s.clearColor[0], s.clearColor[1], s.clearColor[2], s.clearColor[3]);
    // The draw-state baseline every entry point in this file assumes.
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    this.clearScreenScissor();
    this._worldViewportPx = s.worldViewportPx;
    if (s.realWindows && this._rw) Object.assign(this._rw, s.realWindows);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this._worldViewportPx) this._restoreWorldViewport();
    this.setScreenOffset(s.screenOffset[0], s.screenOffset[1]);
    this.markForeignPass();
  }

  panelFrame({ proj, view, lightDir, rect, clear = PANEL_CLEAR_RGBA, setup = null }, body) {
    this.beginPanelFrame(proj, view, lightDir, rect, clear, setup);
    try { return body(); } finally { this.endPanelFrame(); }
  }

  _rwFrame() {
    const rw = this._rw;
    if (!rw) return;
    rw.rooms = false; rw.watch = false; rw.live = false;
  }

  setWindowRooms(mode) {
    const rw = this._rw;
    if (!rw) return;
    rw.rooms = !!mode && mode !== 'off';
    this._rwKeepExterior();
  }

  _rwKeepExterior() {
    const k = (this._rwExterior ??= {
      ambient: new Float32Array(3), sunColor: new Float32Array(3), lightDir: new Float32Array([0, 1, 0]), moonDir: new Float32Array(3),
      moonColor: new Float32Array(3), fogColor: new Float32Array(3), emission: new Float32Array(3), pointColor: new Float32Array(3),
      points: new Float32Array(4 * 64), colors: new Float32Array(3 * 64), n: 0, hasColors: false, tri: null,
      sunScale: 0, moonScale: 0, fogMode: 0, fogDensity: 0, fogStart: 0, fogEnd: 0, taken: false,
      haze: new Float32Array(8),
    });
    const c3 = (dst, src) => { if (src) { dst[0] = src[0]; dst[1] = src[1]; dst[2] = src[2]; } };
    c3(k.ambient, this._ambient); c3(k.sunColor, this._sunColor); c3(k.lightDir, this._lightDir);
    k.sunScale = this._sunScale; k.moonScale = this._moonScale; c3(k.moonDir, this._moonDir); c3(k.moonColor, this._moonColor);
    // setAmbientTrilight replaces this array on every set rather than writing it in place, so keeping it is safe.
    k.tri = this._ambientTri;
    k.fogMode = this._fogMode; k.fogDensity = this._fogDensity; k.fogStart = this._fogRange[0]; k.fogEnd = this._fogRange[1];
    c3(k.fogColor, this._fogColor); c3(k.emission, this._windowEmission); c3(k.pointColor, this._pointColor);
    k.haze.set(this._haze);
    const p = this._pointLights, n = Math.min(p?.length ?? 0, k.points.length);
    if (n) k.points.set(p.subarray ? p.subarray(0, n) : p.slice(0, n));
    k.n = n;
    const cols = this._pointColors, cn = Math.min(cols?.length ?? 0, k.colors.length, (n / 4) * 3);
    k.hasColors = !!cols && cn > 0;
    if (k.hasColors) k.colors.set(cols.subarray ? cols.subarray(0, cn) : cols.slice(0, cn));
    k.taken = true;
  }

  _rwEnsureTarget(w, h) {
    let t = this._rwTarget;
    // The target never shrinks and grows per axis, so panes of different shapes reuse it.
    if (t && t.allocW >= w && t.allocH >= h) return t;
    if (t) { w = Math.max(w, t.allocW); h = Math.max(h, t.allocH); this.releaseOutsideView(); }
    const gl = this.gl;
    const tex = gl.createTexture();
    this._bindTex0(tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Never left on a unit, because its pass draws into it.
    this._bindTex0(null);
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    const paneTex = gl.createTexture();
    this._bindTex0(paneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this._bindTex0(null);
    t = this._rwTarget = { fbo: gl.createFramebuffer(), tex, rb, allocW: w, allocH: h, w, h, attached: false, proj: new Float32Array(16), pv: new Float32Array(16), planes: new Float32Array(24), fog: null,
      paneFbo: gl.createFramebuffer(), paneTex, paneAttached: false };
    return t;
  }

  _worldImageSize() {
    const img = this._retroFrame;
    if (img?.width > 0 && img?.height > 0) return [img.width, img.height];
    const v = this._worldViewportFrame;
    return [this.canvas.width * (v?.w > 0 ? v.w : 1), this.canvas.height * (v?.h > 0 ? v.h : 1)];
  }

  releaseOutsideView() {
    const t = this._rwTarget;
    if (!t) return;
    this._rwTarget = null;
    const gl = this.gl;
    gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); gl.deleteRenderbuffer(t.rb);
    gl.deleteFramebuffer(t.paneFbo); gl.deleteTexture(t.paneTex);
  }

  _rwDrawPanes(t, pv) {
    const n = this._rwPaneN;
    if (!n) return 0;
    this._close2D();
    const gl = this.gl;
    const P = (this._rwPaneProg ??= this._rwPaneProgram());
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.paneFbo);
    if (!t.paneAttached) { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t.paneTex, 0); t.paneAttached = true; }
    gl.viewport(0, 0, t.w, t.h);
    gl.depthMask(true); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
    this._use(P.p);
    gl.uniformMatrix4fv(P.pv, false, pv);
    let drew = 0;
    for (let i = 0; i < n; i++) {
      const p = this._rwPanes[i];
      if (!gl.isVertexArray(p.vao)) continue;
      gl.uniformMatrix4fv(P.model, false, p.m);
      this._bindVao(p.vao);
      gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_INT, p.start * 4);
      this.stats.draws++;
      drew++;
    }
    gl.enable(gl.CULL_FACE);
    return drew;
  }

  _rwPaneProgram() {
    const p = this._buildProgram(VIEW_PANE_VS, VIEW_PANE_FS), gl = this.gl;
    return { p, pv: gl.getUniformLocation(p, 'uPV'), model: gl.getUniformLocation(p, 'uModel') };
  }

  /**
   * @param {number[]} rect
   * @param {Float32Array} proj
   * @param {Float32Array} view
   * @param {{ setup?: (r: Renderer) => (ArrayLike<number> | void), draw: (info: { renderer: Renderer, proj: Float32Array, view: Float32Array, pv: Float32Array, planes: Float32Array, eye: number[] }) => void }} scene
   */
  outsideViewFrame(rect, proj, view, scene) {
    this._close2D();
    if (this._rwOutside || this._panelSaved || !this._rw || typeof scene?.draw !== 'function') return false;
    // Show an owed world image before this pass binds a framebuffer of its own.
    if (this._retroOwed || this._air?.pending) { if (this._worldViewportPx) this.endWorldPass(); this._compositeAir(); }
    const gl = this.gl;
    const [iw, ih] = this._worldImageSize();
    const size = viewTargetSize(rect, iw, ih);
    const t = this._rwEnsureTarget(size.allocW, size.allocH);
    t.w = size.w; t.h = size.h;
    const cropProj = cropProjection(proj, rect, t.proj);
    const was = this._rwOutside = {
      lane: this._lane, air: this._air, shadows: this._shadows, frameFbo: this._frameFbo, frameTarget: frameTarget(),
      ambient: this._ambient, ambientTri: this._ambientTri, sunScale: this._sunScale, sunColor: this._sunColor, clockLit: this._clockLit,
      moonScale: this._moonScale, moonDir: [...this._moonDir], moonColor: [...this._moonColor],
      fogMode: this._fogMode, fogDensity: this._fogDensity, fogRange: [this._fogRange[0], this._fogRange[1]], fogColor: this._fogColor,
      windowEmission: this._windowEmission, pointLights: this._pointLights, pointCarried: this._pointCarried, pointColor: this._pointColor, pointColors: this._pointColors,
      indirect: [this._indirect[0], this._indirect[1], this._indirect[2], this._indirect[3]], indirectColor: this._indirectColor,
      clearColor: [this._clearColor[0], this._clearColor[1], this._clearColor[2], this._clearColor[3]],
      proj: this._proj, view: this._view, lightDir: this._lightDir, camPos: [this._camPos[0], this._camPos[1], this._camPos[2]],
      worldViewportPx: this._worldViewportPx, rw: { rooms: this._rw.rooms, watch: this._rw.watch, live: this._rw.live },
    };
    let drew = false, panes = 0, begun = false;
    try {
      if (this._lane) { this._lane = null; this._installWorldSet(this._classicSet); }
      this._air = null; this._shadows = null;
      panes = this._rwDrawPanes(t, mat4Multiply(cropProj, view, t.pv));
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      if (!t.attached) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.rb);
        t.attached = true;
      }
      this._frameFbo = t.fbo; setFrameTarget(t.fbo);
      const k = this._rwExterior;
      if (k?.taken) {
        this.setLighting(new Float32Array(k.ambient), k.sunScale, new Float32Array(k.sunColor), k.tri);
        this.setMoonlight(k.moonScale ? { scale: k.moonScale, dir: k.moonDir, color: k.moonColor } : null);
        this.setFog(FOG_MODE_NAMES[k.fogMode] ?? 'off', k.fogDensity, k.fogStart, k.fogEnd, new Float32Array(k.fogColor));
        this.setJungleHaze(k.haze[4] ? k.haze : null);
        this.setWindowEmission(new Float32Array(k.emission));
        this.setPointLights(k.points.slice(0, k.n), new Float32Array(k.pointColor), k.hasColors ? k.colors.slice(0, (k.n / 4) * 3) : null);
      }
      this.setIndirectLight([0, 0, 0], 0, new Float32Array(3));
      const sunDir = scene.setup?.(this);
      if (!k?.taken) {
        const day = Math.min(1, Math.max(0, this._sunScale / 0.6)), f = 0.1 + 0.9 * day;
        this.setFog('linear', 0, 0, 2400, new Float32Array([SKY_CLEAR[0] * f, SKY_CLEAR[1] * f, SKY_CLEAR[2] * f]));
      }
      t.fog = Float32Array.from(this._fogColor);
      this.setClearColor(VIEW_OUT_CLEAR);
      this.beginFrame(cropProj, view, sunDir ?? (k?.taken ? k.lightDir : this._lightDir)); begun = true;
      // Set again after the frame's begin, so a sprite pass that restores the frame target restores this one.
      this._frameFbo = t.fbo; setFrameTarget(t.fbo);
      gl.viewport(0, 0, t.w, t.h);
      this._worldViewportPx = [0, 0, t.w, t.h];
      this._rw.rooms = true;
      if (panes && this.rwLocs?.paneOn) {
        this._use(this.program);
        this._activeTexture(gl.TEXTURE0 + VIEW_PANE_UNIT); gl.bindTexture(gl.TEXTURE_2D, t.paneTex); this._activeTexture(gl.TEXTURE0);
        gl.uniform1i(this.rwLocs.pane, VIEW_PANE_UNIT);
        gl.uniform1f(this.rwLocs.paneOn, 1);
        this._rwPaneOn = true;
      }
      mat4Multiply(cropProj, view, t.pv);
      spherePlanes(t.pv, t.planes);
      const info = { renderer: this, proj: cropProj, view, pv: t.pv, planes: t.planes, eye: [this._camPos[0], this._camPos[1], this._camPos[2]] };
      scene.draw(info);
      for (const f of this.outsideViewDraws) f(info);
      drew = true;
    } catch (e) {
      console.warn('[real windows] the view out could not be drawn', e?.message ?? e);
    } finally {
      this._rwViewDraws = (begun ? this.stats.draws : 0) + panes;
      // The panes belong to this pass alone: turn them off and empty the unit.
      if (this._rwPaneOn) {
        this._use(this.program); gl.uniform1f(this.rwLocs.paneOn, 0); gl.uniform1i(this.rwLocs.pane, 0);
        this._activeTexture(gl.TEXTURE0 + VIEW_PANE_UNIT); gl.bindTexture(gl.TEXTURE_2D, null); this._activeTexture(gl.TEXTURE0);
        this._rwPaneOn = false;
      }
      // Restore the baseline draw state even after a throw, or the depth mask stays off and the next depth clear fails.
      gl.colorMask(true, true, true, true); gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
      this.clearScreenScissor();
      this._worldViewportPx = was.worldViewportPx;
      this._frameFbo = was.frameFbo; setFrameTarget(was.frameTarget);
      gl.bindFramebuffer(gl.FRAMEBUFFER, was.frameTarget ?? null);
      this._air = was.air; this._shadows = was.shadows;
      if (was.lane) { this._lane = was.lane; this._installWorldSet(this._laneSet); }
      this.setFog(FOG_MODE_NAMES[was.fogMode] ?? 'off', was.fogDensity, was.fogRange[0], was.fogRange[1], was.fogColor);
      this.setLighting(was.ambient, was.sunScale, was.sunColor);
      this.setAmbientTrilight(was.ambientTri);
      this._clockLit = was.clockLit;
      this.setMoonlight(was.moonScale ? { scale: was.moonScale, dir: was.moonDir, color: was.moonColor } : null);
      this._moonDir[0] = was.moonDir[0]; this._moonDir[1] = was.moonDir[1]; this._moonDir[2] = was.moonDir[2];
      this._moonColor[0] = was.moonColor[0]; this._moonColor[1] = was.moonColor[1]; this._moonColor[2] = was.moonColor[2];
      this.setWindowEmission(was.windowEmission);
      this.setPointLights(was.pointLights, was.pointColor, was.pointColors);
      this._pointCarried = was.pointCarried ?? null;
      this._pointIds = was.pointIds ?? null;
      this.setIndirectLight([was.indirect[0], was.indirect[1], was.indirect[2]], was.indirect[3], was.indirectColor);
      this.setClearColor(was.clearColor);
      this._proj = was.proj; this._view = was.view; this._lightDir = was.lightDir;
      this._camPos[0] = was.camPos[0]; this._camPos[1] = was.camPos[1]; this._camPos[2] = was.camPos[2];
      Object.assign(this._rw, was.rw);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      if (this._worldViewportPx) this._restoreWorldViewport();
      this.markForeignPass();
      this._rwOutside = null;
    }
    return drew;
  }

  /**
   * @param {WebGLFramebuffer} fbo
   * @param {number} w
   * @param {number} h
   * @param {Float32Array} proj
   * @param {Float32Array} view
   * @param {{ useKeptExterior?: boolean, setup?: (r: Renderer) => (ArrayLike<number> | void), draw: (info: { renderer: Renderer, proj: Float32Array, view: Float32Array, pv: Float32Array, planes: Float32Array, eye: number[] }) => void }} scene
   */
  portalViewFrame(fbo, w, h, proj, view, scene) {
    this._close2D();
    if (!fbo || this._rwOutside || this._panelSaved || !this._rw || typeof scene?.draw !== 'function') return false;
    if (this._retroOwed || this._air?.pending) { if (this._worldViewportPx) this.endWorldPass(); this._compositeAir(); }
    const gl = this.gl;
    const pv = (this._portalPv ??= new Float32Array(16));
    const planes = (this._portalPlanes ??= new Float32Array(24));
    const was = this._rwOutside = {
      lane: this._lane, air: this._air, shadows: this._shadows, frameFbo: this._frameFbo, frameTarget: frameTarget(),
      ambient: this._ambient, ambientTri: this._ambientTri, sunScale: this._sunScale, sunColor: this._sunColor, clockLit: this._clockLit,
      moonScale: this._moonScale, moonDir: [...this._moonDir], moonColor: [...this._moonColor],
      fogMode: this._fogMode, fogDensity: this._fogDensity, fogRange: [this._fogRange[0], this._fogRange[1]], fogColor: this._fogColor,
      windowEmission: this._windowEmission, pointLights: this._pointLights, pointCarried: this._pointCarried, pointIds: this._pointIds, pointColor: this._pointColor, pointColors: this._pointColors,
      indirect: [this._indirect[0], this._indirect[1], this._indirect[2], this._indirect[3]], indirectColor: this._indirectColor,
      clearColor: [this._clearColor[0], this._clearColor[1], this._clearColor[2], this._clearColor[3]],
      proj: this._proj, view: this._view, lightDir: this._lightDir, camPos: [this._camPos[0], this._camPos[1], this._camPos[2]],
      worldViewportPx: this._worldViewportPx, rw: { rooms: this._rw.rooms, watch: this._rw.watch, live: this._rw.live },
    };
    let drew = false;
    try {
      if (this._lane) { this._lane = null; this._installWorldSet(this._classicSet); }
      this._air = null; this._shadows = null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      this._frameFbo = fbo; setFrameTarget(fbo);
      const k = scene.useKeptExterior ? this._rwExterior : null;
      if (k?.taken) {
        this.setLighting(new Float32Array(k.ambient), k.sunScale, new Float32Array(k.sunColor), k.tri);
        this.setMoonlight(k.moonScale ? { scale: k.moonScale, dir: k.moonDir, color: k.moonColor } : null);
        this.setFog(FOG_MODE_NAMES[k.fogMode] ?? 'off', k.fogDensity, k.fogStart, k.fogEnd, new Float32Array(k.fogColor));
        this.setJungleHaze(k.haze[4] ? k.haze : null);
        this.setWindowEmission(new Float32Array(k.emission));
        this.setPointLights(k.points.slice(0, k.n), new Float32Array(k.pointColor), k.hasColors ? k.colors.slice(0, (k.n / 4) * 3) : null);
      }
      this.setIndirectLight([0, 0, 0], 0, new Float32Array(3));
      const sunDir = scene.setup?.(this);
      if (scene.useKeptExterior && !k?.taken) {
        const day = Math.min(1, Math.max(0, this._sunScale / 0.6)), f = 0.1 + 0.9 * day;
        this.setFog('linear', 0, 0, 2400, new Float32Array([SKY_CLEAR[0] * f, SKY_CLEAR[1] * f, SKY_CLEAR[2] * f]));
      }
      this.beginFrame(proj, view, sunDir ?? (k?.taken ? k.lightDir : this._lightDir));
      this._frameFbo = fbo; setFrameTarget(fbo);
      gl.viewport(0, 0, w, h);
      this._worldViewportPx = [0, 0, w, h];
      this._rw.rooms = !!scene.useKeptExterior;
      this._rw.watch = false;
      this._rw.live = false;
      mat4Multiply(proj, view, pv);
      spherePlanes(pv, planes);
      scene.draw({ renderer: this, proj, view, pv, planes, eye: [this._camPos[0], this._camPos[1], this._camPos[2]] });
      drew = true;
    } catch (e) {
      console.warn('[portal view] offscreen pass failed', e?.message ?? e);
    } finally {
      gl.colorMask(true, true, true, true); gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
      this.clearScreenScissor();
      this._worldViewportPx = was.worldViewportPx;
      this._frameFbo = was.frameFbo; setFrameTarget(was.frameTarget);
      gl.bindFramebuffer(gl.FRAMEBUFFER, was.frameTarget ?? null);
      this._air = was.air; this._shadows = was.shadows;
      if (was.lane) { this._lane = was.lane; this._installWorldSet(this._laneSet); }
      this.setFog(FOG_MODE_NAMES[was.fogMode] ?? 'off', was.fogDensity, was.fogRange[0], was.fogRange[1], was.fogColor);
      this.setLighting(was.ambient, was.sunScale, was.sunColor);
      this.setAmbientTrilight(was.ambientTri);
      this._clockLit = was.clockLit;
      this.setMoonlight(was.moonScale ? { scale: was.moonScale, dir: was.moonDir, color: was.moonColor } : null);
      this._moonDir[0] = was.moonDir[0]; this._moonDir[1] = was.moonDir[1]; this._moonDir[2] = was.moonDir[2];
      this._moonColor[0] = was.moonColor[0]; this._moonColor[1] = was.moonColor[1]; this._moonColor[2] = was.moonColor[2];
      this.setWindowEmission(was.windowEmission);
      this.setPointLights(was.pointLights, was.pointColor, was.pointColors);
      this._pointCarried = was.pointCarried ?? null;
      this._pointIds = was.pointIds ?? null;
      this.setIndirectLight([was.indirect[0], was.indirect[1], was.indirect[2]], was.indirect[3], was.indirectColor);
      this.setClearColor(was.clearColor);
      this._proj = was.proj; this._view = was.view; this._lightDir = was.lightDir;
      this._camPos[0] = was.camPos[0]; this._camPos[1] = was.camPos[1]; this._camPos[2] = was.camPos[2];
      Object.assign(this._rw, was.rw);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      if (this._worldViewportPx) this._restoreWorldViewport();
      this.markForeignPass();
      this._rwOutside = null;
    }
    return drew;
  }

  /**
   * Run a sanctum interior frame on the classic world set so lighting matches portalViewFrame 1:1
   * while leaving exterior shadow cubemaps and eye-adaptation untouched.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  withClassicSanctumFrame(fn) {
    if (this._retroOwed || this._air?.pending) {
      if (this._worldViewportPx) this.endWorldPass();
      this._compositeAir();
    }
    const wasLane = this._lane, wasAir = this._air, wasShadows = this._shadows;
    if (wasLane) { this._lane = null; this._installWorldSet(this._classicSet); }
    this._air = null; this._shadows = null;
    try {
      return fn();
    } finally {
      if (this._retroOwed) {
        if (this._worldViewportPx) this.endWorldPass();
        this._presentRetroFrame();
      }
      this._air = wasAir; this._shadows = wasShadows;
      if (wasLane) { this._lane = wasLane; this._installWorldSet(this._laneSet); }
    }
  }

  _rwSkips(mesh) { return !!this._rwOutside && !!this.outsideViewSkip?.has(mesh); }

  /** @param {{ rect: number[], view: boolean } | null} vo */
  setGlassView(vo) {
    const rw = this._rw;
    if (!rw) return;
    rw.watch = true;
    rw.live = false;
    this._rwPv = mat4Multiply(this._proj, this._view, this._rwPv ?? new Float32Array(16));
    if (!vo?.rect) return;
    this._close2D();
    const gl = this.gl;
    const vp = this._worldViewportPx ?? [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight];
    rw.rect[0] = vp[0] + (vo.rect[0] + 1) / 2 * vp[2]; rw.rect[1] = vp[1] + (vo.rect[1] + 1) / 2 * vp[3];
    rw.rect[2] = vp[0] + (vo.rect[2] + 1) / 2 * vp[2]; rw.rect[3] = vp[1] + (vo.rect[3] + 1) / 2 * vp[3];
    rw.rectGen++;
    const t = this._rwTarget;
    const street = !!vo.view && !!t;
    const P = (this._rwBg ??= this._rwBgProgram());
    this._use(P.p);
    gl.uniform4f(P.rect, vo.rect[0], vo.rect[1], vo.rect[2], vo.rect[3]);
    const rays = viewRays(this._proj, this._view);
    gl.uniform3fv(P.rayX, rays.x); gl.uniform3fv(P.rayY, rays.y); gl.uniform3fv(P.rayZ, rays.z);
    const sky = viewSkyFrom((street ? t.fog : null) ?? (this._rwExterior?.taken ? this._rwExterior.fogColor : null));
    gl.uniform3fv(P.zenith, sky.zenith); gl.uniform3fv(P.horizon, sky.horizon);
    gl.uniform1f(P.has, street ? 1 : 0);
    gl.uniform2f(P.scale, street ? t.w / t.allocW : 1, street ? t.h / t.allocH : 1);
    gl.uniform1i(P.view, 0);
    this._bindTex0(street ? t.tex : null);
    this._bindVao(this._rwEmptyVao ??= gl.createVertexArray());
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.stats.draws++;
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    // Never left on a unit, because the next view out draws into it.
    this._bindTex0(null);
    this._bindVao(null);
    rw.live = street;
  }

  _rwBgProgram() {
    const p = this._buildProgram(VIEW_BG_VS, VIEW_BG_FS), gl = this.gl;
    const u = (n) => gl.getUniformLocation(p, n);
    return { p, rect: u('uRect'), view: u('uView'), scale: u('uViewScale'), has: u('uHasView'), rayX: u('uRayX'), rayY: u('uRayY'), rayZ: u('uRayZ'), zenith: u('uZenith'), horizon: u('uHorizon') };
  }

  takeGlassRect() {
    const a = this._rwAcc;
    if (a) { const kept = this._rwPanes; this._rwPanes = a.panes; this._rwPaneN = a.n ? a.np : 0; a.panes = kept; a.np = 0; }
    if (!a || !a.n) { if (a) a.holes = false; return null; }
    const out = { rect: [a.rect[0], a.rect[1], a.rect[2], a.rect[3]], holes: a.holes };
    a.n = 0; a.holes = false; a.rect[0] = 1; a.rect[1] = 1; a.rect[2] = -1; a.rect[3] = -1;
    return out;
  }

  _rwSubMesh(sm, modelMatrix, mesh = null) {
    const L = this.rwLocs;
    if (!L) return;
    const gl = this.gl, rw = this._rw;
    const kind = sm._evWin ?? GLASS_NONE, cut = sm._evCut ? 1 : 0;
    const mode = rw && kind !== GLASS_NONE ? winModeFor(kind, rw.rooms, rw.live) : 0;
    if (mode === 1) this._rwRoomLight();
    else if (mode === 3 && this._rwRectUp !== rw.rectGen) { gl.uniform4fv(L.rect, rw.rect); this._rwRectUp = rw.rectGen; }
    if (mode !== this._rwModeUp) { gl.uniform1f(L.mode, mode); this._rwModeUp = mode; }
    if (cut !== this._rwCutUp) { gl.uniform1f(L.cut, cut); this._rwCutUp = cut; }
    if (rw?.watch && (kind !== GLASS_NONE || cut)) this._rwWatch(sm, modelMatrix, !!cut, mesh);
  }

  _rwRoomLight() {
    const e = this._windowEmission, a = this._ambient;
    if (this._rwLightE === e && this._rwLightA === a) return;
    this._rwLightE = e; this._rwLightA = a;
    const l = roomLightFor(e, a), L = this.rwLocs, gl = this.gl;
    const lamp = this._c3(l.lamp, this._decA);
    gl.uniform4f(L.lamp, lamp[0], lamp[1], lamp[2], l.night);
    gl.uniform3fv(L.day, this._c3(l.day, this._decB));
  }

  _rwWatch(sm, m, holes, mesh = null) {
    const a = this._rwAcc, pv = this._rwPv;
    if (!a || !pv) return;
    const n0 = a.n;
    const s = sm.pieces ?? sm._bounds;
    const sc = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
    const q = (this._rwQ ??= [0, 0, 0, 0]);
    for (let i = 0; i + 3 < (s ? s.length : 4); i += 4) {
      let r;
      if (s) {
        const x = s[i], y = s[i + 1], z = s[i + 2];
        r = sphereNdcRect(pv, m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], s[i + 3] * sc, q);
      } else { q[0] = -1; q[1] = -1; q[2] = 1; q[3] = 1; r = q; }
      if (!r) continue;
      if (r[0] < a.rect[0]) a.rect[0] = r[0]; if (r[1] < a.rect[1]) a.rect[1] = r[1];
      if (r[2] > a.rect[2]) a.rect[2] = r[2]; if (r[3] > a.rect[3]) a.rect[3] = r[3];
      a.n++;
      if (holes) a.holes = true;
    }
    if (a.n > n0 && mesh?.vao && a.np < VIEW_PANES_MAX) {
      const p = (a.panes[a.np] ??= { vao: null, start: 0, count: 0, m: new Float32Array(16) });
      p.vao = mesh.vao; p.start = sm.startIndex; p.count = sm.primitiveCount * 3; p.m.set(m);
      a.np++;
    }
  }

  uploadGlassMask(archive, record, color32, opts = {}) {
    const key = `${archive}_${record}`;
    if (this.glassMasks.has(key)) { this._uploadSink?.(true, key); return this.glassMasks.get(key); }
    if (this.emissionTextures.has(key)) return null;
    const tex = this.uploadEmissionTexture(archive, record, color32, { replacement: !!opts.replacement });
    this.emissionTextures.delete(key);
    this.emissionWhite.delete(key);
    this.windowMasks.delete(key);
    this.glassMasks.set(key, tex);
    this._texGen++;
    return tex;
  }

  // Reset so no other pass on the mesh program inherits the window mode or the cutout.
  _rwRest() {
    const L = this.rwLocs;
    if (!L) return;
    if (this._rwModeUp !== 0) { this.gl.uniform1f(L.mode, 0); this._rwModeUp = 0; }
    if (this._rwCutUp !== 0) { this.gl.uniform1f(L.cut, 0); this._rwCutUp = 0; }
  }

  setWindowEmission(rgb) {
    this._windowEmission = rgb;
  }

  setMoonlight(moon) {
    this._frameStamp++;
    if (!moon) { this._moonScale = 0; return; }
    this._moonScale = moon.scale;
    this._moonDir[0] = moon.dir[0]; this._moonDir[1] = moon.dir[1]; this._moonDir[2] = moon.dir[2];
    this._moonColor[0] = moon.color[0]; this._moonColor[1] = moon.color[1]; this._moonColor[2] = moon.color[2];
  }

  setThirdLight(light) {
    if (!light) { this._light3Scale = 0; return; }
    this._light3Scale = light.scale;
    this._light3Dir[0] = light.dir[0]; this._light3Dir[1] = light.dir[1]; this._light3Dir[2] = light.dir[2];
    this._light3Color[0] = light.color[0]; this._light3Color[1] = light.color[1];
    this._light3Color[2] = light.color[2];
  }

  setLightDir(dir) {
    this._lightDir = dir;
    this._frameStamp++;
  }

  // Setters only shadow and beginFrame uploads; this uploads now for passes that relight between draws.
  uploadLighting() {
    const gl = this.gl;
    this._use(this.program);
    gl.uniform3fv(this.uLightDir, this._lightDir);
    gl.uniform3fv(this.uAmbient, this._c3(this._ambient));
    this._uploadTrilight();
    gl.uniform1f(this.uSunScale, this._sunScale);
    gl.uniform3fv(this.uSunColor, this._c3(this._sunColor));
    gl.uniform3fv(this.uMoonDir, this._moonDir);
    gl.uniform1f(this.uMoonScale, this._moonScale);
    gl.uniform3fv(this.uMoonColor, this._c3(this._moonColor));
    gl.uniform3fv(this.uLight3Dir, this._light3Dir);
    gl.uniform1f(this.uLight3Scale, this._light3Scale);
    gl.uniform3fv(this.uLight3Color, this._c3(this._light3Color));
  }

  setLighting(ambient, sunScale, sunColor, trilight = null) {
    this._ambient = ambient;
    this._sunScale = sunScale;
    if (sunColor) this._sunColor = sunColor;
    this._clockLit = true;
    // Every other caller passes flat light, so the trilight of a dungeon never outlives the dungeon.
    this.setAmbientTrilight(trilight);
  }

  setAmbientTrilight(tri) {
    this._ambientTri = tri ? { sky: new Float32Array(tri.sky), ground: new Float32Array(tri.ground) } : null;
    this._frameStamp++;
  }
  _uploadTrilight() {
    const gl = this.gl;
    const tri = this._ambientTri;
    gl.uniform1f(this.uTrilight, tri ? 1 : 0);
    if (tri) { gl.uniform3fv(this.uAmbientSky, this._c3(tri.sky)); gl.uniform3fv(this.uAmbientGround, this._c3(tri.ground)); }
  }

  // Set every frame before beginFrame, which reads it; a beginFrame with no setFocus before it clears it.
  /** @param {number[]|null} p */
  setFocus(p, wide = true) {
    this._focusArmed = true;
    this._focusWide = !!p && !!wide;
    const f = this._focus;
    if (p) { f[0] = p[0]; f[1] = p[1]; f[2] = p[2]; f[3] = 1; }
    else if (f[3] === 0) return;
    else f.fill(0);
    this._frameStamp++;
  }
  _shadowEye() { return this._focus[3] > 0.5 ? this._focus.subarray(0, 3) : this._camPos; }
  get focus() { return this._focus; }

  setFogColor(color) { if (color) { this._fogColor = color; this._frameStamp++; } }

  setFog(mode, density, start, end, color) {
    this._fogMode = mode === 'linear' ? 1 : mode === 'exp' ? 2 : mode === 'exp2' ? 3 : 0;
    this._fogDensity = density;
    this._fogRange[0] = start;
    this._fogRange[1] = end;
    if (color) this._fogColor = color;
    this._frameStamp++;
  }

  // Set after beginFrame, which clears it; uploads to the mesh program now, since beginFrame alone sets its fog.
  setWaterFog(u) {
    if (u) this._dwFog.set(u);
    else this._dwFog[0] = 0;
    this._frameStamp++;
    const loc = this._solidFog?.dwFog;
    if (loc) { this._use(this.program); this.gl.uniform4fv(loc, this._dwFog); }
  }

  // Arms the frame's haze, which the next beginFrame clears unless this runs again; the mesh program takes it now.
  setJungleHaze(u) {
    if (!u && this._haze[4] === 0) return;
    if (u) { this._haze.set(u); this._hazeArmed = true; } else this._haze[4] = 0;
    this._frameStamp++;
    const loc = this._solidFog?.haze;
    if (loc) { this._use(this.program); this.gl.uniform4fv(loc, this._haze); if (this.program !== null && typeof this.program === 'object') this._hazeOn.set(this.program, this._haze[4] !== 0); }
  }

  setSeaHaze(hold, seaY = 0) {
    if (hold == null) { this._seaHaze[0] = 0; return; }
    this._seaHaze[0] = hold; this._seaHaze[1] = seaY;
  }

  setWaterColumn(c) { this._dwColumn = c ?? null; this._frameStamp++; }

  _uploadFog(prog) {
    const gl = this.gl;
    gl.uniform3fv(prog.fogColor, this._fogColor);
    gl.uniform1i(prog.fogMode, this._fogMode);
    gl.uniform1f(prog.fogDensity, this._fogDensity);
    gl.uniform2fv(prog.fogRange, this._fogRange);
    gl.uniform3fv(prog.camPos, this._camPos);
    if (prog.focus) gl.uniform4fv(prog.focus, this._focus);
    if (prog.dwFog) gl.uniform4fv(prog.dwFog, this._dwFog);
    // Haze state is keyed by GL program, because a set re-install makes new location tables for the same program.
    const bound = this._lastProgram, keyed = bound !== null && typeof bound === 'object';
    if (prog.haze && (this._haze[4] !== 0 || (keyed && this._hazeOn.get(bound)))) { gl.uniform4fv(prog.haze, this._haze); if (keyed) this._hazeOn.set(bound, this._haze[4] !== 0); }
    if (prog.clipY) gl.uniform1f(prog.clipY, this._clipY);
    if (prog.amMode) gl.uniform1f(prog.amMode, this._automapMode);
    if (prog.amWaterLevel) gl.uniform1f(prog.amWaterLevel, this._automapWaterLevel);
    if (prog.amWaterColor) gl.uniform4fv(prog.amWaterColor, this._automapWaterColor);
  }

  // Uploads at once, because the automap lifts the slice mid-pass.
  setClipY(y) {
    this._clipY = y ?? 1e9;
    if (this._solidFog?.clipY) {
      const gl = this.gl;
      this._use(this.program);
      gl.uniform1f(this._solidFog.clipY, this._clipY);
    }
  }

  setDissolve(v) {
    const k = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
    if (k === (this._dissolve ?? 1)) return;
    this._dissolve = k;
    if (this.uDissolveCut) {
      this._use(this.program);
      // The uniform holds the share cut, so its initial 0 means whole.
      this.gl.uniform1f(this.uDissolveCut, 1 - k);
    }
  }

  // Sets the blend with the mode so they cannot drift; depth writes stay on unsorted, as in DFU's automap shader.
  setAutomapMode(m) {
    this._automapMode = m ?? 0;
    const gl = this.gl;
    if (this._solidFog?.amMode) {
      this._use(this.program);
      gl.uniform1f(this._solidFog.amMode, this._automapMode);
    }
    if (this._automapMode >= AUTOMAP_MODE.ABOVE_TRANSPARENT_COLOUR) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.disable(gl.BLEND);
    }
    gl.depthMask(true);
  }

  setAutomapWater(level, rgba = null) {
    this._automapWaterLevel = level ?? AUTOMAP_NO_WATER;
    if (rgba) this._automapWaterColor.set(rgba);
    const f = this._solidFog;
    if (!f?.amWaterLevel && !f?.amWaterColor) return;
    const gl = this.gl;
    this._use(this.program);
    if (f.amWaterLevel) gl.uniform1f(f.amWaterLevel, this._automapWaterLevel);
    if (f.amWaterColor) gl.uniform4fv(f.amWaterColor, this._automapWaterColor);
  }

  // The arrays are kept, not copied, so a host that writes one in place mid-frame must pass it here again.
  setPointLights(data, color, colors = null) {
    const n = this.maxPointLights;
    // The carried mask and light ids live on the composed array, and subarray drops them, so they are lifted first.
    const ids = lightIdsOf(data);
    this._pointIds = ids ? ids.subarray(0, n) : null;
    const carried = data.carried ?? null;
    this._pointCarried = carried ? carried.subarray(0, n) : null;
    this._pointLights = data.subarray ? data.subarray(0, n * 4) : data;
    if (color) this._pointColor = color;
    this._pointColors = colors ? (colors.subarray ? colors.subarray(0, n * 3) : colors) : null;
    this._pointColorGen++;
    this._frameStamp++;
  }

  // Call after setPointLights; the flash goes into slot 0 of the arrays that call stored.
  setFlashLight(light) {
    this._flashLight = light ?? null;
    if (!light) return;
    const data = this._pointLights, colors = this._pointColors, f = light;
    const keep = Math.min(this.maxPointLights - 1, Math.floor(data.length / 4));
    const out = this._flashLightScratch;
    packLight(out, 0, f);
    out.set(data.subarray ? data.subarray(0, keep * 4) : data.slice(0, keep * 4), 4);
    this._pointLights = out.subarray(0, (keep + 1) * 4);
    if (this._pointCarried) {
      const m = this._flashCarriedScratch;
      m[0] = 0; m.set(this._pointCarried.subarray(0, keep), 1);
      this._pointCarried = m.subarray(0, keep + 1);
    }
    if (this._pointIds) {
      const m = out.ids;
      m.set(this._pointIds.subarray(0, keep), 1);
      this._pointIds = m.subarray(0, keep + 1);
    }
    const c = this._flashColorScratch;
    c[0] = f.color[0]; c[1] = f.color[1]; c[2] = f.color[2];
    if (colors) {
      c.set(colors.subarray ? colors.subarray(0, keep * 3) : colors.slice(0, keep * 3), 3);
    } else {
      for (let i = 0; i < keep; i++) { c[3 + i * 3] = this._pointColor[0]; c[4 + i * 3] = this._pointColor[1]; c[5 + i * 3] = this._pointColor[2]; }
    }
    this._pointColors = c.subarray(0, (keep + 1) * 3);
    this._pointColorGen++;
    this._frameStamp++;
  }

  _pointColorData(count, raw = false) {
    const lane = this._lane;
    if (lane && !raw && this._pointColorDecGen === this._pointColorGen && this._pointColorDecLane === lane && this._pointColorDecCount >= count) {
      return this._pointColorDec.subarray(0, count * 3);
    }
    let out;
    if (this._pointColors) out = count * 3 < this._pointColors.length ? this._pointColors.subarray(0, count * 3) : this._pointColors;
    else {
      const s = this._pointColorScratch;
      for (let i = 0; i < count * 3; i += 3) {
        s[i] = this._pointColor[0]; s[i + 1] = this._pointColor[1]; s[i + 2] = this._pointColor[2];
      }
      out = s.subarray(0, count * 3);
    }
    if (!lane || raw) return out;
    const dec = lane.decodeN(out, this._pointColorDec, count);
    this._pointColorDecGen = this._pointColorGen; this._pointColorDecLane = lane; this._pointColorDecCount = count;
    return dec;
  }

  // Answers in display space, because screen quads draw after the lane resolves the frame.
  /**
   * @param {number[]|null} pos
   * @param {number} [floor]
   * @param {number[]} [out]
   * @returns {number[]}
   */
  flatLightAt(pos = null, floor = FLAT_LIGHT_FLOOR, out = [0, 0, 0]) {
    if (!this._clockLit) { out[0] = 1; out[1] = 1; out[2] = 1; return out; }
    const p = pos ?? this._camPos;
    const am = this._ambient, mc = this._moonColor, sc = this._sunColor;
    out[0] = am[0] + mc[0] * this._moonScale * 0.5 + sc[0] * this._sunScale * 0.5;
    out[1] = am[1] + mc[1] * this._moonScale * 0.5 + sc[1] * this._sunScale * 0.5;
    out[2] = am[2] + mc[2] * this._moonScale * 0.5 + sc[2] * this._sunScale * 0.5;
    const count = this._pointLights.length >> 2;
    if (count > 0) {
      const colors = this._pointColorData(count, true);
      for (let i = 0; i < count; i++) {
        const dx = this._pointLights[i * 4] - p[0];
        const dy = this._pointLights[i * 4 + 1] - p[1];
        const dz = this._pointLights[i * 4 + 2] - p[2];
        const range = this._pointLights[i * 4 + 3];
        if (!(range > 0)) continue;
        const att = Math.max(0, Math.min(1, 1 - Math.hypot(dx, dy, dz) / range));
        const a2 = att * att;
        if (a2 <= 0) continue;
        out[0] += a2 * colors[i * 3]; out[1] += a2 * colors[i * 3 + 1]; out[2] += a2 * colors[i * 3 + 2];
      }
    }
    const iRange = this._indirect[3];
    if (iRange > 0) {
      const iAtt = Math.max(0, Math.min(1, 1 - Math.hypot(
        this._indirect[0] - p[0], this._indirect[1] - p[1], this._indirect[2] - p[2]) / iRange));
      const i2 = iAtt * iAtt;
      out[0] += i2 * this._indirectColor[0];
      out[1] += i2 * this._indirectColor[1];
      out[2] += i2 * this._indirectColor[2];
    }
    for (let i = 0; i < 3; i++) out[i] = Math.max(floor, Math.min(1, out[i]));
    return out;
  }

  setIndirectLight(pos, range, scaledColor) {
    this._indirect[0] = pos[0]; this._indirect[1] = pos[1]; this._indirect[2] = pos[2];
    this._indirect[3] = range;
    this._indirectColor = scaledColor;
    this._frameStamp++;
  }

  uploadEmissionTexture(archive, record, color32, opts = {}) {
    // The emission map keys with the albedo sampler, since the shader subtracts one sample from the other.
    const key = `${archive}_${record}${opts.sampler ? samplerKey(opts.sampler) : ''}`;
    this._uploadSink?.(true, key);
    if (opts.white) this.emissionWhite.add(key);
    if (opts.window) (this.windowMasks ??= new Set()).add(key);
    if (this.emissionTextures.has(key)) return this.emissionTextures.get(key);
    const gl = this.gl;
    const tex = gl.createTexture();
    this._activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._forgetTextureShadows();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, color32.width, color32.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, color32Bytes(color32, `uploadEmissionTexture(${archive}, ${record})`)
    );
    const own = opts.sampler ? samplerParams(gl, opts.sampler, true) : null;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, own ? own.wrapS : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, own ? own.wrapT : gl.REPEAT);
    // Same mip chain and point sampling as the albedo, as in DFU, so both samples come from one mip level.
    gl.generateMipmap?.(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, own ? own.min : (gl.NEAREST_MIPMAP_NEAREST ?? gl.NEAREST));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, own ? own.mag : gl.NEAREST);
    if (opts.replacement) { if (tex) this._replacements.add(tex); }
    else if (!this._retroMips) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
    this._activeTexture(gl.TEXTURE0);
    this.emissionTextures.set(key, tex);
    this._texGen++;
    return tex;
  }

  _bbArenaFor(quads, key = null) {
    // A batch goes first to the last arena of its key, so a texture-sorted run stays in one arena.
    if (this._bbArenaOfKey.size > BB_ARENA_HOMES_MAX) this._bbArenaOfKey.clear();
    const home = key != null ? this._bbArenaOfKey.get(key) : undefined;
    if (home) {
      const at = arenaTake(home.free, quads);
      if (at >= 0) { home.taken = at; return home; }
    }
    for (const a of this._bbArenas) {
      if (a === home) continue;
      const at = arenaTake(a.free, quads);
      if (at >= 0) { a.taken = at; if (key != null) this._bbArenaOfKey.set(key, a); return a; }
    }
    const last = this._bbArenas.length ? this._bbArenas[this._bbArenas.length - 1].cap : 0;
    const gl = this.gl, cap = Math.max(last ? Math.min(BB_ARENA_MAX_QUADS, last * 2) : BB_ARENA_QUADS, quads);
    const ib = this._bbArenaIndices(cap);
    const vao = gl.createVertexArray();
    this._bindVao(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, cap * BB_QUAD_VERT_BYTES, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    this._bindVao(null);
    const a = { vao, vb, cap, free: [0, cap], taken: 0 };
    this._bbArenas.push(a);
    a.taken = arenaTake(a.free, quads);
    if (key != null) this._bbArenaOfKey.set(key, a);
    return a;
  }

  // Element buffer bindings are VAO state, so a grown index buffer is bound into every arena's VAO.
  _bbArenaIndices(cap) {
    const had = this._bbIndex;
    if (had && had.cap >= cap) return had.ib;
    const gl = this.gl;
    const indices = new Uint32Array(cap * 6);
    for (let q = 0; q < cap; q++) {
      const b = q * 4, io = q * 6;
      indices[io] = b; indices[io + 1] = b + 2; indices[io + 2] = b + 1;
      indices[io + 3] = b; indices[io + 4] = b + 3; indices[io + 5] = b + 2;
    }
    const ib = gl.createBuffer();
    // Unbind any VAO first, so this element buffer bind lands in no arena's VAO.
    this._bindVao(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    for (const a of this._bbArenas) { this._bindVao(a.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); }
    this._bindVao(null);
    if (had) gl.deleteBuffer(had.ib);
    this._bbIndex = { ib, cap };
    return ib;
  }

  // Positions are each billboard's base; the shader lifts by half the height.
  /**
   * @param {number} archive
   * @param {number} record
   * @param {{w: number, h: number}} size
   * @param {number[][]} centers
   * @returns {import('./contract.js').BillboardBatch}
   */
  createBillboardBatch(archive, record, size, centers, { dynamic = false, scales = null } = {}) {
    const gl = this.gl;
    const count = centers.length;
    const verts = new Float32Array(count * 4 * 5);
    const corners = BB_CORNERS;
    for (let f = 0; f < count; f++) {
      const [cx, cy, cz] = centers[f];
      const fs = scales ? scales[f] : 1;
      for (let c = 0; c < 4; c++) {
        const o = (f * 4 + c) * 5;
        verts[o] = cx;
        verts[o + 1] = cy;
        verts[o + 2] = cz;
        verts[o + 3] = bbCornerX(corners[c][0], fs);
        verts[o + 4] = corners[c][1];
      }
    }

    let vao, buffers, arena = null, q0 = 0;
    if (!dynamic && count > 0 && this._bbArenas) {
      arena = this._bbArenaFor(count, `${archive}_${record}`);
      q0 = arena.taken;
      vao = arena.vao;
      buffers = [];
      gl.bindBuffer(gl.ARRAY_BUFFER, arena.vb);
      gl.bufferSubData(gl.ARRAY_BUFFER, q0 * BB_QUAD_VERT_BYTES, verts);
    } else {
      vao = gl.createVertexArray();
      this._bindVao(vao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      // A batch whose centers move says so at birth, because the buffer's usage hint cannot change later.
      gl.bufferData(gl.ARRAY_BUFFER, verts, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      const indices = new Uint32Array(count * 6);
      for (let f = 0; f < count; f++) {
        const b = f * 4;
        const io = f * 6;
        indices[io] = b;
        indices[io + 1] = b + 2;
        indices[io + 2] = b + 1;
        indices[io + 3] = b;
        indices[io + 4] = b + 3;
        indices[io + 5] = b + 2;
      }
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      this._bindVao(null);
      buffers = [vb, ib];
    }

    const bounds = boundsOf(centers.flat());
    bounds[3] += quadHalfDiagonal(size);
    // A batch is born with every field it will carry, so V8 keeps one shape; add any new batch field here.
    // The shadow origin fields are born NaN so their slots stay doubles.
    return {
      vao, indexCount: count * 6, archive, record, size, buffers, origin: null, frame: null, bounds, _quads: count, _dyn: !!dynamic,
      _arena: arena, _q0: q0, _ibOff: q0 * BB_QUAD_INDEX_BYTES,
      _scales: scales ?? null, lptProto: undefined, farH: undefined, sunLift: undefined,
      _place: count > 1 && !dynamic ? placementGrid(centers) : null,
      _box: undefined, sway: undefined, windfall: undefined, tip: undefined, conceal: undefined, hitFlash: undefined, eliteGlow: undefined, eliteTime: undefined, elitePad: undefined, glint: undefined, dissolve: undefined, crack: undefined, tint: undefined, dye: undefined, noShadow: undefined, ghost: undefined, selfCard: undefined, _dead: undefined, _moveScratch: undefined, dwColumn: undefined,
      castOnly: undefined,
      _bbKey: undefined, _bbKeyId: undefined, _bbKeyRecord: undefined, _bbKeyFrame: undefined, _bbKeyArchive: undefined,
      _shGen: undefined, _shAx: NaN, _shAy: NaN, _shAz: NaN, _shSeen: undefined, _shOx: NaN, _shOy: NaN, _shOz: NaN, _shFrame: undefined,
      _shRec: undefined, _shFlip: undefined, _shDyn: undefined, _shSway: undefined, _shMovedAt: undefined, _shId: undefined,
      _shAnim: undefined, _shIdler: undefined,
    };
  }

  // The bounds move with the vertices, since _bbVisible culls on the batch's own sphere.
  moveBillboardBatch(batch, centers) {
    const gl = this.gl;
    if (!batch?.vao || !centers) return false;
    const count = Math.min(centers.length, batch._quads ?? 0);
    if (!count) return false;
    const verts = (batch._moveScratch && batch._moveScratch.length >= count * 20)
      ? batch._moveScratch
      : (batch._moveScratch = new Float32Array(count * 20));
    const scales = batch._scales;
    for (let f = 0; f < count; f++) {
      const c = centers[f];
      const fs = scales ? scales[f] : 1;
      for (let k = 0; k < 4; k++) {
        const o = (f * 4 + k) * 5;
        verts[o] = c[0]; verts[o + 1] = c[1]; verts[o + 2] = c[2];
        verts[o + 3] = bbCornerX(BB_CORNERS[k][0], fs);
        verts[o + 4] = BB_CORNERS[k][1];
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, batch._arena ? batch._arena.vb : batch.buffers[0]);
    gl.bufferSubData(gl.ARRAY_BUFFER, batch._arena ? batch._q0 * BB_QUAD_VERT_BYTES : 0, verts, 0, count * 20);
    // A moved static batch gets a new placement grid and a fresh id, so the cached static shadow sees the move.
    batch._place = !batch._dyn && count > 1 ? placementGrid(count === centers.length ? centers : centers.slice(0, count)) : null;
    if (!batch._dyn) batch._shId = undefined;
    let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity;
    let hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
    for (let f = 0; f < count; f++) {
      const c = centers[f];
      if (c[0] < lo0) lo0 = c[0]; if (c[0] > hi0) hi0 = c[0];
      if (c[1] < lo1) lo1 = c[1]; if (c[1] > hi1) hi1 = c[1];
      if (c[2] < lo2) lo2 = c[2]; if (c[2] > hi2) hi2 = c[2];
    }
    const cx = (lo0 + hi0) * 0.5, cy = (lo1 + hi1) * 0.5, cz = (lo2 + hi2) * 0.5;
    const bounds = (batch.bounds && batch.bounds.length === 4) ? batch.bounds : (batch.bounds = new Float32Array(4));
    bounds[0] = cx; bounds[1] = cy; bounds[2] = cz;
    bounds[3] = Math.hypot(hi0 - cx, hi1 - cy, hi2 - cz) + quadHalfDiagonal(batch.size);
    return true;
  }

  destroyBillboardBatch(batch) {
    const gl = this.gl;
    if (!batch) return;
    // A shadow record from the last frame may still hold this batch.
    batch._dead = true;
    batch._place = null;
    if (batch._arena) this._bbArenaFree(batch);
    else if (batch.vao) gl.deleteVertexArray(batch.vao);
    for (const b of batch.buffers || []) gl.deleteBuffer(b);
    batch.vao = null;
    batch.buffers = [];
  }

  // Clears the batch's VAO, so no second free or replay reaches a range a later batch takes.
  _bbArenaFree(batch) {
    const a = batch._arena;
    arenaGive(a.free, batch._q0, batch._quads);
    batch._arena = null;
    batch.vao = null;
    const at = this._bbArenas.indexOf(a);
    if (at > 0 && a.free.length === 2 && a.free[1] === a.cap) {
      const gl = this.gl;
      this._bbArenas.splice(at, 1);
      for (const [k, home] of this._bbArenaOfKey) if (home === a) this._bbArenaOfKey.delete(k);
      if (this._lastVao === a.vao) this._bindVao(null);
      gl.deleteVertexArray(a.vao); gl.deleteBuffer(a.vb);
    }
  }

  destroyMesh(mesh) {
    const gl = this.gl;
    mesh._dead = true;
    for (const b of mesh.buffers) gl.deleteBuffer(b);
    gl.deleteVertexArray(mesh.vao);
    if (mesh.shadowVao) gl.deleteVertexArray(mesh.shadowVao);
    if (mesh._wire) {
      gl.deleteBuffer(mesh._wire.ebo);
      gl.deleteVertexArray(mesh._wire.vao);
    }
    mesh._wire = null;
  }

  destroyBatch(batch) {
    const gl = this.gl;
    batch._dead = true;
    if (batch._arena) { this._bbArenaFree(batch); return; }
    for (const b of batch.buffers) gl.deleteBuffer(b);
    if (batch.vao) gl.deleteVertexArray(batch.vao);
    batch.vao = null;
    batch.buffers = [];
  }

  _terrainIndices(indices) {
    let entry = this._terrainIndexSets.get(indices);
    if (entry) return entry;
    const gl = this.gl;
    // Unbind any VAO first, or this element buffer bind is captured into the last drawn VAO.
    this._bindVao(null);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    entry = { buffer, count: indices.length };
    this._terrainIndexSets.set(indices, entry);
    return entry;
  }

  createTerrainSurface(positions, normals, indices) {
    const gl = this.gl;
    const indexSet = this._terrainIndices(indices);
    const vao = gl.createVertexArray();
    this._bindVao(vao);
    const buffers = [];
    const buf = (data, loc) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 12, 0);
      buffers.push(b);
      return b;
    };
    buf(positions, 0);
    buf(normals, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexSet.buffer);
    this._bindVao(null);
    return { vao, buffers, indexCount: indexSet.count, bounds: boundsOf(positions) };
  }

  // Shares the terrain's vertex buffers, so destroy it before destroyMesh frees them.
  createWaterSurface(terrain, indices) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    this._bindVao(vao);
    const [positions, normals] = terrain.buffers;
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, normals);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this._bindVao(null);
    return { vao, ebo, indexCount: indices.length };
  }

  createWaterSheet(indices, { terrain = null, positions = null, depths = null } = {}) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    this._bindVao(vao);
    const owned = [];
    const own = (data, loc, size) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, size * 4, 0);
      owned.push(b);
    };
    if (positions) own(positions, 0, 3);
    else {
      gl.bindBuffer(gl.ARRAY_BUFFER, terrain.buffers[0]);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    }
    if (positions && depths) own(depths, 1, 1);
    else gl.disableVertexAttribArray(1);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this._bindVao(null);
    return { vao, ebo, buffers: owned, indexCount: indices.length };
  }

  destroyWaterSurface(water) {
    const gl = this.gl;
    gl.deleteBuffer(water.ebo);
    for (const b of water.buffers ?? []) gl.deleteBuffer(b);
    gl.deleteVertexArray(water.vao);
  }

  captureUnderWater() {
    if (this._underWater !== undefined) return this._underWater;
    this._underWater = (this._air && this._frameFbo && !this.waterSimple) ? this._air.snapshotUnderWater() : null;
    if (this._underWater) this._forgetUnitShadows();
    return this._underWater;
  }

  setWaterRipples(field, span = 48, cells = 96) {
    this._ripples = field ?? null;
    this._rippleSpan = span; this._rippleCells = cells;
  }

  _bindRipples(L) {
    const gl = this.gl, r = this._ripples, cells = this._rippleCells;
    gl.uniform1i(L.rippleOn, r ? 1 : 0);
    gl.uniform1i(L.ripple, WATER_RIPPLE_UNIT);
    this._activeTexture(gl.TEXTURE0 + WATER_RIPPLE_UNIT);
    if (r) {
      if (!this._rippleTex) {
        this._rippleTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._rippleTex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, cells, cells);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this._rippleVersion = -1;
      } else gl.bindTexture(gl.TEXTURE_2D, this._rippleTex);
      const v = r.version();
      if (v !== this._rippleVersion) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cells, cells, gl.RED, gl.UNSIGNED_BYTE, r.bytes);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
        this._rippleVersion = v;
      }
      gl.uniform3f(L.rippleRect, r.packed[0], r.packed[1], this._rippleSpan);
    } else gl.bindTexture(gl.TEXTURE_2D, this._blackTex);
    this._tex1Bound = null;
    this._activeTexture(gl.TEXTURE0);
  }

  _bindUnderWater(L) {
    const gl = this.gl, uw = this.captureUnderWater();
    gl.uniform1i(L.sceneOn, uw ? 1 : 0);
    gl.uniform1i(L.scene, WATER_SCENE_UNIT);
    gl.uniform1i(L.sceneDepth, WATER_SCENE_DEPTH_UNIT);
    this._activeTexture(gl.TEXTURE0 + WATER_SCENE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, uw?.color ?? this._blackTex);
    this._activeTexture(gl.TEXTURE0 + WATER_SCENE_DEPTH_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, uw?.depth ?? this._blackTex);
    this._activeTexture(gl.TEXTURE0);
    gl.uniform2f(L.sceneSize, uw?.w ?? 1, uw?.h ?? 1);
  }

  uploadTilemapTexture(bytes, dim) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._tex0Bound = null;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, dim, dim, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, bytes);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    return tex;
  }
  writeTilemapTexture(tex, bytes, dim) {
    const gl = this.gl;
    this._activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._tex0Bound = null;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, dim, dim, gl.RED_INTEGER, gl.UNSIGNED_BYTE, bytes);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }
  uploadTileArray(archive, layers) {
    const steps = this.uploadTileArraySteps(archive, layers);
    for (;;) { const r = steps.next(); if (r.done) return r.value; }
  }

  // Registers the array only after every layer and its mips are up, so nothing draws a half-built array.
  *uploadTileArraySteps(archive, layers) {
    if (this.tileArrays.has(archive)) return this.tileArrays.get(archive);
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    const w = layers[0].width;
    const h = layers[0].height;
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, w, h, layers.length, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (let i = 0; i < layers.length; i++) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(layers[i].colors.buffer, layers[i].colors.byteOffset, w * h * 4));
      if ((i + 1) % TILE_LAYERS_A_STEP === 0 && i + 1 < layers.length) { yield; gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex); }
    }
    if (this.tileArrays.has(archive)) { gl.deleteTexture(tex); return this.tileArrays.get(archive); }
    // Minification uses mipmaps against distant grain; magnification stays NEAREST so near texels stay square.
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this._setGroundSampler(groundSharpnessTier());
    // Clamp, as DFU's terrain texture array wraps (TextureReader).
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (!this._retroMips) gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LEVEL, 0);
    this.tileArrays.set(archive, tex);
    this._tileDims.set(archive, [w, h, layers.length]);
    this._arrLayers.set(tex, layers.length);
    return tex;
  }

  setSnowFrame(f) {
    this._snowFrame = f ?? null;
    this._frameStamp++;
    if (!f) return;
    const gl = this.gl;
    if (!this._snowTex || this._snowTexSide !== f.side) {
      if (this._snowTex) gl.deleteTexture(this._snowTex);
      this._snowTex = gl.createTexture();
      this._snowTexSide = f.side;
      this._snowGen = -1;
      this._activeTexture(gl.TEXTURE0 + SNOW_LINES_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this._snowTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, f.side, f.side, 0, gl.RGBA, gl.FLOAT, null);
    }
    if (this._snowGen !== f.gen) {
      this._activeTexture(gl.TEXTURE0 + SNOW_LINES_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this._snowTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, f.side, f.side, gl.RGBA, gl.FLOAT, f.lines);
      this._snowGen = f.gen;
    }
  }

  _anisoExtension() {
    if (this._anisoExt === null) {
      const gl = this.gl;
      this._anisoExt = gl.getExtension('EXT_texture_filter_anisotropic') ?? false;
      this._anisoMax = this._anisoExt ? (gl.getParameter(this._anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1) : 1;
    }
    return this._anisoExt;
  }

  _setGroundSampler(tier) {
    const gl = this.gl;
    const ext = this._anisoExtension();
    const s = groundSamplerFor(tier, this._anisoMax);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl[s.minFilter]);
    if (ext) gl.texParameterf(gl.TEXTURE_2D_ARRAY, ext.TEXTURE_MAX_ANISOTROPY_EXT, s.aniso);
    this.groundTier = tier;
    return s;
  }

  // Both exterior hosts call this at every world load, because cached arrays would otherwise keep the old tier.
  applyGroundSharpness(tier = groundSharpnessTier()) {
    const gl = this.gl;
    let s = null;
    for (const tex of this.tileArrays.values()) {
      this._activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      s = this._setGroundSampler(tier);
    }
    this._tArrayTex = null;
    return s;
  }

  // The hosts hand the same deck object per pixel, so the stamp moves only when the deck changes.
  setCloudShadow(d) { d = d ?? null; if (d !== this._cloudShadow) { this._cloudShadow = d; this._csStamp++; } }
  get cloudShadow() { return this._cloudShadow; }

  setFlatWind(v, windfall = null) {
    const fw = this._flatWind ??= new Float32Array(4);
    if (v) { fw[0] = v[0] || 0; fw[1] = v[1] || 0; fw[2] = v[2] || 0; fw[3] = v[3] || 0; } else fw.fill(0);
    const wf = this._windfall ??= new Float32Array(8);
    if (windfall) { for (let i = 0; i < 8; i++) wf[i] = windfall[i] || 0; } else wf.fill(0);
  }

  _uploadCloudShadow(key) {
    const loc = this._csLoc?.[key];
    if (!loc || this._csUploaded[key] === this._csStamp) return;
    this._csUploaded[key] = this._csStamp;
    const gl = this.gl, cs = this._cloudShadow, [mapLoc, rectLoc, farLoc] = loc;
    this._activeTexture(gl.TEXTURE0 + CLOUD_SHADOW_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, cs?.map ?? this._blackTex);
    gl.uniform1i(mapLoc, CLOUD_SHADOW_UNIT);
    const r = cs?.map ? cs.rect : null;
    this._csRect[0] = r ? r[0] : 0; this._csRect[1] = r ? r[1] : 0; this._csRect[2] = r ? r[2] : 0; this._csRect[3] = r ? r[3] : 0;
    gl.uniform4fv(rectLoc, this._csRect);
    if (farLoc) gl.uniform2f(farLoc, cloudFarOf(cs), 1);
    this._activeTexture(gl.TEXTURE0);
  }

  _ensureTerrainClip(set = this._worldSet) {
    return (set.terrainClip ??= this._buildProgram(TERRAIN_VS, terrainClipFs(set.terrainFs)));
  }

  prepareTerrainClip() { this._ensureTerrainClip(); }
  get ambientLight() { return this._ambient; }
  prepareTerrainSnow() { this._ensureTerrainSnow(); }
  startTerrainSnow(set = this._worldSet) { return set.terrainSnow ? () => true : startPrograms(this.gl, [[SNOW_VS, snowTerrainFs(set.terrainFs)]]); }

  _ensureTerrainSnow(set = this._worldSet) {
    if (set.terrainSnow) return set.terrainSnow;
    const program = this._buildProgram(SNOW_VS, snowTerrainFs(set.terrainFs));
    const gl = this._locations(set);
    const loc = Object.fromEntries(['uProj', 'uView', 'uModel', 'uLightDir', 'uAmbient', 'uSunScale', 'uSunColor', 'uMoonDir', 'uMoonScale', 'uMoonColor',
      'uPointCount', 'uPointLights', 'uPointColors', 'uIndirect', 'uIndirectColor', 'uSnowDepths', 'uSnowLimits', 'uSnowDynMap', 'uSnowDynTexel',
      'uSnowStatMap', 'uSnowFarMap', 'uSnowFlags', 'uSnowRadius', 'uSnowInner', 'uSnowOuter', 'uSnowBoundaryFade', 'uSnowDarkening',
      'uSnowDynamic', 'uSnowStatic', 'uSnowContext', 'uSnowFar', 'uSnowAlbedo',
      'uSnowLines', 'uSnowSet', 'uSnowWin', 'uEcoOrigin', 'uSnowAnchor'].map((n) => [n, gl.getUniformLocation(program, n)]));
    const el = this._worldSet === set && this._elLocsOf ? this._elLocsOf(program) : null;
    return (set.terrainSnow = { program, loc, el, fog: this._fogLocs(program), cs: [gl.getUniformLocation(program, 'uCloudShadowMap'), gl.getUniformLocation(program, 'uCloudShadowRect'), gl.getUniformLocation(program, 'uCloudShadowFar')], frame: -1, units: false });
  }

  drawSnow(surface, u, tex) {
    this._close2D();
    const gl = this.gl, S = this._ensureTerrainSnow(), L = S.loc, P = this._snowPass;
    if (!S.el && this._elLocsOf) S.el = this._elLocsOf(S.program);
    this._use(S.program);
    if (!S.units) {
      S.units = true;
      gl.uniform1i(L.uSnowDynamic, SNOW_UNITS.dynamic); gl.uniform1i(L.uSnowStatic, SNOW_UNITS.static); gl.uniform1i(L.uSnowContext, SNOW_UNITS.context);
      gl.uniform1i(L.uSnowFar, SNOW_UNITS.far); gl.uniform1i(L.uSnowAlbedo, SNOW_UNITS.albedo);
      gl.uniform1i(L.uSnowLines, SNOW_LINES_UNIT);
    }
    if (S.frame !== this._frameStamp) {
      S.frame = this._frameStamp;
      gl.uniformMatrix4fv(L.uProj, false, this._proj);
      gl.uniformMatrix4fv(L.uView, false, this._view);
      this._uploadFog(S.fog);
      gl.uniform3fv(L.uLightDir, this._lightDir);
      gl.uniform3fv(L.uAmbient, this._c3(this._ambient));
      gl.uniform1f(L.uSunScale, this._sunScale);
      gl.uniform3fv(L.uSunColor, this._c3(this._sunColor));
      gl.uniform3fv(L.uMoonDir, this._moonDir);
      gl.uniform1f(L.uMoonScale, this._moonScale);
      gl.uniform3fv(L.uMoonColor, this._c3(this._moonColor));
      const count = this._pointLights.length / 4;
      gl.uniform1i(L.uPointCount, count);
      if (count > 0) gl.uniform4fv(L.uPointLights, this._pointLights);
      if (count > 0) gl.uniform3fv(L.uPointColors, this._pointColorData(count));
      gl.uniform4fv(L.uIndirect, this._indirect);
      gl.uniform3fv(L.uIndirectColor, this._c3(this._indirectColor));
      if (S.el) { this._el.snow = S.el; this._uploadEl('snow'); }
      const sf = this._snowFrame;
      if (sf && this._snowTex) {
        this._activeTexture(gl.TEXTURE0 + SNOW_LINES_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, this._snowTex);
        this._activeTexture(gl.TEXTURE0);
        gl.uniform3i(L.uSnowWin, sf.origin[0], sf.origin[1], sf.side);
        gl.uniform3i(L.uEcoOrigin, sf.origin[0], sf.origin[1], 0);
        gl.uniform2f(L.uSnowAnchor, sf.anchor[0], sf.anchor[1]);
        gl.uniform4f(L.uSnowSet, sf.altitude, 1, sf.spacing, 0);
      } else gl.uniform4f(L.uSnowSet, 0, 0, 0, 0);
    }
    this._csLoc.snow = S.cs;
    this._uploadCloudShadow('snow');
    if (!this._snowModel) this._snowModel = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const m = this._snowModel, f = Math.fround;
    if (!P || !P.model || !Object.is(m[12], f(u.origin[0])) || !Object.is(m[13], f(u.origin[1])) || !Object.is(m[14], f(u.origin[2]))) {
      m[12] = u.origin[0]; m[13] = u.origin[1]; m[14] = u.origin[2];
      gl.uniformMatrix4fv(L.uModel, false, m);
      if (P) P.model = true;
    }
    this._snowU4(L.uSnowDepths, u.depths); this._snowU4(L.uSnowLimits, u.limits);
    this._snowRise = Math.max(this._snowRise, snowSurfaceRise(u));
    this._snowU4(L.uSnowDynMap, u.dynMap); this._snowU4(L.uSnowDynTexel, u.dynTexel); this._snowU4(L.uSnowStatMap, u.statMap);
    this._snowU4(L.uSnowFarMap, u.farMap ?? u.dynMap); this._snowU4(L.uSnowFlags, u.flags); this._snowU4(L.uSnowRadius, u.radius);
    this._snowU4(L.uSnowInner, u.inner); this._snowU4(L.uSnowOuter, u.outer);
    this._snowU1(L.uSnowBoundaryFade, u.boundaryFade); this._snowU1(L.uSnowDarkening, u.darkening);
    let bound = false;
    for (const [k, unit] of SNOW_UNIT_LIST) {
      if (P && P.tex[unit] === tex[k]) continue;
      this._activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex[k]);
      if (P) P.tex[unit] = tex[k];
      bound = true;
    }
    if (bound) this._activeTexture(gl.TEXTURE0);
    const generic = surface.generic ?? null;
    if (!P || generic !== P.generic) {
      if (P) for (const [loc] of P.generic ?? []) gl.vertexAttrib4f(loc, 0, 0, 0, 1);
      for (const [loc, v] of generic ?? []) gl.vertexAttrib4f(loc, v[0], v[1], v[2], v[3]);
      if (P) P.generic = generic;
    }
    this._bindVao(surface.vao);
    if (!P || !P.offset) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(SNOW_LAYER.factor, SNOW_LAYER.units);
      if (P) P.offset = true;
    }
    gl.drawElements(gl.TRIANGLES, surface.indexCount, gl.UNSIGNED_INT, 0);
    this.stats.draws++;
    if (P) return;
    gl.disable(gl.POLYGON_OFFSET_FILL);
    this._bindVao(null);
    for (const [loc] of generic ?? []) gl.vertexAttrib4f(loc, 0, 0, 0, 1);
  }

  drawSnowBegin() {
    let P = this._snowPassState;
    if (!P) P = this._snowPassState = { u: new Map(), tex: [], generic: null, offset: false, model: false };
    P.u.clear(); P.tex.length = 0; P.generic = null; P.offset = false; P.model = false;
    this._snowPass = P;
  }
  drawSnowEnd() {
    const P = this._snowPass, gl = this.gl;
    this._snowPass = null;
    if (!P?.offset) return;
    gl.disable(gl.POLYGON_OFFSET_FILL);
    this._bindVao(null);
    for (const [loc] of P.generic ?? []) gl.vertexAttrib4f(loc, 0, 0, 0, 1);
  }
  _snowU4(loc, v) {
    const P = this._snowPass, f = Math.fround;
    if (P) {
      let s = P.u.get(loc);
      if (s && Object.is(s[0], f(v[0])) && Object.is(s[1], f(v[1])) && Object.is(s[2], f(v[2])) && Object.is(s[3], f(v[3]))) return;
      if (!s) P.u.set(loc, (s = new Float32Array(4)));
      s[0] = v[0]; s[1] = v[1]; s[2] = v[2]; s[3] = v[3];
    }
    this.gl.uniform4fv(loc, v);
  }
  _snowU1(loc, v) {
    const P = this._snowPass;
    if (P) {
      let s = P.u.get(loc);
      if (s && Object.is(s[0], Math.fround(v))) return;
      if (!s) P.u.set(loc, (s = new Float32Array(1)));
      s[0] = v;
    }
    this.gl.uniform1f(loc, v);
  }

  _terrainVariant(clip) {
    if (clip) this._ensureTerrainClip();
    this._terrainClip = clip;
    this._installWorldSet(this._worldSet);
  }

  drawTerrain(surface, modelMatrix, arrayTex, tilemapTex, tileSize, clip = false, eco = null, snow = null) {
    this._close2D();
    const gl = this.gl;
    if (!!clip !== this._terrainClip) this._terrainVariant(!!clip);
    this._use(this.terrainProgram);
    if (this._casting) this._shadows.recordTerrain(surface, modelMatrix, arrayTex, tilemapTex, tileSize);
    gl.uniformMatrix4fv(this.tUModel, false, modelMatrix);
    { const sc = surface?.scorch ?? 0; if (this._tScorch !== sc) { if (this.tUScorch) gl.uniform1f(this.tUScorch, sc); this._tScorch = sc; } }
    if (this._tTileSize !== tileSize) { gl.uniform1f(this.tUTileSize, tileSize); this._tTileSize = tileSize; }
    this._uploadCloudShadow('terrain');
    if (this._tFrameStamp !== this._frameStamp) {
      this._tFrameStamp = this._frameStamp;
      gl.uniformMatrix4fv(this.tUProj, false, this._proj);
      gl.uniformMatrix4fv(this.tUView, false, this._view);
      gl.uniform1f(this.tUWaterBed, this.waterBed ? 1 : 0);
      gl.uniform4uiv(this.tUBedMask, BED_MASK);
      this._uploadFog(this._terrainFog);
      gl.uniform3fv(this.tULightDir, this._lightDir);
      gl.uniform3fv(this.tUAmbient, this._c3(this._ambient));
      gl.uniform1f(this.tUSunScale, this._sunScale);
      gl.uniform3fv(this.tUSunColor, this._c3(this._sunColor));
      gl.uniform3fv(this.tUMoonDir, this._moonDir);
      gl.uniform1f(this.tUMoonScale, this._moonScale);
      gl.uniform3fv(this.tUMoonColor, this._c3(this._moonColor));
      const count = this._pointLights.length / 4;
      gl.uniform1i(this.tUPointCount, count);
      if (count > 0) gl.uniform4fv(this.tUPointLights, this._pointLights);
      if (count > 0) gl.uniform3fv(this.tUPointColors, this._pointColorData(count));
      gl.uniform4fv(this.tUIndirect, this._indirect);
      gl.uniform3fv(this.tUIndirectColor, this._c3(this._indirectColor));
      this._uploadEl('terrain');
      gl.uniform1i(this.tUTileArr, 0);
      gl.uniform1i(this.tUTilemap, 2);
      for (let k = 0; k < ECO_UNITS.length; k++) gl.uniform1i(this.tEco.arr[k], ECO_UNITS[k]);
      const sf = this._snowFrame;
      gl.uniform1i(this.tSnow.Lines, SNOW_LINES_UNIT);
      if (sf && this._snowTex) {
        this._activeTexture(gl.TEXTURE0 + SNOW_LINES_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, this._snowTex);
        gl.uniform3i(this.tSnow.Win, sf.origin[0], sf.origin[1], sf.side);
      }
    }
    if (this._tArrayTex !== arrayTex) {
      this._activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, arrayTex);
      this._tArrayTex = arrayTex;
      this.stats.texBinds++;
    }
    this._activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, tilemapTex);
    const snowOn = !!(snow && this._snowFrame && this._snowTex);
    if (eco) {
      const shadow = (this._tEcoTex ??= [null, null, null]);
      for (let k = 0; k < ECO_UNITS.length; k++) {
        const tex = eco.tex[k];
        if (!tex || shadow[k] === tex) continue;
        this._activeTexture(gl.TEXTURE0 + ECO_UNITS[k]);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
        shadow[k] = tex;
        this.stats.texBinds++;
      }
      gl.uniform4iv(this.tEco.side, eco.side);
      gl.uniform4iv(this.tEco.corner, eco.corner);
      gl.uniform3iv(this.tEco.origin, eco.origin);
      this._tEcoOn = true;
    } else if (snowOn) {
      gl.uniform3i(this.tEco.origin, snow[0], snow[1], 0);
      this._tEcoOn = null;
    } else if (this._tEcoOn !== false) {
      gl.uniform3i(this.tEco.origin, 0, 0, 0);
      this._tEcoOn = false;
    }
    if (snowOn) {
      const arr = this._tSnowArr, layer = (t) => (t && this._arrLayers.get(t) === 2 * TWIN_LAYERS ? TWIN_LAYERS : 0);
      const a0 = layer(arrayTex), a1 = eco ? layer(eco.tex[0]) : 0, a2 = eco ? layer(eco.tex[1]) : 0, a3 = eco ? layer(eco.tex[2]) : 0;
      if (arr[0] !== a0 || arr[1] !== a1 || arr[2] !== a2 || arr[3] !== a3) { gl.uniform4i(this.tSnow.Arr, a0, a1, a2, a3); arr[0] = a0; arr[1] = a1; arr[2] = a2; arr[3] = a3; }
      if (this._tSnowOn !== true || this._tSnowAlt !== this._snowFrame.altitude) {
        const sf = this._snowFrame;
        gl.uniform4f(this.tSnow.Set, sf.altitude, 1, sf.spacing, 0);
        this._tSnowOn = true; this._tSnowAlt = sf.altitude;
      }
    } else if (this._tSnowOn !== false) {
      gl.uniform4f(this.tSnow.Set, 0, 0, 0, 0);
      this._tSnowOn = false;
    }
    this._activeTexture(gl.TEXTURE0);
    this.stats.texBinds++;
    this._bindVao(surface.vao);
    gl.drawElements(gl.TRIANGLES, surface.indexCount, gl.UNSIGNED_INT, 0);
    this.stats.draws++;
    this._bindVao(null);
  }

  // Call after all opaque geometry: blended and depth-tested without depth writes.
  /**
   * @param {Array<{x:number,z:number,size:number,y:number}>} quads
   * @param {number[]} color
   */
  drawWater(quads, color, waterTex, scrollTiles = 0) {
    this._close2D();
    if (!quads.length) return;
    const gl = this.gl;
    this._use(this.waterProgram);
    gl.uniformMatrix4fv(this.waterUProj, false, this._proj);
    gl.uniformMatrix4fv(this.waterUView, false, this._view);
    gl.uniform4fv(this.waterUColor, color);
    this._activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, waterTex);
    this._tex0Bound = null;
    gl.uniform1i(this.waterUTex, 0);
    gl.uniform1f(this.waterUScroll, scrollTiles);
    this._uploadFog(this._waterFog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    this._bindVao(this.waterVao);
    this.stats.texBinds++;
    for (const q of quads) {
      gl.uniform4f(this.waterURect, q.x, q.z, q.size, q.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.stats.draws++;
    }
    this._bindVao(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
  }

  _waterLocs(P) {
    const gl = this.gl, u = (n) => gl.getUniformLocation(P, n);
    return {
      proj: u('uProj'), view: u('uView'), model: u('uModel'), lift: u('uLift'),
      tileArr: u('uTileArr'), tilemap: u('uTilemap'), tileSize: u('uTileSize'), tileDim: u('uTileDim'), mask: u('uWaterMask'),
      pointCount: u('uPointCount'), pointLights: u('uPointLights'), pointColors: u('uPointColors'), indirect: u('uIndirect'), indirectColor: u('uIndirectColor'),
      time: u('uTime'), windDir: u('uWindDir'), windStrength: u('uWindStrength'), rain: u('uRain'),
      lightDir: u('uLightDir'), ambient: u('uAmbient'), sunScale: u('uSunScale'), sunColor: u('uSunColor'),
      moonDir: u('uMoonDir'), moonScale: u('uMoonScale'), moonColor: u('uMoonColor'),
      zenith: u('uSkyZenith'), horizon: u('uSkyHorizon'), tint: u('uTint'), f0: u('uF0'), shoreSoft: u('uShoreSoft'),
      swell: u('uSwell'), absorb: u('uAbsorb'), open: u('uOpen'), openColor: u('uOpenColor'),
      glow: u('uSkyGlow'), glowDir: u('uSkyGlowDir'), seaNight: u('uSeaNight'), seaExposure: u('uSeaExposure'), adapt: u('uAdapt'),
      sceneOn: u('uSceneOn'), scene: u('uScene'), sceneDepth: u('uSceneDepth'), sceneSize: u('uSceneSize'),
      rippleOn: u('uRippleOn'), ripple: u('uRipple'), rippleRect: u('uRippleRect'),
      fog: { fogColor: u('uFogColor'), fogMode: u('uFogMode'), fogDensity: u('uFogDensity'), fogRange: u('uFogRange'), camPos: u('uCamPos'), focus: u('uFocus'), dwFog: u('uDwFog'), haze: u('uJungleHaze') },
      seaHaze: u('uSeaHaze'),
      cloud: [u('uCloudShadowMap'), u('uCloudShadowRect'), u('uCloudShadowFar')],
      snow: { lines: u('uSnowLines'), set: u('uSnowSet'), win: u('uSnowWin'), arr: u('uSnowArr'), origin: u('uEcoOrigin') },
      snowUnit: false, snowOn: false, snowAlt: NaN, snowArr: -1,
      maskUploaded: false,
    };
  }

  /** @type {Array<Array<any>>} */ _waterOne = [[null, null, null, null]];

  waterBed = false;
  waterSimple = false;
  /** @type {Array<Array<any>>} */ _seaRows = [];
  /** @type {WeakMap<object, {vao: any, indexCount: number}>} */ _seaSheets = new WeakMap();

  // Call after every opaque pass of the pixel and before the flats.
  drawWaterSurface(surface, modelMatrix, arrayTex, tilemapTex, tileSize, u, tileDim = 128) {
    const one = this._waterOne, row = one[0];
    row[0] = surface; row[1] = modelMatrix; row[2] = arrayTex; row[3] = tilemapTex;
    this.drawWaterSurfaces(one, 1, tileSize, u, tileDim);
    row[0] = row[1] = row[2] = row[3] = null;
  }

  // Rows draw in the order given, because the blend is order-dependent.
  /**
   * @param {Array<Array<any>>} rows
   * @param {number} n
   */
  drawWaterSurfaces(rows, n, tileSize, u, tileDim = 128) {
    if (!n) return;
    this._close2D();
    const gl = this.gl;
    const laneWater = !!(this._lane?.shadows && this.waterSurfaceProgramLane && this._shadows);
    const L = laneWater ? this._wsLane : this._ws;
    this._use(laneWater ? this.waterSurfaceProgramLane : this.waterSurfaceProgram);
    this._csLoc.water = L.cloud; this._waterSurfaceFog = L.fog;
    if (!L.maskUploaded) { gl.uniform4uiv(L.mask, packWaterMask(WATER_DRAW_MASK_TABLE)); L.maskUploaded = true; }
    this._waterFrameBlock(L, u, 0);
    gl.uniform1f(L.tileSize, tileSize);
    gl.uniform1i(L.tileDim, tileDim);
    gl.uniform1i(L.tileArr, 0);
    gl.uniform1i(L.tilemap, 2);
    this._drawWaterRows(L, rows, n);
  }

  _waterFrameBlock(L, u, open, lift = u.lift) {
    const gl = this.gl;
    gl.uniformMatrix4fv(L.proj, false, this._proj);
    gl.uniformMatrix4fv(L.view, false, this._view);
    gl.uniform1f(L.lift, lift);
    gl.uniform1i(L.open, open);
    gl.uniform1f(L.time, u.time);
    gl.uniform2f(L.windDir, u.windDir[0], u.windDir[1]);
    gl.uniform1f(L.windStrength, u.windStrength);
    gl.uniform1f(L.swell, u.swell);
    gl.uniform3fv(L.absorb, u.absorb);
    gl.uniform1f(L.rain, u.rain);
    gl.uniform3fv(L.zenith, u.zenith);
    gl.uniform3fv(L.horizon, u.horizon);
    gl.uniform3fv(L.glow, u.glow);
    gl.uniform2fv(L.glowDir, u.glowDir);
    gl.uniform1f(L.seaNight, this._lane ? u.night : 0);
    gl.uniform1f(L.seaExposure, this._exposure);
    this._uploadAdapt(L);
    gl.uniform3fv(L.tint, u.tint);
    gl.uniform1f(L.f0, u.f0);
    gl.uniform1f(L.shoreSoft, u.shoreSoft);
    this._bindUnderWater(L);
    this._bindRipples(L);
    this._uploadCloudShadow('water');
    this._uploadFog(this._waterSurfaceFog);
    gl.uniform2fv(L.seaHaze, this._seaHaze);
    if (L === this._wsLane && this._shadows) this._shadows.upload(L.shadow);
    gl.uniform3fv(L.lightDir, this._lightDir);
    gl.uniform3fv(L.ambient, this._ambient);
    gl.uniform1f(L.sunScale, this._sunScale);
    gl.uniform3fv(L.sunColor, this._sunColor);
    gl.uniform3fv(L.moonDir, this._moonDir);
    gl.uniform1f(L.moonScale, this._moonScale);
    gl.uniform3fv(L.moonColor, this._moonColor);
    // The water program is classic-space with 16 light slots under any lane, so it takes undecoded colors.
    const count = Math.min(this._pointLights.length / 4, CLASSIC_MAX_LIGHTS);
    gl.uniform1i(L.pointCount, count);
    if (count > 0) gl.uniform4fv(L.pointLights, this._pointLights.subarray ? this._pointLights.subarray(0, count * 4) : this._pointLights.slice(0, count * 4));
    if (count > 0) gl.uniform3fv(L.pointColors, this._pointColorData(count, true));
    gl.uniform4fv(L.indirect, this._indirect);
    gl.uniform3fv(L.indirectColor, this._indirectColor);
    if (this._snowFrame && this._snowTex) {
      if (!L.snowUnit) { gl.uniform1i(L.snow.lines, SNOW_LINES_UNIT); L.snowUnit = true; }
      this._activeTexture(gl.TEXTURE0 + SNOW_LINES_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this._snowTex);
      gl.uniform3i(L.snow.win, this._snowFrame.origin[0], this._snowFrame.origin[1], this._snowFrame.side);
    }
  }

  _drawWaterRows(L, rows, n) {
    this._close2D();
    const gl = this.gl;
    gl.vertexAttrib1f(1, -NO_BED_DEPTH);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    // The water is the ground's triangles lifted, so a constant polygon offset and LEQUAL keep it in front at any
    // distance. A slope factor would pull it in front of boats and shores at grazing views.
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(0, WATER_LAYER_UNITS.surface);
    gl.depthFunc(gl.LEQUAL);
    let bound = null;
    for (let i = 0; i < n; i++) {
      const row = rows[i], surface = row[0], arrayTex = row[2], tilemapTex = row[3], snow = row[4] && this._snowFrame && this._snowTex ? row[4] : null;
      gl.uniformMatrix4fv(L.model, false, row[1]);
      if (snow) {
        const sf = this._snowFrame, half = arrayTex && this._arrLayers.get(arrayTex) === 2 * TWIN_LAYERS ? TWIN_LAYERS : 0;
        gl.uniform3i(L.snow.origin, snow[0], snow[1], 0);
        if (L.snowArr !== half) { gl.uniform4i(L.snow.arr, half, 0, 0, 0); L.snowArr = half; }
        if (!L.snowOn || L.snowAlt !== sf.altitude) { gl.uniform4f(L.snow.set, sf.altitude, 1, sf.spacing, 0); L.snowOn = true; L.snowAlt = sf.altitude; }
      } else if (L.snowOn) {
        gl.uniform4f(L.snow.set, 0, 0, 0, 0);
        L.snowOn = false;
      }
      if (i === 0 || arrayTex !== bound) {
        this._activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, arrayTex);
        bound = arrayTex;
        this.stats.texBinds++;
      }
      // Empty unit 2 for open sea rows: WebGL refuses a draw whose usampler2D unit holds a float texture.
      if (tilemapTex || i === 0 || rows[i - 1][3]) {
        this._activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, tilemapTex ?? null);
        this.stats.texBinds++;
      }
      this._bindVao(surface.vao);
      gl.drawElements(gl.TRIANGLES, surface.indexCount, gl.UNSIGNED_INT, 0);
      this.stats.draws++;
    }
    this._activeTexture(gl.TEXTURE0);
    this._bindVao(null);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    // Reset attribute 1's constant to GL's default for the next program that leaves it disabled.
    gl.vertexAttrib4f(1, 0, 0, 0, 1);
    gl.enable(gl.CULL_FACE);
  }

  drawSeaSurfaces(list, liftY, u, color, arrayTex) {
    if (!list.length) return;
    this._close2D();
    const gl = this.gl;
    // The sea draws after the flats and people, so it takes its own frame copy rather than the terrain water's.
    this._underWater = undefined;
    const laneWater = !!(this._lane?.shadows && this.waterSurfaceProgramLane && this._shadows);
    const L = laneWater ? this._wsLane : this._ws;
    this._use(laneWater ? this.waterSurfaceProgramLane : this.waterSurfaceProgram);
    this._csLoc.water = L.cloud; this._waterSurfaceFog = L.fog;
    this._waterFrameBlock(L, u, 1, liftY);
    gl.uniform3f(L.openColor, color[0], color[1], color[2]);
    gl.uniform1i(L.tileArr, 0);
    const rows = this._seaRows;
    let n = 0;
    for (const it of list) {
      const part = it.h?.surface;
      if (!part) continue;
      const row = rows[n++] ??= [null, null, null, null];
      row[0] = this._seaSheet(part); row[1] = it.model; row[2] = arrayTex;
    }
    this._drawWaterRows(L, rows, n);
    for (let i = 0; i < n; i++) rows[i].fill(null);
  }
  _seaSheet(part) {
    let sheet = this._seaSheets.get(part);
    if (!sheet) this._seaSheets.set(part, sheet = { vao: part.vao, indexCount: part.count });
    return sheet;
  }

  /**
   * @param {{eye:number[], radius:number, band:number, gpu:any, runs:any[], cut:Set<any>}|null} frame
   * @param {number} [slot]
   */
  setLowPolyTrees(frame, slot = 0) { (this._lptSlots ??= [null, null])[slot] = frame && frame.gpu ? frame : null; }

  lptDrawnFrames() { return this._lptDrawn ?? []; }

  _lptFrameOf(proto) {
    const slots = this._lptSlots;
    if (!slots || !proto) return null;
    if (Array.isArray(proto)) { for (const h of proto) { const f = this._lptFrameOf(h); if (f) return f; } return null; }
    for (let i = 0; i < slots.length; i++) if (slots[i]?.cut.has(proto)) return slots[i];
    return null;
  }

  _uploadLptCut(f) {
    const gl = this.gl;
    const L = this.bbLpt ?? NO_LPT_LOCS;
    if (f) gl.uniform4f(L.uLptCut, f.eye[0], f.eye[1], f.eye[2], f.radius);
    else gl.uniform4f(L.uLptCut, 0, 0, 0, 0);
    if (f) gl.uniform1f(L.uLptBand, f.band);
  }

  _drawLowPolyTrees(f) {
    this._close2D();
    const gl = this.gl, L = this.bbLpt ?? NO_LPT_LOCS;
    gl.uniform1f(L.uMesh, 1);
    this._uploadLptCut(f);
    const sl = f.sunLift ?? 0;
    if (sl !== this._bbSunLiftOn) { if (L.uSunLift) gl.uniform1f(L.uSunLift, sl); this._bbSunLiftOn = sl; }
    const ld = this._lightDir;
    const sun = this._clockLit ? Math.min(1, Math.max(0, (this._sunScale ?? 0) / LPT_SUN_FULL)) : 0;
    gl.uniform4f(L.uLptSun, ld?.[0] ?? 0, ld?.[1] ?? 1, ld?.[2] ?? 0, sun);
    gl.uniform3f(this.bbUOrigin, 0, 0, 0);
    if (this._bbTipOn) { gl.uniform3f(this.bbUTip, 0, 0, 0); this._bbTipOn = false; }
    this._bindVao(f.gpu.vao);
    this._bindEmission(this._blackTex);
    let lastAlpha = -1, lastCull = 0, lr = -1, lg = -1, lb = -1;
    for (const run of f.runs) {
      if (!run.drawCount) continue;
      f.gpu.pointInstances(run.drawStart);
      gl.uniform3f(L.uMeshScale, run.scale[0], run.scale[1], run.scale[2]);
      gl.uniform2f(this.bbUSize, run.size[0], run.size[1]);
      gl.uniform1f(this.bbUSway, swayShare(run, windfallLawOn(this._windfall)));
      for (const sub of run.subs) {
        if (!sub.tex) continue;
        this._bindTex0(sub.tex);
        if (sub.alpha !== lastAlpha) { gl.uniform1f(L.uMeshAlpha, sub.alpha); lastAlpha = sub.alpha; }
        const [r, g, b] = sub.color;
        if (r !== lr || g !== lg || b !== lb) { gl.uniform3f(L.uMeshColor, r, g, b); lr = r; lg = g; lb = b; }
        if (sub.cull !== lastCull) { if (sub.cull === 2) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE); lastCull = sub.cull; }
        gl.drawElementsInstanced(gl.TRIANGLES, sub.count, gl.UNSIGNED_INT, sub.offset, run.drawCount);
        this.stats.draws++;
      }
    }
    // The flats draw both faces.
    if (lastCull === 2) gl.disable(gl.CULL_FACE);
    gl.uniform1f(L.uMesh, 0);
    this._bindVao(null);
  }

  createAtlasTexture(width, height, levels) {
    const gl = this.gl, tex = gl.createTexture();
    this._activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._tex0Bound = null;
    for (let i = 0, w = width, h = height; i < levels; i++, w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) gl.texImage2D(gl.TEXTURE_2D, i, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, this._retroMips ? levels - 1 : 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this._tex0Bound = null;
    this.lptAtlases.add(tex);
    return tex;
  }

  uploadAtlasRows(tex, level, y, width, rows) {
    const gl = this.gl;
    this._activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    this._tex0Bound = null;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, level, 0, y, width, rows.length / (width * 4), gl.RGBA, gl.UNSIGNED_BYTE, rows);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this._tex0Bound = null;
  }

  releaseAtlasTexture(tex) {
    if (!this.lptAtlases.delete(tex)) return;
    if (this._tex0Bound === tex) this._tex0Bound = null;
    this.gl.deleteTexture(tex);
  }

  holdBlended(batches) { holdBlendedBillboards(batches, this._heldFlats); }
  drawHeld(camRight, camUp) {
    const held = this._heldFlats;
    if (held.length) this.drawBillboards(held, camRight, camUp);
    held.length = 0;
  }

  drawBillboards(batches, camRight, camUp) {
    this._close2D();
    const gl = this.gl;
    // Forget the VAO shadow on entry, since a foreign pass may have bound an array without markForeignPass.
    this._lastVao = undefined;
    if (this._casting) this._shadows.recordBillboards(batches, this._flatWind, camRight, camUp, this._windfall);
    // After the shadow record, so off-screen casters still cast. Recomputed per call because the panel bracket swaps
    // _proj and _view without moving the stamp; spherePlanes normalizes them for the sphere test.
    const bbCull = !this._bbCullOff && !!this._proj && !!this._view;
    if (bbCull) spherePlanes(mat4Multiply(this._proj, this._view, this._bbPv), this._bbPlanes);
    this._use(this.bbProgram);
    this._uploadCloudShadow('bb');
    gl.uniform3fv(this.bbURight, camRight);
    gl.uniform3fv(this.bbUUp, camUp);
    const bbR = (this._bbRight ??= new Float32Array(3)), bbU = (this._bbUp ??= new Float32Array(3));
    bbR[0] = camRight[0]; bbR[1] = camRight[1]; bbR[2] = camRight[2];
    bbU[0] = camUp[0]; bbU[1] = camUp[1]; bbU[2] = camUp[2];
    if (this.bbUFlatWind) gl.uniform4fv(this.bbUFlatWind, this._flatWind ?? ZERO_FLAT_WIND);
    if (this.bbUWindfallAxis) { gl.uniform4fv(this.bbUWindfallSway, this._windfallSway); gl.uniform4fv(this.bbUWindfallAxis, this._windfallAxis); }
    const wfLaw = windfallLawOn(this._windfall);
    // A uniform holds until its next upload, so the frame block goes up on the first call after the stamp moves.
    const bc = this.bbColumn ?? NO_COLUMN_LOCS;
    const dwc = this._dwColumn && bc.uColumnOn ? this._dwColumn : null;
    if (this._bbFrameStamp !== this._frameStamp) {
      this._bbFrameStamp = this._frameStamp;
      gl.uniformMatrix4fv(this.bbUProj, false, this._proj);
      gl.uniformMatrix4fv(this.bbUView, false, this._view);
      gl.uniform1i(this.bbUTex, 0);
      this._uploadFog(this._bbFog);
      if (this._clockLit) {
        // The moon and sun colors decode into separate scratches; sharing one overwrites the moon's before it is read.
        const am = this._c3(this._ambient, this._decA), mc = this._c3(this._moonColor, this._decB), sc = this._c3(this._sunColor, this._decC);
        gl.uniform3f(
          this.bbUTint,
          am[0] + mc[0] * this._moonScale * 0.5,
          am[1] + mc[1] * this._moonScale * 0.5,
          am[2] + mc[2] * this._moonScale * 0.5
        );
        gl.uniform3f(this.bbUSun, sc[0] * this._sunScale * 0.5, sc[1] * this._sunScale * 0.5, sc[2] * this._sunScale * 0.5);
      } else {
        gl.uniform3f(this.bbUTint, 1, 1, 1);
        gl.uniform3f(this.bbUSun, 0, 0, 0);
      }
      const bbCount = this._pointLights.length >> 2;
      gl.uniform1i(this.bbUPointCount, bbCount);
      if (bbCount > 0) gl.uniform4fv(this.bbUPointLights, this._pointLights);
      if (bbCount > 0) gl.uniform3fv(this.bbUPointColors, this._pointColorData(bbCount));
      gl.uniform4fv(this.bbUIndirect, this._indirect);
      gl.uniform3fv(this.bbUIndirectColor, this._c3(this._indirectColor));
      this._uploadEl('bb');
      gl.uniform1i(this.bbUEmissionTex, 1);
      gl.uniform1f(bc.uColumnOn, 0);
      this._bbColumnOn = 0;
      gl.uniform3f(this.bbUTip, 0, 0, 0);
      this._bbTipOn = false;
      gl.uniform4f(this.bbUDissolve, 0, 0, 0, 0);
      this._bbDissolveOn = false;
      gl.uniform2f(this.bbUCrack, 0, 0);
      this._bbCrackOn = false;
      gl.uniform4f(this.bbUGlint, 0, 0, 0, 0);
      this._bbGlintOn = false;
      gl.uniform3f(this.bbUBatchTint, 1, 1, 1);
      gl.uniform1f(this.bbUBatchDye, 0);
      this._bbTintOn = false;
      gl.uniform1f((this.bbLpt ?? NO_LPT_LOCS).uMesh, 0);
      gl.uniform4f((this.bbLpt ?? NO_LPT_LOCS).uLptCut, 0, 0, 0, 0);
      this._bbLptCutOn = null;
      if (this.bbLpt?.uSunLift) gl.uniform1f(this.bbLpt.uSunLift, 0);
      this._bbSunLiftOn = 0;
      if (this._dwColumn && bc.uColumnOn) {
        const dw = this._dwColumn, v = this._view;
        // The camera forward is minus the third row of the view matrix.
        this._dwCamFwd[0] = -v[2]; this._dwCamFwd[1] = -v[6]; this._dwCamFwd[2] = -v[10];
        gl.uniform3fv(bc.uDwCamFwd, this._dwCamFwd);
        gl.uniform1f(bc.uSeaY, dw.seaY);
        gl.uniform4fv(bc.uTopColor, dw.topColor);
        gl.uniform1f(bc.uTopVision, dw.topVision);
        gl.uniform2fv(bc.uSurfaceScroll, dw.surfaceScroll);
        gl.uniform3fv(bc.uPixelOrigin, dw.origin);
      }
      if (bc.uSurfaceTex) gl.uniform1i(bc.uSurfaceTex, BB_SURFACE_UNIT);
    }
    if (dwc) {
      this._activeTexture(gl.TEXTURE0 + BB_SURFACE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, dwc.surfaceTexture ?? null);
      this._activeTexture(gl.TEXTURE0);
    }
    gl.disable(gl.CULL_FACE);
    // The cutout pass sorts by texture key, keeping the string sort's order (billboardKey.js), since a depth tie keeps
    // the first-drawn flat.
    let lastKey = null;
    let lastDark = false;
    let lastSway = null;
    let lastFlash = null;
    let lastGlow = null;
    // The last uploaded values are this call's only (NaN matches nothing), because a uniform belongs to its program.
    let lastW = NaN, lastH = NaN, lastOx = NaN, lastOy = NaN, lastOz = NaN;
    const drawOne = (b) => {
      const key = billboardKey(b);
      const tex = this.textures.get(key) ?? this._textureMissed(key);
      if (!tex) return;
      // A change of emissionOff forgets the last key, so lit and unlit lanterns of one record never share a bind.
      if (!!b.emissionOff !== lastDark) { lastDark = !!b.emissionOff; lastKey = null; }
      if (key !== lastKey) {
        this._activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        this._activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, (!b.emissionOff && this.emissionTextures.get(key)) || this._blackTex);
        this._tex0Bound = null;
        // This path owns unit 1 while it runs, so the mesh loop's shadow cannot speak for it afterward.
        this._tex1Bound = null;
        this.stats.texBinds += 2;
        lastKey = key;
      }
      const w = b.size.w, h = b.size.h;
      if (w !== lastW || h !== lastH) { gl.uniform2f(this.bbUSize, w, h); lastW = w; lastH = h; }
      const o = b.origin || ZERO_ORIGIN;
      if (o[0] !== lastOx || o[1] !== lastOy || o[2] !== lastOz) { gl.uniform3f(this.bbUOrigin, o[0], o[1], o[2]); lastOx = o[0]; lastOy = o[1]; lastOz = o[2]; }
      const sw = swayShare(b, wfLaw);
      if (sw !== lastSway) { gl.uniform1f(this.bbUSway, sw); lastSway = sw; }
      const tp = b.tip;
      if (tp || this._bbTipOn) { gl.uniform3f(this.bbUTip, tp ? tp[0] : 0, tp ? tp[1] : 0, tp ? tp[2] : 0); this._bbTipOn = !!tp; }
      const col = dwc && b.dwColumn ? 1 : 0;
      if (col !== this._bbColumnOn) { gl.uniform1f(bc.uColumnOn, col); this._bbColumnOn = col; }
      const hf = b.hitFlash || 0;
      if (hf !== lastFlash) { gl.uniform1f(this.bbUHitFlash, hf); lastFlash = hf; }
      const eg = b.eliteGlow || 0;
      if (eg !== lastGlow) { gl.uniform1f(this.bbUEliteGlow, eg); lastGlow = eg; }
      const gt = b.glint;
      if (gt || this._bbGlintOn) { gl.uniform4f(this.bbUGlint, gt ? gt[0] : 0, gt ? gt[1] : 0, gt ? gt[2] : 0, gt ? gt[3] : 0); this._bbGlintOn = !!gt; }
      const ep = eg !== 0 ? b.elitePad : (gt ? TELL_GLINT_PAD : null);
      if (ep || this._bbPadOn) { gl.uniform4f(this.bbUElitePad, ep ? ep[0] : 0, ep ? ep[1] : 0, ep ? ep[2] : 0, ep ? ep[3] : 0); this._bbPadOn = !!ep; }
      if (eg !== 0) gl.uniform1f(this.bbUEliteTime, (performance.now() / 1000) % 3600);
      const dv = b.dissolve;
      if (dv || this._bbDissolveOn) { gl.uniform4f(this.bbUDissolve, dv ? dv[0] : 0, dv ? dv[1] : 0, dv ? dv[2] : 0, dv ? dv[3] : 0); this._bbDissolveOn = !!dv; }
      const ck = b.crack;
      if (ck || this._bbCrackOn) { gl.uniform2f(this.bbUCrack, ck ? ck[0] : 0, ck ? ck[1] : 0); this._bbCrackOn = !!ck; }
      const tn = b.tint;
      if (tn || this._bbTintOn) { gl.uniform3f(this.bbUBatchTint, tn ? tn[0] : 1, tn ? tn[1] : 1, tn ? tn[2] : 1); gl.uniform1f(this.bbUBatchDye, tn ? b.dye ?? 0 : 0); this._bbTintOn = !!tn; }
      const sl = b.sunLift ?? 0;
      if (sl !== this._bbSunLiftOn) { if (this.bbLpt?.uSunLift) gl.uniform1f(this.bbLpt.uSunLift, sl); this._bbSunLiftOn = sl; }
      const lc = b.lptProto ? this._lptFrameOf(b.lptProto) : null;
      if (lc !== this._bbLptCutOn) { this._uploadLptCut(lc); this._bbLptCutOn = lc; }
      this._bindVao(b.vao);
      gl.drawElements(gl.TRIANGLES, b.indexCount, gl.UNSIGNED_INT, b._ibOff | 0);
      this.stats.draws++;
    };
    gl.uniform1i(this.bbUSpectral, 0);
    gl.uniform4f(this.bbUConceal, 0, 0, 0, 0);
    const opaque = this._bbOpaque ??= [];
    opaque.length = 0;
    for (const b of batches) {
      if (b.castOnly) continue;
      if (ghostShaded(b) || b.conceal) continue;
      if (bbCull && !this._bbVisible(b)) { this.stats.bbCulled++; continue; }
      billboardKey(b);
      opaque.push(b);
    }
    sortByKey(opaque);
    for (const b of opaque) drawOne(b);
    opaque.length = 0;
    // The frame's trees draw once and their set is spent here; they bind their own atlases, so the lasts are forgotten.
    const slots = this._lptSlots;
    let treesNow = false;
    if (slots) for (let i = 0; i < slots.length; i++) if (slots[i]?.runs.length) treesNow = true;
    if (treesNow) {
      // The trees take none of the last flat's per-batch state.
      if (lastFlash !== 0) { gl.uniform1f(this.bbUHitFlash, 0); lastFlash = 0; }
      if (lastGlow !== 0) { gl.uniform1f(this.bbUEliteGlow, 0); lastGlow = 0; }
      if (this._bbPadOn) { gl.uniform4f(this.bbUElitePad, 0, 0, 0, 0); this._bbPadOn = false; }
      if (this._bbDissolveOn) { gl.uniform4f(this.bbUDissolve, 0, 0, 0, 0); this._bbDissolveOn = false; }
      if (this._bbCrackOn) { gl.uniform2f(this.bbUCrack, 0, 0); this._bbCrackOn = false; }
      if (this._bbTintOn) { gl.uniform3f(this.bbUBatchTint, 1, 1, 1); gl.uniform1f(this.bbUBatchDye, 0); this._bbTintOn = false; }
      if (this._bbColumnOn) { gl.uniform1f(bc.uColumnOn, 0); this._bbColumnOn = 0; }
      for (let i = 0; i < slots.length; i++) if (slots[i]?.runs.length) this._drawLowPolyTrees(slots[i]);
      const drawn = this._lptDrawn ??= [null, null];
      for (let i = 0; i < slots.length; i++) drawn[i] = slots[i]?.runs.length ? slots[i] : null;
      lastKey = null; lastW = NaN; lastH = NaN; lastOx = NaN; lastOy = NaN; lastOz = NaN; lastSway = null;
      this._bbLptCutOn = undefined;
    }
    if (slots) slots.fill(null);
    // Blended phase: depth writes off, drawn back to front so a translucent enemy behind another shows through it.
    let blended = null;
    for (const b of batches) {
      if (!billboardBlended(b)) continue;
      if (bbCull && !this._bbVisible(b)) { this.stats.bbCulled++; continue; }
      (blended ??= []).push(b);
    }
    if (blended) {
      const cp = this._camPos;
      const d2 = (b) => { const o = b.origin || ZERO_ORIGIN; const dx = o[0] - cp[0], dy = o[1] - cp[1], dz = o[2] - cp[2]; return dx * dx + dy * dy + dz * dz; };
      blended.sort((a, b) => d2(b) - d2(a));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const b of blended) {
        const c = b.conceal;
        gl.uniform1i(this.bbUSpectral, ghostShaded(b) ? 1 : 0);
        gl.uniform4f(this.bbUConceal, c ? c.mode : 0, c ? c.alpha : 0, c ? c.t : 0, c ? c.phase : 0);
        drawOne(b);
      }
      gl.uniform4f(this.bbUConceal, 0, 0, 0, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    this._activeTexture(gl.TEXTURE0);
    this._bindVao(null);
    gl.enable(gl.CULL_FACE);
    this._use(this.program);
  }

  _warnMissingMesh(mesh, modelMatrix = undefined) {
    this._missingMeshes ??= new Set();
    const why = mesh == null ? 'no mesh' : !mesh.vao ? 'no vao'
      : !mesh.subMeshes?.length ? 'no subMeshes' : 'no matrix';
    const key = `${why}:${mesh?.name ?? mesh?.modelId ?? '?'}`;
    if (this._missingMeshes.has(key)) return;
    this._missingMeshes.add(key);
    console.warn(`[renderer] drawMesh skipped a draw with ${why} - a model is missing from this scene, not from the frame loop`, mesh, modelMatrix);
  }

  // WebGL2 has no geometry shader, so DFU's wireframe becomes gl.LINES over an edge buffer. The lines get their own
  // VAO over the mesh's vertex buffers, since a VAO captures its element buffer binding.
  drawMeshWire(mesh, modelMatrix, texRemap = null) {
    this._drawMeshBundle(mesh, modelMatrix, texRemap, true);
  }

  _ensureWireMesh(mesh) {
    if (mesh._wire !== undefined) return mesh._wire;
    if (!mesh.triIndices || !mesh.buffers || mesh.buffers.length < 3) {
      mesh._wire = null;
      return null;
    }
    const gl = this.gl;
    const { indices, ranges } = buildWireIndices(mesh.triIndices, mesh.subMeshes);
    const vao = gl.createVertexArray();
    this._bindVao(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[0]);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[1]);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[2]);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this._bindVao(null);
    mesh._wire = { vao, ebo, ranges, indexCount: indices.length };
    return mesh._wire;
  }

  drawMesh(mesh, modelMatrix, texRemap = null, { noShadow = false, translucent = 0 } = {}) {
    this._close2D();
    if (this._rwOutside && this._rwSkips(mesh)) return;
    // Translucent draws come after the opaque world, back to front, depth-tested without writes and casting no shadow.
    if (translucent > 0) { this._drawTranslucent(mesh, modelMatrix, texRemap, Math.min(translucent, 1)); return; }
    this._drawMeshBundle(mesh, modelMatrix, texRemap, false, noShadow);
  }

  _drawTranslucent(mesh, modelMatrix, texRemap, alpha) {
    const gl = this.gl;
    this._use(this.program);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(this.uMeshAlpha, alpha);
    try {
      this._drawMeshBundle(mesh, modelMatrix, texRemap, false, true);
    } finally {
      this._use(this.program);
      gl.uniform1f(this.uMeshAlpha, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  _drawMeshBundle(mesh, modelMatrix, texRemap, wire, noShadow = false) {
    this._close2D();
    // Missing data costs only the missing mesh: an absent mesh or matrix warns once and is skipped.
    if (!mesh?.vao || !mesh.subMeshes?.length || modelMatrix == null) {
      this._warnMissingMesh(mesh, modelMatrix);
      return;
    }
    const gl = this.gl;
    const wireMesh = wire ? this._ensureWireMesh(mesh) : null;
    if (wire && !wireMesh) return;
    // Every draw entry point binds its own program; terrain draws may run before this one.
    this._use(this.program);
    this._uploadCloudShadow('mesh');
    gl.uniformMatrix4fv(this.uModel, false, modelMatrix);
    if (!wire && !noShadow && this._casting) this._shadows.recordMesh(mesh, modelMatrix, texRemap, 1 - (this._dissolve ?? 1));
    this._bindVao(wire ? wireMesh.vao : mesh.vao);
    for (let smi = 0; smi < mesh.subMeshes.length; smi++) {
      const sm = mesh.subMeshes[smi];
      // A miss is not stamped, since the texture may still be streaming in.
      let tex;
      if (sm._evGen === this._texGen && sm._evRemap === texRemap) {
        tex = sm._evTex;
      } else {
        const key = sm._evKey ?? (sm._evKey = `${sm.textureArchive}_${sm.textureRecord}`);
        const resolved = texRemap && texRemap.has(key) ? texRemap.get(key) : key;
        // The mesh material (alphaIndex -1) is looked up first.
        tex = this.textures.get(resolved + '#opaque') ?? this._textureMissed(resolved + '#opaque') ?? this.textures.get(resolved) ?? this._textureMissed(resolved);
        if (tex) {
          sm._evTex = tex;
          sm._evEmis = this.emissionTextures.get(resolved) || this._blackTex;
          sm._evEmisWhite = this.emissionWhite.has(resolved);
          const glassMask = sm._evEmis === this._blackTex ? this.glassMasks?.get(resolved) : undefined;
          if (glassMask) sm._evEmis = glassMask;
          sm._evWin = glassMask ? GLASS_INTERIOR : this.windowMasks?.has(resolved) ? GLASS_EXTERIOR : GLASS_NONE;
          sm._evCut = !!this._cutoutArt?.has(tex);
          if (sm._evCut) mesh._evAnyCut = true;
          sm._evGen = this._texGen;
          sm._evRemap = texRemap;
        }
      }
      if (!tex) continue;
      // An auto-emissive mask is its own albedo and wears white; only a window mask wears the window style.
      const emisColor = sm._evEmisWhite ? EMISSION_WHITE : this._windowEmission;
      if (this._emissionColorUp !== emisColor) {
        gl.uniform3fv(this.uEmissionColor, this._c3(emisColor));
        this._emissionColorUp = emisColor;
      }
      if (sm._evWin || sm._evCut || this._rwModeUp !== 0 || this._rwCutUp !== 0) this._rwSubMesh(sm, modelMatrix, wire ? null : mesh);
      this._bindEmission(sm._evEmis);
      this._bindTex0(tex);
      if (wire) {
        const range = wireMesh.ranges[smi];
        gl.drawElements(gl.LINES, range.count, gl.UNSIGNED_INT, range.start * 4);
        this.stats.draws++;
      } else {
        gl.drawElements(gl.TRIANGLES, sm.primitiveCount * 3, gl.UNSIGNED_INT, sm.startIndex * 4);
        this.stats.draws++;
      }
    }
    if (this._rwModeUp > 0 || this._rwCutUp > 0) this._rwRest();
    // No trailing VAO unbind: every VAO or element buffer bind in this file goes through _bindVao or a fresh VAO.
  }
}
