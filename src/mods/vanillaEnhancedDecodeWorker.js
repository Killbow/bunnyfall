import { resampleRgba, mipFitSize } from '../formats/resample.js';

globalThis.onmessage = async (ev) => {
  const { id, url, maxSize = Infinity } = ev.data ?? {};
  try {
    if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
      globalThis.postMessage({ id, error: 'no OffscreenCanvas in a worker', unsupported: true });
      return;
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    const bmp = await createImageBitmap(await r.blob());
    const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    bmp.close?.();
    let out = { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) };
    const native = [img.width, img.height];
    const [w, h] = mipFitSize(out.width, out.height, maxSize);
    if (w !== out.width || h !== out.height) {
      const s = resampleRgba(out, w, h);
      out = { width: s.width, height: s.height, data: new Uint8Array(s.data.buffer) };
    }
    globalThis.postMessage({ id, width: out.width, height: out.height, data: out.data, native }, [out.data.buffer]);
  } catch (e) {
    globalThis.postMessage({ id, error: String(e?.message ?? e), unsupported: false });
  }
};
