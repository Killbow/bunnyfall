// @ts-check
// Offscreen render targets. Creation never binds a framebuffer; the draw paths restore the frame target and the
// viewport the caller passes, and nothing here queries GL state.

export function createRenderTarget(gl, width, height, { filter = 'LINEAR', wrap = 'CLAMP_TO_EDGE', wrapS = wrap, wrapT = wrap, data = null } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl[filter]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl[filter]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[wrapS]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[wrapT]);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { fbo: gl.createFramebuffer(), tex, width, height, attached: false };
}

export function createVolume(gl, size) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_3D, null);
  const fbo = gl.createFramebuffer();
  return { fbo, tex, size };
}

// The framebuffer that passes restore: the canvas (null) by default, or a frame image a lane pass has bound.
let _frameTarget = null;
export function setFrameTarget(fbo) { _frameTarget = fbo ?? null; }
export function frameTarget() { return _frameTarget; }

export function withTarget(gl, target, restoreViewport, draw) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  if (!target.attached) { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.tex, 0); target.attached = true; }
  gl.viewport(0, 0, target.width, target.height);
  draw();
  gl.bindFramebuffer(gl.FRAMEBUFFER, _frameTarget);
  gl.viewport(restoreViewport[0], restoreViewport[1], restoreViewport[2], restoreViewport[3]);
}

// Leaves the volume bound; call finishVolume after the last layer.
export function withVolumeLayer(gl, volume, z, draw) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, volume.fbo);
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, volume.tex, 0, z);
  gl.viewport(0, 0, volume.size, volume.size);
  draw();
}

export function finishVolume(gl, volume, restoreViewport) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, _frameTarget);
  gl.viewport(restoreViewport[0], restoreViewport[1], restoreViewport[2], restoreViewport[3]);
  gl.bindTexture(gl.TEXTURE_3D, volume.tex);
  gl.generateMipmap(gl.TEXTURE_3D);
  gl.bindTexture(gl.TEXTURE_3D, null);
}
