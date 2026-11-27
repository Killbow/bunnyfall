// @ts-check
// Offscreen 960x600 NEAREST portal FBO, spatial seam, hard-light causeway, waterfalls, and scrying wellspring.

import { buildProgram } from './glProgram.js';
import { multiply, trs } from '../world/mat4.js';
import { ensureBazaarArt } from './bazaarBetwixtArt.js';
import { BazaarSkyPass } from './bazaarSkyPass.js';
import {
  BAZAAR_TEAR_HALF_W,
  BAZAAR_TEAR_HALF_H,
  BAZAAR_TEAR_CENTER_Y,
  BAZAAR_BRIDGE_Z0,
  BAZAAR_BRIDGE_Z1,
  BAZAAR_BRIDGE_HALF_W,
  BAZAAR_CRAG_SPECS,
} from '../systems/bazaarBetwixt.js';

const PORTAL_FBO_W = 960;
const PORTAL_FBO_H = 600;
const THRESHOLD_PULSE_MS = 180;
const SHARD_COUNT = 9;
const MOTE_COUNT = 20;
const LOOM_STRANDS = 36;
const LOOM_SEGS = 40;

const PORTAL_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aQuad;

uniform mat4 uViewProj;
uniform mat4 uModel;
uniform vec2 uHalfSize;

out vec2 vLocal;
out vec3 vWorldPos;

