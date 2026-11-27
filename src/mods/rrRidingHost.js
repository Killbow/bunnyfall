// Roleplay & Realism's riding trample and charge contacts, shared by both world hosts,
// which pass their reads in as deps.

import { rrRidingSetting, rrTrampleOutcome, rrChargeDamage, RR_RIDING } from './rrRealism.js';
import { GENDERS } from '../characters/nameHelper.js';
import { SOUND } from '../audio/soundClips.js';
import { CRIMES } from '../justice/court.js';
import { FATIGUE_LOSS, FATIGUE_DRAIN_SCALE, liveStat } from '../characters/statMods.js';
import { handToHandMinDamage, handToHandMaxDamage } from '../combat/formulas.js';
import { skillValue, SKILLS } from '../characters/skills.js';
import { RIDING_VOLUME_SCALE } from '../travel/riding.js';

export const RR_TRAMPLE_REACH = 0.9;

export function createRrRidingContacts({
  playerEntity, feet, yaw, livePersons, foes, guards, isGuardRecord, splashBlood, playClip, ridingVolumeScale = () => RIDING_VOLUME_SCALE,
  spawnGuards, spawnCityGuard, setCrime, retire, hurtGuard, damageFoe, voice = () => null, playVoice = (f, v) => playClip(v.clip, 1), rolls = Math.random,
}) {
  const forward = () => { const y = yaw(); return [Math.sin(y), 0, Math.cos(y)]; };
  let lastAt = null;
  function moveDirection(at) {
    const prev = lastAt; lastAt = [...at];
    if (!prev) return forward();
    const dx = at[0] - prev[0], dz = at[2] - prev[2];
    const len = Math.hypot(dx, dz);
    return len > 1e-6 ? [dx / len, 0, dz / len] : forward();
  }
  function chargeFoe(f, direction) {
    const latch = f?.entity ?? f;
    if (!f || latch.pickpocketAttempted) return false;
    latch.pickpocketAttempted = true;
    const v = voice(f);
    if (v && v.clip >= 0) playVoice(f, v);
    if (f.ai) { f.ai.knockbackSpeed = RR_RIDING.chargeKnockback; f.ai.knockbackDir = [...direction]; }
    playerEntity.fatigue = Math.max(0, (playerEntity.fatigue ?? 0) - Math.trunc(FATIGUE_LOSS.Default * RR_RIDING.chargeFatigueMultiplier * FATIGUE_DRAIN_SCALE));
    const h2h = skillValue(playerEntity, SKILLS.HandToHand);
    const damage = rrChargeDamage({ minBase: handToHandMinDamage(h2h), maxBase: handToHandMaxDamage(h2h), agility: liveStat(playerEntity, 'agility'), willpower: liveStat(playerEntity, 'willpower'), roll: rolls() });
    const at = feet();
    if (isGuardRecord(f)) hurtGuard(f, damage, at);
    else damageFoe(f, damage, at);
    return true;
  }
  function contacts() {
    const at = feet();
    if (!at) return;
    const fwd = forward();
    const reach2 = RR_TRAMPLE_REACH * RR_TRAMPLE_REACH;
    if (rrRidingSetting('TrampleCivilians') === true) {
      for (const seat of livePersons()) {
        const person = seat.person;
        if (!person || person.trampled || !seat.pos) continue;
        const dx = seat.pos[0] - at[0], dz = seat.pos[2] - at[2];
        if (dx * dx + dz * dz > reach2) continue;
        const out = rrTrampleOutcome({ isGuard: !!person.guard, female: person.gender === GENDERS.Female });
        if (out.blood) splashBlood([at[0] + fwd[0] * 2, at[1] + 1, at[2] + fwd[2] * 2], fwd);
        if (out.clip) playClip(SOUND[out.clip], ridingVolumeScale());
        if (out.spawnGuards) spawnGuards();
        const from = person.living ?? null;
        if (out.chargeGuard) Promise.resolve(spawnCityGuard([...seat.pos], person.facingYaw ?? yaw(), [...at])).then((g) => { if (g) { g.livingFrom = from; chargeFoe(g, fwd); } }).catch((e) => console.error('[guards]', e));
        setCrime(CRIMES[out.crime]);
        if (out.remove) { person.trampled = true; retire(person); }
      }
    }
    const move = moveDirection(at);
    for (const f of [...foes(), ...guards()]) {
      if (f.dead || f.puppet || (f.entity ?? f).pickpocketAttempted || !f.ai?.feet) continue;
      const dx = f.ai.feet[0] - at[0], dz = f.ai.feet[2] - at[2];
      if (dx * dx + dz * dz > reach2) continue;
      chargeFoe(f, move);
    }
  }
  return { contacts, chargeFoe };
}
