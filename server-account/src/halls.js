// @ts-check
import { displayName, overRate } from './accounts.js';
import { guildActorOf } from './guilds.js';
import { marksOpenFor } from './marks.js';
import { mustChange } from './realm.js';
import { GUILD_TREASURY_MAX, GUILD_OPS_MAX, GUILD_OPS_WINDOW_S } from '../../src/net/guildLaw.js';
import { GUILD_HALL_ENTRY_DEFAULT, HALL_POWERS, hallMay, guildHallPrice, guildHallEntryOk, guildHallOwner } from '../../src/net/hallLaw.js';
import { HOME_CLAIMS_MAX, HOME_CLAIMS_WINDOW_S, homeMapIdOk, homeBuildingKeyOk, homeRegionOk, homePriceOk, homeSaleRefund, homeInArenaCell, homeLayoutOk, homeMoved } from '../../src/net/homeLaw.js';
import { HERALDRY_CHANGE_DRAKES, heraldryOf, heraldrySame } from '../../src/net/heraldryLaw.js';
import { MARKS_RID_RE, utcDay } from '../../src/net/marksLaw.js';
import { seatWeekOf } from '../../src/net/townSeatLaw.js';
import { LAYOUT_MATCH_SQL, layoutMatchBinds, TOWN_LAYOUT_SQL, townLayoutRefusal } from './townLayout.js';

export async function hallViewOf(db, guildId) {
  const h = await db.prepare('SELECT map_id, building_key, region, entry, price, paid, bought_at FROM homes WHERE guild_id = ?').bind(guildId).first();
  return h ? { mapId: h.map_id, buildingKey: h.building_key, region: h.region, entry: h.entry, price: h.price, paid: h.paid, boughtAt: h.bought_at } : null;
}

export function heraldryOfRow(raw) {
  if (typeof raw !== 'string') return null;
  try { return heraldryOf(JSON.parse(raw)); } catch { return null; }
}

