// @ts-check
// The shader composes each frame from the two paints and the snow with the same integer arithmetic as
// composeTiledPicture, so only the paints and the snow are uploaded.
// Each paint uploads as a mip chain that texelFetch reads at the level NEAREST_MIPMAP_NEAREST would pick,
// so a far strip does not boil.

import { buildProgram, startPrograms } from './glProgram.js';
import { FOG_GLSL } from './fogGlsl.js';
import { BAYER_8X8, WAVE_MATERIAL, wavePaintLevels, wavePictureMean } from '../systems/naval/comeSailAwayWaves.js';
import { WATER_LAYER_UNITS } from './waterSurface.js';
import { quatRotateInto } from '../world/quat.js';
const _flagP = [0, 0, 0], _flagN = [0, 0, 0];

const WAVE_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uOrigin;
uniform float uScale;
uniform vec2 uTile;
out vec2 vUv;
out vec3 vNormal;
out vec3 vWorldPos;
void main() {
  vec3 w = uOrigin + aPos * uScale;   // the wave object: its position, 819.2 to a unit, no rotation
  vWorldPos = w;
  vNormal = aNormal;                  // a uniform scale turns no normal
  vUv = aUv * uTile;                  // TRANSFORM_TEX: _MainTex_ST (10, 10, 0, 0)
  gl_Position = uProj * uView * vec4(w, 1.0);
}`;

export const WAVE_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
in vec3 vNormal;
in vec3 vWorldPos;
uniform highp sampler2D uPaint;   // the frame's paint, its rows top-down as the picture has them (#4: its chain - past level 0 the frame's means)
uniform highp sampler2D uSnow;    // TEXTURE.303 record 1, top-down
uniform ivec2 uFrameSize;
uniform ivec2 uSnowSize;
uniform int uLastLevel;           // #4: the chain's last level
uniform int uScroll;
uniform ivec2 uTileOffset;
const float BAYER[64] = float[64](${BAYER_8X8.map((v) => `${v}.0`).join(', ')});   // _DitherPattern's red, unorm8
uniform vec4 uColor;
uniform float uCutoff;
uniform float uDitherStart;
uniform float uDitherEnd;
uniform vec3 uAmbient;
uniform vec3 uSunColor;
uniform float uSunScale;
uniform vec3 uLightDir;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
out vec4 outColor;
${FOG_GLSL}
int wrapi(int a, int n) { int m = a % n; return m < 0 ? m + n : m; }
// #4: the level NEAREST_MIPMAP_NEAREST picks (GL ES 3.0 3.8.10-11, the magnification filter NEAREST): lambda from the
// texel footprint along the unwrapped uv, level 0 at magnification and to half a level past it
int waveLevel(vec2 uv) {
  vec2 t = uv * vec2(uFrameSize);
  vec2 dx = dFdx(t), dy = dFdy(t);
  float lambda = min(0.5 * log2(max(dot(dx, dx), dot(dy, dy))), 32.0);   // bounded: int() of an infinity is undefined
  return lambda > 0.5 ? min(int(ceil(lambda + 0.5)) - 1, uLastLevel) : 0;
}
// #4: a level-0 texel's texel at level L - floor((c + 0.5) * size_L / size_0), the map the chain was built by
ivec2 atLevel(ivec2 c, ivec2 size0, ivec2 sizeL) { return min(ivec2((vec2(c) + 0.5) * vec2(sizeL) / vec2(size0)), sizeL - 1); }
// the frame's texel under uv - composeTiledPicture's pixel: Unity's point sample with Repeat picks texel
// floor(frac(uv) * size), its row 0 the picture's bottom. Premultiplied, its alpha the frame's coverage there (level 0's
// 0 or 1 - the paint's own alpha is 0 or 255 in every one of the author's texels); #4: past level 0, the chain's mean
vec4 waveTexel(vec2 uv, int L) {
  ivec2 t = clamp(ivec2(floor(fract(uv) * vec2(uFrameSize))), ivec2(0), uFrameSize - 1);
  int x = t.x;
  int y = uFrameSize.y - 1 - t.y;
  ivec2 at = ivec2(x, wrapi(y + uScroll, uFrameSize.y));
  if (L > 0) return texelFetch(uPaint, atLevel(at, uFrameSize, textureSize(uPaint, L)), L);
  vec4 p = texelFetch(uPaint, at, 0);
  if (p == vec4(1.0, 0.0, 1.0, 1.0)) {   // the key, ff00ffff: the record's pixel, opaque
    vec3 s = texelFetch(uSnow, ivec2(wrapi(x + uTileOffset.x, uSnowSize.x), wrapi(y + uTileOffset.y, uSnowSize.y)), 0).rgb;
    return vec4(s, 1.0);
  }
  return vec4(p.rgb * p.a, p.a);
}
void main() {
  int L = waveLevel(vUv);   // #4: before any discard - the derivatives are the quad's
  float d = abs(vUv.y * 0.100000001 - 0.5) * 2.0 - uDitherStart;
  float x = clamp(d * (1.0 / (uDitherEnd - uDitherStart)), 0.0, 1.0);
  float a = 1.0 - (3.0 - 2.0 * x) * (x * x);
  ivec2 px = ivec2(gl_FragCoord.xy) & 7;
  if (a - BAYER[px.y * 8 + px.x] / 255.0 < 0.0) discard;
  vec4 tex = waveTexel(vUv, L);
  if (L == 0) {
    if (tex.a * uColor.a - uCutoff < 0.0) discard;
  } else if (tex.a * uColor.a - BAYER[((px.y + 4) & 7) * 8 + ((px.x + 4) & 7)] / 255.0 < 0.0) discard;   // #4: a minified texel's coverage, dithered
  vec4 c = vec4(tex.rgb / tex.a, tex.a) * uColor;
  vec3 lit = c.rgb * (uAmbient + uSunColor * (uSunScale * max(dot(vNormal, uLightDir), 0.0)));
  outColor = vec4(dwWaterFog(mix(uFogColor, lit, fogFactorAt(vWorldPos)), vWorldPos), c.a);   // and Iliac Puddle No More's water, under it
}`;

