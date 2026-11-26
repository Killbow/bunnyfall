// @ts-check

import { verifyRaidReceipt } from '../../src/net/raidReceipt.js';
import { raidDayOfKey } from '../../src/net/raidLaw.js';
import { renownForXp, renownRaidXp, RENOWN_XP_MAX, RENOWN_XP_HOUR_MAX, RENOWN_TRACKS_MAX } from '../../src/net/renown.js';
import { renownCharacterOk, renownNameOf, renownTrackOf, renownHeldSql } from './renownTracks.js';

export const RAID_CLAIMS_DAY_MAX = 6;
export const RAID_CID_RE = /^[0-9a-f]{16}$/;
const HOUR_S = 3600;

const thanksOf = (db, raid, account, cid, nowS) => [
  db.prepare('INSERT OR IGNORE INTO raid_spoils (raid, account, cid, at) VALUES (?1, ?2, ?3, ?4)').bind(raid, account, cid, nowS),
  db.prepare('SELECT cid FROM raid_spoils WHERE raid = ?1 AND account = ?2').bind(raid, account),
];
const thanksAnswer = (res, cid) => res?.results?.[0]?.cid === cid;

const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function raidRecordOf({ db }, playerId) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM raid_cleanses WHERE account = ?1').bind(playerId).first();
  return { defended: int(r?.n) };
}

/**
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player
 * @param {{ receipt: unknown, character: unknown, name?: unknown, cid?: unknown }} body
 * @param {CryptoKey|null} publicKey
 * @param {{ strike?: ((key: string, nonce: string) => any)|null, deeds?: ((key: string, nonce: string, character: string) => any[]|null)|null,
 *   contracts?: ((key: string, nonce: string) => Promise<{ statements: any[] }|null>)|null }} [silver]
 */
