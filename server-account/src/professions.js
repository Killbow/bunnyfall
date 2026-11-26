// @ts-check
// Each act is one batch whose first statement decides it and writes a fresh nonce `n`, and later statements
// apply only where the row carries that nonce. A resent request finds its row and is answered `repeat`.
import { mintId, overRate } from './accounts.js';
import { marksOpenFor, balanceOf } from './marks.js';
import { dice } from './unitRoll.js';
import { utcDay } from '../../src/net/marksLaw.js';
import {
   isProfession, rankOfXp,    specOk, specsAt, SPEC_RANKS, RESPEC, trackOf,
  SPEC_TRIAL_S, specTrialUntil, respecLockUntil,
    PROF_OPS_MAX, PROF_OPS_WINDOW_S  
} from '../../src/net/professionLaw.js';
import {
  DAY_S,   asks, shut, trackView, freeBit,  trackRow 
} from './profShared.js';
import {
       todayOf  
} from './profToday.js';
import { CRAFT_TRACKS, focusOf } from './profCraft.js';
import { factsOf } from './profHarvest.js';
export { profState, profPixels, harvestNode } from './profHarvest.js';
export {
  withdrawStores, depositStores, smeltAtForge, provenanceId, focusOf, focusXpSql, inCraftwork, enterCraftwork,
  chooseFocus, seatStepsFor, craftAtAnvil, makeAtBench, temperPiece, buyStock
} from './profCraft.js';
export { listWrits, renownAnswer, deliverWrit } from './profWrits.js';
export { clampStatements, spendableSql, workableSql, sweepHarvests } from './profToday.js';
export { unbruisedClamp, spendStatements, spendOrigins, workStatements, workHeld } from './profSpend.js';
export {
  PIXELS_READ_MAX, DUNGEONS_READ_MAX, profOpenFor, asks, shut, trackView, freeBit, trackRow, storeOf, silverClothIn,
  silverClothOut, carriedOf
} from './profShared.js';



