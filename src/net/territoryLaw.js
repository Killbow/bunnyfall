// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, territory): A COMPANY'S TERRITORY - the patch of the Iliac Bay its hall anchors, painted
// on the maps in its heraldry and grown by what its members do in the hall's region.
//
// Asked: "i like the idea of visible areas of influence"; "territory should be painted only in the maps and be able to
// overlap, the territory bonus is fine 10% yield".
//
//   - A Company with a hall has a territory: a circle on the map, centred on the hall's town.
//   - It GROWS from the Renown XP its members earn in the hall's region (the Renown report already names the region),
//     counted per seat week (townSeatLaw.js seatWeekOf) and read over the last four weeks at a falling weight, so an idle
//     Company's patch shrinks back towards its hall.
//   - Territories overlap freely: nobody pushes anybody out.
//   - A member standing inside their own Company's territory gathers and loots TERRITORY_YIELD_PCT more.
//
// Pure: no clock, no DOM, no network. The account service (server-account/src/territory.js) and the client
// (systems/companyTerritory.js) both read it. Every number here is balance: change it here.

/** The weights of this week's XP and the three before it. */
export const TERRITORY_WEEK_WEIGHTS = Object.freeze([1, 0.5, 0.25, 0.125]);
/** The weighted XP at which a territory reaches its full size. */
export const TERRITORY_FULL_XP = 200_000;
/** A territory's radius in map pixels (MAPS.BSA's 1000 x 500): a hall alone, and the most it grows to. */
export const TERRITORY_R_MIN = 6;
export const TERRITORY_R_MAX = 34;
/** The yield a member gets inside their own Company's territory, in percent (gathering and loot gold). */
export const TERRITORY_YIELD_PCT = 10;
/** The most XP one Renown report may add to a territory (renown.js RENOWN_XP_REPORT_MAX's bound). */
export const TERRITORY_XP_REPORT_MAX = 5_000;

/** A territory's strength: the weighted sum of its weeks' XP, `xpByAgo[0]` this week, `[1]` last week, and so on. */
export function territoryStrength(xpByAgo) {
  let s = 0;
  TERRITORY_WEEK_WEIGHTS.forEach((w, i) => { const n = Number(xpByAgo?.[i]); if (Number.isFinite(n) && n > 0) s += n * w; });
  return Math.floor(s);
}

/** How full a territory is, 0 to 1 - the square root, so the first weeks of play show. */
export const territoryFill = (strength) => Math.sqrt(Math.max(0, Math.min(1, (Number(strength) || 0) / TERRITORY_FULL_XP)));

/** A territory's radius in map pixels for a strength. */
export const territoryRadius = (strength) => TERRITORY_R_MIN + (TERRITORY_R_MAX - TERRITORY_R_MIN) * territoryFill(strength);

/** Whether map pixel (px, py) lies inside a territory `{ x, y, r }`. */
export const inTerritory = (px, py, t) => !!t && Number.isFinite(px) && Number.isFinite(py) && (px - t.x) ** 2 + (py - t.y) ** 2 <= t.r ** 2;

/** A territory's reach as a player reads it: "Reach 72 of 100". */
export const territoryReachText = (strength) => `Reach ${Math.round(territoryFill(strength) * 100)} of 100`;
