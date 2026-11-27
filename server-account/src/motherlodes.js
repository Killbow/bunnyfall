// @ts-check
import { mintId, overRate } from './accounts.js';
import { marksOpenFor, balanceOf } from './marks.js';
import { gatePublicKey } from './signing.js';
import { profAsks, profShut, profDice, trackRow, trackView, profTodayOf, storeOf, carriedOf, clampStatements } from './professions.js';
import { CARRIED_MAX, heldOk, seenOk } from '../../src/net/bagLaw.js';
import { MARKS_MAX, utcDay } from '../../src/net/marksLaw.js';
import {
  STORES_MAX, PROF_OPS_MAX, PROF_OPS_WINDOW_S, HARVEST_LATE_S, HARVEST_EARLY_S, PROF_XP_MAX, rankOfXp, harvestXp, glintsMax,
} from '../../src/net/professionLaw.js';
import { WITNESS, witnessedFact, factConfirmed } from '../../src/net/nodeLaw.js';
import { verifyWatchReceipt } from '../../src/net/watchReceipt.js';
import {
  MOTHERLODE_STRIKERS, MOTHERLODE_SILVER, MOTHERLODE_RANK, MOTHERLODE_TIER,
  motherlodeSites, motherlodeOpen, motherlodeYield, parseMotherlodeKey, motherlodeKey, motherlodeWatchOk,
} from '../../src/net/motherlodeLaw.js';

export const motherlodeRid = (day) => `motherlode:${day}`;
export const isMotherlodeNode = (node) => typeof node === 'string' && node.startsWith('mlode:');

const rowView = (r) => ({
  k: Number(r.k), key: motherlodeKey(Number(r.day), Number(r.k)), x: Number(r.x), y: Number(r.y), climate: Number(r.climate), region: Number(r.region),
  material: r.material, opensAt: Number(r.opens_at), closesAt: Number(r.closes_at),
});

const markStmt = (/** @type {any} */ db, /** @type {number} */ day) => db.prepare('SELECT 1 FROM motherlode_days WHERE day = ?1').bind(day);
const keptStmt = (/** @type {any} */ db, /** @type {number} */ day) => db.prepare('SELECT * FROM motherlodes WHERE day = ?1 ORDER BY k').bind(day);

/** @param {{ db: any, primary?: any, rand?: () => number }} ctx */
export async function motherlodesOf({ db: read, primary = read, rand }, day) {
  const keptOf = async (/** @type {any} */ db) => ((await keptStmt(db, day).all())?.results ?? []).map(rowView);
  const marked = async (/** @type {any} */ db) => !!(await markStmt(db, day).first());
  if (await marked(read)) return keptOf(read);
  // An unpicked day is picked on the primary, since a replica that missed a late confirmation would keep a wrong
  // pick all day.
  const db = primary;
  if (db !== read && await marked(db)) return keptOf(db);
  const before = day * 86400;
  const { results = [] } = await db.prepare(`SELECT key, account, report, at FROM world_witness
    WHERE kind = 'pixel' AND at < ?1 AND key IN (SELECT key FROM world_witness WHERE kind = 'pixel' AND at < ?1
      GROUP BY key, report HAVING COUNT(DISTINCT account) >= ?2)`).bind(before, WITNESS.confirm).all();
  const rowsBy = new Map();
  for (const r of results) { const a = rowsBy.get(r.key) ?? []; a.push({ account: r.account, report: r.report, at: Number(r.at) }); rowsBy.set(r.key, a); }
  const candidates = [];
  for (const [key, rows] of rowsBy) {
    const f = witnessedFact(rows);
    if (!factConfirmed(f)) continue;
    const [x, y] = String(key).split(',').map(Number);
    candidates.push({ x, y, climate: /** @type {number} */ (f.climate), region: /** @type {number} */ (f.region) });
  }
  const sites = motherlodeSites(day, candidates);
  const n = mintId(rand);
  // Picks are written only under the mark this read made, so two racing first reads never keep a mix of two picks.
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO motherlode_days (day, picked, n) VALUES (?1, ?2, ?3)').bind(day, sites.length, n),
    ...sites.map((s) => db.prepare(`INSERT OR IGNORE INTO motherlodes (day, k, x, y, climate, region, material, opens_at, closes_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9 WHERE EXISTS (SELECT 1 FROM motherlode_days WHERE day = ?1 AND n = ?10)`)
      .bind(day, s.k, s.x, s.y, s.climate, s.region, s.material, s.opensAt, s.closesAt, n)),
  ]);
  return keptOf(db);
}

