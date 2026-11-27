// @ts-check
import { buildProgram } from '../glProgram.js';
import { sdSkyBasisInto, SD_OCT_GLSL } from '../sdSky.js';
import { DITHER_GLSL, SD_PIXEL_GLSL } from '../orderedDither.js';
import { SKY_ANGLE_PER_PIXEL } from '../skyRenderer.js';
import { EgSkyMap, EG_SKY_MAP, EG_SKY_STEPS } from './egSkyMap.js';

export const EG_SKY_LIGHT = Object.freeze({ pow: 0.5 });
export const egSkyLift = (gain) => Math.pow(Math.max(0, gain), EG_SKY_LIGHT.pow);

export const EG_SKY_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
uniform vec3 uRight, uUp, uFwd;
uniform vec4 uProj;
out vec3 vRay;
void main() {
  vRay = uRight * ((aPos.x + uProj.z) / uProj.x) + uUp * ((aPos.y + uProj.w) / uProj.y) + uFwd;
  gl_Position = vec4(aPos, 1.0, 1.0); }`;
export const EG_SKY_FS = `#version 300 es
precision highp float;
in vec3 vRay;
uniform sampler2D uSkyMap;
uniform float uLift;     // the realm's light at this lane (egSkyLift of the host's gain)
uniform vec3 uFog;       // the frame's own fog: the haze over the realm, and the line itself
uniform float uSteps;    // the pixel law's steps (EG_SKY_STEPS)
out vec4 o;
const float MAP = ${EG_SKY_MAP.toFixed(1)};
const float CELL = ${SKY_ANGLE_PER_PIXEL.toFixed(8)};
${DITHER_GLSL}${SD_PIXEL_GLSL}${SD_OCT_GLSL}
// what the map holds at a direction: the realm's colour (kept in its square root) and the haze's share
vec4 egSkyTap(vec3 c) {
  ivec2 tx = clamp(ivec2(floor(octEncode(c) * MAP)), ivec2(0), ivec2(int(MAP) - 1));
  vec4 t = texelFetch(uSkyMap, tx, 0);
  return vec4(t.rgb * t.rgb, t.a);
}
// the haze over the realm's light
vec3 egSkyHazed(vec4 t) { return mix(t.rgb * uLift, uFog, t.a); }
vec3 egSkyFetch(vec3 d) {
  vec2 cell;
  vec3 c = ringSnap(normalize(d), CELL, cell);
  vec3 s = sdPixel(sqrt(max(egSkyHazed(egSkyTap(c)), vec3(0.0))), floor(cell), uSteps);
  return s * s;
}
void main() { o = vec4(egSkyFetch(vRay), 1.0); }`;

const NO_FOG = new Float32Array(3);

export const EG_SKY_PROGRAMS = /** @type {ReadonlyArray<readonly [string, string]>} */ (Object.freeze([[EG_SKY_VS, EG_SKY_FS]]));

export class EgSkyPass {
  /** @param {WebGL2RenderingContext} gl @param {{ lite?: boolean }} [o] */
  constructor(gl, { lite = false } = {}) {
    this.gl = gl;
    const [[vs, fs]] = EG_SKY_PROGRAMS;
    this.program = buildProgram(gl, vs, fs, 'eg sky');
    this.u = {};
    for (const n of ['uRight', 'uUp', 'uFwd', 'uProj', 'uSkyMap', 'uLift', 'uFog', 'uSteps']) this.u[n] = gl.getUniformLocation(this.program, n);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this._b = { right: new Float32Array(3), up: new Float32Array(3), fwd: new Float32Array(3), lens: new Float32Array(4) };
    this.map = new EgSkyMap(gl, { lite });
    this.drawn = false;
  }
  paint(band, seconds, viewport = null) { return this.map.paint(band, seconds, viewport); }
  /**
   * @param {ArrayLike<number>} proj
   * @param {ArrayLike<number>} view
   * @param {number} band
   * @param {number} [gain]
   * @param {Float32Array|number[]|null} [fog]
   * @param {number} [steps]
   */
  draw(proj, view, band, gain = 1, fog = null, steps = /** @type {number} */ (EG_SKY_STEPS.lane)) {
    this.drawn = false;
    if (!this.program || !this.map.holds(band | 0)) return false;
    const gl = this.gl, U = this.u, b = sdSkyBasisInto(view, proj, this._b);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.useProgram(this.program);
    gl.uniform3fv(U.uRight, b.right); gl.uniform3fv(U.uUp, b.up); gl.uniform3fv(U.uFwd, b.fwd); gl.uniform4fv(U.uProj, b.lens);
    gl.uniform1f(U.uLift, egSkyLift(gain));
    gl.uniform3fv(U.uFog, fog ?? NO_FOG);
    gl.uniform1f(U.uSteps, steps);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.map.texture); gl.uniform1i(U.uSkyMap, 0);
    gl.depthMask(false);
    // The triangle sits at the far plane, so LEQUAL draws only where the depth is still cleared.
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    this.drawn = true;
    return true;
  }
  destroy() {
    const gl = this.gl;
    if (!this.program) return;
    this.map.release();
    gl.deleteBuffer(this.vbo); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
    this.program = /** @type {any} */ (null);
  }
}
