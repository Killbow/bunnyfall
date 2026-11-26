// @ts-check
// A clear is reported by the client, so it is bounded. The checks cover the bounty shape, the event window,
// the trusted level, one row per character and notice, and a daily account cap.
import { accountKind, overRate } from './accounts.js';
import { renownCharacterOk } from './renownTracks.js';
import { creditHunt } from './seatInfluence.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { seatRegionOk, seatWeekStartMs } from '../../src/net/townSeatLaw.js';
import { PROF_XP_MAX } from '../../src/net/professionLaw.js';
import { huntClearOf, huntTierFits, huntWeekAt, masteryMarksOf, HUNT_CLEARS_DAY_MAX, HUNT_RUNGS, HUNT_MARK_RUNG, HUNT_TITLES } from '../../src/net/huntLaw.js';

export const HUNT_OPS_HOUR = 240;
export const HUNT_STATUS = Object.freeze({ 'hunt-need-account': 403, 'hunt-rate': 429, 'hunt-rung': 409, 'hunt-tier': 409, 'hunt-late': 409, 'hunt-early': 409 });
const MARK_CLEARS = HUNT_RUNGS[HUNT_MARK_RUNG].at;
const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);

async function huntStateOf(db, playerId, character, nowS) {
  const week = `m.${huntWeekAt(nowS * 1000)}`;
  const [mine, regions, acct] = await db.batch([
    db.prepare(`SELECT COALESCE(SUM(kind = 'board'), 0) AS clears, COALESCE(SUM(kind = 'mark'), 0) AS marks,
      COALESCE(MAX(kind = 'mark' AND key = ?3), 0) AS done FROM hunt_clears WHERE player = ?1 AND char_id = ?2`).bind(playerId, character, week),
    db.prepare(`SELECT region, COUNT(*) AS n FROM hunt_clears WHERE player = ?1 AND char_id = ?2 AND kind = 'board' AND region IS NOT NULL
      GROUP BY region`).bind(playerId, character),
    db.prepare(`SELECT COALESCE(SUM(kind = 'board'), 0) AS clears, COALESCE(SUM(kind = 'mark'), 0) AS marks, COALESCE(SUM(day = ?2), 0) AS today
      FROM hunt_clears WHERE player = ?1`).bind(playerId, utcDay(nowS)),
  ]);
  const m = mine?.results?.[0] ?? {};
  const a = acct?.results?.[0] ?? {};
  return {
    clears: int(m.clears), marks: int(m.marks), markDone: int(m.done) === 1,
    regions: Object.fromEntries((regions?.results ?? []).map((r) => [int(r.region), int(r.n)])),
    account: { clears: int(a.clears), marks: int(a.marks), today: int(a.today), max: HUNT_CLEARS_DAY_MAX, day: utcDay(nowS) },
  };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} player @param {any} _env @param {any} body */
export async function huntState(ctx, player, _env, body) {
  if (accountKind(player) !== 'linked') return { error: 'hunt-need-account' };
  if (!renownCharacterOk(body?.character)) return { error: 'hunt-character' };
  if (await overRate(ctx, `hunt:${player.id}`, HUNT_OPS_HOUR, 3600)) return { error: 'hunt-rate' };
  return { ok: true, ...(await huntStateOf(ctx.db, player.id, body.character, ctx.nowS)) };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} player @param {any} env @param {any} body */
