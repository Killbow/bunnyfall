// @ts-check
// VEIL-PARTY (2026-10-27; bible/03-World/Eltheric-Ocean.md VEIL-PARTY) - A PARTY CROSSES THE VEIL TOGETHER. The
// crossing is the captain's (world.js etherCross). Her party aboard never holds it back (`kin`); a stranger still does.
// A member aboard her (`step`) keeps her captain and their side of the Veil; when the captain's party pose stands across
// it within VEIL_FOLLOW_MS, the member follows by the party's own journey, landing beside the captain, no fare, the
// crossing's CROSS_DAYS. Nothing new rides the wire. Built by the world host. Not a DFU member: DFU has no Veil.
import { memberPresent } from '../../systems/party/partyRestLaw.js';
import { besideTargetOf } from '../../systems/party/partyTravelLaw.js';
import { CROSS_DAYS } from '../../systems/naval/etherCrossing.js';
import { t } from '../../systems/textManager.js';

/** How long after my last frame aboard her a crossing of her captain's is followed (ms): her jump, her landfall built
 *  and her first pose there. */
export const VEIL_FOLLOW_MS = 60_000;
/** The words. */
export const VEIL_PARTY_TEXT = Object.freeze({
  follow: (name) => t('veil.party.follow', '{name} sails across the Veil. You cross with the ship.', { name }),
  landed: (name) => t('veil.party.landed', 'You cross the Veil with {name}.', { name }),
  missed: (name) => t('veil.party.missed', 'You could not cross the Veil with {name}.', { name }),
});

/** The journey that follows `name`'s crossing to pixel `to`: a pick the party's journey lands beside them (`row()` their
 *  party row, read when the far end is built), no fare, CROSS_DAYS long. Pure. */
export function veilJourney(to, name, row) {
  return {
    pick: {
      pixel: { x: to.x, y: to.y }, name, veil: true,
      besideAt: () => { const r = row(); return r && memberPresent(r) ? besideTargetOf(r.p, to.x, to.y) : null; },
      besideText: VEIL_PARTY_TEXT.landed(name),
    },
    opts: { speedCautious: false, travelShip: true, sleepModeInn: false },
    computed: { minutes: CROSS_DAYS * 1440, totalCost: 0, piecesCost: 0, oceanPixels: 0 },
  };
}

/**
 * deps = { social() -> net/social.js's picture (others(), accountOfPeer, isPartyPeer) | null, aboard() -> CSA-K's aboard
 * ({ owner }) | null, here() -> my travel pixel, across(x, y) -> past the Veil, ready() -> outdoors, on my feet, nothing
 * moving me, now() -> ms (optional; the page's clock), travel(pick, opts, computed) -> Promise<boolean> (the party's journey), say(text) }
 * @param {any} deps
 */
export function createVeilParty(deps) {
  /** @type {{ acct: string, side: boolean, at: number } | null} */
  let rode = null;
  let following = false;
  const rowOf = (acct) => deps.social?.()?.others?.().find((m) => m.acct === acct) ?? null;

  /** A rider aboard my ship is my party's: never holds the crossing back. */
  const kin = (id) => !!deps.social?.()?.isPartyPeer?.(id);

  function step() {
    if (following) return;
    const now = deps.now?.() ?? performance.now();   // the page's clock unless a test hands one
    const here = deps.here();
    const owner = deps.aboard?.()?.owner ?? null;
    const acct = owner ? deps.social?.()?.accountOfPeer?.(owner) ?? null : null;
    if (acct && rowOf(acct)) rode = { acct, side: !!deps.across(here.x, here.y), at: now };
    if (!rode) return;
    if (now - rode.at > VEIL_FOLLOW_MS || !!deps.across(here.x, here.y) !== rode.side) { rode = null; return; }
    const row = rowOf(rode.acct);
    if (!row || !memberPresent(row) || !!deps.across(row.p.px, row.p.py) === rode.side || !deps.ready()) return;
    const acctNow = rode.acct, name = row.name || t('veil.party.captain', 'your captain');
    const to = { x: row.p.px, y: row.p.py };
    following = true;
    rode = null;
    deps.say(VEIL_PARTY_TEXT.follow(name));
    const j = veilJourney(to, name, () => rowOf(acctNow));
    Promise.resolve(deps.travel(j.pick, j.opts, j.computed)).catch(() => false).then((went) => {
      following = false;
      if (!went) deps.say(VEIL_PARTY_TEXT.missed(name));
    });
  }

  return { step, kin, following: () => following };
}
