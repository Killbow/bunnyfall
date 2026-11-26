// @ts-check
// Party rest rules as pure functions so tests can run them; scenes/world.js and partyWorld.js hold the state.
// Stamps are durations on the shared relay clock; cancel markers are compared per sender, never across senders.
import { optionPath } from '../ui/settingsMap.js';

export const PARTY_READY_TIMEOUT_MS = 60_000;

export const STAMP_SLACK_MS = 5_000;

export function stampOf(v, now, slack = STAMP_SLACK_MS) {
  return Number.isFinite(v) && v <= now + slack ? v : 0;
}

/** The hub keeps a disconnected member's seat with `online: false` and no pose, so present needs both. */
export function memberPresent(m) {
  return !!m && !!m.p && m.online !== false;
}

export function latestStamp(members, key, mine, now) {
  let latest = Number.isFinite(mine) ? mine : 0;
  for (const m of members) latest = Math.max(latest, stampOf(m?.p?.[key], now));
  return latest;
}

/** A vote counts only after the last rest started here; a pose without `readyAt` (an older client) has no vote. */
export function voteStands(p, now, lastStartedAt, timeout = PARTY_READY_TIMEOUT_MS) {
  if (!p || p.ready !== true) return false;
  const at = stampOf(p.readyAt, now);
  if (at <= 0) return false;
  if (now - at > timeout) return false;
  return at > (Number.isFinite(lastStartedAt) ? lastStartedAt : 0);
}

export function snapshotCancels(members) {
  const seen = new Map();
  for (const m of members) if (m?.acct) seen.set(m.acct, m.p?.restCancelAt ?? null);
  return seen;
}

/** Each sender's marker is compared only with its own earlier value, never across senders or with my clock. */
export function cancelRequestFor(members, me, seen) {
  for (const m of members) {
    const p = m?.p;
    if (!p || p.restCancelFor !== me) continue;
    const at = p.restCancelAt ?? null;
    if (at === null || at === (seen.get(m.acct) ?? null)) continue;
    seen.set(m.acct, at);
    return m;
  }
  return null;
}

/** Null for a pose without `restStartedAt` (an older client); such a pose is still mirrored. */
export function mirrorKey(row) {
  const at = row?.p?.restStartedAt;
  return Number.isFinite(at) && at > 0 ? `${row.acct}:${at}` : null;
}
export function cooldownStamp(members, mine, now) {
  let latest = Number.isFinite(mine) ? mine : 0;
  for (const m of members) {
    const t = stampOf(m?.p?.restStartedAt, now);
    if (stampOf(m?.p?.voteAt, now) > t) continue;
    latest = Math.max(latest, t);
  }
  return latest;
}

export function restsAlone(m) {
  return !!m?.p?.nr;
}

export function restsApart(m, mineTogether) {
  return !!m?.p?.rs && (restsAlone(m) || !mineTogether);
}
export const REST_APART_TEXT = 'A party member is resting separately nearby. Rest farther away.';

export function partyRestsTogether(mineOn, party, iLead) {
  if (!mineOn) return false;
  if (!party || iLead) return true;
  const lead = (party.members ?? []).find((m) => m.acct === party.leader);
  return !restsAlone(lead);
}

export function restAloneText(mineOn) {
  return mineOn ? 'Your leader rests on their own, so everyone rests for themselves.'
    : `You rest on your own. Turn on "Rest with my party" (${optionPath('card:peerSprites')}) to rest with them.`;
}

export const PARTY_NIGHT_FRESH_MS = 30_000;
export const PARTY_NIGHT_GAP_MS = 60_000;

/** Only a stamp above the member's highest seen stamp is a new night, so a replayed older stamp sleeps nobody. */
export function nightMoved(high, at, now, isNight, freshMs = PARTY_NIGHT_FRESH_MS) {
  return !!at && at > high && now - at <= freshMs && !!(typeof isNight === 'function' ? isNight(at) : isNight);
}

export function createNightWatch({ freshMs = PARTY_NIGHT_FRESH_MS, gapMs = PARTY_NIGHT_GAP_MS } = {}) {
  /** @type {Map<string, { high: number, answered: number }>} */
  const marks = new Map();
  return {
    moved(acct, posed, at, now, isNight, due = /** @type {boolean | (() => boolean)} */ (false)) {
      if (!posed) return false;
      const rec = marks.get(acct);
      if (!rec) { marks.set(acct, { high: at, answered: -Infinity }); return false; }
      const move = nightMoved(rec.high, at, now, isNight, freshMs) && (now - rec.answered >= gapMs || !!(typeof due === 'function' ? due() : due));
      if (at > rec.high) rec.high = at;
      if (move) rec.answered = now;
      return move;
    },
    keep(members) {
      for (const acct of marks.keys()) {
        let here = false;
        for (const m of members) if (m?.acct === acct) { here = true; break; }
        if (!here) marks.delete(acct);
      }
    },
    clear() { marks.clear(); },
    highOf: (acct) => marks.get(acct)?.high,
  };
}

