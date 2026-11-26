// @ts-check
// Every move is one batch whose first statement decides it against the rows as they stand, and whose other
// statements run only where it did.
import { isDeveloper } from './titles.js';
import { overAccountRate } from './accounts.js';
import { CHAR_ID_RE } from './service.js';
import { dice } from './unitRoll.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { skyClassicMinutes } from '../../src/net/skyLaw.js';
import { dayOfYearFromMinutes } from '../../src/world/gameDate.js';
import { homeMapIdOk, homeBuildingKeyOk } from '../../src/net/homeLaw.js';
import {
  festivalOpen, isFindSource, FIND_SOURCES, findCount, FIND_ASKS_PER_DAY, FIND_CAKES_PER_DAY,
  OFFERING_STOCK_MAX, OFFERING_FILL, OFFERING_TAKE, wareById, accountWare, bowlWare, festivalWaresHeld, SALE_RID_RE,
} from '../../src/net/festivalLaw.js';

export const FEST_OPS_MAX = 900;
export const FEST_OPS_WINDOW_S = 3600;

export const festivalSwitchOf = (/** @type {unknown} */ v) => (v === 'on' || v === 'dev' ? v : 'off');
export function festivalOpenFor(/** @type {any} */ player, /** @type {any} */ env) {
  const s = festivalSwitchOf(env?.FESTIVAL_OPEN);
  return s === 'on' || (s === 'dev' && isDeveloper(player, env));
}

const int = (/** @type {unknown} */ v) => (Number.isSafeInteger(Number(v)) ? Number(v) : 0);
const cakesOf = async (/** @type {any} */ db, /** @type {string} */ id) => int((await db.prepare('SELECT fest_cakes FROM players WHERE id = ?1').bind(id).first())?.fest_cakes);
export const skyDayAt = (/** @type {number} */ nowS) => dayOfYearFromMinutes(Math.floor(skyClassicMinutes(nowS * 1000)));

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} env */
async function gate(ctx, player, env) {
  if (!player?.handle) return { error: 'guest' };
  if (!festivalOpenFor(player, env)) return { error: 'closed' };
  if (overAccountRate(`fest:${player.id}`, ctx.nowS, FEST_OPS_MAX, FEST_OPS_WINDOW_S)) return { error: 'rate' };
  return null;
}
const inDays = (/** @type {number} */ nowS) => festivalOpen(nowS * 1000);

const ORPHAN = `player = ?1 AND NOT EXISTS (SELECT 1 FROM homes h WHERE h.map_id = fest_offerings.map_id
  AND h.building_key = fest_offerings.building_key AND h.player = fest_offerings.player AND h.char_id = fest_offerings.char_id)`;
const orphansHome = (/** @type {any} */ db, /** @type {string} */ id) => db.batch([
  db.prepare(`UPDATE players SET fest_cakes = fest_cakes + (SELECT COALESCE(SUM(stock), 0) FROM fest_offerings WHERE ${ORPHAN}),
    fest_bowls = fest_bowls + (SELECT COUNT(*) FROM fest_offerings WHERE ${ORPHAN}) WHERE id = ?1 AND EXISTS (SELECT 1 FROM fest_offerings WHERE ${ORPHAN})`).bind(id),
  db.prepare(`DELETE FROM fest_offerings WHERE ${ORPHAN}`).bind(id),
]);

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} env */
export async function festivalOf({ db, nowS }, player, env) {
  if (!player?.handle) return { error: 'guest' };
  await orphansHome(db, player.id);
  const { results: mine } = await db.prepare('SELECT map_id, building_key, char_id, stock FROM fest_offerings WHERE player = ?1').bind(player.id).all();
  const row = await db.prepare('SELECT fest_cakes, fest_bowls, fest_wares, fest_given, fest_taken FROM players WHERE id = ?1').bind(player.id).first();
  const finds = await db.prepare('SELECT found FROM fest_finds WHERE account = ?1 AND day = ?2').bind(player.id, utcDay(nowS)).first();
  return {
    cakes: int(row?.fest_cakes), bowls: int(row?.fest_bowls), wares: festivalWaresHeld(row?.fest_wares), given: int(row?.fest_given), taken: int(row?.fest_taken),
    today: int(finds?.found),
    open: festivalOpenFor(player, env) && inDays(nowS),
    offerings: (mine ?? []).map((/** @type {any} */ r) => ({ mapId: int(r.map_id), buildingKey: int(r.building_key), character: String(r.char_id), stock: int(r.stock) })),
  };
}

