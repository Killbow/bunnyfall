// @ts-check
// ═══════════════════════════════════════════════════════════════════
// ACC1b — THE ACCOUNT SERVICE: a second Cloudflare Worker, over D1.
//
// Mac (2026-09-21): "cloud storage and account creation needed for
// accessing online mode" / "Im not rotating. Lets do this".
//
// ═══ WHY THIS IS NOT A ROUTE ON THE RELAY ══════════════════════════
//
// A relay deploy restarts every Durable Object and DROPS EVERY
// CONNECTED PLAYER. That is a fair price for changing the relay's own
// law and an absurd one for fixing the wording on a sign-in button -
// and it is not hypothetical: SLAM8 hashes the RAW BYTES of every file
// the relay bundles, comments included, so a one-line comment fix in
// `src/net/wire.js` was abandoned on 2026-09-21 rather than drop a
// room full of people (DEPLOY-PROSE). Accounts in that bundle would
// mean every auth tweak drops everyone mid-dungeon.
//
// So: two Workers, and the seam between them is a SIGNATURE. This
// service holds the private key; the relay holds the public half and
// can verify but never mint. Nothing here reaches the relay and nothing
// there reaches D1.
//
// ═══ THE WALL (ACC0) ═══════════════════════════════════════════════
//
// A GUEST GETS A TOKEN, exactly as a linked account does, and may
// connect, be seen, walk and chat. What a guest does not get is CLOUD
// SAVES - and ACC2 put that wall on the save routes below, which IS
// where the saves are: this service's job everywhere else is to say who
// somebody is, not to decide what they may do.
//
// THE REASON IS SHARPER THAN "the table says so": a guest account is
// one storage clear away from gone, which ACC0 records as the residue
// of the wall. A backup filed under a credential a player can lose by
// clearing their browser is a backup that cannot be restored, and that
// is the one promise a backup may not break.
//
//   GET  /v1/health                       -> { ok, v }
//   GET  /v1/pubkey                       -> { alg, key }   (not a secret)
//   POST /v1/auth/guest   { label?, terms, privacy } -> { id, secret, sessionId, name, kind }   (TERMS1: the versions ticked, legalLaw.js)
//   POST /v1/auth/token   { secret }      -> { token, name, kind, expiresAt }
//   POST /v1/auth/session { secret, label? } -> { secret, sessionId }   (a second device)
//   GET  /v1/account      Authorization: Bearer <secret> -> { account, wardrobe, devices[] }
//   POST /v1/auth/logout  { secret, all? }-> { revoked, scope }
//
// ACC3, the wardrobe. A player HOLDS titles by derivation and WEARS at
// most one, which is the only part of it that is a choice:
//   POST /v1/account/title { title }      -> { ok, titles[], title, glyphs[] }
// NAME-AS, which name the room reads - the account's, or the realm character's the mint is for; the token's answer
// says both (`name` the room's, `accountName` the account's), the choice (`nameAs`) and, where the character's could
// not be worn, why (`nameWhy`, `nameWord`):
//   POST /v1/account/name { as }          -> { ok, nameAs }
// ACC4, time played. A beat carries no number - this clock measures:
//   POST /v1/account/played {}            -> { playedS }
// MOD1, moderation. The caller must be a moderator or a developer:
//   POST /v1/mod/mute { target, minutes } -> { ok, target, name, until, order }   (SAFE4: and its act in the record, the order pushed to the relay's door)
// SAFE1-SAFE8 (bible/11-Multiplayer/Chat-Safety-Arc.md), THE CHAT'S SAFETY:
//   POST /v1/safety/blocks {}                        -> { ok, blocks: [{ sub, name, at }] }   (SAFE1: my block list)
//   POST /v1/safety/block { target }                 -> { ok, blocks }   /v1/safety/unblock { target } the same
//   POST /v1/safety/report { target, reason, note?, lines: [{ tab, sub, name, at, text, sg }] } -> { ok, case, repeat?, muted?, order? }   (SAFE3: every line's stamp checked)
//   POST /v1/safety/conduct { v }                    -> { ok, conduct }   (SAFE7: the code of conduct agreed)
//   POST /v1/safety/staff-messages {}                -> { ok, messages: [{ id, from, text, at }] }   (STAFF-PANEL5-MESSAGE: staff's, waiting)
//   POST /v1/safety/staff-message-ok { id }          -> { ok, marked }   (STAFF-PANEL5-MESSAGE: the player pressed OK)
//   POST /v1/mod/ban { target?, name?, days, reason? } -> { ok, target, name, until, reason, order }   (SAFE4: a moderator's; days 0 for good)
//   POST /v1/mod/unban { target?, name? }            -> { ok, target, name, until: 0, order }
//   POST /v1/mod/strikes { target?, name? }          -> { ok, target, name, strikes, next, mutedUntil, bannedUntil, banReason, history }
//   POST /v1/mod/grant-feed  <batch>                 -> { ok, read }   (GRANT2: a cell's window of spawn grant asks, signed - x-relay-grant-sig)
//   POST /v1/discord/interactions <interaction>      -> Discord's answer   (SAFE8: signed - x-signature-ed25519, x-signature-timestamp)
// A BANNED ACCOUNT is answered 403 { error: 'banned', until, reason } on every door behind a session but signing out.
// PRIVATE-REPORT, a registered player's private report to the readers REPORT_READER_HANDLES names (reports.js):
//   POST /v1/report/send { kind, subject, body, context?, rid } -> { ok, id, sentAt } | { ok, repeat, id, sentAt }
//   POST /v1/report/mine {}                    -> { reports: [{ id, kind, subject, sentAt, read, state }], max }
//   POST /v1/report/inbox { which? }           -> { which, reports: [{ ...head, from }], unread, open, max }   (a reader's)
//   POST /v1/report/read { id }                -> { report: { ...head, from, body, context, closedAt } }   (a reader's)
//   POST /v1/report/close { id, state }        -> { ok, id, state }   (a reader's: fixed | wontfix | duplicate | open)
// CUSTOMS-PASS, a developer alone - one character of one account through customs (tools/customsPass.mjs):
//   POST /v1/mod/customs-pass { name | account, revoke? } -> { ok, target, name, open, changed }
//   POST /v1/mod/realm-holds | realm-findings { id } | realm-clear { id, note? } | realm-hold { id, note? }
//        | realm-rollback { id, note? } | realm-budget { days?, set? }   INT6: the review of the judge's verdicts (review.js)
//        | realm-bodies { days? }   INT14: the boss fights' count, measured (review.js bodiesMeasure)
//        | realm-grants { days? }   GRANT2: the spawn grants' asks, measured (grants.js grantsMeasure)
//        | realm-gains { days? } | realm-trades { id }   HACKED-GOLD: who gained past the bucket; a character's trades (review.js)
//        | realm-characters { name } | realm-repair { id, ticket, faction, flag, gold, note? }   SUMMON-REPAIR: an account's
//          realm characters by handle; one character mended by staff - a flag bit cleared, gold given back, once a ticket
//        | realm-mend { id, ticket, was, gold, note? }   PURSE-MEND: a purse a wrapped sale left below nothing set to nothing, what
//          the character is owed given as a letter of credit, once a ticket - and the law's hold lifted when the purse was all it held on
// DUEL1, the duelling record. The caller of `loss` is the loser:
//   POST /v1/duel/loss   { winner }       -> { recorded, wins, losses }
//   POST /v1/duel/record { id }           -> { id, wins, losses, gates }
// WB5b, the gates closed. The caller is the account the receipt names:
//   POST /v1/serpent/claim { receipt, character, name?, cid? } -> { recorded, slain, renown, spoils, order, marks?, title?, aura?, titleNew?, auraNew? }   (SERPENT1: a sea serpent's receipt; SERPENT-SET: `marks` its silver where it recorded); SERPENT5: the Old Coil's grants on its first write
//   POST /v1/sd/claim    { receipt } -> { recorded, slot?, title?, aura?, broken }   (SD9b: a Brass Remnant's receipt - an Hour broken; Hourbreaker and The Turning Hour rolled on its first write)
//   POST /v1/ketch/claim { receipt } -> { recorded, voyage?, share, why?, sailed, guest? }   (KETCH: a Tonal Warden's receipt - the Ketchmaster's hold, once a voyage an account; `taken` another crew's this week)
//   POST /v1/eg/keys     {} -> { keys, live, rehearsal, proven, redoubts, sink, annals, feats, first }   (EG-PLAY: the Weir Keys held, the live breach; EG-E1: `sink` the week's Panoply sale, { week, piece }; EG-E2: the Annals' pages kept, each lord's feats; EG-ZF: the first-time lines shown - and First of the Spire's letter, once, to an account its list names)
//   POST /v1/eg/first    { bits } -> { first }   (EG-ZF: the first-time lines a client showed, OR'ed onto the account - guest 403, bits 400)
//   POST /v1/eg/open     { rq, rh?, ew?, wg?, again? } -> { order, b, ez, keys, until, rh, at? }   (EG-PLAY: a key staked - or the day's Rehearsal - and the open order signed; idempotent on `rq`; EG-F: `ew` the start Redoubt, `wg` the Wager; AUDIT EG IV: `again` 1 the stake `rq` took asked after a lost answer - its order as of its `at`, none taken; refused guest 403, unproven 403, start 403 (`w`), rq/wager 400, live 409 (`b`), short 409 (`keys`), rehearsed 409, spent 409, none 404)
//   POST /v1/eg/admit    { b } -> { order, b }   (EG-PLAY: a member's admission order; one live breach an account; refused guest 403, breach 400 (no stake opened it), spent 409 (its stake settled or its open window past), start 403 (`w`), live 409 (`b`))
//   POST /v1/eg/claim    { receipt, character? } -> { recorded, q, b, w?, keys, ... }   (EG-PLAY: an `e1` - a Redoubt taken, a member's end, a void; EG-E1: a Redoubt's `paid`, `again`, `marks`, `deed`, `embers`, `purse`, `weir`, `pity`, an end's `rl`; EG-ZF: an end's `board`, the member's standing - { k: 'descent', br, rank } or { k: 'depths', rank }; EG-E2: `honours`, the titles a Redoubt newly granted)
//   POST /v1/eg/sink     { piece, rid? } -> { ok, piece, week, purse, again? }   (EG-E1: the Broker's Panoply piece, once a week for 20 embers - guest 403, piece 400, bought / short 409; AUDIT FB1024: `rid` the press's request id - fenced 409, rid 400, `again` the same press asked again)
//   POST /v1/broker/settle { rid, nonce } -> { held: false } | { held: true, kind, item, by, week?, ...wardrobe }   (AUDIT FB1024, BROKER-RID: a Broker sale whose answer was lost, asked after by its request id - the sale it wrote, or the id fenced; `by` the first ask's nonce; guest 403, rid 400)
//   POST /v1/eg/board    {} -> { ok, season, descent: { alone, few, company }, depths, deepest, proclamation, best }   (EG-E2: the Elite Breach's three boards - egHonours.js)
//   POST /v1/eg/find     { tier } -> { found, keys, asks }   (EG-E3: a dungeon elite's find - 'super' | 'elite' | 'regular', the service's die, 6 asks a tier a day, 2 keys a week)
//   POST /v1/eg/starts   { subs } -> { starts: { [sub]: [w, ..., 0] | null }, keys, rehearsal, rk }   (EG-F: the start window's preflight - which starts each member may make)
//   POST /v1/lamp/claim  {} -> { granted, why? }   (LAMP-KEEPER II: a lamp keeper spoken to - I Love Lamp, laid once on the row; `why` 'held' | 'guest')
//   POST /v1/ql/claim    { line, step, phase, choice? } -> { opened } | { witnessed, title?, key?, keys? } | { why }   (QL12: a questline's step - `open` writes its opening, a guest's too; `end` reads its endgame receipt, claimed in the line's window and order; a line's title once, the Covens' Hoard's Weir Key once an account; `why` 'unpaid' | 'guest'; behind QUESTLINES_OPEN - 403 ql-closed, 400 ql-body)
//   POST /v1/gate/claim  { receipt, region?, character? } -> { recorded, stones, closed, seat? }   (WB12d: the row's embers, AUDIT WB12d A4; SEAT1b: `seat` the kill's influence)
// MARKS1, Marks - an account's alone, behind MARKS_OPEN (marks.js); `rid` the act's own id:
//   POST /v1/marks/balance {}                               -> { balance, today, bank }
//   POST /v1/marks/exchange { marks, rid }                  -> { ok, marks, gold, balance, exchangedToday } | { repeat, ... }
//   POST /v1/marks/find { kind, rid }                       -> { ok, struck, balance, today, why? } | { repeat, ... }   (SILVER-FINDS: a loot find)
//   POST /v1/marks/guild/deposit { character, marks, rid }  -> { ok, marks, balance, guildMarks }
//   POST /v1/marks/guild/withdraw { character, marks, rid } -> { ok, marks, balance, guildMarks }
//   POST /v1/marks/report {}                                -> the week's report (a developer's)
//   and /v1/gate/claim's answer carries `marks` - the gate's strike - where it recorded
// NOTICE1, the Notice Board - read by anyone BOARD_OPEN lets in, written by registered accounts (board.js):
//   POST /v1/board/read { map }                                   -> { map, notices, notes, me }
//   POST /v1/board/pin { map, subject, body, days, button?, rid } -> { ok, note, live } | { ok, repeat, note }
//   POST /v1/board/take-down { id }                               -> { ok, id, live }
//   POST /v1/board/report { id }                                  -> { ok, id }
//   POST /v1/board/mod/remove { id } | /v1/board/mod/restore { id } -> { ok, id, act }   (a moderator's)
//   POST /v1/board/notice { subject, body, days } | /v1/board/notice/remove { id }       (a developer's)
// PROF1, the professions - a registered account's character's, behind PROFESSIONS_OPEN (professions.js); `rid` the act's id:
//   POST /v1/prof/state { character }                                  -> { tracks, today, taken, stores, writs, caps, hunt }   (PROF7: the account's hides today)
//   POST /v1/prof/pixels { character, pixels: [[x, y]...] }            -> { pixels: [{ x, y, state, climate?, region? }] }
//   POST /v1/prof/harvest { character, node, kind, climate, region, act, at, rid, foe? } -> { ok, material, qty, xp, track, today, store, gem?, extra?, extraQty?, hunt? } | { repeat, ... }   (PROF7: a body's `foe`, no ground)
//        BAG1: { carry: true, held, heldKey?, seen? } lands the goods in the carried count - `held` what the bag and pack
//        hold of `heldKey`, the count cut to it only when `seen` (the count the client last heard) is the service's own,
//        decided once a request (prof_carried_gate) - and a Motherlode's strike (PROF2b) the same  -> { ..., carry, carried }
//   POST /v1/prof/spec { character, profession, rank, spec, rid }      -> { ok, track, marks?, balance? }
//   POST /v1/prof/smelt { character, recipe, count, clean?, rid }      -> { ok, recipe, count, own, bought, xp, first?, clean?, track, stores } | { repeat, ... }   (PROF2; PROF4 the burns and saws; PROF7 the loom's cures and weave - a weave's `track` null; PROF11 the mason's bench's cut and mix - `clean` the chisel's, `first` its 500)
//   POST /v1/prof/craft { character, recipe, clean, name?, heartwood?, dye?, cracked?, mint?, rid } -> { ok, recipe, quality, count, seed, maker, marked, xp, first, heartwood, dye, hand?, pieces, track, stores } | { repeat, ... }   (PROF3 the anvil; PROF4 the workbench; PROF7 the loom and a garment's `dye`; PROF11 the Sculptor's stone decor; PROF9 the fire's dishes and a dish's `hand`; PROF10 the jeweller's bench - a piece's `hand`, a Lapidary's `cracked` gem; JEWEL-KIN the `mint` its client mints, net/productRecord.js craftMintVersion)
//   POST /v1/prof/brew { character, potion, keys, seat?, rid } -> { ok, potion, keys, count, potent, unbruised, steps, xp, first, track, stores } | { repeat, ... }   (PROF12: Alchemy's brewing act - DFU's own recipe law on the Stores' cauldron; Potent rolled, the Apothecary's steps)
//   POST /v1/prof/disenchant { character, provenance, rid, realm? } -> { ok, provenance, recipe, points, essence, origin, xp, track, store, realm? } | { repeat, ... } | { error: 'prof-no-piece', why? }   (PROF12: a crafted piece into Arcane Essence, gone; AUDIT PROF-541 B2: a realm character's out of its record - `realm` where it stands, `realm.seq` the record's new sequence, `why: 'disenchanted'` a piece this account's disenchant took)
//   POST /v1/prof/stock { character, material, qty, rid }             -> { ok, ... } | { repeat, ... }   (PROF3 the smith's stock; PROF4 the furnisher's; PROF5 the Weavers')
//   POST /v1/prof/temper { character, recipe, quality, provenance?, rid } -> { ok, recipe, quality, provenance, record?, xp, track, stores } | { repeat, ... }   (CRAFT4: a piece a quality step better, up to Superior)
//   POST /v1/prof/reforge { character, tier, rid, choose: true }                     -> { ok, tier, essence, track, store } | { repeat, ... }
//   POST /v1/stores/withdraw { character, material, qty, rid }         -> { ok, material, qty, store } | { repeat, ... }
//        BAG1: { carry: true, held, seen? } counts the units as carried -> { ..., carry, carried }
//   POST /v1/stores/deposit { character, material, qty, held, order, rid, seen? } -> { ok, material, qty, own, bought, gold, loose?, store, carried } | { repeat, ... }   (BAG1: `order` 'all' or 'spend'; a deposit made is answered as made, for good - prof_deposits; BAG-CRAFT: 'work', a station's, moves `loose` units the count does not hold too)
//   POST /v1/writs/list { character, region }                          -> { region, day, endsAt, writs, today, crafts: { writs, today } }   (CRAFT-WRITS: the character's crafting writs)
//   POST /v1/writs/deliver { character, id, rid }                      -> { ok, writ, pay, balance, track, store, today, renown, order } | { repeat, ... }
//   POST /v1/writs/craft { character, id, rid, realm, pieces? }        -> { ok, writ, pay, xp, balance, track, today, renown, realm, order } | { repeat, ... }   (CRAFT-WRITS: a crafting writ filled, its goods out of the realm record)
// RENOWN1, Renown. The caller's own character, by the id its
// save carries (RENOWN-CHAR: a track a character again - RENOWN-ACCOUNT
// kept one an account for a day); the level rides the token when the
// mint names one:
//   POST /v1/renown/xp { character, xp, name?, rid?, region? } -> { character, xp, level, credited, rose, order, max?, repeat? }   (SEAT1b: `region` where it was earned)
// FIRM1, THE FIRMAMENT (firmament.js; the law src/net/firmament/firmamentLaw.js): a character's passive tree, its Stars the Renown
// track's and its Craft points the profession tracks', every change the whole tree judged by the law, a refund's silver
// burnt in the change's batch. Behind FIRMAMENT_OPEN:
//   POST /v1/firmament/state { character }            -> { tree, renown, stars, craft, ranks, left, freeRespec, refund }
//   POST /v1/firmament/set { character, tree, rid }   -> { ...state, silver, balance? } | { repeat, ... }
//   POST /v1/firmament/respec { character, rid, realm?, region?, free? } -> { ...state, respec, gold, realm? } (the whole sky back for 10,000 gold, or free once with the 0206 mark)
//   POST /v1/auth/token { character? }    -> { ..., level, xp }   (RENOWN4: xp, the track's total)
//   (REALM-DOOR: the token says whether that character is one of the account's realm characters, `rc`)
//   (ARENA4b: and, for a realm character, the level on its tile - its summary's - as `cl`, 1..1000)
// CHAP1, THE ROLL (bible/11-Multiplayer/Chapters-Arc.md 3): a realm character's standing with Daggerfall's own guilds -
// the twenty-two guild factions' reputation and its memberships - kept here, under the playing tab's lease, while
// CHAPTERS_OPEN lets the account in (npcRoll.js; the law src/net/npcChapterLaw.js):
//   POST /v1/chapters/roll { character, lease, seed? } -> { roll, from, seeded? } | { roll: null }   (seeded once from the save - a customs crossing from the epoch capped; what is owed paid)
//   POST /v1/chapters/claim { character, lease, rid, deltas, members } -> { roll, credited } | { roll, repeat }   (a loss whole, a gain at the day's pace and the rest owed)
//   POST /v1/chapters/witness { hall: { key, region, factions } } -> { ok, counted, why? }   (CHAP2a: a town's guild halls, witnessed as a seat is)
//   POST /v1/chapters/halls { region } -> { region, towns: [{ key, state, region, factions, witnesses, audit }], ignored }   (AUDIT CHAP2 E1: a developer's audit list)
//   POST /v1/chapters/strike { key } -> { ok, key, reports }   (AUDIT CHAP2 E1: a false town struck, a developer's)
//   POST /v1/chapters/list {} -> { week, chapters: [{ f, region, strength, band, seats: [{ seat, name }] }] }   (CHAP3b: the chapter sheet, the Turnings due settled first; CHAP5a its seats' holders)
//   POST /v1/chapters/focus { character, faction, region, focus } -> { ok, focus, week } | { error }   (CHAP4d: a Master's Focus)
//   POST /v1/chapters/history { region } -> { rows: [{ faction, week, kind, data, name }], zero }   (CHAP4d: a region's Chronicle; AUDIT CHAP4 R10)
//   POST /v1/chapters/back { character, faction, region, side } -> { ok, event, side } | { error }   (CHAP6b: a Schism's side, a Succession's candidate)
//   POST /v1/chapters/patron { character, faction, region, marks, rid } -> { ok, season, marks, guildMarks } | { error }   (CHAP7a: a guild's bid for a chapter's patronage)
// TOWN-ECON TE2 (bible/06-Systems/Town-Economy-Arc.md section 4; AUDIT TOWN-ECON 2 SVC-13: its own list, out of the chapters'):
//   POST /v1/towns/econ {} -> { ok, towns: [[map, share], ...] }   (every town's players' share of 1 or more, kept by the clock - SVC-3)
//   POST /v1/towns/witness { town: { map, px, py, region, location }, receipt } -> { ok, counted, confirmed?, why? }   (the town registry, witnessed as a seat is; SVC-1: a Watch tick at its pixel)
//   POST /v1/towns/watch { receipts, sea? } -> { ok, counted, sea, why, full }   (the Watch's ticks walked in a confirmed town, capped a town a day; SEA-TRADE: `sea` the ticks that vouch a dealing at a port's exchange)
//   POST /v1/towns/strike { map } -> { ok, map, reports }   (SVC-1: a false town struck, a developer's)
//   POST /v1/towns/audit { region } -> { ok, towns: [{ map, px, py, location, at, by }] }   (SVC-1: a region's confirmed towns, a developer's)
// ARENA4b, the arena online's second half: a bout's Renown on its claim, and the homes the arena displaced:
//   POST /v1/arena/claim { receipt, character?, name? } -> { ...ARENA4's, renown?, order? }   (a ladder win, a rated players' win)
//   POST /v1/arena/attempt { tier, bout, room } -> { ticket, tier, bout, room, forfeits } | 409 { error: 'order', ladder } | 403 { error: 'ladder-needs-account' }   (AUDIT ARENA-LADDER: a ladder attempt's ticket, for one room)
//   POST /v1/homes/arena-move { mapId, from, to, character, realm? } -> { ok, from, to, refund, pieces, items, tenancies, withdrawn, hidden, hall?, realm?, repeat? }
//   POST /v1/homes/arena-moves { character }           -> { moves: [{ mapId, from, to, refund, movedAt, hall? }] }   (not yet read)
//   POST /v1/homes/arena-seen { mapId, from }          -> { ok, seen }
// FIELD BUGS 2026-10-04d KNIGHT-HOUSE, a deed the realm gave (a Knightly Order's house) held off the record, and its hold
// given up as the deed sells at the bank:
//   POST /v1/homes/deed { mapId, buildingKey, region, character, layout } -> { ok, home } | { ok, repeat }
//   POST /v1/homes/release { mapId, buildingKey, deed: true }  -> { ok, price: 0, decorCount: 0, decorBack: 0 }
// HOME-VOTE, a registered account's word on another's home (homeVotes.js; /v1/homes/town's homes carry `score` and the
// caller's `vote`):
//   POST /v1/homes/vote { mapId, buildingKey, vote: 1 | -1 | 0 } -> { ok, mapId, buildingKey, vote, score }
// GUESTBOOK (guestbook.js): a visitor's line at a home's door, and its insiders' read of the book:
//   POST /v1/homes/guestbook/sign { mapId, buildingKey, name, text } -> { ok }
//   POST /v1/homes/guestbook/read { mapId, buildingKey }             -> { ok, lines: [{ name, text, at }] }
// PLAYER-FESTIVALS (playerFestival.js): a festival a registered account hosts, and the ones standing now:
//   POST /v1/festivals/host { mapId, town, host, name, text } -> { ok, festival }
//   POST /v1/festivals/list {}                                  -> { ok, festivals: [{ id, host, mapId, town, name, text, startsAt, endsAt, mine }] }
// PATREON-LINK, a patron's own Patreon (patreon.js) - /v1/account's answer carries `patreon: { on, linked, titles,
// link }`, `link` the authorize URL with a state sealed for the account; the next three answer a browser and Patreon:
//   GET  /v1/patreon/callback ?code&state  -> a page asking which game account, with the yes's ticket
//   POST /v1/patreon/confirm  ticket=...   -> a page: linked, with what Patreon says NOW (a form, not JSON - the page posts it)
//   POST /v1/patreon/webhook  <member>     -> { ok, applied }   (X-Patreon-Signature: HMAC-MD5 under the webhook secret)
//   POST /v1/patreon/unlink   {}           -> { ok, titles, title, glyphs, auras, aura, insignia, patreon }   (an equip's shape)
//
// ACC2, and every one of them needs a REGISTERED account (the wall):
//   GET    /v1/saves                                   -> { saves[] }
//   PUT    /v1/saves/{charId}/{name}       <card JSON>  -> { ok, created }
//   PUT    /v1/saves/{charId}/{name}/data  <raw blob>   -> { ok, bytes }
//   PUT    /v1/saves/{charId}/{name}/shot  <raw blob>   -> { ok, bytes }
//   GET    /v1/saves/{charId}/{name}/data              -> the blob
//   GET    /v1/saves/{charId}/{name}/shot              -> the blob
//   DELETE /v1/saves/{charId}/{name}                   -> { ok }
//
// Bindings (wrangler.toml): env.DB (D1), env.ALLOWED_ORIGIN,
// env.ACCOUNT_VERSION, and the signing pair, which the deploy mints
// ONCE and puts in with `wrangler secret put` - never into the toml,
// which is committed:
//
//   env.IDENTITY_PRIVATE_KEY  base64 PKCS8 Ed25519. A SECRET. It is
//                             what makes a token believable and it is
//                             never read back out of Cloudflare.
//   env.IDENTITY_PUBLIC_KEY   base64url raw. NOT a secret - /v1/pubkey
//                             hands it to anybody who asks. It lives
//                             beside the private half because the pair
//                             is minted where no person is watching,
//                             and a verifying key nobody can read again
//                             would have to be re-minted, which
//                             invalidates every token already issued.
//
// THE SECRET IS A BEARER CREDENTIAL, so it rides in the
// `Authorization: Bearer` header, or in the BODY of a POST. NEVER in a
// query string - AUDIT-ACC F13 found `/v1/account` reading `?secret=`,
// excused at the time as "read-only, and a slice that makes it do more
// must move it". That excuse answers the wrong risk: the hazard is not
// that the route mutates, it is that a URL is written into Cloudflare's
// request logs, into a Referer, and into browser history. Read-only or
// not, the credential was in all three.
// ═══════════════════════════════════════════════════════════════════

