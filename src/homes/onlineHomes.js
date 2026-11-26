// @ts-check
// Client view of the online home registry the account service keeps, read one town at a time.
// An online home stores its things under its own scene name (homeSceneName), never the building's, so an offline
// visit to the same building cannot restock a stranger's cupboard over them.

import {
  HOME_ENTRIES, HOME_ENTRY_DEFAULT, homeMapIdOk, homeBuildingKeyOk, homePriceOk, homeMayEnter, rentPriceOk, rentDaysLeft, homeLookOf,
  homeInArenaCell,
  homeDeedOf,
} from '../net/homeLaw.js';
import { maskText } from '../net/nameFilter.js';
import { homeSceneName } from '../net/homeScene.js';
import { ARENA_TEXT } from '../arena/arenaText.js';
import { RENT_VERB, rentRowLabel, rentTenantLabel } from './homeRent.js';
import { BUILDING_TYPES, isResidence } from '../world/buildingNames.js';
import { isBunnyHall } from '../guilds/bunnyGuilds.js';
import { DEED_SELL_MULT, CROSSED_DEED_LINES, deedStands } from '../trade/banking.js';
import { guildTagText, GUILD_MOVE_MAX } from '../net/guildLaw.js';
import { GUILD_HALL_ENTRIES, GUILD_HALL_ENTRY_WORDS, guildHallPrice } from '../net/hallLaw.js';
import { heraldryOf } from '../net/heraldryLaw.js';
import { layoutStampOfMapId, CLASSIC_LAYOUT } from '../world/layoutPins.js';
import { goldSum as gold, EMPIRE_ACCOUNT_WORDS } from './homeWords.js';
import { walletReserve } from '../net/realmGoldLaw.js';
import {
  HOME_VOTE_UP, HOME_VOTE_DOWN, homeScoreOf, homeMyVoteOf, homeShunned, homeShunnedInsiderLine, homeVotesLine, HOME_SHUNNED_LINE,
} from '../net/homeVoteLaw.js';
import { takeSceneOwn, removePermanentScene } from '../world/sceneCache.js';
import { ownBackLines } from './decorFurnish.js';
import { t } from '../ui/textManager.js';
import { createTownBatch } from './homeTownBatch.js';
import { homeOwnerFieldsOf, homeMayTransfer, homeHasOwners } from './homeOwnerLaw.js';

export const HOME_TOWN_TTL_MS = 60_000;
export const HOME_RETRY_MS = 10_000;
export const HOME_RETRY_MAX_MS = 300_000;
export const homeRetryMs = (n) => Math.min(HOME_RETRY_MAX_MS, HOME_RETRY_MS * 2 ** Math.max(0, n - 1));
export const HOME_ASK_WAIT_MS = 2_500;

export const HOME_ENTRY_WORDS = Object.freeze({ private: 'Only me', party: 'My party', public: 'Anyone', guild: 'My guild' });


/** A faction's House2 is never a home: Daggerfall locks it to that guild's members, so a sale shuts them out. */
export function homeCandidate(bd) {
  const t = bd?.buildingType;
  if (!homeBuildingKeyOk(bd?.buildingKey)) return false;
  if (t === BUILDING_TYPES.House2 && (bd.factionId ?? 0) !== 0) return false;
  if (isBunnyHall(bd)) return false;
  return t === BUILDING_TYPES.HouseForSale || isResidence(t) || t === BUILDING_TYPES.House5 || t === BUILDING_TYPES.House6;
}

/** A House5 crypt has no interior model, so DFU never sells one; a record without `hasInterior` is allowed. */
export const homePurchasable = (bd, { isActiveQuestBuilding = null } = {}) =>
  homeCandidate(bd) && bd.hasInterior !== false && !(isActiveQuestBuilding?.(bd) ?? false);

export { homeSceneName };
const HOME_SCENE_RE = /^OnlineHome \[MapID=(\d+), BuildingKey=(\d+)\]$/;
export function homeSceneOf(name) {
  const m = HOME_SCENE_RE.exec(String(name ?? '').split('|')[0]);
  if (!m) return null;
  const mapId = Number(m[1]) >>> 0, buildingKey = Number(m[2]);
  return homeMapIdOk(mapId) && homeBuildingKeyOk(buildingKey) ? { mapId, buildingKey } : null;
}

/**
 * @param {{ scenes: Map<string, any>, permanent: Set<string> }} cache
 * @param {any[]} held
 * @param {{ ownNow?: (mapId: number, buildingKey: number) => boolean }} [opts]
 */
export function homesGoneFrom(cache, held, { ownNow = () => false } = {}) {
  const keep = new Set((Array.isArray(held) ? held : []).map((h) => `${Number(h?.mapId) >>> 0}:${h?.buildingKey}`));
  const own = [];
  const gone = new Set();
  for (const name of new Set([...(cache?.scenes?.keys?.() ?? []), ...(cache?.permanent ?? [])])) {
    const at = homeSceneOf(name);
    if (!at || keep.has(`${at.mapId}:${at.buildingKey}`) || homeInArenaCell(at.mapId, at.buildingKey) || ownNow(at.mapId, at.buildingKey)) continue;
    own.push(...takeSceneOwn(cache, name));
    gone.add(homeSceneName(at.mapId, at.buildingKey));
  }
  for (const name of gone) removePermanentScene(cache, name);
  return { own, gone: [...gone] };
}
export const homesGoneLine = (items) => ownBackLines(items, (n) => t('home.goneBack', '{n, plural, one {One of your things stood in a home your account no longer holds, and came back to your pack.} other {# of your things stood in a home your account no longer holds, and came back to your pack.}}', { n }));

