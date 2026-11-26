// @ts-check
import { verifyIliacReceipt } from '../../src/net/iliacReceipt.js';
import { mintDeckOrder, deckDigest } from '../../src/net/identityToken.js';
import { arenaSeasonOf, arenaSeasonEndsS, arenaSeasonDay, eloAfter, ARENA_ELO_START, ARENA_ELO_MIN, ARENA_ELO_MAX, arenaRatingOk, ARENA_PAIR_DAY_MAX, ARENA_PAIR_SEASON_MAX } from '../../src/net/arenaLaw.js';
import { deckShortOf } from '../../src/net/cardWorthLaw.js';
import { deckValid } from '../../src/net/iliacHand.js';
import { realmActFirst, getRealmBlob, realmSaveTextOf } from './realm.js';
import { boardNamesOf } from './boardNames.js';

export const ILIAC_CHAMPION_MIN_GAMES = 10;
export const ILIAC_CHAMPION_MIN_FOES = 5;
export const ILIAC_BOARD_TOP = 10;
export const ILIAC_CHAMPION_CACHE_S = 60;
export const ILIAC_CHAMPION_STORED_S = 600;
export const ILIAC_CHAMPION_CLOCK_S = ILIAC_CHAMPION_STORED_S - 120;
export const ILIAC_RATE_TRIES = 4;

/** @param {any} ctx @param {any} player @param {any} env @param {any} body @param {CryptoKey|null} signingKey */
export async function deckOrderOf(ctx, player, env, { character, realm = null, deck } = {}, signingKey = null) {
  const { db, nowS, subtle } = ctx;
  if (!player?.handle) return { error: 'ranked-needs-account' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'cards-realm' };
  if (!signingKey) return { error: 'cards-closed' };
  if (!Array.isArray(deck) || !deck.every((x) => typeof x === 'string') || deckValid(deck) !== null) return { error: 'bad-deck' };
  const blob = await getRealmBlob(ctx, player.id, side.at.id);
  if (blob.error) return blob;
  let save = null;
  try { save = JSON.parse(await realmSaveTextOf(blob.object)); } catch { save = null; }
  if (!save || typeof save !== 'object' || Array.isArray(save)) return { error: 'no-data' };
  const short = deckShortOf(save, deck);
  if (short) return { error: 'deck-short', card: short };
  const digest = await deckDigest(deck, { subtle });
  return { ok: true, digest, order: await mintDeckOrder({ s: player.id, dh: digest }, signingKey, { subtle, nowS }) };
}

const MY_GAMES_SQL = (p, s) => `SELECT ra1 AS r, at, rowid AS k, CASE result WHEN 0 THEN 1 ELSE 0 END AS w, CASE result WHEN 1 THEN 1 ELSE 0 END AS l, CASE result WHEN 2 THEN 1 ELSE 0 END AS d
      FROM iliac_games WHERE a = ${p} AND season = ${s} AND rated = 1
    UNION ALL
    SELECT rb1, at, rowid, CASE result WHEN 1 THEN 1 ELSE 0 END, CASE result WHEN 0 THEN 1 ELSE 0 END, CASE result WHEN 2 THEN 1 ELSE 0 END
      FROM iliac_games WHERE b = ${p} AND season = ${s} AND rated = 1 AND a IS NOT ${p}`;
// The rating now is the last row written, not the latest at, since at is when the request began.
const RATING_NOW_SQL = (p) => `COALESCE((SELECT CASE WHEN r BETWEEN ${ARENA_ELO_MIN} AND ${ARENA_ELO_MAX} THEN r ELSE ${ARENA_ELO_START} END
    FROM (SELECT r FROM (${MY_GAMES_SQL(p, '?2')}) ORDER BY k DESC LIMIT 1)), ${ARENA_ELO_START})`;
// Two lookups instead of one OR, so the planner uses idx_iliac_games_pair rather than walking the season.
const PAIR_SQL = (when) => `SELECT (SELECT COUNT(*) FROM iliac_games WHERE a = ?1 AND b = ?2 AND rated = 1 AND ${when})
    + (SELECT COUNT(*) FROM iliac_games WHERE a = ?2 AND b = ?1 AND ?1 IS NOT ?2 AND rated = 1 AND ${when}) AS n`;
