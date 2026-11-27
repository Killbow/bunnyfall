// @ts-check
import { TRANSPORT_HORSE } from '../items/itemTemplates.js';

// Saves store each part as an index into its list, so entries are only appended. The list lengths also feed
// `horseLookCode`, so changing any list changes the wire code of every look.
export const HORSE_COATS = Object.freeze(['bay', 'chestnut', 'black', 'grey', 'dun', 'buckskin', 'palomino']);
export const HORSE_COAT_MAX = HORSE_COATS.length - 1;
export const HORSE_PATTERNS = Object.freeze(['solid', 'pinto', 'appaloosa', 'dapples', 'roan']);
export const HORSE_PATTERN_MAX = HORSE_PATTERNS.length - 1;
export const HORSE_LEGS = Object.freeze(['plain', 'socks', 'stockings']);
export const HORSE_LEGS_MAX = HORSE_LEGS.length - 1;
export const HORSE_SEED_MAX = 65535;
export const HORSE_LOOK_NAMES = Object.freeze({
  bay: 'Bay', chestnut: 'Chestnut', black: 'Black', grey: 'Grey', dun: 'Dun', buckskin: 'Buckskin', palomino: 'Palomino',
  solid: 'Solid', pinto: 'Pinto', appaloosa: 'Appaloosa', dapples: 'Dapples', roan: 'Roan',
  plain: 'Plain', socks: 'Socks', stockings: 'Stockings',
});
export const HORSE_LOOK_PARTS = Object.freeze([
  Object.freeze({ part: 'coat', field: 'horseCoat', list: HORSE_COATS, name: 'Coat' }),
  Object.freeze({ part: 'pattern', field: 'horsePattern', list: HORSE_PATTERNS, name: 'Pattern' }),
  Object.freeze({ part: 'legs', field: 'horseLegs', list: HORSE_LEGS, name: 'Legs' }),
]);
export const COAT_TEXT = Object.freeze({
  changed: (desc) => `Your horse is now a ${desc}.`,
  noHorse: 'You do not own a horse.',
});

export const COAT_DYES = Object.freeze({
  bay: Object.freeze({ hue: null, sat: Object.freeze(['mul', 1]), val: Object.freeze([0, 1]) }),
  chestnut: Object.freeze({ hue: 13, sat: Object.freeze(['mul', 1.12]), val: Object.freeze([0.05, 1.05]) }),
  black: Object.freeze({ hue: 25, sat: Object.freeze(['abs', 0.14]), val: Object.freeze([0, 0.45]) }),
  grey: Object.freeze({ hue: 30, sat: Object.freeze(['abs', 0.05]), val: Object.freeze([0.25, 0.95]) }),
  dun: Object.freeze({ hue: 33, sat: Object.freeze(['abs', 0.36]), val: Object.freeze([0.18, 0.95]) }),
  buckskin: Object.freeze({ hue: 37, sat: Object.freeze(['abs', 0.58]), val: Object.freeze([0.14, 1.1]) }),
  palomino: Object.freeze({ hue: 40, sat: Object.freeze(['abs', 0.5]), val: Object.freeze([0.25, 1.05]) }),
});
export const COAT_REGION_SHARE = 0.03;
export const COAT_SHADOW_VALUE = 0.3;
export const COAT_SHADOW_REACH = 2;
export const SHADE_HUE = 4;
export const SHADE_VALUE = 0.075;
export const PATTERN_SCALE_PX = 100;
export const LEG_BANDS = Object.freeze([0, 0.1, 0.2]);

export const BIRTH_WEIGHTS = Object.freeze({
  coat: Object.freeze([5, 4, 2, 2, 1, 1, 1]),
  pattern: Object.freeze([6, 2, 1, 2, 1]),
  legs: Object.freeze([5, 3, 2]),
});
// Small on purpose: every look needs its own set of dyed pictures, so road horses share a few sets.
export const STRANGER_SEEDS = 16;

const index = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0);
const pick = (weights, r) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < weights.length; i++) { if (x < weights[i]) return i; x -= weights[i]; }
  return 0;
};

