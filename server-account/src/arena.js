// @ts-check
// Each row is a relay-signed receipt keyed by its bout id or attempt ticket, so it counts once whoever claims it.
import { verifyArenaReceipt } from '../../src/net/arenaReceipt.js';
import {
  arenaSeasonOf, arenaSeasonEndsS, arenaSeasonDay, eloAfter, ARENA_ELO_START, arenaLadderOf, ladderKey, ARENA_BANNERS, ARENA_TEAM_POINTS,
  ARENA_TIERS, ARENA_TIER_BOUTS, ARENA_PAIR_DAY_MAX, ARENA_CHAMPION_MIN_BOUTS, arenaRatingOk, ARENA_ELO_MIN, ARENA_ELO_MAX,
  ARENA_CHAMPION_MIN_FOES, ARENA_PAIR_SEASON_MAX, ARENA_TICKET_RE, arenaNextOf, ARENA_BOUT_ID_RE, ARENA_ATTEMPT_LIFE_S,
} from '../../src/net/arenaLaw.js';
import { boardNamesOf } from './boardNames.js';
import { renownQuestXp } from '../../src/net/renown.js';
import { reportRenownXp, renownTrackOf, renownCharacterOk } from './renownTracks.js';
import { shapeOf, keptFits } from './keptBoard.js';

export const ARENA_HONOUR_PATHS = new Set(['/v1/auth/token', '/v1/account', '/v1/account/title', '/v1/account/aura', '/v1/account/insignia', '/v1/patreon/unlink', '/v1/account/glyph', '/v1/account/icon']);
export const ARENA_BOARD_TOP = 10;
export const ARENA_HALL_MAX = 20;
export const ARENA_CHAMPION_CACHE_S = 60;
export const ARENA_CHAMPION_STORED_S = 600;
export const ARENA_CHAMPION_CLOCK_S = ARENA_CHAMPION_STORED_S - 120;
const GRAND_TIER = ARENA_TIERS - 1;

