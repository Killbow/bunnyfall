// @ts-check
// BUNNY-GUILDS (Phases 1 and 2): WHAT EACH GUILD OFFERS AT ITS HALL, AND HOW ITS REPUTATION IS EARNED.
//
// THE ADVENTURERS GUILD (Phase 1) is the Companies' home: the Company window (founding, members, treasury, vault,
// halls, seats) is opened at its desk and no longer from the Social panel, and the town's work board (the Court's
// writs, the chapters' and the Companies' contracts) from its notice desk. Its reputation is earned by quests done
// well, anywhere: QUEST_REP each.
//
// THE BARDS' COLLEGE (Phase 2a): a member performs once a day at each tavern, from its innkeeper (ui/
// bardPerformanceWindow.js): gold for every note struck, more at a higher rank, and the College's reputation for a
// good night.
//
// THE CARTOGRAPHERS' SOCIETY (Phase 2b): sells maps that reveal a place of the region not yet found (any visitor; a
// member pays less by rank), and buys a member's survey notes - the places found since the last notes sold.
//
// The halls are online only (bunnyGuilds.js), so all of this is too. The host hands in its doors (`doors`); every
// door may be missing, and the option it would need is then left out.

import { addGoldPieces, goldPiecesOf } from '../inventory.js';
import { changeReputation } from '../faction/factionRep.js';
import { bunnyGuildOfKey } from './bunnyGuilds.js';
import { bunnyMembershipOf, performedOn, notePerformed, surveyedCount, noteSurveyed } from './bunnyMembership.js';
import { discoveredLocationCount } from '../discovery.js';
import { t } from '../textManager.js';

/** The Adventurers Guild's reputation for a quest done well. */
export const QUEST_REP = 2;
/** A performance: gold a note struck, and the rank's share more for each rank. */
export const BARD_NOTE_GOLD = 12;
export const BARD_BASE_GOLD = 16;
export const BARD_RANK_SHARE = 0.15;
/** A map's price, and the share off it for each rank a member holds. */
export const MAP_PRICE = 200;
export const MAP_RANK_OFF = 0.08;
/** A place's survey notes, and the rank's share more for each rank; the College's reputation is one for every
 *  SURVEY_REP_EVERY places sold, up to SURVEY_REP_MAX at a time. */
export const SURVEY_GOLD = 40;
export const SURVEY_RANK_SHARE = 0.1;
export const SURVEY_REP_EVERY = 3;
export const SURVEY_REP_MAX = 5;

const factionOf = (/** @type {string} */ key) => bunnyGuildOfKey(key)?.factionId ?? 0;
const gainRep = (/** @type {any} */ entity, /** @type {string} */ key, /** @type {number} */ n) => {
  if (n > 0 && entity?.factionRep) changeReputation(entity.factionRep, factionOf(key), n);
};

/** A performance's pay, for `hits` notes struck at `rank` (-1 for none). */
export const bardPay = (/** @type {number} */ hits, /** @type {number} */ rank) =>
  Math.round((BARD_BASE_GOLD + BARD_NOTE_GOLD * hits) * (1 + BARD_RANK_SHARE * Math.max(0, rank)));
/** A performance's reputation: one for a good night, two for a perfect one. */
export const bardRep = (/** @type {number} */ hits, /** @type {number} */ notes) => (hits >= notes ? 2 : hits >= Math.ceil(notes * 0.66) ? 1 : 0);
/** A map's price for a visitor (`rank` -1) or a member. */
export const mapPrice = (/** @type {number} */ rank) => Math.round(MAP_PRICE * (1 - MAP_RANK_OFF * Math.max(0, rank)));
/** What `n` places' survey notes pay a member of `rank`. */
export const surveyPay = (/** @type {number} */ n, /** @type {number} */ rank) => Math.round(n * SURVEY_GOLD * (1 + SURVEY_RANK_SHARE * Math.max(0, rank)));

/** A quest ended (the quest machine's tombstone): one done well raises the Adventurers Guild's regard. Online only - the
 *  faction is registered there alone, and changeReputation does nothing for a faction the dictionary lacks. */
export function bunnyQuestEnded(/** @type {any} */ quest, /** @type {any} */ entity) {
  if (quest?.questSuccess) gainRep(entity, 'adventurers', QUEST_REP);
}

/**
 * The services a hall offers: the option rows for openBunnyHall (bunnyHall.js). `doors`:
 * `entity`, `openCompany()` the Company window, `openWork()` the town's work board, `revealLocation()` (the host's: a
 * place of the region not yet found, `{ shown }`, or null).
 * `openBoard(focus)` this town's Notice Board as the hall's desk opens it (`{ tab, hall, sift?, crafts? }`), `openBounties()`
 * the town's bounty notices.
 * @param {{ entity: any, openCompany?: (() => boolean) | null, openBoard?: ((focus: any) => boolean) | null, openBounties?: (() => boolean) | null,
 *   revealLocation?: (() => { shown: string } | null) | null }} doors
 */
