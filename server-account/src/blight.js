// @ts-check
// BUNNYFALL COMPANIES (2026-11-12, the war against Rodney): WHAT THE SERVICE KEEPS OF RODNEY'S BLIGHT - each slice's
// reach past Cromwark (migration 0199), grown on the first read of each UTC day, and the raids that pushed it back. The
// law both ends read is src/net/blightLaw.js; the client draws it and lays its territories over it.
//
// A push is a cleared raid's: the account must hold the raid's counted claim (raid_cleanses, raids.js), and a raid
// pushes once, whoever claims it first. The slice is the client's word (the service knows no map) - a friends' server.
import { blightStart, blightExtrasOf, blightGrown, blightPushed, BLIGHT_SECTORS } from '../../src/net/blightLaw.js';

const DAY_S = 86400;
const RAID_KEY_RE = /^\d{1,2}:\d{1,5}:\d{1,7}$/;

/** The blight as it stands today - grown for every day since it was last read. */
async function blightNow(db, nowS) {
  const today = Math.floor(nowS / DAY_S);
  let row = await db.prepare('SELECT day, extras FROM rodney_blight WHERE id = 1').first();
  if (!row) {
    const extras = blightStart();
    await db.prepare('INSERT OR IGNORE INTO rodney_blight (id, day, extras) VALUES (1, ?, ?)').bind(today, JSON.stringify(extras)).run();
    row = await db.prepare('SELECT day, extras FROM rodney_blight WHERE id = 1').first();
  }
  let extras;
  try { extras = blightExtrasOf(JSON.parse(row.extras)); } catch { extras = blightStart(); }
  const day = Number(row.day);
  if (day < today) {
    const grown = blightGrown(extras, today - day);
    // a second reader on the same morning finds the day moved and reads the grown row instead
    const r = await db.prepare('UPDATE rodney_blight SET day = ?1, extras = ?2 WHERE id = 1 AND day = ?3').bind(today, JSON.stringify(grown), day).run();
    if (r?.meta?.changes) return { day: today, extras: grown, text: JSON.stringify(grown) };
    return blightNow(db, nowS);
  }
  return { day, extras, text: String(row.extras) };
}

/**
 * THE BLIGHT: `{ ok, day, extras }` - each slice's reach past Cromwark today.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function blightRead({ db, nowS }) {
  const { day, extras } = await blightNow(db, nowS);
  return { ok: true, day, extras };
}

/**
 * A CLEARED RAID PUSHES THE BLIGHT BACK in slice `sector` (the client's measure of the raid's town against the edge):
 * the account holds the raid's counted claim, and the raid has not pushed before. Answers the blight after it.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function blightPush({ db, nowS }, player, { raid, sector } = {}) {
  if (!player?.id || typeof raid !== 'string' || !RAID_KEY_RE.test(raid) || !Number.isSafeInteger(sector) || sector < 0 || sector >= BLIGHT_SECTORS) return { error: 'blight-bad' };
  const cleared = await db.prepare('SELECT 1 FROM raid_cleanses WHERE raid = ? AND account = ?').bind(raid, player.id).first();
  if (!cleared) return { error: 'blight-not-cleared' };
  const ins = await db.prepare('INSERT OR IGNORE INTO rodney_blight_pushes (raid, sector, account, at) VALUES (?, ?, ?, ?)').bind(raid, sector, player.id, nowS).run();
  if (!ins?.meta?.changes) return { ok: true, repeat: true };
  for (let tries = 0; tries < 3; tries++) {
    const b = await blightNow(db, nowS);
    const pushed = blightPushed(b.extras, sector);
    const r = await db.prepare('UPDATE rodney_blight SET extras = ?1 WHERE id = 1 AND day = ?2 AND extras = ?3').bind(JSON.stringify(pushed), b.day, b.text).run();
    if (r?.meta?.changes) return { ok: true, pushed: true, day: b.day, extras: pushed };
  }
  return { ok: true, pushed: false };
}

/**
 * GARRISONS AT THE FRONT (garrisons.js): slice `sector` pushed back `px` - a day's march, the service's own reckoning.
 * @param {any} db
 * @param {number} nowS
 */
export async function blightNudge(db, nowS, sector, px) {
  if (!Number.isSafeInteger(sector) || sector < 0 || sector >= BLIGHT_SECTORS || !(px > 0)) return false;
  for (let tries = 0; tries < 3; tries++) {
    const b = await blightNow(db, nowS);
    const r = await db.prepare('UPDATE rodney_blight SET extras = ?1 WHERE id = 1 AND day = ?2 AND extras = ?3').bind(JSON.stringify(blightPushed(b.extras, sector, px)), b.day, b.text).run();
    if (r?.meta?.changes) return true;
  }
  return false;
}
