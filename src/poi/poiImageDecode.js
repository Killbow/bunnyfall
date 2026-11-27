// @ts-check
import { POI_STEP_UNITS } from './poiRuntime.js';

let readback;
function readbackGl() {
  if (readback === undefined) {
    try {
      const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : null;
      readback = /** @type {any} */ (c?.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false })) ?? null;
    } catch { readback = null; }
  }
  return readback && !readback.isContextLost?.() ? readback : null;
}

/**
 * @param {Uint8Array} bytes
 * @param {{ gl?: any, bitmap?: (blob: Blob, o: any) => Promise<any> }} [o]
 */
export function* decodePoiImageSteps(bytes, { gl = readbackGl(), bitmap = (blob, o) => createImageBitmap(blob, o) } = {}) {
  const bmp = yield bitmap(new Blob([bytes.slice()]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  try {
    let read = null;
    if (gl) { try { read = yield* readThroughGl(gl, bmp); } catch { read = null; } }
    return read ?? throughCanvas(bmp);
  } finally {
    bmp.close?.();
  }
}

/** @param {Uint8Array} bytes */
export async function decodePoiImage(bytes) {
  const it = decodePoiImageSteps(bytes);
  let r = it.next();
  while (!r.done) {
    const v = r.value;
    if (v && typeof v.then === 'function') {
      let got;
      try { got = await v; } catch (e) { r = it.throw(e); continue; }
      r = it.next(got);
    } else r = it.next();
  }
  return r.value;
}

function* readThroughGl(gl, bmp) {
  const w = bmp.width, h = bmp.height;
  if (!(w > 0 && h > 0) || w > gl.getParameter(gl.MAX_TEXTURE_SIZE) || h > gl.getParameter(gl.MAX_TEXTURE_SIZE)) return null;
  const tex = gl.createTexture(), fb = gl.createFramebuffer();
  try {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    const data = new Uint8Array(w * h * 4);
    const band = Math.max(1, Math.floor(POI_STEP_UNITS / w));
    for (let y = 0; y < h; y += band) {
      yield null;
      gl.readPixels(0, y, w, Math.min(band, h - y), gl.RGBA, gl.UNSIGNED_BYTE, data, y * w * 4);
    }
    if (gl.getError() !== gl.NO_ERROR || gl.isContextLost?.()) return null;
    return { width: w, height: h, data };
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
  }
}

function throughCanvas(bmp) {
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('poi image: no 2d context');
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) };
}
