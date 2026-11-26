// @ts-check
// Seats come from the clients and count only when three witnesses agree byte for byte. Two agreeing on another
// answer dispute a seat, and a disputed seat keeps every effect it had until a person rules.
import { accountKind, overRate } from './accounts.js';
import { isDeveloper } from './titles.js';
import { witnessedFact, factConfirmed, WITNESS } from '../../src/net/nodeLaw.js';
import {
  seatsSwitchOf, seatReportOf, seatReportText, parseSeatReport, seatIgnoredAccounts, seatKeyOk, seatWeekOf,
  SEAT_WITNESS_REPORTS_HOUR, SEAT_WITNESSES_AUDIT, seasonFloor, seasonZeroOf,
} from '../../src/net/townSeatLaw.js';
import { utcDay, MARKS_MAX } from '../../src/net/marksLaw.js';
import { fortsLapsedStatements } from './seatForts.js';
import { DB_ROOT, replicaDb, d1Overloaded, bookmarkOf } from './service.js';
import { exactRows, witnessRow, strikeWitness, LEAN_ROWS } from './leanWitness.js';

export function seatsOpenFor(player, env) {
  const s = seatsSwitchOf(env?.SEATS_OPEN);
  return s === 'on' || (s === 'dev' && isDeveloper(player, env));
}
export const witnessOf = (player, nowS) => Number.isSafeInteger(player?.registered_at) && player.registered_at <= nowS - WITNESS.ageS;

async function struck(db, key) {
  return !!(await db.prepare("SELECT 1 FROM town_seat_history WHERE key = ? AND kind = 'strike'").bind(key).first());
}

/** @param {{ key: string, account: string, report: string, at: number }[]} rows @param {number} nowS */
export function seatFacts(rows, nowS) {
  const byKey = new Map();
  for (const r of rows) {
    const list = byKey.get(r.key) ?? [];
    list.push(r);
    byKey.set(r.key, list);
  }
  const confirmed = new Map();
  for (const [k, list] of byKey) {
    const f = witnessedFact(list, parseSeatReport);
    if (factConfirmed(f)) confirmed.set(k, seatReportText(/** @type {any} */ (f).seat));
  }
  const ignored = seatIgnoredAccounts(rows, confirmed, nowS);
  const out = [];
  for (const [k, list] of byKey) {
    const kept = list.filter((r) => !ignored.has(r.account));
    const f = /** @type {any} */ (witnessedFact(kept, parseSeatReport));
    if (f.state === 'none') continue;
    const agreeing = f.seat ? kept.filter((r) => r.report === seatReportText(f.seat)) : [];
    out.push({ key: Number(k), fact: f, witnesses: new Set(kept.map((r) => r.account)).size, agreeing: agreeing.map((r) => r.account) });
  }
  for (const s of out) s.audit = (factConfirmed(s.fact) && s.agreeing.length === SEAT_WITNESSES_AUDIT) || s.fact.state === 'disputed';
  return { seats: out, ignored };
}

export const SEAT_ROWS_SQL = "SELECT key, account, report, at FROM world_witness WHERE kind = 'seat'";
export const SEAT_JUDGED_SQL = `SELECT key, account, report, at FROM world_witness INDEXED BY idx_world_witness_lean_key WHERE kind = 'seat' AND ${LEAN_ROWS}`;
async function allSeatRows(db) {
  const { results = [] } = await db.prepare(SEAT_ROWS_SQL).all();
  return results.map(witnessRow);
}
export async function judgedSeatRows(db, nowS) {
  const { results = [] } = await db.prepare(SEAT_JUDGED_SQL).all();
  return exactRows(db, 'seat', results.map(witnessRow), (rows) => seatFacts(rows, nowS).ignored);
}

export const SEAT_ROWS_KEPT_S = 60;
export const SEAT_ROWS_FROM = 'first-unconstrained';
const seatRowsKept = new WeakMap(), seatRowsAsking = new WeakMap(), seatRowWrites = new WeakMap();
const seatRowsMark = new WeakMap(), seatRowsWritten = new WeakSet();
const seatRowsRoot = (/** @type {any} */ db) => db?.[DB_ROOT] ?? db;

