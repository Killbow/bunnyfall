// @ts-check
// The Stores' SQL and today's counts: carried, spendable, and workable materials, today's
// harvests and writs, the harvest sweep, and the reads of made work.
import { utcDay } from '../../src/net/marksLaw.js';
import { WORK_RECIPES } from '../../src/net/professionLaw.js';
import { counterMade, RECIPES, workFirstXp, FIRST_MAKE_FLOOR } from '../../src/net/recipeLaw.js';
import { CLAMP_ORDER, CARRIED_ROW_DAYS, STATION_ORIGINS, WRIT_ORIGINS } from '../../src/net/bagLaw.js';
import { unbruisedClamp } from './profSpend.js';

/** BAG1: THE COUNT CUT TO WHAT THE CLIENT SAYS IT HOLDS - bagLaw.js clampCarried in SQL: a statement an origin in
 *  CLAMP_ORDER (gold's first, own last), each cutting what the total still stands over the held count, read afresh so
 *  the cuts before it count; the rows left at 0 deleted. Never raised: a pack holding more than the count adds nothing.
 *  The unbruised count follows the own units it counts (unbruisedClamp).
 *  AUDIT BAG1 B2 (bible/06-Systems/Materials-Bag.md, the audit): ONLY WHERE THE CLIENT'S `held` IS CURRENT. A held count
 *  is read against the count the client last heard (`seen`, the total of every origin); when the service's count has moved
 *  since - a kept harvest or a withdrawal whose answer was lost, an act of a second request in flight - the pack does not
 *  yet hold units the count already has, and cutting to it lost them for good (the auditors' repro: three herbs gathered
 *  offline, pumped, counted 1 of 4). The decision is taken ONCE, before any origin moves, into a gate row of the request's
 *  own id (`prof_carried_gate`, made and cleared in this batch) - each origin's statement moves the total the next reads,
 *  so a per-statement test of the total could never agree with itself. `twin`: the act's own row not yet written (AUDIT
 *  BAG1 B3 - a duplicate of a landed harvest cut the count back under the units the first one counted). `seen` null: an
 *  older client, believed as before. Binds: ?1 the player, ?2 the character, ?3 the material, ?4 held, ?5 the request id,
 *  ?6 seen. */
export function clampStatements(db, { player, character, material, held, rid, seen = null, twin = '1' }) {
  const total = 'COALESCE((SELECT SUM(t.qty) FROM prof_carried t WHERE t.player = ?1 AND t.char_id = ?2 AND t.material = ?3), 0)';
  const open = 'EXISTS (SELECT 1 FROM prof_carried_gate g WHERE g.player = ?1 AND g.rid = ?5)';
  return [
    db.prepare(`INSERT OR IGNORE INTO prof_carried_gate (player, rid) SELECT ?1, ?5
      WHERE ${twin} AND ?4 >= 0 AND (?6 IS NULL OR ${total} = ?6)`).bind(player, character, material, held, rid, seen),
    ...CLAMP_ORDER.map((o) => db.prepare(`UPDATE prof_carried SET qty = qty - MIN(qty, MAX(0, ${total} - ?4))
      WHERE player = ?1 AND char_id = ?2 AND material = ?3 AND origin = '${o}' AND ${open}`).bind(player, character, material, held, rid)),
    db.prepare('DELETE FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND qty = 0').bind(player, character),
    // the held count at ?4 is named, so the statement's parameters reach every bind (SQLite refuses a bind past the last)
    unbruisedClamp(db, { player, character, materialSql: '?3', guard: `${open} AND ?4 >= 0`, binds: [material, held, rid] }),
    db.prepare('DELETE FROM prof_carried_gate WHERE player = ?1 AND rid = ?2').bind(player, rid),
  ];
}
/** BAG1: a count's total in SQL, every origin - `m` the material's SQL, `p` and `c` the player's and the character's. */
export const carriedSql = (p, c, m) => `COALESCE((SELECT SUM(qty) FROM prof_carried WHERE player = ${p} AND char_id = ${c} AND material = ${m}), 0)`;
/** GOLD-MARKET: THE UNITS A WRIT, THE GUILD STORES OR A DRAKES ACT MAY SPEND of a material in SQL - own and bought,
 *  never bought with gold (the wall: gold's goods go to the pack or back on the market for gold, nowhere else); AUDIT
 *  BAG-CRAFT A1: never loose (bagLaw.js WRIT_ORIGINS - the stations' wall: a unit the service never handed out reaches
 *  no writ, no guild and no sale). `m` the material's SQL, `p` and `c` the player's and the character's. */
