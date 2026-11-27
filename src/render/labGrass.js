// @ts-check

// The grass shaders are the lab prototype's text (grass-proto.html) plus the declared edit lists below.

import { frustumPlanes, aabbOutside } from './frustum.js';
import { smoothstep } from '../world/mathf.js';
import { buildTuftMips, buildTuftSheet, pixelGrass, PX_RAMP_STEPS, PX_TINT_BANDS, PX_BLADES_PER_TUFT } from './grassPixelArt.js';
import { meadowGrass, buildMeadowMips, meadowCardCorners, meadowCardIndices, MEADOW_SLOTS, MEADOW_CARDS, MEADOW_CARDS_FAR, MEADOW_NEAR_AT, MEADOW_BLADES_PER_TUFT, MEADOW_VARIANTS, MEADOW_LUSH, MEADOW_SHARES, MEADOW_PATCH_SCALE,
  MEADOW_FACE, meadowArtGround, MEADOW_GREEN, MEADOW_SHIFT, MEADOW_GREEN_EDGE, MEADOW_TOP, MEADOW_REACH, MEADOW_WIND_REACH, MEADOW_BOXES, MEADOW_SEED, MEADOW_NEAR_BAND, MEADOW_SLOPE_FLOOR, MEADOW_CELL, MEADOW_BUSH, MEADOW_FLOWERS, MEADOW_DRY, MEADOW_SHORT, MEADOW_TALL } from './grassMeadow.js';
import { buildProgram } from './glProgram.js';
import { FOG_GLSL } from './fogGlsl.js';
import { CLOUD_SHADOW_GLSL } from './cloudShadow.js';
import { SHADOW_GLSL, SHADOW_SUN_UNIT, SHADOW_POINT_UNIT, SHADOW_LO_UNIT, SHADOW_POINT_CASTERS, SHADOW_CASTER_TABLE } from './shadowPass.js';
import { AIR_ADAPT_GLSL } from './airPass.js';
import { EL_CODEC_GLSL, EL_TONEMAP_GLSL, EL_ATTEN_GLSL, EL_MAX_LIGHTS, elDecode, elEncode, elTonemapRGB, elAttenuation, EL_EXPOSURE } from './enhancedLighting.js';

export const GRASS2_VS_EDITS = Object.freeze([
  Object.freeze({
    why: 'uSlotN: the shader is told how many blades the cell holds, so an index can be a fraction of it',
    from: 'uniform float uSnowFull;           // PROTO-22: the SAME line the ground draws\n',
    to: 'uniform float uSnowFull;           // PROTO-22: the SAME line the ground draws\n'
      + 'uniform float uSlotN;              // GRASS2: how many blades this slot holds, so the index can be a fraction\n'
      + 'uniform vec4 uCellFrame;           // GRASS5: the cell\'s origin.xz, its ground\'s floor and its span\n'
      + 'uniform vec4 uBladeScale;          // GRASS5: the height law\'s floor/span, then the width\'s\n'
      + 'uniform float uCellSize;           // GRASS5: how wide a cell is, so a 0..1 lane is metres\n',
  }),
  Object.freeze({
    why: 'the fade threshold is the blade INDEX, not a hash of its phase - so the host can decline the blades that will fail it',
    from: '  if (vFade <= 0.001 || fract(aInst.w * 91.7) > vFade * 1.15) { gl_Position = vec4(2,2,2,1); return; }',
    to: '  float u = uSlotN > 0.5 ? float(gl_InstanceID) / uSlotN : 0.0;\n  if (vFade <= 0.001 || u > vFade * 1.15) { gl_Position = vec4(2,2,2,1); return; }',
  }),
  Object.freeze({
    why: 'GRASS5: the three instance lanes are PACKED integers, not twelve floats - a blade is 16 bytes on the GPU instead of 48',
    from: 'layout(location=1) in vec4 aInst;        // xz, height, phase\n'
      + 'layout(location=2) in vec4 aInst2;       // lean.xz, tint, width\n'
      + 'layout(location=4) in vec3 aGround;      // GR4: the ground\'s own colour under this blade, baked by the placer',
    to: 'layout(location=1) in vec4 aPA;          // GRASS5: u16 x, z, rootY, height - all cell-local, all normalized\n'
      + 'layout(location=2) in vec4 aPB;          // GRASS5: u8 lean.x, lean.z, tint, width\n'
      + 'layout(location=4) in vec4 aPC;          // GRASS5: u8 ground.rgb, phase',
  }),
  Object.freeze({
    why: 'GRASS5: and they are unpacked into the lab\'s own names at the top of main, so every line of the body below is untouched',
    from: 'void main(){\n  vec2 root = aInst.xy;',
    to: 'void main(){\n'
      + '  // GRASS5: UNPACK. The GPU has already turned the integer lanes into\n'
      + '  // 0..1 floats; this is two multiply-adds and a cell origin, and it\n'
      + '  // rebuilds exactly the four values the lab\'s body reads. The names\n'
      + '  // below are the lab\'s own, so nothing after this line had to change.\n'
      + '  vec4 aInst = vec4(uCellFrame.xy + aPA.xy * uCellSize,\n'
      + '                    uBladeScale.x + aPA.w * uBladeScale.y,\n'
      + '                    aPC.a * 6.283185307179586);\n'
      + '  vec4 aInst2 = vec4(aPB.xy * 0.5 - 0.25, aPB.z, uBladeScale.z + aPB.w * uBladeScale.w);\n'
      + '  vec3 aGround = aPC.rgb;\n'
      + '  gRootY = uCellFrame.z + aPA.z * uCellFrame.w;\n'
      + '  vec2 root = aInst.xy;',
  }),
  Object.freeze({
    why: 'SWAY-SOFT (2026-10-21, Mac: "make the grass sway more subtle"): a gentler gust and a smaller lean - LAB_LEAN_PER_PUSH and LAB_GUST_MAX in grassMeadow.js',
    from: '  float push = length(uWindV) * (0.55 + gust * 0.75);\n  vec2 lean = aInst2.xy + wdir * push * 0.055;',
    to: '  float push = length(uWindV) * (0.6 + gust * 0.45);\n  vec2 lean = aInst2.xy + wdir * push * 0.032;',
  }),
]);

