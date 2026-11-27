// @ts-check
// Super dungeon omen column: the gate beacon's shaders and geometry under this pass's own program and color,
// so the gate module stays unchanged.
import { BEACON_VS, BEACON_FS, BEACON_RADIUS_M, beaconVertices, gateClock } from './gatePass.js';
import { buildProgram } from './glProgram.js';
import { multiply } from '../world/mat4.js';

export const SD_OMEN_COLOR = Object.freeze([1.0, 0.7, 0.26]);

const NO_FOG_RANGE = new Float32Array([0, 1]);
const NO_FOCUS = new Float32Array(4);
const NO_HAZE = new Float32Array(8);
const WHITE = new Float32Array([1, 1, 1]);

export class SdOmenPassRenderer {
  /** @param {WebGL2RenderingContext} gl @param {ArrayLike<number>} [color] */
  constructor(gl, color = SD_OMEN_COLOR) {
    this.gl = gl;
    this._color = new Float32Array(color);
    this.program = buildProgram(gl, BEACON_VS, BEACON_FS, 'sd omen');
    this.u = {};
    for (const n of ['uVP', 'uOrigin', 'uEye', 'uRadius', 'uTime', 'uFade', 'uColor', 'uFogMode', 'uFogDensity', 'uFogRange', 'uCamPos', 'uFocus', 'uJungleHaze']) this.u[n] = gl.getUniformLocation(this.program, n);
    const verts = beaconVertices();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.count = verts.length / 2;
    this._vp = new Float32Array(16);
    this.drawn = 0;
  }

  draw(omens, proj, view, eye, seconds, fog = null) {
    this.drawn = 0;
    const list = (Array.isArray(omens) ? omens : []).filter((o) => o && Array.isArray(o.origin) && o.origin.length === 3 && o.origin.every(Number.isFinite) && o.fade > 0.001);
    if (!list.length) return 0;
    const gl = this.gl, U = this.u;
    multiply(proj, view, this._vp);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(U.uVP, false, this._vp);
    gl.uniform1f(U.uTime, gateClock(seconds));
    gl.uniform1f(U.uRadius, BEACON_RADIUS_M);
    gl.uniform3fv(U.uEye, eye ?? fog?.camPos ?? WHITE);
    gl.uniform3fv(U.uColor, this._color);
    gl.uniform1i(U.uFogMode, fog ? fog.mode : 0);
    gl.uniform1f(U.uFogDensity, fog?.density ?? 0);
    gl.uniform2fv(U.uFogRange, fog?.range ?? NO_FOG_RANGE);
    gl.uniform3fv(U.uCamPos, fog?.camPos ?? eye ?? WHITE);
    if (U.uFocus) gl.uniform4fv(U.uFocus, fog?.focus ?? NO_FOCUS);
    if (U.uJungleHaze) gl.uniform4fv(U.uJungleHaze, fog?.haze ?? NO_HAZE);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.vao);
    for (const o of list) {
      gl.uniform3f(U.uOrigin, o.origin[0], o.origin[1], o.origin[2]);
      gl.uniform1f(U.uFade, Math.min(1, o.fade));
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      this.drawn++;
    }
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    return this.drawn;
  }
}
