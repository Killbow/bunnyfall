// @ts-check
// MAGICAL TAVERNS - THE LOOK (systems/magicTavern.js has the law). Three pictures, all made from the player's own ARENA2
// records at runtime (nothing is shipped, as cabinLook.js's stain is not): every one is uploaded under a pseudo-archive of
// its own and worn through a texture table (the draw-time remap a climate swap and a painted home already are), so no
// other building is touched.
//   THE OUTSIDE   every picture the building wears, its hues turned to blue (`hueToBlue`)
//   THE PORTAL    the building's door pictures, painted as a swirling gate of light (`portalColors`) that glows by itself
//   THE STAR GLASS the glass of a window record inside the shared hall: a night sky of stars and a faint aurora, lit by itself,
//                 whatever hour it is outside (`starGlass`)
// The pictures are in getColor32 order (row 0 the picture's bottom row, texels RGBA); every function here is pure.

import { isExteriorWindow } from '../world/climateSwaps.js';
import { homeLookPart } from '../world/homeLook.js';

/** The pseudo-archives the pictures go up under (cabinLook.js 38192, guild clerks 38320-38328 are the neighbours). */
export const MAGIC_OUTSIDE_ARCHIVE = 38340;
export const MAGIC_STARS_ARCHIVE = 38341;

const clamp8 = (/** @type {number} */ v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
/** A cheap per-texel hash in 0..1. */
function hash2(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * A picture's texels with every hue turned to blue: its lightness kept, its saturation lifted (a grey stone reads blue,
 * not grey), its hue folded into the blue-violet band, so a roof, a wall and a timber all become one blue and the grain
 * stays. Alpha untouched. A new array.
 * @param {Uint8ClampedArray} colors
 */
export function hueToBlue(colors) {
  const out = new Uint8ClampedArray(colors.length);
  for (let i = 0; i < colors.length; i += 4) {
    const r = colors[i] / 255, g = colors[i + 1] / 255, b = colors[i + 2] / 255, a = colors[i + 3];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
    const s = max === 0 ? 0 : d / max;
    // blue is 0.61; the source hue only nudges it, within the blue to violet band
    const nh = 0.58 + (h % 1) * 0.1, ns = Math.min(1, s * 0.6 + 0.42), nv = Math.min(1, max * 1.04 + 0.02);
    const c = nv * ns, x = c * (1 - Math.abs(((nh * 6) % 2) - 1)), m = nv - c;
    const k = Math.floor(nh * 6) % 6;
    const [pr, pg, pb] = k === 0 ? [c, x, 0] : k === 1 ? [x, c, 0] : k === 2 ? [0, c, x] : k === 3 ? [0, x, c] : k === 4 ? [x, 0, c] : [c, 0, x];
    out[i] = clamp8((pr + m) * 255); out[i + 1] = clamp8((pg + m) * 255); out[i + 2] = clamp8((pb + m) * 255); out[i + 3] = a;
  }
  return out;
}

/**
 * A door's picture as a portal: a whirl of violet and cyan light round a bright core, a dark blue frame at the rim.
 * `phase` turns the swirl (the animation's, were one made). RGBA, row 0 the bottom.
 * @param {number} width @param {number} height @param {number} [phase]
 */
export function portalColors(width, height, phase = 0) {
  const colors = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = ((x + 0.5) / width) * 2 - 1, v = ((y + 0.5) / height) * 2 - 1;
    const r = Math.min(1.4, Math.hypot(u, v * 0.62)), ang = Math.atan2(v, u);
    const arm = 0.5 + 0.5 * Math.sin(4 * ang - 11 * r + 1.3 + phase);
    const fine = 0.5 + 0.5 * Math.sin(7 * ang + 6 * r - phase * 1.7);
    const core = Math.pow(Math.max(0, 1 - r), 2.2);
    const t = Math.min(1, 0.5 * arm + 0.25 * fine + core * 0.7);
    const rim = r > 0.86 ? Math.min(1, (r - 0.86) / 0.1) : 0;
    const i = (y * width + x) * 4;
    colors[i] = clamp8((40 + 110 * t + 130 * core) * (1 - rim) + 14 * rim);
    colors[i + 1] = clamp8((18 + 200 * t + 90 * core) * (1 - rim) + 22 * rim);
    colors[i + 2] = clamp8((120 + 135 * t + 40 * core) * (1 - rim) + 70 * rim);
    colors[i + 3] = 255;
  }
  return colors;
}

/**
 * The glass of a window record as a night sky: stars (some with a cross of light), a deep indigo that lightens toward the
 * horizon and a faint aurora band. `base` is the record's own texels (its frame is kept) and `mask` the glass
 * (getWindowColors32: a white texel is glass). Answers the picture and its emission (the sky alone, the frame black).
 * @param {{ colors: Uint8ClampedArray, width: number, height: number }} base
 * @param {{ colors: Uint8ClampedArray }} mask
 * @param {number} seed
 */
