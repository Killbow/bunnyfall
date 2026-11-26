// @ts-check
// Online home decor lives here, so every visitor sees the room its owner furnished. Every write checks the
// home's owner in its own WHERE clause, so a piece in another home reads as missing.
import { accountKind, displayName, overRate } from './accounts.js';
import { CHAR_ID_RE, DB_ROOT, replicaDb, bookmarkOf } from './service.js';
import { homeMapIdOk, homeBuildingKeyOk } from '../../src/net/homeLaw.js';
import { DECOR_CAP, DECOR_HALL_CAP, DECOR_ID_RE, DECOR_OPS_MAX, DECOR_OPS_WINDOW_S, decorPieceOf, decorPlaceOf, decorHiddenOf, DECOR_YARD_CAP, DECOR_YARDS_TOWN_MAX, decorYardPieceOf, decorYardPlaceOf, decorYardHighOk, decorScaleOk, decorGoldMove, decorGoldDelta } from '../../src/net/decorLaw.js';
export { decorGoldMove, decorGoldDelta };
import { prepareRealmRecord, realmSideOf, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed, REALM_ID_RE } from './realm.js';
import { payFromSave, creditSave } from '../../src/net/realmGoldLaw.js';
import { GUILD_TREASURY_MAX } from '../../src/net/guildLaw.js';
import { HALL_POWERS } from '../../src/net/hallLaw.js';
import { SEAT_HALL_DECOR_CAP } from '../../src/net/townSeatLaw.js';
import { homeShownRead, homeShownOf } from './homeVotes.js';
import { decorStaysShunned } from '../../src/net/homeVoteLaw.js';
import { shapeOf, keptPast, KEPT_BOARD_MAX_BYTES } from './keptBoard.js';

function decorSideOf(/** @type {unknown} */ character, /** @type {unknown} */ realm, /** @type {number} */ delta) {
  const side = realmSideOf(character, realm);
  if (side.error === 'realm-needed' && realm == null && delta === 0) return { at: null };
  return side;
}

