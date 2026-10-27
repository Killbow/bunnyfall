// @ts-check
// HULL-PASS (2026-10-26, Discord #feature-feedback "Boat Player Collision": "Player boat collision needs to be off outside
// of PVP zone or just during the Sethrakul fight - too many people out there bumping into each other ruining their
// shots"; bible/01-Overview/bugs/Field-Bugs-2026-10-26c.md): ANOTHER PLAYER'S SHIP IS NO ROCK TO MY HELM OUTSIDE A PVP ZONE.
//
// FIELD BUGS 2026-10-01b (Mac: "Players aren't colliding with other players' boats and can't stand on board") stood every
// peer's ship in my collider as my own boats stand (world.js csaSyncColliders), and so her hull met my helm's sweep as a
// rock (Come Sail Away's CheckCollision: the way into her cancelled, the turn toward her refused) - at sea, in a harbour,
// and in Sethrakul's waters, where a dozen ships close on one serpent and every shot was lined up against a neighbour's
// shove. Now the sweep drops another player's hull outside a PvP zone (wildZone.js wildHere: the Eltheric Ocean past
// Veilhaven's peace, the Wrothgarian Mountains), and inside one she is a rock as before - AUDIT FB1026c D3: the zone
// alone, as the report asked ("off outside of PVP zone"); a ship may be one the broadsides spare (a party's, a guild's,
// a relay without sea PvP) and still meet mine there. Sethrakul's site stands on the Bay's lanes, never in the ether's
// box, so the serpent fight is always outside one (SERPENT4's bumpers, which pushed ships apart there alone, went with
// it - navalHost.js).
//
// WHAT PASSES MY HELM PASSES MY DECK (AUDIT FB1026c D1). Her hull stays in my collider, so I walk her deck, stand on it,
// climb aboard her, and a swimmer meets her side (comeSailAwayAboard.js) - but a ship let through my hull would then
// sail her deck through the body standing on mine and shove it off, or carry it away aboard her. So outside a zone, while
// my body stands on a deck (my helm's, another's I am aboard, or the one under my feet, kept through a jump while my feet
// stay over it), every player's hull that overlaps that deck's - hers through mine, mine through hers, one peer's through
// another's - leaves my collider until they part (hullsStood); the sea's ships and everything else stand as they did.
//
// THE ZONE TURNING DOES NOT JAM THEM (AUDIT FB1026c D2). Two hulls overlapping when the zone turns PvP - a party's ships
// leaving Veilhaven's peace together, one moored over another - met as rocks from that frame, each refusing the other's
// way and turn. A hull already through my deck as hulls start to meet goes on passing, the sweep's and the collider's
// alike (hullsStood keeps it out of the collider the helm's sweep sweeps), until it is clear of my deck (the latch); one
// that comes into my deck after meets it.
//
// The host wires all three through here (world.js: Come Sail Away's `sphereCastAll`, csaSyncColliders' boats, the aboard
// door's deckGround), so it does not grow.

import { wildHere } from '../../systems/wild/wildZone.js';
import { hullOverlap } from '../../systems/naval/navalShips.js';
import { colliderPoses, invertAffine, boxColliderTriangles } from '../../world/prefabColliders.js';

/** Whether another player's hull meets my helm here: only inside a PvP zone. */
export const peerHullsMeet = () => wildHere();

/** @type {WeakMap<object, { root: any, variant: any, box: number[] | null }>} each boat's hull in its root's own frame */
const _local = new WeakMap();

/**
 * A boat's hull on the flat as it stands now - its non-trigger colliders' box in its root's own frame, carried by the
 * root's pose: `{ c, f, r, hl, hw }` (navalShips.js hullOverlap's shape), or null. `geometry` the host's collider mesh
 * reader (world.js csaColliderMesh), as csaSyncColliders reads it.
 * @param {any} boat @param {(c: any) => any} geometry
 */
