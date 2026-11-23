// @ts-check
// ═══════════════════════════════════════════════════════════════════
// PROF1 (2026-09-28, Mac: "Begin!") - THE PROFESSIONS, AS THE SERVICE
// KEEPS THEM: a character's tracks and Stores, the day's harvests, the
// witnessed pixels, withdrawals to the pack, and the Court writs
// (bible/06-Systems/Professions-Arc.md, PROF0 3, 6, 7, 11 and 22; the
// numbers are src/net/professionLaw.js and src/net/nodeLaw.js, which
// the client reads too).
//
// ═══ REGISTERED ONLY, AND BEHIND A SWITCH ══════════════════════════
//
// The Stores are a character's and a guest is a device (MARKS1's
// reading): materials held by a credential a cleared browser loses are
// materials gone. PROFESSIONS_OPEN (off, dev, on - PROF0 20) opens it; a
// Court writ pays Marks, so a delivery asks MARKS_OPEN as well.
//
// ═══ THE SERVICE ROLLS, THE CLIENT PLAYS ═══════════════════════════
//
// A node's id is real by the law (nodeLaw.js - a hash of the pixel and
// the UTC day); the act's end is the request's, ten minutes at most past
// (ANY-HOUR: no hour of it is refused); the Stores' room and the dice are
// the service's (CAP-OFF: no day's cap). The act's report moves the roll
// by its bounded step only (PROF0 5.1: a bruise one less, the Basket's
// +50% at most) - the tool, its wear, the foe and the load are the
// client's courtesy.
//
// ═══ ONE STATEMENT DECIDES, AND A REQUEST ASKED TWICE IS ONE ════════
//
// Each act is one `db.batch` (one transaction) whose FIRST statement
// decides it against the rows as they stand - a harvest's row, a
// withdrawal's row, a writ's fill - writing a fresh nonce `n`; the
// statements after it move the Stores, the XP, the Marks and the Renown
// only where that row carries this request's nonce. So a decision is never
// half carried out, two requests racing never both pass a cap, and a
// request sent again because its answer was lost finds its row and is
// answered `repeat`, moving nothing (MARKS1's law, one table over). The
// row is looked for BEFORE the switch (AUDIT 28 M2's rule): a request
// that was made is answered whatever the switch says now.
//
// EVERY CLOCK IS AN ARGUMENT, as in accounts.js.
// ═══════════════════════════════════════════════════════════════════
import { mintId, overRate } from './accounts.js';   // DAEDRIC-SMELT: the embers the account earned - the Broker's purse
import { marksOpenFor, balanceOf } from './marks.js';   // SILVER-FINDS: a harvest's find; GATHER-SPEED: read in its batch
import { dice } from './unitRoll.js';   // SILVER-FINDS: the service's dice, below this file and marks.js (which needs them too)
import { utcDay } from '../../src/net/marksLaw.js';
import {
   isProfession, rankOfXp,    specOk, specsAt, SPEC_RANKS, RESPEC, trackOf,   // CRAFT3: a discipline's track its craft's
  SPEC_TRIAL_S, specTrialUntil, respecLockUntil,   // PERK-TRIAL: a choice's day of trial, and the lock after a paid change
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



// ─── A SPECIALISATION (PROF0 3.3) ────────────────────────────────────

/**
 * A SPECIALISATION CHOSEN: `{ character, profession, rank, spec, from, rid }` - at 50 or 100, one of the two the
 * profession offers there, once the track holds the rank. The first choice at a rank is free. PERK-TRIAL: for
 * SPEC_TRIAL_S after a rank's choice is made, changing it is free and at once (a row, as a first choice is); past it a
 * change costs RESPEC.marks (burnt - a line, `respec`), takes effect at once, starts its own trial, and locks the
 * track's next paid change for RESPEC.days (`respec_at`; `prof-respec-pending` refuses one inside it). Before it, a
 * change took effect RESPEC.days later, the old choice standing until then. A change the client asks as a trial's
 * (`trial: true`) is never a paid one: its day out meanwhile, it is refused `prof-trial-over` and nothing is burnt. `from` is the choice the client saw standing (null for none): AUDIT 29 A15 - a choice the client
 * thought free, made meanwhile (another device, a lost answer), would have been a paid change the player never
 * confirmed; it is refused, `prof-spec-stale`, and nothing is burnt.
 */
export async function chooseSpec(ctx, player, env, { character, profession: asked, rank, spec, from = null, rid, trial: askedTrial = false } = {}) {
  const { db, nowS, rand } = ctx;
  const profession = trackOf(asked);   // CRAFT3: a discipline named is its craft's track (an older client's 'jewelcrafting')
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const answer = async (extra = {}, prof = profession, char = character) => ({ ok: true, ...extra, track: trackView(await trackRow(db, player.id, char, prof), prof, nowS) });
  // a request made is answered as made, before the switch: a free choice's row (AUDIT 29 A13), a paid change's line -
  // each its own track's (A2: an id asked for another track is not this request)
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
  // BUNNYFALL CRAFTING REWORK: a crafting track's rank 100 perk is a Focus craft's
  if (rank === 100 && CRAFT_TRACKS.includes(profession) && !(await focusOf(db, player.id, character)).crafts.includes(profession)) return { error: 'prof-focus' };
  const col = rank === 50 ? 'spec50' : 'spec100';
  if (!row[col]) {
    // THE FREE FIRST CHOICE: its row decides, only while the rank has none; the track takes it by the row's nonce
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
    return { error: 'prof-spec-taken' };   // chosen meanwhile - the client reads the track again
  }
  const current = specsAt(row, nowS)[rank];
  if (from !== current) return { error: 'prof-spec-stale' };
  const bit = freeBit(rank);
  if ((Number(row.free_respec ?? 0) & bit) !== 0) {
    // CRAFT3 (41.6: "a character who chose under both keeps the higher track's and re-chooses free"): THE MERGE'S FREE
    // CHANGE - no Marks, in effect at once, once a rank; a change on its way at that rank is this one's to replace. Its
    // row decides, only while the bit stands; the track takes it by the row's nonce
    if (current === spec) return answer();   // already so - the bit kept for a change of mind
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
    return { error: 'prof-spec-stale' };   // spent meanwhile - the client reads the track again
  }
  if (specTrialUntil(row, rank, nowS) !== null) {
    // PERK-TRIAL: THE CHOICE ON TRIAL - changed free and at once, neither its trial nor the lock moved. Its row decides,
    // only while the trial runs; the track takes it by the row's nonce
    if (current === spec) return answer();   // already so
    // AUDIT PERK-TRIAL P2: a free change is still a write, and a row kept for good - the professions' own hour holds it
    if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
    const nonce = mintId(rand);
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO prof_choices (player, rid, char_id, profession, rank, spec, at, n)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
        WHERE EXISTS (SELECT 1 FROM prof_tracks WHERE player = ?1 AND char_id = ?3 AND profession = ?4 AND ${col}_at > ?9)`)
        .bind(player.id, rid, character, profession, rank, spec, nowS, nonce, nowS - SPEC_TRIAL_S),
      // AUDIT PERK-TRIAL P8: a change still written as waiting at this rank (an older service's, across the deploy) is
      // this one's to replace - specsAt reads a waiting change as landed, and it would stand over the trial's
      db.prepare(`UPDATE prof_tracks SET ${col} = ?4, updated_at = ?5,
          respec_to = CASE WHEN respec_rank = ?9 THEN NULL ELSE respec_to END
        WHERE player = ?1 AND char_id = ?2 AND profession = ?3 AND ${col}_at > ?8
          AND EXISTS (SELECT 1 FROM prof_choices WHERE player = ?1 AND rid = ?6 AND n = ?7)`)
        .bind(player.id, character, profession, spec, nowS, rid, nonce, nowS - SPEC_TRIAL_S, rank),
    ]);
    const made = await db.prepare('SELECT n FROM prof_choices WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
    if (made?.n === nonce) return answer({ trial: true });
    if (made) return answer({ repeat: true });
    return { error: 'prof-trial-over' };   // its trial ran out meanwhile - the client reads the track again
  }
  if (askedTrial === true) return { error: 'prof-trial-over' };   // PERK-TRIAL: asked as a trial's free change, its day out - never charged for it (AUDIT PERK-TRIAL P4: and said so)
  if (respecLockUntil(row, nowS) !== null) return { error: 'prof-respec-pending' };   // PERK-TRIAL: the week after a paid change
  if (current === spec) return answer();   // already so
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const day = utcDay(nowS);
  await db.batch([
    // THE DECISION: the Marks burnt, only while no change is on its way for this track - the line names the track
    // (AUDIT 29 A2: `who`, which a burn's line leaves empty), so the change below is this line's and no other track's.
    // AUDIT 30 S4: a plain INSERT, the id's line refused in the statement - an OR IGNORE swallowed the balance trigger's
    // CHECK as a duplicate would be, and a guard ever short would have burnt nothing and changed the track all the same
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', ?1, 'burn', NULL, 'respec', ?4, ?5, ?6, ?1, ?8, ?7
      WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?4
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?7)
        AND NOT EXISTS (SELECT 1 FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?3 AND respec_at > ?6)`)
      .bind(player.id, character, profession, RESPEC.marks, day, nowS, rid, track),
    // PERK-TRIAL: the change is its rank's at once, its trial from now, and the track's next paid change locked a week
    // (`respec_at`; `respec_to` empty - nothing waits). A change made before it is folded into its rank first, as ever
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
  if (made.kind !== 'respec' || made.who !== track) return { error: 'prof-rid' };   // the same id, another track's
  return answer({ marks: RESPEC.marks, balance: await balanceOf(db, player.id) });
}




// PROF2b: what the Motherlodes' strike (motherlodes.js) shares with a harvest - the first door, the switch, the dice, a
// track and the day's harvests - one home for each, never a second
export { asks as profAsks, shut as profShut, dice as profDice, todayOf as profTodayOf, factsOf };
