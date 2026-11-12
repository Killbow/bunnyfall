// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, the war against Rodney): THE CLIENT'S BOOK OF GARRISONS - every garrison as the
// streets show it (`all`: a town's routes and its owner's colours - scenes/garrisonPatrols.js walks them) and the
// character's own Company guard and Charter garrison in full (`mine` - the Garrison page of the Company window,
// ui/socialPanel.js). The account service keeps and reckons them (server-account/src/garrisons.js); the law is
// net/garrisonLaw.js. Online only.
import { garrisonsRead, garrisonRecruit, garrisonOrders } from '../net/accountClient.js';

export const GARRISON_REFRESH_MS = 2 * 60_000;
export const GARRISON_RETRY_MS = 30_000;

/**
 * @param {{
 *   io: () => any,
 *   character: () => (string | null),
 *   sectorOf?: (mapId: number) => (number | null),   the blight's slice a town faces (systems/rodneyBlight.js)
 *   nowMs?: () => number,
 * }} deps
 */
export function createGarrisonBook({ io, character, sectorOf = () => null, nowMs = Date.now }) {
  /** @type {any[]} */
  let all = [];
  /** @type {any} */
  let mine = null;
  let nextAt = 0;
  /** @type {Promise<any>|null} */
  let asking = null;
  let version = 0;
  let whose = '';
  /** Whether the service has answered at least once (`mine` null after it: the character keeps no garrison). */
  let loaded = false;

  function refresh(force = false) {
    const t = nowMs();
    const ch = character?.() ?? null;
    if (ch !== whose) { whose = ch ?? ''; force = true; loaded = false; mine = null; }
    if (asking) return asking;
    if (!force && t < nextAt) return Promise.resolve(null);
    const door = io?.();
    if (!door) { nextAt = t + GARRISON_RETRY_MS; return Promise.resolve(null); }
    asking = garrisonsRead(door, ch).then((r) => {
      if (r?.ok && Array.isArray(r.data?.all)) { all = r.data.all; mine = r.data.mine ?? null; loaded = true; version++; nextAt = nowMs() + GARRISON_REFRESH_MS; }
      else nextAt = nowMs() + GARRISON_RETRY_MS;
      return r;
    }, () => { nextAt = nowMs() + GARRISON_RETRY_MS; return null; }).finally(() => { asking = null; });
    return asking;
  }

  async function act(fn, body) {
    const door = io?.();
    const ch = character?.() ?? null;
    if (!door || !ch) return { ok: false, error: 'offline' };
    const r = await fn(door, { character: ch, ...body });
    if (r?.ok) await refresh(true);
    return r?.ok ? { ok: true, ...(r.data ?? {}) } : r;
  }

  return {
    refresh,
    /** Every garrison, as the streets show them. */
    all: () => { refresh(); return all; },
    /** `{ command, company, charter }` - the character's own, or null. */
    mine: () => { refresh(); return mine; },
    recruit: (which, type, n) => act(garrisonRecruit, { which, type, n }),
    /** `orders` `{ routes, march }`; a march takes the blight's slice the garrison's town faces. */
    orders: (which, orders) => {
      const g = mine?.[which];
      const sector = g ? sectorOf(g.mapId) : null;
      return act(garrisonOrders, { which, routes: orders.routes, march: orders.march, ...(Number.isSafeInteger(sector) ? { sector } : {}) });
    },
    sig: () => `${version}|${whose}`,
    loaded: () => loaded,
  };
}