export async function huntClear(ctx, player, env, body) {
  if (accountKind(player) !== 'linked') return { error: 'hunt-need-account' };
  const { db, nowS } = ctx;
  const character = body?.character;
  if (!renownCharacterOk(character)) return { error: 'hunt-character' };
  const c = huntClearOf(body?.id, nowS * 1000);
  if ('why' in c) return { error: `hunt-${c.why}` };
  const region = body?.region ?? null;
  if (region !== null && !seatRegionOk(region)) return { error: 'hunt-id' };
  if (await overRate(ctx, `hunt:${player.id}`, HUNT_OPS_HOUR, 3600)) return { error: 'hunt-rate' };
  const seen = await db.prepare('SELECT level_seen AS lv FROM realm_characters WHERE id = ?1 AND player = ?2').bind(character, player.id).first();
  if (!huntTierFits(c.level, seen?.lv == null ? null : int(seen.lv))) return { error: 'hunt-tier' };
  const day = utcDay(nowS);
  const until = c.kind === 'mark' ? seatWeekStartMs(/** @type {number} */ (c.week) + 1) / 1000 : nowS + 1;
  // The daily cap and the mark rung are checked inside the INSERT, so two reports at once cannot both pass the cap.
  const [ins] = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO hunt_clears (player, char_id, kind, key, id, tier, region, day, at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
      WHERE (SELECT COUNT(*) FROM hunt_clears WHERE player = ?1 AND day = ?8) < ?10
        AND (?3 <> 'mark' OR (SELECT COUNT(*) FROM hunt_clears WHERE player = ?1 AND char_id = ?2 AND kind = 'board' AND at < ?12) >= ?11)
      RETURNING key`).bind(player.id, character, c.kind, c.key, c.id, c.tier, region, day, nowS, HUNT_CLEARS_DAY_MAX, MARK_CLEARS, until),
  ]);
  const recorded = (ins?.results?.length ?? 0) > 0;
  let why = null;
  if (!recorded) {
    const had = await db.prepare(`SELECT EXISTS (SELECT 1 FROM hunt_clears WHERE player = ?1 AND char_id = ?2 AND kind = ?3 AND key = ?4) AS had,
      (SELECT COUNT(*) FROM hunt_clears WHERE player = ?1 AND char_id = ?2 AND kind = 'board' AND at < ?5) AS board`).bind(player.id, character, c.kind, c.key, until).first();
    if (int(had?.had) === 1) why = 'repeat';
    else if (c.kind === 'mark' && int(had?.board) < MARK_CLEARS) return { error: 'hunt-rung' };
    else why = 'day-full';
  }
  const influence = recorded && region !== null ? await creditHunt(ctx, player, env, { character, region, ref: `${character}:${c.key}` }) : null;
  return {
    ok: true, recorded, ...(why ? { why } : {}), ...(why === 'repeat' ? { repeat: true } : {}), ...(influence ? { influence } : {}),
    ...(await huntStateOf(db, player.id, character, nowS)),
  };
}

const CLEARS_READ = HUNT_TITLES[HUNT_TITLES.length - 1][1];
const MASTERY_SQL = `SELECT
  (SELECT COUNT(*) FROM (SELECT 1 FROM hunt_clears WHERE player = ?1 AND kind = 'board' LIMIT ?3)) AS clears,
  (SELECT COUNT(*) FROM serpent_kills WHERE account = ?1) AS serpents,
  (SELECT GROUP_CONCAT(profession, ' ') FROM prof_tracks t WHERE t.player = ?1 AND t.xp >= ?2
    AND EXISTS (SELECT 1 FROM realm_characters r WHERE r.id = t.char_id AND r.player = ?1 AND r.dead_at IS NULL)) AS masters`;
const countsOfRow = (/** @type {any} */ r) => ({ clears: int(r?.clears), serpents: int(r?.serpents), masters: String(r?.masters ?? '').split(' ').filter(Boolean) });
export async function masteryCountsRead(/** @type {any} */ db, /** @type {string} */ playerId) {
  return countsOfRow(await db.prepare(MASTERY_SQL).bind(playerId, PROF_XP_MAX, CLEARS_READ).first());
}
export async function masteryMarksRead(/** @type {any} */ db, /** @type {string} */ playerId) {
  return masteryMarksOf(await masteryCountsRead(db, playerId));
}
export async function withMasteryMarks(/** @type {any} */ ctx, /** @type {any} */ player) {
  if (!(typeof player?.handle === 'string' && player.handle)) return player;
  return { ...player, masteryMarks: await masteryMarksRead(ctx.db, player.id) };
}
export async function masteryCountsAll(/** @type {any} */ ctx, /** @type {string[]} */ ids) {
  if (!ids.length) return new Map();
  const list = (/** @type {number} */ from) => ids.map((_, k) => `?${k + from}`).join(', ');
  const [h, s, m] = await ctx.db.batch([
    ctx.db.prepare(`WITH v(id) AS (VALUES ${ids.map((_, k) => `(?${k + 2})`).join(', ')}) SELECT v.id AS id,
      (SELECT COUNT(*) FROM (SELECT 1 FROM hunt_clears h WHERE h.player = v.id AND h.kind = 'board' LIMIT ?1)) AS n FROM v`).bind(CLEARS_READ, ...ids),
    ctx.db.prepare(`SELECT account AS id, COUNT(*) AS n FROM serpent_kills WHERE account IN (${list(1)}) GROUP BY account`).bind(...ids),
    ctx.db.prepare(`SELECT t.player AS id, GROUP_CONCAT(t.profession, ' ') AS p FROM prof_tracks t WHERE t.xp >= ?1 AND t.player IN (${list(2)})
      AND EXISTS (SELECT 1 FROM realm_characters r WHERE r.id = t.char_id AND r.player = t.player AND r.dead_at IS NULL) GROUP BY t.player`).bind(PROF_XP_MAX, ...ids),
  ]);
  const by = (/** @type {any} */ res, /** @type {string} */ col) => new Map((res?.results ?? []).map((/** @type {any} */ r) => [r.id, r[col]]));
  const [hs, ss, ms] = [by(h, 'n'), by(s, 'n'), by(m, 'p')];
  return new Map(ids.map((id) => [id, countsOfRow({ clears: hs.get(id), serpents: ss.get(id), masters: ms.get(id) })]));
}
export async function withMasteryMarksAll(/** @type {any} */ ctx, /** @type {any[]} */ rows) {
  const ids = rows.filter((r) => typeof r?.handle === 'string' && r.handle).map((r) => r.id);
  if (!ids.length) return rows;
  const counts = await masteryCountsAll(ctx, ids);
  return rows.map((r) => (counts.has(r.id) ? { ...r, masteryMarks: masteryMarksOf(counts.get(r.id)) } : r));
}
