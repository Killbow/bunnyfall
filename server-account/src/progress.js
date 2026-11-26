// @ts-check

import { DB_ROOT } from './service.js';
import { stepBudget } from './budget.js';
import { RAID_CLAIMS_DAY_MAX } from './raids.js';
import { RENOWN_XP_HOUR_MAX } from '../../src/net/renown.js';
import { WATCH_DAY_CAP, BOUNTY_CAMPS_DAY } from '../../src/net/townSeatLaw.js';
import { WATCH_TICK_MS } from '../../src/net/watchReceipt.js';
import { TIDE_EFFECTS } from '../../src/net/tideLaw.js';
import { writXp } from '../../src/net/professionLaw.js';

// Must match GAME_DAY_REAL_HOURS in src/worldEvents/raidingParties.js.
const RAID_GAME_DAY_HOURS = 2;

export const PROGRESS_LINE = Object.freeze({
  enforce: false,
  streams: Object.freeze({
    renown: Object.freeze({ rate: RENOWN_XP_HOUR_MAX, cap: RENOWN_XP_HOUR_MAX }),
    raid: Object.freeze({ rate: RAID_CLAIMS_DAY_MAX / RAID_GAME_DAY_HOURS, cap: RAID_CLAIMS_DAY_MAX }),
    bounty: Object.freeze({ rate: BOUNTY_CAMPS_DAY, cap: BOUNTY_CAMPS_DAY }),
    camp: Object.freeze({ rate: TIDE_EFFECTS.orcsCampsDay, cap: TIDE_EFFECTS.orcsCampsDay }),
    watch: Object.freeze({ rate: 3_600_000 / WATCH_TICK_MS, cap: WATCH_DAY_CAP }),
    find: Object.freeze({ rate: 20, cap: 20 }),
    gather: Object.freeze({ rate: 30, cap: 30 }),
    prof: Object.freeze({ rate: 10_000, cap: 20_000 }),
  }),
});
export const PROGRESS_STREAMS = Object.freeze(Object.keys(PROGRESS_LINE.streams));

export const PROGRESS_ROUTES = Object.freeze({
  '/v1/renown/xp': Object.freeze(['renown', true]),
  '/v1/raid/claim': Object.freeze(['raid', true]),
  '/v1/seats/bounty': Object.freeze(['bounty', true]),
  '/v1/hunt/clear': Object.freeze(['bounty', true]),
  '/v1/seats/orc-camp': Object.freeze(['camp', true]),
  '/v1/seats/watch': Object.freeze(['watch', true]),
  '/v1/towns/watch': Object.freeze(['watch', false]),
  '/v1/marks/find': Object.freeze(['find', false]),
  '/v1/prof/harvest': Object.freeze(['prof', true]),
  '/v1/prof/smelt': Object.freeze(['prof', true]),
  '/v1/prof/craft': Object.freeze(['prof', true]),
  '/v1/prof/make': Object.freeze(['prof', true]),
  '/v1/prov/make': Object.freeze(['prof', true]),
  '/v1/prov/prepare': Object.freeze(['prof', true]),
  '/v1/prof/brew': Object.freeze(['prof', true]),
  '/v1/prof/disenchant': Object.freeze(['prof', true]),
  '/v1/prof/temper': Object.freeze(['prof', true]),
  '/v1/prof/salvage': Object.freeze(['prof', true]),
  '/v1/prof/upgrade': Object.freeze(['prof', true]),
  '/v1/prof/master': Object.freeze(['prof', true]),
  '/v1/writs/deliver': Object.freeze(['prof', true]),
  '/v1/writs/craft': Object.freeze(['prof', true]),
});