export const ARENA_RENOWN_TIER_LEVEL = (tier) => 2 * Math.max(0, Math.min(ARENA_TIERS - 1, Math.trunc(Number(tier) || 0))) + 3;
export const ARENA_RENOWN_QUESTS = Object.freeze({ bout: 1, champion: 2, grand: 3, pvp: 1 });
const ARENA_RENOWN_PVP_LEVEL = 30;
export const ARENA_RENOWN_REGION = 17;
export function arenaRenownXp(bout, renown = 1) {
  if (bout?.kind === 'pvp') return ARENA_RENOWN_QUESTS.pvp * renownQuestXp(ARENA_RENOWN_PVP_LEVEL, renown);
  const q = bout?.step === ARENA_TIER_BOUTS ? (bout.tier === GRAND_TIER ? ARENA_RENOWN_QUESTS.grand : ARENA_RENOWN_QUESTS.champion) : ARENA_RENOWN_QUESTS.bout;
  return q * renownQuestXp(ARENA_RENOWN_TIER_LEVEL(bout?.tier), renown);
}
async function arenaRenownFor(ctx, player, boutId, bout, { character = null, name = null } = {}) {
  const { db, nowS } = ctx;
  if (!renownCharacterOk(character)) return null;
  const xp = arenaRenownXp(bout, (await renownTrackOf(ctx, player.id, character))?.level ?? 1);
  if (!(xp > 0)) return null;
  const took = await db.prepare('INSERT OR IGNORE INTO arena_renown (bout, player, char_id, xp, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(boutId, player.id, character, xp, nowS).run();
  if (!(Number(took?.meta?.changes ?? 0) > 0)) return null;
  const r = await reportRenownXp(ctx, player, { character, xp, name, rid: boutId });
  if (r.error) { await db.prepare('DELETE FROM arena_renown WHERE bout = ?1 AND player = ?2').bind(boutId, player.id).run(); return null; }
  return r;
}

const pvePoints = (tier, step) => (step === ARENA_TIER_BOUTS ? (tier === GRAND_TIER ? ARENA_TEAM_POINTS.grand : ARENA_TEAM_POINTS.champion) : ARENA_TEAM_POINTS.bout);
const PVE_POINTS_SQL = `CASE WHEN step = ${ARENA_TIER_BOUTS} AND tier = ${GRAND_TIER} THEN ${ARENA_TEAM_POINTS.grand} WHEN step = ${ARENA_TIER_BOUTS} THEN ${ARENA_TEAM_POINTS.champion} ELSE ${ARENA_TEAM_POINTS.bout} END`;

export async function arenaPveOf({ db }, playerId) {
  const won = (await db.prepare('SELECT tier, step AS bout FROM arena_pve WHERE player = ?1 AND won = 1 AND voided = 0 ORDER BY tier, step').bind(playerId).all()).results ?? [];
  const r = await db.prepare(`SELECT SUM(won) AS wins, SUM(1 - won) AS losses, SUM(CASE WHEN won = 0 AND how = 'yield' THEN 1 ELSE 0 END) AS yields,
      SUM(CASE WHEN won = 0 AND how = 'fall' THEN 1 ELSE 0 END) AS falls, SUM(CASE WHEN won = 0 AND how = 'ringout' THEN 1 ELSE 0 END) AS ringouts
    FROM arena_pve WHERE player = ?1`).bind(playerId).first();
  const n = (v) => Number(v ?? 0) || 0;
  return { won, record: { wins: n(r?.wins), losses: n(r?.losses), yields: n(r?.yields), falls: n(r?.falls), ringouts: n(r?.ringouts) } };
}
export async function arenaLadderOfAccount(ctx, playerId) {
  const { won, record } = await arenaPveOf(ctx, playerId);
  const L = arenaLadderOf(won, record);
  const p = await ctx.db.prepare(`SELECT COUNT(DISTINCT step) AS n FROM arena_pve WHERE player = ?1 AND tier = ?2 AND won = 1 AND step < ${ARENA_TIER_BOUTS}`).bind(playerId, L.tier).first();
  return { ...L, paid: Math.max(L.won ?? 0, Math.min(ARENA_TIER_BOUTS, Number(p?.n ?? 0) || 0)) };
}

const SIDES_SQL = `sides AS (
    SELECT a AS p, ra1 AS r, at, rowid AS k, CASE result WHEN 0 THEN 1 ELSE 0 END AS w, CASE result WHEN 1 THEN 1 ELSE 0 END AS l, CASE result WHEN 2 THEN 1 ELSE 0 END AS d, b AS o
      FROM arena_pvp WHERE season = ?1 AND rated = 1 AND a IS NOT NULL
    UNION ALL
    SELECT b, rb1, at, rowid, CASE result WHEN 1 THEN 1 ELSE 0 END, CASE result WHEN 0 THEN 1 ELSE 0 END, CASE result WHEN 2 THEN 1 ELSE 0 END, a
      FROM arena_pvp WHERE season = ?1 AND rated = 1 AND b IS NOT NULL)`;
const BOARD_SQL = `WITH ${SIDES_SQL},
  last AS (SELECT p, r, at, ROW_NUMBER() OVER (PARTITION BY p ORDER BY k DESC) AS rn FROM sides),
  tally AS (SELECT p, SUM(w) AS w, SUM(l) AS l, SUM(d) AS d, COUNT(*) AS n, COUNT(DISTINCT o) AS foes FROM sides GROUP BY p)
  SELECT last.p AS player, last.r AS rating, last.at AS at, tally.w AS wins, tally.l AS losses, tally.d AS draws, tally.n AS bouts, tally.foes AS foes
    FROM last JOIN tally ON tally.p = last.p WHERE last.rn = 1
    ORDER BY last.r DESC, tally.w DESC, tally.n ASC, last.at ASC, last.p ASC`;

const MY_BOUTS_SQL = (p, s) => `SELECT ra1 AS r, at, rowid AS k, CASE result WHEN 0 THEN 1 ELSE 0 END AS w, CASE result WHEN 1 THEN 1 ELSE 0 END AS l, CASE result WHEN 2 THEN 1 ELSE 0 END AS d
      FROM arena_pvp WHERE a = ${p} AND season = ${s} AND rated = 1
    UNION ALL
    SELECT rb1, at, rowid, CASE result WHEN 1 THEN 1 ELSE 0 END, CASE result WHEN 0 THEN 1 ELSE 0 END, CASE result WHEN 2 THEN 1 ELSE 0 END
      FROM arena_pvp WHERE b = ${p} AND season = ${s} AND rated = 1 AND a IS NOT ${p}`;

export async function arenaRatingOf({ db }, playerId, season) {
  const t = await db.prepare(`SELECT (SELECT r FROM (${MY_BOUTS_SQL('?2', '?1')}) ORDER BY k DESC LIMIT 1) AS last,
       SUM(w) AS w, SUM(l) AS l, SUM(d) AS d, COUNT(*) AS n FROM (${MY_BOUTS_SQL('?2', '?1')})`).bind(season, playerId).first();
  const n = (v) => Number(v ?? 0) || 0;
  return { rating: t?.last != null ? arenaRatingOk(Number(t.last)) : ARENA_ELO_START, wins: n(t?.w), losses: n(t?.l), draws: n(t?.d), bouts: n(t?.n) };
}

export const laurelWorthy = (r) => !!r && Number(r.bouts) >= ARENA_CHAMPION_MIN_BOUTS && Number(r.foes ?? 0) >= ARENA_CHAMPION_MIN_FOES;
export const laurelOfBoard = (rows) => (laurelWorthy(rows?.[0]) ? rows[0].player : null);
export async function arenaChampionOf({ db }, season) {
  const rows = (await db.prepare(`${BOARD_SQL} LIMIT 1`).bind(season).all()).results ?? [];
  return laurelOfBoard(rows);
}
export async function storeArenaChampion(ctx, season, nowS) {
  const id = await arenaChampionOf(ctx, season);
  await ctx.db.prepare(`INSERT INTO arena_champions (season, player, at) VALUES (?1, ?2, ?3)
    ON CONFLICT (season) DO UPDATE SET player = excluded.player, at = excluded.at`).bind(season, id, nowS).run();
  _champ = { season, at: nowS, id };
  return id;
}
let _champ = { season: 0, at: -Infinity, id: null };
export function _resetArenaCache() { _champ = { season: 0, at: -Infinity, id: null }; }
async function championNow(ctx, nowS) {
  const season = arenaSeasonOf(nowS);
  if (_champ.season === season && nowS - _champ.at < ARENA_CHAMPION_CACHE_S) return _champ.id;
  return championFrom(ctx, nowS, season, await championKeptRead(ctx.db, season).first());
}
const grandRead = (/** @type {any} */ db, /** @type {string} */ id) => db.prepare(`SELECT 1 AS one FROM arena_pve WHERE player = ?1 AND tier = ${GRAND_TIER} AND step = ${ARENA_TIER_BOUTS} AND won = 1 LIMIT 1`).bind(id);
const championKeptRead = (/** @type {any} */ db, /** @type {number} */ season) => db.prepare('SELECT player, at FROM arena_champions WHERE season = ?1').bind(season);
async function championFrom(/** @type {any} */ ctx, /** @type {number} */ nowS, /** @type {number} */ season, /** @type {any} */ kept) {
  const id = kept && nowS - Number(kept.at) < ARENA_CHAMPION_STORED_S ? kept.player ?? null : await storeArenaChampion(ctx, season, nowS);
  _champ = { season, at: nowS, id };
  return id;
}

/** @param {{ db: any }} ctx */
export async function arenaHonoursOf(ctx, player, nowS) {
  if (!player?.handle) return { grand: false, champion: false };
  const g = await grandRead(ctx.db, player.id).first();
  const champion = (await championNow(ctx, nowS)) === player.id;
  return { grand: !!g, champion };
}
export function arenaHonoursPlan(/** @type {any} */ ctx, /** @type {any} */ player, /** @type {number} */ nowS) {
  if (!player?.handle) return { reads: [], from: async () => ({ grand: false, champion: false }) };
  const season = arenaSeasonOf(nowS);
  const cached = _champ.season === season && nowS - _champ.at < ARENA_CHAMPION_CACHE_S;
  const keptId = cached ? _champ.id : null;
  return {
    reads: [grandRead(ctx.db, player.id), ...(cached ? [] : [championKeptRead(ctx.db, season)])],
    from: async (/** @type {any[]} */ res) => ({
      grand: !!res[0]?.results?.[0],
      champion: (cached ? keptId : await championFrom(ctx, nowS, season, res[1]?.results?.[0] ?? null)) === player.id,
    }),
  };
}
export async function withArenaHonours(ctx, player, nowS) {
  return player ? { ...player, arena: await arenaHonoursOf(ctx, player, nowS) } : player;
}
export async function withArenaHonoursAll(ctx, rows, nowS) {
  const ids = [...new Set(rows.filter((r) => r?.handle).map((r) => r.id))];
  if (!ids.length) return rows;
  const grands = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const found = (await ctx.db.prepare(`SELECT DISTINCT player FROM arena_pve WHERE tier = ${GRAND_TIER} AND step = ${ARENA_TIER_BOUTS} AND won = 1
        AND player IN (${part.map((_, k) => `?${k + 1}`).join(', ')})`).bind(...part).all()).results ?? [];
    for (const r of found) grands.add(r.player);
  }
  const champion = await championNow(ctx, nowS);
  return rows.map((r) => (r?.handle ? { ...r, arena: { grand: grands.has(r.id), champion: champion === r.id } } : r));
}

