// Account service routes: towns, homes, guilds, chapters, camps, boards, festivals, and marks.
import { accountKind } from '../accounts.js';
import { gatePublicKey } from '../signing.js';
import { chaptersOpenFor, readRoll, claimRoll } from '../npcRoll.js';
import { witnessHall, listHalls, strikeHall } from '../npcHalls.js';
import { witnessTown, claimTownWatch, townsEcon, strikeTown, auditTowns, townsOpen } from '../townEcon.js';
import {
  chapterSheet, chapterSeatsOf, setChapterFocus, chapterChronicle, backChapter, bidPatron
} from '../npcChapters.js';
import { voteHome } from '../homeVotes.js';
import { signGuestbook, readGuestbook } from '../guestbook.js';
import { hostFestival, listFestivals } from '../playerFestival.js';
import { tavernFavorBuy } from '../tavernFavor.js';
import { tavernServiceAct } from '../tavernService.js';
import { bardServiceAct } from '../bardServices.js';
import {
  claimHome, releaseHome, setHomeEntry, homesInTown, homesInTowns, homesOf, setHomeLook, homeLayoutsKept,
  arenaMoveHome, arenaMovesOf, arenaMoveSeen, holdDeed, inheritHome
} from '../homes.js';
import { homeTransfer } from '../homeTransfer.js';
import { roomsOf, offerRoom, withdrawRoom, rentRoom, collectRent } from '../rent.js';
import {
  foundGuild, guildOf, invitesOf, inviteToGuild, answerInvite, leaveGuild, removeFromGuild, rankGuildMember,
  renameGuildRanks, depositToGuild, withdrawFromGuild, handOverGuild, disbandGuild, renameGuild
} from '../guilds.js';
import { vaultOf, vaultPut, vaultTake, vaultGrant } from '../guildVault.js';
import { buyHall, sellHall, setHallEntry, setHeraldry } from '../halls.js';
import { readGuildBoard, pinGuildNote, takeDownGuildNote } from '../guildBoard.js';
import { seatsOpenFor } from '../townSeats.js';
import { decorOf, placeDecor, moveDecor, removeDecor, hideDecorBase, forgetYards, settleYards } from '../decor.js';
import { commitDecorBatch } from '../decorBatch.js';
import { campRoute } from '../camps.js';
import { decorUse } from '../decorAccess.js';
import { decoratorsRoute } from '../decorators.js';
import { saveDraft, acceptDraft } from '../decoratorDrafts.js';
import { caravanRoute } from '../caravanTemplates.js';
import { marksOf, exchangeMarks, payGearUpgrade, depositGuildMarks, withdrawGuildMarks, marksReport, findMarks } from '../marks.js';
import { readBoard, pinNote, takeDownNote, reportNote, moderateNote, postNotice, removeNotice } from '../board.js';
import { progressSpent } from '../progress.js';
import { DECORATOR_STATUS, RENT_STATUS, ROLL_STATUS, GUILD_STATUS, MARKS_STATUS, BOARD_STATUS, TOWN_STATUS } from '../routeStatus.js';
import { json, no, guildOrdersOf, homeOrdersOf } from '../routeHelpers.js';
import { NEXT } from './next.js';