export const LAB_GRASS_HEAD = `#version 300 es
precision highp float;
`;
export const GAME_GRASS_FIELD = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
}
// GRASS5: the root height is no longer an attribute of its own - it
// rides the packed A lane and is decoded in main(), so terrain() reads
// a global the decode fills. The port's prelude was always its own
// (GR1's one declared difference), so this costs the lab nothing.
float gRootY;
float terrain(vec2 p){ return gRootY; }`;
export const LAB_GRASS_VS = `layout(location=0) in vec2 aCorner;      // one blade quad, 0..1
layout(location=1) in vec4 aPA;          // GRASS5: u16 x, z, rootY, height - all cell-local, all normalized
layout(location=2) in vec4 aPB;          // GRASS5: u8 lean.x, lean.z, tint, width
layout(location=4) in vec4 aPC;          // GRASS5: u8 ground.rgb, phase
uniform mat4 uVP; uniform float uTime, uWind, uRange; uniform vec3 uEye, uSunDir, uMoonDir;   // WIND4: the moon lights the field at night, as it lights the ground under it
uniform vec2 uWindDir;
uniform float uSnowFull;           // PROTO-22: the SAME line the ground draws
uniform float uSlotN;              // GRASS2: how many blades this slot holds, so the index can be a fraction
uniform vec4 uCellFrame;           // GRASS5: the cell's origin.xz, its ground's floor and its span
uniform vec4 uBladeScale;          // GRASS5: the height law's floor/span, then the width's
uniform float uCellSize;           // GRASS5: how wide a cell is, so a 0..1 lane is metres
uniform sampler2D uGField; uniform vec2 uGFieldOrigin; uniform float uGFieldM, uSnowGlobal; uniform vec2 uWindV;
out float vT; out float vTint; out float vFade; out float vLam; out float vSnow; out float vWet;
out vec3 vGround;                       // GR4
out float vMoonLam;                     // WIND4: the moon's lambert, beside the sun's
void main(){
  // GRASS5: UNPACK. The GPU has already turned the integer lanes into
  // 0..1 floats; this is two multiply-adds and a cell origin, and it
  // rebuilds exactly the four values the lab's body reads. The names
  // below are the lab's own, so nothing after this line had to change.
  vec4 aInst = vec4(uCellFrame.xy + aPA.xy * uCellSize,
                    uBladeScale.x + aPA.w * uBladeScale.y,
                    aPC.a * 6.283185307179586);
  vec4 aInst2 = vec4(aPB.xy * 0.5 - 0.25, aPB.z, uBladeScale.z + aPB.w * uBladeScale.w);
  vec3 aGround = aPC.rgb;
  gRootY = uCellFrame.z + aPA.z * uCellFrame.w;
  vec2 root = aInst.xy;
  float d = distance(root, uEye.xz);
  vFade = 1.0 - smoothstep(uRange*0.55, uRange, d);
  // PROTO-18: the fade thins the FIELD, it does not shrink the blades.
  // A threshold drops whole blades with distance, so the count falls
  // away and every blade that remains is its true size.
  //
  // GRASS2: THE THRESHOLD IS THE BLADE'S INDEX, not a hash of its phase.
  // Same law, same distribution - the placer already emits a cell's
  // blades in random order, so the first k of them are a uniform random
  // k, exactly as a hash of the phase was. What the index buys is that
  // the HOST CAN KNOW which blades will fail: a hash is only knowable
  // after the vertex shader has run, so the old field paid thirty vertex
  // invocations for every blade the fade then threw away - and the band
  // where that happens is 70% of the field's area. Measured at range
  // 200: 8.45M vertex invocations a frame, of which the band's were 61%,
  // for 2% more grass on the screen (tools/grassFieldProbe.mjs). With
  // the index, the host submits the prefix that can survive and no more.
  float u = uSlotN > 0.5 ? float(gl_InstanceID) / uSlotN : 0.0;
  if (vFade <= 0.001 || u > vFade * 1.15) { gl_Position = vec4(2,2,2,1); return; }
  // PROTO-14 (3): THE GRASS KNOWS ABOUT THE GROUND IT STANDS IN.
  // Blades stood up through snow that was supposedly burying them and
  // stayed green in standing water. Snow BURIES them - the depth eats
  // the height, and what is left is bent over and pale; water DROWNS
  // them; and a footfall PUSHES them over, because the field already
  // records where a foot went.
  // PROTO-16 (1, Mac: the grass pops out of the snow when moving).
  // The field is 64m across and the grass is drawn to 90m and beyond,
  // so most blades stand OUTSIDE the window. Their UV clamped to the
  // edge texel, and when the window jumped its 4m block the blades at
  // the boundary flipped between buried and bare in one frame - the
  // pop. Two things fix it, and both are needed: blades outside the
  // window fall back to the GLOBAL snow depth, because snow falls on
  // the whole world and not only on the part being simulated; and the
  // handover is FADED over the last few metres, so no blade changes
  // state in a single step.
  vec2 fuv = (root - uGFieldOrigin) / uGFieldM;
  vec4 fld = texture(uGField, clamp(fuv, 0.0, 1.0));
  vec2 edge = min(fuv, 1.0 - fuv);
  float inWin = smoothstep(0.0, 0.06, min(edge.x, edge.y));
  fld = mix(vec4(0.0, uSnowGlobal, 0.0, 0.0), fld, inWin);
  float snowD = fld.g * (1.0 - fld.b * 0.55);
  float drown = smoothstep(0.10, 0.40, fld.r);
  vSnow = smoothstep(0.02, 0.22, snowD);
  vWet = smoothstep(0.0, 0.35, fld.r) + fld.a * 0.5;
  // PROTO-18 (Mac: grass pops THROUGH THE SNOW during movement, and
  // the snow itself is fine).
  //
  // THE HEIGHT WAS SCALED BY THE DISTANCE FADE. A blade far off stood
  // at 55% of its height and grew to 100% as you approached - which is
  // invisible on bare ground, and on snow is the whole bug: the snow
  // surface is a FIXED line, so a blade that was under it grows up
  // through it as you walk toward it. Every blade in the field does it,
  // continuously, which is exactly "popping through when moving".
  //
  // BURIAL IS GEOMETRIC NOW, not a multiplier. The snow has a real
  // surface height; a blade's true height is fixed and never changes
  // with distance; what shows is simply the part standing ABOVE that
  // surface, and the root is planted ON the snow rather than under it.
  // A blade shorter than the snow is gone because it is buried, not
  // because a factor shrank it - and walking toward it changes
  // nothing, because nothing in this depends on the camera any more.
  float snowSurf = snowD * uSnowFull;             // the SAME line the ground displaces to
  float trueH = aInst.z * (1.0 - drown * 0.9);
  float h = max(0.0, trueH - snowSurf);
  vT = aCorner.y;
  // the tip travels, the root does not: the offset is weighted by
  // height along the blade, squared, which is what a stalk does
  // AUDIT 39 F1: THE GRASS BENDS THE WAY THE WIND BLOWS. The sway was
  // on a fixed axis with a fixed 0.6 cross-term, so the field always
  // leaned the same way however the wind slider was set - and once the
  // rain took a direction, the grass and the rain disagreed in plain
  // sight. Now the lean is the wind VECTOR: a steady push plus a gust
  // that travels ACROSS the field as a wave (the phase carries the
  // blade's position along the wind), which is what makes a gust look
  // like one thing moving rather than every blade wobbling alone.
  vec2 wdir = length(uWindV) > 1e-4 ? normalize(uWindV) : vec2(1.0, 0.0);
  float along = dot(root, wdir);
  float gust = sin(uTime*1.7 - along*0.35 + aInst.w*0.6) * 0.5 + 0.5;
  // SWAY-SOFT (2026-10-21): a gentler gust and a subtler lean - 0.55 + 0.75 and 0.055 before (GRASS2_VS_EDITS)
  float push = length(uWindV) * (0.6 + gust * 0.45);
  vec2 lean = aInst2.xy + wdir * push * 0.032;
  vec3 p;
  p.xz = root + lean * (vT*vT) * h;
  // GR2 (Mac: from the side the blades are completely flat). A blade's
  // width ran along world X, so it was a full quad seen along Z and an
  // edge seen along X. The width now runs ACROSS the line to the eye -
  // a per-blade billboard about Y - so a blade is a blade from any side.
  vec2 toEye = uEye.xz - root;
  vec2 side = length(toEye) > 1e-4 ? normalize(vec2(-toEye.y, toEye.x)) : vec2(1.0, 0.0);
  p.xz += side * (aCorner.x-0.5) * aInst2.w * (1.0 - vT*0.75);
  // planted on the snow's own surface, so the burial line is the one
  // the ground draws and not an approximation of it
  p.y = terrain(root) + snowSurf + vT * h;
  vTint = aInst2.z;
  vGround = aGround;                      // GR4: carried to the root
  // MAC'S NOTE: the blades take the TIME OF DAY. A blade's normal is
  // roughly its own lean crossed with up, so a leaning blade catches
  // a low sun on one side and goes dark on the other - which is what
  // makes a dawn field glow along one edge.
  vec3 nrm = normalize(vec3(-lean.y, 0.35, lean.x) + vec3(0.0, 0.25, 0.0));
  vLam = max(dot(nrm, normalize(uSunDir)), 0.0);
  vMoonLam = max(dot(nrm, normalize(uMoonDir)), 0.0);   // WIND4
  gl_Position = uVP * vec4(p,1.0);
}`;
const UP = new Float32Array([0, 1, 0]);
const WHITE = new Float32Array([1, 1, 1]);
const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_WATER_FOG = new Float32Array(20);
const NO_HAZE = new Float32Array(8);
const NO_DECK = new Float32Array(4);
const NO_CASTERS = new Int32Array(SHADOW_CASTER_TABLE).fill(-1);
const NO_CASTER_PARAMS = new Float32Array(SHADOW_POINT_CASTERS * 4);
const ZERO3 = new Float32Array(3);
const NO_WIND = Object.freeze([0, 0]);
// The adaptation and cloud shadow maps bind on the units the air pass and the renderer reserve for them.
export const GRASS_ADAPT_UNIT = 11;
export const GRASS_CLOUD_UNIT = 15;

export const LAB_GRASS_FS = `in float vT; in float vTint; in float vFade; in float vLam; in float vSnow; in float vWet; in vec3 vGround; in float vMoonLam;   // WIND4: appended, so the lab's own locator still finds this line
uniform vec3 uAmb, uSunCol, uMoonCol; uniform float uDim, uSunScale, uMoonScale;   // WIND4: the sun's SCALE and the moon, the two terms the ground has and the grass did not
out vec4 o;
void main(){
  // PROTO-2: the blade is LIT along its length - dark at the root
  // where the sward shades it, bright at the tip where the sky does -
  // and the very tip catches a rim, which is what makes a field of
  // blades read as depth instead of a green haze.
  // PROTO-7 (Mac: reduce the bright colour): the sward is olive, not
  // emerald - a Daggerfall field, not a golf course.
  // GR4 (RedRoryOTheGlen, via Mac: the base of the grass blending into
  // the ground and all you can make out are the tips through a
  // gradient - how the older Novalogic games did it). THE ROOT IS THE
  // GROUND. A fixed olive root drew a hard line at every base where a
  // blade met a tile of another shade - the one tell that makes a
  // field read as quads stuck on. The root takes the colour of the
  // ground it stands on, darkened as a sward's shade would, and the
  // olive only arrives by the mid.
  vec3 root = vGround * 0.62;
  vec3 mid  = vec3(0.13,0.20,0.07);
  vec3 tip  = vec3(0.24,0.32,0.12);
  vec3 c = mix(root, mid, smoothstep(0.0,0.55,vT));
  c = mix(c, tip, smoothstep(0.5,1.0,vT));
  c *= 0.80 + vTint*0.42;
  // wet grass is DARKER; snow-laden grass is pale and cold
  c *= mix(1.0, 0.72, clamp(vWet, 0.0, 1.0));
  c = mix(c, vec3(0.74,0.78,0.86), vSnow * 0.75);
  // lit by the same sky and sun the ground is, so a blade at dusk is
  // the colour of dusk and not a green cut-out on an orange field.
  //
  // WIND4 (2026-09-15, Mac: "grass doesnt get darker at night"). That
  // sentence was the INTENT and not the code: every other surface in
  // the world lights as ambient, plus the sun's colour times its SCALE
  // times the lambert, plus the moon's the same way (render/renderer.js,
  // farRing, waterSurface - one formula, four programs; the uniforms are
  // not named here because the tree's own shader audit reads a comment
  // as code and would count them as used), and this one dropped
  // BOTH the sun's scale and the moon. uSunScale is the term that goes
  // to zero when the sun sets, so at midnight the ground went dark and
  // the sward stayed lit by a sun that was not there - a glowing field
  // under a black sky. The scale rides the sun here now, and the moon
  // lights the blades as it lights the tile they stand in.
  c *= (uAmb * 1.25 * (0.42 + 0.58*vT) + uSunCol * (uSunScale * 1.15 * vLam) + uMoonCol * (uMoonScale * 1.15 * vMoonLam));
  c *= uDim;
  // the rim is the SUN's colour, and only where the sun can reach - so
  // it goes out with the sun (WIND4: the scale, again)
  c += uSunCol * (uSunScale * 0.20) * smoothstep(0.86,1.0,vT) * vLam;
  // GR4: ...and the base fades IN, so what reads as a blade is its upper
  // part - the tips through a gradient - rather than a planted line.
  o = vec4(c, vFade * smoothstep(0.0, 0.30, vT));
}`;

// Both styles share one program and uPixel switches them, so changing the setting needs no recompile.
export const GRASSPX_VS_EDITS = Object.freeze([
  Object.freeze({
    why: 'the pixel style\'s numbers: the switch, the sway\'s frame rate, the lean\'s steps, the sheet\'s tuft count',
    from: 'uniform float uCellSize;           // GRASS5: how wide a cell is, so a 0..1 lane is metres\n',
    to: 'uniform float uCellSize;           // GRASS5: how wide a cell is, so a 0..1 lane is metres\n'
      + 'uniform float uPixel, uPxVariants;   // GRASS-PX: 0 is the lab\'s blade, 1 the tuft sprite\n',
  }),
  Object.freeze({
    why: 'the fragment stage needs the quad\'s own texel and which tuft this blade wears - the tuft is flat, so one blade is one sprite',
    from: 'out float vMoonLam;                     // WIND4: the moon\'s lambert, beside the sun\'s\n',
    to: 'out float vMoonLam;                     // WIND4: the moon\'s lambert, beside the sun\'s\n'
      + 'out vec2 vUV; flat out float vVar;      // GRASS-PX: the tuft\'s texel, and which tuft\n',
  }),
  Object.freeze({
    why: 'the pixel quad is not tapered - the sprite carries the shape - and it is HALF ITS DRAWN HEIGHT wide, so a 2:1 tuft (16x32 then, 8x16 since GRASS-PX4) is square texels on every blade, buried or not',
    from: '  p.xz += side * (aCorner.x-0.5) * aInst2.w * (1.0 - vT*0.75);',
    to: '  p.xz += side * (aCorner.x-0.5) * mix(aInst2.w * (1.0 - vT*0.75), h * 0.5, uPixel);   // GRASS-PX; GRASS AUDIT 1: the width is the height\'s, per blade',
  }),
  Object.freeze({
    why: 'the texel is the corner, and the tuft is chosen by a hash of the root - NOT the phase, which is the gust\'s, or every tuft of one sprite would hop in unison; AUDIT MEADOW1: of the root\'s place in its CELL, which no shift of the floating origin moves',
    from: '  vGround = aGround;                      // GR4: carried to the root',
    to: '  vGround = aGround;                      // GR4: carried to the root\n'
      + '  vUV = aCorner;                          // GRASS-PX\n'
      + '  vVar = min(floor(hash(aPA.xy * 64.0) * uPxVariants), uPxVariants - 1.0);   // GRASS AUDIT 1: the prelude\'s hash, its float32 fract honest; AUDIT MEADOW1: of the cell\'s lane, not the scene\'s root - every tuft re-rolled at each map pixel crossed',
  }),
]);

export const GRASSPX_FS_EDITS = Object.freeze([
  Object.freeze({
    why: 'the two varyings the vertex stage now sends',
    from: 'in vec3 vGround; in float vMoonLam;   // WIND4: appended, so the lab\'s own locator still finds this line\n',
    to: 'in vec3 vGround; in float vMoonLam;   // WIND4: appended, so the lab\'s own locator still finds this line\n'
      + 'in vec2 vUV; flat in float vVar;   // GRASS-PX\n',
  }),
  Object.freeze({
    why: 'the sheet, the switch, the ramp\'s steps, the tuft count, and the tint\'s bands; then the ordered dither and the sample itself at the top of main',
    from: 'out vec4 o;\nvoid main(){',
    to: 'uniform float uPixel, uPxSteps, uPxVariants, uPxTintBands; uniform sampler2D uPxSheet;   // GRASS-PX\n'
      + 'out vec4 o;\n'
      + '// GRASS-PX: the 4x4 Bayer matrix as bit arithmetic - a const array\n'
      + '// indexed at runtime is the kind of thing a driver gets wrong, and\n'
      + '// the closed form is four operations. (x xor y, y) bit-interleaved and\n'
      + '// reversed is the classic matrix: 0 8 2 10 / 12 4 14 6 / 3 11 1 9 / 15 7 13 5.\n'
      + 'float bayer4(vec2 fc){\n'
      + '  ivec2 q = ivec2(fc) & 3; int x = q.x ^ q.y;\n'
      + '  int m = ((x & 1) << 3) | ((q.y & 1) << 2) | (x & 2) | ((q.y & 2) >> 1);\n'
      + '  return (float(m) + 0.5) / 16.0;\n'
      + '}\n'
      + 'void main(){\n'
      + '  // GRASS-PX: THE TUFT. The quad wears one of the sheet\'s tufts; a\n'
      + '  // texel that is air is discarded outright (no soft edge, ever), and\n'
      + '  // the distance fade is an ORDERED DITHER against the screen rather\n'
      + '  // than a transparency - the way a paletted screen faded anything.\n'
      + '  // What the texel carries stands in for the lab\'s own terms below:\n'
      + '  // its tone picks the flat colour, its height along its own blade is\n'
      + '  // what the root-to-tip light reads, and its blade ordinal shades\n'
      + '  // the tuft\'s blades apart.\n'
      + '  float t = vT; float pxTone = 0.0; float pxBlade = 0.0;\n'
      + '  if (uPixel > 0.5) {\n'
      + '    vec4 px = texture(uPxSheet, vec2((vVar + vUV.x) / uPxVariants, vUV.y));\n'
      + '    if (px.a < 0.5 || vFade < bayer4(gl_FragCoord.xy)) discard;\n'
      + '    pxTone = floor(px.r * 4.0 + 0.5); t = px.g; pxBlade = px.b;\n'
      + '  }',
  }),
  Object.freeze({
    why: 'the gradient runs along the drawn stalk; in the pixel style the colour is one of three flat tones, and the patch tint is banded',
    from: '  vec3 c = mix(root, mid, smoothstep(0.0,0.55,vT));\n  c = mix(c, tip, smoothstep(0.5,1.0,vT));\n  c *= 0.80 + vTint*0.42;',
    to: '  vec3 c = mix(root, mid, smoothstep(0.0,0.55,t));\n  c = mix(c, tip, smoothstep(0.5,1.0,t));\n'
      + '  if (uPixel > 0.5) c = (pxTone < 1.5 ? root : (pxTone < 2.5 ? mid : tip)) * (0.92 + pxBlade * 0.16);   // GRASS-PX: three flat tones, and the tuft\'s blades a shade apart\n'
      + '  c *= 0.80 + mix(vTint, floor(vTint * (uPxTintBands - 1.0) + 0.5) / (uPxTintBands - 1.0), uPixel) * 0.42;   // GRASS-PX: the patch tint in bands; GRASS AUDIT 1: rounded to band CENTRES, so the mean holds and the top band is 1',
  }),
  Object.freeze({
    why: 'the sward\'s shade climbs the drawn stalk, not the quad',
    from: '  c *= (uAmb * 1.25 * (0.42 + 0.58*vT) + uSunCol',
    to: '  c *= (uAmb * 1.25 * (0.42 + 0.58*t) + uSunCol',
  }),
  Object.freeze({
    why: 'the rim lands on the one highlight texel in the pixel style - a whole step of sun on one pixel, which is what a hand-set highlight is',
    from: '  c += uSunCol * (uSunScale * 0.20) * smoothstep(0.86,1.0,vT) * vLam;',
    to: '  c += uSunCol * (uSunScale * 0.20) * mix(smoothstep(0.86,1.0,t), step(3.5, pxTone), uPixel) * vLam;   // GRASS-PX',
  }),
  Object.freeze({
    why: 'the lit colour is snapped to a short luminance ramp (the hue is kept, so a dusk field is still the colour of dusk), and the alpha is hard',
    from: '  o = vec4(c, vFade * smoothstep(0.0, 0.30, vT));',
    to: '  // GRASS AUDIT 1: the ramp is PERCEPTUAL and its first rung is never zero.\n'
      + '  // Eight linear steps put the first boundary at a luminance of 1/16, and\n'
      + '  // a lit blade lives under 0.4 in daylight and under 0.05 at night or in\n'
      + '  // rain - so the mid and root tones, three quarters of every tuft, went\n'
      + '  // to exact black after dark and a moonlit midnight was as bright as\n'
      + '  // noon for what was left. The steps are taken in gamma space, where\n'
      + '  // the eye takes them, and the lowest rung is the first step, not zero.\n'
      + '  if (uPixel > 0.5) { float l = max(dot(c, vec3(0.299, 0.587, 0.114)), 1e-4); float g = max(1.0, floor(pow(l, 1.0 / 2.2) * uPxSteps + 0.5)) / uPxSteps; c *= pow(g, 2.2) / l; }   // GRASS-PX: the ramp\n'
      + '  o = vec4(c, mix(vFade * smoothstep(0.0, 0.30, vT), 1.0, uPixel));',
  }),
]);

export function applyGrassEdits(text, edits) {
  let out = text;
  for (const e of edits) {
    const at = out.indexOf(e.from);
    if (at < 0) throw new Error(`grass edit not found: ${e.why}`);
    if (out.indexOf(e.from, at + 1) >= 0) throw new Error(`grass edit lands twice: ${e.why}`);
    out = out.slice(0, at) + e.to + out.slice(at + e.from.length);
  }
  return out;
}
// The fog edits apply after the pixel style's, so the fog color is not snapped to a ramp step.
export const FOG_FACTOR_GLSL = FOG_GLSL + '\n';
export const GRASSFOG_VS_EDITS = Object.freeze([
  Object.freeze({
    why: 'the blade hands the fragment its world point, which the fog measures its distance from',
    from: 'out vec3 vGround;                       // GR4\n',
    to: 'out vec3 vGround;                       // GR4\nout vec3 vWorld;                        // DISC20-A: where the fog measures from\n',
  }),
  Object.freeze({
    why: 'the world point is where the blade vertex stands, the point the view projects',
    from: '  gl_Position = uVP * vec4(p,1.0);',
    to: '  vWorld = p;   // DISC20-A\n  gl_Position = uVP * vec4(p,1.0);',
  }),
]);
export const GRASSFOG_FS_EDITS = Object.freeze([
  Object.freeze({
    why: 'the terrain\'s five fog uniforms and its fogFactorAt, verbatim, so a blade fogs as the ground under it does',
    from: 'out vec4 o;\n',
    to: 'in vec3 vWorld;\nuniform vec3 uFogColor; uniform int uFogMode; uniform float uFogDensity; uniform vec2 uFogRange; uniform vec3 uCamPos;   // DISC20-A: the terrain\'s fog\n'
      + FOG_FACTOR_GLSL + 'out vec4 o;\n',
  }),
  Object.freeze({
    why: 'the lit and stepped colour blended to the fog colour at the blade\'s distance, as the terrain\'s last line does',
    from: '  o = vec4(c, mix(vFade * smoothstep(0.0, 0.30, vT), 1.0, uPixel));',
    to: '  c = mix(uFogColor, c, fogFactorAt(vWorld));   // DISC20-A\n  c = dwWaterFog(c, vWorld);   // DW-C: and the carved sea\'s distance fog, as the terrain\'s last line takes it\n  o = vec4(c, mix(vFade * smoothstep(0.0, 0.30, vT), 1.0, uPixel));',
  }),
]);

export const GRASS_PALETTE = Object.freeze({
  root: Object.freeze([0.852, 0.844, 0.953]),
  tip: Object.freeze([1.135, 1.166, 1.089]),
  top: Object.freeze([1.241, 1.275, 1.231]),
});
// Probe reference only; at runtime each blade takes the mean of the tile under it.
export const GRASS_TILE_MEANS = Object.freeze({
  mountain: Object.freeze([59 / 255, 67 / 255, 46 / 255]),
  woodland: Object.freeze([52 / 255, 76 / 255, 42 / 255]),
  'wood-rain': Object.freeze([46 / 255, 69 / 255, 40 / 255]),
  swamp: Object.freeze([44 / 255, 63 / 255, 38 / 255]),
  'mtn-rain': Object.freeze([46 / 255, 53 / 255, 40 / 255]),
});
export const GRASS_SWARD = 0.9;
export const GRASS_SUN_LIFT = 0.2;
export const GRASS_FAR_BLEND = Object.freeze([0.12, 0.6]);
export const GRASS_TONES = Object.freeze([
  Object.freeze([0.92, 0.92, 0.97]),
  Object.freeze([1.18, 1.24, 1.08]),
  Object.freeze([1.38, 1.50, 1.14]),
  Object.freeze([1.56, 1.70, 1.25]),
]);
export const GRASS_TONES_CLASSIC = Object.freeze([
  Object.freeze([0.93, 0.93, 0.98]),
  Object.freeze([1.06, 1.10, 1.01]),
  Object.freeze([1.24, 1.33, 1.05]),
  Object.freeze([1.45, 1.57, 1.16]),
]);
// The height lane packs the height in its high GRASS_HEIGHT_BITS and the slope's x and z in five bits each.
export const GRASS_SLOPE_SPAN = 0.75;
export const GRASS_SLOPE_STEPS = 15;
export const GRASS_HEIGHT_BITS = 6;
export const GRASS_MAX_LIGHTS = EL_MAX_LIGHTS;
export const GRASS_CELL_LIGHTS = 8;

export const GRASSLIT_VS_EDITS = Object.freeze([
  Object.freeze({
    why: 'the ground\'s light terms, read where the blade stands: the deck\'s shadow and the sun map (the terrain\'s own readers), the player\'s light, and what the fragment is handed of them',
    from: 'out vec2 vUV; flat out float vVar;      // GRASS-PX: the tuft\'s texel, and which tuft\n',
    to: 'out vec2 vUV; flat out float vVar;      // GRASS-PX: the tuft\'s texel, and which tuft\n'
      + '// GRASS-LIT: the ground\'s light, read once at the root\n'
      + 'uniform float uSunScale;           // GRASS-LIT: the fragment\'s own, here too - the sun\'s reach is asked only while it is up\n'
      + 'uniform vec3 uCamPos;              // GRASS-LIT: the fragment\'s own, here too - the cascades are picked about the eye\n'
      + 'uniform vec4 uIndirect; uniform vec3 uIndirectColor;   // GRASS-LIT: R12, the light that follows the player\n'
      + CLOUD_SHADOW_GLSL + SHADOW_GLSL
      + 'flat out float vSun;                    // GRASS-LIT: the sun that reaches the root - the deck\'s and the map\'s, one value a triangle\n'
      + 'out vec3 vNear;                         // GRASS-LIT: the player\'s light at the root\n'
      + 'out float vFar;                         // GRASS-LIT: how far into the range - the colour gives way to the ground\'s\n'
      + 'uniform float uLane;               // GRASS-LIT2: the fragment\'s own, here too - the lane\'s lantern falloff or the classic one\n'
      + 'uniform int uPointCount;           // GRASS-LIT2: the frame\'s lanterns, torches and candles - the list the ground takes - AUDIT A1: as many of them as meet THIS cell\n'
      + `uniform int uPointIdx[${GRASS_CELL_LIGHTS}];        // AUDIT GRASS-LIT2 A1: which - indices into the frame\'s list (uCasterOf reads the same index)\n`
      + `uniform vec4 uPointLights[${GRASS_MAX_LIGHTS}];     // GRASS-LIT2: xyz the light, w its range\n`
      + `uniform vec3 uPointColors[${GRASS_MAX_LIGHTS}];     // GRASS-LIT2: colour x intensity - linear under the lane, as the ground's\n`
      + EL_ATTEN_GLSL + '\n'
      + 'flat out vec3 vPoint;                   // GRASS-LIT2: the lanterns at the root - one value a triangle, as the sun\n',
  }),
  Object.freeze({
    why: 'AUDIT GRASS-LIT2 A6: the lane\'s own word says what it carries now',
    from: '// GRASS5: u16 x, z, rootY, height - all cell-local, all normalized\n',
    to: '// GRASS5: u16 x, z, rootY, height - all cell-local, all normalized; GRASS-LIT2: the height\'s word is its six bits and the slope\'s ten\n',
  }),
  Object.freeze({
    why: 'GRASS-LIT2: the height lane carries the ground\'s slope - the height in its high six bits, the normal\'s x and z in five each (writeSlot) - so a blade is lit by the hillside it stands on',
    from: '                    uBladeScale.x + aPA.w * uBladeScale.y,\n',
    to: `                    uBladeScale.x + float(hw >> ${16 - GRASS_HEIGHT_BITS}u) / ${(2 ** GRASS_HEIGHT_BITS - 1).toFixed(1)} * uBladeScale.y,   // GRASS-LIT2\n`,
  }),
  Object.freeze({
    why: 'GRASS-LIT2: the lane unpacked ahead of the blade it builds, and the ground\'s normal rebuilt from its x and z',
    from: '  vec4 aInst = vec4(uCellFrame.xy + aPA.xy * uCellSize,\n',
    to: '  // GRASS-LIT2: THE HEIGHT LANE\'S SIXTEEN BITS - the height\'s high six, then the ground normal\'s x and z, five each\n'
      + '  // (codes 0..30, 15 the level, stored XOR 15 so a zero word - a pad, a cleared slot - is level; writeSlot): the terrain\'s\n'
      + '  // own normal under the root (world/terrain/terrainSurface.js surfaceNormalAt)\n'
      + '  uint hw = uint(aPA.w * 65535.0 + 0.5);\n'
      + `  vec2 slope = (vec2(float(((hw >> 5u) & 31u) ^ ${GRASS_SLOPE_STEPS}u), float((hw & 31u) ^ ${GRASS_SLOPE_STEPS}u)) - ${GRASS_SLOPE_STEPS.toFixed(1)}) * ${GRASS_SLOPE_SPAN / GRASS_SLOPE_STEPS};   // AUDIT A3: stored ^ 15, so a zero word is level\n`
      + '  vec3 gN = vec3(slope.x, sqrt(max(1.0 - dot(slope, slope), 0.0)), slope.y);\n'
      + '  vec4 aInst = vec4(uCellFrame.xy + aPA.xy * uCellSize,\n',
  }),
  Object.freeze({
    why: 'the blade\'s normal stands nearer the ground\'s - it still leans into a low sun, but a field at noon is lit as the tile under it is, not a third darker',
    from: '  vec3 nrm = normalize(vec3(-lean.y, 0.35, lean.x) + vec3(0.0, 0.25, 0.0));',
    to: '  vec3 nrm = normalize(vec3(-lean.y, 0.0, lean.x) + 1.2 * gN);   // GRASS-LIT; GRASS-LIT2: about the ground\'s own normal - level ground\'s is the up the blade stood about',
  }),
  Object.freeze({
    why: 'the root\'s sun (the deck x the sun map, only while the sun is up), the player\'s light by the ground\'s own falloff, and the distance the colour blends by',
    from: '  vMoonLam = max(dot(nrm, normalize(uMoonDir)), 0.0);   // WIND4\n',
    to: '  vMoonLam = max(dot(nrm, normalize(uMoonDir)), 0.0);   // WIND4\n'
      + '  // GRASS-LIT: THE GROUND\'S LIGHT AT THE ROOT - one read a vertex, the flats\' law (a sprite reads its sun once,\n'
      + '  // at its foot): the deck\'s shadow and the sun map as the terrain under it takes them, the player\'s light by the\n'
      + '  // terrain\'s own falloff, and how far into the range the blade stands\n'
      + '  vec3 rootW = vec3(root.x, gRootY + snowSurf, root.y);\n'
      + '  // read in each triangle\'s PROVOKING vertex alone (the last - GL\'s, and WebGL\'s, convention) and handed down flat:\n'
      + '  // the root\'s sun is one value a blade, so the other two vertices of a triangle need not pay the map\'s taps\n'
      + `  vSun = (gl_VertexID % 3 == 2 && uSunScale > 0.0) ? cloudShadowAt(rootW) * sunShadowAt(rootW + vec3(0.0, ${GRASS_SUN_LIFT}, 0.0), vec3(0.0, 1.0, 0.0)) : 0.0;   // off the ground's own depth: a tree's shade, never the ground's acne\n`
      + '  vec3 iL = uIndirect.xyz - rootW; float iD = length(iL);\n'
      + '  float iAtt = clamp(1.0 - iD / max(uIndirect.w, 1e-4), 0.0, 1.0);\n'
      + '  vNear = iAtt * iAtt * max(dot(nrm, iL / max(iD, 1e-4)), 0.0) * uIndirectColor;\n'
      + `  vFar = smoothstep(uRange * ${GRASS_FAR_BLEND[0]}, uRange * ${GRASS_FAR_BLEND[1]}, d);\n`
      + '  // GRASS-LIT2: THE LANTERNS AT THE ROOT - the ground\'s own list and falloff (TERRAIN_FS\'s (1 - d/r)^2, the lane\'s\n'
      + '  // elAttenuation), each light\'s map where it has one (shadowOfLight, the flats\' reader), lifted off the ground as the\n'
      + '  // sun\'s is; read in the provoking vertex alone, as the sun\n'
      + '  vPoint = vec3(0.0);\n'
      + `  if (gl_VertexID % 3 == 2) for (int j = 0; j < ${GRASS_CELL_LIGHTS}; j++) {   // AUDIT A1: the cell's lights, not the frame's\n`
      + '    if (j >= uPointCount) break;\n'
      + '    int i = uPointIdx[j];\n'
      + '    vec3 pL = uPointLights[i].xyz - rootW; float pd = length(pL);\n'
      + '    if (pd >= uPointLights[i].w) continue;\n'
      + '    float pc = clamp(1.0 - pd / uPointLights[i].w, 0.0, 1.0);\n'
      + '    float pa = uLane > 0.5 ? elAttenuation(pd, uPointLights[i].w) : pc * pc;\n'
      + `    vPoint += pa * shadowOfLight(i, uPointLights[i], rootW + vec3(0.0, ${GRASS_SUN_LIFT}, 0.0), vec3(0.0)) * max(dot(nrm, pL / max(pd, 1e-4)), 0.0) * uPointColors[i];\n`
      + '  }\n',
  }),
]);

