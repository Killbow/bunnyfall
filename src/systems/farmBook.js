// @ts-check
// BUNNYFALL COMPANIES (2026-11-12): THE CLIENT'S BOOK OF COMPANY FARMS - every farm as the maps show it (`all`) and the
// character's Company's farms in full (`mine` - the Farms page of the Company window, ui/socialPanel.js). The account
// service keeps them and reaps each day into the Company Stores (server-account/src/farms.js); the law is
// net/farmLaw.js. This side knows the map: which farms stand inside the Company's (or its Charter's) territory - the ones
// it may buy - and whether the player stands at one (a chore). A farm the territory no longer reaches is let go here, as
// soon as the territories are heard. Online only.
import { farmsRead, farmBuy, farmCrop, farmRelease, farmChore } from '../net/accountClient.js';
import { inTerritory } from '../net/territoryLaw.js';

export const FARM_REFRESH_MS = 2 * 60_000;
export const FARM_RETRY_MS = 30_000;
/** How many farms the page offers to buy, nearest first. */
export const FARM_OFFERS_MAX = 8;

/**
 * @param {{
 *   io: () => any,
 *   character: () => (string | null),
 *   territory: () => any,                                   the territory book (systems/companyTerritory.js)
 *   places: () => { mapId: number, px: number, py: number, name: string, region: number }[],   the map's farms
 *   climateAt: (px: number, py: number) => number,
 *   here: () => ({ x: number, y: number } | null),
 *   nowMs?: () => number,
 * }} deps
 */
export function createFarmBook({ io, character, territory, places, climateAt, here, nowMs = Date.now }) {
  /** @type {any[]} */
  let all = [];
  /** @type {any} */
  let mine = null;
  let nextAt = 0;
  /** @type {Promise<any>|null} */
  let asking = null;
  let version = 0;
  let whose = '';
  /** @type {Map<number, any>|null} */
  let placeOf = null;
  const place = (mapId) => { if (!placeOf) placeOf = new Map(places().map((p) => [p.mapId >>> 0, p])); return placeOf.get(mapId >>> 0) ?? null; };

  /** The patches a Company's farms may stand in: its own territory and its Charter's. */
  function patches() {
    const T = territory?.();
    return T ? [T.mine(), T.myCharter()].filter(Boolean) : [];
  }
  const inside = (p, ps) => ps.some((t) => inTerritory(p.px + 0.5, p.py + 0.5, t));

  /** Let go of the Company's farms the territory no longer reaches - once the territories are heard. */
  function lapse() {
    const T = territory?.();
    if (!mine?.farms?.length || !T?.loaded?.()) return;
    const ps = patches();
    for (const f of mine.farms) {
      const p = place(f.mapId);
      if (p && !inside(p, ps)) act(farmRelease, { mapId: f.mapId, lapsed: true }).catch(() => {});
    }
  }

  function refresh(force = false) {
    const t = nowMs();
    const ch = character?.() ?? null;
    if (ch !== whose) { whose = ch ?? ''; force = true; }
    if (asking) return asking;
    if (!force && t < nextAt) return Promise.resolve(null);
    const door = io?.();
    if (!door) { nextAt = t + FARM_RETRY_MS; return Promise.resolve(null); }
    asking = farmsRead(door, ch).then((r) => {
      if (r?.ok && Array.isArray(r.data?.all)) { all = r.data.all; mine = r.data.mine ?? null; version++; nextAt = nowMs() + FARM_REFRESH_MS; lapse(); }
      else nextAt = nowMs() + FARM_RETRY_MS;
      return r;
    }, () => { nextAt = nowMs() + FARM_RETRY_MS; return null; }).finally(() => { asking = null; });
    return asking;
  }

  async function act(fn, body) {
    const door = io?.();
    const ch = character?.() ?? null;
    if (!door || !ch) return { ok: false, error: 'offline' };
    const r = await fn(door, { character: ch, ...body });
    if (r?.ok) { asking = null; await refresh(true); }
    return r?.ok ? { ok: true, ...(r.data ?? {}) } : r;
  }

  return {
    refresh,
    /** Every farm, for the map: `{ mapId, x, y, field, border, tag }` placed. */
    marks: () => { refresh(); return all.map((f) => { const p = place(f.mapId); return p ? { ...f, x: p.px + 0.5, y: p.py + 0.5 } : null; }).filter(Boolean); },
    /** `{ command, max, price, farms }` - the Company's own, each with its place's name - or null. */
    mine: () => { refresh(); return mine; },
    /** The farms the Company may buy: free, inside its territory or its Charter's, nearest the player first. */
    offers: () => {
      const ps = patches();
      if (!ps.length) return [];
      const held = new Set(all.map((f) => f.mapId >>> 0));
      const me = here?.();
      return places().filter((p) => !held.has(p.mapId >>> 0) && inside(p, ps))
        .sort((a, b) => (me ? Math.hypot(a.px - me.x, a.py - me.y) - Math.hypot(b.px - me.x, b.py - me.y) : 0))
        .slice(0, FARM_OFFERS_MAX);
    },
    /** Whether the player stands at a farm (its map pixel). */
    atFarm: (mapId) => { const p = place(mapId), me = here?.(); return !!p && !!me && Math.abs(me.x - p.px) <= 0 && Math.abs(me.y - p.py) <= 0; },
    placeOf: place,
    buy: (p, crop) => act(farmBuy, { mapId: p.mapId >>> 0, name: String(p.name).slice(0, 48), climate: climateAt(p.px, p.py), region: p.region, crop }),
    crop: (mapId, crop) => act(farmCrop, { mapId, crop }),
    release: (mapId) => act(farmRelease, { mapId }),
    chore: (mapId) => act(farmChore, { mapId }),
    sig: () => `${version}|${whose}`,
  };
}
