// @ts-check
// BUNNYFALL SPELL VISUALS, DRAWN: motes about a body under a lasting effect (systems/effectVisuals.js bits) - embers
// rising off the burning, flakes falling off the frozen, sparks crackling round the shocked, green bubbles off the
// poisoned, violet motes round magic, and a bubble round the head of a Water Breather. One point-sprite draw a frame,
// every mote placed from the clock and its body's seed (nothing kept between frames); added onto the frame (ONE, ONE),
// tested against the world's depth and never writing it.
import { buildProgram } from './glProgram.js';
import { FX_FIRE, FX_FROST, FX_SHOCK, FX_POISON, FX_BUBBLE, FX_MAGIC } from '../systems/effectVisuals.js';

export const MOTES_MAX = 2048;
const STRIDE = 9;   // x y z, r g b a, size, shape (0 a soft dot, 1 a ring)

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aColor;
layout(location=2) in float aSize;
layout(location=3) in float aShape;
uniform mat4 uProj, uView;
uniform float uScale;
out vec4 vColor;
out float vShape;
void main() {
  vec4 v = uView * vec4(aPos, 1.0);
  gl_Position = uProj * v;
  gl_PointSize = clamp(aSize * uScale / max(0.2, -v.z), 1.0, 256.0);
  vColor = aColor; vShape = aShape;
}`;

const FS = `#version 300 es
precision mediump float;
in vec4 vColor;
in float vShape;
out vec4 frag;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0) discard;
  float a;
  if (vShape > 0.5) {
    float rim = smoothstep(0.78, 0.93, d) * (1.0 - smoothstep(0.93, 1.0, d));
    float shine = 1.0 - smoothstep(0.0, 0.22, length(c - vec2(-0.38, -0.38)));
    a = rim + 0.08 * d + 0.7 * shine;
  } else {
    a = (1.0 - d) * (1.0 - d);
  }
  frag = vec4(vColor.rgb * vColor.a * a, 1.0);
}`;

const fract = (x) => x - Math.floor(x);
const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);

/**
 * The motes of `bodies` at `t` seconds into `out` (STRIDE floats each); answers how many. A body is
 * `{ at: [x, y, z] the feet, height, bits, seed }`. Pure.
 */
export function motesInto(bodies, t, out) {
  let n = 0;
  const max = Math.floor(out.length / STRIDE);
  const put = (x, y, z, r, g, b, a, size, shape) => {
    if (n >= max) return;
    const o = n++ * STRIDE;
    out[o] = x; out[o + 1] = y; out[o + 2] = z; out[o + 3] = r; out[o + 4] = g; out[o + 5] = b; out[o + 6] = a;
    out[o + 7] = size; out[o + 8] = shape;
  };
  for (const w of bodies) {
    const [fx, fy, fz] = w.at, h = w.height || 1.8, s = w.seed || 0, bits = w.bits | 0;
    if (bits & FX_FIRE) for (let i = 0; i < 18; i++) {
      const p = fract(t * 0.8 + i / 18 + s), ang = i * 2.4 + s * 6.3 + t * 0.6, r = 0.28 * (1 - p * 0.6) + 0.05 * Math.sin(t * 5 + i);
      put(fx + Math.cos(ang) * r, fy + h * (0.1 + p * 0.95), fz + Math.sin(ang) * r, 1, 0.45 + 0.4 * (1 - p), 0.12, 1 - p, 0.22 * (1 - p * 0.5), 0);
    }
    if (bits & FX_FROST) for (let i = 0; i < 14; i++) {
      const p = fract(t * 0.35 + i / 14 + s), ang = i * 2.1 + s * 5 + p * 2.5, r = 0.32 + 0.08 * Math.sin(i);
      put(fx + Math.cos(ang) * r, fy + h * (1.05 - p), fz + Math.sin(ang) * r, 0.7, 0.88, 1, 0.9 * Math.sin(p * Math.PI), 0.09, 0);
    }
    if (bits & FX_SHOCK) {
      const step = Math.floor(t * 14);
      for (let i = 0; i < 10; i++) {
        const k = step * 31 + i * 7 + s * 1000;
        if (hash(k) < 0.35) continue;   // a spark flickers on and off
        const ang = hash(k + 1) * 6.283, r = 0.2 + hash(k + 2) * 0.2;
        put(fx + Math.cos(ang) * r, fy + h * (0.2 + hash(k + 3) * 0.85), fz + Math.sin(ang) * r, 0.75, 0.85, 1, 1, 0.08 + hash(k + 4) * 0.1, 0);
      }
    }
    if (bits & FX_POISON) for (let i = 0; i < 8; i++) {
      const p = fract(t * 0.4 + i / 8 + s), ang = i * 2.6 + s * 4, r = 0.22 + 0.06 * Math.sin(t * 2 + i);
      put(fx + Math.cos(ang) * r, fy + h * (0.25 + p * 0.85), fz + Math.sin(ang) * r, 0.35, 1, 0.3, 0.8 * (1 - p), 0.1, 1);
    }
    if (bits & FX_MAGIC) for (let i = 0; i < 12; i++) {
      const ang = t * 1.6 + i * (6.283 / 12) + s * 6, y = 0.5 + 0.35 * Math.sin(t * 1.3 + i * 1.7);
      put(fx + Math.cos(ang) * 0.4, fy + h * y, fz + Math.sin(ang) * 0.4, 0.75, 0.45, 1, 0.75, 0.12, 0);
    }
    if (bits & FX_BUBBLE) {
      const hy = fy + h * 0.9 + 0.01 * Math.sin(t * 2 + s * 6);
      put(fx, hy, fz, 0.55, 0.8, 1, 0.55, 0.62, 1);
      for (let i = 0; i < 3; i++) {
        const p = fract(t * 0.5 + i / 3 + s);
        put(fx + 0.05 * Math.sin(i * 2 + t), hy + 0.2 + p * 0.3, fz + 0.05 * Math.cos(i * 2 + t), 0.6, 0.85, 1, 0.6 * (1 - p), 0.06, 1);
      }
    }
  }
  return n;
}

export class EffectMotes {
  /** @param {WebGL2RenderingContext} gl */
  constructor(gl) {
    this.gl = gl;
    this.prog = buildProgram(gl, VS, FS, 'effect motes');
    this.u = { proj: gl.getUniformLocation(this.prog, 'uProj'), view: gl.getUniformLocation(this.prog, 'uView'), scale: gl.getUniformLocation(this.prog, 'uScale') };
    this.data = new Float32Array(MOTES_MAX * STRIDE);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const B = STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, B, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, B, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, B, 28);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, B, 32);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.drawn = 0;
  }

  /** Draw `bodies` under the frame's camera. */
  draw(bodies, proj, view, t) {
    const gl = this.gl;
    this.drawn = motesInto(bodies, t, this.data);
    if (!this.drawn) return;
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.proj, false, proj);
    gl.uniformMatrix4fv(this.u.view, false, view);
    gl.uniform1f(this.u.scale, Math.abs(proj[5]) * gl.drawingBufferHeight * 0.5);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.drawn * STRIDE);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.drawn);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
