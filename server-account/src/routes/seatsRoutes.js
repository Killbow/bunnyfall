// Account service routes: seats, the market, stores, professions, writs, crews, hunts, and cards.
import { mintRenownOrder } from '../../../src/net/identityToken.js';
import { signingKey, gatePublicKey } from '../signing.js';
import { stakeCards, cashoutCards } from '../cards.js';
import { seaBountyBoard, seaBountyPost, seaBountyCollect } from '../seaBounty.js';
import { crewHall, crewSign, crewRelease, CREW_STATUS } from '../crewSigns.js';
import { seaSeasonBoard } from '../seaSeason.js';
import { deckOrderOf } from '../iliac.js';
import { listSeats, witnessSeat, strikeSeat, seatsOpenFor } from '../townSeats.js';
import { pledgeSeat, claimWatch, readStandings, payTribute, claimOrcCamp, readRecords } from '../seatInfluence.js';
import { settleDueOnce, seatsBoard, relinquishSeat } from '../seatTurning.js';
import { setTithe, proclaimEdict, claimBounty } from '../seatHolding.js';
import { setWindow, signBattle, unsignBattle, hireSellsword, withdrawHire } from '../seatBattles.js';
import { siegePass, claimSiege, voidSiege } from '../seatSiege.js';
import { royalPass, claimRoyal } from '../seatRoyal.js';
import { seasonZeroOf } from '../../../src/net/townSeatLaw.js';
import { offerFealty, acceptFealty, breakFealty, offerPact, breakPact } from '../seatPolitics.js';
import { fundFort, readForts } from '../seatForts.js';
import { huntState, huntClear, HUNT_STATUS } from '../hunts.js';
import { craftWritBoard, deliverCraftWrit } from '../craftWrits.js';
import {
  profState, profPixels, harvestNode, chooseSpec, withdrawStores, depositStores, smeltAtForge, craftAtAnvil,
  temperPiece, buyStock, listWrits, deliverWrit, makeAtBench, chooseFocus, enterCraftwork
} from '../professions.js';
import { provState, provMake, provPrepare } from '../provisioning.js';
import { masterWork } from '../masterWork.js';
import { brewAtStation, disenchantPiece, reforgeWithEssence } from '../alchemy.js';
import { salvagePieces } from '../salvage.js';
import { upgradeMaterial } from '../upgrade.js';
import {
  writBoard, postGuildWrit, supplyGuildWrit, withdrawGuildWrit, setWritBudget, postCommission, fulfilCommission,
  cancelCommission, declineCommission, guildStores, depositGuildStores, withdrawGuildStores
} from '../writs.js';
import { contractBoard, postContract, withdrawContract } from '../contracts.js';
import { motherlodesRead, strikeMotherlode, isMotherlodeNode } from '../motherlodes.js';
import {
  marketRead, marketList, marketBuy, marketCancel, marketOrder, marketFill, marketUnorder, marketCollect,
  marketReport, marketRemove, marketAuction, marketBid, marketGoldCollect, marketVendor, marketVendors,
  marketMyVendors, marketRoad
} from '../market.js';
import { progressSpent } from '../progress.js';
import {
  JUDGE_STATUS, CARDS_STATUS, REALM_STATUS, SEAT_READS, SEAT_STATUS, PROF_STATUS, MARKET_STATUS
} from '../routeStatus.js';
import { json, no } from '../routeHelpers.js';
import { NEXT } from './next.js';

