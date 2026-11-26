// @ts-check
// Rent is held on the home (homes.rent_due) until the owner collects it, because a realm record moves only
// under the lease and sequence of the tab that holds it.
import { accountKind, displayName, overRate } from './accounts.js';
import { CHAR_ID_RE } from './service.js';
import { prepareRealmRecord, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed, REALM_ID_RE } from './realm.js';
import { payFromSave, creditSave } from '../../src/net/realmGoldLaw.js';
import {
  homeMapIdOk, homeBuildingKeyOk, RENT_ROOMS_MAX, RENT_HELD_MAX, RENT_WRITES_MAX, RENT_WRITES_WINDOW_S,
  rentRoomOk, rentPriceOk, rentDaysOk, rentAnchorOf, rentCost, rentUntil, RENT_ANCHOR_MOVED,
} from '../../src/net/homeLaw.js';

const OWNS = 'EXISTS (SELECT 1 FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL AND (deed = 0 OR char_id = ?))';

async function ownerDoor({ db, nowS }, player, { mapId, buildingKey, character }) {
  if (accountKind(player) !== 'linked') return 'homes-need-account';
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return 'bad-home';
  if (typeof character !== 'string' || !CHAR_ID_RE.test(character)) return 'home-character';
  if (!REALM_ID_RE.test(character)) return 'realm-only';
  if (await overRate({ db, nowS }, `rent:${player.id}`, RENT_WRITES_MAX, RENT_WRITES_WINDOW_S)) return 'rent-rate';
  return null;
}

const anchorOfRow = (text) => { try { return rentAnchorOf(JSON.parse(text)); } catch { return null; } };

/** @param {{db: any, nowS: number}} ctx */
export async function roomsOf({ db, nowS }, player, { mapId, buildingKey, character = null } = {}) {
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'bad-home' };
  const me = typeof character === 'string' && CHAR_ID_RE.test(character) ? character : null;
  const home = await db.prepare('SELECT player, char_id, owner_name, rent_due, guild_id FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first();
  if (!home) return { error: 'no-home' };
  const mine = home.player === player.id && home.guild_id == null;
  const { results = [] } = await db.prepare(`SELECT room, anchor, price, listed, tenant, tenant_char, tenant_name, until FROM home_rooms
    WHERE map_id = ? AND building_key = ? ORDER BY room LIMIT ?`).bind(mapId, buildingKey, RENT_ROOMS_MAX).all();
  const rooms = [];
  for (const r of results) {
    const anchor = anchorOfRow(r.anchor);
    const moved = !anchor && r.anchor === RENT_ANCHOR_MOVED;
    if (!anchor && !moved) continue;
    const running = r.tenant != null && r.until > nowS;
    const theirs = running && r.tenant === player.id && me != null && r.tenant_char === me;
    rooms.push({
      room: r.room, anchor, price: r.price, listed: r.listed === 1, taken: running, ...(moved ? { moved: true } : {}),
      ...(theirs ? { yours: true, character: r.tenant_char } : {}),
      ...(running && (mine || theirs) ? { until: r.until } : {}),
      ...(running && mine ? { tenant: r.tenant_name } : {}),
    });
  }
  return { mapId, buildingKey, owner: home.owner_name, mine, rooms, ...(mine ? { due: Math.max(0, Number(home.rent_due) || 0) } : {}), now: nowS };
}

/** @param {{db: any, nowS: number}} ctx */
export async function offerRoom(ctx, player, { mapId, buildingKey, character, room, anchor, price } = {}) {
  const { db } = ctx;
  const refused = await ownerDoor(ctx, player, { mapId, buildingKey, character });
  if (refused) return { error: refused };
  const at = rentAnchorOf(anchor);
  if (!rentRoomOk(room) || !at || !rentPriceOk(price)) return { error: 'bad-room' };
  const owns = await db.prepare(`SELECT 1 AS one WHERE ${OWNS}`).bind(mapId, buildingKey, player.id, character).first();
  if (!owns) return { error: 'no-home' };
  const rec = await db.prepare('SELECT bytes FROM realm_characters WHERE id = ? AND player = ?').bind(character, player.id).first();
  if (!(Number(rec?.bytes) > 0)) return { error: 'realm-needed' };
  const r = await db.prepare(`INSERT INTO home_rooms (map_id, building_key, room, anchor, price, listed)
    SELECT ?, ?, ?, ?, ?, 1 WHERE (SELECT COUNT(*) FROM home_rooms WHERE map_id = ? AND building_key = ? AND room != ?) < ?
    ON CONFLICT (map_id, building_key, room) DO UPDATE SET anchor = excluded.anchor, price = excluded.price, listed = 1`)
    .bind(mapId, buildingKey, room, JSON.stringify(at), price, mapId, buildingKey, room, RENT_ROOMS_MAX).run();
  if (!r?.meta?.changes) return { error: 'rent-rooms' };
  return { ok: true, room, anchor: at, price };
}

/** @param {{db: any, nowS: number}} ctx */
export async function withdrawRoom(ctx, player, { mapId, buildingKey, character, room } = {}) {
  const { db, nowS } = ctx;
  const refused = await ownerDoor(ctx, player, { mapId, buildingKey, character });
  if (refused) return { error: refused };
  if (!rentRoomOk(room)) return { error: 'bad-room' };
  const [gone, kept] = await db.batch([
    db.prepare(`DELETE FROM home_rooms WHERE map_id = ? AND building_key = ? AND room = ? AND (tenant IS NULL OR until <= ?) AND ${OWNS} RETURNING room`)
      .bind(mapId, buildingKey, room, nowS, mapId, buildingKey, player.id, character),
    db.prepare(`UPDATE home_rooms SET listed = 0 WHERE map_id = ? AND building_key = ? AND room = ? AND tenant IS NOT NULL AND until > ? AND ${OWNS} RETURNING until`)
      .bind(mapId, buildingKey, room, nowS, mapId, buildingKey, player.id, character),
  ]);
  if (gone?.results?.length) return { ok: true, room, gone: true };
  const u = kept?.results?.[0]?.until;
  return Number.isSafeInteger(u) ? { ok: true, room, gone: false, until: u } : { error: 'no-rent-room' };
}

