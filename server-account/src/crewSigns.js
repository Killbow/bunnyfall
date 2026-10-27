// @ts-check
// CREW-SIGNED (2026-10-27; bible/03-World/Shipyards.md CREW-SIGNED) - A CREW HALL'S RECRUIT SIGNED ONCE ONLINE, the
// service's half (the law src/net/crewSignLaw.js, the table migrations/0182's).
//   HALL (/v1/crew/hall): a town's hall on a day - the slots others hold, and the asker's own.
//   SIGN (/v1/crew/sign): held by the first account to ask, for his day; asked again by it, the same; else `crew-taken`.
//   RELEASE (/v1/crew/release): a recruit the asker holds let go. An account holds CREW_SIGN_DAY_MAX a day.
// No gold moves here: the fee is the client's purse's, as every hire's was. Not a DFU member.
import { crewSignOf, crewDayOk, CREW_SIGN_DAY_MAX, CREW_SIGN_SLOTS, CREW_SIGN_KEEP_DAYS, crewDayAt } from '../../src/net/crewSignLaw.js';

/** A refusal's HTTP status. */
export const CREW_STATUS = Object.freeze({ 'crew-bad': 400, 'crew-day': 400, 'crew-taken': 409, 'crew-many': 429 });

/** The id asked, read and on the shared day - or the refusal. */
function asked(ctx, id) {
  const s = crewSignOf(id);
  if (!s) return { error: 'crew-bad' };
  if (!crewDayOk(s.day, ctx.nowS * 1000)) return { error: 'crew-day' };
  return s;
}

/** HALL: `{ town, day }` - `{ taken, mine }`, the slots held by others and by the asker. @param {any} ctx @param {any} player @param {any} body */
export async function crewHall(ctx, player, body = {}) {
  const town = Number(body?.town), day = Number(body?.day);
  if (!Number.isInteger(town) || town < 0 || town > 0xffffffff || !Number.isInteger(day) || day < 0) return { error: 'crew-bad' };
  if (!crewDayOk(day, ctx.nowS * 1000)) return { error: 'crew-day' };
  const { results } = await ctx.db.prepare('SELECT slot, player FROM crew_signed WHERE town = ?1 AND day = ?2').bind(town, day).all();
  const taken = [], mine = [];
  for (const r of results ?? []) if (r.slot >= 0 && r.slot < CREW_SIGN_SLOTS) (r.player === player.id ? mine : taken).push(r.slot);
  return { taken: taken.sort(), mine: mine.sort() };
}

/** SIGN: `{ id }` - `{ signed: true, fresh }` (`fresh` when this ask took him), or `crew-taken`. @param {any} ctx @param {any} player @param {any} body */
export async function crewSign(ctx, player, body = {}) {
  const s = asked(ctx, body?.id);
  if ('error' in s) return s;
  const held = await ctx.db.prepare('SELECT player FROM crew_signed WHERE town = ?1 AND day = ?2 AND slot = ?3').bind(s.town, s.day, s.slot).first();
  if (held) return held.player === player.id ? { signed: true, fresh: false } : { error: 'crew-taken' };
  const n = await ctx.db.prepare('SELECT COUNT(*) AS n FROM crew_signed WHERE player = ?1 AND day = ?2').bind(player.id, s.day).first();
  if (Number(n?.n ?? 0) >= CREW_SIGN_DAY_MAX) return { error: 'crew-many' };
  // the first to write him holds him: a race between two asks is settled by the key, and the loser reads the winner
  const r = await ctx.db.prepare('INSERT OR IGNORE INTO crew_signed (town, day, slot, player, at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(s.town, s.day, s.slot, player.id, ctx.nowS).run();
  if (Number(r?.meta?.changes ?? 0) > 0) return { signed: true, fresh: true };
  const won = await ctx.db.prepare('SELECT player FROM crew_signed WHERE town = ?1 AND day = ?2 AND slot = ?3').bind(s.town, s.day, s.slot).first();
  return won?.player === player.id ? { signed: true, fresh: false } : { error: 'crew-taken' };
}

/** RELEASE: `{ id }` - `{ released }`, whether the asker held him. Any day's id is let go. @param {any} ctx @param {any} player @param {any} body */
export async function crewRelease(ctx, player, body = {}) {
  const s = crewSignOf(body?.id);
  if (!s) return { error: 'crew-bad' };
  const r = await ctx.db.prepare('DELETE FROM crew_signed WHERE town = ?1 AND day = ?2 AND slot = ?3 AND player = ?4').bind(s.town, s.day, s.slot, player.id).run();
  return { released: Number(r?.meta?.changes ?? 0) > 0 };
}

/** The sweep (cron.js): rows CREW_SIGN_KEEP_DAYS past their day - `[sql, cutoff day]`. */
export const crewSweep = (/** @type {number} */ nowS) => /** @type {[string, number]} */ ([
  'DELETE FROM crew_signed WHERE rowid IN (SELECT rowid FROM crew_signed WHERE day < ?1 LIMIT ?2)', crewDayAt(nowS * 1000) - CREW_SIGN_KEEP_DAYS,
]);
