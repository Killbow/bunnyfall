// The account service's refusal statuses: for each route family, the HTTP status each refusal code
// answers with. A bad shape is 400 by default. SEAT_READS lists the seat routes that only read.
/** REALM P1: each realm refusal's status - a bad shape 400 (the default), a character that is not the caller's 404, a
 *  lease another tab holds or a sequence that is not the next 409 (the tab that lost it goes offline), the account's
 *  bound 409, customs refused 403/409, no storage 503. */
/** INT3/INT4 (the INTEGRITY arc - bible/06-Systems/Integrity-Arc.md): THE JUDGE'S REFUSALS, the same at every route that
 *  hands a realm character's value to another player - its trade held, its record unread since the judge shipped, a
 *  piece the id ledger marked a duplicate - each a conflict with what stands (realm.js holdRefusal, prepareRealmRecord). */
export const JUDGE_STATUS = Object.freeze({ 'trade-held': 409, 'record-unjudged': 409, 'piece-dupe': 409, 'piece-claimed': 409, 'piece-legacy': 409 });
/** INT9: a death's drop's refusals - no key to verify or sign with 503, a receipt not the caller's 403, the fallen's own
 *  grace or the room's falls 409; the record's own (REALM_STATUS) after them, a bad shape 400 (the default). */
export const WILD_STATUS = Object.freeze({ 'no-gate-key': 503, 'no-signing-key': 503, 'not-yours': 403, grace: 409, 'fallen-frozen': 409, nonce: 400, 'no-escrow': 404, 'escrow-wait': 409, 'escrow-late': 409, 'escrow-moved': 409, 'escrow-collected': 409, 'escrow-returned': 409, 'sea-prize-moved': 409, 'sea-prize-realm': 403 });   // MAC (2026-10-14): the escrow's; SHIP-PVP: a prize's
/** HOME-RENT: a room's refusals - a bad shape 400 (the default). */
/** Refusals for decorators and caravan templates that are not a bad request (400, the default). */
export const DECORATOR_STATUS = Object.freeze({
  'decor-revoked': 403, 'decorator-hall': 403, 'decorator-self': 409, 'decorators-full': 409, 'decorator-offer': 409, 'no-reader': 404, 'no-home': 404,
  'draft-changed': 409, 'draft-unsent': 409, 'draft-empty': 409, 'decor-taken': 409, 'decor-cap': 409, 'yard-cap': 409,
  'yard-town-full': 409, 'decor-rev': 409, 'template-none': 404, 'template-rate': 429, 'decor-rate': 429, 'homes-need-account': 403,
});
export const RENT_STATUS = Object.freeze({
  ...JUDGE_STATUS,
  'rent-taken': 409, 'rent-held': 409, 'rent-rooms': 409, 'rent-none': 409, 'rent-own': 403, 'realm-only': 403,
  'rent-rate': 429, 'no-rent-room': 404, 'no-home': 404,
});
/** AUDIT CARDS-6 D8: a card table's and a ranked deck's refusals that are not a bad request (400, the default): the service
 *  with no key to sign with, a guest asking for a ranked seat. */
export const CARDS_STATUS = Object.freeze({ 'cards-closed': 503, 'ranked-needs-account': 403 });
/** PRIVATE-REPORT: a report's refusals that are not a bad request (400, the default). */
export const REPORT_STATUS = Object.freeze({ 'report-rate': 429, 'report-full': 409, 'no-report': 404, 'not-report-reader': 403 });
/** SERVER-POST: the post's own refusals; a claim's realm words are REALM_STATUS's. */
export const POST_STATUS = Object.freeze({ 'no-post': 404, 'post-no-item': 409, 'post-claimed': 409, 'post-unclaimed': 409, 'realm-only': 403, 'realm-needed': 409, server: 503,
  'lost-pieces': 400, 'lost-item': 400, 'lost-no-kill': 409, 'lost-spent': 409, 'lost-full': 409 });   // AUDIT SERVER-POST: a batch D1 dropped is the service's failure, counted as one
