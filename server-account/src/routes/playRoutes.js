// Account service routes: arena, duels, gates, raids, renown, the sea, the wild, and more claims.
import { duelRecordOf, claimDuel, gateRecordOf, claimGate } from '../accounts.js';
import { mintRenownOrder, ID_RE } from '../../../src/net/identityToken.js';
import { signingKey, gatePublicKey } from '../signing.js';
import { seaWreck, seaPrizeCollect, seaPrizeReclaim } from '../seaWreck.js';
import { claimIliac, iliacBoardOf } from '../iliac.js';
import { claimGambit, gambitBoardOf } from '../gambit.js';
import { claimArena, arenaAttempt, arenaBoardOf, arenaTeam, ARENA_RENOWN_REGION } from '../arena.js';
import { reportRenownXp } from '../renownTracks.js';
import { firmamentState, setFirmament, respecFirmament, FIRM_STATUS } from '../firmament.js';
import { raidActStatements } from '../townEcon.js';
import { creditReceipt } from '../npcReceipts.js';
import { contractRegionOfRaid } from '../../../src/net/writLaw.js';
import { claimRaid, raidRecordOf } from '../raids.js';
import { claimSerpent, serpentRecordOf } from '../serpents.js';
import { claimEventPay } from '../staffEventPay.js';
import { claimStar, starRecordOf } from '../stars.js';
import { claimSd, sdRecordOf } from '../sds.js';
import { claimKetch, ketchRecordOf } from '../ketch.js';
import {
  egKeysOf, openEg, admitEg, claimEg, rollWeirKey, findEg, egFirstSay, egGateWeir, egGateWeirAnswer
} from '../eg.js';
import { egBoardOf } from '../egHonours.js';
import { egSink } from '../egEconomy.js';
import { startsEg } from '../egStarts.js';
import { claimLamp } from '../lamp.js';
import { claimQl, QL_STATUS } from '../questlines.js';
import { creditTerritory } from '../territory.js';
import { creditGate, creditRenown } from '../seatInfluence.js';
import {
  gateStrikeStatement, gateStrikeAnswer, raidStrikeStatement, combatStrikeAnswer, raidStrikeRid, deedStatements,
  deedAnswer, deedEvent, serpentStrikeStatement, serpentStrikeAnswer, starStrikeStatement, starStrikeRid
} from '../marks.js';
import { contractPayStatements, contractPaysOf } from '../contracts.js';
import { grantSpoils, portentPieces } from '../budget.js';
import { progressSpent } from '../progress.js';
import { wildFall, wildCollect, wildReclaim, wildEscrows } from '../wild.js';
import { WILD_STATUS, REALM_STATUS, EG_STATUS } from '../routeStatus.js';
import { json, no } from '../routeHelpers.js';
import { NEXT } from './next.js';

