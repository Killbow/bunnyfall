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
import { rollSalvage, descriptorOk, salvageCommits, salvageRecipeOf, salvageDescriptor, SALVAGE_BATCH_MAX } from '../../src/net/salvageLaw.js';
import { prepareRealmRecord, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed } from './realm.js';
import { tradeableRecord, realmTradePickOf } from '../../src/net/realm/realmTradeLaw.js';

/**
 * BUNNYFALL AUDIT BF-02: THE RECORD'S OWN PIECES. A realm character's salvage names where each piece stands in its
 * checkpointed record (`picks`); the service reads that piece there, finds it what was claimed (template, material, group and
 * condition) and a plain, unworn, unstacked piece, and takes it out of the record in the salvage's own batch. Nothing is
 * credited for a piece the record does not hold. Answers null, or the refusal.
 * @param {any} save @param {number[]} picks @param {any[]} pieces
 */
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

/** A salvage: the pieces' materials into the Stores, the XP onto their crafts' tracks, all in one batch. */
export async function salvagePieces(ctx, player, env, { character, rid, pieces, commit = [], realm = null, picks = null } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const side = await realmActFirst(db, player.id, character, realm);   // BF-02: where the record stands, first
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
  // BUNNYFALL SPEC-SAFE: a salvage that would carry a craft past Journeyman - one of the two a character may raise - is
  // done only with the player's word for that craft (`commit`). Nothing has been written yet, so a refusal costs nothing.
  const { results: heldRows = [] } = await db.prepare('SELECT profession, xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).all();
  const crossing = salvageCommits(roll.xp, Object.fromEntries(heldRows.map((r) => [r.profession, Number(r.xp)])));
  const agreed = Array.isArray(commit) ? commit : [];
  if (crossing.some((t) => !agreed.includes(t))) return { error: 'prof-salvage-commit', tracks: crossing };
  // the Stores' room: a material past it keeps only what fits
  const yields = [];
  for (const y of roll.yields) {
    const st = await storeOf(db, player.id, character, y.key);
    const held = (st.own ?? 0) + (st.bought ?? 0) + (st.gold ?? 0) + (st.loose ?? 0);
    const n = Math.max(0, Math.min(y.n, STORES_MAX - held));
    if (n > 0) yields.push({ key: y.key, n });
  }
  const prep = side.at ? await prepareRealmRecord(ctx, player.id, side.at, (save) => takePieces(save, /** @type {number[]} */ (picks), pieces), { outbound: true }) : null;   // INT3: the materials go to the Stores, and the market sells them
  if (prep?.error) return prep;
  const nonce = mintId(rand);
  const decided = 'EXISTS (SELECT 1 FROM prof_salvages WHERE player = ?1 AND rid = ?2 AND n = ?3)';
  const batch = [
    ...(prep ? prep.steps : []),
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
  ];
  if (prep) batch.splice(prep.steps.length + 1, 0, mustChange(db));   // BF-02: no salvage, no piece out of the record - its step rolls back with it
  if (!prep) await db.batch(batch);
  else {
    try {
      await db.batch(batch);
      await dropObjects(ctx.bucket, [prep.prev]);
    } catch {
      await dropIfUnnamed(db, ctx.bucket, player.id, side.at.id, prep.key);   // a batch that landed keeps its save
      const moved = await recordMovedOf(db, player.id, side.at);
      if (moved && !(moved.error === 'seq' && moved.seq === prep.seq)) return moved;
    }
  }
  const made = await db.prepare('SELECT * FROM prof_salvages WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (!made) return { error: 'prof-salvage' };
  return salvageAnswer(db, player, made, nowS, made.n === nonce ? (prep ? { realm: { seq: prep.seq } } : {}) : { repeat: true });
}