export async function townRoutes({ request, env, subtle, nowS, origin, path, ctx, body, who, progressRoute }) {
  // ═══ CHAP1: THE ROLL ═════════════════════════════════════════
  //
  // A realm character's standing with Daggerfall's own guilds, kept here
  // (npcRoll.js): read - and seeded, the first time - as the character
  // comes online, then claimed as it moves. The account is the
  // session's, the character must be its own and standing, and the
  // lease the playing tab's. Behind CHAPTERS_OPEN; shut, the save keeps
  // the standing as it did before CHAP1.
  if (path === '/v1/chapters/roll' || path === '/v1/chapters/claim' || path === '/v1/chapters/witness'
    || path === '/v1/chapters/halls' || path === '/v1/chapters/strike' || path === '/v1/chapters/list'
    || path === '/v1/chapters/focus' || path === '/v1/chapters/history' || path === '/v1/chapters/back' || path === '/v1/chapters/patron') {
    if (request.method !== 'POST') return no('method', 405, origin);
    if (!chaptersOpenFor(who.player, env)) return no('chapters-closed', 403, origin);
    // CHAP2a: and a town's guild halls witnessed, as a seat is (npcHalls.js); AUDIT CHAP2 E1: a region's audit list
    // and a false town struck, a developer's
    // CHAP3b: and the chapter sheet - every chapter's Strength and band, after the Turnings due (npcChapters.js)
    // CHAP4d: and a chapter's Master's Focus, and a region's Chronicle of its chapters' seats
    const r = path === '/v1/chapters/list' ? await chapterSheet(ctx, who.player, env)
      : path === '/v1/chapters/focus' ? await setChapterFocus(ctx, who.player, env, body)
      : path === '/v1/chapters/history' ? await chapterChronicle(ctx, who.player, env, body)
      : path === '/v1/chapters/back' ? await backChapter(ctx, who.player, env, body)   // CHAP6b: a member's backing in its chapter's Season
      : path === '/v1/chapters/patron' ? await bidPatron(ctx, who.player, env, body)   // CHAP7a: a guild's bid for a chapter's patronage
      : path === '/v1/chapters/witness' ? await witnessHall(ctx, who.player, env, body)
      : path === '/v1/chapters/halls' ? await listHalls(ctx, who.player, env, body)
        : path === '/v1/chapters/strike' ? await strikeHall(ctx, who.player, env, body)
          : path === '/v1/chapters/roll' ? await readRoll(ctx, who.player, body) : await claimRoll(ctx, who.player, body);
    if ('error' in r) return no(r.error, /** @type {Record<string, number>} */ (ROLL_STATUS)[r.error] ?? 400, origin);
    // CHAP4a: the Roll's answer carries the character's seats - ranks 8 and 9 are a seat's, never the book's
    if ((path === '/v1/chapters/roll' || path === '/v1/chapters/claim') && /** @type {any} */ (r).roll) /** @type {any} */ (r).roll.seats = await chapterSeatsOf(ctx.db, body?.character);
    return json(r, 200, origin);
  }

  // ═══ HOME1: THE ONLINE HOMES ═════════════════════════════════
  //
  // A town's homes are anyone's to READ - a guest's session too, since
  // every door says whose a home is. Owning one is an account's: the
  // same wall as the letters' and the saves', with its own word (a
  // guest is a device, and a home held by one a cleared browser loses
  // is a building gone from the world). homes.js holds the bounds.
  if (path === '/v1/tavern/favor') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = await tavernFavorBuy({ ...ctx, bucket: env.SAVES }, who.player, body);
    if (r.error === 'seq') return json(r, 409, origin);
    return r.error ? no(r.error, 400, origin) : json(r, 200, origin);
  }
  if (path === '/v1/tavern/service') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = await tavernServiceAct({ ...ctx, bucket: env.SAVES }, who.player.id, body);
    if (r.error === 'seq') return json(r, 409, origin);
    return r.error ? no(r.error, 400, origin) : json(r, 200, origin);
  }
  if (path === '/v1/bards/service') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = await bardServiceAct({ ...ctx, bucket: env.SAVES }, who.player, body);
    if (r.error === 'seq') return json(r, 409, origin);
    return r.error ? no(r.error, r.error === 'bard-rate' ? 429 : 400, origin) : json(r, 200, origin);
  }
  if (path === '/v1/festivals/host' || path === '/v1/festivals/list') {   // PLAYER-FESTIVALS: hosted at an innkeeper, listed for the map and the chat
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path.endsWith('/host') ? await hostFestival(ctx, who.player, body) : await listFestivals(ctx, who.player);
    if (!('error' in r)) return json(r, 200, origin);
    return no(r.error, r.error === 'homes-need-account' ? 403 : r.error === 'bad-festival' ? 400 : 409, origin);
  }
  if (path.startsWith('/v1/homes/') || path.startsWith('/v1/camps/')) {   // BUNNYFALL CAMPS: /v1/camps/ lives in this block (its handlers below were never reached: 405)
    if (request.method !== 'POST') return no('method', 405, origin);
    if (path === '/v1/homes/town') {
      const r = await homesInTown(ctx, who.player, body, { seats: seatsOpenFor(who.player, env) });   // SEAT1d: Open Gates
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/towns') {
      const r = await homesInTowns(ctx, who.player, body, { seats: seatsOpenFor(who.player, env) });
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/mine') return json(await homesOf(ctx, who.player), 200, origin);
    if ((path === '/v1/homes/decor' || path.startsWith('/v1/homes/decor/')) && body?.seat === true && !seatsOpenFor(who.player, env)) return no('seats-closed', 403, origin);   // SEAT-HALL: a palace's Charter Room while the seats are open
    if (path === '/v1/homes/layouts') return json(await homeLayoutsKept(ctx), 200, origin);   // WD3: every town holding a home, and the layout it keeps; STORM-SHED 2: read again only once a town's homes moved
    if (path === '/v1/homes/decor') {
      const r = await decorOf(ctx, who.player, body);
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/camps/near' || path === '/v1/camps/mine') {
      const r = await campRoute(ctx, who.player, path, body);
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/rooms') {   // HOME-RENT: a home's rooms, read by anyone at its door
      const r = await roomsOf(ctx, who.player, body);
      return 'error' in r ? no(r.error, r.error === 'no-home' ? 404 : 400, origin) : json(r, 200, origin);
    }
    if (accountKind(who.player) !== 'linked') return no('homes-need-account', 403, origin);
    if (path === '/v1/homes/decorators' || path.startsWith('/v1/homes/caravan/')) {
      const r = path === '/v1/homes/decorators' ? await decoratorsRoute(ctx, who.player, body) : await caravanRoute(ctx, who.player, path, body);
      return 'error' in r ? no(r.error, DECORATOR_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
    }
    if (path.startsWith('/v1/camps/')) {   // BUNNYFALL CAMPS: pitched, struck, renamed and furnished - a linked account's
      const r = await campRoute(ctx, who.player, path, body);
      return 'error' in r ? no(r.error, r.error === 'no-camp' || r.error === 'no-decor' ? 404 : r.error === 'rate-limited' ? 429 : 400, origin) : json(r, 200, origin);
    }
    // REALM P2.2b: a realm character's record is in R2, and moves with the act; a sequence refused says the service's own
    const hctx = { ...ctx, bucket: env.SAVES };
    const realmNo = (r) => (r.error === 'seq' ? json({ error: 'seq', seq: r.seq }, 409, origin) : r.error === 'lease' || r.error === 'realm-gold' ? no(r.error, 409, origin) : null);
    if (path.startsWith('/v1/homes/decor/')) {
      const r = path === '/v1/homes/decor/place' ? await placeDecor(hctx, who.player, body)
        : path === '/v1/homes/decor/move' ? await moveDecor(hctx, who.player, body)
          : path === '/v1/homes/decor/hidden' ? await hideDecorBase(hctx, who.player, body)
            : path === '/v1/homes/decor/batch' ? await commitDecorBatch(hctx, who.player, body)
              : path === '/v1/homes/decor/draft' ? await saveDraft(hctx, who.player, body)
              : path === '/v1/homes/decor/accept' ? await acceptDraft(hctx, who.player, body)
              : path === '/v1/homes/decor/use' ? await decorUse(hctx, who.player, body)
                : await removeDecor(hctx, who.player, body);
      if (path !== '/v1/homes/decor/use' && path !== '/v1/homes/decor/draft') {
        forgetYards(body?.mapId);
        await settleYards(ctx.db, body?.mapId).catch((e) => console.warn('[yards] the town not built', e?.message ?? e));
      }
      if (!('error' in r)) return json(r, 200, origin);
      const said = realmNo(r);
      if (said) return said;
      const status = (path === '/v1/homes/decor/draft' || path === '/v1/homes/decor/accept' ? DECORATOR_STATUS[r.error] : null) ?? (r.error === 'decor-cap' || r.error === 'yard-cap' || r.error === 'decor-taken' || r.error === 'guild-treasury-full' || r.error === 'vendor-stocked' || r.error === 'decor-rev' || r.error === 'decor-holds' || r.error === 'decor-shut' || r.error === 'decor-held' || r.error === 'decor-busy' || r.error === 'decor-lapsed' ? 409
        : r.error === 'decor-rate' ? 429
          : r.error === 'no-home' || r.error === 'no-decor' ? 404
            : r.error === 'no-storage' || r.error === 'server' ? 503 : 400);
      return no(r.error, status, origin);
    }
    if (path.startsWith('/v1/homes/rooms/')) {
      // HOME-RENT: a room offered or withdrawn (the owner's), rented (another's, their record paying), its rent collected
      const r = path === '/v1/homes/rooms/offer' ? await offerRoom(hctx, who.player, body)
        : path === '/v1/homes/rooms/withdraw' ? await withdrawRoom(hctx, who.player, body)
          : path === '/v1/homes/rooms/rent' ? await rentRoom(hctx, who.player, body)
            : await collectRent(hctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      const said = realmNo(r);
      if (said) return said;
      if (r.error === 'rent-price') return json({ error: 'rent-price', price: r.price }, 409, origin);   // the price that stands, for the door to show
      const status = RENT_STATUS[r.error] ?? 400;
      return no(r.error, status, origin);
    }
    if (path === '/v1/homes/guestbook/sign' || path === '/v1/homes/guestbook/read') {   // GUESTBOOK: signed by a visitor, read by its insiders
      const r = path.endsWith('/sign') ? await signGuestbook(ctx, who.player, body) : await readGuestbook(ctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      return no(r.error, r.error === 'no-home' ? 404 : r.error === 'guestbook-soon' ? 429 : r.error === 'guestbook-not-yours' || r.error === 'homes-need-account' ? 403 : 400, origin);
    }
    if (path === '/v1/homes/vote') {   // HOME-VOTE: a registered account's word on a home it is no insider of
      const r = await voteHome(ctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      return no(r.error, r.error === 'no-home' ? 404 : r.error === 'vote-rate' ? 429 : r.error === 'vote-own' || r.error === 'vote-young' ? 403 : 400, origin);
    }
    if (path === '/v1/homes/look') {   // HOME-LOOK: how a home looks outside - its owner's character's (GUILD-YARD: a hall's, its keepers')
      const r = await setHomeLook(hctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      return no(r.error, r.error === 'no-home' ? 404 : r.error === 'decor-rate' ? 429 : 400, origin);
    }
    if (path === '/v1/homes/arena-move') {
      // ARENA4b: A HOME THE ARENA DISPLACED, MOVED to the house its owner's client picked (homes.js arenaMoveHome) - the
      // pieces' refund onto the owner's record in the move's own batch, a realm act's
      const r = await arenaMoveHome(hctx, who.player, body);
      if (!('error' in r)) return json(await homeOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);   // QUEST-HOME
      const said = realmNo(r);
      if (said) return said;
      const status = r.error === 'home-taken' || r.error === 'home-changed' || r.error === 'guild-treasury-full' ? 409 : r.error === 'no-home' ? 404 : 400;
      return no(r.error, status, origin);
    }
    if (path === '/v1/homes/arena-moves') {   // ARENA4b: the moves this character has not read - its letter, its old scene emptied
      const r = await arenaMovesOf(hctx, who.player, body);
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/arena-seen') {   // ARENA4b: a move's letter read
      const r = await arenaMoveSeen(hctx, who.player, body);
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/deed') {
      // FIELD BUGS 2026-10-04d KNIGHT-HOUSE: A DEED THE REALM GAVE, HELD - the building a realm character's record holds
      // Daggerfall's deed to (a Knightly Order's house) kept from anyone else's claim (homes.js holdDeed)
      const r = await holdDeed(hctx, who.player, body);
      if (!('error' in r)) return json(await homeOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);   // QUEST-HOME
      if (r.error === 'home-layout') return json({ error: 'home-layout', layout: r.layout ?? null }, 409, origin);   // as /v1/homes/claim answers it
      const status = r.error === 'home-taken' || r.error === 'home-arena' ? 409 : r.error === 'home-rate' ? 429 : r.error === 'no-deed' || r.error === 'no-realm-character' ? 404 : 400;
      return no(r.error, status, origin);
    }
    if (path === '/v1/homes/inherit') {
      // PERMADEATH-HOUSES: a fallen member's home taken up by a living realm character of their line (homes.js
      // inheritHome) - the tombstone gate above has already refused a `character` that is dead
      const r = await inheritHome(hctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      return no(r.error, r.error === 'not-heir' ? 403 : r.error === 'no-home' ? 404 : r.error === 'homes-need-account' ? 403 : 400, origin);
    }
    if (path === '/v1/homes/claim') {
      const r = await claimHome(hctx, who.player, body);
      if (!('error' in r)) return json(await homeOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);   // QUEST-HOME: a home now, said to every page online
      const said = realmNo(r);
      if (said) return said;
      if (r.error === 'home-layout') return json({ error: 'home-layout', layout: r.layout ?? null }, 409, origin);   // WD3 (AUDIT WD3 O1): the layout the town keeps, for the client to hear
      const status = r.error === 'home-taken' || r.error === 'home-cap' || r.error === 'home-arena' ? 409 : r.error === 'home-rate' ? 429 : r.error === 'home-update' ? 426 : 400;   // AUDIT WD3 B2: a build from before the town mods   // WD3: a town kept in another layout   // ARENA4b: the arena stands there
      return no(r.error, status, origin);
    }
    if (path === '/v1/homes/transfer') {
      const r = await homeTransfer(hctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      const said = realmNo(r);
      if (said) return said;
      const conflict = r.error === 'home-decorators' || r.error === 'home-cap' || r.error === 'home-tenants' || r.error === 'home-vendor-stocked' || r.error === 'home-holds' || r.error === 'offer-open' || r.error === 'offer-closed' || r.error === 'offer-stale' || r.error === 'home-deed';
      return no(r.error, r.error === 'home-rate' ? 429 : conflict ? 409 : r.error === 'no-home' ? 404 : 400, origin);
    }
    const r = path === '/v1/homes/release' ? await releaseHome(hctx, who.player, body) : await setHomeEntry(hctx, who.player, body, env);   // AUDIT LW-II-2 S4: a door leaving public reckons its patrons, by the service's secret
    if ('error' in r) return realmNo(r) ?? no(r.error, r.error === 'bad-entry' || r.error === 'realm-needed' ? 400 : r.error === 'home-crossed' || r.error === 'home-tenants' || r.error === 'home-vendor-stocked' || r.error === 'home-holds' || r.error === 'home-decorators' ? 409 : 404, origin);
    return json(await homeOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);   // QUEST-HOME: a sale - a house again to every page online
  }

  // ═══ GUILD1: THE GUILDS ═════════════════════════════════════
  //
  // A character's own guild and the account's invitations are read by
  // any session (a guest's reads none); every change is an account's -
  // guilds.js asks again, and holds the bounds.
  if (path.startsWith('/v1/guilds/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    if (path === '/v1/guilds/mine') {
      const r = await guildOf({ ...ctx, env }, who.player, body);   // AUDIT 28 M5: the switch says whether the Marks show
      return 'error' in r ? no(r.error, GUILD_STATUS[r.error] ?? 400, origin) : json(await guildOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);
    }
    if (path === '/v1/guilds/invites') return json(await invitesOf(ctx, who.player), 200, origin);
    if (accountKind(who.player) !== 'linked') return no('guilds-need-account', 403, origin);
    const act = {
      '/v1/guilds/found': foundGuild, '/v1/guilds/invite': inviteToGuild, '/v1/guilds/answer': answerInvite,
      '/v1/guilds/leave': leaveGuild, '/v1/guilds/remove': removeFromGuild, '/v1/guilds/rank': rankGuildMember,
      '/v1/guilds/ranks': renameGuildRanks, '/v1/guilds/deposit': depositToGuild, '/v1/guilds/withdraw': withdrawFromGuild,
      '/v1/guilds/handover': handOverGuild, '/v1/guilds/disband': disbandGuild,
      // GUILD1d: the hall bought and sold from the treasury, who may walk in, and the heraldry (halls.js)
      '/v1/guilds/hall/buy': buyHall, '/v1/guilds/hall/sell': sellHall, '/v1/guilds/hall/entry': setHallEntry, '/v1/guilds/heraldry': setHeraldry,
      // GUILD1e: the guild's own board - its notes, its members' alone (guildBoard.js, the Notice Board's switch)
      '/v1/guilds/board': (c, p, b) => readGuildBoard(c, p, env, b), '/v1/guilds/board/pin': (c, p, b) => pinGuildNote(c, p, env, b),
      '/v1/guilds/board/take-down': (c, p, b) => takeDownGuildNote(c, p, env, b),
      // GUILD2a: a new name, for a price; GUILD2b: the vault - a piece in and out on the realm record, the grants
      '/v1/guilds/rename': renameGuild, '/v1/guilds/vault': vaultOf, '/v1/guilds/vault/put': vaultPut, '/v1/guilds/vault/take': vaultTake,
      '/v1/guilds/vault/grant': vaultGrant,
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act({ ...ctx, env, bucket: env.SAVES }, who.player, body);   // REALM P2.2: a realm character's record is in R2; AUDIT 28 M5: the switch says whether the Marks show
    if (!('error' in r)) return json(await homeOrdersOf(await guildOrdersOf(r, who.player.id, env, subtle, nowS), who.player.id, env, subtle, nowS), 200, origin);   // QUEST-HOME: a hall bought or sold
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);   // REALM P2.2: the service's own, as a checkpoint's
    if (r.error === 'home-layout') return json({ error: 'home-layout', layout: r.layout ?? null }, 409, origin);   // AUDIT PRE-MERGE 1003 WD1: the town's layout, as /v1/homes/claim answers it
    // AUDIT2 GUILD2 S2/S7: the word the filter caught (`why`, the door's own field for a refusal's reason), and when the
    // next new name may come - each dropped here, so the page could say neither
    if ((r.error === 'guild-name-word' || r.error === 'guild-rank-word') && typeof r.word === 'string') return json({ error: r.error, why: r.word }, GUILD_STATUS[r.error], origin);   // TEXT-F1: a rank's name's word too
    if (r.error === 'guild-rename-soon' && Number.isSafeInteger(r.at)) return json({ error: r.error, at: r.at }, GUILD_STATUS[r.error], origin);
    // GUILD3c (bible/11-Multiplayer/Guilds-Made-Plain.md): a leave's or a disbanding's refusal names everything that holds the guild
    if (Array.isArray(r.keeps)) return json({ error: r.error, keeps: r.keeps }, GUILD_STATUS[r.error] ?? 400, origin);
    return no(r.error, GUILD_STATUS[r.error] ?? 400, origin);
  }

  // ═══ MARKS1: MARKS ═════════════════════════════════════════════
  //
  // An account's alone, and the switch's (marks.js asks both first). The Bank's exchange answers the gold for the
  // client to put in its purse - the service's part is the burn and its cap; nothing here takes gold in.
  if (path.startsWith('/v1/marks/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/marks/balance': () => marksOf(ctx, who.player, env),
      '/v1/marks/gear-upgrade': () => payGearUpgrade(ctx, who.player, env, body),
      '/v1/marks/exchange': () => exchangeMarks(ctx, who.player, env, body),
      '/v1/marks/find': () => findMarks(ctx, who.player, env, body),   // SILVER-FINDS: a loot find
      '/v1/marks/guild/deposit': () => depositGuildMarks(ctx, who.player, env, body),
      '/v1/marks/guild/withdraw': () => withdrawGuildMarks(ctx, who.player, env, body),
      '/v1/marks/report': () => marksReport(ctx, who.player, env),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (progressRoute) await progressSpent(ctx, who.player.id, path, r);   // INT17: a find
    return 'error' in r ? no(r.error, MARKS_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  // ═══ NOTICE1: THE NOTICE BOARD ═══════════════════════════════════
  //
  // A town's notes, read by anyone the switch lets in; pinned, taken down and reported by registered accounts; a
  // moderator's remove and restore; the developers' notices (board.js asks each its own question first).
  if (path.startsWith('/v1/board/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/board/read': () => readBoard(ctx, who.player, env, body.map),
      '/v1/board/pin': () => pinNote(ctx, who.player, env, body),
      '/v1/board/take-down': () => takeDownNote(ctx, who.player, env, body.id),
      '/v1/board/report': () => reportNote(ctx, who.player, env, body.id),
      '/v1/board/mod/remove': () => moderateNote(ctx, who.player, env, body.id, 'remove'),
      '/v1/board/mod/restore': () => moderateNote(ctx, who.player, env, body.id, 'restore'),
      '/v1/board/notice': () => postNotice(ctx, who.player, env, body),
      '/v1/board/notice/remove': () => removeNotice(ctx, who.player, env, body.id),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    return 'error' in r ? no(r.error, BOARD_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  // ═══ TOWN-ECON TE2: THE TOWNS' ECONOMY ════════════════════════════
  //
  // bible/06-Systems/Town-Economy-Arc.md section 4 (townEcon.js): every town's players' share, read by any session; a
  // town witnessed by the client standing in it (the registry); the Watch's ticks walked in a town, claimed.
  if (path.startsWith('/v1/towns/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    // AUDIT TOWN-ECON 2 SVC-7: the doors shut by TOWNS_OPEN 'off' (townEcon.js townsOpen) - the load shed by a variable
    if (!townsOpen(env)) return no('towns-closed', TOWN_STATUS['towns-closed'], origin);
    const act = {
      '/v1/towns/econ': () => townsEcon(ctx),
      '/v1/towns/witness': async () => witnessTown(ctx, who.player, env, body, await gatePublicKey(env, subtle)),   // AUDIT TOWN-ECON 2 SVC-1: a walk's tick
      '/v1/towns/watch': async () => claimTownWatch(ctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/towns/strike': () => strikeTown(ctx, who.player, env, body),   // SVC-1: a developer's
      '/v1/towns/audit': () => auditTowns(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    return 'error' in r ? no(r.error, TOWN_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }
  return NEXT;
}