const validLine = (/** @type {any} */ l) => !!l && typeof l === 'object' && Number.isSafeInteger(l.rate) && l.rate >= 0 && Number.isSafeInteger(l.cap) && l.cap >= 0;
export function progressConfigOf(/** @type {unknown} */ v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const c = /** @type {any} */ (v);
  if (typeof c.enforce !== 'boolean' || !c.streams || typeof c.streams !== 'object' || Array.isArray(c.streams)) return null;
  const keys = Object.keys(c.streams);
  if (keys.length !== PROGRESS_STREAMS.length || !PROGRESS_STREAMS.every((k) => validLine(c.streams[k]))) return null;
  return { enforce: c.enforce, streams: Object.fromEntries(PROGRESS_STREAMS.map((k) => [k, { rate: c.streams[k].rate, cap: c.streams[k].cap }])) };
}
export const PROGRESS_CONFIG_KEEP_MS = 60_000;
/** @type {WeakMap<object, { at: number, config: any }>} */
const kept = new WeakMap();
const keyOf = (/** @type {any} */ db) => (db && typeof db === 'object' ? db[DB_ROOT] ?? db : null);
export async function progressConfig(/** @type {any} */ db) {
  const key = keyOf(db);
  const k = key ? kept.get(key) : null;
  if (k && Date.now() - k.at < PROGRESS_CONFIG_KEEP_MS) return k.config;
  const row = await db.prepare("SELECT value FROM realm_config WHERE key = 'progress'").first();
  let c = null;
  try { c = progressConfigOf(JSON.parse(row?.value ?? 'null')); } catch { c = null; }
  const config = c ?? PROGRESS_LINE;
  if (key) kept.set(key, { at: Date.now(), config });
  return config;
}
export const forgetProgressConfig = (/** @type {any} */ db) => { const key = keyOf(db); if (key) kept.delete(key); };

/** @param {any} db @param {string} playerId @param {{ named: boolean, character?: unknown }} claim */
export async function progressRefusal(db, playerId, claim) {
  return seatRefusalOf(await seatRead(db, playerId).first(), claim);
}
const seatRead = (/** @type {any} */ db, /** @type {string} */ playerId) =>
  db.prepare(`SELECT id, held FROM realm_characters WHERE ${SEAT_WHERE}`).bind(playerId);
export const SEAT_WHERE = 'player = ?1 AND lease IS NOT NULL AND dead_at IS NULL';
export function seatRefusalOf(/** @type {any} */ row, /** @type {{ named: boolean, character?: unknown }} */ { named, character }) {
  if (!row || (named && character !== row.id)) return { error: 'progress-seat' };
  if (row.held) return { error: 'trade-held', held: row.held };
  return null;
}

async function bucketOf(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {string} */ stream) {
  return bucketFrom(await bucketRead(db, playerId, stream).first());
}
const bucketRead = (/** @type {any} */ db, /** @type {string} */ playerId, /** @type {string} */ stream) =>
  db.prepare('SELECT p.played_s AS now, b.allowance, b.played_at FROM players p LEFT JOIN progress_play b ON b.player = p.id AND b.stream = ?2 WHERE p.id = ?1')
    .bind(playerId, stream);
export function bucketFrom(/** @type {any} */ row) {
  if (!row) return null;
  return { now: Number(row.now) || 0, allowance: row.allowance == null ? null : Number(row.allowance), playedAt: row.played_at == null ? null : Number(row.played_at) };
}
const playedSince = (/** @type {{ now: number, playedAt: number | null }} */ b) => (b.playedAt == null ? 0 : Math.max(0, b.now - b.playedAt));

export async function progressRoom(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {string} */ stream, /** @type {any} */ config, /** @type {any} */ bucket = undefined) {
  const b = bucket !== undefined ? bucket : await bucketOf(db, playerId, stream);
  if (!b) return 0;
  return stepBudget({ allowance: b.allowance, played: playedSince(b), gain: 0, band: config.streams[stream] }).allowance;
}

/** @param {any} db @param {string} playerId @param {string} stream @param {number} amount @param {number} nowS
 * @param {any} config */
