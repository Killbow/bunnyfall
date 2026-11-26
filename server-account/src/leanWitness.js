// @ts-check
// The triggers in migration 0135 mark an answer late when it matches the key's confirmation and arrives in a
// later second. Late rows cannot change a witnessed fact, so the judging reads skip them.

import { SEAT_WITNESS_UNMATCHED_MAX, SEAT_WITNESS_IGNORED_S } from '../../src/net/townSeatLaw.js';

export const LEAN_KINDS = Object.freeze(['npchall', 'seat']);

// SQLite uses migration 0135's partial indexes only when a read repeats their condition term for term.
export const LEAN_ROWS = "kind IN ('npchall', 'seat') AND late = 0";

// D1 binds at most 100 parameters per statement, and one of them is the kind.
export const LEAN_KEYS_A_STATEMENT = 99;

export async function keyRows(/** @type {any} */ db, /** @type {string} */ kind, /** @type {string[]} */ keys) {
  if (!keys.length) return [];
  const statements = [];
  for (let i = 0; i < keys.length; i += LEAN_KEYS_A_STATEMENT) {
    const part = keys.slice(i, i + LEAN_KEYS_A_STATEMENT);
    statements.push(db.prepare(`SELECT key, account, report, at FROM world_witness WHERE kind = ?1 AND key IN (${part.map((_, j) => `?${j + 2}`).join(', ')})`)
      .bind(kind, ...part));
  }
  const out = [];
  for (const r of await db.batch(statements)) for (const row of r?.results ?? []) out.push(witnessRow(row));
  return out;
}

export const witnessRow = (/** @type {any} */ r) => ({ key: String(r.key), account: String(r.account), report: String(r.report), at: Number(r.at) });

/**
 * @param {any} db @param {string} kind @param {{ key: string, account: string, report: string, at: number }[]} lean
 * @param {(rows: { key: string, account: string, report: string, at: number }[]) => Set<string>} ignoredOf
 */
export async function exactRows(db, kind, lean, ignoredOf) {
  const ignored = ignoredOf(lean);
  if (!ignored.size) return lean;
  const keys = [...new Set(lean.filter((r) => ignored.has(r.account)).map((r) => r.key))];
  if (!keys.length) return lean;
  const whole = new Set(keys);
  return [...lean.filter((r) => !whole.has(r.key)), ...await keyRows(db, kind, keys)];
}

// Delete late rows first, then empty the confirmation, then delete the rest, so the triggers rewrite no rows.
/** @param {any} db @param {string} kind @param {string} where @param {string} key */
export const strikeWitness = (db, kind, where, key) => [
  db.prepare(`DELETE FROM world_witness WHERE kind = ?2 AND ${where} AND late = 1`).bind(key, kind),
  db.prepare(`UPDATE witness_confirmed SET report = NULL, at = NULL WHERE kind = ?2 AND ${where}`).bind(key, kind),
  db.prepare(`DELETE FROM world_witness WHERE kind = ?2 AND ${where}`).bind(key, kind),
];
export const unmatchedSql = (/** @type {string} */ kind, /** @type {string} */ account, /** @type {string} */ since) => `SELECT COUNT(*) FROM world_witness u
  JOIN witness_confirmed c ON c.kind = u.kind AND c.key = u.key
  WHERE u.account = ${account} AND u.kind = ${kind} AND u.late = 0 AND u.report != c.report AND u.at > ${since}`;
/** @param {any} db @param {string} kind @param {string} account @param {number} nowS */
export const unmatchedRead = (db, kind, account, nowS) => db.prepare(`SELECT (${unmatchedSql('?1', '?2', '?3')}) AS n`)
  .bind(kind, account, nowS - 2 * SEAT_WITNESS_IGNORED_S);
export async function mayBeIgnored(/** @type {any} */ db, /** @type {string} */ kind, /** @type {string} */ account, /** @type {number} */ nowS) {
  const row = await unmatchedRead(db, kind, account, nowS).first();
  return Number(row?.n ?? 0) >= SEAT_WITNESS_UNMATCHED_MAX;
}