export const REALM_STATUS = Object.freeze({
  ...JUDGE_STATUS,   // INT3/INT4
  'no-realm-character': 404, 'no-data': 404, lease: 409, seq: 409, 'too-many-characters': 409, auth: 401,   // SESSION-SIGN E3: a checkpoint's session gone
  'customs-never-online': 403, 'customs-other-account': 403, 'customs-already': 409, 'no-storage': 503,   // CUSTOMS-ELSEWHERE: the other account's
  'trade-spent': 409,   // REALM P2.1: a trade's sid another pair settled
  'guild-master-leaves': 409,   // AUDIT REALM L1-F7: a guildmaster deleted hands the guild over first
  'guild-treasury': 409,   // AUDIT REALM2 S8: and a lone one empties the treasury first
  'guild-hall': 409,   // AUDIT GUILD1d S1: and sells its guild's hall first
  'guild-vault': 409,   // AUDIT GUILD2 G2: and empties its guild's vault first
  'guild-seat': 409, 'guild-battle': 409,   // SEAT1c: and relinquishes its Charters, and fights the battle it is named in
  'realm-market-open': 409,   // PROF-DELETE: and one with market business open settles it first
  'home-tenants': 409, 'home-rent-due': 409,   // HOME-RENT: and one renting rooms out waits for its tenants and collects its rent
  'home-heir-full': 409, 'home-plan-changed': 409,
  'home-vendor-stocked': 409,   // HOME-VENDOR: and one whose trader still sells
  'realm-birth': 403, 'customs-allowance': 403,   // AUDIT REALM2 S1: a first save the realm's law refuses
  // LEGACY7 (legacy.js): a tombstone is gone for good; a line or person the birth cannot be; a line's model is its founder's
  dead: 410, 'no-lineage': 404, 'lineage-person': 409, 'lineage-played': 409, 'lineage-model': 409, 'too-many-lineages': 409,
  'wed-no-line': 409, 'wed-already': 409, 'wed-partner': 409, 'wed-spent': 409,   // LEGACY7 part three: a wedding the realm cannot make
  'lineage-too-large': 413,   // AUDIT LEGACY III O2/P1: a line's record past its bound - its own word, never a malformed body's
  'not-dead': 409, 'raise-late': 409, 'raise-no-line': 409,   // REZ-BLOODLINE AUDIT R1: a Resurrect the realm will not take
});
/** CUSTOMS-PASS: a pass's refusals - a bad shape 400 (the default), a caller who is no developer 403, no such account
 *  404, a guest's name two accounts wear 409. */
export const PASS_STATUS = Object.freeze({ 'not-developer': 403, 'no-player': 404, ambiguous: 409 });
/** CHAP1: the Roll's refusals - a bad shape 400 (the default), the switch shut 403, no such character or none of its
 *  saves landed 404, a lease another tab took 409 (the tab stops), a Roll not yet read or a race lost 409 (the tab asks
 *  again - AUDIT CHAP R12: this said the lease was asked again too), a tombstone 410. */
export const ROLL_STATUS = Object.freeze({
  'chapters-closed': 403, 'no-realm-character': 404, 'no-data': 404, lease: 409, 'roll-unseeded': 409, 'roll-busy': 409, dead: 410,
  'halls-need-account': 403, 'halls-rate': 429,   // CHAP2a: a hall's witness - a guest's, or past the hour's
  'roll-rate': 429,   // AUDIT CHAP2 E2: the claims' hour
  'hall-struck': 409, 'not-developer': 403, 'bad-region': 400,   // AUDIT CHAP2 E1: a struck town; the audit and the strike a developer's
  'not-master': 403,   // CHAP4d: a Focus set by a character that is not that chapter's Master ('no-focus' and 'body' the shape's 400)
  'no-event': 409, closed: 409, 'not-member': 403,   // CHAP6b: a backing where the Season holds nothing to back, one decided, or by no member ('no-side' the shape's 400)
  // CHAP7a: a patron's bid - an account's, a request's id, the Marks switch, its rank, the hour's writes; no Season or chapter to bid on; too
  // little or no more than it stood at, too little in the treasury ('bad-marks', 'marks-rid', 'guild-character' the shape's 400)
  'marks-need-account': 403, 'marks-closed': 403, 'guilds-need-account': 403, 'no-guild': 404, 'guild-rank': 403, 'marks-rate': 429,
  'no-season': 409, 'no-chapter': 404, 'patron-low': 409, 'guild-marks-short': 409,
});
/** INT6: the review's refusals - no developer 403, no such character 404, nothing clean to roll back to 409. */
export const REVIEW_STATUS = Object.freeze({ 'not-developer': 403, 'no-realm-character': 404, 'no-clean': 409, 'service-moved': 409, 'dead': 409, 'no-player': 404, 'repair-no-faction': 409, 'repair-not-set': 409, seq: 409, 'mend-not-negative': 409, 'mend-moved': 409, 'repair-ticket': 409 });   // SUMMON-REPAIR: from 'no-player' on; PURSE-MEND: the last three
/** GUILD1: each guild refusal's status - a bad shape 400 (the default), the wrong rank or too little Renown 403, a
 *  thing that is not there 404, a conflict with what is 409, the hour's writes spent 429. */
