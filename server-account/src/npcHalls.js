// @ts-check
// Halls are witnessed per town: the first answer that three accounts agree on becomes the fact for that town.

import { accountKind, overRate } from './accounts.js';
import { isDeveloper } from './titles.js';
import { witnessOf } from './townSeats.js';
import { chaptersOpenFor } from './npcRoll.js';
import { witnessedFact, factConfirmed, regionOk } from '../../src/net/nodeLaw.js';
import { seatIgnoredAccounts, SEAT_WITNESSES_AUDIT, SEAT_WITNESS_IGNORED_S, SEAT_WITNESS_UNMATCHED_MAX } from '../../src/net/townSeatLaw.js';
import { exactRows, mayBeIgnored, witnessRow, unmatchedSql, strikeWitness, LEAN_ROWS } from './leanWitness.js';
import {
  HALL_WITNESS_KIND, HALL_WITNESS_HOUR, HALL_REPORT_V, hallReportOf, hallReportText, parseHallReport, hallWitnessKey,
} from '../../src/net/npcChapterLaw.js';

export const CHAPTERS_KEPT_MS = 60_000;
/** @type {Map<number, { at: number, chapters: number[] }>} */
const _kept = new Map();
export const forgetChapters = () => _kept.clear();

const CONFIRMER_MAY_BE_IGNORED = `EXISTS (SELECT 1 FROM (SELECT account, report FROM world_witness INDEXED BY idx_world_witness_lean_key WHERE kind = '${HALL_WITNESS_KIND}' AND key = ?1 AND ${LEAN_ROWS}) w
      JOIN witness_confirmed c ON c.kind = '${HALL_WITNESS_KIND}' AND c.key = ?1 AND c.report = w.report
      WHERE (${unmatchedSql(`'${HALL_WITNESS_KIND}'`, 'w.account', '?4')}) >= ${SEAT_WITNESS_UNMATCHED_MAX})`;
// The unary plus on `region` keeps the planner on the (kind, key) index instead of walking every hall report.
const bumpRegions = (/** @type {any} */ db, /** @type {string} */ keySql, /** @type {string} */ key, /** @type {number} */ nowS, guard = '1', ...binds) => db.prepare(
  `INSERT INTO npc_hall_regions (region, ver, done, at) SELECT DISTINCT +region, 1, 0, ?2 FROM world_witness
    WHERE kind = '${HALL_WITNESS_KIND}' AND ${keySql} AND ${guard}
    ON CONFLICT (region) DO UPDATE SET ver = npc_hall_regions.ver + 1`).bind(key, nowS, ...binds);

export async function regionRows(/** @type {any} */ db, /** @type {number} */ region) {
  const { results = [] } = await db.prepare(`SELECT key, account, report, at FROM world_witness WHERE kind = '${HALL_WITNESS_KIND}'
    AND key IN (SELECT key FROM world_witness WHERE kind = '${HALL_WITNESS_KIND}' AND region = ? AND key LIKE ?)`).bind(region, `${HALL_REPORT_V}:%`).all();
  return results.map(witnessRow);
}

// Each part names its index, because with statistics the planner read every row of each town by the key index.
export async function judgedRows(/** @type {any} */ db, /** @type {number} */ region, /** @type {number} */ nowS) {
  const { results = [] } = await db.prepare(`SELECT key, account, report, at FROM world_witness INDEXED BY idx_world_witness_lean_key WHERE kind = '${HALL_WITNESS_KIND}' AND ${LEAN_ROWS}
    AND key IN (SELECT key FROM world_witness INDEXED BY idx_world_witness_lean_region WHERE kind = '${HALL_WITNESS_KIND}' AND ${LEAN_ROWS} AND region = ? AND key LIKE ?)`).bind(region, `${HALL_REPORT_V}:%`).all();
  return exactRows(db, HALL_WITNESS_KIND, results.map(witnessRow), (rows) => hallFacts(rows, nowS).ignored);
}