export const homeRefund = (price) => Math.trunc((Number.isSafeInteger(price) && price > 0 ? price : 0) * DEED_SELL_MULT);

export const homeTownBlocks = (dfLoc) => {
  const ext = dfLoc?.exterior?.exteriorData;
  const n = (ext?.width ?? 0) * (ext?.height ?? 0);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
};
export const homeFootprintM2 = (size, scale) => {
  const m2 = (size?.x ?? 0) * (size?.z ?? 0) * scale * scale;
  return Number.isFinite(m2) && m2 > 0 ? m2 : 0;
};
export const homeSaleOffer = (home, price) => (Number.isSafeInteger(home?.refund) && home.refund >= 0 ? home.refund : homeRefund(price));

export function homeDoorAnswer(home, { partyNames = [], questSite = false } = {}) {
  if (!home) return 'none';
  if (home.own) return 'own';
  if (homeMayEnter(home, { partyNames }) || questSite) return 'enter';
  return 'locked';
}

export function homeDoorPrompt({ door, mode, price = 0, declined = false, asked = false, isBash = false, hallMenu = false }) {
  if (isBash || asked) return null;
  if (door === 'own') return mode === 'info' ? 'menu' : null;
  if (hallMenu && door === 'enter') return mode === 'info' ? 'hall-menu' : null;
  if (door !== 'none' || !(price > 0)) return null;
  if (mode === 'info') return 'offer';
  return mode === 'steal' || declined ? null : 'offer';
}

export const homeDoorTitle = (home, questName = null) => {
  const title = home.hall ? (home.member ? "Your guild's hall" : `${home.hall.name}'s hall${home.hall.tag ? ` ${guildTagText(home.hall.tag) ?? ''}` : ''}`.trim())
    : home.title ? (home.own ? `${maskText(home.title)} (your home)` : maskText(home.title))
    : home.own ? 'Your home' : `${home.owner}'s home`;
  return questName ? `${questName} (${title})` : title;
};
export const homeDoorName = (name, hasVerbs) => name || (hasVerbs ? 'Residence' : '');
export const homeOutsideKept = (home) => !!home && (home.own === true || (!!home.hall && home.keeper === true));
export const homeYardWhere = (home) => (home?.hall ? "Your guild's yard" : 'Your yard');
export const homeLockedLine = (home) => (home.hall ? `This is the hall of ${home.hall.name}. Its doors open to its members.` : `This is ${home.owner}'s home. The door is locked.`);
export const homeBelongsLine = (home) => `This belongs to ${home.hall ? home.hall.name : home.owner}.`;
export const homeStationsServe = (home) => home?.mine === true;
export const homeForSaleLine = (price) => `Can be your home: ${gold(price)} gold`;
export const homeOfferLines = (price) => ['This house can be your home.', `It costs ${gold(price)} gold, from your purse and ${EMPIRE_ACCOUNT_WORDS}.`, 'Buy it?'];
export const HOME_BOUGHT_LINE = 'This house is your home now. Only you can enter it until you say otherwise.';
export const homeShortLine = (price) => `You need ${gold(price)} gold, in your purse and ${EMPIRE_ACCOUNT_WORDS} together.`;
/** Buying takes two presses within HOME_BUY_ARM_MS, so one stray click never spends the gold. */
export const HOME_BUY_ARM_MS = 5_000;
export const HOME_VERB = Object.freeze({ enter: 'home-enter', buy: 'home-buy', entry: 'home-entry', sell: 'home-sell', give: 'home-give', take: 'home-take', refuse: 'home-refuse', rent: RENT_VERB, decorators: 'home-decorators', owners: 'home-owners' });
/** Taking a vote back is its own verb, so two quick presses on Vote up send two up votes. */
export const HOME_VOTE_VERB = Object.freeze({ up: 'home-vote-up', down: 'home-vote-down', clear: 'home-vote-clear' });
export const HALL_VERB = Object.freeze({ buy: 'home-hall', entry: 'home-hall-entry', sell: 'home-hall-sell' });
export const homeBuyRows = (price, armed = false) => [
  { id: HOME_VERB.enter, label: 'Go in' },
  { id: HOME_VERB.buy, label: armed ? `Click again to buy: ${gold(price)} gold` : `Buy it: ${gold(price)} gold` },
];
export const homeOwnerRows = (entry, home = null) => [
  { id: HOME_VERB.enter, label: 'Go in' },
  { id: HOME_VERB.entry, label: `Who may enter: ${HOME_ENTRY_WORDS[entry] ?? HOME_ENTRY_WORDS[HOME_ENTRY_DEFAULT]}` },
  { id: HOME_VERB.sell, label: 'Sell it' },
  ...(home && !homeMayTransfer(home) ? [] : [{ id: HOME_VERB.give, label: t('housing.door.transfer', 'Transfer Ownership') }]),
  ...(home && homeHasOwners(home) ? [{ id: HOME_VERB.owners, label: t('housing.door.owners', 'Co-owners') }] : []),
  { id: HOME_VERB.decorators, label: t('decor.decorators.row', 'Decorators') },
];
export function homeVisitorRows(home, door, nowS = Math.floor(Date.now() / 1000)) {
  if (home?.hall) return homeHallRows(home, door);
  if (!home || home.own) return null;
  const offer = home.offer ? [{ id: HOME_VERB.take, label: home.offer.price > 0 ? t('housing.door.acceptPriced', 'Accept the house: {gold} gold', { gold: gold(home.offer.price) }) : t('housing.door.accept', 'Accept the house') }, { id: HOME_VERB.refuse, label: t('housing.door.decline', 'Decline the house') }] : [];
  if (rentDaysLeft(home.tenant, nowS) > 0) return [{ id: HOME_VERB.enter, label: 'Go in' }, { id: HOME_VERB.rent, label: rentTenantLabel(rentDaysLeft(home.tenant, nowS)) }, ...offer];
  // The service refuses rent from the owner's own account (`rent-own`), so its other characters see only the door.
  if (!home.rent || home.mine) return offer.length ? offer : null;
  return [...(door === 'enter' ? [{ id: HOME_VERB.enter, label: 'Go in' }] : []), { id: HOME_VERB.rent, label: rentRowLabel(home.rent.from) }, ...offer];
}