export const GUILD_STATUS = Object.freeze({
  ...JUDGE_STATUS,   // INT3/INT4
  'guilds-need-account': 403, 'guild-rank': 403, 'guild-renown': 403,
  'no-guild': 404, 'no-invite': 404, 'no-member': 404, 'no-player': 404,
  'guild-already': 409, 'guild-name-taken': 409, 'guild-tag-taken': 409, 'guild-full': 409, 'guild-master-leaves': 409,
  'guild-treasury': 409, 'guild-treasury-full': 409, 'guild-treasury-short': 409, 'guild-treasury-old': 409, 'marks-full': 409,   // AUDIT REALM L1-F3: gold no record paid in
  'guild-stores': 409, 'guild-writs': 409,   // PROF6: a guild keeping its Stores or a writ does not go (Professions-Arc 18)
  'guild-writ-escrow': 409,   // AUDIT 31 A15: a closed writ's escrow waiting on a full treasury
  'guild-contracts': 409,   // AUDIT SILVER-WAYS B3: a guild with a contract standing does not go (its siblings' conflict, never a bad request)
  'guild-rate': 429,
  // GUILD1d (Seats-Arc 8): the hall - a building somebody owns, the guild's one hall already held, none held, one moved
  // under its sale, a guild kept from going by it; and the heraldry - the same again, changed meanwhile, the Drakes short
  'home-taken': 409, 'guild-hall-have': 409, 'guild-hall-moved': 409, 'guild-hall': 409, 'guild-hall-none': 404, 'home-rate': 429,
  'home-arena': 409,   // ARENA4b: a hall bought in the arena's cell - the arena stands there (halls.js buyHall)
  // AUDIT PRE-MERGE 1003 WD1: a hall in another layout of its town (answered with the town's, below), and one from a build
  // before the town mods - a home's claim's own words and statuses
  'home-layout': 409, 'home-update': 426,
  'heraldry-same': 409, 'heraldry-moved': 409, 'heraldry-drakes': 409, 'marks-closed': 403,
  'heraldry-siege': 409,   // AUDIT-SEATS S10 (Seats-Arc 8.1): a change in a week the guild fights for a seat
  // GUILD2a: a new name - the same as the old, a word the filter refuses, too soon after the last, a siege week, the
  // realm's gold short, moved under it; GUILD2b: the vault - the standing short, the day's limit, full, empty, moved,
  // a piece the record does not hold or may not leave, a guild kept from going by its vault
  'guild-rename-same': 409, 'guild-name-word': 400, 'guild-rank-word': 400, 'guild-rename-soon': 409, 'guild-rename-siege': 409, 'guild-rename-gold': 409, 'guild-rename-moved': 409,
  'guild-vault-rank': 403, 'guild-vault-limit': 409, 'guild-vault-full': 409, 'guild-vault-empty': 404, 'guild-vault-moved': 409, 'vault-goods': 409, 'guild-vault': 409,
  'realm-only': 400, 'bad-vault-item': 400, 'bad-vault-count': 400, 'bad-vault-slot': 400, 'bad-vault-grant': 400,
  'guild-seat': 409, 'guild-battle': 409,   // SEAT1c: a guild holding a Charter, or named in a battle still to come, does not go
  'guild-patron': 409,   // AUDIT CHAP5 E4: nor one whose bid for a chapter's patronage stands
  // GUILD1e: the guild's board - the Notice Board's switch, a mute, no such note, the member's notes full, the hour spent
  'board-closed': 403, muted: 403, 'no-note': 404, 'notes-full': 409, 'board-rate': 429, 'board-ops-rate': 429,
  // REALM P2.2: a realm character's record moves with the act - where it stands, and whether it can pay
  'realm-needed': 400, 'realm-gold': 409, lease: 409, seq: 409, 'no-realm-character': 404, 'no-data': 404, 'no-storage': 503,
});
/** MARKS1: each Marks refusal's status - not this account's (a guest, the switch, a rank, a developer's; AUDIT 625 S1:
 *  the finds of an account not yet a week registered) 403, no guild 404, short or capped 409, the hour's acts spent
 *  429, a bad shape 400 (the default). */
