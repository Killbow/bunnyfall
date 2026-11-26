// @ts-check
// The cloud save is a backup and the local save is the truth: nothing here merges, resolves a conflict, or deletes
// a save the player did not delete. Every statement binds the player id of the resolved session, never a caller's.

import { SAVES_MAX, SAVE_NAME_MAX, saveKey } from './service.js';
import { linkFirstPlay } from './founderLink.js';

export const CHARACTER_NAME_MAX = 64;
export const VERSION_TAG_MAX = 64;

const wholeOrNull = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const textOrNull = (v, max) => (typeof v === 'string' && v ? v.slice(0, max) : null);

/** @param {any} body */
export function saveCardOf(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return {
    characterName: textOrNull(body.characterName, CHARACTER_NAME_MAX),
    gameTime: wholeOrNull(body.gameTime),
    realTime: wholeOrNull(body.realTime),
    dfuVersion: textOrNull(body.dfuVersion, VERSION_TAG_MAX),
    saveVersion: wholeOrNull(body.saveVersion),
  };
}

const cardView = (r) => ({
  characterId: r.character_id,
  saveName: r.save_name,
  characterName: r.character_name ?? null,
  gameTime: r.game_time ?? null,
  realTime: r.real_time ?? null,
  dfuVersion: r.dfu_version ?? null,
  saveVersion: r.save_version ?? null,
  bytes: r.bytes ?? 0,
  shotBytes: r.shot_bytes ?? 0,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listSaves({ db }, playerId) {
  const r = await db.prepare(
    'SELECT character_id, save_name, character_name, game_time, real_time, dfu_version, save_version, bytes, shot_bytes, created_at, updated_at'
    + ' FROM saves WHERE player_id = ? ORDER BY updated_at DESC LIMIT ?',
  ).bind(playerId, SAVES_MAX).all();
  return (r?.results ?? []).map(cardView);
}

export async function putCard({ db, nowS }, playerId, { characterId, saveName, card }) {
  if (!playerId || !characterId || !saveName || saveName.length > SAVE_NAME_MAX) return { error: 'body' };
  if (!card) return { error: 'body' };
  const have = await db.prepare('SELECT 1 AS one FROM saves WHERE player_id = ? AND character_id = ? AND save_name = ?')
    .bind(playerId, characterId, saveName).first();
  // The slot bound is checked inside the INSERT, so two new slots racing for the last place cannot both land.
  // The conflict update leaves the byte counts alone, so a rewritten card never marks a finished backup unfinished.
  const wrote = await db.prepare(
    'INSERT INTO saves (player_id, character_id, save_name, character_name, game_time, real_time, dfu_version, save_version, bytes, shot_bytes, created_at, updated_at)'
    + ' SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?'
    + ' WHERE EXISTS (SELECT 1 FROM saves WHERE player_id = ? AND character_id = ? AND save_name = ?)'
    + ' OR (SELECT COUNT(*) FROM saves WHERE player_id = ?) < ?'
    + ' ON CONFLICT (player_id, character_id, save_name) DO UPDATE SET'
    + ' character_name = excluded.character_name, game_time = excluded.game_time, real_time = excluded.real_time,'
    + ' dfu_version = excluded.dfu_version, save_version = excluded.save_version, updated_at = excluded.updated_at',
  ).bind(
    playerId, characterId, saveName, card.characterName, card.gameTime, card.realTime,
    card.dfuVersion, card.saveVersion, nowS, nowS,
    playerId, characterId, saveName, playerId, SAVES_MAX,
  ).run();
  if (!wrote.meta.changes) return { error: 'too-many-saves' };
  if (!have) await linkFirstPlay({ db }, playerId, characterId);
  return { ok: true, created: !have };
}

export async function putBlob({ db, bucket, nowS }, playerId, { characterId, saveName }, part, body, bytes) {
  if (!bucket) return { error: 'no-storage' };
  const have = await db.prepare('SELECT 1 AS one FROM saves WHERE player_id = ? AND character_id = ? AND save_name = ?')
    .bind(playerId, characterId, saveName).first();
  // A blob needs its card: SAVES_MAX counts rows, so this check is also what bounds R2.
  if (!have) return { error: 'no-slot' };
  await bucket.put(saveKey(playerId, characterId, saveName, part), body);
  const col = part === 'shot' ? 'shot_bytes' : 'bytes';
  await db.prepare(`UPDATE saves SET ${col} = ?, updated_at = ? WHERE player_id = ? AND character_id = ? AND save_name = ?`)
    .bind(bytes, nowS, playerId, characterId, saveName).run();
  return { ok: true, bytes };
}

export async function getBlob({ db, bucket }, playerId, { characterId, saveName }, part) {
  if (!bucket) return { error: 'no-storage' };
  const have = await db.prepare('SELECT 1 AS one FROM saves WHERE player_id = ? AND character_id = ? AND save_name = ?')
    .bind(playerId, characterId, saveName).first();
  if (!have) return { error: 'no-slot' };
  const obj = await bucket.get(saveKey(playerId, characterId, saveName, part));
  return obj ? { ok: true, object: obj } : { error: 'no-data' };
}

export async function deleteSave({ db, bucket }, playerId, { characterId, saveName }) {
  const have = await db.prepare('SELECT 1 AS one FROM saves WHERE player_id = ? AND character_id = ? AND save_name = ?')
    .bind(playerId, characterId, saveName).first();
  if (!have) return { error: 'no-slot' };
  // The objects go before the row, so a run cut off partway leaves the row; a delete that throws is skipped
  // and the row still goes.
  if (bucket) {
    for (const part of ['data', 'shot']) {
      try { await bucket.delete(saveKey(playerId, characterId, saveName, part)); }
      catch { }
    }
  }
  await db.prepare('DELETE FROM saves WHERE player_id = ? AND character_id = ? AND save_name = ?')
    .bind(playerId, characterId, saveName).run();
  return { ok: true };
}

