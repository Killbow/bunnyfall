// @ts-check
// A reaction time always carries network delay, so it can flag a player but never prove botting.
import { openStaffFeed, REACT_FEED_V } from '../../server/src/staffFeedLaw.js';
import { gatePublicKey } from './signing.js';
import { findAccount } from './sanctions.js';
import { displayName } from './accounts.js';

export const REACTION_FEED_PATH = '/v1/mod/reaction-feed';
export const REACTION_ROUTES = Object.freeze(['/v1/staff/reactions', '/v1/staff/reactions/keep']);
export const REACT_KEEP_S = 14 * 86400;
export const REACT_EVIDENCE_S = 90 * 86400;
// Keep this below what the hourly reactions sweep deletes: SWEEP_ROWS times the per-job statement share in cron.js.
export const REACT_ROWS_HOUR = 20_000;
export const REACT_PATTERN = 5;
export const REACT_POP_S = 24 * 3600;
export const REACT_POP_MAX = 20_000;
export const REACT_POP_CACHE_S = 10 * 60;
export const REACT_PAGE = 25;
const TIMES = Object.freeze(['p1', 'wd', 'ac', 'hk', 'hu']);
const SUM_COLS = Object.freeze(['n', 'members', 'span_ms', 'poses', ...TIMES.flatMap((k) => [k, `${k}_n`]), 'dd_n', 'drawn', 'struck', 'mv', 'tn']);
const SUMS_SQL = SUM_COLS.map((c) => `COALESCE(SUM(${c}), 0) AS ${c}`).join(', ');

/** @param {any} r */
export function episodeRow(r) {
  /** @type {Record<string, number>} */
  const row = { n: 1, members: r.n, span_ms: r.ms, poses: r.ps, dd_n: r.dd === undefined ? 0 : 1, drawn: r.w0, mv: r.mv, tn: r.tn };
  for (const k of TIMES) { row[k] = r[k] ?? 0; row[`${k}_n`] = r[k] === undefined ? 0 : 1; }
  row.struck = r.hu !== undefined && (r.ac === undefined || r.hu < r.ac) ? 1 : 0;
  return row;
}

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto }} ctx @param {any} env @param {Uint8Array} bytes
 * @param {unknown} sig */
export async function takeReactionFeed({ db, nowS, subtle }, env, bytes, sig) {
  const opened = await openStaffFeed(REACT_FEED_V, bytes, sig, await gatePublicKey(env, subtle), { subtle, nowMs: nowS * 1000 });
  if ('error' in opened) return opened;
  const b = opened.batch;
  const hour = nowS - (nowS % 3600);
  const seen = await db.prepare("SELECT (SELECT 1 FROM reaction_batches WHERE id = ?1) AS kept, (SELECT count FROM rate_limits WHERE key = 'react-rows' AND window_start >= ?2) AS count")
    .bind(b.id, hour).first();
  if (seen?.kept) return { ok: true, read: false, rows: 0 };
  const rolled = Number(seen?.count ?? 0) + b.rows.length > REACT_ROWS_HOUR;
  const cols = ['id', 'sub', 'at', 'kind', ...SUM_COLS];
  const marks = cols.map((_, i) => `?${i + 1}`).join(', ');
  const writes = b.rows.map((/** @type {any} */ r, /** @type {number} */ i) => {
    const row = episodeRow(r);
    const at = Math.floor(r.t / 1000);
    const id = rolled ? `h:${r.a}:${at - (at % 3600)}` : `${b.id}:${i}`;
    return db.prepare(`INSERT INTO encounter_reactions (${cols.join(', ')}) VALUES (${marks})
      ON CONFLICT(id) DO UPDATE SET ${SUM_COLS.map((c) => `${c} = ${c} + excluded.${c}`).join(', ')}`)
      .bind(id, r.a, at, r.k, ...SUM_COLS.map((c) => row[c]));
  });
  // The batch id, its rows, and the hour's count land in one batch, so a failed write never marks a batch as kept.
  await db.batch([
    // A plain insert, so a second copy of the batch fails whole and its resend reads it as kept.
    db.prepare('INSERT INTO reaction_batches (id, at) VALUES (?1, ?2)').bind(b.id, nowS),
    db.prepare(`INSERT INTO rate_limits (key, window_start, count) VALUES ('react-rows', ?1, ?2)
      ON CONFLICT(key) DO UPDATE SET count = CASE WHEN rate_limits.window_start >= excluded.window_start THEN rate_limits.count + excluded.count ELSE excluded.count END,
        window_start = MAX(rate_limits.window_start, excluded.window_start)`).bind(hour, b.rows.length),
    ...writes,
  ]);
  return { ok: true, read: true, rows: writes.length };
}