/** Matches VOTABLE in server-account/src/homeVotes.js. */
export const homeVotable = (home) => !!home && !home.own && home.mine !== true && home.deed !== true && !(home.hall && (home.member === true || home.insider === true));
export const homeVoteOfVerb = (id) => (id === HOME_VOTE_VERB.up ? HOME_VOTE_UP : id === HOME_VOTE_VERB.down ? HOME_VOTE_DOWN : id === HOME_VOTE_VERB.clear ? 0 : null);
export function homeVoteRows(home) {
  const mine = homeMyVoteOf(home?.myVote);
  if (!homeVotable(home)) return mine ? [{ id: HOME_VOTE_VERB.clear, label: `Take back your vote ${mine === HOME_VOTE_UP ? 'up' : 'down'}` }] : [];
  return [
    mine === HOME_VOTE_UP ? { id: HOME_VOTE_VERB.clear, label: 'Take back your vote up' } : { id: HOME_VOTE_VERB.up, label: 'Vote up' },
    mine === HOME_VOTE_DOWN ? { id: HOME_VOTE_VERB.clear, label: 'Take back your vote down' } : { id: HOME_VOTE_VERB.down, label: 'Vote down' },
  ];
}
export const isHomeVoteVerb = (id) => homeVoteOfVerb(id) !== null;
export const homeVotePressable = (home, vote) => homeVotable(home) || (vote === 0 && !!homeMyVoteOf(home?.myVote));
export const homeVoteChoices = (home) => homeVoteRows(home).map((row) => {
  const down = row.id === HOME_VOTE_VERB.down || (row.id === HOME_VOTE_VERB.clear && homeMyVoteOf(home.myVote) === HOME_VOTE_DOWN);
  return { code: down ? 'KeyD' : 'KeyU', label: `${down ? 'D' : 'U'} - ${row.label}`, vote: homeVoteOfVerb(row.id) };
});
export function homeVoteLines(home) {
  if (!home) return [];
  const score = homeScoreOf(home.score);
  if (!homeVotable(home)) {
    if (homeShunned(score)) return [homeShunnedInsiderLine(score, !!home.hall)];
    return score !== 0 ? [homeVotesLine(score)] : [];
  }
  const lines = score !== 0 || homeMyVoteOf(home.myVote) ? [homeVotesLine(score, homeMyVoteOf(home.myVote))] : [];
  return homeShunned(score) ? [...lines, HOME_SHUNNED_LINE] : lines;
}

export function homeHallBuyRow(price, guild, armed = false) {
  if (!guild || guild.rank !== 0 || guild.hall) return null;
  const cost = guildHallPrice(price);
  return { id: HALL_VERB.buy, label: armed ? `Click again to buy it for ${guild.name}: ${gold(cost)} gold` : `Buy it for ${guild.name}: ${gold(cost)} gold from the treasury` };
}
export const hallEntryTurnable = (home) => !!home?.hall && !!home.hallEntry;
export const hallSellable = (home) => !!home?.hall && home.hallSell === true;
export const hallManaged = (home) => hallEntryTurnable(home) || hallSellable(home);
export function homeHallRows(home, door) {
  if (!home?.hall || door !== 'enter') return null;
  return [{ id: HOME_VERB.enter, label: 'Go in' }, ...(hallEntryTurnable(home) ? [{ id: HALL_VERB.entry, label: `Who may enter: ${GUILD_HALL_ENTRY_WORDS[home.entry] ?? GUILD_HALL_ENTRY_WORDS.guild}` }] : []),
    ...(hallSellable(home) ? [{ id: HALL_VERB.sell, label: t('home.hall.sell', 'Sell it') }] : [])];
}
export const hallOwnerLines = (home) => [t('home.hall.owner', 'This is the hall of {name}.', { name: home?.hall?.name ?? hallYourGuild() }),
  t('home.hall.entry', 'Who may enter: {who}.', { who: GUILD_HALL_ENTRY_WORDS[home?.entry] ?? GUILD_HALL_ENTRY_WORDS.guild })];
