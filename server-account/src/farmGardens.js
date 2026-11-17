// @ts-check
// BUNNYFALL: shared gardens. Revision claims and harvest deposits commit in one batch.
import { guildActorOf } from './guilds.js';
import { mustChange } from './realm.js';
import { emptyGarden, validGarden, stepFarmGarden } from '../../src/net/farmGardenLaw.js';
import { cropMaterial } from '../../src/net/farmLaw.js';

export async function farmGarden({ db, nowS }, player, body = {}) {
  const { character, mapId, op = 'read', version } = body;
  if (!Number.isSafeInteger(mapId) || mapId < 0 || mapId > 0xffffffff || !['read', 'hoe', 'plant', 'water', 'harvest'].includes(op)) return { error: 'farm-bed-bad' };
  // Any authenticated visitor may see a garden. Only Company members may change it.
  const actor = op === 'read' ? null : await guildActorOf(db, player, character);
  if (actor && 'error' in actor) return actor;
  const farm = await db.prepare('SELECT * FROM company_farms WHERE map_id = ?').bind(mapId).first();
  if (!farm) return { error: 'farm-not-ours' };
  if (op !== 'read' && farm.guild_id !== actor.me.guild_id) return { error: 'farm-not-ours' };
  await db.prepare('INSERT OR IGNORE INTO company_farm_gardens (map_id, version, garden) VALUES (?, 0, ?)').bind(mapId, JSON.stringify(emptyGarden())).run();
  const row = await db.prepare('SELECT version, garden FROM company_farm_gardens WHERE map_id = ?').bind(mapId).first();
  let garden;
  try { garden = JSON.parse(row.garden); } catch { return { error: 'farm-bed-bad' }; }
  if (!validGarden(garden)) return { error: 'farm-bed-bad' };
  if (op === 'read') return { ok: true, ...(version === Number(row.version) ? { unchanged: true } : { garden }), version: Number(row.version), nowS };
  if (!Number.isSafeInteger(version) || version !== Number(row.version)) return { error: 'farm-bed-version' };
  const step = stepFarmGarden(garden, body, nowS);
  if ('error' in step) return step;
  const statements = [db.prepare(`UPDATE company_farm_gardens SET garden = ?1, version = version + 1
    WHERE map_id = ?2 AND version = ?3 AND EXISTS (SELECT 1 FROM company_farms WHERE map_id = ?2 AND guild_id = ?4)
      AND EXISTS (SELECT 1 FROM guild_members WHERE player = ?5 AND char_id = ?6 AND guild_id = ?4)`)
    .bind(JSON.stringify(step.garden), mapId, version, actor.me.guild_id, player.id, character), mustChange(db)];
  if (step.harvest) {
    const material = step.harvest.material ?? cropMaterial('herbs', Math.floor(nowS / 86400), Number(farm.climate), Number(farm.region));
    if (!material) return { error: 'farm-bed-bad' };
    statements.push(db.prepare(`INSERT INTO guild_prof_stores (guild_id, material, dep_player, dep_char, qty, moved_by, moved_at)
      VALUES (?1, ?2, '', '', ?3, ?4, ?5) ON CONFLICT (guild_id, material, dep_player, dep_char)
      DO UPDATE SET qty = MIN(50000, qty + excluded.qty), moved_by = excluded.moved_by, moved_at = excluded.moved_at`)
      .bind(actor.me.guild_id, material, step.harvest.qty, `Garden: ${farm.name}`.slice(0, 64), nowS));
  }
  const day = Math.floor(nowS / 86400);
  statements.push(db.prepare('INSERT OR IGNORE INTO company_farm_garden_work (map_id, day, account, bed) VALUES (?, ?, ?, ?)').bind(mapId, day, player.id, body.bed));
  statements.push(db.prepare('DELETE FROM company_farm_garden_work WHERE map_id = ? AND day < ?').bind(mapId, day - 7));
  statements.push(db.prepare(`INSERT OR IGNORE INTO company_farm_chores (map_id, day, account, name)
    SELECT ?1, ?2, ?3, ?4 WHERE (SELECT COUNT(*) FROM company_farm_garden_work WHERE map_id = ?1 AND day = ?2 AND account = ?3) >= 3`)
    .bind(mapId, day, player.id, actor.me.name || player.handle || 'Farmer'));
  let result;
  try { result = await db.batch(statements); } catch { return { error: 'farm-bed-version' }; }
  return { ok: true, garden: step.garden, version: version + 1, nowS, harvested: step.harvest?.qty ?? 0, choreAwarded: !!result.at(-1)?.meta?.changes };
}