export async function arenaMemberOf({ db }, playerId) {
  return db.prepare('SELECT banner, season, left_banner, left_season FROM arena_members WHERE player = ?1').bind(playerId).first();
}

/**
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto }} ctx
 * @param {any} player
 * @param {unknown} receipt
 * @param {CryptoKey|null} publicKey
 * @param {{ character?: unknown, name?: unknown }} [fighter]
 */
export async function claimArena(ctx, player, receipt, publicKey, fighter = {}) {
  const { nowS, subtle } = ctx;
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyArenaReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.a === 'l' ? c.s !== player.id : !c.f.includes(player.id)) return { error: 'not-yours' };
  if (!player.handle) return { recorded: false, why: 'guest' };
  const season = arenaSeasonOf(c.i);
  const member = await arenaMemberOf(ctx, player.id);
  const r = c.a === 'l' ? await claimLadder(ctx, player, c, season, member?.banner ?? null) : await claimPlayers(ctx, player, c, season);
  const won = c.a === 'l' ? (r.recorded ? r.won : r.why === 'claimed' && c.r === 1) : r.result === 'won' && r.rated === true;
  if (!won || r.repeat) return r;
  const renown = await arenaRenownFor(ctx, player, c.z ?? c.j, c.a === 'l' ? { kind: 'ladder', tier: c.q, step: c.u } : { kind: 'pvp' }, fighter);
  return renown ? { ...r, renown } : r;
}

// Runs before the loss row in the same batch and voids the run only for the first claim of that loss.
const breakRun = (db, playerId, tier, { ticket = null, bout = null } = {}) => db.prepare(`UPDATE arena_pve SET voided = 1
    WHERE player = ?1 AND tier = ?2 AND step < ${ARENA_TIER_BOUTS} AND won = 1 AND voided = 0
      AND NOT EXISTS (SELECT 1 FROM arena_pve WHERE player = ?1 AND tier = ?2 AND step = ${ARENA_TIER_BOUTS} AND won = 1)
      AND ${ticket ? 'EXISTS (SELECT 1 FROM arena_attempts WHERE id = ?3 AND done = 0)' : 'NOT EXISTS (SELECT 1 FROM arena_pve WHERE bout = ?3)'}`).bind(playerId, tier, ticket ?? bout);
// A win lands only while the account's unvoided wins equal this step's key, so two claims at once never both step.
const ladderRow = (db, key, playerId, season, c, won, banner, nowS) => db.prepare(`INSERT OR IGNORE INTO arena_pve (bout, player, season, tier, step, won, how, banner, at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
      WHERE ?6 = 0 OR (SELECT COUNT(*) FROM arena_pve WHERE player = ?2 AND won = 1 AND voided = 0) = ?10`)
  .bind(key, playerId, season, c.q, c.u, won ? 1 : 0, c.h, banner, nowS, ladderKey(c.q, c.u));

const wonBefore = async (db, playerId, tier, step) => step < ARENA_TIER_BOUTS
  && !!(await db.prepare('SELECT 1 FROM arena_pve WHERE player = ?1 AND tier = ?2 AND step = ?3 AND won = 1 AND voided = 1').bind(playerId, tier, step).first());