export const hallYourGuild = () => t('home.hall.yourGuild', 'your company');
export const hallSaleLines = (home) => [
  t('home.hall.saleAsk', 'Sell the hall of {name} for {gold} gold, and half of what its placed pieces cost?', { name: home?.hall?.name ?? hallYourGuild(), gold: gold(Number.isSafeInteger(home?.refund) ? home.refund : 0) }),
  t('home.hall.saleTreasury', 'The gold goes to the company\'s treasury. The pieces go with the hall.'),
  t('home.hall.saleVault', 'The company\'s vault stays the company\'s.'),
];
export const hallSoldLine = (name, back) => t('home.hall.sold', 'You sold the hall of {name}. {gold} gold went to the company\'s treasury.', { name, gold: gold(Math.max(0, Number(back) || 0)) });
export const hallOfferLabel = (price, guild) => `G: buy it for ${guild?.name ?? 'your guild'}: ${gold(guildHallPrice(price))} gold from the treasury`;
export const hallNextEntry = (entry) => GUILD_HALL_ENTRIES[(Math.max(0, GUILD_HALL_ENTRIES.indexOf(entry)) + 1) % GUILD_HALL_ENTRIES.length];
export const hallBoughtLine = (name) => `This house is now the hall of ${name}. Its members can enter, and its Officers can furnish it.`;
export const hallShortLine = (cost) => `The guild's treasury holds less than ${gold(cost)} gold. Put gold in at the Guild tab's Treasury (Social, then Guild), up to ${gold(GUILD_MOVE_MAX)} at a time. Gold in a bank account does not pay for a hall.`;
export const hallOldGoldLine = (cost) => `The treasury holds less than ${gold(cost)} gold put in by realm characters, and only that gold buys a hall. Older gold, or gold from characters outside the realm, does not count.`;
export const HALL_CHEST_TITLE = "The Guild's Chest";
export const HALL_DROP_TEXT = "Nothing dropped in a guild's hall stays there. Put it in the guild's chest.";
export const HALL_VISITOR_MAGIC_TEXT = "You cannot cast spells in another guild's hall.";
export const HALL_BOARD_TITLE = "The Guild's Board";
export const hallBoardShutLine = (name) => `This board is ${name ?? 'the guild'}'s. Its notes are for its members.`;
export const HALL_BOARD_COLD = "The guild's board cannot be read now.";
export const HALL_OF_RECORDS_TEXT = 'Hall of Records';
export const HALL_OF_RECORDS_SHUT = 'The Hall of Records cannot be read now.';
export const HALL_CHEST_SHUT = "The guild's chest is the guild's vault. Open the Guild tab in the Social panel to use it.";

export const homeNextEntry = (entry) => HOME_ENTRIES[(Math.max(0, HOME_ENTRIES.indexOf(entry)) + 1) % HOME_ENTRIES.length];
export const HOME_OFFER_BUY = 'Y: buy it';
export const HOME_OFFER_PASS = 'N: just go in';

export const homeOwnerLines = (home) => ['This is your home.', homeEntryLine(home.entry)];
export const homeEntryLine = (entry) => `Who may enter: ${HOME_ENTRY_WORDS[entry] ?? HOME_ENTRY_WORDS[HOME_ENTRY_DEFAULT]}.`;
export const homeSaleLines = (refund, rentDue = 0) => [rentDue > 0 ? `Sell your home for ${gold(refund)} gold, and the ${gold(rentDue)} gold of rent you have not collected?` : `Sell your home for ${gold(refund)} gold?`,
  `The gold goes to ${EMPIRE_ACCOUNT_WORDS}. Anything left inside is lost.`,
  'Its placed decorations are sold too, for half their cost. Your own items go back to your pack.'];
export const HOME_CROSSED_LINES = Object.freeze([...CROSSED_DEED_LINES, 'It stays your home.']);
export const homeSoldLine = (refund, piecesBack = 0, rent = 0) => `You sold your home. ${gold(refund + piecesBack + rent)} gold went to ${EMPIRE_ACCOUNT_WORDS}`
  + ([piecesBack > 0 ? `${gold(piecesBack)} of it for its placed pieces` : null, rent > 0 ? `${gold(rent)} of it rent you had not collected` : null].filter(Boolean).map((t, i) => (i ? ` and ${t}` : `, ${t}`)).join('')) + '.';
export const HOME_BANK_LINES = Object.freeze(['Online, a home is bought', 'at its own front door.']);

/**
 * @param {{ api: any, character?: () => (string|null), now?: () => number, ttlMs?: number, onWrote?: ((mapId: number, buildingKey: number) => void) | null, onHomes?: (() => void) | null }} opts
 */
