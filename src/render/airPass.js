// @ts-check
// The frame is 8-bit and display-encoded, so foreign passes keep writing display values; both encodes dither.
// Bloom and shafts composite at the frame's first screen-space draw (drawScreenQuad), over the world viewport.
// This module imports nothing of the renderer or the lane; the renderer hands it vertex shaders and a builder.

import { multiply } from '../world/mat4.js';
import { setFrameTarget } from './renderTarget.js';
import { CLOUD_SHADOW_GLSL } from './cloudShadow.js';
import { BAYER_GLSL, BAYER_MEAN } from './orderedDither.js';
import { spherePlanes, recordVisible, subMeshVisible, batchVisible, ZERO_ORIGIN } from './bounds.js';
import { billboardKey } from './billboardKey.js';
import { windfallLawOn, swayShare } from './windfallSway.js';
import { pageParam } from '../platform/pageQuery.js';
import { GLASS_INTERIOR, GLASS_EXTERIOR, RW_SEED_GLSL } from './realWindows.js';

export function airOn(search = globalThis.location?.search ?? '') {
  return pageParam('air', search) !== 'off';
}
export function contactOn(search = globalThis.location?.search ?? '') {
  return pageParam('contact', search) !== 'off';
}

export const AIR_AO_SCALE = 0.5;
export const AIR_BLOOM_SCALE = 0.25;
export const AIR_AO_RADIUS = 0.8;
export const AIR_AO_SAMPLES = 6;
export const AIR_AO_DIRECTIONS = 2;
export const AIR_AO_STORE = 0.5;
export const AIR_AO_FALLOFF = 0.6;
export const AIR_AO_STRENGTH = 1.0;
export const AIR_AO_BIAS = 0.02;
export const AIR_AO_BLUR_SHARE = 0.15;
export const AIR_AO_RESOLVE = 0.75;
export const AIR_EMIT_SLACK = 0.15;
export const AIR_BLOOM_STRENGTH = 0.6;
export const AIR_GLARE_SIZE = 0.25;
// A glare needs a surface within this of the light in the frame's depth, so a light floating in air gets none.
export const AIR_GLARE_SLACK = 0.25;
// Contact shadows march the previous frame's depth, reprojected, because the current depth is still being written.
export const AIR_CONTACT_LENGTH = 0.6;
export const AIR_CONTACT_THICKNESS = 0.8;
export const AIR_CONTACT_STEPS = 4;
export const AIR_CONTACT_FLOOR = 0.15;
export const AIR_CONTACT_UNIT = 12;
export const AIR_CONTACT_RANGE_FRACTION = 0.7;
// An eye moving past AIR_CONTACT_CUT between world frames is a cut: the next frame reads no previous depth.
export const AIR_CONTACT_SELF = 0.05;
export const AIR_CONTACT_SLOPE_MAX = 16;
// The tolerance covers the lift, which puts the lifted point about AIR_CONTACT_LIFT / cos(slope) nearer.
export const AIR_CONTACT_LIFT = 0.02;
export const AIR_CONTACT_RAMP = 0.08;
export const AIR_CONTACT_CUT = 4;
// A whole number interpolates as an int literal, which GLSL rejects against floats, so shader constants go here.
export const glslFloat = (v) => (Number.isInteger(v) ? `${v}.0` : String(v));
export const AIR_GLARE_MAX_RANGE = 120;
export const AIR_SHAFT_TAPS = 32;
export const AIR_VOL_STEPS = 8;
export const AIR_VOL_BLUR_SHARE = 0.15;
export const AIR_SHAFT_DECAY = 0.96;
export const AIR_SHAFT_STRENGTH = 0.35;
export const AIR_SHAFT_REACH = 0.35;
export const AIR_HAZE_STEPS = 12;
export const AIR_HAZE_REACH = 3000;
export const AIR_HAZE_G = 0.6;
export const AIR_HAZE_ISO = 0.3;
export const AIR_HAZE_PROBE_KEY = 0.9;
export const AIR_HAZE_GAIN = 1 / AIR_HAZE_PROBE_KEY;
export const AIR_ADAPT_UNIT = 11;
export const AIR_LUM_SIZE = 32;
export const AIR_ADAPT_KEY = 0.18;
export const AIR_ADAPT_MIN = 0.7;
export const AIR_ADAPT_MAX = 1.8;
export const AIR_ADAPT_OPEN = 0.6;
export const AIR_ADAPT_CLOSE = 3.0;
// shadowPass.js sets calm once a frame from the Calmer eye switch; the rates are uniforms, so no shader changes.
export const AIR_CALM_RATE = 0.35;
export const AIR_TUNING = { calm: false };
export const AIR_LUM_LOG_RANGE = Object.freeze([-12, 4]);
export const AIR_ADAPT_LOG_RANGE = Object.freeze([-2, 2]);
export const AIR_BRIGHT_THRESHOLD = 0.85;
export const AIR_VIGNETTE = 0.28;
export const AIR_CONTRAST = 1.04;
export const AIR_ADAPT_MAX_DT = 0.1;
// The eye state is sixteen bits: the high byte in R and the low byte in G of one RGBA8 1x1 image.
export const AIR_ADAPT_STEPS = 65535;

// These mirror the shader encodings term for term, so change both together.
export function packLog(x, range) {
  const v = (Math.log2(Math.max(x, 1e-9)) - range[0]) / (range[1] - range[0]);
  return Math.min(Math.max(v, 0), 1);
}
export function unpackLog(v, range) {
  return Math.pow(2, range[0] + v * (range[1] - range[0]));
}
export function packAdapt(m) {
  const q = Math.floor(packLog(m, AIR_ADAPT_LOG_RANGE) * AIR_ADAPT_STEPS + 0.5);
  const hi = Math.floor(q / 256);
  return [hi, q - hi * 256];
}
export function unpackAdapt(hi, lo) {
  return unpackLog((hi * 256 + lo) / AIR_ADAPT_STEPS, AIR_ADAPT_LOG_RANGE);
}
export function adaptStepStored(bytes, lum, dt, bits = 16) {
  if (bits === 8) {
    const next = adaptStep(unpackLog(bytes[0] / 255, AIR_ADAPT_LOG_RANGE), lum, dt);
    return [Math.round(packLog(next, AIR_ADAPT_LOG_RANGE) * 255), 0];
  }
  return packAdapt(adaptStep(unpackAdapt(bytes[0], bytes[1]), lum, dt));
}
export function lumTapLog(l, prev = 1) {
  return Math.min(Math.max(Math.log2(Math.max(l / prev, 1e-9)), AIR_LUM_LOG_RANGE[0]), AIR_LUM_LOG_RANGE[1]);
}
export function adaptStep(prev, lum, dt) {
  const target = Math.min(Math.max(AIR_ADAPT_KEY / Math.max(lum, 1e-6), AIR_ADAPT_MIN), AIR_ADAPT_MAX);
  const rate = target > prev ? AIR_ADAPT_OPEN : AIR_ADAPT_CLOSE;
  const t = 1 - Math.exp(-Math.min(Math.max(dt, 0), AIR_ADAPT_MAX_DT) * rate);
  return prev + (target - prev) * t;
}

export function projInfo(proj, out = new Float32Array(4)) {
  out[0] = proj[0]; out[1] = proj[5]; out[2] = proj[10]; out[3] = proj[14];
  return out;
}

export function viewDepth(zNdc, p10, p14) {
  return -p14 / (zNdc + p10);
}

export function sunScreenUV(proj, view, lightDir) {
  const vx = view[0] * lightDir[0] + view[4] * lightDir[1] + view[8] * lightDir[2];
  const vy = view[1] * lightDir[0] + view[5] * lightDir[1] + view[9] * lightDir[2];
  const vz = view[2] * lightDir[0] + view[6] * lightDir[1] + view[10] * lightDir[2];
  const cx = proj[0] * vx + proj[4] * vy + proj[8] * vz;
  const cy = proj[1] * vx + proj[5] * vy + proj[9] * vz;
  const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz;
  if (!(cw > 1e-6)) return null;
  return [cx / cw * 0.5 + 0.5, cy / cw * 0.5 + 0.5];
}


export function glareSize(range) {
  return AIR_GLARE_SIZE * Math.sqrt(Math.max(range, 0));
}

export const AIR_GLARE_TAPS = Object.freeze((() => {
  const taps = [];
  for (let k = 0; k < 10; k++) {
    const y = +(0.3 + 0.18 * k).toFixed(2), x = +(0.012 * (k + 1) * (k % 2 ? -1 : 1)).toFixed(3);
    taps.push([x, y], [-x, -y]);
  }
  for (let k = 0; k < 4; k++) {
    const x = 0.25 * (k + 1), y = +((0.4 + 0.05 * k) * (k % 2 ? 1 : -1)).toFixed(2);
    taps.push([x, y], [-x, -y]);
  }
  return taps.map((t) => Object.freeze(t));
})());
// A glare is sized by a range held per light place, so the city lights' flicker does not make it blink.
export const AIR_GLARE_HOLD_BAND = 2;
export function heldGlareRange(held, live) {
  return !(held > 0) || live > held || live < held - AIR_GLARE_HOLD_BAND ? live : held;
}
const GLARE_KEY_SPAN = 131072;
export function glareKey(x, y, z) {
  const q = (v) => ((Math.round(v * 8) % GLARE_KEY_SPAN) + GLARE_KEY_SPAN) % GLARE_KEY_SPAN;
  return (q(x) * GLARE_KEY_SPAN + q(y)) * GLARE_KEY_SPAN + q(z);
}

// Four reads at the inner corners of the 4x4 block cover every pixel of it once.
export const AIR_BRIGHT_TAPS = Object.freeze([[-1, -1], [1, -1], [-1, 1], [1, 1]].map((t) => Object.freeze(t)));

const DEPTH_GLSL = `
uniform highp sampler2D uDepth;   // AUDIT-VC7 (G2): a fragment shader's samplers are lowp unless told - a depth read at lowp is not a depth
uniform vec4 uProjInfo;   // proj[0], proj[5], proj[10], proj[14]
uniform vec4 uRect;       // the world rect in canvas pixels
uniform vec2 uCanvas;
float viewDist(float d01) {
  float z = d01 * 2.0 - 1.0;
  return uProjInfo.w / (z + uProjInfo.z);   // -viewZ: positive, along the eye's -z
}
float depthAt(vec2 wuv) {   // AUDIT-VC7 (G3): level 0 by name - a depth image has no others, and a loop's branch has no derivatives to choose one by
  return textureLod(uDepth, (uRect.xy + wuv * uRect.zw) / uCanvas, 0.0).r;
}
`;



export function holdPrevRect(out, rect, canvas) {
  const W = canvas[0] > 0 ? canvas[0] : 1, H = canvas[1] > 0 ? canvas[1] : 1;
  out[0] = rect[0] / W; out[1] = rect[1] / H; out[2] = rect[2] / W; out[3] = rect[3] / H;
  return out;
}

