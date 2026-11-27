// @ts-check
import { SHIP_STATES } from './navalDamage.js';
import { classById } from './navalShips.js';
import { fleetOf } from './sea/seaEvents.js';
import { rollElthericPiece, elthericChance, TIDEMAIL_SALT } from '../../items/aetheric.js';
import { setById } from '../../items/sigilSets.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { t } from '../../ui/textManager.js';

export const FLEET_STAND_M = 1200;
export const FLEET_DROP_M = 1700;

const dist2d = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** @param {any} deps */
export function createTreasureFleet(deps) {
  const spent = new Set();
  let sailing = null;
  const tagOf = (list, seed) => { const s = list?.ships.find((x) => x.seed === (seed >>> 0)); return s ? { n: list.n, seed: s.seed, flag: s.flag } : null; };
  function step(list, { sunk = false } = {}) {
    if (list?.n !== sailing) { sailing = list?.n ?? null; spent.clear(); }
    const me = deps.feet();
    for (const e of deps.sea.values()) {
      // Ships join the sailing by seed, so a peer's copy of a fleet ship is tagged too.
      e.fleet ??= tagOf(list, e.ship.seed);
      if (e.fleet && e.ship.damage.state !== SHIP_STATES.afloat) spent.add(e.fleet.seed);
    }
    for (const e of deps.sea.values()) {
      if (e.owner || !e.fleet) continue;
      if (dist2d(e.ship.pos, me) <= FLEET_DROP_M) { e.retiring = false; continue; }
      if (!deps.busy(e) && !e.retiring) deps.retire(e);
    }
    // Only the captain who launches the sea traffic places fleet ships, so two nearby captains see one fleet.
    if (list && !sunk && deps.launches()) {
      for (const s of list.ships) {
        if (spent.has(s.seed) || dist2d(s.pos, me) > FLEET_STAND_M) continue;
        if ([...deps.sea.values()].some((x) => x.ship.seed === s.seed && x.ship.damage.state !== SHIP_STATES.sunk)) continue;
        if (!deps.isWater(s.pos[0], s.pos[2], classById(s.classId)?.hull ?? 0)) continue;
        const e = deps.launch({ seed: s.seed, classId: s.classId, pos: [s.pos[0], deps.seaY(), s.pos[2]], yaw: s.yaw, ether: list.band });
        if (e) e.fleet = { n: list.n, seed: s.seed, flag: s.flag };
      }
    }
    for (const e of deps.sea.values()) {
      if (e.owner || !e.fleet) continue;
      const s = list?.ships.find((x) => x.seed === e.fleet.seed);
      e.ship.course = s ? [s.ahead[0], s.ahead[2]] : null;
    }
  }
  function ended(entry, act) {
    if (!entry?.fleet?.flag || (act !== 'sink' && act !== 'board')) return null;
    spent.add(entry.fleet.seed);
    // fleetEnded pays the purse once per sailing and returns 0 after, so a piece drops only with the purse.
    if (!(Number(deps.fleetEnded(entry.fleet.n, act)) > 0)) return null;
    // The piece rolls on the sailing's band, not the waters where this copy was placed.
    const band = fleetOf(entry.fleet.n)?.band ?? entry.ether ?? 'deep';
    const piece = rollElthericPiece(mulberry32(((entry.fleet.seed >>> 0) ^ TIDEMAIL_SALT) >>> 0), elthericChance('fleet', band));
    if (piece) {
      deps.give([piece]);
      deps.say(t('sea.tidemail.fleet', 'You recover {piece}, a piece of {set}, from the treasure fleet flagship {ship}.', { ship: entry.ship.names?.name ?? '', piece: piece.name, set: setById('eltheric')?.name ?? '' }), 6);
    }
    return piece;
  }
  return { step, ended, spent: () => new Set(spent) };
}