void main() {
  vLocal = aQuad;
  vec4 wp = uModel * vec4(aQuad.x * uHalfSize.x, aQuad.y * uHalfSize.y, 0.0, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = uViewProj * wp;
}
`;

const PORTAL_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vWorldPos;

uniform sampler2D uPortalTex;
uniform vec4 uViewport;
uniform vec3 uEye;
uniform vec3 uGateNormal;
uniform vec3 uGateRight;
uniform float uTime;
uniform float uVeilMix;
uniform float uSlashProgress;
uniform float uOpenProgress;

out vec4 outColor;

float pHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float pNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(pHash(i), pHash(i + vec2(1.0, 0.0)), u.x),
    mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float pFbm(vec2 p) {
  float v = 0.0, a = 0.52;
  for (int k = 0; k < 3; k++) {
    v += a * pNoise(p);
    p *= 2.05;
    a *= 0.5;
  }
  return v;
}

float zig(float t, float seed) {
  float i = floor(t);
  float f = fract(t);
  float a = pHash(vec2(i, seed)) * 2.0 - 1.0;
  float b = pHash(vec2(i + 1.0, seed)) * 2.0 - 1.0;
  return mix(a, b, f);
}

float psijicClock(float t) {
  float cyc = floor(t / 2.8);
  float u = fract(t / 2.8);
  float local;
  if (u < 0.56) {
    float q = floor((u / 0.56) * 8.0) / 8.0;
    local = q * 1.15;
  } else if (u < 0.76) {
    local = 1.15;
  } else {
    float rw = (u - 0.76) / 0.24;
    local = mix(1.15, 0.35, rw * rw * (3.0 - 2.0 * rw));
  }
  return cyc * 0.35 + local;
}

float stasisHoldGlow(float t) {
  float u = fract(t / 2.8);
  return smoothstep(0.52, 0.62, u) * (1.0 - smoothstep(0.74, 0.88, u));
}

float fractureSideWidth(float y, float side, float pt) {
  float sSeed = side < 0.0 ? 53.0 : 61.0;
  float c1 = zig(y * 5.2 + side * 0.9 + pt * 0.34, sSeed) * 0.145;
  float c2 = zig(y * 12.6 - side * 1.3 - pt * 0.78, sSeed + 18.0) * 0.078;
  float c3 = zig(y * 26.0 + pt * 1.45, sSeed + 36.0) * 0.036;
  return max(0.08, 0.50 + c1 + c2 + c3);
}

vec3 sampleAurbicVoid(vec2 qp, vec2 rayShift, float cutDist, float flashBoost, float pt) {
  vec2 gridRes = vec2(124.0, 136.0);
  vec2 pMid = qp + rayShift * 0.28;
  vec2 pDeep = floor((qp + rayShift * 0.58) * gridRes) / gridRes;
  vec2 pNear = qp + rayShift * 0.09;

  float neb = pFbm(pMid * 4.4 + vec2(0.0, pt * 0.10));
  vec3 col = mix(vec3(0.010, 0.016, 0.048), vec3(0.044, 0.078, 0.195), neb);

  vec2 starCell1 = floor(pDeep * gridRes);
  float starH1 = pHash(starCell1 + 17.0);
  if (starH1 > 0.966) {
    float tw = 0.62 + 0.38 * sin(uTime * 3.1 + starH1 * 91.0);
    vec3 starTint = starH1 > 0.985 ? vec3(0.96, 0.90, 0.76) : vec3(0.76, 0.90, 1.0);
    col += starTint * tw * 0.85;
  }

  vec2 starCell2 = floor(pMid * gridRes * 0.75);
  float starH2 = pHash(starCell2 + 73.0);
  if (starH2 > 0.980) {
    col += vec3(0.62, 0.80, 1.0) * 0.45;
  }

  float wWarp = (pNoise(pNear * 4.6 + vec2(pt * 0.12, -pt * 0.09)) - 0.5) * 1.35;
  float th1 = 1.0 - abs(zig(pNear.y * 7.8 + pNear.x * 2.8 + wWarp - pt * 0.24, 131.0));
  float goldThread = smoothstep(0.93, 0.992, th1);
  col = mix(col, vec3(0.86, 0.82, 0.68), goldThread * 0.28);

  float cutRim = smoothstep(0.013, 0.0, cutDist);
  col = mix(col, vec3(0.94, 0.89, 0.74), clamp(cutRim * 0.82 + flashBoost, 0.0, 1.0));
  return col;
}

void main() {
  if (uSlashProgress <= 0.01) discard;

  vec2 gridRes = vec2(124.0, 136.0);
  vec2 qp = floor(vLocal * gridRes) / gridRes;
  float y = qp.y;

  float yTop = 0.88;
  float yBot = mix(0.88, -0.88, clamp(uSlashProgress, 0.0, 1.0));
  float spanH = max(0.04, yTop - yBot);
  float uY = (yTop - y) / spanH;
  if (uY < 0.0 || uY > 1.0) discard;

  float pt0 = psijicClock(uTime);
  float holdPulse = stasisHoldGlow(uTime);

  float endTaper = clamp(1.0 - pow(abs(y) / 0.90, 2.2), 0.0, 1.0);
  float spine = (
    zig(y * 3.1 + 1.4 + pt0 * 0.08, 11.0) * 0.094 +
    zig(y * 7.6 - 0.5 - pt0 * 0.14, 23.0) * 0.042 +
    zig(y * 16.5 + 0.8 + pt0 * 0.26, 37.0) * 0.019
  ) * (0.35 + 0.65 * endTaper);

  float asymU = clamp(uY + 0.05 * sin(uY * 3.14159265), 0.0, 1.0);
  float vProfile = pow(max(0.0, sin(asymU * 3.14159265)), 0.76);

  float fullWL = vProfile * fractureSideWidth(y, -1.0, pt0);
  float fullWR = vProfile * fractureSideWidth(y, 1.0, pt0);

  float distFromSpine = abs(qp.x - spine);
  float sideFullW = qp.x < spine ? fullWL : fullWR;

  float chunkField = (
    zig(qp.x * 9.5 + qp.y * 6.2, 211.0) * 0.13 +
    zig(qp.y * 15.5 - qp.x * 8.4, 227.0) * 0.075
  ) * (1.0 - smoothstep(0.86, 1.0, uOpenProgress));
  float openFront = mix(0.010 * vProfile, sideFullW, clamp(uOpenProgress, 0.0, 1.0)) - chunkField * sideFullW;
  openFront = max(0.009 * vProfile, openFront);

  if (distFromSpine > openFront) discard;

  vec3 viewToFrag = vWorldPos - uEye;
  vec3 rayDir = normalize(viewToFrag);
  vec2 rayShift = clamp(vec2(dot(rayDir, uGateRight), rayDir.y), vec2(-0.85), vec2(0.85));
  float frontFace = dot(-rayDir, uGateNormal);

  float dHoriz = openFront - distFromSpine;
  float dTip = min(yTop - y, y - yBot) * 0.36;
  float edgeDist = min(dHoriz, dTip);
  float innerTear = max(0.0, edgeDist
                  + zig(y * 22.0 + qp.x * 8.0 - pt0 * 0.32, 163.0) * 0.0045
                  + zig(y * 44.0 + pt0 * 0.58, 179.0) * 0.0022);
  float lipW = 0.013;
  float slashFlash = (1.0 - smoothstep(0.0, 0.18, uOpenProgress)) * 0.55 + holdPulse * 0.10;

  if (frontFace < 0.0) {
    outColor = vec4(sampleAurbicVoid(qp, -rayShift, edgeDist, slashFlash * 0.35, pt0), 0.99);
    return;
  }

  if (innerTear < lipW) {
    float glint = smoothstep(lipW, 0.0, innerTear);
    vec3 crackVoid = vec3(0.018, 0.032, 0.088);
    vec3 seamGlint = mix(vec3(0.76, 0.86, 0.98), vec3(0.96, 0.90, 0.74), 0.55 + 0.35 * holdPulse);
    vec3 seamCol = mix(crackVoid, seamGlint, clamp(glint * 0.88 + slashFlash * 0.5, 0.0, 1.0));
    outColor = vec4(seamCol, 0.96);
    return;
  }

  vec2 screenUv = (gl_FragCoord.xy - uViewport.xy) / max(uViewport.zw, vec2(1.0));
  float seamProx = 1.0 - smoothstep(lipW, lipW + 0.052, innerTear);
  float warp = zig(y * 23.0 + pt0 * 0.95, 191.0) * 0.0034 * seamProx;
  vec3 dstCol = texture(uPortalTex, clamp(screenUv + vec2(warp, warp * 0.55), 0.001, 0.999)).rgb;

  if (uVeilMix > 0.01) {
    dstCol = mix(dstCol, sampleAurbicVoid(qp, rayShift, edgeDist, slashFlash, pt0), clamp(uVeilMix, 0.0, 1.0));
  }
  float hairline = smoothstep(0.006, 0.0, innerTear - lipW);
  dstCol = mix(dstCol, vec3(0.94, 0.89, 0.76), hairline * 0.52);

  outColor = vec4(dstCol, 1.0);
}
`;

// Psijic hard-light causeway and waist-high rune rails.
const BRIDGE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aUvKind;

uniform mat4 uViewProj;
uniform vec3 uOrigin;

out vec3 vLocalPos;
out vec3 vUvKind;

void main() {
  vLocalPos = aPos;
  vUvKind = aUvKind;
  gl_Position = uViewProj * vec4(uOrigin + aPos, 1.0);
}
`;

const BRIDGE_FS = `#version 300 es
precision highp float;
in vec3 vLocalPos;
in vec3 vUvKind;

uniform float uTime;
uniform float uMotion;
uniform vec2 uPlayerXZ;

out vec4 outColor;

void main() {
  vec2 p = vLocalPos.xz;
  float z = vLocalPos.z;
  float vy = vUvKind.y;
  float kind = vUvKind.z;
  float tAnim = uTime * uMotion;
  float ax = abs(p.x) / ${BAZAAR_BRIDGE_HALF_W.toFixed(3)};

  float aaY = max(fwidth(vy), 0.008);
  float aaZ = max(fwidth(z * 0.5), 0.003);
  float aaAx = max(fwidth(ax), 0.0025);
  float aaPx = max(fwidth(p.x), 0.0035);
  float aaRib = max(fwidth(p.y * 0.5), 0.003);

  float endFade = smoothstep(0.0, 0.38, p.y - (${BAZAAR_BRIDGE_Z0.toFixed(2)}))
                * smoothstep(0.0, 0.38, (${BAZAAR_BRIDGE_Z1.toFixed(2)}) - p.y);

  if (kind > 0.5) {
    float vFade = (1.0 - smoothstep(0.90, 1.0, vy)) * smoothstep(0.0, 0.10, vy);
    float topLine = 1.0 - smoothstep(0.016, 0.016 + aaY * 1.8, abs(vy - 0.88));
    float postPhase = fract((z - (${BAZAAR_BRIDGE_Z0.toFixed(2)})) * 0.5) - 0.5;
    float posts = (1.0 - smoothstep(0.018, 0.018 + aaZ * 1.8, abs(postPhase))) * smoothstep(0.92, 0.82, vy);
    float railBreathe = 0.5 + 0.5 * sin(z * 0.65 - tAnim * 1.6);
    float goldMix = clamp(topLine + posts * 0.82, 0.0, 1.0);
    float alpha = (0.10 + 0.06 * railBreathe + 0.62 * topLine + 0.44 * posts) * vFade * (0.45 + 0.55 * endFade);
    if (alpha < 0.015) discard;
    vec3 wardGlass = vec3(0.16, 0.48, 0.78);
    vec3 wardGold = vec3(0.98, 0.87, 0.54);
    outColor = vec4(mix(wardGlass, wardGold, goldMix), alpha);
    return;
  }

  if (ax > 1.0) discard;

  float outerBorder = smoothstep(0.90 - aaAx, 0.91 + aaAx, ax) * (1.0 - smoothstep(0.985 - aaAx, 0.998 + aaAx, ax));
  float innerBevel = (1.0 - smoothstep(0.006, 0.006 + aaAx * 1.6, abs(ax - 0.855))) * 0.52;
  float centerPair = 1.0 - smoothstep(0.012, 0.012 + aaPx * 1.6, abs(abs(p.x) - 0.16));
  float lanePair = (1.0 - smoothstep(0.009, 0.009 + aaPx * 1.6, abs(abs(p.x) - 0.78))) * 0.52;

  float ribCoord = fract((p.y - (${BAZAAR_BRIDGE_Z0.toFixed(2)})) * 0.5) - 0.5;
  float crossRib = (1.0 - smoothstep(0.013, 0.013 + aaRib * 1.6, abs(ribCoord))) * smoothstep(0.92, 0.86, ax);

  float wave = 0.5 + 0.5 * sin(p.y * 0.55 - tAnim * 1.5);
  float surge = pow(0.5 + 0.5 * sin(p.y * 0.42 - tAnim * 1.9), 4.0);
  float footDist = length(p - uPlayerXZ);
  float footRing = smoothstep(1.85, 0.14, footDist) * (0.56 + 0.44 * sin(footDist * 8.0 - uTime * 4.2)) * 0.62;

  float goldMask = clamp(
    outerBorder * 0.96 + innerBevel + centerPair * (0.66 + 0.28 * surge) + lanePair + crossRib * 0.58 + footRing * 0.72,
    0.0,
    1.0
  );
  float cyanMask = clamp(0.14 * wave + crossRib * 0.28 + footRing * 0.35, 0.0, 1.0);

  vec3 baseGlass = vec3(0.05, 0.14, 0.30);
  vec3 cyanCol = vec3(0.24, 0.66, 0.92);
  vec3 goldCol = vec3(0.98, 0.87, 0.54);
  vec3 col = mix(baseGlass, cyanCol, cyanMask);
  col = mix(col, goldCol, goldMask);

  float alpha = clamp((0.54 + 0.32 * goldMask + 0.12 * footRing) * (0.68 + 0.32 * endFade), 0.0, 0.92);
  outColor = vec4(col, alpha);
}
`;

// Sunken Scrying Basin mirror pool with swirling astral spiral vortex.
const POOL_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aQuad;

uniform mat4 uViewProj;
uniform vec3 uOrigin;
uniform float uRadius;

out vec2 vLocal;
out vec3 vWorld;

void main() {
  vLocal = aQuad * uRadius;
  vWorld = uOrigin + vec3(vLocal.x, -0.18, vLocal.y);
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}
`;

const POOL_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vWorld;

uniform float uRadius;
uniform float uTime;
uniform float uMotion;
uniform vec3 uEye;

out vec4 outColor;

float h2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float r = length(vLocal);
  if (r > uRadius) discard;
  float tAnim = uTime * uMotion;
  float ang = atan(vLocal.y, vLocal.x);

  vec3 viewDir = normalize(vWorld - uEye);
  float rotA = ang - tAnim * 0.42 + (uRadius - r) * 0.85;
  vec2 swirlUv = vec2(cos(rotA), sin(rotA)) * r;
  vec2 refl = floor((swirlUv + viewDir.xz * 1.25) * 22.0);

  vec3 col = mix(vec3(0.010, 0.022, 0.065), vec3(0.038, 0.095, 0.210), 1.0 - r / uRadius);
  if (h2(refl + 31.0) > 0.964) {
    col += vec3(0.82, 0.93, 1.0) * (0.55 + 0.45 * sin(tAnim * 3.8 + refl.x));
  }

  float spiralArms = pow(0.5 + 0.5 * sin(ang * 3.0 + r * 3.4 - tAnim * 2.8), 3.0);
  float rings = smoothstep(0.76, 0.98, sin(r * 7.5 + tAnim * 3.4));
  float outerRim = smoothstep(uRadius - 0.18, uRadius, r);
  float coreGlow = exp(-pow(r / 1.05, 2.0));

  col += vec3(0.28, 0.68, 0.96) * spiralArms * 0.34 * (1.0 - r / uRadius);
  col = mix(col, vec3(0.98, 0.86, 0.52), (rings * 0.52 + spiralArms * 0.26) * (1.0 - r / uRadius) + outerRim * 0.72);
  col += vec3(1.0, 0.94, 0.76) * coreGlow * 0.55;

  outColor = vec4(clamp(col, 0.0, 1.0), 0.96);
}
`;

// Temporal-flux waterfalls and suspended droplets riding the drifting Artaeum crags.
const WATERFALL_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aUvKindPhase;

uniform mat4 uViewProj;
uniform vec3 uOrigin;
uniform float uTime;
uniform float uMotion;

out vec2 vUv;
out float vKind;
out float vPhase;

void main() {
  float phase = aUvKindPhase.w;
  float kind = aUvKindPhase.z;
  float bobY = uMotion > 0.5 ? sin(uTime * 0.78 + phase) * 0.34 : 0.0;
  float dropFloat = (kind > 0.5 && uMotion > 0.5) ? sin(uTime * 2.2 + (kind - 1.0) * 6.28 + phase) * 0.18 : 0.0;
  vec3 wp = uOrigin + aPos + vec3(0.0, bobY + dropFloat, 0.0);
  vUv = aUvKindPhase.xy;
  vKind = kind;
  vPhase = phase;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const WATERFALL_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in float vKind;
in float vPhase;

uniform float uTime;
uniform float uMotion;

out vec4 outColor;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x),
    mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Continuous C1 integral of the 7.0 s rush-and-stasis waterfall cycle so UV scroll never jumps.
void evalTemporalCascade(float t, out float scroll, out float stasis) {
  if (uMotion < 0.5) {
    scroll = t * 0.15;
    stasis = 0.65;
    return;
  }
  float cyc = floor(t / 7.0);
  float u = fract(t / 7.0);
  float segScroll;
  if (u < 0.56) {
    stasis = 0.0;
    segScroll = u * 7.0;
  } else if (u < 0.70) {
    float x = (u - 0.56) / 0.14;
    stasis = x * x * (3.0 - 2.0 * x);
    segScroll = 3.92 + 0.98 * (x - 0.96 * (x * x * x - 0.5 * x * x * x * x));
  } else if (u < 0.86) {
    stasis = 1.0;
    segScroll = 4.4296 + (u - 0.70) * 7.0 * 0.04;
  } else {
    float x = (u - 0.86) / 0.14;
    stasis = 1.0 - x * x * (3.0 - 2.0 * x);
    segScroll = 4.4744 + 0.98 * (0.04 * x + 0.96 * (x * x * x - 0.5 * x * x * x * x));
  }
  scroll = cyc * 4.984 + segScroll;
}

void main() {
  float scroll, stasis;
  evalTemporalCascade(uTime + vPhase * 0.35, scroll, stasis);

  if (vKind > 0.5) {
    vec2 q = vUv * 2.0 - 1.0;
    float pearl = length(vec2(q.x * 1.15, q.y * 0.92));
    if (pearl > 0.96) discard;
    float core = pow(1.0 - smoothstep(0.06, 0.96, pearl), 1.4);
    vec3 dropCol = mix(vec3(0.62, 0.88, 0.98), vec3(0.98, 0.90, 0.64), stasis * 0.58);
    float dropAlpha = core * 0.62 * (0.35 + 0.65 * stasis);
    if (dropAlpha < 0.015) discard;
    outColor = vec4(mix(dropCol, vec3(0.96, 0.98, 1.0), core * 0.35), dropAlpha);
    return;
  }

  float u = vUv.x;
  float tDown = vUv.y;
  float edgeFade = smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.94, u);
  float rimHi = (exp(-pow((u - 0.08) / 0.032, 2.0)) + exp(-pow((u - 0.92) / 0.032, 2.0))) * 0.42;
  float bottomFade = 1.0 - smoothstep(0.78, 1.0, tDown);

  float flowY = tDown * 6.5 - scroll * 1.55;
  float drift = (vnoise(vec2(u * 4.5, flowY * 0.45)) - 0.5) * 0.35;
  float f1 = 0.5 + 0.5 * sin((u + drift * 0.14) * 34.0);
  float f2 = 0.5 + 0.5 * cos((u - drift * 0.09) * 68.0 + flowY * 0.8);
  float f3 = vnoise(vec2(u * 14.0, flowY * 1.35));
  float silk = clamp(0.46 * pow(f1, 1.5) + 0.30 * pow(f2, 1.8) + 0.28 * f3, 0.0, 1.0);
  float lipFoam = smoothstep(0.10, 0.0, tDown) * 0.78 + exp(-tDown * 14.0) * 0.32;
  float stasisWave = stasis * (0.55 + 0.45 * sin(tDown * 22.0 - uTime * 2.6));

  vec3 deepWater = vec3(0.10, 0.34, 0.66);
  vec3 silkIvory = vec3(0.86, 0.94, 0.98);
  vec3 stasisGold = vec3(0.98, 0.88, 0.58);

  vec3 col = mix(deepWater, silkIvory, clamp(silk * 0.88 + lipFoam + rimHi, 0.0, 1.0));
  col = mix(col, stasisGold, stasisWave * 0.38);

  float alpha = clamp((0.44 + 0.40 * silk + lipFoam * 0.30 + rimHi * 0.26) * edgeFade * bottomFade, 0.0, 0.88);
  if (alpha < 0.02) discard;
  outColor = vec4(col, alpha);
}
`;

