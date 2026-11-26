// @ts-check
import { LOOSE_ORIGIN, STATION_ORIGINS } from '../../src/net/bagLaw.js';

export function unbruisedClamp(db, { player, character, materialSql, guard, binds }) {
  return db.prepare(`UPDATE prof_unbruised SET qty = MIN(qty, COALESCE((SELECT s.qty FROM prof_stores s
      WHERE s.player = ?1 AND s.char_id = ?2 AND s.material = ${materialSql} AND s.origin = 'own'), 0)
      + COALESCE((SELECT c.qty FROM prof_carried c WHERE c.player = ?1 AND c.char_id = ?2 AND c.material = ${materialSql} AND c.origin = 'own'), 0))
    WHERE player = ?1 AND char_id = ?2 AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds);
}

// Bought units are charged first. The own row is charged what the bought row cannot cover, so it must run
// before the bought row is charged.
export function spendStatements(db, { player, character, materialSql, qtySql, guard, binds }) {
  const bought = `COALESCE((SELECT b.qty FROM prof_stores b WHERE b.player = ?1 AND b.char_id = ?2 AND b.material = ${materialSql} AND b.origin = 'bought'), 0)`;
  return [
    db.prepare(`UPDATE prof_stores SET qty = qty - MAX(0, ${qtySql} - ${bought})
      WHERE player = ?1 AND char_id = ?2 AND origin = 'own' AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds),
    db.prepare(`UPDATE prof_stores SET qty = MAX(0, qty - ${qtySql})
      WHERE player = ?1 AND char_id = ?2 AND origin = 'bought' AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds),
    db.prepare('DELETE FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND qty = 0').bind(player, character),
    unbruisedClamp(db, { player, character, materialSql, guard, binds }),
  ];
}

// Each origin is charged what the ones before it cannot cover, so the statements run last-first.
export function spendOrigins(db, { player, character, materialSql, qtySql, guard, binds, order }) {
  const heldOf = (o) => `COALESCE((SELECT h.qty FROM prof_stores h WHERE h.player = ?1 AND h.char_id = ?2 AND h.material = ${materialSql} AND h.origin = '${o}'), 0)`;
  const out = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const covered = i > 0 ? order.slice(0, i).map(heldOf).join(' + ') : '0';
    out.push(db.prepare(`UPDATE prof_stores SET qty = MAX(0, qty - MAX(0, ${qtySql} - (${covered})))
      WHERE player = ?1 AND char_id = ?2 AND origin = '${order[i]}' AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds));
  }
  out.push(db.prepare('DELETE FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND qty = 0').bind(player, character));
  out.push(unbruisedClamp(db, { player, character, materialSql, guard, binds }));
  return out;
}
export const workStatements = (db, opts) => spendOrigins(db, { ...opts, order: STATION_ORIGINS });
export const workHeld = (st) => (st?.own ?? 0) + (st?.bought ?? 0) + (st?.[LOOSE_ORIGIN] ?? 0);
