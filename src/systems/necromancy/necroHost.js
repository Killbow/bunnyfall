// @ts-check
import { createCrewAshore } from '../naval/crewAshore.js';
import { necroParty, takeRecall, takePartings, setNecroSay, setGraveRobber, isMinionKey } from './necromancy.js';
import { companionSlot } from '../naval/crewCompanions.js';
import { mintCondition, setItemFields } from '../../items/itemTemplates.js';
import { equipTableOf, EQUIP_SLOTS } from '../../characters/equip.js';
import { t } from '../../ui/textManager.js';

const MACE = 124;

/**
 * @param {{ place: () => any, leader: () => ({ feet: number[], yaw: number, grounded?: boolean } | null), now: () => number,
 *   say: (s: string) => void, playerEntity: any }} deps
 */
export function createNecroHost(deps) {
  setNecroSay(deps.say);
  setGraveRobber(deps.playerEntity);
  const party = necroParty();
  const ashore = createCrewAshore(/** @type {any} */ ({
    party: () => party,
    place: deps.place,
    leader: deps.leader,
    now: deps.now,
    onLeftBehind: (cs) => deps.say(t('necro.waitBehind', '{n, plural, one {Your {name} stays behind. Call it from the Companions page.} other {Your # minions stay behind. Call them from the Companions page.}}', { n: cs.length, name: String(cs[0].title ?? '').toLowerCase() })),
    onStood: (c, rec) => {
      const m = c.minion, e = rec.entity;
      rec.necroMinion = m?.id ?? null;
      if (!m || !e) return;
      // Max health is the higher of the mod value and the creature health, since enemies here outscale the mod.
      const whole = Math.max(Number(e.maxHealth) || 1, Number(m.maxHealth) || 1);
      e.maxHealth = whole;
      e.health = m.health != null ? Math.max(1, Math.min(whole, m.health)) : whole;
      if (m.maxHealth !== whole) { m.maxHealth = whole; }
      if (m.mace != null) {
        try {
          const mace = mintCondition(setItemFields({ group: 'Weapons', templateIndex: MACE, material: m.mace, flags: 0 }));
          const t = equipTableOf(e);
          if (t && !t[EQUIP_SLOTS.RightHand]) { e.items = [...(e.items ?? []), mace]; mace.equipSlot = EQUIP_SLOTS.RightHand; t[EQUIP_SLOTS.RightHand] = mace; }
        } catch { }
      }
    },
  }));
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
      try { place.fx?.jump?.(rec, from); } catch { }
      if (typeof rec.ai.resumeLive === 'function') rec.ai.resumeLive();
      else { rec.ai.target = null; rec.ai.path = null; rec.ai.velY = 0; }
    });
    deps.say(bodies.length ? 'Your minions answer the call.' : 'Your minions cannot hear you here.');
  }
  return {
    tick() {
      try { ashore.frame(); } catch (e) { console.warn('[necromancy] the minions', e?.message ?? e); }
      if (takeRecall()) recall();
      for (const line of takePartings()) deps.say(line);
    },
    clear: () => ashore.clear(),
    bodies: () => ashore.bodies(),
    capsules: () => ashore.capsules(),
    isMinion: (rec) => isMinionKey(rec?.companion),
  };
}