export function createOnlineHomes({ api, character = () => null, now = () => Date.now(), ttlMs = HOME_TOWN_TTL_MS, onWrote = null, onHomes = null }) {
  /** @type {Map<number, {at: number, homes: Map<number, any>}>} */
  const towns = new Map();
  /** @type {Map<number, Promise<boolean>>} */
  const asking = new Map();
  /** @type {Map<number, {at: number, n: number}>} */
  const failed = new Map();
  const fail = (id) => { failed.set(id, { at: now(), n: (failed.get(id)?.n ?? 0) + 1 }); return towns.has(id); };
  /** @type {Map<number, number>} */
  const writes = new Map();
  /** @type {Map<number, number>} */
  const askedAt = new Map();
  const writesTo = (id) => writes.get(id) ?? 0;
  /** @type {Set<number>} */
  const forcedFlight = new Set();
  const askTown = createTownBatch({ api });
  let version = 0;
  const idOf = (mapId) => (Number.isFinite(Number(mapId)) ? Number(mapId) >>> 0 : 0);

  /**
   * @param {any} mapId
   * @param {{ force?: boolean, direct?: boolean, character?: string|null }} [opts]
   * @returns {Promise<boolean>}
   */
  function ensure(mapId, { force = false, direct = false, character: as = undefined } = {}) {
    const id = idOf(mapId);
    if (!homeMapIdOk(id)) return Promise.resolve(false);
    const had = towns.get(id);
    if (!force && had && now() - had.at < ttlMs) return Promise.resolve(true);
    const flying = asking.get(id);
    // A forced ask never takes the answer of a flight already out, which left before the change that forced it.
    // Only a forced flight that set out after my last write answers it.
    if (flying) return !force || (forcedFlight.has(id) && askedAt.get(id) === writesTo(id)) ? flying : afterFlight(id, flying);
    const f = failed.get(id);
    if (!force && f && now() - f.at < homeRetryMs(f.n)) return Promise.resolve(!!had);
    const gen = writesTo(id);
    // A clicked door waits on this town, so `direct` skips the batch and asks for it alone. The playing character's
    // own tenancies ride the answer.
    const p = Promise.resolve()
      .then(() => (force || direct ? api.town(id, as === undefined ? character() : as) : askTown(id, as === undefined ? character() : as)))
      .then((r) => {
        const list = r?.ok ? r.data?.homes : null;
        if (!Array.isArray(list)) return fail(id);
        // An answer that set out before one of my writes landed is older than that write, so it is not believed.
        if (writesTo(id) !== gen) return towns.has(id);
        const homes = new Map();
        for (const h of list) {
          if (!homeBuildingKeyOk(h?.buildingKey) || typeof h.owner !== 'string') continue;
          homes.set(h.buildingKey, {
            buildingKey: h.buildingKey, owner: h.owner,
            title: typeof h.title === 'string' && h.title ? h.title.slice(0, 40) : null,
            entry: HOME_ENTRIES.includes(h.entry) ? h.entry : HOME_ENTRY_DEFAULT,
            mine: h.mine === true, character: typeof h.character === 'string' ? h.character : null,
            crossed: h.crossed === true,
            refund: Number.isSafeInteger(h.refund) && h.refund >= 0 ? h.refund : null,
            rentDue: Number.isSafeInteger(h.rentDue) && h.rentDue > 0 ? h.rentDue : 0,
            rent: Number.isSafeInteger(h.rent?.vacant) && h.rent.vacant > 0 && rentPriceOk(h.rent.from) ? { vacant: h.rent.vacant, from: h.rent.from } : null,
            tenant: Number.isSafeInteger(h.tenant) && h.tenant > 0 ? h.tenant : null,
            look: homeLookOf(h.look ?? null),
            guildmate: h.guildmate === true,
            hall: h.hall && typeof h.hall.name === 'string' ? Object.freeze({ name: h.hall.name, tag: typeof h.hall.tag === 'string' ? h.hall.tag : '', heraldry: heraldryOf(h.hall.heraldry ?? null) }) : null,
            member: h.member === true, keeper: h.keeper === true,
            hallEntry: h.hallEntry === true,
            hallSell: h.hallSell === true,
            deed: h.deed === true,
            offer: h.offer && typeof h.offer.id === 'string' && Number.isSafeInteger(h.offer.price) ? { id: h.offer.id, price: h.offer.price, keepDecor: h.offer.keepDecor === true, keepItems: h.offer.keepItems === true } : null,
            giving: typeof h.giving === 'string' ? h.giving : null,
            ...homeOwnerFieldsOf(h),
            score: homeScoreOf(h.score), myVote: homeMyVoteOf(h.vote),
            insider: h.insider === true,
            decorator: h.decorator === true,
          });
        }
        towns.set(id, { at: now(), homes });
        failed.delete(id);
        version++;
        if (homes.size) told();
        return true;
      }, () => fail(id))
      .finally(() => { asking.delete(id); askedAt.delete(id); forcedFlight.delete(id); });
    asking.set(id, p);
    askedAt.set(id, gen);
    if (force) forcedFlight.add(id);
    return p;
  }

  const afterFlight = (id, flying) => flying.then(() => ensure(id, { force: true }));

  const pressed = new WeakMap();
  /**
   * @param {any} mapId
   * @param {number} [ms]
   * @param {{ direct?: boolean, by?: object|null, after?: object|null }} [o]
   */
  function waitFor(mapId, ms = HOME_ASK_WAIT_MS, { direct = false, by = null, after = null } = {}) {
    const id = idOf(mapId);
    const at = after ? pressed.get(after) : undefined;
    if (after) pressed.delete(after);
    const had = towns.get(id);
    if (at !== undefined && now() - at <= ms && !(had && now() - had.at >= ttlMs)) return Promise.resolve(!!had);
    /** @type {any} */
    let timer = null;
    const late = new Promise((res) => { timer = setTimeout(() => res(towns.has(id)), ms); });
    return Promise.race([ensure(id, { direct }), late]).finally(() => { clearTimeout(timer); if (by) pressed.set(by, now()); });
  }

  const known = (mapId) => towns.has(idOf(mapId));

  function homeAt(mapId, buildingKey) {
    const row = towns.get(idOf(mapId))?.homes.get(buildingKey) ?? null;
    if (!row) return null;
    const me = character();
    // A deed held for the playing character is no online home to it; its door, storage, and bed come from the save.
    if (row.mine && row.deed && typeof me === 'string' && row.character === me) return null;
    const own = row.mine && !row.deed;
    return Object.freeze({ ...row, own });
  }

  /** @type {Map<number, Set<number>>} */
  let everyTown = new Map();
  const told = () => { try { onHomes?.(); } catch { } };
  function hearEveryTown(rows) {
    if (!Array.isArray(rows)) return false;
    /** @type {Map<number, Set<number>>} */
    const next = new Map();
    for (const row of rows) {
      const id = Array.isArray(row) && Array.isArray(row[1]) ? idOf(row[0]) : 0;
      if (!homeMapIdOk(id)) continue;
      const keys = new Set(row[1].filter(homeBuildingKeyOk));
      if (keys.size) next.set(id, keys);
    }
    everyTown = next;
    if (next.size) told();
    return true;
  }
  /** @param {Array<{m: number, u: number[], d: number[]}>} words */
  function hearHome(words) {
    let became = false;
    for (const w of Array.isArray(words) ? words : []) {
      const id = idOf(w?.m);
      if (!homeMapIdOk(id)) continue;
      const keys = new Set(everyTown.get(id) ?? []);
      for (const k of w.u ?? []) if (homeBuildingKeyOk(k) && !keys.has(k)) { keys.add(k); became = true; }
      for (const k of w.d ?? []) { keys.delete(k); towns.get(id)?.homes.delete(k); }
      if (keys.size) everyTown.set(id, keys); else everyTown.delete(id);
      if (towns.has(id)) { version++; ensure(id, { force: true }); }
    }
    if (became) told();
    return became;
  }
  const homeStands = (mapId, buildingKey) => !!towns.get(idOf(mapId))?.homes.has(buildingKey) || !!everyTown.get(idOf(mapId))?.has(buildingKey);

  function wrote(id, buildingKey, row, { mine = true } = {}) {
    writes.set(id, writesTo(id) + 1);
    if (mine) {
      try { onWrote?.(id, buildingKey); } catch { }
    }
    const t = towns.get(id);
    if (t) {
      if (row) t.homes.set(buildingKey, row);
      else t.homes.delete(buildingKey);
      version++;
    }
    ensure(id, { force: true });
  }

  const refused = (r) => ({ ok: false, error: r?.error ?? 'server', ...(Number.isSafeInteger(r?.seq) ? { seq: r.seq } : {}), ...(Array.isArray(r?.matches) ? { matches: r.matches, more: r.more === true } : {}) });
  const realmOf = (r) => (r?.data?.realm ? { data: { realm: r.data.realm } } : {});

  async function claim({ mapId, buildingKey, region, price, realm = null, layout = null }) {
    const id = idOf(mapId);
    const me = character();
    const r = await api.claim({ mapId: id, buildingKey, region, character: me, price, ...(realm ? { realm } : {}), layout: layout || null });
    if (r?.ok) {
      const had = towns.get(id)?.homes.get(buildingKey);
      // An older service sends no refund with a claim, so the claimed price share stands in until the next read.
      const crossed = r.data?.crossed === true;
      const refund = crossed ? null : Number.isSafeInteger(r.data?.refund) && r.data.refund >= 0 ? r.data.refund : homeRefund(price);
      wrote(id, buildingKey, { buildingKey, owner: had?.owner ?? '', entry: r.data?.home?.entry ?? HOME_ENTRY_DEFAULT, mine: true, character: me, crossed, refund, rentDue: 0 });
      return { ok: true, repeat: r.data?.repeat === true, ...realmOf(r) };
    }
    if (r?.error === 'home-taken' || r?.error === 'seq') ensure(id, { force: true });
    return refused(r);
  }

  async function release(mapId, buildingKey, realm = null) {
    const id = idOf(mapId);
    const r = realm ? await api.release(id, buildingKey, realm) : await api.release(id, buildingKey);
    if (r?.ok) {
      wrote(id, buildingKey, null);
      const n = (v) => (Number.isSafeInteger(v) && v > 0 ? v : 0);
      return { ok: true, price: n(r.data?.price), decorCount: n(r.data?.decorCount), decorBack: n(r.data?.decorBack), ...(r.data?.refund != null ? { refund: n(r.data.refund) } : {}), ...(r.data?.rent != null ? { rent: n(r.data.rent) } : {}), ...realmOf(r) };
    }
    if (r?.error === 'no-home' || r?.error === 'seq') ensure(id, { force: true });
    return refused(r);
  }

  async function holdDeed({ mapId, buildingKey, region, layout = null }) {
    const id = idOf(mapId);
    const r = await api.deed({ mapId: id, buildingKey, region, character: character(), layout: layout || null });
    if (r?.ok) return { ok: true, repeat: r.data?.repeat === true };
    if (r?.error === 'home-taken') ensure(id, { force: true });
    return refused(r);
  }
  async function releaseDeed(mapId, buildingKey) {
    const r = await api.releaseDeed(idOf(mapId), buildingKey);
    return r?.ok ? { ok: true } : refused(r);
  }

  async function setEntry(mapId, buildingKey, entry) {
    const id = idOf(mapId);
    const r = await api.entry(id, buildingKey, entry);
    if (r?.ok) {
      const row = towns.get(id)?.homes.get(buildingKey);
      wrote(id, buildingKey, row ? { ...row, entry } : null);
      return { ok: true, entry };
    }
    if (r?.error === 'no-home') ensure(id, { force: true });
    return { ok: false, error: r?.error ?? 'server' };
  }

  async function setLook(mapId, buildingKey, look) {
    const id = idOf(mapId);
    const next = look == null ? null : homeLookOf(look);
    if (look != null && !next) return { ok: false, error: 'bad-look' };
    const r = await api.look({ mapId: id, buildingKey, character: character(), look: next });
    if (r?.ok) {
      const row = towns.get(id)?.homes.get(buildingKey);
      wrote(id, buildingKey, row ? { ...row, look: homeLookOf(r.data?.look ?? next) } : null);
      return { ok: true, look: next };
    }
    if (r?.error === 'no-home') ensure(id, { force: true });
    return { ok: false, error: r?.error ?? 'server' };
  }
  async function vote(mapId, buildingKey, v) {
    const id = idOf(mapId);
    // A vote names the owner this page read, so it never lands on the house of the next owner.
    const owner = v !== 0 ? towns.get(id)?.homes.get(buildingKey)?.owner : undefined;
    if (v !== 0 && !owner) { ensure(id, { force: true }); return { ok: false, error: 'no-home' }; }
    const r = await api.vote?.({ mapId: id, buildingKey, vote: v, ...(owner ? { owner } : {}) });
    if (r?.ok) {
      const score = homeScoreOf(r.data?.score);
      const mine = homeMyVoteOf(r.data?.vote);
      const row = towns.get(id)?.homes.get(buildingKey);
      if (row) wrote(id, buildingKey, { ...row, score, myVote: mine }, { mine: false });
      else ensure(id, { force: true });
      return { ok: true, vote: mine, score };
    }
    if (r?.error === 'no-home' || r?.error === 'vote-own') ensure(id, { force: true });
    return { ok: false, error: r?.error ?? 'server' };
  }

  async function transfer(body) {
    const r = await api.transfer?.({ ...body, character: body.character ?? character() });
    if (r?.ok) { if (body.op !== 'resolve') ensure(body.mapId, { force: true }); return r.data ? r : { ...r, data: r }; }
    return refused(r);
  }

  function homesIn(mapId) {
    const t = towns.get(idOf(mapId));
    return t ? new Map([...t.homes].map(([k, row]) => [k, row])) : null;
  }

  const bump = () => { version++; };
  return { ensure, waitFor, known, homeAt, hearEveryTown, hearHome, homeStands, claim, release, setEntry, setLook, vote, homesIn, bump, holdDeed, releaseDeed, transfer, version: () => version };
}