// The contact block reads the host shader's uCamPos, so every lane shader that takes it declares uCamPos first.
export const AIR_CONTACT_GLSL = `
uniform highp sampler2D uPrevDepth;   // AUDIT-VC7 (G2): a depth, at a depth's precision
uniform mat4 uPrevVP;
uniform vec4 uPrevProjInfo;   // the previous frame's projection terms (viewDist)
uniform vec4 uContactParams;  // x length, y thickness, z floor, w 1 = on
// DISC7: the previous frame's WORLD RECT in the canvas, normalised (x, y, w, h). uPrevVP's clip space covers the
// world viewport, and the depth it was written under is the whole canvas - a docked large HUD takes the bottom of it.
// Every other screen pass maps through its rect (DEPTH_GLSL's depthAt); this block read the canvas as if the rect
// were all of it, so under the docked bar every sample came from the wrong row and near the bottom from the bar's
// cleared strip. The bounds tests stay in the rect's own [0,1].
uniform vec4 uPrevRect;
vec2 prevDepthUV(vec2 wuv) { return uPrevRect.xy + wuv * uPrevRect.zw; }
float contactShadow(vec3 wp, vec3 n, vec3 toLight, float dist) {
  if (uContactParams.w <= 0.0) return 1.0;
  float len = min(dist, uContactParams.x);
  vec3 start = wp + n * ${glslFloat(AIR_CONTACT_LIFT)};
  // F3: THE SURFACE MUST HAVE BEEN THERE. The march reads LAST frame's depth,
  // and a wall just revealed round a corner was not in it: its pixels
  // reproject onto the corner's near face, every sample lands "behind" it,
  // and the whole wall wore a shadow that swam with the turn. So the point
  // itself is reprojected first, and only a point the previous frame saw
  // where it stands is marched.
  vec4 c0 = uPrevVP * vec4(start, 1.0);
  if (c0.w <= 0.0) return 1.0;
  vec2 uv0 = c0.xy / c0.w * 0.5 + 0.5;
  if (uv0.x < 0.0 || uv0.x > 1.0 || uv0.y < 0.0 || uv0.y > 1.0) return 1.0;
  float z0 = texture(uPrevDepth, prevDepthUV(uv0)).r * 2.0 - 1.0;
  // LA-POST6: "where it stands" is the surface's own tolerance, not the occluder thickness (0.8 let a wall revealed
  // within 80 cm behind a pillar through, into the pillar's shadow): AIR_CONTACT_SELF, plus the depth one texel of the
  // previous image spans on this surface - its view distance times the texel's tangent (the rect's rows through the
  // projection's focal term) times the tangent of its slope to the eye, capped at AIR_CONTACT_SLOPE_MAX; LA-AUDIT B1: and
  // the lift the start stands off the surface, seen along the ray
  float ct = max(abs(dot(n, normalize(uCamPos - wp))), ${glslFloat(1 / AIR_CONTACT_SLOPE_MAX)});
  float texelTan = 2.0 / (abs(uPrevProjInfo.y) * uPrevRect.w * float(textureSize(uPrevDepth, 0).y));
  float tol = ${glslFloat(AIR_CONTACT_SELF)} + ${glslFloat(AIR_CONTACT_LIFT)} / ct + c0.w * texelTan * sqrt(1.0 - ct * ct) / ct;
  if (abs(c0.w - uPrevProjInfo.w / (z0 + uPrevProjInfo.z)) > tol) return 1.0;
  // LA-POST6: the steps are start + toLight * (len * i / steps) and a projection is linear in its point, so step i's
  // clip position is c0 + i * dc - one product for the march where there was one a step
  vec4 dc = uPrevVP * vec4(toLight * (len / ${glslFloat(AIR_CONTACT_STEPS)}), 0.0);
  float occ = 0.0;
  for (int i = 1; i <= ${AIR_CONTACT_STEPS}; i++) {
    vec4 c = c0 + dc * float(i);
    if (c.w <= 0.0) break;
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float z = texture(uPrevDepth, prevDepthUV(uv)).r * 2.0 - 1.0;
    float sceneDist = uPrevProjInfo.w / (z + uPrevProjInfo.z);
    float behind = c.w - sceneDist;   // c.w is the point's view distance under that projection
    // LA-POST6: A CLAIM, NOT A VERDICT. Each step was all or nothing off one NEAREST texel - the floor at 0.02 behind,
    // nothing at 0.019 or past the thickness - so a contact shadow's edge flipped whole as the texels under the steps
    // changed. A step claims a share now: rising over AIR_CONTACT_RAMP past the 0.02, easing out over the thickness's
    // last quarter; the strongest claim darkens toward the floor
    occ = max(occ, smoothstep(0.02, ${glslFloat(0.02 + AIR_CONTACT_RAMP)}, behind) * (1.0 - smoothstep(uContactParams.y * 0.75, uContactParams.y, behind)));
  }
  return mix(1.0, uContactParams.z, occ);
}
`;

// Each byte is rounded first, since a half-precision fetch returns b / 255 too coarsely for sixteen bits.
const ADAPT_CODEC_GLSL = `
float airAdaptLog2(vec4 t) {
  return (floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5)) / ${glslFloat(AIR_ADAPT_STEPS)} * ${glslFloat(AIR_ADAPT_LOG_RANGE[1] - AIR_ADAPT_LOG_RANGE[0])} + (${glslFloat(AIR_ADAPT_LOG_RANGE[0])});
}
`;

export const AIR_ADAPT_GLSL = `
uniform highp sampler2D uAdapt;   // LA-AUDIT B5: sixteen bits, at a precision that holds them
${ADAPT_CODEC_GLSL}
float elAdapt() {
  return exp2(airAdaptLog2(texture(uAdapt, vec2(0.5))));
}
`;

const QUAD_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// The lane's sRGB codec is restated here because this module imports nothing of the lane; keep the two equal.
const CODEC_GLSL = `
vec3 airDecode(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(hi, lo, step(c, vec3(0.04045)));
}
vec3 airEncode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, step(c, vec3(0.0031308)));
}
`;

const LUM_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uFrame;
uniform highp sampler2D uPrev;   // AUDIT-EL F16: the eye's own multiplier, divided out - the frame is the ADAPTED image; LA-AUDIT B5: highp
uniform vec4 uRect;     // the world rect in canvas pixels
uniform vec2 uCanvas;
uniform sampler2D uVol;    // AUDIT VOL1: the glow the resolve will add - the eye adapts to the frame it will see
${CODEC_GLSL}
${ADAPT_CODEC_GLSL}
out vec4 outColor;
void main() {
  // AUDIT-EL F16: sixteen taps over this texel's cell of the world rect, not
  // one - a torch crossing a single tap moved the mean a stop as the camera
  // panned; and the luminance is the SCENE's, the eye divided out, so the
  // step aims at the unadapted world and not at its own output
  float prev = exp2(airAdaptLog2(texture(uPrev, vec2(0.5))));   // LA-POST4: the eye's sixteen bits
  vec2 cell = 1.0 / vec2(${AIR_LUM_SIZE}.0);
  float acc = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      vec2 t = vUV + (vec2(float(x), float(y)) + 0.5) * cell * 0.25 - cell * 0.5;
      vec2 uv = (uRect.xy + t * uRect.zw) / uCanvas;
      vec3 c = airDecode(texture(uFrame, uv).rgb) + airDecode(texture(uVol, t).rgb);   // AUDIT VOL1
      // LA-POST4: each tap's log clamped to the range the image encodes (lumTapLog) - a black tap scored -29.9 stops
      acc += clamp(log2(max(dot(c, vec3(0.2126, 0.7152, 0.0722)) / prev, 1e-9)), ${glslFloat(AIR_LUM_LOG_RANGE[0])}, ${glslFloat(AIR_LUM_LOG_RANGE[1])});
    }
  }
  float v = (acc / 16.0 - (${AIR_LUM_LOG_RANGE[0]}.0)) / ${AIR_LUM_LOG_RANGE[1] - AIR_LUM_LOG_RANGE[0]}.0;
  outColor = vec4(vec3(clamp(v, 0.0, 1.0)), 1.0);
}`;

const ADAPT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform highp sampler2D uPrev;   // LA-AUDIT B5
uniform sampler2D uLum;
uniform vec4 uAdaptParams;   // dt, key, min, max
uniform vec2 uAdaptRates;    // open, close
${ADAPT_CODEC_GLSL}
out vec4 outColor;
void main() {
  float prev = exp2(airAdaptLog2(texture(uPrev, vec2(0.5))));
  float lv = textureLod(uLum, vec2(0.5), ${Math.log2(AIR_LUM_SIZE)}.0).r;
  float lum = exp2(lv * ${AIR_LUM_LOG_RANGE[1] - AIR_LUM_LOG_RANGE[0]}.0 + (${AIR_LUM_LOG_RANGE[0]}.0));
  float target = clamp(uAdaptParams.y / max(lum, 1e-6), uAdaptParams.z, uAdaptParams.w);
  float rate = target > prev ? uAdaptRates.x : uAdaptRates.y;
  float t = 1.0 - exp(-uAdaptParams.x * rate);
  float next = prev + (target - prev) * t;
  float v = clamp((log2(next) - (${AIR_ADAPT_LOG_RANGE[0]}.0)) / ${AIR_ADAPT_LOG_RANGE[1] - AIR_ADAPT_LOG_RANGE[0]}.0, 0.0, 1.0);
  // LA-POST4: sixteen bits - the nearest step, its high byte in R and the rest in G (each an exact byte / 255)
  float q = floor(v * ${glslFloat(AIR_ADAPT_STEPS)} + 0.5);
  float hi = floor(q / 256.0);
  outColor = vec4(hi / 255.0, (q - hi * 256.0) / 255.0, 0.0, 1.0);
}`;

// Each quarter is thresholded before the average, so a highlight blooms the same wherever it sits in its block.
const brightFs = (glow) => `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uFrame;
uniform vec4 uRect;
uniform vec2 uCanvas;
uniform float uThreshold;
uniform vec2 uBloomSize;  // LA-AUDIT B3: the image's own texels
uniform sampler2D uVol;   // AUDIT VOL1: a halo's core is bright enough to bloom
${CODEC_GLSL}
out vec4 outColor;
// LA-POST1: one quarter of the block - a bilinear read at a pixel corner, the 2x2 about it - with the glow, thresholded
vec3 brightTap(vec2 uv, vec3 glow) {
  vec3 c = airDecode(texture(uFrame, uv).rgb) + glow;
  return c * smoothstep(uThreshold, 1.0, dot(c, vec3(0.2126, 0.7152, 0.0722)));
}
void main() {
  // the block's centre - the corner of its middle four pixels. LA-AUDIT B3 (lens B measured it): ON A GRID OF FOUR.
  // A rect whose side is not four times the image's (1366 wide, a docked HUD's height, a dpr-scaled window) spread
  // the blocks a fraction apart, the centres fell between corners and the taps read single pixels: a 3x3 flame's
  // energy ran 0.25 to 0.5 over its 16 places at 94 of 1366 columns. Snapping each centre to its corner left the
  // fraction to gather into a column read twice (0.5) or a row read by no block (0). So the blocks are whole 4x4s on
  // one grid, centred on the rect: at most a pixel from where the image maps them, and only the grid's two edge blocks,
  // held inside the rect, read a column twice.
  vec2 grid = floor((uRect.zw - 4.0 * uBloomSize) * 0.5 + 0.5);
  vec2 uv = min(max(uRect.xy + grid + 4.0 * floor(gl_FragCoord.xy) + 2.0, uRect.xy + 2.0), uRect.xy + uRect.zw - 2.0) / uCanvas;
  vec2 px = 1.0 / uCanvas;                            // one full-resolution pixel
  vec3 glow = vec3(0.0)${glow ? ' + airDecode(texture(uVol, vUV).rgb)' : ''};
  vec3 acc = brightTap(uv + vec2(${glslFloat(AIR_BRIGHT_TAPS[0][0])}, ${glslFloat(AIR_BRIGHT_TAPS[0][1])}) * px, glow) + brightTap(uv + vec2(${glslFloat(AIR_BRIGHT_TAPS[1][0])}, ${glslFloat(AIR_BRIGHT_TAPS[1][1])}) * px, glow)
           + brightTap(uv + vec2(${glslFloat(AIR_BRIGHT_TAPS[2][0])}, ${glslFloat(AIR_BRIGHT_TAPS[2][1])}) * px, glow) + brightTap(uv + vec2(${glslFloat(AIR_BRIGHT_TAPS[3][0])}, ${glslFloat(AIR_BRIGHT_TAPS[3][1])}) * px, glow);
  outColor = vec4(acc * 0.25, 1.0);
}`;