/** EG-PLAY: each Elite Breach refusal's status - the service without its key 503, not this account's (a guest, another's
 *  receipt) 403, a breach held or no key to stake 409, a bad shape 400 (the default). EG-E3: a find's day spent 409. */
export const EG_STATUS = Object.freeze({
  'no-signing-key': 503, 'no-gate-key': 503,
  guest: 403, 'not-yours': 403, unproven: 403,
  live: 409, short: 409, rehearsed: 409, spent: 409, capped: 409,   // EG-E3: a find past its day's asks
  bought: 409,   // EG-E1: the week's Panoply piece already bought
  fenced: 409,   // AUDIT FB1024 (BROKER-RID): a press whose request id a settle fenced first
  start: 403,   // EG-F: a start the account may not make (no carries)
  none: 404,   // AUDIT EG IV (lane3 #1): an open asked again (`again`) whose request id took no key
});
export const MARKS_STATUS = Object.freeze({
  'marks-need-account': 403, 'marks-closed': 403, 'marks-young': 403, 'not-developer': 403, 'guild-rank': 403, 'guilds-need-account': 403,
  'no-guild': 404,
  'marks-short': 409, 'marks-bank-cap': 409, 'marks-full': 409, 'guild-marks-short': 409, 'guild-marks-full': 409,
  'marks-rate': 429,
});
/** NOTICE1: each board refusal's status - not this account's (a guest, the switch, a mute, a moderator's or a
 *  developer's act) 403, no such note 404, the author's notes full 409, the hour's acts spent 429, a bad shape 400. */
/** SAFE1, SAFE3, SAFE7: the chat safety's refusals by status - the rest 400. */
export const SAFETY_STATUS = Object.freeze({ 'no-player': 404, 'no-case': 404, 'report-unwitnessed': 403, 'report-closed': 503, 'conduct-stale': 409, 'blocks-full': 409, rate: 429,
  'not-moderator': 403, protected: 403, ambiguous: 409,
  // STAFF-PANEL2-FIX (safety.js modAct): the bounds, a case another act took or closed or another staff member holds, a
  // spawn case (a developer's), an Admin's sanction (an Admin's to lift), a press's id of the wrong shape
  'bad-minutes': 400, 'bad-days': 400, 'not-banned': 400, 'case-acted': 409, 'case-closed': 409, 'staff-claimed': 409, 'not-developer': 403, 'admin-sanction': 403,
  'bad-click': 400 });
export const BOARD_STATUS = Object.freeze({
  'board-need-account': 403, 'board-closed': 403, 'muted': 403, 'not-moderator': 403, 'not-developer': 403, 'own-note': 403,
  'guild-rank': 403, 'guilds-need-account': 403,
  'no-note': 404, 'no-notice': 404, 'note-no-guild': 404,
  'notes-full': 409,
  'board-rate': 429, 'board-ops-rate': 429,
});
/** TOWN-ECON TE2: each town refusal's status - a guest 403, the hour's reports spent 429, no relay key 503, a bad shape 400
 *  (the default). */