/** @param {{ key: string, account: string, report: string, at: number }[]} rows @param {number} nowS */
export function hallFacts(rows, nowS) {
  /** @type {Map<string, typeof rows>} */
  const byKey = new Map();
  for (const r of rows) { const a = byKey.get(r.key) ?? []; a.push(r); byKey.set(r.key, a); }
  /** @type {Map<string, string>} */
  const confirmed = new Map();
  for (const [k, list] of byKey) {
    const f = /** @type {any} */ (witnessedFact(list, parseHallReport));
    if (factConfirmed(f)) confirmed.set(k, hallReportText(f));
  }
  const ignored = seatIgnoredAccounts(rows, confirmed, nowS);
  const towns = [];
  for (const [k, list] of byKey) {
    const kept = list.filter((r) => !ignored.has(r.account));
    const f = /** @type {any} */ (witnessedFact(kept, parseHallReport));
    if (f.state === 'none') continue;
    const agreeing = f.factions ? kept.filter((r) => r.report === hallReportText(f)).length : 0;
    towns.push({ key: k, fact: f, witnesses: new Set(kept.map((r) => r.account)).size,
      audit: (factConfirmed(f) && agreeing === SEAT_WITNESSES_AUDIT) || f.state === 'disputed' });
  }
  return { towns, ignored };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} player @param {any} env @param {any} body */
