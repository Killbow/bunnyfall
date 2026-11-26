// @ts-check
import { serpentLaneOf, serpentAlongOf, serpentRing, SERPENT_LANE_TRIES } from '../net/serpentLaw.js';
import { PIXEL_M } from '../net/gateLaw.js';
import { PIXEL_UNITS } from '../net/wire.js';
import { REGION_NAMES } from '../formats/mapsFile.js';
export const SITE_CLEAR_PX = 1;
export const SITE_LANE_MIN_M = 6 * PIXEL_M;
export const SITE_SLIDE = 0.16;
export const SITE_SLIDE_STEP = 0.04;

// Uses the same arithmetic as `mapPixelOfWire` in `src/net/wire.js`; keep the two in sync.
export const sitePixelOfNative = (x, z) => [Math.trunc(x / PIXEL_UNITS), 499 - Math.trunc(z / PIXEL_UNITS)];
export function openAround(px, py, open, r = SITE_CLEAR_PX) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!open(px + dx, py + dy)) return false;
  return true;
}
export function pointAlong(way, k) {
  const pts = way.pts;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  let left = Math.max(0, Math.min(1, k)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= d) { const t = d > 0 ? left / d : 0; return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
    left -= d;
  }
  return { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z };
}

/**
 * @param {number} day
 * @param {{lanes: ReadonlyArray<any>, wayOf: (lane: any) => ({pts: {x: number, z: number}[], len: number}|null), open: (px: number, py: number) => boolean}} sea
 */
export function findSerpentSite(day, { lanes, wayOf, open }) {
  const n = lanes?.length ?? 0;
  if (!n) return null;
  const tried = new Set();
  for (let i = 0; i < SERPENT_LANE_TRIES; i++) {
    const k = serpentLaneOf(day, i, n);
    if (k < 0 || tried.has(k)) continue;
    tried.add(k);
    const lane = lanes[k];
    const way = wayOf(lane);
    if (!way || !(way.len >= SITE_LANE_MIN_M) || !(way.pts?.length >= 2)) continue;
    const f = serpentAlongOf(day, i);
    for (let j = 0; j <= Math.round((2 * SITE_SLIDE) / SITE_SLIDE_STEP); j++) {
      const g = f + (j === 0 ? 0 : (j % 2 ? 1 : -1) * Math.ceil(j / 2) * SITE_SLIDE_STEP);
      if (g < 0.15 || g > 0.85) continue;
      const p = pointAlong(way, g);
      const [px, py] = sitePixelOfNative(p.x, p.z);
      if (!openAround(px, py, open)) continue;
      const da = Math.hypot(lane.a.road.x - px, lane.a.road.y - py), db = Math.hypot(lane.b.road.x - px, lane.b.road.y - py);
      const port = da <= db ? lane.a : lane.b;
      const near = String(port.name || '') || (REGION_NAMES[port.region] ?? 'the Bay');
      const region = REGION_NAMES[port.region] ?? '';
      return Object.freeze({
        day, lane: lane.key, px, py, sx: p.x, sz: p.z, near, region,
        place: region && region !== near ? `${near}, ${region}` : near,
        between: [lane.a.name || null, lane.b.name || null],
        ring: serpentRing(day, p.x, p.z),
      });
    }
  }
  return null;
}
