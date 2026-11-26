// @ts-check
import { accountKind } from './accounts.js';
import { maskText } from '../../src/net/nameFilter.js';
import { festName, festText, festTown, festMapIdOk, FEST_DURATION_S, FEST_ACTIVE_MAX } from '../../src/net/playerFestivalLaw.js';
import { guestbookName } from '../../src/net/guestbookLaw.js';

const face = (/** @type {any} */ r) => ({
  id: Number(r.id), host: maskText(String(r.host_name)), mapId: Number(r.map_id), town: maskText(String(r.town)),
  name: maskText(String(r.name)), text: maskText(String(r.text)), startsAt: Number(r.starts_at), endsAt: Number(r.ends_at),
  mine: false,
});

/** @param {{ db: any, nowS: number }} ctx @param {any} player
 * @param {{ mapId?: unknown, town?: unknown, host?: unknown, name?: unknown, text?: unknown }} body */
export async function hostFestival({ db, nowS }, player, { mapId, town, host, name, text } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  const n = festName(name), x = festText(text), tw = festTown(town), h = guestbookName(host);
  if (!festMapIdOk(mapId) || !n || !x || !tw || !h) return { error: 'bad-festival' };
  const live = await db.prepare('SELECT player, map_id FROM player_festivals WHERE ends_at > ?').bind(nowS).all();
  const rows = live?.results ?? [];
  if (rows.some((r) => r.player === player.id)) return { error: 'festival-have' };
  if (rows.some((r) => Number(r.map_id) === mapId)) return { error: 'festival-town' };
  if (rows.length >= FEST_ACTIVE_MAX) return { error: 'festival-full' };
  const ends = nowS + FEST_DURATION_S;
  const r = await db.prepare(`INSERT INTO player_festivals (player, host_name, map_id, town, name, text, starts_at, ends_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM player_festivals WHERE ends_at > ? AND (player = ? OR map_id = ?))`)
    .bind(player.id, h, mapId, tw, n, x, nowS, ends, nowS, player.id, mapId).run();
  if (!r?.meta?.changes) return { error: 'festival-have' };
  return { ok: true, festival: { ...face({ id: r.meta.last_row_id, host_name: h, map_id: mapId, town: tw, name: n, text: x, starts_at: nowS, ends_at: ends }), mine: true } };
}

/** @param {{ db: any, nowS: number }} ctx @param {any} player */
export async function listFestivals({ db, nowS }, player) {
  const rows = await db.prepare('SELECT * FROM player_festivals WHERE ends_at > ? ORDER BY ends_at LIMIT ?').bind(nowS, FEST_ACTIVE_MAX).all();
  return { ok: true, festivals: (rows?.results ?? []).map((r) => ({ ...face(r), mine: r.player === player?.id })) };
}