export function hullPlan(boat, geometry) {
  const root = boat?.GameObject;
  if (!root?.activeSelf) return null;
  let k = _local.get(boat);
  if (!k || k.root !== root || k.variant !== boat.variant) {
    const inv = invertAffine(root.worldMatrix());
    const box = [Infinity, -Infinity, Infinity, -Infinity];   // x min, x max, z min, z max in the root's frame
    for (const { collider: c, world: m } of inv ? colliderPoses(root) : []) {
      if (c.m_IsTrigger) continue;
      const tri = c.type === 'BoxCollider' ? boxColliderTriangles(c) : geometry?.(c);
      const p = tri?.positions;
      for (let i = 0; p && i + 2 < p.length; i += 3) {
        const w = [0, 1, 2].map((d) => m[d] * p[i] + m[4 + d] * p[i + 1] + m[8 + d] * p[i + 2] + m[12 + d]);
        const x = inv[0] * w[0] + inv[4] * w[1] + inv[8] * w[2] + inv[12], z = inv[2] * w[0] + inv[6] * w[1] + inv[10] * w[2] + inv[14];
        box[0] = Math.min(box[0], x); box[1] = Math.max(box[1], x); box[2] = Math.min(box[2], z); box[3] = Math.max(box[3], z);
      }
    }
    k = { root, variant: boat.variant, box: Number.isFinite(box[0]) ? box : null };
    _local.set(boat, k);
  }
  if (!k.box) return null;
  const m = root.worldMatrix();
  const rl = Math.hypot(m[0], m[2]) || 1, fl = Math.hypot(m[8], m[10]) || 1;
  const r = [m[0] / rl, m[2] / rl], f = [m[8] / fl, m[10] / fl];
  const cx = (k.box[0] + k.box[1]) / 2, cz = (k.box[2] + k.box[3]) / 2;
  return { c: [m[12] + m[0] * cx + m[8] * cz, m[14] + m[2] * cx + m[10] * cz], f, r, hl: (k.box[3] - k.box[2]) / 2, hw: (k.box[1] - k.box[0]) / 2 };
}
/** Whether flat point `p` (x, z) stands within hull plan `h`. */
const within = (h, p) => {
  const d = [p[0] - h.c[0], p[1] - h.c[1]];
  return Math.abs(d[0] * h.f[0] + d[1] * h.f[1]) <= h.hl && Math.abs(d[0] * h.r[0] + d[1] * h.r[1]) <= h.hw;
};

/** The latch: the deck my body stands on, and the players' hulls passing through it. */
let _latch = { deck: /** @type {any} */ (null), passing: /** @type {Set<any>} */ (new Set()) };
/** For a test: the latch let go. */
export const resetHullLatch = () => { _latch = { deck: null, passing: new Set() }; };
/** Whether `boat` is passing through the deck my body stands on (the last sync's word) - the aboard door never boards
 *  it from the air (world.js deckGround: a jump over my deck as she sails under it lands on mine, never on hers). */
export const hullPassesMyDeck = (boat) => _latch.passing.has(boat);

/**
 * The players' hulls passing through `deck` now (AUDIT FB1026c D1/D2): outside a PvP zone every one of `hulls` that
 * overlaps it; inside one, those already passing on this deck as hulls began to meet, while they still overlap it.
 * @param {any} deck @param {any[]} hulls @param {(c: any) => any} geometry
 */
export function hullsPassing(deck, hulls, geometry) {
  const D = deck ? hullPlan(deck, geometry) : null;
  const over = new Set();
  if (D) for (const b of hulls) { if (b === deck) continue; const P = hullPlan(b, geometry); if (P && hullOverlap(D, P)) over.add(b); }
  const passing = !peerHullsMeet() ? over : deck !== _latch.deck ? new Set() : new Set([..._latch.passing].filter((b) => over.has(b)));
  _latch = { deck, passing };
  return passing;
}

/**
 * The boats that stand in my collider (world.js csaSyncColliders): `boats` less every player's hull passing through the
 * deck my body stands on. `deck` the host's word for it (my helm's boat, the one I am aboard, the one under my feet) -
 * none, the last deck while `feet` stay over it (a jump, a stumble). `pool` Come Sail Away's (its boats and its peers'
 * are the players' hulls; the sea's ships are never among them).
 * @param {any[]} boats @param {any} deck @param {number[] | null} feet @param {any} pool @param {(c: any) => any} geometry
 */
export function hullsStood(boats, deck, feet, pool, geometry) {
  const kept = !deck && _latch.deck && feet ? hullPlan(_latch.deck, geometry) : null;
  const on = deck ?? (kept && within(kept, [feet[0], feet[2]]) ? _latch.deck : null);
  const passing = hullsPassing(on, [...(pool?.boats ?? []), ...(pool?.peerBoats ?? [])], geometry);
  return passing.size ? boats.filter((b) => !passing.has(b)) : boats;
}

/**
 * The helm's sweep with the peers' hulls dropped where they do not meet: `sweep` is the host's own
 * (o, r, d, dist, opts) -> hits, each hit's `root` a boat's GameObject or null; `pool` is Come Sail Away's pool, whose
 * `peerBoats` are the other players' ships as they stand now. Inside a PvP zone a hull still passing through my helm's
 * deck (the latch) is met by nothing here either: hullsStood took it out of the collider the sweep sweeps.
 */
export function peerHullSweep(sweep, pool) {
  return (o, r, d, dist, opts = null) => {
    const hits = sweep(o, r, d, dist, opts);
    if (peerHullsMeet()) return hits;
    const peers = pool?.peerBoats;
    if (!peers?.length) return hits;
    return hits.filter((h) => !h.root || !peers.some((b) => b.GameObject === h.root));
  };
}
