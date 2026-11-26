import { mintId, overRate } from './accounts.js';
import { dice } from './unitRoll.js';
import { asks, shut, storeOf, trackRow, trackView, focusXpSql } from './professions.js';
import { halfXp } from '../../src/net/craft/craftLaw.js';
import { STORES_MAX, PROF_XP_MAX, PROF_OPS_MAX, PROF_OPS_WINDOW_S } from '../../src/net/professionLaw.js';
import { rollSalvage, descriptorOk, salvageRecipeOf, salvageDescriptor, SALVAGE_BATCH_MAX } from '../../src/net/salvageLaw.js';
import { prepareRealmRecord, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed } from './realm.js';
import { tradeableRecord, realmTradePickOf } from '../../src/net/realmTradeLaw.js';

/** @param {any} save @param {number[]} picks @param {any[]} pieces */
export function takePieces(save, picks, pieces) {
  const items = Array.isArray(save?.items) ? save.items : null;
  if (!items) return 'prof-piece-gone';
  for (let k = 0; k < picks.length; k++) {
    const rec = items[picks[k]];
    if (!rec || !tradeableRecord(rec) || (rec.stackCount ?? 1) !== 1 || typeof rec.provenance === 'string' || !salvageRecipeOf(rec)) return 'prof-piece-gone';
    const d = salvageDescriptor(rec), c = pieces[k];
    if (d.t !== c.t || d.m !== c.m || d.g !== c.g || d.c !== c.c) return 'prof-piece-gone';
  }
  const gone = new Set(picks);
  const lit = items[save.lightSourceIndex];
  save.items = items.filter((_, i) => !gone.has(i));
  if (Number.isSafeInteger(save.lightSourceIndex)) save.lightSourceIndex = save.items.indexOf(lit);
  return null;
}

async function salvageAnswer(db, player, row, nowS, extra = {}) {
  const yields = JSON.parse(row.yields);
  const xp = JSON.parse(row.xp);
  return {
    ok: true, ...extra, pieces: Number(row.pieces), yields, xp,
    stores: await Promise.all(yields.map((y) => storeOf(db, player.id, row.char_id, y.key))),
    tracks: await Promise.all(Object.keys(xp).map(async (t) => trackView(await trackRow(db, player.id, row.char_id, t), t, nowS))),
  };
}

export async function salvagePieces(ctx, player, env, { character, rid, pieces, realm = null, picks = null } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  const prior = await db.prepare('SELECT * FROM prof_salvages WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return salvageAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!Array.isArray(pieces) || pieces.length < 1 || pieces.length > SALVAGE_BATCH_MAX || !pieces.every(descriptorOk)) return { error: 'bad-piece' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  if (side.at && realmTradePickOf(picks, pieces.length) == null) return { error: 'bad-piece' };
  const roll = rollSalvage(pieces, () => dice(rand));
  if (roll.broken < 1) return { error: 'prof-no-salvage' };
  const yields = [];
  for (const y of roll.yields) {
    const st = await storeOf(db, player.id, character, y.key);
    const held = (st.own ?? 0) + (st.bought ?? 0) + (st.gold ?? 0) + (st.loose ?? 0);
    const n = Math.max(0, Math.min(y.n, STORES_MAX - held));
    if (n > 0) yields.push({ key: y.key, n });
  }
  const prep = side.at ? await prepareRealmRecord(ctx, player.id, side.at, (save) => takePieces(save, /** @type {number[]} */ (picks), pieces), { outbound: true }) : null;
  if (prep?.error) return prep;
  const nonce = mintId(rand);
  const decided = 'EXISTS (SELECT 1 FROM prof_salvages WHERE player = ?1 AND rid = ?2 AND n = ?3)';
  const xpJson = `json_object(${Object.entries(roll.xp).map(([t, x]) => `'${t}', ${focusXpSql('?1', '?3', t, String(x), halfXp(x))}`).join(', ')})`;
  const batch = [
    ...(prep ? prep.steps : []),
    db.prepare(`INSERT OR IGNORE INTO prof_salvages (player, rid, char_id, pieces, yields, xp, at, n) VALUES (?1, ?2, ?3, ?4, ?5, ${xpJson}, ?6, ?7)`)
      .bind(player.id, rid, character, roll.broken, JSON.stringify(yields), nowS, nonce),
    ...yields.map((y) => db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT ?1, ?4, ?5, 'own', ?6 WHERE ${decided}
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = MIN(${STORES_MAX}, prof_stores.qty + excluded.qty)`)
      .bind(player.id, rid, nonce, character, y.key, y.n)),
    ...Object.entries(roll.xp).map(([track, xp]) => {
      const cap = PROF_XP_MAX;
      return db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
        SELECT ?1, ?4, ?5, MIN(${cap}, ${focusXpSql('?1', '?4', track, '?6', halfXp(xp))}), ?7 WHERE ${decided}
        ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
        .bind(player.id, rid, nonce, character, track, xp, nowS);
    }),
  ];
  // When the salvage row is not written, mustChange fails the batch and the record step rolls back with it.
  if (prep) batch.splice(prep.steps.length + 1, 0, mustChange(db));
  if (!prep) await db.batch(batch);
  else {
    try {
      await db.batch(batch);
      await dropObjects(ctx.bucket, [prep.prev]);
    } catch {
      await dropIfUnnamed(db, ctx.bucket, player.id, side.at.id, prep.key);
      const moved = await recordMovedOf(db, player.id, side.at);
      if (moved && !(moved.error === 'seq' && moved.seq === prep.seq)) return moved;
    }
  }
  const made = await db.prepare('SELECT * FROM prof_salvages WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (!made) return { error: 'prof-salvage' };
  return salvageAnswer(db, player, made, nowS, made.n === nonce ? (prep ? { realm: { seq: prep.seq } } : {}) : { repeat: true });
}
