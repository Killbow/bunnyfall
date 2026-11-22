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
  // ═══ SEAT1a: THE SEATS ════════════════════════════════════════════
  //
  // The witnessed registry (townSeats.js): the seats the witnesses confirmed, read by anyone the switch lets in; a
  // seat reported by the client standing in its town; a developer's strike. SEAT1b (seatInfluence.js): a guild's
  // pledge, a seat's standings, the Watch's receipts, Tribute.
  if (path.startsWith('/v1/seats/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    // SEAT1c (Seats-Arc 5.2): "the account service settles week N the first time anything asks about any seat after
    // N's boundary" - every Turning due, before the ask is answered (one read when none is)
    // SEAT-LEASE: one settler at a time (seatTurning.js settleDueOnce) - while another holds the Turning a read answers
    // the state as it stands, and an act is told to ask again in a moment, never made on a week half turned
    if (seatsOpenFor(who.player, env) && (await settleDueOnce(ctx.db, nowS, seasonZeroOf(env.SEASON_ZERO_WEEK))).pending && !SEAT_READS.has(path)) return no('seats-settling', 503, origin);   // SEASON1: a Season's end at its Turning
    const act = {
      '/v1/seats/list': async () => {
        const r = await listSeats(ctx, who.player, env);
        return 'error' in r ? r : { ...r, ...(await seatsBoard(ctx.db, r.seats, nowS)), zero: seasonZeroOf(env.SEASON_ZERO_WEEK) };   // SEAT-BATCH: the holders, battles, Edicts, works and red lines in one batch   // SEAT1c: each seat's holder and battle   // CROWN2: the server's red lines   // SEASON1 part two: the week Season 0 began, for the client's Tides
      },
      '/v1/seats/relinquish': () => relinquishSeat(ctx, who.player, env, body),   // SEAT1c: a Charter given up at its board
      '/v1/seats/witness': () => witnessSeat(ctx, who.player, env, body),
      '/v1/seats/strike': () => strikeSeat(ctx, who.player, env, body),
      // SEAT1b: influence - a guild's pledge, the standings at a seat, the Watch's ticks claimed, Tribute paid
      '/v1/seats/pledge': () => pledgeSeat(ctx, who.player, env, body),
      '/v1/seats/standings': () => readStandings(ctx, who.player, env, body),
      '/v1/seats/records': () => readRecords(ctx, who.player, env, body),   // SEASON1 part three (9.2): the Hall of Records
      '/v1/seats/watch': async () => claimWatch(ctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/seats/tribute': () => payTribute(ctx, who.player, env, body),
      // SEAT1d: the holder's levers at its board - the Tithe, the coming week's Edict; a Bounty's camp paid
      '/v1/seats/tithe': () => setTithe(ctx, who.player, env, body),
      '/v1/seats/edict': () => proclaimEdict(ctx, who.player, env, body),
      '/v1/seats/bounty': () => claimBounty(ctx, who.player, env, body),
      '/v1/seats/orc-camp': () => claimOrcCamp(ctx, who.player, env, body),   // SEASON1 part two (9.3): an Orc Raid's camp cleared
      // SEAT2a: the battles' week - the holder's window; a side signed, unsigned; a Sellsword hired, withdrawn
      '/v1/seats/window': () => setWindow(ctx, who.player, env, body),
      '/v1/seats/siege/sign': () => signBattle(ctx, who.player, env, body),
      '/v1/seats/siege/unsign': () => unsignBattle(ctx, who.player, env, body),
      '/v1/seats/siege/hire': () => hireSellsword(ctx, who.player, env, body),
      '/v1/seats/siege/withdraw': () => withdrawHire(ctx, who.player, env, body),
      // SEAT2a part three: a battle's pass (the field the fighter's game derived); a fighter's receipt claimed
      '/v1/seats/siege/pass': async () => siegePass(ctx, who.player, env, body, await signingKey(env, subtle)),
      '/v1/seats/siege/claim': async () => claimSiege(ctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/seats/siege/void': () => voidSiege(ctx, who.player, env, body),   // VOID (Seats-Arc 18): a moderator's `/siege void <key>`
      // CROWN1 part two: a Royal Tourney's pass (the ring the contender's game derived); a bout's receipt claimed
      '/v1/seats/royal/pass': async () => royalPass(ctx, who.player, env, body, await signingKey(env, subtle)),
      '/v1/seats/royal/claim': async () => claimRoyal(ctx, who.player, env, body, await gatePublicKey(env, subtle)),
      // CROWN2: fealty offered (as vassal or liege), accepted, broken; a Pact offered (or accepted) and broken
      '/v1/seats/fealty': () => offerFealty(ctx, who.player, env, body),
      '/v1/seats/fealty/accept': () => acceptFealty(ctx, who.player, env, body),
      '/v1/seats/fealty/break': () => breakFealty(ctx, who.player, env, body),
      '/v1/seats/pact': () => offerPact(ctx, who.player, env, body),
      '/v1/seats/pact/break': () => breakPact(ctx, who.player, env, body),
      // SEAT2b (7.5): the works read, a project begun
      '/v1/seats/forts': () => readForts(ctx, who.player, env, body),
      '/v1/seats/fort/fund': () => fundFort(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (progressRoute) await progressSpent(ctx, who.player.id, path, r);   // INT17: a camp, the Watch's ticks
    return 'error' in r ? no(r.error, SEAT_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  // ═══ PROF1: THE PROFESSIONS ══════════════════════════════════════
  //
  // A registered account's character's alone, and the switch's (professions.js asks both first). A delivery that
  // raised the character's Renown level carries a signed order, as a Renown report's answer does (RENOWN1), so the
  // level beside its name moves in the rooms it is in now.
  if (path.startsWith('/v1/prof/') || path.startsWith('/v1/prov/') || path.startsWith('/v1/stores/') || path.startsWith('/v1/writs/')) {   // BUNNYFALL: /v1/prov/ (Provisioning) is not /v1/prof/ - its handlers below were never reached (405)
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/prof/state': () => profState(ctx, who.player, env, body),
      '/v1/prof/pixels': () => profPixels(ctx, who.player, env, body),
      // PROF2b: a Motherlode is struck through the harvest's own route - its node names it (motherlodes.js)
      '/v1/prof/harvest': () => (isMotherlodeNode(body?.node) ? strikeMotherlode(ctx, who.player, env, body) : harvestNode(ctx, who.player, env, body)),
      '/v1/prof/motherlodes': () => motherlodesRead(ctx, who.player, env, body),   // PROF2b: today's three
      '/v1/prof/spec': () => chooseSpec(ctx, who.player, env, body),
      '/v1/prof/smelt': () => smeltAtForge(ctx, who.player, env, body),   // PROF2
      '/v1/prof/craft': () => craftAtAnvil(ctx, who.player, env, body),   // PROF3: the anvil; PROF4: the workbench
      '/v1/prof/make': () => makeAtBench(ctx, who.player, env, body),   // BUNNYFALL CRAFTING REWORK: a craft by form and picks
      '/v1/prof/focus': () => chooseFocus(ctx, who.player, env, body),   // BUNNYFALL CRAFTING REWORK: the Focus
      '/v1/prof/craftwork': () => enterCraftwork(ctx, who.player, env, body),   // BUNNYFALL CRAFTWORK
      '/v1/prov/state': () => provState(ctx, who.player, env, body),   // BUNNYFALL PROVISIONING
      '/v1/prov/make': () => provMake(ctx, who.player, env, body),
      '/v1/prov/prepare': () => provPrepare(ctx, who.player, env, body),
      '/v1/prof/brew': () => brewAtStation(ctx, who.player, env, body),   // PROF12: the alchemy station's brew
      '/v1/prof/disenchant': () => disenchantPiece({ ...ctx, bucket: env.SAVES }, who.player, env, body),   // PROF12: an enchanting station's disenchant; AUDIT PROF-541 B2: a realm character's record, in R2
      '/v1/prof/stock': () => buyStock(ctx, who.player, env, body),   // PROF3: the smith's stock; PROF4: the furnisher's
      '/v1/prof/salvage': () => salvagePieces({ ...ctx, bucket: env.SAVES }, who.player, env, body),   // BUNNYFALL: found gear into materials; a realm character's record is in R2 (without it every realm salvage was 'no-storage')
      '/v1/prof/upgrade': () => upgradeMaterial(ctx, who.player, env, body),   // BUNNYFALL: a found piece one metal up
      '/v1/prof/temper': () => temperPiece(ctx, who.player, env, body),   // CRAFT4: a piece a quality step better
      '/v1/prof/reforge': () => reforgeWithEssence(ctx, who.player, env, body),   // CRAFT4: a line rolled again for Arcane Essence
      '/v1/prof/master': () => masterWork(ctx, who.player, env, body),   // MASTER-ART: a Master's work, its lines chosen
      '/v1/stores/withdraw': () => withdrawStores(ctx, who.player, env, body),
      '/v1/stores/deposit': () => depositStores(ctx, who.player, env, body),   // BAG1: what is carried, into the Stores
      // PROF6: the Court's writs, and beside them this board's guild writs and commissions (writs.js writBoard)
      '/v1/writs/list': async () => {
        const r = await listWrits(ctx, who.player, env, body);
        return 'error' in r ? r : { ...r, ...(await writBoard(ctx, who.player, env, body)), ...(await contractBoard(ctx, who.player, env, body)), ...(await craftWritBoard(ctx, who.player, env, body)) };   // SILVER-WAYS: and its guild contracts; CRAFT-WRITS: and the character's crafting writs
      },
      '/v1/writs/deliver': () => deliverWrit(ctx, who.player, env, body),
      '/v1/writs/craft': () => deliverCraftWrit({ ...ctx, bucket: env.SAVES }, who.player, env, body),   // CRAFT-WRITS: the goods out of the realm record, in R2
      '/v1/writs/post': () => postGuildWrit(ctx, who.player, env, body),   // PROF6: a guild writ
      '/v1/writs/supply': () => supplyGuildWrit(ctx, who.player, env, body),
      '/v1/writs/withdraw': () => withdrawGuildWrit(ctx, who.player, env, body),
      '/v1/writs/budget': () => setWritBudget(ctx, who.player, env, body),
      '/v1/writs/contract': () => postContract(ctx, who.player, env, body),   // SILVER-WAYS: a guild contract
      '/v1/writs/contract-withdraw': () => withdrawContract(ctx, who.player, env, body),
      '/v1/writs/commission': () => postCommission(ctx, who.player, env, body),   // PROF6: a commission
      '/v1/writs/fulfil': () => fulfilCommission({ ...ctx, bucket: env.SAVES }, who.player, env, body),   // INT19: the piece out of the crafter's realm record, in R2
      '/v1/writs/cancel': () => cancelCommission(ctx, who.player, env, body),
      '/v1/writs/decline': () => declineCommission(ctx, who.player, env, body),
      '/v1/stores/guild': () => guildStores(ctx, who.player, env, body),   // PROF6: the guild Stores
      '/v1/stores/guild-deposit': () => depositGuildStores(ctx, who.player, env, body),
      '/v1/stores/guild-withdraw': () => withdrawGuildStores(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (progressRoute) await progressSpent(ctx, who.player.id, path, r);   // INT17: a profession's XP, a harvest's silver, a writ's Renown
    // AUDIT PROF-541 B2: a realm record's sequence (a checkpoint's own word) and a refusal's `why` ride with it
    if ('error' in r) return json({ error: r.error, ...(typeof r.why === 'string' ? { why: r.why } : {}), ...(r.error === 'seq' && Number.isSafeInteger(r.seq) ? { seq: r.seq } : {}) }, PROF_STATUS[r.error] ?? 400, origin);
    if (r.renown?.rose) {
      const key = await signingKey(env, subtle);
      return json({ ...r, order: key ? await mintRenownOrder({ s: who.player.id, lv: r.renown.level }, key, { subtle, nowS }) : null }, 200, origin);
    }
    return json(r, 200, origin);
  }

  // ═══ HUNTERS-MARK: THE HUNT'S LEDGER ═══════════════════════════════
  //
  // bible/06-Systems/Bounty-Boards.md section 12: a character's clears read, and a paid bounty reported - bounded, not
  // witnessed (hunts.js). The report is a progression claim, asked of the seat at the door (progress.js PROGRESS_ROUTES).
  if (path.startsWith('/v1/hunt/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/hunt/state': () => huntState(ctx, who.player, env, body),
      '/v1/hunt/clear': () => huntClear(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (progressRoute) await progressSpent(ctx, who.player.id, path, r);   // INT17: a clear recorded spends the bounties' stream
    return 'error' in r ? no(r.error, HUNT_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  // ═══ SEA-BOUNTY: A FREEPORT'S BOUNTY BOARD ══════════════════════════
  //
  // bible/03-World/Eltheric-Ocean.md SEA-BOUNTY: the wanted captains of the open sea and the gold on their heads; a post
  // off the poster's record, a collect into the killer's - each act its own batch, the gold and the row together
  // (seaBounty.js). The kills are written with their falls (wild.js wildFall).
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
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);   // the record moved under the act, as a checkpoint's
    if ('error' in r) return json({ error: r.error }, REALM_STATUS[r.error] ?? JUDGE_STATUS[r.error] ?? 400, origin);
    return json(r, 200, origin);
  }

  // CREW-SIGNED (2026-10-27, bible/03-World/Shipyards.md CREW-SIGNED): a crew hall's recruit held by the first account
  // to sign him for his day, let go when he is paid off (crewSigns.js) - no gold moves here
  if (path.startsWith('/v1/crew/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = { '/v1/crew/hall': crewHall, '/v1/crew/sign': crewSign, '/v1/crew/release': crewRelease }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act(ctx, who.player, body);
    if ('error' in r) return json({ error: r.error }, CREW_STATUS[r.error] ?? 400, origin);
    return json(r, 200, origin);
  }

  // SEA-SEASON (2026-10-22, bible/03-World/Eltheric-Ocean.md SEA-SEASON): the season's deepest voyages and legends
  // ended - read here; the figures come with each clean checkpoint (seaSeason.js, realm.js checkpointRealm)
  if (path === '/v1/sea/season/board') {
    if (request.method !== 'POST') return no('method', 405, origin);
    return json(await seaSeasonBoard(ctx, who.player, body), 200, origin);
  }

  // ═══ CARDS6: A CARD TABLE'S STAKES ══════════════════════════════════
  //
  // Tavern-Cards section 23: a realm character's buy-in held here against the service's order, and the relay's cash-out
  // receipt paid back into the record - each act its own batch, the gold and the row together (cards.js).
  if (path.startsWith('/v1/cards/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const cctx = { ...ctx, bucket: env.SAVES };
    const act = {
      '/v1/cards/stake': async () => stakeCards(cctx, who.player, env, body, await signingKey(env, subtle)),
      '/v1/cards/cashout': async () => cashoutCards(cctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/cards/deck': async () => deckOrderOf(cctx, who.player, env, body, await signingKey(env, subtle)),   // CARDS10: a ranked seat's deck, vouched for
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);   // the record moved under the act, as a checkpoint's
    // AUDIT CARDS-4 A4: and why a receipt was refused - the device keeps one refused on its signature or clock
    // AUDIT CARDS-6 D7: and the card a short deck lacks (iliac.js deckOrderOf) - said nowhere, the vouch's "(card)" never
    // could be; D8: the service without its key is the service's 503 (the token's own no-signing-key), and a guest's
    // ranked seat the account's 403 (the arena's ladder-needs-account) - neither a bad request
    if ('error' in r) return json({ error: r.error, ...(r.why ? { why: r.why } : {}), ...(typeof r.card === 'string' ? { card: r.card } : {}) }, CARDS_STATUS[r.error] ?? JUDGE_STATUS[r.error] ?? 400, origin);   // INT3: a held stake's own
    return json(r, 200, origin);
  }

  // ═══ PROF5: THE MARKET ══════════════════════════════════════════
  //
  // A registered account's, and the board's, the professions' and the Marks' switches together (market.js asks
  // each first); a moderator's removal. Every act carries its request id, and one asked twice is one.
  if (path.startsWith('/v1/market/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const mctx = { ...ctx, bucket: env.SAVES };   // GOLD-MARKET: a gold buy or collect moves a realm record, in R2
    const act = {
      '/v1/market/read': () => marketRead(ctx, who.player, env, body),
      '/v1/market/list': () => marketList(mctx, who.player, env, body),   // MARKET-ANY: a pack's piece moves its seller's record
      '/v1/market/buy': () => marketBuy(mctx, who.player, env, body),
      '/v1/market/cancel': () => marketCancel(ctx, who.player, env, body),
      '/v1/market/order': () => marketOrder(ctx, who.player, env, body),
      '/v1/market/fill': () => marketFill(ctx, who.player, env, body),
      '/v1/market/unorder': () => marketUnorder(ctx, who.player, env, body),
      '/v1/market/collect': () => marketCollect(mctx, who.player, env, body),   // MARKET-ANY: ...and its collector's
      '/v1/market/report': () => marketReport(ctx, who.player, env, body),
      '/v1/market/remove': () => marketRemove(ctx, who.player, env, body),
      '/v1/market/auction': () => marketAuction(mctx, who.player, env, body),   // PROF5b; INT19: the Masterwork out of its seller's record
      '/v1/market/bid': () => marketBid(ctx, who.player, env, body),
      '/v1/market/gold': () => marketGoldCollect(mctx, who.player, env, body),   // GOLD-MARKET
      '/v1/market/vendor': () => marketVendor(ctx, who.player, env, body),   // HOME-VENDOR: a home's trader's stock
      '/v1/market/vendors': () => marketVendors(ctx, who.player, env, body),   // HOME-VENDOR: the region's traders
      '/v1/market/myvendors': () => marketMyVendors(ctx, who.player, env, body),   // HOME-VENDOR: the Vendor page's
      '/v1/market/road': () => marketRoad(ctx, who.player, env, body),   // RPT1026-MARKET ARRIVE: the road alone, for the game to collect what arrived
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);   // GOLD-MARKET: the service's own, as a checkpoint's
    return 'error' in r ? no(r.error, MARKET_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }
  return NEXT;
}