export async function spendProgress(db, playerId, stream, amount, nowS, config) {
  const line = config.streams[stream];
  if (!line || !Number.isFinite(amount) || amount <= 0) return null;
  const hour = nowS - (nowS % 3600);
  const args = [playerId, stream, nowS, line.cap, line.rate, Math.trunc(amount), config.enforce ? 1 : 0, hour];
  // Both statements step the bucket from the row as it stands, with no read first: a batch is one
  // transaction, so an overlapping claim never erases this debit.
  const [, play] = await db.batch([
    db.prepare(`INSERT INTO progress_hours (player, stream, hour, amount, played_s, over, claims)
      SELECT ?1, ?2, ?8, ?6, s.played, CASE WHEN s.left < 0 THEN -s.left ELSE 0 END, 1 FROM (${BUCKET_STEP_SQL}) s WHERE true
      ON CONFLICT (player, stream, hour) DO UPDATE SET amount = amount + excluded.amount, played_s = played_s + excluded.played_s,
        over = over + excluded.over, claims = claims + 1`).bind(...args),
    db.prepare(`INSERT INTO progress_play (player, stream, allowance, played_at, at)
      SELECT ?1, ?2, CASE WHEN ?7 THEN s.left ELSE MAX(0, s.left) END, s.now, ?3 FROM (${BUCKET_STEP_SQL}) s WHERE true
      ON CONFLICT (player, stream) DO UPDATE SET allowance = excluded.allowance, played_at = excluded.played_at, at = excluded.at
      RETURNING allowance`).bind(...args.slice(0, 7)),
  ]);
  const row = play?.results?.[0];
  return row ? { allowance: Number(row.allowance) } : null;
}
// This is stepBudget from budget.js written in SQL; change both together.
const BUCKET_STEP_SQL = `SELECT t.now, t.played, (CASE WHEN t.start >= ?4 THEN t.start ELSE MIN(?4, t.start + CAST((?5 * t.played) / 3600.0 AS INTEGER)) END) - MAX(0, ?6) AS left
  FROM (SELECT COALESCE(p.played_s, 0) AS now, CASE WHEN b.played_at IS NULL THEN 0 ELSE MAX(0, COALESCE(p.played_s, 0) - b.played_at) END AS played, COALESCE(b.allowance, ?4) AS start
    FROM players p LEFT JOIN progress_play b ON b.player = p.id AND b.stream = ?2 WHERE p.id = ?1) t`;

/** @param {string} path @param {any} a @returns {Array<[string, number]>} */
export function progressSpentOf(path, a) {
  if (!a || typeof a !== 'object' || a.error || a.repeat) return [];
  const n = (/** @type {unknown} */ v) => (Number.isFinite(v) && /** @type {number} */ (v) > 0 ? Math.trunc(/** @type {number} */ (v)) : 0);
  /** @type {Array<[string, number]>} */
  const out = [];
  const add = (/** @type {string} */ stream, /** @type {number} */ amount) => { if (amount > 0) out.push([stream, amount]); };
  switch (path) {
    case '/v1/renown/xp': add('renown', n(a.credited)); break;
    case '/v1/raid/claim': if (a.recorded === true) { add('raid', 1); add('renown', n(a.renown?.credited)); } break;
    case '/v1/star/claim': if (a.recorded === true) add('renown', n(a.renown?.credited)); break;
    case '/v1/seats/bounty': if (n(a.paid)) add('bounty', 1); break;
    case '/v1/hunt/clear': if (a.recorded === true) add('bounty', 1); break;
    case '/v1/seats/orc-camp': if (a.counted === true) add('camp', 1); break;
    case '/v1/seats/watch': add('watch', n(a.counted)); break;
    case '/v1/towns/watch': break;
    case '/v1/marks/find': if (n(a.struck)) add('find', 1); break;
    case '/v1/writs/deliver': if (a.ok) { add('prof', writXp(n(a.pay))); add('renown', n(a.renown?.credited)); } break;
    case '/v1/writs/craft': if (a.ok) { add('prof', n(a.xp)); add('renown', n(a.renown?.credited)); } break;
    default:
      if (path in PROGRESS_ROUTES) {
        add('prof', n(a.xp));
        if (path === '/v1/prof/harvest' && n(a.marks?.struck)) add('gather', 1);
      }
  }
  return out;
}

export async function progressSpent(/** @type {any} */ ctx, /** @type {string} */ playerId, /** @type {string} */ path, /** @type {any} */ answer) {
  const spent = progressSpentOf(path, answer);
  if (!spent.length) return;
  const config = await progressConfig(ctx.db);
  for (const [stream, amount] of spent) await spendProgress(ctx.db, playerId, stream, amount, ctx.nowS, config);
}