export function carriedNightAction({ withParty, resterAlone, exempt, dead, near, here, busy, town }) {
  if (!withParty || resterAlone || exempt || dead) return null;
  if (!near) return here ? 'far' : null;
  if (typeof busy === 'function' ? busy() : busy) return 'busy';
  return (typeof town === 'function' ? town() : town) ? 'town' : 'carry';
}

const KIND_RANK = Object.freeze({ rough: 0, camp: 1, bed: 2 });
/** @param {unknown} k */
const rankOf = (k) => (typeof k === 'string' && Object.hasOwn(KIND_RANK, k) ? KIND_RANK[/** @type {'rough'|'camp'|'bed'} */ (k)] : -1);
export function carriedRestKind(own, theirs) {
  const o = rankOf(own), t = rankOf(theirs);
  if (o < 0) return t < 0 ? null : theirs;
  return t > o ? theirs : own;
}

// Every client elects the same camp roller without a message: the lowest account id among members resting together.
// Other members wait up to CAMP_WAIT_MS for that roller's night, then roll their own.

export const CAMP_WAIT_MS = 15_000;
export const CAMP_OPEN_FRESH_MS = 40_000;

const campSnap = (m, now) => ({ at: stampOf(m?.p?.restStartedAt, now), enemy: Number.isFinite(m?.p?.restEnemyAt) ? m.p.restEnemyAt : null });

/**
 * @param {{ kindOf: (t: number) => string|null, campOf: (t: number) => string|null, waitMs?: number, freshMs?: number }} o
 */
export function createCampWatch({ kindOf, campOf, waitMs = CAMP_WAIT_MS, freshMs = CAMP_OPEN_FRESH_MS }) {
  /** @type {Map<string, { at: number, enemy: number|null }>|null} */
  let base = null;
  /** @type {number|null} */
  let firstAsk = null;
  return {
    /**
     * @param {any[]} members
     * @param {number} now
     */
    open(members, now) {
      base = new Map();
      firstAsk = null;
      for (const m of members ?? []) if (m?.acct) base.set(m.acct, campSnap(m, now));
    },
    isOpen: () => base !== null,
    close() { base = null; firstAsk = null; },
    /** @param {{ me: string, members: any[], inCamp: (m: any) => boolean, now: number }} q */
    verdict({ me, members, inCamp, now }) {
      if (!base) return null;
      if (firstAsk === null) firstAsk = now;
      let night = null, leader = null;
      for (const m of members ?? []) {
        if (!m?.acct || restsAlone(m) || !inCamp(m)) continue;
        const was = base.get(m.acct);
        const cur = campSnap(m, now);
        if (!was) { base.set(m.acct, cur); continue; }
        if (cur.enemy !== null && cur.enemy !== was.enemy) return { act: 'enemy', acct: m.acct, name: m.name };
        const kind = cur.at > was.at && now - cur.at <= freshMs ? kindOf(cur.at) : null;
        if (kind && !night) night = { act: 'night', acct: m.acct, name: m.name, kind };
        if (m.p?.rs && campOf(cur.at) === 'open' && now - cur.at <= freshMs && m.acct < me && (!leader || m.acct < leader.acct)) leader = m;
      }
      if (night) return night;
      if (now - firstAsk >= waitMs || !leader) return { act: 'roll' };
      return { act: 'wait', acct: leader.acct, name: leader.name };
    },
  };
}

/** The fallback pass is the unmodified env, so tight ground still places the enemy at DFU odds. */
export function campPasses(env, feet, min) {
  if (!feet?.length) return [env];
  return [{ ...env, overlapSphere: (p, r) => !!env.overlapSphere?.(p, r) || !campClear(p, feet, min) }, env];
}

export function campClear(p, feet, min) {
  const m2 = min * min;
  for (const f of feet ?? []) {
    if (!f) continue;
    const dx = f[0] - p.x, dz = f[2] - p.z;
    if (dx * dx + dz * dz < m2) return false;
  }
  return true;
}