const piecesBackOf = async (db, mapId, buildingKey) => db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(paid), 0) AS paid,
    COALESCE(SUM(CASE WHEN json_valid(place) THEN paid / 2 ELSE 0 END), 0) AS back FROM home_decor WHERE map_id = ? AND building_key = ?`).bind(mapId, buildingKey).first();

/** @param {{db: any, nowS: number}} ctx */
export async function buyHall(ctx, player, body = {}) {
  const { character, mapId, buildingKey, region, price, layout = null } = body ?? {};
  const { db, nowS } = ctx;
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!hallMay(a.me.rank, 'hall')) return { error: 'guild-rank' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey) || !homeRegionOk(region) || !Number.isSafeInteger(price) || !(price > 0)) return { error: 'bad-home' };
  if (!homePriceOk(price)) return { error: 'home-update' };
  if (!homeLayoutOk(layout)) return { error: 'bad-home' };
  if (homeInArenaCell(mapId, buildingKey)) return { error: 'home-arena' };
  if (!Object.hasOwn(body ?? {}, 'layout')) return { error: 'home-update' };
  const gid = a.me.guild_id;
  const held = await db.prepare('SELECT guild_id FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first();
  if (held) return held.guild_id === gid ? { ok: true, repeat: true, hall: await hallViewOf(db, gid) } : { error: 'home-taken' };
  const crossed = await townLayoutRefusal(db, mapId, layout);
  if (crossed) return crossed;
  if (await overRate({ db, nowS }, `home:${player.id}`, HOME_CLAIMS_MAX, HOME_CLAIMS_WINDOW_S)) return { error: 'home-rate' };
  const cost = guildHallPrice(price);
  const who = displayName(player);
  const g = await db.prepare('SELECT name FROM guilds WHERE id = ?').bind(gid).first();
  try {
    await db.batch([
      // The treasury debit and the hall's row share one batch, each guarded, so both land or neither does.
      db.prepare(`UPDATE guilds SET treasury = treasury - ?1, realm_gold = realm_gold - ?1, moved_by = ?2, moved_at = ?3, moved_kind = 'hall'
        WHERE id = ?4 AND treasury >= ?1 AND realm_gold >= ?1 AND NOT EXISTS (SELECT 1 FROM homes WHERE guild_id = ?4)
          AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?5 AND guild_id = ?4 AND rank = ?6)`).bind(cost, who, nowS, gid, a.me.rid, a.me.rank),
      mustChange(db),
      db.prepare(`INSERT INTO homes (map_id, building_key, player, char_id, owner_name, region, entry, price, bought_at, paid, guild_id, layout)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${TOWN_LAYOUT_SQL}
        WHERE NOT EXISTS (SELECT 1 FROM homes t WHERE t.map_id = ? AND NOT (${LAYOUT_MATCH_SQL}))`)
        .bind(mapId, buildingKey, player.id, guildHallOwner(gid), g?.name ?? '', region, GUILD_HALL_ENTRY_DEFAULT, price, nowS, cost, gid, mapId, mapId, layout, mapId, ...layoutMatchBinds(layout)),
      mustChange(db),
    ]);
  } catch {
    const now = await db.prepare('SELECT guild_id FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first();
    if (now) return now.guild_id === gid ? { ok: true, repeat: true, hall: await hallViewOf(db, gid) } : { error: 'home-taken' };
    if (await db.prepare('SELECT 1 FROM homes WHERE guild_id = ?').bind(gid).first()) return { error: 'guild-hall-have' };
    const lost = await townLayoutRefusal(db, mapId, layout);
    if (lost) return lost;
    const t = await db.prepare('SELECT treasury, realm_gold FROM guilds WHERE id = ?').bind(gid).first();
    if (!t) return { error: 'no-guild' };
    if (t.treasury < cost) return { error: 'guild-treasury-short' };
    if (t.realm_gold < cost) return { error: 'guild-treasury-old' };
    return { error: 'guild-rank' };
  }
  const t = await db.prepare('SELECT treasury FROM guilds WHERE id = ?').bind(gid).first();
  return { ok: true, hall: await hallViewOf(db, gid), cost, treasury: t?.treasury ?? 0, moved: homeMoved(mapId, [buildingKey]) };
}

// The batch holds the hall and its pieces as they were read, so a piece placed between the read and the
// sale is never sold unpaid.
/** @param {{db: any, nowS: number}} ctx */
export async function sellHall(ctx, player, { character, mapId = null, buildingKey = null } = {}) {
  const { db, nowS } = ctx;
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!hallMay(a.me.rank, 'hall')) return { error: 'guild-rank' };
  const atDoor = mapId != null || buildingKey != null;
  if (atDoor && (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey))) return { error: 'bad-home' };
  const gid = a.me.guild_id;
  const h = await db.prepare('SELECT * FROM homes WHERE guild_id = ?').bind(gid).first();
  if (!h) return { error: 'guild-hall-none' };
  if (atDoor && (h.map_id !== mapId || h.building_key !== buildingKey)) return { error: 'guild-hall-moved' };
  if (await overRate({ db, nowS }, `guild:${player.id}`, GUILD_OPS_MAX, GUILD_OPS_WINDOW_S)) return { error: 'guild-rate' };
  const p = await piecesBackOf(db, h.map_id, h.building_key);
  const refund = homeSaleRefund(Math.max(0, Number(h.paid) || 0));
  const piecesBack = Math.max(0, Number(p?.back) || 0);
  const back = refund + piecesBack;
  try {
    await db.batch([
      db.prepare(`DELETE FROM homes WHERE map_id = ?1 AND building_key = ?2 AND guild_id = ?3 AND paid = ?4
        AND (SELECT COUNT(*) FROM home_decor WHERE map_id = ?1 AND building_key = ?2) = ?5
        AND (SELECT COALESCE(SUM(paid), 0) FROM home_decor WHERE map_id = ?1 AND building_key = ?2) = ?6
        AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?7 AND guild_id = ?3 AND rank = ?8)`)
        .bind(h.map_id, h.building_key, gid, h.paid, Number(p?.n) || 0, Number(p?.paid) || 0, a.me.rid, a.me.rank),
      mustChange(db),
      ...(back > 0 ? [
        db.prepare(`UPDATE guilds SET treasury = treasury + ?1, realm_gold = realm_gold + ?1, moved_by = ?2, moved_at = ?3, moved_kind = 'hall-sale'
          WHERE id = ?4 AND treasury + ?1 <= ?5`).bind(back, displayName(player), nowS, gid, GUILD_TREASURY_MAX),
        mustChange(db),
      ] : []),
    ]);
  } catch {
    if (!(await db.prepare('SELECT 1 FROM homes WHERE guild_id = ?').bind(gid).first())) return { error: 'guild-hall-none' };
    const t = await db.prepare('SELECT treasury FROM guilds WHERE id = ?').bind(gid).first();
    if (t && t.treasury + back > GUILD_TREASURY_MAX) return { error: 'guild-treasury-full' };
    return { error: 'guild-hall-moved' };
  }
  const t = await db.prepare('SELECT treasury FROM guilds WHERE id = ?').bind(gid).first();
  return { ok: true, refund, decorCount: Number(p?.n) || 0, decorBack: piecesBack, back, treasury: t?.treasury ?? 0, moved: homeMoved(h.map_id, [], [h.building_key]) };
}

/** @param {{db: any, nowS: number}} ctx */
export async function setHallEntry(ctx, player, { character, entry } = {}) {
  const { db, nowS } = ctx;
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!hallMay(a.me.rank, 'hallEntry')) return { error: 'guild-rank' };
  if (!guildHallEntryOk(entry)) return { error: 'bad-entry' };
  if (await overRate({ db, nowS }, `guild:${player.id}`, GUILD_OPS_MAX, GUILD_OPS_WINDOW_S)) return { error: 'guild-rate' };
  // The rank is checked again in the write, so a demotion after the read changes nothing.
  const r = await db.prepare(`UPDATE homes SET entry = ?1 WHERE guild_id = ?2
    AND EXISTS (SELECT 1 FROM guild_members WHERE rowid = ?3 AND guild_id = ?2 AND rank IN (${HALL_POWERS.hallEntry.join(', ')}))`).bind(entry, a.me.guild_id, a.me.rid).run();
  if (r?.meta?.changes) return { ok: true, entry };
  return { error: (await db.prepare('SELECT 1 FROM homes WHERE guild_id = ?').bind(a.me.guild_id).first()) ? 'guild-rank' : 'guild-hall-none' };
}

/** @param {{db: any, nowS: number, env?: any}} ctx */
export async function setHeraldry(ctx, player, { character, heraldry, rid } = {}) {
  const { db, nowS, env } = ctx;
  const a = await guildActorOf(db, player, character);
  if ('error' in a) return a;
  if (!hallMay(a.me.rank, 'heraldry')) return { error: 'guild-rank' };
  const next = heraldryOf(heraldry);
  if (!next) return { error: 'bad-heraldry' };
  const gid = a.me.guild_id;
  const paidLine = typeof rid === 'string' && MARKS_RID_RE.test(rid)
    ? await db.prepare("SELECT kind FROM marks_ledger WHERE actor = ? AND rid = ?").bind(player.id, rid).first() : null;
  const row = await db.prepare('SELECT heraldry FROM guilds WHERE id = ?').bind(gid).first();
  const was = heraldryOfRow(row?.heraldry);
  if (paidLine) return paidLine.kind === 'heraldry' ? { ok: true, repeat: true, heraldry: was } : { error: 'marks-rid' };
  if (heraldrySame(was, next)) return { error: 'heraldry-same' };
  const week = seatWeekOf(nowS * 1000);
  const noBattle = `NOT EXISTS (SELECT 1 FROM town_seat_battles WHERE week = ${week} AND (attacker = guilds.id OR defender = guilds.id) AND state <> 'void')`;
  const inBattle = async () => !!(await db.prepare("SELECT 1 FROM town_seat_battles WHERE week = ? AND (attacker = ? OR defender = ?) AND state <> 'void'").bind(week, gid, gid).first());
  if (was && await inBattle()) return { error: 'heraldry-siege' };
  if (await overRate({ db, nowS }, `guild:${player.id}`, GUILD_OPS_MAX, GUILD_OPS_WINDOW_S)) return { error: 'guild-rate' };
  const json = JSON.stringify(next);
  const stillMaster = `EXISTS (SELECT 1 FROM guild_members WHERE rowid = ${Number(a.me.rid)} AND guild_id = guilds.id AND rank IN (${HALL_POWERS.heraldry.join(', ')}))`;
  const whyNot = async () => ((await db.prepare(`SELECT ${stillMaster.replace('guilds.id', '?')} AS m`).bind(gid).first())?.m ? 'heraldry-moved' : 'guild-rank');
  if (!was) {
    const r = await db.prepare(`UPDATE guilds SET heraldry = ? WHERE id = ? AND heraldry IS NULL AND ${stillMaster}`).bind(json, gid).run();
    return r?.meta?.changes ? { ok: true, heraldry: next, cost: 0 } : { error: await whyNot() };
  }
  if (typeof rid !== 'string' || !MARKS_RID_RE.test(rid)) return { error: 'marks-rid' };
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  try {
    await db.batch([
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'guild', ?1, 'burn', NULL, 'heraldry', ?2, ?3, ?4, ?5, ?6, ?7
        WHERE COALESCE((SELECT balance FROM guild_marks WHERE guild_id = ?1), 0) >= ?2
          AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?5 AND rid = ?7)`)
        .bind(gid, HERALDRY_CHANGE_DRAKES, utcDay(nowS), nowS, player.id, displayName(player), rid),
      mustChange(db),
      db.prepare(`UPDATE guilds SET heraldry = ? WHERE id = ? AND heraldry = ? AND ${stillMaster} AND ${noBattle}`).bind(json, gid, row.heraldry),
      mustChange(db),
    ]);
  } catch {
    const landed = await db.prepare('SELECT kind FROM marks_ledger WHERE actor = ? AND rid = ?').bind(player.id, rid).first();
    if (landed?.kind === 'heraldry') return { ok: true, repeat: true, heraldry: heraldryOfRow((await db.prepare('SELECT heraldry FROM guilds WHERE id = ?').bind(gid).first())?.heraldry) };
    if (await inBattle()) return { error: 'heraldry-siege' };
    const bal = await db.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').bind(gid).first();
    return { error: Number(bal?.balance ?? 0) < HERALDRY_CHANGE_DRAKES ? 'heraldry-drakes' : await whyNot() };
  }
  return { ok: true, heraldry: next, cost: HERALDRY_CHANGE_DRAKES };
}
