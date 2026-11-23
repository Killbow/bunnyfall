// Account service routes: /v1/account, /v1/auth and /v1/patreon.
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
    // A service with no key can still hand out accounts; it just
    // cannot vouch for them. Said plainly rather than by minting
    // something the relay will refuse.
    if (!key) return no('no-signing-key', 503, origin);
    // STAFF-PANEL5-HIDDEN (staffHidden.js): A HIDDEN STAFF MEMBER'S TOKEN IS THE SPECTATOR'S - `hd`, a subject of their
    // staff session's and no badge, written in the staff audit log - while an Admin or a Moderator holds a live staff
    // session with Hide me on. Every other account reads nothing more here.
    const hidden = await hiddenToken(ctx, env, who.player, key);
    if (hidden) return hidden.error ? no(hidden.error, 409, origin) : json(hidden, 200, origin);   // STAFF-PANEL5-HIDDEN-FIX: a lapsed hidden session mints nothing, never a visible token
    // ═══ ACC3: THE BADGE RIDES IN THE TOKEN ══════════════════
    //
    // A title and a glyph are read off the SIGNED claims and never
    // off anything a client says about itself - which is the exact
    // hole ACC1g closed one slice ago for the NAME, and a title is
    // a stronger thing to claim than a name is. A client that
    // announced "I am a Developer" over the wire would be believed
    // by every other client in the room; a client that announces it
    // here is simply not signed for.
    //
    // DERIVED AT MINT, so both are answered by the row and the
    // config AS THEY ARE NOW, and both lapse on their own: a
    // developer taken off the list, or a sprout that has aged past
    // two weeks, stops being signed for on the next token - with
    // no cron and no column to clear. A token lives MAX_TTL_S, so
    // the badge is at most five minutes stale.
    // SEAT1c (Seats-Arc 7.4): AND A CHARTER'S - its glyphs on every member of the named character's guild, and a seat
    // title worn only by the guildmaster character this token is minted for, with its claim (`ts`) beside it
    const seats = seatsOpenFor(who.player, env);
    const worn = await withChapterTitles(ctx, seats ? { ...who.player, seatTitles: await seatTitlesOf(ctx.db, who.player.id) } : who.player, env);   // CHAP4c: and a chapter's
    const zero = seasonZeroOf(env.SEASON_ZERO_WEEK);   // SEASON1: the Season on a title's claim
    // SCALE4f part two: THE CHARACTER'S MEMBERSHIP READ ONCE (guilds.js mintMemberOf) for the seat badge, the ribbon and the
    // guild's badge below - three reads of one row; each keeps its own law over it
    const member = renownCharacterOk(body.character) && (seats || body.guild === true) ? await mintMemberOf(ctx, who.player.id, body.character) : undefined;
    const seatBadge = seats && renownCharacterOk(body.character) ? await seatBadgeOf(ctx.db, who.player.id, body.character, seasonOf(seatWeekOf(nowS * 1000), zero)?.n ?? 0, member) : null;
    const wornT = titleWorn(worn, env);
    // CROWN1 part two: the champion's is the account's own, kept for good - no guildmaster's; SEASON1: and so are a
    // Season's crowned and keeper (seatRoyal.js keptTitleOf)
    const kept = seats && KEPT_TITLES.includes(wornT) ? await keptTitleOf(ctx.db, who.player.id, wornT, zero) : null;
    // CHAP4c: a chapter's seat's title worn only by a character of the account that holds it, with its claim - the
    // named character's own first, else none (a title a character does not hold is not signed for it)
    const chapterT = CHAPTER_TITLES.includes(wornT) && renownCharacterOk(body.character)
      ? (await chapterTitlesOfAccount(ctx.db, who.player.id, nowS, zero, body.character)).find((t) => t.title === wornT) ?? null : null;
    const seatT = KEPT_TITLES.includes(wornT) ? (kept ? { t: wornT, ts: kept.ts } : {})
      : SEAT_TITLES.includes(wornT) ? (seatBadge?.title === wornT ? { t: wornT, ts: seatBadge.ts } : {})
        : CHAPTER_TITLES.includes(wornT) ? (chapterT ? { t: chapterT.high ? 'highmaster' : wornT, ts: chapterT.ts } : {}) : (wornT ? { t: wornT } : {});   // CHAP6e: a Master's in an Ascendancy signed its High Master
    // SEASON1 part two (Seats-Arc 9.1): AND A SEASON'S BANNER RIBBON - the named character's, where its guild kept a
    // seat through the Season before and it was a member at that Season's last Turning (seatRibbons.js ribbonOf)
    const rb = seats && renownCharacterOk(body.character) ? await ribbonOf(ctx.db, who.player.id, body.character, seasonOf(seatWeekOf(nowS * 1000), zero), member) : null;
    const wardrobe = {
      ...seatT,
      g: [...glyphsOf(who.player, env, nowS), ...(seatBadge?.glyphs ?? [])],
      au: auraWorn(who.player, env),   // WB9g: the aura worn, the title's law - absent for none; AEGIS: a list's read off the config
      pi: iconWorn(who.player),   // WITCH1: the profile icon worn, the aura's law - absent for none (the character's face)
      ...(rb ? { rb } : {}),
    };
    // GLYPH-WEAR: the glyphs taken off ride BESIDE `g`, never out of it - `g` is what is true and what the relay's
    // rights read (/red, /dm); `gx` is paint, which every face that draws a badge leaves out. Absent for none.
    const gx = glyphsHidden(who.player, env, nowS);
    if (gx.length) wardrobe.gx = gx;
    // BUNNYFALL /vanish (staffCommands.js): a vanished staff member's ordinary token carries `vn` - every room plays them
    // as ever, and every game leaves them undrawn and untargeted (net/online.js `visible`, the foes' peer lists)
    if (Number(who.player.vanish_on ?? 0) === 1 && staffRole(who.player, env)) wardrobe.vn = 1;
    // MOD1: A MUTE RIDES THE TOKEN, so a reconnect cannot shed one -
    // every room reads it off the signature at the hello. Only while
    // it runs: a mute that has ended is simply absent.
    const mu = isMuted(who.player, nowS) ? mutedUntil(who.player) : undefined;
    // STAFF-PANEL5-FREEZE: AND A FREEZE, the mute's law (design doc Weak spots: "A reload sheds a freeze") - only while it
    // stands, so an unfrozen player mints the bytes they always did
    const fz = isFrozen(who.player, nowS) ? who.player.frozen_until : undefined;
    // RENOWN1: AND THE LEVEL, when the client names the character it is
    // bringing online - that character's, derived from its track now
    // (1 for a character that has earned nothing yet). The client's
    // word is only WHICH of its own characters; the number is this
    // service's. A mint naming none (an older build) carries none.
    // (RENOWN-CHAR: the named character's again - RENOWN-ACCOUNT read
    // the account's one track whichever was named.)
    // RENOWN4: and the track's TOTAL beside it in the answer (never in the token - a room needs the level, not the
    // XP): the page's own bar is drawn from it the moment the character comes online (ui/hud/hudRenown.js).
    const track = renownCharacterOk(body.character) ? ((await renownTrackOf(ctx, who.player.id, body.character)) ?? { xp: 0, level: 1 }) : null;
    const lv = track ? track.level : undefined;
    // GUILD1c: AND THE GUILD, the named character's - its id, its tag and its member row off the roster as it
    // stands now - so a room reads the tag beside the name off the signature, and routes the guild's chat to its
    // own members alone. The client never says which guild; a mint naming no character carries none.
    // AUDIT MERGE-PLUS A6: AND ONLY A MINT THAT ASKS (`guild: true`). A build from before GUILD1c names its character
    // too (RENOWN1), and a token wearing a guild is what the hub routes the guild's lines to - that build knows no
    // guild channel and filed them on its World tab, where a reply goes to everyone. It wears no guild instead.
    const guild = renownCharacterOk(body.character) && body.guild === true ? await guildBadgeOf(ctx, who.player.id, body.character, member) : null;
    // REALM-DOOR (2026-09-29, the field): AND WHETHER THAT CHARACTER IS THE REALM'S. A realm-era tab goes online only
    // as a realm character and names it here; a build from before the realm names its offline character, or none.
    // The relay refuses a 0 at its door, so online is the realm's at the servers too. Stamped on every mint, a 0
    // included: a token with no `rc` is a service from before this, which the relay still admits.
    // SCALE4f: THE FOUR READS OF ITS ROW IN ONE (realm.js realmMintFacts) - whether it is the realm's, its level, its arms
    // and its house, each exactly as its own read answered it
    const facts = await realmMintFacts(ctx, who.player.id, body.character);
    const rc = facts.rc;
    // ARENA4b: AND THAT REALM CHARACTER'S LEVEL, `cl` - the level on its tile (realm.js realmMintFacts: INT7 - the level
    // its judge trusts, else its summary, 1..1000), which the relay reads (a bout's vitality) as it reads `lv`. Absent for any
    // other character, none named, or a level out of the claim's bounds - a token without it is a token as before.
    const cl = facts.cl;
    // INT7: AND THAT REALM CHARACTER'S ARMS, `wa` - the most reach of its judged pack's lawful weapons and its bow
    // (realm.js realmMintFacts), every referee's clip of a blow between players. Absent before its first judged checkpoint.
    const wa = facts.wa;
    // ARENA4: AND THE ACCOUNT'S ARENA RATING this season, for a registered account - the hall queues by it (net/arena/arenaLaw.js
    // pairQueue), off the signature, never a word of the client's. A guest's token carries none (a guest is not queued).
    const ar = who.player.handle ? (await arenaRatingOf(ctx, who.player.id, arenaSeasonOf(nowS))).rating : undefined;
    // LEGACY7 part two: AND THAT REALM CHARACTER'S HOUSE (realm.js realmMintFacts, by legacy.js houseOn: its line's
    // surname, its given name, a Bloodline's mark, the generation's numeral) - off the line the service holds, never a
    // word of the client's
    const house = facts.house;
    // NAME-AS (2026-10-12): AND THE NAME THE ROOM READS - the account's, or, where the account chose its character's,
    // that realm character's own (`facts.name`, off the same read), where the wire can carry it and it is no other
    // account's username (accounts.js wornNameOf). Never a word of the request: the body names WHICH character, as it
    // always did, and its name is the row's.
    const nameWorn = await wornNameOf(ctx, who.player, facts.name);
    // AUDIT LEGACY III O1: AND WHICH REALM CHARACTER (`ci`, beside a 1 alone) - the relay stamps it on a wedding's frames,
    // so each half names the character its player saw. Kept when a house is left unsaid: the widest token without a
    // house is under TOKEN_MAX_CHARS with it (test/auditlegacy3)
    const signed = { s: who.player.id, n: nameWorn.name, k: accountKind(who.player), ...wardrobe, mu, lv, ...(guild ?? {}), rc, ...(rc ? { ci: body.character } : {}), ...(ar !== undefined ? { ar } : {}), ...(cl != null ? { cl } : {}), ...(wa ? { wa } : {}), ...(fz ? { fz } : {}) };
    let token = await mintToken(house ? { ...signed, ...house } : signed, key, { subtle, nowS });
    // the token's own bounds (identityToken.js TOKEN_MAX_CHARS, and AUDIT LEGACY III O11 the relay hello's TOKEN_BODY_MAX):
    // a house that would take it past either is left unsaid, never the rest
    let houseWorn = house;
    if (house && (token.length > TOKEN_MAX_CHARS || tokenBodyOf(token).length > TOKEN_BODY_MAX)) { token = await mintToken(signed, key, { subtle, nowS }); houseWorn = null; }
    return json({
      token,
      name: nameWorn.name,   // NAME-AS: the name the token signs - the room's, which the live sessions take in (NAME-ADOPT)
      accountName: displayName(who.player),   // NAME-AS: and the account's own, which the device's stored session keeps (the profile mark's)
      nameAs: nameAsOf(who.player),   // NAME-AS: the choice the name was signed under
      ...(nameWorn.why ? { nameWhy: nameWorn.why, ...(nameWorn.word ? { nameWord: nameWorn.word } : {}) } : {}),   // NAME-AS: why the character's name stood aside, absent where it did not
      kind: accountKind(who.player),
      title: wardrobe.t ?? null,
      ...(wardrobe.ts ? { ts: wardrobe.ts } : {}),   // SEAT1c: a seat title's claim, the client's to word
      glyphs: wardrobe.g,
      ...(wardrobe.gx ? { glyphsOff: wardrobe.gx } : {}),   // GLYPH-WEAR: the ones my own name leaves out, absent for none
      mutedUntil: mu ?? 0,
      frozenUntil: fz ?? 0,   // STAFF-PANEL5-FREEZE: the freeze the token carries - the game's freeze screen (net/staffChat.js)
      conduct: conductAgreed(who.player),   // SAFE7: whether the code of conduct as it stands is agreed - the client asks before a first line when not
      level: lv ?? null,
      xp: track ? track.xp : null,
      guild: guild ? guild.gt : null,   // GUILD1c: the tag my own name wears, beside the token as the level is
      aura: wardrobe.au ?? null,   // WB9g: the aura at my own feet, beside the token as the title is
      icon: wardrobe.pi ?? null,   // WITCH1: the profile icon in my own portrait well, beside the token as the aura is
      ribbon: wardrobe.rb ?? null,   // SEASON1 part two: the ribbon under my own name, beside the token as the aura is
      house: houseWorn ?? null,   // LEGACY7: the house my token wears, beside it as the ribbon is
      expiresAt: nowS + MAX_TTL_S,
    }, 200, origin);
  }

  if (path === '/v1/auth/session' && request.method === 'POST') {
    // A SECOND DEVICE, admitted by a device that is already in.
    // This is the whole of "two devices at once" and it is why a
    // session is the credential rather than the player.
    // RPT1026-SECNET: and only while that device IS in - a recovery that signed every device out while this ran
    // (accounts.js openSession's guard) leaves no device its admitted one could outlive it on
    const made = await openSession(ctx, who.player.id, body.label ?? null, { session: who.session.id });
    return made ? json(made, 200, origin) : no('auth', 401, origin);
  }

  if (path === '/v1/account' && request.method === 'GET') {
    // ACC3: THE WARDROBE IS ITS OWN FIELD and not folded into the
    // account, because it is a different KIND of fact. An account
    // view is the row; a wardrobe is the row read against this
    // service's config and clock, which is why it alone takes env.
    return json({
      // DUEL1: and the duelling record, counted off the results (the profile card's K/D); WB5b: and the gates closed
      // RENOWN1: and Renown's tracks, the most recently earned first (the card's level and its row) - RENOWN-CHAR: a
      // list of the characters' tracks again (RENOWN-ACCOUNT sent the account's one, `{ xp, level }`)
      // MARKS1: and the Marks balance, where Marks are this account's (null where not - a guest, the switch)
      account: { ...accountView(who.player, nowS), duels: await duelRecordOf(ctx, who.player.id), gates: await gateRecordOf(ctx, who.player.id), raids: await raidRecordOf(ctx, who.player.id), serpents: await serpentRecordOf(ctx, who.player.id), sds: await sdRecordOf(ctx, who.player.id), stars: await starRecordOf(ctx, who.player.id), ketch: await ketchRecordOf(ctx, who.player.id), renown: await renownTracksOf(ctx, who.player.id), marks: await marksCardOf(ctx, who.player, env) },
      wardrobe: { ...accountWardrobe(await withSeatTitles(ctx, who.player, env), env, nowS), purse: await insigniaPurse(ctx, who.player), annals: Number(who.player.eg_annals) || 0 },   // HUNTERS-MARK: the Annals' pages kept, the Collections page's   // SEAT1c: and a Charter's titles   // WB9g: and what the account's closed gates could still pay the Broker's insignia
      devices: await devicesOf(ctx, who.player.id),
      // PATREON-LINK: the card's Patreon row - whether linking is on, whether this account is linked, the titles its
      // pledge holds, and the link to follow (a state sealed for this account, under the origin that served this)
      patreon: await patreonCardOf(who.player, env, { subtle, rand, nowS, origin: url.origin }),
    }, 200, origin);
  }

  if (path === '/v1/patreon/unlink' && request.method === 'POST') {
    // PATREON-LINK: the account's Patreon taken off it, and nothing about the pledge kept. The answer is the wardrobe
    // after it (an equip's shape - a title the pledge held is no longer held, nor worn) and the card's row.
    await unlinkPatreon(ctx, who.player.id);
    const after = { ...(await withSeatTitles(ctx, who.player, env)), patreon_user: null, patreon_tiers: null, patreon_status: null, patreon_at: null };   // AUDIT SEATS-3 E2: a Charter's titles still held
    return json({ ok: true, ...accountWardrobe(after, env, nowS), patreon: await patreonCardOf(after, env, { subtle, rand, nowS, origin: url.origin }) }, 200, origin);
  }
  return NEXT;
}
