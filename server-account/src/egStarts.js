// @ts-check

import { egStartsFrom } from '../../src/net/eliteGates/egStartLaw.js';
import { arenaSeasonOf, ARENA_SEASON_EPOCH_S, ARENA_SEASON_S } from '../../src/net/arenaLaw.js';
import { ID_RE } from '../../src/net/identityToken.js';
import { utcDay } from '../../src/net/marksLaw.js';

export const EG_STARTS_ASK_MAX = 8;
export const egSeasonStartS = (nowS) => ARENA_SEASON_EPOCH_S + (arenaSeasonOf(nowS) - 1) * ARENA_SEASON_S;
const int = (v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);

/** @param {any} db @param {string} id @param {number} nowS */
export async function egStartsFor(db, id, nowS) {
  const row = await db.prepare('SELECT handle FROM players WHERE id = ?1').bind(id).first();
  if (!row?.handle) return null;
  const season = await db.prepare('SELECT DISTINCT w FROM eg_redoubts WHERE account = ?1 AND at >= ?2').bind(id, egSeasonStartS(nowS)).all();
  const best = await db.prepare('SELECT MAX(w) AS w FROM eg_redoubts WHERE account = ?1').bind(id).first();
  return egStartsFrom((season?.results ?? []).map((r) => int(r.w)), int(best?.w));
}

/**
 * @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body
 * @param {string|null} relayKey
 */
export async function startsEg({ db, nowS }, player, body, relayKey) {
  if (!player.handle) return { error: 'guest' };
  const asked = body?.subs ?? [];
  if (!Array.isArray(asked) || asked.length > EG_STARTS_ASK_MAX || !asked.every((s) => typeof s === 'string' && ID_RE.test(s))) return { error: 'subs' };
  const subs = [...new Set([player.id, ...asked])].slice(0, EG_STARTS_ASK_MAX);
  const starts = {};
  for (const sub of subs) starts[sub] = await egStartsFor(db, sub, nowS);
  const me = await db.prepare('SELECT eg_keys, eg_rh_day FROM players WHERE id = ?1').bind(player.id).first();
  return { starts, keys: int(me?.eg_keys), rehearsal: int(me?.eg_rh_day) !== utcDay(nowS), rk: relayKey || null };
}