export async function witnessHall({ db, nowS }, player, env, { hall } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'halls-need-account' };
  if (!chaptersOpenFor(player, env)) return { error: 'chapters-closed' };
  const h = hallReportOf(hall);
  if (!h) return { error: 'bad-hall' };
  if (await overRate({ db, nowS }, `hall-witness:${player.id}`, HALL_WITNESS_HOUR, 3600)) return { error: 'halls-rate' };
  if (await db.prepare('SELECT 1 FROM npc_hall_strikes WHERE map_id = ?').bind(h.key).first()) return { error: 'hall-struck' };
  if (!witnessOf(player, nowS)) return { ok: true, counted: false, why: 'young' };
  if (await mayBeIgnored(db, HALL_WITNESS_KIND, player.id, nowS)
    && hallFacts(await judgedRows(db, h.region, nowS), nowS).ignored.has(player.id)) return { ok: true, counted: false, why: 'ignored' };
  // The strike is checked again inside the write, so a report racing a strike lands nowhere.
  const key = hallWitnessKey(h.key);
  const [r, moved] = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO world_witness (kind, key, account, report, region, at)
      SELECT '${HALL_WITNESS_KIND}', ?1, ?2, ?3, ?4, ?5 WHERE NOT EXISTS (SELECT 1 FROM npc_hall_strikes WHERE map_id = ?6)`)
      .bind(key, player.id, hallReportText(h), h.region, nowS, h.key),
    bumpRegions(db, 'key = ?1', key, nowS, `changes() > 0 AND (NOT EXISTS (SELECT 1 FROM world_witness w WHERE w.kind = '${HALL_WITNESS_KIND}'
      AND w.key = ?1 AND w.account = ?3 AND w.late = 1) OR ${CONFIRMER_MAY_BE_IGNORED})`, player.id, nowS - 2 * SEAT_WITNESS_IGNORED_S),
  ]);
  if (moved?.meta?.changes) _kept.delete(h.region);
  if (!r?.meta?.changes && await db.prepare('SELECT 1 FROM npc_hall_strikes WHERE map_id = ?').bind(h.key).first()) return { error: 'hall-struck' };
  return { ok: true, counted: true };
}

/** @param {any} db @param {number} region @param {number} [nowMs] */
export async function regionChapters(db, region, nowMs = Date.now()) {
  const kept = _kept.get(region);
  if (kept && nowMs - kept.at < CHAPTERS_KEPT_MS) return kept.chapters;
  const chapters = await chaptersOf(db, region, Math.floor(nowMs / 1000));
  _kept.set(region, { at: nowMs, chapters });
  return chapters;
}

async function computeChapters(/** @type {any} */ db, /** @type {number} */ region, /** @type {number} */ nowS) {
  const factions = new Set();
  for (const t of hallFacts(await judgedRows(db, region, nowS), nowS).towns) {
    if (factConfirmed(t.fact) && t.fact.region === region) for (const id of t.fact.factions) factions.add(id);
  }
  return [...factions].sort((a, b) => a - b);
}

const rowChapters = (/** @type {any} */ row) => {
  if (!row || Number(row.done) !== Number(row.ver)) return null;
  try { const v = JSON.parse(String(row.chapters)); return Array.isArray(v) ? v.map(Number) : null; } catch { return null; }
};

// Chapters are computed from the reports when a change came since and written under the version read, so a
// change that lands in between is computed again.
async function chaptersOf(/** @type {any} */ db, /** @type {number} */ region, /** @type {number} */ nowS) {
  const row = await db.prepare('SELECT chapters, ver, done FROM npc_hall_regions WHERE region = ?1').bind(region).first();
  const held = rowChapters(row);
  if (held) return held;
  const chapters = await computeChapters(db, region, nowS);
  if (row) {
    await db.prepare('UPDATE npc_hall_regions SET chapters = ?1, done = ?2, at = ?3 WHERE region = ?4 AND ver = ?2')
      .bind(JSON.stringify(chapters), Number(row.ver), nowS, region).run();
  } else {
    await db.prepare('INSERT OR IGNORE INTO npc_hall_regions (region, chapters, ver, done, at) VALUES (?1, ?2, 0, 0, ?3)')
      .bind(region, JSON.stringify(chapters), nowS).run();
  }
  return chapters;
}

export const hallRowsRead = (/** @type {any} */ db) => db.prepare('SELECT region, chapters, ver, done FROM npc_hall_regions ORDER BY region');

/** @param {any} db @param {number} nowS @param {any[]} [rows] */
export async function allRegionChapters(db, nowS, rows = undefined) {
  const results = rows ?? (await hallRowsRead(db).all()).results ?? [];
  const out = [];
  for (const row of results) {
    const g = Number(row.region);
    const chapters = rowChapters(row) ?? await chaptersOf(db, g, nowS);
    for (const f of chapters) out.push({ faction: f, region: g });
  }
  return out;
}

/** @param {{ db: any, nowS: number }} ctx @param {any} dev @param {any} env @param {any} body */
export async function listHalls({ db, nowS }, dev, env, { region } = {}) {
  if (!isDeveloper(dev, env)) return { error: 'not-developer' };
  if (!regionOk(region)) return { error: 'bad-region' };
  const { towns, ignored } = hallFacts(await regionRows(db, region), nowS);
  return {
    region,
    towns: towns.map((t) => ({ key: Number(t.key.slice(t.key.indexOf(':') + 1)), state: t.fact.state, region: t.fact.region ?? null,
      factions: t.fact.factions ?? [], witnesses: t.witnesses, audit: t.audit })).sort((a, b) => a.key - b.key),
    ignored: ignored.size,
  };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} dev @param {any} env @param {any} body */
export async function strikeHall({ db, nowS }, dev, env, { key } = {}) {
  if (!isDeveloper(dev, env)) return { error: 'not-developer' };
  if (!Number.isSafeInteger(key) || key < 0 || key > 0xffffffff) return { error: 'bad-hall' };
  const [, , late, , rest] = await db.batch([
    db.prepare('INSERT OR IGNORE INTO npc_hall_strikes (map_id, by, at) VALUES (?, ?, ?)').bind(key, dev.handle ?? null, nowS),
    // The regions are bumped first, while the reports still exist to name them.
    bumpRegions(db, 'key LIKE ?1', `%:${key}`, nowS),
    ...strikeWitness(db, HALL_WITNESS_KIND, 'key LIKE ?1', `%:${key}`),
  ]);
  forgetChapters();
  return { ok: true, key, reports: Number(late?.meta?.changes ?? 0) + Number(rest?.meta?.changes ?? 0) };
}