const SIDES_SQL = `sides AS (
    SELECT a AS p, ra1 AS r, at, rowid AS k, CASE result WHEN 0 THEN 1 ELSE 0 END AS w, CASE result WHEN 1 THEN 1 ELSE 0 END AS l, CASE result WHEN 2 THEN 1 ELSE 0 END AS d, b AS o
      FROM iliac_games WHERE season = ?1 AND rated = 1 AND a IS NOT NULL
    UNION ALL
    SELECT b, rb1, at, rowid, CASE result WHEN 1 THEN 1 ELSE 0 END, CASE result WHEN 0 THEN 1 ELSE 0 END, CASE result WHEN 2 THEN 1 ELSE 0 END, a
      FROM iliac_games WHERE season = ?1 AND rated = 1 AND b IS NOT NULL)`;
const BOARD_SQL = `WITH ${SIDES_SQL},
  last AS (SELECT p, r, at, ROW_NUMBER() OVER (PARTITION BY p ORDER BY k DESC) AS rn FROM sides),
  tally AS (SELECT p, SUM(w) AS w, SUM(l) AS l, SUM(d) AS d, COUNT(*) AS n, COUNT(DISTINCT o) AS foes FROM sides GROUP BY p)
  SELECT last.p AS player, last.r AS rating, last.at AS at, tally.w AS wins, tally.l AS losses, tally.d AS draws, tally.n AS games, tally.foes AS foes
    FROM last JOIN tally ON tally.p = last.p WHERE last.rn = 1
    ORDER BY last.r DESC, tally.w DESC, tally.n ASC, last.at ASC, last.p ASC`;

export async function iliacRatingOf({ db }, playerId, season) {
  const t = await db.prepare(`SELECT (SELECT r FROM (${MY_GAMES_SQL('?2', '?1')}) ORDER BY k DESC LIMIT 1) AS last,
       SUM(w) AS w, SUM(l) AS l, SUM(d) AS d, COUNT(*) AS n FROM (${MY_GAMES_SQL('?2', '?1')})`).bind(season, playerId).first();
  const n = (v) => Number(v ?? 0) || 0;
  return { rating: t?.last != null ? arenaRatingOk(Number(t.last)) : ARENA_ELO_START, wins: n(t?.w), losses: n(t?.l), draws: n(t?.d), games: n(t?.n) };
}