export function bunnyHallServices(doors) {
  return (/** @type {string} */ key, /** @type {{ member: { rank: number } | null, again: (note?: string) => void }} */ { member, again }) => {
    const rank = member ? member.rank : -1;
    const out = [];
    if (key === 'adventurers') {
      if (doors.openCompany) out.push({ code: 'KeyC', label: t('bguild.adv.company', 'C - Company affairs'), action: () => { doors.openCompany?.(); } });
      if (doors.openBoard) out.push({ code: 'KeyW', label: t('bguild.adv.work', 'W - Work and contracts'), action: () => { doors.openBoard?.({ tab: 'work', hall: key }); } });
    }
    if (key === 'cartographers') {
      const price = mapPrice(rank);
      if (doors.revealLocation) {
        out.push({ code: 'KeyB', label: t('bguild.carto.buy', 'B - Buy a map ({price} gold)', { price }), action: () => {
          if (goldPiecesOf(doors.entity) < price) { again(t('bguild.carto.poor', 'You cannot afford a map.')); return; }
          const found = doors.revealLocation?.();
          if (!found) { again(t('bguild.carto.none', 'We have no map of this region that you do not already know.')); return; }
          addGoldPieces(doors.entity, -price);
          again(t('bguild.carto.bought', 'The map shows the way to {place}.', { place: found.shown }));
        } });
      }
      if (member) {
        const n = Math.max(0, discoveredLocationCount() - surveyedCount());
        out.push({ code: 'KeyS', label: t('bguild.carto.sell', 'S - Sell survey notes ({n} new places)', { n }), action: () => {
          if (!n) { again(t('bguild.carto.nothing', 'You have found no new places since your last notes.')); return; }
          const gold = surveyPay(n, rank);
          addGoldPieces(doors.entity, gold);
          gainRep(doors.entity, key, Math.min(SURVEY_REP_MAX, Math.floor(n / SURVEY_REP_EVERY)));
          noteSurveyed(discoveredLocationCount());
          again(t('bguild.carto.sold', 'The Society pays {gold} gold for your notes on {n} places.', { gold, n }));
        } });
      }
    }
    if (key === 'merchants' && doors.openBoard) {
      out.push({ code: 'KeyM', label: t('bguild.merch.market', 'M - Market'), action: () => { doors.openBoard?.({ tab: 'market', hall: key }); } });
      out.push({ code: 'KeyT', label: t('bguild.merch.traders', 'T - Traders'), action: () => { doors.openBoard?.({ tab: 'vendors', hall: key }); } });
      out.push({ code: 'KeyW', label: t('bguild.merch.deliveries', 'W - Delivery writs'), action: () => { doors.openBoard?.({ tab: 'work', hall: key, sift: { kind: 'court' } }); } });
    }
    if (key === 'hunters' && doors.openBounties) {
      out.push({ code: 'KeyB', label: t('bguild.hunt.bounties', 'B - Bounties'), action: () => { doors.openBounties?.(); } });
    }
    if (key === 'apothecaries' && doors.openBoard) {
      out.push({ code: 'KeyW', label: t('bguild.apoth.writs', 'W - Potion writs'), action: () => { doors.openBoard?.({ tab: 'work', hall: key, crafts: ['potion'] }); } });
    }
    if (key === 'artisans' && doors.openBoard) {
      out.push({ code: 'KeyW', label: t('bguild.art.writs', 'W - Crafting writs and commissions'), action: () => { doors.openBoard?.({ tab: 'work', hall: key, crafts: ['kit'], sift: { kind: 'commission' } }); } });
    }
    if (key === 'bards') {
      out.push({ code: 'KeyP', label: t('bguild.bards.how', 'P - How to perform'), action: () => {
        again(member
          ? t('bguild.bards.howMember', 'Speak to any innkeeper and ask to play. Each tavern will have you once a day.')
          : t('bguild.bards.howVisitor', 'Join us, and any innkeeper will let you play for the house.'));
      } });
    }
    return out;
  };
}

/**
 * THE INNKEEPER'S OFFER to a Bards' College member: play for the house, or the tavern as ever. Answers false for anyone
 * else, so the innkeeper's own window opens unchanged. `where` names the tavern (`${town}:${building}`), `day` the
 * game's day, `openTavern()` the innkeeper's own window, `show(view)` a choice, `perform(onDone)` the performance window.
 * @param {{ entity: any, where: string, day: number, openTavern: () => void, show: (view: any) => void,
 *   perform: (onDone: (hits: number) => string[]) => void, notes: number }} o
 */
