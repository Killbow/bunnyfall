// @ts-check
// Native-resolution animated Aurbic sky pass with twinkling stars, aurorae, constellations, and skyward threads.

import { buildProgram } from './glProgram.js';

const SKY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform vec3 uRight, uUp, uFwd;
uniform vec4 uProj;
out vec3 vRay;
void main() {
  vRay = uRight * ((aPos.x + uProj.z) / uProj.x) + uUp * ((aPos.y + uProj.w) / uProj.y) + uFwd;
  gl_Position = vec4(aPos, 1.0, 1.0);
}
`;

const SKY_FS = `#version 300 es
precision highp float;
in vec3 vRay;
uniform float uTime;
uniform float uLod;
uniform float uMotion;
out vec4 outColor;

const float INV_QPI = 1.2732395447351628;

vec2 h22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float h13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h13(i), h13(i + vec3(1, 0, 0)), u.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), u.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), u.x), u.y),
    u.z
  );
}

float fbm3(vec3 p, int octs) {
  float v = 0.0, a = 0.52;
  for (int k = 0; k < 4; k++) {
    if (k >= octs) break;
    v += a * n3(p);
    p = p * 2.07 + vec3(1.7, -2.3, 3.1);
    a *= 0.5;
  }
  return v;
}

float segDist(vec2 p, vec2 a, vec2 b, out float segT) {
  vec2 pa = p - a, ba = b - a;
  segT = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * segT);
}

// Uniform-angle cube-face projection for sub-pixel anti-aliased stars with zero pole pinching or camera crawl.
vec3 evalStarLayer(vec3 d, float res, float density, float sizeScale, float tAnim, bool heroGlints) {
  vec3 ad = abs(d);
  vec2 uv;
  float face;
  if (ad.x >= ad.y && ad.x >= ad.z) {
    uv = d.yz / ad.x;
    face = d.x >= 0.0 ? 0.0 : 1.0;
  } else if (ad.y >= ad.x && ad.y >= ad.z) {
    uv = d.xz / ad.y;
    face = d.y >= 0.0 ? 2.0 : 3.0;
  } else {
    uv = d.xy / ad.z;
    face = d.z >= 0.0 ? 4.0 : 5.0;
  }
  vec2 angUv = atan(uv) * INV_QPI;
  vec2 gp = angUv * res;
  vec2 cell = floor(gp);
  vec2 f = fract(gp);

  vec2 seed = cell + vec2(face * 713.0, face * 317.0);
  float pick = h12(seed + 19.3);
  if (pick < 1.0 - density) return vec3(0.0);

  vec2 jit = 0.18 + 0.64 * h22(seed + 47.1);
  vec2 delta = f - jit;
  float dist = length(delta);
  // Compute derivative on continuous ray rather than face-switched gp to avoid cube-seam derivative spikes.
  float pxCell = clamp(length(fwidth(d)) * res * 0.85, 0.025, 0.32);

  float mag = fract(pick * 97.3);
  float rad = (0.045 + 0.075 * mag) * sizeScale;
  float core = smoothstep(rad + pxCell, max(0.0, rad - pxCell * 0.55), dist);

  float twRate = 1.4 + 2.8 * h12(seed + 91.7);
  float twPhase = h12(seed + 133.1) * 6.2831853;
  float twinkle = 1.0 - (0.34 * uMotion) * (0.5 + 0.5 * sin(tAnim * twRate + twPhase));

  vec3 cool = vec3(0.76, 0.89, 1.0);
  vec3 warm = vec3(1.0, 0.91, 0.70);
  vec3 tint = mix(cool, warm, smoothstep(0.35, 0.85, h12(seed + 61.9)));

  float halo = exp(-dist * dist / max(0.0025, rad * rad * 6.5)) * 0.28 * mag;
  float glint = 0.0;
  if (heroGlints && mag > 0.72) {
    float breathe = 0.75 + 0.25 * sin(tAnim * 1.9 + twPhase);
    float gx = exp(-abs(delta.y) / max(pxCell * 0.9, 0.02)) * exp(-abs(delta.x) * 5.2);
    float gy = exp(-abs(delta.x) / max(pxCell * 0.9, 0.02)) * exp(-abs(delta.y) * 5.2);
    glint = (gx + gy) * 0.65 * breathe;
  }
  return tint * (core * 1.35 + halo + glint) * (0.45 + 0.75 * mag) * twinkle;
}

