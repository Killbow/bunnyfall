// @ts-check
// Spending from the Stores: the statements that spend a material's origins and hold the work a
// craft takes, with the unbruised count clamped after each spend.
import { LOOSE_ORIGIN, STATION_ORIGINS } from '../../src/net/bagLaw.js';

// ─── WITHDRAW TO THE PACK (PROF0 7, law 3: one way) ──────────────────

/** AUDIT PROF12 A1: THE UNBRUISED COUNT NEVER OUTLIVES ITS HERBS - after any spend of a character's own units (a brew, a
 *  craft, a withdrawal to the pack, a market listing or fill, a writ's delivery, a guild's deposit: every one goes by
 *  spendStatements or spendOrigins), prof_unbruised is clamped to the own units of that material still held, where
 *  `guard` holds. Only a brew lowered it, so an unbruised herb withdrawn or sold left its count standing, and a later
 *  bruised own herb was reckoned unbruised (+5% Potent). The brew lowers its own reckoning before its spends. */
export function unbruisedClamp(db, { player, character, materialSql, guard, binds }) {
  // BAG1: the own units it counts are the Stores' and the carried count's together - a harvest into the bag is counted
  // there, and a deposit moves it into the Stores without changing what is own
  return db.prepare(`UPDATE prof_unbruised SET qty = MIN(qty, COALESCE((SELECT s.qty FROM prof_stores s
      WHERE s.player = ?1 AND s.char_id = ?2 AND s.material = ${materialSql} AND s.origin = 'own'), 0)
      + COALESCE((SELECT c.qty FROM prof_carried c WHERE c.player = ?1 AND c.char_id = ?2 AND c.material = ${materialSql} AND c.origin = 'own'), 0))
    WHERE player = ?1 AND char_id = ?2 AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds);
}

/** Spend `qtySql` units of a material from a character's Stores - bought units first, so a character's own stay for
 *  writs (PROF0 7) - where `guard` holds; the rows left at 0 deleted. Three statements, in this order: the own row is
 *  charged what the bought row cannot cover, reading the bought row before it is charged. PROF5: a listing's units
 *  and a fill's leave the Stores by it too. AUDIT PROF12 A1: then the unbruised count clamped (unbruisedClamp). */
export function spendStatements(db, { player, character, materialSql, qtySql, guard, binds }) {
  const bought = `COALESCE((SELECT b.qty FROM prof_stores b WHERE b.player = ?1 AND b.char_id = ?2 AND b.material = ${materialSql} AND b.origin = 'bought'), 0)`;
  return [
    db.prepare(`UPDATE prof_stores SET qty = qty - MAX(0, ${qtySql} - ${bought})
      WHERE player = ?1 AND char_id = ?2 AND origin = 'own' AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds),
    db.prepare(`UPDATE prof_stores SET qty = MAX(0, qty - ${qtySql})
      WHERE player = ?1 AND char_id = ?2 AND origin = 'bought' AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds),
    db.prepare('DELETE FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND qty = 0').bind(player, character),
    unbruisedClamp(db, { player, character, materialSql, guard, binds }),   // AUDIT PROF12 A1
  ];
}

/** GOLD-MARKET: spend `qtySql` units of a material over the origins `order` names, first to last - each charged what the
 *  ones before it cannot cover, read before they are charged (so the statements run last-first) - where `guard` holds;
 *  the rows left at 0 deleted, and the unbruised count clamped (unbruisedClamp, AUDIT PROF12 A1). A withdrawal spends ['gold', 'bought', 'own'] (every unit goes to the pack); a gold
 *  listing ['gold', 'own']. The caller's decision holds the units of exactly these origins. */
export function spendOrigins(db, { player, character, materialSql, qtySql, guard, binds, order }) {
  const heldOf = (o) => `COALESCE((SELECT h.qty FROM prof_stores h WHERE h.player = ?1 AND h.char_id = ?2 AND h.material = ${materialSql} AND h.origin = '${o}'), 0)`;
  const out = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const covered = i > 0 ? order.slice(0, i).map(heldOf).join(' + ') : '0';
    out.push(db.prepare(`UPDATE prof_stores SET qty = MAX(0, qty - MAX(0, ${qtySql} - (${covered})))
      WHERE player = ?1 AND char_id = ?2 AND origin = '${order[i]}' AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds));
  }
  out.push(db.prepare('DELETE FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND qty = 0').bind(player, character));
  out.push(unbruisedClamp(db, { player, character, materialSql, guard, binds }));   // AUDIT PROF12 A1
  return out;
}
/** AUDIT BAG-CRAFT A1: A STATION'S SPEND - `qtySql` units over STATION_ORIGINS, loose first, then bought, then own (the
 *  order spendStatements charges the last two in); the caller's decision holds them by `workableSql`. */
export const workStatements = (db, opts) => spendOrigins(db, { ...opts, order: STATION_ORIGINS });
/** AUDIT BAG-CRAFT A1: what a station may spend of a Stores count (`storeOf`'s shape) - own, bought and loose. */
export const workHeld = (st) => (st?.own ?? 0) + (st?.bought ?? 0) + (st?.[LOOSE_ORIGIN] ?? 0);