export async function motherlodesRead(ctx, player, env, { character } = {}) {
  const { db, nowS } = ctx;
  const refused = profAsks(player, { character, needRid: false }) ?? profShut(player, env);
  if (refused) return refused;
  const day = utcDay(nowS);
  const [mark, kept, counts, found] = await db.batch([
    markStmt(db, day),
    keptStmt(db, day),
    db.prepare('SELECT k, COUNT(*) AS n FROM motherlode_strikes WHERE day = ?1 GROUP BY k').bind(day),
    db.prepare('SELECT k FROM motherlode_strikes WHERE day = ?1 AND player = ?2').bind(day, player.id),
  ]);
  const lodes = mark.results?.length ? (kept.results ?? []).map(rowView) : await motherlodesOf(ctx, day);
  const struck = new Map((counts.results ?? []).map((c) => [Number(c.k), Number(c.n)]));
  const mine = found.results?.[0];
  return {
    day, now: nowS, strikers: MOTHERLODE_STRIKERS, rank: MOTHERLODE_RANK, silver: MOTHERLODE_SILVER,
    lodes: lodes.map((l) => ({ ...l, struck: struck.get(l.k) ?? 0 })),
    found: mine ? motherlodeKey(day, Number(mine.k)) : null,
  };
}

async function strikeMarks(db, player, env, row, line) {
  if (!marksOpenFor(player, env)) return {};
  const balance = await balanceOf(db, row.player);
  if (line) return { marks: { struck: Number(line.amount), balance } };
  return balance + MOTHERLODE_SILVER > MARKS_MAX ? { marks: { struck: 0, balance, why: 'full' } } : {};
}
async function strikeAnswer({ db }, player, env, row, nowS, extra = {}, rankBefore = null) {
  const t = trackView(await trackRow(db, row.player, row.char_id, 'mining'), 'mining', nowS);
  const day = Number(row.day);
  const line = marksOpenFor(player, env) ? await db.prepare('SELECT amount FROM marks_ledger WHERE actor = ?1 AND rid = ?2').bind(row.player, motherlodeRid(day)).first() : null;
  const n = await db.prepare('SELECT COUNT(*) AS n FROM motherlode_strikes WHERE day = ?1 AND k = ?2').bind(day, Number(row.k)).first();
  return {
    ok: true, ...extra, ...(rankBefore === null ? {} : { rose: t.rank > rankBefore }), motherlode: true,
    node: motherlodeKey(day, Number(row.k)), kind: 'ore', material: row.material, qty: Number(row.qty), xp: Number(row.xp),
    track: t, today: (await profTodayOf(db, row.player, row.char_id, day)).mining ?? 0,
    store: await storeOf(db, row.player, row.char_id, row.material),
    ...(Number(row.carry) === 1 ? { carry: true, carried: await carriedOf(db, row.player, row.char_id, row.material) } : {}),
    ...(await strikeMarks(db, player, env, row, line)),
    lode: { struck: Number(n?.n ?? 0), strikers: MOTHERLODE_STRIKERS },
  };
}

