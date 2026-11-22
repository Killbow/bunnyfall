// @ts-check
// The writs board: posting a region's writs and a member's, listing them with their chapter
// lines, and delivering a writ with its renown.
import { mintId, overRate } from './accounts.js';
import { renownHeldSql } from './renownTracks.js';
import { marksOpenFor, balanceOf } from './marks.js';
import { MARKS_MAX, utcDay } from '../../src/net/marksLaw.js';
import { renownForXp, RENOWN_XP_MAX, RENOWN_TRACKS_MAX } from '../../src/net/renown.js';
import { writXp, PROF_OPS_MAX, PROF_OPS_WINDOW_S, PROF_XP_MAX, professionOfFamily, courtWritCount, COURT_WRITS_PER_DAY } from '../../src/net/professionLaw.js';
import { daySeason, regionOk, witnessedFact, factConfirmed, groundWitnessed, climateOk, material, regionWritTable, courtWrits } from '../../src/net/nodeLaw.js';
import { seasonZeroOf } from '../../src/net/townSeatLaw.js';
import { hallWrits, hallWritCountIn, hallWritId, hallHidden, HALL_WRIT_REP, memberWrit, memberWritId, MERIT_WRIT, chapterBandOf, chaptersSwitchOf, meritWeekOf, chapterFocusesOf, crackdownMerit, doctrineWritCount } from '../../src/net/npcChapterLaw.js';
import { MAX_REPUTATION, GUILD_FACTION_IDS } from '../../src/guilds/guildFactions.js';
import { regionChapters } from './npcHalls.js';
import { chaptersOpenFor } from './npcRoll.js';
import { receiptAsks, membersOf } from './npcReceipts.js';
import { meritStatement, meritOfAct, meritAsks } from './npcMerit.js';
import { settleChaptersDue, regionStrengths, regionFocuses, masterSeatsIn, regionEvents, seasonNumberAt, regionBackings, regionPatrons, guildPatronBids } from './npcChapters.js';
import { DAY_S, asks, shut, trackView, trackRow, storeOf } from './profShared.js';
import { spendStatements } from './profSpend.js';
import { spendableSql, writsToday } from './profToday.js';

// ─── COURT WRITS (PROF0 11) ──────────────────────────────────────────

/** A writ as the Work tab reads it: `state` open, mine (filled by this account) or taken. */
export const writView = (w, me) => ({
  id: w.id, kind: w.kind, region: Number(w.region), faction: Number(w.faction ?? 0), material: w.material, tier: Number(w.tier), qty: Number(w.qty),
  pay: Number(w.pay), renown: Number(w.renown), expiresAt: Number(w.expires_at),
  state: !w.filled_by ? 'open' : w.filled_by === me ? 'mine' : 'taken',
});

/** A region's witnessed pixels: each pixel whose witnesses name this region, with whether it is confirmed. */
export async function regionGround(db, region) {
  // AUDIT 29 A11: the pixels any report names for the region, each read over ALL its reports - a pixel one early report
  // named for this region and three confirmed for another is the other's
  const { results = [] } = await db.prepare(`SELECT key, account, report, at FROM world_witness WHERE kind = 'pixel'
    AND key IN (SELECT key FROM world_witness WHERE kind = 'pixel' AND region = ?)`).bind(region).all();
  const rowsBy = new Map();
  for (const r of results) { const a = rowsBy.get(r.key) ?? []; a.push({ account: r.account, report: r.report, at: Number(r.at) }); rowsBy.set(r.key, a); }
  const out = [];
  for (const rows of rowsBy.values()) {
    const f = witnessedFact(rows);
    if (f.region === region && f.climate !== null) out.push({ climate: f.climate, confirmed: factConfirmed(f) });
  }
  return out;
}
/** The registered accounts that played online in the seven days before `dayStartS` (ACC4's beat) - `active`. */
export async function activeBefore(db, dayStartS) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE handle IS NOT NULL AND played_at >= ?1 AND played_at < ?2')
    .bind(dayStartS - 7 * DAY_S, dayStartS).first();
  return Number(r?.n ?? 0);
}
/**
 * A REGION'S WRITS FOR THE DAY, written down on the day's first read: how many (`active` then) and each writ (nodeLaw
 * courtWrits over the region's witnessed ground in the day's season). A region whose ground nobody has witnessed posts
 * nothing yet, and nothing is written down - a later read posts once there is ground. CHAP3b: a chapter's hall writs by
 * its band (npcChapterLaw.js hallWritCountIn), the week's Turning settled first (`zero` the week Season 0 began, or null).
 * AUDIT CHAP3 S2: the hall writs and their Turning only while the Chapters are not 'off' (`open`, CHAPTERS_OPEN).
 */