import { readSwitches } from './bunnyfall.js';   // BUNNYFALL: the friends' server's switches
import {
  createGuest, resolveSession, 
  login, recover, overRate, overAccountRate, accountRateFull,
  legalRefusal,
  ACCOUNT_MAX, ACCOUNT_WINDOW_S,
} from './accounts.js';
import { TOKEN_V } from '../../src/net/identityToken.js';
import { ACCOUNT_VERSION, MAX_BODY_BYTES, ROUTES, OPEN_ROUTES, PATREON_OPEN_ROUTES, SAFE_OPEN_ROUTES, STAFF_ROUTES, savePathOf, realmPathOf, poiPathOf, maintaining, routeDb, d1BookmarkOf, D1_BOOKMARK_RE, shedding } from './service.js';   // SCALE4d: the routes a read replica may serve, and the session they are served on
import { getPoiAsset, poiLiveFeed, poiHeldVersion, poiFeedTag } from './poi.js';   // POI-1: the POI store - builders draft, an approver decides, the feed is what is live; POI-4b: the library's shelf
import { takeGrantMeasure, GRANT_FEED_PATH } from './grants.js';   // GRANT2: the spawn grants' measure, the relay's door in
import { GRANT_MEASURE_SIG_HEADER, GRANT_MEASURE_MAX_BYTES } from '../../src/net/grantMeasure.js';
import { takeNetFeed, NET_FEED_PATH } from './staffNet.js';   // STAFF-PANEL5-FEEDS: the relay's net feed, its door in
import { takeReactionFeed, REACTION_FEED_PATH } from './staffReactions.js';   // STAFF-PANEL5-FEEDS: the bot check's episodes, their door in
import { STAFF_FEED_SIG_HEADER, STAFF_FEED_MAX_BYTES } from '../../server/src/staffFeedLaw.js';
import { withHonours } from './honours.js';   // SIGN-BATCH: the three games' honours on a badge's row, in one batch
import { ARENA_HONOUR_PATHS } from './arena.js';   // ARENA4: the arena's records, its board, its banners, and the honours the mint reads
import { LOST_BODY_MAX } from '../../src/net/lostLaw.js';
import { REPORT_BODY_BYTES } from '../../src/net/reportLaw.js';
import { withEgHonours } from './egHonours.js';   // EG-E2: the Elite Breach's boards, and Spire Champion on the row
import { SKIN_BODY_MAX } from '../../src/net/skinLaw.js';
import { siegesLive } from './seatBattles.js';   // SEAT2a: the battles' week