async function claimLadder(ctx, player, c, season, banner) {
  const { db, nowS } = ctx;
  const won = c.r === 1;
  const repeat = won && await wonBefore(db, player.id, c.q, c.u);
  if (repeat) banner = null;
  if (c.z !== undefined) {
    const att = await db.prepare('SELECT player, tier, step, room, at, done FROM arena_attempts WHERE id = ?1').bind(c.z).first();
    if (!att || att.player !== player.id || Number(att.tier) !== c.q || Number(att.step) !== c.u || att.room !== c.j || c.i > Number(att.at) + ARENA_ATTEMPT_LIFE_S) return { recorded: false, why: 'reused', ladder: await arenaLadderOfAccount(ctx, player.id) };
    const was = await db.prepare('SELECT won FROM arena_pve WHERE bout = ?1').bind(c.z).first();
    if (was) return { recorded: false, why: Number(was.won) === (won ? 1 : 0) ? 'claimed' : 'forfeit', ladder: await arenaLadderOfAccount(ctx, player.id) };
    if (Number(att.done) === 1) return { recorded: false, why: 'order', ladder: await arenaLadderOfAccount(ctx, player.id) };
    const res = await db.batch([
      ...(won ? [] : [breakRun(db, player.id, c.q, { ticket: c.z })]),
      ladderRow(db, c.z, player.id, season, c, won, banner, nowS),
      db.prepare('UPDATE arena_attempts SET done = 1 WHERE id = ?1').bind(c.z),
    ]);
    const recorded = Number(res?.[won ? 0 : 1]?.meta?.changes ?? 0) > 0;
    const ladder = await arenaLadderOfAccount(ctx, player.id);
    if (!recorded) {
      const kept = await db.prepare('SELECT won FROM arena_pve WHERE bout = ?1').bind(c.z).first();
      return { recorded: false, why: kept ? (Number(kept.won) === (won ? 1 : 0) ? 'claimed' : 'forfeit') : 'order', ladder };
    }
    return {
      recorded: true, kind: 'ladder', won, tier: c.q, bout: c.u, how: c.h, ladder,
      points: won && banner ? pvePoints(c.q, c.u) : 0, banner, grand: won && c.q === GRAND_TIER && c.u === ARENA_TIER_BOUTS, ...(repeat ? { repeat: true } : {}),
    };
  }
  const r = won ? await ladderRow(db, c.j, player.id, season, c, won, banner, nowS).run()
    : (await db.batch([breakRun(db, player.id, c.q, { bout: c.j }), ladderRow(db, c.j, player.id, season, c, won, banner, nowS)]))[1];
  const recorded = Number(r?.meta?.changes ?? 0) > 0;
  const ladder = await arenaLadderOfAccount(ctx, player.id);
  if (!recorded) {
    const kept = await db.prepare('SELECT player, tier, step, won FROM arena_pve WHERE bout = ?1').bind(c.j).first();
    // Room ids are reused, so `claimed` needs this receipt's own row; another row under the id is `reused`.
    const mine = !!kept && kept.player === player.id && Number(kept.tier) === c.q && Number(kept.step) === c.u && Number(kept.won) === (won ? 1 : 0);
    return { recorded: false, why: mine ? 'claimed' : kept ? 'reused' : 'order', ladder };
  }
  return {
    recorded: true, kind: 'ladder', won, tier: c.q, bout: c.u, how: c.h, ladder,
    points: won && banner ? pvePoints(c.q, c.u) : 0, banner, grand: won && c.q === GRAND_TIER && c.u === ARENA_TIER_BOUTS, ...(repeat ? { repeat: true } : {}),
  };
}

