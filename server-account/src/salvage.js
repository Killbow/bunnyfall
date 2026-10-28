// BUNNYFALL CRAFTING REWORK, PHASE 1: SALVAGE ANYTHING (the service's side).
//
//   POST /v1/prof/salvage { character, rid, pieces: [{ t, m, g, c }] }
//     -> { ok, pieces, yields: [{ key, n }], xp: { track: n }, stores: [...], tracks: [...] } | { repeat, ... } | { error }
//
// Found gear broken into its recipe's materials (salvageLaw.js), into the Stores as OWN, with a little XP. The pieces
// are the save's word (the service cannot see the pack); the client drops them only on an answer.
import { mintId, overRate } from './accounts.js';
import { dice } from './unitRoll.js';
import { asks, shut, storeOf, trackRow, trackView, craftCapSql } from './professions.js';
import { STORES_MAX, PROF_OPS_MAX, PROF_OPS_WINDOW_S } from '../../src/net/professionLaw.js';
import { rollSalvage, descriptorOk, SALVAGE_BATCH_MAX } from '../../src/net/salvageLaw.js';

async function salvageAnswer(db, player, row, nowS, extra = {}) {
  const yields = JSON.parse(row.yields);
  const xp = JSON.parse(row.xp);
  return {
    ok: true, ...extra, pieces: Number(row.pieces), yields, xp,
    stores: await Promise.all(yields.map((y) => storeOf(db, player.id, row.char_id, y.key))),
    tracks: await Promise.all(Object.keys(xp).map(async (t) => trackView(await trackRow(db, player.id, row.char_id, t), t, nowS))),
  };
}

/** A salvage: the pieces' materials into the Stores, the XP onto their crafts' tracks, all in one batch. */
export async function salvagePieces(ctx, player, env, { character, rid, pieces } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const prior = await db.prepare('SELECT * FROM prof_salvages WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return salvageAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!Array.isArray(pieces) || pieces.length < 1 || pieces.length > SALVAGE_BATCH_MAX || !pieces.every(descriptorOk)) return { error: 'bad-piece' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const roll = rollSalvage(pieces, () => dice(rand));
  if (roll.broken < 1) return { error: 'prof-no-salvage' };
  // the Stores' room: a material past it keeps only what fits
  const yields = [];
  for (const y of roll.yields) {
    const st = await storeOf(db, player.id, character, y.key);
    const held = (st.own ?? 0) + (st.bought ?? 0) + (st.gold ?? 0) + (st.loose ?? 0);
    const n = Math.max(0, Math.min(y.n, STORES_MAX - held));
    if (n > 0) yields.push({ key: y.key, n });
  }
  const nonce = mintId(rand);
  const decided = 'EXISTS (SELECT 1 FROM prof_salvages WHERE player = ?1 AND rid = ?2 AND n = ?3)';
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO prof_salvages (player, rid, char_id, pieces, yields, xp, at, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
      .bind(player.id, rid, character, roll.broken, JSON.stringify(yields), JSON.stringify(roll.xp), nowS, nonce),
    ...yields.map((y) => db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT ?1, ?4, ?5, 'own', ?6 WHERE ${decided}
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = MIN(${STORES_MAX}, prof_stores.qty + excluded.qty)`)
      .bind(player.id, rid, nonce, character, y.key, y.n)),
    ...Object.entries(roll.xp).map(([track, xp]) => {
      const cap = craftCapSql('?1', '?4', track);
      return db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
        SELECT ?1, ?4, ?5, MIN(${cap}, ?6), ?7 WHERE ${decided}
        ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
        .bind(player.id, rid, nonce, character, track, xp, nowS);
    }),
  ]);
  const made = await db.prepare('SELECT * FROM prof_salvages WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (!made) return { error: 'prof-salvage' };
  return salvageAnswer(db, player, made, nowS, made.n === nonce ? {} : { repeat: true });
}
