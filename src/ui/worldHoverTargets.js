// @ts-check
// The world plaque's hover picks: the live picks the activation press races, one per family, in the press's order.
// The target lists and the picks object are reused from call to call; nothing the picks read keeps them.
import { pickActivatableHit, peacefulFoePass, RAY_DISTANCE } from '../player/activate.js';
import { getInteractionMode } from '../player/interactionMode.js';
import { mwViewWagonTargets } from '../player/mwView.js';

const NONE = Object.freeze([]);

/** @param {any[]} out @param {Iterable<any>} a @param {Iterable<any>} b @param {Iterable<any>} [c] */
function fill(out, a, b, c = NONE) {
  out.length = 0;
  for (const t of a) out.push(t);
  for (const t of b) out.push(t);
  for (const t of c) out.push(t);
  return out;
}

export function createWorldHoverTargets(d) {
  const { cityGuards, exteriorFoes, dwLootTargets, droppedTorches, hcc, camps, reachEvents, yards, springTargets, gatePool,
    riteHost, sigilBroker, cromwark, csaActivationPick, collider, hoverPersonPick, hoverPeerPick, mines } = d;
  const corpseList = [], campList = [], gateList = [], brokerList = [], foeList = [];
  const picks = { corpse: null, pile: null, torch: null, wagon: null, horseCart: null, camp: null, water: null, gate: null,
    broker: null, boat: null, foe: null, person: null, peer: null };
  let eye = null, dir = null;
  const doorBehind = () => d.modes().exteriorActivationDistance(eye, dir);
  /** @param {number[]} eyeNow @param {number[]} dirNow */
  return function hoverPicks(eyeNow, dirNow) {
    eye = eyeNow; dir = dirNow;
    picks.corpse = pickActivatableHit(eye, dir, fill(corpseList, cityGuards.lootTargets(), exteriorFoes.lootTargets()), collider);
    picks.pile = pickActivatableHit(eye, dir, dwLootTargets(), collider);
    picks.torch = pickActivatableHit(eye, dir, droppedTorches.targets(), collider);
    picks.wagon = pickActivatableHit(eye, dir, mwViewWagonTargets(RAY_DISTANCE), collider);
    picks.horseCart = pickActivatableHit(eye, dir, hcc.targets(), collider);
    picks.camp = pickActivatableHit(eye, dir, fill(campList, camps.targets(), reachEvents.fireTargets(), yards?.targets() ?? NONE), collider);
    picks.water = pickActivatableHit(eye, dir, springTargets(), collider);
    picks.gate = gatePool ? pickActivatableHit(eye, dir, fill(gateList, gatePool.targets(), riteHost?.targets() ?? NONE), collider) : null;
    picks.broker = pickActivatableHit(eye, dir, fill(brokerList, sigilBroker?.targets() ?? NONE, cromwark.targets(), mines?.targets() ?? NONE), collider);   // BUNNYFALL: and the mine mouths' dark
    picks.boat = csaActivationPick(eye, dir);
    const ft = fill(foeList, exteriorFoes.liveTargets(), cityGuards.liveTargets());
    picks.foe = peacefulFoePass(pickActivatableHit(eye, dir, ft, collider), ft, doorBehind, getInteractionMode());
    picks.person = hoverPersonPick(eye, dir);
    picks.peer = hoverPeerPick(eye, dir);
    return picks;
  };
}