const homeRegionOf = async (db, mapId, buildingKey) => (await db.prepare('SELECT region FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first())?.region ?? null;

// The record is checked first, so a resent write whose answer was lost finds the sequence already advanced.
async function realmDecorWrite(ctx, player, at, { mapId, buildingKey, delta, write, after, refusal, regionOf = homeRegionOf }) {
  const { db, bucket } = ctx;
  const moved = await recordMovedOf(db, player.id, at);
  if (moved) return moved;
  const region = await regionOf(db, mapId, buildingKey);
  const prep = await prepareRealmRecord(ctx, player.id, at, (save) => (delta < 0
    ? (payFromSave(save, -delta, region) ? null : 'realm-gold')
    : (creditSave(save, delta) ? null : 'no-data')));
  if (prep.error) return prep;
  try {
    await db.batch([...prep.steps, write, mustChange(db)]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, at.id, prep.key);
    return (await recordMovedOf(db, player.id, at)) || { error: await refusal() };
  }
  await dropObjects(bucket, [prep.prev]);
  const piece = await after();
  return piece ? { ok: true, piece, gold: delta, realm: { seq: prep.seq } } : { error: 'no-decor' };
}

export const OWNS = `EXISTS (SELECT 1 FROM (SELECT ? AS m, ? AS b, ? AS p, ? AS c) k JOIN homes h ON h.map_id = k.m AND h.building_key = k.b
  WHERE (h.guild_id IS NULL AND h.player = k.p AND (h.deed = 0 OR h.char_id = k.c))
    OR (h.guild_id IS NOT NULL AND EXISTS (SELECT 1 FROM guild_members g WHERE g.guild_id = h.guild_id AND g.player = k.p AND g.char_id = k.c
      AND g.rank IN (${HALL_POWERS.decorate.join(', ')})
      AND EXISTS (SELECT 1 FROM realm_characters rc WHERE rc.id = g.char_id AND rc.player = k.p))))`;
const hallGuildOf = async (db, mapId, buildingKey) => (await db.prepare('SELECT guild_id FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first())?.guild_id ?? null;

const SEAT_OWNS = `EXISTS (SELECT 1 FROM (SELECT ? AS m, ? AS b, ? AS p, ? AS c) k JOIN town_seat_holds h ON h.key = k.m
  WHERE h.tier = 'palace' AND EXISTS (SELECT 1 FROM guild_members g WHERE g.guild_id = h.guild_id AND g.player = k.p AND g.char_id = k.c
    AND g.rank IN (${HALL_POWERS.decorate.join(', ')})
    AND EXISTS (SELECT 1 FROM realm_characters rc WHERE rc.id = g.char_id AND rc.player = k.p)))`;
const seatHallGuildOf = async (db, mapId) => (await db.prepare("SELECT guild_id FROM town_seat_holds WHERE key = ? AND tier = 'palace'").bind(mapId).first())?.guild_id ?? null;
const seatRegionOf = async (db, mapId) => (await db.prepare('SELECT region FROM town_seat_holds WHERE key = ?').bind(mapId).first())?.region ?? null;
const HOME_STORE = Object.freeze({
  table: 'home_decor', owns: OWNS, guildOf: hallGuildOf, regionOf: homeRegionOf, cap: DECOR_CAP, seat: false,
  count: (mapId, buildingKey, out) => ['map_id = ? AND building_key = ? AND yard = ?', [mapId, buildingKey, out]],
  rule: (mapId, buildingKey, barred) => ['(? = 0 OR NOT EXISTS (SELECT 1 FROM homes WHERE map_id = ? AND building_key = ? AND guild_id IS NOT NULL))', [barred, mapId, buildingKey]],
});
const SEAT_STORE = Object.freeze({
  table: 'seat_hall_decor', owns: SEAT_OWNS, guildOf: seatHallGuildOf, regionOf: seatRegionOf, cap: SEAT_HALL_DECOR_CAP, seat: true,
  count: (mapId, _buildingKey, out) => ['map_id = ? AND yard = ?', [mapId, out]],
  rule: (_mapId, _buildingKey, barred) => ['? = 0', [barred]],
});
const storeOf = (seat) => (seat === true ? SEAT_STORE : HOME_STORE);
const TOWN_ROOM_SQL = (/** @type {{table: string}} */ S) => `(? = 0 OR (SELECT COUNT(*) FROM ${S.table} WHERE map_id = ? AND yard = 1) < ?)`;
async function capWord(db, S, mapId, out) {
  if (!out) return 'decor-cap';
  const town = await db.prepare(`SELECT COUNT(*) AS n FROM ${S.table} WHERE map_id = ? AND yard = 1`).bind(mapId).first();
  return Number(town?.n) >= DECOR_YARDS_TOWN_MAX ? 'yard-town-full' : 'yard-cap';
}

async function hallPieceBack(ctx, player, guildId, { delta, write, after, refusal }) {
  const { db, nowS } = ctx;
  try {
    await db.batch([
      write, mustChange(db),
      db.prepare(`UPDATE guilds SET treasury = treasury + ?1, realm_gold = realm_gold + ?1, moved_by = ?2, moved_at = ?3, moved_kind = 'hall-piece'
        WHERE id = ?4 AND treasury + ?1 <= ?5`).bind(delta, displayName(player), nowS, guildId, GUILD_TREASURY_MAX),
      mustChange(db),
    ]);
  } catch {
    const g = await db.prepare('SELECT treasury FROM guilds WHERE id = ?').bind(guildId).first();
    return { error: g && g.treasury + delta > GUILD_TREASURY_MAX ? 'guild-treasury-full' : await refusal() };
  }
  const piece = await after();
  return piece ? { ok: true, piece, gold: 0, treasury: delta } : { error: 'no-decor' };
}
const hallBars = (piece, S, out) => (piece.item || (out && S.seat) ? 1 : 0);
const placeJson = ({ pos, rot, scale, light, storage, paid, station, name }) => JSON.stringify({ pos, rot, scale, light, storage, paid, ...(station ? { station } : {}), ...(name ? { name } : {}) });

function pieceOfRow(row) {
  let place = null;
  let item = null;
  try { place = JSON.parse(row.place); } catch { place = null; }
  if (!place || typeof place !== 'object') return null;
  if (row.item != null) {
    try { item = JSON.parse(row.item); } catch { return null; }
  }
  return decorPieceOf({
    ...place, id: row.id,
    model: row.model ?? null,
    flat: row.model == null ? [row.flat_archive, row.flat_record] : null,
    item,
  });
}

async function writeDoor({ db, nowS }, player, { mapId, buildingKey, character }, realmOnly = false) {
  if (accountKind(player) !== 'linked') return 'homes-need-account';
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return 'bad-home';
  if (typeof character !== 'string' || !CHAR_ID_RE.test(character)) return 'home-character';
  if (realmOnly && !REALM_ID_RE.test(character)) return 'realm-only';
  if (await overRate({ db, nowS }, `decor:${player.id}`, DECOR_OPS_MAX, DECOR_OPS_WINDOW_S)) return 'decor-rate';
  return null;
}

export async function vendorStocked(db, mapId, id) {
  return stockedOf(await vendorStockedRead(db, mapId, id).first());
}
const vendorStockedRead = (db, mapId, id) => db.prepare(`SELECT COUNT(*) AS n FROM market_listings WHERE vendor_map = ? AND vendor_id = ? AND state = 'open'`).bind(mapId, id);
const stockedOf = (r) => Number(r?.n ?? 0) > 0;

async function shopOf(db, mapId, pieces) {
  const traders = pieces.filter(decorStaysShunned);
  if (!traders.length) return [];
  const stock = await db.batch(traders.map((p) => vendorStockedRead(db, mapId, p.id)));
  return traders.filter((_, i) => stockedOf(stock[i]?.results?.[0]));
}

export async function decorOf({ db }, player, { mapId, buildingKey, seat = false, yard = false, revOnly = false } = {}) {
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'bad-home' };
  if (revOnly === true) {
    const row = await db.prepare('SELECT rev FROM decor_rev WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first();
    return { mapId, buildingKey, rev: Number(row?.rev) || 0 };
  }
  if (yard === true) {
    const yardRead = db.prepare(`SELECT * FROM home_decor WHERE map_id = ? AND building_key = ? AND yard = 1
      ORDER BY placed_at, id LIMIT ?`).bind(mapId, buildingKey, DECOR_YARD_CAP);
    const yardRev = db.prepare('SELECT rev FROM decor_rev WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey);
    const [{ results = [] }, revRow] = await db.batch([yardRead, yardRev]);
    return { mapId, buildingKey, pieces: results.map(pieceOfRow).filter(Boolean), hidden: [], rev: Number(revRow?.results?.[0]?.rev) || 0 };
  }
  const S = storeOf(seat);
  const piecesRead = db.prepare(`SELECT * FROM ${S.table} WHERE map_id = ? AND building_key = ? AND yard = 0
    ORDER BY placed_at, id LIMIT ?`).bind(mapId, buildingKey, S.seat ? S.cap : DECOR_HALL_CAP);
  const revRead = db.prepare('SELECT rev FROM decor_rev WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey);
  const revOf = (row) => Number(row?.rev ?? row?.results?.[0]?.rev) || 0;
  if (S.seat) {
    const [{ results = [] }, revRow] = await db.batch([piecesRead, revRead]);
    return { mapId, buildingKey, pieces: results.map(pieceOfRow).filter(Boolean), hidden: [], rev: revOf(revRow?.results?.[0]) };
  }
  const [{ results = [] }, shown, hidden, revRow] = await db.batch([piecesRead, homeShownRead(db, mapId, buildingKey, player?.id), hiddenRead(db, mapId, buildingKey), revRead]);
  const pieces = results.map(pieceOfRow).filter(Boolean);
  const rev = revOf(revRow?.results?.[0]);
  if (!homeShownOf(shown?.results?.[0] ?? null)) return { mapId, buildingKey, pieces: await shopOf(db, mapId, pieces), hidden: [], rev };
  return { mapId, buildingKey, pieces, hidden: hiddenListOf(hidden?.results?.[0] ?? null), rev };
}

/** @param {{db: any}} ctx */
export async function yardsOf({ db }, _player, { mapId } = {}) {
  if (!homeMapIdOk(mapId)) return { error: 'bad-home' };
  const snap = await db.prepare(YARD_SNAP_READ).bind(mapId).first();
  if (snap?.ver == null && !snap?.orphan) return { mapId, yards: [] };
  const fresh = snap.ver != null && Number(snap.built) === Number(snap.ver) && snap.shape === YARD_SNAP_SHAPE;
  if (fresh && snap.rows == null) keptPast('a town\'s yards', `town ${mapId}`);
  const built = fresh ? yardRowsOf(snap.rows) : null;
  const results = built ?? (await db.prepare(YARD_ROWS_SQL).bind(mapId).all()).results ?? [];
  const by = new Map();
  for (const row of results) {
    const p = pieceOfRow(row);
    if (!p || !decorYardPieceOf(p) || !decorYardHighOk(p)) continue;
    if (!by.has(row.building_key)) by.set(row.building_key, []);
    by.get(row.building_key).push(p);
  }
  return { mapId, yards: [...by].map(([buildingKey, pieces]) => ({ buildingKey, pieces })) };
}

export const YARD_SNAP_COLS = Object.freeze(['map_id', 'building_key', 'id', 'model', 'flat_archive', 'flat_record', 'place', 'placed_at', 'item', 'paid', 'yard']);
export const yardRowsSql = (/** @type {string} */ town) => `SELECT ${YARD_SNAP_COLS.join(', ')} FROM home_decor
    WHERE map_id = ${town} AND yard = 1 ORDER BY building_key, placed_at, id LIMIT ${DECOR_YARDS_TOWN_MAX}`;
const YARD_ROWS_SQL = yardRowsSql('?1');
export const YARD_SNAP_READ = `SELECT v.ver, y.built, y.shape, y.rows, v.map_id IS NULL AND EXISTS (SELECT map_id FROM home_decor WHERE map_id = ?1 AND yard = 1) AS orphan
  FROM (SELECT ?1 AS m) q LEFT JOIN home_yards_ver v ON v.map_id = q.m LEFT JOIN home_yards y ON y.map_id = q.m`;
// Migration 0175 built every town in this shape and bound. After a change to either, reads use the rows until the
// clock rebuilds each town; backfill in a migration if that is too slow.
export const YARD_SNAP_SHAPE = shapeOf('yards: [columns...] each, NULL past the bound', yardRowsSql('?'), KEPT_BOARD_MAX_BYTES);
export const YARDS_SETTLE_A_MINUTE = 50;
const YARD_FRESH_SQL = (/** @type {string} */ v) => `EXISTS (SELECT 1 FROM home_yards y WHERE y.map_id = ${v}.map_id AND y.built = ${v}.ver AND y.shape = '${YARD_SNAP_SHAPE}')`;
// The rows and the version are read in one statement, so no write lands between them.
const yardsBuildSql = (/** @type {string} */ where) => `INSERT INTO home_yards (map_id, built, shape, rows)
  SELECT v.map_id, v.ver, '${YARD_SNAP_SHAPE}', (SELECT CASE WHEN length(CAST(j AS BLOB)) <= ${KEPT_BOARD_MAX_BYTES} THEN j END
    FROM (SELECT json_group_array(json_array(${YARD_SNAP_COLS.join(', ')})) AS j FROM (${yardRowsSql('v.map_id')})))
  FROM home_yards_ver v WHERE NOT ${YARD_FRESH_SQL('v')} AND ${where}
  ON CONFLICT (map_id) DO UPDATE SET built = excluded.built, shape = excluded.shape, rows = excluded.rows`;
export const settleYards = (/** @type {any} */ db, /** @type {unknown} */ mapId) =>
  (homeMapIdOk(mapId) ? db.prepare(yardsBuildSql('v.map_id = ?1')).bind(mapId).run() : Promise.resolve(null));
export async function settleStaleYards(/** @type {any} */ db) {
  const r = await db.prepare(yardsBuildSql(`v.map_id IN (SELECT map_id FROM home_yards_ver s WHERE NOT ${YARD_FRESH_SQL('s')} LIMIT ${YARDS_SETTLE_A_MINUTE})`)).run();
  return Number(r?.meta?.changes ?? 0);
}
export function yardRowsOf(/** @type {unknown} */ text) {
  let list;
  try { list = JSON.parse(String(text)); } catch { return null; }
  if (!Array.isArray(list)) return null;
  const rows = [];
  for (const a of list) {
    if (!Array.isArray(a) || a.length !== YARD_SNAP_COLS.length) return null;
    rows.push(Object.fromEntries(YARD_SNAP_COLS.map((c, i) => [c, a[i]])));
  }
  const cmp = (/** @type {any} */ x, /** @type {any} */ y) => (x < y ? -1 : x > y ? 1 : 0);
  return rows.sort((x, y) => cmp(x.building_key, y.building_key) || cmp(x.placed_at, y.placed_at) || cmp(x.id, y.id));
}

export const YARDS_KEPT_S = 30;
export const YARDS_KEPT_MAX = 4096;
export const YARDS_FROM = 'first-unconstrained';
/** @type {Map<number, { at: number, answer: any }>} */
const keptYards = new Map();
/** @type {Map<number, Promise<any>>} */
const askingYards = new Map();
/** @type {Map<number, number>} */
const yardWrites = new Map();
/** @type {Map<number, string>} */
const yardsMark = new Map();
/** @type {Set<number>} */
const yardsWritten = new Set();
// D1 bookmarks sort oldest to newest as strings, so the largest dropped bookmark is a safe floor for later reads.
let yardsFloor = /** @type {string | null} */ (null);
export async function yardsKept(ctx, mapId, nowS) {
  if (!homeMapIdOk(mapId)) return { error: 'bad-home' };
  const kept = keptYards.get(mapId);
  if (kept && nowS - kept.at < YARDS_KEPT_S) return kept.answer;
  const asking = askingYards.get(mapId);
  if (asking) return asking;
  const gen = yardWrites.get(mapId) ?? 0;
  // After a write here, reads start at the primary, else at the last cached bookmark, so no answer goes backward.
  const wrote = yardsWritten.has(mapId);
  const from = wrote ? 'first-primary' : (yardsMark.get(mapId) ?? yardsFloor ?? YARDS_FROM);
  const root = ctx.db?.[DB_ROOT] ?? ctx.db;
  let db = ctx.db;
  try { db = replicaDb(typeof ctx.db?.withSession === 'function' ? ctx.db : root, from); } catch {}
  const ask = yardsOf({ ...ctx, db }, null, { mapId }).then((answer) => {
    if (!('error' in answer) && (yardWrites.get(mapId) ?? 0) === gen) {
      if (keptYards.size >= YARDS_KEPT_MAX && !keptYards.has(mapId)) {
        for (const m of yardsMark.values()) if (yardsFloor == null || m > yardsFloor) yardsFloor = m;
        keptYards.clear(); yardsMark.clear();
      }
      keptYards.set(mapId, { at: nowS, answer });
      const mark = bookmarkOf(db);
      if (mark) yardsMark.set(mapId, mark);
      if (wrote) yardsWritten.delete(mapId);
    }
    return answer;
  }, (e) => { if (yardsMark.get(mapId) === from) yardsMark.delete(mapId); if (yardsFloor === from) yardsFloor = null; throw e; })
    .finally(() => { if (askingYards.get(mapId) === ask) askingYards.delete(mapId); });
  askingYards.set(mapId, ask);
  return ask;
}
export function forgetYards(mapId) {
  if (!homeMapIdOk(mapId)) return;
  keptYards.delete(mapId);
  askingYards.delete(mapId);
  yardWrites.set(mapId, (yardWrites.get(mapId) ?? 0) + 1);
  yardsWritten.add(mapId);
}
export function _resetYardsKept() { keptYards.clear(); askingYards.clear(); yardWrites.clear(); yardsMark.clear(); yardsWritten.clear(); yardsFloor = null; }

const hiddenRead = (db, mapId, buildingKey) => db.prepare('SELECT keys FROM home_hidden WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey);
function hiddenListOf(row) {
  if (!row) return [];
  try { return decorHiddenOf(JSON.parse(row.keys)) ?? []; } catch { return []; }
}

/** @param {{db: any, nowS: number}} ctx */
export async function hideDecorBase(ctx, player, { mapId, buildingKey, character, keys, seat = false } = {}) {
  if (seat === true) return { error: 'bad-home' };
  const shut = await writeDoor(ctx, player, { mapId, buildingKey, character });
  if (shut) return { error: shut };
  const hidden = decorHiddenOf(keys);
  if (!hidden) return { error: 'bad-decor' };
  const { db } = ctx;
  const r = await db.prepare(`INSERT INTO home_hidden (map_id, building_key, keys) SELECT ?, ?, ? WHERE ${OWNS}
    ON CONFLICT (map_id, building_key) DO UPDATE SET keys = excluded.keys`)
    .bind(mapId, buildingKey, JSON.stringify(hidden), mapId, buildingKey, player.id, character).run();
  if (!r?.meta?.changes) return { error: 'no-home' };
  return { ok: true, hidden };
}

export async function provenOf(db, player, p, mapId, buildingKey) {
  const pv = p.item.pv;
  const plain = { ...p.item };
  delete plain.pv;
  delete plain.mk;
  const row = await db.prepare('SELECT owner, template, maker, marked, listed FROM products WHERE provenance = ?').bind(pv).first();
  const elsewhere = row ? await db.prepare(`SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?1
    AND NOT (map_id = ?2 AND building_key = ?3 AND id = ?4)`).bind(pv, mapId, buildingKey, p.id).first() : null;
  const ours = row && row.owner === player.id && Number(row.template) === p.item.t && Number(row.listed) === 0 && !elsewhere;
  return decorPieceOf({ ...p, item: ours ? { ...plain, pv, ...(Number(row.marked) === 1 && row.maker ? { mk: row.maker } : {}) } : plain });
}

/** @param {{db: any, nowS: number}} ctx */
export async function placeDecor(ctx, player, { mapId, buildingKey, character, piece, realm = null, yard = false, seat = false } = {}) {
  const { db, nowS } = ctx;
  const S = storeOf(seat);
  if (realm != null) {
    const first = await realmActFirst(db, player.id, character, realm);
    if (first.error) return first;
  }
  const shut = await writeDoor(ctx, player, { mapId, buildingKey, character }, true);
  if (shut) return { error: shut };
  const sent = yard === true ? decorYardPieceOf(piece) : decorPieceOf(piece);
  if (yard === true && sent && !decorYardHighOk(sent)) return { error: 'yard-high' };
  if (!sent || !decorScaleOk(sent)) return { error: 'bad-decor' };
  const guildHall = !S.seat && !!(await hallGuildOf(db, mapId, buildingKey));
  if (S.seat || guildHall) {
    if (yard === true && S.seat) return { error: 'hall-yard' };
    if (sent.item) return { error: 'hall-item' };
  }
  const out = yard === true ? 1 : 0;
  const barred = hallBars(sent, S, out);
  const p = sent.item?.pv ? await provenOf(db, player, sent, mapId, buildingKey) : sent;
  if (!p) return { error: 'bad-decor' };
  const { delta, ledger } = decorGoldMove(null, p);
  const side = decorSideOf(character, realm, delta);
  if (side.error) return side;
  // The hall rule is checked again inside the INSERT because the hall can change hands after the read.
  const [countSql, countBinds] = S.count(mapId, buildingKey, out), [ruleSql, ruleBinds] = S.rule(mapId, buildingKey, barred);
  // The products row is checked again inside the INSERT because a disenchant can remove it after the read.
  const pv = typeof p.item?.pv === 'string' ? p.item.pv : null;
  const pvSql = pv ? ' AND EXISTS (SELECT 1 FROM products WHERE provenance = ? AND owner = ? AND listed = 0)' : '';
  const insert = db.prepare(`INSERT OR IGNORE INTO ${S.table} (map_id, building_key, id, model, flat_archive, flat_record, place, placed_at, item, paid, yard)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${S.owns} AND (SELECT COUNT(*) FROM ${S.table} WHERE ${countSql}) < ?
      AND ${TOWN_ROOM_SQL(S)} AND ${ruleSql}${pvSql}`)
    .bind(mapId, buildingKey, p.id, p.model, p.flat?.[0] ?? null, p.flat?.[1] ?? null, placeJson(p), nowS, p.item ? JSON.stringify(p.item) : null,
      side.at ? ledger : 0, out, mapId, buildingKey, player.id, character, ...countBinds, out ? DECOR_YARD_CAP : (guildHall ? DECOR_HALL_CAP : S.cap),
      out, mapId, DECOR_YARDS_TOWN_MAX, ...ruleBinds, ...(pv ? [pv, player.id] : []));
  const hallWord = async () => (pv && !(await db.prepare('SELECT 1 FROM products WHERE provenance = ? AND owner = ? AND listed = 0').bind(pv, player.id).first()) ? 'bad-decor'
    : barred && (S.seat || await hallGuildOf(db, mapId, buildingKey)) ? (out ? 'hall-yard' : 'hall-item') : null);
  if (side.at && delta !== 0) {
    const had = await db.prepare(`SELECT * FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ?`).bind(mapId, buildingKey, p.id).first();
    if (had) return JSON.stringify(pieceOfRow(had)) === JSON.stringify(p) ? { ok: true, repeat: true, piece: pieceOfRow(had), realm: { seq: side.at.seq } } : { error: 'decor-taken' };
    return realmDecorWrite(ctx, player, side.at, {
      mapId, buildingKey, delta, write: insert, regionOf: S.regionOf,
      after: async () => pieceOfRow(await db.prepare(`SELECT * FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ?`).bind(mapId, buildingKey, p.id).first()),
      refusal: async () => (await hallWord()) ?? ((await db.prepare(`SELECT ${S.owns} AS owns`).bind(mapId, buildingKey, player.id, character).first())?.owns ? await capWord(db, S, mapId, out) : 'no-home'),
    });
  }
  const r = await insert.run();
  if (r?.meta?.changes) return { ok: true, piece: p };
  const hallSaid = await hallWord();
  if (hallSaid) return { error: hallSaid };
  const owns = await db.prepare(`SELECT ${S.owns} AS owns`).bind(mapId, buildingKey, player.id, character).first();
  if (!owns?.owns) return { error: 'no-home' };
  const row = await db.prepare(`SELECT * FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ?`).bind(mapId, buildingKey, p.id).first();
  if (row) {
    const had = pieceOfRow(row);
    return had && JSON.stringify(had) === JSON.stringify(p) ? { ok: true, repeat: true, piece: had } : { error: 'decor-taken' };
  }
  return { error: await capWord(db, S, mapId, out) };
}

/** @param {{db: any, nowS: number}} ctx */
export async function moveDecor(ctx, player, { mapId, buildingKey, character, id, place, realm = null, seat = false } = {}) {
  const S = storeOf(seat);
  if (realm != null) {
    const first = await realmActFirst(ctx.db, player.id, character, realm);
    if (first.error) return first;
  }
  const shut = await writeDoor(ctx, player, { mapId, buildingKey, character });
  if (shut) return { error: shut };
  if (typeof id !== 'string' || !DECOR_ID_RE.test(id)) return { error: 'no-decor' };
  const pl = decorPlaceOf(place);
  if (!pl) return { error: 'bad-decor' };
  const { db } = ctx;
  const row = await db.prepare(`SELECT * FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ? AND ${S.owns}`)
    .bind(mapId, buildingKey, id, mapId, buildingKey, player.id, character).first();
  if (!row) return { error: 'no-decor' };
  const was = pieceOfRow(row);
  if (!was || !decorPieceOf({ ...was, ...pl })) return { error: 'bad-decor' };
  if (!decorScaleOk({ ...was, ...pl }) && pl.scale !== was.scale) return { error: 'decor-figure' };
  if (was.station === 'vendor' && (pl.station ?? null) !== 'vendor' && await vendorStocked(db, mapId, id)) return { error: 'vendor-stocked' };
  if (row.yard === 1 && !decorYardPlaceOf(pl)) return { error: 'bad-decor' };
  if (row.yard === 1 && !decorYardHighOk(pl)) return { error: 'yard-high' };
  const { delta, ledger } = decorGoldMove(was, pl, row.paid);
  const hall = delta > 0 ? await S.guildOf(db, mapId, buildingKey) : null;
  if (hall) {
    return hallPieceBack(ctx, player, hall, {
      delta,
      write: db.prepare(`UPDATE ${S.table} SET place = ?, paid = ? WHERE map_id = ? AND building_key = ? AND id = ? AND place = ? AND paid = ? AND ${S.owns}`)
        .bind(placeJson(pl), ledger, mapId, buildingKey, id, row.place, row.paid, mapId, buildingKey, player.id, character),
      after: async () => pieceOfRow(await db.prepare(`SELECT * FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ?`).bind(mapId, buildingKey, id).first()),
      refusal: async () => 'no-decor',
    });
  }
  const side = decorSideOf(character, realm, delta);
  if (side.error) return side;
  if (side.at && delta !== 0) {
    return realmDecorWrite(ctx, player, side.at, {
      mapId, buildingKey, delta, regionOf: S.regionOf,
      write: db.prepare(`UPDATE ${S.table} SET place = ?, paid = ? WHERE map_id = ? AND building_key = ? AND id = ? AND place = ? AND paid = ? AND ${S.owns}`)
        .bind(placeJson(pl), ledger, mapId, buildingKey, id, row.place, row.paid, mapId, buildingKey, player.id, character),
      after: async () => pieceOfRow(await db.prepare(`SELECT * FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ?`).bind(mapId, buildingKey, id).first()),
      refusal: async () => 'no-decor',
    });
  }
  // The yard flag is matched as read, so a piece placed again in the yard under the same id is not moved.
  const r = await db.prepare(`UPDATE ${S.table} SET place = ? WHERE map_id = ? AND building_key = ? AND id = ? AND yard = ? AND ${S.owns}`)
    .bind(placeJson(pl), mapId, buildingKey, id, row.yard, mapId, buildingKey, player.id, character).run();
  if (!r?.meta?.changes) return { error: 'no-decor' };
  const now = await db.prepare(`SELECT * FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ?`).bind(mapId, buildingKey, id).first();
  const piece = now ? pieceOfRow(now) : null;
  return piece ? { ok: true, piece } : { error: 'no-decor' };
}

/** @param {{db: any, nowS: number}} ctx */
export async function removeDecor(ctx, player, { mapId, buildingKey, character, id, realm = null, seat = false } = {}) {
  const S = storeOf(seat);
  if (realm != null) {
    const first = await realmActFirst(ctx.db, player.id, character, realm);
    if (first.error) return first;
  }
  const shut = await writeDoor(ctx, player, { mapId, buildingKey, character });
  if (shut) return { error: shut };
  if (typeof id !== 'string' || !DECOR_ID_RE.test(id)) return { error: 'no-decor' };
  const { db } = ctx;
  {
    const row = await db.prepare(`SELECT * FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ? AND ${S.owns}`)
      .bind(mapId, buildingKey, id, mapId, buildingKey, player.id, character).first();
    const was = row ? pieceOfRow(row) : null;
    if (was?.station === 'vendor' && await vendorStocked(db, mapId, id)) return { error: 'vendor-stocked' };
    const delta = was ? decorGoldMove(was, null, row.paid).delta : 0;
    const hall = delta > 0 ? await S.guildOf(db, mapId, buildingKey) : null;
    if (hall) {
      return hallPieceBack(ctx, player, hall, {
        delta,
        write: db.prepare(`DELETE FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ? AND place = ? AND paid = ? AND ${S.owns}`)
          .bind(mapId, buildingKey, id, row.place, row.paid, mapId, buildingKey, player.id, character),
        after: async () => was,
        refusal: async () => 'no-decor',
      });
    }
    const side = decorSideOf(character, realm, delta);
    if (side.error) return side;
    if (side.at && delta > 0) {
      return realmDecorWrite(ctx, player, side.at, {
        mapId, buildingKey, delta, regionOf: S.regionOf,
        write: db.prepare(`DELETE FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ? AND place = ? AND paid = ? AND ${S.owns}`)
          .bind(mapId, buildingKey, id, row.place, row.paid, mapId, buildingKey, player.id, character),
        after: async () => was,
        refusal: async () => 'no-decor',
      });
    }
  }
  const row = await db.prepare(`DELETE FROM ${S.table} WHERE map_id = ? AND building_key = ? AND id = ? AND ${S.owns} RETURNING *`)
    .bind(mapId, buildingKey, id, mapId, buildingKey, player.id, character).first();
  const piece = row ? pieceOfRow(row) : null;
  return piece ? { ok: true, piece } : { error: 'no-decor' };
}
