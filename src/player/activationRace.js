// @ts-check
// Decides which activation target wins when one ray could strike several; the exterior and dungeon hosts share it.

import { firmFirst, yieldsRay, answersPress, MOBILE_NPC_ACTIVATION_DISTANCE } from './activate.js';

/**
 * @typedef {object} RayPick
 * @property {string} key
 * @property {number} distance
 * @property {number} reach
 * @property {boolean} [yields]
 */

/**
 * @typedef {object} RaceResult
 * @property {RayPick|null} loot
 * @property {RayPick|null} drop
 * @property {boolean} torchWins
 * @property {boolean} wagonWins
 * @property {boolean} horseCartWins
 * @property {boolean} gateWins
 * @property {boolean} brokerWins
 * @property {boolean} boatWins
 * @property {boolean} campWins
 * @property {boolean} waterWins
 * @property {number} nonPersonRival
 * @property {number} rival
 * @property {number} doorDistance
 * @property {RayPick|null} next
 */

/**
 * @param {object} [opts]
 * @param {RayPick|null} [opts.corpse]
 * @param {RayPick|null} [opts.pile]
 * @param {RayPick|null} [opts.torch]
 * @param {RayPick|null} [opts.wagon]
 * @param {RayPick|null} [opts.horseCart]
 * @param {RayPick|null} [opts.camp]
 * @param {RayPick|null} [opts.water]
 * @param {RayPick|null} [opts.gate]
 * @param {RayPick|null} [opts.broker]
 * @param {RayPick|null} [opts.boat]
 * @param {RayPick|null} [opts.door]
 * @param {number} [opts.doorDistance]
 * @param {number[]} [opts.personDistances]
 * @returns {RaceResult}
 */
export function raceActivation({
  corpse = null, pile = null, torch = null, wagon = null, horseCart = null, camp = null, water = null, gate = null, broker = null, boat = null, door = null, doorDistance = door?.distance ?? Infinity, personDistances = [],
} = {}) {
  const pileNearer = !!pile && !(corpse && corpse.distance <= pile.distance);
  const body = pileNearer ? null : corpse;
  const heap = pileNearer ? pile : null;

  const firmD = (p) => (p && !yieldsRay(p) ? p.distance : Infinity);
  const lootD = firmD(body);
  const dropD = firmD(heap);
  const torchD = firmD(torch);
  const wagonD = firmD(wagon);
  const horseCartD = firmD(horseCart);
  const campD = firmD(camp);
  const waterD = firmD(water);
  const gateD = firmD(gate);
  const brokerD = firmD(broker);
  const boatD = firmD(boat);

  const nonPersonRival = Math.min(lootD, dropD, torchD, wagonD, horseCartD, campD, waterD, gateD, brokerD, boatD, doorDistance);
  const rival = Math.min(nonPersonRival, ...personDistances);

  const ground = Number.isFinite(doorDistance) ? { key: GROUND_KEY, distance: doorDistance } : null;
  const won = raceWinner({ gate, broker, camp, water, wagon, horseCart, boat, torch, corpse: body, pile: heap, ground });
  const is = (p) => !!won && !!p && won === p;

  const nearPerson = Math.min(Infinity, ...personDistances);
  const next = raceWinner({
    gate, broker, camp, water, wagon, horseCart, boat, torch, corpse: body, pile: heap,
    ground: door ?? ground,
    person: Number.isFinite(nearPerson) ? { key: PERSON_KEY, distance: nearPerson, reach: MOBILE_NPC_ACTIVATION_DISTANCE } : null,
  });

  return {
    loot: is(body) ? body : null,
    drop: is(heap) ? heap : null,
    torchWins: is(torch),
    wagonWins: is(wagon),
    horseCartWins: is(horseCart),
    gateWins: is(gate),
    brokerWins: is(broker),
    boatWins: is(boat),
    campWins: is(camp),
    waterWins: is(water),
    nonPersonRival,
    rival,
    doorDistance,
    next,
  };
}

export const GROUND_KEY = '__ground__';
export const PERSON_KEY = '__person__';

/** @returns {RayPick|null} */
export function raceWinner({
  corpse = null, pile = null, torch = null, wagon = null, horseCart = null, camp = null, water = null, gate = null, broker = null, boat = null, ground = null,
  person = null, peer = null, foe = null,
} = {}) {
  if (foe?.ally === true) {
    const next = raceWinner({ corpse, pile, torch, wagon, horseCart, camp, water, gate, broker, boat, ground, person, peer });
    if (answersPress(next)) return next;
  }
  // The array order is the tie precedence: the strict `<` in nearestInOrder keeps the earlier pick.
  return firmFirst([gate, broker, camp, water, wagon, horseCart, boat, torch, corpse, pile, ground, person, peer, foe], nearestInOrder);
}

function nearestInOrder(picks) {
  let best = null;
  for (const p of picks) {
    if (!p) continue;
    if (best === null || p.distance < best.distance) best = p;
  }
  return best;
}
