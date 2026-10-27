// BUNNYFALL CRAFTING REWORK, PHASE 2: THE MATERIAL UPGRADE (the service's side).
//
//   POST /v1/prof/upgrade { character, recipe, rid } -> { ok, recipe, xp, track, stores } | { repeat, ... } | { error }
//
// A found piece one metal up (src/net/upgradeLaw.js): `recipe` is the recipe it becomes, which the client reads off the
// piece (upgradeRecipeOf). The service cannot see the pack, so the piece is the save's word, as a temper's found piece is
// (professions.js temperPiece); the Stores' spend is the bound. It asks the new recipe's rank of Smithing, spends 80% of
// the new metal's main input, and pays the craft's XP at its tier.
import { mintId, overRate } from './accounts.js';
import { asks, shut, storeOf, trackRow, trackView, craftCapSql, workableSql, workStatements, workHeld } from './professions.js';
import { firmStatsOf } from './firmament.js';
import { rankOfXp, trackOf, PROF_OPS_MAX, PROF_OPS_WINDOW_S } from '../../src/net/professionLaw.js';
import { scaleXp, xpPct } from '../../src/net/firmament/firmamentLaw.js';
import { upgradeTarget, upgradeCost, upgradeXp } from '../../src/net/upgradeLaw.js';

async function upgradeAnswer(db, player, row, nowS, extra = {}) {
  return {
    ok: true, ...extra, recipe: row.recipe, xp: Number(row.xp),
    track: trackView(await trackRow(db, player.id, row.char_id, 'smithing'), 'smithing', nowS),
    stores: [await storeOf(db, player.id, row.char_id, row.material)],
  };
}

/** An upgrade: the new metal's share out of the Stores, the XP onto Smithing, in one batch. */
export async function upgradeMaterial(ctx, player, env, { character, recipe: id, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const prior = await db.prepare('SELECT * FROM prof_upgrades WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return upgradeAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  const r = upgradeTarget(id);
  if (!r) return { error: 'prof-upgrade' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const craft = trackOf(r.profession);
  const track = await trackRow(db, player.id, character, craft);
  const rank = rankOfXp(Number(track?.xp ?? 0));
  if (rank < r.rank) return { error: 'prof-rank' };
  const cost = upgradeCost(r);
  const cap = craftCapSql('?1', '?2', craft);
  const xp = scaleXp(upgradeXp(r, rank), xpPct(await firmStatsOf(db, player, env, character), craft));
  const nonce = mintId(rand);
  const decided = 'EXISTS (SELECT 1 FROM prof_upgrades WHERE player = ?1 AND rid = ?5 AND n = ?6)';
  await db.batch([
    // THE DECISION: the input held at a station (never gold's units) - and the XP what the track can take
    db.prepare(`INSERT OR IGNORE INTO prof_upgrades (player, rid, char_id, recipe, material, qty, xp, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6,
        MAX(0, MIN(?7, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?10), 0))), ?8, ?9
      WHERE ${workableSql('?1', '?2', '?5')} >= ?6`)
      .bind(player.id, character, rid, r.id, cost.key, cost.n, xp, nowS, nonce, craft),
    ...workStatements(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided, binds: [cost.key, cost.n, rid, nonce] }),
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, ?6, MIN(${cap}, xp), ?4 FROM prof_upgrades WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
      .bind(player.id, character, rid, nowS, nonce, craft),
  ]);
  const made = await db.prepare('SELECT * FROM prof_upgrades WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return upgradeAnswer(db, player, made, nowS);
  if (made) return upgradeAnswer(db, player, made, nowS, { repeat: true });
  const st = await storeOf(db, player.id, character, cost.key);
  return { error: workHeld(st) + (st.gold ?? 0) >= cost.n ? 'stores-gold' : 'stores-short', material: cost.key };
}
