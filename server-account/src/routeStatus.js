// HTTP status for each refusal code, by route family. Callers answer 400 for a code that no table lists.

export const JUDGE_STATUS = Object.freeze({ 'trade-held': 409, 'record-unjudged': 409, 'piece-dupe': 409, 'piece-claimed': 409, 'piece-legacy': 409 });
export const WILD_STATUS = Object.freeze({ 'no-gate-key': 503, 'no-signing-key': 503, 'not-yours': 403, grace: 409, 'fallen-frozen': 409, nonce: 400, 'no-escrow': 404, 'escrow-wait': 409, 'escrow-late': 409, 'escrow-moved': 409, 'escrow-collected': 409, 'escrow-returned': 409, 'sea-prize-moved': 409, 'sea-prize-realm': 403 });
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
export const CARDS_STATUS = Object.freeze({ 'cards-closed': 503, 'ranked-needs-account': 403 });
export const REPORT_STATUS = Object.freeze({ 'report-rate': 429, 'report-full': 409, 'no-report': 404, 'not-report-reader': 403 });
export const POST_STATUS = Object.freeze({ 'no-post': 404, 'post-no-item': 409, 'post-claimed': 409, 'post-unclaimed': 409, 'realm-only': 403, 'realm-needed': 409, server: 503,
  'lost-pieces': 400, 'lost-item': 400, 'lost-no-kill': 409, 'lost-spent': 409, 'lost-full': 409 });
export const REALM_STATUS = Object.freeze({
  ...JUDGE_STATUS,
  'no-realm-character': 404, 'no-data': 404, lease: 409, seq: 409, 'too-many-characters': 409, auth: 401,
  'customs-never-online': 403, 'customs-other-account': 403, 'customs-already': 409, 'no-storage': 503,
  'trade-spent': 409,
  'guild-master-leaves': 409,
  'guild-treasury': 409,
  'guild-hall': 409,
  'guild-vault': 409,
  'guild-seat': 409, 'guild-battle': 409,
  'realm-market-open': 409,
  'home-tenants': 409, 'home-rent-due': 409,
  'home-heir-full': 409, 'home-plan-changed': 409,
  'home-vendor-stocked': 409,
  'realm-birth': 403, 'customs-allowance': 403,
  dead: 410, 'no-lineage': 404, 'lineage-person': 409, 'lineage-played': 409, 'lineage-model': 409, 'too-many-lineages': 409,
  'wed-no-line': 409, 'wed-already': 409, 'wed-partner': 409, 'wed-spent': 409,
  'lineage-too-large': 413,
  'not-dead': 409, 'raise-late': 409, 'raise-no-line': 409,
});
export const PASS_STATUS = Object.freeze({ 'not-developer': 403, 'no-player': 404, ambiguous: 409 });
export const ROLL_STATUS = Object.freeze({
  'chapters-closed': 403, 'no-realm-character': 404, 'no-data': 404, lease: 409, 'roll-unseeded': 409, 'roll-busy': 409, dead: 410,
  'halls-need-account': 403, 'halls-rate': 429,
  'roll-rate': 429,
  'hall-struck': 409, 'not-developer': 403, 'bad-region': 400,
  'not-master': 403,
  'no-event': 409, closed: 409, 'not-member': 403,
  'marks-need-account': 403, 'marks-closed': 403, 'guilds-need-account': 403, 'no-guild': 404, 'guild-rank': 403, 'marks-rate': 429,
  'no-season': 409, 'no-chapter': 404, 'patron-low': 409, 'guild-marks-short': 409,
});
export const REVIEW_STATUS = Object.freeze({ 'not-developer': 403, 'no-realm-character': 404, 'no-clean': 409, 'service-moved': 409, 'dead': 409, 'no-player': 404, 'repair-no-faction': 409, 'repair-not-set': 409, seq: 409, 'mend-not-negative': 409, 'mend-moved': 409, 'repair-ticket': 409 });
export const GUILD_STATUS = Object.freeze({
  ...JUDGE_STATUS,
  'guilds-need-account': 403, 'guild-rank': 403, 'guild-renown': 403,
  'no-guild': 404, 'no-invite': 404, 'no-member': 404, 'no-player': 404,
  'guild-already': 409, 'guild-name-taken': 409, 'guild-tag-taken': 409, 'guild-full': 409, 'guild-master-leaves': 409,
  'guild-treasury': 409, 'guild-treasury-full': 409, 'guild-treasury-short': 409, 'guild-treasury-old': 409, 'marks-full': 409,
  'guild-stores': 409, 'guild-writs': 409,
  'guild-writ-escrow': 409,
  'guild-contracts': 409,
  'guild-rate': 429,
  'home-taken': 409, 'guild-hall-have': 409, 'guild-hall-moved': 409, 'guild-hall': 409, 'guild-hall-none': 404, 'home-rate': 429,
  'home-arena': 409,
  'home-layout': 409, 'home-update': 426,
  'heraldry-same': 409, 'heraldry-moved': 409, 'heraldry-drakes': 409, 'marks-closed': 403,
  'heraldry-siege': 409,
  'guild-rename-same': 409, 'guild-name-word': 400, 'guild-rank-word': 400, 'guild-rename-soon': 409, 'guild-rename-siege': 409, 'guild-rename-gold': 409, 'guild-rename-moved': 409,
  'guild-vault-rank': 403, 'guild-vault-limit': 409, 'guild-vault-full': 409, 'guild-vault-empty': 404, 'guild-vault-moved': 409, 'vault-goods': 409, 'guild-vault': 409,
  'realm-only': 400, 'bad-vault-item': 400, 'bad-vault-count': 400, 'bad-vault-slot': 400, 'bad-vault-grant': 400,
  'guild-seat': 409, 'guild-battle': 409,
  'guild-patron': 409,
  'board-closed': 403, muted: 403, 'no-note': 404, 'notes-full': 409, 'board-rate': 429, 'board-ops-rate': 429,
  'realm-needed': 400, 'realm-gold': 409, lease: 409, seq: 409, 'no-realm-character': 404, 'no-data': 404, 'no-storage': 503,
});
export const EG_STATUS = Object.freeze({
  'no-signing-key': 503, 'no-gate-key': 503,
  guest: 403, 'not-yours': 403, unproven: 403,
  live: 409, short: 409, rehearsed: 409, spent: 409, capped: 409,
  bought: 409,
  fenced: 409,
  start: 403,
  none: 404,
});
export const MARKS_STATUS = Object.freeze({
  'marks-need-account': 403, 'marks-closed': 403, 'marks-young': 403, 'not-developer': 403, 'guild-rank': 403, 'guilds-need-account': 403,
  'no-guild': 404,
  'marks-short': 409, 'marks-bank-cap': 409, 'marks-full': 409, 'guild-marks-short': 409, 'guild-marks-full': 409,
  'marks-rate': 429,
});
export const SAFETY_STATUS = Object.freeze({ 'no-player': 404, 'no-case': 404, 'report-unwitnessed': 403, 'report-closed': 503, 'conduct-stale': 409, 'blocks-full': 409, rate: 429,
  'not-moderator': 403, protected: 403, ambiguous: 409,
  'bad-minutes': 400, 'bad-days': 400, 'not-banned': 400, 'case-acted': 409, 'case-closed': 409, 'staff-claimed': 409, 'not-developer': 403, 'admin-sanction': 403,
  'bad-click': 400 });