async function claimPlayers(ctx, player, c, season) {
  const { db, nowS } = ctx;
  const [a, b] = c.f;
  const kept = await db.prepare('SELECT * FROM arena_pvp WHERE bout = ?1').bind(c.j).first();
  if (kept) return { recorded: false, why: 'claimed', ...(await pvpAnswer(ctx, player.id, kept)) };
  const rows = (await db.prepare('SELECT id, handle FROM players WHERE id IN (?1, ?2)').bind(a, b).all()).results ?? [];
  const linked = (id) => rows.some((r) => r.id === id && r.handle);
  if (!linked(a) || !linked(b)) return { recorded: false, why: 'guest' };
  for (let tries = 0; tries < ARENA_RATE_TRIES; tries++) {
    const ra = await arenaRatingOf(ctx, a, season), rb = await arenaRatingOf(ctx, b, season);
    const pair = await db.prepare(`SELECT COUNT(*) AS n FROM arena_pvp WHERE rated = 1 AND at > ?3 - 86400
        AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))`).bind(a, b, nowS).first();
    const pairSeason = await db.prepare(`SELECT COUNT(*) AS n FROM arena_pvp WHERE rated = 1 AND season = ?3
        AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))`).bind(a, b, season).first();
    const rated = Number(pair?.n ?? 0) < ARENA_PAIR_DAY_MAX && Number(pairSeason?.n ?? 0) < ARENA_PAIR_SEASON_MAX;
    const [na, nb] = rated ? eloAfter(ra.rating, rb.rating, c.r === 0 ? 1 : c.r === 1 ? 0 : 0.5) : [ra.rating, rb.rating];
    const ma = await arenaMemberOf(ctx, a), mb = await arenaMemberOf(ctx, b);
    // The insert lands only while both ratings still match the read; a bout landing in between forces a reread.
    const ins = await db.prepare(`INSERT OR IGNORE INTO arena_pvp (bout, season, a, b, result, how, ra0, rb0, ra1, rb1, rated, banner_a, banner_b, at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
        WHERE ${RATING_NOW_SQL('?3')} = ?7 AND ${RATING_NOW_SQL('?4')} = ?8`)
      .bind(c.j, season, a, b, c.r, c.h, ra.rating, rb.rating, na, nb, rated ? 1 : 0, ma?.banner ?? null, mb?.banner ?? null, nowS).run();
    const row = await db.prepare('SELECT * FROM arena_pvp WHERE bout = ?1').bind(c.j).first();
    if (Number(ins?.meta?.changes ?? 0) > 0) {
      // A failed count leaves the bout recorded; the stored #1 is counted again once it is stale.
      if (rated) { try { await storeArenaChampion(ctx, season, nowS); } catch { } }
      return { recorded: true, kind: 'pvp', ...(await pvpAnswer(ctx, player.id, row)) };
    }
    if (row) return { recorded: false, why: 'claimed', ...(await pvpAnswer(ctx, player.id, row)) };
  }
  return { error: 'busy' };
}
export const ARENA_ATTEMPTS_KEEP_S = 7 * 86400;
export async function arenaAttempt(ctx, player, tier, bout, room) {
  const { db, nowS, rand } = ctx;
  if (!player.handle) return { error: 'ladder-needs-account' };
  if (!Number.isInteger(tier) || tier < 0 || tier >= ARENA_TIERS || !Number.isInteger(bout) || bout < 0 || bout > ARENA_TIER_BOUTS) return { error: 'bad-bout' };
  if (typeof room !== 'string' || !ARENA_BOUT_ID_RE.test(room)) return { error: 'bad-bout' };
  await db.prepare('DELETE FROM arena_attempts WHERE player = ?1 AND done = 1 AND at < ?2').bind(player.id, nowS - ARENA_ATTEMPTS_KEEP_S).run();
  const open = (await db.prepare('SELECT id, tier, step FROM arena_attempts WHERE player = ?1 AND done = 0').bind(player.id).all()).results ?? [];
  if (open.length) {
    const season = arenaSeasonOf(nowS);
    const member = await arenaMemberOf(ctx, player.id);
    const stmts = [];
    for (const a of open) {
      stmts.push(breakRun(db, player.id, Number(a.tier), { ticket: a.id }));
      stmts.push(ladderRow(db, a.id, player.id, season, { q: Number(a.tier), u: Number(a.step), h: 'forfeit' }, false, member?.banner ?? null, nowS));
      stmts.push(db.prepare('UPDATE arena_attempts SET done = 1 WHERE id = ?1').bind(a.id));
    }
    await db.batch(stmts);
  }
  const next = arenaNextOf((await arenaPveOf(ctx, player.id)).won);
  if (!next || next.tier !== tier || next.bout !== bout) return { error: 'order', ladder: await arenaLadderOfAccount(ctx, player.id), forfeits: open.length };
  const b = new Uint8Array(8);
  rand(b);
  const ticket = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  if (!ARENA_TICKET_RE.test(ticket)) return { error: 'busy' };
  const ins = await db.prepare('INSERT OR IGNORE INTO arena_attempts (id, player, tier, step, room, at, done) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)').bind(ticket, player.id, tier, bout, room, nowS).run();
  if (!(Number(ins?.meta?.changes ?? 0) > 0)) return { error: 'busy' };
  return { ticket, tier, bout, room, forfeits: open.length };
}

export const ARENA_RATE_TRIES = 4;
// The latest rating is the last written row (rowid), not the latest `at`: two claims can start in one second.
const RATING_NOW_SQL = (p) => `COALESCE((SELECT CASE WHEN r BETWEEN ${ARENA_ELO_MIN} AND ${ARENA_ELO_MAX} THEN r ELSE ${ARENA_ELO_START} END
    FROM (SELECT r FROM (${MY_BOUTS_SQL(p, '?2')}) ORDER BY k DESC LIMIT 1)), ${ARENA_ELO_START})`;
async function pvpAnswer(ctx, me, row) {
  const side = row.a === me ? 0 : 1;
  const result = row.result === 2 ? 'draw' : row.result === side ? 'won' : 'lost';
  const before = side === 0 ? row.ra0 : row.rb0, after = side === 0 ? row.ra1 : row.rb1;
  return { bout: row.bout, side, result, how: row.how, rating: after, delta: after - before, rated: row.rated === 1, season: row.season, standing: await arenaRatingOf(ctx, me, row.season) };
}

/** @param {{ db: any, nowS: number }} ctx */
export async function arenaTeam(ctx, player, banner) {
  const { db, nowS } = ctx;
  if (!player?.handle) return { error: 'guest' };
  if (banner !== null && !ARENA_BANNERS.includes(banner)) return { error: 'bad-banner' };
  const season = arenaSeasonOf(nowS);
  const m = await arenaMemberOf(ctx, player.id);
  if (banner === null) {
    if (!m?.banner) return { ok: true, banner: null, repeat: true };
    await db.prepare('UPDATE arena_members SET banner = NULL, left_banner = ?2, left_season = ?3, season = ?3, at = ?4 WHERE player = ?1').bind(player.id, m.banner, season, nowS).run();
    return { ok: true, banner: null, left: m.banner };
  }
  if (m?.banner === banner) return { ok: true, banner, repeat: true };
  if (m?.banner) return { error: 'joined', banner: m.banner };
  if (m?.left_banner && m.left_banner !== banner && Number(m.left_season) >= season) return { error: 'season', left: m.left_banner };
  await db.prepare(`INSERT INTO arena_members (player, banner, season, left_banner, left_season, at) VALUES (?1, ?2, ?3, NULL, NULL, ?4)
      ON CONFLICT (player) DO UPDATE SET banner = ?2, season = ?3, at = ?4`).bind(player.id, banner, season, nowS).run();
  return { ok: true, banner };
}

