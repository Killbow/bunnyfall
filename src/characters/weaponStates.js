// Weapon state machine and swing timing data from Daggerfall Unity's WeaponManager and FPSWeapon.

export const WEAPON_STATES = ['Idle', 'StrikeDown', 'StrikeDownLeft', 'StrikeLeft', 'StrikeRight', 'StrikeDownRight', 'StrikeUp'];

export const CLASSIC_FRAME_UPDATE = 980;
export const CLASSIC_UPDATE_INTERVAL = 0.0625;
export function getMeleeWeaponAnimTime(liveSpeed, ctx = null) {
  const t = meleeAnimTime(liveSpeed, ctx);
  if (!_burden || !ctx?.entity) return t;
  let k = 1;
  try { const v = _burden(ctx); if (Number.isFinite(v) && v > 0) k = v; } catch { }
  return k === 1 ? t : Math.max(SWING_FRAME_MIN, Math.min(SWING_FRAME_MAX, t * k));
}
let _burden = null;
export function registerSwingBurden(fn) { _burden = typeof fn === 'function' ? fn : null; }
function meleeAnimTime(liveSpeed, ctx) {
  const o = _animTimeOverride?.(liveSpeed, ctx, CLASSIC_FRAME_UPDATE);
  if (o != null) return paced(o, ctx, null);
  if (ctx?.entity) {
    const w = _swingReader?.(ctx) ?? null;
    return paced(swingFrameSeconds(liveSpeed, {
      heft: w ? swingHeft(w.weight, w.strength) : 1,
      handling: swingHandling(ctx.weaponType, !!w?.twoHanded, !!w?.shortBlade),
    }), ctx, w);
  }
  return (3 * (115 - liveSpeed)) / CLASSIC_FRAME_UPDATE;
}

export const SWING_BASE_FRAME = (3 * (115 - 50)) / CLASSIC_FRAME_UPDATE;
export const SWING_TEMPO_AT_0 = 1.4;
export const SWING_TEMPO_AT_100 = 0.6;
export function swingTempo(speed) {
  const s = Math.max(0, Math.min(100, Number.isFinite(speed) ? speed : 50));
  return 1 + ((50 - s) / 100) * (SWING_TEMPO_AT_0 - SWING_TEMPO_AT_100);
}
export const SWING_HEFT_FREE_KG = 2.5;
export const SWING_HEFT_PER_KG = 0.045;
export const SWING_HEFT_MAX = 0.35;
export function swingHeft(weightKg, strength) {
  const w = Math.max(0, Number.isFinite(weightKg) ? weightKg : 0);
  const str = Math.max(0, Math.min(100, Number.isFinite(strength) ? strength : 50));
  const load = (w * (150 - str)) / 100;
  return 1 + Math.min(SWING_HEFT_MAX, Math.max(0, (load - SWING_HEFT_FREE_KG) * SWING_HEFT_PER_KG));
}
export const SWING_HANDLING = Object.freeze({
  0: 1, 1: 1,
  2: 0.97, 3: 0.97,
  4: 0.9, 5: 0.9,
  6: 1.03, 7: 1.03,
  8: 1.05, 9: 1.05,
  10: 1.06, 11: 1.06,
  12: 1.05, 13: 1.05,
  15: 0.9,
  16: 0.9,
});
export const SWING_TWO_HANDED = 1.06;
export const SWING_SHORT_BLADE = SWING_HANDLING[4];
export const swingHandling = (weaponType, twoHanded = false, shortBlade = false) => (shortBlade ? SWING_SHORT_BLADE : (SWING_HANDLING[weaponType] ?? 1)) * (twoHanded ? SWING_TWO_HANDED : 1);
export const SWING_FRAME_MIN = 0.09;
export const SWING_FRAME_MAX = 0.4;
export function swingFrameSeconds(speed, { heft = 1, handling = 1 } = {}) {
  return Math.max(SWING_FRAME_MIN, Math.min(SWING_FRAME_MAX, SWING_BASE_FRAME * swingTempo(speed) * heft * handling));
}
export const SWING_PACE_MOST = 50;
/** @type {Array<[string, (ctx: any, w: any) => number]>} */
let _pace = [];
export function registerSwingPaceMod(name, fn) {
  _pace = _pace.filter(([n]) => n !== name);
  if (typeof fn === 'function') _pace.push([name, fn]);
}
export function swingPacePct(ctx, w = null) {
  if (!ctx?.entity || _pace.length === 0) return 0;
  let pct = 0;
  for (let i = 0; i < _pace.length; i++) {
    try { const v = _pace[i][1](ctx, w); if (Number.isFinite(v) && v > 0) pct += v; } catch { }
  }
  return Math.min(SWING_PACE_MOST, pct);
}
function paced(t, ctx, w) {
  if (!ctx?.entity || _pace.length === 0 || !(t > 0)) return t;
  const pct = swingPacePct(ctx, w);
  return pct > 0 ? Math.max(SWING_FRAME_MIN, t / (1 + pct / 100)) : t;
}

