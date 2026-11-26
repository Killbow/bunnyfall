// @ts-check
// A claim is one insert that lands only while the building is nobody's and the character is under HOME_CAP, so two
// racing claims cannot both land. Writes name the owner in the WHERE, so another account's home answers no-home.
import { accountKind, displayName, overRate } from './accounts.js';
import { CHAR_ID_RE, DB_ROOT } from './service.js';
import { prepareRealmRecord, realmActFirst, realmAtOf, recordMovedOf, mustChange, dropObjects, dropIfUnnamed, REALM_ID_RE, getRealmBlob, realmSaveTextOf, realmHoldOf } from './realm.js';
import { payFromSave, creditSave } from '../../src/net/realmGoldLaw.js';
import {
  HOME_CAP, HOME_ENTRY_DEFAULT, HOME_CLAIMS_MAX, HOME_CLAIMS_WINDOW_S, HOME_TOWN_MAX, HOME_LAYOUTS_MAX,
  HOME_KEYS_MAX,
  homeMoved,
  homeMapIdOk, homeBuildingKeyOk, homeRegionOk, homePriceOk, homeEntryOk, homeSaleRefund, homeLookOf, homeLayoutOk, homeLayoutsMatch,
  homeInArenaCell, RENT_ANCHOR_MOVED,
  homeDeedOf,
} from '../../src/net/homeLaw.js';
import { PATRON_HOUR_S } from '../../src/net/patronLaw.js';
import { reckonPatrons } from './market.js';
import { GUILD_TREASURY_MAX } from '../../src/net/guildLaw.js';
import { DECOR_OPS_MAX, DECOR_OPS_WINDOW_S } from '../../src/net/decorLaw.js';
import { hallMay } from '../../src/net/hallLaw.js';
import { heraldryOfRow } from './halls.js';
import { openGatesRead } from './seatHolding.js';
import { OWNS } from './decor.js';
import { homeMyVoteOf, homeShunned } from '../../src/net/homeVoteLaw.js';
import { LAYOUT_MATCH_SQL, layoutMatchBinds, TOWN_LAYOUT_SQL, townLayoutRefusal } from './townLayout.js';

const homeOf = (row) => ({
  mapId: row.map_id, buildingKey: row.building_key, region: row.region, character: row.char_id,
  entry: row.entry, price: row.price, boughtAt: row.bought_at,
  ...(row.title ? { title: String(row.title) } : {}),
  ...(row.layout ? { layout: row.layout } : {}),
  ...(row.deed === 1 ? { deed: true } : {}),
});

const realmSaleOf = (row) => (Number(row.paid) > 0 ? { refund: homeSaleRefund(Number(row.paid)) } : { crossed: true });

const claimStatement = (db, player, { mapId, buildingKey, region, character, price, layout = null }, nowS, paid = 0) => db.prepare(`INSERT OR IGNORE INTO homes (map_id, building_key, player, char_id, owner_name, region, entry, price, bought_at, paid, layout)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${TOWN_LAYOUT_SQL}
    WHERE (SELECT COUNT(*) FROM homes WHERE player = ? AND char_id = ? AND deed = 0) < ?
      AND NOT EXISTS (SELECT 1 FROM homes t WHERE t.map_id = ? AND NOT (${LAYOUT_MATCH_SQL}))`)
  .bind(mapId, buildingKey, player.id, character, displayName(player), region, HOME_ENTRY_DEFAULT, price, nowS, paid, mapId, mapId, layout, player.id, character, HOME_CAP, mapId, ...layoutMatchBinds(layout));

export const heldByAccount = (row, player, character) => !!row && row.player === player.id && row.guild_id == null
  && (Number(row.deed) !== 1 || row.char_id === character);

async function realmClaim(ctx, player, at, claim) {
  const { db, bucket, nowS } = ctx;
  const held = await db.prepare('SELECT * FROM homes WHERE map_id = ? AND building_key = ?').bind(claim.mapId, claim.buildingKey).first();
  if (held) return heldByAccount(held, player, claim.character) ? { ok: true, repeat: true, home: homeOf(held), ...realmSaleOf(held), realm: { seq: at.seq } } : { error: 'home-taken' };
  const town = await db.prepare('SELECT layout FROM homes WHERE map_id = ? ORDER BY bought_at, building_key LIMIT 1').bind(claim.mapId).first();
  if (town && !homeLayoutsMatch(town.layout, claim.layout)) return { error: 'home-layout', layout: homeLayoutOk(town.layout) ? town.layout ?? null : null };
  const prep = await prepareRealmRecord(ctx, player.id, at, (save) => (payFromSave(save, claim.price, claim.region) ? null : 'realm-gold'));
  if (prep.error) return prep;
  try {
    await db.batch([...prep.steps, claimStatement(db, player, claim, nowS, claim.price), mustChange(db)]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, at.id, prep.key);
    const now = await recordMovedOf(db, player.id, at);
    if (now) return now;
    if (await db.prepare('SELECT 1 AS one FROM homes WHERE map_id = ? AND building_key = ?').bind(claim.mapId, claim.buildingKey).first()) return { error: 'home-taken' };
    const town = await db.prepare('SELECT layout FROM homes WHERE map_id = ? ORDER BY bought_at, building_key LIMIT 1').bind(claim.mapId).first();
    if (town && !homeLayoutsMatch(town.layout, claim.layout)) return { error: 'home-layout', layout: homeLayoutOk(town.layout) ? town.layout ?? null : null };
    return { error: 'home-cap' };
  }
  await dropObjects(bucket, [prep.prev]);
  const row = await db.prepare('SELECT * FROM homes WHERE map_id = ? AND building_key = ?').bind(claim.mapId, claim.buildingKey).first();
  return { ok: true, home: homeOf(row), ...realmSaleOf(row), realm: { seq: prep.seq }, moved: homeMoved(claim.mapId, [claim.buildingKey]) };
}

