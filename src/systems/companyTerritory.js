// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, territory): THE CLIENT'S BOOK OF TERRITORIES - every Company's patch as the account
// service reports it (server-account/src/territory.js), placed on the map at its hall's town and sized and coloured by
// the law (net/territoryLaw.js). The held map paints it (ui/territoryMapInk.js); a member standing inside their own
// Company's patch gathers and loots TERRITORY_YIELD_PCT more (scenes/gatherHost.js, systems/loot/loot.js).
//
// Online only: offline `io` answers nothing and the book stays empty.
import { territoriesRead } from '../net/accountClient.js';
import { territoryRadius, inTerritory, TERRITORY_YIELD_PCT } from '../net/territoryLaw.js';
import { HERALDRY_COLOURS } from '../net/heraldryLaw.js';

/** How often the book asks the service again, and how soon after a failure. */
export const TERRITORY_REFRESH_MS = 5 * 60_000;
export const TERRITORY_RETRY_MS = 60_000;
/** A Company with no arms yet is painted in Ash. */
const DEFAULT_COLOUR = '#8a8a8a';
const hexOf = (key) => HERALDRY_COLOURS.find((c) => c.key === key)?.hex ?? null;

/**
 * @param {{
 *   io: () => any,                                   the account service's door, or null offline
 *   townOf: (mapId: number) => ({ px: number, py: number } | null | undefined),   a town's map pixel by its map id
 *   myGuildId: () => (string | null),                the character's Company
 *   here: () => ({ x: number, y: number } | null),   the player's map pixel
 *   nowMs?: () => number,
 * }} deps
 */
export function createCompanyTerritory({ io, townOf, myGuildId, here, nowMs = Date.now }) {
  /** @type {any[]} */
  let rows = [];
  let nextAt = 0;
  let asking = false;
  let version = 0;
  /** @type {any[]|null} */
  let placed = null;

  function refresh() {
    const t = nowMs();
    if (asking || t < nextAt) return;
    const door = io?.();
    if (!door) { nextAt = t + TERRITORY_RETRY_MS; return; }
    asking = true;
    territoriesRead(door).then((r) => {
      if (r?.ok && Array.isArray(r.data?.territories)) {
        rows = r.data.territories;
        placed = null;
        version++;
        nextAt = nowMs() + TERRITORY_REFRESH_MS;
      } else nextAt = nowMs() + TERRITORY_RETRY_MS;
    }, () => { nextAt = nowMs() + TERRITORY_RETRY_MS; }).finally(() => { asking = false; });
  }

  /** Every territory placed on the map: `{ id, tag, name, x, y, r, fill, ring, strength, mine }`, biggest first so the
   *  small ones paint over them. A hall whose town this client cannot find is left out. */
  function marks() {
    refresh();
    if (!placed) {
      placed = [];
      for (const t of rows) {
        const town = townOf(Number(t.mapId) >>> 0);
        if (!town || !Number.isFinite(town.px) || !Number.isFinite(town.py)) continue;
        placed.push({
          id: t.id, tag: t.tag, name: t.name, x: town.px + 0.5, y: town.py + 0.5, r: territoryRadius(t.strength), strength: t.strength,
          fill: hexOf(t.field) ?? DEFAULT_COLOUR, ring: hexOf(t.border) ?? hexOf(t.field) ?? DEFAULT_COLOUR,
        });
      }
      placed.sort((a, b) => b.r - a.r);
    }
    const mineId = myGuildId?.() ?? null;
    return placed.map((m) => ({ ...m, mine: !!mineId && m.id === mineId }));
  }

  /** The character's own Company's territory, or null. */
  function mine() {
    const id = myGuildId?.() ?? null;
    return id ? marks().find((m) => m.id === id) ?? null : null;
  }

  /** Whether the player stands inside their own Company's territory. */
  function inMine() {
    const t = mine();
    const p = t ? here?.() : null;
    return !!p && inTerritory(p.x, p.y, t);
  }

  return {
    refresh,
    marks,
    mine,
    inMine,
    /** The yield multiplier here: 1 + TERRITORY_YIELD_PCT inside one's own territory, else 1. */
    yieldMult: () => (inMine() ? 1 + TERRITORY_YIELD_PCT / 100 : 1),
    /** Changes whenever the territories (or whose they are) change - the held map repaints on it. */
    sig: () => `${version}|${myGuildId?.() ?? ''}`,
  };
}