vec3 evalConstellation(vec3 d, vec3 center, float seed, float tAnim) {
  float cosA = dot(d, center);
  if (cosA < 0.968) return vec3(0.0);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), center));
  vec3 up = cross(center, right);
  vec2 p = vec2(dot(d, right), dot(d, up)) / 0.185;

  vec2 s0 = vec2(-0.62, -0.44);
  vec2 s1 = vec2(-0.18, 0.05 + 0.15 * sin(seed));
  vec2 s2 = vec2(0.32, 0.48);
  vec2 s3 = vec2(0.58, -0.14);
  vec2 s4 = vec2(0.04, -0.56);
  vec2 s5 = vec2(-0.42, 0.52);

  float t0, t1, t2, t3, t4;
  float d0 = segDist(p, s0, s1, t0);
  float d1 = segDist(p, s1, s2, t1);
  float d2 = segDist(p, s2, s3, t2);
  float d3 = segDist(p, s1, s4, t3);
  float d4 = segDist(p, s1, s5, t4);

  float lineD = d0; float lineT = t0;
  if (d1 < lineD) { lineD = d1; lineT = 1.0 + t1; }
  if (d2 < lineD) { lineD = d2; lineT = 2.0 + t2; }
  if (d3 < lineD) { lineD = d3; lineT = 1.0 + t3; }
  if (d4 < lineD) { lineD = d4; lineT = 1.0 + t4; }

  float starD = min(
    min(length(p - s0), length(p - s1)),
    min(min(length(p - s2), length(p - s3)), min(length(p - s4), length(p - s5)))
  );

  float pulse = 0.62 + 0.38 * sin(lineT * 3.2 - tAnim * 1.85 + seed * 2.1);
  float lineGlow = smoothstep(0.013, 0.002, lineD) * 0.48 * pulse;
  float nodeCore = smoothstep(0.026, 0.004, starD);
  float nodeHalo = exp(-starD * starD / 0.0018) * 0.42;
  float crossGlint = (smoothstep(0.007, 0.0, abs(p.x - s1.x)) * smoothstep(0.085, 0.0, abs(p.y - s1.y))
                    + smoothstep(0.007, 0.0, abs(p.y - s1.y)) * smoothstep(0.085, 0.0, abs(p.x - s1.x)))
                    * (0.65 + 0.25 * sin(tAnim * 2.2 + seed));
  vec3 goldTint = mix(vec3(0.74, 0.88, 1.0), vec3(1.0, 0.91, 0.66), fract(seed * 0.37));
  return goldTint * (lineGlow + nodeCore * 1.35 + nodeHalo + crossGlint);
}