// Traveling golden ley-line pulses racing across the Rotunda floor into the Scrying Basin.
const LEY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aPosKind;
layout(location = 1) in vec2 aProgSeed;

uniform mat4 uViewProj;
uniform vec3 uOrigin;

out float vProg;
out float vKind;
out float vSeed;

void main() {
  vProg = aProgSeed.x;
  vSeed = aProgSeed.y;
  vKind = aPosKind.w;
  gl_Position = uViewProj * vec4(uOrigin + aPosKind.xyz, 1.0);
}
`;

const LEY_FS = `#version 300 es
precision highp float;
in float vProg;
in float vKind;
in float vSeed;

uniform float uTime;
uniform float uMotion;

out vec4 outColor;

void main() {
  float tAnim = uTime * uMotion;
  float pulse;
  if (vKind < 0.5) {
    pulse = pow(0.5 + 0.5 * sin(vProg * 9.5 + tAnim * 1.5 + vSeed * 6.28318), 6.0);
  } else {
    pulse = pow(0.5 + 0.5 * sin(vProg * 18.84955 - tAnim * (vSeed > 0.5 ? 1.1 : -1.1)), 5.0);
  }
  float intensity = (0.04 + 0.26 * pulse) * uMotion;
  if (intensity < 0.015) discard;
  vec3 col = mix(vec3(0.56, 0.86, 1.0), vec3(1.0, 0.88, 0.50), 0.72);
  outColor = vec4(col * intensity, intensity);
}
`;

// Taut cosmic silk threads: central 36 m hourglass Loom, causeway flank guides, and outer chasm warp strands.
const LOOM_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aStrand;

uniform mat4 uViewProj;
uniform vec3 uOrigin;
uniform vec3 uEye;
uniform float uTime;
uniform float uMotion;

out vec2 vUv;
out float vSeed;
out float vKind;

const float TAU = 6.283185307179586;

vec3 evalThreadPos(float idx, float v, float seed, float tAnim, out float baseWidth, out float kind) {
  if (idx < 12.0) {
    // 0..11: Central 36 m hourglass Loom of Mundus rising from the Scrying Basin through the open oculus.
    kind = 0.0;
    float y = -0.18 + v * 36.4;
    float waist = 1.0 - 0.50 * exp(-pow((y - 3.6) / 3.1, 2.0));
    float skyFlare = 1.0 + 1.42 * smoothstep(10.8, 36.2, y);
    float rad = 2.22 * waist * skyFlare * (0.92 + 0.14 * seed);
    float dir = mod(idx, 2.0) < 0.5 ? 1.0 : -1.0;
    float twist = (idx / 12.0) * TAU + seed * 0.45 + dir * (y * 0.24 - tAnim * 0.48);
    float tautRipple = 0.025 * sin(y * 1.1 - tAnim * 1.4 + seed * TAU);
    float r = max(0.85, rad + tautRipple);
    baseWidth = mix(0.024, 0.018, v) * (1.0 + 0.35 * smoothstep(14.0, 36.0, y));
    return vec3(cos(twist) * r, y, sin(twist) * r);
  }
  if (idx < 20.0) {
    // 12..19: Flanking Hard-Light Causeway taut guide threads (4 per side) from Arrival Crag into the Rotunda.
    kind = 1.0;
    float localIdx = idx - 12.0;
    float sideSgn = localIdx < 4.0 ? -1.0 : 1.0;
    float sub = mod(localIdx, 4.0);
    vec3 p0, p1, ctrl;
    if (sub < 1.5) {
      // Lower causeway flank threads sweeping alongside the bridge into the South Triumphal Arch.
      p0 = vec3(sideSgn * (2.55 + 0.62 * sub), 0.72 + 1.15 * sub, -25.4);
      ctrl = vec3(sideSgn * (2.32 + 0.52 * sub), 0.95 + 1.35 * sub, -18.6);
      p1 = vec3(sideSgn * (3.55 + 1.35 * sub), 3.10 + 2.45 * sub, -11.6);
    } else {
      // High pylon-to-dome tension chords framing the upper causeway chasm.
      float hi = sub - 2.0;
      p0 = vec3(sideSgn * (3.05 + 1.65 * hi), 6.20 - 1.50 * hi, -24.5);
      ctrl = vec3(sideSgn * (4.65 + 2.10 * hi), 7.85 + 0.65 * hi, -16.8);
      p1 = vec3(sideSgn * (6.90 + 2.40 * hi), 12.40 + 2.10 * hi, -8.2);
    }
    float iv = 1.0 - v;
    vec3 p = iv * iv * p0 + 2.0 * iv * v * ctrl + v * v * p1;
    p.x += sideSgn * 0.03 * sin(v * 9.42 - tAnim * 1.3 + seed * TAU);
    p.y += 0.025 * cos(v * 6.28 - tAnim * 1.1 + seed * TAU);
    baseWidth = 0.020;
    return p;
  }
  // 20..35: Outer chasm and flanking Artaeum crag warp threads (8 per side) rising past the side bays into the sky.
  kind = 2.0;
  float cIdx = idx - 20.0;
  float sideSgn = cIdx < 8.0 ? -1.0 : 1.0;
  float slot = mod(cIdx, 8.0);
  // Anchor along the West and East chasm flanks (z = -22..+12) so the northern Ceporah vista stays clear.
  float zBase = -21.5 + slot * 4.75 + (seed - 0.5) * 1.6;
  float xBase = sideSgn * (15.6 + mod(slot * 3.0, 4.0) * 3.1 + seed * 1.8);
  float y = -20.0 + v * 54.0;
  float crownLean = 1.0 - 0.16 * smoothstep(-6.0, 34.0, y);
  float gentleTwist = 0.35 * sin(v * 2.4 + seed * TAU);
  baseWidth = mix(0.030, 0.024, v);
  return vec3(xBase * crownLean + gentleTwist, y, zBase + 0.45 * cos(v * 2.2 + seed * TAU));
}

void main() {
  float side = aStrand.x;
  float v = aStrand.y;
  float idx = aStrand.z;
  float seed = aStrand.w;

  float tAnim = uTime * uMotion;
  float baseW, kind, dummyW, dummyK;
  vec3 c0 = evalThreadPos(idx, v, seed, tAnim, baseW, kind);
  float dv = v < 0.985 ? 0.015 : -0.015;
  vec3 c1 = evalThreadPos(idx, v + dv, seed, tAnim, dummyW, dummyK);
  vec3 tang = normalize((c1 - c0) * sign(dv));

  vec3 worldCenter = uOrigin + c0;
  vec3 toCam = worldCenter - uEye;
  float dist = length(toCam);
  vec3 sideDir = cross(tang, toCam);
  float sideLen = length(sideDir);
  sideDir = sideLen > 1e-4 ? (sideDir / sideLen) : vec3(1.0, 0.0, 0.0);

  // Keep distant chasm threads at least ~1.4 px wide so taut strings never break up into dashed pixels.
  float width = max(baseW, dist * 0.00145);
  vec3 wp = worldCenter + sideDir * (side * width);

  vUv = vec2(side * 0.5 + 0.5, v);
  vSeed = seed + idx * 0.137;
  vKind = kind;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const LOOM_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in float vSeed;
in float vKind;

uniform float uTime;
uniform float uMotion;

out vec4 outColor;

void main() {
  float tAnim = uTime * uMotion;
  float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
  // Crisp taut-silk cross-section: sharp luminous core filament with a tight gossamer sheen.
  float core = pow(clamp(edge, 0.0, 1.0), 2.35);
  float halo = pow(clamp(edge, 0.0, 1.0), 1.15) * 0.32;
  if (edge < 0.03) discard;

  float freq = vKind > 1.5 ? 22.0 : (vKind > 0.5 ? 12.0 : 19.0);
  float speed = vKind > 1.5 ? 3.2 : (vKind > 0.5 ? 3.5 : 3.6);
  float packet = pow(0.5 + 0.5 * sin(vUv.y * freq - tAnim * speed + vSeed * 17.0), 7.0);
  float shimmer = 0.82 + 0.18 * sin(vUv.y * 34.0 - tAnim * 2.1 + vSeed * 9.0);

  float endFade = vKind > 0.5 && vKind < 1.5
    ? smoothstep(0.0, 0.07, vUv.y) * (1.0 - smoothstep(0.90, 1.0, vUv.y))
    : smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.84, 1.0, vUv.y));

  float goldMix = 0.5 + 0.45 * sin(vSeed * 19.7);
  vec3 cyanSilk = vec3(0.48, 0.86, 1.0);
  vec3 goldSilk = vec3(1.0, 0.88, 0.50);
  vec3 baseCol = mix(cyanSilk, goldSilk, goldMix);
  vec3 col = mix(baseCol, vec3(1.0, 0.96, 0.84), packet * 0.62);

  // Translucent (~58%) taut silk balance so Master Celarus and distant stone read cleanly behind the strands.
  float kindScale = vKind < 0.5 ? 0.56 : (vKind < 1.5 ? 0.64 : 0.58);
  float intensity = ((core * 0.28 + halo * 0.18) * shimmer + (core * 0.58 + halo * 0.22) * packet) * endFade * kindScale;
  if (intensity < 0.004) discard;
  outColor = vec4(col * intensity, intensity);
}
`;

