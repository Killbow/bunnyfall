// @ts-check
// Sky backdrop from DaggerfallSky.cs. Afternoon frames 32-63 reuse frame 63 - n with the halves swapped, and night
// uses the sky group's NITE image. The clearColor is the horizon texel, Daggerfall Unity's clear and fog color, and
// fillColor is the zenith texel above the 220-row strip, which is not a parity value.

import { buildProgram } from './glProgram.js';
import { DREAD_GLSL } from '../world/dreadSky.js';
import { SD_BRASS_GLSL } from '../world/sdBrassSky.js';
import { HAZE_SKY_GLSL } from './hazeGlsl.js';

export const SKY_ANGLE_PER_PIXEL = Math.PI / 512;

export function nightSkyIndexForSky(skyIndex) {
  if (skyIndex >= 0 && skyIndex <= 7) return 3;
  if (skyIndex >= 8 && skyIndex <= 15) return 1;
  if (skyIndex >= 16 && skyIndex <= 23) return 2;
  return 0;
}

export function nightSkyImageName(skyIndex) {
  return `NITE${String(nightSkyIndexForSky(skyIndex)).padStart(2, '0')}I0.IMG`;
}

// Afternoon halves are also reflected, unlike Daggerfall Unity, so the sun moves east to west with azimuth 0 at +Z.
/** @param {import('../formats/skyFile.js').SkyFile} skyFile @param {number} frame */
export function buildDaySkyPanorama(skyFile, frame) {
  const target = frame < 32 ? frame : 63 - frame;
  const mirror = frame >= 32;
  const east = skyFile.getColor32(0, target);
  const west = skyFile.getColor32(1, target);
  const w = east.width;
  const h = east.height;
  const out = new Uint8ClampedArray(w * 2 * h * 4);
  const halves = mirror ? [west, east] : [east, west];
  for (let half = 0; half < 2; half++) {
    const src = halves[half].colors;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = mirror ? w - 1 - x : x;
        const s = (y * w + sx) * 4;
        const d = (y * w * 2 + half * w + x) * 4;
        out[d] = src[s];
        out[d + 1] = src[s + 1];
        out[d + 2] = src[s + 2];
        out[d + 3] = 255;
      }
    }
  }
  const wc = west.colors;
  const clearColor = [wc[0] / 255, wc[1] / 255, wc[2] / 255];
  const top = ((h - 1) * w) * 4;
  const fillColor = [wc[top] / 255, wc[top + 1] / 255, wc[top + 2] / 255];
  return { colors: out, width: w * 2, height: h, clearColor, fillColor };
}

// The last column copies its neighbor, as in LoadVanillaNightSky, without mutating the caller's array.
export function buildNightSkyPanorama(color32) {
  const { width: w, height: h, colors: src } = color32;
  const out = new Uint8ClampedArray(w * 2 * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w * 2; x++) {
      const col = x % w;
      const s = (y * w + (col === w - 1 ? w - 2 : col)) * 4;
      const d = (y * w * 2 + x) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = 255;
    }
  }
  const clearColor = [src[0] / 255, src[1] / 255, src[2] / 255];
  const top = ((h - 1) * w) * 4;
  const fillColor = [src[top] / 255, src[top + 1] / 255, src[top + 2] / 255];
  return { colors: out, width: w * 2, height: h, clearColor, fillColor };
}

export function buildFallbackSkyPanorama() {
  const w = 512, h = 220;
  const out = new Uint8ClampedArray(w * h * 4);
  const top = [86, 116, 170], bot = [196, 205, 224];
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const r = bot[0] + (top[0] - bot[0]) * t;
    const g = bot[1] + (top[1] - bot[1]) * t;
    const b = bot[2] + (top[2] - bot[2]) * t;
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4;
      out[d] = r; out[d + 1] = g; out[d + 2] = b; out[d + 3] = 255;
    }
  }
  return {
    colors: out, width: w, height: h,
    clearColor: [bot[0] / 255, bot[1] / 255, bot[2] / 255],
    fillColor: [top[0] / 255, top[1] / 255, top[2] / 255],
  };
}


