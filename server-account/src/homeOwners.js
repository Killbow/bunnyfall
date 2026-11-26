// @ts-check
// Co-owners of a house: living characters of the main owner's account, added by the main.
import { accountKind, overRate } from './accounts.js';
import { homeMapIdOk, homeBuildingKeyOk } from '../../src/net/homeLaw.js';
import { REALM_ID_RE } from './realm.js';

export const HOME_OWNERS_MAX = 8;

const mainOf = (db, mapId, buildingKey, playerId) =>
  db.prepare('SELECT * FROM homes WHERE map_id = ? AND building_key = ? AND player = ? AND guild_id IS NULL').bind(mapId, buildingKey, playerId).first();

async function ownersOf(db, home) {
  const main = await db.prepare('SELECT name FROM realm_characters WHERE id = ? AND player = ?').bind(home.char_id, home.player).first();
  const rows = (await db.prepare(`SELECT o.char_id AS char, c.name AS name, o.added_at AS at FROM home_owners o
    LEFT JOIN realm_characters c ON c.id = o.char_id AND c.player = o.player
    WHERE o.map_id = ? AND o.building_key = ? ORDER BY o.added_at, o.char_id`).bind(home.map_id, home.building_key).all())?.results ?? [];
  return { main: { char: home.char_id, name: main?.name ?? '' }, owners: rows.map((r) => ({ char: r.char, name: r.name ?? '', at: r.at })) };
}

export async function homeOwners(ctx, player, body = {}) {
  const { db, nowS } = ctx;
  const { op, mapId, buildingKey, character, char } = body ?? {};
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey)) return { error: 'no-home' };
  if (op !== 'list' && op !== 'add' && op !== 'remove') return { error: 'bad-owner' };
  if (op !== 'list' && (typeof character !== 'string' || !REALM_ID_RE.test(character) || typeof char !== 'string' || !REALM_ID_RE.test(char))) return { error: 'bad-owner' };
  const home = await mainOf(db, mapId, buildingKey, player.id);
  if (!home) return { error: 'no-home' };
  if (op === 'list') return { ok: true, ...(await ownersOf(db, home)) };
  if (await overRate(ctx, `homeowners:${player.id}`, 60, 3600)) return { error: 'home-rate' };
  if (home.deed === 1) return { error: 'home-deed' };
  if (op === 'add') {
    if (home.char_id !== character) return { error: 'home-not-main' };
    if (char === home.char_id) return { error: 'home-owner-main' };
    const target = await db.prepare('SELECT id FROM realm_characters WHERE id = ? AND player = ? AND dead_at IS NULL AND NOT (origin_id IS NOT NULL AND bytes = 0)').bind(char, player.id).first();
    if (!target) return { error: 'home-owner-char' };
    const wrote = await db.prepare(`INSERT OR IGNORE INTO home_owners (map_id, building_key, char_id, player, added_at)
      SELECT ?1, ?2, ?3, ?4, ?5 WHERE (SELECT COUNT(*) FROM home_owners WHERE map_id = ?1 AND building_key = ?2) < ?6
      AND EXISTS (SELECT 1 FROM homes WHERE map_id = ?1 AND building_key = ?2 AND player = ?4 AND char_id = ?7 AND guild_id IS NULL AND deed = 0)`)
      .bind(mapId, buildingKey, char, player.id, nowS, HOME_OWNERS_MAX, character).run();
    if (!wrote?.meta?.changes) {
      if (await db.prepare('SELECT 1 AS y FROM home_owners WHERE map_id = ? AND building_key = ? AND char_id = ?').bind(mapId, buildingKey, char).first()) return { error: 'home-owner-listed' };
      return { error: 'home-owners-full' };
    }
    return { ok: true, ...(await ownersOf(db, home)) };
  }
  if (char === home.char_id) return { error: 'home-owner-main' };
  if (home.char_id !== character && character !== char) return { error: 'home-not-main' };
  const gone = await db.prepare('DELETE FROM home_owners WHERE map_id = ? AND building_key = ? AND char_id = ?').bind(mapId, buildingKey, char).run();
  if (!gone?.meta?.changes) return { error: 'home-owner-none' };
  return { ok: true, ...(await ownersOf(db, home)) };
}
