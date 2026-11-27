// @ts-check
// Places the crew party wherever the player is. Each place hands over a small adapter (`deps.place()`).
// A new place key lifts every body out of the old place and places the party behind the player in the new one.
import { companionSlot } from './crewCompanions.js';
import { getDownPoint, GET_DOWN_REACH } from '../../travel/wagonSeats.js';

export const CATCH_UP_M = 40;
export const CATCH_UP_DY = 6;
export const HEEL_M = 2.5;
export const HEEL_STEP_M = 1.2;
export const TRAIL_STEP_M = 0.75;
export const TRAIL_MAX = 64;
export const TRAIL_JUMP_M = 8;

export const companionKeyOf = (c) => c.key ?? `${c.boat}:${c.name}`;
// The seed for a companion's race, face, and clothes; enemy bodies read it before their own, so every place draws
// the same person.
export function companionPerson(c) {
  if (Number.isInteger(c?.person) && c.person >= 0 && c.person <= 0xffffffff) return c.person;
  const k = companionKeyOf(c);
  let h = 0x811c9dc5;
  for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * @param {{
 *   party: () => (ReturnType<typeof import('./crewCompanions.js').createCompanions> | null),
 *   place: () => ({ key: any, spawn: (mobile: number, feet: number[], o: { yaw: number, gender: string }) => Promise<any>,
 *     remove: (rec: any) => void, has?: (rec: any) => boolean, spot?: (from: number[], dx: number, dz: number) => number[],
 *     fx?: { arrive?: (rec: any) => void, leave?: (rec: any, done: () => void) => void, jump?: (rec: any, from: number[]) => void } } | null),
 *   leader: () => ({ feet: number[], yaw: number, grounded?: boolean } | null),
 *   now: () => number,
 *   onKnocked?: (c: any, by: any) => void,
 *   onStood?: (c: any, rec: any) => void,
 *   seat?: (i: number, n: number) => ({ feet: number[], yaw: number } | null),
 *   seatDraw?: (i: number, n: number) => ({ feet: number[], yaw: number, g: number } | null),
 * }} deps
 */
export function createCrewAshore(deps) {
  /** @type {Map<string, { c: any, rec: any, remove: (rec: any) => void, has: ((rec: any) => boolean) | null, fx: any, sat?: { feet: number[], yaw: number } | null }>} */
  const stood = new Map();
  const pending = new Set();
  let placeKey, epoch = 0;
  /** @type {number[][]} */
  const trail = [];
  /** @type {number[]|null} */
  let leaderWas = null;
  function drop(L) {
    const f = L.feet;
    if (leaderWas && Math.hypot(f[0] - leaderWas[0], f[1] - leaderWas[1], f[2] - leaderWas[2]) > TRAIL_JUMP_M) trail.length = 0;
    leaderWas = [f[0], f[1], f[2]];
    if (L.grounded === false) return;
    const last = trail[trail.length - 1];
    if (last && Math.hypot(f[0] - last[0], f[2] - last[2]) < TRAIL_STEP_M) return;
    trail.push([f[0], f[1], f[2]]);
    if (trail.length > TRAIL_MAX) trail.shift();
  }
  // Live spell effects carried from a companion's last body to the next, keyed by party member. They live in memory
  // only: a save keeps health but not spells.
  const carried = new WeakMap();
  const carry = (s) => { const fx = s.rec?.entity?.activeEffects; carried.set(s.c, Array.isArray(fx) ? fx.filter((a) => a && !a.ended) : []); };

  const lift = (s) => { try { s.remove(s.rec); } catch (e) { console.warn('[companions] a body would not lift', e?.message ?? e); } };
  const leave = (s) => {
    if (typeof s.fx?.leave !== 'function') { lift(s); return; }
    try { s.fx.leave(s.rec, () => lift(s)); } catch (e) { console.warn('[companions] a portal would not open', e?.message ?? e); lift(s); }
  };
  function liftAll() { for (const s of stood.values()) { carry(s); lift(s); } stood.clear(); }
  function slotFeet(place, L, i, n) {
    const [dx, dz] = companionSlot(L.yaw, i, n);
    return place.spot ? place.spot(L.feet, dx, dz) : [L.feet[0] + dx, L.feet[1], L.feet[2] + dz];
  }
  const seatOf = (i, n) => () => deps.seat?.(i, n) ?? null;
  const seatDrawOf = (i, n) => () => deps.seatDraw?.(i, n) ?? null;
  function getDown(s, place) {
    const sat = s.sat, ai = s.rec.ai;
    s.sat = null;
    const f = ai.feet;
    if (!sat || Math.hypot(f[0] - sat.feet[0], f[2] - sat.feet[2]) > GET_DOWN_REACH) return;
    const to = getDownPoint(sat);
    const at = place?.spot ? place.spot(sat.feet, to[0] - sat.feet[0], to[2] - sat.feet[2]) : to;
    f[0] = at[0]; f[1] = at[1]; f[2] = at[2];
    if (typeof ai.resumeLive === 'function') ai.resumeLive();
    else { ai.target = null; ai.path = null; ai.velY = 0; }
    ai._restGrounded = false;
  }
  const followOf = (i) => ({ feet: () => deps.leader()?.feet ?? null, stop: HEEL_M + i * HEEL_STEP_M, trail: () => trail });
  // A recenter moves the feet and not the hold spot, so a jump past TRAIL_JUMP_M shifts it.
  /** @type {WeakMap<object, { at: number[], was: number[] }>} */
  const holds = new WeakMap();
  function holdOf(s) {
    if (!s.c.waiting) { holds.delete(s); return null; }
    const f = s.rec.ai.feet, h = holds.get(s);
    if (!h) { const at = [f[0], f[1], f[2]]; holds.set(s, { at, was: [f[0], f[1], f[2]] }); return at; }
    if (Math.hypot(f[0] - h.was[0], f[1] - h.was[1], f[2] - h.was[2]) > TRAIL_JUMP_M) for (let k = 0; k < 3; k++) h.at[k] += f[k] - h.was[k];
    h.was = [f[0], f[1], f[2]];
    return h.at;
  }

  function frame() {
    const party = deps.party();
    const now = deps.now();
    party?.wake(now);
    const place = party && (party.party.length || stood.size) ? deps.place() : null;
    const key = place ? place.key : undefined;
    const behind = [];
    if (key !== placeKey) for (const s of stood.values()) if (party?.party.includes(s.c) && s.c.waiting) behind.push(s.c);
    if (key !== placeKey) { liftAll(); placeKey = key; epoch++; trail.length = 0; leaderWas = null; }
    if (!party) return;
    const L = deps.leader();
    if (place && L) drop(L);
    const list = party.party;
    for (const [k, s] of [...stood]) {
      const { rec } = s;
      const i = list.indexOf(s.c);
      if (rec._knockedOut) {
        stood.delete(k); leave(s);
        if (party.knock(s.c.boat, s.c.name, now)) deps.onKnocked?.(s.c, rec._knockedBy ?? null);
        continue;
      }
      if (rec.dead || !rec.ai || (s.has && !s.has(rec))) { carry(s); stood.delete(k); if (s.c.waiting && i >= 0) behind.push(s.c); continue; }
      if (i < 0) { stood.delete(k); leave(s); continue; }
      if (rec.entity) {
        party.hurt(s.c.boat, s.c.name, rec.entity.health, rec.entity.maxHealth);
        // Reset every frame: a stray blow from the player or a reset of ally teams can change a companion's team.
        rec.entity.team = 'PlayerAlly'; rec.entity.mobileTeam = 'PlayerAlly';
      }
      rec.shipmate = true;
      rec.ai.seat = deps.seat && !s.c.waiting ? seatOf(i, list.length) : null;
      rec.ai.seatDraw = deps.seatDraw && !s.c.waiting ? seatDrawOf(i, list.length) : null;
      const seat = rec.ai.seat?.() ?? null;
      if (seat) s.sat = { feet: [seat.feet[0], seat.feet[1], seat.feet[2]], yaw: seat.yaw };
      else if (s.sat) getDown(s, place);
      const hold = holdOf(s);
      rec.ai.follow = hold ? { feet: () => hold, stop: HEEL_M, trail: () => null } : followOf(i);
      if (place && L && !seat && !hold) {
        const f = rec.ai.feet;
        // A floor away counts only while the leader is grounded; a body placed at a flying or swimming leader's
        // height would fall and be caught up again.
        const away = Math.hypot(f[0] - L.feet[0], f[2] - L.feet[2]) > CATCH_UP_M || (L.grounded !== false && Math.abs(f[1] - L.feet[1]) > CATCH_UP_DY);
        if (away) {
          const at = slotFeet(place, L, i, list.length);
          const from = [f[0], f[1], f[2]];
          f[0] = at[0]; f[1] = at[1]; f[2] = at[2];
          try { s.fx?.jump?.(rec, from); } catch {}
          // Resume the motor as fresh, so no fall is billed from the ledge the body left.
          if (typeof rec.ai.resumeLive === 'function') rec.ai.resumeLive();
          else { rec.ai.target = null; rec.ai.path = null; rec.ai.velY = 0; }
          rec.ai._restGrounded = false;
        }
      }
    }
    if (behind.length) /** @type {any} */ (deps).onLeftBehind?.(behind);
    if (!place || !L) return;
    list.forEach((c, i) => {
      const k = companionKeyOf(c);
      if (stood.has(k) || pending.has(k) || /** @type {any} */ (c).waiting) return;
      pending.add(k);
      const at = slotFeet(place, L, i, list.length), was = epoch;
      Promise.resolve(place.spawn(c.mobile, at, { yaw: L.yaw, gender: c.gender })).then((rec) => {
        pending.delete(k);
        if (!rec) return;
        // The spawn is async: drop the body if the place changed or the companion went back meanwhile.
        if (was !== epoch || !party.isAshore(c.boat, c.name) || deps.party() !== party) { place.remove(rec); return; }
        rec.companion = k;
        rec.person = companionPerson(c);
        rec.shipmate = true;
        if (rec.entity) {
          rec.entity.name = /** @type {any} */ (c).title ?? c.name;
          // Each place rolls a fresh health pool, so the party's maximum and current health replace it.
          if (c.maxHealth > 0) { rec.entity.maxHealth = c.maxHealth; rec.entity.health = Math.max(1, Math.min(c.maxHealth, c.health ?? c.maxHealth)); }
          const fx = carried.get(c);
          if (fx?.length) rec.entity.activeEffects = [...(rec.entity.activeEffects ?? []), ...fx];
        }
        if (rec.ai) rec.ai.follow = followOf(Math.max(0, party.party.indexOf(c)));
        stood.set(k, { c, rec, remove: place.remove, has: place.has ?? null, fx: place.fx ?? null });
        try { place.fx?.arrive?.(rec); } catch {}
        deps.onStood?.(c, rec);
      }).catch((e) => { pending.delete(k); console.warn('[companions] a companion would not stand', e?.message ?? e); });
    });
  }

  return {
    frame,
    bodies: () => [...stood.values()].map((s) => s.rec),
    capsules: () => [...stood.values()].filter((s) => s.rec.ai?.feet).map((s) => ({ feet: s.rec.ai.feet, height: s.rec.ai.height })),
    clear() { liftAll(); placeKey = undefined; epoch++; trail.length = 0; leaderWas = null; },
    trail: () => trail,
  };
}