const STANDINGS_PVE_SQL = `SELECT banner, SUM(${PVE_POINTS_SQL}) AS pts FROM arena_pve WHERE season = ?1 AND won = 1 AND banner IS NOT NULL GROUP BY banner`;
const STANDINGS_PVP_SQL = `SELECT banner, SUM(n) AS n FROM (
      SELECT banner_a AS banner, COUNT(*) AS n FROM arena_pvp WHERE season = ?1 AND rated = 1 AND result = 0 AND banner_a IS NOT NULL GROUP BY banner_a
      UNION ALL SELECT banner_b, COUNT(*) FROM arena_pvp WHERE season = ?1 AND rated = 1 AND result = 1 AND banner_b IS NOT NULL GROUP BY banner_b) GROUP BY banner`;
const standingsReads = (/** @type {any} */ db, /** @type {number} */ season) => [db.prepare(STANDINGS_PVE_SQL).bind(season), db.prepare(STANDINGS_PVP_SQL).bind(season)];
function standingsFrom(/** @type {any[]} */ pve, /** @type {any[]} */ pvp) {
  const out = { red: 0, blue: 0 };
  for (const r of pve) if (r.banner in out) out[r.banner] += Number(r.pts) || 0;
  for (const r of pvp) if (r.banner in out) out[r.banner] += (Number(r.n) || 0) * ARENA_TEAM_POINTS.pvp;
  return out;
}
const ROSTER_SQL = `SELECT p AS player, SUM(pts) AS points, SUM(w) AS wins FROM (
      SELECT player AS p, ${PVE_POINTS_SQL} AS pts, 1 AS w FROM arena_pve WHERE season = ?1 AND won = 1 AND banner = ?2
      UNION ALL SELECT a, ${ARENA_TEAM_POINTS.pvp}, 1 FROM arena_pvp WHERE season = ?1 AND rated = 1 AND result = 0 AND banner_a = ?2
      UNION ALL SELECT b, ${ARENA_TEAM_POINTS.pvp}, 1 FROM arena_pvp WHERE season = ?1 AND rated = 1 AND result = 1 AND banner_b = ?2)
    WHERE p IS NOT NULL GROUP BY p ORDER BY points DESC, wins DESC, p ASC`;
const rosterRead = (/** @type {any} */ db, /** @type {number} */ season, /** @type {string} */ banner) => db.prepare(ROSTER_SQL).bind(season, banner);
const GRAND_SQL = `SELECT player, MIN(at) AS at FROM arena_pve WHERE tier = ${GRAND_TIER} AND step = ${ARENA_TIER_BOUTS} AND won = 1 GROUP BY player ORDER BY at DESC`;
const CLIMB_SQL = `SELECT player, SUM(CASE WHEN won = 1 AND voided = 0 THEN 1 ELSE 0 END) AS reached, SUM(1 - won) AS losses, MIN(at) AS first, MAX(CASE WHEN won = 1 AND voided = 0 THEN at END) AS last
      FROM arena_pve GROUP BY player HAVING reached > 0 ORDER BY reached DESC, last ASC, player ASC`;
const FAST_SQL = `SELECT g.player AS player, g.at AS at, (SELECT MIN(at) FROM arena_pve f WHERE f.player = g.player) AS first
      FROM (SELECT player, MIN(at) AS at FROM arena_pve WHERE tier = ${GRAND_TIER} AND step = ${ARENA_TIER_BOUTS} AND won = 1 GROUP BY player) g`;
const MEMBERS_SQL = 'SELECT banner, COUNT(*) AS n FROM arena_members WHERE banner IS NOT NULL GROUP BY banner';

/**
 * @param {{ db: any }} ctx
 * @param {number} season
 * @param {(() => Promise<unknown>)[]} [later]
 */
export async function arenaShared({ db }, season, later) {
  const kept = await db.prepare(ARENA_BOARD_READ).bind(season).first();
  const shared = kept && Number(kept.built) === Number(kept.ver) && kept.shape === ARENA_BOARD_SHAPE ? arenaSharedOf(kept.rows) : null;
  if (shared) return arenaView(shared, season);
  const rs = await db.batch([
    db.prepare('SELECT ver FROM arena_board_ver WHERE id = 1'),
    db.prepare(GRAND_SQL),
    db.prepare(BOARD_SQL).bind(season),
    db.prepare(CLIMB_SQL),
    db.prepare(FAST_SQL),
    ...standingsReads(db, season), ...standingsReads(db, season - 1),
    rosterRead(db, season, 'red'), rosterRead(db, season, 'blue'),
    db.prepare(MEMBERS_SQL),
  ]);
  const at = (/** @type {number} */ i) => rs[i]?.results ?? [];
  const counted = {
    grandRows: at(1), pvpAll: at(2), pveAll: at(3), fastAll: at(4),
    standingRows: { now: [at(5), at(6)], last: [at(7), at(8)] },
    rosters: { red: at(9), blue: at(10) }, counts: at(11),
  };
  const ver = at(0)[0]?.ver;
  const text = JSON.stringify(counted);
  if (Number.isSafeInteger(ver) && keptFits(text, 'the arena\'s board')) {
    const keep = () => db.prepare(ARENA_BOARD_KEEP).bind(season, ver, ARENA_BOARD_SHAPE, text).run()
      .catch((/** @type {any} */ e) => console.warn('[arena] the season\'s board not kept', e?.message ?? e));
    // Callers run this after their own reads, since on a replica session a read after a write waits for it.
    if (later) later.push(keep); else await keep();
  }
  return arenaView(counted, season);
}
function arenaView(/** @type {any} */ c, /** @type {number} */ season) {
  const { standingRows: { now, last }, ...rest } = c;
  return { ...rest, standings: standingsFrom(now[0], now[1]), last: season > 1 ? standingsFrom(last[0], last[1]) : { red: 0, blue: 0 } };
}
export const ARENA_BOARD_READ = `SELECT v.ver, b.built, b.shape, b.rows FROM arena_board_ver v LEFT JOIN arena_boards b ON b.season = ?1 WHERE v.id = 1`;
export const ARENA_BOARD_KEEP = `INSERT INTO arena_boards (season, built, shape, rows) SELECT ?1, ?2, ?3, ?4 WHERE (SELECT ver FROM arena_board_ver WHERE id = 1) = ?2
  ON CONFLICT (season) DO UPDATE SET built = excluded.built, shape = excluded.shape, rows = excluded.rows WHERE NOT (built = excluded.built AND shape IS excluded.shape)`;
