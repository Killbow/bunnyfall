// @ts-check
import { displayName } from './accounts.js';
import { titleWorn, glyphsOf } from './titles.js';
import { withArenaHonoursAll } from './arena.js';
import { withIliacHonoursAll } from './iliac.js';
import { withEgHonoursAll } from './egHonours.js';
import { withGambitHonoursAll } from './gambit.js';
import { withMasteryMarksAll } from './hunts.js';

/**
 * @param {{ db: any }} ctx @param {string[]} ids @param {any} env @param {number} nowS
 * @param {{ arena?: (row: any) => any, iliac?: (row: any) => any, gambit?: (row: any) => any }} own
 */
export async function boardNamesOf(ctx, ids, env, nowS, own) {
  const want = [...new Set(ids.filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < want.length; i += 50) {
    const part = want.slice(i, i + 50);
    let rows = (await ctx.db.prepare(`SELECT * FROM players WHERE id IN (${part.map((_, k) => `?${k + 1}`).join(', ')})`).bind(...part).all()).results ?? [];
    if (!own.arena) rows = await withArenaHonoursAll(ctx, rows, nowS);
    if (!own.iliac) rows = await withIliacHonoursAll(ctx, rows, nowS);
    rows = await withEgHonoursAll(ctx, rows, nowS);
    if (!own.gambit) rows = await withGambitHonoursAll(ctx, rows, nowS);
    rows = await withMasteryMarksAll(ctx, rows);
    for (const row of rows) {
      const withH = { ...row, ...(own.arena ? { arena: own.arena(row) } : {}), ...(own.iliac ? { iliac: own.iliac(row) } : {}), ...(own.gambit ? { gambit: own.gambit(row) } : {}) };
      out.set(row.id, { name: displayName(row), title: titleWorn(withH, env) ?? null, glyphs: glyphsOf(withH, env, nowS) });
    }
  }
  return out;
}
