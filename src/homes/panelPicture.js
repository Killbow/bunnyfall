// @ts-check

export const PANEL_PICTURE_CLEAR = Object.freeze([0.055, 0.063, 0.075, 1]);
/** Pictures are cached for the session, so they use only this light; endPanelFrame restores the world lights. */
export const PANEL_PICTURE_LIGHT = Object.freeze([0, 0.707, -0.707]);
export const PANEL_PICTURE_AMBIENT = 0.8;
const NONE3 = new Float32Array(3);
const NO_POINTS = new Float32Array(0);

/**
 * @param {{ width: number, height: number, getBoundingClientRect?: () => any } | null | undefined} canvas
 * @param {{ left: number, top: number, width: number, height: number } | null | undefined} box
 * @param {number} w
 * @param {number} h
 */
export function canvasBoxUnder(canvas, box, w, h) {
  const c = canvas?.getBoundingClientRect?.();
  if (!canvas || !box || !c || !(c.width > 0) || !(c.height > 0)) return null;
  const sx = canvas.width / c.width;
  const sy = canvas.height / c.height;
  const k = Math.min(1, Math.floor(box.width * sx) / w, Math.floor(box.height * sy) / h);
  const pw = Math.floor(w * k), ph = Math.floor(h * k);
  if (!(pw >= 16) || !(ph >= 16)) return null;
  return { x: Math.round((box.left - c.left + box.width / 2) * sx - pw / 2), y: Math.round((box.top - c.top + box.height / 2) * sy - ph / 2), w: pw, h: ph };
}

export function panelPictureStudio(renderer) {
  renderer.setFog?.('off');
  renderer.setLighting?.(new Float32Array([PANEL_PICTURE_AMBIENT, PANEL_PICTURE_AMBIENT, PANEL_PICTURE_AMBIENT]), 0);
  renderer.setMoonlight?.(null);
  renderer.setThirdLight?.(null);
  renderer.setPointLights?.(NO_POINTS, null, null);
  renderer.setIndirectLight?.(NONE3, 0, NONE3);
  renderer.setWindowEmission?.(NONE3);
  renderer.setCloudShadow?.(null);
}

// The copy is taken this frame while the canvas holds it; toBlob encodes later because toDataURL stalls on the GPU.
/**
 * @param {{ renderer: any, canvas: any, doc: any, rect: { x: number, y: number, w: number, h: number }, proj: Float32Array, view: Float32Array, body: () => void }} o
 * @returns {Promise<string|null>}
 */
export function panelPicture({ renderer, canvas, doc, rect, proj, view, body }) {
  renderer.panelFrame({ proj, view, lightDir: new Float32Array(PANEL_PICTURE_LIGHT), rect, clear: [...PANEL_PICTURE_CLEAR], setup: () => panelPictureStudio(renderer) }, body);
  const out = doc.createElement('canvas');
  out.width = rect.w;
  out.height = rect.h;
  try { out.getContext('2d')?.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h); } catch { return Promise.resolve(null); }
  return new Promise((resolve) => {
    try {
      if (typeof out.toBlob !== 'function') { resolve(out.toDataURL?.('image/png') ?? null); return; }
      const URLs = doc.defaultView?.URL ?? globalThis.URL;
      out.toBlob((blob) => { try { resolve(blob ? URLs?.createObjectURL?.(blob) ?? null : null); } catch { resolve(null); } }, 'image/png');
    } catch { resolve(null); }
  });
}