export const realmDeedAt = (houses, regionIndex, mapId, buildingKey) => {
  const slot = homeDeedOf(houses, regionIndex, mapId, buildingKey);
  return !!slot && deedStands(slot);
};
export const realmDeedsOf = (houses) => (Array.isArray(houses) ? houses : []).flatMap((slot, region) => {
  const mapId = Number(slot?.mapId) >>> 0;
  return slot?.buildingKey > 0 && realmDeedAt(houses, region, mapId, slot.buildingKey) ? [{ region, mapId, buildingKey: slot.buildingKey }] : [];
});
/**
 * @param {any} homes
 * @param {{ houses: any, layoutOf?: (mapId: number) => (string|null) }} o
 */
export async function holdRealmDeeds(homes, { houses, layoutOf = homeClaimLayout }) {
  const out = [];
  for (const d of realmDeedsOf(houses)) out.push({ ...d, r: await homes.holdDeed({ ...d, layout: layoutOf(d.mapId) }) });
  return out;
}

export function homeClaimLayout(mapId) {
  const stamp = layoutStampOfMapId(mapId);
  return stamp && stamp !== CLASSIC_LAYOUT ? stamp : null;
}

export async function buyOnlineHome(homes, { mapId, buildingKey, region, price, afford, pay, refund = null, realm = null }) {
  if (!homePriceOk(price)) return { ok: false, error: 'bad-home' };
  // A buy already in flight for the same house answers `busy` and pays nothing, so a second press never pays twice.
  const key = `${mapId}:${buildingKey}`;
  let out = _buying.get(homes);
  if (!out) _buying.set(homes, out = new Set());
  if (out.has(key)) return { ok: false, error: HOME_BUY_BUSY };
  out.add(key);
  try {
    if (!afford(price)) return { ok: false, error: 'gold' };
    const layout = homeClaimLayout(mapId);
    if (realm) {
      // With a realm record, claim and payment are one service write; a refusal gives the purse back its payment.
      const paid = walletReserve({ pay, credit: (n) => refund?.(n) }, price);
      const r = await realm.act({
        reserve: paid.reserve,
        // A `repeat` claim moved no gold on the record, so the reserve returns or the next checkpoint pays twice.
        apply: (/** @type {any} */ res) => { if (res?.repeat) paid.back(); },
        call: (/** @type {any} */ at) => homes.claim({ mapId, buildingKey, region, price, realm: at, layout }),
      });
      return r?.ok ? { ok: true } : { ok: false, error: r?.error ?? 'server' };
    }
    const r = await homes.claim({ mapId, buildingKey, region, price, layout });
    if (!r.ok) return r;
    if (!afford(price)) {
      await homes.release(mapId, buildingKey);
      return { ok: false, error: 'gold' };
    }
    pay(price);
    return { ok: true };
  } finally {
    out.delete(key);
  }
}
export const HOME_BUY_BUSY = 'busy';
const _buying = new WeakMap();
export const HOME_SALE_OUT = 'sale-out';
const _selling = new WeakMap();

