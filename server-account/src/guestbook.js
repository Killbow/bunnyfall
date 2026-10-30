// @ts-check
// GUESTBOOK (2026-10-30): A HOME'S GUESTBOOK, KEPT (src/net/guestbookLaw.js is its law). A registered account signs a
// home it is no insider of (homeVotes.js INSIDER) once every GUESTBOOK_SIGN_GAP_S, its line passed through the name
// filter as a board's note is (starred as it is read); the book keeps its newest GUESTBOOK_KEEP lines. Its insiders read
// it, newest first.
import { accountKind } from './accounts.js';
import { homeMapIdOk, homeBuildingKeyOk } from '../../src/net/homeLaw.js';
import { INSIDER } from './homeVotes.js';
import { maskText } from '../../src/net/nameFilter.js';
import { guestbookText, guestbookName, GUESTBOOK_KEEP, GUESTBOOK_SIGN_GAP_S, GUESTBOOK_READ_MAX } from '../../src/net/guestbookLaw.js';

/** The home at (map, key) stands, no knight's deed, and the account is none of its insiders - binds (map, key, player, player). */
const SIGNABLE = `EXISTS (SELECT 1 FROM homes h WHERE h.map_id = ? AND h.building_key = ? AND h.deed = 0 AND NOT ${INSIDER})`;

/**
 * SIGN: `{ ok }` or `{ error }`: 'homes-need-account', 'bad-guestbook', 'guestbook-soon' (signed within the gap),
 * 'no-home' (none stands there, or it is the account's own).
 * @param {{ db: any, nowS: number }} ctx @param {any} player
 * @param {{ mapId?: unknown, buildingKey?: unknown, name?: unknown, text?: unknown }} body
 */
export async function signGuestbook({ db, nowS }, player, { mapId, buildingKey, name, text } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  const n = guestbookName(name), line = guestbookText(text);
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey) || !n || !line) return { error: 'bad-guestbook' };
  const last = await db.prepare('SELECT MAX(signed_at) AS at FROM home_guestbook WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, player.id).first();
  if (Number(last?.at ?? 0) > nowS - GUESTBOOK_SIGN_GAP_S) return { error: 'guestbook-soon' };
  const r = await db.prepare(`INSERT INTO home_guestbook (map_id, building_key, player, name, text, signed_at) SELECT ?, ?, ?, ?, ?, ? WHERE ${SIGNABLE}`)
    .bind(mapId, buildingKey, player.id, n, line, nowS, mapId, buildingKey, player.id, player.id).run();
  if (!r?.meta?.changes) return { error: 'no-home' };
  await db.prepare(`DELETE FROM home_guestbook WHERE map_id = ? AND building_key = ? AND id NOT IN
    (SELECT id FROM home_guestbook WHERE map_id = ? AND building_key = ? ORDER BY id DESC LIMIT ?)`).bind(mapId, buildingKey, mapId, buildingKey, GUESTBOOK_KEEP).run();
  return { ok: true };
}

/**
 * READ: `{ ok, lines: [{ name, text, at }] }`, newest first, or `{ error }`: 'bad-guestbook', 'guestbook-not-yours'.
 * @param {{ db: any }} ctx @param {any} player @param {{ mapId?: unknown, buildingKey?: unknown }} body
 */
export async function readGuestbook({ db }, player, { mapId, buildingKey } = {}) {
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'bad-guestbook' };
  const mine = await db.prepare(`SELECT 1 AS one FROM homes h WHERE h.map_id = ? AND h.building_key = ? AND ${INSIDER}`).bind(mapId, buildingKey, player.id, player.id).first();
  if (!mine) return { error: 'guestbook-not-yours' };
  const rows = await db.prepare('SELECT name, text, signed_at FROM home_guestbook WHERE map_id = ? AND building_key = ? ORDER BY id DESC LIMIT ?').bind(mapId, buildingKey, GUESTBOOK_READ_MAX).all();
  return { ok: true, lines: (rows?.results ?? []).map((r) => ({ name: maskText(r.name), text: maskText(r.text), at: Number(r.signed_at) })) };
}
