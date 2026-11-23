// @ts-check
// BUNNYFALL (2026-11-18, daily elite dungeons - net/eliteDungeonLaw.js): THE CLIENT'S BOOK - the elite dungeons standing
// as the account service keeps them (server-account/src/eliteDungeons.js), each with its spread today. The world's crystal
// (scenes/eliteDungeonHost.js), the held map's marks (ui/eliteDungeonMapInk.js), the dungeon's build and its fight
// (systems/eliteDungeons/edFoes.js, edFight.js) and the spread's foes (systems/wild/cromwark.js corruptHere) read it.
// A cleansing heard since the last read is said once (`onCleansed`).
//
// Online only: offline `io` answers nothing and the book stays empty (no crystal, no spread, no elite dungeon).
import { eliteDungeonsRead } from '../../net/accountClient.js';
import { edEntryOf, edPlaceKey } from '../../net/eliteDungeonLaw.js';
import { contentOn } from '../../mods/contentOff.js';

export const ED_REFRESH_MS = 5 * 60_000;
export const ED_RETRY_MS = 60_000;

/**
 * @param {{ io: () => any, nowMs?: () => number, onCleansed?: (c: { key: string, name: string, by: string }) => void }} deps
 */
export function createEliteDungeonBook({ io, nowMs = Date.now, onCleansed }) {
  /** @type {ReturnType<typeof edEntryOf>[]} */
  let list = [];
  /** @type {Map<string, any>} place key -> entry */
  let byPlace = new Map();
  let nextAt = 0, version = 0;
  /** @type {Promise<any>|null} */
  let asking = null;
  /** cleansings already said (or standing at the first read) */
  const said = new Set();
  let first = true;

  function take(data) {
    const today = Number.isSafeInteger(data?.day) ? data.day : 0;
    const next = (Array.isArray(data?.list) ? data.list : []).map((r) => edEntryOf(r, today)).filter(Boolean).slice(0, 64);
    list = next;
    byPlace = new Map(next.map((e) => [edPlaceKey(/** @type {any} */ (e).region, /** @type {any} */ (e).location), e]));
    for (const c of Array.isArray(data?.cleansed) ? data.cleansed : []) {
      if (typeof c?.key !== 'string' || said.has(c.key)) continue;
      said.add(c.key);
      if (!first) { try { onCleansed?.({ key: c.key, name: String(c.name ?? '').slice(0, 48), by: String(c.by ?? '').slice(0, 32) }); } catch { /* a word, never the book */ } }
    }
    first = false;
    version++;
  }

  function refresh(force = false) {
    const t = nowMs();
    if (asking) return asking;
    if (!contentOn('eliteDungeons')) return Promise.resolve(null);
    if (!force && t < nextAt) return Promise.resolve(null);
    const door = io?.();
    if (!door) { nextAt = t + ED_RETRY_MS; return Promise.resolve(null); }
    asking = eliteDungeonsRead(door).then((r) => {
      if (r?.ok && r.data?.ok) { take(r.data); nextAt = nowMs() + ED_REFRESH_MS; } else nextAt = nowMs() + ED_RETRY_MS;
      return r;
    }, () => { nextAt = nowMs() + ED_RETRY_MS; return null; }).finally(() => { asking = null; });
    return asking;
  }

  const live = () => { refresh(); return list; };

  return {
    refresh,
    /** Every elite dungeon standing: `{ key, day, slot, region, location, px, py, name, spread }`. */
    list: live,
    /** The one at a dungeon (its region and location index), or null. */
    at: (/** @type {number} */ region, /** @type {number} */ location) => { refresh(); return byPlace.get(edPlaceKey(region, location)) ?? null; },
    /** The one cleansed: gone from the book at once (the service's word came with the claim). */
    drop(/** @type {string} */ key) {
      const n = list.filter((e) => e?.key !== key);
      if (n.length === list.length) return;
      list = n;
      byPlace = new Map(n.map((e) => [edPlaceKey(/** @type {any} */ (e).region, /** @type {any} */ (e).location), e]));
      said.add(key);
      version++;
    },
    /** How deep a map point stands in the nearest spread (pixels inside its edge; negative outside, -Infinity none). */
    spreadDepth(/** @type {number} */ x, /** @type {number} */ y) {
      let best = -Infinity;
      for (const e of live()) {
        if (!e || !(e.spread > 0)) continue;
        best = Math.max(best, e.spread - Math.hypot(x - (e.px + 0.5), y - (e.py + 0.5)));
      }
      return best;
    },
    sig: () => String(version),
  };
}
