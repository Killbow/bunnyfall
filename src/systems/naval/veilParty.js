// @ts-check
import { memberPresent } from '../../party/partyRestLaw.js';
import { besideTargetOf } from '../../party/partyTravelLaw.js';
import { CROSS_DAYS } from './etherCrossing.js';
import { inEther } from '../../world/ethericSea.js';
import { t } from '../../ui/textManager.js';

export const VEIL_FOLLOW_MS = 60_000;
export const VEIL_STAY_PX = 1;
export const VEIL_PARTY_TEXT = Object.freeze({
  follow: (name) => t('veil.party.follow', '{name} sails across the Veil. You cross with the ship.', { name }),
  landed: (name) => t('veil.party.landed', 'You cross the Veil with {name}.', { name }),
  missed: (name) => t('veil.party.missed', 'You could not cross the Veil with {name}.', { name }),
});

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

/** @param {any} deps */
export function createVeilParty(deps) {
  /** @type {{ acct: string, side: boolean, x: number, y: number, off: number, tried: { x: number, y: number } | null } | null} */
  let rode = null;
  const across = deps.across ?? inEther;
  let following = false;
  const rowOf = (acct) => deps.social?.()?.others?.().find((m) => m.acct === acct) ?? null;

  const kin = (id) => !!deps.social?.()?.isPartyPeer?.(id);

  function step(dt = 0) {
    if (following) return;
    const here = deps.here();
    const owner = deps.aboard?.()?.owner ?? null;
    const acct = owner ? deps.social?.()?.accountOfPeer?.(owner) ?? null : null;
    if (acct && rowOf(acct)) rode = { acct, side: !!across(here.x, here.y), x: here.x, y: here.y, off: 0, tried: null };
    else if (rode) {
      // The window counts stepped frame time, so a paused game or an open window spends none of it.
      rode.off += Math.max(0, Number(dt) || 0) * 1000;
      const moved = Math.max(Math.abs(here.x - rode.x), Math.abs(here.y - rode.y)) > VEIL_STAY_PX;
      if (owner || moved || rode.off > VEIL_FOLLOW_MS || !!across(here.x, here.y) !== rode.side) rode = null;
    }
    if (!rode) return;
    const row = rowOf(rode.acct);
    if (!row || !memberPresent(row) || !!across(row.p.px, row.p.py) === rode.side || !deps.ready()) return;
    if (rode.tried && rode.tried.x === row.p.px && rode.tried.y === row.p.py) return;
    const left = rode, name = row.name || t('veil.party.captain', 'your captain');
    const to = { x: row.p.px, y: row.p.py };
    following = true;
    rode = null;
    deps.say(VEIL_PARTY_TEXT.follow(name));
    const j = veilJourney(to, name, () => rowOf(left.acct));
    Promise.resolve(deps.travel(j.pick, j.opts, j.computed)).catch(() => false).then((went) => {
      following = false;
      if (went) return;
      deps.say(VEIL_PARTY_TEXT.missed(name));
      rode = { ...left, tried: to };
    });
  }

  return { step, kin, following: () => following };
}
