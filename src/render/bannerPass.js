// @ts-check
import { FOG_FACTOR_GLSL } from './labGrass.js';
import { buildProgram } from './glProgram.js';

export const BANNER_W_M = 0.9;
export const BANNER_H_M = 2.7;
export const BANNER_ROWS = 8;
export const BANNERS_MAX = 16;
export const BANNER_TEXTURE_IDLE_S = 120;
export const BANNER_TEX_W = 64;
// Every rate is a whole number of cycles over this period, so the wrapped clock never makes the sway jump.
export const BANNER_CLOCK_PERIOD = 120;
export const bannerClock = (seconds) => ((seconds % BANNER_CLOCK_PERIOD) + BANNER_CLOCK_PERIOD) % BANNER_CLOCK_PERIOD;
export const BANNER_SWING_HZ = 0.25;
export const BANNER_RIPPLE_HZ = 0.75;

const HEAD = `#version 300 es
precision highp float;
`;
export const BANNER_VS = HEAD + `layout(location = 0) in vec2 aUV;   // x: across the cloth 0..1, y: down it 0..1
uniform mat4 uVP;
uniform vec3 uTop;     // the top edge's middle, in the scene
uniform vec3 uRight;   // along the cloth's width
uniform vec3 uOut;     // its face, out from the wall it hangs on
uniform vec2 uSize;    // width, height (m)
uniform float uTime;   // bannerClock's seconds
uniform float uWind;   // 0..1, the weather's
uniform float uPhase;
out vec2 vUV;
out vec3 vWorld;
void main() {
  float d = aUV.y;
  vec3 p = uTop + uRight * (aUV.x - 0.5) * uSize.x - vec3(0.0, d * uSize.y, 0.0);
  // AUDIT GUILD1d R2: OUT ALONG ITS FACE ALONE - a swing both ways took the cloth's foot through the wall it hangs 0.15 m off
  float swing = 0.5 + 0.5 * sin(uTime * 6.283185307179586 * ${BANNER_SWING_HZ.toFixed(2)} + uPhase + d * 1.6);
  float ripple = 0.5 + 0.5 * sin(uTime * 6.283185307179586 * ${BANNER_RIPPLE_HZ.toFixed(2)} + uPhase * 2.0 + aUV.x * 5.0 + d * 3.0);
  p += uOut * d * d * uSize.y * (0.04 + 0.16 * uWind) * swing;
  p += uOut * d * (0.015 + 0.05 * uWind) * ripple;
  vUV = aUV;
  vWorld = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
export const BANNER_FS = HEAD + `in vec2 vUV;
in vec3 vWorld;
uniform sampler2D uTex;
uniform vec3 uOut;
uniform vec3 uSunDir;
uniform vec3 uAmb;
uniform vec3 uSunCol;
uniform float uSunScale;
uniform vec3 uMoonDir;     // AUDIT GUILD1d R9: the moon, as the world's meshes take it
uniform vec3 uMoonCol;
uniform float uMoonScale;
uniform vec3 uFogColor;
uniform int uFogMode;
uniform float uFogDensity;
uniform vec2 uFogRange;
uniform vec3 uCamPos;
out vec4 o;
${FOG_FACTOR_GLSL}
void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.5) discard;   // the swallowtail's cut
  t.rgb /= t.a;   // AUDIT GUILD1d R8: uploaded premultiplied, so the cut's edge mips average to its colour, never to black
  float face = abs(dot(normalize(uOut), normalize(uSunDir)));
  float moon = abs(dot(normalize(uOut), normalize(uMoonDir)));
  vec3 lit = t.rgb * min(vec3(1.0), uAmb + uSunCol * uSunScale * (0.35 + 0.65 * face) + uMoonCol * uMoonScale * (0.35 + 0.65 * moon));
  vec3 c = mix(uFogColor, lit, fogFactorAt(vWorld));
  o = vec4(dwWaterFog(c, vWorld), 1.0);
}`;

function mat4Multiply(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function clothVertices(rows = BANNER_ROWS) {
  const out = new Float32Array(rows * 6 * 2);
  let o = 0;
  for (let i = 0; i < rows; i++) {
    const a = i / rows, b = (i + 1) / rows;
    for (const [u, v] of [[0, a], [1, a], [1, b], [0, a], [1, b], [0, b]]) { out[o++] = u; out[o++] = v; }
  }
  return out;
}

const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_WATER_FOG = new Float32Array(20);
const NO_HAZE = new Float32Array(8);
const NO_FOCUS = new Float32Array(4);
const GREY = new Float32Array([0.5, 0.5, 0.5]);
const UP = new Float32Array([0, 1, 0]);

export class BannerRenderer {
  /** @param {WebGL2RenderingContext} gl @param {{ paint?: (heraldry: any) => (HTMLCanvasElement|OffscreenCanvas|null) }} [opts] */
  constructor(gl, { paint = null } = {}) {
    this.gl = gl;
    this.paint = paint;
    const prog = buildProgram(gl, BANNER_VS, BANNER_FS);
    this.program = prog;
    this.u = {};
    for (const n of ['uVP', 'uTop', 'uRight', 'uOut', 'uSize', 'uTime', 'uWind', 'uPhase', 'uTex', 'uSunDir', 'uAmb', 'uSunCol', 'uSunScale', 'uMoonDir', 'uMoonCol', 'uMoonScale',
      'uFogColor', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uDwFog', 'uJungleHaze', 'uFocus']) this.u[n] = gl.getUniformLocation(prog, n);
    const verts = clothVertices();
    this.count = verts.length / 2;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.vao = vao;
    this._vp = new Float32Array(16);
    /** @type {Map<string, {tex: WebGLTexture, seen: number}>} */
    this.textures = new Map();
    this.drawn = 0;
  }

  // A heraldry that cannot be painted is retried on the next draw, never cached as missing.
  textureOf(key, heraldry, seconds = 0) {
    const had = this.textures.get(key);
    if (had) { had.seen = seconds; return had.tex; }
    const gl = this.gl;
    const canvas = this.paint?.(heraldry) ?? null;
    let tex = null;
    if (canvas) {
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      // Premultiplied upload keeps the mipmapped edge of the cut from showing a dark rim.
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, /** @type {any} */ (canvas));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    if (tex) this.textures.set(key, { tex, seen: seconds });
    return tex;
  }

  prune(seconds) {
    for (const [key, t] of this.textures) {
      if (seconds - t.seen > BANNER_TEXTURE_IDLE_S) { this.gl.deleteTexture(t.tex); this.textures.delete(key); }
    }
  }

  draw(banners, proj, view, eye, seconds, { light = null, wind = 0, fog = null } = {}) {
    this.drawn = 0;
    this.prune(seconds);
    const list = (Array.isArray(banners) ? banners : []).filter((b) => b && Array.isArray(b.top) && b.top.every(Number.isFinite)).slice(0, BANNERS_MAX);
    if (!list.length) return false;
    const gl = this.gl, U = this.u;
    mat4Multiply(this._vp, proj, view);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform1f(U.uTime, bannerClock(seconds));
    gl.uniform1f(U.uWind, Math.max(0, Math.min(1, Number(wind) || 0)));
    gl.uniform2f(U.uSize, BANNER_W_M, BANNER_H_M);
    gl.uniform3fv(U.uSunDir, light?.sunDir ?? UP);
    gl.uniform3fv(U.uAmb, light?.amb ?? GREY);
    gl.uniform3fv(U.uSunCol, light?.sunCol ?? GREY);
    gl.uniform1f(U.uSunScale, light?.sunScale ?? 0.5);
    gl.uniform3fv(U.uMoonDir, light?.moonDir ?? UP);
    gl.uniform3fv(U.uMoonCol, light?.moonCol ?? GREY);
    gl.uniform1f(U.uMoonScale, light?.moonScale ?? 0);
    gl.uniform3fv(U.uFogColor, fog?.color ?? GREY);
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? eye ?? GREY);
    if (U.uDwFog) gl.uniform4fv(U.uDwFog, fog?.dw ?? NO_WATER_FOG);
    if (U.uJungleHaze) gl.uniform4fv(U.uJungleHaze, fog?.haze ?? NO_HAZE);
    if (U.uFocus) gl.uniform4fv(U.uFocus, fog?.focus ?? NO_FOCUS);
    gl.uniform1i(U.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.CULL_FACE);
    for (const b of list) {
      const tex = this.textureOf(b.key, b.heraldry, seconds);
      if (!tex) continue;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform3f(U.uTop, b.top[0], b.top[1], b.top[2]);
      gl.uniform3f(U.uRight, b.right[0], b.right[1], b.right[2]);
      gl.uniform3f(U.uOut, b.out[0], b.out[1], b.out[2]);
      gl.uniform1f(U.uPhase, Number(b.phase) || 0);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      this.drawn++;
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    // This returns true even when no texture drew, because the program changed and the host must mark the seam.
    return true;
  }
}
