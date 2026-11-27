// @ts-check
// Party travel rules as pure functions over party poses; partyTravel.js and scenes/world.js call them.
// A vote carries its round's `at`, so a vote for one round never approves the next.
import { PARTY_READY_TIMEOUT_MS, stampOf, memberPresent } from './partyRestLaw.js';
import { worldCoordToMapPixel } from '../formats/mapsFile.js';

export const TRIP_CAUTIOUS = 1;
export const TRIP_INN = 2;
export const TRIP_SHIP = 4;

export function tripBits(opts) {
  return (opts?.speedCautious ? TRIP_CAUTIOUS : 0) | (opts?.sleepModeInn ? TRIP_INN : 0) | (opts?.travelShip ? TRIP_SHIP : 0);
}

export function tripOptionsOf(bits) {
  const b = Number.isInteger(bits) ? bits : 0;
  return { speedCautious: (b & TRIP_CAUTIOUS) !== 0, sleepModeInn: (b & TRIP_INN) !== 0, travelShip: (b & TRIP_SHIP) !== 0 };
}

export const TRIP_FOLLOW_MS = 30_000;

/** A `go` stamped before its own `at` is no departure. */
export function tripRoundOf(p, now, timeout = PARTY_READY_TIMEOUT_MS) {
  const tv = p?.tv;
  if (!tv || typeof tv !== 'object') return null;
  const at = stampOf(tv.at, now);
  if (at <= 0) return null;
  const go = tv.go == null ? 0 : stampOf(tv.go, now);
  if (go > 0 && go >= at) return now - go > TRIP_FOLLOW_MS ? null : { x: tv.x, y: tv.y, o: tv.o, at, go };
  return now - at > timeout ? null : { x: tv.x, y: tv.y, o: tv.o, at, go: null };
}

export function tripAnswerOf(p, at) {
  if (!p || !(at > 0)) return 'waiting';
  if (p.tr === at) return 'ready';
  if (p.td === at) return 'declined';
  return 'waiting';
}

export function tripTally(gathered, at) {
  /** @type {{ ready: string[], declined: string[], waiting: string[] }} */
  const out = { ready: [], declined: [], waiting: [] };
  for (const m of gathered ?? []) {
    if (!memberPresent(m)) continue;
    out[tripAnswerOf(m.p, at)].push(m.name || 'A party member');
  }
  return out;
}

export const tripSetsOut = (tally) => !!tally && tally.waiting.length === 0;

export function tripCountText(tally) {
  return `${tally.ready.length + 1}/${tally.ready.length + tally.waiting.length + 1} ready`;
}

export const PARTY_TRAVEL_TEXT = Object.freeze({
  noParty: 'You are not in a party.',
  leading: 'You lead the party. The others travel to you.',
  offline: 'Your party leader is not online.',
  unseen: 'Your party leader has not been seen yet.',
  inside: 'Step outside to travel to your party leader.',
  here: 'You are already where your party leader is.',
  called: 'The leader called off the journey.',
  off: 'The journey is off.',
  late: 'The party was not ready in time. The journey is off.',
  moved: 'Travel vote canceled. You moved too far from where it started.',
  stay: 'You stay behind.',
  lost: 'You were too far from the leader to travel with the party.',
  busy: 'Close the open window first.',
});

export function leaderTripOf({ party = null, me = null, leader = null, outdoors = false, here = null } = {}) {
  if (!party) return { refuse: PARTY_TRAVEL_TEXT.noParty };
  if (party.leader === me) return { refuse: PARTY_TRAVEL_TEXT.leading };
  if (!leader || leader.online === false) return { refuse: PARTY_TRAVEL_TEXT.offline };
  if (!memberPresent(leader)) return { refuse: PARTY_TRAVEL_TEXT.unseen };
  if (!outdoors) return { refuse: PARTY_TRAVEL_TEXT.inside };
  const p = leader.p;
  if (here && p.px === here.x && p.py === here.y) return { refuse: PARTY_TRAVEL_TEXT.here };
  return { x: p.px, y: p.py, inside: p.in === 1 ? 'dungeon' : p.in === 2 ? 'building' : null, loc: p.loc || '', name: leader.name || 'your leader', acct: leader.acct };
}