export const TOWN_STATUS = Object.freeze({ 'towns-need-account': 403, 'towns-rate': 429, 'no-gate-key': 503, 'towns-closed': 403, 'not-developer': 403, 'town-unwalked': 403 });   // AUDIT TOWN-ECON 2
/** SEAT1a (SEAT1b): each seat refusal's status - not this account's (a guest, the switch, a developer's act) 403, a seat struck
 *  409, the hour's reports spent 429, a bad shape 400 (the default). */
/** SEAT-LEASE: the seat routes that only read, answered from the state as it stands while another settles the Turning. */
export const SEAT_READS = new Set(['/v1/seats/list', '/v1/seats/standings', '/v1/seats/records', '/v1/seats/forts']);
export const SEAT_STATUS = Object.freeze({
  'seats-need-account': 403, 'seats-closed': 403, 'not-developer': 403, 'seat-struck': 409, 'seats-rate': 429,
  'not-moderator': 403,   // VOID: `/siege void` asked by anyone but a moderator or a developer
  // SEAT1b: a rank, a guild or the Marks not this account's 403; no confirmed seat or guild 404; the week's phase, the
  // guild's reach, a pledge not there, Tribute's room, the treasury 409; no relay key 503
  'guild-rank': 403, 'guilds-need-account': 403, 'marks-closed': 403, 'no-guild': 404, 'seat-unconfirmed': 404,
  'seat-reckoning': 409, 'seat-pledges-full': 409, 'seat-no-pledge': 409, 'seat-tribute-cap': 409, 'guild-marks-short': 409,
  'no-gate-key': 503,
  'seat-not-held': 409, 'seat-held-here': 409,   // SEAT1c: a Charter not the guild's to give up; a region its Charter pledges
  // SEAT1d: the Tithe set this week already, an Edict two weeks running, none to take back, the balance's cap 409
  'tithe-this-week': 409, 'edict-twice': 409, 'seat-no-edict': 409, 'marks-full': 409, 'edict-tier': 409,
  // SEAT2a: no battle, no contract, no such account 404; a side not this guild's, a member hired 403; the rosters' close, a
  // side or its Sellswords full, the account's war, a Sellsword's cooling, a second signing or hire 409
  'battle-none': 404, 'hire-none': 404, 'no-such-account': 404, 'battle-not-side': 403, 'sellsword-member': 403,
  'sign-closed': 409, 'sign-new-member': 409, 'sign-unbound': 409, 'sign-bound-elsewhere': 409, 'side-full': 409,
  'sellswords-full': 409, 'sellsword-cooling': 409, 'sign-twice': 409, 'hire-twice': 409,
  // SEAT2a part three: the field's door, its window, an unsettled field, a second Honours 409; a receipt another account's
  // 403; a bad field, a receipt not the relay's, no character for the XP 400 (the default)
  'pass-early': 409, 'pass-late': 409, 'field-unsettled': 409, 'honours-twice': 409, 'not-yours': 403,
  // AUDIT-SEATS: a battle its Turning voided (S3), a window moved in the Reckoning (S10) 409
  'battle-void': 409, 'window-reckoning': 409,
  'battle-settled': 409,   // AUDIT 529 V5: a `/siege void` after the battle's week was settled
  // CROWN1 part two: no Royal Tourney here 404; its week's champion named, its ring unsettled 409
  'royal-none': 404, 'royal-over': 409, 'ring-unsettled': 409,
  // CROWN2: no such guild, offer or Pact 404; a pair that does not fit, one sworn or signed already, a pledge between them 409
  'guild-unknown': 404, 'fealty-none': 404, 'pact-none': 404, 'fealty-unfit': 409, 'fealty-sworn': 409, 'fealty-pledged': 409,
  'pact-signed': 409, 'pact-self': 409, 'pact-pledged': 409, 'fealty-pledge': 409, 'pact-pledge': 409,
  // SEAT2b: a work the seat may not raise, one building already, one at its last tier, a treasury short 409
  'fort-not-here': 409, 'fort-building': 409, 'fort-max': 409, 'seat-treasury': 409,
});
/** PROF1: each professions refusal's status - not this account's (a guest, the switch, the Marks' switch, the rank) 403,
 *  no such writ 404, a conflict with what stands (the day, the hour, a bound, the Stores, a node or writ taken) 409, the
 *  hour's acts spent 429, a bad shape 400 (the default). */