/** @param {{db: any, nowS: number, bucket?: any, rand?: any}} ctx @param {any} player
 * @param {{mapId?: unknown, buildingKey?: unknown, region?: unknown, character?: unknown, price?: unknown, realm?: unknown}} claim
 */
export async function claimHome(ctx, player, body = {}) {
  const { mapId, buildingKey, region, character, price, realm = null, layout = null } = body ?? {};
  const { db, nowS } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey) || !homeRegionOk(region) || !Number.isSafeInteger(price) || !(price > 0)) return { error: 'bad-home' };
  if (!homePriceOk(price)) return { error: 'home-update' };
  if (!homeLayoutOk(layout)) return { error: 'bad-home' };
  if (homeInArenaCell(mapId, buildingKey)) return { error: 'home-arena' };
  if (!Object.hasOwn(body ?? {}, 'layout')) return { error: 'home-update' };
  if (typeof character !== 'string' || !CHAR_ID_RE.test(character)) return { error: 'home-character' };
  if (!REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!(await db.prepare('SELECT 1 AS one FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first())) {
    const town = await db.prepare('SELECT layout FROM homes WHERE map_id = ? ORDER BY bought_at, building_key LIMIT 1').bind(mapId).first();
    if (town && !homeLayoutsMatch(town.layout, layout)) return { error: 'home-layout', layout: homeLayoutOk(town.layout) ? town.layout ?? null : null };
  }
  if (await overRate({ db, nowS }, `home:${player.id}`, HOME_CLAIMS_MAX, HOME_CLAIMS_WINDOW_S)) return { error: 'home-rate' };
  return realmClaim(ctx, player, side.at, { mapId, buildingKey, region, character, price, layout: layout ?? null });
}

const deedStatement = (db, player, { mapId, buildingKey, region, character, layout = null }, nowS) => db.prepare(`INSERT OR IGNORE INTO homes (map_id, building_key, player, char_id, owner_name, region, entry, price, bought_at, paid, layout, deed)
    SELECT ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ${TOWN_LAYOUT_SQL}, 1
    WHERE NOT EXISTS (SELECT 1 FROM homes t WHERE t.map_id = ? AND NOT (${LAYOUT_MATCH_SQL}))`)
  .bind(mapId, buildingKey, player.id, character, displayName(player), region, HOME_ENTRY_DEFAULT, nowS, mapId, mapId, layout, mapId, ...layoutMatchBinds(layout));

/** @param {{db: any, nowS: number, bucket?: any}} ctx @param {any} player
 * @param {{mapId?: unknown, buildingKey?: unknown, region?: unknown, character?: unknown, layout?: unknown}} body */
export async function holdDeed(ctx, player, body = {}) {
  const { mapId, buildingKey, region, character, layout = null } = body ?? {};
  const { db, nowS, bucket } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey) || !homeRegionOk(region) || !homeLayoutOk(layout)) return { error: 'bad-home' };
  if (homeInArenaCell(mapId, buildingKey)) return { error: 'home-arena' };
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const held = await db.prepare('SELECT player, char_id FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first();
  if (held) return held.player === player.id && held.char_id === character ? { ok: true, repeat: true } : { error: 'home-taken' };
  const refused = await townLayoutRefusal(db, mapId, layout ?? null);
  if (refused) return refused;
  if (await overRate({ db, nowS }, `home:${player.id}`, HOME_CLAIMS_MAX, HOME_CLAIMS_WINDOW_S)) return { error: 'home-rate' };
  // Deeds come from the save, so a held record claims none. A character has at most HOME_CAP deeds, one per region.
  const heldBy = await realmHoldOf(db, player.id, character);
  if (heldBy) return heldBy;
  const deeds = (await db.prepare('SELECT region FROM homes WHERE player = ? AND char_id = ? AND deed = 1').bind(player.id, character).all())?.results ?? [];
  if (deeds.length >= HOME_CAP || deeds.some((d) => d.region === region)) return { error: 'home-cap' };
  const rec = await getRealmBlob({ db, bucket }, player.id, character);
  if (rec.error === 'no-realm-character') return rec;
  let save = null;
  try { save = rec.ok ? JSON.parse((await realmSaveTextOf(rec.object)) ?? 'null') : null; } catch { save = null; }
  const deed = homeDeedOf(save?.houses, region, mapId, buildingKey);
  if (!deed || !homeLayoutsMatch(deed.layout ?? null, layout ?? null)) return { error: 'no-deed' };
  await deedStatement(db, player, { mapId, buildingKey, region, character, layout: layout ?? null }, nowS).run();
  const row = await db.prepare('SELECT * FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first();
  if (row) return row.player === player.id && row.char_id === character ? { ok: true, home: homeOf(row), moved: homeMoved(mapId, [buildingKey]) } : { error: 'home-taken' };
  return (await townLayoutRefusal(db, mapId, layout ?? null)) ?? { error: 'home-taken' };
}

/** @param {{db: any}} ctx @param {any} player
 * @param {{mapId?: unknown, buildingKey?: unknown, character?: unknown, from?: unknown}} body */
export async function inheritHome({ db }, player, body = {}) {
  const { mapId, buildingKey, character, from } = body ?? {};
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'bad-home' };
  if (typeof character !== 'string' || !REALM_ID_RE.test(character) || typeof from !== 'string' || !REALM_ID_RE.test(from) || from === character) return { error: 'realm-only' };
  const kin = await db.prepare(`SELECT 1 FROM realm_characters h JOIN realm_characters d ON d.player = h.player AND d.lineage_id = h.lineage_id
      WHERE h.id = ? AND d.id = ? AND h.player = ? AND h.lineage_id IS NOT NULL AND h.dead_at IS NULL AND d.dead_at IS NOT NULL AND d.dead_why = 'fell'`)
    .bind(character, from, player.id).first();
  if (!kin) return { error: 'not-heir' };
  const was = await db.prepare('SELECT char_id FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL').bind(mapId, buildingKey, player.id).first();
  await db.batch([
    db.prepare('UPDATE homes SET char_id = ? WHERE map_id = ? AND building_key = ? AND player = ? AND char_id = ? AND guild_id IS NULL')
      .bind(character, mapId, buildingKey, player.id, from),
    db.prepare('DELETE FROM home_owners WHERE map_id = ? AND building_key = ? AND char_id = ? AND EXISTS (SELECT 1 FROM homes WHERE map_id = ? AND building_key = ? AND char_id = ?)')
      .bind(mapId, buildingKey, character, mapId, buildingKey, character),
  ]);
  const row = await db.prepare('SELECT * FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND char_id = ? AND guild_id IS NULL').bind(mapId, buildingKey, player.id, character).first();
  if (!row) return { error: 'no-home' };
  return { ok: true, home: homeOf(row), ...(was?.char_id === from ? {} : { repeat: true }) };
}