// A read after this isolate's own write starts at the primary, and later reads start from the last bookmark, so a
// replica behind what this isolate already read never answers.
async function seatRowsOf(db, nowS) {
  const root = seatRowsRoot(db);
  const kept = seatRowsKept.get(root);
  if (kept && nowS - kept.at < SEAT_ROWS_KEPT_S) return kept.rows;
  const asking = seatRowsAsking.get(root);
  if (asking) return asking;
  const gen = seatRowWrites.get(root) ?? 0;
  const wrote = seatRowsWritten.has(root);
  const from = wrote ? 'first-primary' : (seatRowsMark.get(root) ?? SEAT_ROWS_FROM);
  let session = db;
  const opener = typeof db?.withSession === 'function' ? db : root;
  try { session = replicaDb(opener, from); } catch { }
  const ask = judgedSeatRows(session, nowS).then((rows) => {
    if ((seatRowWrites.get(root) ?? 0) === gen) {
      seatRowsKept.set(root, { at: nowS, rows });
      const mark = bookmarkOf(session);
      if (mark) seatRowsMark.set(root, mark);
      if (wrote) seatRowsWritten.delete(root);
    }
    return rows;
  }, (e) => { if (seatRowsMark.get(root) === from) seatRowsMark.delete(root); throw e; })
    .finally(() => { if (seatRowsAsking.get(root) === ask) seatRowsAsking.delete(root); });
  seatRowsAsking.set(root, ask);
  return ask;
}
function forgetSeatRows(db, nowS) {
  const root = seatRowsRoot(db);
  seatRowsKept.delete(root);
  seatRowsAsking.delete(root);
  seatRowWrites.set(root, (seatRowWrites.get(root) ?? 0) + 1);
  seatRowsWritten.add(root);
  seatWroteAt.set(root, nowS);
}

export const SEAT_FACTS_FRESH_S = 180;
const SEAT_FACTS_SQL = 'SELECT at, facts FROM seat_facts_kept WHERE id = 1';
const seatFactsKept = new WeakMap(), seatFactsAsking = new WeakMap(), seatWroteAt = new WeakMap();

export function seatFactsText(/** @type {{ seats: any[], ignored: Set<string> }} */ { seats, ignored }) {
  return JSON.stringify({ seats: seats.filter((x) => factConfirmed(x.fact)).map((x) => [x.key, x.fact.state, seatReportText(x.fact.seat)]), ignored: [...ignored].sort() });
}
export function seatFactsOfText(/** @type {unknown} */ text) {
  let o;
  try { o = JSON.parse(String(text)); } catch { return null; }
  if (!o || !Array.isArray(o.seats) || !Array.isArray(o.ignored)) return null;
  const seats = [];
  for (const e of o.seats) {
    if (!Array.isArray(e) || e.length !== 3) return null;
    const [key, state, report] = e;
    const read = parseSeatReport(report);
    if (!Number.isSafeInteger(key) || (state !== 'confirmed' && state !== 'disputed') || !read) return null;
    seats.push({ key, fact: { state, ...read } });
  }
  return { seats, ignored: new Set(o.ignored.filter((/** @type {unknown} */ a) => typeof a === 'string')) };
}
export async function keepSeatFacts(/** @type {any} */ db, /** @type {number} */ nowS) {
  const facts = seatFacts(await judgedSeatRows(db, nowS), nowS);
  await db.prepare('INSERT INTO seat_facts_kept (id, at, facts) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET at = excluded.at, facts = excluded.facts')
    .bind(nowS, seatFactsText(facts)).run();
  return 1;
}
async function seatFactsRow(db, root) {
  let session = db;
  try { session = replicaDb(typeof db?.withSession === 'function' ? db : root, SEAT_ROWS_FROM); } catch { }
  let row;
  try { row = await session.prepare(SEAT_FACTS_SQL).first(); } catch (e) { if (d1Overloaded(e)) throw e; return null; }
  const of = Number(row?.at);
  if (!Number.isSafeInteger(of)) return null;
  const facts = seatFactsOfText(row.facts);
  return facts ? { of, facts } : null;
}
async function keptSeatFacts(db, nowS) {
  const root = seatRowsRoot(db);
  const fresh = (/** @type {{ of: number }} */ k) => k.of > (seatWroteAt.get(root) ?? -Infinity) && nowS - k.of <= SEAT_FACTS_FRESH_S;
  const kept = seatFactsKept.get(root);
  if (kept && nowS - kept.at < SEAT_ROWS_KEPT_S) {
    if (kept.facts && fresh(kept)) return kept.facts;
    if (!kept.facts) return seatFacts(await seatRowsOf(db, nowS), nowS);
  }
  let asking = seatFactsAsking.get(root);
  if (!asking) {
    asking = seatFactsRow(db, root).finally(() => { if (seatFactsAsking.get(root) === asking) seatFactsAsking.delete(root); });
    seatFactsAsking.set(root, asking);
  }
  const row = await asking;
  if (row && fresh(row)) {
    seatFactsKept.set(root, { at: nowS, of: row.of, facts: row.facts });
    return row.facts;
  }
  seatFactsKept.set(root, { at: nowS, of: -Infinity, facts: null });
  return seatFacts(await seatRowsOf(db, nowS), nowS);
}

/** @param {{db: any, nowS: number}} ctx */
export async function listSeats({ db, nowS }, player, env) {
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  const dev = isDeveloper(player, env);
  const { seats, ignored } = dev ? seatFacts(await allSeatRows(db), nowS) : await keptSeatFacts(db, nowS);
  const view = (s) => ({ ...s.fact.seat, state: s.fact.state });
  return {
    seats: seats.filter((s) => factConfirmed(s.fact)).map(view).sort((a, b) => a.key - b.key),
    me: { witness: witnessOf(player, nowS) && !ignored.has(player.id), developer: dev },
    ...(dev ? {
      unconfirmed: seats.filter((s) => !factConfirmed(s.fact) && s.fact.seat).map((s) => ({ ...view(s), witnesses: s.witnesses })).sort((a, b) => a.key - b.key),
      audit: seats.filter((s) => s.audit).map((s) => s.key).sort((a, b) => a - b),
    } : {}),
  };
}