let _swingReader = null;
export function registerSwingReader(fn) { _swingReader = typeof fn === 'function' ? fn : null; }
let _animTimeOverride = null;
export function registerMeleeWeaponAnimTime(fn) { _animTimeOverride = typeof fn === 'function' ? fn : null; }
export function getBowCooldownTime(liveSpeed) {
  return (10 * (100 - liveSpeed) + 800) / CLASSIC_FRAME_UPDATE;
}

export const MAX_GESTURE_SECONDS = 1.0;
export const MAX_BOW_HELD_DRAWN_SECONDS = 10;
export const BOW_SWITCH_DIVISOR = 1.7;
export const RESET_JOYSTICK_SWING_RADIUS = 0.4;
export const ATTACK_THRESHOLD = 0.05;
export const ARROW_ARM_LENGTH = 0.9;
export const EQUIP_DELAY_TIMES = [500, 700, 1200, 900, 900, 1800, 1600, 1700, 1700, 3000, 3400, 2000, 2200, 2000, 2200, 2000, 4000, 5000];

export const MELEE_NUM_FRAMES = { Idle: 1, StrikeDown: 5, StrikeDownLeft: 5, StrikeLeft: 5, StrikeRight: 5, StrikeDownRight: 5, StrikeUp: 5 };
export const HIT_FRAME_MELEE = 2;
export const MELEE_HIT_SHARE = HIT_FRAME_MELEE / MELEE_NUM_FRAMES.StrikeDown;
export const HIT_FRAME_BOW = 5;
export const BOW_SOUND_FRAME = 4;
export const BOW_DRAWN_HOLD_FRAME = 3;
export const BOW_NUM_FRAMES = { Idle: 1, StrikeUp: 4, StrikeDown: 7 };

export const LEFT_UNARMED_ANIMS = Object.freeze([1, 2, 3, 4, 0]);

export const CLICK_ATTACK_DIRECTIONS = Object.freeze(['UpRight', 'Left', 'Right', 'DownLeft', 'Down', 'DownRight']);

export function gestureDirection(angleDeg) {
  let a = angleDeg % 360; if (a < 0) a += 360;
  const s = Math.ceil(a / 15);
  if (s <= 1 || s === 24 || s === 0) return 'Right';
  if (s <= 11) return 'Up';
  if (s <= 13) return 'Left';
  if (s <= 17) return 'DownLeft';
  if (s <= 19) return 'Down';
  return 'DownRight';
}

export function canChangeState(isBow, currentState, nextState) {
  if (currentState === 'Idle') return true;
  return isBow && currentState === 'StrikeUp' && nextState === 'StrikeDown';
}

export function createWeaponMachine(isBow, isUnarmed = false) {
  return { isBow, isUnarmed, ranged: isBow, frames: null, tick: null, cooldown: null, hitFrame: null, state: 'Idle', frame: 0, ticks: 0, acc: 0, cooldownUntil: 0, now: 0, bowIdleDrawn: false, animIndex: 0, damageDone: false, hold: 0 };
}

export function machineAttack(m, strikeState) {
  if (m.now < m.cooldownUntil) return false;
  if (!canChangeState(m.isBow, m.state, strikeState)) return false;
  m.state = strikeState;
  if (!m.isBow || strikeState === 'Idle') { m.frame = 0; m.ticks = 0; }
  m.acc = 0;
  m.animIndex = 0; m.damageDone = false;
  m.hold = 0;
  return true;
}

