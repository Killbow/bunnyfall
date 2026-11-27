// Finds whether a large picture is built from classic texture records, on aligned blocks of 32, 64, and 128.
// Flat records (one color covering FLAT_SHARE) are skipped, since they match any flat area of that color.

import { DERIVED_SHARE } from '../detailedShipsAssets.mjs';

const rgbAt = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];

export const FLAT_SHARE = 0.9;

function prepare(rec) {
  const { width: w, data } = rec.rgba;
  const px = new Int32Array(w * w);
  const counts = new Map();
  for (let i = 0; i < w * w; i++) {
    const c = rgbAt(data, i * 4);
    px[i] = c;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const top = Math.max(...counts.values());
  return { ...rec, w, px, counts, flat: top >= FLAT_SHARE * w * w };
}

/**
 * @returns {{ archive:number, record:number, frame:number, size:number, at:[number,number], share:number, flatsSkipped:number } | null}
 */
export function bestClassicBlock(pic, records, sizes = [32, 64, 128]) {
  const prepared = new Map(sizes.map((s) => [s, []]));
  let flats = 0;
  for (const r of records) {
    const { width, height } = r.rgba;
    if (width !== height || !prepared.has(width)) continue;
    const p = prepare(r);
    if (p.flat) flats++;
    else prepared.get(width).push(p);
  }
  let best = null;
  for (const [w, recs] of prepared) {
    for (let by = 0; by + w <= pic.height; by += w) {
      for (let bx = 0; bx + w <= pic.width; bx += w) {
        const block = new Int32Array(w * w);
        const counts = new Map();
        let visible = 0;
        for (let y = 0; y < w; y++) {
          for (let x = 0; x < w; x++) {
            const i = ((by + y) * pic.width + bx + x) * 4;
            if (pic.data[i + 3] === 0) { block[y * w + x] = -1; continue; }
            const c = rgbAt(pic.data, i);
            block[y * w + x] = c;
            counts.set(c, (counts.get(c) ?? 0) + 1);
            visible++;
          }
        }
        if (visible < (w * w) / 4) continue;
        const floor = Math.max(best?.share ?? 0, 0) * visible;
        for (const r of recs) {
          let bound = 0;
          for (const [c, n] of counts) { const m = r.counts.get(c); if (m) bound += Math.min(n, m); }
          if (bound <= floor) continue;
          let same = 0;
          for (let i = 0; i < w * w; i++) if (block[i] === r.px[i]) same++;
          const share = same / visible;
          if (!best || share > best.share) best = { archive: r.archive, record: r.record, frame: r.frame, size: w, at: [bx, by], share };
        }
      }
    }
  }
  return best && { ...best, flatsSkipped: flats };
}

export function cropToVisible(pic) {
  let x0 = pic.width, y0 = pic.height, x1 = -1, y1 = -1;
  for (let y = 0; y < pic.height; y++) {
    for (let x = 0; x < pic.width; x++) {
      if (pic.data[(y * pic.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(pic.data.subarray(((y0 + y) * pic.width + x0) * 4, ((y0 + y) * pic.width + x1 + 1) * 4), y * w * 4);
  return { width: w, height: h, data, at: [x0, y0] };
}

export const isDerivedBlock = (m) => !!m && m.share >= DERIVED_SHARE;
