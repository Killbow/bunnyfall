import {
  accountKind, accountWardrobe, equipTitle, equipAura, equipIcon, equipGlyph, buyInsignia, chooseNameAs
} from '../accounts.js';
import { settleBrokerSale } from '../brokerSales.js';
import {
  festivalOf, findFestival, buyFestival, festivalTown, setOffering, fillOffering, takeInOffering, takeFromOffering,
  FEST_STATUS
} from '../festival.js';
import { accountVaultOf, accountVaultPut, accountVaultTake, accountVaultGold } from '../accountVault.js';
import { nyxFound, nyxTotal } from '../nyx.js';
import { territoriesRead } from '../territory.js';
import { foundCharter, inviteToCharter, answerCharter, leaveCharter } from '../charters.js';
import { blightRead, blightPush } from '../blight.js';
import { eliteDungeonsRead, eliteDungeonSummon, eliteDungeonClear } from '../eliteDungeons.js';
import { garrisonsRead, garrisonRecruit, garrisonOrders, garrisonDismiss } from '../garrisons.js';
import { farmsRead, farmBuy, farmCrop, farmRelease, farmChore } from '../farms.js';
import { farmGarden } from '../farmGardens.js';
import { farmMarket } from '../farmMarkets.js';
import { vanishSet, greedGive, greedMine, greedClaim } from '../staffCommands.js';
import { skinsUpload, skinsMine, skinsDelete, skinsWear, skinsGet, SKIN_ROUTES } from '../skins.js';
import { cannonStatus, cannonGive } from '../cannon.js';
import { grantCustomsPass } from '../realm.js';
import { reviewAct } from '../review.js';
import {
  blocksOf, blockAccount, unblockAccount, fileReport, agreeConduct, modCases, modCase, modDismiss, modAct
} from '../safety.js';
import { strikesLook } from '../sanctions.js';
import { staffMessagesFor, staffMessageOk } from '../staffMessage.js';
import { PASS_STATUS, REVIEW_STATUS, GUILD_STATUS, SAFETY_STATUS } from '../routeStatus.js';
import { json, no } from '../routeHelpers.js';
import { withSeatTitles } from '../routeTitles.js';
import { AVAULT_STATUS } from '../routeVaultStatus.js';
import { NEXT } from './next.js';

