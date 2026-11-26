// @ts-check

import { QL_SERVICE_LINES, QL_WITNESS_KINDS, qlTitleBit, qlClaimOf, qlStepClaimed } from '../../src/net/questlineClaims.js';
import { festivalOpen, QL_STARWARDEN_CAKES } from '../../src/net/festivalLaw.js';
import { isDeveloper } from './titles.js';
import { festivalOpenFor } from './festival.js';

export const QL_SWITCH = Object.freeze(['off', 'dev', 'on']);
export const qlSwitchOf = (/** @type {any} */ v) => (QL_SWITCH.includes(v) ? v : 'off');
export function questlinesOpenFor(/** @type {any} */ player, /** @type {any} */ env) {
  const s = qlSwitchOf(env?.QUESTLINES_OPEN);
  return s === 'on' || (s === 'dev' && isDeveloper(player, env));
}

export const QL_STATUS = Object.freeze({ 'ql-closed': 403, 'ql-body': 400 });

const SINCE = 'MAX((SELECT MIN(o.opened_at) FROM ql_steps o WHERE o.account = ?1 AND o.line = ?2), COALESCE((SELECT MAX(p.seen_at) + 1 FROM ql_steps p WHERE p.account = ?1 AND p.line = ?2 AND p.step < ?3), 0))';
const UNTIL = 'COALESCE((SELECT MIN(p.seen_at) FROM ql_steps p WHERE p.account = ?1 AND p.line = ?2 AND p.step > ?3), 9007199254740991)';
const NOT_REHEARSAL = 'NOT EXISTS (SELECT 1 FROM eg_stakes k WHERE k.b = r.b AND k.rh = 1) AND NOT EXISTS (SELECT 1 FROM eg_runs x WHERE x.b = r.b AND x.account = r.account AND x.rh = 1)';

// Every receipt table's `at` is the claim's nowS, never the kill time; a writer that stores the kill time breaks
// this window.
const WINDOW = (x) => `${x}.at >= ${SINCE} AND ${x}.at < ${UNTIL}`;
export const QL_WITNESS_SQL = Object.freeze({
  rite: `(SELECT MIN(g.at) FROM gate_kills g WHERE g.account = ?1 AND ${WINDOW('g')} AND (g.earned = 'rite' OR g.stones >= 2))`,
  breach: `(SELECT MIN(g.at) FROM gate_kills g WHERE g.account = ?1 AND ${WINDOW('g')} AND g.earned != 'rite')`,
  redoubt: `(SELECT MIN(r.at) FROM eg_redoubts r WHERE r.account = ?1 AND ${WINDOW('r')} AND ${NOT_REHEARSAL})`,
  redoubts3: `(SELECT r.at FROM eg_redoubts r WHERE r.account = ?1 AND ${WINDOW('r')} AND ${NOT_REHEARSAL} ORDER BY r.at, r.b, r.w LIMIT 1 OFFSET 2)`,
  valkynaz: `(SELECT MIN(r.at) FROM eg_redoubts r WHERE r.account = ?1 AND ${WINDOW('r')} AND r.w >= 5 AND r.w % 5 = 0 AND ${NOT_REHEARSAL})`,
  hour: `(SELECT MIN(d.at) FROM sd_kills d WHERE d.account = ?1 AND ${WINDOW('d')})`,
  serpent: `(SELECT MIN(z.at) FROM serpent_kills z WHERE z.account = ?1 AND ${WINDOW('z')})`,
  star: `(SELECT MIN(s.at) FROM stars_held s WHERE s.account = ?1 AND ${WINDOW('s')})`,
  stars3: `(SELECT s.at FROM stars_held s WHERE s.account = ?1 AND ${WINDOW('s')} ORDER BY s.at, s.star LIMIT 1 OFFSET 2)`,
  ketch: `(SELECT MIN(k.at) FROM ketch_voyages k WHERE k.account = ?1 AND ${WINDOW('k')})`,
});
for (const k of QL_WITNESS_KINDS) if (!QL_WITNESS_SQL[/** @type {keyof typeof QL_WITNESS_SQL} */ (k)]) throw new Error(`questlines.js: no witness for ${k}`);

const wholeSql = (lineId) => `(SELECT ql_titles FROM players WHERE id = ?1) & ${qlTitleBit(QL_SERVICE_LINES[/** @type {keyof typeof QL_SERVICE_LINES} */ (lineId)].title)} != 0`;
for (const l of Object.values(QL_SERVICE_LINES)) if ('after' in l && !qlTitleBit(QL_SERVICE_LINES[/** @type {keyof typeof QL_SERVICE_LINES} */ (l.after)]?.title)) throw new Error(`questlines.js: ${l.after} pays no title to be held`);

export function qlStepsBefore(lineId, step) {
  const l = QL_SERVICE_LINES[/** @type {keyof typeof QL_SERVICE_LINES} */ (lineId)];
  return l ? Object.keys(l.witness).map(Number).filter((s) => s < step).sort((a, b) => a - b) : [];
}
// The step numbers interpolated here come from the law's own table, never from the request body.
export function qlInOrderSql(lineId, step) {
  const before = qlStepsBefore(lineId, step);
  return before.length ? `(SELECT COUNT(*) FROM ql_steps b WHERE b.account = ?1 AND b.line = ?2 AND b.step IN (${before.join(', ')}) AND b.done_at IS NOT NULL) = ${before.length}` : '1';
}