export const iliacTitleWorthy = (r) => !!r && Number(r.games) >= ILIAC_CHAMPION_MIN_GAMES && Number(r.foes ?? 0) >= ILIAC_CHAMPION_MIN_FOES;
export const iliacChampionOfBoard = (rows) => (iliacTitleWorthy(rows?.[0]) ? rows[0].player : null);
export async function iliacChampionOf({ db }, season) {
  const rows = (await db.prepare(`${BOARD_SQL} LIMIT 1`).bind(season).all()).results ?? [];
  return iliacChampionOfBoard(rows);
}
let _champ = { season: 0, at: -Infinity, id: null };
export function _resetIliacCache() { _champ = { season: 0, at: -Infinity, id: null }; }
export async function storeIliacChampion(ctx, season, nowS) {
  const id = await iliacChampionOf(ctx, season);
  await ctx.db.prepare(`INSERT INTO iliac_champions (season, player, at) VALUES (?1, ?2, ?3)
    ON CONFLICT (season) DO UPDATE SET player = excluded.player, at = excluded.at`).bind(season, id, nowS).run();
  _champ = { season, at: nowS, id };
  return id;
}
const seasonPlayed = async ({ db }, season) => !!(await playedRead(db, season).first());
async function championNow(ctx, nowS) {
  const season = arenaSeasonOf(nowS);
  if (_champ.season === season && nowS - _champ.at < ILIAC_CHAMPION_CACHE_S) return _champ.id;
  const kept = await championKeptRead(ctx.db, season).first();
  const stale = !(kept && nowS - Number(kept.at) < ILIAC_CHAMPION_STORED_S);
  return championFrom(ctx, nowS, season, kept, stale && await seasonPlayed(ctx, season));
}
const championKeptRead = (/** @type {any} */ db, /** @type {number} */ season) => db.prepare('SELECT player, at FROM iliac_champions WHERE season = ?1').bind(season);
const playedRead = (/** @type {any} */ db, /** @type {number} */ season) => db.prepare('SELECT 1 AS one FROM iliac_games WHERE season = ?1 AND rated = 1 LIMIT 1').bind(season);
async function championFrom(/** @type {any} */ ctx, /** @type {number} */ nowS, /** @type {number} */ season, /** @type {any} */ kept, /** @type {boolean} */ played) {
  const id = kept && nowS - Number(kept.at) < ILIAC_CHAMPION_STORED_S ? kept.player ?? null : played ? await storeIliacChampion(ctx, season, nowS) : null;
  _champ = { season, at: nowS, id };
  return id;
}
export function iliacHonoursPlan(/** @type {any} */ ctx, /** @type {any} */ player, /** @type {number} */ nowS) {
  if (!player?.handle) return { reads: [], from: async () => ({ champion: false }) };
  const season = arenaSeasonOf(nowS);
  const cached = _champ.season === season && nowS - _champ.at < ILIAC_CHAMPION_CACHE_S;
  const keptId = cached ? _champ.id : null;
  return {
    reads: cached ? [] : [championKeptRead(ctx.db, season), playedRead(ctx.db, season)],
    from: async (/** @type {any[]} */ res) => ({ champion: (cached ? keptId : await championFrom(ctx, nowS, season, res[0]?.results?.[0] ?? null, !!res[1]?.results?.[0])) === player.id }),
  };
}
/** @param {{ db: any, nowS: number }} ctx */
export async function iliacChampionClock(ctx) {
  const season = arenaSeasonOf(ctx.nowS);
  const q = await ctx.db.prepare(`SELECT (SELECT at FROM iliac_champions WHERE season = ?1) AS kept,
      (SELECT player FROM iliac_champions WHERE season = ?1) AS player,
      (SELECT MAX(at) FROM iliac_games WHERE season = ?1 AND rated = 1) AS last`).bind(season).first();
  const kept = q?.kept == null ? null : { at: Number(q.kept), player: q.player ?? null };
  if (kept && ctx.nowS - kept.at < ILIAC_CHAMPION_CLOCK_S) return 0;
  const last = { at: q?.last ?? null };
  if (last.at == null) return 0;
  // A kept champion of nobody is counted again, because deleting the champion's account sets the row to NULL.
  if (kept && kept.player != null && Number(last.at) < kept.at) {
    await ctx.db.prepare('UPDATE iliac_champions SET at = ?2 WHERE season = ?1').bind(season, ctx.nowS).run();
    return 0;
  }
  await storeIliacChampion(ctx, season, ctx.nowS);
  return 1;
}

export async function iliacHonoursOf(ctx, player, nowS) {
  if (!player?.handle) return { champion: false };
  return { champion: (await championNow(ctx, nowS)) === player.id };
}
export async function withIliacHonours(ctx, player, nowS) {
  return player ? { ...player, iliac: await iliacHonoursOf(ctx, player, nowS) } : player;
}

async function gameAnswer(ctx, me, row) {
  const side = row.a === me ? 0 : 1;
  const result = row.result === 2 ? 'draw' : row.result === side ? 'won' : 'lost';
  const before = side === 0 ? row.ra0 : row.rb0, after = side === 0 ? row.ra1 : row.rb1;
  return { game: row.game, side, result, how: row.how, rating: after, delta: after - before, rated: row.rated === 1, season: row.season, standing: await iliacRatingOf(ctx, me, row.season) };
}

async function topMayMove(ctx, season, a, b, na, nb) {
  const kept = await ctx.db.prepare('SELECT player FROM iliac_champions WHERE season = ?1').bind(season).first();
  const top = kept?.player ?? null;
  if (!top || top === a || top === b) return true;
  const { rating } = await iliacRatingOf(ctx, top, season);
  return na >= rating || nb >= rating;
}

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto }} ctx @param {any} player @param {unknown} receipt
 * @param {CryptoKey|null} publicKey */
