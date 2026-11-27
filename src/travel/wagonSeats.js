// @ts-check
// `wr` and `hv.ps` travel in the cell's `foes` frame, which the relay passes through unchanged, so they need no relay
// deploy and older clients ignore them.

export const RIDE_ASK_TTL_MS = 30_000;
export const RIDE_REASK_MS = 15_000;
export const RIDE_ASK_REACH = 6;
// Also the wire bound on a seat index in `wr` and `hv.ps`.
export const MAX_SEATS = 4;
export const GET_DOWN_STEP = 1.6;
export const GET_DOWN_REACH = 6;
// Players and companions both get down here. A seat faces across the bed, so `GET_DOWN_STEP` back from its feet
// clears the wagon side.
export const getDownPoint = (seat) => [seat.feet[0] - Math.sin(seat.yaw) * GET_DOWN_STEP, seat.feet[1], seat.feet[2] - Math.cos(seat.yaw) * GET_DOWN_STEP];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const validPeerId = (v) => typeof v === 'string' && ID_RE.test(v);

export const RIDE_TEXT = Object.freeze({
  ask: 'Ask to ride',
  getOff: 'Get down',
  asking: (owner) => `You ask ${owner} for a seat in the back.`,
  asked: (rider) => `${rider} asks to ride in the back of your wagon.`,
  accepted: (owner) => `${owner} waves you up into the back of the wagon.`,
  declined: (owner) => `${owner} has no room for you.`,
  noAnswer: (owner) => `${owner} did not answer.`,
  full: 'There is no seat free in the back.',
  noSeats: 'There is no room to ride in the back of this wagon.',
  seated: (rider) => `${rider} climbs into the back of your wagon.`,
  left: (rider) => `${rider} climbs down from your wagon.`,
  gotOff: 'You climb down from the wagon.',
  ownerGone: 'The wagon you rode in is gone, so you climb down.',
  lifted: 'The town watch lifts the wagon out from under you!',
  leftBehind: (owner) => `You couldn’t go with ${owner}, so you climb down.`,
  tooFar: 'You are too far away...',
  lapsed: (rider) => `${rider} is no longer asking to ride.`,
});

export function validRideWord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.a !== undefined) return validPeerId(raw.a) ? { ask: raw.a } : null;
  if (Array.isArray(raw.s) && raw.s.length === 2 && validPeerId(raw.s[0]) && Number.isInteger(raw.s[1]) && raw.s[1] >= 0 && raw.s[1] < MAX_SEATS) return { seated: raw.s[0], seat: raw.s[1] };
  return null;
}
export const rideWord = (state) => (!state ? null : state.seat != null ? { s: [state.owner, state.seat] } : { a: state.owner });

export function validPassengers(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_SEATS) return null;
  const seats = new Set(), riders = new Set(), out = [];
  for (const e of raw) {
    if (!Array.isArray(e) || e.length !== 2 || !validPeerId(e[0]) || !Number.isInteger(e[1]) || e[1] < 0 || e[1] >= MAX_SEATS) return null;
    if (seats.has(e[1]) || riders.has(e[0])) return null;
    seats.add(e[1]); riders.add(e[0]);
    out.push([e[0], e[1]]);
  }
  return out;
}

export function freeWagonSeat(n, taken) {
  const held = new Set(taken);
  for (let k = 0; k < n; k++) if (!held.has(k)) return k;
  return -1;
}

export function companionSeats(n, playerSeats, count, riding) {
  if (!riding || !(n > 0)) return Array.from({ length: count }, () => -1);
  const held = new Set(playerSeats);
  const free = [];
  for (let k = 0; k < n; k++) if (!held.has(k)) free.push(k);
  return Array.from({ length: count }, (_, i) => (i < free.length ? free[i] : -1));
}

export function createRideBook() {
  const asks = new Map();
  const seated = new Map();
  const declined = new Map();
  return {
    hear(rider, word, me, now) {
      if (!validPeerId(rider)) return null;
      const asking = word?.ask === me, sitting = word?.seated === me;
      if (seated.has(rider) && !sitting && !asking) { seated.delete(rider); return 'left'; }
      if (asking && !seated.has(rider) && !asks.has(rider) && !((declined.get(rider) ?? 0) > now)) { asks.set(rider, now); return 'asked'; }
      if (!asking) asks.delete(rider);
      return null;
    },
    accept(rider, n) {
      if (!asks.has(rider)) return false;
      asks.delete(rider);
      const k = freeWagonSeat(n, [...seated.values()]);
      if (k < 0) return false;
      seated.set(rider, k);
      return true;
    },
    decline(rider, now) { asks.delete(rider); declined.set(rider, now + RIDE_REASK_MS); },
    drop(rider) { asks.delete(rider); seated.delete(rider); },
    fit(n) { for (const [r, k] of [...seated]) if (k >= n) seated.delete(r); if (!n) asks.clear(); },
    lapse(now) { const out = []; for (const [r, at] of [...asks]) if (now - at > RIDE_ASK_TTL_MS) { asks.delete(r); out.push(r); } return out; },
    asks: () => [...asks.entries()].sort((a, b) => a[1] - b[1]).map(([rider, at]) => ({ rider, at })),
    passengers: () => [...seated.entries()].map(([r, k]) => [r, k]).sort((a, b) => a[1] - b[1]),
    seatOf: (rider) => seated.get(rider) ?? null,
    clear() { asks.clear(); seated.clear(); declined.clear(); },
  };
}