export const BOARD_STATUS = Object.freeze({
  'board-need-account': 403, 'board-closed': 403, 'muted': 403, 'not-moderator': 403, 'not-developer': 403, 'own-note': 403,
  'guild-rank': 403, 'guilds-need-account': 403,
  'no-note': 404, 'no-notice': 404, 'note-no-guild': 404,
  'notes-full': 409,
  'board-rate': 429, 'board-ops-rate': 429,
});
export const TOWN_STATUS = Object.freeze({ 'towns-need-account': 403, 'towns-rate': 429, 'no-gate-key': 503, 'towns-closed': 403, 'not-developer': 403, 'town-unwalked': 403 });
// Seat routes that only read, so they still answer while a seat settle is pending.
export const SEAT_READS = new Set(['/v1/seats/list', '/v1/seats/standings', '/v1/seats/records', '/v1/seats/forts']);
export const SEAT_STATUS = Object.freeze({
  'seats-need-account': 403, 'seats-closed': 403, 'not-developer': 403, 'seat-struck': 409, 'seats-rate': 429,
  'not-moderator': 403,
  'guild-rank': 403, 'guilds-need-account': 403, 'marks-closed': 403, 'no-guild': 404, 'seat-unconfirmed': 404,
  'seat-reckoning': 409, 'seat-pledges-full': 409, 'seat-no-pledge': 409, 'seat-tribute-cap': 409, 'guild-marks-short': 409,
  'no-gate-key': 503,
  'seat-not-held': 409, 'seat-held-here': 409,
  'tithe-this-week': 409, 'edict-twice': 409, 'seat-no-edict': 409, 'marks-full': 409, 'edict-tier': 409,
  'battle-none': 404, 'hire-none': 404, 'no-such-account': 404, 'battle-not-side': 403, 'sellsword-member': 403,
  'sign-closed': 409, 'sign-new-member': 409, 'sign-unbound': 409, 'sign-bound-elsewhere': 409, 'side-full': 409,
  'sellswords-full': 409, 'sellsword-cooling': 409, 'sign-twice': 409, 'hire-twice': 409,
  'pass-early': 409, 'pass-late': 409, 'field-unsettled': 409, 'honours-twice': 409, 'not-yours': 403,
  'battle-void': 409, 'window-reckoning': 409,
  'battle-settled': 409,
  'royal-none': 404, 'royal-over': 409, 'ring-unsettled': 409,
  'guild-unknown': 404, 'fealty-none': 404, 'pact-none': 404, 'fealty-unfit': 409, 'fealty-sworn': 409, 'fealty-pledged': 409,
  'pact-signed': 409, 'pact-self': 409, 'pact-pledged': 409, 'fealty-pledge': 409, 'pact-pledge': 409,
  'fort-not-here': 409, 'fort-building': 409, 'fort-max': 409, 'seat-treasury': 409,
});
export const PROF_STATUS = Object.freeze({
  ...JUDGE_STATUS,
  'prof-need-account': 403, 'prof-closed': 403, 'marks-closed': 403, 'prof-rank': 403,
  'no-writ': 404, 'bad-recipe': 404,
  'prof-pixel': 409, 'prof-day': 409, 'prof-late': 409, 'stores-full': 409, 'stores-short': 409,
  'prof-deep-cap': 409, 'prof-spec-stale': 409, 'prof-spec-taken': 409, 'prof-trial-over': 409,
  'prof-no-pack-form': 409,
  'carried-full': 409, 'carried-short': 409,
  'prof-later': 409,
  'prof-hunt-high': 409, 'prof-foe': 400, 'prof-dye': 400,
  'prof-sculptor': 403,
  'prof-master': 400, 'prof-master-lines': 400, 'prof-master-day': 409,
  'prof-lapidary': 403,
  'prof-embers': 409,
  'prof-transmuter': 403, 'bad-brew': 400, 'bad-piece': 400, 'prof-no-piece': 404, 'prof-not-yours': 403, 'prof-piece-busy': 409, 'prof-no-essence': 409,
  'prof-piece-gone': 409, 'realm-needed': 400, lease: 409, seq: 409, 'no-realm-character': 404, 'no-data': 404, 'no-storage': 503,
  'node-taken': 409, 'writ-taken': 409, 'writ-expired': 409, 'writ-cap': 409, 'marks-full': 409, 'marks-short': 409, 'prof-respec-pending': 409,
  'prof-rate': 429,
  'craft-writ-cap': 409, 'craft-writ-filled': 409, 'craft-unbrewed': 409, 'craft-pieces': 409, 'craft-goods-gone': 409,
  'chapters-closed': 403,
  'writs-closed': 403, 'guild-rank': 403, 'guilds-need-account': 403, 'commission-not-yours': 403, 'market-not-yours': 403,
  'no-guild': 404, 'commission-crafter': 404,
  'writ-gone': 409, 'writ-elsewhere': 409, 'writ-short': 409, 'writ-moved': 409, 'writ-budget': 409, 'guild-marks-short': 409,
  'guild-writs-max': 409, 'guild-stores-full': 409, 'guild-stores-short': 409, 'commissions-max': 409, 'commissions-crafter-max': 409,
  'commission-self': 409, 'commission-piece': 409, 'commission-not-made': 409, 'commission-worn': 409, 'market-listed': 409,
  'market-piece-gone': 409,
  'market-standing': 409,
  'writ-own-guild': 403, 'guild-stores-mine': 403, 'market-uncollected': 409, 'commission-unyielded': 409, 'market-no-record': 409,
  'commission-elsewhere': 409, 'market-unyielded': 409,
  'writ-rate': 429,
  'marks-need-account': 403, 'no-contract': 404, 'contract-gone': 409, 'guild-contracts-max': 409,
  'motherlode-closed': 409, 'motherlode-watch': 409, 'motherlode-found': 409, 'motherlode-full': 409, 'no-gate-key': 503,
});
export const MARKET_STATUS = Object.freeze({
  ...JUDGE_STATUS,
  'prof-need-account': 403, 'market-closed': 403, 'not-moderator': 403, 'not-developer': 403,
  'market-gone': 404,
  'marks-short': 409, 'marks-full': 409, 'stores-full': 409, 'stores-short': 409, 'market-own': 409, 'market-short': 409,
  'market-seller-frozen': 409,
  'market-no-road': 409, 'market-price-moved': 409, 'market-seller-full': 409, 'market-listings-max': 409, 'market-orders-max': 409,
  'market-not-yours': 409, 'market-listed': 409, 'market-order-full': 409, 'market-elsewhere': 409, 'market-other-character': 409,
  'market-on-road': 409, 'market-courier-dear': 409,
  'market-taxed-out': 409,
  'market-not-listable': 409, 'market-uncollected': 409, 'market-standing': 409, 'market-unyielded': 409,
  'market-no-record': 409,
  'auction-not-masterwork': 409, 'auction-low': 409, 'auction-leading': 409, 'auction-bid-standing': 409,
  'auction-moved': 409,
  'market-gold-realm': 409, 'market-currency': 409, 'market-gold-goods': 409, 'market-drakes-goods': 409, 'market-gold-none': 409, 'market-gold-full': 409,
  'stores-gold': 409, 'realm-gold': 409, lease: 409, 'realm-needed': 400, 'no-realm-character': 404, 'no-data': 404, 'no-storage': 503,
  'market-not-good': 409, 'market-good-gone': 409, 'market-piece-route': 409, 'market-goods-gold': 409,
  'market-piece-gone': 409,
  'market-rate': 429,
  'bad-vendor': 400, 'vendor-only': 409, 'vendor-not-here': 409, 'vendor-gone': 404, 'vendor-not-yours': 403, 'vendor-full': 409,
});
