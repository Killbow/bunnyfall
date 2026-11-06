// @ts-check
// BUNNYFALL (2026-11-06): ROX'S NEW ARGONIANS' PICTURES (systems/roxArgonians.js has the law; SynfulRoX's art, credited in
// ui/credits.js). Each picture is fetched once off vendor/roxs-new-argonians/ and answered as the top-down RGBA
// `{ width, height, data }` the paper doll's mod pictures are (ui/paperDoll.js dfmodAlt), or as a canvas for the face
// grid. Browser only; anywhere else (or on a failed fetch) null, and the classic face stands in.
import { roxIndex } from '../systems/roxArgonians.js';

const g = (gender) => (gender === 'female' ? 1 : 0);
/** The picture's URL: a head (`vampire` its cursed face), or a body layer (`clothed` the second). */
// (the bundler's `new URL` over a template, as Shield Widget's art - combat/shieldWidgetAssets.js)
export const roxHeadUrl = (gender, faceIndex, vampire = false) => (vampire
  ? new URL(`../../vendor/roxs-new-argonians/vampire-faces/VAMP8_${g(gender)}_${roxIndex(faceIndex)}.png`, import.meta.url).href
  : new URL(`../../vendor/roxs-new-argonians/faces/FACE${g(gender)}7I0_${roxIndex(faceIndex)}.png`, import.meta.url).href);
export const roxBodyUrl = (gender, clothed) => new URL(`../../vendor/roxs-new-argonians/bodies/BODY${g(gender)}7I${clothed ? 1 : 0}.png`, import.meta.url).href;

const _cache = new Map();
/** The picture at `url` as top-down RGBA, or null. */
export function roxRgba(url) {
  if (!url || typeof document === 'undefined' || typeof fetch !== 'function') return Promise.resolve(null);
  if (!_cache.has(url)) {
    _cache.set(url, (async () => {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d');
      if (!x) return null;
      x.drawImage(bmp, 0, 0);
      const d = x.getImageData(0, 0, bmp.width, bmp.height);
      return { width: d.width, height: d.height, data: new Uint8Array(d.data.buffer) };
    })().catch(() => null));
  }
  return _cache.get(url);
}
/** The ten Rox faces of `gender` as canvases at `scale`, for the face grid (a hole where one failed). */
export async function roxFaceCanvases(gender, { scale = 2 } = {}) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const img = await roxRgba(roxHeadUrl(gender, 10 + i));
    if (!img || typeof document === 'undefined') { out.push(null); continue; }
    const c = document.createElement('canvas');
    c.width = img.width * scale; c.height = img.height * scale;
    const x = c.getContext('2d');
    if (!x) { out.push(null); continue; }
    const s = document.createElement('canvas'); s.width = img.width; s.height = img.height;
    s.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(img.data.buffer.slice(0)), img.width, img.height), 0, 0);
    x.imageSmoothingEnabled = false;
    x.drawImage(s, 0, 0, c.width, c.height);
    c.title = `Rox's Argonian ${i + 1}`;
    out.push(c);
  }
  return out;
}