const SHARD_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aBary;
layout(location = 2) in vec4 aSeed;

uniform mat4 uViewProj;
uniform vec3 uOrigin;
uniform vec3 uGateRight;
uniform vec3 uGateFwd;
uniform float uTime;
uniform float uOpenProgress;

out vec3 vBary;
out float vAlpha;
out float vSeed;

vec3 rotXYZ(vec3 p, vec3 ang) {
  float cx = cos(ang.x), sx = sin(ang.x);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  float cy = cos(ang.y), sy = sin(ang.y);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
  float cz = cos(ang.z), sz = sin(ang.z);
  return vec3(p.x * cz - p.y * sz, p.x * sz + p.y * cz, p.z);
}

void main() {
  float s0 = aSeed.x, s1 = aSeed.y, s2 = aSeed.z, s3 = aSeed.w;
  float life = 4.6 + 2.6 * s0;
  float u = fract(uTime / life + s1);

  float drift;
  if (u < 0.44) {
    float q = u / 0.44;
    drift = smoothstep(0.0, 1.0, q) * 0.55;
  } else if (u < 0.68) {
    float rw = (u - 0.44) / 0.24;
    drift = mix(0.55, 0.46, sin(rw * 3.14159265) * 0.55);
  } else {
    float tail = (u - 0.68) / 0.32;
    drift = mix(0.55, 1.0, tail * tail);
  }

  float side = s3 < 0.5 ? -1.0 : 1.0;
  float yNorm = clamp(0.14 + 0.72 * s2 + 0.05 * drift * (s0 - 0.35), 0.10, 0.90);
  float vArch = pow(sin(yNorm * 3.14159265), 0.76);
  float baseEdge = (0.50 + 0.14 * sin(yNorm * 17.0 + s1 * 6.0)) * vArch * uOpenProgress * 1.70;
  float lateral = side * (baseEdge + drift * (0.12 + 0.16 * s0));
  float depth = (fract(s2 * 13.7) - 0.5) * (0.03 + 0.12 * drift);
  float worldY = 0.24 + yNorm * 2.96 + drift * 0.10 * (s1 - 0.4);

  float dissolve = (1.0 - smoothstep(0.68, 1.0, u)) * smoothstep(0.0, 0.12, u) * smoothstep(0.18, 0.55, uOpenProgress);
  float scale = (0.022 + 0.024 * s0) * (0.35 + 0.65 * dissolve);

  vec3 localVert = vec3(aCorner.x * scale * 0.62, aCorner.y * scale * 1.30, 0.0);
  vec3 spin = vec3(
    (s0 - 0.5) * 1.0 + drift * 0.8,
    (s1 - 0.5) * 1.2 + side * drift * 1.1,
    (s2 - 0.5) * 2.0 + side * drift * 0.7
  );
  vec3 rVert = rotXYZ(localVert, spin);

  vec3 wp = uOrigin
          + uGateRight * (lateral + rVert.x)
          + vec3(0.0, worldY + rVert.y, 0.0)
          + uGateFwd * (depth + rVert.z);

  vBary = aBary;
  vAlpha = dissolve;
  vSeed = s1 * 37.0 + s2 * 19.0;
  gl_Position = uViewProj * vec4(wp, 1.0);
}
`;

const SHARD_FS = `#version 300 es
precision highp float;
in vec3 vBary;
in float vAlpha;
in float vSeed;

