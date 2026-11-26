// @ts-check
import { REALM_CHARACTER_RE } from '../../src/net/identityToken.js';
import { arenaSeasonOf, arenaSeasonEndsS } from '../../src/net/arenaLaw.js';
import { seaSeasonFigures, SEA_SEASON_ROWS, SEA_SEASON_LAST_ROWS } from '../../src/net/sea/seaSeasonLaw.js';

// These steps run in the batch of a clean checkpoint, after the verdict writes, so a hold laid by that checkpoint
// applies. Each figure only rises.
/** @param {any} db @param {{ player: string, char: string }} at @param {any} save @param {number} nowS */
export function seaSeasonSteps(db, { player, char }, save, nowS) {
  const f = seaSeasonFigures(save, nowS);
  if (!f || (f.deepest === 0 && f.legends === 0)) return [];
  return [db.prepare(`INSERT INTO sea_season (season, char_id, player, deepest, deep_at, legends, legends_at, at)
    SELECT ?1, ?2, ?3, ?4, ?6, ?5, ?6, ?6 WHERE NOT EXISTS (SELECT 1 FROM realm_characters WHERE id = ?2 AND held IS NOT NULL)
    ON CONFLICT (season, char_id) DO UPDATE SET
      deep_at = CASE WHEN excluded.deepest > sea_season.deepest THEN excluded.at ELSE sea_season.deep_at END,
      deepest = MAX(sea_season.deepest, excluded.deepest),
      legends_at = CASE WHEN excluded.legends > sea_season.legends THEN excluded.at ELSE sea_season.legends_at END,
      legends = MAX(sea_season.legends, excluded.legends),
      at = excluded.at`).bind(f.n, char, player, f.deepest, f.legends, nowS)];
}

const WAYS = Object.freeze({ deep: ['deepest', 'deep_at'], legends: ['legends', 'legends_at'] });

/** @param {any} ctx @param {any} player @param {any} body */
export async function seaSeasonBoard(ctx, player, body) {
  const { db, nowS } = ctx;
  const season = arenaSeasonOf(nowS);
  const character = typeof body?.character === 'string' && REALM_CHARACTER_RE.test(body.character) ? body.character : null;
  const top = (/** @type {string[]} */ [n, at], /** @type {number} */ s, /** @type {number} */ limit) => db.prepare(`SELECT rc.name AS name, s.${n} AS n
    FROM sea_season s JOIN realm_characters rc ON rc.id = s.char_id AND rc.held IS NULL
    WHERE s.season = ?1 AND s.${n} > 0 ORDER BY s.${n} DESC, s.${at}, rc.name LIMIT ?2`).bind(s, limit);
  const rank = (/** @type {string[]} */ [n, at]) => db.prepare(`SELECT s.${n} AS n, 1 + (SELECT COUNT(*) FROM sea_season o
      JOIN realm_characters orc ON orc.id = o.char_id AND orc.held IS NULL
      WHERE o.season = s.season AND o.${n} > 0 AND (o.${n} > s.${n} OR (o.${n} = s.${n} AND (o.${at} < s.${at} OR (o.${at} = s.${at} AND orc.name < rc.name))))) AS rank
    FROM sea_season s JOIN realm_characters rc ON rc.id = s.char_id AND rc.held IS NULL
    WHERE s.season = ?1 AND s.char_id = ?2 AND s.player = ?3 AND s.${n} > 0`).bind(season, character, player.id);
  const [deep, legends, lastDeep, lastLegends, ...mine] = await db.batch([
    top(WAYS.deep, season, SEA_SEASON_ROWS), top(WAYS.legends, season, SEA_SEASON_ROWS),
    top(WAYS.deep, season - 1, SEA_SEASON_LAST_ROWS), top(WAYS.legends, season - 1, SEA_SEASON_LAST_ROWS),
    ...(character ? [rank(WAYS.deep), rank(WAYS.legends)] : []),
  ]);
  const rows = (/** @type {any} */ r) => (r?.results ?? []).map((x) => ({ name: x.name, n: Number(x.n) }));
  const ranked = (/** @type {any} */ r) => { const x = r?.results?.[0]; return x ? { rank: Number(x.rank), n: Number(x.n) } : null; };
  return {
    season, ends: arenaSeasonEndsS(season),
    deep: rows(deep), legends: rows(legends),
    mine: { deep: ranked(mine[0]), legends: ranked(mine[1]) },
    last: { deep: rows(lastDeep), legends: rows(lastLegends) },
  };
}
