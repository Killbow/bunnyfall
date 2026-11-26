import { upgradeArgents } from '../../src/net/gearUpgradeLaw.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { marksOpenFor, balanceOf } from './marks.js';
// @ts-check
import { mintId, overRate } from './accounts.js';
import {
  asks, shut, trackView, trackRow, storeOf, seatStepsFor, workableSql, workStatements, workHeld, focusXpSql,
} from './professions.js';
import { dice } from './unitRoll.js';
import { rankOfXp, specsAt, STORES_MAX, PROF_XP_MAX, PROF_OPS_MAX, PROF_OPS_WINDOW_S, ARCANE_ESSENCE, trackOf } from '../../src/net/professionLaw.js';
import { recipeById, PROVENANCE_RE } from '../../src/net/recipeLaw.js';
import { halfXp } from '../../src/net/craft/craftLaw.js';
import {
  potionById, brewSpends, brewCount, potentChance, potentPct, potentAble, brewXp, brewFirstXp, DISTILLER,
  piecePoints, essenceOf, disenchantXp, DISENCHANTER,
} from '../../src/net/alchemyLaw.js';
import { prepareRealmRecord, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed, craftHoldOf } from './realm.js';
import { takeTradeGoods, tradeableRecord } from '../../src/net/realmTradeLaw.js';
import { pieceListable } from '../../src/net/marketLaw.js';
import { firmStatsOf } from './firmament.js';
import { xpPct, scaleXp } from '../../src/net/firmament/firmamentLaw.js';
import { reforgeEssence, REFORGE_RANK } from '../../src/net/temperLaw.js';
import { LOOSE_ORIGIN } from '../../src/net/bagLaw.js';

const HERB_RE = /^p[12]:\d+$/;

async function tracksOf(db, player, character, profession, nowS) {
  const { results: tracks = [] } = await db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(player, character).all();
  const ranks = Object.fromEntries(tracks.map((t) => [t.profession, rankOfXp(Number(t.xp))]));
  const craft = trackOf(profession);
  return { ranks, rank: ranks[craft] ?? 0, specs: specsAt(tracks.find((t) => t.profession === craft), nowS) };
}

async function brewAnswer(db, player, row, nowS, extra = {}) {
  /** @type {string[]} */
  const keys = (() => { try { const k = JSON.parse(row.keys); return Array.isArray(k) ? k : []; } catch { return []; } })();
  return {
    ok: true, ...extra, potion: row.potion, keys, count: Number(row.count), potent: Number(row.potent), unbruised: Number(row.unbruised),
    steps: Number(row.steps), xp: Number(row.xp), first: Number(row.first) === 1,
    track: trackView(await trackRow(db, player.id, row.char_id, 'alchemy'), 'alchemy', nowS),
    stores: await Promise.all([...new Set(keys)].map((k) => storeOf(db, player.id, row.char_id, k))),
  };
}

