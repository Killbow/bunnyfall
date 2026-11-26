// Account service routes: territories, garrisons, staff commands, moderation, and world state.
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
    // EQUIP ONE, OR NONE. Mac: "tap the account icon to equip 1
    // feature along with signing out." An absent `title` and an
    // explicit `null` both mean take it off - a player may always
    // wear nothing, and there is nothing to refuse them for.
    //
    // 403 AND NOT 401 for `not-held`: the credential is good, the
    // title is simply not theirs. Same reading as the save wall.
    const r = await equipTitle(ctx, await withSeatTitles(ctx, who.player, env), env, body.title ?? null);   // SEAT1c: a Charter's titles held too
    return r.error ? no(r.error, r.error === 'not-held' ? 403 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/aura' && request.method === 'POST') {
    // WB9g: WEAR ONE AURA, OR NONE - the title's door at the feet. 403 for `not-held`, as the title's.
    const r = await equipAura(ctx, await withSeatTitles(ctx, who.player, env), env, body.aura ?? null);   // AUDIT SEATS-3 E2: the wardrobe it answers keeps a Charter's titles
    return r.error ? no(r.error, r.error === 'not-held' ? 403 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/icon' && request.method === 'POST') {
    // WITCH1: WEAR ONE PROFILE ICON, OR NONE - the aura's door, in the portrait well. 403 for `not-held`, as the aura's.
    const r = await equipIcon(ctx, await withSeatTitles(ctx, who.player, env), env, body.icon ?? null);
    return r.error ? no(r.error, r.error === 'not-held' ? 403 : 400, origin) : json(r, 200, origin);
  }

  // ═══ WITCH1: THE WITCHES' FESTIVAL ════════════════════════════════
  //
  // bible/06-Systems/Witches-Festival.md: an account's Soul Cakes and what they bought, a find the service's die decides,
  // a sale by its request id, and the Hearth Offerings at homes' doors (festival.js).
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
    // GLYPH-WEAR: SHOW ONE GLYPH, OR HIDE IT - `{ glyph, on }`. 403 for `not-held`, as the title's.
    const r = await equipGlyph(ctx, await withSeatTitles(ctx, who.player, env), env, body.glyph, body.on !== false);   // AUDIT COLLECTIONS-II: the wardrobe it answers keeps a Charter's and a chapter's titles, as the title's door does
    return r.error ? no(r.error, r.error === 'not-held' ? 403 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/name' && request.method === 'POST') {
    // NAME-AS (2026-10-12, Mac: "toggle to use their account name or character name for ingame use"): WHICH NAME THE
    // ROOM READS - `{ as: 'account' | 'character' }`, the row's choice, which every later mint signs (accounts.js
    // wornNameOf). Nothing to hold, so nothing to refuse but a word that is neither: 400 `no-name-as`.
    const r = await chooseNameAs(ctx, who.player, body.as);
    return r.error ? no(r.error, 400, origin) : json(r, 200, origin);
  }

  {   // BUNNYFALL (Phase 5): the account vault - a shelf and a purse every character of the account reaches (accountVault.js)
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

  if (path === '/v1/cannon' || path === '/v1/cannon/give') {   // BUNNYFALL: the great cannon by Wayrest (cannon.js)
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path.endsWith('/give') ? await cannonGive(ctx, who.player, body) : await cannonStatus(ctx, who.player);
    return 'error' in r ? no(r.error, r.error === 'busy' ? 409 : 400, origin) : json(r, 200, origin);
  }

  if (SKIN_ROUTES.includes(path)) {   // BUNNYFALL: custom paperdolls (skins.js; src/net/skinLaw.js)
    if (request.method !== 'POST') return no('method', 405, origin);
    const sctx = { ...ctx, bucket: env.SAVES };
    const r = path.endsWith('/upload') ? await skinsUpload(sctx, who.player, body) : path.endsWith('/mine') ? await skinsMine(sctx, who.player)
      : path.endsWith('/delete') ? await skinsDelete(sctx, who.player, body) : path.endsWith('/wear') ? await skinsWear(sctx, who.player, body) : await skinsGet(sctx, who.player, body);
    return 'error' in r ? no(r.error, r.error === 'no-storage' ? 503 : r.error === 'skin-gone' ? 404 : r.error === 'skin-disabled' ? 403 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/territories') {   // BUNNYFALL COMPANIES: every Company's territory, as the maps paint it (territory.js)
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
  if (path === '/v1/blight' || path === '/v1/blight/push') {   // BUNNYFALL COMPANIES: Rodney's blight (blight.js)
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path === '/v1/blight' ? await blightRead(ctx) : await blightPush(ctx, who.player, body ?? {});
    return 'error' in r ? no(r.error, r.error === 'blight-not-cleared' ? 403 : 400, origin) : json(r, 200, origin);
  }
  if (path === '/v1/charters/found' ||path === '/v1/charters/invite' || path === '/v1/charters/answer' || path === '/v1/charters/leave') {   // BUNNYFALL COMPANIES: City Charters (charters.js)
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = { '/v1/charters/found': foundCharter, '/v1/charters/invite': inviteToCharter, '/v1/charters/answer': answerCharter, '/v1/charters/leave': leaveCharter }[path];
    const r = await act(ctx, who.player, body ?? {});
    return 'error' in r ? no(r.error, r.error === 'guilds-need-account' ? 403 : r.error === 'no-guild' ? 404 : 409, origin) : json(r, 200, origin);
  }
  if (path === '/v1/staffcmd/vanish' || path === '/v1/staffcmd/greed' || path === '/v1/greed/mine' || path === '/v1/greed/claim') {   // BUNNYFALL STAFF COMMANDS (staffCommands.js)
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path === '/v1/staffcmd/vanish' ? await vanishSet(ctx, who.player, env, body ?? {})
      : path === '/v1/staffcmd/greed' ? await greedGive(ctx, who.player, env, body ?? {})
        : path === '/v1/greed/mine' ? await greedMine(ctx, who.player) : await greedClaim(ctx, who.player, body ?? {});
    return 'error' in r ? no(r.error, r.error === 'staff-only' || r.error === 'staff-admin' ? 403 : r.error === 'greed-no-player' || r.error === 'greed-gone' ? 404 : 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/nyx/found' || path === '/v1/nyx/total') {   // BUNNYFALL (Cromwark): a Dusk Token found, and /nyxcoin's count (nyx.js)
    if (request.method !== 'POST') return no('method', 405, origin);
    const r = path.endsWith('/found') ? await nyxFound(ctx, who.player, body) : await nyxTotal(ctx, who.player);
    return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/account/insignia' && request.method === 'POST') {
    // WB9g: THE BROKER'S INSIGNIA, BOUGHT (accounts.js buyInsignia - one UPDATE, the account's closed gates paying).
    // 403 for a guest (the credential is good, the sale is not theirs to keep); 409 for one owned or one the gates
    // cannot pay - the row is as it was, and the answer says why (`purse`, `price` for `short`).
    const r = await buyInsignia(ctx, await withSeatTitles(ctx, who.player, env), env, body.item, body.rid ?? null);   // AUDIT SEATS-3 E2: and so does this one; AUDIT FB1024: its request id
    if (r.error) return r.error === 'short' ? json({ error: 'short', purse: r.purse, price: r.price }, 409, origin) : no(r.error, r.error === 'guest' ? 403 : r.error === 'owned' || r.error === 'fenced' ? 409 : 400, origin);
    return json(r, 200, origin);
  }

  if (path === '/v1/broker/settle' && request.method === 'POST') {
    // AUDIT FB1024 (BROKER-RID, brokerSales.js): A BROKER SALE ASKED AFTER BY ITS REQUEST ID - the row it wrote answers
    // (an insignia's with the wardrobe, the account's own), or the id is fenced; 403 a guest, 400 a bad id or nonce
    const r = await settleBrokerSale(ctx, who.player, body);
    if ('error' in r) return no(r.error, r.error === 'guest' ? 403 : 400, origin);
    return json(r.held && r.kind === 'insignia' ? { ...r, ...accountWardrobe(await withSeatTitles(ctx, who.player, env), env, nowS) } : r, 200, origin);
  }

  if (path === '/v1/mod/mute' && request.method === 'POST') {
    // MOD1: THE ROW FIRST, THE ORDER SECOND. The row is the truth and
    // every later token carries it; the order is only how rooms that
    // are ALREADY holding the target hear it now. So a service with
    // no signing key still mutes - it just cannot tell live rooms,
    // and says so rather than pretending.
    // SAFE4: the act kept in the record for good, and the order pushed to the relay's door - the hub hands it to the
    // target's own client, which reaches the rooms the moderator's does not hold. AUDIT SAFE SERVICE-2: a moderator's
    // mute closes the account's open case - as the moderator's act. STAFF-PANEL2-FIX: all of it safety.js modAct's, the
    // code every door shares - one sanction a case, and a case another staff member holds in the panel is theirs
    const r = await modAct(ctx, who.player, env, { act: 'mute', target: body.target, minutes: body.minutes, from: 'in the game' });
    return 'error' in r ? no(r.error, SAFETY_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  // SAFE4 (bible/11-Multiplayer/Chat-Safety-Arc.md section 5): A MODERATOR'S BAN, UNBAN AND LOOK - sanctions.js. A ban's
  // order goes back to the moderator's client to carry to its rooms (MOD1's carrier) and to the relay's door.
  // STAFF-PANEL2-FIX: the ban and the unban are safety.js modAct's, as the mute is
  if ((path === '/v1/mod/ban' || path === '/v1/mod/unban' || path === '/v1/mod/strikes') && request.method === 'POST') {
    const who2 = { target: body.target, name: body.name };
    const r = path === '/v1/mod/strikes' ? await strikesLook(ctx, who.player, env, who2)
      : path === '/v1/mod/ban' ? await modAct(ctx, who.player, env, { act: 'ban', ...who2, days: body.days, reason: body.reason, from: 'in the game' })
        : await modAct(ctx, who.player, env, { act: 'unban', ...who2, from: 'in the game' });
    return 'error' in r ? no(r.error, SAFETY_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  // AUDIT SAFE DOC-4 (bible/11-Multiplayer/Chat-Safety-Arc.md section 9): THE CASES, READ IN THE GAME - a moderator's
  // list of the open cases, one case, and its dismissal (safety.js); a dismissal's unmute order goes back to the
  // moderator's client to carry, as /mute's does
  if ((path === '/v1/mod/cases' || path === '/v1/mod/case' || path === '/v1/mod/dismiss') && request.method === 'POST') {
    const who2 = { target: body.target, name: body.name };
    const r = path === '/v1/mod/cases' ? await modCases(ctx, who.player, env)
      : path === '/v1/mod/case' ? await modCase(ctx, who.player, env, who2)
        : await modDismiss(ctx, who.player, env, who2);
    return 'error' in r ? no(r.error, SAFETY_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  // SAFE1, SAFE3, SAFE7 (bible/11-Multiplayer/Chat-Safety-Arc.md): A PLAYER'S BLOCK LIST, A REPORT, THE CODE AGREED - safety.js
  if (path.startsWith('/v1/safety/')) {
    if (request.method !== 'POST') return no('method', 405, origin);
    const act = {
      '/v1/safety/blocks': () => blocksOf(ctx, who.player),
      '/v1/safety/block': () => blockAccount(ctx, who.player, { target: body.target }),
      '/v1/safety/unblock': () => unblockAccount(ctx, who.player, { target: body.target }),
      '/v1/safety/report': () => fileReport(ctx, who.player, env, body),
      '/v1/safety/conduct': () => agreeConduct(ctx, who.player, { v: body.v }),
      '/v1/safety/staff-messages': () => staffMessagesFor(ctx, who.player),   // STAFF-PANEL5-MESSAGE: Message on screen, read by the player's own game
      '/v1/safety/staff-message-ok': () => staffMessageOk(ctx, who.player, body),   // ...and its OK (their game's word, never proof)
    }[path];
    if (!act) return no('not-found', 404, origin);
    const r = await act();
    return 'error' in r ? no(r.error, SAFETY_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  // INT6 (bible/06-Systems/Integrity-Arc.md): THE REVIEW - a developer's read of the judge's verdicts and the acts on
  // them (review.js): the held, a character's findings, a hold lifted or laid, a rollback to the last clean save, the
  // measure and the budget's config. 403 for a caller who is not one.
  if (path.startsWith('/v1/mod/realm-') && request.method === 'POST') {
    const act = path.slice('/v1/mod/realm-'.length);
    const r = await reviewAct({ ...ctx, bucket: env.SAVES }, who.player, env, act, body);
    return r.error ? no(r.error, REVIEW_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }

  if (path === '/v1/mod/customs-pass' && request.method === 'POST') {
    // CUSTOMS-PASS (2026-09-29, Mac, asked what becomes of a character a build from before the realm stranded:
    // "Staff customs pass"): A DEVELOPER GRANTS ONE ACCOUNT ONE CHARACTER THROUGH CUSTOMS (realm.js). 403 for a
    // caller who is not one - the credential is good, the right is not theirs, as the save wall reads it.
    const r = await grantCustomsPass(ctx, who.player, env, { name: body.name, account: body.account, revoke: body.revoke });
    return r.error ? no(r.error, PASS_STATUS[r.error] ?? 400, origin) : json(r, 200, origin);
  }
  return NEXT;
}