export async function sellOnlineHome(homes, { mapId, buildingKey, credit, realm = null }) {
  const house = `${mapId}:${buildingKey}`;
  let selling = _selling.get(homes);
  if (!selling) _selling.set(homes, selling = new Set());
  if (selling.has(house)) return { ok: false, error: HOME_SALE_OUT };
  selling.add(house);
  try {
    return await sellOut(homes, { mapId, buildingKey, credit, realm });
  } finally {
    selling.delete(house);
  }
}
async function sellOut(homes, { mapId, buildingKey, credit, realm }) {
  if (realm) {
    /** @type {any} */
    let sold = null;
    const r = await realm.act({
      needsAnswer: true,
      apply: (/** @type {any} */ res) => {
        // Credit what the service says the record was paid, plus held rent, never a client-side share, or the act's
        // checkpoint writes over it.
        const rent = Math.max(0, Number(res.rent) || 0);
        sold = { refund: Math.max(0, Number(res.refund) || 0), decorBack: Math.max(0, Number(res.decorBack) || 0), ...(rent > 0 ? { rent } : {}) };
        credit(sold.refund + sold.decorBack + rent);
      },
      call: (/** @type {any} */ at) => homes.release(mapId, buildingKey, at),
    });
    return r?.ok && sold ? { ok: true, ...sold } : { ok: false, error: r?.error ?? 'server' };
  }
  const r = await homes.release(mapId, buildingKey);
  if (!r.ok) return r;
  const refund = homeRefund(r.price);
  const decorBack = r.decorBack ?? 0;
  credit(refund + decorBack);
  return { ok: true, refund, decorBack };
}

