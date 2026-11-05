// @ts-check
// BUNNYFALL (2026-11-05, the owner: "edits to the map to show these changes" - the courts of the Bay and the danger ahead):
// THE COURTS' SIDES OF THE REACH. Each court that answered Cromwark holds the stretch of the zone's border that faces it:
// Daggerfall's roadblock, Sentinel's warriors and Orsinium's claim. A border pixel belongs to the court whose capital lies
// nearest the pixel's bearing from the zone's centre (the capitals are far from the zone, so a bearing, not a distance, says
// which side faces them). The same on every client: read off the map files each holds. Used by the held maps (a tint along
// the border and a post for each court, ui/wild/wildMapInk.js) and the travel map (the rim's tint).
import { wildMaskOf } from './wildZone.js';
import { CROMWARK_ON } from './cromwark.js';

/** The courts: region and location the map files know their capital by, the border's tint and the post's words. */
export const COURTS = Object.freeze([
  Object.freeze({ id: 'daggerfall', region: 'Daggerfall', loc: 'Daggerfall', css: '#4f86e8', rgb: [79, 134, 232], wp: 'blue',
    name: 'Daggerfall roadblock', brief: 'Daggerfall has shut the foothill roads on its side of the reach and will answer no questions.' }),
  Object.freeze({ id: 'sentinel', region: 'Sentinel', loc: 'Sentinel', css: '#e0603a', rgb: [224, 96, 58], wp: 'orange',
    name: "Sentinel's warriors", brief: "Sentinel's warriors hold the edge of the reach and are ordered no farther." }),
  Object.freeze({ id: 'orsinium', region: 'Orsinium Area', loc: 'Orsinium', css: '#5ca854', rgb: [92, 168, 84], wp: 'green',
    name: "Orsinium's claim", brief: "Orsinium claims the mountain passes and offers its axes to any lord who will honour the claim." }),
]);

/** @type {Array<any> | null} */
let _anchors = null;
/** @type {{ x: number, y: number } | null} */
let _centre = null;
/** @type {any} */
let _mask = null;

/** Register the world's map files, once (the world host): the capitals' pixels and the zone's centre are read off them. */
export function setCourtMaps(/** @type {any} */ maps) {
  _anchors = null; _centre = null; _mask = null;
  if (!CROMWARK_ON || !maps?.getLocationByName) return;
  const mask = wildMaskOf(maps);
  if (!mask?.box) return;
  const centre = { x: (mask.box.x0 + mask.box.x1 + 1) / 2, y: (mask.box.y0 + mask.box.y1 + 1) / 2 };
  const out = [];
  for (const c of COURTS) {
    try {
      const m = maps.getLocationByName(c.region, c.loc)?.mapTableData;
      if (!m || !Number.isFinite(m.longitude) || !Number.isFinite(m.latitude)) continue;
      const x = Math.trunc(m.longitude / 128), y = 499 - Math.trunc(m.latitude / 128);   // formats/mapsFile.js longitudeLatitudeToMapPixel
      out.push({ court: c, angle: Math.atan2(y - centre.y, x - centre.x) });
    } catch { /* a map file without that capital: that court holds no side */ }
  }
  if (out.length) { _anchors = out; _centre = centre; _mask = mask; }
}

const turn = (/** @type {number} */ a) => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

/** The court whose side of the reach map point (x, y) is, or null where none is registered. */
export function courtAt(/** @type {number} */ x, /** @type {number} */ y) {
  if (!_anchors || !_centre) return null;
  const a = Math.atan2(y - _centre.y, x - _centre.x);
  let best = null, bestD = Infinity;
  for (const k of _anchors) { const d = turn(a - k.angle); if (d < bestD) { bestD = d; best = k.court; } }
  return best;
}

/** Walk a chain of corner points into runs of one court each: `[{ court, pts: [{x, y}] }]`. A run starts at the vertex
 *  where the court changes (the vertex shared, so the line is unbroken). */
export function courtRuns(/** @type {Array<Array<{x: number, y: number}>>} */ chains) {
  if (!_anchors) return [];
  const runs = [];
  for (const c of chains) {
    let cur = null;
    for (let i = 0; i < c.length; i++) {
      const j = Math.min(c.length - 1, i + 1);
      const mid = { x: (c[i].x + c[j].x) / 2, y: (c[i].y + c[j].y) / 2 };   // the edge's own middle, so a corner takes the side it leads to
      const court = i === c.length - 1 ? cur?.court ?? null : courtAt(mid.x, mid.y);
      if (!court) { cur = null; continue; }
      if (!cur || cur.court !== court) {
        cur = { court, pts: cur && cur.pts.length ? [cur.pts[cur.pts.length - 1]] : [] };
        runs.push(cur);
      }
      cur.pts.push(c[i]);
    }
  }
  return runs.filter((r) => r.pts.length >= 2);
}

/** Each court's POST: the middle of the border it holds, as a map point `{ court, x, y }` (the pixel the border runs by),
 *  the same on every client. */
export function courtPosts(/** @type {any} */ mask = _mask) {
  if (!_anchors || !_centre || !mask?.box) return [];
  const { x0, y0, x1, y1 } = mask.box, w = mask.width;
  const byCourt = new Map();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (mask.inside[y * w + x] !== 1) continue;
      const rim = x === 0 || y === 0 || mask.inside[y * w + x - 1] !== 1 || mask.inside[y * w + x + 1] !== 1 || mask.inside[(y - 1) * w + x] !== 1 || mask.inside[(y + 1) * w + x] !== 1;
      if (!rim || y === 0) continue;   // never along the map's own upper edge, where the map ends
      const court = courtAt(x + 0.5, y + 0.5);
      if (!court) continue;
      const list = byCourt.get(court.id) ?? [];
      list.push({ x: x + 0.5, y: y + 0.5, a: Math.atan2(y + 0.5 - _centre.y, x + 0.5 - _centre.x) });
      byCourt.set(court.id, list);
    }
  }
  const out = [];
  for (const c of COURTS) {
    const list = byCourt.get(c.id);
    if (!list?.length) continue;
    // the median by bearing: the middle of the arc the court holds. A bearing is cut at the arc's own far end, so the arc's
    // bearings are unrolled from its first point and never wrapped
    const base = list[0].a;
    const un = list.map((p) => ({ ...p, u: ((p.a - base + Math.PI * 3) % (Math.PI * 2)) - Math.PI })).sort((p, q) => p.u - q.u);
    const m = un[Math.floor(un.length / 2)];
    out.push({ court: c, x: m.x, y: m.y });
  }
  return out;
}

/** The rim's texel on the travel map: the border's purple pulled toward the court's tint. Packed RGBA, or null. */
export function courtRimTexel(/** @type {number} */ px, /** @type {number} */ py, /** @type {number} */ pr = 155, /** @type {number} */ pg = 77, /** @type {number} */ pb = 255) {
  const c = courtAt(px + 0.5, py + 0.5);
  if (!c) return null;
  const k = 0.62, r = Math.round(pr * (1 - k) + c.rgb[0] * k), g = Math.round(pg * (1 - k) + c.rgb[1] * k), b = Math.round(pb * (1 - k) + c.rgb[2] * k);
  return (((255 << 24) >>> 0) | (b << 16) | (g << 8) | r) >>> 0;
}
