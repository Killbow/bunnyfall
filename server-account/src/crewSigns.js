// @ts-check
import { crewSignOf, crewDayOk, CREW_SIGN_DAY_MAX, CREW_SIGN_SLOTS, CREW_SIGN_KEEP_DAYS, crewDayAt } from '../../src/net/crewSignLaw.js';
import { renownCharacterOk } from './renownTracks.js';

export const CREW_STATUS = Object.freeze({ 'crew-bad': 400, 'crew-day': 400, 'crew-taken': 409, 'crew-many': 429 });

const holderOf = (player, character) => (renownCharacterOk(character) ? `${player.id}:${character}` : null);
// An account id is base64url and never holds `:` or `;`, so this range covers exactly one account's holders.
const accountSpan = (player) => [`${player.id}:`, `${player.id};`];

function asked(ctx, id) {
  const s = crewSignOf(id);
  if (!s) return { error: 'crew-bad' };
  if (!crewDayOk(s.day, ctx.nowS * 1000)) return { error: 'crew-day' };
  return s;
}

/** @param {any} ctx @param {any} player @param {any} body */
export async function crewHall(ctx, player, body = {}) {
  const town = Number(body?.town), day = Number(body?.day), who = holderOf(player, body?.character);
  if (!who || !Number.isInteger(town) || town < 0 || town > 0xffffffff || !Number.isInteger(day) || day < 0) return { error: 'crew-bad' };
  if (!crewDayOk(day, ctx.nowS * 1000)) return { error: 'crew-day' };
  const { results } = await ctx.db.prepare('SELECT slot, player FROM crew_signed WHERE town = ?1 AND day = ?2').bind(town, day).all();
  const taken = [], mine = [];
  for (const r of results ?? []) if (r.slot >= 0 && r.slot < CREW_SIGN_SLOTS) (r.player === who ? mine : taken).push(r.slot);
  return { taken: taken.sort(), mine: mine.sort() };
}

/** @param {any} ctx @param {any} player @param {any} body */
export async function crewSign(ctx, player, body = {}) {
  const s = asked(ctx, body?.id);
  if ('error' in s) return s;
  const who = holderOf(player, body?.character);
  if (!who) return { error: 'crew-bad' };
  const [lo, hi] = accountSpan(player);
  // The cap and the hold are one statement, because parallel requests could all pass a count read before the write.
  for (let tries = 0; tries < 2; tries++) {
    const r = await ctx.db.prepare(`INSERT OR IGNORE INTO crew_signed (town, day, slot, player, at) SELECT ?1, ?2, ?3, ?4, ?5
      WHERE (SELECT COUNT(*) FROM crew_signed WHERE player >= ?6 AND player < ?7 AND day = ?2) < ?8`)
      .bind(s.town, s.day, s.slot, who, ctx.nowS, lo, hi, CREW_SIGN_DAY_MAX).run();
    if (Number(r?.meta?.changes ?? 0) > 0) return { signed: true, fresh: true };
    const held = await ctx.db.prepare(`SELECT (SELECT player FROM crew_signed WHERE town = ?1 AND day = ?2 AND slot = ?3) AS holder,
      (SELECT COUNT(*) FROM crew_signed WHERE player >= ?4 AND player < ?5 AND day = ?2) AS n`).bind(s.town, s.day, s.slot, lo, hi).first();
    if (held?.holder != null) return held.holder === who ? { signed: true, fresh: false } : { error: 'crew-taken' };
    if (Number(held?.n ?? 0) >= CREW_SIGN_DAY_MAX) return { error: 'crew-many' };
  }
  return { error: 'crew-taken' };
}

/** @param {any} ctx @param {any} player @param {any} body */
export async function crewRelease(ctx, player, body = {}) {
  const s = crewSignOf(body?.id), who = holderOf(player, body?.character);
  if (!s || !who) return { error: 'crew-bad' };
  const r = await ctx.db.prepare('DELETE FROM crew_signed WHERE town = ?1 AND day = ?2 AND slot = ?3 AND player = ?4').bind(s.town, s.day, s.slot, who).run();
  return { released: Number(r?.meta?.changes ?? 0) > 0 };
}

export const crewSweep = (/** @type {number} */ nowS) => /** @type {[string, number]} */ ([
  'DELETE FROM crew_signed WHERE rowid IN (SELECT rowid FROM crew_signed WHERE day < ?1 LIMIT ?2)', crewDayAt(nowS * 1000) - CREW_SIGN_KEEP_DAYS,
]);