export const ARENA_MOVE_TRIES = 3;
export const checkpointLanded = (c) => c === undefined || c === true || c?.ok === true;

/**
 * @param {{ homes: any, api: any, mapId: number, character: string|null, pick: (from: number, held: Set<number>) => ({ buildingKey: number }|null),
 *   nameOf?: (key: number) => string, realm?: { act: (o: any) => Promise<any> }|null, emptyScene?: (from: number, to: number) => any,
 *   hooks?: { giveOwn?: (items: any[]) => void, credit?: (gold: number) => void, discover?: (key: number, hall: boolean) => void,
 *     notice?: (lines: readonly string[]) => void, note?: (text: string) => void, say?: (line: string) => void,
 *     checkpoint?: () => (boolean | Promise<any>) } }} o
 */
export async function moveArenaHomes({ homes, api, mapId, character, pick, nameOf = () => '', realm = null, emptyScene, hooks = {} }) {
  const out = [];
  if (!api?.arenaMove || typeof character !== 'string' || !character || !homeMapIdOk(mapId)) return out;
  const said = new Set();
  const empty = (m, credit) => {
    const e = emptyScene?.(m.from, m.to) ?? null;
    if (e?.own?.length) hooks.giveOwn?.(e.own);
    if (credit && !m.hall && m.refund > 0) hooks.credit?.(m.refund);
    return e;
  };
  const announce = async (m, made) => {
    if (said.has(m.from)) return;
    said.add(m.from);
    hooks.discover?.(m.to, m.hall);
    const name = nameOf(m.to) || ARENA_TEXT.homeMove.aHouse;
    hooks.notice?.(m.hall ? ARENA_TEXT.homeMove.hallMoved : ARENA_TEXT.deedMoved);
    hooks.note?.((m.hall ? ARENA_TEXT.homeMove.hallNote : ARENA_TEXT.deedMovedNote).replace('%s', name));
    if (made && !m.hall && m.refund > 0) hooks.say?.(ARENA_TEXT.homeMove.refund(m.refund));
    if (made && m.tenancies > 0) hooks.say?.(ARENA_TEXT.homeMove.tenants(m.tenancies));
    // Mark the move read only after the checkpoint holding the emptied scene lands; a refused put leaves it unread.
    if (checkpointLanded(await hooks.checkpoint?.())) await api.arenaSeen(mapId, m.from);
    out.push({ from: m.from, to: m.to, refund: m.refund, hall: m.hall, made });
  };
  const moveOf = (d) => ({ from: d.from, to: d.to, refund: Number.isSafeInteger(d.refund) && d.refund > 0 ? d.refund : 0, hall: d.hall === true, tenancies: Number.isSafeInteger(d.tenancies) ? d.tenancies : 0 });
  const unread = await api.arenaMoves(character);
  for (const d of unread?.ok && Array.isArray(unread.data?.moves) ? unread.data.moves : []) {
    if (d?.mapId !== mapId || !homeInArenaCell(mapId, d.from) || !homeBuildingKeyOk(d.to) || homeInArenaCell(mapId, d.to)) continue;
    const m = moveOf(d);
    empty(m, false);
    await announce(m, false);
  }
  if (!(await homes.ensure(mapId, { force: true }))) return out;
  // The character that bought a home moves it, since the move's letter and emptied scene belong to that save.
  const mine = [...(homes.homesIn(mapId)?.values() ?? [])]
    .filter((h) => homeInArenaCell(mapId, h.buildingKey) && ((h.mine && h.character === character) || (h.hall && h.keeper)));
  for (const h of mine) {
    const held = new Set(homes.homesIn(mapId)?.keys() ?? []);
    for (let tries = 0; tries < ARENA_MOVE_TRIES; tries++) {
      const to = pick(h.buildingKey, held);
      if (!to || !homeBuildingKeyOk(to.buildingKey)) break;
      const body = { mapId, from: h.buildingKey, to: to.buildingKey, character };
      /** @type {any} */
      let m = null;
      let r;
      if (realm?.act && !h.hall) {
        // The scene is emptied inside `apply`, so the act's closing checkpoint holds both the refund and the scene.
        r = await realm.act({
          needsAnswer: true,
          apply: (/** @type {any} */ res) => { const d = res?.data; if (d?.to) { m = moveOf(d); empty(m, d.repeat !== true); } },
          call: (/** @type {any} */ at) => api.arenaMove({ ...body, realm: at }),
        });
      } else {
        r = await api.arenaMove(body);
        if (r?.ok && r.data?.to) { m = moveOf(r.data); empty(m, r.data.repeat !== true); }
      }
      if (r?.ok && m) { await announce(m, r.data?.repeat !== true); break; }
      if (r?.error !== 'home-taken') { if (r?.error === 'home-changed') hooks.say?.(ARENA_TEXT.homeMove.changed); break; }
      held.add(to.buildingKey);
      await homes.ensure(mapId, { force: true });
      for (const k of homes.homesIn(mapId)?.keys() ?? []) held.add(k);
    }
  }
  if (out.length) void homes.ensure(mapId, { force: true });
  return out;
}
