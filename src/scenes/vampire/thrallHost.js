// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 2: THE THRALL AT YOUR SIDE. The servant thrall on FOLLOW duty
// (systems/vampire/thralls.js thrallParty) stood by the companion layer (scenes/crewAshore.js) - the one the crew, the
// sworn revenants and the necromancer's minions walk with: every place, every door, the heel and the catch-up, fighting
// as the player's ally, drawn for everyone in the room. Stood, it takes its expertise (its blood's quality: more health)
// and wears the kit the vampire gave it (the sworn revenants' gear law, revenantGear.js applySwornGear). Knocked out, it
// crawls back to the Haven (the party's knock). The host wires one (world.js) beside the minions: its frame, its clear,
// its bodies.
import { createCrewAshore } from '../../systems/naval/crewAshore.js';
import { thrallParty, setThrallPlayer, gearRecord, takeThrallLines, isThrallKey } from '../../systems/vampire/thralls.js';
import { applySwornGear } from '../../revenants/revenantGear.js';

/**
 * @param {{ place: () => any, leader: () => ({ feet: number[], yaw: number, grounded?: boolean } | null), now: () => number,
 *   say: (s: string) => void, playerEntity: any }} deps
 */
export function createThrallHost(deps) {
  setThrallPlayer(deps.playerEntity);
  const party = thrallParty();
  const ashore = createCrewAshore({
    party: () => /** @type {any} */ (party),
    place: deps.place,
    leader: deps.leader,
    now: deps.now,
    onStood: (c, rec) => {
      const sv = c.thrall, e = rec.entity;
      if (!sv || !e) return;
      // its expertise: the blood's quality adds up to half again to its health - whole the first time, the layer's after
      const whole = Math.max(1, Math.round((Number(e.maxHealth) || 1) * (1 + (sv.quality ?? 0) / 200)));
      e.maxHealth = whole;
      e.health = sv.health != null ? Math.max(1, Math.min(whole, sv.health)) : whole;
      sv.maxHealth = whole;
      try { applySwornGear(e, /** @type {any} */ (gearRecord(sv))); } catch { /* a kit is no stand's failure */ }
    },
  });
  return {
    /** One frame (the host's companion frame; never under a window). */
    tick() {
      try { ashore.frame(); } catch (e) { console.warn('[thralls] the follower', e?.message ?? e); }
      for (const line of takeThrallLines()) deps.say(line);
    },
    clear: () => ashore.clear(),
    bodies: () => ashore.bodies(),
    capsules: () => ashore.capsules(),
    isThrall: (rec) => isThrallKey(rec?.companion),
  };
}
