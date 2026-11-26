// @ts-check
import { utcDay } from '../../src/net/marksLaw.js';
import { WORK_RECIPES } from '../../src/net/professionLaw.js';
import { counterMade, RECIPES, workFirstXp, FIRST_MAKE_FLOOR } from '../../src/net/recipeLaw.js';
import { CLAMP_ORDER, CARRIED_ROW_DAYS, STATION_ORIGINS, WRIT_ORIGINS } from '../../src/net/bagLaw.js';
import { unbruisedClamp } from './profSpend.js';

export function clampStatements(db, { player, character, material, held, rid, seen = null, twin = '1' }) {
  const total = 'COALESCE((SELECT SUM(t.qty) FROM prof_carried t WHERE t.player = ?1 AND t.char_id = ?2 AND t.material = ?3), 0)';
  const open = 'EXISTS (SELECT 1 FROM prof_carried_gate g WHERE g.player = ?1 AND g.rid = ?5)';
  return [
    // The cut is decided once, into a gate row, before any origin moves. Each origin's statement changes the total
    // that the next one reads, so a per-statement test of the total could never agree with itself.
    db.prepare(`INSERT OR IGNORE INTO prof_carried_gate (player, rid) SELECT ?1, ?5
      WHERE ${twin} AND ?4 >= 0 AND (?6 IS NULL OR ${total} = ?6)`).bind(player, character, material, held, rid, seen),
    ...CLAMP_ORDER.map((o) => db.prepare(`UPDATE prof_carried SET qty = qty - MIN(qty, MAX(0, ${total} - ?4))
      WHERE player = ?1 AND char_id = ?2 AND material = ?3 AND origin = '${o}' AND ${open}`).bind(player, character, material, held, rid)),
    db.prepare('DELETE FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND qty = 0').bind(player, character),
    // The statement names ?4 so its parameters reach every bind, because SQLite refuses a bind past the last one.
    unbruisedClamp(db, { player, character, materialSql: '?3', guard: `${open} AND ?4 >= 0`, binds: [material, held, rid] }),
    db.prepare('DELETE FROM prof_carried_gate WHERE player = ?1 AND rid = ?2').bind(player, rid),
  ];
}
export const carriedSql = (p, c, m) => `COALESCE((SELECT SUM(qty) FROM prof_carried WHERE player = ${p} AND char_id = ${c} AND material = ${m}), 0)`;
export const originsSql = (list) => list.map((o) => `'${o}'`).join(', ');
export const spendableSql = (p, c, m) => `COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ${p} AND char_id = ${c} AND material = ${m} AND origin IN (${originsSql(WRIT_ORIGINS)})), 0)`;
export const workableSql = (p, c, m) => `COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ${p} AND char_id = ${c} AND material = ${m} AND origin IN (${originsSql(STATION_ORIGINS)})), 0)`;
export async function todayOf(db, player, character, day) {
  return todayFrom((await todayStatement(db, player, character, day).all()).results ?? []);
}
export const todayStatement = (db, player, character, day) =>
  db.prepare('SELECT profession, COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND char_id = ?2 AND day = ?3 GROUP BY profession').bind(player, character, day);
export const todayFrom = (/** @type {any[]} */ results) => Object.fromEntries(results.map((r) => [r.profession, Number(r.n)]));
export const writsStatement = (db, player, day) => db.prepare('SELECT COUNT(*) AS n FROM writs WHERE filled_by = ?1 AND day = ?2').bind(player, day);
export const writsToday = async (db, player, day) => Number((await writsStatement(db, player, day).first())?.n ?? 0);

export async function sweepHarvests(db, nowS, limit = 500) {
  const day = utcDay(nowS);
  const [a, b] = await db.batch([
    db.prepare('DELETE FROM node_harvests WHERE rowid IN (SELECT rowid FROM node_harvests WHERE carry = 0 AND day < ? LIMIT ?)').bind(day - 1, limit),
    db.prepare('DELETE FROM node_harvests WHERE rowid IN (SELECT rowid FROM node_harvests WHERE carry = 1 AND day < ? LIMIT ?)').bind(day - CARRIED_ROW_DAYS, limit),
  ]);
  return Number(a?.meta?.changes ?? 0) + Number(b?.meta?.changes ?? 0);
}

export const FIRST_WORKS_SQL = WORK_RECIPES.filter((w) => workFirstXp(w) > 0).map((w) => `'${w.id}'`).join(', ') || "''";
export const PAID_FIRST_SQL = `(first_paid = 1 OR (first_paid IS NULL AND first = 1 AND xp >= ${FIRST_MAKE_FLOOR}))`;
export const JUDGED_SQL = RECIPES.filter(counterMade).map((r) => `'${r.id}'`).join(', ') || "''";
export const madeStatement = (db, player, character) => db.prepare(`SELECT 'craft' AS kind, recipe AS key FROM prof_crafts WHERE player = ?1 AND char_id = ?2
    AND (recipe NOT IN (${JUDGED_SQL}) OR ${PAID_FIRST_SQL}) GROUP BY recipe
  UNION ALL SELECT 'work', recipe FROM prof_smelts WHERE player = ?1 AND char_id = ?2 AND recipe IN (${FIRST_WORKS_SQL}) GROUP BY recipe
  UNION ALL SELECT 'brew', potion FROM prof_brews WHERE player = ?1 AND char_id = ?2 GROUP BY potion`).bind(player, character);
export const madeFrom = (/** @type {any[]} */ results) => {
  const out = { crafts: /** @type {string[]} */ ([]), works: /** @type {string[]} */ ([]), brews: /** @type {string[]} */ ([]) };
  for (const r of results) (r.kind === 'craft' ? out.crafts : r.kind === 'work' ? out.works : out.brews).push(String(r.key));
  return out;
};