export async function strikeMotherlode(ctx, player, env, body = {}) {
  const { db, nowS, rand, subtle } = ctx;
  const { character, node, kind, act, at, rid, watch } = body ?? {};
  const refused = profAsks(player, { character, rid });
  const carry = body?.carry === true;
  const heldNow = carry && heldOk(body?.held) ? body.held : null;
  const T = carry ? 'prof_carried' : 'prof_stores';
  if (refused) return refused;
  const prior = await db.prepare('SELECT * FROM motherlode_strikes WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  // A strike already made is answered before the switch check, so a repeat always returns its strike.
  if (prior) return strikeAnswer(ctx, player, env, prior, nowS, { repeat: true });
  const closed = profShut(player, env);
  if (closed) return closed;
  const m = parseMotherlodeKey(node);
  if (!m || kind !== 'ore') return { error: 'bad-node' };
  const day = utcDay(nowS);
  if (m.day !== day) return { error: 'prof-day' };
  if (!Number.isSafeInteger(at) || at < nowS - HARVEST_LATE_S || at > nowS + HARVEST_EARLY_S || utcDay(at) !== day) return { error: 'prof-late' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const lode = (await motherlodesOf(ctx, day)).find((l) => l.k === m.k);
  if (!lode) return { error: 'bad-node' };
  // Opening is checked on the service clock too, since `at` may run HARVEST_EARLY_S ahead of it.
  if (!motherlodeOpen(lode, at) || nowS < lode.opensAt) return { error: 'motherlode-closed' };
  const key = await gatePublicKey(env, subtle);
  if (!key) return { error: 'no-gate-key' };
  const v = await verifyWatchReceipt(watch, key, { subtle, nowS });
  const c = v.ok ? v.claims : null;
  if (!c || c.s !== player.id || c.x !== lode.x || c.y !== lode.y || !motherlodeWatchOk(c.i, at)) return { error: 'motherlode-watch' };
  const track = await trackRow(db, player.id, character, 'mining');
  const rank = rankOfXp(Number(track?.xp ?? 0));
  if (rank < MOTHERLODE_RANK) return { error: 'prof-rank' };
  const most = glintsMax(MOTHERLODE_TIER);
  const glints = Number.isSafeInteger(act?.glints) ? Math.max(0, Math.min(most, act.glints)) : 0;
  const clean = act?.clean === true && glints === most;
  const qty = motherlodeYield(Math.floor(profDice(rand) * 3), clean);
  const xp = harvestXp(MOTHERLODE_TIER, rank, clean);
  const nonce = mintId(rand);
  const mine = 'player = ?1 AND rid = ?2 AND n = ?3';
  const stored = `COALESCE((SELECT SUM(qty) FROM ${T} WHERE player = ?1 AND char_id = ?4 AND material = l.material), 0)`;
  const silver = marksOpenFor(player, env);
  // One batch decides the strike: the insert checks the window, the strikers cap, Stores room, and the
  // (day, player) key. Every later write keys off its row and nonce.
  await db.batch([
    ...(heldNow != null && body?.heldKey === lode.material ? clampStatements(db, { player: player.id, character, material: lode.material, held: heldNow, rid,
      seen: seenOk(body?.seen) ? body.seen : null, twin: 'NOT EXISTS (SELECT 1 FROM motherlode_strikes WHERE player = ?1 AND rid = ?5)' }) : []),
    db.prepare(`INSERT OR IGNORE INTO motherlode_strikes (day, k, player, char_id, material, qty, xp, watch, at, rid, n, carry)
      SELECT ?5, ?6, ?1, ?4, l.material, MIN(?7, ?8 - ${stored}),
        MAX(0, MIN(?9, ?10 - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?4 AND profession = 'mining'), 0))), ?11, ?12, ?2, ?3, ?14
      FROM motherlodes l
      WHERE l.day = ?5 AND l.k = ?6 AND ?12 >= l.opens_at AND ?15 >= l.opens_at AND ?12 < l.closes_at
        AND (SELECT COUNT(*) FROM motherlode_strikes WHERE day = ?5 AND k = ?6) < ?13
        AND ?8 - ${stored} >= 1`)
      .bind(player.id, rid, nonce, character, day, m.k, qty, carry ? CARRIED_MAX : STORES_MAX, xp, PROF_XP_MAX, `${c.s}:${c.c}:${c.i}`, at, MOTHERLODE_STRIKERS, carry ? 1 : 0, nowS),
    db.prepare(`INSERT INTO ${T} (player, char_id, material, origin, qty)
      SELECT player, char_id, material, 'own', qty FROM motherlode_strikes WHERE ${mine}
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = ${T}.qty + excluded.qty`).bind(player.id, rid, nonce),
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT player, char_id, 'mining', MIN(?4, xp), ?5 FROM motherlode_strikes WHERE ${mine}
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MIN(?4, prof_tracks.xp + excluded.xp), updated_at = excluded.updated_at`)
      .bind(player.id, rid, nonce, PROF_XP_MAX, nowS),
    ...(silver ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'mint', NULL, 'account', ?1, 'motherlode', ?4, ?5, ?6, ?1, NULL, ?7
      WHERE EXISTS (SELECT 1 FROM motherlode_strikes WHERE ${mine})
        AND COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + ?4 <= ?8
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?7)`)
      .bind(player.id, rid, nonce, MOTHERLODE_SILVER, day, nowS, motherlodeRid(day), MARKS_MAX)] : []),
  ]);
  const made = await db.prepare('SELECT * FROM motherlode_strikes WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return strikeAnswer(ctx, player, env, made, nowS, {}, rank);
  if (made) return strikeAnswer(ctx, player, env, made, nowS, { repeat: true });
  if (await db.prepare('SELECT 1 FROM motherlode_strikes WHERE day = ?1 AND player = ?2').bind(day, player.id).first()) return { error: 'motherlode-found' };
  const n = await db.prepare('SELECT COUNT(*) AS n FROM motherlode_strikes WHERE day = ?1 AND k = ?2').bind(day, m.k).first();
  if (Number(n?.n ?? 0) >= MOTHERLODE_STRIKERS) return { error: 'motherlode-full' };
  return { error: carry ? 'carried-full' : 'stores-full', material: lode.material };
}