/** @param {any} db @param {number} nowS @param {{ fresh?: boolean }} [opts] */
export async function confirmedSeats(db, nowS, { fresh = false } = {}) {
  const { seats } = fresh ? seatFacts(await judgedSeatRows(db, nowS), nowS) : await keptSeatFacts(db, nowS);
  return new Map(seats.filter((s) => factConfirmed(s.fact)).map((s) => [s.key, { ...s.fact.seat, state: s.fact.state }]));
}

/** @param {{db: any, nowS: number}} ctx */
export async function witnessSeat({ db, nowS }, player, env, { seat } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'seats-need-account' };
  if (!seatsOpenFor(player, env)) return { error: 'seats-closed' };
  const s = seatReportOf(seat);
  if (!s) return { error: 'bad-seat' };
  if (await overRate({ db, nowS }, `seat-witness:${player.id}`, SEAT_WITNESS_REPORTS_HOUR, 3600)) return { error: 'seats-rate' };
  if (await struck(db, s.key)) return { error: 'seat-struck' };
  if (!witnessOf(player, nowS)) return { ok: true, counted: false, why: 'young' };
  const { ignored } = await keptSeatFacts(db, nowS);
  if (ignored.has(player.id)) return { ok: true, counted: false, why: 'ignored' };
  const put = await db.prepare("INSERT OR IGNORE INTO world_witness (kind, key, account, report, region, at) VALUES ('seat', ?, ?, ?, ?, ?)")
    .bind(String(s.key), player.id, seatReportText(s), s.region, nowS).run();
  // A witness's first answer stands, so a repeat report writes nothing and keeps the cached rows.
  if (Number(put?.meta?.changes) !== 0) forgetSeatRows(db, nowS);
  return { ok: true, counted: true };
}

/** @param {{db: any, nowS: number}} ctx */
export async function strikeSeat({ db, nowS }, dev, env, { key } = {}) {
  if (!isDeveloper(dev, env)) return { error: 'not-developer' };
  if (!seatKeyOk(key)) return { error: 'bad-seat' };
  const week = seatWeekOf(nowS * 1000);
  const h = await db.prepare('SELECT h.guild_id, g.name, g.tag FROM town_seat_holds h LEFT JOIN guilds g ON g.id = h.guild_id WHERE h.key = ?').bind(key).first();
  const rid = `strike-${key}`;
  const [, , , , late, , rest] = await db.batch([
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'mint', NULL, 'guild', h.guild_id, 'seat-strike-refund', MIN(l.amount, ${MARKS_MAX} - COALESCE((SELECT balance FROM guild_marks WHERE guild_id = h.guild_id), 0)),
        ?2, ?3, 'seats', 'The registry', ?4
      FROM town_seat_holds h JOIN marks_ledger l ON l.actor = 'seats' AND l.kind = 'seat-claim' AND l.src_id = h.guild_id
        AND l.rid IN ('claim-' || (h.since_week - 1) || '-' || h.key, 'tourney-' || h.since_week || '-' || h.key)
      WHERE h.key = ?1 AND h.since_week >= ?5 AND EXISTS (SELECT 1 FROM guilds WHERE id = h.guild_id)
        AND COALESCE((SELECT balance FROM guild_marks WHERE guild_id = h.guild_id), 0) < ${MARKS_MAX}
      LIMIT 1`).bind(key, utcDay(nowS), nowS, rid, seasonFloor(week, seasonZeroOf(env?.SEASON_ZERO_WEEK))),
    db.prepare("UPDATE town_seat_edicts SET state = 'void' WHERE key = ? AND state = 'proclaimed'").bind(key),
    db.prepare("UPDATE town_seat_battles SET state = 'void' WHERE key = ? AND week >= ? AND state = 'scheduled'").bind(key, week),
    db.prepare('DELETE FROM town_seat_holds WHERE key = ?').bind(key),
    ...strikeWitness(db, 'seat', 'key = ?1', String(key)),
    db.prepare(`INSERT INTO town_seat_history (key, week, kind, data, at)
      SELECT ?1, ?2, 'strike', json_set(?3, '$.refund', COALESCE((SELECT amount FROM marks_ledger WHERE actor = 'seats' AND rid = ?5), 0)), ?4`)
      .bind(key, week, JSON.stringify({ by: dev.handle ?? null, ...(h ? { guild: { name: h.name ?? '', tag: h.tag ?? '' } } : {}) }), nowS, rid),
    ...fortsLapsedStatements(db, key, nowS),
  ]);
  forgetSeatRows(db, nowS);
  return { ok: true, key, reports: Number(late?.meta?.changes ?? 0) + Number(rest?.meta?.changes ?? 0) };
}
