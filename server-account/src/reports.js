// @ts-check
// Only handles in REPORT_READER_HANDLES read reports, checked on every call. A reporter lists only their own
// reports, without the words or the name of the reader.
import { mintId, displayName, overRate } from './accounts.js';
import { handleList } from './titles.js';
import {
  reportWordsOf, reportContextOf, REPORT_ID_RE, REPORT_RID_RE, REPORT_STATES, REPORT_SEND_MAX, REPORT_WINDOW_S,
  REPORT_OPEN_MAX, REPORT_MINE_MAX, REPORT_INBOX_MAX, REPORT_INBOX_PAGES,
} from '../../src/net/reportLaw.js';

/**
 * @param {any} player
 * @param {any} env
 */
export const isReportReader = (player, env) =>
  typeof player?.handle === 'string' && !!player.handle
  && handleList(env?.REPORT_READER_HANDLES).has(player.handle.toLowerCase());

const headOf = (/** @type {any} */ row) => ({
  id: row.id, kind: row.kind, subject: row.subject, sentAt: row.sent_at, read: row.read_at != null, state: row.state,
});
const inboxHeadOf = (/** @type {any} */ row) => ({ ...headOf(row), from: row.handle != null || row.guest_name != null ? displayName(row) : null });

/**
 * @param {{ db: any, rand: any, nowS: number }} ctx
 * @param {any} reporter
 * @param {{ kind?: unknown, subject?: unknown, body?: unknown, context?: unknown, rid?: unknown }} o
 */
export async function sendReport({ db, rand, nowS }, reporter, { kind, subject, body, context, rid } = {}) {
  if (typeof rid !== 'string' || !REPORT_RID_RE.test(rid)) return { error: 'report-rid' };
  const made = () => db.prepare('SELECT id, sent_at FROM private_reports WHERE from_id = ? AND rid = ?').bind(reporter.id, rid).first();
  const prior = await made();
  if (prior) return { ok: true, repeat: true, id: prior.id, sentAt: prior.sent_at };
  const words = reportWordsOf({ kind, subject, body });
  if ('error' in words) return words;
  const open = await db.prepare("SELECT COUNT(*) AS n FROM private_reports WHERE from_id = ? AND state = 'open'").bind(reporter.id).first();
  if (Number(open?.n ?? 0) >= REPORT_OPEN_MAX) return { error: 'report-full' };
  if (await overRate({ db, nowS }, `report:${reporter.id}`, REPORT_SEND_MAX, REPORT_WINDOW_S)) return { error: 'report-rate' };
  const ctxOf = reportContextOf(context);
  const id = mintId(rand);
  // The open cap is in the insert's own condition, so racing sends cannot both pass it. The conflict clause, not
  // insert-or-ignore, lets a failed check constraint throw instead of reading as a full queue.
  const r = await db.prepare(`INSERT INTO private_reports (id, from_id, rid, kind, subject, body, context, sent_at)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
    WHERE (SELECT COUNT(*) FROM private_reports WHERE from_id = ?2 AND state = 'open') < ?9
    ON CONFLICT (from_id, rid) DO NOTHING`)
    .bind(id, reporter.id, rid, words.kind, words.subject, words.body, ctxOf ? JSON.stringify(ctxOf) : null, nowS, REPORT_OPEN_MAX).run();
  if (r?.meta?.changes) return { ok: true, id, sentAt: nowS };
  const again = await made();
  return again ? { ok: true, repeat: true, id: again.id, sentAt: again.sent_at } : { error: 'report-full' };
}

/**
 * @param {{ db: any }} ctx
 * @param {any} reporter
 */
export async function myReports({ db }, reporter) {
  const { results = [] } = await db.prepare(`SELECT id, kind, subject, sent_at, read_at, state FROM private_reports
    WHERE from_id = ? ORDER BY sent_at DESC, id DESC LIMIT ?`).bind(reporter.id, REPORT_MINE_MAX).all();
  return { reports: results.map(headOf), max: REPORT_MINE_MAX };
}