export async function worldRoutes({ request, env, nowS, origin, path, ctx, body, who }) {
  if (path === '/v1/account/title' && request.method === 'POST') {
    // `not-held` answers 403, not 401, because the credential is valid and only the item is not the player's.
    const r = await equipTitle(ctx, await withSeatTitles(ctx, who.player, env), env, body.title ?? null);
    return r.error ? no(r.error, r.error === 'not-held' ? 403 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/aura' && request.method === 'POST') {
    const r = await equipAura(ctx, await withSeatTitles(ctx, who.player, env), env, body.aura ?? null);
    return r.error ? no(r.error, r.error === 'not-held' ? 403 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/icon' && request.method === 'POST') {
    const r = await equipIcon(ctx, await withSeatTitles(ctx, who.player, env), env, body.icon ?? null);
    return r.error ? no(r.error, r.error === 'not-held' ? 403 : 400, origin) : json(r, 200, origin);
  }

  if (path.startsWith('/v1/festival/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/festival/mine': async () => festivalOf(ctx, who.player, env),
      '/v1/festival/find': async () => findFestival(ctx, who.player, body, env),
      '/v1/festival/buy': async () => buyFestival(ctx, who.player, body, env),
      '/v1/festival/town': async () => festivalTown(ctx, who.player, body, env),
      '/v1/festival/offering/set': async () => setOffering(ctx, who.player, body, env),
      '/v1/festival/offering/fill': async () => fillOffering(ctx, who.player, body, env),
      '/v1/festival/offering/take-in': async () => takeInOffering(ctx, who.player, body),
      '/v1/festival/offering/take': async () => takeFromOffering(ctx, who.player, body, env),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    if ('error' in r) return json({ error: r.error, ...(Number.isSafeInteger(r.cakes) ? { cakes: r.cakes } : {}), ...(Number.isSafeInteger(r.bowls) ? { bowls: r.bowls } : {}) }, FEST_STATUS[r.error] ?? 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/account/glyph' && request.method === 'POST') {
    const r = await equipGlyph(ctx, await withSeatTitles(ctx, who.player, env), env, body.glyph, body.on !== false);
    return r.error ? no(r.error, r.error === 'not-held' ? 403 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/name' && request.method === 'POST') {
    const r = await chooseNameAs(ctx, who.player, body.as);
    return r.error ? no(r.error, 400, origin) : json(r, 200, origin);
  }

  {
    const vault = { '/v1/account/vault': accountVaultOf, '/v1/account/vault/put': accountVaultPut, '/v1/account/vault/take': accountVaultTake, '/v1/account/vault/gold': accountVaultGold }[path];
    if (vault) {
      if (request.method !== 'POST') return no('method', 405, origin);
      if (accountKind(who.player) !== 'linked') return no('guilds-need-account', 403, origin);
      const r = await vault({ ...ctx, env, bucket: env.SAVES }, who.player, body);
      if (!('error' in r)) return json(r, 200, origin);
      if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
      return no(r.error, AVAULT_STATUS[r.error] ?? GUILD_STATUS[r.error] ?? 400, origin);
    }
  }

  if (path === '/v1/cannon' || path === '/v1/cannon/give') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path.endsWith('/give') ? await cannonGive(ctx, who.player, body) : await cannonStatus(ctx, who.player);
    return 'error' in r ? no(r.error, r.error === 'busy' ? 409 : 400, origin) : json(r, 200, origin);
  }

  if (SKIN_ROUTES.includes(path)) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const sctx = { ...ctx, bucket: env.SAVES };
    const r = path.endsWith('/upload') ? await skinsUpload(sctx, who.player, body) : path.endsWith('/mine') ? await skinsMine(sctx, who.player)
      : path.endsWith('/delete') ? await skinsDelete(sctx, who.player, body) : path.endsWith('/wear') ? await skinsWear(sctx, who.player, body) : await skinsGet(sctx, who.player, body);
    return 'error' in r ? no(r.error, r.error === 'no-storage' ? 503 : r.error === 'skin-gone' ? 404 : r.error === 'skin-disabled' ? 403 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/territories') {
    if (request.method !== 'POST') return no('method', 405, origin);
    return json(await territoriesRead(ctx), 200, origin);
  }
  if (path === '/v1/farms' || path === '/v1/farms/buy' || path === '/v1/farms/crop' || path === '/v1/farms/release' || path === '/v1/farms/chore' || path === '/v1/farms/garden' || path === '/v1/farms/market') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = { '/v1/farms': farmsRead, '/v1/farms/buy': farmBuy, '/v1/farms/crop': farmCrop, '/v1/farms/release': farmRelease, '/v1/farms/chore': farmChore, '/v1/farms/garden': farmGarden, '/v1/farms/market': farmMarket }[path];
    const r = await act({ ...ctx, env, bucket: env.SAVES }, who.player, body ?? {});
    if (r.error === 'seq') return json({ error: 'seq', seq: r.seq }, 409, origin);
    return 'error' in r ? no(r.error, r.error === 'guilds-need-account' ? 403 : r.error === 'lease' || r.error === 'realm-gold' ? 409 : r.error === 'no-guild' ? 404 : 409, origin) : json(r, 200, origin);
  }
  if (path === '/v1/garrisons' || path === '/v1/garrisons/recruit' || path === '/v1/garrisons/orders' || path === '/v1/garrisons/dismiss') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = { '/v1/garrisons': garrisonsRead, '/v1/garrisons/recruit': garrisonRecruit, '/v1/garrisons/orders': garrisonOrders, '/v1/garrisons/dismiss': garrisonDismiss }[path];
    const r = await act(ctx, who.player, body ?? {});
    return 'error' in r ? no(r.error, r.error === 'guilds-need-account' ? 403 : r.error === 'no-guild' ? 404 : 409, origin) : json(r, 200, origin);
  }
  if (path === '/v1/elite-dungeons' || path === '/v1/elite-dungeons/summon' || path === '/v1/elite-dungeons/clear') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path === '/v1/elite-dungeons' ? await eliteDungeonsRead(ctx) : path.endsWith('/summon') ? await eliteDungeonSummon(ctx, who.player, body ?? {}) : await eliteDungeonClear(ctx, who.player, body ?? {});
    return 'error' in r ? no(r.error, r.error === 'ed-need-account' || r.error === 'ed-not-present' ? 403 : r.error === 'ed-unknown' ? 404 : 409, origin) : json(r, 200, origin);
  }
  if (path === '/v1/blight' || path === '/v1/blight/push') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path === '/v1/blight' ? await blightRead(ctx) : await blightPush(ctx, who.player, body ?? {});
    return 'error' in r ? no(r.error, r.error === 'blight-not-cleared' ? 403 : 400, origin) : json(r, 200, origin);
  }
  if (path === '/v1/charters/found' ||path === '/v1/charters/invite' || path === '/v1/charters/answer' || path === '/v1/charters/leave') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = { '/v1/charters/found': foundCharter, '/v1/charters/invite': inviteToCharter, '/v1/charters/answer': answerCharter, '/v1/charters/leave': leaveCharter }[path];
    const r = await act(ctx, who.player, body ?? {});
    return 'error' in r ? no(r.error, r.error === 'guilds-need-account' ? 403 : r.error === 'no-guild' ? 404 : 409, origin) : json(r, 200, origin);
  }
  if (path === '/v1/staffcmd/vanish' || path === '/v1/staffcmd/greed' || path === '/v1/greed/mine' || path === '/v1/greed/claim') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path === '/v1/staffcmd/vanish' ? await vanishSet(ctx, who.player, env, body ?? {})
      : path === '/v1/staffcmd/greed' ? await greedGive(ctx, who.player, env, body ?? {})
        : path === '/v1/greed/mine' ? await greedMine(ctx, who.player) : await greedClaim(ctx, who.player, body ?? {});
    return 'error' in r ? no(r.error, r.error === 'staff-only' || r.error === 'staff-admin' ? 403 : r.error === 'greed-no-player' || r.error === 'greed-gone' ? 404 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/nyx/found' || path === '/v1/nyx/total') {
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path.endsWith('/found') ? await nyxFound(ctx, who.player, body) : await nyxTotal(ctx, who.player);
    return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/insignia' && request.method === 'POST') {
    const r = await buyInsignia(ctx, await withSeatTitles(ctx, who.player, env), env, body.item, body.rid ?? null);
    if (r.error) return r.error === 'short' ? json({ error: 'short', purse: r.purse, price: r.price }, 409, origin) : no(r.error, r.error === 'guest' ? 403 : r.error === 'owned' || r.error === 'fenced' ? 409 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/broker/settle' && request.method === 'POST') {
    const r = await settleBrokerSale(ctx, who.player, body);
    if ('error' in r) return no(r.error, r.error === 'guest' ? 403 : 400, origin);
    return json(r.held && r.kind === 'insignia' ? { ...r, ...accountWardrobe(await withSeatTitles(ctx, who.player, env), env, nowS) } : r, 200, origin);
  }

  if (path === '/v1/mod/mute' && request.method === 'POST') {
    const r = await modAct(ctx, who.player, env, { act: 'mute', target: body.target, minutes: body.minutes, from: 'in the game' });
    return 'error' in r ? no(r.error, SAFETY_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  if ((path === '/v1/mod/ban' || path === '/v1/mod/unban' || path === '/v1/mod/strikes') && request.method === 'POST') {
    const who2 = { target: body.target, name: body.name };
    const r = path === '/v1/mod/strikes' ? await strikesLook(ctx, who.player, env, who2)
      : path === '/v1/mod/ban' ? await modAct(ctx, who.player, env, { act: 'ban', ...who2, days: body.days, reason: body.reason, from: 'in the game' })
        : await modAct(ctx, who.player, env, { act: 'unban', ...who2, from: 'in the game' });
    return 'error' in r ? no(r.error, SAFETY_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  if ((path === '/v1/mod/cases' || path === '/v1/mod/case' || path === '/v1/mod/dismiss') && request.method === 'POST') {
    const who2 = { target: body.target, name: body.name };
    const r = path === '/v1/mod/cases' ? await modCases(ctx, who.player, env)
      : path === '/v1/mod/case' ? await modCase(ctx, who.player, env, who2)
        : await modDismiss(ctx, who.player, env, who2);
    return 'error' in r ? no(r.error, SAFETY_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  if (path.startsWith('/v1/safety/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/safety/blocks': () => blocksOf(ctx, who.player),
      '/v1/safety/block': () => blockAccount(ctx, who.player, { target: body.target }),
      '/v1/safety/unblock': () => unblockAccount(ctx, who.player, { target: body.target }),
      '/v1/safety/report': () => fileReport(ctx, who.player, env, body),
      '/v1/safety/conduct': () => agreeConduct(ctx, who.player, { v: body.v }),
      '/v1/safety/staff-messages': () => staffMessagesFor(ctx, who.player),
      '/v1/safety/staff-message-ok': () => staffMessageOk(ctx, who.player, body),
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    return 'error' in r ? no(r.error, SAFETY_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  if (path.startsWith('/v1/mod/realm-') && request.method === 'POST') {
    const act = path.slice('/v1/mod/realm-'.length);
    const r = await reviewAct({ ...ctx, bucket: env.SAVES }, who.player, env, act, body);
    return r.error ? no(r.error, REVIEW_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/mod/customs-pass' && request.method === 'POST') {
    const r = await grantCustomsPass(ctx, who.player, env, { name: body.name, account: body.account, revoke: body.revoke });
    return r.error ? no(r.error, PASS_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }
  return NEXT;
}
