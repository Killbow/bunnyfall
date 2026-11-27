// @ts-check
// The Deep Waters worker loads this module, so it imports only formats/ and world/ code. The worker and the main
// thread must build identical planes.
import {
  DeepWatersBake, BAY_FRAME, inFrame, floodSteps, classifyPixel, coarseCandidateBits, pixelWaterSampler, PIXEL_MIXED, PIXEL_SEA, PIXEL_LAND,
} from './deepWatersBake.js';
import { ETHER_BOX, ISLE_CELL_PX, etherCellOf, etherFrame, isleAt } from './ethericSea.js';
import { etherTemplateOf } from './etherPlaces.js';

export const ETHER_FRAME = Object.freeze(etherFrame());
export const ETHER_ROW = 'ether';

const ALL8 = new Uint8Array(8).fill(0xff);
const NONE8 = new Uint8Array(8);

/**
 * @param {{ towns?: any[], havens?: any[], ruins?: any[] } | null} templates
 * @param {(template: any) => { xMin: number, xMax: number, yMin: number, yMax: number }} rectOf
 */
export function etherPlaceRects(templates, rectOf) {
  const rows = (list) => (list ?? []).map((t) => { const r = rectOf(t); return [r.xMin, r.xMax, r.yMin, r.yMax]; });
  return { towns: rows(templates?.towns), havens: rows(templates?.havens), ruins: rows(templates?.ruins) };
}

/**
 * @param {{ towns?: any[], havens?: any[], ruins?: any[] } | null} templates
 * @param {(template: any) => { xMin: number, xMax: number, yMin: number, yMax: number }} rectOf
 */
export function slicedEtherRects(templates, rectOf, { sliceMs = 6, now = () => performance.now(), later = (fn) => setTimeout(fn, 0) } = {}) {
  const lists = ['towns', 'havens', 'ruins'], out = { towns: [], havens: [], ruins: [] };
  let li = 0, i = 0, done = null, started = false, resolve = null;
  const ready = new Promise((r) => { resolve = r; });
  const step = (until) => {
    for (; li < lists.length; li++, i = 0) {
      const list = templates?.[lists[li]] ?? [];
      for (; i < list.length; i++) {
        if (now() > until) return;
        const r = rectOf(list[i]);
        out[lists[li]].push([r.xMin, r.xMax, r.yMin, r.yMax]);
      }
    }
    done = out;
    resolve(out);
  };
  const pump = () => { if (!done) { step(now() + sliceMs); if (!done) later(pump); } };
  const rects = () => { if (!done) step(Infinity); return done; };
  rects.ready = () => { if (!started) { started = true; pump(); } return ready; };
  return rects;
}

/** @param {{ towns: number[][], havens: number[][], ruins: number[][] } | (() => any) | null} rects */
export function etherRectAt(rects) {
  const read = typeof rects === 'function' ? rects : () => rects;
  return (px, py) => {
    const isle = rects ? isleAt(px, py) : null;
    if (!isle || isle.px !== px || isle.py !== py) return null;
    const r = etherTemplateOf(read(), isle);
    return r ? { xMin: r[0], xMax: r[1], yMin: r[2], yMax: r[3] } : null;
  };
}

export class EtherWatersBake extends DeepWatersBake {
  /**
   * @param {object} deps
   * @param {object} deps.woods
   * @param {{ towns: number[][], havens: number[][], ruins: number[][] } | (() => any) | null} [deps.rects]
   */
  constructor({ woods, rects = null }) {
    super({ woods, global: null, frame: ETHER_FRAME, locationRectAt: etherRectAt(rects) });
    /** @type {Map<number, number>} */
    this._cls = new Map();
    /** @type {Map<number, Uint8Array>} */
    this._sea = new Map();
  }

  _class(i, px, py) {
    let c = this._cls.get(i);
    if (c === undefined) { c = classifyPixel(this.woods, px, py); this._cls.set(i, c); }
    return c;
  }

  _caches() { return [this._fine, this._full, this._dist, this._edge, this._sea, this._cls]; }

