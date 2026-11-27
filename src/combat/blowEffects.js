// @ts-check
import { tacticsNow } from '../ai/tacticsClock.js';
import { markPlayerHarm, HARM_MARK_STRUCK_MS } from './harmMark.js';

export const BLOW_EFFECT = Object.freeze({
  PUSH: Object.freeze({ lunge: 3, charge: 5 }),
  RATTLE: Object.freeze(['slam', 'ring', 'leap']),
  RATTLE_S: 0.6,
  RATTLE_WALK: 0.6,
  RATTLE_SHAKE: 0.5,
  BLEED: Object.freeze(['sweep']),
  BLEED_SHARE: 0.3,
  BLEED_TICKS: 3,
  BLEED_EVERY: 1,
  KNOCKDOWN: Object.freeze(['slam', 'ring', 'charge']),
  KNOCKDOWN_S: 0.9,
  KNOCKDOWN_GUARD: 5,
  KNOCKDOWN_DROP: 0.6,
});

export function blowEffectOf(kind, iron = false) {
  return {
    push: BLOW_EFFECT.PUSH[kind] ?? 0,
    rattle: BLOW_EFFECT.RATTLE.includes(kind),
    bleed: BLOW_EFFECT.BLEED.includes(kind),
    knockdown: !!iron && BLOW_EFFECT.KNOCKDOWN.includes(kind),
  };
}

/** @type {{ fx: ReturnType<typeof blowEffectOf>, dmg: number, dir: number[] | null, foe: any }[]} */
const _queue = [];
export function queueBlowEffect(fx, dmg, dir, foe) {
  if (fx) _queue.push({ fx, dmg, dir, foe });
}

let _downUntil = -Infinity, _guardUntil = -Infinity, _downMotor = null;
// A placement such as a load or teleport stands the motor up early; the clock bounds the knockdown either way.
export const knockedDown = (now = tacticsNow()) => now < _downUntil && (_downMotor?.isDown?.() ?? true);

export function drainBlowEffects({ motor = null, entity = null, shake = null, now = tacticsNow() } = {}) {
  if (entity && !(entity.health > 0)) { _queue.length = 0; return; }
  while (_queue.length) {
    const { fx, dmg, dir, foe } = /** @type {any} */ (_queue.shift());
    // A motor that cannot go down, such as while climbing or swimming, returns false and the blow pushes instead.
    if (fx.knockdown && now >= _guardUntil && motor?.blowKnockDown?.(BLOW_EFFECT.KNOCKDOWN_S, BLOW_EFFECT.KNOCKDOWN_DROP) !== false) {
      _downUntil = now + BLOW_EFFECT.KNOCKDOWN_S; _guardUntil = _downUntil + BLOW_EFFECT.KNOCKDOWN_GUARD; _downMotor = motor;
    } else if (fx.push > 0 && dir) {
      const l = Math.hypot(dir[0], dir[1]);
      if (l > 0) motor?.blowPush?.((dir[0] / l) * fx.push, (dir[1] / l) * fx.push);
    }
    if (fx.rattle) { motor?.blowRattle?.(BLOW_EFFECT.RATTLE_S, BLOW_EFFECT.RATTLE_WALK); shake?.(BLOW_EFFECT.RATTLE_SHAKE); }
    if (fx.bleed && entity && dmg > 0) startBleed(entity, dmg * BLOW_EFFECT.BLEED_SHARE, foe, now);
  }
}

export function startBleed(entity, total, foe, now = tacticsNow()) {
  if (!(entity?.health > 0)) return;
  const b = entity.bleed;
  const left = b ? b.per * b.left : 0;
  entity.bleed = { per: (left + total) / BLOW_EFFECT.BLEED_TICKS, left: BLOW_EFFECT.BLEED_TICKS, next: now + BLOW_EFFECT.BLEED_EVERY, health: entity.health, foe };
}
export function tickBleed(entity, hurt, now = tacticsNow()) {
  const b = entity?.bleed;
  if (!b) return 0;
  if (entity.health > b.health || !(entity.health > 0)) { entity.bleed = null; return 0; }
  let dealt = 0;
  while (entity.bleed && now >= b.next && b.left > 0) {
    const rem = b.per * b.left;
    const n = Math.round(rem / b.left);
    if (n > 0) {
      if (b.foe) markPlayerHarm(b.foe, { ms: HARM_MARK_STRUCK_MS });
      hurt(n);
      dealt += n;
    }
    b.left--; b.next += BLOW_EFFECT.BLEED_EVERY;
    b.per = b.left > 0 ? (rem - n) / b.left : 0;
    b.health = entity.health;
    if (b.left <= 0 || !(entity.health > 0)) entity.bleed = null;
  }
  return dealt;
}

export function resetBlowEffects(entity = null) {
  _queue.length = 0; _downUntil = -Infinity; _guardUntil = -Infinity; _downMotor = null;
  if (entity) entity.bleed = null;
}
export function _resetBlowEffectsForTests() { resetBlowEffects(); }
