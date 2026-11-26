// @ts-check

// LINK_SQL reads the holdings migration 0078 reads, except renown_tracks: its char_id is second in the key, so a
// lookup by character scans the whole table.
export const LINK_SQL = 'WITH linked AS ('
  + 'SELECT MIN(MIN(o.created_at, COALESCE(o.registered_at, o.created_at))) AS t FROM players o'
  + ' WHERE o.id <> ?1 AND o.id IN ('
  + 'SELECT player FROM realm_census WHERE char_id = ?2'
  + ' UNION SELECT player_id FROM saves WHERE character_id = ?2'
  + ' UNION SELECT player FROM realm_characters WHERE origin_id = ?2'
  + ' UNION SELECT player FROM realm_passes WHERE origin_id = ?2))'
  + ' UPDATE players SET first_played_at = (SELECT t FROM linked)'
  + ' WHERE id = ?1 AND (SELECT t FROM linked) < MIN(created_at, COALESCE(registered_at, created_at), COALESCE(first_played_at, created_at))';

/** @param {{ db: any }} ctx @param {string} playerId @param {string} charId */
export async function linkFirstPlay({ db }, playerId, charId) {
  if (!playerId || typeof charId !== 'string' || !charId) return;
  // A failure is ignored: the save or customs it follows has already landed, and the next arrival links again.
  try { await db.prepare(LINK_SQL).bind(playerId, charId).run(); } catch { }
}
