// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, territory): THE CLIENT'S BOOK OF TERRITORIES - every Company's patch as the account
// service reports it (server-account/src/territory.js), placed on the map at its hall's town and sized and coloured by
// the law (net/territoryLaw.js). The held map paints it (ui/territoryMapInk.js); a member standing inside their own
// Company's patch gathers and loots TERRITORY_YIELD_PCT more (scenes/gatherHost.js, systems/loot/loot.js).
//
// City Charters (net/charterLaw.js): the same answer carries every Charter. A Charter is drawn as one outline round its
// capital, sized by its Companies' strengths together, and its members get the territory's yield anywhere inside it.
// The Company page founds, invites, answers and leaves through this book (ui/socialPanel.js).
//
// Online only: offline `io` answers nothing and the book stays empty.
import { territoriesRead, charterFound, charterInvite, charterAnswer, charterLeave } from '../net/accountClient.js';
import { territoryRadius, inTerritory, TERRITORY_YIELD_PCT } from '../net/territoryLaw.js';
import { charterRadius } from '../net/charterLaw.js';
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
 *   townOf: (mapId: number) => ({ px: number, py: number, name?: string } | null | undefined),   a town by its map id
 *   capitalOf?: (region: number) => ({ mapId: number, name: string } | null),   a region's capital (its hub)
 *   myGuildId: () => (string | null),                the character's Company
 *   character?: () => (string | null),               the character's id, for the Charter's acts
 *   here: () => ({ x: number, y: number } | null),   the player's map pixel
 *   nowMs?: () => number,
 * }} deps
 */
export function createCompanyTerritory({ io, townOf, capitalOf = () => null, myGuildId, character = () => null, here, nowMs = Date.now }) {
  /** @type {any[]} */
  let rows = [];
  /** @type {any[]} */
  let charters = [];
  let nextAt = 0;
  /** @type {Promise<any>|null} */
  let asking = null;
  let version = 0;
  /** @type {any[]|null} */
  let placed = null;
  /** @type {any[]|null} */
  let placedCharters = null;

  /** Ask the service now (`force`) or when due; answers the ask in flight. */
  function refresh(force = false) {
    const t = nowMs();
    if (asking) return asking;
    if (!force && t < nextAt) return Promise.resolve(null);
    const door = io?.();
    if (!door) { nextAt = t + TERRITORY_RETRY_MS; return Promise.resolve(null); }
    asking = territoriesRead(door).then((r) => {
      if (r?.ok && Array.isArray(r.data?.territories)) {
        rows = r.data.territories;
        charters = Array.isArray(r.data.charters) ? r.data.charters : [];
        placed = null;
        placedCharters = null;
        version++;
        nextAt = nowMs() + TERRITORY_REFRESH_MS;
      } else nextAt = nowMs() + TERRITORY_RETRY_MS;
      return r;
    }, () => { nextAt = nowMs() + TERRITORY_RETRY_MS; return null; }).finally(() => { asking = null; });
    return asking;
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

  /** A Company's row as last heard, by its id. */
  const companyOf = (id) => rows.find((t) => t.id === id) ?? null;

  /** Every Charter placed on the map: `{ mapId, region, name, x, y, r, members: [{ id, tag, name, fill }], invites,
   *  mine }`. Its radius counts the members whose hall stands in its region (a hall sold or moved counts nothing). */
  function charterMarks() {
    refresh();
    if (!placedCharters) {
      placedCharters = [];
      for (const c of charters) {
        const town = townOf(Number(c.mapId) >>> 0);
        if (!town || !Number.isFinite(town.px) || !Number.isFinite(town.py)) continue;
        const members = (c.members ?? []).map((id) => companyOf(id) ?? { id, tag: '?', name: 'A Company', region: null, strength: 0 });
        const counted = members.filter((m) => m.region === c.region).map((m) => m.strength);
        placedCharters.push({
          mapId: c.mapId, region: c.region, name: c.name, town: town.name ?? '', x: town.px + 0.5, y: town.py + 0.5, r: charterRadius(counted),
          strength: counted.reduce((a, s) => a + (Number(s) || 0), 0),   // the blight reads how firmly it holds (net/blightLaw.js)
          members: members.map((m) => ({ id: m.id, tag: m.tag, name: m.name, fill: hexOf(m.field) ?? DEFAULT_COLOUR })),
          invites: (c.invites ?? []).map((i) => ({ ...i, tag: companyOf(i.id)?.tag ?? '?', name: companyOf(i.id)?.name ?? 'A Company' })),
        });
      }
    }
    const mineId = myGuildId?.() ?? null;
    return placedCharters.map((c) => ({ ...c, mine: !!mineId && c.members.some((m) => m.id === mineId) }));
  }

  /** The character's own Company's territory, or null. */
  function mine() {
    const id = myGuildId?.() ?? null;
    return id ? marks().find((m) => m.id === id) ?? null : null;
  }
  /** The character's Company's Charter, or null. */
  const myCharter = () => charterMarks().find((c) => c.mine) ?? null;

  /** Whether the player stands inside their own Company's territory or their Charter's. */
  function inMine() {
    const t = mine(), c = myCharter();
    if (!t && !c) return false;
    const p = here?.();
    return !!p && (inTerritory(p.x, p.y, t) || inTerritory(p.x, p.y, c));
  }

  /** A Charter act through the service, then the book read again so the answer shows. */
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
    marks,
    charterMarks,
    mine,
    myCharter,
    inMine,
    /** The Charter my Company is invited to, each: `{ mapId, name, town, by }`. */
    invitesToMe: () => { const id = myGuildId?.() ?? null; return id ? charterMarks().flatMap((c) => c.invites.filter((i) => i.id === id).map((i) => ({ mapId: c.mapId, name: c.name, town: c.town, by: i.by }))) : []; },
    /** The capital a Charter is founded at for my Company: its hall region's hub, with whether it is free - or null. */
    foundingAt: () => {
      const t = rows.find((r) => r.id === (myGuildId?.() ?? null));
      if (!t || !Number.isSafeInteger(t.region)) return null;
      const cap = capitalOf(t.region);
      if (!cap) return null;
      return { mapId: cap.mapId >>> 0, name: cap.name, region: t.region, held: charters.some((c) => c.region === t.region) };
    },
    found: (name, at) => act(charterFound, { name, mapId: at.mapId, region: at.region }),
    invite: (tag) => act(charterInvite, { tag }),
    answer: (mapId, accept) => act(charterAnswer, { mapId, accept: accept === true }),
    leave: () => act(charterLeave, {}),
    /** The yield multiplier here: 1 + TERRITORY_YIELD_PCT inside one's own territory or Charter, else 1. */
    yieldMult: () => (inMine() ? 1 + TERRITORY_YIELD_PCT / 100 : 1),
    /** Changes whenever the territories (or whose they are) change - the held map and the Company page repaint on it. */
    sig: () => `${version}|${myGuildId?.() ?? ''}`,
  };
}
