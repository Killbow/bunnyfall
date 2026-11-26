// @ts-check

import {
  renownForXp, RENOWN_XP_MAX, RENOWN_XP_REPORT_MAX, RENOWN_XP_HOUR_MAX, RENOWN_TRACKS_MAX, RENOWN_NAME_MAX, renownRidOf,
} from '../../src/net/renown.js';
import { CHAR_ID_RE } from './service.js';

export const RENOWN_CARD_TRACKS = 5;

const HOUR_S = 3600;

export const renownCharacterOk = (c) => typeof c === 'string' && CHAR_ID_RE.test(c);

export function renownNameOf(name) {
  if (typeof name !== 'string') return null;
  const n = name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return n && n.length <= RENOWN_NAME_MAX ? n : null;
}

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);

export async function renownTrackOf({ db }, playerId, charId) {
  if (!renownCharacterOk(charId)) return null;
  const row = await db.prepare('SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2').bind(playerId, charId).first();
  if (!row) return null;
  const xp = int(row.xp);
  return { xp, level: renownForXp(xp) };
}

export async function renownTracksOf({ db }, playerId, limit = RENOWN_CARD_TRACKS) {
  const r = await db.prepare('SELECT char_id, name, xp, updated_at FROM renown_tracks WHERE player = ?1 ORDER BY updated_at DESC, char_id LIMIT ?2')
    .bind(playerId, limit).all();
  return (r?.results ?? []).map((t) => ({ character: t.char_id, name: t.name ?? null, xp: int(t.xp), level: renownForXp(int(t.xp)), updatedAt: int(t.updated_at) }));
}

export const renownHeldSql = (/** @type {string} */ p) => `(SELECT COUNT(*) FROM renown_tracks t WHERE t.player = ${p} AND NOT EXISTS (SELECT 1 FROM realm_characters r WHERE r.id = t.char_id AND r.player = ${p} AND r.dead_at IS NOT NULL))`;

export async function reportRenownXp({ db, nowS }, player, { character, xp, name = null, rid = null }) {
  if (!Number.isSafeInteger(nowS)) throw new TypeError('reportRenownXp needs an integer epoch-seconds clock');
  if (!renownCharacterOk(character)) return { error: 'renown-character' };
  if (!Number.isSafeInteger(xp) || xp < 1 || xp > RENOWN_XP_REPORT_MAX) return { error: 'renown-xp' };
  if (rid != null && !renownRidOf(rid)) return { error: 'renown-xp' };
  const id = rid ?? null;
  const hour = Math.floor(nowS / HOUR_S);
  const track = 'SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2';
  const repeat = `(?8 IS NOT NULL AND EXISTS (SELECT 1 FROM renown_tracks WHERE player = ?1 AND char_id = ?2 AND last_rid = ?8))`;
  const held = renownHeldSql('?1');
  const refused = `(NOT EXISTS (${track}) AND ${held} >= ?7)`;
  const want = `CASE WHEN ${repeat} OR ${refused} THEN 0 ELSE MIN(?3, MAX(0, ?4 - COALESCE((${track}), 0))) END`;
  const room = 'CASE WHEN renown_hour >= ?6 THEN MAX(0, ?5 - renown_hour_xp) ELSE ?5 END';
  const credit = `MIN(${want}, ${room})`;
  // A batch is one D1 transaction: the first statement decides the credit and the rest carry it out.
  // Every SET reads the row as it was, so renown_last_credit holds this credit before renown_hour_xp moves.
  const [decided, , , after] = await db.batch([
    db.prepare(
      `UPDATE players SET
         renown_last_credit = ${credit},
         renown_hour_xp = CASE WHEN renown_hour >= ?6 THEN renown_hour_xp + ${credit} ELSE ${credit} END,
         renown_hour = MAX(renown_hour, ?6)
       WHERE id = ?1
       RETURNING renown_last_credit AS credit, (${track}) AS before, ${repeat} AS repeat, ${refused} AS refused, renown_hour_xp AS hour_xp`,
    ).bind(player.id, character, xp, RENOWN_XP_MAX, RENOWN_XP_HOUR_MAX, hour, RENOWN_TRACKS_MAX, id),
    db.prepare(
      `UPDATE renown_tracks SET
         xp = MIN(?3, xp + (SELECT renown_last_credit FROM players WHERE id = ?1)),
         name = COALESCE(?4, name), last_rid = COALESCE(?5, last_rid), updated_at = ?6
       WHERE player = ?1 AND char_id = ?2`,
    ).bind(player.id, character, RENOWN_XP_MAX, renownNameOf(name), id, nowS),
    db.prepare(
      `INSERT INTO renown_tracks (player, char_id, name, xp, last_rid, created_at, updated_at)
       SELECT ?1, ?2, ?3, renown_last_credit, ?4, ?5, ?5 FROM players
       WHERE id = ?1 AND renown_last_credit > 0
         AND NOT EXISTS (SELECT 1 FROM renown_tracks WHERE player = ?1 AND char_id = ?2)
         AND ${held} < ?6`,
    ).bind(player.id, character, renownNameOf(name), id, nowS, RENOWN_TRACKS_MAX),
    db.prepare(track).bind(player.id, character),
  ]);
  const d = decided?.results?.[0];
  if (!d) throw new Error('reportRenownXp: no account row to charge');
  if (Number(d.refused) === 1) return { error: 'renown-full' };
  const before = int(d.before);
  const credited = Math.max(0, int(d.credit));
  const total = int(after?.results?.[0]?.xp);
  const level = renownForXp(total);
  const hourLeft = Math.max(0, RENOWN_XP_HOUR_MAX - int(d.hour_xp));
  return {
    character, xp: total, level, credited, rose: level > renownForXp(before), room: hourLeft,
    ...(total >= RENOWN_XP_MAX ? { max: true } : {}),
    ...(Number(d.repeat) === 1 ? { repeat: true } : {}),
  };
}