export function starGlass(base, mask, seed) {
  const { width: w, height: h } = base;
  const albedo = new Uint8ClampedArray(base.colors), emission = new Uint8ClampedArray(base.colors.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (mask.colors[i] !== 255) continue;
    const up = y / Math.max(1, h - 1);   // 0 at the sill, 1 at the lintel
    let r = 14 + 22 * (1 - up), g = 14 + 20 * (1 - up), b = 52 + 40 * (1 - up);
    const band = Math.exp(-Math.pow(up - 0.5, 2) / 0.03) * (0.5 + 0.5 * Math.sin(x * 0.55 + up * 5 + seed));
    r += 20 * band; g += 150 * band * 0.55; b += 120 * band * 0.55;
    const star = hash2(x, y, seed);
    if (star > 0.9965) { r = g = b = 255; }
    else if (star > 0.975) { const k = 0.55 + 0.45 * hash2(y, x, seed + 1); r += 215 * k; g += 215 * k; b += 235 * k; }
    else if (hash2(x + 1, y, seed) > 0.992 || hash2(x - 1, y, seed) > 0.992 || hash2(x, y + 1, seed) > 0.992 || hash2(x, y - 1, seed) > 0.992) { r += 55; g += 55; b += 75; }
    albedo[i] = clamp8(r); albedo[i + 1] = clamp8(g); albedo[i + 2] = clamp8(b); albedo[i + 3] = 255;
    emission[i] = albedo[i]; emission[i + 1] = albedo[i + 1]; emission[i + 2] = albedo[i + 2]; emission[i + 3] = 255;
  }
  return { albedo, emission };
}

/** The records handed out under each pseudo-archive, by source key (a source picture is made once). */
const _records = new Map();
const recordOf = (/** @type {string} */ k) => { let r = _records.get(k); if (r == null) { r = _records.size; _records.set(k, r); } return r; };

/**
 * THE OUTSIDE'S TABLE for one tavern's models: each picture its faces wear (as the town's climate resolves it: `base`,
 * "a_r" -> "a_r") hue-turned and uploaded, a door's painted as the portal, a window's emission carried over. A NEW Map
 * (the renderer caches a sub-mesh's picture against a table's identity), `into` the table the building's other models
 * already filled. A picture its archive does not hold is left to the town's.
 * @param {Array<{textureArchive: number, textureRecord: number}> | undefined} subMeshes
 * @param {Map<string, string> | null} base
 * @param {{ getTexture: (a: number) => Promise<any>, renderer: any }} deps
 * @param {Map<string, string> | null} [into]
 */
export async function magicOutsideRemap(subMeshes, base, { getTexture, renderer }, into = null) {
  const out = into ?? new Map();
  for (const sm of subMeshes ?? []) {
    const own = `${sm.textureArchive}_${sm.textureRecord}`;
    if (out.has(own)) continue;
    const swapped = base?.get?.(own) ?? own;
    const [archive, record] = swapped.split('_').map(Number);
    let done = false;
    try {
      const t = await getTexture(archive);
      if (t && !t.vendor && record < t.recordCount) {
        const bm = t.getDFBitmap(record, 0);
        if (bm?.width) {
          const pic = t.getColor32(bm, -1);
          const door = homeLookPart(archive, record) === 'door';
          const rec = recordOf(`o|${swapped}`);
          const colors = door ? portalColors(pic.width, pic.height) : hueToBlue(pic.colors);
          renderer.uploadTexture(MAGIC_OUTSIDE_ARCHIVE, rec, { width: pic.width, height: pic.height, colors }, { opaque: true });
          if (door) renderer.uploadEmissionTexture?.(MAGIC_OUTSIDE_ARCHIVE, rec, { width: pic.width, height: pic.height, colors }, { white: true });
          else if (isExteriorWindow(archive, record)) renderer.uploadEmissionTexture?.(MAGIC_OUTSIDE_ARCHIVE, rec, t.getWindowColors32(bm), { window: true });
          out.set(own, `${MAGIC_OUTSIDE_ARCHIVE}_${rec}`);
          done = true;
        }
      }
    } catch (e) { console.warn('[magic tavern] a picture would not turn blue', swapped, e?.message ?? e); }
    if (!done && base?.get?.(own)) out.set(own, /** @type {string} */ (base.get(own)));
  }
  return out;
}

/**
 * THE SHARED HALL'S WINDOWS, as a room `restyle` (scenes/cabinLook.js's shape): every window record its models wear
 * becomes the star glass, set in the room's table in its place, before the room's batch is made.
 * @returns {(texRemap: Map<string, string>, lists: any[][], deps: { renderer: any, getTexture: (a: number) => Promise<any> }) => Promise<void>}
 */
export function magicGlassRestyle() {
  return async (texRemap, lists, { renderer, getTexture }) => {
    if (!renderer?.uploadTexture) return;
    const seen = new Set();
    for (const list of lists) for (const sm of list ?? []) {
      const own = `${sm.textureArchive}_${sm.textureRecord}`;
      if (seen.has(own)) continue;
      seen.add(own);
      const key = texRemap.get(own) ?? own;
      const [archive, record] = key.split('_').map(Number);
      if (!isExteriorWindow(archive, record)) continue;
      try {
        const t = await getTexture(archive);
        if (!t || t.vendor || !(record < t.recordCount)) continue;
        const bm = t.getDFBitmap(record, 0);
        if (!bm?.width) continue;
        const pic = t.getColor32(bm, -1), mask = t.getWindowColors32(bm);
        const { albedo, emission } = starGlass(pic, mask, archive * 31 + record);
        const rec = recordOf(`s|${key}`);
        renderer.uploadTexture(MAGIC_STARS_ARCHIVE, rec, { width: pic.width, height: pic.height, colors: albedo }, { opaque: true });
        renderer.uploadEmissionTexture?.(MAGIC_STARS_ARCHIVE, rec, { width: pic.width, height: pic.height, colors: emission }, { white: true });
        texRemap.set(own, `${MAGIC_STARS_ARCHIVE}_${rec}`);
      } catch (e) { console.warn('[magic tavern] a window would not show the stars', key, e?.message ?? e); }
    }
  };
}
