// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, the war against Rodney): RODNEY'S BLIGHT - the purple land spreading out of Cromwark.
//
// Asked: the blight spreads "Daily"; inside it "Purple tint + tougher foes" (and Nyx coins); it is pushed back by
// "Beating raids at the front" and held by "Company territory nearby".
//
//   - THE SHAPE: BLIGHT_SECTORS slices round Cromwark's middle. Each slice's edge is the Cromwark zone's own edge that
//     way (the client measures it off the zone's mask) plus the slice's EXTRA, in map pixels.
//   - DAILY: every UTC day each slice's extra grows BLIGHT_GROW_PX_DAY, up to BLIGHT_EXTRA_MAX (the account service
//     keeps the extras - server-account/src/blight.js).
//   - RAIDS: a raid cleared in a town within BLIGHT_PUSH_REACH of the edge (or inside it) pushes its slice back
//     BLIGHT_PUSH_PX and the two beside it half that - once a raid, whoever claims it first.
//   - TERRITORY HOLDS IT: a Company's or a Charter's territory in a slice's way stops the blight, as deep into the patch
//     as the patch is weak (territoryLaw.js territoryFill: a full patch holds at its edge, a bare hall holds nothing).
//     The extras keep growing behind a held patch, so a Company that stops playing is flooded. Where a patch holds it,
//     that is THE FRONT, drawn on the map.
//   - INSIDE (outside Cromwark itself): foes wear Cromwark's purple and strike BLIGHT_FOE_MULT harder; a kill may drop
//     a Nyx coin at Cromwark's outer ring's chance.
//
// Pure: no clock, no DOM, no network. Both ends read it; every number is balance.
import { territoryFill } from './territoryLaw.js';

export const BLIGHT_SECTORS = 32;
export const BLIGHT_GROW_PX_DAY = 1.5;
export const BLIGHT_EXTRA_START = 4;
export const BLIGHT_EXTRA_MAX = 90;
export const BLIGHT_PUSH_PX = 4;
export const BLIGHT_PUSH_REACH = 10;
export const BLIGHT_FOE_MULT = 1.25;
/** The least a territory must be filled (territoryLaw.js territoryFill) to hold the blight at all. */
export const BLIGHT_HOLD_MIN = 0.1;
/** A raid's push is taken while its day is this recent (UTC days) - a receipt kept a while still counts. */
export const BLIGHT_PUSH_DAYS = 3;

const TAU = Math.PI * 2;
/** A slice's middle angle (radians, map pixels: x right, y down). */
export const sectorAngle = (i) => ((i + 0.5) / BLIGHT_SECTORS) * TAU;
/** The slice an offset (dx, dy) from the middle lies in. */
export const sectorOf = (dx, dy) => {
  const a = (Math.atan2(dy, dx) + TAU) % TAU;
  return Math.min(BLIGHT_SECTORS - 1, Math.floor((a / TAU) * BLIGHT_SECTORS));
};

/** A fresh set of extras. */
export const blightStart = () => Array.from({ length: BLIGHT_SECTORS }, () => BLIGHT_EXTRA_START);
/** Extras read back, every slice a number inside its bounds (a bad row starts again). */
export function blightExtrasOf(raw) {
  const a = Array.isArray(raw) ? raw : [];
  return Array.from({ length: BLIGHT_SECTORS }, (_, i) => { const n = Number(a[i]); return Number.isFinite(n) ? Math.max(0, Math.min(BLIGHT_EXTRA_MAX, n)) : BLIGHT_EXTRA_START; });
}
/** The extras `days` days on. */
export const blightGrown = (extras, days) => extras.map((e) => Math.min(BLIGHT_EXTRA_MAX, e + BLIGHT_GROW_PX_DAY * Math.max(0, days)));
/** The extras after a raid cleared in slice `s`: it and its two neighbours pushed back. */
export function blightPushed(extras, s) {
  const out = extras.slice();
  const at = (k) => ((k % BLIGHT_SECTORS) + BLIGHT_SECTORS) % BLIGHT_SECTORS;
  out[at(s)] = Math.max(0, out[at(s)] - BLIGHT_PUSH_PX);
  out[at(s - 1)] = Math.max(0, out[at(s - 1)] - BLIGHT_PUSH_PX / 2);
  out[at(s + 1)] = Math.max(0, out[at(s + 1)] - BLIGHT_PUSH_PX / 2);
  return out;
}

/**
 * THE EDGE AS IT STANDS: for each slice, the raw radius (`zone[i] + extras[i]`) and the radius after the territories in
 * its way (`r`), and whether one held it (`held`). `patches` are `{ x, y, r, strength }` - Companies' and Charters'
 * territories alike - in map pixels; `centre` `{ x, y }`; `zone` each slice's Cromwark edge distance.
 * @param {{ x: number, y: number }} centre
 * @param {number[]} zone
 * @param {number[]} extras
 * @param {{ x: number, y: number, r: number, strength: number }[]} patches
 */
export function blightEdge(centre, zone, extras, patches = []) {
  const out = [];
  for (let i = 0; i < BLIGHT_SECTORS; i++) {
    const a = sectorAngle(i), ux = Math.cos(a), uy = Math.sin(a);
    const z = Math.max(0, Number(zone[i]) || 0);
    const raw = z + (Number(extras[i]) || 0);
    let r = raw;
    for (const p of patches) {
      const cx = p.x - centre.x, cy = p.y - centre.y;
      const t = cx * ux + cy * uy;
      if (t <= 0) continue;
      const perp2 = cx * cx + cy * cy - t * t;
      if (perp2 >= p.r * p.r) continue;
      const half = Math.sqrt(p.r * p.r - perp2);
      const enter = t - half;
      if (enter >= raw) continue;
      const fill = territoryFill(p.strength);
      if (fill < BLIGHT_HOLD_MIN) continue;   // a bare hall holds nothing: the blight passes over it
      const stop = Math.max(z, enter + (1 - fill) * 2 * half);
      if (stop < r) r = stop;
    }
    out.push({ raw, r, held: r < raw - 0.01 });
  }
  return out;
}

/** The edge's radius at angle `a`, between the two slices about it. */
export function blightRadiusAt(edge, a) {
  const f = (((a % TAU) + TAU) % TAU) / TAU * BLIGHT_SECTORS - 0.5;
  const i0 = Math.floor(f), w = f - i0;
  const at = (k) => edge[((k % BLIGHT_SECTORS) + BLIGHT_SECTORS) % BLIGHT_SECTORS]?.r ?? 0;
  return at(i0) * (1 - w) + at(i0 + 1) * w;
}
/** How far (map pixels) a point stands inside the edge - negative outside. */
export const blightDepth = (centre, edge, px, py) => {
  const dx = px - centre.x, dy = py - centre.y;
  return blightRadiusAt(edge, Math.atan2(dy, dx)) - Math.hypot(dx, dy);
};
