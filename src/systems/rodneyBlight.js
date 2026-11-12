// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, the war against Rodney): THE CLIENT'S BOOK OF RODNEY'S BLIGHT - the slices' reach as
// the account service keeps it (server-account/src/blight.js), laid round Cromwark's zone (its mask, measured here once)
// and held back by the Companies' and Charters' territories (systems/companyTerritory.js), by the law
// (net/blightLaw.js). The held map paints it and its front (ui/territoryMapInk.js paintBlight); the host asks whether the
// player stands in it (foes in purple, harder blows, Nyx coins); a raid this device claimed near its edge pushes it back.
//
// Online only: offline `io` answers nothing and the book stays empty (no blight drawn, no foe changed).
import { blightRead, blightPush } from '../net/accountClient.js';
import { BLIGHT_SECTORS, BLIGHT_PUSH_REACH, sectorAngle, sectorOf, blightEdge, blightDepth } from '../net/blightLaw.js';
import { wildInside } from './wild/wildZone.js';

export const BLIGHT_REFRESH_MS = 10 * 60_000;
export const BLIGHT_RETRY_MS = 60_000;
/** How far a ray walks from the middle looking for the zone's edge, map pixels. */
const ZONE_REACH_PX = 160;

/**
 * @param {{
 *   io: () => any,
 *   mask: () => any,                                   Cromwark's zone mask (systems/wild/wildZone.js wildMaskOf), or null
 *   territory: () => any,                              the territory book, or null
 *   here: () => ({ x: number, y: number } | null),     the player's map pixel
 *   townPixel: (region: number, location: number) => ({ x: number, y: number } | null),   a raided town's pixel
 *   nowMs?: () => number,
 * }} deps
 */
export function createRodneyBlight({ io, mask, territory, here, townPixel, nowMs = Date.now }) {
  /** @type {number[]|null} */
  let extras = null;
  let nextAt = 0;
  /** @type {Promise<any>|null} */
  let asking = null;
  let version = 0;
  /** @type {{ centre: { x: number, y: number }, zone: number[] }|null} */
  let geo = null;
  let edgeKey = '';
  /** @type {any[]|null} */
  let edge = null;

  function refresh(force = false) {
    const t = nowMs();
    if (asking) return asking;
    if (!force && t < nextAt) return Promise.resolve(null);
    const door = io?.();
    if (!door) { nextAt = t + BLIGHT_RETRY_MS; return Promise.resolve(null); }
    asking = blightRead(door).then((r) => {
      if (r?.ok && Array.isArray(r.data?.extras)) { extras = r.data.extras; version++; nextAt = nowMs() + BLIGHT_REFRESH_MS; }
      else nextAt = nowMs() + BLIGHT_RETRY_MS;
      return r;
    }, () => { nextAt = nowMs() + BLIGHT_RETRY_MS; return null; }).finally(() => { asking = null; });
    return asking;
  }

  /** Cromwark's middle and how far its zone reaches each slice's way - measured once off the mask. */
  function geometry() {
    if (geo) return geo;
    const m = mask?.();
    const bx = m?.box;
    if (!bx) return null;
    const centre = { x: (bx.x0 + bx.x1 + 1) / 2, y: (bx.y0 + bx.y1 + 1) / 2 };
    const zone = [];
    for (let i = 0; i < BLIGHT_SECTORS; i++) {
      const a = sectorAngle(i), ux = Math.cos(a), uy = Math.sin(a);
      let last = 0;
      for (let d = 0; d <= ZONE_REACH_PX; d += 0.5) {
        if (wildInside(m, Math.floor(centre.x + ux * d), Math.floor(centre.y + uy * d))) last = d;
      }
      zone.push(last);
    }
    geo = { centre, zone };
    return geo;
  }

  /** The territories that stand in the blight's way: Companies' and Charters' patches with their strengths. */
  function patches() {
    const T = territory?.();
    if (!T) return [];
    return [...T.marks(), ...T.charterMarks()].map((p) => ({ x: p.x, y: p.y, r: p.r, strength: p.strength ?? 0 }));
  }

  /** The edge as it stands - each slice's `{ raw, r, held }` - or null before the blight is heard. */
  function edgeNow() {
    refresh();
    const g = geometry();
    if (!g || !extras) return null;
    const key = `${version}|${territory?.()?.sig?.() ?? ''}`;
    if (key !== edgeKey || !edge) { edgeKey = key; edge = blightEdge(g.centre, g.zone, extras, patches()); }
    return edge;
  }

  /** How deep a map pixel stands in the blight (negative outside) - Cromwark's own zone counts as outside it (the
   *  zone keeps its own rules). Null before the blight is heard. */
  function depthAt(x, y) {
    const e = edgeNow(), g = geo;
    if (!e || !g) return null;
    const m = mask?.();
    if (m && wildInside(m, Math.floor(x), Math.floor(y))) return -1;
    return blightDepth(g.centre, e, x, y);
  }

  return {
    refresh,
    /** For the map: `{ centre, edge }` or null. */
    shape: () => { const e = edgeNow(); return e && geo ? { centre: geo.centre, edge: e } : null; },
    /** Whether the player stands in the blight (outside Cromwark's own zone). */
    here: () => { const p = here?.(); const d = p ? depthAt(p.x + 0.5, p.y + 0.5) : null; return d != null && d > 0; },
    /**
     * A raid this device's claim was counted for: where its town stands within BLIGHT_PUSH_REACH of the edge (or
     * inside it), the service is asked to push that slice back. `raid` the receipt's key (region:location:day).
     */
    raidCleared: async (raid) => {
      const m = /^(\d+):(\d+):\d+$/.exec(String(raid ?? ''));
      const door = io?.();
      if (!m || !door) return null;
      const p = townPixel(Number(m[1]), Number(m[2]));
      const g = geometry();
      if (!p || !g) return null;
      const d = depthAt(p.x + 0.5, p.y + 0.5);
      if (d == null || d < -BLIGHT_PUSH_REACH) return null;
      const r = await blightPush(door, raid, sectorOf(p.x + 0.5 - g.centre.x, p.y + 0.5 - g.centre.y));
      if (r?.ok && r.data?.pushed) { await refresh(true); return { pushed: true }; }
      return null;
    },
    sig: () => `${version}|${territory?.()?.sig?.() ?? ''}`,
  };
}