export function bardTavernOffer({ entity, where, day, openTavern, show, perform, notes }) {
  const m = bunnyMembershipOf('bards');
  if (!m) return false;
  const played = performedOn(where) === day;
  const lines = [played
    ? t('bguild.bards.played', 'You have already played here today. Come back tomorrow.')
    : t('bguild.bards.offer', 'A member of the College! Will you play for the house tonight?')];
  const options = [];
  if (!played) {
    options.push({ code: 'KeyP', label: t('bguild.bards.perform', 'P - Perform'), action: () => {
      Promise.resolve().then(() => perform((hits) => {
        notePerformed(where, day);
        const gold = bardPay(hits, m.rank);
        const rep = bardRep(hits, notes);
        addGoldPieces(entity, gold);
        gainRep(entity, 'bards', rep);
        return [
          t('bguild.bards.result', 'You struck {hits} of {notes} notes.', { hits, notes }),
          t('bguild.bards.paid', 'The house pays you {gold} gold.', { gold }),
          ...(rep ? [t('bguild.bards.rep', 'Word of your playing reaches the College.')] : []),
        ];
      })).catch(() => {});
    } });
  }
  options.push({ code: 'KeyT', label: t('bguild.bards.tavern', 'T - Rooms and drinks'), action: () => { Promise.resolve().then(openTavern).catch(() => {}); } });
  options.push({ code: 'Escape', label: undefined, action: () => {} });
  show({ lines, options });
  return true;
}

// ─── Phases 3 and 4: the work the town's boards hand over to the halls ─────────────────────────────────────────────

/** Which hall takes which part of the boards: that part is found at the hall's desk alone, so a town without the hall
 *  has none of it. */
export const BOARD_HOMES = Object.freeze({ market: 'merchants', bounties: 'hunters' });
/** A crafting writ's kind (net/craftWritLaw.js) and the hall that posts it. Dishes stay on the town's board. */
export const CRAFT_HOMES = Object.freeze({ potion: 'apothecaries', kit: 'artisans' });
/** The crafting writ kinds no hall posts, which every town's board keeps. */
export const CRAFTS_UNHOMED = Object.freeze(['dish']);

/** The Hunters' Lodge's share more on a bounty's gold for each rank a member holds, and its reputation for a bounty paid. */
export const LODGE_RANK_SHARE = 0.1;
export const BOUNTY_REP = 2;
/** The Merchants' League's reputation for a Court writ filled; the crafters' halls' for a crafting writ delivered. */
export const COURT_WRIT_REP = 1;
export const CRAFT_WRIT_REP = 2;

/** A bounty's gold as it is paid: more for a member of the Lodge, by rank. */
export function lodgeBountyGold(/** @type {number} */ gold) {
  const m = bunnyMembershipOf('hunters');
  return m ? Math.round(gold * (1 + LODGE_RANK_SHARE * m.rank)) : gold;
}
/** A bounty paid (a board's or a Hunter's Mark): the Lodge's regard. */
export const lodgeBountyPaid = (/** @type {any} */ entity) => gainRep(entity, 'hunters', BOUNTY_REP);
/** A Court writ filled: the Merchants' League's regard. */
export const courtWritFilled = (/** @type {any} */ entity) => gainRep(entity, 'merchants', COURT_WRIT_REP);
/** A crafting writ delivered: its hall's regard (a potion's the Apothecaries', a kit's the Artisans'). */
export function craftWritDelivered(/** @type {any} */ entity, /** @type {string} */ kind) {
  const home = /** @type {Record<string, string>} */ (CRAFT_HOMES)[kind];
  if (home) gainRep(entity, home, CRAFT_WRIT_REP);
}

/**
 * How the town's own Notice Board is narrowed (the owner: "not having the service available if they don't have the
 * guild"): a guild's part of the boards is its hall's alone, in every town - a town with no Merchants' League has no
 * market, one with no Hunters' Lodge no bounties. Opened from a hall's desk (`from`), the board shows that hall's part.
 * Answers `{ market, crafts, moved }`: whether the Market and Traders tabs stand, the crafting writ kinds shown, and the
 * lines that say where the rest is found.
 * @param {Set<string>} halls the guild halls in this town, by key @param {{ hall?: string, crafts?: string[] } | null} [from]
 */
export function boardFocus(halls, from = null) {
  if (from?.hall) return { market: from.hall === BOARD_HOMES.market, crafts: from.crafts ?? CRAFTS_UNHOMED, moved: [] };
  const moved = [];
  moved.push(halls.has(BOARD_HOMES.market)
    ? t('bguild.moved.market', 'Trade is done at the Merchants\' League hall in this town.')
    : t('bguild.moved.noMarket', 'There is no Merchants\' League here. Trade is done in towns that have one.'));
  moved.push(t('bguild.moved.crafts', 'Crafting writs for potions and repair kits are posted at the Apothecaries\' and Artisans\' halls.'));
  return { market: false, crafts: CRAFTS_UNHOMED, moved };
}