export const GRASSLIT_FS_EDITS = Object.freeze([
  Object.freeze({
    why: 'what the vertex stage reads at the root, the lane\'s switch and exposure, the eye\'s adaptation, and the lane\'s codec and curve',
    from: 'uniform float uPixel, uPxSteps, uPxVariants, uPxTintBands; uniform sampler2D uPxSheet;   // GRASS-PX\n',
    to: 'uniform float uPixel, uPxSteps, uPxVariants, uPxTintBands; uniform sampler2D uPxSheet;   // GRASS-PX\n'
      + 'flat in float vSun; in vec3 vNear; in float vFar;   // GRASS-LIT\n'
      + 'flat in vec3 vPoint;   // GRASS-LIT2: the lanterns at the root\n'
      + 'uniform float uLane, uELExposure;   // GRASS-LIT: 1 under Enhanced Lighting, and the lane\'s exposure\n'
      + 'uniform vec3 uGrassTone[4];   // GRASS-LIT: the tuft\'s four tones as ratios of the ground\'s mean - root, middle, tip, highlight (GRASS_TONES)\n'
      + AIR_ADAPT_GLSL + EL_CODEC_GLSL + '\n' + EL_TONEMAP_GLSL,
  }),
  Object.freeze({
    why: 'the tuft is painted from the tile\'s own palette: its dark third, its mean, its light third and its brightest tenth',
    from: '  vec3 root = vGround * 0.62;\n  vec3 mid  = vec3(0.13,0.20,0.07);\n  vec3 tip  = vec3(0.24,0.32,0.12);',
    to: '  vec3 root = vGround * uGrassTone[0];   // GRASS-LIT: the ground\'s colour, in the shade of the sward\n'
      + '  vec3 mid  = vGround * uGrassTone[1];   // GRASS-LIT\n'
      + '  vec3 tip  = vGround * uGrassTone[2];   // GRASS-LIT\n'
      + '  vec3 top  = vGround * uGrassTone[3];   // GRASS-LIT: the highlight texel',
  }),
  Object.freeze({
    why: 'the pixel style\'s fourth tone is the highlight texel, and the tuft\'s blades stand a little nearer one another',
    from: '  if (uPixel > 0.5) c = (pxTone < 1.5 ? root : (pxTone < 2.5 ? mid : tip)) * (0.92 + pxBlade * 0.16);',
    to: '  if (uPixel > 0.5) c = (pxTone < 1.5 ? root : (pxTone < 2.5 ? mid : (pxTone < 3.5 ? tip : top))) * (0.95 + pxBlade * 0.10);   // GRASS-LIT: the highlight is the tile\'s brightest tenth',
  }),
  // These edit only the tint's two numbers: an edit whose text repeats the band formula between them would give
  // another list's anchor on that formula a second match.
  Object.freeze({
    why: 'the patch tint\'s floor',
    from: '  c *= 0.80 + mix(vTint, ',
    to: '  c *= 0.88 + mix(vTint, ',
  }),
  Object.freeze({
    why: 'the patch tint\'s span',
    from: ', uPixel) * 0.42;',
    to: ', uPixel) * 0.24;',
  }),
  Object.freeze({
    why: 'the far field gives way to the ground\'s mean, before the wet and the snow (which are the ground\'s too)',
    from: '  // wet grass is DARKER; snow-laden grass is pale and cold\n',
    to: '  c = mix(c, vGround, vFar);   // GRASS-LIT: the far field is the ground\'s colour\n'
      + '  // wet grass is DARKER; snow-laden grass is pale and cold\n',
  }),
  Object.freeze({
    why: 'lit as the ground is - the ambient under a soft sward shade, the sun through the deck and the map, the moon, the player\'s light - and under Enhanced Lighting through the lane\'s own decode, exposure, curve and encode',
    from: '  c *= (uAmb * 1.25 * (0.42 + 0.58*t) + uSunCol * (uSunScale * 1.15 * vLam) + uMoonCol * (uMoonScale * 1.15 * vMoonLam));',
    to: `  vec3 light = uAmb * (${GRASS_SWARD} + ${(1 - GRASS_SWARD).toFixed(2)}*t) + uSunCol * (uSunScale * vLam * vSun) + uMoonCol * (uMoonScale * vMoonLam) + vNear + vPoint;   // GRASS-LIT; GRASS-LIT2: and the lanterns\n`
      + '  c = uLane > 0.5 ? elEncode(elTonemapRGB(elDecode(c) * light * (uELExposure * elAdapt()))) : c * light;   // GRASS-LIT: the lane\'s pipeline, as EL_TERRAIN_FS runs it',
  }),
  Object.freeze({
    why: 'the rim catches only where the sun reaches the root, and softer - a highlight, not a glow',
    from: '  c += uSunCol * (uSunScale * 0.20) * mix(smoothstep(0.86,1.0,t), step(3.5, pxTone), uPixel) * vLam;   // GRASS-PX',
    to: '  c += uSunCol * (uSunScale * 0.12) * mix(smoothstep(0.86,1.0,t), step(3.5, pxTone), uPixel) * vLam * vSun;   // GRASS-PX; GRASS-LIT: under the deck and the map',
  }),
]);

