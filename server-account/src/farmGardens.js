// @ts-check
// BUNNYFALL: shared gardens. Revision claims and harvest deposits commit in one batch.
import { guildActorOf } from './guilds.js';
import { mustChange } from './realm.js';
import { emptyGarden, validGarden, stepFarmGardenAction, stepFarmBirds, stepFarmBurn } from '../../src/net/farmGardenLaw.js';
import { cropMaterial } from '../../src/net/farmLaw.js';
import { farmProgressStep, farmProgressRead } from './farmProgress.js';
import { stepFarmHaul } from '../../src/net/farm/haulLaw.js';   // FARM EXPANSION: sacks carried to the wagon
import { farmWorkOf, farmWorkStep, farmTitleCrossed, FARM_WORK_DAY_CAP } from '../../src/net/farm/farmWorkLaw.js';   // FARM EXPANSION: farm work and its titles
import { stepFarmHerdAction, kindContent } from '../../src/net/farm/herdLaw.js';   // PHASE 3: the herd
import { farmWeek } from '../../src/net/farmProgressLaw.js';

export async function farmGarden({ db, nowS, env }, player, body = {}) {
  const { character, mapId, op = 'read', version } = body;
  if (!Number.isSafeInteger(mapId) || mapId < 0 || mapId > 0xffffffff || !['read', 'hoe', 'plant', 'water', 'harvest', 'upgrade', 'deliver', 'haul', 'weed', 'birds', 'burn', 'herd'].includes(op)) return { error: 'farm-bed-bad' };
  const management = op === 'upgrade' || op === 'deliver';
  // Any authenticated visitor may see a garden. Only Company members may change it.
  const actor = op === 'read' ? null : await guildActorOf(db, player, character);
  if (actor && 'error' in actor) return actor;
  const farm = await db.prepare('SELECT * FROM company_farms WHERE map_id = ?').bind(mapId).first();
  if (!farm) return { error: 'farm-not-ours' };
  if (op !== 'read' && farm.guild_id !== actor.me.guild_id) return { error: 'farm-not-ours' };
  if ((management || op === 'burn' || (op === 'herd' && body.act === 'buy')) && Number(actor.me.rank) > 1) return { error:'farm-rank' };   // PHASE 2c/3: burning a strain and buying an animal are an officer's   // PHASE 2c: burning a strain is an officer's
  await db.prepare('INSERT OR IGNORE INTO company_farm_gardens (map_id, version, garden) VALUES (?, 0, ?)').bind(mapId, JSON.stringify(emptyGarden())).run();
  const row = await db.prepare('SELECT version, garden FROM company_farm_gardens WHERE map_id = ?').bind(mapId).first();
  let garden;
  try { garden = JSON.parse(row.garden); } catch { return { error: 'farm-bed-bad' }; }
  if (!validGarden(garden)) return { error: 'farm-bed-bad' };
  if (op === 'read') return { ok: true, ...(version === Number(row.version) ? { unchanged: true } : { garden }), ...await farmProgressRead(db,player,character,farm.guild_id,body.details===true,nowS), version: Number(row.version), nowS };
  if (!Number.isSafeInteger(version) || version !== Number(row.version)) return { error: 'farm-bed-version' };
  const step = management ? await farmProgressStep({db,nowS,env},player,farm,garden,body) : op === 'haul' ? stepFarmHaul(garden, body.sacks, nowS)
    : op === 'birds' ? stepFarmBirds(garden, { mapId, who: player.id, game: body.game }, nowS)
    : op === 'burn' ? stepFarmBurn(garden, body.strain)
    : op === 'herd' ? stepFarmHerdAction(garden, { ...body, mapId, who: player.id }, nowS, farmWeek)
    : stepFarmGardenAction(garden, { ...body, climate: Number(farm.climate), who: player.id }, nowS);   // the farm's own climate and the account's own id, never the client's
  if ('error' in step) return step;
  const statements = [db.prepare(`UPDATE company_farm_gardens SET garden = ?1, version = version + 1
    WHERE map_id = ?2 AND version = ?3 AND EXISTS (SELECT 1 FROM company_farms WHERE map_id = ?2 AND guild_id = ?4)
      AND EXISTS (SELECT 1 FROM guild_members WHERE player = ?5 AND char_id = ?6 AND guild_id = ?4 AND (?7 = 0 OR rank <= 1))`)
    .bind(JSON.stringify(step.garden), mapId, version, actor.me.guild_id, player.id, character, management?1:0), mustChange(db)];
  if (management) statements.push(...step.statements);
  // PHASE 3: the herd's money and food - an animal bought from the treasury, a feed from the communal Stores
  if (op === 'herd' && step.gold) {
    statements.push(db.prepare(`UPDATE guilds SET treasury = treasury - ?2, realm_gold = MIN(realm_gold, treasury - ?2), moved_by = ?3, moved_at = ?4, moved_kind = 'farm-animal'
      WHERE id = ?1 AND treasury >= ?2`).bind(actor.me.guild_id, step.gold, String(player.handle || 'Farmer').slice(0, 64), nowS), mustChange(db));
  }
  if (op === 'herd' && step.consume) {
    const { results } = await db.prepare("SELECT rowid AS rid, material, qty FROM guild_prof_stores WHERE guild_id = ? AND dep_player = '' AND dep_char = '' AND qty > 0 AND material LIKE 'food:%' ORDER BY material").bind(actor.me.guild_id).all();
    let left = step.consume.units;
    for (const r of results ?? []) {
      if (!left) break;
      if (step.consume.feed === 'grain' && !['food:grain', 'food:corn'].includes(r.material)) continue;
      const take = Math.min(left, Number(r.qty)); left -= take;
      statements.push(db.prepare(`UPDATE guild_prof_stores SET qty = qty - ?2, moved_by = 'Farm feed', moved_at = ?3 WHERE rowid = ?1 AND guild_id = ?4 AND qty >= ?2`).bind(r.rid, take, nowS, actor.me.guild_id), mustChange(db));
    }
    if (left) return { error: 'farm-herd-nofeed' };
  }
  const harvests = management || op === 'haul' || op === 'herd' ? [] : step.harvests ?? [];
  const deposits = new Map();
  for (const d of op === 'herd' ? step.deposit ?? [] : []) deposits.set(d.material, (deposits.get(d.material) ?? 0) + d.qty);   // PHASE 3: the milk
  for (const harvest of harvests) {
    const material = harvest.material ?? cropMaterial('herbs', Math.floor(nowS / 86400), Number(farm.climate), Number(farm.region));
    if (!material) return { error: 'farm-bed-bad' };
    deposits.set(material,(deposits.get(material)??0)+harvest.qty);
  }
  for (const [material,qty] of deposits) {
    statements.push(db.prepare(`INSERT INTO guild_prof_stores (guild_id, material, dep_player, dep_char, qty, moved_by, moved_at)
      VALUES (?1, ?2, '', '', ?3, ?4, ?5) ON CONFLICT (guild_id, material, dep_player, dep_char)
      DO UPDATE SET qty = MIN(50000, qty + excluded.qty), moved_by = excluded.moved_by, moved_at = excluded.moved_at`)
      .bind(actor.me.guild_id, material, qty, `Garden: ${farm.name}`.slice(0, 64), nowS));
  }
  const day = Math.floor(nowS / 86400);
  // FARM WORK (docs/FARM-EXPANSION.md 10.1): the work this action did, raised in this batch, never past the day's cap
  const points = management ? 0 : farmWorkOf(op, { worked: step.worked?.length ?? 0, harvested: harvests.reduce((n, h) => n + h.qty, 0), sacks: op === 'haul' ? (body.sacks?.length ?? 0) : 0, game: !!step.played?.full, horse: op === 'haul' && kindContent(garden, 'horse', nowS), tended: step.tended ?? 0 });
  let work = null;
  if (points > 0) {
    const was = await db.prepare('SELECT farm_work, farm_work_day, farm_work_today FROM players WHERE id = ?').bind(player.id).first();
    if (was) {
      const next = farmWorkStep(Number(was.farm_work_day), Number(was.farm_work_today), day, points), total = Number(was.farm_work) + next.gained;
      work = { total, today: next.today, title: farmTitleCrossed(Number(was.farm_work), total) };
      statements.push(db.prepare(`UPDATE players SET
          farm_work = farm_work + MAX(0, CASE WHEN farm_work_day = ?2 THEN MIN(?3, farm_work_today + ?4) - farm_work_today ELSE MIN(?3, ?4) END),
          farm_work_today = CASE WHEN farm_work_day = ?2 THEN MAX(farm_work_today, MIN(?3, farm_work_today + ?4)) ELSE MIN(?3, ?4) END,
          farm_work_day = ?2
        WHERE id = ?1`).bind(player.id, day, FARM_WORK_DAY_CAP, points));
    }
  }
  for (const bed of management ? [] : step.worked) statements.push(db.prepare('INSERT OR IGNORE INTO company_farm_garden_work (map_id, day, account, bed) VALUES (?, ?, ?, ?)').bind(mapId, day, player.id, bed));
  statements.push(db.prepare('DELETE FROM company_farm_garden_work WHERE map_id = ? AND day < ?').bind(mapId, day - 7));
  statements.push(db.prepare(`INSERT OR IGNORE INTO company_farm_chores (map_id, day, account, name)
    SELECT ?1, ?2, ?3, ?4 WHERE (SELECT COUNT(*) FROM company_farm_garden_work WHERE map_id = ?1 AND day = ?2 AND account = ?3) >= 3`)
    .bind(mapId, day, player.id, actor.me.name || player.handle || 'Farmer'));
  let result;
  try { result = await db.batch(statements); } catch { return { error: 'farm-bed-version' }; }
  return { ok: true, garden: step.garden, version: version + 1, nowS, mayManage:Number(actor.me.rank)<=1, harvested:harvests.reduce((n,h)=>n+h.qty,0), reward:step.reward, upgraded:step.upgraded, hauled:step.hauled, work, played:step.played ?? null, chased:step.chased, grades:harvests.map((h)=>h.grade), strain:step.strain ?? null, bought:step.bought ?? null, milk:step.milk ?? 0, choreAwarded: !management && !!result.at(-1)?.meta?.changes };
}
