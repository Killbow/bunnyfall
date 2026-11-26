// @ts-check
import { CRIMES } from '../../justice/crimes.js';
import { CROWNS } from './navalShips.js';

export const NOTORIETY = Object.freeze({ max: 100, fire: 30, sink: 20, board: 15, decayPerDay: 12 });
export const WITNESS_RANGE = 650;
// Mirrors the Warm Ashes pirate quest rewards (legal reputation, knightly order, and temple), scaled by pirate.
export const PIRATE_REWARD = Object.freeze({
  sunk: Object.freeze({ legal: 1, knightly: 1, temple: 0 }),
  taken: Object.freeze({ legal: 1, knightly: 2, temple: 0 }),
  flagship: Object.freeze({ legal: 3, knightly: 3, temple: 1 }),
  repelled: Object.freeze({ legal: 1, knightly: 1, temple: 0 }),
});
// Classic faction ids for Generic_Knightly_Order and Generic_Temple.
export const KNIGHTLY_FACTION = 844;
export const TEMPLE_FACTION = 450;

// The classic sea region has no court, so a crime at sea is charged to the crown whose waters these are.
export const crownNamed = (name) => CROWNS.find((c) => c.name === name) ?? CROWNS[0];
export const crownRegion = (name) => crownNamed(name).region;

export const notorietyLevel = (n) => Math.max(0, Math.min(4, Math.floor((Number(n) || 0) / 25)));

export function createNotoriety() {
  const by = new Map();
  const n = {
    get: (crown) => by.get(crown) ?? 0,
    add(crown, amount) {
      if (!crown) return 0;
      const v = Math.max(0, Math.min(NOTORIETY.max, n.get(crown) + amount));
      by.set(crown, v);
      return v;
    },
    decay(days) {
      if (!(days > 0)) return;
      for (const [k, v] of by) { const w = Math.max(0, v - NOTORIETY.decayPerDay * days); if (w > 0) by.set(k, w); else by.delete(k); }
    },
    highest: () => Math.max(0, ...by.values()),
    snapshot: () => Object.fromEntries(by),
    restore(r) {
      by.clear();
      if (!r || typeof r !== 'object') return;
      for (const c of CROWNS) { const v = Number(r[c.name]); if (Number.isFinite(v) && v > 0) by.set(c.name, Math.min(NOTORIETY.max, v)); }
    },
  };
  return n;
}

/**
 * @param {'fire'|'sink'|'board'|'repel'} act
 * @param {{ faction: string, flagship?: boolean }} ship
 * @param {{ crown: string, firstStrike?: boolean }} where
 */
export function lawOf(act, ship, { crown, firstStrike = false }) {
  const out = { crimes: [], notoriety: [], rewards: [] };
  const region = crownRegion(crown);
  const lawful = ship.faction === 'merchant' || ship.faction === 'navy';
  if (lawful) {
    if (act === 'fire' && firstStrike) {
      out.crimes.push({ region, crime: CRIMES.Piracy });
      out.notoriety.push({ crown, add: NOTORIETY.fire });
    } else if (act === 'sink') out.notoriety.push({ crown, add: NOTORIETY.sink });
    else if (act === 'board') {
      out.crimes.push({ region, crime: CRIMES.Piracy });
      out.notoriety.push({ crown, add: NOTORIETY.board });
    }
  } else if (ship.faction === 'pirate' && (act === 'sink' || act === 'board')) {
    const r = ship.flagship ? PIRATE_REWARD.flagship : act === 'board' ? PIRATE_REWARD.taken : PIRATE_REWARD.sunk;
    out.rewards.push({ ...r, region });
  } else if (ship.faction === 'pirate' && act === 'repel') {
    out.rewards.push({ ...(ship.flagship ? PIRATE_REWARD.flagship : PIRATE_REWARD.repelled), region });
  }
  return out;
}
