// @ts-check
// An actor for populations driven by a relay or a roster rather than an enemy pool.
import { rosterLook } from './foeBodies.js';
import { folkLookOf } from './folkBodies.js';
import { dressPerson } from './wardrobe.js';
import { textSeed } from '../systems/livingWorld/seed.js';

const keyOf = (k) => (typeof k === 'string' || Number.isFinite(k) ? k : null);

/**
 * @param {any} rec
 * @param {{ id: any, look: any, feet: number[], yaw: number, moving?: boolean, running?: boolean, swingKey?: any,
 *   hitKey?: any, dead?: number, scale?: number, drawn?: boolean }} o
 */
export function rosterActor(rec, { id, look, feet, yaw, moving = false, running = false, swingKey = null, hitKey = null, dead = 0, scale = 1, drawn = true }) {
  const a = rec._mwActor ??= { id, look: null, feet: null, yaw: 0, moving: false, running: false, drawn: true, swings: 0, strike: 1, casts: 0, castRange: 2, hits: 0, dead: 0, scale: 1 };
  a.id = id; a.look = look; a.feet = feet; a.yaw = Number.isFinite(yaw) ? yaw : 0; a.drawn = !!drawn;
  a.moving = !!moving; a.running = !!moving && !!running;
  const sk = keyOf(swingKey), hk = keyOf(hitKey);
  if (sk !== rec._mwSwingKey) { if (sk !== null) a.swings = (a.swings + 1) & 0xffff; rec._mwSwingKey = sk; }
  if (hk !== rec._mwHitKey) { if (hk !== null) a.hits = (a.hits + 1) & 0xffff; rec._mwHitKey = hk; }
  a.strike = 1 + (a.swings % 6);
  a.dead = dead > 0 ? dead | 0 : 0;
  a.scale = scale > 0 ? scale : 1;
  return a;
}

export const STILL_WARDROBE = Object.freeze({ courtier: 'noble', priest: 'priest', keeper: 'merchant', merchant: 'merchant' });

/**
 * @param {any} rec
 * @param {any} res
 * @param {{ still?: boolean, cls?: number|null, guard?: boolean }} [o]
 */
export function residentLook(rec, res, { still = false, cls = res.cls, guard = false } = {}) {
  const seed = textSeed(String(res.id));
  if (cls != null) return rosterLook(rec, { mobileType: cls, gender: res.sex === 'female' ? 'female' : 'male', seed, race: res.race });
  const kind = still ? STILL_WARDROBE[res.job] : undefined;
  if (kind) {
    const gender = res.sex === 'female' ? 'female' : 'male';
    const d = dressPerson({ role: kind, gender, seed, cut: kind === 'priest' ? 'robe' : null });
    return { race: res.race ?? 'Breton', gender, faceIndex: (seed >>> 0) % 10, items: d.items, npc: d.npc };
  }
  return folkLookOf({ archive: guard ? res.archive : (res.civvies ?? res.archive), personFaceRecordId: res.face ?? 0, gender: res.gender ?? 0, guard }, res.race ?? 'Breton', seed);
}

/**
 * @param {any} person
 * @param {number[]} feet
 * @returns {any}
 */
export function residentWalkerActor(person, feet) {
  const res = person.living.res;
  const role = person.stillLook ? (person.stillRole ?? null) : null;
  if (role === 'beggar') return null;
  const cls = person.stillLook ? null : (person.cls ?? null);
  const guard = !!person.guard;
  const still = !!person.stillLook;
  let k = person._mwRes;
  if (!k || k.res !== res || k.cls !== cls || k.guard !== guard || k.still !== still) k = person._mwRes = { res, look: null, cls, guard, still };
  k.look ??= residentLook(k, res, { still, cls, guard });
  return rosterActor(k, { id: `res:${res.id}`, look: k.look, feet, yaw: Number.isFinite(person.yaw) ? person.yaw : (person.facingYaw ?? 0),
    moving: person.state === 'move', drawn: cls != null });
}
