// DYNAMIC SKIES - THE FILES (DS1). The vendored mod's presets and
// textures reach the game through Vite's glob doors, as the quests and
// the roads do: text baked in, images as URLs emitted with the build.
// import.meta.glob is Vite's compile-time macro: in the browser every
// call below is an object literal by the time it runs; in node it is
// undefined. scenes/shared.js imports this module statically (the sky
// controller is built at every exterior boot), and the node suite
// imports shared.js, so the globs are taken only where a window is -
// node sees empty tables, and the pure port (systems/dynamicSkies/dynamicSkies.js)
// is fed the same files off the disk by the tests.

const IN_BROWSER = typeof window !== 'undefined';
const PRESETS = IN_BROWSER ? import.meta.glob('../../vendor/dynamic-skies/SkyboxSettings/*.json', { eager: true, query: '?raw', import: 'default' }) : {};
const FOGS = IN_BROWSER ? import.meta.glob('../../vendor/dynamic-skies/FogSettings/*.json', { eager: true, query: '?raw', import: 'default' }) : {};
const CURVES = IN_BROWSER ? import.meta.glob('../../vendor/dynamic-skies/LightCurveSettings/*.json', { eager: true, query: '?raw', import: 'default' }) : {};
const TEXTURES = IN_BROWSER ? import.meta.glob('../../vendor/dynamic-skies/Textures/*.png', { eager: true, query: '?url', import: 'default' }) : {};

const byName = (map) => Object.fromEntries(Object.entries(map).map(([p, v]) => [p.split('/').pop().replace(/\.(json|png)$/, ''), v]));
const presets = byName(PRESETS);
const fogPresets = byName(FOGS);
const curves = byName(CURVES);
const textureUrls = byName(TEXTURES);

/** Every texture file the vendored tree carries, by the name the
 *  presets use (CloudsTextureFile etc.). */
export const DYNAMIC_SKIES_TEXTURES = Object.freeze(Object.keys(textureUrls).sort());

/** The mod's text assets, in the shape DynamicSkies' constructor takes. */
export function dynamicSkiesAssets() {
  return { presets, fogPresets, lightCurve: curves.LightCurve };
}

export function dynamicSkiesTextureUrl(name) {
  return textureUrls[name] ?? null;
}

function loadImage(name, url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Dynamic Skies: ${name} failed to load from ${url}`));
    img.src = url;
  });
}

const BITMAP_OPTIONS = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
let bitmapDecode = null;

// A browser that ignores the flip or alpha options fails this probe and keeps the image path.
function canDecodeFlipped() {
  bitmapDecode ??= (async () => {
    if (typeof createImageBitmap !== 'function' || typeof ImageData === 'undefined') return false;
    // Top: half transparent. Bottom: blue.
    const px = new Uint8ClampedArray([200, 100, 50, 128, 0, 0, 255, 255]);
    const bmp = await createImageBitmap(new ImageData(px, 1, 2), BITMAP_OPTIONS);
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) { bmp.close?.(); return false; }
    const t = gl.createTexture(), fb = gl.createFramebuffer(), out = new Uint8Array(8);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.readPixels(0, 0, 1, 2, gl.RGBA, gl.UNSIGNED_BYTE, out);
    bmp.close?.();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // Flipped: blue first. Unpremultiplied: the half-transparent red stays near 200, not 100.
    return out[2] === 255 && out[3] === 255 && out[7] === 128 && Math.abs(out[4] - 200) <= 2;
  })().catch(() => false);
  return bitmapDecode;
}

/** Decode one vendored texture; resolves with the image for
 *  texImage2D (an already flipped ImageBitmap where the browser can).
 *  Rejects on a missing or unreadable file, and the caller warns - a slot
 *  keeps the shader's own default meanwhile. */
export async function loadDynamicSkiesTexture(name) {
  const url = dynamicSkiesTextureUrl(name);
  if (!url) throw new Error(`Dynamic Skies: no texture named ${name}`);
  if (await canDecodeFlipped()) {
    try {
      const res = await fetch(url);
      if (res.ok) return await createImageBitmap(await res.blob(), BITMAP_OPTIONS);
    } catch { /* the image path below reports a real failure */ }
  }
  return loadImage(name, url);
}