/** @param {any} s */
export function reactionSummary(s) {
  const n = Number(s.n) || 0;
  const mean = (/** @type {string} */ k) => (s[`${k}_n`] > 0 ? Math.round(s[k] / s[`${k}_n`]) : null);
  const share = (/** @type {number} */ x) => (n ? Math.round((1000 * x) / n) / 1000 : null);
  return {
    episodes: n, members: n ? Math.round((10 * s.members) / n) / 10 : null,
    firstPoseMs: mean('p1'), drawMs: mean('wd'), actMs: mean('ac'), blowMs: mean('hk'), takenMs: mean('hu'),
    acted: share(s.ac_n), landed: share(s.hk_n), struckFirst: share(s.struck), drawnAtAsk: share(s.drawn), died: share(s.dd_n),
    movedM: n ? Math.round(s.mv / n) / 10 : null, turnedDeg: n ? Math.round((s.tn / n / 100) * (180 / Math.PI)) : null,
  };
}

let popCache = /** @type {{ at: number, value: any }|null} */ (null);
export const _resetReactionsForTests = () => { popCache = null; };

/** @param {any} db @param {number} nowS */
async function population(db, nowS) {
  if (popCache && nowS - popCache.at < REACT_POP_CACHE_S) return popCache.value;
  const sums = await db.prepare(`SELECT ${SUMS_SQL}, COUNT(DISTINCT sub) AS players FROM (SELECT * FROM encounter_reactions WHERE at > ?1 ORDER BY at DESC LIMIT ?2)`)
    .bind(nowS - REACT_POP_S, REACT_POP_MAX).first();
  const value = { ...reactionSummary(sums ?? {}), players: Number(sums?.players ?? 0), sinceS: REACT_POP_S, asOf: nowS };
  popCache = { at: nowS, value };
  return value;
}

/** @param {any} r */
const episodeOf = (r) => ({ id: r.rid, at: r.at, kind: r.kind, ...reactionSummary(r), keptUntil: r.keep_until ?? null });

/** @param {any} ctx @param {any} env @param {string} path @param {any} body
 * @param {{ player: any, role: string }} who
 * @param {(act: string, target?: string|null, detail?: object|null, how?: object) => any} audit */
export async function staffReactions(ctx, env, path, body, who, audit) {
  if (who.role !== 'admin') { await audit('refused', null, { path, need: 'admin' }, { outcome: 'denied' }).run(); return { error: 'staff-admin' }; }
  if (!REACTION_ROUTES.includes(path)) return { error: 'not-found' };
  const { db, nowS } = ctx;
  const row = await findAccount(db, { target: body.target, name: body.name });
  if ('error' in row) return row;
  const name = displayName(row);
  if (path === '/v1/staff/reactions/keep') {
    const keep = body.keep === true;
    const until = keep ? nowS + REACT_EVIDENCE_S : null;
    const r = await db.prepare('UPDATE encounter_reactions SET keep_until = ?1 WHERE sub = ?2').bind(until, row.id).run();
    const rows = Number(r?.meta?.changes ?? 0);
    await audit('reactions-keep', row.id, { name, keep, rows }).run();
    return { ok: true, rows, keptUntil: until };
  }
  const before = Number.isSafeInteger(body.before) && body.before > 0 ? body.before : Number.MAX_SAFE_INTEGER;
  const since = nowS - REACT_KEEP_S;
  const [mine, recent, play, page, pop] = await Promise.all([
    db.prepare(`SELECT ${SUMS_SQL} FROM encounter_reactions WHERE sub = ?1`).bind(row.id).first(),
    db.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM encounter_reactions WHERE sub = ?1 AND at > ?2').bind(row.id, since).first(),
    db.prepare("SELECT COALESCE(SUM(amount), 0) AS renown, COALESCE(SUM(played_s), 0) AS played FROM progress_hours WHERE player = ?1 AND stream = 'renown' AND hour > ?2").bind(row.id, since).first(),
    db.prepare('SELECT rowid AS rid, * FROM encounter_reactions WHERE sub = ?1 AND rowid < ?2 ORDER BY rowid DESC LIMIT ?3').bind(row.id, before, REACT_PAGE + 1).all(),
    population(db, nowS),
    audit('reactions-read', row.id, { name }, { onceIn: 10 * 60 }).run(),
  ]);
  const episodes = (page?.results ?? []).slice(0, REACT_PAGE).map(episodeOf);
  const hours = Number(play?.played ?? 0) / 3600;
  const player = reactionSummary(mine ?? {});
  return {
    sub: row.id, name, player, population: pop, pattern: player.episodes >= REACT_PATTERN,
    perHour: { days: REACT_KEEP_S / 86400, playedH: Math.round(hours * 10) / 10, encounters: Number(recent?.n ?? 0), renown: Number(play?.renown ?? 0),
      encountersPerH: hours > 0 ? Math.round((10 * Number(recent?.n ?? 0)) / hours) / 10 : null, renownPerH: hours > 0 ? Math.round(Number(play?.renown ?? 0) / hours) : null },
    episodes, next: (page?.results?.length ?? 0) > REACT_PAGE ? episodes[episodes.length - 1].id : null,
  };
}