export async function postWrits(db, day, region, nowS, zero = null, open = 'off', hint = null) {
  const courtDone = !!(await db.prepare('SELECT 1 FROM writ_days WHERE day = ?1 AND region = ?2').bind(day, region).first());
  // CHAP2a: and the region's chapters' hall writs, written down once a day beside the Court's (hall_writ_days) - none
  // while the region has no witnessed chapter, so a chapter confirmed later in the day posts that day
  const hallDone = chaptersSwitchOf(open) === 'off' || !!(await db.prepare('SELECT 1 FROM hall_writ_days WHERE day = ?1 AND region = ?2').bind(day, region).first());
  if (courtDone && hallDone) return;
  // AUDIT CHAP4 S2: the Chapters shut, the weeks that pass recorded shut - on a region's first read of the day, as the
  // Court's writs are posted (npcChapters.js settleChaptersDue)
  if (chaptersSwitchOf(open) === 'off') await settleChaptersDue(db, nowS, zero, open);
  // AUDIT CHAP2 S1: the chapters (the isolate's kept answer) asked BEFORE the ground - a region with no chapter writes
  // no hall_writ_days, and its every board read re-read the region's witnessed ground and the week's active accounts
  const chapters = hallDone ? [] : await regionChapters(db, region, nowS * 1000);
  if (courtDone && !chapters.length) return;
  const ground = await regionGround(db, region);
  // BUNNYFALL WRIT-GEN: with witnessed ground off, a board read in a town of this region is itself the ground - its
  // climate, as the reader's own map gives it - so the Court posts on a region nobody has worked yet. The first reader of
  // the day sets the day's table; a region with worked ground is left to that ground alone.
  if (!groundWitnessed() && !ground.length && climateOk(hint)) ground.push({ climate: hint, confirmed: true });
  const table = regionWritTable(region, ground, daySeason(day));
  if (!table.length) return;
  const active = await activeBefore(db, day * DAY_S);
  const expires = (day + 1) * DAY_S;
  if (!courtDone) {
    const writs = courtWrits(day, region, courtWritCount(active), table);
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO writ_days (day, region, active, posted, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(day, region, active, writs.length, nowS),
      ...writs.map((w) => db.prepare(`INSERT OR IGNORE INTO writs (id, kind, day, region, slot, material, tier, qty, pay, renown, expires_at)
        VALUES (?1, 'court', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
        .bind(`c:${day}:${region}:${w.slot}`, day, region, w.slot, w.material, w.tier, w.units, w.pay, w.renown, expires)),
    ]);
  }
  if (chapters.length) {
    await settleChaptersDue(db, nowS, zero, open);
    const strengths = await regionStrengths(db, region, chapters);
    const focuses = await regionFocuses(db, region, meritWeekOf(nowS));   // CHAP4d: every other writ the Master's family
    // CHAP6a: a chapter whose halls a Crackdown shut posts none this Season. AUDIT CHAP5 E1: its writs pay as any - a
    // Crackdown's half again is its members' Merit (deliverWrit), never Marks any account's bought units fetch
    const events = await regionEvents(db, region, seasonNumberAt(nowS, zero));
    const halls = chapters.filter((f) => !events.get(f)?.shut).flatMap((f) => hallWrits(day, region, f, doctrineWritCount(hallWritCountIn(active, strengths.get(f)), events.get(f)?.doctrine), table, focuses.get(f) ?? null)
      .map((w) => ({ ...w, faction: f })));
    // AUDIT CHAP3 S4: the region's hall writs in ONE statement over a bound JSON array (SCALE1's law - a region of many
    // chapters at a busy realm's scale was a statement a writ, over a thousand), in their own batch: the Court's stand
    // whatever becomes of them
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO hall_writ_days (day, region, posted, at) VALUES (?1, ?2, ?3, ?4)').bind(day, region, halls.length, nowS),
      db.prepare(`INSERT OR IGNORE INTO writs (id, kind, day, region, faction, slot, material, tier, qty, pay, renown, expires_at)
        SELECT json_extract(value, '$[0]'), 'hall', ?1, ?2, json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
          json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]'), ?3
        FROM json_each(?4)`)
        .bind(day, region, expires, JSON.stringify(halls.map((w) => [hallWritId(day, region, w.faction, w.slot), w.faction, w.slot, w.material, w.tier, w.units, w.pay, w.renown]))),
    ]);
  }
}

/** CHAP3a: A MEMBER'S OWN WRITS for the day - one for each guild of `members` (the character's on its Roll) keeping a
 *  chapter in the region, drawn over the character (npcChapterLaw.js memberWrit), written down on its first read of
 *  the board there. None while the region's ground is unwitnessed (a later read posts it). */
export async function postMemberWrits(db, day, region, nowS, character, members, zero = null) {
  if (!members.length) return;
  const chapters = new Set(await regionChapters(db, region, nowS * 1000));
  const events = await regionEvents(db, region, seasonNumberAt(nowS, zero));   // CHAP6a: none from a shut hall
  const want = members.filter((f) => chapters.has(f) && !events.get(f)?.shut);
  if (!want.length) return;
  // AUDIT CHAP3 E3: ONE A MEMBER A GUILD A UTC DAY, wherever posted - the first board of the day with a chapter of the
  // guild (a member reading every region's board had one a region: the shared writs' race AUDIT CHAP2 E4 closed, opened
  // again a region at a time); asked again inside each write
  const { results: had = [] } = await db.prepare("SELECT faction FROM writs WHERE day = ?1 AND kind = 'member' AND owner = ?2")
    .bind(day, character).all();
  const posted = new Set(had.map((r) => Number(r.faction)));
  const missing = want.filter((f) => !posted.has(f));
  if (!missing.length) return;
  const table = regionWritTable(region, await regionGround(db, region), daySeason(day));
  const writs = missing.map((f) => ({ f, w: memberWrit(day, region, f, character, table) })).filter((x) => x.w);
  if (!writs.length) return;
  await db.batch(writs.map(({ f, w }) => db.prepare(`INSERT OR IGNORE INTO writs (id, kind, day, region, faction, owner, slot, material, tier, qty, pay, renown, expires_at)
    SELECT ?1, 'member', ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9, ?10, ?11
    WHERE NOT EXISTS (SELECT 1 FROM writs WHERE day = ?2 AND kind = 'member' AND owner = ?5 AND faction = ?4)`)
    .bind(memberWritId(day, region, f, character), day, region, f, character, w.material, w.tier, w.units, w.pay, w.renown, (day + 1) * DAY_S)));
}

/** CHAP3b: THE BOARD'S CHAPTER LINES - each chapter of the region, `{ faction, strength, band }`, a hidden guild's to its
 *  members alone (`members`, the reader's guilds on its Roll) as its writs are. CHAP6a: and its Season's event (`event`,
 *  a Rivalry's `rival` - a hidden rival named to its members alone - and `shut`); CHAP6b: a Schism's `sides`, a
 *  Succession's `heir`, the `doctrine` holding, and the side the reader's account backs (`backed`). CHAP7a: and its
 *  `patron` this Season, and - where the reader's character is its player guild's guildmaster - its guild's standing bid
 *  for the Season after (`patronBid`, `{ season, marks }`, 0 for none); never a hidden guild's. */
export async function chapterLines(db, region, nowS, members, character = null, zero = null, account = null) {
  const chapters = (await regionChapters(db, region, nowS * 1000)).filter((f) => !hallHidden(f) || members.includes(f));
  const strengths = await regionStrengths(db, region, chapters);
  // CHAP4d: and each chapter's Focus this week, and the Focuses its Master may choose where the reader is its Master
  const focuses = await regionFocuses(db, region, meritWeekOf(nowS));
  const masters = await masterSeatsIn(db, character, region, meritWeekOf(nowS));   // AUDIT CHAP4 S4: last week's Turning's seats
  const events = await regionEvents(db, region, seasonNumberAt(nowS, zero), (f) => !hallHidden(f) || members.includes(f));
  const backed = account ? await regionBackings(db, region, seasonNumberAt(nowS, zero), account) : new Map();   // CHAP6b: the reader's own
  // CHAP7a: each chapter's patron this Season, and the reader's guild's bids for the next where it is the guildmaster
  const n = seasonNumberAt(nowS, zero);
  const patrons = await regionPatrons(db, region, n);
  const gm = n != null && account && character ? await db.prepare('SELECT guild_id FROM guild_members WHERE player = ?1 AND char_id = ?2 AND rank = 0').bind(account, character).first() : null;
  const bids = gm ? await guildPatronBids(db, region, /** @type {number} */ (n) + 1, String(gm.guild_id)) : null;
  return chapters.map((f) => ({
    faction: f, strength: strengths.get(f), band: chapterBandOf(strengths.get(f)).band, focus: focuses.get(f) ?? null,
    ...(masters.has(f) ? { master: true, focuses: chapterFocusesOf(f) } : {}), ...events.get(f), ...(backed.has(f) ? { backed: backed.get(f) } : {}),
    ...(patrons.has(`${f}|${region}`) && !hallHidden(f) ? { patron: patrons.get(`${f}|${region}`) } : {}),
    ...(bids && !hallHidden(f) ? { patronBid: { season: /** @type {number} */ (n) + 1, marks: bids.get(f) ?? 0 } } : {}),
  }));
}

/** CHAP2a: the hidden guilds (npcChapterLaw.js hallHidden) this character is a member of on its Roll - their chapters'
 *  writs are its alone. None for a character with no Roll. */
export async function hiddenMemberships(db, player, character) {
  const { results = [] } = await db.prepare(`SELECT faction_id FROM npc_roll WHERE char_id = ?1 AND player = ?2 AND member = 1
    AND faction_id IN (${GUILD_FACTION_IDS.ThievesGuild}, ${GUILD_FACTION_IDS.DarkBrotherhood})`).bind(character, player).all();
  return new Set(results.map((r) => Number(r.faction_id)));
}

/** THE WORK TAB'S WRITS for a region's board: today's Court writs and its chapters' hall writs (CHAP2a), each open, mine
 *  or taken, and the account's day - the one allowance both share. CHAP3a: and the reader's own writ for each of its
 *  guilds' chapters here (kind `member`, shown to its owner alone), and its account's Merit in them this week. CHAP3b:
 *  and the region's chapters' Strength and band, the underworld's to its members alone, after the Turnings due. */
export async function listWrits({ db, nowS }, player, env, { character, region, climate = null } = {}) {
  const refused = asks(player, { character, needRid: false }) ?? shut(player, env);
  if (refused) return refused;
  if (!regionOk(region)) return { error: 'bad-region' };
  const day = utcDay(nowS);
  const halls = chaptersOpenFor(player, env);   // CHAP2a: a chapter's writs only where the Roll is open to the account
  const zero = seasonZeroOf(env?.SEASON_ZERO_WEEK);
  if (halls) await settleChaptersDue(db, nowS, zero, env?.CHAPTERS_OPEN);   // CHAP3b: the chapters' Strength as this week's Turning left it
  await postWrits(db, day, region, nowS, zero, env?.CHAPTERS_OPEN, climate);   // AUDIT CHAP3 S2: hall writs only while the Chapters are not 'off'; WRIT-GEN: the reader's town's climate
  const members = halls ? await membersOf(db, player.id, character) : [];   // CHAP3a: the reader's guilds on its Roll
  await postMemberWrits(db, day, region, nowS, character, members, zero);
  // CHAP3a: a member's own writ to its owner alone - never another's, never another character's of the account - and only
  // while it is the guild's member (or once it filled it)
  // WRIT-BOARD (migration 0138): the two owners each sought to its region on idx_writs_owner - `+kind` keeps the table's UNIQUE index
  // from being chosen for its order, which walked every member's own writs of the region's day to keep the caller's
  const { results = [] } = await db.prepare("SELECT * FROM writs WHERE day = ?1 AND region = ?2 AND owner IN ('', ?3) ORDER BY +kind, faction, slot")
    .bind(day, region, character).all();
  // and a hidden guild's to its members alone (and the one who filled it)
  const hidden = halls && results.some((w) => w.kind === 'hall' && hallHidden(Number(w.faction))) ? await hiddenMemberships(db, player.id, character) : null;
  const shown = (w) => w.kind === 'court' || (halls && (w.filled_by === player.id || (w.kind === 'member' ? members.includes(Number(w.faction))
    : !hallHidden(Number(w.faction)) || hidden?.has(Number(w.faction)))));
  return {
    region, day, endsAt: (day + 1) * DAY_S,
    writs: results.filter(shown).map((w) => writView(w, player.id)),
    receipts: await receiptAsks(db, player, env, character, region, nowS),   // CHAP2b: the region's chapters' receipt asks
    merit: await meritAsks(db, player.id, character, region, nowS, members),   // CHAP3a: the account's Merit in the chapters here
    chapters: halls ? await chapterLines(db, region, nowS, members, character, zero, player.id) : [],   // CHAP3b: the chapters here, their Strength
    today: { filled: await writsToday(db, player.id, day), max: COURT_WRITS_PER_DAY },
  };
}

/** The Renown a delivery credited, in the shape `/v1/renown/xp` answers (so the client's one plan reads it) - the
 *  delivering character's track (RENOWN-CHAR), and `max` once it holds the cap's total, as a report says. */
export function renownAnswer(character, before, after) {   // CRAFT-WRITS: a crafting writ's answer too (craftWrits.js)
  return {
    character, xp: after, level: renownForXp(after), credited: Math.max(0, after - before), rose: renownForXp(after) > renownForXp(before),
    ...(after >= RENOWN_XP_MAX ? { max: true } : {}),
  };
}

/**
 * A COURT WRIT TAKEN - or a hall writ (CHAP2a; its guild +2 on the Roll, below), or a member's own (CHAP3a: by its owner
 * alone, paid as a hall writ, and its Merit - `merit` in the answer) - (PROF0 11: filled whole, once, by the first
 * to deliver - so taking it is delivering it):
 * `{ character, id, rid }`. Decided by the writ's one UPDATE: still open and today's, the account under its three a day,
 * the Stores holding the units, the balance with room for the pay. Then the units out (bought first), the pay struck
 * (`writ`, the second faucet - its line id the writ's own, under the service's `:`), the XP to the profession that
 * gathers the material (twice the pay), the Renown to the character.
 */
export async function deliverWrit(ctx, player, env, { character, id, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const day = utcDay(nowS);
  const answer = async (w, extra = {}) => {
    const m = material(w.material);
    const prof = professionOfFamily(m?.family);
    return {
      ok: true, ...extra, writ: writView(w, player.id), pay: Number(w.pay), balance: await balanceOf(db, player.id),
      track: prof ? trackView(await trackRow(db, player.id, w.filled_char, prof), prof, nowS) : null,
      store: await storeOf(db, player.id, w.filled_char, w.material),
      today: { filled: await writsToday(db, player.id, day), max: COURT_WRITS_PER_DAY },
      ...(w.kind === 'member' ? { merit: (await meritOfAct(db, w.filled_char, 'writ', w.id))[0]?.amount ?? 0 } : {}),   // CHAP3a
    };
  };
  const prior = await db.prepare('SELECT * FROM writs WHERE filled_by = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  const w = typeof id === 'string' ? await db.prepare('SELECT * FROM writs WHERE id = ?').bind(id).first() : null;
  if (!w) return { error: 'no-writ' };
  // AUDIT 29 A16: a writ one filled oneself (its answer lost, the page reloaded, a new id) is answered as one's own
  if (w.filled_by === player.id) return answer(w, { repeat: true });
  // CHAP2a: a hidden guild's writ is no writ to a character not its member on the Roll - as its listing never showed it.
  // AUDIT CHAP2 S2: asked before the writ's day and fill, whose answers ('writ-expired', 'writ-taken') told a stranger
  // walking the ids which regions keep the underworld's halls
  // CHAP3a: a member's own writ is no writ to any character but its owner, nor to it once no member of the guild - as
  // the board shows it to none
  if (w.kind === 'member' && (w.owner !== character || !(await membersOf(db, player.id, character)).includes(Number(w.faction)))) return { error: 'no-writ' };
  if (w.kind !== 'court' && hallHidden(Number(w.faction)) && !(await hiddenMemberships(db, player.id, character)).has(Number(w.faction))) return { error: 'no-writ' };
  if (w.kind !== 'court' && !chaptersOpenFor(player, env)) return { error: 'chapters-closed' };   // CHAP2a
  if (Number(w.day) !== day || Number(w.expires_at) <= nowS) return { error: 'writ-expired' };
  if (w.filled_by) return { error: 'writ-taken' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const m = material(w.material);
  const prof = professionOfFamily(m?.family);
  const before = Number((await db.prepare('SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).first())?.xp ?? 0);
  // AUDIT CHAP5 E1: a member's own writ for a chapter under a Crackdown this Season earns half again its Merit
  const merit = w.kind === 'member' && (await regionEvents(db, Number(w.region), seasonNumberAt(nowS, seasonZeroOf(env?.SEASON_ZERO_WEEK)), () => true))
    .get(Number(w.faction))?.event === 'crackdown' ? crackdownMerit(MERIT_WRIT) : MERIT_WRIT;
  const nonce = mintId(rand);
  const filled = 'EXISTS (SELECT 1 FROM writs WHERE id = ?5 AND n = ?6)';
  await db.batch([
    // THE DECISION - AUDIT 29 A12: never a second writ under one id (the unique index threw on a same-id race)
    db.prepare(`UPDATE writs SET filled_by = ?1, filled_char = ?2, filled_at = ?3, rid = ?4, n = ?6
      WHERE id = ?5 AND filled_by IS NULL AND expires_at > ?3
        AND NOT EXISTS (SELECT 1 FROM writs WHERE filled_by = ?1 AND rid = ?4)
        AND (SELECT COUNT(*) FROM writs WHERE filled_by = ?1 AND day = ?7) < ?8
        AND ${spendableSql('?1', '?2', 'writs.material')} >= writs.qty   -- GOLD-MARKET: never gold's units
        AND COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) + writs.pay <= ?9`)
      .bind(player.id, character, nowS, rid, id, nonce, day, COURT_WRITS_PER_DAY, MARKS_MAX),
    // CHAP3a: A MEMBER'S OWN WRIT'S MERIT - MERIT_WRIT for the share of its units the member's own: what the bought units
    // (spent first, below) leave of it, so read before the spend (npcMerit.js asks the tenure, the week's chapter, the cap)
    ...(w.kind === 'member' ? [meritStatement(db, {
      player: player.id, character, faction: Number(w.faction), region: Number(w.region), source: 'writ', ref: id, nowS,
      amountSql: `(SELECT (qty - MIN(qty, COALESCE((SELECT b.qty FROM prof_stores b WHERE b.player = ?1 AND b.char_id = ?2
        AND b.material = writs.material AND b.origin = 'bought'), 0))) * ?13 / qty FROM writs WHERE id = ?11 AND n = ?12)`,
      guard: 'EXISTS (SELECT 1 FROM writs WHERE id = ?11 AND n = ?12)', binds: [id, nonce, merit],
    })] : []),
    // the units out of the Stores, bought first
    ...spendStatements(db, {
      player: player.id, character, materialSql: '(SELECT material FROM writs WHERE id = ?3 AND n = ?4)',
      qtySql: '(SELECT qty FROM writs WHERE id = ?3 AND n = ?4)', guard: 'EXISTS (SELECT 1 FROM writs WHERE id = ?3 AND n = ?4)', binds: [id, nonce],
    }),
    // the pay, struck - the ledger's trigger credits the balance
    db.prepare(`INSERT OR IGNORE INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'mint', NULL, 'account', ?1, 'writ', pay, ?7, ?3, ?1, NULL, 'writ:' || id FROM writs WHERE id = ?5 AND n = ?6`)
      .bind(player.id, character, nowS, rid, id, nonce, day),
    // the XP to the profession that gathers it
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, ?7, MIN(?8, ?9), ?3 WHERE ${filled}
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MIN(?8, prof_tracks.xp + excluded.xp), updated_at = excluded.updated_at`)
      .bind(player.id, character, nowS, rid, id, nonce, prof ?? 'herbalism', PROF_XP_MAX, writXp(Number(w.pay))),
    // the Renown to the character (its track made where it has none, under RENOWN_TRACKS_MAX) - RENOWN-CHAR: its own
    // again, where MERGE 2 had paid RENOWN-ACCOUNT's one track; outside the hour's bound, as the writ is the service's own
    // to prove: its units spent from the Stores above
    db.prepare(`UPDATE renown_tracks SET xp = MIN(?7, xp + (SELECT renown FROM writs WHERE id = ?5 AND n = ?6)), updated_at = ?3
      WHERE player = ?1 AND char_id = ?2 AND ${filled}`).bind(player.id, character, nowS, rid, id, nonce, RENOWN_XP_MAX),
    db.prepare(`INSERT INTO renown_tracks (player, char_id, name, xp, last_rid, created_at, updated_at)
      SELECT ?1, ?2, NULL, MIN(?7, renown), NULL, ?3, ?3 FROM writs WHERE id = ?5 AND n = ?6 AND renown > 0
        AND NOT EXISTS (SELECT 1 FROM renown_tracks WHERE player = ?1 AND char_id = ?2)
        AND ${renownHeldSql('?1')} < ?8`).bind(player.id, character, nowS, rid, id, nonce, RENOWN_XP_MAX, RENOWN_TRACKS_MAX),
    // CHAP2a: A HALL WRIT'S GUILD REMEMBERS - HALL_WRIT_REP to the posting guild on the deliverer's Roll, where it has one: a
    // witnessed act (the units the Stores gave), so outside the claims' pace and never owed past DFU's 100. The Roll's
    // head moves under this delivery's own tag (the nonce), so a claim that read the Roll before it is refused its write
    // (npcRoll.js: `roll-busy`, asked again) and never writes over the credit
    ...(w.kind !== 'court' ? [   // CHAP3a: a member's own writ as a hall writ
      // AUDIT CHAP2 S5: and only while the character stands (a delivery carries no lease - the board's, not the playing
      // tab's - so a hall writ's credit is the one Roll write a lease does not guard); the claim sequence untouched (C1)
      db.prepare(`UPDATE npc_roll_heads SET seq = seq + 1, tag = ?3, updated_at = ?4 WHERE char_id = ?2 AND player = ?1 AND EXISTS (SELECT 1 FROM writs WHERE id = ?5 AND n = ?3)
        AND EXISTS (SELECT 1 FROM realm_characters WHERE id = ?2 AND player = ?1 AND dead_at IS NULL)`)
        .bind(player.id, character, nonce, nowS, id),
      db.prepare(`UPDATE npc_roll SET rep = MIN(?4, rep + ?3), owed = MAX(0, MIN(owed, ?4 - MIN(?4, rep + ?3)))
        WHERE char_id = ?2 AND player = ?1 AND faction_id = (SELECT faction FROM writs WHERE id = ?5 AND n = ?6)
          AND EXISTS (SELECT 1 FROM npc_roll_heads WHERE char_id = ?2 AND tag = ?6)`)
        .bind(player.id, character, HALL_WRIT_REP, MAX_REPUTATION, id, nonce),
    ] : []),
  ]);
  const now = await db.prepare('SELECT * FROM writs WHERE id = ?').bind(id).first();
  if (now?.n === nonce) {
    const after = Number((await db.prepare('SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).first())?.xp ?? before);
    return answer(now, { renown: renownAnswer(character, before, after) });
  }
  if (now?.filled_by === player.id) return answer(now, { repeat: true });
  const byRid = await db.prepare('SELECT * FROM writs WHERE filled_by = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (byRid) return answer(byRid, { repeat: true });   // the same id raced over another writ - that one is this request
  if (now?.filled_by) return { error: 'writ-taken' };
  if (Number(now?.expires_at ?? 0) <= nowS) return { error: 'writ-expired' };
  if ((await writsToday(db, player.id, day)) >= COURT_WRITS_PER_DAY) return { error: 'writ-cap' };
  const s = await storeOf(db, player.id, character, w.material);
  if (s.own + s.bought < Number(w.qty)) return { error: s.own + s.bought + (s.gold ?? 0) >= Number(w.qty) ? 'stores-gold' : 'stores-short' };   // GOLD-MARKET
  return { error: 'marks-full' };
}