export const PROF_STATUS = Object.freeze({
  ...JUDGE_STATUS,   // INT3/INT4
  'prof-need-account': 403, 'prof-closed': 403, 'marks-closed': 403, 'prof-rank': 403,
  'no-writ': 404, 'bad-recipe': 404,
  'prof-pixel': 409, 'prof-day': 409, 'prof-late': 409, 'stores-full': 409, 'stores-short': 409,   // ANY-HOUR: no `prof-night` - no node keeps hours; CAP-OFF: no `prof-cap` - no day's cap
  'prof-deep-cap': 409, 'prof-spec-stale': 409, 'prof-spec-taken': 409, 'prof-trial-over': 409,   // AUDIT PERK-TRIAL P4: a change asked free, its day out   // AUDIT 29 (CAP-OFF: no `prof-account-cap`)
  'prof-no-pack-form': 409,   // PROF3: the smith's stock stays in the Stores until its professions' templates
  'carried-full': 409, 'carried-short': 409,   // BAG1: a carried count at its bound, or holding fewer than a deposit asks
  'prof-later': 409,   // PROF4: a recipe whose slice is to come - the Ram Kit (PROF0 25)
  'prof-hunt-high': 409, 'prof-foe': 400, 'prof-dye': 400,   // PROF7: Hunting's rare hides (3 of tiers 5-6 a day - CAP-OFF: no `prof-hunt-cap`, nor PROF8's `prof-fish-cap`), a body no knife skins, a dye asked of what takes none
  'prof-sculptor': 403,   // PROF11: the stone decor is a Sculptor's - a skill's door, as the rank's
  'prof-master': 400, 'prof-master-lines': 400, 'prof-master-day': 409,   // MASTER-ART: no tier, lines the piece may not carry, the day's work made
  'prof-lapidary': 403,   // PROF10: a Siege-cracked Gem is set as a gem by a Lapidary alone - a skill's door, as the Sculptor's
  // PROF12: a transmutation is a Transmuter's (a skill's door); a cauldron DFU's law answers with no such potion, a bad piece's id;
  // no such piece, another's; one listed, on the road or set down; one that makes no Essence
  'prof-embers': 409,   // DAEDRIC-SMELT: the Daedric smelt's embers, the account's purse short
  'prof-transmuter': 403, 'bad-brew': 400, 'bad-piece': 400, 'prof-no-piece': 404, 'prof-not-yours': 403, 'prof-piece-busy': 409, 'prof-no-essence': 409,
  // AUDIT PROF-541 B2: a realm character's disenchant moves its record - a piece the record does not hold, and the record's own words
  'prof-piece-gone': 409, 'realm-needed': 400, lease: 409, seq: 409, 'no-realm-character': 404, 'no-data': 404, 'no-storage': 503,
  'node-taken': 409, 'writ-taken': 409, 'writ-expired': 409, 'writ-cap': 409, 'marks-full': 409, 'marks-short': 409, 'prof-respec-pending': 409,
  'prof-rate': 429,
  'craft-writ-cap': 409, 'craft-writ-filled': 409, 'craft-unbrewed': 409, 'craft-pieces': 409, 'craft-goods-gone': 409,   // CRAFT-WRITS: the day's three, the brews, the pieces, the record's goods
  'chapters-closed': 403,   // AUDIT CHAP2 S3: a hall writ while the Chapters are not this account's - 403, as every door says it
  // PROF6: guild writs, commissions and the guild Stores
  'writs-closed': 403, 'guild-rank': 403, 'guilds-need-account': 403, 'commission-not-yours': 403, 'market-not-yours': 403,
  'no-guild': 404, 'commission-crafter': 404,
  'writ-gone': 409, 'writ-elsewhere': 409, 'writ-short': 409, 'writ-moved': 409, 'writ-budget': 409, 'guild-marks-short': 409,
  'guild-writs-max': 409, 'guild-stores-full': 409, 'guild-stores-short': 409, 'commissions-max': 409, 'commissions-crafter-max': 409,
  'commission-self': 409, 'commission-piece': 409, 'commission-not-made': 409, 'commission-worn': 409, 'market-listed': 409,
  'market-piece-gone': 409,   // INT19: a crafted piece the crafter's record does not hold
  'market-standing': 409,
  'writ-own-guild': 403, 'guild-stores-mine': 403, 'market-uncollected': 409, 'commission-unyielded': 409, 'market-no-record': 409,   // AUDIT 31
  'commission-elsewhere': 409, 'market-unyielded': 409,
  'writ-rate': 429,
  // SILVER-WAYS: guild contracts
  'marks-need-account': 403, 'no-contract': 404, 'contract-gone': 409, 'guild-contracts-max': 409,
  // PROF2b: a Motherlode's strike
  'motherlode-closed': 409, 'motherlode-watch': 409, 'motherlode-found': 409, 'motherlode-full': 409, 'no-gate-key': 503,
});
/** PROF5: each market refusal's status - not this account's (a guest, the switches, a moderator's act) 403, no such
 *  listing, order or delivery 404, a conflict with what stands (the Marks, the Stores, the units, the road, the price
 *  moved, one's own goods) 409, the hour's acts spent 429, a bad shape 400 (the default). */
