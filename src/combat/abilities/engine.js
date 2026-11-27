import { abilityById } from './registry.js';
import { learnedAbility } from './progress.js';
import { racialKey } from './racialProfiles.js';

const blockedActor = (ctx) => !ctx?.enabled || ctx.online || ctx.duel || ctx.entity?.peer || ctx.entity?._mentor || ctx.entity?.isInBeastForm;

export const CAPSTONE_RECOVERY_MS = 28000;
const isCapstone = ability => ability?.rank === 100 && (ability.category === 'weapon' || ability.category === 'combination');

function refusal(ability, delivery, ctx) {
  if (!ability) return 'unknown';
  if (blockedActor(ctx)) return 'unavailable';
  if (ability.race && ability.race !== racialKey(ctx.entity)) return 'race';
  if (!learnedAbility(ctx.entity, ability.id)) return 'locked';
  if (!delivery) return 'unavailable';
  if (ability.templates && !ability.templates.includes(ctx.weapon?.templateIndex ?? 'bare')) return 'weapon';
  if (delivery.equipment && (delivery.equipment === 'ranged') !== ctx.ranged) return 'weapon';
  if (ctx.weapon?.werecreatureClaws || !ctx.ready || ctx.interrupted) return 'busy';
  if (delivery.requiresLink && ctx.rig?.link?.id !== ability.id) return 'followup';
  if (delivery.stance && !ctx.canPlant) return 'stance';
  if (!Number.isFinite(ctx.fatigue) || ctx.fatigue < delivery.fatigue) return 'fatigue';
  if (delivery.ammo && !(ctx.ammo >= delivery.ammo)) return 'ammo';
  return null;
}

export const ABILITY_REFUSAL = Object.freeze({
  unknown: 'Unknown ability',
  unavailable: 'This ability is unavailable here',
  locked: 'You have not learned this ability',
  race: 'This ability belongs to a different race',
  weapon: 'Equip a compatible weapon',
  busy: 'Your hands are busy',
  stance: 'Stay planted and steady until release',
  anchor: 'Set a Wayfarer’s Anchor first',
  fatigue: 'You need more fatigue',
  ammo: 'You need more ammunition',
  cooldown: 'This ability is recovering',
  combat: 'Use Trailblazer away from enemies',
  followup: 'Land the ranged opener before using the follow-up',
});

export function createAbilityEngine({ deliveryFor, reserve, release, canRepeat = () => false, event = () => {} }) {
  let time = 0;
  let cast = null;
  let nextId = 0;
  const cooldowns = new Map();
  let capstoneReady = 0;
  const cooldown = id => Math.max(0, (cooldowns.get(id) ?? 0) - time,
    isCapstone(abilityById(id)) ? capstoneReady - time : 0);
  const shortenCooldown = (id, remaining) => {
    if (cooldowns.has(id)) cooldowns.set(id, Math.min(cooldowns.get(id), time + remaining));
  };

  function cancel() {
    if (!cast) return;
    const interrupted = cast;
    cast = null;
    event('cancel', interrupted);
  }

  function request(id, ctx) {
    const ability = abilityById(id);
    const delivery = ability ? deliveryFor(ability.id, ctx) : null;
    const why = refusal(ability, delivery, ctx) ?? (cast ? 'busy' : cooldown(id) > 0 && !canRepeat(id, ctx) ? 'cooldown' : null);
    if (why) return { ok: false, why };
    cast = {
      id: ++nextId, ability, delivery, acceptedAt: time, releaseAt: time + delivery.windUpMs,
      weapon: ctx.weapon, owner: ctx.owner, phase: 'wind-up', impact: 0,
    };
    event('wind-up', cast);
    return { ok: true, castId: cast.id };
  }

  function step(dt, ctx) {
    time += Number.isFinite(dt) && dt > 0 ? Math.min(dt, 250) : 0;
    if (!cast) return;
    if (blockedActor(ctx) || ctx.interrupted || ctx.owner !== cast.owner || ctx.weapon !== cast.weapon) {
      cancel();
      return;
    }
    const { ability, delivery } = cast;
    if (cast.phase === 'wind-up' && time >= cast.releaseAt) {
      if (refusal(ability, delivery, ctx)) { cancel(); return; }
      const refund = reserve(delivery, ctx);
      if (!refund) { cancel(); return; }
      let started = false;
      try { started = release(cast, ctx) === true; }
      catch (error) { console.warn('[ability] release failed', ability.id, error); }
      finally {
        if (!started) {
          refund();
          cancel();
        }
      }
      if (!started) return;
      cast.phase = 'active';
      cast.releasedAt = time;
      cooldowns.set(ability.id, cast.acceptedAt + delivery.cooldownMs);
      if (isCapstone(ability) && !delivery.requiresLink) capstoneReady = cast.acceptedAt + CAPSTONE_RECOVERY_MS;
      event('release', cast);
    }
    if (cast.phase === 'wind-up') return;
    const elapsed = time - cast.releasedAt;
    while (cast.impact < delivery.impactsMs.length && elapsed >= delivery.impactsMs[cast.impact]) {
      const beat = cast.impact++;
      event('impact-cue', cast, beat);
    }
    if (cast.phase === 'active' && elapsed >= delivery.activeMs) {
      cast.phase = 'recovery';
      event('recovery', cast);
    }
    if (elapsed >= delivery.activeMs + delivery.recoveryMs) {
      const completed = cast;
      cast = null;
      event('done', completed);
    }
  }

  return { request, step, cancel, cooldown, shortenCooldown, busy: () => !!cast, windingUp: () => cast?.phase === 'wind-up' };
}
