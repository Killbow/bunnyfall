// @ts-check
// Reads each shallow-water record's own texels to shape its puddles, instead of a full square of water.

import { SHALLOW_WHOLE, SHALLOW_DRAWN, WATER_DRAW_MASK_TABLE } from './waterCorners.js';

export const PUDDLE_RECORDS = Object.freeze([...new Set([...SHALLOW_DRAWN, ...SHALLOW_WHOLE])].sort((a, b) => a - b));
const GROUND_RECORDS = 56;
const anyTurn = (r) => [0, 1, 2, 3].some((t) => WATER_DRAW_MASK_TABLE[(r << 2) | t]);
export const SHORE_RECORDS = Object.freeze(Array.from({ length: GROUND_RECORDS - 1 }, (_, i) => i + 1)
  .filter((r) => anyTurn(r) && !PUDDLE_RECORDS.includes(r)));
export const DRY_RECORDS = Object.freeze(Array.from({ length: GROUND_RECORDS - 1 }, (_, i) => i + 1).filter((r) => !anyTurn(r)));

export const WATER_COLOUR_TOLERANCE = 24;

export const MIN_PATCH_TEXELS = 32;

/**
 * @param {Uint8Array} wet
 * @returns {Uint8Array}
 */
export function cleanMask(wet, w, h, minArea = MIN_PATCH_TEXELS) {
  const n = w * h, seen = new Uint8Array(n), stack = new Int32Array(n), patch = new Int32Array(n);
  for (let pass = 0; pass < 2; pass++) {
    const want = pass === 0 ? 1 : 0;
    if (pass) seen.fill(0);
    for (let start = 0; start < n; start++) {
      if (seen[start] || wet[start] !== want) continue;
      let top = 0, size = 0;
      stack[top++] = start; seen[start] = 1;
      let edge = false;
      while (top) {
        const i = stack[--top], x = i % w, y = (i - x) / w;
        patch[size++] = i;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
        if (x > 0 && !seen[i - 1] && wet[i - 1] === want) { seen[i - 1] = 1; stack[top++] = i - 1; }
        if (x < w - 1 && !seen[i + 1] && wet[i + 1] === want) { seen[i + 1] = 1; stack[top++] = i + 1; }
        if (y > 0 && !seen[i - w] && wet[i - w] === want) { seen[i - w] = 1; stack[top++] = i - w; }
        if (y < h - 1 && !seen[i + w] && wet[i + w] === want) { seen[i + w] = 1; stack[top++] = i + w; }
      }
      if (size < minArea && (want === 1 || !edge)) for (let k = 0; k < size; k++) wet[patch[k]] = 1 - want;
    }
  }
  return wet;
}

class ColourCounts {
  constructor() { this._grow(1 << 12); this.size = 0; }
  _grow(cap) {
    const oldK = this.keys, oldC = this.counts;
    this.keys = new Int32Array(cap).fill(-1); this.counts = new Float64Array(cap); this.mask = cap - 1;
    if (oldK) for (let i = 0; i < oldK.length; i++) if (oldK[i] >= 0) { const at = this._slot(oldK[i]); this.keys[at] = oldK[i]; this.counts[at] = oldC[i]; }
  }
  _slot(key) {
    let i = Math.imul(key, 0x9e3779b1) >>> 0 & this.mask;
    while (this.keys[i] !== -1 && this.keys[i] !== key) i = (i + 1) & this.mask;
    return i;
  }
  add(key) {
    let i = this._slot(key);
    if (this.keys[i] === -1) {
      if ((this.size + 1) * 2 > this.keys.length) { this._grow(this.keys.length * 2); i = this._slot(key); }
      this.keys[i] = key; this.size++;
    }
    this.counts[i]++;
  }
  get(key) { const i = this._slot(key); return this.keys[i] === key ? this.counts[i] : 0; }
  forEach(fn) { for (let i = 0; i < this.keys.length; i++) if (this.keys[i] >= 0) fn(this.keys[i], this.counts[i]); }
}

const bytesOf = (layer) => new Uint8Array(layer.colors.buffer, layer.colors.byteOffset, layer.width * layer.height * 4);

export function waterColours(layer0) {
  const b = bytesOf(layer0), seen = new Set(), out = [];
  for (let i = 0; i < b.length; i += 4) {
    const k = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    if (!seen.has(k)) { seen.add(k); out.push([b[i], b[i + 1], b[i + 2]]); }
  }
  return out;
}

/**
 * @param {Array<{width: number, height: number, colors: ArrayBufferView}>} layers
 */
export function markPuddleWater(layers, tolerance = WATER_COLOUR_TOLERANCE) {
  return stepsDone(markPuddleWaterSteps(layers, tolerance));
}

