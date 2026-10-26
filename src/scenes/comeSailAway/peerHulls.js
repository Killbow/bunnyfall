// @ts-check
// HULL-PASS (2026-10-26, Discord #feature-feedback "Boat Player Collision": "Player boat collision needs to be off outside
// of PVP zone or just during the Sethrakul fight - too many people out there bumping into each other ruining their
// shots"; bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md): ANOTHER PLAYER'S SHIP IS NO ROCK TO MY HELM OUTSIDE A PVP ZONE.
//
// FIELD BUGS 2026-10-01b (Mac: "Players aren't colliding with other players' boats and can't stand on board") stood every
// peer's ship in my collider as my own boats stand (world.js csaSyncColliders), and so her hull met my helm's sweep as a
// rock (Come Sail Away's CheckCollision: the way into her cancelled, the turn toward her refused) - at sea, in a harbour,
// and in Sethrakul's waters, where a dozen ships close on one serpent and every shot was lined up against a neighbour's
// shove. Now the sweep drops another player's hull outside a PvP zone (wildZone.js wildHere: the Eltheric Ocean past
// Veilhaven's peace, the Wrothgarian Mountains), and inside one she is a rock as before - a ship you may fire on is one
// you may run against. Sethrakul's site stands on the Bay's lanes, never in the ether's box, so the serpent fight is
// always outside one (SERPENT4's bumpers, which pushed ships apart there alone, went with it - navalHost.js).
//
// ONLY THE HELM'S SWEEP. Her hull stays in my collider: I still walk her deck, stand on it, climb aboard her, and a
// swimmer still meets her side (comeSailAwayAboard.js). My own boats, a sea ship's, a rock and the ground are swept as
// they were. The host wires the sweep through here (world.js, Come Sail Away's `sphereCastAll`), so it does not grow.

import { wildHere } from '../../systems/wild/wildZone.js';

/** Whether another player's hull meets my helm here: only inside a PvP zone. */
export const peerHullsMeet = () => wildHere();

/**
 * The helm's sweep with the peers' hulls dropped where they do not meet: `sweep` is the host's own
 * (o, r, d, dist, opts) -> hits, each hit's `root` a boat's GameObject or null; `pool` is Come Sail Away's pool, whose
 * `peerBoats` are the other players' ships as they stand now.
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