// The resolve is built per set of images the frame holds, not gated by a uniform if, which compilers flatten.
const resolveFs = (glow, shafts) => `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uFrame;
uniform sampler2D uBloom;
uniform sampler2D uShaft;
uniform vec4 uRect;      // the world rect in canvas pixels
uniform vec2 uCanvas;
uniform vec4 uGrade;     // bloom gain, shaft gain, vignette, contrast
uniform sampler2D uAO;   // EL6: the occlusion off the frame's own depth
uniform float uAOMix;
uniform sampler2D uVol;  // VOL1: the lanterns' glow, tonemapped, through their shadows
${CODEC_GLSL}
${BAYER_GLSL}
out vec4 outColor;
void main() {
  vec3 c = airDecode(texture(uFrame, vUV).rgb);
  vec2 wuv = (vUV * uCanvas - uRect.xy) / uRect.zw;
  if (wuv.x >= 0.0 && wuv.x <= 1.0 && wuv.y >= 0.0 && wuv.y <= 1.0) {
    c *= mix(1.0, texture(uAO, wuv).r, uAOMix);   // EL6: the crevice loses its light here, once, whole
    c += texture(uBloom, wuv).rgb * uGrade.x${shafts ? ' + texture(uShaft, wuv).rgb * uGrade.y' : ''};
${glow ? '    c += airDecode(texture(uVol, wuv).rgb);   // VOL1: what elFinish added per fragment, once per pixel and shadowed\n' : ''}    float r = length((wuv - 0.5) * 2.0);
    c *= 1.0 - uGrade.z * smoothstep(0.55, 1.35, r);
  }
  // EL5: THE CONTRAST IS IN DISPLAY SPACE. Around 0.18 in linear light it sent
  // everything under 0.007 linear (byte 18) to black - most of a dungeon, all
  // of a night street: the frame came back with six pixels in ten pure black.
  // Around mid-grey of the encoded value the same 1.04 is a grade, not a gate.
  vec3 e = airEncode(max(c, vec3(0.0)));
  e = (e - 0.5) * uGrade.w + 0.5;
  e += (bayer4(gl_FragCoord.xy) - ${BAYER_MEAN}) / 255.0;   // EL6: the dither, at the byte, zero-mean
  outColor = vec4(clamp(e, 0.0, 1.0), 1.0);
}`;

const AO_FS = `#version 300 es
precision highp float;
in vec2 vUV;
${DEPTH_GLSL}
${BAYER_GLSL}
uniform vec4 uAOParams;     // radius, strength, bias, unused
out vec4 outColor;
// AUDIT HQ1: THE POINT IS THE TEXEL'S. A depth read lands on a whole texel of the frame's depth image, but the
// position was reconstructed at the SAMPLE's own screen coordinate - a texel's depth paired with a point up to
// half a texel away from it - so a flat floor came back a hair above and below its own plane, texel by texel,
// and more so with distance (the depth slope per texel grows): the far floor of the probe read 0.73 with nothing
// near it. The uv is snapped to the texel's centre first, in the canvas's own pixels (the depth image is the
// canvas's; the world rect maps into it), so a surface point IS a point of the surface.
vec2 texelUV(vec2 wuv) {
  vec2 px = floor(uRect.xy + wuv * uRect.zw) + 0.5;
  return (px - uRect.xy) / uRect.zw;
}
vec3 posAt(vec2 uvIn) {
  vec2 uv = texelUV(uvIn);
  float z = depthAt(uv) * 2.0 - 1.0;
  float vz = -uProjInfo.w / (z + uProjInfo.z);
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * (-vz) / uProjInfo.x, ndc.y * (-vz) / uProjInfo.y, vz);
}
// HQ1: the horizon along one side of a slice - the highest angle (as a cosine against the view vector) any step
// reaches, each step's claim weighted down by its distance so the radius is a soft edge and not a cliff
float horizonAt(vec3 p, vec3 n, vec3 v, vec2 uv, vec2 dir, float radiusPx, float bias) {
  float h = -1.0;
  for (int i = 1; i <= ${AIR_AO_SAMPLES}; i++) {
    float t = (float(i) - 0.5) / ${AIR_AO_SAMPLES}.0;
    vec2 suv = uv + dir * t * radiusPx;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
    vec3 s = posAt(suv) - p;
    float d = length(s);
    float c = dot(s, v) / max(d, 1e-5);
    float w = clamp((uAOParams.x - d) / (uAOParams.x * ${AIR_AO_FALLOFF}), 0.0, 1.0);   // a step's claim is whole to 1 - AIR_AO_FALLOFF of the radius, then eases to nothing at it (the reference's own shape)
    c = mix(-1.0, c, w);
    // AUDIT HQ1: a step must RISE above the surface's own plane by the bias to be a horizon - a flat floor read off
    // a half-size depth image lands a hair above and below its own plane texel by texel, and without this every
    // flat surface shaded itself a fifth (the crate top read 0.81 on the probe)
    if (dot(s, n) > bias) h = max(h, c);
  }
  return h;
}
void main() {
  float d0 = depthAt(vUV);
  vec3 p = posAt(vUV);
  // AUDIT FLICKER F3: THE DERIVATIVES BEFORE ANY RETURN. A quad on the skyline mixes sky and geometry, and a derivative
  // taken after the sky's pixels returned is undefined (GLSL ES 3.00 8.9) - the GPU decides what the partner holds: 9
  // of 120 rim pixels differed between three legal behaviours, NaN among them. Taken here, every quad computes them
  // whole; a degenerate cross faces the eye.
  vec3 pdx = dFdx(p), pdy = dFdy(p);
  if (d0 >= 0.99999) { outColor = vec4(1.0); return; }
  // AUDIT HQ1: the quad's derivative stands. A normal from the nearer neighbour each way (the silhouette-edge
  // mitigation) was tried and read WORSE on SwiftShader (the crate's two flanks 0.71 / 0.95 against 0.95 / 0.96
  // here); the depth-aware blur keeps an edge quad's normal from smearing past its edge.
  vec3 cr = cross(pdx, pdy);
  vec3 n = dot(cr, cr) > 1e-30 ? normalize(cr) : -normalize(p);
  if (dot(n, -p) < 0.0) n = -n;   // a normal faces the eye whatever the projection's handedness did to the derivatives
  vec3 v = normalize(-p);
  // the radius on screen, in the AO image's uv: the world radius over the view distance, through the focal term
  // (AUDIT HQ1: its magnitude - the hosts' projection is x-mirrored, so proj[0] is negative)
  float radiusPx = uAOParams.x * abs(uProjInfo.x) / max(-p.z, 1e-3) * 0.5;
  // EL6: the slices' rotation is a 4x4 ORDERED pattern, not a hash - the 4x4
  // box blur after it averages exactly one tile, so the pattern cancels; a
  // hash was grain that never cancelled, and in the dark the grain was all
  // a texture had ("textures in the dark look weird")
  // AUDIT HQ1: a quarter turn, not a whole one - a slice is a LINE through the pixel and the second slice is the
  // first's perpendicular, so orientations repeat every quarter turn; sixteen levels over a whole turn were four
  // orientations said four times, which the 4x4 blur tile could not tell apart (rows paired up on the probe)
  float ang = bayer4(gl_FragCoord.xy) * 1.5707963;
  float vis = 0.0;
  for (int k = 0; k < ${AIR_AO_DIRECTIONS}; k++) {
    float a = ang + float(k) * ${(Math.PI / 2).toFixed(7)};   // HQ1: the slices a quarter turn apart
    // AUDIT HQ1: the march is a CIRCLE IN VIEW SPACE. A uv step (du, dv) is a view step (du / proj[0], dv / proj[5])
    // times the depth, so a view-space circle of radius r is the uv ellipse (cos a, sin a * |proj[5] / proj[0]|) *
    // r * |proj[0]| / (2 depth) - the y term carries the ASPECT, |proj[5] / proj[0]| (1.6 at 16:9). The first cut
    // had the ratio upside down, so the vertical marches reached a third of the radius and a floor's own plane read
    // as a horizon where the too-short slice met its neighbour's.
    vec2 dir = vec2(cos(a), sin(a) * abs(uProjInfo.y / uProjInfo.x));
    // the slice's plane: the view vector and the marched direction IN VIEW SPACE - the unscaled circle, with screen
    // +x being view -x under the hosts' mirrored projection (proj[0] < 0) - so the marched side and the projected
    // normal's side agree, or the horizons' clamps land on the wrong sides
    vec3 sliceDir = normalize(vec3(dir.x / uProjInfo.x, dir.y / uProjInfo.y, 0.0));   // AUDIT HQ1: exactly the view step a uv step of dir is (posAt divides by the same terms) - the sign and the aspect fall out of it
    vec3 axis = normalize(cross(sliceDir, v));
    vec3 np = n - axis * dot(n, axis);
    float npl = length(np);
    if (npl < 1e-4) continue;   // AUDIT HQ1: a slice the normal has no part in weighs nothing (the sum is weighted by the projected normal's length, and averages to one over the slices)
    np /= npl;
    float gamma = sign(dot(np, sliceDir)) * acos(clamp(dot(np, v), -1.0, 1.0));   // the projected normal's angle off the view vector, signed toward the slice
    float h1 = acos(clamp(horizonAt(p, n, v, vUV, -dir, radiusPx, uAOParams.z), -1.0, 1.0));   // the horizon angles either side, from the view vector: h1 the -dir side
    float h2 = acos(clamp(horizonAt(p, n, v, vUV, dir, radiusPx, uAOParams.z), -1.0, 1.0));    // h2 the +dir side (gamma is signed toward +dir)
    // the arc the projected normal lets in: clamp each horizon to the hemisphere about it
    h1 = gamma + max(-h1 - gamma, -1.5707963);
    h2 = gamma + min(h2 - gamma, 1.5707963);
    // the cosine-weighted visibility of the arc [h1, h2] about gamma (GTAO's inner integral, closed form)
    float a1 = 0.25 * (-cos(2.0 * h1 - gamma) + cos(gamma) + 2.0 * h1 * sin(gamma));
    float a2 = 0.25 * (-cos(2.0 * h2 - gamma) + cos(gamma) + 2.0 * h2 * sin(gamma));
    vis += npl * (a1 + a2);
  }
  // AUDIT HQ1: NOT CLAMPED HERE. A slice's unoccluded visibility is |np| (cos gamma + gamma sin gamma), which is
  // one only AVERAGED over every slice direction (0.2 to 1.55 for one slice of a floor seen at a grazing angle) -
  // so two slices of one pixel read 0.87 to 1.09 by the pixel's rotation, and clamping each pixel to one before
  // the blur averaged the losses and kept none of the gains: a flat floor read 0.85 at some rotations and 0.97 blurred.
  // The pixel stores its share at half scale (the byte holds to 2.0) and the blur, which averages exactly one tile
  // of rotations, is where one is one again - and where the strength and the clamp are applied.
  outColor = vec4(vec3(vis / ${AIR_AO_DIRECTIONS}.0 * ${AIR_AO_STORE}), 1.0);
}`;