import { yardsKept } from './decor.js';   // YARD-SHED: a town's yards kept   // DECOR1: an online home's decor; BASE-HIDE: what its owner took out
import { DECOR_BATCH_BYTES } from '../../src/net/decorLaw.js';
import { TEMPLATE_BODY_BYTES } from '../../src/net/decoratorLaw.js';
import { DISCORD_BOT_ROUTE, DISCORD_GAME_ROUTE, discordBotAuthorized, discordBotAction, discordGameAction } from './discordIntegration.js';
import { doorReads } from './door.js';   // PRIMARY-FOLD: the door's reads in one trip
import { passRoute, passKey, mintPass, readPass, passMintable } from './sessionPass.js';   // SESSION-SIGN: the hot routes believe a pass
import { SESSION_PASS_HEADER } from '../../src/net/sessionPassLaw.js';   // SESSION-SIGN: its one name on the wire
import { PROGRESS_ROUTES, seatRefusalOf, progressConfig, progressRoom } from './progress.js';   // INT16-INT17: a progression claim's seat, and the play that pays for it
import { REALM_TRADE_BODY_MAX } from './realmTrade.js';
import { poiActPath, POI_ACT_BODY_MAX } from './poiTrade.js';   // POI v2: a live POI's trades and events, settled on a realm character   // REALM P2.1: a trade, settled here
import { LINEAGE_BODY_MAX } from './legacy.js';   // LEGACY7: Project Legacy's lines and the tombstone; REZ-BLOODLINE AUDIT R1: a Resurrect inside its hold
import { measured } from './metrics.js';   // SCALE1: every request counted (Workers Analytics Engine); AUDIT SCALE II A-3: a heartbeat's parts, of the body the route read
import { runCron } from './cron.js';   // SCALE4b: the service's own clock
import { bannedAnswer, REPORT_BODY_MAX } from './safety.js';   // SAFE1-SAFE7: the chat's safety
import { isBanned } from './sanctions.js';   // SAFE4: the record, the ladder and the ban
import { freezeRefusal } from './staffFreeze.js';   // STAFF-PANEL5-FREEZE: the freeze gate and the player's staff chat
import { staffRoute, STAFF_STATUS, STAFF_SESSION_HEADER } from './staff.js';   // STAFF-PANEL1: the staff panel's sign-in, sessions, roles and audit log
import { takeHiddenSeen } from './staffHidden.js';   // STAFF-PANEL5-HIDDEN: a hidden staff member's token, and a private home it entered
import { HIDDEN_SEEN_PATH, HIDDEN_SEEN_MAX_BYTES, HIDDEN_SEEN_SIG_HEADER } from '../../src/net/hiddenSeen.js';
import { discordSigned, discordInteraction, DISCORD_BODY_MAX } from './discord.js';   // SAFE8: the moderators' queue in Discord
import { ADMIT_ROUTES, admitWait } from './admit.js';   // ADMIT-LINE: the sign-in line
export { AdmitGate } from './admit.js';   // ADMIT-LINE: the line's Durable Object (wrangler.toml binds it from this module)
import {
  patreonLinkOn, openPatreon, sealPatreon, patreonExchange, patreonIdentity, linkPatreon, patreonWebhook,
  pledgeTitles, patreonHtml, patreonPage, patreonConfirmPage, patreonLinkedPage,
  PATREON_PAGES, PATREON_TICKET_S, PATREON_HOOK_MAX_BYTES, PATREON_CALLBACK_PATH,
} from './patreon.js';   // PATREON-LINK: a patron's own Patreon, linked