export async function roomMovedOf(db, mapId, buildingKey, room, price) {
  const now = await db.prepare('SELECT price, listed FROM home_rooms WHERE map_id = ? AND building_key = ? AND room = ?').bind(mapId, buildingKey, room).first();
  if (!now || now.listed !== 1) return { error: 'no-rent-room' };
  if (now.price !== price) return { error: 'rent-price', price: now.price };
  return { error: 'rent-taken' };
}

/** @param {{db: any, nowS: number, bucket?: any, rand?: any}} ctx */
export async function rentRoom(ctx, player, { mapId, buildingKey, character, room, days, price, realm = null } = {}) {
  const { db, nowS, bucket } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey) || !rentRoomOk(room) || !rentDaysOk(days) || !rentPriceOk(price)) return { error: 'bad-room' };
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  if (await overRate({ db, nowS }, `rent:${player.id}`, RENT_WRITES_MAX, RENT_WRITES_WINDOW_S)) return { error: 'rent-rate' };
  const row = await db.prepare(`SELECT r.price, r.listed, r.tenant, r.tenant_char, r.until, h.player AS owner, h.region
    FROM home_rooms r JOIN homes h ON h.map_id = r.map_id AND h.building_key = r.building_key
    WHERE r.map_id = ? AND r.building_key = ? AND r.room = ?`).bind(mapId, buildingKey, room).first();
  if (!row) return { error: 'no-rent-room' };
  if (row.owner === player.id) return { error: 'rent-own' };
  const running = row.tenant != null && row.until > nowS;
  const renewing = running && row.tenant === player.id && row.tenant_char === character;
  if (running && !renewing) return { error: 'rent-taken' };
  if (row.listed !== 1) return { error: 'no-rent-room' };
  if (row.price !== price) return { error: 'rent-price', price: row.price };
  const until = rentUntil(nowS, renewing ? row.until : 0, days);
  if (until == null) return { error: 'rent-long' };
  if (!renewing) {
    const held = await db.prepare('SELECT COUNT(*) AS n FROM home_rooms WHERE tenant = ? AND tenant_char = ? AND until > ?').bind(player.id, character, nowS).first();
    if ((held?.n ?? 0) >= RENT_HELD_MAX) return { error: 'rent-held' };
  }
  const cost = rentCost(price, days);
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (payFromSave(save, cost, row.region) ? null : 'realm-gold'), { outbound: true });
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      // The room must still match the read (price, listing, and tenancy), or the guard aborts the payment with it.
      db.prepare(`UPDATE home_rooms SET tenant = ?, tenant_char = ?, tenant_name = ?, until = ?
        WHERE map_id = ? AND building_key = ? AND room = ? AND listed = 1 AND price = ? AND until = ? AND (tenant IS NULL OR until <= ? OR (tenant = ? AND tenant_char = ?))`)
        .bind(player.id, character, displayName(player), until, mapId, buildingKey, room, price, row.until, nowS, player.id, character),
      mustChange(db),
      db.prepare('UPDATE homes SET rent_due = rent_due + ? WHERE map_id = ? AND building_key = ?').bind(cost, mapId, buildingKey),
      mustChange(db),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    return (await recordMovedOf(db, player.id, side.at)) || (await roomMovedOf(db, mapId, buildingKey, room, price));
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, room, until, cost, realm: { seq: prep.seq } };
}

/** @param {{db: any, nowS: number, bucket?: any, rand?: any}} ctx */
export async function collectRent(ctx, player, { mapId, buildingKey, character, realm = null } = {}) {
  const { db, bucket } = ctx;
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'bad-home' };
  if (typeof character !== 'string' || !REALM_ID_RE.test(character)) return { error: 'realm-only' };
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  if (!side.at) return { error: 'realm-needed' };
  if (await overRate({ db, nowS: ctx.nowS }, `rent:${player.id}`, RENT_WRITES_MAX, RENT_WRITES_WINDOW_S)) return { error: 'rent-rate' };
  const home = await db.prepare(`SELECT rent_due, region FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL AND (deed = 0 OR char_id = ?)`)
    .bind(mapId, buildingKey, player.id, character).first();
  if (!home) return { error: 'no-home' };
  const due = Math.max(0, Number(home.rent_due) || 0);
  if (!due) return { error: 'rent-none' };
  const prep = await prepareRealmRecord(ctx, player.id, side.at, (save) => (creditSave(save, due, { bank: home.region }) ? null : 'no-data'));
  if (prep.error) return prep;
  try {
    await db.batch([
      ...prep.steps,
      db.prepare('UPDATE homes SET rent_due = rent_due - ? WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL AND (deed = 0 OR char_id = ?) AND rent_due >= ?')
        .bind(due, mapId, buildingKey, player.id, character, due),
      mustChange(db),
    ]);
  } catch {
    await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
    return (await recordMovedOf(db, player.id, side.at)) || { error: 'rent-none' };
  }
  await dropObjects(bucket, [prep.prev]);
  return { ok: true, gold: due, realm: { seq: prep.seq } };
}
