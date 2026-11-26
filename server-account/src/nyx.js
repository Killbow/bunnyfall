// @ts-check

export const NYX_FOUND_MAX = 5;

export async function nyxFound({ db, nowS }, player, body) {
  const n = Math.trunc(Number(body?.n));
  if (!player?.id || !(n >= 1 && n <= NYX_FOUND_MAX)) return { error: 'bad-nyx' };
  const row = await db.prepare('UPDATE players SET nyx_found = nyx_found + ?2, last_seen = ?3 WHERE id = ?1 RETURNING nyx_found, nyx_spent')
    .bind(player.id, n, nowS).first();
  return row ? { ok: true, found: row.nyx_found, spent: row.nyx_spent } : { error: 'bad-nyx' };
}

export async function nyxTotal({ db }, player) {
  const all = await db.prepare('SELECT COALESCE(SUM(nyx_found), 0) AS total, COALESCE(SUM(nyx_spent), 0) AS spent, COUNT(CASE WHEN nyx_found > 0 THEN 1 END) AS players FROM players').first();
  const mine = player?.id ? await db.prepare('SELECT nyx_found, nyx_spent FROM players WHERE id = ?').bind(player.id).first() : null;
  const shots = await db.prepare('SELECT nyx_bonus FROM cannon WHERE id = 1').first().catch(() => null);
  return { ok: true, total: (Number(all?.total) || 0) + (Number(shots?.nyx_bonus) || 0), spent: Number(all?.spent) || 0, players: Number(all?.players) || 0, mine: { found: Number(mine?.nyx_found) || 0, spent: Number(mine?.nyx_spent) || 0 } };
}