export const originsSql = (list) => list.map((o) => `'${o}'`).join(', ');
export const spendableSql = (p, c, m) => `COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ${p} AND char_id = ${c} AND material = ${m} AND origin IN (${originsSql(WRIT_ORIGINS)})), 0)`;
/** AUDIT BAG-CRAFT A1: THE UNITS A STATION MAY SPEND - a craft, a smelt, a brew, a temper: own, bought and loose, never
 *  gold's (bagLaw.js STATION_ORIGINS); spent by `workStatements`, loose first. */
export const workableSql = (p, c, m) => `COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ${p} AND char_id = ${c} AND material = ${m} AND origin IN (${originsSql(STATION_ORIGINS)})), 0)`;
/** A character's harvests today, by profession. */
export async function todayOf(db, player, character, day) {
  return todayFrom((await todayStatement(db, player, character, day).all()).results ?? []);
}
export const todayStatement = (db, player, character, day) =>
  db.prepare('SELECT profession, COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND char_id = ?2 AND day = ?3 GROUP BY profession').bind(player, character, day);
export const todayFrom = (/** @type {any[]} */ results) => Object.fromEntries(results.map((r) => [r.profession, Number(r.n)]));
export const writsStatement = (db, player, day) => db.prepare('SELECT COUNT(*) AS n FROM writs WHERE filled_by = ?1 AND day = ?2').bind(player, day);
export const writsToday = async (db, player, day) => Number((await writsStatement(db, player, day).first())?.n ?? 0);

/**
 * PROF0 20: a day's harvests are kept two days. AUDIT2 BAG1 S1: a CARRIED one CARRIED_ROW_DAYS: its row is the answer a
 * kept harvest asked again is given, and only that answer mints its items - swept at two days, a harvest whose answer was
 * lost (or heard under another character) was refused `prof-day` and its counted units never came. `limit` of each kind
 * at once, answering how many went.
 * SCALE4b (2026-10-08): THE SERVICE'S CLOCK'S (server-account/src/cron.js, each hour), never the state's read - which swept
 * first on every ask: two writes on the professions' busiest read, and every reader racing every other to run them. The bounds are the read's own, so a row lives no shorter; the state reads today alone.
 */
export async function sweepHarvests(db, nowS, limit = 500) {
  const day = utcDay(nowS);
  const [a, b] = await db.batch([
    db.prepare('DELETE FROM node_harvests WHERE rowid IN (SELECT rowid FROM node_harvests WHERE carry = 0 AND day < ? LIMIT ?)').bind(day - 1, limit),
    db.prepare('DELETE FROM node_harvests WHERE rowid IN (SELECT rowid FROM node_harvests WHERE carry = 1 AND day < ? LIMIT ?)').bind(day - CARRIED_ROW_DAYS, limit),
  ]);
  return Number(a?.meta?.changes ?? 0) + Number(b?.meta?.changes ?? 0);
}

/**
 * CRAFT-HALL: what the character has made, read the way the first-make decisions read it - crafted recipes, works that
 * pay a first (the mason's cut and mix) and brewed potions. One statement on the tables' existing indexes, in the
 * state's batch, so the client can show which first-time bonuses are spent.
 */
export const FIRST_WORKS_SQL = WORK_RECIPES.filter((w) => workFirstXp(w) > 0).map((w) => `'${w.id}'`).join(', ') || "''";
// WOVEN-PAYS: a judged pattern (counterMade) is made only by the craft that laid its first on - a row from before
// `first_paid` where it was the first and its XP holds the share. craftAtAnvil's `patternMade` and the state's `made` read it
export const PAID_FIRST_SQL = `(first_paid = 1 OR (first_paid IS NULL AND first = 1 AND xp >= ${FIRST_MAKE_FLOOR}))`;
export const JUDGED_SQL = RECIPES.filter(counterMade).map((r) => `'${r.id}'`).join(', ') || "''";
export const madeStatement = (db, player, character) => db.prepare(`SELECT 'craft' AS kind, recipe AS key FROM prof_crafts WHERE player = ?1 AND char_id = ?2
    AND (recipe NOT IN (${JUDGED_SQL}) OR ${PAID_FIRST_SQL}) GROUP BY recipe
  UNION ALL SELECT 'work', recipe FROM prof_smelts WHERE player = ?1 AND char_id = ?2 AND recipe IN (${FIRST_WORKS_SQL}) GROUP BY recipe
  UNION ALL SELECT 'brew', potion FROM prof_brews WHERE player = ?1 AND char_id = ?2 GROUP BY potion`).bind(player, character);
/** CRAFT-HALL: madeStatement's rows as `{ crafts, works, brews }`. */
export const madeFrom = (/** @type {any[]} */ results) => {
  const out = { crafts: /** @type {string[]} */ ([]), works: /** @type {string[]} */ ([]), brews: /** @type {string[]} */ ([]) };
  for (const r of results) (r.kind === 'craft' ? out.crafts : r.kind === 'work' ? out.works : out.brews).push(String(r.key));
  return out;
};
