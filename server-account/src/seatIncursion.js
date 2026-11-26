// @ts-check
// Incursion gate kills pay their doubled Marks at the weekly settle, after the day's region is agreed, because one
// claim's region is unverified. The `incursion:<day>` rid pays each account once.
import { tideAt } from '../../src/net/tideLaw.js';
import { MARKS_MAX, utcDay } from '../../src/net/marksLaw.js';
import { gateStrikeRid } from './marks.js';

export const incursionRid = (gameDay) => `incursion:${gameDay}`;

/**
 * @param {any} db
 * @param {{ week: number, agreed: Map<number, number>, counted: boolean, nowS: number }} o
 */
export function incursionStatements(db, { week, agreed, counted, nowS }) {
  const out = [];
  for (const [day, region] of agreed) {
    if (tideAt(week, region, counted) !== 'daedra') continue;
    out.push(db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'mint', NULL, 'account', k.account, 'gate-incursion', l.amount, ?3, ?4, k.account, 'Daedric Incursion', ?5
      FROM gate_kills k JOIN marks_ledger l ON l.actor = k.account AND l.rid = ?6 AND l.kind = 'gate'
      WHERE k.day = ?1 AND k.region = ?2
        AND NOT EXISTS (SELECT 1 FROM marks_ledger x WHERE x.actor = k.account AND x.rid = ?5)
        AND COALESCE((SELECT balance FROM marks WHERE account = k.account), 0) + l.amount <= ?7`)
      .bind(day, region, utcDay(nowS), nowS, incursionRid(day), gateStrikeRid(day), MARKS_MAX));
  }
  return out;
}