export function readHorseLook(v) {
  const o = v && typeof v === 'object' ? v : {};
  return { coat: index(o.coat, HORSE_COAT_MAX), pattern: index(o.pattern, HORSE_PATTERN_MAX), legs: index(o.legs, HORSE_LEGS_MAX), seed: index(o.seed, HORSE_SEED_MAX) };
}
const C = HORSE_COATS.length, P = HORSE_PATTERNS.length, L = HORSE_LEGS.length;
export const horseLookCode = (look) => { const l = readHorseLook(look); return l.coat + C * (l.pattern + P * (l.legs + L * l.seed)); };
export const HORSE_LOOK_CODE_MAX = C * P * L * (HORSE_SEED_MAX + 1) - 1;
export function horseLookOfCode(code) {
  if (!Number.isInteger(code) || code < 0 || code > HORSE_LOOK_CODE_MAX) return readHorseLook(null);
  return readHorseLook({ coat: code % C, pattern: Math.floor(code / C) % P, legs: Math.floor(code / (C * P)) % L, seed: Math.floor(code / (C * P * L)) });
}
const lookOf = (v) => (typeof v === 'number' ? horseLookOfCode(v) : readHorseLook(v));
export function describeHorseLook(v) {
  const l = lookOf(v);
  const coat = HORSE_LOOK_NAMES[HORSE_COATS[l.coat]].toLowerCase();
  const pattern = HORSE_PATTERNS[l.pattern];
  const body = pattern === 'solid' ? coat : pattern === 'dapples' ? `dapple ${coat}` : `${coat} ${pattern}`;
  return l.legs ? `${body} with ${HORSE_LEGS[l.legs]}` : body;
}

export const isHorseItem = (item) => item?.templateIndex === TRANSPORT_HORSE;
export const activeHorseItem = (items) => (Array.isArray(items) ? items.find(isHorseItem) ?? null : null);
export const horseLookOf = (item) => readHorseLook(isHorseItem(item) ? { coat: item.horseCoat, pattern: item.horsePattern, legs: item.horseLegs, seed: item.horseSeed } : null);
export const riddenHorseLook = (items) => horseLookCode(horseLookOf(activeHorseItem(items)));

export function rollHorseLook(rand = Math.random) {
  return {
    coat: pick(BIRTH_WEIGHTS.coat, rand()), pattern: pick(BIRTH_WEIGHTS.pattern, rand()), legs: pick(BIRTH_WEIGHTS.legs, rand()),
    seed: 1 + Math.min(HORSE_SEED_MAX - 1, Math.floor(rand() * HORSE_SEED_MAX)),
  };
}
// Writes the look onto each item in place, so windows that hold a reference to the item still see it.
export function birthHorses(items, rand = Math.random) {
  if (!Array.isArray(items)) return 0;
  let n = 0;
  for (const item of items) {
    if (!isHorseItem(item) || index(item.horseSeed, HORSE_SEED_MAX) > 0) continue;
    const l = rollHorseLook(rand);
    for (const { part, field } of HORSE_LOOK_PARTS) { if (l[part]) item[field] = l[part]; else delete item[field]; }
    item.horseSeed = l.seed;
    n++;
  }
  return n;
}

export function restyledHorse(item, part, i) {
  const p = HORSE_LOOK_PARTS.find((x) => x.part === part);
  if (!isHorseItem(item) || !p) return null;
  const v = index(i, p.list.length - 1);
  const { [p.field]: _drop, ...rest } = item;
  return v ? { ...rest, [p.field]: v } : rest;
}
export function restyleRiddenHorse(items, part, i) {
  const item = activeHorseItem(items);
  if (!item || !Array.isArray(items)) return { ok: false, text: COAT_TEXT.noHorse };
  const styled = restyledHorse(item, part, i);
  if (!styled) return { ok: false, text: 'Not here.' };
  items[items.indexOf(item)] = styled;
  return { ok: true, text: COAT_TEXT.changed(describeHorseLook(horseLookOf(styled))) };
}
export function horseLookRows(items) {
  const item = activeHorseItem(items);
  if (!item) return null;
  const l = horseLookOf(item);
  return {
    desc: describeHorseLook(l),
    rows: HORSE_LOOK_PARTS.map(({ part, list, name }) => ({ part, name, choices: list.map((k) => HORSE_LOOK_NAMES[k]), current: l[part] })),
  };
}

