// @ts-check
// BUNNYFALL COMPANIES (2026-11-12): THE CLIENT'S BOOK OF COMPANY FARMS - every farm as the maps show it (`all`) and the
// character's Company's farms in full (`mine` - the Farms page of the Company window, ui/socialPanel.js). The account
// service keeps them and reaps each day into the Company Stores (server-account/src/farms.js); the law is
// net/farmLaw.js. This side knows the map: which farms stand inside the Company's (or its Charter's) territory - the ones
// it may buy - and whether the player stands at one (a chore). A farm the territory no longer reaches is let go here, as
// soon as the territories are heard. Online only.
import { farmsRead, farmBuy, farmCrop, farmRelease, farmChore, farmGardenAct } from '../net/accountClient.js';
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
  const patchesOf = (T, gid) => [T.marks().find((m) => m.id === gid), T.charterMarks().find((c) => c.members.some((m) => m.id === gid))];
  const pixelOf = (m) => (m ? [Math.floor(m.x), Math.floor(m.y)] : null);
  const placesOf = (p, t, c) => ({ at: [p.px, p.py], hall: pixelOf(t), hallMap: t ? Number(t.mapId) : null, capital: pixelOf(c), capMap: c ? Number(c.mapId) : null });
  /** Farms saved without pixels, reported once per session on the next read while this client sees them in reach. */
  const reported = new Set();
  let reports = [];
  /** Lapsed releases the service refused, by map id, with the territory read they were judged against. */
  const refused = new Map();

  /** Let go of the Company's farms the territory no longer reaches - once the territories are heard. */
  function lapse() {
    const T = territory?.();
    if (!mine?.farms?.length || !T?.loaded?.()) return;
    // The owner comes from the farms read: the guild book may be unread or another character's.
    const owner = new Map(all.map((f) => [f.mapId >>> 0, f.guildId]));
    for (const f of mine.farms) {
      const p = place(f.mapId), gid = owner.get(f.mapId >>> 0), ps = p && gid ? patchesOf(T, gid) : null;
      if (!ps) continue;
      const id = f.mapId >>> 0, sig = T.sig?.();
      if (!inside(p, ps)) {
        if (refused.get(id) !== sig) act(farmRelease, { mapId: f.mapId, lapsed: true }).then((r) => { if (r?.error === 'farm-in-reach') refused.set(id, sig); }).catch(() => {});
      } else if (f.placed === false && !reported.has(id)) {
        reported.add(id);
        reports.push({ mapId: id, ...placesOf(p, ps[0], ps[1]) });
      }
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
    const sent = reports;
    reports = [];
    asking = farmsRead(door, ch, sent).then((r) => {
      if (r?.ok && Array.isArray(r.data?.all)) { all = r.data.all; mine = r.data.mine ?? null; version++; nextAt = nowMs() + FARM_REFRESH_MS; lapse(); }
      else { nextAt = nowMs() + FARM_RETRY_MS; reports.push(...sent); }
      return r;
    }, () => { nextAt = nowMs() + FARM_RETRY_MS; reports.push(...sent); return null; }).finally(() => { asking = null; });
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
  const atFarm = (mapId) => { const p = place(mapId), me = here?.(); return !!p && !!me && Math.abs(me.x - p.px) <= 0 && Math.abs(me.y - p.py) <= 0; };

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
    atFarm,
    mineHere: (mapId) => {
      // Every building door calls this, so check for a farm before refresh() can read from the account service.
      if (!place(mapId)) return null;
      refresh();
      const f = mine?.farms?.find((x) => (x.mapId >>> 0) === (mapId >>> 0));
      return f && atFarm(mapId) ? f : null;
    },
    hereKey: () => { const me = here?.(); return me ? `${me.x},${me.y}` : ''; },
    placeOf: place,
    buy: (p, crop) => {
      const T = territory?.();
      return act(farmBuy, { mapId: p.mapId >>> 0, name: String(p.name).slice(0, 48), climate: climateAt(p.px, p.py), region: p.region, crop, ...placesOf(p, T?.mine(), T?.myCharter()) });
    },
    crop: (mapId, crop) => act(farmCrop, { mapId, crop }),
    release: (mapId) => act(farmRelease, { mapId }),
    chore: (mapId) => act(farmChore, { mapId }),
    garden: (mapId, action = {}) => {
      const door = io?.(), ch = character?.();
      return door && ch ? farmGardenAct(door, { ...action, mapId, character: ch }) : Promise.resolve({ ok: false, error: 'offline' });
    },
    sig: () => `${version}|${whose}`,
  };
}