export const MARKET_STATUS = Object.freeze({
  ...JUDGE_STATUS,   // INT3/INT4
  'prof-need-account': 403, 'market-closed': 403, 'not-moderator': 403, 'not-developer': 403,   // STAFF-PANEL2-FIX: a pull is a developer's
  'market-gone': 404,
  'marks-short': 409, 'marks-full': 409, 'stores-full': 409, 'stores-short': 409, 'market-own': 409, 'market-short': 409,
  'market-seller-frozen': 409,   // STAFF-PANEL5-FREEZE: a frozen seller's goods sell nothing while the freeze stands
  'market-no-road': 409, 'market-price-moved': 409, 'market-seller-full': 409, 'market-listings-max': 409, 'market-orders-max': 409,
  'market-not-yours': 409, 'market-listed': 409, 'market-order-full': 409, 'market-elsewhere': 409, 'market-other-character': 409,
  'market-on-road': 409, 'market-courier-dear': 409,   // GLOBAL-MARKET: a fill from afar whose courier would take all its pay
  'market-taxed-out': 409,   // MARKET-AUDIT S2: a fill its tax would leave paying nothing
  'market-not-listable': 409, 'market-uncollected': 409, 'market-standing': 409, 'market-unyielded': 409,   // AUDIT 30
  'market-no-record': 409,   // AUDIT 31 H1
  'auction-not-masterwork': 409, 'auction-low': 409, 'auction-leading': 409, 'auction-bid-standing': 409,   // PROF5b
  'auction-moved': 409,   // AUDIT 31 S4
  // GOLD-MARKET: gold is a realm record's; what gold bought stays gold's (the wall); a record's own refusals
  'market-gold-realm': 409, 'market-currency': 409, 'market-gold-goods': 409, 'market-drakes-goods': 409, 'market-gold-none': 409, 'market-gold-full': 409,
  'stores-gold': 409, 'realm-gold': 409, lease: 409, 'realm-needed': 400, 'no-realm-character': 404, 'no-data': 404, 'no-storage': 503,
  // MARKET-ANY: a piece from the pack - the record's own piece, a crafted piece's own way
  'market-not-good': 409, 'market-good-gone': 409, 'market-piece-route': 409, 'market-goods-gold': 409,
  'market-piece-gone': 409,   // INT19: a crafted piece its seller's record does not hold
  'market-rate': 429,
  // HOME-VENDOR: a trader's refusals
  'bad-vendor': 400, 'vendor-only': 409, 'vendor-not-here': 409, 'vendor-gone': 404, 'vendor-not-yours': 403, 'vendor-full': 409,   // MARKET-AUDIT
});
