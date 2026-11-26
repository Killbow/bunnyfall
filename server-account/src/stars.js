// @ts-check
// One batch holds the row, the Renown, the silver, and the budget fill, and every credit reads this claim's
// row alone, so a lost answer takes nothing.

import { verifyStarReceipt } from '../../src/net/starfall/starReceipt.js';
import { starTimes } from '../../src/net/starfall/starfallLaw.js';
import { renownForXp, renownRaidXp, RENOWN_XP_MAX, RENOWN_XP_HOUR_MAX, RENOWN_TRACKS_MAX } from '../../src/net/renown.js';
import { renownCharacterOk, renownNameOf, renownTrackOf, renownHeldSql } from './renownTracks.js';
import { spoilsGrantStatement } from './budget.js';

export const STAR_CLAIMS_DAY_MAX = 9;
export const STAR_CID_RE = /^[0-9a-f]{16}$/;
const HOUR_S = 3600;
const DAY_MS = 86_400_000;

export const starKeyOf = (n, k) => `${n}.${k}`;
export const starDayOf = (n, k) => Math.floor(starTimes(n, k).fallAt / DAY_MS);

// One spoils row per (star, account), because the relay hands a receipt to every socket of an account.
const spoilsOf = (db, star, account, cid, nowS) => [
  db.prepare('INSERT OR IGNORE INTO star_spoils (star, account, cid, at) VALUES (?1, ?2, ?3, ?4)').bind(star, account, cid, nowS),
  db.prepare('SELECT cid FROM star_spoils WHERE star = ?1 AND account = ?2').bind(star, account),
];
const spoilsAnswer = (res, cid) => res?.results?.[0]?.cid === cid;

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function starRecordOf({ db }, playerId) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM stars_held WHERE account = ?1').bind(playerId).first();
  return { held: int(r?.n) };
}

/** @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => Uint8Array }} ctx
 *  @param {{ id: string, handle?: string|null }} player
 *  @param {{ receipt: unknown, character: unknown, name?: unknown, cid?: unknown }} body
 *  @param {CryptoKey|null} publicKey @param {{ strike?: ((key: string, nonce: string) => any)|null }} [silver] */