uniform float uTime;

out vec4 outColor;

void main() {
  if (vAlpha <= 0.01) discard;
  float edge = min(vBary.x, min(vBary.y, vBary.z));
  float rim = 1.0 - smoothstep(0.02, 0.22, edge);
  vec3 voidCol = vec3(0.018, 0.032, 0.092);
  vec3 rimCol = vec3(0.92, 0.87, 0.72);
  vec3 col = mix(voidCol, rimCol, rim * 0.78);
  outColor = vec4(col, vAlpha * 0.68);
}
`;

const MOTE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aSeed;

uniform mat4 uViewProj;
uniform vec3 uOrigin;
uniform float uTime;
uniform float uPxPerM;

out float vAlpha;
out float vWarmth;

const float TAU = 6.283185307179586;

void main() {
  float a = aSeed.x, b = aSeed.y, c = aSeed.z, d = aSeed.w;
  bool innerMote = d < 0.42;
  float life = innerMote ? (14.0 + 10.0 * a) : (22.0 + 16.0 * a);
  float u = fract(uTime / life + b);
  float ang = c * TAU + uTime * (innerMote ? (0.06 - 0.12 * a) : (0.025 - 0.05 * d));
  float rad = innerMote ? mix(8.8, 12.4, sqrt(a)) : mix(16.5, 36.0, sqrt(a));
  float y = innerMote ? mix(0.65, 16.0, u) : mix(-12.0, 21.0, u);
  vec3 p = vec3(cos(ang) * rad, y, sin(ang) * rad);
  float chancelKeepout = (p.z > 4.5 && p.y < 3.8) ? smoothstep(2.4, 5.2, abs(p.x)) : 1.0;
  float size = innerMote ? (0.028 + 0.022 * c) : (0.038 + 0.028 * c);
  vAlpha = min(1.0, u * 5.0) * (1.0 - u) * (innerMote ? 0.28 : 0.21) * chancelKeepout;
  vWarmth = fract(b * 7.3) < 0.62 ? 1.0 : 0.0;

  vec4 cp = uViewProj * vec4(uOrigin + p, 1.0);
  gl_Position = cp;
  float px = (size * uPxPerM) / max(cp.w, 0.15);
  gl_PointSize = clamp(px, 1.5, 3.2);
  vAlpha *= clamp(px / 1.4, 0.0, 1.0);
}
`;

const MOTE_FS = `#version 300 es
precision highp float;
in float vAlpha;
in float vWarmth;

out vec4 outColor;

void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  if (r > 0.95) discard;
  float core = 1.0 - smoothstep(0.10, 0.95, r);
  vec3 warm = vec3(1.0, 0.89, 0.62);
  vec3 cool = vec3(0.68, 0.88, 1.0);
  vec3 col = mix(cool, warm, vWarmth) * (0.55 + 0.45 * core);
  outColor = vec4(col * vAlpha, vAlpha);
}
`;

const PULSE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aQuad;
out vec2 vUv;
void main() {
  vUv = aQuad * 0.5 + 0.5;
  gl_Position = vec4(aQuad, 0.0, 1.0);
}
`;

const PULSE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uPhase;
out vec4 outColor;

void main() {
  vec2 p = (vUv * 2.0 - 1.0) * vec2(1.0, 0.86);
  float r = length(p);
  float edge = smoothstep(0.68, 1.30, r);
  if (edge <= 0.005) discard;
  float env = sin(clamp(uPhase, 0.0, 1.0) * 3.14159265);
  float goldBand = smoothstep(0.86, 1.24, r);
  vec3 indigo = vec3(0.05, 0.10, 0.26);
  vec3 gold = vec3(0.92, 0.80, 0.50);
  vec3 col = mix(indigo, gold, goldBand * 0.72);
  outColor = vec4(col, edge * env * 0.36);
}
`;

function buildPrng(seed = 0x50534a) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildMoteSeeds(count = MOTE_COUNT, seed = 0x50534a) {
  const rnd = buildPrng(seed);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < out.length; i++) out[i] = rnd();
  return out;
}

function buildShardMeshData(count = SHARD_COUNT, seed = 0x43454c) {
  const rnd = buildPrng(seed);
  const out = new Float32Array(count * 3 * 9);
  let o = 0;
  for (let i = 0; i < count; i++) {
    const s0 = rnd(), s1 = rnd(), s2 = rnd(), s3 = rnd();
    const skew = (rnd() - 0.5) * 0.85;
    const tipY = 1.05 + rnd() * 0.55;
    const botY = -(0.85 + rnd() * 0.55);
    const wingX = 0.55 + rnd() * 0.45;
    const corners = [
      [skew * 0.4, tipY],
      [-wingX, botY * 0.35],
      [wingX * 0.82, botY],
    ];
    const barys = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let v = 0; v < 3; v++) {
      out[o++] = corners[v][0];
      out[o++] = corners[v][1];
      out[o++] = barys[v][0];
      out[o++] = barys[v][1];
      out[o++] = barys[v][2];
      out[o++] = s0;
      out[o++] = s1;
      out[o++] = s2;
      out[o++] = s3;
    }
  }
  return out;
}

function buildBridgeMeshData() {
  const z0 = BAZAAR_BRIDGE_Z0 - 0.12;
  const z1 = BAZAAR_BRIDGE_Z1 + 0.55;
  const hw = BAZAAR_BRIDGE_HALF_W;
  const deckY = 0.018;
  const railH = 0.48;
  /** @type {number[]} */
  const v = [];
  const pushQuad = (/** @type {number[][]} */ pts, /** @type {number} */ kind) => {
    const [a, b, c, d] = pts;
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = [a, b, c, d][i], t = uvs[i];
      v.push(p[0], p[1], p[2], t[0], t[1], kind);
    }
  };
  pushQuad([[-hw, deckY, z0], [hw, deckY, z0], [hw, deckY, z1], [-hw, deckY, z1]], 0);
  pushQuad([[-hw + 0.04, 0.0, z0], [-hw + 0.04, 0.0, z1], [-hw + 0.04, railH, z1], [-hw + 0.04, railH, z0]], 1);
  pushQuad([[hw - 0.04, 0.0, z0], [hw - 0.04, 0.0, z1], [hw - 0.04, railH, z1], [hw - 0.04, railH, z0]], 1);
  return new Float32Array(v);
}