export async function playRoutes({ request, env, subtle, nowS, origin, path, db, ctx, body, who }) {
  if (path === '/v1/duel/loss' && request.method === 'POST') {
    // DUEL1's LOSER'S OWN REPORT - INT8: RETIRED. A duel's result is the relay's signed receipt now (below); a loss a
    // client reports counts for nothing, and is told so.
    return no('retired', 410, origin);
  }

  if (path === '/v1/duel/claim' && request.method === 'POST') {
    // INT8 (bible/06-Systems/Integrity-Arc.md lane 2): A DUEL'S RESULT, THE RELAY'S - either fighter carries the receipt
    // the referee handed it (src/net/duel/duelReceipt.js `d1`); the session must be one of its two, never the body's word,
    // and accounts.js `claimDuel` counts it once (its bout's id) inside its bounds. No public half here yet: 503, and
    // the client keeps the receipt for its day.
    const r = await claimDuel(ctx, who.player, body.receipt, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);   // AUDIT WB A5's law: which rung refused it
    return json(r, 200, origin);
  }

  if (path === '/v1/wild/fall' && request.method === 'POST') {
    // INT9 (bible/06-Systems/Integrity-Arc.md lane 2): A DEATH IN THE OPEN ZONE'S DROP, TAKEN OFF THE FALLEN'S JUDGED
    // RECORD (wild.js `wildFall`) - against the fall the relay signed (src/net/wild/wildReceipt.js `f1`: the fallen's own tab
    // with its record's `at`, its killer's after the grace), or none (a death to a foe - refused `foe`, FOE-KEEPS). The
    // answer's `order` is the service's word on the records, the room's to keep a deposit on.
    const r = await wildFall({ ...ctx, bucket: env.SAVES }, who.player, body, { gateKey: body.receipt !== undefined ? await gatePublicKey(env, subtle) : null, signing: await signingKey(env, subtle) });
    if (!('error' in r)) return json(r, 200, origin);
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);   // the record moved: its tab checkpoints and asks again
    return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, WILD_STATUS[r.error] ?? REALM_STATUS[r.error] ?? 400, origin);
  }

  if ((path === '/v1/wild/collect' || path === '/v1/wild/reclaim' || path === '/v1/wild/escrows') && request.method === 'POST') {
    // MAC'S DECISION (2026-10-14, the two-phase handoff - wild.js): the killer's worn piece the fall put in ESCROW -
    // collected into the killer's record against the room's signed collect (`g1`, the gate's key), taken back into the
    // fallen's once its killer could no longer collect it, or listed for the fallen's tab
    const wctx = { ...ctx, bucket: env.SAVES };
    const r = path === '/v1/wild/collect' ? await wildCollect(wctx, who.player, body, { gateKey: await gatePublicKey(env, subtle) })
      : path === '/v1/wild/reclaim' ? await wildReclaim(wctx, who.player, body) : await wildEscrows(wctx, who.player, body);
    if (!('error' in r)) return json(r, 200, origin);
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    return json({ error: r.error, ...(r.why ? { why: r.why } : {}), ...(Number.isSafeInteger(r.wait) ? { wait: r.wait } : {}) }, WILD_STATUS[r.error] ?? REALM_STATUS[r.error] ?? 400, origin);
  }

  if ((path === '/v1/sea/wreck' || path === '/v1/sea/prize/collect' || path === '/v1/sea/prize/reclaim') && request.method === 'POST') {
    // SHIP-PVP (2026-10-22, bible/03-World/Eltheric-Ocean.md SHIP-PVP): a ship wrecked at another captain's guns, against
    // the wreck the relay signed (src/net/wild/wildReceipt.js `n1`, the gate's key: her captain's own tab with its
    // record's `at`, her killer's after the grace) - boarded, her hold's share held for her killer; and the prizes
    // collected by the killer's character, or reclaimed by her captain's once its killer left them (seaWreck.js)
    const sctx = { ...ctx, bucket: env.SAVES };
    const r = path === '/v1/sea/wreck' ? await seaWreck(sctx, who.player, body, { gateKey: await gatePublicKey(env, subtle) })
      : path === '/v1/sea/prize/collect' ? await seaPrizeCollect(sctx, who.player, body) : await seaPrizeReclaim(sctx, who.player, body);
    if (!('error' in r)) return json(r, 200, origin);
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, WILD_STATUS[r.error] ?? REALM_STATUS[r.error] ?? 400, origin);
  }

  if (path === '/v1/duel/record' && request.method === 'POST') {
    // DUEL1: ANY account's record, for the Inspect card - asked by
    // a signed-in player of the account the relay stamped on the
    // card they were answered with. A record is two counts and is
    // no secret; the id rides the body, never the path (MAIL1's
    // law: an id is not a URL a log keeps).
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) return no('no-player', 404, origin);
    const known = await db.prepare('SELECT 1 AS x FROM players WHERE id = ?1').bind(body.id).first();
    if (!known) return no('no-player', 404, origin);
    // WB5b: the gates closed ride the same answer - the Inspect card asks once and says both
    return json({ id: body.id, ...(await duelRecordOf(ctx, body.id)), gates: await gateRecordOf(ctx, body.id), raids: await raidRecordOf(ctx, body.id), serpents: await serpentRecordOf(ctx, body.id), sds: await sdRecordOf(ctx, body.id), stars: await starRecordOf(ctx, body.id), ketch: await ketchRecordOf(ctx, body.id) }, 200, origin);   // RAID4: and the towns defended; SERPENT1: and the serpents slain; SD9b: and the Hours broken; STAR7: and the fallen stars held; KETCH: and the voyages sailed
  }

  if (path === '/v1/gate/claim' && request.method === 'POST') {
    // WB5b: THE ACCOUNT THE RECEIPT NAMES CARRIES IT HERE. The
    // relay signed it at the kill (src/net/gate/gateReceipt.js); the
    // session says who is asking, never the body, and accounts.js
    // `claimGate` holds the rest - the signature, the account, the
    // one row a (day, account). No public half here yet is the
    // service's own gap, not the player's: 503, and the client keeps
    // the receipt for the week it carries.
    // SILVER-WAYS: and the guild's deed - the claiming character's guild, where three of its accounts closed this gate
    const character = typeof body.character === 'string' ? body.character : null;
    const r = await claimGate(ctx, who.player, body.receipt, await gatePublicKey(env, subtle), {
      strike: (d) => gateStrikeStatement(ctx, who.player, env, d), region: body.region ?? null,
      deeds: (d) => deedStatements(ctx, who.player, env, { kind: 'gate', event: deedEvent('gate', d), character, guard: [d] }),
      weir: egGateWeir(ctx, who.player),   // AUDIT EG IV (lane3 #16): the Weir Key's roll in the claim's own batch (eg.js)
    });
    // AUDIT WB A5: a refused receipt says WHICH rung refused it - the client keeps one the service can mend (its key
    // not the relay's pair, a clock) and lets go of one it cannot
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    if (r.recorded === true) await grantSpoils(ctx.db, who.player.id, portentPieces(r.portent));   // INT5: a signed win's spoils, the budget's fill - AUDIT WB14 (WIRE-6): and a portent night's pieces
    // MARKS1: THE FIRST FAUCET - a receipt that made its row strikes the gate's Marks, in the row's own batch
    // (marks.js gateStrikeStatement: 50 under SILVER-WAYS' day's combat cap with the raids', the gate's own day its
    // line's id); `marks` null where Marks are not this account's
    const answer = { ...r };
    delete answer.day; delete answer.struck; delete answer.deedStruck; delete answer.weirRow; delete answer.portent;   // the service's own: the line's day and whether the batch struck (AUDIT EG IV: and the key's row; AUDIT WB14: the receipt's portents, the fill's)
    if (r.recorded && !r.rite && r.deedStruck !== undefined) answer.deed = await deedAnswer(db, who.player, deedEvent('gate', r.day), r.deedStruck);   // SILVER-WAYS: where a deed was this claim's to try
    // SEAT1b (Seats-Arc 4.2): a kill recorded now is influence for the account's war-guild where it pledged in the
    // region the claim named (`seat` the answer: counted, or why not - the kill stands either way). WB12d: the rite
    // alone is no kill, and is no influence
    if (r.recorded && !r.rite && body.region != null) answer.seat = await creditGate(ctx, who.player, env, { character: body.character ?? null, day: r.day, region: body.region });
    // CHAP2b (Chapters-Arc 3.3, 4): and the guilds the character is a member of on its Roll that keep a chapter there
    // remember it (npcReceipts.js - after the kill's row, never instead of it)
    if (r.recorded && !r.rite && body.region != null) answer.chapters = await creditReceipt(ctx, who.player, env, { character: body.character ?? null, kind: 'gate', id: r.day, region: body.region });
    // EG-PLAY: a recorded breach closed rolls a Weir Key - the service's own die; AUDIT EG IV (lane3 #16): in the claim's
    // own batch, the first decided by the row it wrote (eg.js egGateWeir), its row said here
    if (r.recorded && !r.rite) answer.weir = egGateWeirAnswer(r.weirRow);
    return json(r.recorded && !r.rite ? { ...answer, marks: await gateStrikeAnswer(ctx, who.player, env, !!r.struck, r.day) } : answer, 200, origin);   // AUDIT WB12d (A2): the rite alone strikes no Drakes, and says none
  }

  if (path === '/v1/raid/claim' && request.method === 'POST') {
    // RAID4: THE ACCOUNT A RAID'S RECEIPT NAMES CARRIES IT HERE, with the character that fought it. The relay signed
    // it at the cleanse (src/net/raid/raidReceipt.js); the session says who is asking, never the body, and raids.js
    // `claimRaid` holds the rest - the signature, the account, one row a (raid, account), the day's bound, the
    // Renown (RENOWN-CHAR: the fighting character's again). A level that ROSE comes back with a signed order, as a
    // Renown report's does.
    // SILVER-WAYS: the town's silver (30, under the day's combat cap), the guild's deed and the guild contracts the
    // raid's region posts, each in the claim's own batch and by its own row (raids.js)
    const r = await claimRaid(ctx, who.player, { receipt: body.receipt, character: body.character, name: body.name ?? null, cid: body.cid ?? null }, await gatePublicKey(env, subtle), {   // AUDIT RAID R4: `cid` - the device's claim, which the town's thanks are keyed to
      strike: (key, nonce) => raidStrikeStatement(ctx, who.player, env, key, nonce),
      deeds: (key, nonce, character) => deedStatements(ctx, who.player, env, { kind: 'raid', event: deedEvent('raid', key), character, guard: [key, nonce] }),
      contracts: (key, nonce) => contractPayStatements(ctx, who.player, env, { key, nonce }),
      econ: (key, nonce) => raidActStatements(ctx.db, who.player, nowS, key, nonce),   // TOWN-ECON TE2: the town driven clear of it
    });
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    if (r.recorded === true) await grantSpoils(ctx.db, who.player.id);   // INT5: a signed win's spoils, the budget's fill
    await progressSpent(ctx, who.player.id, path, r);   // INT17: a cleanse, and the Renown it paid
    let order = null;
    if (r.renown?.rose) {
      const key = await signingKey(env, subtle);
      if (key) order = await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS });
    }
    const answer = { ...r };
    delete answer.key; delete answer.struck; delete answer.deedStruck;   // SILVER-WAYS: the service's own
    if (r.recorded) {
      const marks = await combatStrikeAnswer(ctx, who.player, env, !!r.struck, raidStrikeRid(r.key));
      if (marks) answer.marks = marks;
      if (r.deedStruck !== undefined) answer.deed = await deedAnswer(db, who.player, deedEvent('raid', r.key), r.deedStruck);
      const paid = await contractPaysOf(db, who.player, r.key);
      if (paid.length) answer.contracts = paid;
      // CHAP2b: the town defended, remembered by the character's guilds that keep a chapter in its region (the key's)
      answer.chapters = await creditReceipt(ctx, who.player, env, { character: body.character ?? null, kind: 'raid', id: r.key, region: contractRegionOfRaid(r.key) });
    }
    return json({ ...answer, order }, 200, origin);
  }

  if (path === '/v1/star/claim' && request.method === 'POST') {
    // STAR7: A FALLEN STAR'S RECEIPT, CARRIED HERE BY THE ACCOUNT IT NAMES, with the character that fought it. The relay
    // signed it at the master's fall (src/net/starfall/starReceipt.js); the session says who is asking, never the body,
    // and stars.js `claimStar` holds the rest - the signature, the account, one row a (star, account), the day's bound,
    // the Renown, the device's spoils, and its silver under the day's combat cap (marks.js starStrikeStatement). A
    // level that ROSE comes back with a signed order, as a raid's does.
    // AUDIT STARFALL B3: INT5's fill rides the claim's own batch (stars.js - budget.js spoilsGrantStatement), never after
    // it: an answer lost past the batch is retried as `claimed`, and the fill was lost with it. What runs below is no
    // credit: INT17's measure (a debit a lost answer only spares), the order (signed again for a `claimed` that is the
    // device's own - stars.js `own`), the silver's answer (struck in the batch)
    const r = await claimStar(ctx, who.player, { receipt: body.receipt, character: body.character, name: body.name ?? null, cid: body.cid ?? null }, await gatePublicKey(env, subtle), {
      strike: (key, nonce) => starStrikeStatement(ctx, who.player, env, key, nonce),
    });
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    await progressSpent(ctx, who.player.id, path, r);   // INT17: the Renown it paid
    let order = null;
    if (r.renown?.rose) {
      const key = await signingKey(env, subtle);
      if (key) order = await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS });
    }
    const answer = { ...r };
    delete answer.key; delete answer.struck;   // the service's own
    if (r.recorded) {
      const marks = await combatStrikeAnswer(ctx, who.player, env, !!r.struck, starStrikeRid(r.key));
      if (marks) answer.marks = marks;
    }
    return json({ ...answer, order }, 200, origin);
  }

  if (path === '/v1/event/claim' && request.method === 'POST') {
    // EVENT-EXTRAS: A STAFF EVENT'S RECEIPT carried here by the account it names - staffEventPay.js verifies it with the
    // relay's key, reads the pay off the event's own row and pays the silver once an (event, account). The gold is the receipt's own and the game's.
    const r = await claimEventPay(ctx, who.player, env, { receipt: body.receipt }, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/serpent/claim' && request.method === 'POST') {
    // SERPENT1: A SERPENT'S RECEIPT, CARRIED HERE BY THE ACCOUNT IT NAMES, with the character that fought it. The relay
    // signed it at the kill (src/net/serpent/serpentReceipt.js); the session says who is asking, never the body, and serpents.js
    // `claimSerpent` holds the rest - the signature, the account, one row a (day, account), the Renown, the device's
    // hoard. A level that ROSE comes back with a signed order, as a raid's does.
    // SERPENT-SET: and its silver, a combat strike in the row's own batch (marks.js serpentStrikeStatement - 40, a ship
    // that stood half, under the day's combat cap with the gates and the raids), answered as `marks` where it recorded
    const r = await claimSerpent(ctx, who.player, { receipt: body.receipt, character: body.character, name: body.name ?? null, cid: body.cid ?? null, stones: body.stones ?? null }, await gatePublicKey(env, subtle), {   // AUDIT 625 P4: the embers its build mints
      strike: (d, nonce, earned) => serpentStrikeStatement(ctx, who.player, env, d, nonce, earned),
    });
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    if (r.recorded === true) await grantSpoils(ctx.db, who.player.id);   // INT5: a signed win's spoils, the budget's fill
    const key = r.renown?.rose ? await signingKey(env, subtle) : null;   // a level that rose: its signed order, for the rooms
    const signed = key ? await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS }) : null;
    const answer = { ...r };
    delete answer.day; delete answer.struck;   // the service's own: the kill's day and whether the batch struck
    return json({ ...answer, order: signed, ...(r.recorded ? { marks: await serpentStrikeAnswer(ctx, who.player, env, !!r.struck, r.day) } : {}) }, 200, origin);
  }

  if (path === '/v1/sd/claim' && request.method === 'POST') {
    // SD9b: A BRASS REMNANT'S RECEIPT, CARRIED HERE BY THE ACCOUNT IT NAMES. The relay signed it at the fall
    // (src/net/superDungeon/sdReceipt.js); the session says who is asking, never the body, and sds.js `claimSd` holds the rest - the
    // signature, the account, one row a (slot, account), and on that first write the Hour's grants off its seed. A
    // refusal says its rung, as the gate's does (AUDIT WB A5): the client keeps a receipt the service can mend.
    const r = await claimSd(ctx, who.player, body.receipt, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    if (r.recorded === true) await grantSpoils(ctx.db, who.player.id);   // INT5: a signed win's spoils, the budget's fill
    if (r.recorded === true) return json({ ...r, weir: await rollWeirKey(ctx, who.player, { kind: 'sd' }) }, 200, origin);   // EG-PLAY: an Hour broken rolls a Weir Key, one in three
    return json(r, 200, origin);
  }

  if (path === '/v1/ketch/claim' && request.method === 'POST') {
    // KETCH: A TONAL WARDEN'S RECEIPT, CARRIED HERE BY THE ACCOUNT IT NAMES (src/net/ketch/ketchReceipt.js) - ketch.js
    // `claimKetch` holds the rest: the signature, the account, one row a (voyage, account), and the week's share. A
    // refusal says its rung, as the Hour's does: the client keeps a receipt the service can mend.
    const r = await claimKetch(ctx, who.player, body.receipt, await gatePublicKey(env, subtle), body.cid);   // AUDIT KETCH L2-1: the device's claim id; L2-9: the budget's fill in its batch
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  // ═══ EG-PLAY: THE ELITE BREACH ════════════════════════════════════
  //
  // Elite-Gates.md sections 5 and 23: the Weir Keys an account holds, the open that stakes one (or the day's Rehearsal)
  // and signs the order the hub opens the breach on, a member's admission, and the relay's `e1` receipts (eg.js).
  if (path.startsWith('/v1/eg/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/eg/keys': async () => ({ ...(await egKeysOf(ctx, who.player, env)), rk: String(env.GATE_PUBLIC_KEY ?? '') || null }),   // EG-F: and the relay's public half - a stranger's arch verified (egStarts.js); EG-ZF: `env`, First of the Spire's list
      '/v1/eg/first': async () => egFirstSay(ctx, who.player, body),   // EG-ZF: the first-time lines shown, once an account
      '/v1/eg/starts': async () => startsEg(ctx, who.player, body, String(env.GATE_PUBLIC_KEY ?? '') || null),   // EG-F: the start window's preflight
      '/v1/eg/open': async () => openEg(ctx, who.player, body, await signingKey(env, subtle)),
      '/v1/eg/admit': async () => admitEg(ctx, who.player, body, await signingKey(env, subtle)),
      // EG-E1: what a Redoubt pays - the Marks' switch (`env`) and the claiming character, its guild's deed
      '/v1/eg/claim': async () => claimEg(ctx, who.player, body.receipt, await gatePublicKey(env, subtle), { env, character: typeof body.character === 'string' ? body.character : null }),
      '/v1/eg/sink': async () => egSink(ctx, who.player, body),   // EG-E1: the Broker's Panoply piece, once a week
      '/v1/eg/board': async () => egBoardOf({ ...ctx, db: env.DB }, who.player, env),   // EG-E2: the three boards - on the binding, as a #1's count is (the last season's champions may be written here)
      '/v1/eg/find': async () => findEg(ctx, who.player, body),   // EG-E3: a dungeon elite's find
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if ('error' in r) return json({ error: r.error, ...(r.why ? { why: r.why } : {}), ...(typeof r.b === 'string' ? { b: r.b } : {}), ...(Number.isSafeInteger(r.keys) ? { keys: r.keys } : {}),
      ...(Number.isSafeInteger(r.w) ? { w: r.w } : {}), ...(typeof r.piece === 'string' ? { piece: r.piece } : {}), ...(Number.isSafeInteger(r.purse) ? { purse: r.purse, price: r.price } : {}) }, EG_STATUS[r.error] ?? 400, origin);   // EG-E1: the sink's - which piece, the purse and the price
    if (path === '/v1/eg/claim' && r.recorded === true && r.q === 'w' && r.paid === true) await grantSpoils(ctx.db, who.player.id);   // INT5: a signed win's spoils, the budget's fill (EG-E1: a Redoubt the week pays)
    return json(r, 200, origin);
  }

  if (path === '/v1/lamp/claim' && request.method === 'POST') {
    // LAMP-KEEPER II: A LAMP KEEPER SPOKEN TO - the session says who, lamp.js lays I Love Lamp on the row once
    return json(await claimLamp(ctx, who.player), 200, origin);
  }

  if (path === '/v1/ql/claim' && request.method === 'POST') {
    // QL12: A QUESTLINE'S STEP CLAIMED - the session says who, questlines.js opens the step (`open`) or reads its witness
    // (`end`: the endgame place's own receipt row, in the line's window and order) and pays the line's title and the key
    const r = await claimQl({ ...ctx, env }, who.player, body, nowS);
    if ('error' in r) return no(r.error, QL_STATUS[/** @type {keyof typeof QL_STATUS} */ (r.error)] ?? 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/arena/claim' && request.method === 'POST') {
    // ARENA4: A BOUT'S RECEIPT, CARRIED HERE BY AN ACCOUNT IT NAMES. The relay refereed the bout and signed its result
    // (src/net/arena/arenaReceipt.js); arena.js `claimArena` holds the rest - the signature, the account, one row a bout, a
    // ladder win only as the account's next bout, both ratings for a bout between players. A refusal says its rung, as
    // the gate's does (AUDIT WB A5): the client keeps a receipt the service can mend and lets go of one it cannot.
    // ARENA4b: and a won bout's Renown to the character the claim names (arena.js arenaRenownFor - the renown law's own
    // door, its hour and cap), with a signed order when the level rose and its influence in Daggerfall's region for a
    // pledged war-guild - as a Renown report's and a writ's are
    const r = await claimArena(ctx, who.player, body.receipt, await gatePublicKey(env, subtle), { character: body.character ?? null, name: body.name ?? null });
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' || r.error === 'busy' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);   // AUDIT PRE-MERGE 1003 S6: `busy` - a players' bout whose ratings kept moving under it: kept, carried again
    if (r.renown && r.renown.credited > 0 && !r.renown.repeat) await creditRenown(ctx, who.player, env, { character: body.character, region: ARENA_RENOWN_REGION, xp: r.renown.credited });
    if (r.renown?.rose) {
      const key = await signingKey(env, subtle);
      const order = key ? await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS }) : null;   // a rise said in the rooms now
      return json({ ...r, order }, 200, origin);
    }
    return json(r, 200, origin);
  }

  if (path === '/v1/arena/attempt' && request.method === 'POST') {
    // AUDIT ARENA-LADDER: AN ATTEMPT AT THE ACCOUNT'S NEXT LADDER BOUT - its ticket, which the relay opens the bout for
    // and signs into the receipt; every attempt still open is forfeit first (arena.js arenaAttempt). 409 `order` with
    // the ladder for a device behind the climb.
    const r = await arenaAttempt(ctx, who.player, body.tier, body.bout, body.room);   // AUDIT ARENA-LADDER 2: for the room it is fought in
    if (r.error) return json({ error: r.error, ...(r.ladder ? { ladder: r.ladder } : {}) }, r.error === 'order' ? 409 : r.error === 'busy' ? 503 : r.error === 'ladder-needs-account' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/arena/board' && request.method === 'POST') {
    // ARENA4: THE ARENA'S BOARDS (Mac: "view your ranking and even player leaderboards"), counted from the rows - the
    // season's ratings and its #1, the climb, the fastest Grand Champions, the banners and the Hall of Champions - and
    // the caller's own (`me`).
    return json(await arenaBoardOf(ctx, who.player, env), 200, origin);
  }

  if (path === '/v1/iliac/claim' && request.method === 'POST') {
    // CARDS10: A RANKED GAME'S RECEIPT, CARRIED HERE BY AN ACCOUNT IT NAMES - the arena players' bout's law for Iliac
    // Hand (iliac.js claimIliac): the signature, the account, one row a game, both ratings. A refusal says its rung.
    const r = await claimIliac(ctx, who.player, body.receipt, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' || r.error === 'busy' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/iliac/board' && request.method === 'POST') {
    // CARDS10: ILIAC HAND'S SEASON BOARD (Tavern-Cards section 6.4: "a season board, the Arena's way, with a title for
    // the top of it"), counted from the rows, and the caller's own.
    return json(await iliacBoardOf(ctx, who.player, env), 200, origin);
  }

  if (path === '/v1/gambit/claim' && request.method === 'POST') {
    // KG6: A RATED KING'S GAMBIT'S RECEIPT, CARRIED HERE BY AN ACCOUNT IT NAMES - Iliac Hand's law (gambit.js
    // claimGambit): the signature, the account, one row a game, both ratings. A refusal says its rung.
    const r = await claimGambit(ctx, who.player, body.receipt, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' || r.error === 'busy' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/gambit/board' && request.method === 'POST') {
    // KG6: THE KING'S GAMBIT'S SEASON BOARD (Kings-Gambit.md 10.7: "a season board the Arena's way ... whose #1 over 10
    // games against 5 foes wears GRANDMASTER"), counted from the rows, and the caller's own.
    return json(await gambitBoardOf(ctx, who.player, env), 200, origin);
  }

  if (path === '/v1/arena/team' && request.method === 'POST') {
    // ARENA4: A BANNER JOINED OR QUIT (`banner` 'red' | 'blue' | null). 403 for a guest; 409 for a banner the season
    // refuses (`season`) or one while another is worn (`joined`).
    const r = await arenaTeam(ctx, who.player, body.banner ?? null);
    if (r.error) return json({ error: r.error, ...(r.left ? { left: r.left } : {}), ...(r.banner ? { banner: r.banner } : {}) }, r.error === 'guest' ? 403 : r.error === 'bad-banner' ? 400 : 409, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/renown/xp' && request.method === 'POST') {
    // RENOWN1: WHAT ONE OF THE CALLER'S CHARACTERS EARNED ONLINE
    // (RENOWN-CHAR: credited to that character's track again). The
    // account is the session's, never the body's; the bounds are all
    // in renownTracks.js `reportRenownXp`. A level that ROSE comes back
    // with a signed order the client carries to the rooms it is in,
    // so the level beside its name moves there now rather than at its
    // next connection - and a service with no key still credits, it
    // just cannot vouch for the new level until then.
    // AUDIT RENOWN1 DATA-4: `rid` the report's own id, so a report sent again because its answer was lost is
    // answered again (`repeat`) rather than credited twice - and a repeat carries an order too, since the
    // answer that was lost may have been the one with the rise in it.
    const r = await reportRenownXp(ctx, who.player, { character: body.character, xp: body.xp, name: body.name ?? null, rid: body.rid ?? null });
    if (r.error) return no(r.error, r.error === 'renown-full' ? 409 : 400, origin);
    // SEAT1b (Seats-Arc 4.2: "The Renown report grows `region`"): what this report CREDITED - never what it asked, and
    // nothing for a repeat - kept for the character's war-guild where it pledged in that region
    if (body.region != null && r.credited > 0 && !r.repeat) await creditRenown(ctx, who.player, env, { character: body.character, region: body.region, xp: r.credited });
    // BUNNYFALL COMPANIES (territory): and to the character's Company's week in that region (territory.js)
    if (body.region != null && r.credited > 0 && !r.repeat) await creditTerritory(ctx, who.player, { character: body.character, region: body.region, xp: r.credited }).catch((e) => console.warn('[territory] credit failed', e?.message ?? e));
    await progressSpent(ctx, who.player.id, path, r);   // INT17: what it credited, measured against the play that paid for it
    let order = null;
    if (r.rose || (r.repeat && r.level > 1)) {
      const key = await signingKey(env, subtle);
      if (key) order = await mintRenownOrder({ s: who.player.id, lv: r.level }, key, { subtle, nowS });
    }
    return json({ ...r, order }, 200, origin);
  }

  // ═══ FIRM1: THE FIRMAMENT ═══════════════════════════════════
  //
  // A character's passive tree: read with its purses, and changed WHOLE - the law judges the tree asked for against the
  // purses this service counts, and a refund's silver is burnt in the change's own batch (firmament.js).
  if (path === '/v1/firmament/state' || path === '/v1/firmament/set' || path === '/v1/firmament/respec') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path === '/v1/firmament/state' ? await firmamentState(ctx, who.player, env, body)
      : path === '/v1/firmament/set' ? await setFirmament(ctx, who.player, env, body)
        : await respecFirmament({ ...ctx, bucket: env.SAVES }, who.player, env, body);   // a realm character's record is in R2
    if ('error' in r) return json({ error: r.error, ...(Number.isSafeInteger(r.silver) ? { silver: r.silver } : {}), ...(r.error === 'seq' && Number.isSafeInteger(r.seq) ? { seq: r.seq } : {}) }, /** @type {Record<string, number>} */ (FIRM_STATUS)[r.error] ?? 400, origin);
    return json(r, 200, origin);
  }
  return NEXT;
}