export async function seatsRoutes({ request, env, subtle, nowS, origin, path, ctx, body, who, progressRoute }) {
  if (path.startsWith('/v1/seats/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    // A seat request first settles every due Turning; while another settle is pending, only reads answer.
    if (seatsOpenFor(who.player, env) && (await settleDueOnce(ctx.db, nowS, seasonZeroOf(env.SEASON_ZERO_WEEK))).pending && !SEAT_READS.has(path)) return no('seats-settling', 503, origin);
    const act = {
      '/v1/seats/list': async () => {
        const r = await listSeats(ctx, who.player, env);
        return 'error' in r ? r : { ...r, ...(await seatsBoard(ctx.db, r.seats, nowS)), zero: seasonZeroOf(env.SEASON_ZERO_WEEK) };
      },
      '/v1/seats/relinquish': () => relinquishSeat(ctx, who.player, env, body),
      '/v1/seats/witness': () => witnessSeat(ctx, who.player, env, body),
      '/v1/seats/strike': () => strikeSeat(ctx, who.player, env, body),
      '/v1/seats/pledge': () => pledgeSeat(ctx, who.player, env, body),
      '/v1/seats/standings': () => readStandings(ctx, who.player, env, body),
      '/v1/seats/records': () => readRecords(ctx, who.player, env, body),
      '/v1/seats/watch': async () => claimWatch(ctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/seats/tribute': () => payTribute(ctx, who.player, env, body),
      '/v1/seats/tithe': () => setTithe(ctx, who.player, env, body),
      '/v1/seats/edict': () => proclaimEdict(ctx, who.player, env, body),
      '/v1/seats/bounty': () => claimBounty(ctx, who.player, env, body),
      '/v1/seats/orc-camp': () => claimOrcCamp(ctx, who.player, env, body),
      '/v1/seats/window': () => setWindow(ctx, who.player, env, body),
      '/v1/seats/siege/sign': () => signBattle(ctx, who.player, env, body),
      '/v1/seats/siege/unsign': () => unsignBattle(ctx, who.player, env, body),
      '/v1/seats/siege/hire': () => hireSellsword(ctx, who.player, env, body),
      '/v1/seats/siege/withdraw': () => withdrawHire(ctx, who.player, env, body),
      '/v1/seats/siege/pass': async () => siegePass(ctx, who.player, env, body, await signingKey(env, subtle)),
      '/v1/seats/siege/claim': async () => claimSiege(ctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/seats/siege/void': () => voidSiege(ctx, who.player, env, body),
      '/v1/seats/royal/pass': async () => royalPass(ctx, who.player, env, body, await signingKey(env, subtle)),
      '/v1/seats/royal/claim': async () => claimRoyal(ctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/seats/fealty': () => offerFealty(ctx, who.player, env, body),
      '/v1/seats/fealty/accept': () => acceptFealty(ctx, who.player, env, body),
      '/v1/seats/fealty/break': () => breakFealty(ctx, who.player, env, body),
      '/v1/seats/pact': () => offerPact(ctx, who.player, env, body),
      '/v1/seats/pact/break': () => breakPact(ctx, who.player, env, body),
      '/v1/seats/forts': () => readForts(ctx, who.player, env, body),
      '/v1/seats/fort/fund': () => fundFort(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (progressRoute) await progressSpent(ctx, who.player.id, path, r);
    return 'error' in r ? no(r.error, SEAT_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  // Provisioning routes use /v1/prov/, so the prefix test lists it beside /v1/prof/.
  if (path.startsWith('/v1/prof/') || path.startsWith('/v1/prov/') || path.startsWith('/v1/stores/') || path.startsWith('/v1/writs/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/prof/state': () => profState(ctx, who.player, env, body),
      '/v1/prof/pixels': () => profPixels(ctx, who.player, env, body),
      '/v1/prof/harvest': () => (isMotherlodeNode(body?.node) ? strikeMotherlode(ctx, who.player, env, body) : harvestNode(ctx, who.player, env, body)),
      '/v1/prof/motherlodes': () => motherlodesRead(ctx, who.player, env, body),
      '/v1/prof/spec': () => chooseSpec(ctx, who.player, env, body),
      '/v1/prof/smelt': () => smeltAtForge(ctx, who.player, env, body),
      '/v1/prof/craft': () => craftAtAnvil(ctx, who.player, env, body),
      '/v1/prof/make': () => makeAtBench(ctx, who.player, env, body),
      '/v1/prof/focus': () => chooseFocus(ctx, who.player, env, body),
      '/v1/prof/craftwork': () => enterCraftwork(ctx, who.player, env, body),
      '/v1/prov/state': () => provState(ctx, who.player, env, body),
      '/v1/prov/make': () => provMake(ctx, who.player, env, body),
      '/v1/prov/prepare': () => provPrepare(ctx, who.player, env, body),
      '/v1/prof/brew': () => brewAtStation(ctx, who.player, env, body),
      '/v1/prof/disenchant': () => disenchantPiece({ ...ctx, bucket: env.SAVES }, who.player, env, body),
      '/v1/prof/stock': () => buyStock(ctx, who.player, env, body),
      '/v1/prof/salvage': () => salvagePieces({ ...ctx, bucket: env.SAVES }, who.player, env, body),
      '/v1/prof/upgrade': () => upgradeMaterial(ctx, who.player, env, body),
      '/v1/prof/temper': () => temperPiece(ctx, who.player, env, body),
      '/v1/prof/reforge': () => reforgeWithEssence(ctx, who.player, env, body),
      '/v1/prof/master': () => masterWork(ctx, who.player, env, body),
      '/v1/stores/withdraw': () => withdrawStores(ctx, who.player, env, body),
      '/v1/stores/deposit': () => depositStores(ctx, who.player, env, body),
      '/v1/writs/list': async () => {
        const r = await listWrits(ctx, who.player, env, body);
        return 'error' in r ? r : { ...r, ...(await writBoard(ctx, who.player, env, body)), ...(await contractBoard(ctx, who.player, env, body)), ...(await craftWritBoard(ctx, who.player, env, body)) };
      },
      '/v1/writs/deliver': () => deliverWrit(ctx, who.player, env, body),
      '/v1/writs/craft': () => deliverCraftWrit({ ...ctx, bucket: env.SAVES }, who.player, env, body),
      '/v1/writs/post': () => postGuildWrit(ctx, who.player, env, body),
      '/v1/writs/supply': () => supplyGuildWrit(ctx, who.player, env, body),
      '/v1/writs/withdraw': () => withdrawGuildWrit(ctx, who.player, env, body),
      '/v1/writs/budget': () => setWritBudget(ctx, who.player, env, body),
      '/v1/writs/contract': () => postContract(ctx, who.player, env, body),
      '/v1/writs/contract-withdraw': () => withdrawContract(ctx, who.player, env, body),
      '/v1/writs/commission': () => postCommission(ctx, who.player, env, body),
      '/v1/writs/fulfil': () => fulfilCommission({ ...ctx, bucket: env.SAVES }, who.player, env, body),
      '/v1/writs/cancel': () => cancelCommission(ctx, who.player, env, body),
      '/v1/writs/decline': () => declineCommission(ctx, who.player, env, body),
      '/v1/stores/guild': () => guildStores(ctx, who.player, env, body),
      '/v1/stores/guild-deposit': () => depositGuildStores(ctx, who.player, env, body),
      '/v1/stores/guild-withdraw': () => withdrawGuildStores(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (progressRoute) await progressSpent(ctx, who.player.id, path, r);
    if ('error' in r) return json({ error: r.error, ...(typeof r.why === 'string' ? { why: r.why } : {}), ...(r.error === 'seq' && Number.isSafeInteger(r.seq) ? { seq: r.seq } : {}) }, PROF_STATUS[r.error] ?? 400, origin);
    // A Renown level rise returns a signed order, so the rooms the character is in update the level by its name.
    if (r.renown?.rose) {
      const key = await signingKey(env, subtle);
      return json({ ...r, order: key ? await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS }) : null }, 200, origin);
    }
    return json(r, 200, origin);
  }

  if (path.startsWith('/v1/hunt/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/hunt/state': () => huntState(ctx, who.player, env, body),
      '/v1/hunt/clear': () => huntClear(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (progressRoute) await progressSpent(ctx, who.player.id, path, r);
    return 'error' in r ? no(r.error, HUNT_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  if (path.startsWith('/v1/sea/bounty/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const sctx = { ...ctx, bucket: env.SAVES };
    const act = {
      '/v1/sea/bounty/board': async () => seaBountyBoard(sctx, who.player, body),
      '/v1/sea/bounty/post': async () => seaBountyPost(sctx, who.player, body),
      '/v1/sea/bounty/collect': async () => seaBountyCollect(sctx, who.player, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    if ('error' in r) return json({ error: r.error }, REALM_STATUS[r.error] ?? JUDGE_STATUS[r.error] ?? 400, origin);
    return json(r, 200, origin);
  }

  if (path.startsWith('/v1/crew/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = { '/v1/crew/hall': crewHall, '/v1/crew/sign': crewSign, '/v1/crew/release': crewRelease }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act(ctx, who.player, body);
    if ('error' in r) return json({ error: r.error }, CREW_STATUS[r.error] ?? 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/sea/season/board') {
    if (request.method !== 'POST') return no('method', 405, origin);
    return json(await seaSeasonBoard(ctx, who.player, body), 200, origin);
  }

  if (path.startsWith('/v1/cards/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const cctx = { ...ctx, bucket: env.SAVES };
    const act = {
      '/v1/cards/stake': async () => stakeCards(cctx, who.player, env, body, await signingKey(env, subtle)),
      '/v1/cards/cashout': async () => cashoutCards(cctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/cards/deck': async () => deckOrderOf(cctx, who.player, env, body, await signingKey(env, subtle)),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    if ('error' in r) return json({ error: r.error, ...(r.why ? { why: r.why } : {}), ...(typeof r.card === 'string' ? { card: r.card } : {}) }, CARDS_STATUS[r.error] ?? JUDGE_STATUS[r.error] ?? 400, origin);
    return json(r, 200, origin);
  }

  if (path.startsWith('/v1/market/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const mctx = { ...ctx, bucket: env.SAVES };
    const act = {
      '/v1/market/read': () => marketRead(ctx, who.player, env, body),
      '/v1/market/list': () => marketList(mctx, who.player, env, body),
      '/v1/market/buy': () => marketBuy(mctx, who.player, env, body),
      '/v1/market/cancel': () => marketCancel(ctx, who.player, env, body),
      '/v1/market/order': () => marketOrder(ctx, who.player, env, body),
      '/v1/market/fill': () => marketFill(ctx, who.player, env, body),
      '/v1/market/unorder': () => marketUnorder(ctx, who.player, env, body),
      '/v1/market/collect': () => marketCollect(mctx, who.player, env, body),
      '/v1/market/report': () => marketReport(ctx, who.player, env, body),
      '/v1/market/remove': () => marketRemove(ctx, who.player, env, body),
      '/v1/market/auction': () => marketAuction(mctx, who.player, env, body),
      '/v1/market/bid': () => marketBid(ctx, who.player, env, body),
      '/v1/market/gold': () => marketGoldCollect(mctx, who.player, env, body),
      '/v1/market/vendor': () => marketVendor(ctx, who.player, env, body),
      '/v1/market/vendors': () => marketVendors(ctx, who.player, env, body),
      '/v1/market/myvendors': () => marketMyVendors(ctx, who.player, env, body),
      '/v1/market/road': () => marketRoad(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    return 'error' in r ? no(r.error, MARKET_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }
  return NEXT;
}
