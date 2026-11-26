// @ts-check
// Group travel where the leader drives: a member who says yes walks the leader's journey, and a stop for one halts
// all. Stamps use the shared clock; a member's answer is local, and the leader hears only that member's `ts`.

export const PARTY_WALK_RADIUS_M = 60;
export const PARTY_WALK_ASK_MS = 30_000;
/** After a hub reconnect the leader pose reads null briefly, so a member believes the last walk this long.
 *  A pose that says no walk is believed at once. */
export const PARTY_WALK_GRACE_MS = 10_000;
export const PARTY_WALK_HALT_MS = 5 * 60_000;
export const PARTY_WALK_TS_SKEW_MS = 30_000;
export const NO_WALK_ANSWER = Object.freeze({ at: null, yes: false, go: null });
export const WALK_BALKS = Object.freeze(['health', 'fatigue', 'stuck', 'blocked', 'ocean']);

/**
 * @param {any} tw
 * @param {number} now
 */
export function walkHaltLapsed(tw, now) {
  return !!tw && tw.h != null && now - tw.h > PARTY_WALK_HALT_MS;
}

/**
 * @param {{ pixel: {x:number,y:number}, point?: {x:number,z:number}|null }} dest
 * @param {number} at
 */
export function walkOf(dest, at) {
  const w = { x: dest.pixel.x, y: dest.pixel.y, at: Math.round(at), go: Math.round(at), h: null };
  if (dest.point) { w.sx = Math.round(dest.point.x); w.sz = Math.round(dest.point.z); }
  return w;
}

/**
 * @param {any} tw
 * @param {{ x: number, y: number, spot?: boolean }|null|undefined} d
 */
export function sameWalkDest(tw, d, anyKind = false) {
  return !!tw && !!d && tw.x === d.x && tw.y === d.y && (anyKind || (tw.sx != null) === !!d.spot);
}

/**
 * @param {any} prev
 * @param {{ pixel: {x:number,y:number}, point?: {x:number,z:number}|null }} dest
 * @param {number} now
 * @param {number} gathered
 */
export function walkBegin(prev, dest, now, gathered) {
  const live = walkHaltLapsed(prev, now) ? null : prev;
  if (live && sameWalkDest(live, { x: dest.pixel.x, y: dest.pixel.y, spot: !!dest.point })) {
    const moved = !!dest.point && (Math.round(dest.point.x) !== live.sx || Math.round(dest.point.z) !== live.sz);
    if (live.h == null && !moved) return live;
    const w = { ...live, go: Math.round(now), h: null };
    if (dest.point) { w.sx = Math.round(dest.point.x); w.sz = Math.round(dest.point.z); }
    return w;
  }
  return gathered > 0 ? walkOf(dest, now) : null;
}

// The walk end is read from `ended`, never from the destination fields, since a spot stop nulls its route.
/**
 * @param {{ tw: any, journeying: boolean, dest: {x:number,y:number,spot?:boolean}|null, ended: boolean, stops: Array<number|null|undefined>, now: number }} q
 * @returns {{ tw: any, halt: boolean }}
 */
export function leaderWalkStep({ tw, journeying, dest, ended, stops, now }) {
  if (!tw || ended) return { tw: null, halt: false };
  const mine = sameWalkDest(tw, dest);
  if (tw.h == null) {
    if (!journeying) return { tw: { ...tw, h: Math.round(now) }, halt: false };
    if (!mine) return { tw: null, halt: false };
    if (leaderMustHalt(tw, stops, now)) return { tw: { ...tw, h: Math.round(now) }, halt: true };
    return { tw, halt: false };
  }
  if (walkHaltLapsed(tw, now)) return { tw: null, halt: false };
  if (journeying) return { tw: mine ? { ...tw, go: Math.round(now), h: null } : null, halt: false };
  if (dest ? !mine : tw.sx == null) return { tw: null, halt: false };
  return { tw, halt: false };
}

/**
 * @param {any} tw
 * @param {Array<number|null|undefined>} stops
 * @param {number} [now]
 */
export function leaderMustHalt(tw, stops, now = Infinity) {
  if (!tw || tw.h != null) return false;
  // The wire bounds `ts` from below only, so a stop stamped far ahead would halt the party after every set-out.
  const latest = now + PARTY_WALK_TS_SKEW_MS;
  for (const s of stops ?? []) if (Number.isFinite(s) && /** @type {number} */ (s) > tw.go && /** @type {number} */ (s) <= latest) return true;
  return false;
}

/**
 * @param {{ acct: any, tw: any, at: number }|null} held
 * @param {{ acct: any, present: boolean, tw: any }} seen
 * @param {number} now
 * @returns {{ acct: any, tw: any, at: number }}
 */
export function walkHeard(held, { acct, present, tw }, now) {
  const h = held && held.acct === acct ? held : { acct, tw: null, at: -Infinity };
  if (present) return { acct, tw: tw ?? null, at: now };
  return h.tw && now - h.at <= PARTY_WALK_GRACE_MS ? h : { acct, tw: null, at: h.at };
}

/**
 * @param {{ at: number|null, yes: boolean, go: number|null }} mine
 * @param {any} tw
 */
export function memberAnswer(mine, tw) {
  return tw && mine && mine.at === tw.at ? mine : NO_WALK_ANSWER;
}

export function memberFollowing(mine, tw) {
  return !!tw && !!mine && mine.at === tw.at && mine.yes && mine.go != null;
}

// The host reads `was` after the party halt, so that halt is never echoed back as a member stop.
/**
 * @param {{ was: boolean, journeying: boolean, ended: boolean, following: boolean, why?: string|null }} q
 * @returns {'stop'|'balk'|'done'|null}
 */
export function memberStopOf({ was, journeying, ended, following, why = null }) {
  if (!was && !following) return null;
  if (ended) return 'done';
  const stop = was && following && !journeying;
  return !stop ? null : WALK_BALKS.includes(/** @type {string} */ (why)) ? 'balk' : 'stop';
}

/**
 * @param {{ tw: any, mine: { at: number|null, yes: boolean, go: number|null, balk?: boolean }, gathered: boolean, journeying: boolean, onWalk?: boolean, was?: boolean, free?: boolean, now: number }} q
 * @returns {'ask'|'start'|'halt'|'leave'|null}
 */
export function memberWalkStep({ tw, mine, gathered, journeying, onWalk = journeying, was = onWalk, free = true, now }) {
  if (!tw) return null;
  if (mine.at !== tw.at) {
    if (now - tw.at > PARTY_WALK_ASK_MS) return null;
    return gathered && !journeying && free ? 'ask' : null;
  }
  if (!mine.yes) return null;
  if (journeying && !onWalk) return 'leave';
  if (tw.h != null && tw.h >= (mine.go ?? -Infinity)) return !journeying ? null : was ? 'halt' : 'leave';
  if (tw.h == null && tw.go !== mine.go) return free && (journeying || !mine.balk) ? 'start' : null;
  return null;
}

/** @param {{ tw: any, round: number|null, now: number, danger: boolean }} q */
export function walkAskStands({ tw, round, now, danger }) {
  return !!tw && tw.at === round && now - tw.at <= PARTY_WALK_ASK_MS && !danger;
}