function fnv(k) {
  let h = 0x811c9dc5;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
// Derived from the key alone, so every client shows the same look for the same road horse on every frame.
export function strangerHorseLook(key) {
  let h = fnv(String(key ?? ''));
  const next = () => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0; return (h >>> 0) / 4294967296; };
  const l = { coat: pick(BIRTH_WEIGHTS.coat, next()), pattern: pick(BIRTH_WEIGHTS.pattern, next()), legs: pick(BIRTH_WEIGHTS.legs, next()), seed: 1 + Math.floor(next() * STRANGER_SEEDS) };
  return horseLookCode(l);
}

export const lookSuffix = (v) => { const c = typeof v === 'number' ? horseLookCode(horseLookOfCode(v)) : horseLookCode(v); return c ? `~${c}` : ''; };

// `hsv`, `nearest2`, `warp` and `mark` return shared scratch arrays (`_hsv`, `_near`, `_warp`, `_mark`), so read
// each result before the next call.
const _hsv = new Float64Array(3), _rgb = new Float64Array(3), _warp = new Float64Array(2), _near = new Float64Array(3), _mark = new Float64Array(2);

function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  _hsv[0] = h; _hsv[1] = max > 0 ? d / max : 0; _hsv[2] = max / 255;
  return _hsv;
}
function rgbInto(out, o, hue, s, v) {
  const h = ((hue % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const k = Math.floor(h / 60) % 6;
  let r, g, b;
  if (k === 0) { r = c; g = x; b = 0; } else if (k === 1) { r = x; g = c; b = 0; } else if (k === 2) { r = 0; g = c; b = x; } else if (k === 3) { r = 0; g = x; b = c; } else if (k === 4) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
  out[o] = Math.round((r + m) * 255); out[o + 1] = Math.round((g + m) * 255); out[o + 2] = Math.round((b + m) * 255);
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (v) => v - Math.floor(v);

function hash3(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 0x27d4eb2f)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash3(ix, iy, s), b = hash3(ix + 1, iy, s), c = hash3(ix, iy + 1, s), d = hash3(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function nearest2(x, y, s, stretch = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix !== _cellAt[0] || iy !== _cellAt[1] || s !== _cellAt[2] || stretch !== _cellAt[3]) {
    _cellAt[0] = ix; _cellAt[1] = iy; _cellAt[2] = s; _cellAt[3] = stretch;
    for (let dy = -1, j = 0; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++, j += 6) {
      const cx = ix + dx, cy = iy + dy;
      _cells[j] = cx + 0.1 + 0.8 * hash3(cx, cy, s); _cells[j + 1] = cy + 0.1 + 0.8 * hash3(cy, cx, s + 1);
      if (stretch) {
        const a = hash3(cx, cy, s + 3) * Math.PI;
        _cells[j + 2] = Math.cos(a); _cells[j + 3] = Math.sin(a); _cells[j + 4] = 1 + stretch * hash3(cx, cy, s + 4);
      }
      _cells[j + 5] = hash3(cx, cy, s + 2);
    }
  }
  let f1 = 9, f2 = 9, bh = 0;
  for (let j = 0; j < 54; j += 6) {
    let ex = x - _cells[j], ey = y - _cells[j + 1];
    if (stretch) {
      const c = _cells[j + 2], sn = _cells[j + 3], k = _cells[j + 4];
      const tx = (ex * c + ey * sn) / k;
      ey = (ey * c - ex * sn) * k; ex = tx;
    }
    const d = Math.hypot(ex, ey);
    if (d < f1) { f2 = f1; f1 = d; bh = _cells[j + 5]; } else if (d < f2) f2 = d;
  }
  _near[0] = f1; _near[1] = f2; _near[2] = bh;
  return _near;
}
const _cellAt = new Float64Array([NaN, NaN, NaN, NaN]), _cells = new Float64Array(54);
export const latticeNearest = (x, y, s, stretch = 0) => Array.from(nearest2(x, y, s, stretch));
function warp(x, y, s, amp, freq = 1.3) {
  _warp[0] = x + amp * (noise(x * freq + 13.1, y * freq, s + 21) * 2 - 1);
  _warp[1] = y + amp * (noise(x * freq, y * freq + 7.7, s + 22) * 2 - 1);
  return _warp;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const seedRand = (seed, k) => hash3(seed, k, 0x5eed);

export function shadeOf(seed) {
  if (!seed) return [0, 1];
  return [(seedRand(seed, 1) * 2 - 1) * SHADE_HUE, 1 + (seedRand(seed, 2) * 2 - 1) * SHADE_VALUE];
}

function pintoField(s, u, v) {
  const ox = seedRand(s, 3) * 61, oy = seedRand(s, 4) * 47;
  const W = warp(u * 2.4 + ox, v * 2.4 + oy, s, 0.45, 1.1), wu = W[0], wv = W[1];
  return 0.62 * noise(wu, wv, s) + 0.28 * noise(wu * 2.3 + oy, wv * 2.3 + ox, s + 7) + 0.1 * noise(wu * 7, wv * 7, s + 8);
}
const pintoCut = (s, n) => { const t = 0.5 + (seedRand(s, 5) - 0.5) * 0.16; return smooth(t - 0.012, t + 0.012, n); };
const roanDensity = (s, u, v) => 0.22 + seedRand(s, 9) * 0.12 + 0.2 * noise(u * 3 + seedRand(s, 3) * 61, v * 3 + seedRand(s, 4) * 47, s + 12);
const roanFleck = (s, px, py, density) => (hash3(px, py, s + 11) < density ? 0.6 : 0);

function markingAt(pattern, seed, u, v, px, py) {
  const s = seed | 0, ox = seedRand(s, 3) * 61, oy = seedRand(s, 4) * 47;
  switch (HORSE_PATTERNS[pattern]) {
    case 'pinto': return mark(pintoCut(s, pintoField(s, u, v)), 0);
    case 'appaloosa': {
      const cell = 0.075 + seedRand(s, 6) * 0.03;
      const W = warp(u / cell + ox, v / cell + oy, s, 0.3);
      const N = nearest2(W[0], W[1], s, 0.45), f1 = N[0], h = N[2];
      const r = (0.14 + 0.2 * h) * (0.75 + 0.5 * noise(u * 40 + ox, v * 40 + oy, s + 9));
      const spot = smooth(r - 0.04, r + 0.04, r * 2 - f1);
      if (seedRand(s, 7) < 0.5) return mark(1 - spot, spot * 0.15);
      return mark(h < 0.7 ? spot : 0, 0);
    }
    case 'dapples': {
      const cell = 0.08 + seedRand(s, 8) * 0.025;
      const W = warp(u / cell + ox, v / cell + oy, s, 0.4);
      const N = nearest2(W[0], W[1], s, 0.7), f1 = N[0], h = N[2];
      const r = 0.3 + 0.16 * h;
      const blot = 1 - smooth(r * 0.45, r, f1 * (0.85 + 0.3 * noise(u * 30 + ox, v * 30 + oy, s + 9)));
      const fade = 0.55 + 0.45 * smooth(0.25, 0.75, noise(u * 1.6 + oy, v * 1.6 + ox, s + 10));
      return mark(0.34 * blot * fade, (1 - blot) * 0.16 * fade);
    }
    case 'roan': return mark(roanFleck(s, px, py, roanDensity(s, u, v)), 0);
    default: return mark(0, 0);
  }
}
const mark = (white, dark) => { _mark[0] = white; _mark[1] = dark; return _mark; };

function dyeInto(out, src, o, dye, hueJ, valJ, white, dark, whiteFloor = 0) {
  const H = hsv(src[o], src[o + 1], src[o + 2]), h0 = H[0], s = H[1], v = H[2];
  const mode = dye.sat[0], k = dye.sat[1], lift = dye.val[0], scale = dye.val[1];
  const hue = (dye.hue ?? h0) + hueJ;
  const ns = clamp01(mode === 'mul' ? s * k : k * Math.min(1, s / 0.6 + 0.3));
  let nv = clamp01((lift + scale * v) * valJ);
  if (dark) nv *= 1 - dark;
  rgbInto(out, o, hue, ns, nv);
  if (white > 0) {
    const tmp = _rgb;
    rgbInto(tmp, 0, hue, 0.04, clamp01(0.4 + 0.85 * Math.max(v, whiteFloor)));
    out[o] = Math.round(out[o] + (tmp[0] - out[o]) * white);
    out[o + 1] = Math.round(out[o + 1] + (tmp[1] - out[o + 1]) * white);
    out[o + 2] = Math.round(out[o + 2] + (tmp[2] - out[o + 2]) * white);
  }
}

export function isCoatPixel(r, g, b, tack = true) {
  const H = hsv(r, g, b), h = H[0], s = H[1], v = H[2];
  if (!((h <= 50 || h >= 345) && s >= 0.2)) return false;
  return !(tack && h >= 28 && h <= 48 && s >= 0.36 && s < 0.58 && v >= 0.24 && v < 0.5);
}

/**
 * @template {{ width: number, height: number, colors: ArrayLike<number> & { buffer: ArrayBufferLike, byteOffset: number, byteLength: number } }} T
 * @param {T} image
 * @param {any} look
 * @param {{ bottomFirst?: boolean, legs?: boolean, tack?: boolean }} [opts]
 * @returns {T}
 */
export function recolorHorse(image, look, { bottomFirst = true, legs = true, tack = true } = {}) {
  const l = lookOf(look);
  if (!horseLookCode(l) || !image?.colors) return image;
  const dye = COAT_DYES[HORSE_COATS[l.coat]];
  const { width: w, height: h } = image;
  const src = new Uint8Array(image.colors.buffer, image.colors.byteOffset, image.colors.byteLength);
  const n = w * h;
  if (src.length < n * 4) return image;
  const out = new Uint8Array(src);
  const hide = hideOf(image.colors, src, w, h, tack);
  if (hide.at.length) {
    const { at, x0, r0, r1 } = hide;
    const hideW = Math.max(1, hide.x1 - x0 + 1), hideH = Math.max(1, r1 - r0 + 1), unit = Math.max(PATTERN_SCALE_PX, hideW);
    const [hueJ, valJ] = shadeOf(l.seed);
    const band = legs ? LEG_BANDS[l.legs] * hideH : 0;
    for (let j = 0; j < at.length; j++) {
      const i = at[j];
      const x = i % w, r = (i - x) / w;
      const down = bottomFirst ? r1 - r : r - r0, up = bottomFirst ? r - r0 : r1 - r;
      let white = 0, dark = 0;
      if (l.pattern) { const M = markingAt(l.pattern, l.seed, (x - x0) / unit, down / unit, x - x0, down); white = M[0]; dark = M[1]; }
      if (band > 0 && up < band * (0.8 + 0.4 * hash3(x - x0, 0, l.seed + 13))) white = 1;
      dyeInto(out, src, i * 4, dye, hueJ, valJ, white, dark);
    }
  }
  const Ctor = /** @type {any} */ (image.colors).constructor;
  const colors = Ctor === Uint8Array ? out : new Ctor(out.buffer, 0, Ctor.BYTES_PER_ELEMENT === 4 ? n : n * 4);
  return /** @type {T} */ ({ ...image, colors });
}

const _hides = new WeakMap();

/**
 * The hide is cached per pixel array, so a picture must never be repainted in place; dye or decode into a new
 * array.
 * @param {object} colors
 * @param {Uint8Array} src
 * @param {number} w
 * @param {number} h
 * @param {boolean} tack
 * @returns {{ at: Int32Array, x0: number, x1: number, r0: number, r1: number }}
 */
function hideOf(colors, src, w, h, tack) {
  let kept = _hides.get(colors);
  if (!kept) { kept = [null, null]; _hides.set(colors, kept); }
  const k = tack ? 1 : 0;
  return kept[k] ?? (kept[k] = findHide(src, w, h, tack));
}

/** @param {{ width: number, height: number, colors: ArrayLike<number> & { buffer: ArrayBufferLike, byteOffset: number, byteLength: number } }} image */
export function pictureHide(image, { tack = true } = {}) {
  return hideOf(image.colors, new Uint8Array(image.colors.buffer, image.colors.byteOffset, image.colors.byteLength), image.width, image.height, tack);
}

function findHide(src, w, h, tack) {
  const n = w * h;
  const coatMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (src[o + 3] && isCoatPixel(src[o], src[o + 1], src[o + 2], tack)) coatMask[i] = 1;
  }
  const region = new Int32Array(n).fill(-1);
  const sizes = [], light = [];
  const stack = [];
  for (let i = 0; i < n; i++) {
    if (!coatMask[i] || region[i] >= 0) continue;
    const id = sizes.length;
    let size = 0, sum = 0;
    region[i] = id; stack.push(i);
    while (stack.length) {
      const p = /** @type {number} */ (stack.pop());
      size++;
      sum += Math.max(src[p * 4], src[p * 4 + 1], src[p * 4 + 2]) / 255;
      const px = p % w, py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const y = py + dy;
        if (y < 0 || y >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = px + dx;
          if (x < 0 || x >= w) continue;
          const q = y * w + x;
          if (coatMask[q] && region[q] < 0) { region[q] = id; stack.push(q); }
        }
      }
    }
    sizes.push(size); light.push(sum / size);
  }
  if (!sizes.length) return { at: new Int32Array(0), x0: w, x1: -1, r0: h, r1: -1 };
  const floor = Math.max(...sizes) * COAT_REGION_SHARE;
  const dyed = sizes.map((z) => z >= floor);
  const near = new Uint8Array(n), R = COAT_SHADOW_REACH;
  for (let i = 0; i < n; i++) {
    if (region[i] < 0 || !dyed[region[i]]) continue;
    const px = i % w, py = (i - px) / w;
    for (let y = Math.max(0, py - R); y <= Math.min(h - 1, py + R); y++) for (let x = Math.max(0, px - R); x <= Math.min(w - 1, px + R); x++) near[y * w + x] = 1;
  }
  for (let i = 0; i < n; i++) { const id = region[i]; if (id >= 0 && !dyed[id] && near[i] && light[id] < COAT_SHADOW_VALUE) dyed[id] = true; }
  let x0 = w, x1 = -1, r0 = h, r1 = -1, count = 0;
  for (let i = 0; i < n; i++) {
    if (region[i] < 0 || !dyed[region[i]]) continue;
    count++;
    const x = i % w, r = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (r < r0) r0 = r; if (r > r1) r1 = r;
  }
  const at = new Int32Array(count);
  for (let i = 0, j = 0; i < n; i++) if (region[i] >= 0 && dyed[region[i]]) at[j++] = i;
  return { at, x0, x1, r0, r1 };
}

// The 3D texture paints the lower legs near black, so white markings use at least this light and the world lighting
// shades them.
export const WHITE_FLOOR_3D = 0.4;
export const PLANE_SHARPNESS = 4;
const PLANE_FLOOR = 0.01;

/**
 * @param {ArrayLike<number>} p
 * @param {ArrayLike<number>} n
 * @param {{ length: number, front: number, top: number }} hide
 */
export function texelPlanes(p, n, hide, out = new Float32Array(9), o = 0) {
  const L = hide.length || 1;
  const along = (hide.front - p[1]) / L, down = (hide.top - p[2]) / L, across = p[0] / L;
  const wx = Math.abs(n[0]) ** PLANE_SHARPNESS, wy = Math.abs(n[1]) ** PLANE_SHARPNESS, wz = Math.abs(n[2]) ** PLANE_SHARPNESS;
  const sum = wx + wy + wz || 1;
  const fx = n[0] < 0 ? 37.3 : 0, fy = n[1] < 0 ? 53.9 : 71.1, fz = n[2] < 0 ? 89.7 : 17.9;
  out[o] = along + fx; out[o + 1] = down; out[o + 2] = wx / sum;
  out[o + 3] = across + fy; out[o + 4] = down; out[o + 5] = wy / sum;
  out[o + 6] = along + fz; out[o + 7] = across; out[o + 8] = wz / sum;
  return out;
}

/**
 * @template {{ width: number, height: number, colors: ArrayLike<number> & { buffer: ArrayBufferLike, byteOffset: number, byteLength: number } }} T
 * @param {T} image
 * @param {any} look
 * @param {{ hide: Uint8Array, planes: Float32Array, up: Float32Array }} map
 * @returns {T}
 */
export function recolorHorseTexels(image, look, map) {
  const l = lookOf(look);
  if (!horseLookCode(l) || !image?.colors || !map) return image;
  const { width: w, height: h } = image;
  const n = w * h;
  const src = new Uint8Array(image.colors.buffer, image.colors.byteOffset, image.colors.byteLength);
  if (src.length < n * 4 || map.hide.length < n) return image;
  const out = new Uint8Array(src);
  dyeHorseTexelRows(src, out, w, l, map, 0, h);
  const Ctor = /** @type {any} */ (image.colors).constructor;
  const colors = Ctor === Uint8Array ? out : new Ctor(out.buffer, 0, Ctor.BYTES_PER_ELEMENT === 4 ? n : n * 4);
  return /** @type {T} */ ({ ...image, colors });
}

/**
 * @param {Uint8Array} src
 * @param {Uint8Array} out
 * @param {number} width
 * @param {any} look
 * @param {{ hide: Uint8Array, planes: Float32Array, up: Float32Array }} map
 * @param {number} r0
 * @param {number} r1
 */
export function dyeHorseTexelRows(src, out, width, look, map, r0, r1) {
  const l = lookOf(look);
  if (!horseLookCode(l)) return;
  const dye = COAT_DYES[HORSE_COATS[l.coat]];
  const [hueJ, valJ] = shadeOf(l.seed);
  const s = l.seed | 0, P = map.planes;
  const band = LEG_BANDS[l.legs];
  const pattern = HORSE_PATTERNS[l.pattern];
  for (let i = r0 * width, end = r1 * width; i < end; i++) {
    const o = i * 4;
    if (!map.hide[i] || !src[o + 3] || !isCoatPixel(src[o], src[o + 1], src[o + 2], false)) continue;
    const x = i % width, y = (i - x) / width, q = i * 9;
    let white = 0, dark = 0, field = 0, rag = 0;
    for (let k = 0; k < 9; k += 3) {
      const pw = P[q + k + 2];
      if (pw < PLANE_FLOOR) continue;
      const u = P[q + k], v = P[q + k + 1];
      if (band > 0) rag += pw * noise(u * 40, v * 40, s + 13);
      if (pattern === 'pinto') field += pw * pintoField(s, u, v);
      else if (pattern === 'roan') field += pw * roanDensity(s, u, v);
      else if (l.pattern) { const M = markingAt(l.pattern, s, u, v, x, y); white += pw * M[0]; dark += pw * M[1]; }
    }
    if (pattern === 'pinto') white = pintoCut(s, field);
    else if (pattern === 'roan') white = roanFleck(s, x, y, field);
    if (band > 0 && map.up[i] < band * (0.8 + 0.4 * rag)) white = 1;
    dyeInto(out, src, o, dye, hueJ, valJ, white, dark, WHITE_FLOOR_3D);
  }
}