export function machineCancelBowDraw(m, liveSpeed = 50) {
  if (m.isBow && m.state === 'StrikeUp') {
    m.state = 'Idle'; m.frame = 0; m.ticks = 0; m.acc = 0;
    m.cooldownUntil = m.now + getBowCooldownTime(liveSpeed);
    return true;
  }
  return false;
}

/** @returns {{ seconds: number, hitAt: number, step: number } | null} */
export function blowSchedule(m, liveSpeed, animCtx = null, dt = 0, tempo = 1) {
  if (!m || m.state === 'Idle' || (m.ranged ?? m.isBow)) return null;
  const tick = (m.tick ?? getMeleeWeaponAnimTime(liveSpeed, animCtx)) / tempo;
  if (!(tick > 0) || !Number.isFinite(tick)) return null;
  const step = dt > 0 ? Math.max(1, Math.ceil(tick / dt - 1e-9)) * dt : tick;
  if (m.isUnarmed && m.state === 'StrikeLeft') {
    return { seconds: LEFT_UNARMED_ANIMS.length * step, hitAt: (LEFT_UNARMED_ANIMS.indexOf(HIT_FRAME_MELEE) + 1) * step, step };
  }
  const at = Math.max(0, m.frame | 0);
  return { seconds: (strikeTicks(m) + holdOf(m)) * step, hitAt: Math.max(0, (m.hitFrame ?? HIT_FRAME_MELEE) - at) * step, step };
}

export function strikeTicks(m) {
  if (m.isUnarmed && m.state === 'StrikeLeft') return LEFT_UNARMED_ANIMS.length;
  const frames = (m.frames ?? MELEE_NUM_FRAMES)[m.state] ?? 5;
  return Math.max(0, frames - Math.max(0, m.frame | 0));
}
const holdOf = (m) => (m.hold > 0 ? m.hold | 0 : 0);

export function machineStep(m, dt, liveSpeed, animCtx = null, tempo = 1) {
  m.now += dt;
  const events = [];
  if (m.state === 'Idle') {
    const rest = m.isBow && m.bowIdleDrawn ? BOW_DRAWN_HOLD_FRAME : 0;
    if (m.isBow && m.frame !== rest && m.now >= m.cooldownUntil) {
      m.acc += dt;
      if (m.acc >= CLASSIC_UPDATE_INTERVAL) { m.acc = 0; m.frame = rest; }
    }
    return events;
  }
  const frames = (m.frames ?? (m.isBow ? BOW_NUM_FRAMES : MELEE_NUM_FRAMES))[m.state] ?? 5;
  const tick = m.isBow ? (m.tick ?? CLASSIC_UPDATE_INTERVAL) : (m.tick ?? getMeleeWeaponAnimTime(liveSpeed, animCtx)) / tempo;
  m.acc += dt;
  while (m.acc >= tick) {
    m.acc = m.tick == null ? 0 : m.acc - tick;
    if (m.isUnarmed && m.state === 'StrikeLeft') {
      m.frame = LEFT_UNARMED_ANIMS[m.animIndex++];
      if (m.frame === HIT_FRAME_MELEE && !m.damageDone) { events.push('hit'); m.damageDone = true; }
      if (m.animIndex >= LEFT_UNARMED_ANIMS.length) {
        m.state = 'Idle'; m.frame = 0; m.ticks = 0; m.animIndex = 0; m.damageDone = false;
        events.push('done');
        break;
      }
    } else if (m.isBow && m.state === 'StrikeUp') {
      if (m.frame < frames - 1) m.frame++;
      m.ticks++;
      if (m.ticks * tick > MAX_BOW_HELD_DRAWN_SECONDS) { machineCancelBowDraw(m, liveSpeed); events.push('undraw'); break; }
    } else {
      if (m.hold > 0 && m.frame >= frames - 1) { m.hold -= 1; continue; }
      m.frame++;
      if (m.frame === (m.isBow ? BOW_SOUND_FRAME : -1)) events.push('bowSound');
      if (m.frame === (m.hitFrame ?? (m.isBow ? HIT_FRAME_BOW : HIT_FRAME_MELEE))) events.push('hit');
      if (m.frame >= frames) {
        m.state = 'Idle'; m.frame = 0; m.ticks = 0;
        events.push('done');
        if (m.ranged ?? m.isBow) m.cooldownUntil = m.now + (m.cooldown ?? getBowCooldownTime(liveSpeed));
        break;
      }
    }
  }
  return events;
}