const decorBackStatement = (db, mapId, buildingKey) => db.prepare(`SELECT COALESCE(SUM(CASE WHEN json_valid(place) THEN 1 ELSE 0 END), 0) AS n,
      COALESCE(SUM(CASE WHEN json_valid(place) THEN CAST(json_extract(place, '$.paid') AS INTEGER) / 2 ELSE 0 END), 0) AS back
      FROM home_decor WHERE map_id = ? AND building_key = ?`).bind(mapId, buildingKey);
const realmDecorBackStatement = (db, mapId, buildingKey) => db.prepare(`SELECT COALESCE(SUM(CASE WHEN json_valid(place) THEN 1 ELSE 0 END), 0) AS n,
      COALESCE(SUM(CASE WHEN json_valid(place) THEN paid / 2 ELSE 0 END), 0) AS back
      FROM home_decor WHERE map_id = ? AND building_key = ?`).bind(mapId, buildingKey);

async function realmRelease(ctx, player, at, home) {
  const { db, bucket } = ctx;
  if (!home) return { error: 'no-home' };
  if (!(Number(home.paid) > 0)) return { error: 'home-crossed' };
  const d = await realmDecorBackStatement(db, home.map_id, home.building_key).first();
  const decorCount = Number(d?.n) || 0, decorBack = Math.max(0, Number(d?.back) || 0);
  const refund = homeSaleRefund(Math.max(0, Number(home.paid) || 0));
  const rentDue = Math.max(0, Number(home.rent_due) || 0);
  const back = refund + decorBack + rentDue;
  const prep = await prepareRealmRecord(ctx, player.id, at, (save) => (creditSave(save, back, { bank: home.region }) ? null : 'no-data'));
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      db.prepare('DELETE FROM decor_access WHERE map_id = ? AND building_key = ?').bind(home.map_id, home.building_key),
      db.prepare(`DELETE FROM home_offers WHERE map_id = ? AND building_key = ? AND state = 'open'`).bind(home.map_id, home.building_key),
      db.prepare('DELETE FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL AND deed = 0 AND paid = ? AND rent_due = ?').bind(home.map_id, home.building_key, player.id, home.paid, home.rent_due ?? 0),
      mustChange(db),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, at.id, prep.key);
    return (await recordMovedOf(db, player.id, at)) || { error: 'no-home' };
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, price: home.price, refund, decorCount, decorBack, ...(rentDue ? { rent: rentDue } : {}), realm: { seq: prep.seq }, moved: homeMoved(home.map_id, [], [home.building_key]) };
}