export async function claimStar({ db, nowS, subtle, rand }, player, { receipt, character, name = null, cid = null }, publicKey, { strike = null } = {}) {
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyStarReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  const [n, k] = c.sf;
  const key = starKeyOf(n, k);
  const thanks = typeof cid === 'string' && STAR_CID_RE.test(cid);
  if (!player.handle) {
    const spoils = thanks ? spoilsAnswer((await db.batch(spoilsOf(db, key, player.id, cid, nowS)))[1], cid) : false;
    return { recorded: false, why: 'guest', ...(await starRecordOf({ db }, player.id)), spoils };
  }
  if (typeof character !== 'string' || !renownCharacterOk(character)) return { error: 'renown-character' };
  const day = starDayOf(n, k);
  const hour = Math.floor(nowS / HOUR_S);
  const before = await renownTrackOf({ db }, player.id, character);
  const xp = renownRaidXp(before?.level ?? 1);
  const nonce = hex(rand(new Uint8Array(8)));
  const mint = strike?.(key, nonce) ?? null;
  const mine = 'EXISTS (SELECT 1 FROM stars_held WHERE star = ?3 AND account = ?1 AND nonce = ?4)';
  const track = 'SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2';
  const refused = `(NOT EXISTS (${track}) AND ${renownHeldSql('?1')} >= ?9)`;
  const want = `CASE WHEN ${refused} THEN 0 ELSE MIN(?5, MAX(0, ?6 - COALESCE((${track}), 0))) END`;
  const room = 'CASE WHEN renown_hour >= ?8 THEN MAX(0, ?7 - renown_hour_xp) ELSE ?7 END';
  const credit = `CASE WHEN ${mine} THEN MIN(${want}, ${room}) ELSE 0 END`;
  const res = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO stars_held (star, account, day, char_id, xp, nonce, at, cid)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?9
       WHERE (SELECT COUNT(*) FROM stars_held WHERE account = ?2 AND day = ?3) < ?8
       RETURNING nonce`,
    ).bind(key, player.id, day, character, xp, nonce, nowS, STAR_CLAIMS_DAY_MAX, thanks ? cid : null),
    db.prepare(
      `UPDATE players SET
         renown_last_credit = ${credit},
         renown_hour_xp = CASE WHEN ${mine} THEN (CASE WHEN renown_hour >= ?8 THEN renown_hour_xp + ${credit} ELSE ${credit} END) ELSE renown_hour_xp END,
         renown_hour = CASE WHEN ${mine} THEN MAX(renown_hour, ?8) ELSE renown_hour END
       WHERE id = ?1
       RETURNING renown_last_credit AS credit`,
    ).bind(player.id, character, key, nonce, xp, RENOWN_XP_MAX, RENOWN_XP_HOUR_MAX, hour, RENOWN_TRACKS_MAX),
    db.prepare(
      `UPDATE renown_tracks SET xp = MIN(?5, xp + (SELECT renown_last_credit FROM players WHERE id = ?1)), name = COALESCE(?6, name), updated_at = ?7
       WHERE player = ?1 AND char_id = ?2 AND ${mine}`,
    ).bind(player.id, character, key, nonce, RENOWN_XP_MAX, renownNameOf(name), nowS),
    db.prepare(
      `INSERT INTO renown_tracks (player, char_id, name, xp, created_at, updated_at)
       SELECT ?1, ?2, ?5, renown_last_credit, ?6, ?6 FROM players
       WHERE id = ?1 AND renown_last_credit > 0
         AND NOT EXISTS (SELECT 1 FROM renown_tracks WHERE player = ?1 AND char_id = ?2)
         AND ${renownHeldSql('?1')} < ?7
         AND ${mine}`,
    ).bind(player.id, character, key, nonce, renownNameOf(name), nowS, RENOWN_TRACKS_MAX),
    db.prepare(`UPDATE stars_held SET xp = (SELECT renown_last_credit FROM players WHERE id = ?1) WHERE star = ?3 AND account = ?1 AND nonce = ?4`)
      .bind(player.id, character, key, nonce),
    db.prepare(track).bind(player.id, character),
    db.prepare('SELECT COUNT(*) AS n FROM stars_held WHERE account = ?1').bind(player.id),
    ...(thanks ? spoilsOf(db, key, player.id, cid, nowS) : []),
    ...(mint ? [mint] : []),
    spoilsGrantStatement(db, player.id, 0, `EXISTS (SELECT 1 FROM stars_held WHERE star = ?5 AND account = ?1 AND nonce = ?6)`, key, nonce),
  ]);
  const [row, decided, , , , after, count] = res;
  const spoils = thanks ? spoilsAnswer(res[8], cid) : false;
  const struck = !!mint && Number(res[7 + (thanks ? 2 : 0)]?.meta?.changes ?? 0) > 0;
  const held = int(count?.results?.[0]?.n);
  if (!row?.results?.length) {
    const had = await db.prepare('SELECT char_id, xp, cid FROM stars_held WHERE star = ?1 AND account = ?2').bind(key, player.id).first();
    if (!had) return { recorded: false, why: 'day-full', held, spoils };
    if (!thanks || had.cid !== cid) return { recorded: false, why: 'claimed', held, spoils };
    const now = await renownTrackOf({ db }, player.id, String(had.char_id));
    const paid = int(had.xp);
    return {
      recorded: false, why: 'claimed', held, spoils, own: true,
      renown: now
        ? { character: String(had.char_id), xp: now.xp, level: renownForXp(now.xp), credited: paid, rose: renownForXp(now.xp) > renownForXp(Math.max(0, now.xp - paid)) }
        : { character: String(had.char_id), xp: null, level: null, credited: 0, rose: false },
    };
  }
  const total = after?.results?.length ? int(after.results[0].xp) : null;
  const was = before?.xp ?? 0;
  return {
    recorded: true, held, spoils, key, struck,
    renown: total === null
      ? { character, xp: null, level: null, credited: 0, rose: false }
      : { character, xp: total, level: renownForXp(total), credited: Math.max(0, int(decided?.results?.[0]?.credit)), rose: renownForXp(total) > renownForXp(was) },
  };
}