void main() {
  vec3 d = normalize(vRay);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float az = (d.x == 0.0 && d.z == 0.0) ? 0.0 : atan(d.x, d.z);
  float tAnim = uTime * uMotion;
  int nebOcts = uLod > 0.5 ? 2 : 4;

  // Smooth deep Aurbic sky gradient from horizon indigo to velvet zenith obsidian.
  float upT = clamp(d.y, 0.0, 1.0);
  vec3 sky = mix(vec3(0.040, 0.068, 0.155), vec3(0.005, 0.010, 0.032), pow(upT, 0.58));

  // Drifting multi-band Aetherius nebulae and shimmering aurora curtains.
  vec3 drift = vec3(tAnim * 0.011, -tAnim * 0.006, tAnim * 0.009);
  float warp = fbm3(d * 2.6 + vec3(2.1, -1.4, 3.7) + drift, nebOcts) - 0.5;
  float band1 = exp(-pow((d.x * 0.52 + d.y * 0.64 - d.z * 0.56 + warp * 0.44), 2.0) / 0.056);
  float band2 = exp(-pow((-d.x * 0.70 + d.y * 0.45 + d.z * 0.55 - warp * 0.38), 2.0) / 0.082);
  float wisp = fbm3(d * 6.2 + warp * 1.75 - drift * 1.6, nebOcts);
  float dust = uLod > 0.5 ? 0.55 : fbm3(d * 11.5 - warp * 1.4 + drift * 2.2, 3);
  float upMask = smoothstep(-0.18, 0.14, el);

  sky += vec3(0.032, 0.086, 0.225) * (band1 + band2 * 0.68) * (0.42 + 0.88 * wisp) * upMask;
  sky += vec3(0.062, 0.195, 0.270) * band1 * pow(clamp(dust * 1.28, 0.0, 1.0), 2.0) * upMask;
  sky += vec3(0.26, 0.20, 0.10) * band1 * pow(clamp(wisp * dust * 2.15, 0.0, 1.0), 2.5) * upMask;

  // Flowing high-vault Aetherius aurora ribbons.
  if (el > 0.06) {
    float aurWave = sin(az * 3.0 + sin(az * 2.0 - tAnim * 0.22) * 1.4 + tAnim * 0.16);
    float aurCurtain = exp(-pow((el - 0.44 - 0.10 * aurWave) / 0.16, 2.0));
    float aurRays = 0.5 + 0.5 * sin(az * 26.0 + warp * 8.0 - tAnim * 0.85);
    vec3 aurCol = mix(vec3(0.10, 0.42, 0.56), vec3(0.68, 0.56, 0.24), 0.35 + 0.65 * aurRays);
    sky += aurCol * aurCurtain * (0.35 + 0.65 * aurRays) * 0.16 * smoothstep(0.06, 0.28, el);
  }

  // Native-resolution sub-pixel anti-aliased twinkling starfields.
  if (el > -0.14) {
    float vis = smoothstep(-0.14, 0.06, el);
    if (uLod < 0.5) {
      sky += evalStarLayer(d, 220.0, 0.16 + 0.20 * band1, 0.62, tAnim, false) * 0.52 * vis;
    }
    sky += evalStarLayer(d, 118.0, 0.085 + 0.075 * band1, 0.88, tAnim, false) * 0.92 * vis;
    sky += evalStarLayer(d, 54.0, 0.032, 1.15, tAnim, true) * 1.25 * vis;
  }

  // Six pulsing Elder Scrolls birthsign constellations ringing the upper vault.
  if (el > 0.10) {
    sky += evalConstellation(d, normalize(vec3(-0.55, 0.58, 0.60)), 1.2, tAnim);
    sky += evalConstellation(d, normalize(vec3(0.58, 0.54, 0.61)), 2.7, tAnim);
    sky += evalConstellation(d, normalize(vec3(-0.82, 0.48, -0.31)), 4.1, tAnim);
    sky += evalConstellation(d, normalize(vec3(0.80, 0.52, -0.30)), 5.6, tAnim);
    sky += evalConstellation(d, normalize(vec3(-0.34, 0.66, -0.67)), 7.3, tAnim);
    sky += evalConstellation(d, normalize(vec3(0.36, 0.62, -0.69)), 8.9, tAnim);
  }

  // Crisp taut cosmic silk arcs framing both flanks of the horizon and Ceporah Citadel into the zenith.
  if (d.y > -0.06) {
    int threadCount = uLod > 0.5 ? 4 : 8;
    float arcAz[8] = float[8](-1.95, -1.32, -0.78, -0.34, 0.72, 1.18, 1.68, 2.38);
    float arcTilt[8] = float[8](0.36, -0.28, 0.42, -0.32, 0.34, -0.38, 0.29, -0.35);
    for (int k = 0; k < 8; k++) {
      if (k >= threadCount) break;
      float fk = float(k);
      float baseAz = arcAz[k];
      float curve = arcTilt[k] * d.y * (1.0 + 0.35 * d.y) + 0.035 * sin(d.y * 5.2 - tAnim * 0.45 + fk * 1.7);
      float plane = sin(az - baseAz - curve) * max(0.22, 1.0 - d.y * 0.52);
      float aaT = clamp(length(fwidth(d)) * 1.15, 0.0012, 0.008);
      float halo = smoothstep(0.018 + aaT, 0.0, abs(plane)) * smoothstep(-0.05, 0.20, d.y);
      float core = smoothstep(0.0028 + aaT, 0.0, abs(plane)) * smoothstep(-0.02, 0.24, d.y);
      float packet = pow(0.5 + 0.5 * sin(d.y * 19.0 - tAnim * 3.1 + fk * 2.3), 5.0);
      vec3 threadCol = mix(vec3(0.50, 0.86, 1.0), vec3(1.0, 0.88, 0.50), 0.5 + 0.46 * sin(fk * 2.1 + 0.4));
      vec3 pktCol = mix(threadCol, vec3(1.0, 0.96, 0.84), packet * 0.55);
      sky += pktCol * (halo * (0.14 + 0.22 * packet) + core * (0.42 + 0.62 * packet));
    }
  }

  // Drifting luminous chasm mist below the horizon and deep nadir glow beneath the sanctum's roots.
  if (el < 0.05) {
    float mistBand = smoothstep(0.05, -0.22, el) * (1.0 - smoothstep(-0.30, -0.82, el));
    float abyssDeep = smoothstep(-0.20, -1.25, el);
    float mistNoise = fbm3(d * 4.4 + vec3(tAnim * 0.03, 0.0, -tAnim * 0.025), nebOcts);
    vec3 chasmMist = vec3(0.062, 0.120, 0.240) + vec3(0.11, 0.085, 0.04) * mistNoise;
    sky = mix(sky, chasmMist, mistBand * 0.78);
    sky = mix(sky, vec3(0.008, 0.015, 0.042), abyssDeep * 0.94);
  }

  // Sub-LSB screen-space blue-noise micro-dither solely to eliminate 8-bit gradient banding.
  float microDither = (h12(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(clamp(sky + microDither, 0.0, 1.0), 1.0);
}
`;

/**
 * @param {Float32Array} view
 * @param {Float32Array} proj
 * @param {{ right: Float32Array, up: Float32Array, fwd: Float32Array, lens: Float32Array }} out
 */
function skyBasisInto(view, proj, out) {
  out.right[0] = view[0]; out.right[1] = view[4]; out.right[2] = view[8];
  out.up[0] = view[1]; out.up[1] = view[5]; out.up[2] = view[9];
  out.fwd[0] = -view[2]; out.fwd[1] = -view[6]; out.fwd[2] = -view[10];
  out.lens[0] = proj[0]; out.lens[1] = proj[5]; out.lens[2] = proj[8]; out.lens[3] = proj[9];
  return out;
}

export class BazaarSkyPass {
  /** @param {any} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    const gl = renderer.gl;
    this.gl = gl;

    this.prog = buildProgram(gl, SKY_VS, SKY_FS, 'bazaar native aurbic sky');
    this.u = {
      right: gl.getUniformLocation(this.prog, 'uRight'),
      up: gl.getUniformLocation(this.prog, 'uUp'),
      fwd: gl.getUniformLocation(this.prog, 'uFwd'),
      proj: gl.getUniformLocation(this.prog, 'uProj'),
      time: gl.getUniformLocation(this.prog, 'uTime'),
      lod: gl.getUniformLocation(this.prog, 'uLod'),
      motion: gl.getUniformLocation(this.prog, 'uMotion'),
    };

    const triVao = gl.createVertexArray();
    gl.bindVertexArray(triVao);
    const triVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, triVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.triVao = triVao;
    this.triVbo = triVbo;

    this._basis = {
      right: new Float32Array(3),
      up: new Float32Array(3),
      fwd: new Float32Array(3),
      lens: new Float32Array(4),
    };
  }

  /**
   * Draw the full native-resolution Aurbic sky at z = 1.0 wherever no opaque geometry wrote depth.
   * @param {Float32Array} proj @param {Float32Array} view @param {number} timeSec
   * @param {number} [lod] @param {boolean} [still]
   */
  draw(proj, view, timeSec, lod = 0, still = false) {
    if (!this.prog) return;
    this.renderer._close2D?.();
    const gl = this.gl;
    const b = skyBasisInto(view, proj, this._basis);
    const U = this.u;

    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    gl.useProgram(this.prog);
    gl.uniform3fv(U.right, b.right);
    gl.uniform3fv(U.up, b.up);
    gl.uniform3fv(U.fwd, b.fwd);
    gl.uniform4fv(U.proj, b.lens);
    gl.uniform1f(U.time, timeSec);
    gl.uniform1f(U.lod, lod);
    gl.uniform1f(U.motion, still ? 0.08 : 1.0);

    gl.bindVertexArray(this.triVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    this.renderer.markForeignPass?.();
  }

  dispose() {
    const gl = this.gl;
    if (this.triVao) { gl.deleteVertexArray(this.triVao); this.triVao = null; }
    if (this.triVbo) { gl.deleteBuffer(this.triVbo); this.triVbo = null; }
    if (this.prog) { gl.deleteProgram(this.prog); this.prog = null; }
  }
}