export async function chooseSpec(ctx, player, env, { character, profession: asked, rank, spec, from = null, rid, trial: askedTrial = false } = {}) {
  const { db, nowS, rand } = ctx;
  const profession = trackOf(asked);
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const answer = async (extra = {}, prof = profession, char = character) => ({ ok: true, ...extra, track: trackView(await trackRow(db, player.id, char, prof), prof, nowS) });
  const choice = await db.prepare('SELECT * FROM prof_choices WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (choice) return choice.char_id === character && choice.profession === profession ? answer({ repeat: true }) : { error: 'prof-rid' };
  const track = `${character}|${profession}`;
  const line = await db.prepare('SELECT kind, amount, who FROM marks_ledger WHERE actor = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (line) return line.kind === 'respec' && line.who === track ? answer({ repeat: true, marks: Number(line.amount), balance: await balanceOf(db, player.id) }) : { error: 'prof-rid' };
  const closed = shut(player, env);
  if (closed) return closed;
  if (!isProfession(profession) || !SPEC_RANKS.includes(rank) || !specOk(profession, rank, spec)) return { error: 'prof-spec' };
  if (from !== null && typeof from !== 'string') return { error: 'prof-spec' };
  const row = await trackRow(db, player.id, character, profession);
  if (rankOfXp(Number(row?.xp ?? 0)) < rank) return { error: 'prof-rank' };
  if (rank === 100 && CRAFT_TRACKS.includes(profession) && !(await focusOf(db, player.id, character)).crafts.includes(profession)) return { error: 'prof-focus' };
  const col = rank === 50 ? 'spec50' : 'spec100';
  if (!row[col]) {
    const nonce = mintId(rand);
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO prof_choices (player, rid, char_id, profession, rank, spec, at, n)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
        WHERE EXISTS (SELECT 1 FROM prof_tracks WHERE player = ?1 AND char_id = ?3 AND profession = ?4 AND ${col} IS NULL)`)
        .bind(player.id, rid, character, profession, rank, spec, nowS, nonce),
      db.prepare(`UPDATE prof_tracks SET ${col} = ?4, ${col}_at = ?5, updated_at = ?5 WHERE player = ?1 AND char_id = ?2 AND profession = ?3 AND ${col} IS NULL
        AND EXISTS (SELECT 1 FROM prof_choices WHERE player = ?1 AND rid = ?6 AND n = ?7)`)
        .bind(player.id, character, profession, spec, nowS, rid, nonce),
    ]);
    const made = await db.prepare('SELECT n FROM prof_choices WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
    if (made?.n === nonce) return answer();
    if (made) return answer({ repeat: true });
    return { error: 'prof-spec-taken' };
  }
  const current = specsAt(row, nowS)[rank];
  if (from !== current) return { error: 'prof-spec-stale' };
  const bit = freeBit(rank);
  if ((Number(row.free_respec ?? 0) & bit) !== 0) {
    if (current === spec) return answer();
    const nonce = mintId(rand);
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO prof_choices (player, rid, char_id, profession, rank, spec, at, n)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
        WHERE EXISTS (SELECT 1 FROM prof_tracks WHERE player = ?1 AND char_id = ?3 AND profession = ?4 AND (free_respec & ?9) != 0)`)
        .bind(player.id, rid, character, profession, rank, spec, nowS, nonce, bit),
      db.prepare(`UPDATE prof_tracks SET ${col} = ?4, free_respec = free_respec & ~?8,
          respec_rank = CASE WHEN respec_rank = ?9 AND respec_to IS NOT NULL THEN NULL ELSE respec_rank END,
          respec_to = CASE WHEN respec_rank = ?9 THEN NULL ELSE respec_to END,
          respec_at = CASE WHEN respec_rank = ?9 AND respec_to IS NOT NULL THEN NULL ELSE respec_at END, updated_at = ?5
        WHERE player = ?1 AND char_id = ?2 AND profession = ?3 AND (free_respec & ?8) != 0
          AND EXISTS (SELECT 1 FROM prof_choices WHERE player = ?1 AND rid = ?6 AND n = ?7)`)
        .bind(player.id, character, profession, spec, nowS, rid, nonce, bit, rank),
    ]);
    const made = await db.prepare('SELECT n FROM prof_choices WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
    if (made?.n === nonce) return answer({ free: true });
    if (made) return answer({ repeat: true });
    return { error: 'prof-spec-stale' };
  }
  if (specTrialUntil(row, rank, nowS) !== null) {
    if (current === spec) return answer();
    if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
    const nonce = mintId(rand);
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO prof_choices (player, rid, char_id, profession, rank, spec, at, n)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
        WHERE EXISTS (SELECT 1 FROM prof_tracks WHERE player = ?1 AND char_id = ?3 AND profession = ?4 AND ${col}_at > ?9)`)
        .bind(player.id, rid, character, profession, rank, spec, nowS, nonce, nowS - SPEC_TRIAL_S),
      // A waiting change from an older service at this rank is replaced, because specsAt reads a waiting change
      // as landed.
      db.prepare(`UPDATE prof_tracks SET ${col} = ?4, updated_at = ?5,
          respec_to = CASE WHEN respec_rank = ?9 THEN NULL ELSE respec_to END
        WHERE player = ?1 AND char_id = ?2 AND profession = ?3 AND ${col}_at > ?8
          AND EXISTS (SELECT 1 FROM prof_choices WHERE player = ?1 AND rid = ?6 AND n = ?7)`)
        .bind(player.id, character, profession, spec, nowS, rid, nonce, nowS - SPEC_TRIAL_S, rank),
    ]);
    const made = await db.prepare('SELECT n FROM prof_choices WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
    if (made?.n === nonce) return answer({ trial: true });
    if (made) return answer({ repeat: true });
    return { error: 'prof-trial-over' };
  }
  if (askedTrial === true) return { error: 'prof-trial-over' };
  if (respecLockUntil(row, nowS) !== null) return { error: 'prof-respec-pending' };
  if (current === spec) return answer();
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const day = utcDay(nowS);
  await db.batch([
    // A plain INSERT, not OR IGNORE, so a failed balance CHECK is not swallowed like a duplicate.
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', ?1, 'burn', NULL, 'respec', ?4, ?5, ?6, ?1, ?8, ?7
      WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?4
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?7)
        AND NOT EXISTS (SELECT 1 FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?3 AND respec_at > ?6)`)
      .bind(player.id, character, profession, RESPEC.marks, day, nowS, rid, track),
    db.prepare(`UPDATE prof_tracks SET
        spec50 = CASE WHEN ?5 = 50 THEN ?6 WHEN respec_rank = 50 AND respec_to IS NOT NULL THEN respec_to ELSE spec50 END,
        spec100 = CASE WHEN ?5 = 100 THEN ?6 WHEN respec_rank = 100 AND respec_to IS NOT NULL THEN respec_to ELSE spec100 END,
        ${col}_at = ?4, respec_rank = ?5, respec_to = NULL, respec_at = ?7, updated_at = ?4
      WHERE player = ?1 AND char_id = ?2 AND profession = ?3
        AND NOT (respec_at IS NOT NULL AND respec_at > ?4)
        AND EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?8 AND kind = 'respec' AND who = ?9)`)
      .bind(player.id, character, profession, nowS, rank, spec, nowS + RESPEC.days * DAY_S, rid, track),
  ]);
  const made = await db.prepare('SELECT kind, amount, who FROM marks_ledger WHERE actor = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (!made) return { error: (await balanceOf(db, player.id)) < RESPEC.marks ? 'marks-short' : 'prof-respec-pending' };
  if (made.kind !== 'respec' || made.who !== track) return { error: 'prof-rid' };
  return answer({ marks: RESPEC.marks, balance: await balanceOf(db, player.id) });
}




export { asks as profAsks, shut as profShut, dice as profDice, todayOf as profTodayOf, factsOf };
