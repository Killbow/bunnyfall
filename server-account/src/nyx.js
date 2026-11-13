// @ts-check
// BUNNYFALL (2026-11-04, Cromwark - src/systems/wild/cromwark.js): THE DUSK TOKENS THE SERVICE COUNTS. A kill in the reach
// of Cromwark may drop a coin into the killer's pack (scenes/cromwarkHost.js); the game tells this service each one
// found, so the account's titles from Nyx are paid out of coins it knows of (accounts.js buyInsignia, `currency: 'nyx'`),
// and the owner's /nyxcoin reads how many have been gathered (the realm's sum with the Great Cannon's shots, and the account's own).
// A friends' server: the count is the game's word, bounded a call (NYX_FOUND_MAX) and no more.

/** The most coins one word may report (a kill drops one; a word may carry a few kept back while the service was away). */
export const NYX_FOUND_MAX = 5;

/** A coin (or a few) found: `{ n }`. Answers `{ ok, found, spent }` - the account's after the word. */
export async function nyxFound({ db, nowS }, player, body) {
  const n = Math.trunc(Number(body?.n));
  if (!player?.id || !(n >= 1 && n <= NYX_FOUND_MAX)) return { error: 'bad-nyx' };
  const row = await db.prepare('UPDATE players SET nyx_found = nyx_found + ?2, last_seen = ?3 WHERE id = ?1 RETURNING nyx_found, nyx_spent')
    .bind(player.id, n, nowS).first();
  return row ? { ok: true, found: row.nyx_found, spent: row.nyx_spent } : { error: 'bad-nyx' };
}

/** THE COUNT: every coin gathered in the realm, by how many accounts, and this account's own. */
export async function nyxTotal({ db }, player) {
  const all = await db.prepare('SELECT COALESCE(SUM(nyx_found), 0) AS total, COALESCE(SUM(nyx_spent), 0) AS spent, COUNT(CASE WHEN nyx_found > 0 THEN 1 END) AS players FROM players').first();
  const mine = player?.id ? await db.prepare('SELECT nyx_found, nyx_spent FROM players WHERE id = ?').bind(player.id).first() : null;
  // the Great Cannon's shots, CANNON_NYX_BONUS each (server-account/src/cannon.js) - none before migration 0191
  const shots = await db.prepare('SELECT nyx_bonus FROM cannon WHERE id = 1').first().catch(() => null);
  return { ok: true, total: (Number(all?.total) || 0) + (Number(shots?.nyx_bonus) || 0), spent: Number(all?.spent) || 0, players: Number(all?.players) || 0, mine: { found: Number(mine?.nyx_found) || 0, spent: Number(mine?.nyx_spent) || 0 } };
}