const glf = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const share = (pair) => `mix(${glf(pair[0])}, ${glf(pair[1])}, mLush)`;
const box4 = (b) => `vec4(${glf(b.u0)}, ${glf(b.u1)}, ${glf(b.v0)}, ${glf(b.v1)})`;
const MEADOW_PICK = `    float mB = ${share(MEADOW_SHARES.bush)}, mF = ${share(MEADOW_SHARES.flowers)}, mD = ${share(MEADOW_SHARES.dry)};\n`
  + '    float mR = aPB.w;\n'
  + `    mVar = mR < mB ? ${glf(MEADOW_BUSH)} : (mR < mB + mF ? ${glf(MEADOW_FLOWERS)} : (mR < mB + mF + mD ? ${glf(MEADOW_DRY)}`
  + ` : ((mR - mB - mF - mD) / (1.0 - mB - mF - mD) < ${share(MEADOW_SHARES.short)} ? ${glf(MEADOW_SHORT)} : ${glf(MEADOW_TALL)})));\n`;
/** @typedef {{ name: string, variants: readonly { name: string, scale: number, stiff: number, sway: number }[],
 *    boxes: readonly { u0: number, u1: number, v0: number, v1: number }[], pick: string, green: readonly number[], hue: number,
 *    top: number, reach: number, windReach: number, mips: () => any[] }} GrassArt */
/** @type {GrassArt} */
export const MEADOW_ART = Object.freeze({
  name: 'meadow', variants: MEADOW_VARIANTS, boxes: MEADOW_BOXES, pick: MEADOW_PICK, green: MEADOW_GREEN, hue: 1,
  top: MEADOW_TOP, reach: MEADOW_REACH, windReach: MEADOW_WIND_REACH, mips: () => buildMeadowMips(),
});
// The vertex stage side of floorPick in jungleFloorArt.js; the two must pick the same variant.
export function ladderPick(shares) {
  let at = '0.0', out = '    float mR = aPB.w;\n', ladder = '';
  shares.slice(0, -1).forEach(([v, poor, lush], i) => {
    out += `    float mS${i} = ${at} + ${share([poor, lush])};\n`;
    ladder += `mR < mS${i} ? ${glf(v)} : `;
    at = `mS${i}`;
  });
  return `${out}    mVar = ${ladder}${glf(shares.at(-1)[0])};\n`;
}
export function meadowVsEdits(art) {
  // Per-variant values are ternary ladders because some drivers mishandle a const array indexed at runtime.
  const byVariant = (key) => art.variants.slice(0, -1).map((v, i) => `mVar < ${glf(i + 0.5)} ? ${glf(v[key])} : `).join('') + glf(art.variants.at(-1)[key]);
  const byBox = () => art.boxes.slice(0, -1).map((b, i) => `mVar < ${glf(i + 0.5)} ? ${box4(b)} : `).join('') + box4(art.boxes.at(-1));
  return Object.freeze([
  Object.freeze({
    why: 'the card a vertex stands on - the meadow\'s corner arrays carry its turn; the blade arrays leave the attribute unset, which reads 0',
    from: '// GRASS5: u8 ground.rgb, phase\n',
    to: '// GRASS5: u8 ground.rgb, phase\n'
      + 'layout(location=3) in float aCard;       // MEADOW1: the card\'s turn, a share of a half-turn, +1 when mirrored (render/grassMeadow.js meadowCardCorners)\n',
  }),
  Object.freeze({
    why: 'the switch: the owner\'s art on crossed cards',
    from: 'uniform float uPixel, uPxVariants;',
    to: 'uniform float uArt;                  // MEADOW1: 1 in the meadow - the owner\'s sprites on crossed cards\n'
      + 'uniform float uPixel, uPxVariants;',
  }),
  Object.freeze({
    why: 'which sprite, how big its card, and which way its cards face - before the sway, the quad and the root read the height',
    from: '  float h = max(0.0, trueH - snowSurf);\n',
    to: '  float h = max(0.0, trueH - snowSurf);\n'
      + '  // MEADOW1: WHICH SPRITE, HOW BIG, AND WHICH WAY. The width byte is a uniform random the sprite styles never draw a\n'
      + '  // width with (their quad is the sprite\'s); the patch is the tint GRASS6 bakes. The card\'s side is the blade\'s height\n'
      + '  // times its sprite\'s scale and the patch\'s, and everything below that reads the height reads the card\'s.\n'
      + '  float mVar = 0.0, mStiff = 1.0, mSway = 1.0; vec2 mC = aCorner, mDir = vec2(1.0, 0.0), mLean = vec2(0.0);\n'
      + '  if (uArt > 0.5) {\n'
      + `    float mLush = smoothstep(${glf(MEADOW_LUSH[0])}, ${glf(MEADOW_LUSH[1])}, aInst2.z);\n`
      + art.pick
      + `    h *= (${byVariant('scale')}) * mix(${glf(MEADOW_PATCH_SCALE[0])}, ${glf(MEADOW_PATCH_SCALE[1])}, mLush);\n`
      + `    mStiff = ${byVariant('stiff')};\n`
      + `    mSway = ${byVariant('sway')};   // AUDIT MEADOW1: its share of the wind - the trees' own\n`
      + `    vec4 mBox = ${byBox()};   // AUDIT MEADOW1: its sprite's drawn box (MEADOW_BOXES) - the card is cut to it\n`
      + '    mC = mix(mBox.xz, mBox.yw, aCorner);\n'
      + `    float mYaw = hash(aPA.xy * ${glf(MEADOW_SEED)});   // the tuft's own turn, fixed in the world - AUDIT MEADOW1: off its place in its cell, which no shift of the origin moves\n`
      + '    float mA = (mYaw + fract(aCard)) * 3.141592653589793;   // the card\'s turn off the tuft\'s\n'
      + '    mDir = vec2(cos(mA), sin(mA));\n'
      + '    if ((fract(mYaw * 8.0) >= 0.5) != (aCard >= 1.0)) mDir = -mDir;   // mirrored, by tuft and by every other card - AUDIT MEADOW1: the card turned, so its box holds\n'
      + `    if (fract(aCard) > 0.5 && d > uRange * (${glf(MEADOW_NEAR_AT)} + ${glf(MEADOW_NEAR_BAND)} * fract(mYaw * 64.0))) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // AUDIT MEADOW1: the third card goes tuft by tuft across the band\n`
      + '  }\n',
  }),
  Object.freeze({
    why: 'the card: square (the sprite\'s texels are), at the tuft\'s own yaw and fixed in the world - no billboard - cut to its sprite, leaning its own share of the lab\'s lean and swaying its share of the wind',
    from: ', h * 0.5, uPixel);   // GRASS-PX; GRASS AUDIT 1: the width is the height\'s, per blade\n',
    to: ', h * 0.5, uPixel);   // GRASS-PX; GRASS AUDIT 1: the width is the height\'s, per blade\n'
      + '  if (uArt > 0.5) { vT = mC.y; mLean = aInst2.xy * mStiff + (lean - aInst2.xy) * mSway; p.xz = root + mLean * (vT*vT) * h + mDir * (mC.x - 0.5) * h; }   // MEADOW1: the card\n',
  }),
  Object.freeze({
    why: 'AUDIT MEADOW1: the card\'s foot on the ground\'s own slope - a level foot hung the downhill end of a bush a quarter-metre over a hillside',
    from: '  p.y = terrain(root) + snowSurf + vT * h;\n',
    to: '  p.y = terrain(root) + snowSurf + vT * h;\n'
      + `  if (uArt > 0.5) p.y += dot(p.xz - root, -gN.xz) / max(gN.y, ${glf(MEADOW_SLOPE_FLOOR)});   // AUDIT MEADOW1: sheared to the ground under it\n`,
  }),
  Object.freeze({
    why: 'the sprite the law picked, and the texel its cut corner stands on',
    from: 'every tuft re-rolled at each map pixel crossed\n',
    to: 'every tuft re-rolled at each map pixel crossed\n'
      + '  if (uArt > 0.5) { vVar = mVar; vUV = mC; }   // MEADOW1\n',
  }),
  Object.freeze({
    why: 'AUDIT MEADOW1: the card is lit by the lean it stands at - its own share of the standing lean and of the wind - so a meadow the trees\' switch holds still is lit still',
    from: 'level ground\'s is the up the blade stood about\n',
    to: 'level ground\'s is the up the blade stood about\n'
      + '  if (uArt > 0.5) nrm = normalize(vec3(-mLean.y, 0.0, mLean.x) + 1.2 * gN);   // AUDIT MEADOW1: its own lean\n',
  }),
  Object.freeze({
    why: 'each card shaded by its own face - the side the eye sees - by the low-poly trees\' own face law, on the sun\'s light and the moon\'s: a low sun picks the facets out',
    from: 'vMoonLam = max(dot(nrm, normalize(uMoonDir)), 0.0);   // WIND4\n',
    to: 'vMoonLam = max(dot(nrm, normalize(uMoonDir)), 0.0);   // WIND4\n'
      + '  if (uArt > 0.5) {   // MEADOW1: THE CARD\'S FACE, as a low-poly tree\'s (render/renderer.js BB_VS): its light times a shade of\n'
      + '    // its face against the light, never under half - the blade\'s own lambert about the ground stays under it\n'
      + '    // AUDIT MEADOW1: by the light\'s HEIGHT - every card is upright, so the trees\' law alone took 0.28 off the whole\n'
      + '    // meadow at noon (a tree\'s up-turned faces take it whole); a light overhead lights the cards as their ground\n'
      + '    vec2 mN = vec2(-mDir.y, mDir.x); if (dot(mN, uEye.xz - root) < 0.0) mN = -mN;\n'
      + '    vec3 mSun = normalize(uSunDir), mMoon = normalize(uMoonDir);\n'
      + `    vLam *= mix(1.0, clamp(${glf(MEADOW_FACE.base)} + ${glf(MEADOW_FACE.span)} * dot(vec3(mN.x, 0.0, mN.y), mSun), ${glf(MEADOW_FACE.floor)}, 1.0), length(mSun.xz));\n`
      + `    vMoonLam *= mix(1.0, clamp(${glf(MEADOW_FACE.base)} + ${glf(MEADOW_FACE.span)} * dot(vec3(mN.x, 0.0, mN.y), mMoon), ${glf(MEADOW_FACE.floor)}, 1.0), length(mMoon.xz));\n`
      + '  }\n',
  }),
  ]);
}
export const GRASSMEADOW_VS_EDITS = meadowVsEdits(MEADOW_ART);
export const GRASSMEADOW_FS_EDITS = Object.freeze([
  Object.freeze({
    why: 'the switch, the ground the owner\'s colours were drawn for, and how much of its hue a set takes (BANTHA2: the meadow all, the jungle floor none - its own greens under the ground\'s light)',
    from: 'uniform vec3 uGrassTone[4];',
    to: 'uniform float uArt; uniform vec3 uArtGround; uniform float uArtHue;   // MEADOW1: the owner\'s art, and the ground its colours are drawn for (meadowArtGround); BANTHA2: its hue\'s share\n'
      + 'uniform vec3 uGrassTone[4];',
  }),
  Object.freeze({
    why: 'the sprite\'s own colour, kept from the sample',
    from: '  float t = vT; float pxTone = 0.0; float pxBlade = 0.0;\n',
    to: '  float t = vT; float pxTone = 0.0; float pxBlade = 0.0;\n'
      + '  vec3 art = vec3(0.0);   // MEADOW1: the owner\'s colour\n',
  }),
  Object.freeze({
    why: 'AUDIT MEADOW1: a card\'s mip level by its HEIGHT on screen - an upright card turned edge-on is squeezed across, and the GPU\'s level by the squeezed axis filled it to a solid needle',
    from: '    vec4 px = texture(uPxSheet, vec2((vVar + vUV.x) / uPxVariants, vUV.y));\n',
    to: '    vec2 pxUv = vec2((vVar + vUV.x) / uPxVariants, vUV.y);\n'
      + '    vec4 px;\n'
      + `    if (uArt > 0.5) { float mLod = log2(max(max(abs(dFdx(vUV.y)), abs(dFdy(vUV.y))) * ${glf(MEADOW_CELL)}, 1.0)); px = textureLod(uPxSheet, pxUv, mLod); }   // MEADOW1: the cell's texels down a pixel - the switch a uniform, so the derivatives stand in uniform control\n`
      + '    else px = texture(uPxSheet, pxUv);\n',
  }),
  Object.freeze({
    why: 'in the meadow the texel IS the colour, and the sward\'s shade climbs the card',
    from: 't = px.g; pxBlade = px.b;\n',
    to: 't = px.g; pxBlade = px.b;\n'
      + '    if (uArt > 0.5) { art = px.rgb; t = vUV.y; pxTone = 0.0; }   // MEADOW1: no tone, so no rim texel\n',
  }),
  Object.freeze({
    why: 'the owner\'s colours, moved by the ground they stand on - the tile\'s mean over the ground they are drawn for (his green at the lane\'s middle tone), per channel, held to a span; a texel takes that hue as far as it is green, and a petal or a dry stalk only its brightness',
    from: 'three flat tones, and the tuft\'s blades a shade apart\n',
    to: 'three flat tones, and the tuft\'s blades a shade apart\n'
      + `  if (uArt > 0.5) { vec3 mS = clamp(vGround / uArtGround, ${glf(MEADOW_SHIFT[0])}, ${glf(MEADOW_SHIFT[1])}); `
      + `c = art * mix(vec3(dot(mS, vec3(0.299, 0.587, 0.114))), mS, clamp((art.g - max(art.r, art.b)) * ${glf(MEADOW_GREEN_EDGE)}, 0.0, 1.0) * uArtHue); }   // MEADOW1: his green, the tile's own; his petals his own\n`,
  }),
  Object.freeze({
    why: 'AUDIT MEADOW1: no ramp in the meadow - its palette is the owner\'s own shading, and banding its light folded his shades a rung apart into one (and cost two pow a fragment)',
    from: '  if (uPixel > 0.5) { float l = max(dot(c, vec3(0.299, 0.587, 0.114)), 1e-4);',
    to: '  if (uPixel > 0.5 && uArt < 0.5) { float l = max(dot(c, vec3(0.299, 0.587, 0.114)), 1e-4);',
  }),
]);