// THIS MODULE EXPORTS `default` AND NOTHING ELSE, and that is a
// runtime requirement rather than a preference: in a module Worker
// every named export of the entrypoint is read as an entrypoint, and
// a plain constant is not one - workerd refuses to start. AUDIT-ACC
// F2 found it by booting the Worker; no node test could, because the
// tests imported the very names that were breaking it. What this
// service IS lives in service.js; what it signs with lives in
// signing.js; both are imported here and by the pins.

import {
  json, no, POI_OPEN_MAX, poiAssetResponse, thrown, overloaded, readCapped,
  readBody
} from './routeHelpers.js';
import { NEXT } from './routes/next.js';
import { accountRoutes } from './routes/accountRoutes.js';
import { playRoutes } from './routes/playRoutes.js';
import { townRoutes } from './routes/townRoutes.js';
import { seatsRoutes } from './routes/seatsRoutes.js';
import { worldRoutes } from './routes/worldRoutes.js';
import { mailRoutes } from './routes/mailRoutes.js';
import { storageRoutes } from './routes/storageRoutes.js';

// SCALE1: THE SERVICE, and below it the handler workerd calls - which serves it and counts it (metrics.js). The
// service is a plain object, not an export: this module still exports `default` and nothing else.
const service = {
  /** SCALE4g: THE ANSWER CARRIES ITS SESSION'S NEWEST BOOKMARK (`x-d1-bookmark`, exposed to the page), so the tab's next
   *  read starts no older than everything this one saw and wrote - the routes `route` answers are untouched.
   *  AUDIT SCALE II A-3: `said` is what the route tells the metrics point (metrics.js measured) - a heartbeat's parts. */
  async fetch(request, env, said = { parts: '' }, exec = null) {
    const held = { session: null, said, exec, pass: null };
    const res = await service.route(request, env, held);
    let mark = null;
    try { mark = held.session?.getBookmark?.() ?? null; } catch { mark = null; }
    const marked = typeof mark === 'string' && D1_BOOKMARK_RE.test(mark);
    if (!marked && !held.pass) return res;
    const out = new Response(res.body, res);   // its status and headers, copied - a copy's headers may be set
    if (marked) { out.headers.set('x-d1-bookmark', mark); out.headers.append('access-control-expose-headers', 'x-d1-bookmark'); }
    if (held.pass) { out.headers.set(SESSION_PASS_HEADER, held.pass); out.headers.append('access-control-expose-headers', SESSION_PASS_HEADER); }   // SESSION-SIGN: the pass a lookup on a hot route minted
    return out;
  },
  async route(request, env, held = { session: null, said: { parts: '' }, pass: null }) {
    const subtle = crypto.subtle;
    const rand = (b) => crypto.getRandomValues(b);
    const nowS = Math.floor(Date.now() / 1000);
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/accounts(?=\/)/, '');   // BUNNYFALL: the service under /accounts on its own domain (src/net/selfHost.js), or bare

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, x-realm-lease, x-realm-seq, x-realm-summary, x-d1-bookmark, if-none-match, x-session-pass, x-staff-session',   // REALM P1: a checkpoint's lease, sequence and tile; SCALE4g: the tab's D1 bookmark; POI-1: the feed version a game holds; SESSION-SIGN: the session's pass
          'access-control-max-age': '86400',
        },
      });
    }

    // SEAT2a part three: THE DEPLOY BLACKOUT'S QUESTION (Seats-Arc 17) - public, as the health is: whether any battle is
    // live or starts within thirty minutes, and the latest end among them. It names no guild.
    if (path === '/v1/seats/sieges/live') {
      if (request.method !== 'GET') return no('method', 405, origin);
      if (!env.DB) return no('no-database', 503, origin);
      try {
        return json(await siegesLive(env.DB, Math.floor(Date.now() / 1000)), 200, origin);
      } catch (e) {
        return thrown(path, e, origin);   // HOMES-SHED: above the try below, so its own
      }
    }
    if (path === '/v1/health') return json({ ok: true, v: env.ACCOUNT_VERSION || ACCOUNT_VERSION, ...(maintaining(env) ? { maintenance: true } : {}) }, 200, origin);   // RESTORE: and whether it is held for maintenance

    // ACC1-CI: THE SERVICE PUBLISHES ITS OWN PUBLIC KEY, and that is the
    // whole point of it being public. The pair is minted by the deploy
    // and neither half is ever typed by a person, so without this the
    // public key would exist only in the run log that minted it - and a
    // verifying key nobody can read again is a verifying key that has to
    // be re-minted, which invalidates every token already issued.
    //
    // It is served openly, before any credential, because A PUBLIC KEY
    // CAN VERIFY AND CANNOT MINT. Anyone may check a token this service
    // signed; nobody may sign one.
    if (path === '/v1/pubkey') {
      const pub = String(env.IDENTITY_PUBLIC_KEY ?? '');
      return pub
        ? json({ alg: TOKEN_V, key: pub }, 200, origin)
        : no('no-signing-key', 503, origin);
    }
    // GRANT3 (bible/11-Multiplayer/Spawn-Grants.md section 13): THE RELAY'S PUBLIC HALF, as openly - every reader checks a
    // spawn grant's signature with it, a guest's game too (the Elite Gates' `rk` rides /v1/eg/keys, a signed-in route a
    // guest's client never asks). It verifies the relay's signatures and mints nothing.
    if (path === '/v1/relaykey') {
      const rk = String(env.GATE_PUBLIC_KEY ?? '');
      return rk ? json({ rk }, 200, origin) : no('no-relay-key', 503, origin);
    }

    // RESTORE (2026-09-29, Mac: "I want people to get their stuff back"): HELD FOR MAINTENANCE. The history restore
    // (.github/workflows/realm-restore.yml) rewinds the database for a minute to read what was lost, and puts it back;
    // anything written in between would vanish with the rewind. So the job deploys this Worker with MAINTENANCE = "1"
    // first, and every call but the two above is refused for that minute - 503, which a playing tab's checkpoint waits
    // out and sends again (systems/realmSaves.js), never a write that is silently lost. The job's own last step deploys
    // it again without the switch; any deploy does.
    if (maintaining(env)) return no('maintenance', 503, origin);

    // A PATH NOBODY SERVES IS A 404, and it is answered HERE - before
    // the credential is looked at. The first cut checked auth first,
    // which made every unknown path answer 401 to a caller with no
    // secret: technically a shade harder to enumerate, and in practice
    // a lie that costs an afternoon the first time somebody typos a
    // route. The paths this service serves are in this file and in the
    // repo; they are not the secret.
    // ACC2: a save route carries the slot IN the path, so it is matched
    // rather than looked up - and it is asked here, beside the Set, so
    // there is still exactly one place that decides a path is a 404.
    const slot = savePathOf(path);
    const realmSlot = realmPathOf(path);   // REALM P1: a realm character's save, matched as a save slot is
    const poiPath = poiPathOf(path);   // POI-1: the POI store's paths, matched the same way
    if (!ROUTES.has(path) && !slot && !realmSlot && !poiPath) return no('not-found', 404, origin);

    if (!env.DB) return no('no-database', 503, origin);
    // ADMIT-LINE (admit.js): A SIGN-IN TAKES ITS PLACE IN THE LINE before it costs the database a statement - the open
    // routes' address bucket is a D1 write of its own. Told its place, it is answered 503 `queue` with the place and the
    // wait (and Retry-After, in seconds); a gate that fails lets it in.
    if (ADMIT_ROUTES.has(path) && request.method === 'POST') {
      const queued = await admitWait(env, request.headers.get('cf-connecting-ip') || 'unknown');
      if (queued) {
        const res = json({ error: 'queue', position: queued.position, wait: queued.wait }, 503, origin);
        res.headers.set('retry-after', String(Math.ceil(queued.wait / 1000)));
        return res;
      }
    }
    // SCALE4d: the token's mint on one D1 session whose first statement (the session lookup) is the primary's and whose
    // reads after it a replica may serve - the reconnect wave's dozen reads a player off the one primary (service.js
    // REPLICA_ROUTES); every other route on the binding as before
    // SCALE4g: and the reads a tab keeps asking, each on the session of the bookmark it carries; the session is held so
    // the answer can carry its newest bookmark back (`fetch`, below)
    const db = routeDb(env.DB, path, request.method, d1BookmarkOf(request));
    if (db !== env.DB) held.session = db;
    const ctx = { db, primary: env.DB, subtle, rand, nowS };   // SCALE4g: `primary` the binding, for a read-then-store a session must not make (board.js)
    // BUSY-GATE (service.js shedding): A READ THIS ISOLATE SHEDS, having just met an overloaded database, is answered as
    // the overload is - before the session's lookup or any statement of its own
    if (shedding(path, request.method, Date.now())) return overloaded(origin);

    try {
      // PATREON-LINK: THE THREE DOORS A BROWSER AND PATREON KNOCK AT. No session: each is proven by what it carries
      // (patreon.js says what, and why the link asks before it writes). Answered before the JSON ladder below, because
      // none of them is JSON going in - a callback is a GET a person reads, the confirm a form, and the webhook a body
      // whose signature covers its exact bytes.
      if (PATREON_OPEN_ROUTES.has(path)) {
        if (path === '/v1/patreon/webhook') {
          if (request.method !== 'POST') return no('method', 405, origin);
          const bytes = await readCapped(request, PATREON_HOOK_MAX_BYTES);
          if (!bytes) return no('too-large', 413, origin);
          const r = await patreonWebhook(ctx, env, new Uint8Array(bytes), request.headers.get('x-patreon-signature'), request.headers.get('x-patreon-event'));
          return 'error' in r ? no(r.error, r.error === 'patreon-closed' ? 503 : r.error === 'signature' ? 401 : 400, origin) : json(r, 200, origin);
        }
        const page = (/** @type {any} */ p, /** @type {number} */ status) => patreonHtml(patreonPage(p), status);
        if (!patreonLinkOn(env)) return page(PATREON_PAGES.off, 503);
        // The open routes' own bucket (one address, sixty a minute): a callback spends a code at Patreon and a confirm
        // writes, and neither is a thing one address gets to do without limit.
        if (await overRate(ctx, `ip:${request.headers.get('cf-connecting-ip') || 'unknown'}`, 60)) return page(PATREON_PAGES.rate, 429);
        const outbound = (/** @type {string} */ u, /** @type {any} */ init) => globalThis.fetch(u, init);
        if (path === PATREON_CALLBACK_PATH) {
          if (request.method !== 'GET') return no('method', 405, origin);
          const state = await openPatreon('state', url.searchParams.get('state'), env, { subtle, nowS });
          if (!state) return page(PATREON_PAGES.expired, 400);
          const code = url.searchParams.get('code');
          if (!code || url.searchParams.has('error')) return page(PATREON_PAGES.declined, 200);   // the player said no on Patreon
          const player = await db.prepare('SELECT id, handle FROM players WHERE id = ?1').bind(state.p).first();
          if (!player?.handle) return page(PATREON_PAGES.account, 403);
          const token = await patreonExchange(outbound, env, code, `${url.origin}${PATREON_CALLBACK_PATH}`);
          if ('error' in token) return page(PATREON_PAGES.down, 502);
          const who = await patreonIdentity(outbound, token.token);
          if ('error' in who) return page(PATREON_PAGES.down, 502);
          // NOTHING IS WRITTEN HERE. The page names the game account the state did, and the yes carries a sealed ticket -
          // so a link somebody else started is read by the patron before it can be finished.
          const from = await db.prepare('SELECT handle FROM players WHERE patreon_user = ?1 AND id <> ?2').bind(who.user, player.id).first();
          const ticket = await sealPatreon('ticket', { p: player.id, u: who.user, k: token.token, x: nowS + PATREON_TICKET_S }, env, { subtle, rand });
          return patreonHtml(patreonConfirmPage({ handle: player.handle, name: who.name, titles: pledgeTitles(who.tiers, who.status, env), ticket, from: from?.handle ?? null }));
        }
        // /v1/patreon/confirm - the page's own form
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, MAX_BODY_BYTES);
        const ticket = await openPatreon('ticket', new URLSearchParams(bytes ? new TextDecoder().decode(bytes) : '').get('ticket'), env, { subtle, nowS });
        if (!ticket || typeof ticket.k !== 'string') return page(PATREON_PAGES.expired, 400);
        // THE YES WRITES WHAT PATREON SAYS NOW - asked again with the patron's own token, not what the page showed: a
        // pledge cancelled between the page and the press holds nothing, and a yes pressed twice is Patreon asked twice.
        const who = await patreonIdentity(outbound, ticket.k);
        if ('error' in who) return page(PATREON_PAGES.down, 502);
        if (who.user !== ticket.u) return page(PATREON_PAGES.expired, 400);   // the token answers for another Patreon account now
        const r = await linkPatreon(ctx, { p: ticket.p, u: who.user, t: who.tiers.join(','), s: who.status });
        if ('error' in r) return page(PATREON_PAGES.account, 403);
        const row = await db.prepare('SELECT handle FROM players WHERE id = ?1').bind(ticket.p).first();
        return patreonHtml(patreonLinkedPage({ handle: row?.handle ?? '', titles: pledgeTitles(who.tiers, who.status, env) }));
      }

      // GRANT2 (bible/11-Multiplayer/Spawn-Grants.md section 12): THE SPAWN GRANTS' MEASURE - a cell's window of asks,
      // posted by the relay and proven by its signature over the exact bytes (the chat feed's kind of door, grants.js)
      if (path === GRANT_FEED_PATH) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, GRANT_MEASURE_MAX_BYTES);
        if (!bytes) return no('too-large', 413, origin);
        const r = await takeGrantMeasure(ctx, env, new Uint8Array(bytes), request.headers.get(GRANT_MEASURE_SIG_HEADER));
        return 'error' in r ? no(r.error, r.error === 'grant-signature' ? 401 : 400, origin) : json(r, 202, origin);
      }

      // STAFF-PANEL5-FEEDS (staffNet.js, staffReactions.js): THE RELAY'S TWO STAFF FEEDS - its players over a limit and the bot
      // check's episodes, each proven by its signature over the exact bytes (the grant feed's kind of door), never a session
      if (path === NET_FEED_PATH || path === REACTION_FEED_PATH) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, STAFF_FEED_MAX_BYTES);
        if (!bytes) return no('too-large', 413, origin);
        const r = await (path === NET_FEED_PATH ? takeNetFeed : takeReactionFeed)(ctx, env, new Uint8Array(bytes), request.headers.get(STAFF_FEED_SIG_HEADER));
        return 'error' in r ? no(r.error, r.error === 'feed-signature' ? 401 : 400, origin) : json(r, 202, origin);
      }
      // STAFF-PANEL5-HIDDEN (staffHidden.js): A HIDDEN STAFF SUBJECT ENTERED A PRIVATE HOME - the relay's note, proven by its
      // signature over the exact bytes (the grants' measure's kind of door), written to the staff audit log
      if (path === HIDDEN_SEEN_PATH) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, HIDDEN_SEEN_MAX_BYTES);
        if (!bytes) return no('too-large', 413, origin);
        const r = await takeHiddenSeen(ctx, env, new Uint8Array(bytes), request.headers.get(HIDDEN_SEEN_SIG_HEADER));
        return 'error' in r ? no(r.error, r.error === 'seen-signature' ? 401 : 400, origin) : json(r, 202, origin);
      }

      // SAFE5 + SAFE8: THE TWO DOORS THE CHAT'S SAFETY OPENS TO A STRANGER - the relay's feed and Discord's interactions.
      // Neither is JSON a session carries; each is proven by a signature over its exact bytes, checked before a byte is read.
      if (SAFE_OPEN_ROUTES.has(path)) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const bytes = await readCapped(request, DISCORD_BODY_MAX);
        if (!bytes) return no('too-large', 413, origin);
        if (!(await discordSigned(env, new Uint8Array(bytes), request.headers.get('x-signature-ed25519'), request.headers.get('x-signature-timestamp'), { subtle, nowS }))) return no('signature', 401, origin);
        let interaction = null;
        try { interaction = JSON.parse(new TextDecoder().decode(bytes)); } catch { interaction = null; }
        if (!interaction || typeof interaction !== 'object') return no('body', 400, origin);
        // AUDIT SAFE DISCORD-4: what may follow the answer (the order to the relay's door) waits on the Worker's waitUntil,
        // never on Discord's three seconds
        const exec = /** @type {any} */ (held).exec;
        return json(await discordInteraction(ctx, env, interaction, typeof exec?.waitUntil === 'function' ? { later: (p) => exec.waitUntil(p) } : {}), 200, origin);
      }

      // STAFF-PANEL1 (staff.js): THE STAFF PANEL'S DOORS. None takes a game session - a game secret opens no staff door and a
      // staff token no game door - so they are answered here, before the ladder resolves one.
      if (STAFF_ROUTES.has(path)) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const body = await readBody(request);
        if (!body) return no('body', 400, origin);
        const exec = /** @type {any} */ (held).exec;   // the refusal audit's write follows the answer (staff.js `refused`)
        const r = await staffRoute(typeof exec?.waitUntil === 'function' ? { ...ctx, later: (/** @type {Promise<any>} */ p) => exec.waitUntil(p) } : ctx, env, path, body, { ip: request.headers.get('cf-connecting-ip') || 'unknown', token: request.headers.get(STAFF_SESSION_HEADER) });
        return 'error' in r ? (r.message ? json({ error: r.error, message: r.message }, STAFF_STATUS[/** @type {keyof typeof STAFF_STATUS} */ (r.error)] ?? 400, origin) : no(r.error, STAFF_STATUS[/** @type {keyof typeof STAFF_STATUS} */ (r.error)] ?? 400, origin)) : json(r, 200, origin);   // BUNNYFALL: staffData's failure carries its words
      }

      if (OPEN_ROUTES.has(path)) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const body = await readBody(request);
        if (!body) return no('body', 400, origin);

        // ONE BUCKET PER CALLER for everything a stranger can reach, so
        // a single address cannot mint accounts or grind passwords
        // without limit. The per-HANDLE buckets inside login/recover
        // are the other half - one stops a flood, the other stops a
        // patient attacker with many addresses picking one account.
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        if (await overRate(ctx, `ip:${ip}`, 60)) return no('rate', 429, origin);

        if (path === '/v1/auth/guest') {
          // TERMS1: NO ROW WITHOUT THE DOCUMENTS TICKED. A guest row IS an
          // account (0001's own words), and the Create account form opens
          // one only after its player ticked the Terms of Service and the
          // Privacy Policy - so the service asks the same, before it writes.
          const refused = legalRefusal(body);
          if (refused) return no(refused.error, 400, origin);
          const made = await createGuest(ctx, { deviceLabel: body.label ?? null, legal: { terms: body.terms, privacy: body.privacy } });
          return json(made, 200, origin);
        }
        if (path === '/v1/auth/login') {
          const r = await login(ctx, { handle: body.handle, password: body.password, deviceLabel: body.label ?? null });
          // A REFUSAL NAMES NO CAUSE a stranger could use: `bad-login`
          // is the same word for a handle nobody holds and a password
          // that is wrong, and the two cost the same time besides.
          // AUDIT SAFE SERVICE-7: a banned account, its password right, is told its ban (bannedAnswer's shape) - no session
          if (r.error === 'banned') return json(r, 403, origin);
          return r.error ? no(r.error, r.error === 'rate' ? 429 : 401, origin) : json(r, 200, origin);
        }
        // /v1/auth/recover
        const r = await recover(ctx, { handle: body.handle, code: body.code, password: body.password, set: body.set === true });   // RECOVERY-SET: a set for a build that asks
        if (r.error === 'banned') return json(r, 403, origin);   // AUDIT SAFE SERVICE-7: the code unspent, no session
        return r.error ? no(r.error, r.error === 'rate' ? 429 : r.error === 'codes-moved' ? 409 : 401, origin) : json(r, 200, origin);   // AUDIT RECOVERY-SET A4
      }

      if (path === DISCORD_BOT_ROUTE) {
        if (request.method !== 'POST') return no('method', 405, origin);
        if (!(await discordBotAuthorized(request, env, subtle))) return no('auth', 401, origin);
        const input = await readBody(request, MAX_BODY_BYTES);
        if (!input) return no('body', 400, origin);
        const result = await discordBotAction(ctx, env, input);
        return 'error' in result ? no(result.error, result.status, origin) : json(result, 200, origin);
      }

      // EVERY ROUTE BELOW NEEDS A SECRET, and resolving it is the same
      // one indexed lookup every time.
      // REALM P2.1: a trade's half carries two offers of up to sixteen records each - a JSON route past 4 KiB. AUDIT LEGACY
      // III O2/P1: and a line's record, to its own bound (legacy.js LINEAGE_BODY_MAX) - read at 4 KiB, a played founder's
      // first save was refused, and the realm held the founding copy for good
      // PRIVATE-REPORT: and a report's words, to theirs (reportLaw.js REPORT_BODY_BYTES). LOST-SPOILS: and a floor's leftovers,
      // to theirs (lostLaw.js LOST_BODY_MAX - the largest spoils send past 4 KiB)
      const body = request.method === 'POST'
        ? await readBody(request, path === '/v1/realm/lineage' ? LINEAGE_BODY_MAX : path === '/v1/realm/trade' ? REALM_TRADE_BODY_MAX : poiActPath(path) ? POI_ACT_BODY_MAX : path === '/v1/homes/decor/batch' || path === '/v1/homes/decor/draft' || path === '/v1/homes/decor/accept' ? DECOR_BATCH_BYTES : path === '/v1/homes/caravan/templates' ? TEMPLATE_BODY_BYTES : path === '/v1/safety/report' ? REPORT_BODY_MAX : path === '/v1/report/send' ? REPORT_BODY_BYTES : path === '/v1/post/lost' ? LOST_BODY_MAX : path === '/v1/skins/upload' ? SKIN_BODY_MAX : MAX_BODY_BYTES) : {};
      if (body === undefined && path === '/v1/realm/lineage') return no('lineage-too-large', 413, origin);
      if (body === undefined && (path === '/v1/homes/decor/batch' || path === '/v1/homes/decor/draft' || path === '/v1/homes/decor/accept' || path === '/v1/homes/caravan/templates')) return no('too-large', 413, origin);
      if (!body) return no('body', 400, origin);
      // YARD-SHED (2026-10-06, the service down - "D1 DB is overloaded. Requests queued for too long."): A TOWN'S YARDS NEED
      // NO SESSION. Its answer is every caller's alike, any guest's to read (decor.js yardsKept), and the two reads a
      // session costs were most of the database's day - so it is answered here, from the isolate's kept answer, bounded
      // per address in this isolate's memory as a session's door is per account (no write to count it).
      if (path === '/v1/homes/yards' && request.method === 'POST') {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        if (overAccountRate(`yards:${ip}`, nowS, ACCOUNT_MAX, ACCOUNT_WINDOW_S)) return no('rate', 429, origin);
        const r = await yardsKept(ctx, body.mapId, nowS);
        return 'error' in r ? no(r.error, 400, origin) : json(r, 200, origin);
      }
      // POI-1: THE LIVE FEED AND A LIVE ASSET NEED NO SESSION - what every approved POI is, and the bytes it names, are
      // every player's to read, the game's included (poi.js). Bounded per address in this isolate's memory, as the yards
      // are; the feed kept in the isolate and answered 304 to a game that already holds its version; an asset by its
      // hash, cached a day (AUDIT POI S4: it can stop being public). An asset no live POI names falls through to a builder's session below.
      if (poiPath && request.method === 'GET' && (poiPath.route === 'live' || poiPath.route === 'asset')) {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        if (overAccountRate(`poi:${ip}`, nowS, POI_OPEN_MAX, ACCOUNT_WINDOW_S)) return no('rate', 429, origin);
        // AUDIT POI S11: the version the game holds, read strong or weak - newer than this isolate's kept feed, the version is asked now
        const held = poiPath.route === 'live' ? poiHeldVersion(request.headers.get('if-none-match')) : -1;
        const feed = await poiLiveFeed(env.DB, Date.now(), held);
        if (poiPath.route === 'live') {
          const etag = poiFeedTag(feed.v);
          const headers = { 'access-control-allow-origin': origin, 'access-control-expose-headers': 'etag', etag, 'cache-control': 'public, max-age=30' };
          if (held === feed.v) return new Response(null, { status: 304, headers });
          return new Response(feed.body, { status: 200, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
        }
        if (feed.live.has(poiPath.sha) || !request.headers.get('authorization')) {
          const r = await getPoiAsset({ ...ctx, db: env.DB, bucket: env.SAVES }, poiPath.sha, { builder: false });
          return 'error' in r ? no(r.error, r.error === 'no-storage' ? 503 : 404, origin) : poiAssetResponse(r, origin);
        }
      }
      // ═══ AUDIT-ACC F13: A CREDENTIAL DOES NOT GO IN A URL ══════
      //
      // This read `?secret=` on a GET, and the comment above defended
      // it as "read-only, and a slice that makes it do more must move
      // it". That answers the wrong risk. The hazard was never that the
      // route mutates - it is that A URL IS LOGGED: Cloudflare records
      // request URLs, a Referer carries them to any third party the
      // page links to, and a browser writes them into history. The
      // session secret was landing in all three.
      //
      // A HEADER IS NOT LOGGED BY DEFAULT and is never in a Referer, so
      // that is where a bearer credential belongs. A POST may still
      // carry it in the body - a body is in none of those places - and
      // the header wins if both are present, so there is one answer
      // when they disagree.
      const auth = request.headers.get('authorization') ?? '';
      const bearer = /^Bearer (.+)$/.exec(auth)?.[1];
      const secret = bearer ?? (request.method === 'POST' ? body.secret : null);
      // SESSION-SIGN (sessionPass.js; bible/11-Multiplayer/Scale-Arc.md THE PLAN PAST 1,000, decision 4): A HOT ROUTE
      // BELIEVES ITS PASS - who the lookup found, signed for five minutes and bound to this secret - and asks the lookup
      // only for one it cannot believe, minting the next beside its answer
      const hot = passRoute(path, request.method) ? await passKey(env, subtle) : null;
      const who = (hot && await readPass(hot, request.headers.get(SESSION_PASS_HEADER), secret, nowS, subtle)) || await resolveSession(ctx, secret);
      if (!who) return no('auth', 401, origin);
      // SAFE4: A BANNED ACCOUNT ACTS IN NOTHING - no token (so no room), no save, no trade - and is told until when, and why,
      // on every door; it may still sign out
      // STAFF-PANEL5-FREEZE (staffFreeze.js; design doc Weak spots: "Freeze blocks only some routes"): ONE FREEZE GATE BESIDE
      // THE BAN'S (asked first, so a banned account hears its ban) - a frozen account opens nothing but signing out, its own account, the realm doors that load the character it
      // looks around as, its relay token and the staff chat. Refused here, it is minted no pass; under a pass minted before
      // the freeze, the checkpoint and the beat ask it in their own statements (realm.js, accounts.js creditPlay)
      const frozen = !isBanned(who.player, nowS) && freezeRefusal(path, request.method === 'GET' && !!realmSlot, who.player, nowS);
      if (frozen) return json(frozen, 403, origin);
      if (isBanned(who.player, nowS) && path !== '/v1/auth/logout') return json(bannedAnswer(who.player), 403, origin);
      if (path === DISCORD_GAME_ROUTE) {
        if (request.method !== 'POST') return no('method', 405, origin);
        const result = await discordGameAction(ctx, env, who.player, body);
        return 'error' in result ? no(result.error, result.status, origin) : json(result, 200, origin);
      }
      // SESSION-SIGN: the next pass, after the ban (a banned account pays its lookup - AUDIT PLAN-1000 E6) and off the
      // primary's own answer alone (a replica's may stand before a sign-out - E5)
      if (hot && !('pass' in who) && passMintable(db, env.DB)) held.pass = await mintPass(hot, who, secret, nowS, subtle);

      // AUDIT LEGACY III O12: A TOMBSTONE ACTS IN NOTHING. Every act a character does names it as the body's
      // `character` - the professions, the Stores, the writs, the market, Renown, the guilds - and a fallen Bloodline
      // character (an Enduring elder retired) is never played again (legacy.js), yet only the guilds' door asked (O5): a
      // request naming the dead read its Stores and withdrew them into its heir's pack, and wrote its tracks after its
      // death. Asked here, once, before any route - but the token's mint, which is no act: it vouches for the account,
      // and mints a tombstone no realm character (REALM-DOOR's `rc` 0, no house, no `ci`), which the relay's door refuses;
      // a page under its death screen still mints for the hub it stands in.
      // PRIMARY-FOLD (bible/11-Multiplayer/Scale-Arc.md THE PLAN PAST 1,000): the door's reads - the tombstone of a body's
      // `character`, and a progression claim's seat and its stream's bucket - in one trip (door.js doorReads), answered in
      // the order each was asked on its own
      const progressRoute = request.method === 'POST' ? PROGRESS_ROUTES[/** @type {keyof typeof PROGRESS_ROUTES} */ (path)] : undefined;
      // AUDIT PLAN-1000 C4: a claim the account's rate will refuse (asked without counting - the count is the door's below,
      // after the tombstone, as ever) asks the tombstone alone
      const claimed = progressRoute && !accountRateFull(who.player.id, nowS, ACCOUNT_MAX, ACCOUNT_WINDOW_S) ? progressRoute[0] : null;
      const door = await doorReads(db, who.player.id, { tomb: path !== '/v1/auth/token' && typeof body.character === 'string' ? body.character : null, stream: claimed });
      if (door.dead) return no('dead', 410, origin);

      // AUDIT-ACC F12: A CREDENTIAL IS NOT A LICENCE TO HAMMER. The
      // open routes were bounded per address and everything behind a
      // session was not, so one valid secret could mint signatures and
      // spend D1 without limit. Bounded per ACCOUNT rather than per
      // address, because the account is what the caller proved.
      //
      // 429 AND NOT 401. Telling a rate-limited player their
      // credentials are wrong sends them to reset a password that was
      // never the problem - Fight Life's own note beside the same
      // check, and the reason its limiter throws rather than returns.
      // ACCT-RATE-MEM: counted in the isolate's memory - a D1 upsert here made every read a write (accounts.js).
      if (overAccountRate(who.player.id, nowS, ACCOUNT_MAX, ACCOUNT_WINDOW_S)) {
        return no('rate', 429, origin);
      }

      // INT16 (bible/06-Systems/Integrity-Arc.md section 7): A PROGRESSION CLAIM IS ITS SEAT'S - Renown, a raid's cleanse, a
      // camp, the Watch, a silver find, a profession's XP (progress.js PROGRESS_ROUTES) asked of the account's realm character
      // holding its lease, never one the judge holds, before any route reads a word of it. INT17: and once staff enforce the
      // line, a stream whose bucket play has not refilled is refused, and a Renown report asks no more than the bucket holds.
      if (progressRoute) {
        const [stream, named] = progressRoute;
        // AUDIT PLAN-1000 F1: a claim the rate's peek found full and its count let through (the window turned between the two,
        // another request of the account opening the next) asked no seat at the door - it asks now, as the door would have
        const read = door.seat === undefined ? await doorReads(db, who.player.id, { tomb: null, stream }) : door;
        const seat = seatRefusalOf(read.seat, { named, character: body.character });   // PRIMARY-FOLD: the door's read of the seat
        if (seat) return json(seat, 403, origin);
        const line = await progressConfig(db);
        if (line.enforce) {
          const room = await progressRoom(db, who.player.id, stream, line, read.bucket);   // PRIMARY-FOLD: and of the bucket
          if (room < 1) return no('progress-play', 429, origin);
          if (stream === 'renown' && Number.isSafeInteger(body.xp)) body.xp = Math.min(body.xp, room);
        }
      }

      // ARENA4: THE ARENA'S HONOURS ON THE ROW, where a badge is minted or a wardrobe read - the Grand Champion's row, the
      // season's #1 (server-account/src/arena.js arenaHonoursOf) - so titles.js derives `grandchampion`, `arenachampion`
      // and the laurel from the arena's rows as it derives the founder from a date. Only on the doors that read a badge.
      // AUDIT SCALE4d A1: ON THE BINDING, never the mint's replica session - a #1 found stale is COUNTED AGAIN AND WRITTEN
      // (arena.js championNow -> storeArenaChampion, iliac.js the same): counted off a replica as new as the session lookup,
      // the write put back a #1 a rated bout had just moved past, and the clock only re-stamps a kept #1
      const honoursCtx = { ...ctx, db: env.DB };
      // CARDS10: and Iliac Hand's season #1 (iliac.js), on the same doors; KG6: and The King's Gambit's (gambit.js);
      // SIGN-BATCH: the three games' reads in ONE batch (honours.js withHonours), each answered as its with*Honours answers; EG-E2: and
      // the Spire Champions - the last season's Descent's top tens (egHonours.js), read beside them
      if (ARENA_HONOUR_PATHS.has(path)) who.player = await withEgHonours(honoursCtx, await withHonours(honoursCtx, who.player, nowS), nowS);
      { const res = await accountRoutes({ request, env, subtle, rand, nowS, origin, url, path, ctx, body, who }); if (res !== NEXT) return res; }
      { const res = await playRoutes({ request, env, subtle, nowS, origin, path, db, ctx, body, who }); if (res !== NEXT) return res; }
      { const res = await townRoutes({ request, env, subtle, nowS, origin, path, ctx, body, who, progressRoute }); if (res !== NEXT) return res; }
      { const res = await seatsRoutes({ request, env, subtle, nowS, origin, path, ctx, body, who, progressRoute }); if (res !== NEXT) return res; }
      { const res = await worldRoutes({ request, env, nowS, origin, path, ctx, body, who }); if (res !== NEXT) return res; }
      { const res = await mailRoutes({ request, env, held, origin, path, ctx, body, who }); if (res !== NEXT) return res; }
      { const res = await storageRoutes({ request, env, subtle, nowS, origin, url, path, slot, realmSlot, poiPath, ctx, body, who }); if (res !== NEXT) return res; }

      // a path this service serves, reached with a method it does not
      return no('method', 405, origin);
    } catch (e) {
      return thrown(path, e, origin);   // AUDIT ONLINE A17's law, on this side too; SCALE4f: an overloaded primary counted apart
    }
  },
};

export default {
  fetch: (request, env, exec) => { readSwitches(env); return measured(request, env, service.fetch, exec); },   // BUNNYFALL: the friends' server's switches (bunnyfall.js)   // AUDIT SAFE DISCORD-4: the ExecutionContext, for waitUntil
  // SCALE4b: THE SERVICE'S OWN CLOCK - wrangler.toml's [triggers] crons, each firing its list (cron.js), the sweeps no
  // read runs any more and the settlements every read now nearly always finds done
  scheduled: (controller, env) => runCron(env, { cron: controller?.cron, nowS: Math.floor(Number(controller?.scheduledTime ?? Date.now()) / 1000) }),
};
