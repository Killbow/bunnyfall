// Account service routes: arena, duels, gates, raids, renown, the sea, the wild, and more claims.
import { duelRecordOf, claimDuel, gateRecordOf, claimGate } from '../accounts.js';
import { mintRenownOrder, ID_RE } from '../../../src/net/identityToken.js';
import { signingKey, gatePublicKey } from '../signing.js';
import { claimMineHaul } from '../mineHaul.js';   // BUNNYFALL (2026-11-26, caverns)
import { societyState, societyTake, societyTurnIn, societyBuy, societyKitBuy, societyKitUse, societySellOre } from '../society.js';   // BUNNYFALL (2026-11-26, caverns)
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
    return no('retired', 410, origin);
  }

  if (path === '/v1/duel/claim' && request.method === 'POST') {
    const r = await claimDuel(ctx, who.player, body.receipt, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/wild/fall' && request.method === 'POST') {
    const r = await wildFall({ ...ctx, bucket: env.SAVES }, who.player, body, { gateKey: body.receipt !== undefined ? await gatePublicKey(env, subtle) : null, signing: await signingKey(env, subtle) });
    if (!('error' in r)) return json(r, 200, origin);
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, WILD_STATUS[r.error] ?? REALM_STATUS[r.error] ?? 400, origin);
  }

  if ((path === '/v1/wild/collect' || path === '/v1/wild/reclaim' || path === '/v1/wild/escrows') && request.method === 'POST') {
    const wctx = { ...ctx, bucket: env.SAVES };
    const r = path === '/v1/wild/collect' ? await wildCollect(wctx, who.player, body, { gateKey: await gatePublicKey(env, subtle) })
      : path === '/v1/wild/reclaim' ? await wildReclaim(wctx, who.player, body) : await wildEscrows(wctx, who.player, body);
    if (!('error' in r)) return json(r, 200, origin);
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    return json({ error: r.error, ...(r.why ? { why: r.why } : {}), ...(Number.isSafeInteger(r.wait) ? { wait: r.wait } : {}) }, WILD_STATUS[r.error] ?? REALM_STATUS[r.error] ?? 400, origin);
  }

  if ((path === '/v1/sea/wreck' || path === '/v1/sea/prize/collect' || path === '/v1/sea/prize/reclaim') && request.method === 'POST') {
    const sctx = { ...ctx, bucket: env.SAVES };
    const r = path === '/v1/sea/wreck' ? await seaWreck(sctx, who.player, body, { gateKey: await gatePublicKey(env, subtle) })
      : path === '/v1/sea/prize/collect' ? await seaPrizeCollect(sctx, who.player, body) : await seaPrizeReclaim(sctx, who.player, body);
    if (!('error' in r)) return json(r, 200, origin);
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, WILD_STATUS[r.error] ?? REALM_STATUS[r.error] ?? 400, origin);
  }

  if (path === '/v1/duel/record' && request.method === 'POST') {
    // The account id goes in the body, not the path, so request logs never record it.
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) return no('no-player', 404, origin);
    const known = await db.prepare('SELECT 1 AS x FROM players WHERE id = ?1').bind(body.id).first();
    if (!known) return no('no-player', 404, origin);
    return json({ id: body.id, ...(await duelRecordOf(ctx, body.id)), gates: await gateRecordOf(ctx, body.id), raids: await raidRecordOf(ctx, body.id), serpents: await serpentRecordOf(ctx, body.id), sds: await sdRecordOf(ctx, body.id), stars: await starRecordOf(ctx, body.id), ketch: await ketchRecordOf(ctx, body.id) }, 200, origin);
  }

  if (path === '/v1/gate/claim' && request.method === 'POST') {
    const character = typeof body.character === 'string' ? body.character : null;
    const r = await claimGate(ctx, who.player, body.receipt, await gatePublicKey(env, subtle), {
      strike: (d) => gateStrikeStatement(ctx, who.player, env, d), region: body.region ?? null,
      deeds: (d) => deedStatements(ctx, who.player, env, { kind: 'gate', event: deedEvent('gate', d), character, guard: [d] }),
      weir: egGateWeir(ctx, who.player),
    });
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    if (r.recorded === true) await grantSpoils(ctx.db, who.player.id, portentPieces(r.portent));
    const answer = { ...r };
    delete answer.day; delete answer.struck; delete answer.deedStruck; delete answer.weirRow; delete answer.portent;
    if (r.recorded && !r.rite && r.deedStruck !== undefined) answer.deed = await deedAnswer(db, who.player, deedEvent('gate', r.day), r.deedStruck);
    if (r.recorded && !r.rite && body.region != null) answer.seat = await creditGate(ctx, who.player, env, { character: body.character ?? null, day: r.day, region: body.region });
    if (r.recorded && !r.rite && body.region != null) answer.chapters = await creditReceipt(ctx, who.player, env, { character: body.character ?? null, kind: 'gate', id: r.day, region: body.region });
    if (r.recorded && !r.rite) answer.weir = egGateWeirAnswer(r.weirRow);
    return json(r.recorded && !r.rite ? { ...answer, marks: await gateStrikeAnswer(ctx, who.player, env, !!r.struck, r.day) } : answer, 200, origin);
  }

  if (path === '/v1/raid/claim' && request.method === 'POST') {
    const r = await claimRaid(ctx, who.player, { receipt: body.receipt, character: body.character, name: body.name ?? null, cid: body.cid ?? null }, await gatePublicKey(env, subtle), {
      strike: (key, nonce) => raidStrikeStatement(ctx, who.player, env, key, nonce),
      deeds: (key, nonce, character) => deedStatements(ctx, who.player, env, { kind: 'raid', event: deedEvent('raid', key), character, guard: [key, nonce] }),
      contracts: (key, nonce) => contractPayStatements(ctx, who.player, env, { key, nonce }),
      econ: (key, nonce) => raidActStatements(ctx.db, who.player, nowS, key, nonce),
    });
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    if (r.recorded === true) await grantSpoils(ctx.db, who.player.id);
    await progressSpent(ctx, who.player.id, path, r);
    let order = null;
    if (r.renown?.rose) {
      const key = await signingKey(env, subtle);
      if (key) order = await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS });
    }
    const answer = { ...r };
    delete answer.key; delete answer.struck; delete answer.deedStruck;
    if (r.recorded) {
      const marks = await combatStrikeAnswer(ctx, who.player, env, !!r.struck, raidStrikeRid(r.key));
      if (marks) answer.marks = marks;
      if (r.deedStruck !== undefined) answer.deed = await deedAnswer(db, who.player, deedEvent('raid', r.key), r.deedStruck);
      const paid = await contractPaysOf(db, who.player, r.key);
      if (paid.length) answer.contracts = paid;
      answer.chapters = await creditReceipt(ctx, who.player, env, { character: body.character ?? null, kind: 'raid', id: r.key, region: contractRegionOfRaid(r.key) });
    }
    return json({ ...answer, order }, 200, origin);
  }

  if (path === '/v1/star/claim' && request.method === 'POST') {
    const r = await claimStar(ctx, who.player, { receipt: body.receipt, character: body.character, name: body.name ?? null, cid: body.cid ?? null }, await gatePublicKey(env, subtle), {
      strike: (key, nonce) => starStrikeStatement(ctx, who.player, env, key, nonce),
    });
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    await progressSpent(ctx, who.player.id, path, r);
    let order = null;
    if (r.renown?.rose) {
      const key = await signingKey(env, subtle);
      if (key) order = await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS });
    }
    const answer = { ...r };
    delete answer.key; delete answer.struck;
    if (r.recorded) {
      const marks = await combatStrikeAnswer(ctx, who.player, env, !!r.struck, starStrikeRid(r.key));
      if (marks) answer.marks = marks;
    }
    return json({ ...answer, order }, 200, origin);
  }

  if (path === '/v1/event/claim' && request.method === 'POST') {
    const r = await claimEventPay(ctx, who.player, env, { receipt: body.receipt }, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/serpent/claim' && request.method === 'POST') {
    const r = await claimSerpent(ctx, who.player, { receipt: body.receipt, character: body.character, name: body.name ?? null, cid: body.cid ?? null, stones: body.stones ?? null }, await gatePublicKey(env, subtle), {
      strike: (d, nonce, earned) => serpentStrikeStatement(ctx, who.player, env, d, nonce, earned),
    });
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    if (r.recorded === true) await grantSpoils(ctx.db, who.player.id);
    const key = r.renown?.rose ? await signingKey(env, subtle) : null;
    const signed = key ? await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS }) : null;
    const answer = { ...r };
    delete answer.day; delete answer.struck;
    return json({ ...answer, order: signed, ...(r.recorded ? { marks: await serpentStrikeAnswer(ctx, who.player, env, !!r.struck, r.day) } : {}) }, 200, origin);
  }

  if (path === '/v1/sd/claim' && request.method === 'POST') {
    const r = await claimSd(ctx, who.player, body.receipt, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    if (r.recorded === true) await grantSpoils(ctx.db, who.player.id);
    if (r.recorded === true) return json({ ...r, weir: await rollWeirKey(ctx, who.player, { kind: 'sd' }) }, 200, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/ketch/claim' && request.method === 'POST') {
    const r = await claimKetch(ctx, who.player, body.receipt, await gatePublicKey(env, subtle), body.cid);
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path.startsWith('/v1/eg/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/eg/keys': async () => ({ ...(await egKeysOf(ctx, who.player, env)), rk: String(env.GATE_PUBLIC_KEY ?? '') || null }),
      '/v1/eg/first': async () => egFirstSay(ctx, who.player, body),
      '/v1/eg/starts': async () => startsEg(ctx, who.player, body, String(env.GATE_PUBLIC_KEY ?? '') || null),
      '/v1/eg/open': async () => openEg(ctx, who.player, body, await signingKey(env, subtle)),
      '/v1/eg/admit': async () => admitEg(ctx, who.player, body, await signingKey(env, subtle)),
      '/v1/eg/claim': async () => claimEg(ctx, who.player, body.receipt, await gatePublicKey(env, subtle), { env, character: typeof body.character === 'string' ? body.character : null }),
      '/v1/eg/sink': async () => egSink(ctx, who.player, body),
      '/v1/eg/board': async () => egBoardOf({ ...ctx, db: env.DB }, who.player, env),
      '/v1/eg/find': async () => findEg(ctx, who.player, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if ('error' in r) return json({ error: r.error, ...(r.why ? { why: r.why } : {}), ...(typeof r.b === 'string' ? { b: r.b } : {}), ...(Number.isSafeInteger(r.keys) ? { keys: r.keys } : {}),
      ...(Number.isSafeInteger(r.w) ? { w: r.w } : {}), ...(typeof r.piece === 'string' ? { piece: r.piece } : {}), ...(Number.isSafeInteger(r.purse) ? { purse: r.purse, price: r.price } : {}) }, EG_STATUS[r.error] ?? 400, origin);
    if (path === '/v1/eg/claim' && r.recorded === true && r.q === 'w' && r.paid === true) await grantSpoils(ctx.db, who.player.id);
    return json(r, 200, origin);
  }

  if (path === '/v1/lamp/claim' && request.method === 'POST') {
    return json(await claimLamp(ctx, who.player), 200, origin);
  }

  if (path === '/v1/ql/claim' && request.method === 'POST') {
    const r = await claimQl({ ...ctx, env }, who.player, body, nowS);
    if ('error' in r) return no(r.error, QL_STATUS[/** @type {keyof typeof QL_STATUS} */ (r.error)] ?? 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/arena/claim' && request.method === 'POST') {
    const r = await claimArena(ctx, who.player, body.receipt, await gatePublicKey(env, subtle), { character: body.character ?? null, name: body.name ?? null });
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' || r.error === 'busy' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    if (r.renown && r.renown.credited > 0 && !r.renown.repeat) await creditRenown(ctx, who.player, env, { character: body.character, region: ARENA_RENOWN_REGION, xp: r.renown.credited });
    if (r.renown?.rose) {
      const key = await signingKey(env, subtle);
      const order = key ? await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS }) : null;
      return json({ ...r, order }, 200, origin);
    }
    return json(r, 200, origin);
  }

  if (path === '/v1/mine/haul' && request.method === 'POST') {
    // BUNNYFALL (2026-11-26, caverns): A DRILL'S HAUL - the relay signed what a drill's setter took from its hopper
    // (src/net/mine/mineReceipt.js); mineHaul.js verifies it with the gate's key, keeps it once and pays its ore into the
    // character's Stores. A refusal says its rung: the page keeps a receipt the service may mend and lets go of the rest.
    const r = await claimMineHaul(ctx, who.player, env, body, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path.startsWith('/v1/society') && request.method === 'POST') {
    // BUNNYFALL (2026-11-26, caverns): THE CARTOGRAPHERS' SOCIETY - its desk, a contract taken or turned in, a ware bought
    // with Survey Seals (society.js; the law is src/net/mine/societyLaw.js). A refusal says its rung.
    // the mine kit bought for gold (a realm act: the record's purse) and used; a turn-in reads the member's rank off the record
    const act = { '/v1/society': societyState, '/v1/society/take': societyTake, '/v1/society/turnin': societyTurnIn, '/v1/society/buy': societyBuy, '/v1/society/kit': societyKitBuy, '/v1/society/use': societyKitUse, '/v1/society/sell-ore': societySellOre }[path];
    if (act) {
      const r = await act({ ...ctx, env, bucket: env.SAVES }, who.player, body ?? {});
      if (r.error) return json(r, r.error === 'need-account' ? 403 : r.error === 'busy' || r.error === 'seq' ? 409 : 400, origin);
      return json(r, 200, origin);
    }
  }

  if (path === '/v1/arena/attempt' && request.method === 'POST') {
    const r = await arenaAttempt(ctx, who.player, body.tier, body.bout, body.room);
    if (r.error) return json({ error: r.error, ...(r.ladder ? { ladder: r.ladder } : {}) }, r.error === 'order' ? 409 : r.error === 'busy' ? 503 : r.error === 'ladder-needs-account' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/arena/board' && request.method === 'POST') {
    return json(await arenaBoardOf(ctx, who.player, env), 200, origin);
  }

  if (path === '/v1/iliac/claim' && request.method === 'POST') {
    const r = await claimIliac(ctx, who.player, body.receipt, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' || r.error === 'busy' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/iliac/board' && request.method === 'POST') {
    return json(await iliacBoardOf(ctx, who.player, env), 200, origin);
  }

  if (path === '/v1/gambit/claim' && request.method === 'POST') {
    const r = await claimGambit(ctx, who.player, body.receipt, await gatePublicKey(env, subtle));
    if (r.error) return json({ error: r.error, ...(r.why ? { why: r.why } : {}) }, r.error === 'no-gate-key' || r.error === 'busy' ? 503 : r.error === 'not-yours' ? 403 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/gambit/board' && request.method === 'POST') {
    return json(await gambitBoardOf(ctx, who.player, env), 200, origin);
  }

  if (path === '/v1/arena/team' && request.method === 'POST') {
    const r = await arenaTeam(ctx, who.player, body.banner ?? null);
    if (r.error) return json({ error: r.error, ...(r.left ? { left: r.left } : {}), ...(r.banner ? { banner: r.banner } : {}) }, r.error === 'guest' ? 403 : r.error === 'bad-banner' ? 400 : 409, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/renown/xp' && request.method === 'POST') {
    const r = await reportRenownXp(ctx, who.player, { character: body.character, xp: body.xp, name: body.name ?? null, rid: body.rid ?? null });
    if (r.error) return no(r.error, r.error === 'renown-full' ? 409 : 400, origin);
    if (body.region != null && r.credited > 0 && !r.repeat) await creditRenown(ctx, who.player, env, { character: body.character, region: body.region, xp: r.credited });
    if (body.region != null && r.credited > 0 && !r.repeat) await creditTerritory(ctx, who.player, { character: body.character, region: body.region, xp: r.credited }).catch((e) => console.warn('[territory] credit failed', e?.message ?? e));
    await progressSpent(ctx, who.player.id, path, r);
    let order = null;
    if (r.rose || (r.repeat && r.level > 1)) {
      const key = await signingKey(env, subtle);
      if (key) order = await mintRenownOrder({ s: who.player.id, lv: r.level }, key, { subtle, nowS });
    }
    return json({ ...r, order }, 200, origin);
  }

  if (path === '/v1/firmament/state' || path === '/v1/firmament/set' || path === '/v1/firmament/respec') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path === '/v1/firmament/state' ? await firmamentState(ctx, who.player, env, body)
      : path === '/v1/firmament/set' ? await setFirmament(ctx, who.player, env, body)
        : await respecFirmament({ ...ctx, bucket: env.SAVES }, who.player, env, body);
    if ('error' in r) return json({ error: r.error, ...(Number.isSafeInteger(r.silver) ? { silver: r.silver } : {}), ...(r.error === 'seq' && Number.isSafeInteger(r.seq) ? { seq: r.seq } : {}) }, /** @type {Record<string, number>} */ (FIRM_STATUS)[r.error] ?? 400, origin);
    return json(r, 200, origin);
  }
  return NEXT;
}