  holdsSea(px, py) {
    for (const [x, y] of [[px, py], [px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) if (this.inFrame(x, y) && !this._sea.has(this._index(x, y))) return false;
    return true;
  }

  seaBits(px, py) {
    if (!this.inFrame(px, py)) return null;
    const i = this._index(px, py);
    return this._sea.get(i) ?? this._floodCell(px, py, i);
  }

  _floodCell(px, py, want) {
    const [cx, cy] = etherCellOf(px, py);
    const x0 = ETHER_BOX.x0 + cx * ISLE_CELL_PX, y0 = ETHER_BOX.y0 + cy * ISLE_CELL_PX;
    const w = Math.min(ISLE_CELL_PX, ETHER_BOX.x1 - x0), h = Math.min(ISLE_CELL_PX, ETHER_BOX.y1 - y0);
    const steps = floodSteps(w, h, (x, y) => this._class(this._index(x0 + x, y0 + y), x0 + x, y0 + y),
      (x, y) => coarseCandidateBits(pixelWaterSampler(this.woods, x0 + x, y0 + y, this.locationRectAt(x0 + x, y0 + y))));
    let r = steps.next();
    while (!r.done) r = steps.next();
    const { state, partialIndex, partialBits } = /** @type {any} */ (r.value);
    const partial = new Map();
    for (let k = 0; k < partialIndex.length; k++) partial.set(partialIndex[k], partialBits.slice(k * 8, k * 8 + 8));
    let out = NONE8;
    for (let k = 0; k < w * h; k++) {
      const s = state[k], i = this._index(x0 + (k % w), y0 + Math.floor(k / w));
      const bits = s === 1 ? ALL8 : s === 2 ? partial.get(k) : NONE8;
      this._sea.set(i, bits);
      if (i === want) out = bits;
    }
    return out;
  }

  _row(i, row) {
    const sea = this._sea.get(i), cls = this._cls.get(i);
    return { ...row, f: ETHER_ROW, sea: sea ? sea.slice() : null, cls: cls ?? null };
  }

  prepare(px, py) {
    this._keep(px, py);
    super.prepare(px, py);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.inFrame(px + dx, py + dy)) this.seaBits(px + dx, py + dy);
  }

  adoptPlanes(rows) {
    for (const r of rows ?? []) {
      if (!Number.isInteger(r?.i) || r.i < 0 || r.i >= this.frame.w * this.frame.h) continue;
      if (r.sea && r.sea.length === 8 && !this._sea.has(r.i)) this._sea.set(r.i, r.sea);
      if ((r.cls === PIXEL_LAND || r.cls === PIXEL_SEA || r.cls === PIXEL_MIXED) && !this._cls.has(r.i)) this._cls.set(r.i, r.cls);
    }
    super.adoptPlanes(rows);
  }
}

export class DeepWatersBakes {
  /**
   * @param {DeepWatersBake} bay
   * @param {EtherWatersBake} ether
   */
  constructor(bay, ether) {
    this.bay = bay;
    this.ether = ether;
    this.loaded = true;
    this.hasFineWaterMask = true;
  }
  /** @returns {DeepWatersBake} */
  of(px, py) { return waterFrameOf(px, py, true) === ETHER_FRAME ? this.ether : this.bay; }
  frameOf(px, py) { return waterFrameOf(px, py, true); }
  holdsSea(px, py) { return this.of(px, py).holdsSea(px, py); }
  sampleDistanceMeters(x, y, fx, fz) { return this.of(x, y).sampleDistanceMeters(x, y, fx, fz); }
  sampleEdgeDistanceMeters(x, y, fx, fz) { return this.of(x, y).sampleEdgeDistanceMeters(x, y, fx, fz); }
  sampleLocalEdgeDistanceMeters(x, y, fx, fz) { return this.of(x, y).sampleLocalEdgeDistanceMeters(x, y, fx, fz); }
  isWaterAt(x, y, fx, fz) { return this.of(x, y).isWaterAt(x, y, fx, fz); }
  isCarvedWater(x, y, fx, fz) { return this.of(x, y).isCarvedWater(x, y, fx, fz); }
  mapPixelHasFineWaterCells(x, y) { return this.of(x, y).mapPixelHasFineWaterCells(x, y); }
  mapPixelHasWaterCells(x, y) { return this.of(x, y).mapPixelHasWaterCells(x, y); }
  mapPixelOrCardinalNeighborHasWaterCells(x, y) { return this.of(x, y).mapPixelOrCardinalNeighborHasWaterCells(x, y); }
  mapPixelHasLandCells(x, y) { return this.of(x, y).mapPixelHasLandCells(x, y); }
  prepare(px, py) { this.of(px, py).prepare(px, py); }
  exportPlanes(px, py) { return this.of(px, py).exportPlanes(px, py); }
  adoptPlanes(rows) {
    const list = rows ?? [];
    this.bay.adoptPlanes(list.filter((r) => r?.f !== ETHER_ROW));
    this.ether.adoptPlanes(list.filter((r) => r?.f === ETHER_ROW));
  }
  evictOutside(px, py, radius) { this.bay.evictOutside(px, py, radius); this.ether.evictOutside(px, py, radius); }
}

/**
 * @param {any} bay
 * @param {{ woods?: any, ether?: any }} [opts]
 */
export function worldBakes(bay, { woods = null, ether = null } = {}) {
  if (!bay || !ether) return bay;
  return new DeepWatersBakes(bay, new EtherWatersBake({ woods, rects: ether === true ? null : ether }));
}

export const waterFrameOf = (px, py, ether) => (ether && inFrame(ETHER_FRAME, px, py) ? ETHER_FRAME : BAY_FRAME);
