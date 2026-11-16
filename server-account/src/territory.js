// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, territory): WHAT THE SERVICE KEEPS OF A COMPANY'S TERRITORY - the Renown XP its
// members earn, by region and seat week (migration 0197), and every Company's territory as the maps paint it. The law
// both ends read is src/net/territoryLaw.js.
//
// A friends' server: the XP credited is what the Renown report already credited (index.js, /v1/renown/xp), so it is
// bounded as Renown is and no more.
import { seatWeekOf } from '../../src/net/townSeatLaw.js';
import { TERRITORY_WEEK_WEIGHTS, TERRITORY_XP_REPORT_MAX, territoryStrength, territoryRadius, inTerritory } from '../../src/net/territoryLaw.js';
import { charterRadius } from '../../src/net/charterLaw.js';
import { heraldryOfRow } from './halls.js';
import { chartersRead } from './charters.js';

const regionOk = (r) => Number.isSafeInteger(r) && r >= 0 && r <= 61;

/**
 * Renown XP a character earned in `region`, credited to its Company's week there. Nothing for a character in no
 * Company. Called after the Renown report's own credit, with what it credited.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function creditTerritory({ db, nowS }, player, { character, region, xp } = {}) {
  const n = Math.min(TERRITORY_XP_REPORT_MAX, Math.trunc(Number(xp)));
  if (!player?.id || typeof character !== 'string' || !regionOk(region) || !(n > 0)) return { credited: 0 };
  const week = seatWeekOf(nowS * 1000);
  const r = await db.prepare(`INSERT INTO company_territory (week, guild_id, region, xp)
      SELECT ?1, guild_id, ?2, ?3 FROM guild_members WHERE player = ?4 AND char_id = ?5
      ON CONFLICT (week, guild_id, region) DO UPDATE SET xp = xp + excluded.xp`)
    .bind(week, region, n, player.id, character).run();
  return { credited: r?.meta?.changes ? n : 0 };
}

/**
 * Returns true when a lapsed release must keep the farm. A farm with pixels is kept inside the circle of the recorded
 * hall or Charter. A farm without pixels, or a reported farm outside both, is kept while the Company holds the recorded
 * hall town or Charter. Throws on a failed read.
 */
export async function farmInReach(db, gid, mapId, nowS) {
  const now = seatWeekOf(nowS * 1000);
  const [own, mates, rows, reach] = await db.batch([
    db.prepare('SELECT map_id FROM homes WHERE guild_id = ?1').bind(gid),
    db.prepare(`SELECT me.map_id, h.guild_id FROM city_charter_members me JOIN city_charters c ON c.map_id = me.map_id
      LEFT JOIN city_charter_members m ON m.map_id = c.map_id LEFT JOIN homes h ON h.guild_id = m.guild_id AND h.region = c.region
      WHERE me.guild_id = ?1`).bind(gid),
    db.prepare(`SELECT t.guild_id, t.week, t.xp FROM company_territory t JOIN homes h ON h.guild_id = t.guild_id AND h.region = t.region
      WHERE t.week >= ?1 AND t.week <= ?2 AND (t.guild_id = ?3 OR t.guild_id IN (SELECT m.guild_id FROM city_charter_members m
        JOIN city_charter_members me ON me.map_id = m.map_id WHERE me.guild_id = ?3))`).bind(now - TERRITORY_WEEK_WEIGHTS.length + 1, now, gid),
    db.prepare('SELECT * FROM company_farm_reach WHERE map_id = ?1').bind(mapId),
  ]);
  const xp = rows?.results ?? [];
  const strength = (id) => territoryStrength(TERRITORY_WEEK_WEIGHTS.map((_, ago) => xp
    .reduce((n, r) => n + (r.guild_id === id && Number(r.week) === now - ago ? Number(r.xp) || 0 : 0), 0)));
  const hall = own?.results?.[0], ch = mates?.results ?? [], ids = ch.map((r) => r.guild_id).filter(Boolean);
  const f = reach?.results?.[0] ?? { hall_map: hall?.map_id ?? null, cap_map: ch[0]?.map_id ?? null };
  if (f.px != null && f.py != null) {
    const inside = (x, y, r) => x != null && y != null && inTerritory(f.px + 0.5, f.py + 0.5, { x: x + 0.5, y: y + 0.5, r });
    const exact = (!!hall && hall.map_id === f.hall_map && inside(f.hall_px, f.hall_py, territoryRadius(strength(gid))))
      || (ch.length > 0 && ch[0].map_id === f.cap_map && inside(f.cap_px, f.cap_py, charterRadius(ids.map(strength))));
    if (exact || !f.reported) return exact;
  }
  return (!!hall && hall.map_id === f.hall_map) || (ch.length > 0 && ch[0].map_id === f.cap_map);
}

/**
 * Returns each Company that holds a hall, with its id, tag, name, heraldry, hall town (`mapId`) and region.
 * Each also carries its strength (territoryLaw.js territoryStrength over the region's last weeks) and those weeks' XP.
 * The client places it on the map by the town and sizes it by the strength.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function territoriesRead({ db, nowS }) {
  const week = seatWeekOf(nowS * 1000);
  const oldest = week - (TERRITORY_WEEK_WEIGHTS.length - 1);
  const [halls, rows] = await db.batch([
    db.prepare(`SELECT g.id, g.tag, g.name, g.heraldry, h.map_id, h.region FROM guilds g JOIN homes h ON h.guild_id = g.id`),
    db.prepare(`SELECT t.guild_id, t.week, t.xp FROM company_territory t JOIN homes h ON h.guild_id = t.guild_id AND h.region = t.region
      WHERE t.week >= ?1 AND t.week <= ?2`).bind(oldest, week),
  ]);
  /** @type {Map<string, number[]>} */
  const weeks = new Map();
  for (const r of rows?.results ?? []) {
    const ago = week - Number(r.week);
    if (ago < 0 || ago >= TERRITORY_WEEK_WEIGHTS.length) continue;
    const w = weeks.get(r.guild_id) ?? TERRITORY_WEEK_WEIGHTS.map(() => 0);
    w[ago] += Number(r.xp) || 0;
    weeks.set(r.guild_id, w);
  }
  const territories = (halls?.results ?? []).map((h) => {
    const arms = heraldryOfRow(h.heraldry);
    return {
      id: h.id, tag: h.tag, name: h.name, mapId: Number(h.map_id), region: Number(h.region),
      field: arms?.field ?? null, border: arms?.border ?? null,
      strength: territoryStrength(weeks.get(h.id) ?? []),
      weeks: weeks.get(h.id) ?? TERRITORY_WEEK_WEIGHTS.map(() => 0),
    };
  });
  // BUNNYFALL COMPANIES (City Charters): every Charter, which the maps draw around its capital (charters.js).
  // A failed Charter read returns null, and the client keeps the last Charters it received.
  const charters = await chartersRead({ db, nowS }).catch(() => null);
  return { ok: true, week, territories, charters };
}