/** @param {{ db: any, nowS: number, rand?: (b: Uint8Array) => Uint8Array }} ctx
 * @param {{ id: string, handle?: string|null }} player @param {any} body @param {any} env */
export async function findFestival(ctx, player, body, env) {
  const shut = await gate(ctx, player, env);
  if (shut) return shut;
  const { db, nowS, rand } = ctx;
  if (!inDays(nowS)) return { error: 'closed' };
  const source = body?.source;
  if (!isFindSource(source)) return { error: 'source' };
  const day = utcDay(nowS);
  const ask = await db.prepare(`INSERT INTO fest_finds (account, day, asks, found) VALUES (?1, ?2, 1, 0)
    ON CONFLICT (account, day) DO UPDATE SET asks = asks + 1 WHERE asks < ?3 RETURNING asks, found`).bind(player.id, day, FIND_ASKS_PER_DAY).first();
  if (!ask) return { error: 'capped', cakes: await cakesOf(db, player.id) };
  let found = 0;
  const left = FIND_CAKES_PER_DAY - int(ask.found);
  const want = Math.min(findCount(source, skyDayAt(nowS), nowS * 1000), left);
  if (want > 0 && typeof rand === 'function' && dice(rand) < FIND_SOURCES[source].p) {
    const [took] = await db.batch([
      db.prepare('UPDATE fest_finds SET found = found + ?3 WHERE account = ?1 AND day = ?2 AND found + ?3 <= ?4 RETURNING found').bind(player.id, day, want, FIND_CAKES_PER_DAY),
      db.prepare('UPDATE players SET fest_cakes = fest_cakes + ?2 WHERE id = ?1 AND changes() > 0').bind(player.id, want),
    ]);
    if (took?.results?.[0]) found = want;
  }
  const today = FIND_CAKES_PER_DAY - left + found;
  return { found, cakes: await cakesOf(db, player.id), today, ...(today >= FIND_CAKES_PER_DAY ? { capped: true } : {}) };
}

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body
 * @param {any} env */
export async function buyFestival(ctx, player, body, env) {
  const { db, nowS } = ctx;
  const rid = body?.rid;
  if (typeof rid !== 'string' || !SALE_RID_RE.test(rid)) return { error: 'rid' };
  if (player?.handle) {
    // A repeated sale is answered before the gate, so a sale that landed gets its answer whatever the switch says.
    const had = await db.prepare('SELECT ware FROM fest_sales WHERE account = ?1 AND rid = ?2').bind(player.id, rid).first();
    if (had) return { repeat: true, ...(await saleAnswer(db, player.id, had.ware)) };
  }
  const shut = await gate(ctx, player, env);
  if (shut) return shut;
  if (!inDays(nowS)) return { error: 'closed' };
  const w = wareById(body?.ware);
  if (!w) return { error: 'ware' };
  const own = accountWare(w), bowl = bowlWare(w);
  if (own && festivalWaresHeld((await db.prepare('SELECT fest_wares FROM players WHERE id = ?1').bind(player.id).first())?.fest_wares).includes(w.id)) return { error: 'owned' };
  const [took] = await db.batch([
    db.prepare(`UPDATE players SET fest_cakes = fest_cakes - ?2${own ? ", fest_wares = TRIM(fest_wares || ' ' || ?3)" : ''}${bowl ? ', fest_bowls = fest_bowls + 1' : ''}
      WHERE id = ?1 AND fest_cakes >= ?2${own ? " AND (' ' || fest_wares || ' ') NOT LIKE ('% ' || ?3 || ' %')" : ''} RETURNING fest_cakes`)
      .bind(player.id, w.price, ...(own ? [w.id] : [])),
    db.prepare('INSERT INTO fest_sales (account, rid, ware, price, at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE changes() > 0').bind(player.id, rid, w.id, w.price, nowS),
  ]);
  if (!took?.results?.[0]) return { error: 'cakes', cakes: await cakesOf(db, player.id) };
  return saleAnswer(db, player.id, w.id);
}
async function saleAnswer(/** @type {any} */ db, /** @type {string} */ id, /** @type {string} */ ware) {
  const row = await db.prepare('SELECT fest_cakes, fest_bowls, fest_wares FROM players WHERE id = ?1').bind(id).first();
  return { ware, cakes: int(row?.fest_cakes), bowls: int(row?.fest_bowls), wares: festivalWaresHeld(row?.fest_wares) };
}