export async function claimRaid({ db, nowS, subtle, rand }, player, { receipt, character, name = null, cid = null }, publicKey, { strike = null, deeds = null, contracts = null, econ = null } = {}) {
  if (!publicKey) return { error: 'no-gate-key' };
  const v = await verifyRaidReceipt(receipt, publicKey, { subtle, nowS });
  if (!v.ok) return { error: 'receipt', why: v.why };
  const c = v.claims;
  if (c.s !== player.id) return { error: 'not-yours' };
  const thanks = typeof cid === 'string' && RAID_CID_RE.test(cid);
  if (!player.handle) {
    const spoils = thanks ? thanksAnswer((await db.batch(thanksOf(db, c.w, player.id, cid, nowS)))[1], cid) : false;
    return { recorded: false, why: 'guest', ...(await raidRecordOf({ db }, player.id)), spoils };
  }
  if (typeof character !== 'string' || !renownCharacterOk(character)) return { error: 'renown-character' };
  const day = raidDayOfKey(c.w);
  const hour = Math.floor(nowS / HOUR_S);
  const before = await renownTrackOf({ db }, player.id, character);
  const xp = renownRaidXp(before?.level ?? 1);
  const nonce = hex(rand(new Uint8Array(8)));
  const mint = strike?.(c.w, nonce) ?? null;
  const deed = deeds?.(c.w, nonce, character) ?? null;
  const paid = contracts ? await contracts(c.w, nonce) : null;
  const town = econ?.(c.w, nonce) ?? null;
  const mine = 'EXISTS (SELECT 1 FROM raid_cleanses WHERE raid = ?3 AND account = ?1 AND nonce = ?4)';
  const track = 'SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2';
  const refused = `(NOT EXISTS (${track}) AND ${renownHeldSql('?1')} >= ?9)`;
  const want = `CASE WHEN ${refused} THEN 0 ELSE MIN(?5, MAX(0, ?6 - COALESCE((${track}), 0))) END`;
  const room = 'CASE WHEN renown_hour >= ?8 THEN MAX(0, ?7 - renown_hour_xp) ELSE ?7 END';
  const credit = `CASE WHEN ${mine} THEN MIN(${want}, ${room}) ELSE 0 END`;
  // Every statement after the INSERT acts only where the claim row carries this nonce, so a receipt claimed twice
  // credits once.
  const res = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO raid_cleanses (raid, account, day, party, char_id, xp, nonce, at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
       WHERE (SELECT COUNT(*) FROM raid_cleanses WHERE account = ?2 AND day = ?3) < ?9
       RETURNING nonce`,
    ).bind(c.w, player.id, day, c.y, character, xp, nonce, nowS, RAID_CLAIMS_DAY_MAX),
    db.prepare(
      `UPDATE players SET
         renown_last_credit = ${credit},
         renown_hour_xp = CASE WHEN ${mine} THEN (CASE WHEN renown_hour >= ?8 THEN renown_hour_xp + ${credit} ELSE ${credit} END) ELSE renown_hour_xp END,
         renown_hour = CASE WHEN ${mine} THEN MAX(renown_hour, ?8) ELSE renown_hour END
       WHERE id = ?1
       RETURNING renown_last_credit AS credit`,
    ).bind(player.id, character, c.w, nonce, xp, RENOWN_XP_MAX, RENOWN_XP_HOUR_MAX, hour, RENOWN_TRACKS_MAX),
    db.prepare(
      `UPDATE renown_tracks SET xp = MIN(?5, xp + (SELECT renown_last_credit FROM players WHERE id = ?1)), name = COALESCE(?6, name), updated_at = ?7
       WHERE player = ?1 AND char_id = ?2 AND ${mine}`,
    ).bind(player.id, character, c.w, nonce, RENOWN_XP_MAX, renownNameOf(name), nowS),
    db.prepare(
      `INSERT INTO renown_tracks (player, char_id, name, xp, created_at, updated_at)
       SELECT ?1, ?2, ?5, renown_last_credit, ?6, ?6 FROM players
       WHERE id = ?1 AND renown_last_credit > 0
         AND NOT EXISTS (SELECT 1 FROM renown_tracks WHERE player = ?1 AND char_id = ?2)
         AND ${renownHeldSql('?1')} < ?7
         AND ${mine}`,
    ).bind(player.id, character, c.w, nonce, renownNameOf(name), nowS, RENOWN_TRACKS_MAX),
    db.prepare(`UPDATE raid_cleanses SET xp = (SELECT renown_last_credit FROM players WHERE id = ?1) WHERE raid = ?3 AND account = ?1 AND nonce = ?4`)
      .bind(player.id, character, c.w, nonce),
    db.prepare(track).bind(player.id, character),
    db.prepare('SELECT COUNT(*) AS n FROM raid_cleanses WHERE account = ?1').bind(player.id),
    ...(thanks ? thanksOf(db, c.w, player.id, cid, nowS) : []),
    ...(mint ? [mint] : []),
    ...(deed ?? []),
    ...(paid?.statements ?? []),
    ...(town ?? []),
  ]);
  const [row, decided, , , , after, count] = res;
  const spoils = thanks ? thanksAnswer(res[8], cid) : false;
  const at = 7 + (thanks ? 2 : 0);
  const struck = !!mint && Number(res[at]?.meta?.changes ?? 0) > 0;
  const deedStruck = !!deed && Number(res[at + (mint ? 1 : 0) + 1]?.meta?.changes ?? 0) > 0;
  const defended = int(count?.results?.[0]?.n);
  if (!row?.results?.length) {
    const had = await db.prepare('SELECT 1 AS x FROM raid_cleanses WHERE raid = ?1 AND account = ?2').bind(c.w, player.id).first();
    return { recorded: false, why: had ? 'claimed' : 'day-full', defended, spoils };
  }
  const total = after?.results?.length ? int(after.results[0].xp) : null;
  const was = before?.xp ?? 0;
  return {
    recorded: true, defended, spoils, ...(strike || deeds || contracts ? { key: c.w, struck, ...(deed ? { deedStruck } : {}) } : {}),
    renown: total === null
      ? { character, xp: null, level: null, credited: 0, rose: false }
      : { character, xp: total, level: renownForXp(total), credited: Math.max(0, int(decided?.results?.[0]?.credit)), rose: renownForXp(total) > renownForXp(was) },
  };
}
