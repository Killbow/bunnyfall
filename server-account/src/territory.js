// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, territory): WHAT THE SERVICE KEEPS OF A COMPANY'S TERRITORY - the Renown XP its
// members earn, by region and seat week (migration 0197), and every Company's territory as the maps paint it. The law
// both ends read is src/net/territoryLaw.js.
//
// A friends' server: the XP credited is what the Renown report already credited (index.js, /v1/renown/xp), so it is
// bounded as Renown is and no more.
import { seatWeekOf } from '../../src/net/townSeatLaw.js';
import { TERRITORY_WEEK_WEIGHTS, TERRITORY_XP_REPORT_MAX, territoryStrength } from '../../src/net/territoryLaw.js';
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
 * EVERY COMPANY'S TERRITORY: each Company that holds a hall - its id, tag, name, heraldry, the hall's town (`mapId`)
 * and region, and its strength (territoryLaw.js territoryStrength over its hall region's last weeks). The client
 * places it on the map by the town and sizes it by the strength.
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
    };
  });
  // BUNNYFALL COMPANIES (City Charters): and every Charter, which the maps draw round its capital (charters.js)
  const charters = await chartersRead({ db, nowS }).catch(() => []);   // none before migration 0198
  return { ok: true, week, territories, charters };
}