const OWNED_HOME = `EXISTS (SELECT 1 FROM homes h WHERE h.map_id = ?1 AND h.building_key = ?2 AND h.player = ?3 AND h.char_id = ?4 AND h.guild_id IS NULL)`;
const homeOk = (/** @type {any} */ b) => homeMapIdOk(b?.mapId) && homeBuildingKeyOk(b?.buildingKey);
const charOk = (/** @type {any} */ b) => typeof b?.character === 'string' && CHAR_ID_RE.test(b.character);

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body
 * @param {any} env */
export async function festivalTown({ db, nowS }, player, body, env) {
  if (!homeMapIdOk(body?.mapId)) return { error: 'bad-home' };
  const day = utcDay(nowS);
  const open = !!player?.handle && festivalOpenFor(player, env) && inDays(nowS);
  const { results } = await db.prepare(`SELECT o.building_key, o.stock, o.player, h.owner_name,
      EXISTS (SELECT 1 FROM fest_takes t WHERE t.map_id = o.map_id AND t.building_key = o.building_key AND t.taker = ?2 AND t.day = ?3) AS taken
    FROM fest_offerings o JOIN homes h ON h.map_id = o.map_id AND h.building_key = o.building_key AND h.player = o.player AND h.char_id = o.char_id
    WHERE o.map_id = ?1${open ? '' : ' AND o.player = ?2'}`).bind(body.mapId, player?.id ?? '', day).all();
  return {
    mapId: body.mapId,
    open,
    offerings: (results ?? []).map((/** @type {any} */ r) => ({
      buildingKey: int(r.building_key), stock: int(r.stock), owner: String(r.owner_name ?? ''), mine: r.player === player?.id, taken: Number(r.taken) === 1,
    })),
  };
}

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body
 * @param {any} env */
export async function setOffering(ctx, player, body, env) {
  const shut = await gate(ctx, player, env);
  if (shut) return shut;
  const { db, nowS } = ctx;
  if (!inDays(nowS)) return { error: 'closed' };
  if (!homeOk(body) || !charOk(body)) return { error: 'home' };
  const { mapId, buildingKey, character } = body;
  if (!(await db.prepare(`SELECT ${OWNED_HOME} AS own`).bind(mapId, buildingKey, player.id, character).first())?.own) return { error: 'home' };
  const old = await db.prepare('SELECT player, char_id FROM fest_offerings WHERE map_id = ?1 AND building_key = ?2').bind(mapId, buildingKey).first();
  if (old && old.player === player.id && old.char_id === character) return { error: 'set' };
  const may = `${OWNED_HOME} AND (SELECT fest_bowls FROM players WHERE id = ?3) >= 1`;
  const prev = `map_id = ?1 AND building_key = ?2 AND player = ?5 AND char_id = ?6`;
  const [, , spent, laid] = await db.batch([
    db.prepare(`UPDATE players SET fest_cakes = fest_cakes + (SELECT stock FROM fest_offerings WHERE ${prev}), fest_bowls = fest_bowls + 1
      WHERE id = ?5 AND EXISTS (SELECT 1 FROM fest_offerings WHERE ${prev}) AND ${may}`).bind(mapId, buildingKey, player.id, character, old?.player ?? '', old?.char_id ?? ''),
    db.prepare(`DELETE FROM fest_offerings WHERE ${prev} AND ${may}`).bind(mapId, buildingKey, player.id, character, old?.player ?? '', old?.char_id ?? ''),
    db.prepare(`UPDATE players SET fest_bowls = fest_bowls - 1 WHERE id = ?3 AND ${may}
      AND NOT EXISTS (SELECT 1 FROM fest_offerings WHERE map_id = ?1 AND building_key = ?2) RETURNING fest_bowls`).bind(mapId, buildingKey, player.id, character),
    db.prepare(`INSERT INTO fest_offerings (map_id, building_key, player, char_id, stock, placed_at) SELECT ?1, ?2, ?3, ?4, 0, ?5 WHERE changes() > 0
      ON CONFLICT DO NOTHING RETURNING stock`).bind(mapId, buildingKey, player.id, character, nowS),
  ]);
  if (laid?.results?.[0]) return { ok: true, stock: 0, bowls: int(spent?.results?.[0]?.fest_bowls) };
  if (!(await db.prepare(`SELECT ${OWNED_HOME} AS own`).bind(mapId, buildingKey, player.id, character).first())?.own) return { error: 'home' };
  const row = await db.prepare('SELECT fest_bowls FROM players WHERE id = ?1').bind(player.id).first();
  return int(row?.fest_bowls) < 1 ? { error: 'item', bowls: 0 } : { error: 'set' };
}

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body
 * @param {any} env */
