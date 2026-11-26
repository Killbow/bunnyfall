// @ts-check
import { openGrantMeasure, GRANT_RELAY_READER } from '../../src/net/grantMeasure.js';
import { GRANT_KINDS, GRANT_CELL_CEILING, GRANT_CASE_REASONS } from '../../src/net/grantLaw.js';
import { gatePublicKey } from './signing.js';
import { credibleReporter } from './safety.js';

export const GRANT_FEED_PATH = '/v1/mod/grant-feed';
export const GRANT_RATE_SPAN_MIN_S = 600;
export const GRANT_CASE_READERS = 3;
export const GRANT_CASE_WINDOW_S = 10 * 60;
export const GRANT_CASE_SENDERS_MAX = 32;
export const GRANT_CASE_TAB = 'grant';
export const GRANT_ASK_CASE_TIMES = 4;
export const GRANT_ASK_CASE_OVER_MIN = 16;
export const GRANT_OWN_CASES_HOUR = 30;

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => void }} ctx @param {any} env
 * @param {Uint8Array} bytes @param {unknown} sig */
export async function takeGrantMeasure({ db, nowS, subtle, rand }, env, bytes, sig) {
  const opened = await openGrantMeasure(bytes, sig, await gatePublicKey(env, subtle), { subtle, nowMs: nowS * 1000 });
  if ('error' in opened) return opened;
  const b = opened.batch;
  const span = Math.max(1, Math.round((b.at - b.from) / 1000));
  const kept = await db.prepare('INSERT OR IGNORE INTO grant_batches (id, at, q, span_s, live) VALUES (?1, ?2, ?3, ?4, ?5)').bind(b.id, nowS, b.q, span, b.live).run();
  if (!kept?.meta?.changes) return { ok: true, read: false };
  const writes = [
    ...b.rows.map((/** @type {any} */ r) => db.prepare('INSERT INTO grant_rows (batch, at, sub, kind, asks, members, bucket, ceiling, span_s) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
      .bind(b.id, nowS, r.a, r.k, r.asks, r.members, r.bucket, r.ceiling, span)),
    ...b.tl.map((/** @type {any} */ t) => db.prepare('INSERT INTO grant_tallies (batch, at, reader, sender, reason, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(b.id, nowS, t.a, t.b, t.r, t.n)),
  ];
  if (writes.length) await db.batch(writes);
  const ctx = { db, nowS, rand };
  /** @type {Map<string, { texts: string[], readers: boolean }>} */
  const found = new Map();
  const add = (/** @type {string} */ s, /** @type {string} */ text, readers = false) => { const f = found.get(s) ?? { texts: [], readers: false }; f.texts.push(text); f.readers ||= readers; found.set(s, f); };
  const senders = [...new Set(b.tl.filter((/** @type {any} */ t) => GRANT_CASE_REASONS.includes(t.r) && t.a !== GRANT_RELAY_READER).map((/** @type {any} */ t) => String(t.b)))];
  for (const [s, text] of senders.length ? await grantCases(ctx, env, senders) : []) add(s, text, true);
  for (const t of b.tl) if (t.a === GRANT_RELAY_READER && GRANT_CASE_REASONS.includes(t.r)) add(String(t.b), grantRelayText(t));
  for (const r of b.rows) { const text = grantAskText(r, span); if (text) add(String(r.a), text); }
  const cases = found.size ? await grantCaseLines(ctx, env, found) : 0;
  return { ok: true, read: true, ...(cases ? { cases } : {}) };
}

const grantRelayText = (/** @type {any} */ t) => `the relay itself dropped ${t.n} of this account's foes no builder could give${t.e ? ` - the worst a type ${t.e.t} at ${Math.round(t.e.k)} health, its most ${Math.round(t.e.mx)}` : ''} (Spawn-Grants FOE-BOUNDS)`;
/** @param {any} r @param {number} span */
export function grantAskText(r, span) {
  const law = GRANT_KINDS[/** @type {keyof typeof GRANT_KINDS} */ (r?.k)];
  if (!law || !Number.isFinite(r.asks)) return null;
  // This counts asks, not bucket refusals: the cell ceiling is checked first, so a flood that fills
  // the cell shows up as ceiling refusals instead.
  const allow = Math.ceil(law.cap + law.rate * Math.max(span, GRANT_RATE_SPAN_MIN_S));
  if (r.asks < GRANT_ASK_CASE_TIMES * allow || r.asks - allow < GRANT_ASK_CASE_OVER_MIN) return null;
  return `the relay's own count: this account asked ${r.asks} ${r.k} grants in ${Math.round(Math.max(span, 60) / 60)} minutes, ${Math.floor(r.asks / allow)} times the most its budget lets honest play ask (${allow}) (Spawn-Grants GRANT-ASKS)`;
}

/** @param {{ db: any, nowS: number, rand: (b: Uint8Array) => void }} ctx @param {any} env
 * @param {string[]} senders */
export async function grantCases(ctx, env, senders) {
  const { db, nowS } = ctx;
  const since = nowS - GRANT_CASE_WINDOW_S;
  const inReasons = GRANT_CASE_REASONS.map((_, k) => `?${k + 3}`).join(', ');
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const sender of senders.slice(0, GRANT_CASE_SENDERS_MAX)) {
    const rows = (await db.prepare(`SELECT reader, reason, SUM(n) AS n FROM grant_tallies WHERE sender = ?1 AND at > ?2 AND reason IN (${inReasons}) GROUP BY reader, reason`)
      .bind(sender, since, ...GRANT_CASE_REASONS).all())?.results ?? [];
    const readers = [...new Set(rows.map((/** @type {any} */ r) => String(r.reader)))].filter((r) => r !== sender && r !== GRANT_RELAY_READER);
    if (readers.length < GRANT_CASE_READERS) continue;
    const counted = [];
    for (const id of readers) {
      const p = await db.prepare('SELECT * FROM players WHERE id = ?1').bind(id).first();
      if (p && credibleReporter(p, nowS)) counted.push(id);
    }
    if (counted.length < GRANT_CASE_READERS) continue;
    const why = new Map();
    for (const r of rows) if (counted.includes(String(r.reader))) why.set(String(r.reason), (why.get(String(r.reason)) ?? 0) + Number(r.n));
    const foes = [...why.values()].reduce((a, n) => a + n, 0);
    out.set(sender, `${counted.length} players' games refused ${foes} of this account's foes in ${GRANT_CASE_WINDOW_S / 60} minutes: ${[...why].map(([r, n]) => `${r} ${n}`).join(', ')} (Spawn-Grants GRANT7)`);
  }
  return out;
}

/** @param {{ db: any, nowS: number, rand: (b: Uint8Array) => void }} ctx @param {any} env
 * @param {Map<string, { texts: string[], readers: boolean }>} found */
export async function grantCaseLines(ctx, env, found) {
  // Spawn-count findings open no moderation case; staff read them on the Monster reports page.
  void ctx; void env; void found;
  return 0;
}

/** @param {any} db @param {number} nowS @param {number} days
 * @param {(n: number, at: (rank: number) => Promise<any>) => Promise<{ quantiles: any[], most: any }>} ranked */
export async function grantsMeasure(db, nowS, days, ranked) {
  const since = nowS - days * 24 * 3600;
  const rate = `CAST(ROUND(asks * 3600.0 / MAX(span_s, ${GRANT_RATE_SPAN_MIN_S})) AS INTEGER)`;
  const kinds = [];
  for (const kind of Object.keys(GRANT_KINDS)) {
    const sums = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(asks), 0) AS asks, COALESCE(SUM(members), 0) AS members, COALESCE(SUM(bucket), 0) AS bucket, COALESCE(SUM(ceiling), 0) AS ceiling FROM grant_rows WHERE at >= ?1 AND kind = ?2')
      .bind(since, kind).first();
    const n = Number(sums?.n ?? 0);
    const at = async (/** @type {number} */ rank) => (await db.prepare(`SELECT ${rate} AS r FROM grant_rows WHERE at >= ?1 AND kind = ?2 ORDER BY r LIMIT 1 OFFSET ?3`).bind(since, kind, rank).first())?.r ?? null;
    const { quantiles, most } = await ranked(n, at);
    const top = quantiles.at(-1)?.[1] ?? null;
    const standing = GRANT_KINDS[/** @type {keyof typeof GRANT_KINDS} */ (kind)];
    kinds.push({ kind, windows: n, asks: Number(sums?.asks ?? 0), members: Number(sums?.members ?? 0), bucket: Number(sums?.bucket ?? 0), ceiling: Number(sums?.ceiling ?? 0), perHour: { quantiles, most },
      rate: { standing: standing.rate, suggested: grantRateSuggested(top) } });
  }
  const cellsN = Number((await db.prepare('SELECT COUNT(*) AS n FROM grant_batches WHERE at >= ?1').bind(since).first())?.n ?? 0);
  const live = await ranked(cellsN, async (rank) => (await db.prepare('SELECT live AS r FROM grant_batches WHERE at >= ?1 ORDER BY live LIMIT 1 OFFSET ?2').bind(since, rank).first())?.r ?? null);
  return { days, kinds, cells: { windows: cellsN, live, ceiling: GRANT_CELL_CEILING, suggested: grantCeilingSuggested(live.most) } };
}

export const GRANT_SUGGEST_ROOM = 1.5;
export const grantRateSuggested = (/** @type {number|null} */ perHour) => (Number.isFinite(perHour) && /** @type {number} */ (perHour) > 0 ? (/** @type {number} */ (perHour) * GRANT_SUGGEST_ROOM) / 3600 : null);
export const grantCeilingSuggested = (/** @type {number|null} */ most) => (Number.isFinite(most) && /** @type {number} */ (most) > 0 ? Math.ceil(/** @type {number} */ (most) * GRANT_SUGGEST_ROOM) : null);
