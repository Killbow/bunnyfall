// @ts-check
// Every bound is checked inside this INSERT in the act's own batch, so racing acts never write past a bound.
// A bound number may read back as REAL, so the amount is CAST to an integer in SQL.

import { MERIT_CAP_WEEK, MERIT_TENURE_S, meritWeekOf } from '../../src/net/npcChapterLaw.js';
import { regionChapters } from './npcHalls.js';

// `amountSql` and `guard` read binds from ?11 on. The first ten are player, character, faction, region,
// week, source, ref, now, the cap, and the tenure.
/** @param {any} db
 *  @param {{ player: string, character: string, faction: number, region: number, source: string, ref: string, nowS: number, amountSql: string, guard: string, binds?: unknown[] }} o */
export function meritStatement(db, { player, character, faction, region, source, ref, nowS, amountSql, guard, binds = [] }) {
  return db.prepare(`INSERT OR IGNORE INTO npc_chapter_merit (week, faction, region, account, char_id, source, amount, ref, at)
    SELECT ?5, ?3, ?4, ?1, ?2, ?6, got, ?7, ?8 FROM (SELECT CAST(MIN(${amountSql}, ?9 - COALESCE((SELECT SUM(amount) FROM npc_chapter_merit
        WHERE week = ?5 AND account = ?1 AND faction = ?3 AND region = ?4), 0)) AS INTEGER) AS got)
    WHERE got >= 1 AND ${guard}
      AND EXISTS (SELECT 1 FROM npc_roll WHERE char_id = ?2 AND player = ?1 AND faction_id = ?3 AND member = 1 AND dormant = 0 AND joined_at <= ?8 - ?10)
      AND EXISTS (SELECT 1 FROM realm_characters WHERE id = ?2 AND player = ?1 AND dead_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM npc_chapter_merit WHERE week = ?5 AND account = ?1 AND faction = ?3 AND region <> ?4)`)
    .bind(player, character, faction, region, meritWeekOf(nowS), source, ref, nowS, MERIT_CAP_WEEK, MERIT_TENURE_S, ...binds);
}

export async function meritOfAct(/** @type {any} */ db, /** @type {string} */ character, /** @type {string} */ source, /** @type {string} */ ref) {
  const { results = [] } = await db.prepare('SELECT faction AS f, amount FROM npc_chapter_merit WHERE char_id = ?1 AND source = ?2 AND ref = ?3 ORDER BY faction')
    .bind(character, source, ref).all();
  return results.map((/** @type {any} */ r) => ({ f: Number(r.f), amount: Number(r.amount) }));
}

/** @param {any} db @param {string} player @param {string} character @param {number} region @param {number} nowS
 *  @param {number[]} members */
export async function meritAsks(db, player, character, region, nowS, members) {
  if (!members.length) return [];
  const chapters = new Set(await regionChapters(db, region, nowS * 1000));
  const here = members.filter((f) => chapters.has(f));
  if (!here.length) return [];
  const { results: rows = [] } = await db.prepare('SELECT faction, region, SUM(amount) AS n FROM npc_chapter_merit WHERE week = ?1 AND account = ?2 GROUP BY faction, region')
    .bind(meritWeekOf(nowS), player).all();
  const { results: since = [] } = await db.prepare('SELECT faction_id, joined_at FROM npc_roll WHERE char_id = ?1 AND player = ?2 AND member = 1')
    .bind(character, player).all();
  return here.map((f) => {
    const mine = rows.filter((/** @type {any} */ r) => Number(r.faction) === f);
    const joined = since.find((/** @type {any} */ r) => Number(r.faction_id) === f)?.joined_at;
    const from = joined == null ? null : Number(joined) + MERIT_TENURE_S;
    return {
      faction: f, merit: Number(mine.find((/** @type {any} */ r) => Number(r.region) === region)?.n ?? 0), max: MERIT_CAP_WEEK,
      elsewhere: mine.some((/** @type {any} */ r) => Number(r.region) !== region), from: from !== null && from > nowS ? from : null,
    };
  });
}