// With a float target the march stores linear light, and the tone pass curves the blurred average once.
const volFs = ({ shadow, tonemap, scatter }, maxLights, linear) => `#version 300 es
precision highp float;
in vec2 vUV;
${DEPTH_GLSL}
${BAYER_GLSL}
${CODEC_GLSL}
${AIR_ADAPT_GLSL}
uniform vec3 uCamPos;
uniform mat3 uViewRot;              // world from view: the view's rotation, transposed
uniform vec4 uPointLights[${maxLights}];
uniform vec3 uPointColors[${maxLights}];
uniform int uPointCount;
uniform float uScatter;             // the lane's gain x the fog's density (uELScatter's own value)
uniform float uExposure;
${shadow}
${tonemap}
${scatter}
out vec4 outColor;
void main() {
  vec2 ndc = vUV * 2.0 - 1.0;
  vec3 vd = vec3(ndc.x / uProjInfo.x, ndc.y / uProjInfo.y, -1.0);   // the view ray through this pixel (posAt's own terms)
  float vlen = length(vd);
  vec3 dir = uViewRot * (vd / vlen);
  float dist = viewDist(depthAt(vUV)) * vlen;   // the surface's distance along the ray; the sky's is the far plane's
  float jitter = bayer4(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${maxLights}; i++) {
    if (i >= uPointCount) break;
    vec4 Lr = uPointLights[i];
    vec3 rel = Lr.xyz - uCamPos;
    float range = Lr.w;
    if (length(rel) > dist + range) continue;   // EL6: a lantern farther than the ray reaches plus its range glows on no part of it
    int k = uCasterOf[i];
    if (k < 0) { acc += elScatter(rel, range, dir, dist) * uPointColors[i]; continue; }   // no map (the hand's light, a far lantern): the closed form, as before
    // the march: the same integrand as elScatter's, at AIR_VOL_STEPS points across the ray's CHORD through the
    // sphere (AUDIT VOL1: a ray that misses the sphere walks nothing), each let through by the caster's cube - the
    // jitter spreads the steps over the 4x4 tile the blur averages
    float t0 = dot(rel, dir);
    vec3 hv = rel - dir * t0;
    float hraw = dot(hv, hv);
    float chord = range * range - hraw;
    if (chord <= 0.0) continue;
    chord = sqrt(chord);
    float h2 = max(hraw, 0.0625);
    float ta = max(0.0, t0 - chord), tb = min(dist, t0 + chord);
    if (tb <= ta) continue;
    float dt = (tb - ta) / ${AIR_VOL_STEPS}.0;
    float sum = 0.0;
    for (int s = 0; s < ${AIR_VOL_STEPS}; s++) {
      float t = ta + (float(s) + jitter) * dt;
      float ds = t - t0;
      sum += casterShadowOne(k, Lr, uCamPos + dir * t) / (h2 + ds * ds);   // DISC15: a 512 slot or a lo one
    }
    acc += sum * dt * uPointColors[i];
  }
  ${linear
    ? 'outColor = vec4(acc, 1.0);   // linear light, unclamped: the blur averages it and the tone pass curves the average'
    : 'outColor = vec4(airEncode(elTonemapRGB(acc * uScatter * uExposure * elAdapt())), 1.0);   // no float target: tonemapped here, as elFinish tonemaps the glow it adds'}
}`;

const volToneFs = ({ tonemap }) => `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSrc;
uniform float uScatter;
uniform float uExposure;
${CODEC_GLSL}
${AIR_ADAPT_GLSL}
${tonemap}
out vec4 outColor;
void main() {
  outColor = vec4(airEncode(elTonemapRGB(texture(uSrc, vUV).rgb * uScatter * uExposure * elAdapt())), 1.0);
}`;

const VOLBLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
${DEPTH_GLSL}
out vec4 outColor;
void main() {
  float here = viewDist(depthAt(vUV));
  vec3 acc = vec3(0.0); float wsum = 0.0;
  for (int y = -2; y < 2; y++) {
    for (int x = -2; x < 2; x++) {
      vec2 uv = vUV + (vec2(float(x), float(y)) + 0.5) * uTexel;
      float w = abs(viewDist(depthAt(uv)) - here) <= here * ${AIR_VOL_BLUR_SHARE} ? 1.0 : 0.0;
      acc += texture(uSrc, uv).rgb * w;
      wsum += w;
    }
  }
  outColor = vec4(wsum > 0.0 ? acc / wsum : texture(uSrc, vUV).rgb, 1.0);
}`;

const AO_AXIS_GLSL = `
vec2 aoAxis(float m, float c, float p) {   // the run through c along one axis: (slope, curvature) a texel
  float a = c - m, b = p - c;
  if (a * b >= 0.0 && abs(a - b) <= max(abs(a), abs(b)) * 0.5 + uBlurRange * 0.25) return vec2((a + b) * 0.5, (b - a) * 0.5);
  if (abs(a) <= 0.5 * abs(b)) return vec2(a, 0.0);
  if (abs(b) <= 0.5 * abs(a)) return vec2(b, 0.0);
  return vec2(0.0);
}
`;
const BOX_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uBlurRange;
uniform float uStrength;   // AUDIT HQ1: the strength on the occlusion, after the tile's average
${DEPTH_GLSL}
${AO_AXIS_GLSL}
out vec4 outColor;
void main() {
  float here = viewDist(depthAt(vUV));
  vec2 tx = vec2(uTexel.x, 0.0), ty = vec2(0.0, uTexel.y);
  vec2 ax = aoAxis(viewDist(depthAt(vUV - tx)), here, viewDist(depthAt(vUV + tx)));   // LA-AUDIT B6: the surface's run
  vec2 ay = aoAxis(viewDist(depthAt(vUV - ty)), here, viewDist(depthAt(vUV + ty)));
  float acc = 0.0, wsum = 0.0;
  for (int y = -2; y < 2; y++) {
    for (int x = -2; x < 2; x++) {
      vec2 o = vec2(float(x), float(y)) + 0.5;
      vec2 uv = vUV + o * uTexel;
      float rise = ax.x * o.x + ax.y * o.x * o.x + ay.x * o.y + ay.y * o.y * o.y;   // AUDIT-EL F17: no variable named for a built-in
      float win = max(uBlurRange, abs(rise) * ${glslFloat(AIR_AO_BLUR_SHARE)});   // LA-POST5's share, on the surface's own rise
      float w = abs(viewDist(depthAt(uv)) - (here + rise)) <= win ? 1.0 : 0.0;
      acc += texture(uSrc, uv).r * w;
      wsum += w;
    }
  }
  float ao = clamp(wsum > 0.0 ? acc / wsum / ${AIR_AO_STORE} : 1.0, 0.0, 1.0);   // AUDIT HQ1: the tile's average, unscaled, is where the clamp belongs
  ao = 1.0 - (1.0 - ao) * uStrength;
  outColor = vec4(vec3(ao), 1.0);
}`;