export const ARENA_BOARD_SHAPE = shapeOf('arena-board: {grandRows, pvpAll, pveAll, fastAll, standingRows: {now, last: [pve, pvp]}, rosters: {red, blue}, counts}',
  GRAND_SQL, BOARD_SQL, CLIMB_SQL, FAST_SQL, STANDINGS_PVE_SQL, STANDINGS_PVP_SQL, ROSTER_SQL, MEMBERS_SQL);
export function arenaSharedOf(/** @type {unknown} */ text) {
  let o;
  try { o = JSON.parse(String(text)); } catch { return null; }
  const lists = ['grandRows', 'pvpAll', 'pveAll', 'fastAll', 'counts'];
  const pair = (/** @type {unknown} */ x) => Array.isArray(x) && x.length === 2 && x.every(Array.isArray);
  return o && lists.every((k) => Array.isArray(o[k])) && pair(o.standingRows?.now) && pair(o.standingRows?.last)
    && Array.isArray(o.rosters?.red) && Array.isArray(o.rosters?.blue) ? o : null;
}

export const ARENA_RECENT_MAX = 20;
export async function arenaRecordsOf({ db }, me) {
  const pve = (await db.prepare(`SELECT tier, step, won, how, banner, at, rowid AS k FROM arena_pve WHERE player = ?1 ORDER BY at DESC, rowid DESC LIMIT ?2`)
    .bind(me, ARENA_RECENT_MAX).all()).results ?? [];
  const pvp = (await db.prepare(`SELECT a, b, result, how, ra0, rb0, ra1, rb1, rated, banner_a, banner_b, at, rowid AS k FROM arena_pvp
      WHERE a = ?1 OR b = ?1 ORDER BY at DESC, rowid DESC LIMIT ?2`).bind(me, ARENA_RECENT_MAX).all()).results ?? [];
  const rows = [
    ...pve.map((r) => ({
      at: Number(r.at), src: 0, k: Number(r.k),
      bout: { at: Number(r.at), kind: 'pve', tier: Number(r.tier), step: Number(r.step), won: r.won === 1, how: r.how, points: r.won === 1 && r.banner ? pvePoints(Number(r.tier), Number(r.step)) : 0 },
    })),
    ...pvp.map((r) => {
      const side = r.a === me ? 0 : 1;
      const won = r.result === 2 ? null : r.result === side;
      const rated = r.rated === 1;
      const banner = side === 0 ? r.banner_a : r.banner_b;
      const other = side === 0 ? r.b : r.a;
      return {
        at: Number(r.at), src: 1, k: Number(r.k),
        bout: {
          at: Number(r.at), kind: 'pvp', won, how: r.how,
          rating: { before: Number(side === 0 ? r.ra0 : r.rb0), after: Number(side === 0 ? r.ra1 : r.rb1) }, rated,
          ...(other ? { opponent: other } : {}), points: rated && won === true && banner ? ARENA_TEAM_POINTS.pvp : 0,
        },
      };
    }),
  ].sort((x, y) => y.at - x.at || y.src - x.src || y.k - x.k).slice(0, ARENA_RECENT_MAX);
  const t = await db.prepare(`SELECT
      (SELECT COALESCE(SUM(won), 0) FROM arena_pve WHERE player = ?1) AS pw, (SELECT COALESCE(SUM(1 - won), 0) FROM arena_pve WHERE player = ?1) AS pl,
      (SELECT COALESCE(SUM(CASE WHEN (a = ?1 AND result = 0) OR (b = ?1 AND result = 1) THEN 1 ELSE 0 END), 0) FROM arena_pvp WHERE a = ?1 OR b = ?1) AS vw,
      (SELECT COALESCE(SUM(CASE WHEN (a = ?1 AND result = 1) OR (b = ?1 AND result = 0) THEN 1 ELSE 0 END), 0) FROM arena_pvp WHERE a = ?1 OR b = ?1) AS vl,
      (SELECT COALESCE(SUM(CASE WHEN result = 2 THEN 1 ELSE 0 END), 0) FROM arena_pvp WHERE a = ?1 OR b = ?1) AS vd`).bind(me).first();
  const best = await db.prepare(`WITH fought AS (
      SELECT at, 0 AS src, rowid AS k, won AS w FROM arena_pve WHERE player = ?1
      UNION ALL SELECT at, 1, rowid, CASE WHEN (a = ?1 AND result = 0) OR (b = ?1 AND result = 1) THEN 1 ELSE 0 END FROM arena_pvp WHERE a = ?1 OR b = ?1),
    runs AS (SELECT w, SUM(1 - w) OVER (ORDER BY at, src, k ROWS UNBOUNDED PRECEDING) AS g FROM fought)
    SELECT COALESCE(MAX(n), 0) AS best FROM (SELECT COUNT(*) AS n FROM runs WHERE w = 1 GROUP BY g)`).bind(me).first();
  const n = (v) => Number(v ?? 0) || 0;
  return {
    recent: rows.map((r) => r.bout),
    record: { pveWins: n(t?.pw), pveLosses: n(t?.pl), pvpWins: n(t?.vw), pvpLosses: n(t?.vl), pvpDraws: n(t?.vd), best: n(best?.best) },
  };
}