export async function fillOffering(ctx, player, body, env) {
  const shut = await gate(ctx, player, env);
  if (shut) return shut;
  const { db, nowS } = ctx;
  if (!inDays(nowS)) return { error: 'closed' };
  if (!homeOk(body) || !charOk(body)) return { error: 'home' };
  const { mapId, buildingKey, character } = body;
  const row = await db.prepare('SELECT o.stock, p.fest_cakes FROM fest_offerings o JOIN players p ON p.id = o.player WHERE o.map_id = ?1 AND o.building_key = ?2 AND o.player = ?3 AND o.char_id = ?4')
    .bind(mapId, buildingKey, player.id, character).first();
  if (!row) return { error: 'none' };
  const n = Math.min(OFFERING_FILL, OFFERING_STOCK_MAX - int(row.stock), int(row.fest_cakes));
  if (int(row.stock) >= OFFERING_STOCK_MAX) return { error: 'full' };
  if (n <= 0) return { error: 'cakes', cakes: int(row.fest_cakes) };
  const [took] = await db.batch([
    db.prepare(`UPDATE players SET fest_cakes = fest_cakes - ?5 WHERE id = ?3 AND fest_cakes >= ?5
      AND (SELECT stock FROM fest_offerings WHERE map_id = ?1 AND building_key = ?2 AND player = ?3 AND char_id = ?4) + ?5 <= ?6 RETURNING fest_cakes`)
      .bind(mapId, buildingKey, player.id, character, n, OFFERING_STOCK_MAX),
    db.prepare('UPDATE fest_offerings SET stock = stock + ?5 WHERE map_id = ?1 AND building_key = ?2 AND player = ?3 AND char_id = ?4 AND changes() > 0')
      .bind(mapId, buildingKey, player.id, character, n),
  ]);
  if (!took?.results?.[0]) return { error: 'cakes', cakes: await cakesOf(db, player.id) };
  const now = await db.prepare('SELECT stock FROM fest_offerings WHERE map_id = ?1 AND building_key = ?2').bind(mapId, buildingKey).first();
  return { stock: int(now?.stock), cakes: int(took.results[0].fest_cakes), moved: n };
}

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body */
export async function takeInOffering(ctx, player, body) {
  if (!player?.handle) return { error: 'guest' };
  if (overAccountRate(`fest:${player.id}`, ctx.nowS, FEST_OPS_MAX, FEST_OPS_WINDOW_S)) return { error: 'rate' };
  const { db } = ctx;
  if (!homeOk(body) || !charOk(body)) return { error: 'home' };
  const { mapId, buildingKey, character } = body;
  const key = 'map_id = ?1 AND building_key = ?2 AND player = ?3 AND char_id = ?4';
  const [back, gone] = await db.batch([
    db.prepare(`UPDATE players SET fest_cakes = fest_cakes + (SELECT stock FROM fest_offerings WHERE ${key}), fest_bowls = fest_bowls + 1
      WHERE id = ?3 AND EXISTS (SELECT 1 FROM fest_offerings WHERE ${key}) RETURNING fest_cakes, fest_bowls`).bind(mapId, buildingKey, player.id, character),
    db.prepare(`DELETE FROM fest_offerings WHERE ${key} AND changes() > 0 RETURNING stock`).bind(mapId, buildingKey, player.id, character),
  ]);
  const was = gone?.results?.[0], now = back?.results?.[0];
  if (!was || !now) return { error: 'none' };
  return { ok: true, returned: int(was.stock), cakes: int(now.fest_cakes), bowls: int(now.fest_bowls) };
}

