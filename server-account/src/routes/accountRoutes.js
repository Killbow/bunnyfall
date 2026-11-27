// Account service routes: /v1/account, /v1/auth, and /v1/patreon.
import {
  openSession, devicesOf, accountView, displayName, accountKind, accountWardrobe, insigniaPurse, isMuted, mutedUntil,
  duelRecordOf, gateRecordOf, nameAsOf, wornNameOf
} from '../accounts.js';
import {
  mintToken, MAX_TTL_S, SEAT_TITLES, CHAPTER_TITLES, TOKEN_MAX_CHARS, TOKEN_BODY_MAX, tokenBodyOf
} from '../../../src/net/identityToken.js';
import { signingKey } from '../signing.js';
import { titleWorn, glyphsOf, glyphsHidden, auraWorn, iconWorn } from '../titles.js';
import { arenaRatingOf } from '../arena.js';
import { arenaSeasonOf } from '../../../src/net/arenaLaw.js';
import { renownTrackOf, renownTracksOf, renownCharacterOk } from '../renownTracks.js';
import { chapterTitlesOfAccount } from '../npcChapters.js';
import { raidRecordOf } from '../raids.js';
import { serpentRecordOf } from '../serpents.js';
import { starRecordOf } from '../stars.js';
import { sdRecordOf } from '../sds.js';
import { ketchRecordOf } from '../ketch.js';
import { guildBadgeOf, mintMemberOf } from '../guilds.js';
import { seatsOpenFor } from '../townSeats.js';
import { seatBadgeOf, seatTitlesOf } from '../seatTurning.js';
import { keptTitleOf, KEPT_TITLES } from '../seatRoyal.js';
import { ribbonOf } from '../seatRibbons.js';
import { seatWeekOf, seasonOf, seasonZeroOf } from '../../../src/net/townSeatLaw.js';
import { marksCardOf } from '../marks.js';
import { realmMintFacts } from '../realm.js';
import { conductAgreed } from '../safety.js';
import { isFrozen } from '../staffFreeze.js';
import { staffRole } from '../staff.js';
import { hiddenToken } from '../staffHidden.js';
import { unlinkPatreon, patreonCardOf } from '../patreon.js';
import { json, no } from '../routeHelpers.js';
import { withSeatTitles, withChapterTitles } from '../routeTitles.js';
import { NEXT } from './next.js';

