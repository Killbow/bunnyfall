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
import { homeOwners } from '../homeOwners.js';
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
import { SEALS_STATUS, sealsBalanceOf, spendPsijicSeal } from '../psijicSeals.js';
import { readBoard, pinNote, takeDownNote, reportNote, moderateNote, postNotice, removeNotice } from '../board.js';
import { progressSpent } from '../progress.js';
import { DECORATOR_STATUS, RENT_STATUS, ROLL_STATUS, GUILD_STATUS, MARKS_STATUS, BOARD_STATUS, TOWN_STATUS } from '../routeStatus.js';
import { json, no, guildOrdersOf, homeOrdersOf } from '../routeHelpers.js';
import { NEXT } from './next.js';

export async function townRoutes({ request, env, subtle, nowS, origin, path, ctx, body, who, progressRoute }) {
  if (path === '/v1/chapters/roll' || path === '/v1/chapters/claim' || path === '/v1/chapters/witness'
    || path === '/v1/chapters/halls' || path === '/v1/chapters/strike' || path === '/v1/chapters/list'
    || path === '/v1/chapters/focus' || path === '/v1/chapters/history' || path === '/v1/chapters/back' || path === '/v1/chapters/patron') {
    if (request.method !== 'POST') return no('method', 405, origin);
    if (!chaptersOpenFor(who.player, env)) return no('chapters-closed', 403, origin);
    const r = path === '/v1/chapters/list' ? await chapterSheet(ctx, who.player, env)
      : path === '/v1/chapters/focus' ? await setChapterFocus(ctx, who.player, env, body)
      : path === '/v1/chapters/history' ? await chapterChronicle(ctx, who.player, env, body)
      : path === '/v1/chapters/back' ? await backChapter(ctx, who.player, env, body)
      : path === '/v1/chapters/patron' ? await bidPatron(ctx, who.player, env, body)
      : path === '/v1/chapters/witness' ? await witnessHall(ctx, who.player, env, body)
      : path === '/v1/chapters/halls' ? await listHalls(ctx, who.player, env, body)
        : path === '/v1/chapters/strike' ? await strikeHall(ctx, who.player, env, body)
          : path === '/v1/chapters/roll' ? await readRoll(ctx, who.player, body) : await claimRoll(ctx, who.player, body);
    if ('error' in r) return no(r.error, /** @type {Record<string, number>} */ (ROLL_STATUS)[r.error] ?? 400, origin);
    if ((path === '/v1/chapters/roll' || path === '/v1/chapters/claim') && /** @type {any} */ (r).roll) /** @type {any} */ (r).roll.seats = await chapterSeatsOf(ctx.db, body?.character);
    return json(r, 200, origin);
  }

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
  if (path === '/v1/festivals/host' || path === '/v1/festivals/list') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path.endsWith('/host') ? await hostFestival(ctx, who.player, body) : await listFestivals(ctx, who.player);
    if (!('error' in r)) return json(r, 200, origin);
    return no(r.error, r.error === 'homes-need-account' ? 403 : r.error === 'bad-festival' ? 400 : 409, origin);
  }
  // Camp routes use /v1/camps/, so the prefix test lists it beside /v1/homes/.
  if (path.startsWith('/v1/homes/') || path.startsWith('/v1/camps/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    if (path === '/v1/homes/town') {
      const r = await homesInTown(ctx, who.player, body, { seats: seatsOpenFor(who.player, env) });
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/towns') {
      const r = await homesInTowns(ctx, who.player, body, { seats: seatsOpenFor(who.player, env) });
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/mine') return json(await homesOf(ctx, who.player), 200, origin);
    if ((path === '/v1/homes/decor' || path.startsWith('/v1/homes/decor/')) && body?.seat === true && !seatsOpenFor(who.player, env)) return no('seats-closed', 403, origin);
    if (path === '/v1/homes/layouts') return json(await homeLayoutsKept(ctx), 200, origin);
    if (path === '/v1/homes/decor') {
      const r = await decorOf(ctx, who.player, body);
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/camps/near' || path === '/v1/camps/mine') {
      const r = await campRoute(ctx, who.player, path, body);
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/rooms') {
      const r = await roomsOf(ctx, who.player, body);
      return 'error' in r ? no(r.error, r.error === 'no-home' ? 404 : 400, origin) : json(r, 200, origin);
    }
    // Guests may use the home reads above; every route below needs a registered account.
    if (accountKind(who.player) !== 'linked') return no('homes-need-account', 403, origin);
    if (path === '/v1/homes/decorators' || path.startsWith('/v1/homes/caravan/')) {
      const r = path === '/v1/homes/decorators' ? await decoratorsRoute(ctx, who.player, body) : await caravanRoute(ctx, who.player, path, body);
      return 'error' in r ? no(r.error, DECORATOR_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
    }
    if (path.startsWith('/v1/camps/')) {
      const r = await campRoute(ctx, who.player, path, body);
      return 'error' in r ? no(r.error, r.error === 'no-camp' || r.error === 'no-decor' ? 404 : r.error === 'rate-limited' ? 429 : 400, origin) : json(r, 200, origin);
    }
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
      const r = path === '/v1/homes/rooms/offer' ? await offerRoom(hctx, who.player, body)
        : path === '/v1/homes/rooms/withdraw' ? await withdrawRoom(hctx, who.player, body)
          : path === '/v1/homes/rooms/rent' ? await rentRoom(hctx, who.player, body)
            : await collectRent(hctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      const said = realmNo(r);
      if (said) return said;
      if (r.error === 'rent-price') return json({ error: 'rent-price', price: r.price }, 409, origin);
      const status = RENT_STATUS[r.error] ?? 400;
      return no(r.error, status, origin);
    }
    if (path === '/v1/homes/guestbook/sign' || path === '/v1/homes/guestbook/read') {
      const r = path.endsWith('/sign') ? await signGuestbook(ctx, who.player, body) : await readGuestbook(ctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      return no(r.error, r.error === 'no-home' ? 404 : r.error === 'guestbook-soon' ? 429 : r.error === 'guestbook-not-yours' || r.error === 'homes-need-account' ? 403 : 400, origin);
    }
    if (path === '/v1/homes/vote') {
      const r = await voteHome(ctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      return no(r.error, r.error === 'no-home' ? 404 : r.error === 'vote-rate' ? 429 : r.error === 'vote-own' || r.error === 'vote-young' ? 403 : 400, origin);
    }
    if (path === '/v1/homes/look') {
      const r = await setHomeLook(hctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      return no(r.error, r.error === 'no-home' ? 404 : r.error === 'decor-rate' ? 429 : 400, origin);
    }
    if (path === '/v1/homes/arena-move') {
      const r = await arenaMoveHome(hctx, who.player, body);
      if (!('error' in r)) return json(await homeOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);
      const said = realmNo(r);
      if (said) return said;
      const status = r.error === 'home-taken' || r.error === 'home-changed' || r.error === 'guild-treasury-full' ? 409 : r.error === 'no-home' ? 404 : 400;
      return no(r.error, status, origin);
    }
    if (path === '/v1/homes/arena-moves') {
      const r = await arenaMovesOf(hctx, who.player, body);
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/arena-seen') {
      const r = await arenaMoveSeen(hctx, who.player, body);
      return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
    }
    if (path === '/v1/homes/deed') {
      const r = await holdDeed(hctx, who.player, body);
      if (!('error' in r)) return json(await homeOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);
      if (r.error === 'home-layout') return json({ error: 'home-layout', layout: r.layout ?? null }, 409, origin);
      const status = r.error === 'home-taken' || r.error === 'home-arena' ? 409 : r.error === 'home-rate' ? 429 : r.error === 'no-deed' || r.error === 'no-realm-character' ? 404 : 400;
      return no(r.error, status, origin);
    }
    if (path === '/v1/homes/inherit') {
      const r = await inheritHome(hctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      return no(r.error, r.error === 'not-heir' ? 403 : r.error === 'no-home' ? 404 : r.error === 'homes-need-account' ? 403 : 400, origin);
    }
    if (path === '/v1/homes/claim') {
      const r = await claimHome(hctx, who.player, body);
      if (!('error' in r)) return json(await homeOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);
      const said = realmNo(r);
      if (said) return said;
      if (r.error === 'home-layout') return json({ error: 'home-layout', layout: r.layout ?? null }, 409, origin);
      const status = r.error === 'home-taken' || r.error === 'home-cap' || r.error === 'home-arena' ? 409 : r.error === 'home-rate' ? 429 : r.error === 'home-update' ? 426 : 400;
      return no(r.error, status, origin);
    }
    if (path === '/v1/homes/owners') {
      const r = await homeOwners(hctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      return no(r.error, r.error === 'home-rate' ? 429 : r.error === 'no-home' ? 404 : r.error === 'bad-owner' || r.error === 'homes-need-account' ? 400 : 409, origin);
    }
    if (path === '/v1/homes/transfer') {
      const r = await homeTransfer(hctx, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      const said = realmNo(r);
      if (said) return said;
      if (r.error === 'home-pick') return json({ error: 'home-pick', matches: r.matches, ...(r.more ? { more: true } : {}) }, 409, origin);
      const conflict = r.error === 'home-decorators' || r.error === 'home-cap' || r.error === 'home-tenants' || r.error === 'home-vendor-stocked' || r.error === 'home-holds' || r.error === 'offer-open' || r.error === 'offer-closed' || r.error === 'offer-stale' || r.error === 'home-deed' || r.error === 'offer-wrong-char' || r.error === 'home-no-char';
      return no(r.error, r.error === 'home-rate' ? 429 : r.error === 'home-update' ? 426 : conflict ? 409 : r.error === 'no-home' ? 404 : 400, origin);
    }
    const r = path === '/v1/homes/release' ? await releaseHome(hctx, who.player, body) : await setHomeEntry(hctx, who.player, body, env);
    if ('error' in r) return realmNo(r) ?? no(r.error, r.error === 'bad-entry' || r.error === 'realm-needed' ? 400 : r.error === 'home-crossed' || r.error === 'home-tenants' || r.error === 'home-vendor-stocked' || r.error === 'home-holds' || r.error === 'home-decorators' ? 409 : 404, origin);
    return json(await homeOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);
  }

  if (path.startsWith('/v1/guilds/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    if (path === '/v1/guilds/mine') {
      const r = await guildOf({ ...ctx, env }, who.player, body);
      return 'error' in r ? no(r.error, GUILD_STATUS[r.error] ?? 400, origin) : json(await guildOrdersOf(r, who.player.id, env, subtle, nowS), 200, origin);
    }
    if (path === '/v1/guilds/invites') return json(await invitesOf(ctx, who.player), 200, origin);
    // The guild reads above answer any session; every change below needs a registered account.
    if (accountKind(who.player) !== 'linked') return no('guilds-need-account', 403, origin);
    const act = {
      '/v1/guilds/found': foundGuild, '/v1/guilds/invite': inviteToGuild, '/v1/guilds/answer': answerInvite,
      '/v1/guilds/leave': leaveGuild, '/v1/guilds/remove': removeFromGuild, '/v1/guilds/rank': rankGuildMember,
      '/v1/guilds/ranks': renameGuildRanks, '/v1/guilds/deposit': depositToGuild, '/v1/guilds/withdraw': withdrawFromGuild,
      '/v1/guilds/handover': handOverGuild, '/v1/guilds/disband': disbandGuild,
      '/v1/guilds/hall/buy': buyHall, '/v1/guilds/hall/sell': sellHall, '/v1/guilds/hall/entry': setHallEntry, '/v1/guilds/heraldry': setHeraldry,
      '/v1/guilds/board': (c, p, b) => readGuildBoard(c, p, env, b), '/v1/guilds/board/pin': (c, p, b) => pinGuildNote(c, p, env, b),
      '/v1/guilds/board/take-down': (c, p, b) => takeDownGuildNote(c, p, env, b),
      '/v1/guilds/rename': renameGuild, '/v1/guilds/vault': vaultOf, '/v1/guilds/vault/put': vaultPut, '/v1/guilds/vault/take': vaultTake,
      '/v1/guilds/vault/grant': vaultGrant,
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act({ ...ctx, env, bucket: env.SAVES }, who.player, body);
    if (!('error' in r)) return json(await homeOrdersOf(await guildOrdersOf(r, who.player.id, env, subtle, nowS), who.player.id, env, subtle, nowS), 200, origin);
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    if (r.error === 'home-layout') return json({ error: 'home-layout', layout: r.layout ?? null }, 409, origin);
    if ((r.error === 'guild-name-word' || r.error === 'guild-rank-word') && typeof r.word === 'string') return json({ error: r.error, why: r.word }, GUILD_STATUS[r.error], origin);
    if (r.error === 'guild-rename-soon' && Number.isSafeInteger(r.at)) return json({ error: r.error, at: r.at }, GUILD_STATUS[r.error], origin);
    if (Array.isArray(r.keeps)) return json({ error: r.error, keeps: r.keeps }, GUILD_STATUS[r.error] ?? 400, origin);
    return no(r.error, GUILD_STATUS[r.error] ?? 400, origin);
  }

  if (path.startsWith('/v1/marks/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/marks/balance': () => marksOf(ctx, who.player, env),
      '/v1/marks/gear-upgrade': () => payGearUpgrade(ctx, who.player, env, body),
      '/v1/marks/exchange': () => exchangeMarks(ctx, who.player, env, body),
      '/v1/marks/find': () => findMarks(ctx, who.player, env, body),
      '/v1/marks/guild/deposit': () => depositGuildMarks(ctx, who.player, env, body),
      '/v1/marks/guild/withdraw': () => withdrawGuildMarks(ctx, who.player, env, body),
      '/v1/marks/report': () => marksReport(ctx, who.player, env),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if (progressRoute) await progressSpent(ctx, who.player.id, path, r);
    return 'error' in r ? no(r.error, MARKS_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  if (path.startsWith('/v1/seals/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/seals/balance': () => sealsBalanceOf(ctx, who.player),
      '/v1/seals/spend': () => spendPsijicSeal(ctx, who.player, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    return 'error' in r
      ? json({ error: r.error, ...(r.balance != null ? { balance: r.balance } : {}) }, SEALS_STATUS[r.error] ?? 400, origin)
      : json(r, 200, origin);
  }

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

  if (path.startsWith('/v1/towns/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    if (!townsOpen(env)) return no('towns-closed', TOWN_STATUS['towns-closed'], origin);
    const act = {
      '/v1/towns/econ': () => townsEcon(ctx),
      '/v1/towns/witness': async () => witnessTown(ctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/towns/watch': async () => claimTownWatch(ctx, who.player, env, body, await gatePublicKey(env, subtle)),
      '/v1/towns/strike': () => strikeTown(ctx, who.player, env, body),
      '/v1/towns/audit': () => auditTowns(ctx, who.player, env, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    return 'error' in r ? no(r.error, TOWN_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }
  return NEXT;
}
