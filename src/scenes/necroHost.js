// @ts-check
// BUNNYFALL (2026-11-06): CHEB'S NECROMANCY - THE MINIONS IN THE WORLD. The raised (systems/necromancy/necromancy.js
// necroParty) stood by the companion layer (scenes/crewAshore.js) - the one the crew and the sworn revenants walk with:
// every place, every door and fast travel (the mod's record-and-restore over transitions), the heel and the catch-up
// (its UndeadMinion follow brain), fighting as the player's allies, and drawn for everyone in the room as every
// companion is (the street's snapshot and the dungeon's lane name a companion; exteriorFoes.js / dungeonContext.js).
//   - A MINION STANDS at the mod's strength: its health the mod's sum or the creature's own, the more (necroLaw.js says
//     why), whole the first time it rises and as it left the last place after; a skeleton's or a zombie's mace in hand.
//   - ITS HEALTH RUN OUT, it is gone for good (the party's knock), through the layer's portal.
//   - RECALL MINIONS: every one stood at the caster's side at once (RecallMinionsEffect.cs RecallMinions), the motor
//     stood afresh there as the layer's own catch-up does.
// The host wires one (world.js) beside its sworn: its frame, its clear, its bodies.
import { createCrewAshore } from './crewAshore.js';
import { necroParty, takeRecall, setNecroSay, setGraveRobber, isMinionKey } from '../systems/necromancy/necromancy.js';
import { companionSlot } from '../systems/naval/crewCompanions.js';
import { mintCondition, setItemFields } from '../systems/item/itemTemplates.js';
import { equipTableOf, EQUIP_SLOTS } from '../systems/equip.js';

const MACE = 124;

/**
 * @param {{ place: () => any, leader: () => ({ feet: number[], yaw: number, grounded?: boolean } | null), now: () => number,
 *   say: (s: string) => void, playerEntity: any }} deps
 */
export function createNecroHost(deps) {
  setNecroSay(deps.say);
  setGraveRobber(deps.playerEntity);
  const party = necroParty();
  const ashore = createCrewAshore({
    party: () => party,
    place: deps.place,
    leader: deps.leader,
    now: deps.now,
    onStood: (c, rec) => {
      const m = c.minion, e = rec.entity;
      rec.necroMinion = m?.id ?? null;
      if (!m || !e) return;
      // its strength: the mod's health or the creature's own, the more - whole the first time (the layer carries it after)
      const whole = Math.max(Number(e.maxHealth) || 1, Number(m.maxHealth) || 1);
      e.maxHealth = whole;
      e.health = m.health != null ? Math.max(1, Math.min(whole, m.health)) : whole;
      if (m.maxHealth !== whole) { m.maxHealth = whole; }
      // a skeleton's or a zombie's mace, its metal by the mod's factor
      if (m.mace != null) {
        try {
          const mace = mintCondition(setItemFields({ group: 'Weapons', templateIndex: MACE, material: m.mace, flags: 0 }));
          const t = equipTableOf(e);
          if (t && !t[EQUIP_SLOTS.RightHand]) { e.items = [...(e.items ?? []), mace]; mace.equipSlot = EQUIP_SLOTS.RightHand; t[EQUIP_SLOTS.RightHand] = mace; }
        } catch { /* a mace is no stand's failure */ }
      }
    },
  });
  /** Recall Minions: every body stood behind the caster now. */
  function recall() {
    const L = deps.leader();
    const place = deps.place();
    if (!L || !place) return;
    const bodies = ashore.bodies();
    bodies.forEach((rec, i) => {
      const f = rec.ai?.feet;
      if (!f || rec.dead) return;
      const [dx, dz] = companionSlot(L.yaw, i, bodies.length);
      const at = place.spot ? place.spot(L.feet, dx, dz) : [L.feet[0] + dx, L.feet[1], L.feet[2] + dz];
      const from = [f[0], f[1], f[2]];
      f[0] = at[0]; f[1] = at[1]; f[2] = at[2];
      try { place.fx?.jump?.(rec, from); } catch { /* no portal, the step all the same */ }
      if (typeof rec.ai.resumeLive === 'function') rec.ai.resumeLive();
      else { rec.ai.target = null; rec.ai.path = null; rec.ai.velY = 0; }
    });
    deps.say(bodies.length ? 'Your minions answer the call.' : 'Your minions cannot hear you here.');
  }
  return {
    /** One frame (the host's companion frame; never under a window). */
    tick() {
      try { ashore.frame(); } catch (e) { console.warn('[necromancy] the minions', e?.message ?? e); }
      if (takeRecall()) recall();
    },
    clear: () => ashore.clear(),
    bodies: () => ashore.bodies(),
    capsules: () => ashore.capsules(),
    isMinion: (rec) => isMinionKey(rec?.companion),
  };
}
