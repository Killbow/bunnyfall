// @ts-check
// Fullscreen sky event pass, drawn after the sky and clouds at the far plane so LEQUAL lets the land cover it.
// It blends over the sky by the event weight and draws nothing at weight 0.

import { buildProgram } from './glProgram.js';
import { SUNBABY_GLSL, sunbabySunDir } from '../world/sunbabySky.js';

export const SUNBABY_TODD_PHOTO_URL = new URL('../assets/sunbaby/todd.jpg', import.meta.url).href;

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vNdc;
void main() { vNdc = aPos; gl_Position = vec4(aPos, 1.0, 1.0); }`;

export const SUNBABY_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform float uYaw, uPitch, uTanHalfFov, uAspect;
uniform float uWeight;   // the event's weight, 0..1
uniform float uTime;     // real seconds - the flowers' drift and the giggle
uniform vec3 uSunDir;    // the sun baby (sunbabySunDir)
uniform vec2 uFace;      // SUNBABY2: the face it wears - x the wrath, y Todd (sunbabyPhase)
uniform sampler2D uToddPhoto;   // SUNBABY3: Todd's photograph...
uniform float uToddPhotoOn;     // ...and whether it has loaded (the cartoon until it has)
out vec4 outColor;
${SUNBABY_GLSL}
void main() {
  vec3 ray = normalize(vec3(vNdc.x * uTanHalfFov * uAspect, vNdc.y * uTanHalfFov, 1.0));
  float cp = cos(uPitch), sp = sin(uPitch);
  vec3 r1 = vec3(ray.x, ray.y * cp + ray.z * sp, -ray.y * sp + ray.z * cp);
  float cy = cos(uYaw), sy = sin(uYaw);
  vec3 dir = normalize(vec3(r1.x * cy + r1.z * sy, r1.y, -r1.x * sy + r1.z * cy));
  outColor = vec4(sunbabySky(dir, uSunDir, uTime, uFace, uToddPhoto, uToddPhotoOn), clamp(uWeight, 0.0, 1.0));
}`;

export const SUNBABY_UNIFORMS = Object.freeze(['uYaw', 'uPitch', 'uTanHalfFov', 'uAspect', 'uWeight', 'uTime', 'uSunDir', 'uFace', 'uToddPhoto', 'uToddPhotoOn']);

// Wraps the clock so the shader time keeps float precision.
const TIME_WRAP_S = 3600;

export class SunbabySkyRenderer {
  constructor(gl) {
    this.gl = gl;
    this.program = buildProgram(gl, VS, SUNBABY_FS, 'sunbaby sky');
    this.u = {};
    for (const name of SUNBABY_UNIFORMS) this.u[name] = gl.getUniformLocation(this.program, name);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.weight = 0;
    this.evil = 0;
    this.todd = 0;
    // The photo texture starts as one black texel so the sampler never reads an incomplete texture.
    this.photoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.photoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.photoOn = 0;
    this._photo = null;
    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => { this._photo = img; };
      img.onerror = () => console.warn('[sunbaby] Todd\'s photograph did not load - the cartoon stands in');
      img.src = SUNBABY_TODD_PHOTO_URL;
    }
    this.t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  }

  draw(yaw, pitch, fovY, aspect) {
    if (!(this.weight > 0)) return;
    const gl = this.gl, u = this.u;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    gl.useProgram(this.program);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.uniform1f(u.uYaw, yaw); gl.uniform1f(u.uPitch, pitch);
    gl.uniform1f(u.uTanHalfFov, Math.tan(fovY / 2)); gl.uniform1f(u.uAspect, aspect);
    gl.uniform1f(u.uWeight, this.weight);
    gl.uniform1f(u.uTime, ((now - this.t0) / 1000) % TIME_WRAP_S);
    gl.uniform3fv(u.uSunDir, sunbabySunDir(this.weight));
    gl.uniform2f(u.uFace, this.evil, this.todd);
    if (this._photo) this._uploadPhoto();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.photoTex);
    gl.uniform1i(u.uToddPhoto, 0);
    gl.uniform1f(u.uToddPhotoOn, this.photoOn);
    // The fullscreen triangle winds CCW under a CW front face, so culling is off for this draw.
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
  }

  _uploadPhoto() {
    const gl = this.gl, img = this._photo;
    this._photo = null;
    const flip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, this.photoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !!flip);
    this.photoOn = 1;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.vb);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.photoTex);
  }
}