function buildWaterfallMeshData() {
  /** @type {number[]} */
  const v = [];
  const rotY = (/** @type {number[]} */ p, /** @type {number} */ yaw, /** @type {number} */ scale, /** @type {readonly [number, number, number]} */ c) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const sx = p[0] * scale, syP = p[1] * scale, sz = p[2] * scale;
    return [c[0] + sx * cy + sz * sy, c[1] + syP, c[2] - sx * sy + sz * cy];
  };
  const pushVert = (/** @type {number[]} */ p, /** @type {number} */ u, /** @type {number} */ tv, /** @type {number} */ kind, /** @type {number} */ phase) => {
    v.push(p[0], p[1], p[2], u, tv, kind, phase);
  };
  const dropOffsets = [
    [-1.55, -3.2, 4.5, 0.24, 0.1],
    [1.62, -5.8, 4.9, 0.28, 0.3],
    [-1.15, -9.4, 5.2, 0.22, 0.5],
    [1.45, -12.6, 5.5, 0.30, 0.7],
    [-0.85, -16.2, 5.7, 0.26, 0.85],
    [0.95, -19.5, 5.9, 0.25, 0.95],
  ];

  for (const spec of BAZAAR_CRAG_SPECS) {
    const { pos, yaw, scale, phase } = spec;
    const segs = 16;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const z0 = 3.35 + 1.95 * Math.pow(t0, 0.68);
      const z1 = 3.35 + 1.95 * Math.pow(t1, 0.68);
      const y0 = 1.12 - 24.62 * Math.pow(t0, 1.35);
      const y1 = 1.12 - 24.62 * Math.pow(t1, 1.35);
      const w0 = 1.16 * (1 + 0.36 * t0), w1 = 1.16 * (1 + 0.36 * t1);

      const p0L = rotY([-w0, y0, z0], yaw, scale, pos);
      const p0R = rotY([w0, y0, z0], yaw, scale, pos);
      const p1R = rotY([w1, y1, z1], yaw, scale, pos);
      const p1L = rotY([-w1, y1, z1], yaw, scale, pos);
      const qPts = [p0L, p0R, p1R, p1L];
      const qUvs = [[0, t0], [1, t0], [1, t1], [0, t1]];
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        pushVert(qPts[idx], qUvs[idx][0], qUvs[idx][1], 0, phase);
      }
    }
    for (const [dx, dy, dz, ds, du] of dropOffsets) {
      const hw = ds * 0.22, hh = ds * 0.55;
      const dPts = [
        rotY([dx - hw, dy - hh, dz], yaw, scale, pos),
        rotY([dx + hw, dy - hh, dz], yaw, scale, pos),
        rotY([dx + hw, dy + hh, dz], yaw, scale, pos),
        rotY([dx - hw, dy + hh, dz], yaw, scale, pos),
      ];
      const dUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        pushVert(dPts[idx], dUvs[idx][0], dUvs[idx][1], 1 + du, phase);
      }
    }
  }
  return new Float32Array(v);
}

function buildLeyPulseMeshData() {
  /** @type {number[]} */
  const v = [];
  const y = 0.022;
  const pushStrip = (/** @type {number[][]} */ pts, /** @type {number[]} */ progs, /** @type {number} */ kind, /** @type {number} */ seed) => {
    const [a, b, c, d] = pts;
    const [p0, p1] = progs;
    const ps = [p0, p0, p1, p1];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      const pt = [a, b, c, d][idx];
      v.push(pt[0], y, pt[1], kind, ps[idx], seed);
    }
  };

  for (let k = 0; k < 12; k++) {
    const ang = -Math.PI * 0.5 - Math.PI / 12 + (k * Math.PI) / 6 + Math.PI / 12;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const px = -sa * 0.075, pz = ca * 0.075;
    const r0 = 3.66, r1 = 12.35;
    pushStrip(
      [[ca * r0 - px, sa * r0 - pz], [ca * r0 + px, sa * r0 + pz], [ca * r1 + px, sa * r1 + pz], [ca * r1 - px, sa * r1 - pz]],
      [0.0, 1.0],
      0,
      k / 12,
    );
  }
  pushStrip([[-0.10, -23.6], [0.10, -23.6], [0.10, -26.4], [-0.10, -26.4]], [0.0, 1.0], 0, 0.25);

  const segs = 36;
  [6.4, 9.8].forEach((lr, rIdx) => {
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2;
      const a1 = ((s + 1) / segs) * Math.PI * 2;
      const ri = lr - 0.07, ro = lr + 0.07;
      pushStrip(
        [
          [Math.cos(a0) * ri, Math.sin(a0) * ri],
          [Math.cos(a0) * ro, Math.sin(a0) * ro],
          [Math.cos(a1) * ro, Math.sin(a1) * ro],
          [Math.cos(a1) * ri, Math.sin(a1) * ri],
        ],
        [s / segs, (s + 1) / segs],
        1,
        rIdx ? 0.8 : 0.2,
      );
    }
  });
  return new Float32Array(v);
}

function buildLoomMeshData(strands = LOOM_STRANDS, segs = LOOM_SEGS, seed = 0x4c4f4f4d) {
  const rnd = buildPrng(seed);
  const out = new Float32Array(strands * segs * 6 * 4);
  let o = 0;
  for (let s = 0; s < strands; s++) {
    const stSeed = rnd();
    for (let k = 0; k < segs; k++) {
      const v0 = k / segs, v1 = (k + 1) / segs;
      const quad = [[-1, v0], [1, v0], [1, v1], [-1, v1]];
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        out[o++] = quad[idx][0];
        out[o++] = quad[idx][1];
        out[o++] = s;
        out[o++] = stSeed;
      }
    }
  }
  return out;
}

class BazaarPortalGpu {
  /** @param {any} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    const gl = renderer.gl;
    this.gl = gl;
    this._pulseStartMs = -1e9;
    /** @type {WebGLBuffer[]} */
    this._vbos = [];
    /** @type {WebGLVertexArrayObject[]} */
    this._vaos = [];
    /** @type {WebGLProgram[]} */
    this._progs = [];