const PART_VS = `#version 300 es
layout(location = 0) in vec3 aCentre;
layout(location = 1) in vec2 aCorner;
layout(location = 2) in vec3 aSizeRotMax;   // size, rotation (radians), maxParticleSize
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCamPos;
uniform float uViewScale;   // 2 / cot(fov / 2): the view's height in world units per unit of distance
out vec2 vUv;
out vec3 vWorldPos;
void main() {
  float d = max(length(aCentre - uCamPos), 1e-3);
  float size = min(aSizeRotMax.x, aSizeRotMax.z * uViewScale * d);
  float c = cos(aSizeRotMax.y), s = sin(aSizeRotMax.y);
  vec2 k = vec2(c * aCorner.x - s * aCorner.y, s * aCorner.x + c * aCorner.y) * size;
  vec3 w = aCentre + vec3(k.x, 0.0, k.y);   // flat, facing up
  vWorldPos = w;
  vUv = vec2(aCorner.x + 0.5, 0.5 - aCorner.y);   // the picture's top row at the quad's -z edge (uploaded top-down)
  gl_Position = uProj * uView * vec4(w, 1.0);
}`;
export const PART_CUT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vWorldPos;
uniform sampler2D uTex;
uniform vec4 uColor;
uniform float uCutoff;
uniform vec3 uAmbient;
uniform vec3 uSunColor;
uniform float uSunScale;
uniform vec3 uLightDir;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec4 t = texture(uTex, vUv);
  if (t.a * uColor.a - uCutoff < 0.0) discard;
  vec4 c = t * uColor;
  vec3 lit = c.rgb * (uAmbient + uSunColor * (uSunScale * max(uLightDir.y, 0.0)));   // the quad's normal is up
  outColor = vec4(dwWaterFog(mix(uFogColor, lit, fogFactorAt(vWorldPos)), vWorldPos), c.a);
}`;
export const PART_PREMUL_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vWorldPos;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  vec4 c = vec4(1.0);   // the particles' start colour, white
  outColor = texture(uTex, vUv) * c * c.a;
}`;
const CUBE_VS = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform mat4 uProj;
uniform mat4 uView;
out vec3 vNormal;
out vec3 vWorldPos;
void main() {
  vWorldPos = aPos;
  vNormal = aNormal;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;
export const CUBE_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorldPos;
uniform vec4 uColor;
uniform vec3 uAmbient;
uniform vec3 uSunColor;
uniform float uSunScale;
uniform vec3 uLightDir;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
out vec4 outColor;
${FOG_GLSL}
void main() {
  vec3 lit = uColor.rgb * (uAmbient + uSunColor * (uSunScale * max(dot(normalize(vNormal), uLightDir), 0.0)));
  outColor = vec4(dwWaterFog(mix(uFogColor, lit, fogFactorAt(vWorldPos)), vWorldPos), 1.0);
}`;
const CUBE_FACES = [
  { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
];
// Each face's triangles wind so that cross(b - a, c - a) points out, Unity's front face.
export const CUBE_TRIANGLES = (() => {
  const out = [];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const { n, u, v } of CUBE_FACES) {
    const corner = (su, sv) => [0, 1, 2].map((i) => n[i] * 0.5 + u[i] * su * 0.5 + v[i] * sv * 0.5);
    let q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const c = cross([q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]]);
    if (c[0] * n[0] + c[1] * n[1] + c[2] * n[2] < 0) q = [q[0], q[3], q[2], q[1]];
    for (const i of [0, 1, 2, 0, 2, 3]) out.push({ p: q[i], n });
  }
  return out;
})();
/**
 * @param {any[]} flags
 * @returns {{ color: number[] | null, list: any[] }[]}
 */
export function flagRuns(flags) {
  const runs = new Map();
  for (const q of flags) {
    const key = Array.isArray(q.color) ? q.color.join(',') : '';
    let run = runs.get(key);
    if (!run) { run = { color: Array.isArray(q.color) ? q.color : null, list: [] }; runs.set(key, run); }
    run.list.push(q);
  }
  return [...runs.values()];
}
// The disc is premultiplied (rgb equals alpha): its material blends One, OneMinusSrcAlpha and takes rgb whole.
export function softParticleTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
    const r = Math.min(1, Math.hypot(dx, dy));
    const a = Math.round(255 * Math.pow(1 - r, 2));
    const i = (y * size + x) * 4;
    data[i] = a; data[i + 1] = a; data[i + 2] = a; data[i + 3] = a;
  }
  return { width: size, height: size, data };
}

const locs = (gl, p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
const LIGHT_FOG = ['uAmbient', 'uSunColor', 'uSunScale', 'uLightDir', 'uCamPos', 'uFogColor', 'uFogMode', 'uFogDensity', 'uFogRange', 'uDwFog', 'uFocus', 'uJungleHaze'];

const uploadLevels = (gl, levels) => {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  levels.forEach((l, i) => gl.texImage2D(gl.TEXTURE_2D, i, gl.RGBA8, l.width, l.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, l.data));
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels.length - 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
};

const uploadPicture = (gl, pic) => {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pic.width, pic.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pic.data);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
};

export const CSA_PART_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze([[PART_VS, PART_CUT_FS], [PART_VS, PART_PREMUL_FS], [CUBE_VS, CUBE_FS]]));
export const CSA_WAVE_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze([[WAVE_VS, WAVE_FS]]));

export class ComeSailAwayRenderer {
  /** @param {any} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.gl = renderer.gl;
    this._wave = null;
    /** @type {{ paints: WebGLTexture[], lastLevel: number, snow: WebGLTexture, snowSize: number[], specs: any[] } | null} */
    this._frames = null;
    this._mesh = null;
    this._part = null;
    /** @type {Map<string, WebGLTexture>} */ this._partTex = new Map();
  }

  setParticleTexture(name, pic, { linear = false } = {}) {
    const gl = this.gl;
    const tex = uploadPicture(gl, pic);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const old = this._partTex.get(name);
    if (old) gl.deleteTexture(old);
    this._partTex.set(name, tex);
    this.renderer.markForeignPass?.();
  }
  hasParticleTexture(name) { return this._partTex.has(name); }

  warmSteps() {
    return [
      { start: () => startPrograms(this.gl, CSA_PART_PROGRAMS), run: () => { this._ensurePart(); }, need: () => !this._part },
      { start: () => startPrograms(this.gl, CSA_WAVE_PROGRAMS), run: () => { this._ensureWave(); }, need: () => !this._wave },
    ];
  }

  _ensurePart() {
    if (this._part) return this._part;
    const gl = this.gl;
    const [cutSrc, preSrc, cubeSrc] = CSA_PART_PROGRAMS;
    const cut = buildProgram(gl, cutSrc[0], cutSrc[1], 'come sail away particles (cut out)');
    const pre = buildProgram(gl, preSrc[0], preSrc[1], 'come sail away particles (premultiplied)');
    const cube = buildProgram(gl, cubeSrc[0], cubeSrc[1], 'come sail away particles (cube)');
    const base = ['uProj', 'uView', 'uCamPos', 'uViewScale', 'uTex'];
    const stream = (stride, attrs) => {
      const vao = gl.createVertexArray(), vbo = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      for (const [loc, n, off] of attrs) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off); }
      gl.bindVertexArray(null);
      return { vao, vbo, cap: 0 };
    };
    this._part = {
      cut: { p: cut, u: locs(gl, cut, [...base, 'uColor', 'uCutoff', ...LIGHT_FOG]) },
      pre: { p: pre, u: locs(gl, pre, base) },
      cube: { p: cube, u: locs(gl, cube, ['uProj', 'uView', 'uColor', ...LIGHT_FOG]) },
      quads: stream(32, [[0, 3, 0], [1, 2, 12], [2, 3, 20]]),
      cubes: stream(24, [[0, 3, 0], [1, 3, 12]]),
    };
    return this._part;
  }

  _lightFog(u) {
    const gl = this.gl, r = this.renderer;
    gl.uniform3fv(u.uAmbient, r._ambient);
    gl.uniform3fv(u.uSunColor, r._sunColor);
    gl.uniform1f(u.uSunScale, r._sunScale ?? 0);
    gl.uniform3fv(u.uLightDir, r._lightDir);
    gl.uniform3fv(u.uCamPos, r._camPos);
    gl.uniform3fv(u.uFogColor, r._fogColor);
    gl.uniform1i(u.uFogMode, r._fogMode);
    gl.uniform1f(u.uFogDensity, r._fogDensity);
    gl.uniform2fv(u.uFogRange, r._fogRange);
    if (r._dwFog) gl.uniform4fv(u.uDwFog, r._dwFog);
    if (u.uFocus) gl.uniform4fv(u.uFocus, r._focus);
    if (u.uJungleHaze && r._haze) gl.uniform4fv(u.uJungleHaze, r._haze);
  }

  _fillQuads(st, parts) {
    const gl = this.gl;
    const n = parts.length * 6;
    if (st.cap < n) { st.cap = Math.max(n, st.cap * 2, 96); st.data = new Float32Array(st.cap * 8); gl.bindBuffer(gl.ARRAY_BUFFER, st.vbo); gl.bufferData(gl.ARRAY_BUFFER, st.data.byteLength, gl.STREAM_DRAW); }
    const d = st.data;
    // Wound so that cross(b - a, c - a) points up, Unity's front face seen from above.
    const corners = [[-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, 0.5], [0.5, -0.5]];
    let o = 0;
    for (const q of parts) {
      for (const c of corners) { d[o++] = q.position[0]; d[o++] = q.position[1]; d[o++] = q.position[2]; d[o++] = c[0]; d[o++] = c[1]; d[o++] = q.size[0]; d[o++] = q.rotation[2]; d[o++] = q.maxSize; }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, st.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, o));
    return n;
  }

  /**
   * @param {{ wake: any[], flags: any[] }} lists
   * @param {(q: number[], r: number[]) => number[]} rotate
   */
  drawParticlesOpaque({ wake, flags }, rotate) {
    const gl = this.gl, r = this.renderer;
    if (!wake.length && !flags.length) return;
    const P = this._ensurePart();
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    if (wake.length && this._partTex.has('112395_0-0')) {
      const u = P.cut.u;
      gl.useProgram(P.cut.p);
      gl.uniformMatrix4fv(u.uProj, false, r._proj);
      gl.uniformMatrix4fv(u.uView, false, r._view);
      gl.uniform1f(u.uViewScale, 2 / Math.abs(r._proj[5] || 1));
      gl.uniform4f(u.uColor, 1, 1, 1, 1);
      gl.uniform1f(u.uCutoff, 0.5);
      this._lightFog(u);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this._partTex.get('112395_0-0'));
      gl.uniform1i(u.uTex, 0);
      gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(P.quads.vao);
      const n = this._fillQuads(P.quads, wake);
      gl.drawArrays(gl.TRIANGLES, 0, n);
      gl.bindVertexArray(null);
    }
    if (flags.length) {
      const u = P.cube.u, st = P.cubes;
      const n = flags.length * CUBE_TRIANGLES.length;
      if (st.cap < n) { st.cap = Math.max(n, st.cap * 2, 360); st.data = new Float32Array(st.cap * 6); gl.bindBuffer(gl.ARRAY_BUFFER, st.vbo); gl.bufferData(gl.ARRAY_BUFFER, st.data.byteLength, gl.STREAM_DRAW); }
      const d = st.data;
      let o = 0;
      const spans = [];
      for (const run of flagRuns(flags)) {
        const first = o / 6;
        for (const q of run.list) {
          const rot = rotate(q.systemRotation, q.rotation);
          // The corner and normal turn in scratch triples, matching quatRotate to the bit without new arrays.
          for (const t of CUBE_TRIANGLES) {
            const p = quatRotateInto(rot, t.p[0] * q.size[0], t.p[1] * q.size[1], t.p[2] * q.size[2], _flagP);
            const nn = quatRotateInto(rot, t.n[0] / (q.size[0] || 1), t.n[1] / (q.size[1] || 1), t.n[2] / (q.size[2] || 1), _flagN);
            d[o++] = q.position[0] + p[0]; d[o++] = q.position[1] + p[1]; d[o++] = q.position[2] + p[2];
            d[o++] = nn[0]; d[o++] = nn[1]; d[o++] = nn[2];
          }
        }
        spans.push({ color: run.color, first, count: o / 6 - first });
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, st.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.subarray(0, o));
      gl.useProgram(P.cube.p);
      gl.uniformMatrix4fv(u.uProj, false, r._proj);
      gl.uniformMatrix4fv(u.uView, false, r._view);
      this._lightFog(u);
      gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(st.vao);
      for (const sp of spans) {
        if (sp.color) gl.uniform4f(u.uColor, sp.color[0], sp.color[1], sp.color[2], 1);
        else gl.uniform4f(u.uColor, 1, 0.5, 0, 1);
        gl.drawArrays(gl.TRIANGLES, sp.first, sp.count);
      }
      gl.bindVertexArray(null);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.depthFunc(gl.LESS);
    r.markForeignPass?.();
  }

  // Drawn after the transparent top of the sea.
  drawParticlesBlended(drops) {
    if (!drops.length || !this._partTex.has('Default-Particle')) return;
    const gl = this.gl, r = this.renderer;
    const P = this._ensurePart();
    const u = P.pre.u;
    gl.useProgram(P.pre.p);
    gl.uniformMatrix4fv(u.uProj, false, r._proj);
    gl.uniformMatrix4fv(u.uView, false, r._view);
    gl.uniform3fv(u.uCamPos, r._camPos);
    gl.uniform1f(u.uViewScale, 2 / Math.abs(r._proj[5] || 1));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._partTex.get('Default-Particle'));
    gl.uniform1i(u.uTex, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(P.quads.vao);
    const n = this._fillQuads(P.quads, drops);
    gl.drawArrays(gl.TRIANGLES, 0, n);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.depthFunc(gl.LESS);
    r.markForeignPass?.();
  }

  /** @param {{ paints: {width:number,height:number,data:Uint8Array}[], snow: {width:number,height:number,data:Uint8Array}, specs: {paint:number, scroll:number, tile:number[], size:number[]}[] }} frames */
  setWaveFrames(frames) {
    const gl = this.gl;
    const snowMean = wavePictureMean(frames.snow);
    const chains = frames.paints.map((p) => wavePaintLevels(p, snowMean));
    this._frames = { paints: chains.map((c) => uploadLevels(gl, c)), lastLevel: chains[0] ? chains[0].length - 1 : 0, snow: uploadPicture(gl, frames.snow), snowSize: [frames.snow.width, frames.snow.height], specs: frames.specs };
    this.renderer.markForeignPass?.();
  }
  get hasWaveFrames() { return !!this._frames; }

  _ensureWave() {
    if (this._wave) return this._wave;
    const gl = this.gl;
    const [[vs, fs]] = CSA_WAVE_PROGRAMS;
    const p = buildProgram(gl, vs, fs, 'come sail away waves');
    this._wave = { p, u: locs(gl, p, ['uProj', 'uView', 'uOrigin', 'uScale', 'uTile', 'uPaint', 'uSnow', 'uFrameSize', 'uSnowSize', 'uLastLevel', 'uScroll', 'uTileOffset',
      'uColor', 'uCutoff', 'uDitherStart', 'uDitherEnd', 'uAmbient', 'uSunColor', 'uSunScale', 'uLightDir', 'uCamPos', 'uFogColor', 'uFogMode', 'uFogDensity', 'uFogRange', 'uDwFog', 'uFocus', 'uJungleHaze']),
    vao: gl.createVertexArray(), vbo: gl.createBuffer(), ebo: gl.createBuffer() };
    return this._wave;
  }

  _uploadMesh(w, mesh) {
    if (this._mesh?.from === mesh) return;
    const gl = this.gl;
    const n = mesh.vertices.length / 3;
    const data = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      data.set(mesh.vertices.subarray(i * 3, i * 3 + 3), i * 8);
      data.set(mesh.normals.subarray(i * 3, i * 3 + 3), i * 8 + 3);
      data.set(mesh.uvs.subarray(i * 2, i * 2 + 2), i * 8 + 6);
    }
    gl.bindVertexArray(w.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, w.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, w.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    this._mesh = { from: mesh, count: mesh.indices.length };
  }

  /**
   * @param {{ position:number[], scale:number, mesh:any, frame:number }} waves
   * @param {{ start:number, end:number }} dither
   */
  drawWaves(waves, dither) {
    if (!waves?.mesh || !this._frames) return;
    const spec = this._frames.specs[waves.frame];
    if (!spec) return;
    const gl = this.gl, r = this.renderer;
    const w = this._ensureWave();
    this._uploadMesh(w, waves.mesh);
    const u = w.u;
    gl.useProgram(w.p);
    gl.uniformMatrix4fv(u.uProj, false, r._proj);
    gl.uniformMatrix4fv(u.uView, false, r._view);
    gl.uniform3fv(u.uOrigin, waves.position);
    gl.uniform1f(u.uScale, waves.scale);
    gl.uniform2f(u.uTile, WAVE_MATERIAL.tile[0], WAVE_MATERIAL.tile[1]);
    gl.uniform2i(u.uFrameSize, spec.size[0], spec.size[1]);
    gl.uniform2i(u.uSnowSize, this._frames.snowSize[0], this._frames.snowSize[1]);
    gl.uniform1i(u.uLastLevel, this._frames.lastLevel);
    gl.uniform1i(u.uScroll, spec.scroll);
    gl.uniform2i(u.uTileOffset, spec.tile[0], spec.tile[1]);
    gl.uniform4fv(u.uColor, WAVE_MATERIAL.color);
    gl.uniform1f(u.uCutoff, WAVE_MATERIAL.cutoff);
    gl.uniform1f(u.uDitherStart, dither.start);
    gl.uniform1f(u.uDitherEnd, dither.end);
    gl.uniform3fv(u.uAmbient, r._ambient);
    gl.uniform3fv(u.uSunColor, r._sunColor);
    gl.uniform1f(u.uSunScale, r._sunScale ?? 0);
    gl.uniform3fv(u.uLightDir, r._lightDir);
    gl.uniform3fv(u.uCamPos, r._camPos);
    gl.uniform3fv(u.uFogColor, r._fogColor);
    gl.uniform1i(u.uFogMode, r._fogMode);
    gl.uniform1f(u.uFogDensity, r._fogDensity);
    gl.uniform2fv(u.uFogRange, r._fogRange);
    if (r._dwFog) gl.uniform4fv(u.uDwFog, r._dwFog);
    if (u.uFocus) gl.uniform4fv(u.uFocus, r._focus);
    if (u.uJungleHaze && r._haze) gl.uniform4fv(u.uJungleHaze, r._haze);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._frames.paints[spec.paint]);
    gl.uniform1i(u.uPaint, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._frames.snow);
    gl.uniform1i(u.uSnow, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    // The polygon offset puts the waves in their layer of the sea's stack, over the ground and the surface film.
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(0, WATER_LAYER_UNITS.breakers);
    gl.bindVertexArray(w.vao);
    gl.drawElements(gl.TRIANGLES, this._mesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.depthFunc(gl.LESS);
    r.markForeignPass?.();
  }

  dispose() {
    const gl = this.gl;
    if (this._wave) { gl.deleteProgram(this._wave.p); gl.deleteVertexArray(this._wave.vao); gl.deleteBuffer(this._wave.vbo); gl.deleteBuffer(this._wave.ebo); this._wave = null; }
    if (this._frames) { for (const t of this._frames.paints) gl.deleteTexture(t); gl.deleteTexture(this._frames.snow); this._frames = null; }
    if (this._part) {
      for (const k of ['cut', 'pre', 'cube']) gl.deleteProgram(this._part[k].p);
      for (const k of ['quads', 'cubes']) { gl.deleteVertexArray(this._part[k].vao); gl.deleteBuffer(this._part[k].vbo); }
      this._part = null;
    }
    for (const t of this._partTex.values()) gl.deleteTexture(t);
    this._partTex.clear();
    this._mesh = null;
  }
}