export async function claimIliac(ctx, player, receipt, publicKey) {
  const { db, nowS, subtle } = ctx;
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyIliacReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (!c.f.includes(player.id)) return { error: 'not-yours' };
  if (!player.handle) return { recorded: false, why: 'guest' };
  const season = arenaSeasonOf(c.i);
  const [a, b] = c.f;
  const kept = await db.prepare('SELECT * FROM iliac_games WHERE game = ?1').bind(c.j).first();
  if (kept) return { recorded: false, why: 'claimed', ...(await gameAnswer(ctx, player.id, kept)) };
  const rows = (await db.prepare('SELECT id, handle FROM players WHERE id IN (?1, ?2)').bind(a, b).all()).results ?? [];
  const linked = (id) => rows.some((r) => r.id === id && r.handle);
  if (!linked(a) || !linked(b)) return { recorded: false, why: 'foe-unregistered' };
  for (let tries = 0; tries < ILIAC_RATE_TRIES; tries++) {
    const ra = await iliacRatingOf(ctx, a, season), rb = await iliacRatingOf(ctx, b, season);
    // The daily pair cap counts games by their played time, since a held receipt can arrive days later.
    const pair = await db.prepare(PAIR_SQL('played > ?3 - 86400 AND played < ?3 + 86400')).bind(a, b, c.i).first();
    const pairSeason = await db.prepare(PAIR_SQL('season = ?3')).bind(a, b, season).first();
    const rated = Number(pair?.n ?? 0) < ARENA_PAIR_DAY_MAX && Number(pairSeason?.n ?? 0) < ARENA_PAIR_SEASON_MAX;
    const [na, nb] = rated ? eloAfter(ra.rating, rb.rating, c.r === 0 ? 1 : c.r === 1 ? 0 : 0.5) : [ra.rating, rb.rating];
    const ins = await db.prepare(`INSERT OR IGNORE INTO iliac_games (game, season, a, b, result, how, ra0, rb0, ra1, rb1, rated, played, at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
        WHERE ${RATING_NOW_SQL('?3')} = ?7 AND ${RATING_NOW_SQL('?4')} = ?8`)
      .bind(c.j, season, a, b, c.r, c.h, ra.rating, rb.rating, na, nb, rated ? 1 : 0, c.i, nowS).run();
    const row = await db.prepare('SELECT * FROM iliac_games WHERE game = ?1').bind(c.j).first();
    if (Number(ins?.meta?.changes ?? 0) > 0) {
      if (rated) { try { if (await topMayMove(ctx, season, a, b, na, nb)) await storeIliacChampion(ctx, season, nowS); } catch { } }
      return { recorded: true, ...(await gameAnswer(ctx, player.id, row)) };
    }
    if (row) return { recorded: false, why: 'claimed', ...(await gameAnswer(ctx, player.id, row)) };
  }
  return { error: 'busy' };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} player @param {any} env */
export async function iliacBoardOf(ctx, player, env) {
  const { db, nowS } = ctx;
  const season = arenaSeasonOf(nowS);
  const me = player?.id ?? null;
  const all = (await db.prepare(BOARD_SQL).bind(season).all()).results ?? [];
  const champion = iliacChampionOfBoard(all);
  const ranked = all.map((r, i) => ({ player: r.player, rating: Number(r.rating), wins: Number(r.wins), losses: Number(r.losses), draws: Number(r.draws), games: Number(r.games), rank: i + 1, you: r.player === me }));
  const shown = ranked.slice(0, ILIAC_BOARD_TOP);
  const mine = ranked.find((r) => r.you) ?? null;
  const pinned = mine && !shown.includes(mine) ? mine : null;
  const names = await boardNamesOf(ctx, [...shown, pinned].filter(Boolean).map((r) => r.player).concat(champion ? [champion] : []), env, nowS, { iliac: (row) => ({ champion: champion === row.id }) });
  const named = (r) => (r ? { ...r, ...(names.get(r.player) ?? { name: '?', title: null, glyphs: [] }) } : null);
  return {
    ok: true,
    season: { n: season, day: arenaSeasonDay(nowS), ends: arenaSeasonEndsS(season) },
    rows: shown.map(named), pinned: named(pinned), total: ranked.length,
    champion: champion ? { player: champion, name: names.get(champion)?.name ?? '?' } : null,
    titleNeeds: { games: ILIAC_CHAMPION_MIN_GAMES, foes: ILIAC_CHAMPION_MIN_FOES },
    me: me ? { ...(await iliacRatingOf(ctx, me, season)), champion: champion === me } : null,
  };
}
export async function withIliacHonoursAll(ctx, rows, nowS) {
  if (!rows.some((r) => r?.handle)) return rows;
  const champion = await championNow(ctx, nowS);
  return rows.map((r) => (r?.handle ? { ...r, iliac: { champion: champion === r.id } } : r));
}