    const regProg = (/** @type {string} */ vs, /** @type {string} */ fs, /** @type {string} */ label) => {
      const p = buildProgram(gl, vs, fs, label);
      this._progs.push(p);
      return p;
    };
    const makeBuf = (/** @type {Float32Array} */ data) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this._vbos.push(b);
      return b;
    };
    const makeVao = () => {
      const v = gl.createVertexArray();
      this._vaos.push(v);
      return v;
    };

    ensureBazaarArt(renderer);
    this.skyPass = new BazaarSkyPass(renderer);

    this.portalProg = regProg(PORTAL_VS, PORTAL_FS, 'bazaar portal tear');
    this.uPortal = {
      viewProj: gl.getUniformLocation(this.portalProg, 'uViewProj'),
      model: gl.getUniformLocation(this.portalProg, 'uModel'),
      halfSize: gl.getUniformLocation(this.portalProg, 'uHalfSize'),
      portalTex: gl.getUniformLocation(this.portalProg, 'uPortalTex'),
      viewport: gl.getUniformLocation(this.portalProg, 'uViewport'),
      eye: gl.getUniformLocation(this.portalProg, 'uEye'),
      gateNormal: gl.getUniformLocation(this.portalProg, 'uGateNormal'),
      gateRight: gl.getUniformLocation(this.portalProg, 'uGateRight'),
      time: gl.getUniformLocation(this.portalProg, 'uTime'),
      veilMix: gl.getUniformLocation(this.portalProg, 'uVeilMix'),
      slashProgress: gl.getUniformLocation(this.portalProg, 'uSlashProgress'),
      openProgress: gl.getUniformLocation(this.portalProg, 'uOpenProgress'),
    };

    const quadVao = makeVao();
    gl.bindVertexArray(quadVao);
    makeBuf(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.quadVao = quadVao;

    // Build the Psijic hard-light causeway VAO.
    this.bridgeProg = regProg(BRIDGE_VS, BRIDGE_FS, 'bazaar hardlight bridge');
    this.uBridge = {
      viewProj: gl.getUniformLocation(this.bridgeProg, 'uViewProj'),
      origin: gl.getUniformLocation(this.bridgeProg, 'uOrigin'),
      time: gl.getUniformLocation(this.bridgeProg, 'uTime'),
      motion: gl.getUniformLocation(this.bridgeProg, 'uMotion'),
      playerXZ: gl.getUniformLocation(this.bridgeProg, 'uPlayerXZ'),
    };
    const bridgeData = buildBridgeMeshData();
    this.bridgeVertCount = bridgeData.length / 6;
    const bridgeVao = makeVao();
    gl.bindVertexArray(bridgeVao);
    makeBuf(bridgeData);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
    this.bridgeVao = bridgeVao;

    // Build the Sunken Scrying Basin mirror pool shader.
    this.poolProg = regProg(POOL_VS, POOL_FS, 'bazaar scrying pool');
    this.uPool = {
      viewProj: gl.getUniformLocation(this.poolProg, 'uViewProj'),
      origin: gl.getUniformLocation(this.poolProg, 'uOrigin'),
      radius: gl.getUniformLocation(this.poolProg, 'uRadius'),
      time: gl.getUniformLocation(this.poolProg, 'uTime'),
      motion: gl.getUniformLocation(this.poolProg, 'uMotion'),
      eye: gl.getUniformLocation(this.poolProg, 'uEye'),
    };

    // Build the temporal-flux waterfalls and suspended droplets VAO.
    this.wfProg = regProg(WATERFALL_VS, WATERFALL_FS, 'bazaar temporal waterfalls');
    this.uWf = {
      viewProj: gl.getUniformLocation(this.wfProg, 'uViewProj'),
      origin: gl.getUniformLocation(this.wfProg, 'uOrigin'),
      time: gl.getUniformLocation(this.wfProg, 'uTime'),
      motion: gl.getUniformLocation(this.wfProg, 'uMotion'),
    };
    const wfData = buildWaterfallMeshData();
    this.wfVertCount = wfData.length / 7;
    const wfVao = makeVao();
    gl.bindVertexArray(wfVao);
    makeBuf(wfData);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    this.wfVao = wfVao;

    // Build the traveling floor ley-pulse VAO.
    this.leyProg = regProg(LEY_VS, LEY_FS, 'bazaar floor ley pulses');
    this.uLey = {
      viewProj: gl.getUniformLocation(this.leyProg, 'uViewProj'),
      origin: gl.getUniformLocation(this.leyProg, 'uOrigin'),
      time: gl.getUniformLocation(this.leyProg, 'uTime'),
      motion: gl.getUniformLocation(this.leyProg, 'uMotion'),
    };
    const leyData = buildLeyPulseMeshData();
    this.leyVertCount = leyData.length / 6;
    const leyVao = makeVao();
    gl.bindVertexArray(leyVao);
    makeBuf(leyData);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
    gl.bindVertexArray(null);
    this.leyVao = leyVao;

    // Build the taut cosmic silk Loom, causeway flank, and chasm warp threads VAO.
    this.loomProg = regProg(LOOM_VS, LOOM_FS, 'bazaar cosmic silk threads');
    this.uLoom = {
      viewProj: gl.getUniformLocation(this.loomProg, 'uViewProj'),
      origin: gl.getUniformLocation(this.loomProg, 'uOrigin'),
      eye: gl.getUniformLocation(this.loomProg, 'uEye'),
      time: gl.getUniformLocation(this.loomProg, 'uTime'),
      motion: gl.getUniformLocation(this.loomProg, 'uMotion'),
    };
    const loomData = buildLoomMeshData();
    this.loomVertCount = loomData.length / 4;
    const loomVao = makeVao();
    gl.bindVertexArray(loomVao);
    makeBuf(loomData);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    gl.bindVertexArray(null);
    this.loomVao = loomVao;

    this.shardProg = regProg(SHARD_VS, SHARD_FS, 'bazaar portal shards');
    this.uShard = {
      viewProj: gl.getUniformLocation(this.shardProg, 'uViewProj'),
      origin: gl.getUniformLocation(this.shardProg, 'uOrigin'),
      gateRight: gl.getUniformLocation(this.shardProg, 'uGateRight'),
      gateFwd: gl.getUniformLocation(this.shardProg, 'uGateFwd'),
      time: gl.getUniformLocation(this.shardProg, 'uTime'),
      openProgress: gl.getUniformLocation(this.shardProg, 'uOpenProgress'),
    };
    const shardData = buildShardMeshData(SHARD_COUNT);
    this.shardVertCount = SHARD_COUNT * 3;
    const shardVao = makeVao();
    gl.bindVertexArray(shardVao);
    makeBuf(shardData);
    const stride = 9 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 20);
    gl.bindVertexArray(null);
    this.shardVao = shardVao;

    this.moteProg = regProg(MOTE_VS, MOTE_FS, 'bazaar time motes');
    this.uMote = {
      viewProj: gl.getUniformLocation(this.moteProg, 'uViewProj'),
      origin: gl.getUniformLocation(this.moteProg, 'uOrigin'),
      time: gl.getUniformLocation(this.moteProg, 'uTime'),
      pxPerM: gl.getUniformLocation(this.moteProg, 'uPxPerM'),
    };

    const moteData = buildMoteSeeds(MOTE_COUNT);
    this.moteCount = MOTE_COUNT;
    const moteVao = makeVao();
    gl.bindVertexArray(moteVao);
    makeBuf(moteData);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
    gl.bindVertexArray(null);
    this.moteVao = moteVao;

    this.pulseProg = regProg(PULSE_VS, PULSE_FS, 'bazaar threshold pulse');
    this.uPulsePhase = gl.getUniformLocation(this.pulseProg, 'uPhase');

    this.fboOut = this._makeFbo(PORTAL_FBO_W, PORTAL_FBO_H);
    this.fboIn = this._makeFbo(PORTAL_FBO_W, PORTAL_FBO_H);
    this._vp = new Float32Array(16);
    this._proj = new Float32Array(16);
  }

  _makeFbo(/** @type {number} */ w, /** @type {number} */ h) {
    const gl = this.gl;
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const prevRb = gl.getParameter(gl.RENDERBUFFER_BINDING);
    const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

    gl.bindTexture(gl.TEXTURE_2D, prevTex);
    gl.bindRenderbuffer(gl.RENDERBUFFER, prevRb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    if (!ok) {
      this._deleteFbo({ fbo, tex, rb });
      return null;
    }
    return { fbo, tex, rb, w, h };
  }

  _deleteFbo(/** @type {{ fbo: WebGLFramebuffer | null, tex: WebGLTexture | null, rb: WebGLRenderbuffer | null } | null} */ f) {
    if (!f) return;
    const gl = this.gl;
    if (f.fbo) gl.deleteFramebuffer(f.fbo);
    if (f.tex) gl.deleteTexture(f.tex);
    if (f.rb) gl.deleteRenderbuffer(f.rb);
  }

  dispose() {
    const gl = this.gl;
    this.skyPass?.dispose();
    this._deleteFbo(this.fboOut);
    this._deleteFbo(this.fboIn);
    this.fboOut = null;
    this.fboIn = null;
    for (const v of this._vaos) gl.deleteVertexArray(v);
    for (const b of this._vbos) gl.deleteBuffer(b);
    for (const p of this._progs) gl.deleteProgram(p);
    this._vaos.length = 0;
    this._vbos.length = 0;
    this._progs.length = 0;
  }

  /** @param {number} [nowMs] */
  triggerThresholdPulse(nowMs = performance.now()) {
    this._pulseStartMs = nowMs;
  }

  /**
   * @param {Float32Array} proj @param {Float32Array} view @param {number} timeSec
   * @param {number} [lod] @param {boolean} [still]
   */
  drawBazaarSky(proj, view, timeSec, lod = 0, still = false) {
    this.skyPass?.draw(proj, view, timeSec, lod, still);
  }

  /**
   * Draw the Scrying Pool, Hard-Light Causeway, Temporal Waterfalls, Ley-Pulses, and Scrying Wellspring.
   * @param {{ proj: Float32Array, view: Float32Array, eye: number[], origin: number[], playerFeet: number[] | null, timeSec: number, lod?: number, still?: boolean }} p
   */
  drawSanctumPower({ proj, view, eye, origin, playerFeet, timeSec, lod = 0, still = false }) {
    if (!this.fboOut) return;
    const gl = this.gl;
    this.renderer._close2D?.();
    const vp = multiply(proj, view, this._vp);
    const motion = still ? 0.08 : 1.0;

    // Render the Sunken Scrying Basin mirror pool first so the Loom rises cleanly above it.
    gl.useProgram(this.poolProg);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.uniformMatrix4fv(this.uPool.viewProj, false, vp);
    gl.uniform3f(this.uPool.origin, origin[0], origin[1], origin[2]);
    gl.uniform1f(this.uPool.radius, 3.32);
    gl.uniform1f(this.uPool.time, timeSec);
    gl.uniform1f(this.uPool.motion, motion);
    gl.uniform3f(this.uPool.eye, eye[0], eye[1], eye[2]);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Render the temporal-flux waterfalls and suspended droplets around the chasm.
    gl.useProgram(this.wfProg);
    gl.depthMask(false);
    gl.uniformMatrix4fv(this.uWf.viewProj, false, vp);
    gl.uniform3f(this.uWf.origin, origin[0], origin[1], origin[2]);
    gl.uniform1f(this.uWf.time, timeSec);
    gl.uniform1f(this.uWf.motion, motion);
    gl.bindVertexArray(this.wfVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.wfVertCount);

    // Render the translucent Psijic hard-light causeway and rune rails.
    gl.useProgram(this.bridgeProg);
    gl.uniformMatrix4fv(this.uBridge.viewProj, false, vp);
    gl.uniform3f(this.uBridge.origin, origin[0], origin[1], origin[2]);
    gl.uniform1f(this.uBridge.time, timeSec);
    gl.uniform1f(this.uBridge.motion, motion);
    if (playerFeet) {
      gl.uniform2f(this.uBridge.playerXZ, playerFeet[0] - origin[0], playerFeet[2] - origin[2]);
    } else {
      gl.uniform2f(this.uBridge.playerXZ, 0.0, -999.0);
    }
    gl.bindVertexArray(this.bridgeVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.bridgeVertCount);

    // Switch to additive blending for floor ley-pulses and the low-profile Scrying Wellspring.
    gl.blendFunc(gl.ONE, gl.ONE);

    if (lod === 0 && !still) {
      gl.useProgram(this.leyProg);
      gl.uniformMatrix4fv(this.uLey.viewProj, false, vp);
      gl.uniform3f(this.uLey.origin, origin[0], origin[1], origin[2]);
      gl.uniform1f(this.uLey.time, timeSec);
      gl.uniform1f(this.uLey.motion, motion);
      gl.bindVertexArray(this.leyVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.leyVertCount);
    }

    gl.useProgram(this.loomProg);
    gl.uniformMatrix4fv(this.uLoom.viewProj, false, vp);
    gl.uniform3f(this.uLoom.origin, origin[0], origin[1], origin[2]);
    gl.uniform3f(this.uLoom.eye, eye[0], eye[1], eye[2]);
    gl.uniform1f(this.uLoom.time, timeSec);
    gl.uniform1f(this.uLoom.motion, motion);
    gl.bindVertexArray(this.loomVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.loomVertCount);

    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    this.renderer.markForeignPass?.();
  }

  /** @param {'outer' | 'inner'} slot @param {Float32Array} proj @param {Float32Array} view @param {number[]} eye
   *  @param {number[]} tearPos @param {number} farPlane @param {any} scene */
  renderTarget(slot, proj, view, eye, tearPos, farPlane, scene) {
    const target = slot === 'outer' ? this.fboOut : this.fboIn;
    if (!target) return null;
    const fwdX = -view[2], fwdY = -view[6], fwdZ = -view[10];
    const toGx = tearPos[0] - eye[0];
    const toGy = (tearPos[1] + BAZAAR_TEAR_CENTER_Y) - eye[1];
    const toGz = tearPos[2] - eye[2];
    const gateViewZ = toGx * fwdX + toGy * fwdY + toGz * fwdZ;
    if (gateViewZ < -2.5) return null;

    const near = Math.max(0.14, Math.min(gateViewZ - 0.55, 55));
    const far = Math.max(near + 20, farPlane);
    this._proj.set(proj);
    this._proj[10] = (far + near) / (near - far);
    this._proj[14] = (2 * far * near) / (near - far);

    const ok = this.renderer.portalViewFrame?.(target.fbo, target.w, target.h, this._proj, view, scene);
    return ok ? target.tex : null;
  }

  /**
   * @param {{ proj: Float32Array, view: Float32Array, eye: number[], tearPos: number[], gateYaw: number, tex: WebGLTexture | null, timeSec: number, slashProgress?: number, openProgress: number, veilMix: number }} p
   */
  drawTearWindow({ proj, view, eye, tearPos, gateYaw, tex, timeSec, slashProgress = 1.0, openProgress, veilMix }) {
    if (slashProgress <= 0.01 || !this.fboOut) return;
    const gl = this.gl;
    this.renderer._close2D?.();
    const vp = multiply(proj, view, this._vp);
    const yawDeg = (gateYaw * 180) / Math.PI;
    const model = trs(tearPos[0], tearPos[1] + BAZAAR_TEAR_CENTER_Y, tearPos[2], 0, yawDeg, 0);
    const normal = [-Math.sin(gateYaw), 0, -Math.cos(gateYaw)];
    const right = [Math.cos(gateYaw), 0, -Math.sin(gateYaw)];
    const rect = this.renderer.worldViewportPx ?? [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight];
    const effVeil = tex ? veilMix : 1.0;

    gl.useProgram(this.portalProg);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.uniformMatrix4fv(this.uPortal.viewProj, false, vp);
    gl.uniformMatrix4fv(this.uPortal.model, false, model);
    gl.uniform2f(this.uPortal.halfSize, BAZAAR_TEAR_HALF_W, BAZAAR_TEAR_HALF_H);
    gl.uniform4f(this.uPortal.viewport, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform3f(this.uPortal.eye, eye[0], eye[1], eye[2]);
    gl.uniform3f(this.uPortal.gateNormal, normal[0], normal[1], normal[2]);
    gl.uniform3f(this.uPortal.gateRight, right[0], right[1], right[2]);
    gl.uniform1f(this.uPortal.time, timeSec);
    gl.uniform1f(this.uPortal.veilMix, effVeil);
    gl.uniform1f(this.uPortal.slashProgress, slashProgress);
    gl.uniform1f(this.uPortal.openProgress, openProgress);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex ?? this.fboOut.tex);
    gl.uniform1i(this.uPortal.portalTex, 0);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    this.renderer.markForeignPass?.();
  }

  /**
   * @param {Float32Array} proj @param {Float32Array} view @param {number[]} tearPos
   * @param {number} gateYaw @param {number} openProgress @param {number} timeSec
   */
  drawPortalShards(proj, view, tearPos, gateYaw, openProgress, timeSec) {
    if (openProgress <= 0.12 || !this.fboOut) return;
    const gl = this.gl;
    this.renderer._close2D?.();
    const vp = multiply(proj, view, this._vp);
    const right = [Math.cos(gateYaw), 0, -Math.sin(gateYaw)];
    const fwd = [Math.sin(gateYaw), 0, Math.cos(gateYaw)];

    gl.useProgram(this.shardProg);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.uniformMatrix4fv(this.uShard.viewProj, false, vp);
    gl.uniform3f(this.uShard.origin, tearPos[0], tearPos[1], tearPos[2]);
    gl.uniform3f(this.uShard.gateRight, right[0], right[1], right[2]);
    gl.uniform3f(this.uShard.gateFwd, fwd[0], fwd[1], fwd[2]);
    gl.uniform1f(this.uShard.time, timeSec);
    gl.uniform1f(this.uShard.openProgress, openProgress);

    gl.bindVertexArray(this.shardVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.shardVertCount);
    gl.bindVertexArray(null);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    this.renderer.markForeignPass?.();
  }

  /**
   * @param {Float32Array} proj @param {Float32Array} view @param {number[]} origin @param {number} timeSec
   * @param {'sanctum' | 'portal'} [kind] @param {number} [gateYaw] @param {number} [openProgress]
   */
  drawTimeMotes(proj, view, origin, timeSec, kind = 'sanctum', gateYaw = 0, openProgress = 1.0) {
    if (!this.fboOut) return;
    if (kind === 'portal') {
      this.drawPortalShards(proj, view, origin, gateYaw, openProgress, timeSec);
      return;
    }
    const gl = this.gl;
    this.renderer._close2D?.();
    const vp = multiply(proj, view, this._vp);
    const rect = this.renderer.worldViewportPx ?? [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight];
    const pxPerM = 0.5 * rect[3] * Math.abs(proj[5] || 1.7);

    gl.useProgram(this.moteProg);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.uniformMatrix4fv(this.uMote.viewProj, false, vp);
    gl.uniform3f(this.uMote.origin, origin[0], origin[1], origin[2]);
    gl.uniform1f(this.uMote.time, timeSec);
    gl.uniform1f(this.uMote.pxPerM, pxPerM);

    gl.bindVertexArray(this.moteVao);
    gl.drawArrays(gl.POINTS, 0, this.moteCount);
    gl.bindVertexArray(null);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.renderer.markForeignPass?.();
  }

  /** @param {number} [nowMs] */
  drawThresholdPulse(nowMs = performance.now()) {
    const elapsed = nowMs - this._pulseStartMs;
    if (elapsed < 0 || elapsed >= THRESHOLD_PULSE_MS || !this.fboOut) return;
    const gl = this.gl;
    this.renderer._close2D?.();

    gl.useProgram(this.pulseProg);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.uniform1f(this.uPulsePhase, elapsed / THRESHOLD_PULSE_MS);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    this.renderer.markForeignPass?.();
  }
}

/** @type {WeakMap<object, BazaarPortalGpu>} */
const _gpuByRenderer = new WeakMap();

/** @param {any} renderer */
export function getBazaarPortalGpu(renderer) {
  if (!renderer?.gl) return null;
  let inst = _gpuByRenderer.get(renderer);
  if (!inst) {
    inst = new BazaarPortalGpu(renderer);
    _gpuByRenderer.set(renderer, inst);
  }
  return inst;
}

/** @param {any} renderer */
export function disposeBazaarPortalGpu(renderer) {
  if (!renderer) return;
  const inst = _gpuByRenderer.get(renderer);
  if (inst) {
    inst.dispose();
    _gpuByRenderer.delete(renderer);
  }
}