export function stepsDone(steps) {
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}
export async function stepsBreathing(steps, breathe) {
  for (;;) { const r = steps.next(); if (r.done) return r.value; await breathe(); }
}
export function* markPuddleWaterSteps(layers, tolerance = WATER_COLOUR_TOLERANCE) {
  if (!layers?.[0]) return layers;
  const water = waterColours(layers[0]);
  const t2 = tolerance * tolerance;
  const verdict = new Map();
  const isWater = (r, g, b) => {
    const k = (r << 16) | (g << 8) | b;
    let v = verdict.get(k);
    if (v === undefined) {
      v = water.some(([wr, wg, wb]) => (r - wr) ** 2 + (g - wg) ** 2 + (b - wb) ** 2 <= t2);
      verdict.set(k, v);
    }
    return v;
  };
  const out = layers.slice();
  for (const rec of PUDDLE_RECORDS) {
    const layer = layers[rec];
    if (!layer) continue;
    const b = bytesOf(layer).slice();
    const wet = new Uint8Array(layer.width * layer.height);
    for (let i = 0; i < wet.length; i++) wet[i] = isWater(b[i * 4], b[i * 4 + 1], b[i * 4 + 2]) ? 1 : 0;
    cleanMask(wet, layer.width, layer.height);
    for (let i = 0; i < wet.length; i++) b[i * 4 + 3] = wet[i] ? 255 : 0;
    out[rec] = { ...layer, colors: b };
    yield;
  }
  return yield* markShoreWaterSteps(out);
}

export const SHORE_DRY_RATIO = 0.05;

export function shoreWaterColours(layers) {
  return stepsDone(shoreWaterColoursSteps(layers));
}
export function* shoreWaterColoursSteps(layers) {
  function* count(records) {
    const c = new ColourCounts();
    let total = 0;
    for (const r of records) {
      if (!layers[r]) continue;
      const b = bytesOf(layers[r]);
      total += b.length / 4;
      for (let i = 0; i < b.length; i += 4) c.add((b[i] << 16) | (b[i + 1] << 8) | b[i + 2]);
      yield;
    }
    return { c, total: Math.max(total, 1) };
  }
  const wet = yield* count([0, ...SHORE_RECORDS]), dry = yield* count(DRY_RECORDS);
  const water = new Set();
  wet.c.forEach((k, n) => { if (dry.c.get(k) / dry.total < SHORE_DRY_RATIO * n / wet.total) water.add(k); });
  return water;
}

export function markShoreWater(layers) {
  return stepsDone(markShoreWaterSteps(layers));
}
export function* markShoreWaterSteps(layers) {
  if (!layers?.[0]) return layers;
  const water = yield* shoreWaterColoursSteps(layers);
  const out = layers.slice();
  let lastKey = -1, lastWet = 0;
  for (const rec of SHORE_RECORDS) {
    const layer = layers[rec];
    if (!layer) continue;
    const b = new Uint8Array(bytesOf(layer));
    const wet = new Uint8Array(layer.width * layer.height);
    for (let i = 0; i < wet.length; i++) {
      const k = (b[i * 4] << 16) | (b[i * 4 + 1] << 8) | b[i * 4 + 2];
      if (k !== lastKey) { lastKey = k; lastWet = water.has(k) ? 1 : 0; }
      wet[i] = lastWet;
    }
    cleanMask(wet, layer.width, layer.height, MIN_PATCH_TEXELS * Math.max(1, (layer.width * layer.height) / 4096));
    for (let i = 0; i < wet.length; i++) b[i * 4 + 3] = 255 * wet[i];
    out[rec] = { ...layer, colors: b };
    yield;
  }
  return out;
}

export function turnFraction(turn, fx, fz) {
  switch (turn & 3) {
    case 1: return [fz, 1 - fx];
    case 2: return [1 - fx, 1 - fz];
    case 3: return [1 - fz, fx];
    default: return [fx, fz];
  }
}

/**
 * @param {{width: number, height: number, colors: ArrayBufferView}} layer
 * @param {number} byte
 * @param {number} fx
 * @param {number} fz
 */
export function puddleWetAt(layer, byte, fx, fz) {
  const [u, v] = turnFraction(byte & 3, fx, fz);
  const x = Math.min(layer.width - 1, Math.max(0, Math.floor(u * layer.width)));
  const y = Math.min(layer.height - 1, Math.max(0, Math.floor(v * layer.height)));
  return bytesOf(layer)[(y * layer.width + x) * 4 + 3] >= 128;
}

/**
 * @param {Array<{width:number,height:number,colors:ArrayLike<number>}>} modLayers
 * @param {Array<{width:number,height:number,colors:ArrayLike<number>}>} classicMarked
 * @returns
 */
export function carryPuddleMask(modLayers, classicMarked) {
  return stepsDone(carryPuddleMaskSteps(modLayers, classicMarked));
}
export function* carryPuddleMaskSteps(modLayers, classicMarked) {
  const out = modLayers.slice();
  for (const rec of [...PUDDLE_RECORDS, ...SHORE_RECORDS]) {
    const m = modLayers[rec], c = classicMarked?.[rec];
    if (!m || !c) continue;
    const src = bytesOf(c), b = bytesOf(m).slice();
    for (let y = 0; y < m.height; y++) {
      const sy = Math.min(c.height - 1, Math.floor(y * c.height / m.height));
      for (let x = 0; x < m.width; x++) {
        const sx = Math.min(c.width - 1, Math.floor(x * c.width / m.width));
        b[(y * m.width + x) * 4 + 3] = src[(sy * c.width + sx) * 4 + 3];
      }
    }
    out[rec] = { ...m, colors: b };
    yield;
  }
  return palettedSet(modLayers) ? yield* markShoreWaterSteps(out) : out;
}

export function palettedSet(layers) {
  if (!layers?.[0]) return false;
  const b = bytesOf(layers[0]), seen = new Set();
  for (let i = 0; i < b.length; i += 4) {
    seen.add((b[i] << 16) | (b[i + 1] << 8) | b[i + 2]);
    if (seen.size > 256) return false;
  }
  return true;
}