export async function brewAtStation(ctx, player, env, { character, potion: id, keys, rid, seat = null } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const prior = await db.prepare('SELECT * FROM prof_brews WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return brewAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  const potion = potionById(id);
  if (!potion) return { error: 'bad-recipe' };
  const inputs = brewSpends(potion, keys);
  if (!inputs) return { error: 'bad-brew' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const { rank, specs } = await tracksOf(db, player.id, character, 'alchemy', nowS);
  if (rank < potion.rank) return { error: 'prof-rank' };
  const cap = PROF_XP_MAX;
  const steps = await seatStepsFor(db, player.id, character, seat, 'alchemy', nowS);
  let unbruised = 0;
  const reckoned = [];
  for (const inp of inputs) {
    if (!HERB_RE.test(inp.key)) continue;
    const st = await storeOf(db, player.id, character, inp.key);
    const ownSpent = Math.max(0, Math.min(inp.n, inp.n - st.bought - (st.loose ?? 0)));
    const row = await db.prepare('SELECT qty FROM prof_unbruised WHERE player = ?1 AND char_id = ?2 AND material = ?3').bind(player.id, character, inp.key).first();
    const u = Math.min(ownSpent, Number(row?.qty ?? 0));
    if (u > 0) { unbruised += u; reckoned.push({ key: inp.key, n: u }); }
  }
  const chance = potentChance(rank, { distiller: specs[50] === DISTILLER, unbruised, steps });
  // The die is rolled before potentAble, so every potion draws it and later rolls keep their order.
  const potent = dice(rand) * 100 < chance && potentAble(potion) ? potentPct(specs[100]) : 0;
  const count = brewCount(rank, specs[50], potion);
  const xp = scaleXp(brewXp(potion, rank), xpPct(await firmStatsOf(db, player, env, character), trackOf('alchemy')));
  const nonce = mintId(rand);
  const binds = [player.id, character, rid, potion.id, JSON.stringify(keys), count, potent, unbruised, steps, xp, brewFirstXp(potion), nowS, nonce];
  const held = [];
  inputs.forEach((inp, i) => {
    binds.push(inp.key, inp.n);
    held.push(`${workableSql('?1', '?2', `?${14 + 2 * i}`)} >= ?${15 + 2 * i}`);
  });
  const decided = 'EXISTS (SELECT 1 FROM prof_brews WHERE player = ?1 AND rid = ?5 AND n = ?6)';
  const loose = `EXISTS (SELECT 1 FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND origin = '${LOOSE_ORIGIN}' AND qty > 0 AND material IN (${inputs.map((_, i) => `?${14 + 2 * i}`).join(', ')}))`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO prof_brews (player, rid, char_id, potion, keys, count, potent, unbruised, steps, xp, first, at, n, witnessed)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?9,
        MAX(0, MIN(?10 + f * ?11, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = '${trackOf('alchemy')}'), 0))),
        f, ?12, ?13, CASE WHEN ${loose} THEN 0 ELSE 1 END
      FROM (SELECT CASE WHEN ?11 > 0 AND NOT EXISTS (SELECT 1 FROM prof_brews WHERE player = ?1 AND char_id = ?2 AND potion = ?4) THEN 1 ELSE 0 END AS f)
      WHERE ${held.join(' AND ')}`).bind(...binds),
    // This runs before the input spends, so their unbruised clamp reads the already lowered count.
    ...reckoned.map((u) => db.prepare(`UPDATE prof_unbruised SET qty = MAX(0, qty - ?4)
      WHERE player = ?1 AND char_id = ?2 AND material = ?3 AND EXISTS (SELECT 1 FROM prof_brews WHERE player = ?1 AND rid = ?5 AND n = ?6)`)
      .bind(player.id, character, u.key, u.n, rid, nonce)),
    ...inputs.flatMap((inp) => workStatements(db, {
      player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided, binds: [inp.key, inp.n, rid, nonce],
    })),
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, '${trackOf('alchemy')}', MIN(${cap}, xp), ?4 FROM prof_brews WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
      .bind(player.id, character, rid, nowS, nonce),
  ]);
  const made = await db.prepare('SELECT * FROM prof_brews WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return brewAnswer(db, player, made, nowS);
  if (made) return brewAnswer(db, player, made, nowS, { repeat: true });
  for (const inp of inputs) {
    const st = await storeOf(db, player.id, character, inp.key);
    if (workHeld(st) < inp.n) return { error: workHeld(st) + (st.gold ?? 0) >= inp.n ? 'stores-gold' : 'stores-short', material: inp.key };
  }
  return { error: 'stores-short' };
}

async function disenchantAnswer(db, player, row, nowS, extra = {}) {
  return {
    ok: true, ...extra, provenance: row.provenance, recipe: row.recipe, points: Number(row.points), essence: Number(row.essence),
    origin: row.origin, xp: Number(row.xp),
    track: trackView(await trackRow(db, player.id, row.char_id, 'enchanting'), 'enchanting', nowS),
    store: await storeOf(db, player.id, row.char_id, ARCANE_ESSENCE.key),
  };
}

export async function disenchantPiece(ctx, player, env, { character, provenance, rid, realm = null } = {}) {
  const { db, nowS, rand, bucket } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  // The realm record is asked before the repeat, switch, and rate checks.
  // A retry whose answer was lost then sees that its act landed.
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  const prior = await db.prepare('SELECT * FROM prof_disenchants WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return disenchantAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (typeof provenance !== 'string' || !PROVENANCE_RE.test(provenance)) return { error: 'bad-piece' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const p = await db.prepare('SELECT * FROM products WHERE provenance = ?1').bind(provenance).first();
  if (!p) return { error: 'prof-no-piece', ...(await db.prepare('SELECT 1 FROM prof_disenchants WHERE player = ?1 AND provenance = ?2').bind(player.id, provenance).first() ? { why: 'disenchanted' } : {}) };
  if (p.owner !== player.id) return { error: 'prof-not-yours' };
  const pieceHeld = side.at ? null : await craftHoldOf(db, player.id, provenance);
  if (pieceHeld) return pieceHeld;
  const r = recipeById(p.recipe);
  if (!pieceListable(p.recipe)) return { error: 'prof-no-essence' };
  const points = piecePoints(r, p.hand == null ? null : Number(p.hand));
  const { rank, specs } = await tracksOf(db, player.id, character, 'enchanting', nowS);
  const base = essenceOf(points);
  const essence = essenceOf(points, specs[50] === DISENCHANTER);
  if (essence < 1) return { error: 'prof-no-essence' };
  const origin = p.bought_with === 'gold' ? (Number(p.loose) === 1 ? LOOSE_ORIGIN : 'gold') : p.char_id === character && p.bought_with == null ? 'own' : 'bought';
  const cap = PROF_XP_MAX;
  const xp = scaleXp(disenchantXp(r, rank, base, p.bought_with == null), xpPct(await firmStatsOf(db, player, env, character), 'enchanting'));
  const prep = side.at ? await prepareRealmRecord(ctx, player.id, side.at, (save) => {
    const items = Array.isArray(save.items) ? save.items : [];
    const at = items.findIndex((rec) => rec?.provenance === provenance);
    return at >= 0 && tradeableRecord(items[at]) && takeTradeGoods(save, { items: [items[at]], gold: 0 }, [at]) ? null : 'prof-piece-gone';
  }, { outbound: true }) : null;
  if (prep?.error) return prep;
  const nonce = mintId(rand);
  const decided = 'EXISTS (SELECT 1 FROM prof_disenchants WHERE player = ?1 AND rid = ?2 AND n = ?3)';
  const heldStep = db.prepare('SELECT COALESCE(SUM(qty), 0) AS held FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?3')
    .bind(player.id, character, ARCANE_ESSENCE.key);
  const batch = [
    ...(prep ? prep.steps : []),
    db.prepare(`INSERT OR IGNORE INTO prof_disenchants (player, rid, char_id, provenance, recipe, points, essence, origin, xp, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8,
        MAX(0, MIN(${focusXpSql('?1', '?2', 'enchanting', '?9', halfXp(xp))}, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = 'enchanting'), 0))),
        ?10, ?11
      WHERE EXISTS (SELECT 1 FROM products WHERE provenance = ?4 AND owner = ?1 AND listed = 0)
        AND NOT EXISTS (SELECT 1 FROM market_deliveries WHERE provenance = ?4 AND collected = 0)
        AND NOT EXISTS (SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?4)`)
      .bind(player.id, character, rid, provenance, p.recipe, points, essence, origin, xp, nowS, nonce),
    // mustChange must follow the disenchant INSERT directly: it rolls back the batch when that INSERT wrote no row.
    ...(prep ? [mustChange(db)] : []),
    db.prepare(`DELETE FROM products WHERE provenance = ?4 AND ${decided}`).bind(player.id, rid, nonce, provenance),
    heldStep,
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT player, char_id, ?4, origin, kept FROM (SELECT d.player, d.char_id, d.origin, MIN(d.essence, ?5 - COALESCE((SELECT SUM(qty)
        FROM prof_stores s WHERE s.player = d.player AND s.char_id = d.char_id AND s.material = ?4), 0)) AS kept
        FROM prof_disenchants d WHERE d.player = ?1 AND d.rid = ?2 AND d.n = ?3) WHERE kept > 0
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, rid, nonce, ARCANE_ESSENCE.key, STORES_MAX),
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, 'enchanting', MIN(${cap}, xp), ?4 FROM prof_disenchants WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
      .bind(player.id, character, rid, nowS, nonce),
  ];
  let res = null;
  if (!prep) res = await db.batch(batch);
  else {
    try {
      res = await db.batch(batch);
      await dropObjects(bucket, [prep.prev]);
    } catch {
      await dropIfUnnamed(db, bucket, player.id, side.at.id, prep.key);
      const moved = await recordMovedOf(db, player.id, side.at);
      if (moved && !(moved.error === 'seq' && moved.seq === prep.seq)) return moved;
    }
  }
  const made = await db.prepare('SELECT * FROM prof_disenchants WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) {
    const held = Number(res?.[batch.indexOf(heldStep)]?.results?.[0]?.held ?? NaN);
    const answer = await disenchantAnswer(db, player, made, nowS, prep ? { realm: { seq: prep.seq } } : {});
    return Number.isFinite(held) ? { ...answer, essence: Math.max(0, Math.min(essence, STORES_MAX - held)) } : answer;
  }
  if (made) return disenchantAnswer(db, player, made, nowS, { repeat: true });
  const now = await db.prepare('SELECT owner, listed FROM products WHERE provenance = ?1').bind(provenance).first();
  if (!now) return { error: 'prof-no-piece' };
  if (now.owner !== player.id) return { error: 'prof-not-yours' };
  return { error: 'prof-piece-busy' };
}

async function reforgeAnswer(db, player, row, nowS, extra = {}) {
  return {
    ok: true, ...extra, tier: row.tier, essence: Number(row.essence), balance: await balanceOf(db, player.id),
    track: trackView(await trackRow(db, player.id, row.char_id, 'enchanting'), 'enchanting', nowS),
    store: await storeOf(db, player.id, row.char_id, ARCANE_ESSENCE.key),
  };
}

export async function reforgeWithEssence(ctx, player, env, { character, tier, rid, choose } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  if (choose !== true) return { error: 'prof-reforge-update' };
  const prior = await db.prepare('SELECT * FROM prof_reforges WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return reforgeAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  const essence = reforgeEssence(tier);
  const argents = upgradeArgents('reforge', tier);
  if (!essence) return { error: 'prof-reforge' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const { rank } = await tracksOf(db, player.id, character, 'enchanting', nowS);
  if (rank < REFORGE_RANK) return { error: 'prof-rank' };
  const nonce = mintId(rand);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO prof_reforges (player, rid, char_id, tier, essence, seed, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8 WHERE ${workableSql('?1', '?2', '?9')} >= ?5
      AND COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?10`)
      .bind(player.id, character, rid, tier, essence, 0, nowS, nonce, ARCANE_ESSENCE.key, argents),
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', ?1, 'burn', NULL, 'gear-essence-reforge', ?4, ?5, ?6, ?1, char_id, rid || ':gear'
      FROM prof_reforges WHERE player = ?1 AND rid = ?2 AND n = ?3`)
      .bind(player.id, rid, nonce, argents, utcDay(nowS), nowS),
    ...workStatements(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: 'EXISTS (SELECT 1 FROM prof_reforges WHERE player = ?1 AND rid = ?5 AND n = ?6)', binds: [ARCANE_ESSENCE.key, essence, rid, nonce] }),
  ]);
  const made = await db.prepare('SELECT * FROM prof_reforges WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return reforgeAnswer(db, player, made, nowS);
  if (made) return reforgeAnswer(db, player, made, nowS, { repeat: true });
  if (await balanceOf(db, player.id) < argents) return { error: 'marks-short' };
  const st = await storeOf(db, player.id, character, ARCANE_ESSENCE.key);
  return { error: workHeld(st) + (st.gold ?? 0) >= essence ? 'stores-gold' : 'stores-short', material: ARCANE_ESSENCE.key };
}
