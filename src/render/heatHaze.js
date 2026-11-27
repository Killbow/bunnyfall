// @ts-check

import { buildProgram } from './glProgram.js';
import { HAZE, hazeNoise } from '../weather/heatHaze.js';

export const HAZE_AXES = Object.freeze({ a: [0.9239, 0.3827], b: [-0.4226, 0.9063], up: 1.5, scale: 0.0022, k1: 3.6, k2: 7.2 });
export const HAZE_DRIFT = Object.freeze([0.026, -0.30, -0.043, -0.48]);

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform vec3 uCenter;
uniform vec3 uScale;
out vec3 vWorld;
out float vObjY;
void main() {
  vec3 w = uCenter + aPos * uScale;
  vWorld = w;
  vObjY = aPos.y;
  gl_Position = uProj * uView * vec4(w, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in float vObjY;
uniform sampler2D uNoise;
uniform sampler2D uGrab;
uniform float uIntensity;   // _IntensityPixels (the eased strength)
uniform float uNoiseScale;  // _NoiseScale
uniform vec4 uPhase;        // the origin's and the clock's displacement of the two reads, fract'd
uniform vec4 uPort;         // the world's viewport: x, y, width, height in pixels
out vec4 outColor;
void main() {
  float edge = clamp((abs(vObjY) - 25.0) * 0.0222222228, 0.0, 1.0);
  float s = edge * edge * (3.0 - 2.0 * edge);
  if (0.9999 - s < 0.0) discard;
  float strength = (1.0 - s) * uIntensity;
  float k = uNoiseScale * 0.0022;
  vec4 r1 = vec4(dot(vWorld.xz, vec2(0.9239, 0.3827)), vWorld.y * 1.5, dot(vWorld.xz, vec2(-0.4226, 0.9063)), vWorld.y * 1.5) * k;
  vec4 uv = r1 * vec4(3.6, 3.6, 7.2, 7.2) + uPhase;
  vec2 n1 = texture(uNoise, uv.xy).xy - 0.5;
  vec2 n2 = texture(uNoise, uv.zw).yx - 0.5;
  vec2 bend = (n1 * 1.15 + n2 * 0.85) * vec2(0.3, 1.0) * strength;
  bend.y = -bend.y;   // Direct3D's grab is top-down
  vec2 grabUv = (gl_FragCoord.xy - uPort.xy) / uPort.zw + bend / max(uPort.zw, vec2(1.0));
  outColor = texture(uGrab, grabUv);
}`;

export function hazeCylinder(segments = HAZE.cylinderSegments, half = HAZE.cylinderHalfHeight) {
  const pos = new Float32Array(segments * 2 * 3);
  const idx = new Uint16Array(segments * 6);
  for (let i = 0; i < segments; i++) {
    const a = Math.fround(Math.fround(Math.fround(i) * Math.fround(Math.PI)) * 2 / segments);
    const c = Math.cos(a), s = Math.sin(a);
    pos.set([c, -half, s, c, half, s], i * 6);
    const n = (i + 1) % segments, o = i * 6;
    idx.set([i * 2, n * 2 + 1, i * 2 + 1, i * 2, n * 2, n * 2 + 1], o);
  }
  return { pos, idx };
}

// The phase adds the origin shift and the clock in double precision on the CPU, so the shimmer stays fixed to the land.
export function hazePhase(anchor, speedTime, noiseScale, out = [0, 0, 0, 0]) {
  const k = noiseScale * HAZE_AXES.scale;
  const ax = anchor[0] * HAZE_AXES.a[0] + anchor[2] * HAZE_AXES.a[1];
  const bx = anchor[0] * HAZE_AXES.b[0] + anchor[2] * HAZE_AXES.b[1];
  const up = anchor[1] * HAZE_AXES.up;
  out[0] = ax * k * HAZE_AXES.k1; out[1] = up * k * HAZE_AXES.k1; out[2] = bx * k * HAZE_AXES.k2; out[3] = up * k * HAZE_AXES.k2;
  for (let i = 0; i < 4; i++) { const v = out[i] + speedTime * HAZE_DRIFT[i]; out[i] = v - Math.floor(v); }
  return out;
}

export class HeatHazeRenderer {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    this.prog = buildProgram(gl, VS, FS, 'heat haze');
    const L = (n) => gl.getUniformLocation(this.prog, n);
    this.loc = {
      proj: L('uProj'), view: L('uView'), center: L('uCenter'), scale: L('uScale'), noise: L('uNoise'), grab: L('uGrab'),
      intensity: L('uIntensity'), noiseScale: L('uNoiseScale'), phase: L('uPhase'), port: L('uPort'),
    };
    const { pos, idx } = hazeCylinder();
    this.count = idx.length;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.noise = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, HAZE.noiseSize, HAZE.noiseSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, hazeNoise());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.grab = gl.createTexture();
    this.grabW = 0; this.grabH = 0;
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.anchor = [0, 0, 0];
    this._phase = [0, 0, 0, 0];
  }

  offsetOrigin(offset) {
    if (!offset) return;
    this.anchor[0] -= offset[0]; this.anchor[1] -= offset[1]; this.anchor[2] -= offset[2];
  }

  // Returns true when it drew; the caller then marks a foreign pass so the renderer restores its state.
  /**
   * @param {{visible: boolean, intensity: number, center: number[], radius: number, halfHeight: number, noiseScale: number, animationSpeed: number}} state
   * @param {Float32Array|number[]} proj
   * @param {Float32Array|number[]} view
   * @param {number[]} viewport
   * @param {number} seconds
   */
  draw(state, proj, view, viewport, seconds) {
    if (!state?.visible) return false;
    const gl = this.gl;
    const [vx, vy, vw, vh] = viewport;
    if (!(vw > 0 && vh > 0)) return false;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.grab);
    if (vw !== this.grabW || vh !== this.grabH) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, vw, vh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.grabW = vw; this.grabH = vh;
    }
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, vx, vy, vw, vh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.proj, false, proj);
    gl.uniformMatrix4fv(this.loc.view, false, view);
    gl.uniform3f(this.loc.center, state.center[0], state.center[1], state.center[2]);
    gl.uniform3f(this.loc.scale, state.radius, state.halfHeight / HAZE.cylinderHalfHeight, state.radius);
    gl.uniform1i(this.loc.noise, 0);
    gl.uniform1i(this.loc.grab, 1);
    gl.uniform1f(this.loc.intensity, state.intensity);
    gl.uniform1f(this.loc.noiseScale, state.noiseScale);
    gl.uniform4fv(this.loc.phase, hazePhase(this.anchor, state.animationSpeed * seconds, state.noiseScale, this._phase));
    gl.uniform4f(this.loc.port, vx, vy, vw, vh);
    // Only the depth test keeps the near world out of the distortion.
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    return true;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.ebo);
    gl.deleteTexture(this.noise);
    gl.deleteTexture(this.grab);
  }
}
