// @ts-check

import { verifySerpentReceipt } from '../../src/net/serpentReceipt.js';
import { SERPENT_EMBERS } from '../../src/net/serpentHoardLaw.js';
import { renownForXp, renownSerpentXp, RENOWN_XP_MAX, RENOWN_XP_HOUR_MAX, RENOWN_TRACKS_MAX } from '../../src/net/renown.js';
import { renownCharacterOk, renownNameOf, renownTrackOf, renownHeldSql } from './renownTracks.js';
import { seededRng } from '../../src/weather/wind.js';

export const SERPENT_CID_RE = /^[0-9a-f]{16}$/;
export const SERPENT_STOOD_RENOWN = 0.5;
const HOUR_S = 3600;
export const SERPENT_HONOUR_TITLE = 1;
export const SERPENT_HONOUR_AURA = 2;
export const SERPENT_TITLE_CHANCE = 1 / 20;
export const SERPENT_AURA_CHANCE = 1 / 50;
export const SERPENT_HONOURS_SALT = 0x434f494c;
export function serpentHonoursRoll(seed) {
  const r = seededRng((seed ^ SERPENT_HONOURS_SALT) >>> 0);
  return { title: r() < SERPENT_TITLE_CHANCE, aura: r() < SERPENT_AURA_CHANCE };
}

// The relay hands a receipt to every socket of the account, so the first claim's device id owns the hoard row.
const hoardOf = (db, day, account, cid, nowS) => [
  db.prepare('INSERT OR IGNORE INTO serpent_spoils (day, account, cid, at) VALUES (?1, ?2, ?3, ?4)').bind(day, account, cid, nowS),
  db.prepare('SELECT cid FROM serpent_spoils WHERE day = ?1 AND account = ?2').bind(day, account),
];
const hoardAnswer = (res, cid) => res?.results?.[0]?.cid === cid;

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function serpentRecordOf({ db }, playerId) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM serpent_kills WHERE account = ?1').bind(playerId).first();
  return { slain: int(r?.n) };
}

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player
 * @param {{ receipt: unknown, character: unknown, name?: unknown, cid?: unknown, stones?: unknown }} body
 * @param {CryptoKey|null} publicKey */