const SKY_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 1.0, 1.0);   // PERF2: AT the far plane, so LEQUAL passes only the cleared depth
}`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform sampler2D uSky;
uniform vec3 uClear;
uniform float uYaw;
uniform float uPitch;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uVSpan; // elevation covered by the strip, radians
uniform float uFogMix; // 0 = clear sky, 1 = fully fogged (heavy fog)
uniform vec3 uFogColor;
uniform float uDread;  // EVENT1: the live event's grade, 0 = none
uniform float uBrass;  // AUDIT SD III (V8): the brass air's, 0 = none
out vec4 outColor;
${DREAD_GLSL}
${SD_BRASS_GLSL}
${HAZE_SKY_GLSL}
void main() {
  // View ray from the fragment, rotated by pitch (about X) then yaw (about Y)
  // to match the scene camera (fwd = (sin yaw * cos pitch, sin pitch,
  // cos yaw * cos pitch)).
  vec3 ray = normalize(vec3(vNdc.x * uTanHalfFov * uAspect, vNdc.y * uTanHalfFov, 1.0));
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 r1 = vec3(ray.x, ray.y * cp + ray.z * sp, -ray.y * sp + ray.z * cp);
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 dir = vec3(r1.x * cy + r1.z * sy, r1.y, -r1.x * sy + r1.z * cy);

  float azimuth = atan(dir.x, dir.z); // 0 at +Z, wraps
  float elevation = asin(clamp(dir.y, -1.0, 1.0));
  float u = fract(azimuth / 6.28318530718);
  float v = elevation / uVSpan;
  vec3 color = v > 1.0 ? uClear : texture(uSky, vec2(u, clamp(v, 0.0, 1.0))).rgb;  // uClear = fillColor
  outColor = vec4(brassGrade(dreadGrade(mix(color, uFogColor, uFogMix), uDread), uBrass), 1.0);
  outColor.rgb = hazeSky(outColor.rgb, dir);   // BANTHA1: the jungle's haze toward the horizon - AUDIT BANTHA1 HAZE-8: after the grades, its colour the frame's fog colour, graded once already (shared.js fogColorFor)
}`;

export class SkyRenderer {
  constructor(gl) {
    this.gl = gl;
    const prog = buildProgram(gl, SKY_VS, SKY_FS);
    this.program = prog;
    this.uSky = gl.getUniformLocation(prog, 'uSky');
    this.uClear = gl.getUniformLocation(prog, 'uClear');
    this.uYaw = gl.getUniformLocation(prog, 'uYaw');
    this.uPitch = gl.getUniformLocation(prog, 'uPitch');
    this.uTanHalfFov = gl.getUniformLocation(prog, 'uTanHalfFov');
    this.uAspect = gl.getUniformLocation(prog, 'uAspect');
    this.uVSpan = gl.getUniformLocation(prog, 'uVSpan');
    this.uFogMix = gl.getUniformLocation(prog, 'uFogMix');
    this.uFogColor = gl.getUniformLocation(prog, 'uFogColor');
    this.uDread = gl.getUniformLocation(prog, 'uDread');
    this.uBrass = gl.getUniformLocation(prog, 'uBrass');
    this.uHazeSky = gl.getUniformLocation(prog, 'uHazeSky');
    this.fogMix = 0;
    this.dread = 0;
    this.brass = 0;
    this.hazeSky = new Float32Array(4);
    this.fogColor = new Float32Array([0.5, 0.5, 0.5]);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.texture = null;
    this.clearColor = new Float32Array([0.53, 0.7, 0.92]);
    this.fillColor = new Float32Array([0.53, 0.7, 0.92]);
    this.vSpan = 220 * SKY_ANGLE_PER_PIXEL;
  }

  setPanorama(pano) {
    const gl = this.gl;
    if (!this.texture) this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, pano.width, pano.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pano.colors.buffer)
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.clearColor = new Float32Array(pano.clearColor);
    this.fillColor = new Float32Array(pano.fillColor ?? pano.clearColor);
    this.vSpan = pano.height * SKY_ANGLE_PER_PIXEL;
  }

  draw(yaw, pitch, fovY, aspect) {
    if (!this.texture) return;
    const gl = this.gl;
    // No program save or restore: hosts call renderer.markForeignPass after this pass, and the renderer rebinds.
    gl.useProgram(this.program);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uSky, 0);
    gl.uniform3fv(this.uClear, this.fillColor);
    gl.uniform1f(this.uYaw, yaw);
    gl.uniform1f(this.uPitch, pitch);
    gl.uniform1f(this.uTanHalfFov, Math.tan(fovY / 2));
    gl.uniform1f(this.uAspect, aspect);
    gl.uniform1f(this.uVSpan, this.vSpan);
    gl.uniform1f(this.uFogMix, this.fogMix);
    gl.uniform1f(this.uDread, this.dread);
    gl.uniform1f(this.uBrass, this.brass);
    gl.uniform4fv(this.uHazeSky, this.hazeSky);
    gl.uniform3fv(this.uFogColor, this.fogColor);
    // The fullscreen triangle winds CCW under frontFace(CW), so culling must be off or the whole sky culls away.
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.CULL_FACE);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.activeTexture(gl.TEXTURE0);
  }
}