export const QL_PURSES = Object.freeze({ thirteenthFrostfall: QL_STARWARDEN_CAKES });

export function qlTitleSteps(lineId) {
  const l = QL_SERVICE_LINES[/** @type {keyof typeof QL_SERVICE_LINES} */ (lineId)];
  if (!l) return [];
  return [...Object.keys(l.witness).map(Number).filter((s) => s < l.titleAt), l.titleAt].sort((a, b) => a - b);
}

/** @param {{ db: any, env?: any }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body
 *  @param {number} nowS */
export async function claimQl({ db, env = null }, player, body, nowS) {
  if (!questlinesOpenFor(player, env)) return { error: 'ql-closed' };
  const claim = qlClaimOf(body);
  if (!claim) return { error: 'ql-body' };
  const { line, step, phase, choice } = claim;
  /** @type {any} */ const law = QL_SERVICE_LINES[/** @type {keyof typeof QL_SERVICE_LINES} */ (line)];
  const opening = db.prepare('INSERT OR IGNORE INTO ql_steps (account, line, step, opened_at) VALUES (?1, ?2, ?3, ?4)').bind(player.id, line, step, nowS);

  if (phase === 'open') { await opening.run(); return { opened: true }; }
  if (!qlStepClaimed(line, step)) return { why: 'unpaid' };
  if (!player?.handle) return { why: 'guest' };

  const kind = /** @type {keyof typeof QL_WITNESS_SQL | undefined} */ (law.witness[step]);
  const after = law.after ?? null;
  const seen = kind ? QL_WITNESS_SQL[kind] : null;
  const witness = seen ? `${seen} IS NOT NULL` : after ? wholeSql(after) : '0';
  const inOrder = qlInOrderSql(line, step);
  const statements = [
    opening,
    db.prepare(`UPDATE ql_steps SET done_at = ?4, seen_at = ${seen ?? 'NULL'} WHERE account = ?1 AND line = ?2 AND step = ?3 AND done_at IS NULL AND (${witness}) AND ${inOrder}`)
      .bind(player.id, line, step, nowS),
  ];
  if (choice !== null) {
    statements.push(db.prepare('UPDATE ql_steps SET choice = ?4 WHERE account = ?1 AND line = ?2 AND step = ?3 AND done_at IS NOT NULL AND choice IS NULL').bind(player.id, line, step, choice));
  }
  const titleSteps = qlTitleSteps(line);
  const titleAt = titleSteps.includes(step) ? statements.length : -1;
  const purse = Object.hasOwn(QL_PURSES, line) && festivalOpenFor(player, env) && festivalOpen(nowS * 1000) ? QL_PURSES[/** @type {keyof typeof QL_PURSES} */ (line)] : 0;
  if (titleAt >= 0) {
    statements.push(db.prepare(`UPDATE players SET ql_titles = ql_titles | ?2, fest_cakes = fest_cakes + ?6 WHERE id = ?1 AND (ql_titles & ?2) = 0
      AND (SELECT COUNT(*) FROM ql_steps WHERE account = ?1 AND line = ?3 AND step IN (SELECT value FROM json_each(?4)) AND done_at IS NOT NULL) = ?5`)
      .bind(player.id, qlTitleBit(law.title), line, JSON.stringify(titleSteps), titleSteps.length, purse));
  }
  const key = law.key ?? null;
  const keyAt = key && key.at === step && choice === key.choice ? statements.length : -1;
  if (keyAt >= 0) {
    statements.push(db.prepare(`UPDATE players SET eg_keys = eg_keys + 1, ql_key = 1 WHERE id = ?1 AND ql_key = 0
      AND EXISTS (SELECT 1 FROM ql_steps WHERE account = ?1 AND line = ?2 AND step = ?3 AND done_at IS NOT NULL)
      RETURNING eg_keys`).bind(player.id, line, step));
  }
  statements.push(db.prepare('SELECT s.done_at, p.ql_key, p.ql_titles FROM ql_steps s JOIN players p ON p.id = s.account WHERE s.account = ?1 AND s.line = ?2 AND s.step = ?3').bind(player.id, line, step));
  const results = await db.batch(statements);
  const row = results.at(-1)?.results?.[0];
  if (row?.done_at == null) return { witnessed: false };
  const titled = titleAt >= 0 && Number(results[titleAt]?.meta?.changes ?? 0) > 0;
  const held = titleAt >= 0 && !titled && (Number(row.ql_titles) & qlTitleBit(law.title)) !== 0;
  const keyed = keyAt >= 0 ? results[keyAt]?.results?.[0] : null;
  return {
    witnessed: true,
    ...(titled ? { title: law.title } : held ? { titleHeld: law.title } : {}),
    ...(titled && purse > 0 ? { purse } : {}),
    ...(keyed ? { key: true, keys: Number(keyed.eg_keys) || 0 } : keyAt >= 0 && Number(row.ql_key) === 1 ? { keyHeld: true } : {}),
  };
}