export async function reportCountsOf(/** @type {any} */ db) {
  const row = await db.prepare(`SELECT COUNT(*) AS open, COALESCE(SUM(read_at IS NULL), 0) AS unread
    FROM private_reports WHERE state = 'open'`).first();
  return { unread: Number(row?.unread ?? 0), open: Number(row?.open ?? 0) };
}

/**
 * @param {{ db: any }} ctx
 * @param {any} reader
 * @param {any} env
 * @param {{ which?: unknown, page?: unknown }} [o]
 */
export async function reportInbox({ db }, reader, env, { which = 'open', page = 0 } = {}) {
  if (!isReportReader(reader, env)) return { error: 'not-report-reader' };
  const closed = which === 'closed';
  const p = Number.isSafeInteger(page) && page >= 0 && page < REPORT_INBOX_PAGES ? page : 0;
  const { results = [] } = await db.prepare(`SELECT r.id, r.kind, r.subject, r.sent_at, r.read_at, r.state, p.handle, p.guest_name
    FROM private_reports r LEFT JOIN players p ON p.id = r.from_id
    WHERE ${closed ? "r.state != 'open'" : "r.state = 'open'"}
    ORDER BY ${closed ? 'r.closed_at DESC' : '(r.read_at IS NULL) DESC, r.sent_at DESC'}, r.id DESC LIMIT ? OFFSET ?`)
    .bind(REPORT_INBOX_MAX + 1, p * REPORT_INBOX_MAX).all();
  return {
    which: closed ? 'closed' : 'open', page: p, more: results.length > REPORT_INBOX_MAX,
    reports: results.slice(0, REPORT_INBOX_MAX).map(inboxHeadOf), ...(await reportCountsOf(db)), max: REPORT_INBOX_MAX,
  };
}

/**
 * @param {{ db: any, nowS: number }} ctx
 * @param {any} reader
 * @param {any} env
 * @param {unknown} id
 */
export async function readReport({ db, nowS }, reader, env, id) {
  if (!isReportReader(reader, env)) return { error: 'not-report-reader' };
  if (typeof id !== 'string' || !REPORT_ID_RE.test(id)) return { error: 'no-report' };
  const row = await db.prepare(`SELECT r.*, p.handle, p.guest_name FROM private_reports r LEFT JOIN players p ON p.id = r.from_id
    WHERE r.id = ?`).bind(id).first();
  if (!row) return { error: 'no-report' };
  if (row.read_at == null) await db.prepare('UPDATE private_reports SET read_at = ?, read_by = ? WHERE id = ? AND read_at IS NULL').bind(nowS, reader.id, id).run();
  let context = null;
  try { context = row.context ? reportContextOf(JSON.parse(row.context)) : null; } catch { context = null; }
  return { report: { ...inboxHeadOf(row), read: true, body: row.body, context, closedAt: row.closed_at ?? null } };
}

/**
 * @param {{ db: any, nowS: number }} ctx
 * @param {any} reader
 * @param {any} env
 * @param {{ id?: unknown, state?: unknown }} [o]
 */
export async function closeReport({ db, nowS }, reader, env, { id, state } = {}) {
  if (!isReportReader(reader, env)) return { error: 'not-report-reader' };
  if (typeof state !== 'string' || !REPORT_STATES.includes(state)) return { error: 'report-state' };
  if (typeof id !== 'string' || !REPORT_ID_RE.test(id)) return { error: 'no-report' };
  const open = state === 'open';
  const r = await db.prepare(`UPDATE private_reports SET state = ?1, closed_at = ?2, closed_by = ?3,
    read_at = CASE WHEN ?1 = 'open' THEN read_at ELSE COALESCE(read_at, ?4) END,
    read_by = CASE WHEN ?1 = 'open' THEN read_by ELSE COALESCE(read_by, ?5) END WHERE id = ?6`)
    .bind(state, open ? null : nowS, open ? null : reader.id, nowS, reader.id, id).run();
  return r?.meta?.changes ? { ok: true, id, state } : { error: 'no-report' };
}