// Edit order matters: later lists anchor on text the earlier ones wrote.
export const GAME_GRASS_VS = applyGrassEdits(applyGrassEdits(applyGrassEdits(applyGrassEdits(LAB_GRASS_VS, GRASSPX_VS_EDITS), GRASSFOG_VS_EDITS), GRASSLIT_VS_EDITS), GRASSMEADOW_VS_EDITS);
export const GAME_GRASS_FS = applyGrassEdits(applyGrassEdits(applyGrassEdits(applyGrassEdits(LAB_GRASS_FS, GRASSPX_FS_EDITS), GRASSFOG_FS_EDITS), GRASSLIT_FS_EDITS), GRASSMEADOW_FS_EDITS);
export const grassStagesOf = (art) => (art === MEADOW_ART ? { vs: GAME_GRASS_VS, fs: GAME_GRASS_FS }
  : { vs: applyGrassEdits(applyGrassEdits(applyGrassEdits(applyGrassEdits(LAB_GRASS_VS, GRASSPX_VS_EDITS), GRASSFOG_VS_EDITS), GRASSLIT_VS_EDITS), meadowVsEdits(art)), fs: GAME_GRASS_FS });

// JS copy of the fragment stage's color for the smooth style at rest, used by the light probe; keep them in step.
export function grassLit(ground, t, light, lane = false, adapt = 1, tones = null) {
  const ss = (a, b, x) => smoothstep(a, b, x);
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const [root, mid, tip] = (tones ?? (lane ? GRASS_TONES : GRASS_TONES_CLASSIC)).slice(0, 3).map((k) => ground.map((v, i) => v * k[i]));
  let c = mix(root, mid, ss(0, 0.55, t));
  c = mix(c, tip, ss(0.5, 1, t));
  const n = light.normal ?? [0, 1, 0];
  const lamOf = (d) => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return Math.max((n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / l, 0); };
  const lam = lamOf(light.sunDir);
  const moonLam = light.moonDir ? lamOf(light.moonDir) : 0;
  const dec = (v) => (lane ? elDecode(v) : v);
  const amb = GRASS_SWARD + (1 - GRASS_SWARD) * t;
  const pt = [0, 0, 0], at = light.root ?? [0, 0, 0];
  for (const p of light.points ?? []) {
    const L = [p.at[0] - at[0], p.at[1] - at[1], p.at[2] - at[2]], d = Math.hypot(L[0], L[1], L[2]);
    if (d >= p.range) continue;
    const a = lane ? elAttenuation(d, p.range) : (1 - d / p.range) ** 2;
    const k = a * Math.max((n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / Math.max(d, 1e-4), 0);
    for (let i = 0; i < 3; i++) pt[i] += k * dec(p.color[i]);
  }
  const lit = c.map((v, i) => dec(v) * (dec(light.amb[i]) * amb + dec(light.sunCol[i]) * light.sunScale * lam
    + dec(light.moonCol?.[i] ?? 1) * (light.moonScale ?? 0) * moonLam + pt[i]));
  return lane ? elTonemapRGB(lit.map((v) => v * EL_EXPOSURE * adapt)).map(elEncode) : lit;
}

/** @type {Readonly<{ density: number, height: number, range: number, span: number, densitySpan: number, seed: number }>} */
export const LAB_GRASS = Object.freeze({ density: 1200000, height: 38, range: 300, span: 315, densitySpan: 210, seed: 0x2f6e2b1 });

export function labWindSlider(w) {
  const mag = Math.hypot(w?.[0] ?? 0, w?.[1] ?? 0);
  return Math.min(200, mag * 6500);
}
export const LAB_DIM = Object.freeze({ sunny: 1.00, cloudy: 0.90, overcast: 0.72, fog: 0.66, rain: 0.60, thunder: 0.46, snow: 0.80, sandstorm: 0.55 });

export function placeLabGrass(opts) {
  const it = placeLabGrassSteps(opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

export const GRASS_CELL = 30;

// Injective while |cz| < 32768, which field coordinates under the floating origin never reach.
export const cellKey = (cx, cz) => cx * 65536 + cz;

const _discMemo = new Map();
let _discSweeps = 0;
export const discSweeps = () => _discSweeps;
// The sweep must be fine: the peak count sits where the eye lies exactly on a cell boundary.
export function discSlotCount(radius, cell = GRASS_CELL, steps = 240) {
  const key = `${radius},${cell},${steps}`;
  let n = _discMemo.get(key);
  if (n === undefined) { n = discSweep(radius, cell, steps); _discMemo.set(key, n); }
  return n;
}
function discSweep(radius, cell, steps) {
  _discSweeps++;
  const r2 = radius * radius;
  const axes = [];
  for (let i = 0; i < steps; i++) {
    const o = (i / steps) * cell;
    const d = [0];
    for (let k = 1; k * cell - o <= radius; k++) d.push(k * cell - o);
    for (let j = 0; o + j * cell <= radius; j++) d.push(o + j * cell);
    d.sort((p, q) => p - q);
    axes.push(d);
  }
  let max = 0;
  for (const dx of axes) {
    for (const dz of axes) {
      let n = 0, hi = dz.length - 1;
      for (const u of dx) {
        const t = r2 - u * u;
        if (t < 0) break;
        while (hi >= 0 && dz[hi] * dz[hi] > t) hi--;
        n += hi + 1;
      }
      if (n > max) max = n;
    }
  }
  return max;
}

export function grassCellSeed(cx, cz, seed = LAB_GRASS.seed) {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (cx * 0x85ebca6b | 0), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (cz * 0x27d4eb2f | 0), 0x165667b1) >>> 0;
  h ^= h >>> 15;
  return (h || 1) >>> 0;
}

export const GRASS_PACK_BYTES = 16;
// Slope codes are stored XOR GRASS_SLOPE_STEPS so a zero word (a pad blade or cleared slot) decodes as level.
// The rounding is dithered by blade index so a slope's quantizing shows as grain, not contour lines.
/**
 * @param {number} hn
 * @param {number} nx
 * @param {number} nz
 * @param {number} i
 * @returns {number}
 */
export function packHeightSlope(hn, nx, nz, i) {
  const top = 2 ** GRASS_HEIGHT_BITS - 1;
  const h = Math.max(0, Math.min(top, Math.round(hn * top)));
  if (!Number.isFinite(nx) || !Number.isFinite(nz)) nx = nz = 0;
  const l = Math.hypot(nx, nz), k = l > GRASS_SLOPE_SPAN ? GRASS_SLOPE_SPAN / l : 1;
  const q = (v, r) => Math.max(0, Math.min(2 * GRASS_SLOPE_STEPS, Math.round(GRASS_SLOPE_STEPS + v * k * GRASS_SLOPE_STEPS / GRASS_SLOPE_SPAN + r)));
  const dx = ((0.5 + i * 0.7548776662466927) % 1) - 0.5, dz = ((0.5 + i * 0.5698402909980532) % 1) - 0.5;
  return (h << 10) | ((q(nx, dx) ^ GRASS_SLOPE_STEPS) << 5) | (q(nz, dz) ^ GRASS_SLOPE_STEPS);
}
// JS copy of the vertex stage's decode.
export function unpackHeightSlope(w) {
  const top = 2 ** GRASS_HEIGHT_BITS - 1, step = GRASS_SLOPE_SPAN / GRASS_SLOPE_STEPS;
  return { hn: (w >> 10) / top, nx: ((((w >> 5) & 31) ^ GRASS_SLOPE_STEPS) - GRASS_SLOPE_STEPS) * step, nz: (((w & 31) ^ GRASS_SLOPE_STEPS) - GRASS_SLOPE_STEPS) * step };
}

export const LEAN_SPAN = 0.5;
export const WIDTH_MIN = 0.052;
export const WIDTH_SPAN = 0.055;
export const heightFloor = (height = LAB_GRASS.height) => 0.22 * (height / 34);
export const heightSpan = (height = LAB_GRASS.height) => 0.42 * (height / 34);

// Injective for |py| < 32768; the Daggerfall map is 1000 x 500 pixels.
export const pieceKey = (px, py) => px * 65536 + py;

// Pixel translations differ by whole multiples of TERRAIN_SIZE, so one floor finds the pixel under a point.
/**
 * @param {Array<{p:{px:number,py:number}, t:number[]}>} pieces
 * @param {number} size
 * @returns {(x:number, z:number) => object|null}
 */
export function pieceIndex(pieces, size) {
  if (!pieces.length) return () => null;
  const ref = pieces[0];
  const byKey = new Map();
  for (const piece of pieces) byKey.set(pieceKey(piece.p.px, piece.p.py), piece);
  return (x, z) => {
    const px = ref.p.px + Math.floor((x - ref.t[0]) / size);
    // z runs opposite to py: t[2] = -(py - origin) * size + c.
    const py = ref.p.py - Math.floor((z - ref.t[2]) / size);
    return byKey.get(pieceKey(px, py)) ?? null;
  };
}

// The rate uses the span the lab's density was measured over, never the live window, which would thin the field.
export const grassPerCell = (density = LAB_GRASS.density, span = LAB_GRASS.densitySpan, cell = GRASS_CELL) =>
  Math.max(1, Math.round(density * (cell * cell) / ((span * 2) * (span * 2))));

const fract = (v) => v - Math.floor(v);
// JS copies of the GLSL hash and vnoise, in doubles, so the patches match the GPU in shape but not bit for bit.
export function grassHash(x, z) {
  let px = fract(x * 123.34), pz = fract(z * 456.21);
  const d = px * (px + 45.32) + pz * (pz + 45.32);
  px += d; pz += d;
  return fract(px * pz);
}
export function grassVnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = grassHash(ix, iz), b = grassHash(ix + 1, iz), c = grassHash(ix, iz + 1), d = grassHash(ix + 1, iz + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
}
// Samples sit off the lattice corners because hash(0, 0) is exactly 0. Each octave inlines grassVnoise with the
// same operations in the same order, so it allocates nothing and gives the same result.
export function grassClump(x, z) {
  let sum = 0;
  for (let o = 0; o < 2; o++) {
    const vx = o === 0 ? x * 0.055 + 0.317 : x * 0.017 + 0.531, vz = o === 0 ? z * 0.055 + 0.713 : z * 0.017 + 0.279;
    const ix = Math.floor(vx), iz = Math.floor(vz);
    let fx = vx - ix, fz = vz - iz;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    let a = 0, b = 0, c = 0, d = 0;
    for (let k = 0; k < 4; k++) {
      let px = (ix + (k & 1)) * 123.34, pz = (iz + (k >> 1)) * 456.21;
      px -= Math.floor(px); pz -= Math.floor(pz);
      const dd = px * (px + 45.32) + pz * (pz + 45.32);
      px += dd; pz += dd;
      const pp = px * pz, h = pp - Math.floor(pp);
      if (k === 0) a = h; else if (k === 1) b = h; else if (k === 2) c = h; else d = h;
    }
    const v = (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
    sum = o === 0 ? v * 0.66 : sum + v * 0.34;
  }
  return sum;
}
export const bakedTint = (rnd, x, z) => Math.max(0, Math.min(1, rnd + (grassClump(x, z) - rnd) * 0.55));

export function placeLabGrassCell(cx, cz, opts) {
  const st = beginGrassCell(cx, cz, opts);
  stepGrassCell(st, st.perCell, opts);
  return { inst: st.inst, inst2: st.inst2, rootY: st.rootY, ground: st.ground, slope: st.slope, count: st.count, perCell: st.perCell };
}

// A cell can be placed in slices: the only state between candidates is the xorshift word, the index, and the count.
// Reused arrays are zeroed first, so a reused cell holds the same bytes as a new one.
export function beginGrassCell(cx, cz, { perCell, seed = LAB_GRASS.seed, cell = GRASS_CELL, originX = 0, originZ = 0, reuse = null }) {
  const again = reuse && reuse.perCell === perCell;
  if (again) { reuse.inst.fill(0); reuse.inst2.fill(0); reuse.rootY.fill(0); reuse.ground.fill(0); reuse.slope.fill(0); }
  return {
    cx, cz, cell, originX, originZ, perCell,
    s: grassCellSeed(cx, cz, seed),
    i: 0,
    n: 0,
    count: 0,
    inst: again ? reuse.inst : new Float32Array(perCell * 4), inst2: again ? reuse.inst2 : new Float32Array(perCell * 4),
    rootY: again ? reuse.rootY : new Float32Array(perCell), ground: again ? reuse.ground : new Float32Array(perCell * 3),
    slope: again ? reuse.slope : new Float32Array(perCell * 2),
  };
}

// The xorshift word lives in a typed array because a closure-captured `let` boxes it on every step.
// Sharing it is safe because the placer runs one slice at a time, synchronously.
const _xs = new Uint32Array(1);
export function stepGrassCell(st, budget, { keep, ground = null, slope = null, height = LAB_GRASS.height }) {
  const { inst, inst2, rootY, cell, originX, originZ } = st;
  const groundCol = st.ground;
  _xs[0] = st.s;
  const rnd = () => { let s = _xs[0]; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; _xs[0] = s; return s / 4294967296; };
  const ox = st.cx * cell, oz = st.cz * cell;
  let n = st.n;
  const end = Math.min(st.perCell, st.i + budget);
  for (let i = st.i; i < end; i++) {
    const px = rnd() * cell, pz = rnd() * cell;
    const a = rnd() * 6.283, rr = rnd() * rnd() * 0.55;
    const fx = ox + px + Math.cos(a) * rr, fz = oz + pz + Math.sin(a) * rr;
    const x = fx + originX, z = fz + originZ;
    const h = (0.22 + rnd() * 0.42) * (height / 34);
    const phase = rnd() * 6.283;
    const lx = (rnd() - 0.5) * 0.5, lz = (rnd() - 0.5) * 0.5;
    // Draws stay in the lab's order, so the tint is drawn even for a candidate keep() rejects.
    const tRnd = rnd();
    const w = 0.052 + rnd() * 0.055;
    const y = keep(x, z);
    if (y === null || y === undefined) continue;
    // The patch is sampled in the field's frame, so a floating-origin shift does not move it.
    const tint = bakedTint(tRnd, fx, fz);
    inst[n * 4] = x; inst[n * 4 + 1] = z; inst[n * 4 + 2] = h; inst[n * 4 + 3] = phase;
    inst2[n * 4] = lx; inst2[n * 4 + 1] = lz; inst2[n * 4 + 2] = tint; inst2[n * 4 + 3] = w;
    rootY[n] = y;
    const gc = ground ? ground(x, z) : null;
    groundCol[n * 3] = gc ? gc[0] : 0.10; groundCol[n * 3 + 1] = gc ? gc[1] : 0.145; groundCol[n * 3 + 2] = gc ? gc[2] : 0.065;
    const gn = slope ? slope(x, z) : null;
    st.slope[n * 2] = gn ? gn[0] : 0; st.slope[n * 2 + 1] = gn ? gn[2] : 0;
    n++;
  }
  st.s = _xs[0]; st.i = end; st.n = n; st.count = n;
  return end >= st.perCell;
}

export const GRASS_SLICE = 1500;
// Matches the shader's fade start, smoothstep(uRange * 0.55, uRange, d): inside it every blade of a cell draws.
export const GRASS_WHOLE_AT = 0.55;
export const GRASS_DUE_AT = 0.9;
export const GRASS_FRAME_MS = 3;
export const GRASS_FRAME_SHARE = GRASS_FRAME_MS * 60 / 1000;
export const GRASS_FRAME_GAP_MS = 50;
export const GRASS_STEP = 250;

/**
 * @param {LabGrassRenderer} renderer
 * @param {{ keep: (x: number, z: number) => number | null | undefined, ground?: any, slope?: any, span?: number, density?: number,
 *   height?: number, seed?: number, cell?: number, range?: number, perFrame?: number, slots?: number, frameMs?: number, clock?: () => number }} o
 */
export function createGrassField(renderer, { keep, ground = null, slope = null, span = LAB_GRASS.span, density = LAB_GRASS.density, height = LAB_GRASS.height, seed = LAB_GRASS.seed, cell = GRASS_CELL, range = LAB_GRASS.range, perFrame = 2, slots: slotsOverride = 0, frameMs = GRASS_FRAME_MS, clock = () => performance.now() }) {
  const perCell = grassPerCell(density);
  const slots = slotsOverride > 0 ? slotsOverride : discSlotCount(span, cell);
  renderer.allocSlots(perCell, slots, cell, height);
  const live = new Map();
  const free = [];
  for (let i = 0; i < slots; i++) free.push(i);
  // Where field cell (0, 0) sits in the scene; it moves with each origin shift, so keys and seeds never change.
  let gx = 0, gz = 0;
  let pending = null;
  let lastX = NaN, lastZ = NaN, lastT = NaN;
  // A renderer keeps no part of a cell after writeSlot, so these arrays are free to reuse once written.
  let wholeSpare = null, rimSpare = null;
  // Nearest-point distance, the test the draw culls by, so no cell is placed that cannot be drawn.
  const nearSq = (cx, cz, ex, ez) => {
    const dx = Math.max(cx * cell + gx - ex, 0, ex - ((cx + 1) * cell + gx));
    const dz = Math.max(cz * cell + gz - ez, 0, ez - ((cz + 1) * cell + gz));
    return dx * dx + dz * dz;
  };
  return {
    perCell, slots, live,
    shiftOrigin(offset) {
      gx += offset[0]; gz += offset[2];
      lastX += offset[0]; lastZ += offset[2];
      renderer.shiftSlots(offset);
      // A half-placed cell holds positions in the old frame, so it starts again.
      pending = null;
    },
    get pending() { return pending; },
    // Placed cells never rebuild while in range. A terrain change under them, such as a location's height blend,
    // must invalidate the area so the next update reads keep() and ground() again.
    invalidate(x0, z0, x1, z1) {
      const cx0 = Math.floor((x0 - gx) / cell), cx1 = Math.floor((x1 - gx) / cell);
      const cz0 = Math.floor((z0 - gz) / cell), cz1 = Math.floor((z1 - gz) / cell);
      if (pending && pending.cx >= cx0 && pending.cx <= cx1 && pending.cz >= cz0 && pending.cz <= cz1) pending = null;
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        const key = cellKey(cx, cz);
        const held = live.get(key);
        if (!held) continue;
        renderer.clearSlot(held.slot);
        live.delete(key);
        free.push(held.slot);
      }
    },
    update(ex, ez, keepNow = keep, groundNow = ground, slopeNow = slope) {
      // Cells fill inside `range` and free only past `span`, so a rim cell does not churn while the eye is still.
      const keepR2 = span * span;
      const fillR2 = range * range;
      const k = Math.ceil(range / cell) + 1;
      const ecx = Math.floor((ex - gx) / cell), ecz = Math.floor((ez - gz) / cell);
      for (const [key, held] of live) {
        if (nearSq(held.cx, held.cz, ex, ez) > keepR2) { renderer.clearSlot(held.slot); live.delete(key); free.push(held.slot); }
      }
      if (pending && nearSq(pending.cx, pending.cz, ex, ez) > fillR2) pending = null;
      const ux = Number.isFinite(lastX) ? ex - lastX : 0, uz = Number.isFinite(lastZ) ? ez - lastZ : 0;
      const step = Math.hypot(ux, uz);
      lastX = ex; lastZ = ez;
      const wholeR = range * GRASS_WHOLE_AT, dueR = range * GRASS_DUE_AT;
      const wholeR2 = wholeR * wholeR, dueR2 = dueR * dueR;
      if (pending && nearSq(pending.cx, pending.cz, ex, ez) <= wholeR2) pending = null;
      const behind = (cx, cz, d2) => (d2 > wholeR2 && (Math.min(Math.max(ex, cx * cell + gx), (cx + 1) * cell + gx) - ex) * ux
        + (Math.min(Math.max(ez, cz * cell + gz), (cz + 1) * cell + gz) - ez) * uz < 0 ? 1 : 0);
      const dueIn = (d2, back) => { const d = Math.sqrt(d2); return d <= dueR ? 0 : back ? Infinity : (d - dueR) / step; };
      /** @type {{ d:number, cx:number, cz:number, key:number, back:number }[]} */
      const want = [];
      for (let cz = ecz - k; cz <= ecz + k; cz++) for (let cx = ecx - k; cx <= ecx + k; cx++) {
        const d = nearSq(cx, cz, ex, ez);
        if (d > fillR2) continue;
        const key = cellKey(cx, cz);
        if (!live.has(key) && key !== pending?.key) want.push({ d, cx, cz, key, back: behind(cx, cz, d) });
      }
      want.sort((a, b) => a.back - b.back || a.d - b.d);
      const missing = want.length + (pending ? 1 : 0);
      // The nearest waiting cell may take the farthest live cell's slot, so a wrong slot bound never leaves a hole.
      const slotFor = (d, take) => {
        if (free.length) return take ? free.pop() : free[free.length - 1];
        let far = null, farKey = 0, farD = d;
        for (const [k, held] of live) {
          const hd = nearSq(held.cx, held.cz, ex, ez);
          if (hd > farD) { farD = hd; far = held; farKey = k; }
        }
        if (!far) return undefined;
        if (take) { renderer.clearSlot(far.slot); live.delete(farKey); }
        return far.slot;
      };
      const t0 = clock();
      const gap = Number.isFinite(lastT) ? Math.min(t0 - lastT, GRASS_FRAME_GAP_MS) : 0;
      lastT = t0;
      const budgetMs = Math.max(frameMs, gap * GRASS_FRAME_SHARE);
      let budget = perFrame, wholeMs = 0;
      const write = ({ key, cx, cz }, slot, placed) => {
        budget--;
        renderer.writeSlot(slot, placed);
        live.set(key, { slot, cx, cz });
      };
      for (const item of want) {
        if (item.d > wholeR2 || budget <= 0) break;
        if (budget < perFrame && clock() - t0 + wholeMs > budgetMs) break;
        const slot = slotFor(item.d, true);
        if (slot === undefined) return missing;
        const s = clock();
        wholeSpare = placeLabGrassCell(item.cx, item.cz, { keep: keepNow, ground: groundNow, slope: slopeNow, perCell, height, seed, cell, originX: gx, originZ: gz, reuse: wholeSpare });
        write(item, slot, wholeSpare);
        wholeMs = clock() - s;
      }
      // Rim cells are paced by the eye's approach, and each has a deadline in frames. The pace is the least that
      // meets every deadline, and cells already due take the frame's remaining time after it.
      const ask = { keep: keepNow, ground: groundNow, slope: slopeNow, height };
      const late = want.filter((w) => w.d > wholeR2 && w.d <= dueR2 && !w.back);
      const rim = want.filter((w) => w.d > dueR2 || (w.d > wholeR2 && w.back));
      let owed = 0, need = 0, now = late.length > 0;
      const owe = (d2, back, n) => { owed += n; const due = dueIn(d2, back); if (due === 0) now = true; else need = Math.max(need, owed / Math.ceil(due)); };
      if (pending) { const pd = nearSq(pending.cx, pending.cz, ex, ez); owe(pd, behind(pending.cx, pending.cz, pd), perCell - pending.st.i); }
      for (const w of rim) owe(w.d, w.back, perCell);
      let head = 0;
      for (let o = pending ? perCell - pending.st.i : 0; head < rim.length && o < need; head++) o += perCell;
      rim.splice(head, 0, ...late);
      let cur = pending, ri = 0, done = 0, first = budget === perFrame, paced = 0;
      pending = null;
      while (budget > 0) {
        if (!first && done >= need && !(now && clock() - t0 - paced < budgetMs)) break;
        if (!cur) {
          if (ri >= rim.length || slotFor(rim[ri].d, false) === undefined) break;
          const w = rim[ri++];
          rimSpare = beginGrassCell(w.cx, w.cz, { perCell, seed, cell, originX: gx, originZ: gz, reuse: rimSpare });
          cur = { ...w, st: rimSpare };
        }
        const st = cur.st, i0 = st.i;
        const timed = now && !first && done < need, s = timed ? clock() : 0;
        const finished = stepGrassCell(st, first ? GRASS_SLICE : now ? GRASS_STEP : Math.min(GRASS_STEP, Math.ceil(need - done)), ask);
        first = false;
        done += st.i - i0;
        if (timed) paced += clock() - s;
        if (!finished) continue;
        const slot = slotFor(nearSq(cur.cx, cur.cz, ex, ez), true);
        if (slot === undefined) { cur = null; break; }
        write(cur, slot, st);
        cur = null;
      }
      pending = cur;
      return missing;
    },
  };
}

export function* placeLabGrassSteps({ centre, keep, ground = null, density = LAB_GRASS.density, height = LAB_GRASS.height, span = LAB_GRASS.span, seed = LAB_GRASS.seed, step = 60000 }) {
  const N = density | 0;
  const inst = new Float32Array(N * 4); const inst2 = new Float32Array(N * 4); const rootY = new Float32Array(N);
  const groundCol = new Float32Array(N * 3);
  let s = seed >>> 0;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  let n = 0;
  for (let i = 0; i < N; i++) {
    const cx = (rnd() - 0.5) * span * 2, cz = (rnd() - 0.5) * span * 2;
    const a = rnd() * 6.283, rr = rnd() * rnd() * 0.55;
    const x = centre[0] + cx + Math.cos(a) * rr, z = centre[1] + cz + Math.sin(a) * rr;
    const h = (0.22 + rnd() * 0.42) * (height / 34);
    const phase = rnd() * 6.283;
    const lx = (rnd() - 0.5) * 0.5, lz = (rnd() - 0.5) * 0.5;
    const tRnd = rnd();
    const w = 0.052 + rnd() * 0.055;
    const y = keep(x, z);
    if (y !== null && y !== undefined) {
      const tint = bakedTint(tRnd, x, z);
      inst[n * 4] = x; inst[n * 4 + 1] = z; inst[n * 4 + 2] = h; inst[n * 4 + 3] = phase;
      inst2[n * 4] = lx; inst2[n * 4 + 1] = lz; inst2[n * 4 + 2] = tint; inst2[n * 4 + 3] = w;
      rootY[n] = y;
      const gc = ground ? ground(x, z) : null;
      groundCol[n * 3] = gc ? gc[0] : 0.10; groundCol[n * 3 + 1] = gc ? gc[1] : 0.145; groundCol[n * 3 + 2] = gc ? gc[2] : 0.065;
      n++;
    }
    if ((i + 1) % step === 0) yield null;
  }
  return { inst: inst.subarray(0, n * 4), inst2: inst2.subarray(0, n * 4), rootY: rootY.subarray(0, n),
    ground: groundCol.subarray(0, n * 3), count: n };
}

export function labBladeCorners(segments = 5) {
  const corners = [];
  for (let seg = 0; seg < segments; seg++) {
    const a = seg / segments, b = (seg + 1) / segments;
    corners.push(0, a, 1, a, 1, b, 0, a, 1, b, 0, b);
  }
  return new Float32Array(corners);
}

// Rotates each triangle to start on its last corner, keeping the winding, so the corner that provokes under GL's
// last-vertex convention also provokes under the first-vertex one.
export function provokeFirst(indices) {
  const out = new Uint16Array(indices.length);
  for (let t = 0; t + 2 < indices.length; t += 3) { out[t] = indices[t + 2]; out[t + 1] = indices[t]; out[t + 2] = indices[t + 1]; }
  return out;
}

export const GRASS_FAR_SEGMENTS = 1;
export const GRASS_FAR_AT = 0.5;

export const GRASS_MEAN_SAMPLES = 65536;
// Past the cap the step is odd, so no power-of-two period in the texels lines up with it.
export const grassMeanStep = (n) => Math.max(1, Math.ceil(n / GRASS_MEAN_SAMPLES)) | 1;
function meanRgb(l) {
  let r = 0, g = 0, b = 0, m = 0;
  const n = l.width * l.height;
  const step = grassMeanStep(n);
  for (let k = 0; k < n; k += step) { r += l.colors[k * 4]; g += l.colors[k * 4 + 1]; b += l.colors[k * 4 + 2]; m++; }
  return [r / m, g / m, b / m];
}

export function tileMeanColour(l) {
  if (!(l.width * l.height)) return [0.10, 0.145, 0.065];
  const m = meanRgb(l);
  return [m[0] / 255, m[1] / 255, m[2] / 255];
}

// A record is grass when more than half its texels are nearest a green-dominant base; in winter no base is green.
export function grassRecordsOf(layers, { roadRecords = new Set([46, 47, 55]) } = {}) {
  if (!layers || layers.length < 4) return new Set();
  const means = [0, 1, 2, 3].map((i) => meanRgb(layers[i]));
  const isGrass = (m) => m[1] >= m[0] && m[1] > m[2] * 1.1 && !(m[2] > m[0] * 1.25 && m[2] > m[1] * 1.1);
  const grassBase = means.map(isGrass);
  if (!grassBase.some(Boolean)) return new Set();
  const out = new Set();
  for (let rec = 0; rec < layers.length; rec++) {
    if (roadRecords.has(rec)) continue;
    const l = layers[rec]; const n = l.width * l.height; let g = 0;
    for (let k = 0; k < n; k++) {
      const r = l.colors[k * 4], gg = l.colors[k * 4 + 1], b = l.colors[k * 4 + 2];
      let best = 0, bd = Infinity;
      for (let i = 0; i < 4; i++) { const d = (r - means[i][0]) ** 2 + (gg - means[i][1]) ** 2 + (b - means[i][2]) ** 2; if (d < bd) { bd = d; best = i; } }
      if (grassBase[best] && bd < 42 * 42) g++;
    }
    if (g / n > 0.5) out.add(rec);
  }
  return out;
}

// The jungle floor takes tile bases by place (1 dirt, 2 grass), not by color: the swamp archive's grass is an olive
// mud and its stone a green moss.
export function floorRecordsOf(layers, { roadRecords = new Set([46, 47, 55]) } = {}) {
  if (!layers || layers.length < 4) return new Set();
  const means = [0, 1, 2, 3].map((i) => meanRgb(layers[i]));
  const out = new Set([1, 2]);
  for (let rec = 4; rec < layers.length; rec++) {
    if (roadRecords.has(rec)) continue;
    const l = layers[rec]; const n = l.width * l.height; let g = 0;
    for (let k = 0; k < n; k++) {
      const r = l.colors[k * 4], gg = l.colors[k * 4 + 1], b = l.colors[k * 4 + 2];
      let best = 0, bd = Infinity;
      for (let i = 0; i < 4; i++) { const d = (r - means[i][0]) ** 2 + (gg - means[i][1]) ** 2 + (b - means[i][2]) ** 2; if (d < bd) { bd = d; best = i; } }
      if ((best === 1 || best === 2) && bd < 42 * 42) g++;
    }
    if (g / n > 0.5) out.add(rec);
  }
  return out;
}

export class LabGrassRenderer {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {{ art?: GrassArt, stages?: { vs: string, fs: string }, tuft?: { w: number, h: number } | null, provoke?: boolean }} [o]
   */
  constructor(gl, { art = MEADOW_ART, stages = grassStagesOf(art), tuft = null, provoke = true } = {}) {
    this.gl = gl;
    const prog = buildProgram(gl, LAB_GRASS_HEAD + GAME_GRASS_FIELD + stages.vs, LAB_GRASS_HEAD + stages.fs);
    this.program = prog;
    this.u = {};
    for (const n of ['uVP', 'uTime', 'uWind', 'uRange', 'uEye', 'uSunDir', 'uWindDir', 'uSnowFull', 'uSlotN', 'uCellFrame', 'uBladeScale', 'uCellSize', 'uGField', 'uGFieldOrigin', 'uGFieldM', 'uSnowGlobal', 'uWindV', 'uAmb', 'uSunCol', 'uDim', 'uSunScale', 'uMoonDir', 'uMoonScale', 'uMoonCol',
      'uPixel', 'uPxVariants', 'uPxSteps', 'uPxTintBands', 'uPxSheet',
      'uArt', 'uArtGround', 'uArtHue',
      'uFogColor', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uDwFog', 'uJungleHaze',
      'uLane', 'uELExposure', 'uAdapt', 'uIndirect', 'uIndirectColor', 'uCloudShadowMap', 'uCloudShadowRect', 'uGrassTone',
      'uPointCount', 'uPointLights', 'uPointColors', 'uPointIdx']) this.u[n] = gl.getUniformLocation(prog, n);
    const ul = (n) => gl.getUniformLocation(prog, n);
    this.shadowLoc = {
      sunShadow: ul('uSunShadow'), sunVP: ul('uSunVP'), sunParams: ul('uSunShadowParams'), sunTexel: ul('uSunTexel'), sunOrigin: ul('uSunOrigin'),
      pointShadow: ul('uPointShadow'), pointParams: ul('uPointShadowParams'), shadowIndex: ul('uShadowIndex'), casterOf: ul('uCasterOf'), pointShadowLo: ul('uPointShadowLo'),
    };
    this._dec = { amb: new Float32Array(3), sun: new Float32Array(3), moon: new Float32Array(3), near: new Float32Array(3), points: new Float32Array(GRASS_MAX_LIGHTS * 3) };
    this.tones = new Float32Array(GRASS_TONES.flat());
    this.tonesClassic = new Float32Array(GRASS_TONES_CLASSIC.flat());
    this.art = art;
    this.artGround = new Float32Array(meadowArtGround(GRASS_TONES[1], art.green));
    this.artGroundClassic = new Float32Array(meadowArtGround(GRASS_TONES_CLASSIC[1], art.green));
    this._cellIdx = new Int32Array(GRASS_CELL_LIGHTS); this._cellDist = new Float64Array(GRASS_CELL_LIGHTS);
    this._cellLast = new Int32Array(GRASS_CELL_LIGHTS); this._cellN = -1; this._pn = 0; this._pts = null;
    this.bufs = [1, 2, 4].map(() => gl.createBuffer());
    for (const b of this.bufs) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, 4, gl.DYNAMIC_DRAW); }
    this._lanes = Object.freeze([
      Object.freeze({ loc: 1, type: gl.UNSIGNED_SHORT, bytes: 8 }),
      Object.freeze({ loc: 2, type: gl.UNSIGNED_BYTE, bytes: 4 }),
      Object.freeze({ loc: 4, type: gl.UNSIGNED_BYTE, bytes: 4 }),
    ]);
    // ANGLE on Direct3D emulates GL's last-vertex convention for flat varyings with a geometry shader, so the field
    // takes the native first-vertex convention when WEBGL_provoking_vertex exists.
    this._pv = provoke ? (gl.getExtension('WEBGL_provoking_vertex') ?? null) : null;
    const first = !!this._pv;
    const buildVao = (corners, cardIndices = null) => {
      const cards = !!cardIndices;
      const n = cards ? 0 : corners.length / 2;
      const indices = cards ? (first ? provokeFirst(cardIndices) : cardIndices) : (first ? provokeFirst(Uint16Array.from({ length: n }, (_, i) => i)) : null);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb);
      gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
      const stride = cards ? 12 : 0;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
      if (cards) { gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 8); }
      const ib = indices ? gl.createBuffer() : null;
      if (ib) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW); }
      for (let k = 0; k < this._lanes.length; k++) {
        const L = this._lanes[k];
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[k]);
        gl.enableVertexAttribArray(L.loc); gl.vertexAttribPointer(L.loc, 4, L.type, true, 0, 0);
        gl.vertexAttribDivisor(L.loc, 1);
      }
      gl.bindVertexArray(null);
      return { vao, verts: cards ? new Set(cardIndices).size : n, count: cards ? cardIndices.length : n, cb, ib };
    };
    const near = buildVao(labBladeCorners(5)), far = buildVao(labBladeCorners(GRASS_FAR_SEGMENTS));
    const cards = buildVao(meadowCardCorners(MEADOW_CARDS), meadowCardIndices(MEADOW_CARDS));
    const cardsFar = buildVao(meadowCardCorners(MEADOW_CARDS_FAR, MEADOW_CARDS), meadowCardIndices(MEADOW_CARDS_FAR));
    this.vao = near.vao; this.verts = near.verts;
    this.vaoFar = far.vao; this.vertsFar = far.verts;
    this.vaoCards = cards.vao; this.vertsCards = cards.verts; this.countCards = cards.count;
    this.vaoCardsFar = cardsFar.vao; this.vertsCardsFar = cardsFar.verts; this.countCardsFar = cardsFar.count;
    this._cornerBufs = [near.cb, far.cb, cards.cb, cardsFar.cb, cards.ib, cardsFar.ib, near.ib, far.ib].filter((b) => b !== null);
    gl.bindVertexArray(null);
    // A 1x1 zero field makes the shader's snow and wet terms exactly zero.
    this.zeroField = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.zeroField);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const mips = buildTuftMips(tuft ? buildTuftSheet({ w: tuft.w, h: tuft.h }) : undefined);
    this.pxVariants = mips[0].variants;
    this.pxSheet = this._sheet(mips);
    this.meadowSheet = this._sheet(art.mips());
    this.count = 0;
    this._vp = new Float32Array(16);
    this._planes = new Float32Array(24);
    this._cardBox = new Float64Array(6);
    this._cardReach = art.reach;
    this.slotBox = null;
    this.slotCount = null;
    this.drawn = { slots: 0, blades: 0, kept: 0 };
  }

  setTones(tones, classic = false) {
    this[classic ? 'tonesClassic' : 'tones'] = new Float32Array(tones.flat());
    this[classic ? 'artGroundClassic' : 'artGround'] = new Float32Array(meadowArtGround(tones[1], this.art.green));
  }

  // Every mip level is uploaded by hand: generateMipmap would average the sprite and fail the alpha test.
  _sheet(mips) {
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (let i = 0; i < mips.length; i++) gl.texImage2D(gl.TEXTURE_2D, i, gl.RGBA, mips[i].width, mips[i].height, 0, gl.RGBA, gl.UNSIGNED_BYTE, mips[i].data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  allocSlots(perCell, slots, cell = GRASS_CELL, height = LAB_GRASS.height) {
    const gl = this.gl;
    this.perCell = perCell; this.slots = slots;
    this.cellSize = cell; this.height = height;
    const sizes = [slots * perCell * 8, slots * perCell * 4, slots * perCell * 4];
    for (let i = 0; i < 3; i++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[i]);
      gl.bufferData(gl.ARRAY_BUFFER, sizes[i], gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.count = slots * perCell;
    this.slotBox = new Array(slots).fill(null);
    this.slotCount = new Int32Array(slots);
    this.slotFrame = new Float64Array(slots * 4);
    this.slotSpan = new Float32Array(slots);
    this.slotCardH = new Float64Array(slots);
    this.slotCardRise = new Float64Array(slots);
    this.slotCardTilt = new Float64Array(slots);
    this._packA = new Uint16Array(perCell * 4);
    this._packB = new Uint8Array(perCell * 4);
    this._packC = new Uint8Array(perCell * 4);
    this._packs = [this._packA, this._packB, this._packC];
  }

  writeSlot(slot, placed) {
    const gl = this.gl; const p = this.perCell;
    let x0 = Infinity, z0 = Infinity, y0 = Infinity, x1 = -Infinity, z1 = -Infinity, y1 = -Infinity;
    const n = Math.min(placed.count ?? p, p);
    for (let i = 0; i < n; i++) {
      const x = placed.inst[i * 4], z = placed.inst[i * 4 + 1], h = placed.inst[i * 4 + 2], y = placed.rootY[i];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      if (y < y0) y0 = y; if (y + h > y1) y1 = y + h;
    }
    if (this.slotBox) this.slotBox[slot] = n > 0 ? [x0, y0, z0, x1, y1, z1] : null;
    if (this.slotCount) this.slotCount[slot] = n;

    // The decode frame is the blades' own bounds, not the cell's: clustering can put a blade past the cell edge.
    const xSpan = n > 0 ? Math.max(1e-3, Math.max(x1 - x0, z1 - z0)) : 1;
    const ox = n > 0 ? x0 : 0;
    const oz = n > 0 ? z0 : 0;
    const yBase = n > 0 ? y0 : 0;
    const ySpan = n > 0 ? Math.max(1e-3, y1 - y0) : 1;
    if (this.slotFrame) this.slotFrame.set([ox, oz, yBase, ySpan], slot * 4);
    if (this.slotSpan) this.slotSpan[slot] = xSpan;
    const hFloor = heightFloor(this.height), hSpan = Math.max(1e-6, heightSpan(this.height));
    const A = this._packA, B = this._packB, C = this._packC;
    const u16 = (v) => Math.max(0, Math.min(65535, Math.round(v * 65535)));
    const u8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    const tufts = Math.ceil(n / MEADOW_BLADES_PER_TUFT), hTop = 2 ** GRASS_HEIGHT_BITS - 1, slopeStep = GRASS_SLOPE_SPAN / GRASS_SLOPE_STEPS;
    let cardH = 0, cardTop = -Infinity, cardTilt = 0;
    const artTop = this.art.top;
    for (let i = 0; i < n; i++) {
      const x = placed.inst[i * 4], z = placed.inst[i * 4 + 1], h = placed.inst[i * 4 + 2], ph = placed.inst[i * 4 + 3];
      A[i * 4] = u16((x - ox) / xSpan);
      A[i * 4 + 1] = u16((z - oz) / xSpan);
      A[i * 4 + 2] = u16((placed.rootY[i] - yBase) / ySpan);
      A[i * 4 + 3] = packHeightSlope((h - hFloor) / hSpan, placed.slope ? placed.slope[i * 2] : 0, placed.slope ? placed.slope[i * 2 + 1] : 0, i);
      if (i < tufts) {
        const hd = hFloor + (A[i * 4 + 3] >> 10) / hTop * hSpan;
        if (hd > cardH) cardH = hd;
        if (placed.rootY[i] + hd * artTop > cardTop) cardTop = placed.rootY[i] + hd * artTop;
        const w = A[i * 4 + 3];
        const gx = ((((w >> 5) & 31) ^ GRASS_SLOPE_STEPS) - GRASS_SLOPE_STEPS) * slopeStep, gz = (((w & 31) ^ GRASS_SLOPE_STEPS) - GRASS_SLOPE_STEPS) * slopeStep;
        const tilt = Math.hypot(gx, gz) / Math.max(Math.sqrt(Math.max(1 - gx * gx - gz * gz, 0)), MEADOW_SLOPE_FLOOR);
        if (tilt > cardTilt) cardTilt = tilt;
      }
      B[i * 4] = u8((placed.inst2[i * 4] + LEAN_SPAN / 2) / LEAN_SPAN);
      B[i * 4 + 1] = u8((placed.inst2[i * 4 + 1] + LEAN_SPAN / 2) / LEAN_SPAN);
      B[i * 4 + 2] = u8(placed.inst2[i * 4 + 2]);
      B[i * 4 + 3] = u8((placed.inst2[i * 4 + 3] - WIDTH_MIN) / WIDTH_SPAN);
      C[i * 4] = u8(placed.ground[i * 3]);
      C[i * 4 + 1] = u8(placed.ground[i * 3 + 1]);
      C[i * 4 + 2] = u8(placed.ground[i * 3 + 2]);
      C[i * 4 + 3] = u8(ph / 6.283185307179586);
    }
    if (this.slotCardH) { this.slotCardH[slot] = cardH; this.slotCardRise[slot] = n > 0 ? Math.max(0, cardTop - y1) : 0; this.slotCardTilt[slot] = cardTilt; }
    // Only placed blades are uploaded: the draw never reads past slotCount, so the pad needs no bytes.
    if (n > 0) {
      for (let k = 0; k < this._lanes.length; k++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[k]);
        gl.bufferSubData(gl.ARRAY_BUFFER, slot * p * this._lanes[k].bytes, this._packs[k], 0, n * 4);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
  }

  shiftSlots(offset) {
    if (!this.slotFrame) return;
    const dx = offset[0], dy = offset[1], dz = offset[2];
    const F = this.slotFrame;
    for (let s = 0; s < this.slots; s++) {
      F[s * 4] += dx; F[s * 4 + 1] += dz; F[s * 4 + 2] += dy;
      const b = this.slotBox[s];
      if (b) { b[0] += dx; b[1] += dy; b[2] += dz; b[3] += dx; b[4] += dy; b[5] += dz; }
    }
  }

  clearSlot(slot) {
    if (this.slotBox) this.slotBox[slot] = null;
    if (this.slotCount) this.slotCount[slot] = 0;
  }

  draw(proj, view, eye, timeSeconds, light, wind, range = LAB_GRASS.range, style = 'smooth') {
    this.frame = [proj, view, eye, timeSeconds, light, wind, range];
    if (!this.count || !this.slotBox) return;
    const gl = this.gl; const u = this.u;
    const o = this._vp;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = proj[r] * view[c * 4] + proj[4 + r] * view[c * 4 + 1] + proj[8 + r] * view[c * 4 + 2] + proj[12 + r] * view[c * 4 + 3];
    gl.useProgram(this.program);
    const pixel = pixelGrass(style);
    if (!pixel) gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // A blade is one quad seen from both sides, so culling is off for the field and restored after.
    const culled = gl.isEnabled(gl.CULL_FACE);
    if (culled) gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(u.uVP, false, o);
    gl.uniform1f(u.uTime, timeSeconds);
    gl.uniform1f(u.uWind, wind.speed);
    gl.uniform2f(u.uWindDir, wind.dir[0], wind.dir[1]);
    gl.uniform2f(u.uGFieldOrigin, 0, 0);
    gl.uniform1f(u.uGFieldM, 1);
    gl.uniform1f(u.uSnowGlobal, 0);
    gl.uniform1f(u.uSnowFull, 1.1);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.zeroField);
    gl.uniform1i(u.uGField, 3);
    gl.activeTexture(gl.TEXTURE0);
    const windV = wind.sway === false ? NO_WIND : wind.windV;
    gl.uniform2f(u.uWindV, windV[0], windV[1]);
    gl.uniform1f(u.uRange, range);
    gl.uniform1f(u.uPixel, pixel ? 1 : 0);
    const meadow = meadowGrass(style);
    gl.uniform1f(u.uArt, meadow ? 1 : 0);
    this._cardReach = this.art.reach + this.art.windReach * Math.hypot(windV[0], windV[1]);
    this._oneQuad = pixel;
    this._meadow = meadow;
    // These go up in every style: a zero step count divides by zero in the pixel arm, and mix(a, NaN, 0.0) is NaN.
    gl.uniform1f(u.uPxVariants, meadow ? MEADOW_SLOTS : this.pxVariants);
    gl.uniform1f(u.uPxSteps, PX_RAMP_STEPS);
    gl.uniform1f(u.uPxTintBands, PX_TINT_BANDS);
    // The smooth style samples the sheet too, so its sampler stays on unit 4: on unit 0 a bound frame image
    // would be a feedback loop.
    if (pixel) {
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, meadow ? this.meadowSheet : this.pxSheet);
      gl.uniform1i(u.uPxSheet, 4);
      gl.activeTexture(gl.TEXTURE0);
    } else gl.uniform1i(u.uPxSheet, 4);
    gl.uniform4f(u.uBladeScale, heightFloor(this.height), Math.max(1e-6, heightSpan(this.height)), WIDTH_MIN, WIDTH_SPAN);
    gl.uniform3fv(u.uEye, eye);
    gl.uniform3fv(u.uSunDir, light.sunDir);
    const lane = light.lane ?? null;
    const c3 = (c, out) => (lane && c ? lane.decode3(c, out) : c);
    gl.uniform3fv(u.uAmb, c3(light.amb, this._dec.amb));
    gl.uniform3fv(u.uSunCol, c3(light.sunCol, this._dec.sun));
    gl.uniform1f(u.uDim, light.dim ?? 1);
    gl.uniform1f(u.uLane, lane ? 1 : 0);
    gl.uniform3fv(u.uGrassTone, lane ? this.tones : this.tonesClassic);
    gl.uniform3fv(u.uArtGround, lane ? this.artGround : this.artGroundClassic);
    gl.uniform1f(u.uArtHue, this.art.hue);
    gl.uniform1f(u.uELExposure, light.exposure ?? EL_EXPOSURE);
    gl.activeTexture(gl.TEXTURE0 + GRASS_ADAPT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, light.adaptTex ?? this._adaptOne());
    gl.uniform1i(u.uAdapt, GRASS_ADAPT_UNIT);
    const cs = light.cloud?.map ? light.cloud : null;
    if (cs) { gl.activeTexture(gl.TEXTURE0 + GRASS_CLOUD_UNIT); gl.bindTexture(gl.TEXTURE_2D, cs.map); }
    gl.uniform1i(u.uCloudShadowMap, GRASS_CLOUD_UNIT);
    gl.uniform4fv(u.uCloudShadowRect, cs ? cs.rect : NO_DECK);
    gl.activeTexture(gl.TEXTURE0);
    if (light.shadows) light.shadows.upload(this.shadowLoc);
    else {
      // Without a shadow pass the samplers still need distinct units, since two sampler types on one unit is an
      // invalid draw. The caster table is reset because uniforms outlive the frame that set them.
      const L = this.shadowLoc;
      gl.uniform1i(L.sunShadow, SHADOW_SUN_UNIT); gl.uniform1i(L.pointShadow, SHADOW_POINT_UNIT);
      if (L.pointShadowLo) gl.uniform1i(L.pointShadowLo, SHADOW_LO_UNIT);
      gl.uniform4fv(L.sunParams, NO_DECK);
      gl.uniform1iv(L.casterOf, NO_CASTERS);
      gl.uniform4fv(L.pointParams, NO_CASTER_PARAMS);
    }
    gl.uniform4fv(u.uIndirect, light.indirect ?? NO_DECK);
    gl.uniform3fv(u.uIndirectColor, c3(light.indirectColor ?? ZERO3, this._dec.near));
    const pts = light.points ?? null, pcs = light.pointColors ?? null;
    const pn = pts && pcs ? Math.min(pts.length >> 2, Math.floor(pcs.length / 3), GRASS_MAX_LIGHTS) : 0;
    this._pts = pn > 0 ? pts : null; this._pn = pn; this._cellN = -1;
    gl.uniform1i(u.uPointCount, 0);
    if (pn > 0) {
      gl.uniform4fv(u.uPointLights, pts.subarray ? pts.subarray(0, pn * 4) : pts.slice(0, pn * 4));
      gl.uniform3fv(u.uPointColors, lane ? lane.decodeN(pcs, this._dec.points, pn) : (pcs.subarray ? pcs.subarray(0, pn * 3) : pcs.slice(0, pn * 3)));
    }
    // Missing sun or moon terms default to full sun and no moon, so a missing light never reads as night.
    gl.uniform1f(u.uSunScale, light.sunScale ?? 1);
    gl.uniform3fv(u.uMoonDir, light.moonDir ?? UP);
    gl.uniform1f(u.uMoonScale, light.moonScale ?? 0);
    gl.uniform3fv(u.uMoonCol, c3(light.moonCol ?? WHITE, this._dec.moon));
    const fog = light.fog;
    gl.uniform1i(u.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(u.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(u.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(u.uFogColor, fog?.color ?? WHITE);
    gl.uniform3fv(u.uCamPos, fog?.camPos ?? eye);
    if (u.uDwFog) gl.uniform4fv(u.uDwFog, fog?.dw ?? NO_WATER_FOG);
    if (u.uJungleHaze) gl.uniform4fv(u.uJungleHaze, fog?.haze ?? NO_HAZE);
    gl.bindVertexArray(this.vao);
    const pv = this._pv;
    if (pv) pv.provokingVertexWEBGL(pv.FIRST_VERTEX_CONVENTION_WEBGL);
    this._drawVisibleSlots(o, eye, range);
    if (pv) pv.provokingVertexWEBGL(pv.LAST_VERTEX_CONVENTION_WEBGL);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    if (culled) gl.enable(gl.CULL_FACE);
  }

  // WebGL2 has no base instance, so a slot is drawn by moving the pointers. vertexAttribPointer also sets the
  // format, so the packed type is restated each time.
  _point(slot) {
    const gl = this.gl; const p = this.perCell ?? 0;
    for (let k = 0; k < this._lanes.length; k++) {
      const L = this._lanes[k];
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[k]);
      gl.vertexAttribPointer(L.loc, 4, L.type, true, 0, slot * p * L.bytes);
    }
  }

  _drawVisibleSlots(vp, eye, range) {
    const gl = this.gl; const p = this.perCell;
    const planes = frustumPlanes(vp, this._planes);
    let slots = 0, blades = 0, kept = 0, verts_ = 0, farSlots = 0, cardSlots = 0, cardsFarSlots = 0;
    gl.bindVertexArray(this.vao);
    let wasVao = this.vao;
    const S = this.slotBox.length;
    if (!this._order || this._order.length < S) { this._order = new Int32Array(S); this._near = new Float64Array(S); }
    const order = this._order, near = this._near;
    let shown = 0;
    for (let slot = 0; slot < S; slot++) {
      const box = this.slotBox[slot];
      if (!box) continue;
      const dx = Math.max(box[0] - eye[0], 0, eye[0] - box[3]);
      const dz = Math.max(box[2] - eye[2], 0, eye[2] - box[5]);
      if (dx * dx + dz * dz > range * range) continue;
      let seen = box;
      if (this._meadow) {
        const r = this.slotCardH[slot] * this._cardReach, cb = this._cardBox;
        const t = r * this.slotCardTilt[slot];
        cb[0] = box[0] - r; cb[1] = box[1] - t; cb[2] = box[2] - r; cb[3] = box[3] + r; cb[4] = box[4] + this.slotCardRise[slot] + t; cb[5] = box[5] + r;
        seen = cb;
      }
      if (aabbOutside(planes, seen)) continue;
      if ((this.slotCount ? this.slotCount[slot] : p) <= 0) continue;
      near[slot] = Math.sqrt(dx * dx + dz * dz);
      order[shown++] = slot;
    }
    // Sprite styles are opaque, so they draw nearest first; the smooth style blends and keeps the slot order.
    if (this._oneQuad) {
      for (let i = 1; i < shown; i++) {
        const s = order[i], d = near[s];
        let j = i - 1;
        for (; j >= 0 && near[order[j]] > d; j--) order[j + 1] = order[j];
        order[j + 1] = s;
      }
    }
    for (let i = 0; i < shown; i++) {
      const slot = order[i], box = this.slotBox[slot], dn = near[slot];
      const n = this.slotCount ? this.slotCount[slot] : p;
      const fade = 1 - smoothstep(range * 0.55, range, dn);
      const m = this._oneQuad ? Math.ceil(n / (this._meadow ? MEADOW_BLADES_PER_TUFT : PX_BLADES_PER_TUFT)) : n;
      // Submits only the prefix that can pass the shader's index fade (u > vFade * 1.15) at the nearest point.
      const budget = Math.min(m, Math.ceil(m * fade * 1.15));
      if (budget <= 0) continue;
      gl.uniform1f(this.u.uSlotN, m);
      const f = slot * 4, F = this.slotFrame;
      gl.uniform4f(this.u.uCellFrame, F[f], F[f + 1], F[f + 2], F[f + 3]);
      gl.uniform1f(this.u.uCellSize, this.slotSpan ? this.slotSpan[slot] : (this.cellSize ?? GRASS_CELL));
      const far = this._oneQuad || dn > range * GRASS_FAR_AT;
      const cardsFar = dn > range * (MEADOW_NEAR_AT + MEADOW_NEAR_BAND);
      const vao = this._meadow ? (cardsFar ? this.vaoCardsFar : this.vaoCards) : (far ? this.vaoFar : this.vao);
      if (vao !== wasVao) { gl.bindVertexArray(vao); wasVao = vao; }
      const verts = this._meadow ? (cardsFar ? this.vertsCardsFar : this.vertsCards) : (far ? this.vertsFar : this.verts);
      if (this._pn > 0) this._cellLights(box);
      this._point(slot);
      if (this._meadow) gl.drawElementsInstanced(gl.TRIANGLES, cardsFar ? this.countCardsFar : this.countCards, gl.UNSIGNED_SHORT, 0, budget);
      else if (this._pv) gl.drawElementsInstanced(gl.TRIANGLES, verts, gl.UNSIGNED_SHORT, 0, budget);
      else gl.drawArraysInstanced(gl.TRIANGLES, 0, verts, budget);
      slots++; blades += budget; kept += n; verts_ += verts * budget;
      if (this._meadow) { cardSlots++; if (cardsFar) cardsFarSlots++; } else if (far) farSlots++;
    }
    this.drawn.slots = slots; this.drawn.blades = blades; this.drawn.kept = kept;
    this.drawn.slotCapacity = slots * p;
    this.drawn.verts = verts_; this.drawn.farSlots = farSlots;
    this.drawn.cardSlots = cardSlots; this.drawn.cardsFarSlots = cardsFarSlots;
  }

  _cellLights(box) {
    const P = this._pts, idx = this._cellIdx, dist = this._cellDist, cap = GRASS_CELL_LIGHTS;
    let n = 0;
    for (let i = 0; i < this._pn; i++) {
      const x = P[i * 4], y = P[i * 4 + 1], z = P[i * 4 + 2], r = P[i * 4 + 3];
      const dx = Math.max(box[0] - x, 0, x - box[3]), dy = Math.max(box[1] - y, 0, y - box[4]), dz = Math.max(box[2] - z, 0, z - box[5]);
      const d2 = dx * dx + dy * dy + dz * dz;
      if (!(d2 < r * r)) continue;
      if (n === cap && d2 >= dist[cap - 1]) continue;
      let k = n < cap ? n++ : cap - 1;
      while (k > 0 && dist[k - 1] > d2) { dist[k] = dist[k - 1]; idx[k] = idx[k - 1]; k--; }
      dist[k] = d2; idx[k] = i;
    }
    let same = n === this._cellN;
    for (let k = 0; same && k < n; k++) same = idx[k] === this._cellLast[k];
    if (same) return;
    this.gl.uniform1i(this.u.uPointCount, n);
    if (n > 0) this.gl.uniform1iv(this.u.uPointIdx, idx);
    this._cellN = n; this._cellLast.set(idx);
  }

  _adaptOne() {
    if (this._one) return this._one;
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return (this._one = tex);
  }

  destroy() {
    const gl = this.gl;
    if (this._one) gl.deleteTexture(this._one);
    for (const b of this.bufs) gl.deleteBuffer(b);
    for (const b of this._cornerBufs ?? []) gl.deleteBuffer(b);
    gl.deleteVertexArray(this.vao);
    if (this.vaoFar) gl.deleteVertexArray(this.vaoFar);
    if (this.vaoCards) gl.deleteVertexArray(this.vaoCards);
    if (this.vaoCardsFar) gl.deleteVertexArray(this.vaoCardsFar);
    gl.deleteTexture(this.zeroField);
    gl.deleteTexture(this.pxSheet);
    gl.deleteTexture(this.meadowSheet);
    gl.deleteProgram(this.program);
  }
}