export async function accountRoutes({ request, env, subtle, rand, nowS, origin, url, path, ctx, body, who }) {
  if (path === '/v1/auth/token' && request.method === 'POST') {
    const key = await signingKey(env, subtle);
    if (!key) return no('no-signing-key', 503, origin);
    const hidden = await hiddenToken(ctx, env, who.player, key);
    if (hidden) return hidden.error ? no(hidden.error, 409, origin) : json(hidden, 200, origin);
    const seats = seatsOpenFor(who.player, env);
    const worn = await withChapterTitles(ctx, seats ? { ...who.player, seatTitles: await seatTitlesOf(ctx.db, who.player.id) } : who.player, env);
    const zero = seasonZeroOf(env.SEASON_ZERO_WEEK);
    // Signed claims come from rows and config read now, never from the request; the body only picks the character.
    // Only a mint that sends guild: true wears a guild, because older builds file guild lines on the World tab.
    const member = renownCharacterOk(body.character) && (seats || body.guild === true) ? await mintMemberOf(ctx, who.player.id, body.character) : undefined;
    const seatBadge = seats && renownCharacterOk(body.character) ? await seatBadgeOf(ctx.db, who.player.id, body.character, seasonOf(seatWeekOf(nowS * 1000), zero)?.n ?? 0, member) : null;
    const wornT = titleWorn(worn, env);
    const kept = seats && KEPT_TITLES.includes(wornT) ? await keptTitleOf(ctx.db, who.player.id, wornT, zero) : null;
    const chapterT = CHAPTER_TITLES.includes(wornT) && renownCharacterOk(body.character)
      ? (await chapterTitlesOfAccount(ctx.db, who.player.id, nowS, zero, body.character)).find((t) => t.title === wornT) ?? null : null;
    const seatT = KEPT_TITLES.includes(wornT) ? (kept ? { t: wornT, ts: kept.ts } : {})
      : SEAT_TITLES.includes(wornT) ? (seatBadge?.title === wornT ? { t: wornT, ts: seatBadge.ts } : {})
        : CHAPTER_TITLES.includes(wornT) ? (chapterT ? { t: chapterT.high ? 'highmaster' : wornT, ts: chapterT.ts } : {}) : (wornT ? { t: wornT } : {});
    const rb = seats && renownCharacterOk(body.character) ? await ribbonOf(ctx.db, who.player.id, body.character, seasonOf(seatWeekOf(nowS * 1000), zero), member) : null;
    const wardrobe = {
      ...seatT,
      g: [...glyphsOf(who.player, env, nowS), ...(seatBadge?.glyphs ?? [])],
      au: auraWorn(who.player, env),
      pi: iconWorn(who.player),
      ...(rb ? { rb } : {}),
    };
    // g keeps every glyph because the relay's rights read it; gx lists the glyphs the player hides from display.
    const gx = glyphsHidden(who.player, env, nowS);
    if (gx.length) wardrobe.gx = gx;
    if (Number(who.player.vanish_on ?? 0) === 1 && staffRole(who.player, env)) wardrobe.vn = 1;
    // Mutes and freezes are signed into the token so a reconnect cannot shed them.
    const mu = isMuted(who.player, nowS) ? mutedUntil(who.player) : undefined;
    const fz = isFrozen(who.player, nowS) ? who.player.frozen_until : undefined;
    const track = renownCharacterOk(body.character) ? ((await renownTrackOf(ctx, who.player.id, body.character)) ?? { xp: 0, level: 1 }) : null;
    const lv = track ? track.level : undefined;
    const guild = renownCharacterOk(body.character) && body.guild === true ? await guildBadgeOf(ctx, who.player.id, body.character, member) : null;
    const facts = await realmMintFacts(ctx, who.player.id, body.character);
    // rc goes on every mint, 0 included, because the relay reads a token without rc as one from an older service.
    const rc = facts.rc;
    const cl = facts.cl;
    const wa = facts.wa;
    const ar = who.player.handle ? (await arenaRatingOf(ctx, who.player.id, arenaSeasonOf(nowS))).rating : undefined;
    const house = facts.house;
    const nameWorn = await wornNameOf(ctx, who.player, facts.name);
    const signed = { s: who.player.id, n: nameWorn.name, k: accountKind(who.player), ...wardrobe, mu, lv, ...(guild ?? {}), rc, ...(rc ? { ci: body.character } : {}), ...(ar !== undefined ? { ar } : {}), ...(cl != null ? { cl } : {}), ...(wa ? { wa } : {}), ...(fz ? { fz } : {}) };
    let token = await mintToken(house ? { ...signed, ...house } : signed, key, { subtle, nowS });
    let houseWorn = house;
    if (house && (token.length > TOKEN_MAX_CHARS || tokenBodyOf(token).length > TOKEN_BODY_MAX)) { token = await mintToken(signed, key, { subtle, nowS }); houseWorn = null; }
    return json({
      token,
      name: nameWorn.name,
      accountName: displayName(who.player),
      nameAs: nameAsOf(who.player),
      ...(nameWorn.why ? { nameWhy: nameWorn.why, ...(nameWorn.word ? { nameWord: nameWorn.word } : {}) } : {}),
      kind: accountKind(who.player),
      title: wardrobe.t ?? null,
      ...(wardrobe.ts ? { ts: wardrobe.ts } : {}),
      glyphs: wardrobe.g,
      ...(wardrobe.gx ? { glyphsOff: wardrobe.gx } : {}),
      mutedUntil: mu ?? 0,
      frozenUntil: fz ?? 0,
      conduct: conductAgreed(who.player),
      level: lv ?? null,
      xp: track ? track.xp : null,
      guild: guild ? guild.gt : null,
      aura: wardrobe.au ?? null,
      icon: wardrobe.pi ?? null,
      ribbon: wardrobe.rb ?? null,
      house: houseWorn ?? null,
      expiresAt: nowS + MAX_TTL_S,
    }, 200, origin);
  }

  if (path === '/v1/auth/session' && request.method === 'POST') {
    // The new session is written only while the admitting session still exists, so a recovery sign-out wins.
    const made = await openSession(ctx, who.player.id, body.label ?? null, { session: who.session.id });
    return made ? json(made, 200, origin) : no('auth', 401, origin);
  }

  if (path === '/v1/account' && request.method === 'GET') {
    return json({
      account: { ...accountView(who.player, nowS), duels: await duelRecordOf(ctx, who.player.id), gates: await gateRecordOf(ctx, who.player.id), raids: await raidRecordOf(ctx, who.player.id), serpents: await serpentRecordOf(ctx, who.player.id), sds: await sdRecordOf(ctx, who.player.id), stars: await starRecordOf(ctx, who.player.id), ketch: await ketchRecordOf(ctx, who.player.id), renown: await renownTracksOf(ctx, who.player.id), marks: await marksCardOf(ctx, who.player, env) },
      wardrobe: { ...accountWardrobe(await withSeatTitles(ctx, who.player, env), env, nowS), purse: await insigniaPurse(ctx, who.player), annals: Number(who.player.eg_annals) || 0 },
      devices: await devicesOf(ctx, who.player.id),
      patreon: await patreonCardOf(who.player, env, { subtle, rand, nowS, origin: url.origin }),
    }, 200, origin);
  }

  if (path === '/v1/patreon/unlink' && request.method === 'POST') {
    await unlinkPatreon(ctx, who.player.id);
    const after = { ...(await withSeatTitles(ctx, who.player, env)), patreon_user: null, patreon_tiers: null, patreon_status: null, patreon_at: null };
    return json({ ok: true, ...accountWardrobe(after, env, nowS), patreon: await patreonCardOf(after, env, { subtle, rand, nowS, origin: url.origin }) }, 200, origin);
  }
  return NEXT;
}