/** @param {{ db: any, nowS: number }} ctx @param {{ id: string, handle?: string|null }} player @param {any} body
 * @param {any} env */
export async function takeFromOffering(ctx, player, body, env) {
  const shut = await gate(ctx, player, env);
  if (shut) return shut;
  const { db, nowS } = ctx;
  if (!inDays(nowS)) return { error: 'closed' };
  if (!homeOk(body)) return { error: 'home' };
  const { mapId, buildingKey } = body;
  const o = await db.prepare(`SELECT o.player, o.stock FROM fest_offerings o JOIN homes h ON h.map_id = o.map_id AND h.building_key = o.building_key AND h.player = o.player AND h.char_id = o.char_id
    WHERE o.map_id = ?1 AND o.building_key = ?2`).bind(mapId, buildingKey).first();
  if (!o) return { error: 'none' };
  if (o.player === player.id) return { error: 'own' };
  const day = utcDay(nowS);
  const [took] = await db.batch([
    db.prepare(`INSERT INTO fest_takes (map_id, building_key, taker, day) SELECT ?1, ?2, ?3, ?4
      WHERE (SELECT o.stock FROM fest_offerings o JOIN homes h ON h.map_id = o.map_id AND h.building_key = o.building_key AND h.player = o.player AND h.char_id = o.char_id
        WHERE o.map_id = ?1 AND o.building_key = ?2 AND o.player = ?6 AND o.player <> ?3) >= ?5 ON CONFLICT DO NOTHING RETURNING taker`).bind(mapId, buildingKey, player.id, day, OFFERING_TAKE, o.player),
    db.prepare('UPDATE fest_offerings SET stock = stock - ?3 WHERE map_id = ?1 AND building_key = ?2 AND changes() > 0').bind(mapId, buildingKey, OFFERING_TAKE),
    db.prepare(`UPDATE players SET fest_cakes = fest_cakes + ?2, fest_taken = fest_taken + ?2 WHERE id = ?1
      AND EXISTS (SELECT 1 FROM fest_takes WHERE map_id = ?3 AND building_key = ?4 AND taker = ?1 AND day = ?5)
      AND changes() > 0`).bind(player.id, OFFERING_TAKE, mapId, buildingKey, day),
    db.prepare('UPDATE players SET fest_given = fest_given + ?2 WHERE id = ?1 AND changes() > 0').bind(o.player, OFFERING_TAKE),
  ]);
  if (!took?.results?.[0]) {
    const had = await db.prepare('SELECT 1 AS t FROM fest_takes WHERE map_id = ?1 AND building_key = ?2 AND taker = ?3 AND day = ?4').bind(mapId, buildingKey, player.id, day).first();
    return { error: had ? 'taken' : 'empty' };
  }
  const left = await db.prepare('SELECT stock FROM fest_offerings WHERE map_id = ?1 AND building_key = ?2').bind(mapId, buildingKey).first();
  return { ok: true, cakes: await cakesOf(db, player.id), stock: int(left?.stock) };
}

export const FEST_STATUS = Object.freeze({ guest: 403, closed: 409, rate: 429, capped: 429 });