export function besideTargetOf(p, x, y) {
  if (!p || p.in !== 0 || p.px !== x || p.py !== y) return null;
  if (!Number.isFinite(p.wx) || !Number.isFinite(p.wy) || !Number.isFinite(p.wz)) return null;
  const at = worldCoordToMapPixel(p.wx, p.wz);
  if (at.x !== x || at.y !== y) return null;
  return { x: p.wx, y: p.wy, z: p.wz };
}

export const BESIDE_STEP = 1.5;
export const BESIDE_REACH = 0.5;
export const BESIDE_LEVEL = 1;
/** The pose has no facing, so the ring starts east and west; eight spots fit the seven followers of a party. */
const BESIDE_DIAG = BESIDE_STEP / Math.SQRT2;
export const BESIDE_OFFSETS = Object.freeze([[BESIDE_STEP, 0], [-BESIDE_STEP, 0], [0, BESIDE_STEP], [0, -BESIDE_STEP],
  [BESIDE_DIAG, BESIDE_DIAG], [-BESIDE_DIAG, -BESIDE_DIAG], [-BESIDE_DIAG, BESIDE_DIAG], [BESIDE_DIAG, -BESIDE_DIAG]].map((o) => Object.freeze(o)));

export function besideLandingOf(at, probe, first = 0, offsets = BESIDE_OFFSETS) {
  const n = offsets.length;
  const start = Number.isInteger(first) && first > 0 ? first % n : 0;
  for (let i = 0; i < n; i++) {
    const [dx, dz] = offsets[(start + i) % n];
    const d = Math.hypot(dx, dz);
    if (!(d > 0) || !probe.clear(at, [dx / d, 0, dz / d], d + BESIDE_REACH)) continue;
    const f = probe.floor([at[0] + dx, at[1], at[2] + dz]);
    if (!f || !(Math.abs(f[1] - at[1]) <= BESIDE_LEVEL)) continue;
    return { pos: f, yaw: Math.atan2(-dx, -dz) };
  }
  const own = probe.floor([at[0], at[1], at[2]]);
  return own && Math.abs(own[1] - at[1]) <= BESIDE_LEVEL ? { pos: own, yaw: null } : null;
}

export function leaderJourneyed(was, now) {
  if (!was || !now) return false;
  return Math.max(Math.abs(now.px - was.px), Math.abs(now.py - was.py)) > 1;
}

export function fareText(computed, afford = true, coinsShort = false) {
  const total = Math.max(0, Math.round(computed?.totalCost ?? 0));
  // The purse can cover the fare while coins fall short (enoughGoldCheck), so the line names the coins.
  if (!afford && coinsShort) return `You cannot afford the journey (${Math.max(0, Math.round(computed?.piecesCost ?? 0))} gold in coin for the inns).`;
  if (!afford) return `You cannot afford the journey (${total} gold).`;
  return total > 0 ? `The journey costs ${total} gold.` : 'The journey costs nothing.';
}

export function leaderOfferRows(trip, dest, fare, unwell = false) {
  const rows = [`Travel to ${trip.name}${dest ? ` at ${dest}` : ''}?`];
  if (trip.inside === 'dungeon') rows.push(`${trip.name} is inside ${trip.loc || 'a dungeon'}. You will arrive at its door.`);
  else if (trip.inside === 'building') rows.push(`${trip.name} is indoors. You will arrive outside.`);
  rows.push(fare);
  if (unwell) rows.push('You are diseased or poisoned.');
  return rows;
}

export function tripAskRows(leaderName, dest, fare, unwell = false) {
  const rows = [`${leaderName || 'The leader'} wants the party to travel to ${dest || 'a new place'}.`, fare];
  if (unwell) rows.push('You are diseased or poisoned.');
  rows.push('Travel with the party?');
  return rows;
}
