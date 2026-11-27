// @ts-check
import { createRideBook, validRideWord, rideWord, RIDE_TEXT, RIDE_ASK_TTL_MS, RIDE_ASK_REACH, companionSeats, getDownPoint, GET_DOWN_REACH } from '../wagonSeats.js';
import { WAGON_KINDS } from '../wagonKinds.js';

// The caller waits this long after `announce` so riders' clients hear `go` before the owner leaves the room.
export const GO_LEAD_MS = 1200;
export const GO_HOLD_MS = 30_000;
export const ARRIVE_WAIT_MS = 15_000;
// A seated rider gets down only after the owner's wagon goes unheard this long; one missed frame does not mean the
// owner left.
export const RIDE_LOST_GRACE_MS = 2000;
export const RIDE_ROW = Object.freeze({ ask: 'wagon:ride', down: 'wagon:down' });

export function createWagonRiders(deps) {
  const book = createRideBook();
  /** @type {{ owner: string, at: number, seat: number|null, go: number|null, wait?: number, lost?: number|null, following?: boolean, followed?: boolean, pinned?: number[]|null } | null} */
  let ride = null;
  let goSeq = 0, go = null, goAt = 0;
  const declinedUntil = new Map();
  const seatWords = new Map();
  const name = (id) => deps.name?.(id) || 'Someone';
  const me = () => deps.selfId?.() ?? null;

  function press(owner, id, distance = 0) {
    if (id === RIDE_ROW.down) { if (ride?.owner === owner) getDown(); return true; }
    if (id !== RIDE_ROW.ask) return false;
    if (!(distance <= RIDE_ASK_REACH)) { deps.say(RIDE_TEXT.tooFar); return true; }
    if (ride?.seat != null) getDown();
    const r = deps.pool.peerRide(owner);
    const seats = WAGON_KINDS[r?.model]?.seats ?? 0;
    if (!seats) { deps.say(RIDE_TEXT.noSeats); return true; }
    if ((r.passengers?.length ?? 0) >= seats) { deps.say(RIDE_TEXT.full); return true; }
    ride = { owner, at: deps.now(), seat: null, go: r.go?.[2] ?? null };
    deps.changed?.();
    deps.say(RIDE_TEXT.asking(name(owner)));
    return true;
  }
  /** @param {string} [text] */
  function getDown(text = RIDE_TEXT.gotOff) {
    const was = ride;
    ride = null;
    deps.drawAt?.(null);
    if (was) deps.changed?.();
    if (was?.seat != null) {
      const at = deps.pool.peerSeat(was.owner, was.seat);
      const body = deps.feet?.() ?? null;
      const near = at && (!body || Math.hypot(body[0] - at.feet[0], body[2] - at.feet[2]) <= GET_DOWN_REACH);
      deps.unpin?.(near ? getDownPoint(at) : null);
      if (text) deps.say(text);
    }
  }
  function leave() {
    const was = ride;
    ride = null;
    deps.drawAt?.(null);
    if (was) deps.changed?.();
  }
  function acts(owner, kind, kept) {
    if (kept || !(WAGON_KINDS[kind]?.seats > 0)) return [];
    if (ride?.owner === owner && ride.seat != null) return [{ id: RIDE_ROW.down, label: RIDE_TEXT.getOff }];
    return [{ id: RIDE_ROW.ask, label: RIDE_TEXT.ask }];
  }

  function hear(rider, raw) {
    const word = raw == null ? null : validRideWord(raw);
    if (word?.seated) seatWords.set(rider, word); else seatWords.delete(rider);
    const said = book.hear(rider, word, me(), deps.now());
    if (said === 'left') deps.say(RIDE_TEXT.left(name(rider)));
    if (said === 'asked') deps.prompt?.render?.();
  }
  const forget = (rider) => { book.drop(rider); seatWords.delete(rider); };
  function sweep(alive) {
    // Riders drop out of the room while they load a journey, so their seats are held for `GO_HOLD_MS` after `go`.
    const journey = go && deps.now() - goAt < GO_HOLD_MS;
    if (!journey) for (const [rider] of book.passengers()) if (!alive?.has?.(rider)) { book.drop(rider); deps.say(RIDE_TEXT.left(name(rider))); }
    for (const a of book.asks()) if (!alive?.has?.(a.rider)) book.drop(a.rider);
    for (const peer of [...seatWords.keys()]) if (!alive?.has?.(peer)) seatWords.delete(peer);
  }
  function accept(rider) {
    if (!book.asks().some((a) => a.rider === rider)) { deps.say(RIDE_TEXT.lapsed(name(rider))); return; }
    if (!book.accept(rider, deps.pool.mySeatCount())) { deps.say(RIDE_TEXT.full); return; }
    deps.say(RIDE_TEXT.seated(name(rider)));
  }
  function decline(rider) { book.decline(rider, deps.now()); declinedUntil.set(rider, deps.now() + 4000); }
  const asks = () => book.asks().map((a) => ({ peer: a.rider, at: a.at }));
  function announce(to) {
    if (!book.passengers().length) return false;
    go = [to.x | 0, to.y | 0, ++goSeq];
    goAt = deps.now();
    return true;
  }

  function release() {
    if (!book.passengers().length) return false;
    book.fit(0);
    return true;
  }
  function frame() {
    const now = deps.now();
    // Fit seats only while the wagon model is known. On the road, or before the model loads, the count reads 0 and
    // would unseat every rider.
    if (deps.pool.mySeatsKnown?.() ?? true) book.fit(deps.pool.mySeatCount());
    if (go && now - goAt > GO_HOLD_MS) go = null;
    book.lapse(now);
    for (const [r, until] of [...declinedUntil]) if (until <= now) declinedUntil.delete(r);
    deps.prompt?.render?.();
    if (ride?.seat == null) deps.drawAt?.(null);
    if (!ride) return;
    if (ride.following) { if (deps.traveling?.()) { ride.wait = now + ARRIVE_WAIT_MS; ride.followed = true; } else if (ride.followed) ride.following = ride.followed = false; }
    if (ride.seat != null && !deps.traveling?.() && deps.jumpPressed?.()) { getDown(); return; }
    const r = deps.pool.peerRide(ride.owner);
    if (!r || r.model == null) {
      ride.pinned = null;
      deps.drawAt?.(null);
      ride.lost ??= now;
      if (ride.seat != null) { if (!deps.traveling?.() && !((ride.wait ?? 0) > now) && now - ride.lost >= RIDE_LOST_GRACE_MS) getDown(RIDE_TEXT.ownerGone); }
      else if (now - ride.at > RIDE_ASK_TTL_MS) { const o = ride.owner; ride = null; deps.changed?.(); deps.say(RIDE_TEXT.noAnswer(name(o))); }
      return;
    }
    ride.lost = null;
    if (r.held && ride.seat != null) { getDown(RIDE_TEXT.lifted); return; }
    const seats = WAGON_KINDS[r.model]?.seats ?? 0;
    const mine = r.passengers.find((e) => e[0] === me() && e[1] < seats);
    if (ride.seat == null) {
      if (r.declined.includes(me())) { const o = ride.owner; ride = null; deps.changed?.(); deps.say(RIDE_TEXT.declined(name(o))); return; }
      if (!mine) { if (now - ride.at > RIDE_ASK_TTL_MS) { const o = ride.owner; ride = null; deps.changed?.(); deps.say(RIDE_TEXT.noAnswer(name(o))); } return; }
      ride.seat = mine[1];
      deps.changed?.();
      deps.say(RIDE_TEXT.accepted(name(ride.owner)));
    } else if (!mine) { getDown(RIDE_TEXT.gotOff); return; }
    else ride.seat = mine[1];
    if (r.go && r.go[2] !== ride.go) {
      ride.go = r.go[2];
      const owner = ride.owner;
      if (!deps.canTravel?.()) { getDown(RIDE_TEXT.leftBehind(name(owner))); return; }
      ride.wait = now + ARRIVE_WAIT_MS;
      ride.following = true; ride.followed = false; ride.pinned = null;
      deps.drawAt?.(null);
      const n = ride.go;
      const went = deps.travel({ x: r.go[0], y: r.go[1] }, () => { const w = deps.pool.peerRide(owner)?.wire; return w ? { x: w[0], y: w[1], z: w[2] } : null; }, name(owner));
      Promise.resolve(went).then((ok) => { if (ok === false && ride?.owner === owner && ride.go === n) { ride.wait = 0; getDown(RIDE_TEXT.leftBehind(name(owner))); } }, () => {});
      return;
    }
    const at = deps.pool.peerSeat(ride.owner, ride.seat);
    // A body moved off its pin, such as by Recall or a teleport, leaves the ride. The pin is compared in world
    // coordinates so a floating-origin rebase does not count as a move.
    const body = deps.world && deps.feet ? deps.feet() : null;
    const here = body ? deps.world(body) : null;
    if (here && ride.pinned && Math.hypot(here[0] - ride.pinned[0], here[2] - ride.pinned[2]) > GET_DOWN_REACH) { leave(); return; }
    if (at) deps.pin(at.feet, at.yaw);
    ride.pinned = at && deps.world ? deps.world(at.feet) : null;
    const drawn = deps.pool.seatDrawn?.(ride.owner, ride.seat) ?? null;
    deps.drawAt?.(drawn && drawn.g > 1 ? drawn.feet : null, drawn?.g ?? 1);
  }

  return {
    press, acts, hear, forget, sweep, accept, decline, asks, announce, release, frame, getDown,
    seated: () => ride?.seat != null,
    word: () => (ride ? rideWord(ride) : null),
    passengers: () => book.passengers(),
    go: () => go,
    declined: () => [...declinedUntil.keys()],
    playerSeats: () => book.passengers().map((e) => e[1]),
    companionSeat(i, riding) {
      const n = deps.pool.mySeatCount();
      const k = companionSeats(n, book.passengers().map((e) => e[1]), i + 1, riding)[i];
      return k >= 0 ? deps.pool.mySeat(k) : null;
    },
    companionSeatDrawn(i, riding, grows) {
      const n = deps.pool.mySeatCount();
      const k = companionSeats(n, book.passengers().map((e) => e[1]), i + 1, riding)[i];
      return k >= 0 ? deps.pool.seatDrawn?.('', k, grows) ?? null : null;
    },
    seatedIn: () => (ride?.seat != null ? { owner: ride.owner, seat: ride.seat } : null),
    ridingWithMe() {
      const out = book.passengers().map((e) => e[0]);
      if (ride?.seat != null) { out.push(ride.owner); for (const [peer, w] of seatWords) if (w.seated === ride.owner) out.push(peer); }
      return out;
    },
    // Seat glue trusts the peer's own word. Under the Overworld their drawn pose lags the seat by tens of meters,
    // so a reach test would refuse them.
    sitsIn(peer, owner, seat) { const w = seatWords.get(peer); return !!w && w.seated === (owner === '' ? me() : owner) && w.seat === seat; },
    leave,
    clear() { book.clear(); ride = null; go = null; declinedUntil.clear(); seatWords.clear(); deps.drawAt?.(null); },
  };
}