/** @param {{db: any, bucket?: any, rand?: any, nowS?: number}} ctx */
export async function releaseHome(ctx, player, { mapId, buildingKey, realm = null, deed = false } = {}) {
  const { db } = ctx;
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'no-home' };
  if (deed === true) {
    const gone = await db.prepare('DELETE FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND deed = 1').bind(mapId, buildingKey, player.id).run();
    return gone?.meta?.changes ? { ok: true, price: 0, decorCount: 0, decorBack: 0, moved: homeMoved(mapId, [], [buildingKey]) } : { error: 'no-home' };
  }
  const at = realm != null ? realmAtOf(realm) : null;
  if (at) {
    const moved = await recordMovedOf(db, player.id, at);
    if (moved) return moved;
  }
  const home = await db.prepare('SELECT * FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL').bind(mapId, buildingKey, player.id).first();
  if (home && Number((await db.prepare(`SELECT COUNT(*) AS n FROM home_rooms WHERE map_id = ? AND building_key = ? AND tenant IS NOT NULL AND until > ?`)
    .bind(mapId, buildingKey, ctx.nowS ?? Math.floor(Date.now() / 1000)).first())?.n ?? 0) > 0) return { error: 'home-tenants' };
  if (home && Number((await db.prepare(`SELECT COUNT(*) AS n FROM market_listings l JOIN home_decor d ON d.map_id = l.vendor_map AND d.id = l.vendor_id
    WHERE l.state = 'open' AND d.map_id = ? AND d.building_key = ?`).bind(mapId, buildingKey).first())?.n ?? 0) > 0) return { error: 'home-vendor-stocked' };
  if (home && Number((await db.prepare('SELECT COUNT(*) AS n FROM decor_bin WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first())?.n ?? 0) > 0) return { error: 'home-holds' };
  if (home && await db.prepare('SELECT 1 AS y FROM home_decorators WHERE map_id = ? AND building_key = ? LIMIT 1').bind(mapId, buildingKey).first()) return { error: 'home-decorators' };
  if (realm != null || (typeof home?.char_id === 'string' && REALM_ID_RE.test(home.char_id))) {
    return at ? realmRelease(ctx, player, at, home) : { error: 'realm-needed' };
  }
  const [pieces, gone] = await db.batch([
    decorBackStatement(db, mapId, buildingKey),
    db.prepare('DELETE FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL AND deed = 0 RETURNING price')
      .bind(mapId, buildingKey, player.id),
    db.prepare('DELETE FROM decor_access WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey),
    db.prepare(`DELETE FROM home_offers WHERE map_id = ? AND building_key = ? AND state = 'open'`).bind(mapId, buildingKey),
  ]);
  const row = gone?.results?.[0];
  if (!row) return { error: 'no-home' };
  const d = pieces?.results?.[0];
  return { ok: true, price: row.price, decorCount: Number(d?.n) || 0, decorBack: Math.max(0, Number(d?.back) || 0), moved: homeMoved(mapId, [], [buildingKey]) };
}

/** @param {{db: any, nowS?: number}} ctx @param {any} player @param {any} [body] @param {any} [env] */
export async function setHomeEntry(ctx, player, { mapId, buildingKey, entry } = {}, env = null) {
  const { db, nowS } = ctx;
  if (!homeEntryOk(entry)) return { error: 'bad-entry' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'no-home' };
  if (entry === 'public' && Number.isSafeInteger(nowS)) {
    await db.prepare(`UPDATE market_listings SET patron_hour = ?4 WHERE vendor_map = ?1 AND seller = ?3 AND state = 'open'
      AND vendor_id IN (SELECT id FROM home_decor WHERE map_id = ?1 AND building_key = ?2) AND (patron_hour IS NULL OR patron_hour < ?4)
      AND EXISTS (SELECT 1 FROM homes WHERE map_id = ?1 AND building_key = ?2 AND player = ?3 AND guild_id IS NULL AND entry != 'public')`)
      .bind(mapId, buildingKey, player.id, Math.floor(/** @type {number} */ (nowS) / PATRON_HOUR_S)).run();
  } else if (Number.isSafeInteger(nowS) && await db.prepare("SELECT 1 FROM homes WHERE map_id = ?1 AND building_key = ?2 AND player = ?3 AND guild_id IS NULL AND entry = 'public'")
    .bind(mapId, buildingKey, player.id).first()) {
    await reckonPatrons(ctx, { maps: [mapId] }, env).catch(() => null);
  }
  const r = await db.prepare('UPDATE homes SET entry = ? WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL')
    .bind(entry, mapId, buildingKey, player.id).run();
  return r?.meta?.changes ? { ok: true, entry } : { error: 'no-home' };
}

/** @param {{db: any, nowS: number}} ctx */
export async function setHomeLook({ db, nowS }, player, { mapId, buildingKey, character, look = null } = {}) {
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'bad-home' };
  if (typeof character !== 'string' || !CHAR_ID_RE.test(character)) return { error: 'home-character' };
  const next = look == null ? null : homeLookOf(look);
  if (look != null && !next) return { error: 'bad-look' };
  if (await overRate({ db, nowS }, `decor:${player.id}`, DECOR_OPS_MAX, DECOR_OPS_WINDOW_S)) return { error: 'decor-rate' };
  const r = await db.prepare(`UPDATE homes SET look = ? WHERE map_id = ? AND building_key = ? AND ${OWNS}`)
    .bind(next ? JSON.stringify(next) : null, mapId, buildingKey, mapId, buildingKey, player.id, character).run();
  return r?.meta?.changes ? { ok: true, look: next } : { error: 'no-home' };
}

const lookOfRow = (h) => { const look = h.look ? homeLookOf(h.look) : null; return look ? { look } : {}; };

/** @param {{db: any}} ctx */
function offerFor(h) {
  const out = {};
  if (typeof h.giving === 'string' && h.giving) out.giving = h.giving;
  const parts = typeof h.offer_for === 'string' ? h.offer_for.split(':') : null;
  if (parts?.length === 4 && /^[0-9a-f]{32}$/.test(parts[0])) {
    const price = Number(parts[1]);
    if (Number.isSafeInteger(price) && price >= 0) out.offer = { id: parts[0], price, keepDecor: parts[2] === '1', keepItems: parts[3] === '1' };
  }
  return out;
}

function townRead(db, nowS, player, mapId, character, seats) {
  const me = typeof character === 'string' && CHAR_ID_RE.test(character) ? character : '';
  const homesRead = db.prepare(`SELECT h.building_key, h.player, h.char_id, h.owner_name, h.entry, h.paid, h.rent_due, h.look, h.title, h.guild_id, h.deed, h.score,
      g.name AS guild_name, g.tag AS guild_tag, g.heraldry AS guild_heraldry,
      (SELECT COUNT(*) FROM home_rooms r WHERE r.map_id = h.map_id AND r.building_key = h.building_key AND r.listed = 1 AND (r.tenant IS NULL OR r.until <= ?1)) AS vacant,
      (SELECT MIN(r.price) FROM home_rooms r WHERE r.map_id = h.map_id AND r.building_key = h.building_key AND r.listed = 1 AND (r.tenant IS NULL OR r.until <= ?1)) AS rent_from,
      (SELECT MAX(r.until) FROM home_rooms r WHERE r.map_id = h.map_id AND r.building_key = h.building_key AND r.tenant = ?2 AND r.tenant_char = ?3 AND r.until > ?1) AS tenancy,
      (SELECT m.rank FROM guild_members m WHERE m.guild_id = h.guild_id AND m.player = ?2 AND m.char_id = ?3) AS my_rank,
      (h.guild_id IS NULL AND h.entry = 'guild' AND EXISTS (SELECT 1 FROM guild_members a JOIN guild_members b ON b.guild_id = a.guild_id
        WHERE a.player = h.player AND b.player = ?2 AND b.char_id = ?3)) AS guildmate,
      EXISTS (SELECT 1 FROM realm_characters rc WHERE rc.id = ?3 AND rc.player = ?2) AS me_realm,
      (SELECT v.vote FROM home_votes v WHERE v.map_id = h.map_id AND v.building_key = h.building_key AND v.player = ?2) AS my_vote,
      (h.guild_id IS NOT NULL AND EXISTS (SELECT 1 FROM guild_members k WHERE k.guild_id = h.guild_id AND k.player = ?2)) AS kin,
      (SELECT c.name FROM realm_characters c WHERE c.id = h.char_id AND c.player = h.player) AS main_name,
      EXISTS (SELECT 1 FROM home_owners w WHERE w.map_id = h.map_id AND w.building_key = h.building_key AND w.char_id = ?3) AS co_me,
      (SELECT o.id || ':' || o.price || ':' || o.keep_decor || ':' || o.keep_items FROM home_offers o
        WHERE o.map_id = h.map_id AND o.building_key = h.building_key AND o.buyer = ?2 AND (o.buyer_char IS NULL OR o.buyer_char = ?3) AND o.state = 'open' AND o.until > ?1 LIMIT 1) AS offer_for,
      (SELECT o.id FROM home_offers o WHERE o.map_id = h.map_id AND o.building_key = h.building_key AND o.seller = ?2 AND o.state = 'open' AND o.until > ?1 LIMIT 1) AS giving,
      EXISTS (SELECT 1 FROM home_decorators d WHERE d.map_id = h.map_id AND d.building_key = h.building_key AND d.player = ?2) AS decorates
    FROM homes h LEFT JOIN guilds g ON g.id = h.guild_id WHERE h.map_id = ?4 ORDER BY h.building_key LIMIT ?5`).bind(nowS, player.id, me, mapId, HOME_TOWN_MAX);
  const reads = seats ? [homesRead, openGatesRead(db, nowS, mapId)] : [homesRead];
  const answer = ([{ results = [] }, gates = null]) => {
  const open = !!gates?.results?.length;
  const votesOf = (h) => ({ ...(Number(h.score) ? { score: Number(h.score) } : {}), ...(homeMyVoteOf(h.my_vote) ? { vote: homeMyVoteOf(h.my_vote) } : {}) });
  const lookFor = (h, insider) => (insider || !homeShunned(Number(h.score)) ? lookOfRow(h) : {});
  return {
    mapId, ...(open ? { openGates: true } : {}),
    homes: results.filter((h) => !(h.deed === 1 && h.player === player.id && h.char_id === me)).map((h) => {
      if (h.guild_id != null) {
        const rank = Number.isSafeInteger(h.my_rank) ? h.my_rank : null;
        return {
          buildingKey: h.building_key, owner: h.guild_name ?? h.owner_name, entry: h.entry, mine: false,
          hall: { name: h.guild_name ?? h.owner_name, tag: h.guild_tag ?? '', heraldry: heraldryOfRow(h.guild_heraldry) },
          ...(rank != null ? { member: true, ...(hallMay(rank, 'decorate') && h.me_realm === 1 ? { keeper: true } : {}) } : {}),
          ...(rank != null && hallMay(rank, 'hallEntry') ? { hallEntry: true } : {}),
          ...(rank != null && hallMay(rank, 'hall') ? { hallSell: true, refund: homeSaleRefund(Math.max(0, Number(h.paid) || 0)) } : {}),
          ...(h.kin === 1 && rank == null ? { insider: true } : {}),
          ...lookFor(h, h.kin === 1),
          ...votesOf(h),
        };
      }
      const mine = h.player === player.id;
      const deedRow = Number(h.deed) === 1;
      const crossed = mine && !deedRow && !(Number(h.paid) > 0);
      const sale = mine && !deedRow && !crossed && Number(h.me_realm) === 1 ? { ...realmSaleOf(h), ...(Number(h.rent_due) > 0 ? { rentDue: Number(h.rent_due) } : {}) } : {};
      return {
        buildingKey: h.building_key, owner: h.owner_name, ...(h.title ? { title: String(h.title) } : {}), entry: open && !mine ? 'public' : h.entry, mine, ...(mine ? { character: h.char_id } : {}), ...(crossed ? { crossed } : {}),
        ...sale,
        ...(Number(h.vacant) > 0 ? { rent: { vacant: Number(h.vacant), from: Number(h.rent_from) } } : {}),
        ...(Number.isSafeInteger(h.tenancy) && h.tenancy > nowS ? { tenant: h.tenancy } : {}),
        ...lookFor(h, mine),
        ...(h.guildmate === 1 ? { guildmate: true } : {}),
        ...(h.deed === 1 ? { deed: true } : {}),
        ...(mine && !deedRow ? { main: !!me && h.char_id === me, coOwner: h.co_me === 1, mainName: String(h.main_name ?? '') } : {}),
        ...offerFor(h),
        ...votesOf(h),
        ...(h.decorates === 1 && !mine && !deedRow ? { decorator: true } : {}),
      };
    }),
  };
  };
  return { reads, answer };
}

export async function homesInTown({ db, nowS = Math.floor(Date.now() / 1000) }, player, { mapId, character = null } = {}, { seats = false } = {}) {
  if (!homeMapIdOk(mapId)) return { error: 'bad-home' };
  const { reads, answer } = townRead(db, nowS, player, mapId, character, seats);
  return answer(seats ? await db.batch(reads) : [await reads[0].all()]);
}

export const HOMES_TOWNS_MAX = 40;
export async function homesInTowns({ db, nowS = Math.floor(Date.now() / 1000) }, player, { mapIds, character = null } = {}, { seats = false } = {}) {
  if (!Array.isArray(mapIds) || !mapIds.length || mapIds.length > HOMES_TOWNS_MAX || !mapIds.every((m) => homeMapIdOk(m))) return { error: 'bad-home' };
  const ids = [...new Set(mapIds)];
  const reads = ids.map((id) => townRead(db, nowS, player, id, character, seats));
  const outs = await db.batch(reads.flatMap((r) => r.reads));
  let at = 0;
  return { towns: ids.map((id, i) => { const n = reads[i].reads.length; const a = reads[i].answer(outs.slice(at, at + n)); at += n; return a; }) };
}

/** @param {{db: any}} ctx */
export async function homesOf({ db }, player) {
  const { results = [] } = await db.prepare('SELECT * FROM homes WHERE player = ? AND guild_id IS NULL ORDER BY bought_at, map_id, building_key')
    .bind(player.id).all();
  return { homes: results.map(homeOf), cap: HOME_CAP };
}

/** @param {{db: any}} ctx */
export async function homeLayouts({ db }) {
  const [{ results = [] }, { results: keyed = [] }] = await Promise.all([
    db.prepare(`SELECT h.map_id, h.layout FROM homes h
    WHERE NOT EXISTS (SELECT 1 FROM homes o WHERE o.map_id = h.map_id AND (o.bought_at < h.bought_at OR (o.bought_at = h.bought_at AND o.building_key < h.building_key)))
    ORDER BY h.map_id LIMIT ?`).bind(HOME_LAYOUTS_MAX).all(),
    db.prepare('SELECT map_id, building_key FROM homes ORDER BY map_id, building_key LIMIT ?').bind(HOME_KEYS_MAX).all(),
  ]);
  /** @type {Array<[number, number[]]>} */
  const homes = [];
  for (const r of keyed) {
    const town = homes[homes.length - 1];
    if (town?.[0] === r.map_id) town[1].push(r.building_key);
    else homes.push([r.map_id, [r.building_key]]);
  }
  return { towns: results.map((r) => [r.map_id, homeLayoutOk(r.layout) ? r.layout ?? null : null]), homes };
}

// Triggers move homes_gen on each home write, and it is read before the answer, so a write in between reads again.
const layoutsKept = new WeakMap(), layoutsAsking = new WeakMap();
export async function homeLayoutsKept(ctx) {
  const root = ctx.db?.[DB_ROOT] ?? ctx.db;
  const gen = Number((await ctx.db.prepare('SELECT gen FROM homes_gen WHERE id = 1').first())?.gen ?? -1);
  const kept = layoutsKept.get(root);
  if (kept && kept.gen === gen) return kept.answer;
  const asking = layoutsAsking.get(root);
  if (asking && asking.gen === gen) return asking.ask;
  const ask = homeLayouts(ctx).then((answer) => { layoutsKept.set(root, { gen, answer }); return answer; })
    .finally(() => { if (layoutsAsking.get(root)?.ask === ask) layoutsAsking.delete(root); });
  layoutsAsking.set(root, { gen, ask });
  return ask;
}

// An arena move copies only these columns to the new row, so a column added to homes must be listed here.
export const HOME_MOVE_CARRIED = Object.freeze(['player', 'char_id', 'owner_name', 'region', 'entry', 'price', 'bought_at', 'paid', 'rent_due', 'look', 'title', 'layout', 'deed']);
export const HOME_MOVES_MAX = 16;

const moveOf = (m) => ({ mapId: m.map_id, from: m.old_key, to: m.new_key, refund: Math.max(0, Number(m.refund) || 0), movedAt: m.moved_at, ...(m.hall === 1 ? { hall: true } : {}) });

/** @param {{db: any, nowS: number, bucket?: any, rand?: any}} ctx */
export async function arenaMoveHome(ctx, player, { mapId, from, to, character, realm = null } = {}) {
  const { db, nowS, bucket } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(from) || !homeBuildingKeyOk(to)) return { error: 'bad-home' };
  if (typeof character !== 'string' || !CHAR_ID_RE.test(character)) return { error: 'home-character' };
  const side = realm != null ? await realmActFirst(db, player.id, character, realm) : { at: null };
  if (side.error) return side;
  const was = await db.prepare('SELECT * FROM home_moves WHERE map_id = ? AND old_key = ?').bind(mapId, from).first();
  if (was) return was.player === player.id ? { ok: true, repeat: true, ...moveOf(was) } : { error: 'no-home' };
  if (!homeInArenaCell(mapId, from)) return { error: 'home-unmoved' };
  if (homeInArenaCell(mapId, to)) return { error: 'home-arena' };
  const home = await db.prepare('SELECT * FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, from).first();
  const owns = home ? await db.prepare(`SELECT 1 AS one WHERE ${OWNS}`).bind(mapId, from, player.id, character).first() : null;
  if (!owns) return { error: 'no-home' };
  if (await db.prepare('SELECT 1 AS one FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, to).first()) return { error: 'home-taken' };
  const gid = home.guild_id ?? null;
  const d = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN item IS NULL THEN paid ELSE 0 END), 0) AS paid,
      COALESCE(SUM(CASE WHEN item IS NULL THEN 1 ELSE 0 END), 0) AS pieces FROM home_decor WHERE map_id = ? AND building_key = ?`).bind(mapId, from).first();
  const n = Number(d?.n) || 0, pieces = Number(d?.pieces) || 0;
  const refund = Math.max(0, Number(d?.paid) || 0);
  const rooms = await db.prepare(`SELECT COALESCE(SUM(CASE WHEN tenant IS NOT NULL AND until > ?1 THEN 1 ELSE 0 END), 0) AS kept, COUNT(*) AS n
      FROM home_rooms WHERE map_id = ?2 AND building_key = ?3`).bind(nowS, mapId, from).first();
  const tenancies = Number(rooms?.kept) || 0, withdrawn = (Number(rooms?.n) || 0) - tenancies;
  const hidden = !!(await db.prepare('SELECT 1 AS one FROM home_hidden WHERE map_id = ? AND building_key = ?').bind(mapId, from).first());
  const steps = [];
  let prep = null;
  if (refund > 0 && gid == null) {
    if (!side.at) return { error: 'realm-needed' };
    prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (creditSave(save, refund, { bank: home.region }) ? null : 'no-data'));
    if (prep.error) return prep;
    steps.push(...prep.steps);
  } else if (refund > 0) {
    steps.push(db.prepare(`UPDATE guilds SET treasury = treasury + ?1, realm_gold = realm_gold + ?1, moved_by = ?2, moved_at = ?3, moved_kind = 'hall-piece'
        WHERE id = ?4 AND treasury + ?1 <= ?5`).bind(refund, displayName(player), nowS, gid, GUILD_TREASURY_MAX), mustChange(db));
  }
  const cols = HOME_MOVE_CARRIED.join(', ');
  // The insert, the tenancy re-key, and the delete share one batch, since the cascade never reaches a moved child.
  steps.push(
    db.prepare('INSERT INTO home_moves (map_id, old_key, new_key, player, char_id, refund, hall, moved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(mapId, from, to, player.id, character, refund, gid != null ? 1 : 0, nowS),
    db.prepare(`INSERT INTO homes (map_id, building_key, ${cols}, guild_id) SELECT map_id, ?, ${cols}, NULL FROM homes
        WHERE map_id = ? AND building_key = ? AND ${OWNS}`).bind(to, mapId, from, mapId, from, player.id, character),
    mustChange(db),
    ...(gid == null ? [db.prepare(`INSERT INTO home_owners (map_id, building_key, char_id, player, added_at) SELECT map_id, ?, char_id, player, added_at
        FROM home_owners WHERE map_id = ? AND building_key = ?`).bind(to, mapId, from)] : []),
    db.prepare('UPDATE home_rooms SET building_key = ?, listed = 0, anchor = ? WHERE map_id = ? AND building_key = ? AND tenant IS NOT NULL AND until > ?')
      .bind(to, RENT_ANCHOR_MOVED, mapId, from, nowS),
    db.prepare(`DELETE FROM homes WHERE map_id = ?1 AND building_key = ?2
        AND (SELECT COUNT(*) FROM home_decor WHERE map_id = ?1 AND building_key = ?2) = ?3
        AND (SELECT COALESCE(SUM(CASE WHEN item IS NULL THEN paid ELSE 0 END), 0) FROM home_decor WHERE map_id = ?1 AND building_key = ?2) = ?4`)
      .bind(mapId, from, n, refund),
    mustChange(db),
    ...(gid != null ? [db.prepare('UPDATE homes SET guild_id = ? WHERE map_id = ? AND building_key = ? AND guild_id IS NULL').bind(gid, mapId, to), mustChange(db)] : []),
  );
  try {
    await db.batch(steps);
  } catch {
    if (prep) await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    const moved = side.at ? await recordMovedOf(db, player.id, side.at) : null;
    if (moved) return moved;
    const now = await db.prepare('SELECT * FROM home_moves WHERE map_id = ? AND old_key = ?').bind(mapId, from).first();
    if (now) return now.player === player.id ? { ok: true, repeat: true, ...moveOf(now) } : { error: 'no-home' };
    if (await db.prepare('SELECT 1 AS one FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, to).first()) return { error: 'home-taken' };
    if (gid != null) {
      const t = await db.prepare('SELECT treasury FROM guilds WHERE id = ?').bind(gid).first();
      if (t && Number(t.treasury) + refund > GUILD_TREASURY_MAX) return { error: 'guild-treasury-full' };
    }
    return { error: 'home-changed' };
  }
  if (prep) await dropObjects(bucket, [prep.prev]);
  return {
    ok: true, mapId, from, to, refund, pieces, items: n - pieces, tenancies, withdrawn, hidden,
    ...(gid != null ? { hall: true } : {}), ...(prep ? { realm: { seq: prep.seq } } : {}),
    moved: homeMoved(mapId, [to], [from]),
  };
}

/** @param {{db: any}} ctx */
export async function arenaMovesOf({ db }, player, { character } = {}) {
  if (typeof character !== 'string' || !CHAR_ID_RE.test(character)) return { error: 'home-character' };
  const { results = [] } = await db.prepare('SELECT * FROM home_moves WHERE player = ? AND char_id = ? AND seen_at IS NULL ORDER BY moved_at, map_id, old_key LIMIT ?')
    .bind(player.id, character, HOME_MOVES_MAX).all();
  return { moves: results.map(moveOf) };
}

/** @param {{db: any, nowS: number}} ctx */
export async function arenaMoveSeen({ db, nowS }, player, { mapId, from } = {}) {
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(from)) return { error: 'bad-home' };
  const r = await db.prepare('UPDATE home_moves SET seen_at = ? WHERE map_id = ? AND old_key = ? AND player = ? AND seen_at IS NULL').bind(nowS, mapId, from, player.id).run();
  return { ok: true, seen: Number(r?.meta?.changes ?? 0) > 0 };
}