export async function claimSerpent({ db, nowS, subtle, rand }, player, { receipt, character, name = null, cid = null, stones = null }, publicKey, { strike = null } = {}) {
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifySerpentReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  const hoard = typeof cid === 'string' && SERPENT_CID_RE.test(cid);
  if (!player.handle) {
    const spoils = hoard ? hoardAnswer((await db.batch(hoardOf(db, c.d, player.id, cid, nowS)))[1], cid) : false;
    return { recorded: false, why: 'guest', ...(await serpentRecordOf({ db }, player.id)), spoils };
  }
  if (typeof character !== 'string' || !renownCharacterOk(character)) return { error: 'renown-character' };
  const hour = Math.floor(nowS / HOUR_S);
  const before = await renownTrackOf({ db }, player.id, character);
  const xp = Math.floor(renownSerpentXp(before?.level ?? 1) * (c.x === 'stood' ? SERPENT_STOOD_RENOWN : 1));
  const nonce = hex(rand(new Uint8Array(8)));
  // Honours roll from this service's draw, never the receipt's seed, which the page holds.
  const draw = c.x === 'stood' ? null : rand(new Uint8Array(4));
  const { title, aura } = draw ? serpentHonoursRoll(((draw[0] << 24) | (draw[1] << 16) | (draw[2] << 8) | draw[3]) >>> 0) : { title: false, aura: false };
  const bits = (title ? SERPENT_HONOUR_TITLE : 0) | (aura ? SERPENT_HONOUR_AURA : 0);
  const prior = Number(player.serpent_honours) || 0;
  const embers = Number.isSafeInteger(stones) && stones > 0 ? Math.min(stones, SERPENT_EMBERS) : 0;
  const stmt = strike?.(c.d, nonce, c.x) ?? null;
  // The kill row is written first with this claim's nonce, and every credit, grant, and strike runs only where
  // that row exists. A receipt claimed twice at once pays once.
  const mine = 'EXISTS (SELECT 1 FROM serpent_kills WHERE day = ?3 AND account = ?1 AND nonce = ?4)';
  const track = 'SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2';
  const refused = `(NOT EXISTS (${track}) AND ${renownHeldSql('?1')} >= ?9)`;
  const want = `CASE WHEN ${refused} THEN 0 ELSE MIN(?5, MAX(0, ?6 - COALESCE((${track}), 0))) END`;
  const room = 'CASE WHEN renown_hour >= ?8 THEN MAX(0, ?7 - renown_hour_xp) ELSE ?7 END';
  const credit = `CASE WHEN ${mine} THEN MIN(${want}, ${room}) ELSE 0 END`;
  const res = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO serpent_kills (day, account, boss, hull, char_id, xp, nonce, at, stones, body, title, aura)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       RETURNING nonce`,
    ).bind(c.d, player.id, c.b, c.h, character, xp, nonce, nowS, embers, c.m ? JSON.stringify(c.m) : null, title ? 1 : 0, aura ? 1 : 0),
    db.prepare(
      `UPDATE players SET
         renown_last_credit = ${credit},
         renown_hour_xp = CASE WHEN ${mine} THEN (CASE WHEN renown_hour >= ?8 THEN renown_hour_xp + ${credit} ELSE ${credit} END) ELSE renown_hour_xp END,
         renown_hour = CASE WHEN ${mine} THEN MAX(renown_hour, ?8) ELSE renown_hour END,
         serpent_honours = CASE WHEN ${mine} THEN serpent_honours | ?10 ELSE serpent_honours END
       WHERE id = ?1
       RETURNING renown_last_credit AS credit`,
    ).bind(player.id, character, c.d, nonce, xp, RENOWN_XP_MAX, RENOWN_XP_HOUR_MAX, hour, RENOWN_TRACKS_MAX, bits),
    db.prepare(
      `UPDATE renown_tracks SET xp = MIN(?5, xp + (SELECT renown_last_credit FROM players WHERE id = ?1)), name = COALESCE(?6, name), updated_at = ?7
       WHERE player = ?1 AND char_id = ?2 AND ${mine}`,
    ).bind(player.id, character, c.d, nonce, RENOWN_XP_MAX, renownNameOf(name), nowS),
    db.prepare(
      `INSERT INTO renown_tracks (player, char_id, name, xp, created_at, updated_at)
       SELECT ?1, ?2, ?5, renown_last_credit, ?6, ?6 FROM players
       WHERE id = ?1 AND renown_last_credit > 0
         AND NOT EXISTS (SELECT 1 FROM renown_tracks WHERE player = ?1 AND char_id = ?2)
         AND ${renownHeldSql('?1')} < ?7
         AND ${mine}`,
    ).bind(player.id, character, c.d, nonce, renownNameOf(name), nowS, RENOWN_TRACKS_MAX),
    db.prepare(`UPDATE serpent_kills SET xp = (SELECT renown_last_credit FROM players WHERE id = ?1) WHERE day = ?3 AND account = ?1 AND nonce = ?4`)
      .bind(player.id, character, c.d, nonce),
    db.prepare(track).bind(player.id, character),
    db.prepare('SELECT COUNT(*) AS n FROM serpent_kills WHERE account = ?1').bind(player.id),
    ...(hoard ? hoardOf(db, c.d, player.id, cid, nowS) : []),
    ...(stmt ? [stmt] : []),
  ]);
  const [row, decided, , , , after, count] = res;
  const spoils = hoard ? hoardAnswer(res[8], cid) : false;
  const struck = !!stmt && Number(res[res.length - 1]?.meta?.changes ?? 0) > 0;
  const slain = int(count?.results?.[0]?.n);
  if (!row?.results?.length) {
    const kept = await db.prepare('SELECT stones FROM serpent_kills WHERE day = ?1 AND account = ?2').bind(c.d, player.id).first();
    return { recorded: false, why: 'claimed', slain, spoils, ...(Number.isSafeInteger(kept?.stones) ? { stones: kept.stones } : {}) };
  }
  const total = after?.results?.length ? int(after.results[0].xp) : null;
  const was = before?.xp ?? 0;
  return {
    recorded: true, slain, spoils, stones: embers, day: c.d, ...(stmt ? { struck } : {}),
    title, aura, titleNew: title && !(prior & SERPENT_HONOUR_TITLE), auraNew: aura && !(prior & SERPENT_HONOUR_AURA),
    renown: total === null
      ? { character, xp: null, level: null, credited: 0, rose: false }
      : { character, xp: total, level: renownForXp(total), credited: Math.max(0, int(decided?.results?.[0]?.credit)), rose: renownForXp(total) > renownForXp(was) },
  };
}