export function topWithMe(rows, me, top = ARENA_BOARD_TOP) {
  rows.forEach((r, i) => { r.rank = i + 1; r.you = typeof me === 'function' ? !!me(r) : r.player === me; });
  const shown = rows.slice(0, top);
  const mine = rows.find((r) => r.you) ?? null;
  return { rows: shown, pinned: mine && !shown.includes(mine) ? mine : null, total: rows.length };
}

/** @param {{ db: any, nowS: number }} ctx */
export async function arenaBoardOf(ctx, player, env) {
  const { nowS } = ctx;
  const season = arenaSeasonOf(nowS);
  const me = player?.id ?? null;
  const later = /** @type {(() => Promise<unknown>)[]} */ ([]);
  const { grandRows, pvpAll, pveAll, fastAll, standings, last, rosters, counts } = await arenaShared(ctx, season, later);
  const champion = laurelOfBoard(pvpAll);
  const honours = { grands: new Set(grandRows.map((r) => r.player)), champion };
  const fast = fastAll.map((r) => ({ player: r.player, days: Math.max(1, Math.ceil((Number(r.at) - Number(r.first)) / 86400)), at: Number(r.at) }))
    .sort((x, y) => x.days - y.days || x.at - y.at || (x.player < y.player ? -1 : 1));
  const laurel = last.red > last.blue ? 'red' : last.blue > last.red ? 'blue' : null;
  const member = me ? await arenaMemberOf(ctx, me) : null;
  const banner = member?.banner ?? null;
  const roster = banner ? rosters[banner] : [];
  const pvp = topWithMe(pvpAll.map((r) => ({ player: r.player, rating: Number(r.rating), wins: Number(r.wins), losses: Number(r.losses), draws: Number(r.draws), bouts: Number(r.bouts) })), me);
  const pve = topWithMe(pveAll.map((r) => ({ player: r.player, reached: Number(r.reached), losses: Number(r.losses), grand: honours.grands.has(r.player) })), me);
  const fastB = topWithMe(fast, me);
  const teams = Object.fromEntries(ARENA_BANNERS.map((b) => [b, topWithMe(rosters[b].map((r) => ({ player: r.player, points: Number(r.points), wins: Number(r.wins), banner: b })), me)]));
  const hall = grandRows.slice(0, ARENA_HALL_MAX).map((r) => ({ player: r.player, at: Number(r.at) }));
  const records = me ? await arenaRecordsOf(ctx, me) : null;
  const ids = [...pvp.rows, pvp.pinned, ...pve.rows, pve.pinned, ...fastB.rows, fastB.pinned, ...teams.red.rows, teams.red.pinned, ...teams.blue.rows, teams.blue.pinned, ...hall, champion ? { player: champion } : null,
    ...(records?.recent ?? []).map((b) => (b.opponent ? { player: b.opponent } : null))].filter(Boolean).map((r) => r.player);
  const names = await boardNamesOf(ctx, ids, env, nowS, { arena: (row) => ({ grand: honours.grands.has(row.id), champion: honours.champion === row.id }) });
  const named = (r) => { if (!r) return null; const { player: id, ...rest } = r; return { ...rest, ...(names.get(id) ?? { name: '', title: null, glyphs: [] }) }; };
  const board = (b) => ({ rows: b.rows.map(named), pinned: named(b.pinned), total: b.total });
  const mine = me ? {
    ladder: await arenaLadderOfAccount(ctx, me),
    pvp: await arenaRatingOf(ctx, me, season),
    rank: pvp.rows.concat(pvp.pinned ? [pvp.pinned] : []).find((r) => r.you)?.rank ?? null,
    banner, left: member?.left_banner ?? null, leftSeason: member?.left_season ?? null,
    points: banner ? (roster.find((r) => r.player === me) ? Number(roster.find((r) => r.player === me).points) : 0) : 0,
    grand: honours.grands.has(me), champion: champion === me,
    recent: records.recent.map((b) => (b.opponent ? { ...b, opponent: names.get(b.opponent) ?? { name: '', title: null, glyphs: [] } } : b)),
    record: records.record,
  } : null;
  for (const keep of later) await keep();
  return {
    season, day: arenaSeasonDay(nowS), endsAt: arenaSeasonEndsS(season),
    pvp: board(pvp), pve: board(pve), fast: board(fastB),
    champion: champion ? named({ player: champion }) : null,
    team: { standings, last: { season: season - 1, ...last, winner: laurel }, laurel, members: Object.fromEntries(ARENA_BANNERS.map((b) => [b, Number(counts.find((c) => c.banner === b)?.n ?? 0)])), rosters: { red: board(teams.red), blue: board(teams.blue) } },
    hall: hall.map(named),
    me: mine,
  };
}