// The reads are held at 1 a channel, so a float bloom source blooms exactly as the byte image did.
const GAUSS_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSrc;
uniform vec2 uDir;   // the texel step along the axis blurred
out vec4 outColor;
const float W[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
vec3 src(vec2 uv) { return min(texture(uSrc, uv).rgb, vec3(1.0)); }
void main() {
  vec3 acc = src(vUV) * W[0];
  for (int i = 1; i < 5; i++) {
    acc += src(vUV + uDir * float(i)) * W[i];
    acc += src(vUV - uDir * float(i)) * W[i];
  }
  outColor = vec4(acc, 1.0);
}`;

// The shafts follow the cloud shadow at the player's feet, squared, so a covered sun throws none.
export const SHAFT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
${DEPTH_GLSL}
${BAYER_GLSL}
${CLOUD_SHADOW_GLSL}
uniform vec2 uSun;          // the sun's screen position, uv
uniform vec4 uShaftParams;  // decay, strength, reach, aspect
uniform vec3 uSunColor;
uniform vec3 uEye;          // VC6c: the camera's world position - where the cloud shadow is read
uniform float uSunOn;       // VC7b: 1 when the sun is up and in front of the camera - the screen-space beams
uniform mat3 uViewRot;      // VC7b: world from view - a pixel's direction, for the sky map and the haze
uniform sampler2D uCloudSky;   // VC7b: the sky map - alpha the transmittance of the slab, the curtains and the ice (VC7c, VC7d) along each world direction
uniform float uCloudSkyOn;     // VC7b: 0 with no deck - the mask is sky or not sky, as before
uniform vec3 uLightDir;     // VC7b: toward the sun, world
uniform vec4 uHaze;         // VC7b: the fog's extinction per metre, the gain, the reach, AUDIT-VC7 (B6) the key light's scale
out vec4 outColor;
const float PI = 3.14159265;
vec3 worldDir(vec2 uv) {   // the view ray through this uv, in world space (VOL1's terms)
  vec2 ndc = uv * 2.0 - 1.0;
  return normalize(uViewRot * vec3(ndc.x / uProjInfo.x, ndc.y / uProjInfo.y, -1.0));
}
// VC7b: how much of the sky behind the slab shows in this direction - the composite's own parametrisation
float skyThrough(vec2 uv) {
  if (uCloudSkyOn <= 0.0) return 1.0;
  vec3 d = worldDir(uv);
  float el = asin(clamp(d.y, -1.0, 1.0));
  return textureLod(uCloudSky, vec2(atan(d.x, d.z) / (2.0 * PI), max(el, 0.0) / (0.5 * PI)), 0.0).a;   // AUDIT-VC7 (G3): read in the mask's loop
}
float mask(vec2 uv) {
  float sky = depthAt(uv) >= 0.99999 ? 1.0 : 0.0;
  vec2 d = (uv - uSun) * vec2(uShaftParams.w, 1.0);
  float near = smoothstep(uShaftParams.z, 0.0, length(d));
  return sky * near > 0.0 ? sky * near * skyThrough(uv) : 0.0;   // VC7b: the sky map read only where the tap can count
}
vec3 beams() {
  float through = cloudShadowAt(uEye);   // VC6c: how much sun reaches the player at all
  vec2 ray = (uSun - vUV) / ${AIR_SHAFT_TAPS}.0;   // AUDIT-EL F17: not 'step' - a built-in's name
  vec2 uv = vUV;
  float acc = 0.0, w = 1.0;
  for (int i = 0; i < ${AIR_SHAFT_TAPS}; i++) {
    acc += mask(uv) * w;
    w *= uShaftParams.x;
    uv += ray;
  }
  return uSunColor * (acc / ${AIR_SHAFT_TAPS}.0 * uShaftParams.y * through * through);
}
// VC7b: the haze's phase at the cosine c between the view ray and the sun - Henyey-Greenstein, a share of it
// isotropic, over the whole sphere one
float hazePhase(float c) {
  float g2 = ${glslFloat(AIR_HAZE_G)} * ${glslFloat(AIR_HAZE_G)};
  float hg = (1.0 - g2) / pow(1.0 + g2 - 2.0 * ${glslFloat(AIR_HAZE_G)} * c, 1.5);
  return mix(hg, 1.0, ${glslFloat(AIR_HAZE_ISO)}) / (4.0 * PI);
}
// VC7b: the sun in the haze, walked through the cloud shadow
vec3 haze() {
  float sigma = uHaze.x;
  if (sigma <= 0.0 || uLightDir.y <= 0.05 || uCloudShadowRect.w <= 0.0) return vec3(0.0);
  vec2 ndc = vUV * 2.0 - 1.0;
  vec3 vd = vec3(ndc.x / uProjInfo.x, ndc.y / uProjInfo.y, -1.0);
  float vlen = length(vd);
  vec3 dir = uViewRot * (vd / vlen);
  float reach = min(viewDist(depthAt(vUV)) * vlen, uHaze.z);
  float dt = reach / ${AIR_HAZE_STEPS}.0;
  float t = dt * bayer4(gl_FragCoord.xy);
  float lit = 0.0;
  for (int i = 0; i < ${AIR_HAZE_STEPS}; i++) {
    vec3 p = uEye + dir * t;
    // where this point's sun ray meets the map's ground: the maps are drawn with the eye at their y = 0 (the sky map's
    // camera, the shadow map's ground) - AUDIT-VC7 (R2): so the height is above the eye, not the world's own y, which
    // moves the lanes with the eye's height and jumps at a vertical recenter
    float h = max(p.y - uEye.y, 0.0);
    vec2 g = p.xz - uLightDir.xz * (h / uLightDir.y);
    // AUDIT-VC7 (B7): a low sun's ray meets the ground kilometres off, past the square; there the map knows nothing,
    // and nothing is not full sun - the nearest the map does know is its edge (SKY-CAP: clamped in the map's UV)
    lit += cloudShadowNearest(g) * exp(-sigma * t);
    t += dt;
  }
  float phase = hazePhase(dot(dir, uLightDir));
  return uSunColor * (lit * sigma * dt * phase * uHaze.y * uHaze.w);   // AUDIT-VC7 (B6): the KEY light - the sun's colour at its scale, a storm's dimming in it
}
void main() {
  vec3 c = haze();
  if (uSunOn > 0.0) c += beams();
  // LA-AUDIT B2 (lens B measured it): HELD AT 1, AS THE BYTES HELD IT. LA-POST3 put the shafts in half floats and
  // said the target changes precision, not level - true of the bloom, whose gaussian holds its reads at 1, but the
  // shafts never pass through it: in dense fog the jittered march writes over 1 a pixel, a byte clamped that, and a
  // half float kept it for VOLBLUR and the resolve to add. Heavy fog's haze toward the sun came out 2.46x as bright,
  // a sandstorm's 2.80x.
  outColor = vec4(min(c, vec3(1.0)), 1.0);
}`;

// The bloom source has no depth, so each emitter fragment discards when the frame's depth holds a nearer surface.
const EMIT_OCCLUSION_GLSL = `
uniform vec2 uBloomSize;
bool occluded() {
  vec2 wuv = gl_FragCoord.xy / uBloomSize;
  return viewDist(gl_FragCoord.z) > viewDist(depthAt(wuv)) + ${glslFloat(AIR_EMIT_SLACK)};
}
`;
export const EMIT_MESH_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vNormal;
in vec3 vWorldPos;
uniform sampler2D uEmissionTex;
uniform vec3 uEmissionColor;
uniform mat4 uModel;
uniform float uRoomsLit;   // WAGONS2 (FINAL AUDIT): exterior glass with a room behind it - only a lit room's blooms
${CODEC_GLSL}
${DEPTH_GLSL}
${EMIT_OCCLUSION_GLSL}
${RW_SEED_GLSL}
out vec4 outColor;
void main() {
  if (occluded()) discard;   // EL6
  if (uRoomsLit > 0.5 && rwLitSeed(normalize(vNormal), vWorldPos, uModel[3].xyz, vUV) > RW_LIT_SHARE) discard;   // the room drawn dark (render/realWindows.js): no amber halo round it
  outColor = vec4(airDecode(texture(uEmissionTex, vUV).rgb * uEmissionColor), 1.0);   // AUDIT-EL F20: linear, like the glares and the bright pass beside it
}`;
export const EMIT_BB_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uEmissionTex;
${CODEC_GLSL}
${DEPTH_GLSL}
${EMIT_OCCLUSION_GLSL}
out vec4 outColor;
void main() {
  if (texture(uTex, vUV).a < 0.5) discard;
  if (occluded()) discard;   // EL6
  outColor = vec4(airDecode(texture(uEmissionTex, vUV).rgb), 1.0);   // AUDIT-EL F20
}`;

const GLARE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCenter;
uniform float uSize;
${DEPTH_GLSL}
out vec2 vUV;
out float vVis;
// EL5: THE OCCLUSION IS IN WORLD UNITS. The depth image is hyperbolic: a
// constant 0.002 off it hid nothing past twenty units, and a town's lanterns
// glared through its walls (the first field report).
// EL7: AND A GLARE NEEDS A FLAME UNDER IT. The test is presence, not
// "nothing nearer": the frame's depth at the tap must hold a surface within
// AIR_GLARE_SLACK of the light's own distance - the flame flat. A light in
// open air draws nothing; a light behind a wall draws nothing; taps over the
// glare's footprint (up to two half-sizes above and below it - a city light
// sits at the TOP of its flat, a dungeon light at its BASE, and a flat stands
// on its point - and one either side), so a flame half behind a post is half
// a glare.
// LA-POST2: THE TAPS STAND OFF THE EDGES, AND EACH IS SOFT AND FILTERED. Each
// of the seven was one NEAREST texel tested yes or no, three of them on the
// light's own row - the flat's top edge - so a sub-pixel step of the eye
// flipped three sevenths of a city lamp's glare at once, and its range's
// flicker slid every tap 14 times a second (glareKey holds the size still
// now). Twenty-eight taps (AIR_GLARE_TAPS) stand off the light's row, each
// on a row and a column of its own; a tap's answer is soft in depth
// (whole within half the slack, none past it) and read over the four texels
// about the point, weighted by where it sits among them (bilinear,
// percentage-closer) - a tap within a texel of an edge changes by its share
// of the four, never whole, and no two change at the same step.
const vec2 GLARE_TAP[${AIR_GLARE_TAPS.length}] = vec2[${AIR_GLARE_TAPS.length}](${AIR_GLARE_TAPS.map(([x, y]) => `vec2(${glslFloat(x)}, ${glslFloat(y)})`).join(', ')});
float distPx(vec2 px) { return viewDist(textureLod(uDepth, (px + 0.5) / uCanvas, 0.0).r); }   // the depth's texel at a canvas pixel, by index
// a flame's presence (hide false): whole within half the slack of the light's distance, none past the slack; JAN1's
// occluder (hide true): a surface nearer than the light by past the slack hides it, whole by twice the slack
float depthTest(float d, float lantern, bool hide) {
  return hide ? smoothstep(${glslFloat(AIR_GLARE_SLACK)}, ${glslFloat(2 * AIR_GLARE_SLACK)}, lantern - d)
    : 1.0 - smoothstep(${glslFloat(AIR_GLARE_SLACK / 2)}, ${glslFloat(AIR_GLARE_SLACK)}, abs(d - lantern));
}
// the test over the four texels about a world-rect uv, weighted bilinearly by the point's place among their centres
float filtered(vec2 wuv, float lantern, bool hide) {
  vec2 p = uRect.xy + wuv * uRect.zw - 0.5;
  vec2 b = floor(p), f = p - b;
  return mix(mix(depthTest(distPx(b), lantern, hide), depthTest(distPx(b + vec2(1.0, 0.0)), lantern, hide), f.x),
             mix(depthTest(distPx(b + vec2(0.0, 1.0)), lantern, hide), depthTest(distPx(b + vec2(1.0)), lantern, hide), f.x), f.y);
}
float flame(vec4 vc, float lantern) {
  vec4 clip = uProj * vc;
  if (clip.w <= 0.0) return 0.0;
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return filtered(uv, lantern, false);
}
void main() {
  vec4 vc = uView * vec4(uCenter, 1.0);
  vec4 clip = uProj * vc;
  float vis = 0.0;
  if (clip.w > 0.0) {
    vec3 ndc = clip.xyz / clip.w;
    if (abs(ndc.x) < 1.2 && abs(ndc.y) < 1.2) {
      float lantern = -vc.z;
      float s = uSize * 0.5;
      float sum = 0.0;
      for (int k = 0; k < ${AIR_GLARE_TAPS.length}; k++) sum += flame(vc + vec4(GLARE_TAP[k] * s, 0.0, 0.0), lantern);
      vis = sum / ${glslFloat(AIR_GLARE_TAPS.length)};
      // JAN1 (2026-09-18, Janome: "lights still shining thru attics at certain angles" - BUGS-5 F4's remainder).
      // Presence alone takes a FLOOR for the flame: an oblique surface sweeps a wide range of depths across the
      // footprint's taps, and at some pitches one tap lands within the slack of the light's own depth - a halo painted
      // on the floor above a lamp in the room below. The other half of the law: a surface NEARER than the light at
      // the light's OWN pixel is an occluder, whatever the footprint found. A flame flat is a camera-facing quad
      // through the light and sits at its exact depth, so it never trips this; a city light at the top of its flat
      // shows the flat or the wall behind, both at or past the depth; an open-air light's centre is sky.
      // LA-POST2: soft and filtered as the taps are - one NEAREST texel zeroed the glare whole, so a lamp at a beam's
      // edge blinked as the texel under its centre changed hands
      vec2 cuv = ndc.xy * 0.5 + 0.5;
      if (cuv == clamp(cuv, vec2(0.0), vec2(1.0))) vis *= 1.0 - filtered(cuv, lantern, true);
    }
  }
  vVis = vis;
  vUV = aCorner;
  // LA-POST2: a glare with nothing to show leaves the clip volume whole - no fragment of it is shaded
  gl_Position = vis > 0.0 ? uProj * (vc + vec4(aCorner * uSize, 0.0, 0.0)) : vec4(2.0, 2.0, 2.0, 1.0);
}`;
const GLARE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vVis;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  float r = length(vUV) * 2.0;
  float a = max(0.0, 1.0 - r * r);
  outColor = vec4(uColor * a * a * vVis, 1.0);
}`;

export class AirPass {
  /** @param {any} gl @param {any} opts @returns {[string, string][]} */
  static bootPrograms(gl, opts) {
    /** @type {[string, string][]} */
    const pairs = [AO_FS, BOX_FS, GAUSS_FS, SHAFT_FS, LUM_FS, ADAPT_FS, brightFs(0), brightFs(1), VOLBLUR_FS,
      resolveFs(0, 0), resolveFs(0, 1), resolveFs(1, 0), resolveFs(1, 1)].map((fs) => [QUAD_VS, fs]);
    pairs.push([opts.vs.mesh, EMIT_MESH_FS], [opts.vs.bb, EMIT_BB_FS], [GLARE_VS, GLARE_FS]);
    if (opts.glsl) {
      const volLinear = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
      pairs.push([QUAD_VS, volFs(opts.glsl, opts.maxLights ?? 48, volLinear)]);
      if (volLinear) pairs.push([QUAD_VS, volToneFs(opts.glsl)]);
    }
    return pairs;
  }

  constructor(gl, opts) {
    this.gl = gl;
    this.meter = null;
    this._glowPlanes = new Float32Array(24);
    const u = (p, n) => gl.getUniformLocation(p, n);
    const P = (vs, fs, names) => { const p = opts.build(vs, fs); const o = { p }; for (const n of names) o[n] = u(p, n); return o; };
    this.programs = {
      ao: P(QUAD_VS, AO_FS, ['uDepth', 'uProjInfo', 'uAOParams', 'uRect', 'uCanvas']),
      box: P(QUAD_VS, BOX_FS, ['uSrc', 'uTexel', 'uBlurRange', 'uStrength', 'uDepth', 'uProjInfo', 'uRect', 'uCanvas']),
      gauss: P(QUAD_VS, GAUSS_FS, ['uSrc', 'uDir']),
      shaft: P(QUAD_VS, SHAFT_FS, ['uDepth', 'uSun', 'uShaftParams', 'uSunColor', 'uProjInfo', 'uRect', 'uCanvas', 'uEye', 'uCloudShadowMap', 'uCloudShadowRect', 'uSunOn', 'uViewRot', 'uCloudSky', 'uCloudSkyOn', 'uLightDir', 'uHaze']),
      emitMesh: P(opts.vs.mesh, EMIT_MESH_FS, ['uProj', 'uView', 'uModel', 'uEmissionTex', 'uEmissionColor', 'uDepth', 'uProjInfo', 'uRect', 'uCanvas', 'uBloomSize', 'uRoomsLit']),
      emitBb: P(opts.vs.bb, EMIT_BB_FS, ['uProj', 'uView', 'uRight', 'uUp', 'uOrigin', 'uSize', 'uTex', 'uEmissionTex', 'uFlatWind', 'uSway', 'uWindfallSway', 'uWindfallAxis', 'uDepth', 'uProjInfo', 'uRect', 'uCanvas', 'uBloomSize']),
      glare: P(GLARE_VS, GLARE_FS, ['uProj', 'uView', 'uCenter', 'uSize', 'uDepth', 'uColor', 'uProjInfo', 'uRect', 'uCanvas']),
      lum: P(QUAD_VS, LUM_FS, ['uFrame', 'uPrev', 'uRect', 'uCanvas', 'uVol']),
      adapt: P(QUAD_VS, ADAPT_FS, ['uPrev', 'uLum', 'uAdaptParams', 'uAdaptRates']),
      bright: [0, 1].map((glow) => P(QUAD_VS, brightFs(glow), ['uFrame', 'uRect', 'uCanvas', 'uThreshold', 'uBloomSize', 'uVol'])),
      resolve: [0, 1].map((glow) => [0, 1].map((shafts) => P(QUAD_VS, resolveFs(glow, shafts), ['uFrame', 'uBloom', 'uShaft', 'uRect', 'uCanvas', 'uGrade', 'uAO', 'uAOMix', 'uVol']))),
      volBlur: P(QUAD_VS, VOLBLUR_FS, ['uSrc', 'uTexel', 'uDepth', 'uProjInfo', 'uRect', 'uCanvas']),
      vol: null, volTone: null,
    };
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.glareVao = gl.createVertexArray();
    gl.bindVertexArray(this.glareVao);
    const gb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.projInfo = new Float32Array(4);
    this.aoParams = new Float32Array([AIR_AO_RADIUS, AIR_AO_STRENGTH, AIR_AO_BIAS, 0]);
    // A shader the GL refuses costs the glow alone, not the whole air pass.
    this.volLinear = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    if (opts.glsl) {
      try {
        const vol = P(QUAD_VS, volFs(opts.glsl, opts.maxLights ?? 48, this.volLinear), ['uDepth', 'uProjInfo', 'uRect', 'uCanvas', 'uCamPos', 'uViewRot', 'uPointLights', 'uPointColors', 'uPointCount', 'uScatter', 'uExposure', 'uAdapt']);
        if (this.volLinear) this.programs.volTone = P(QUAD_VS, volToneFs(opts.glsl), ['uSrc', 'uScatter', 'uExposure', 'uAdapt']);
        const p = vol.p;
        // These uniform names must match the ones ShadowPass.upload binds by.
        this.programs.vol = vol;
        vol.shadow = {
          sunShadow: u(p, 'uSunShadow'), sunVP: u(p, 'uSunVP'), sunParams: u(p, 'uSunShadowParams'), sunTexel: u(p, 'uSunTexel'), sunOrigin: u(p, 'uSunOrigin'),
          pointShadow: u(p, 'uPointShadow'), pointParams: u(p, 'uPointShadowParams'), shadowIndex: u(p, 'uShadowIndex'), casterOf: u(p, 'uCasterOf'), pointShadowLo: u(p, 'uPointShadowLo'),
        };
      } catch (e) {
        this.programs.vol = null; this.programs.volTone = null;
        console.warn('VOL1: the glow\'s shader did not build - the lane glows for itself', e);
      }
    }
    this.fresh = false;
    this.volOn = true;
    this.hazeOn = true;
    this._viewRot = new Float32Array(9);
    this._ones = new Float32Array(3 * (opts.maxLights ?? 48)).fill(1);
    this.shaftParams = new Float32Array([AIR_SHAFT_DECAY, AIR_SHAFT_STRENGTH, AIR_SHAFT_REACH, 1]);
    this._noDeck = new Float32Array([0, 0, 0, 0]);
    this._haze = new Float32Array([0, AIR_HAZE_GAIN, AIR_HAZE_REACH, 0]);
    this.cloudShadow = null;
    this.f = null;
    this.prevVP = new Float32Array(16); this.prevProjInfo = new Float32Array(4); this.prevValid = false;
    this.prevRect = new Float32Array([0, 0, 1, 1]);
    this._cut = false;
    this._prevEye = new Float32Array(3); this._prevEyeSet = false;
    this._glareHold = new Map(); this._glareFrame = 0;
    this.contactParams = new Float32Array([AIR_CONTACT_LENGTH, AIR_CONTACT_THICKNESS, AIR_CONTACT_FLOOR, 0]);
    this.pending = false;
    this.width = 0; this.height = 0;
    this.targets = null;
    this.frame = null;
    // Retro and full-size world frames can alternate within one presented frame, so each slot keeps its own image.
    this._frames = { canvas: null, retro: null };
    this.resolveTo = null;
    this.lum = null;
    this.adapt = null;
    this.adaptIndex = 0;
    this.grade = new Float32Array([AIR_BLOOM_STRENGTH, 1, AIR_VIGNETTE, AIR_CONTRAST]);
    this.adaptParams = new Float32Array([0, AIR_ADAPT_KEY, AIR_ADAPT_MIN, AIR_ADAPT_MAX]);
    this.adaptRates = new Float32Array([AIR_ADAPT_OPEN, AIR_ADAPT_CLOSE]); /** @type {Float32Array|null} */ this._calmRates = null;
    this.canvas = new Float32Array(2);
    this.rect = new Float32Array(4);
    this._fullRect = new Float32Array(4);
    this._lastResolve = 0;
    this.measured = false;
    this._now = opts.now ?? (() => (globalThis.performance?.now?.() ?? Date.now()));
    this.stats = { emitDraws: 0, glares: 0, shafts: false, haze: false, vol: false };
    this._identityView = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    this._planes = new Float32Array(24);
    this._white = new Float32Array([1, 1, 1]);
    this._vp = new Float32Array(16);
  }

  resize(w, h) {
    if (this.targets && this.width === w && this.height === h) return;
    const gl = this.gl;
    if (this.targets) this._free();
    this.width = w; this.height = h;
    const color = (cw, ch, linear = false) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (linear) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, cw, ch, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo, w: cw, h: ch, float: !!linear };
    };
    const aw = Math.max(1, Math.round(w * AIR_AO_SCALE)), ah = Math.max(1, Math.round(h * AIR_AO_SCALE));
    const bw = Math.max(1, Math.round(w * AIR_BLOOM_SCALE)), bh = Math.max(1, Math.round(h * AIR_BLOOM_SCALE));
    // The bloom and shaft images hold linear light, in half floats where the GL renders them.
    const f16 = this.volLinear;
    this.targets = {
      ao: color(aw, ah), aoBlur: color(aw, ah),
      bloom: color(bw, bh, f16), bloomB: color(bw, bh, f16),
      shaft: color(bw, bh, f16), shaftRaw: color(bw, bh, f16),
      vol: color(bw, bh, this.volLinear), volB: color(bw, bh, this.volLinear),
    };
    this.targets.volOut = this.volLinear ? color(bw, bh) : this.targets.volB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  _free() {
    const gl = this.gl, t = this.targets;
    for (const x of new Set(Object.values(t))) { gl.deleteTexture(x.tex); gl.deleteFramebuffer(x.fbo); }
    this.targets = null;
  }

  _ensureFrame(W, H, slot = 'canvas') {
    const gl = this.gl;
    const kept = this._frames[slot];
    if (kept && kept.w === W && kept.h === H) {
      if (this.frame !== kept) { this.frame = kept; this.prevValid = false; }
      return kept;
    }
    if (kept) this._deleteFrame(kept);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Two depth textures ping-pong (this frame's, and the previous one for the contact march), each with its own
    // framebuffer, so a frame binds a framebuffer instead of re-attaching a depth.
    const depths = [], fbos = [];
    for (let k = 0; k < 2; k++) {
      const depth = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, depth);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, W, H);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
      gl.clearDepth(1);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      depths.push(depth); fbos.push(fb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.frame = this._frames[slot] = { tex, depths, fbos, depthIndex: 0, depth: depths[0], prevDepth: depths[1], fbo: fbos[0], w: W, h: H, worldDepth: false };
    this.prevValid = false;
    if (!this.lum) this._ensureAdapt();
    return this.frame;
  }
  _deleteFrame(k) {
    const gl = this.gl;
    gl.deleteTexture(k.tex); for (const d of k.depths) gl.deleteTexture(d); for (const f of k.fbos) gl.deleteFramebuffer(f);
    if (k.aoDepth) { gl.deleteTexture(k.aoDepth); gl.deleteFramebuffer(k.aoFbo); }
    if (k.uwFbo) { gl.deleteTexture(k.uwColor); gl.deleteTexture(k.uwDepth); gl.deleteFramebuffer(k.uwFbo); }
  }
  // The host takes this depth just before the grass draws, so the AO ignores the grass and the grass casts none.
  snapshotAoDepth() {
    const F = this.frame;
    if (!F || !this.f || !this.fresh) return false;
    const gl = this.gl;
    if (!F.aoDepth) {
      F.aoDepth = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, F.aoDepth);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, F.w, F.h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      F.aoFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.aoFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, F.aoDepth, 0);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, F.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, F.aoFbo);
    gl.blitFramebuffer(0, 0, F.w, F.h, 0, 0, F.w, F.h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.fbo);
    F.aoTaken = true;
    return true;
  }
  // The frame's color and depth cannot be sampled while bound, so they are copied once before the first water draw;
  // a depth blit must use NEAREST.
  /** @returns {{color: WebGLTexture, depth: WebGLTexture, w: number, h: number}|null} */
  snapshotUnderWater() {
    const F = this.frame;
    if (!F || !this.f || !this.fresh) return null;
    const gl = this.gl;
    if (!F.uwFbo) {
      const tex = (fmt, filter) => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, F.w, F.h);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      F.uwColor = tex(gl.RGBA8, gl.LINEAR);
      F.uwDepth = tex(gl.DEPTH_COMPONENT24, gl.NEAREST);
      gl.bindTexture(gl.TEXTURE_2D, null);
      F.uwFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, F.uwFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, F.uwColor, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, F.uwDepth, 0);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, F.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, F.uwFbo);
    gl.blitFramebuffer(0, 0, F.w, F.h, 0, 0, F.w, F.h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, F.fbo);
    return { color: F.uwColor, depth: F.uwDepth, w: F.w, h: F.h };
  }
  dropFrame(slot) {
    const kept = this._frames[slot];
    if (!kept) return;
    this._deleteFrame(kept);
    this._frames[slot] = null;
    if (this.frame === kept) { this.frame = null; this.prevValid = false; }
  }
  _ensureAdapt() {
    const gl = this.gl;
    const lumTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, lumTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, AIR_LUM_SIZE, AIR_LUM_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const lumFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, lumFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lumTex, 0);
    this.lum = { tex: lumTex, fbo: lumFbo, w: AIR_LUM_SIZE, h: AIR_LUM_SIZE };
    const [hi, lo] = packAdapt(1);
    this.adapt = [0, 1].map(() => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([hi, lo, 0, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo, w: 1, h: 1 };
    });
    this.adaptIndex = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  get adaptTexture() { return this.adapt ? this.adapt[this.adaptIndex].tex : null; }

  beginFrameTarget(W, H, slot = 'canvas') {
    if (!(W > 0 && H > 0)) return null;
    const f = this._ensureFrame(W, H, slot);
    const gl = this.gl;
    f.depthIndex ^= 1;
    f.depth = f.depths[f.depthIndex]; f.prevDepth = f.depths[f.depthIndex ^ 1];
    // The previous depth must be a world frame's: a menu or video frame also binds this image.
    if (!f.worldDepth) this.prevValid = false;
    f.worldDepth = this.fresh;
    f.fbo = f.fbos[f.depthIndex];
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
    setFrameTarget(f.fbo);
    this.canvas[0] = W; this.canvas[1] = H;
    this.pending = true;
    return f.fbo;
  }

  prepare(f) {
    const [, , w, h] = f.viewport;
    if (!(w > 0 && h > 0)) { this.f = null; this.prevValid = false; return; }
    this.resize(w, h);
    // A cut the host named (invalidatePrev) or an eye jump past AIR_CONTACT_CUT leaves no previous depth.
    const e = f.eye, pe = this._prevEye;
    const jumped = !!e && this._prevEyeSet && Math.hypot(e[0] - pe[0], e[1] - pe[1], e[2] - pe[2]) > AIR_CONTACT_CUT;
    if (this.f) { this.prevVP.set(this._vp); this.prevProjInfo.set(this.projInfo); this.prevValid = !!this.frame && !this._cut && !jumped; holdPrevRect(this.prevRect, this.rect, this.canvas); }
    this._cut = false;
    this._prevEyeSet = !!e;
    if (e) { pe[0] = e[0]; pe[1] = e[1]; pe[2] = e[2]; }
    this.f = f;
    this.fresh = true;
    this.rect.set(f.viewport);
    projInfo(f.proj, this.projInfo);
    multiply(f.proj, f.view, this._vp);
    this.measured = false;
    this.stats.emitDraws = 0; this.stats.glares = 0; this.stats.shafts = false; this.stats.haze = false; this.stats.vol = false;
  }

  // The host sets the frame's cloud deck after beginFrame, which clears it, so the shafts read it at the resolve.
  setCloudShadow(deck) { this.cloudShadow = deck ?? null; }
  setGrade(g) {
    this.grade[0] = g?.bloom ?? AIR_BLOOM_STRENGTH; this.grade[2] = g?.vignette ?? AIR_VIGNETTE; this.grade[3] = g?.contrast ?? AIR_CONTRAST;
    this.adaptParams[1] = g?.adaptKey ?? AIR_ADAPT_KEY; this.adaptParams[3] = g?.adaptMax ?? AIR_ADAPT_MAX;
  }

  // Held view-projections are rebased by VP * translate(-offset) and the held eye moves, so a recenter is no cut.
  shiftOrigin(offset) {
    const [ox, oy, oz] = offset;
    for (const m of [this.prevVP, this._vp]) {
      for (let r = 0; r < 4; r++) m[12 + r] -= ox * m[r] + oy * m[4 + r] + oz * m[8 + r];
    }
    this._prevEye[0] += ox; this._prevEye[1] += oy; this._prevEye[2] += oz;
    if (this._glareHold.size) {
      const held = [...this._glareHold.values()];
      this._glareHold.clear();
      for (const h of held) { h.x += ox; h.y += oy; h.z += oz; this._glareHold.set(glareKey(h.x, h.y, h.z), h); }
    }
  }
  invalidatePrev() { this._cut = true; }

  _images() {
    const gl = this.gl, f = this.f, sp = f.shadows, T = this.targets, F = this.frame;
    this.stats.emitDraws = 0; this.stats.glares = 0; this.stats.shafts = false; this.stats.haze = false; this.stats.vol = false;
    this.measured = !!(sp && sp.count > 0);
    const vp = this._vp;
    const quad = (prog, target) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
      gl.useProgram(prog.p);
      gl.bindVertexArray(this.quadVao);
    };
    const depthOn = (prog, depth = F.depth) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, depth);
      gl.uniform1i(prog.uDepth, 0);
      gl.uniform4fv(prog.uProjInfo, this.projInfo);
      gl.uniform4fv(prog.uRect, this.rect);
      gl.uniform2fv(prog.uCanvas, this.canvas);
    };
    const meter = this.meter;
    meter?.mark('air.ao');
    const aoDepth = F.aoTaken && F.aoDepth ? F.aoDepth : F.depth;
    F.aoTaken = false;
    quad(this.programs.ao, T.ao);
    depthOn(this.programs.ao, aoDepth);
    gl.uniform4fv(this.programs.ao.uAOParams, this.aoParams);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    quad(this.programs.box, T.aoBlur);
    depthOn(this.programs.box, aoDepth);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.ao.tex); gl.uniform1i(this.programs.box.uSrc, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(this.programs.box.uTexel, 1 / T.ao.w, 1 / T.ao.h);
    gl.uniform1f(this.programs.box.uBlurRange, AIR_AO_RADIUS);
    gl.uniform1f(this.programs.box.uStrength, this.aoParams[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    meter?.mark('air.glow');
    this._volumetrics(f, sp, quad, depthOn);
    meter?.mark('air.emit');
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.bloom.fbo);
    gl.viewport(0, 0, T.bloom.w, T.bloom.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    if (sp && sp.count > 0) this._replayEmission(f, sp, vp, depthOn);
    this._glares(f, depthOn);
    gl.disable(gl.BLEND);
    const up = f.sunScale > 0.01 && f.lightDir && f.lightDir[1] > 0;
    const sun = up ? sunScreenUV(f.proj, f.view, f.lightDir) : null;
    const deck = this.cloudShadow;
    const haze = this.hazeOn && up && deck?.rect && deck.rect[3] > 0 && f.lightDir[1] > 0.05 && f.haze > 0;
    meter?.mark('air.shafts');
    if (sun || haze) {
      const S = this.programs.shaft;
      quad(S, haze ? T.shaftRaw : T.shaft);
      depthOn(S);
      gl.uniform1f(S.uSunOn, sun ? 1 : 0);
      if (sun) gl.uniform2f(S.uSun, sun[0], sun[1]);
      this.shaftParams[3] = T.shaft.w / T.shaft.h;
      gl.uniform4fv(S.uShaftParams, this.shaftParams);
      gl.uniform3fv(S.uSunColor, f.sunColor);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, deck?.map ?? f.blackTex ?? null);
      gl.uniform1i(S.uCloudShadowMap, 1);
      gl.uniform4fv(S.uCloudShadowRect, deck?.rect ?? this._noDeck);
      gl.uniform3fv(S.uEye, f.eye);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, deck?.sky ?? f.blackTex ?? null);
      gl.uniform1i(S.uCloudSky, 2);
      gl.uniform1f(S.uCloudSkyOn, deck?.sky ? 1 : 0);
      const v = f.view, R = this._viewRot;
      R[0] = v[0]; R[1] = v[4]; R[2] = v[8]; R[3] = v[1]; R[4] = v[5]; R[5] = v[9]; R[6] = v[2]; R[7] = v[6]; R[8] = v[10];
      gl.uniformMatrix3fv(S.uViewRot, false, R);
      gl.uniform3fv(S.uLightDir, f.lightDir ?? this._noDeck.subarray(0, 3));
      this._haze[0] = haze ? f.haze : 0;
      this._haze[3] = f.sunScale ?? 0;
      gl.uniform4fv(S.uHaze, this._haze);
      gl.activeTexture(gl.TEXTURE0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (haze) {
        const B = this.programs.volBlur;
        quad(B, T.shaft);
        depthOn(B);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.shaftRaw.tex); gl.uniform1i(B.uSrc, 1);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform2f(B.uTexel, 1 / T.shaftRaw.w, 1 / T.shaftRaw.h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      this.stats.shafts = !!sun;
      this.stats.haze = !!haze;
    }
    gl.clearColor(f.clearColor[0], f.clearColor[1], f.clearColor[2], f.clearColor[3]);
  }

  _blank(quad) {
    const gl = this.gl, T = this.targets;
    this.stats.emitDraws = 0; this.stats.glares = 0; this.stats.shafts = false; this.stats.haze = false; this.stats.vol = false;
    gl.clearColor(0, 0, 0, 1);
    for (const t of [T.bloom, T.shaft, T.volOut]) { quad(this.programs.box, t); gl.clear(gl.COLOR_BUFFER_BIT); }
    if (this.f) gl.clearColor(this.f.clearColor[0], this.f.clearColor[1], this.f.clearColor[2], this.f.clearColor[3]);
  }

  _volumetrics(f, sp, quad, depthOn) {
    const gl = this.gl, P = this.programs, T = this.targets;
    const L = f.pointLights, n = L ? L.length >> 2 : 0;
    const on = !!P.vol && this.volOn && n > 0 && f.scatter > 0 && !!sp && this._glowInView(L, n);
    this.stats.vol = on;
    if (!on) { quad(P.box, T.volOut); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.clearColor(f.clearColor[0], f.clearColor[1], f.clearColor[2], f.clearColor[3]); return; }
    quad(P.vol, T.vol);
    depthOn(P.vol);
    gl.uniform3fv(P.vol.uCamPos, f.eye);
    const v = f.view, R = this._viewRot;
    R[0] = v[0]; R[1] = v[4]; R[2] = v[8]; R[3] = v[1]; R[4] = v[5]; R[5] = v[9]; R[6] = v[2]; R[7] = v[6]; R[8] = v[10];
    gl.uniformMatrix3fv(P.vol.uViewRot, false, R);
    gl.uniform4fv(P.vol.uPointLights, L);
    gl.uniform3fv(P.vol.uPointColors, f.pointColors ?? this._ones.subarray(0, n * 3));
    gl.uniform1i(P.vol.uPointCount, n);
    gl.uniform1f(P.vol.uScatter, f.scatter);
    gl.uniform1f(P.vol.uExposure, f.exposure ?? 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.adapt[this.adaptIndex].tex); gl.uniform1i(P.vol.uAdapt, 1);
    gl.activeTexture(gl.TEXTURE0);
    sp.upload(P.vol.shadow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    quad(P.volBlur, T.volB);
    depthOn(P.volBlur);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.vol.tex); gl.uniform1i(P.volBlur.uSrc, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(P.volBlur.uTexel, 1 / T.vol.w, 1 / T.vol.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!P.volTone) return;
    quad(P.volTone, T.volOut);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.volB.tex); gl.uniform1i(P.volTone.uSrc, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.adapt[this.adaptIndex].tex); gl.uniform1i(P.volTone.uAdapt, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(P.volTone.uScatter, f.scatter);
    gl.uniform1f(P.volTone.uExposure, f.exposure ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** @param {ArrayLike<number>} L @param {number} n */
  _glowInView(L, n) {
    const P = this.f?.proj;
    if (!P || P[11] !== -1 || P[15] !== 0) return true;
    const p = spherePlanes(this._vp, this._glowPlanes);
    for (let i = 0; i < n; i++) {
      const x = L[i * 4], y = L[i * 4 + 1], z = L[i * 4 + 2], r = L[i * 4 + 3];
      let out = false;
      // Only the four side planes: they meet at the eye, where every ray starts, and a near plane would drop a light
      // between the eye and it.
      for (let k = 0; k < 4 && !out; k++) out = p[k * 4] * x + p[k * 4 + 1] * y + p[k * 4 + 2] * z + p[k * 4 + 3] < -r - 0.01;
      if (!out) return true;
    }
    return false;
  }

  _replayEmission(f, sp, vp, depthOn) {
    const gl = this.gl, P = this.programs, T = this.targets;
    // The image quads bind their own VAO behind the renderer's back, so its VAO record is reset first.
    f.bindVao?.(null);
    const planes = spherePlanes(vp, this._planes);
    let bound = null;
    for (let i = 0; i < sp.count; i++) {
      const r = sp.records[i];
      if (r.kind !== 2 && !recordVisible(planes, r)) continue;
      if (r.kind === 0) {
        const mesh = r.mesh;
        if (!mesh?.vao || mesh._dead || !mesh.subMeshes?.length) continue;
        let vaoBound = false;
        for (let k = 0; k < mesh.subMeshes.length; k++) {
          const sm = mesh.subMeshes[k];
          const emis = sm._evEmis;
          if (!emis || emis === f.blackTex) continue;
          if (sm._evWin === GLASS_INTERIOR) continue;
          if (!subMeshVisible(planes, r, k)) continue;
          if (bound !== P.emitMesh) { bound = P.emitMesh; gl.useProgram(bound.p); gl.uniformMatrix4fv(bound.uProj, false, vp); gl.uniformMatrix4fv(bound.uView, false, this._identityView); gl.uniform1i(bound.uEmissionTex, 1); this._emitDepth(bound, depthOn, T); }
          if (!vaoBound) { gl.uniformMatrix4fv(P.emitMesh.uModel, false, r.matrix); f.bindVao(mesh.vao); vaoBound = true; }
          gl.uniform3fv(P.emitMesh.uEmissionColor, sm._evEmisWhite ? this._white : f.windowEmission);
          gl.uniform1f(P.emitMesh.uRoomsLit, f.windowRooms && sm._evWin === GLASS_EXTERIOR ? 1 : 0);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, emis);
          gl.drawElements(gl.TRIANGLES, sm.primitiveCount * 3, gl.UNSIGNED_INT, sm.startIndex * 4);
          this.stats.emitDraws++;
        }
      } else if (r.kind === 2) {
        for (const b of r.batches) {
          if (!b?.vao || b._dead || b.conceal || b.castOnly || b.emissionOff) continue;
          const key = billboardKey(b);
          const emis = f.emissionTextures.get(key);
          if (!emis) continue;
          if (!batchVisible(planes, b)) continue;
          const tex = f.textures.get(key);
          if (!tex) continue;
          if (bound !== P.emitBb) {
            bound = P.emitBb; gl.useProgram(bound.p);
            gl.uniformMatrix4fv(bound.uProj, false, vp); gl.uniformMatrix4fv(bound.uView, false, this._identityView);
            gl.uniform1i(bound.uTex, 0); gl.uniform1i(bound.uEmissionTex, 1);
            gl.uniform4fv(bound.uFlatWind, r.flatWind);
            if (r.wfAxis) { gl.uniform4fv(bound.uWindfallSway, r.wfSway); gl.uniform4fv(bound.uWindfallAxis, r.wfAxis); }
            this._emitDepth(bound, depthOn, T);
          }
          gl.uniform3fv(P.emitBb.uRight, r.right); gl.uniform3fv(P.emitBb.uUp, r.up);
          const o = b.origin || ZERO_ORIGIN;
          gl.uniform3f(P.emitBb.uOrigin, o[0], o[1], o[2]);
          gl.uniform2f(P.emitBb.uSize, b.size.w, b.size.h);
          gl.uniform1f(P.emitBb.uSway, swayShare(b, windfallLawOn(r.windfall)));
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, emis);
          f.bindVao(b.vao);
          gl.drawElements(gl.TRIANGLES, b.indexCount, gl.UNSIGNED_INT, b._ibOff | 0);
          this.stats.emitDraws++;
        }
      }
    }
    gl.activeTexture(gl.TEXTURE0);
  }
  uploadContact(loc, on = true) {
    const gl = this.gl;
    const live = on && this.prevValid && this.frame;
    gl.activeTexture(gl.TEXTURE0 + AIR_CONTACT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.frame ? this.frame.prevDepth : null);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(loc.prevDepth, AIR_CONTACT_UNIT);
    gl.uniformMatrix4fv(loc.prevVP, false, this.prevVP);
    gl.uniform4fv(loc.prevProjInfo, this.prevProjInfo);
    gl.uniform4fv(loc.prevRect, this.prevRect);
    this.contactParams[3] = live ? 1 : 0;
    gl.uniform4fv(loc.contactParams, this.contactParams);
  }

  _emitDepth(prog, depthOn, T) {
    const gl = this.gl;
    depthOn(prog);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.frame.depth);
    gl.uniform1i(prog.uDepth, 2);
    gl.uniform2f(prog.uBloomSize, T.bloom.w, T.bloom.h);
    gl.activeTexture(gl.TEXTURE0);
  }

  _glares(f, depthOn) {
    const gl = this.gl, P = this.programs.glare, L = f.pointLights, C = f.pointColors;
    const n = L.length >> 2;
    if (n === 0) return;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.uProj, false, f.proj);
    gl.uniformMatrix4fv(P.uView, false, f.view);
    depthOn(P);
    gl.bindVertexArray(this.glareVao);
    const hold = this._glareHold, now = ++this._glareFrame;
    for (let i = 0; i < n; i++) {
      const range = L[i * 4 + 3];
      if (!(range > 0) || range > AIR_GLARE_MAX_RANGE) continue;
      // The light in the player's hand gets no glare, as the player torch has no flare in any camera.
      if (f.carried && f.carried[i]) continue;
      const x = L[i * 4], y = L[i * 4 + 1], z = L[i * 4 + 2];
      const key = glareKey(x, y, z);
      let h = hold.get(key);
      if (h) { h.range = heldGlareRange(h.range, range); h.seen = now; }
      else hold.set(key, h = { x, y, z, range, seen: now });
      gl.uniform3f(P.uCenter, x, y, z);
      gl.uniform1f(P.uSize, glareSize(h.range));
      gl.uniform3f(P.uColor, C ? C[i * 3] : 1, C ? C[i * 3 + 1] : 1, C ? C[i * 3 + 2] : 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.stats.glares++;
    }
    if ((now & 63) === 0) for (const [k, v] of hold) if (now - v.seen > 120) hold.delete(k);
  }


  // Called by the frame's first screen-space draw; leaves the canvas bound at the full canvas viewport.
  composite() {
    if (!this.pending || !this.targets || !this.frame) return;
    this.pending = false;
    const gl = this.gl, P = this.programs, T = this.targets, F = this.frame;
    const now = this._now();
    const dt = this._lastResolve ? Math.min(Math.max((now - this._lastResolve) / 1000, 0), AIR_ADAPT_MAX_DT) : 0;
    this._lastResolve = now;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.quadVao);
    const quad = (prog, target) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
      gl.useProgram(prog.p);
    };
    gl.activeTexture(gl.TEXTURE0);
    // Only a prepared world frame gets the images; a menu or video frame gets black images and a zero AO mix.
    const prepared = !!this.f && this.fresh;
    if (prepared) this._images();
    else { this._blank(quad); this.measured = false; }
    this.fresh = false;
    const glow = this.stats.vol ? 1 : 0, shafts = this.stats.shafts || this.stats.haze ? 1 : 0;
    const PB = P.bright[glow], PR = P.resolve[glow][shafts];
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.quadVao);
    if (!prepared) { this._fullRect[2] = F.w; this._fullRect[3] = F.h; }
    const rect = prepared ? this.rect : this._fullRect;
    const meter = this.meter;
    this.meter = null;
    meter?.mark('air.eye');
    if (this.measured) {
    quad(P.lum, this.lum);
    gl.bindTexture(gl.TEXTURE_2D, F.tex);
    gl.uniform1i(P.lum.uFrame, 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.volOut.tex); gl.uniform1i(P.lum.uVol, 2); gl.activeTexture(gl.TEXTURE0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.adapt[this.adaptIndex].tex); gl.uniform1i(P.lum.uPrev, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4fv(P.lum.uRect, rect);
    gl.uniform2fv(P.lum.uCanvas, this.canvas);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, this.lum.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    const prev = this.adapt[this.adaptIndex], next = this.adapt[1 - this.adaptIndex];
    quad(P.adapt, next);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, prev.tex); gl.uniform1i(P.adapt.uPrev, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lum.tex); gl.uniform1i(P.adapt.uLum, 1);
    gl.activeTexture(gl.TEXTURE0);
    this.adaptParams[0] = dt;
    gl.uniform4fv(P.adapt.uAdaptParams, this.adaptParams);
    if (AIR_TUNING.calm) { this._calmRates ??= new Float32Array(2); this._calmRates[0] = this.adaptRates[0] * AIR_CALM_RATE; this._calmRates[1] = this.adaptRates[1] * AIR_CALM_RATE; }
    gl.uniform2fv(P.adapt.uAdaptRates, AIR_TUNING.calm ? this._calmRates : this.adaptRates);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.adaptIndex = 1 - this.adaptIndex;
    }
    meter?.mark('air.bloom');
    if (prepared) {
      quad(PB, T.bloom);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindTexture(gl.TEXTURE_2D, F.tex);
      gl.uniform1i(PB.uFrame, 0);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.volOut.tex); gl.uniform1i(PB.uVol, 2); gl.activeTexture(gl.TEXTURE0);
      gl.uniform4fv(PB.uRect, rect);
      gl.uniform2fv(PB.uCanvas, this.canvas);
      gl.uniform1f(PB.uThreshold, AIR_BRIGHT_THRESHOLD);
      gl.uniform2f(PB.uBloomSize, T.bloom.w, T.bloom.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.BLEND);
      for (let pass = 0; pass < 2; pass++) {
        quad(P.gauss, T.bloomB);
        gl.bindTexture(gl.TEXTURE_2D, T.bloom.tex);
        gl.uniform1i(P.gauss.uSrc, 0);
        gl.uniform2f(P.gauss.uDir, 1 / T.bloom.w, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        quad(P.gauss, T.bloom);
        gl.bindTexture(gl.TEXTURE_2D, T.bloomB.tex);
        gl.uniform2f(P.gauss.uDir, 0, 1 / T.bloom.h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    meter?.mark('air.resolve');
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolveTo?.fbo ?? null);
    setFrameTarget(null);
    gl.viewport(0, 0, F.w, F.h);
    gl.useProgram(PR.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, F.tex); gl.uniform1i(PR.uFrame, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.bloom.tex); gl.uniform1i(PR.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, T.shaft.tex); gl.uniform1i(PR.uShaft, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.aoBlur.tex); gl.uniform1i(PR.uAO, 3);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, T.volOut.tex); gl.uniform1i(PR.uVol, 4);
    gl.uniform1f(PR.uAOMix, prepared ? AIR_AO_RESOLVE : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4fv(PR.uRect, rect);
    gl.uniform2fv(PR.uCanvas, this.canvas);
    gl.uniform4fv(PR.uGrade, this.grade);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
  }

  release() {
    if (this.frame) setFrameTarget(null);
    this.pending = false;
    this.fresh = false;
    this._cut = true;
  }

  readTarget(name) {
    const gl = this.gl, T = this.targets?.[name];
    if (!T) return null;
    const n = T.w * T.h * 4, px = new Uint8Array(n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fbo);
    if (T.float) {
      const v = new Float32Array(n);
      gl.readPixels(0, 0, T.w, T.h, gl.RGBA, gl.FLOAT, v);
      for (let i = 0; i < n; i++) px[i] = Math.round(Math.min(Math.max(v[i], 0), 1) * 255);
    } else gl.readPixels(0, 0, T.w, T.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { w: T.w, h: T.h, px };
  }
}
