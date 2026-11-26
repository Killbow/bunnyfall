// @ts-check
import { ATTACK_BY_ID, ATTACKS, BOSS_H, LEAP_AIR_MS, CROSS_AIR_MS, airOf, leapAt, profileOf, isDagons, HOST, HOST_KINDS, HOST_RISE_MS, hostAt, HALF } from '../net/gateBrain.js';
import { HIT_CAP_X, dpsRef, LV_MAX } from '../net/gateBrain.js';
import { EG_BUCKET_X_MAX } from '../net/eliteGates/egVestige.js';
import { bossAt } from '../net/gateLink.js';
import { telegraphAt, chargeHead, hostTelegraphAt } from '../net/gateStrike.js';
import {
  MOVE_ANIMS, PRIMARY_ATTACK_ANIMS, HURT_ANIMS, IDLE_ANIMS, mobileOrientation,
  MOVE_ANIM_SPEED, IDLE_ANIM_SPEED, PRIMARY_ATTACK_ANIM_SPEED,
  FLY_ANIM_SPEED, HURT_ANIM_SPEED, SEDUCER_IDLE_MOVE_ANIMS, SEDUCER_ATTACK_ANIMS,
  stateAnims,
} from '../characters/mobileUnit.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { t } from '../ui/textManager.js';
import { makeEnemyEntity } from '../characters/enemyEntity.js';
import { courtToDungeon } from './gateArena.js';
import { hitFlashStrength } from '../combat/hitFlash.js';
import { fxBurstOf } from '../render/gateFx.js';

export const BOSS_LOOKS = Object.freeze({ ruhn: Object.freeze({ mobile: 31, scale: 3 }) });
export const bossLookOf = (id) => BOSS_LOOKS[id] ?? BOSS_LOOKS.ruhn;
export const FLAME_LOOKS = Object.freeze({ burning: 35, rime: 38, storm: 36, venom: 37 });
export const flameLookOf = (aspectId) => Object.freeze({ mobile: FLAME_LOOKS[aspectId] ?? FLAME_LOOKS.burning, scale: BOSS_LOOKS.ruhn.scale });
export const HALF_NAMES = Object.freeze({
  blade: (boss) => t('gate.sunder.blade', "{boss}'s Blade", { boss }),
  burning: (boss) => t('gate.sunder.flame', "{boss}'s Flame", { boss }),
  rime: (boss) => t('gate.sunder.rime', "{boss}'s Rime", { boss }),
  storm: (boss) => t('gate.sunder.storm', "{boss}'s Storm", { boss }),
  venom: (boss) => t('gate.sunder.venom', "{boss}'s Venom", { boss }),
});
export const halfName = (b, P, name) => {
  const boss = String(name ?? '').trim().split(/\s+/).pop() || 'Ruhn';
  return (b === HALF.flame ? HALF_NAMES[P?.aspect?.id] ?? HALF_NAMES.burning : HALF_NAMES.blade)(boss);
};

export const BOSS_ARMOR = 60;
// The largest blow any relay accepts, so a Disintegrate (damage equal to remaining health) passes every wire
// validator. It must stay under the smallest wire ceiling, the 10,000 of `validArenaIn`.
export const STAND_IN_WHOLE = HIT_CAP_X * dpsRef(LV_MAX) * EG_BUCKET_X_MAX;
/**
 * @param {any} e
 * @param {number} lv
 */
export function standInBlowCap(e, lv) {
  let bx = 1;
  try { bx = typeof e?.relayBlowX === 'function' ? Number(e.relayBlowX()) : 1; } catch { bx = 1; }
  return HIT_CAP_X * dpsRef(lv) * (Number.isFinite(bx) ? Math.max(1, Math.min(EG_BUCKET_X_MAX, bx)) : 1);
}
export function bossStandIn(look, name, share = null, blowX = null) {
  const e = makeEnemyEntity(look.mobile, ENEMY_BASICS[look.mobile], null, 1, () => 0.5);
  e.minMetalToHit = 0;
  e.armor = BOSS_ARMOR;
  e.armorValues = new Array(7).fill(BOSS_ARMOR);
  e.maxHealth = e.health = STAND_IN_WHOLE;
  e.relayHealth = true;
  e.relayShare = typeof share === 'function' ? share : null;
  e.relayBlowX = typeof blowX === 'function' ? blowX : null;
  e.name = name;
  e.spareGear = true;
  e.mobileType ??= look.mobile;
  // Every sway path (the language check, the Pacify and Charm effects, and the stand-in spell route) must refuse a
  // target with `pacifyImmune`.
  e.pacifyImmune = true;
  return e;
}
// An `ArmorValues` entry of 100 is unarmored in Daggerfall, so no armor turns a blow on a crystal.
export const CRYSTAL_ARMOR = 100;
export const CRYSTAL_NAME = 'Crystal of Oblivion';
export function crystalStandIn(look, c = null, share = null, blowX = null) {
  const e = bossStandIn(look, CRYSTAL_NAME, share, blowX);
  e.armor = CRYSTAL_ARMOR;
  e.armorValues = new Array(7).fill(CRYSTAL_ARMOR);
  e.skills = 0;
  e.crystal = true;
  // `crystalC` routes a Cast When Strikes spell to this crystal; without it the spell lands on the boss.
  if (c !== null) e.crystalC = c;
  return e;
}
export const BOSS_SWAY_TEXT = (name) => `${name || 'The Warden'} cannot be swayed.`;
export const BOSS_SWAY_TELL_MS = 4000;

/**
 * @param {number[]} eye
 * @param {{feet: number[], height: number, radius: number}} body
 */
export function bossReach(eye, body) {
  const { feet, height, radius } = body;
  const y = Math.min(Math.max(eye[1], feet[1] + radius), feet[1] + height - radius);
  const dx = feet[0] - eye[0], dz = feet[2] - eye[2], flat = Math.hypot(dx, dz) || 1;
  return {
    point: [feet[0] - (dx / flat) * radius, y, feet[2] - (dz / flat) * radius],
    dist: Math.max(0, Math.hypot(dx, y - eye[1], dz) - radius),
  };
}

export const RUN_ANIM_SPEED = 14;
export const FLINCH_MS = 450;
export const STUN_ANIM_SPEED = 3;
export const FALL_MS = 2400;
// Frame indices into the Daedra Lord spell clip (`spellAnimFrames`): frame 1 holds through a fire wind-up and frame
// 3 shows the release.
export const CAST_RAISE_FRAME = 1;
export const CAST_LOOSE_FRAME = 3;
export const SPENT_ON = Object.freeze(['slam', 'leap', 'nova']);
export const SPENT_FRAME = 4;
export const GATE_FLASH_COURT = 0.4;
export const GATE_FLASH_SHARE = 0.003;
export const gateHitFlash = (mineAt, courtAt, now) => Math.max(hitFlashStrength((now - mineAt) / 1000), GATE_FLASH_COURT * hitFlashStrength((now - courtAt) / 1000));
export const LANDING_LIGHT_Y = 0.6;
export const FALL_SINK_M = 1.5;
export const CORPSE_SCALE = 3;
export const WAKE_LEAD_MS = 1200;
export const WAKE_FLARE_MS = 1500;
export const LOW_HEALTH = 0.1;

// These colors are display-encoded, not linear: the pass that draws telegraphs writes an 8-bit display-encoded
// frame.
export const ATTACK_COLORS = Object.freeze({
  cleave: Object.freeze([1.0, 0.3, 0.12]),
  slam: Object.freeze([1.0, 0.52, 0.1]),
  charge: Object.freeze([1.0, 0.16, 0.08]),
  hellfire: Object.freeze([1.0, 0.64, 0.14]),
  nova: Object.freeze([1.0, 0.8, 0.28]),
  wrath: Object.freeze([0.9, 0.06, 0.03]),
  leap: Object.freeze([1.0, 0.42, 0.1]),
  meteor: Object.freeze([1.0, 0.56, 0.06]),
  spokes: Object.freeze([1.0, 0.14, 0.32]),
  cross: Object.freeze([1.0, 0.46, 0.12]),
  reckon: Object.freeze([0.95, 0.08, 0.16]),
  chains: Object.freeze([1.0, 0.34, 0.1]),
  brand: Object.freeze([1.0, 0.24, 0.2]),
  torment: Object.freeze([1.0, 0.8, 0.28]),
  wheel: Object.freeze([1.0, 0.38, 0.16]),
  gaze: Object.freeze([1.0, 0.97, 0.9]),
  unmake: Object.freeze([0.78, 0.2, 0.62]),
  sunder: Object.freeze([1.0, 0.22, 0.4]),
  rejoin: Object.freeze([1.0, 0.62, 0.22]),
});
export const CRYSTAL_COLOR = Object.freeze([1.0, 0.18, 0.34]);
export const STUN_COLOR = Object.freeze([0.62, 0.7, 1.0]);
export const WARD_COLOR = Object.freeze([1.0, 0.86, 0.5]);
export const EMBER_COLOR = Object.freeze([0.9, 0.32, 0.1]);
export const POOL_COLOR = Object.freeze([1.0, 0.36, 0.05]);
const tint = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.freeze(v)])));
export const ASPECT_COLORS = Object.freeze({
  rime: tint({ hellfire: [0.5, 0.78, 1.0], nova: [0.72, 0.9, 1.0], meteor: [0.4, 0.68, 1.0], spokes: [0.46, 0.56, 1.0], pool: [0.28, 0.6, 1.0], ember: [0.34, 0.6, 0.95], brand: [0.42, 0.62, 1.0] }),
  storm: tint({ hellfire: [0.66, 0.52, 1.0], nova: [0.84, 0.8, 1.0], meteor: [0.96, 0.92, 0.5], spokes: [0.74, 0.46, 1.0], pool: [0.56, 0.4, 1.0], ember: [0.6, 0.42, 0.95], brand: [0.7, 0.4, 1.0] }),
  venom: tint({ hellfire: [0.5, 1.0, 0.26], nova: [0.68, 1.0, 0.38], meteor: [0.38, 0.92, 0.16], spokes: [0.28, 1.0, 0.52], pool: [0.3, 0.86, 0.12], ember: [0.36, 0.8, 0.16], brand: [0.4, 0.95, 0.2] }),
});
export const attackColor = (A, P) => ASPECT_COLORS[P?.aspect?.id]?.[A.key] ?? ATTACK_COLORS[A.key];
export const poolColor = (P) => ASPECT_COLORS[P?.aspect?.id]?.pool ?? POOL_COLOR;
export const emberColor = (P) => ASPECT_COLORS[P?.aspect?.id]?.ember ?? EMBER_COLOR;
export const crystalColor = (P) => ASPECT_COLORS[P?.aspect?.id]?.spokes ?? CRYSTAL_COLOR;

export { LEAP_AIR_MS, CROSS_AIR_MS };
export const LEAP_HEIGHT = 3.2;
export const CROSS_HEIGHT = 22;

// Mirrors how `stepBrain` moves him during a charge and a leap, so the next relay update finds him where this
// places him.
export function bossPlace(s, now) {
  const atk = s?.atk;
  if (atk && ATTACK_BY_ID[atk.a] === ATTACKS.charge && now >= atk.at) {
    const head = chargeHead(atk, Math.min(now, atk.at + ATTACKS.charge.active));
    if (head) return head;
  }
  const leap = atk ? leapAt(atk, now) : null;
  if (leap) return leap;
  return bossAt(s, now);
}

export function bossHop(s, now) {
  const atk = s?.atk, A = atk ? ATTACK_BY_ID[atk.a] : null;
  if (A !== ATTACKS.leap && A !== ATTACKS.cross) return 0;
  const air = airOf(A);
  if (now < atk.at - air || now >= atk.at) return 0;
  const k = (now - (atk.at - air)) / air;
  return 4 * (A === ATTACKS.cross ? CROSS_HEIGHT : LEAP_HEIGHT) * k * (1 - k);
}

/**
 * @param {any} s
 * @param {number} now
 * @param {number} [hurtAt]
 */
export function bossAct(s, now, hurtAt = -Infinity) {
  if (!s || s.day === null) return { act: 'gone', anims: IDLE_ANIMS, frame: 0, loop: false, atk: null, t: 0 };
  if (s.fell) {
    const since = now - s.fell.at;
    if (since >= FALL_MS) return { act: 'gone', anims: HURT_ANIMS, frame: 0, loop: false, atk: null, t: 1 };
    const sink = since > THUD_AT_MS ? FALL_SINK_M * Math.min(1, (since - THUD_AT_MS) / (FALL_MS - THUD_AT_MS)) : 0;
    return { act: 'fall', anims: HURT_ANIMS, frame: Math.max(0, Math.min(4, Math.floor((since / THUD_AT_MS) * 5))), loop: false, atk: null, t: since / FALL_MS, sink };
  }
  if (now < (s.stunUntil ?? 0) && now >= (s.stunAt ?? 0)) return { act: 'stunned', anims: HURT_ANIMS, frame: Math.floor(((now - (s.stunAt ?? now)) / 1000) * STUN_ANIM_SPEED), loop: true, atk: null, t: 0 };
  const atk = s.atk, A = atk ? ATTACK_BY_ID[atk.a] : null;
  if (A) {
    const tel = telegraphAt(atk, s.phase, now);
    const air = airOf(A);
    if ((A === ATTACKS.leap || A === ATTACKS.cross) && now < atk.at && now >= atk.at - air) return { act: 'run', anims: MOVE_ANIMS, frame: Math.floor(((now - atk.at + air) / 1000) * RUN_ANIM_SPEED), loop: true, atk: A.key, t: tel?.t ?? 1 };
    const cast = !!A.el;
    if (tel && now < atk.at) return { act: 'windup', anims: PRIMARY_ATTACK_ANIMS, frame: cast ? CAST_RAISE_FRAME : tel.t < 0.5 ? 0 : 1, loop: false, atk: A.key, t: tel.t };
    if (A === ATTACKS.charge && now < atk.at + A.active) {
      return { act: 'run', anims: MOVE_ANIMS, frame: Math.floor(((now - atk.at) / 1000) * RUN_ANIM_SPEED), loop: true, atk: A.key, t: 1 };
    }
    const played = Math.floor(((now - atk.at) / 1000) * PRIMARY_ATTACK_ANIM_SPEED);
    if (A !== ATTACKS.charge && played < 3) return { act: 'strike', anims: PRIMARY_ATTACK_ANIMS, frame: cast ? CAST_LOOSE_FRAME : 2 + played, loop: false, atk: A.key, t: 1 };
    if (SPENT_ON.includes(A.key) && now < atk.at + A.active + A.recover) return { act: 'spent', anims: PRIMARY_ATTACK_ANIMS, frame: cast ? CAST_LOOSE_FRAME : SPENT_FRAME, loop: false, atk: A.key, t: 1 };
  }
  const at = s.move && s.move.v > 0 ? bossAt(s, now) : null;
  const walking = !!at && Math.hypot(s.move.tx - at[0], s.move.tz - at[1]) > 0.05;
  if (now - hurtAt >= 0 && now - hurtAt < FLINCH_MS) return { act: 'flinch', anims: HURT_ANIMS, frame: Math.floor(((now - hurtAt) / FLINCH_MS) * 2), loop: false, atk: null, t: 0 };
  if (walking) return { act: 'walk', anims: MOVE_ANIMS, frame: Math.floor((now / 1000) * MOVE_ANIM_SPEED), loop: true, atk: null, t: 0 };
  return { act: 'idle', anims: IDLE_ANIMS, frame: Math.floor((now / 1000) * IDLE_ANIM_SPEED), loop: true, atk: null, t: 0 };
}

/**
 * @param {ReturnType<typeof bossAct>} act
 * @param {number} yaw
 * @param {number[]} feet
 * @param {number[]} cam
 * @param {(record: number) => number} frameCount
 */
export function bossFrame(act, yaw, feet, cam, frameCount) {
  const o = mobileOrientation(yaw, feet, cam && cam.length === 3 ? cam : feet);
  const a = act.anims[o] ?? act.anims[0];
  const n = Math.max(1, frameCount(a.record) | 0);
  const frame = act.loop ? ((act.frame % n) + n) % n : Math.max(0, Math.min(n - 1, act.frame));
  return { record: a.record, frame, flip: !!a.flip };
}

export const GLOW_UP_SHARE = 0.55;
export const FALL_GLOW_K = 2.2;
export const GLOW_UP = BOSS_H * GLOW_UP_SHARE;
export const GLOW_RANGE = Object.freeze({ ember: 7, windup: 12, landing: 18 });

// `out` is refilled in place: the shadow pass tracks this light by record identity, so a new record each frame
// reads as a new light.
export function bossGlow(s, now, out = null) {
  if (!s || s.day === null) return null;
  if (s.fell && now - s.fell.at >= FALL_MS) return null;
  const P = profileOf(s), ember = emberColor(P);
  const [cx, cz] = bossPlace(s, now);
  const [x, y, z] = courtToDungeon(cx, P.bossH * GLOW_UP_SHARE, cz);
  const lit = (color, k, range, ly = y) => {
    const o = out ?? { x: 0, y: 0, z: 0, range: 0, color: [0, 0, 0] };
    o.x = x; o.y = ly; o.z = z; o.range = range;
    o.color[0] = color[0] * k; o.color[1] = color[1] * k; o.color[2] = color[2] * k;
    return o;
  };
  if (s.fell) return lit(ember, FALL_GLOW_K * (1 - (now - s.fell.at) / FALL_MS), GLOW_RANGE.landing);
  const atk = s.atk, A = atk ? ATTACK_BY_ID[atk.a] : null;
  if (A) {
    const tel = telegraphAt(atk, s.phase, now);
    const color = attackColor(A, P) ?? ember;
    const floor = courtToDungeon(cx, LANDING_LIGHT_Y, cz)[1], away = !!fxBurstOf(A)?.light;
    if (tel && !tel.over) {
      if (tel.landing) return away ? lit(ember, 0.45, GLOW_RANGE.ember) : lit(color, 2.4, GLOW_RANGE.landing, floor);
      return lit(color, 0.35 + 1.25 * tel.t * tel.t, GLOW_RANGE.windup);
    }
    if (tel && !away && tel.since < Math.max(A.active, 1) + 350) return lit(color, 2.4 * (1 - (tel.since - Math.max(A.active, 1)) / 350), GLOW_RANGE.landing, floor);
  }
  if (now < s.shieldUntil) return lit(WARD_COLOR, 0.9 + 0.3 * Math.sin(now / 90), GLOW_RANGE.windup);
  if (now < (s.stunUntil ?? 0)) return lit(STUN_COLOR, 0.55 + 0.25 * Math.sin(now / 160), GLOW_RANGE.windup);
  const wake = (s.openUntil ?? 0) > 0 ? now - (s.openUntil - WAKE_LEAD_MS) : -1;
  if (wake >= 0 && wake < WAKE_FLARE_MS) return lit(ember, 0.45 + 2.2 * Math.sin((Math.PI * wake) / WAKE_FLARE_MS), GLOW_RANGE.landing);
  if (s.max > 0 && s.hp / s.max < LOW_HEALTH) return lit(ember, 0.45 * sputter(now), GLOW_RANGE.ember);
  return lit(ember, 0.45, GLOW_RANGE.ember);
}
export const SPUTTER_STEP_MS = 90;
export const sputter = (now) => { const x = Math.sin(Math.floor(now / SPUTTER_STEP_MS) * 12.9898) * 43758.5453; return 0.2 + 0.8 * (x - Math.floor(x)); };

const B = ENEMY_BASICS[31];
const voice = (clip, pitch, volume = 1.3) => Object.freeze({ clip, pitch, volume, reach: 60, at: 'him' });
export const BURNING = 420;
export const BODY_FALL = 15;
export const CRYSTAL_CLIPS = Object.freeze({ rise: 68, hit: 433, shatter: 342 });
export const THUNDER_ROLL = 350;
export const FIRE_CAST_ID = 352;
export const SWING_LOW = 105;
export const RELEASE_LEAD_MS = 350;
const fireLoosed = (volume, reach, at = 'him') => Object.freeze({ id: FIRE_CAST_ID, pitch: 1.1, volume, reach, at });
export const BOSS_CUES = Object.freeze({
  windup: Object.freeze({
    cleave: voice(B.barkSound, 0.96),
    slam: voice(B.barkSound, 0.76),
    charge: voice(B.moveSound, 0.7),
    hellfire: Object.freeze({ id: FIRE_CAST_ID, pitch: 0.8, volume: 1.3, reach: 60, at: 'him' }),
    nova: Object.freeze({ id: FIRE_CAST_ID, pitch: 0.63, volume: 1.4, reach: 60, at: 'him' }),
    wrath: voice(B.barkSound, 0.45, 1.8),
    leap: voice(B.barkSound, 0.6, 1.5),
    meteor: Object.freeze({ id: FIRE_CAST_ID, pitch: 0.5, volume: 1.5, reach: 70, at: 'him' }),
    spokes: voice(B.barkSound, 0.47, 1.6),
    cross: Object.freeze({ clip: B.barkSound, pitch: 0.46, volume: 1.9, reach: 160, at: 'him' }),
    reckon: Object.freeze({ clip: B.barkSound, pitch: 0.38, volume: 2.1, reach: 160, at: 'him' }),
    chains: voice(B.moveSound, 0.9, 1.4),
    brand: Object.freeze({ id: FIRE_CAST_ID, pitch: 0.39, volume: 1.4, reach: 60, at: 'him' }),
    torment: voice(B.attackSound, 0.85, 1.4),
    wheel: voice(B.barkSound, 0.37, 1.6),
    gaze: voice(B.barkSound, 0.29, 1.8),
    unmake: Object.freeze({ id: FIRE_CAST_ID, pitch: 0.305, volume: 1.7, reach: 80, at: 'him' }),
    sunder: Object.freeze({ clip: B.attackSound, pitch: 0.62, volume: 1.9, reach: 160, at: 'him' }),
    rejoin: Object.freeze({ clip: B.attackSound, pitch: 0.48, volume: 2.0, reach: 160, at: 'him' }),
  }),
  release: Object.freeze({
    cleave: Object.freeze({ clip: SWING_LOW, pitch: 0.45, volume: 1.5, reach: 40, at: 'him' }),
    charge: Object.freeze({ clip: SWING_LOW, pitch: 0.45, volume: 1.5, reach: 40, at: 'him' }),
    slam: Object.freeze({ clip: BODY_FALL, pitch: 0.5, volume: 1.4, reach: 50, at: 'him' }),
    leap: Object.freeze({ clip: BODY_FALL, pitch: 0.5, volume: 1.4, reach: 50, at: 'him' }),
    cross: Object.freeze({ clip: BODY_FALL, pitch: 0.4, volume: 1.7, reach: 120, at: 'him' }),
    hellfire: fireLoosed(1.1, 40, 'targets'),
    nova: fireLoosed(1.3, 50),
    meteor: fireLoosed(1.3, 60, 'targets'),
    spokes: fireLoosed(1.3, 50),
    wrath: fireLoosed(1.8, 120),
    reckon: fireLoosed(1.8, 160),
    chains: Object.freeze({ clip: SWING_LOW, pitch: 0.7, volume: 1.4, reach: 40, at: 'him' }),
    brand: fireLoosed(1.1, 40, 'targets'),
    torment: fireLoosed(1.1, 40, 'targets'),
    wheel: Object.freeze({ clip: SWING_LOW, pitch: 0.55, volume: 1.6, reach: 45, at: 'him' }),
    gaze: fireLoosed(1.4, 70),
    unmake: fireLoosed(1.5, 60),
    sunder: Object.freeze({ clip: BODY_FALL, pitch: 0.45, volume: 1.7, reach: 120, at: 'him' }),
    rejoin: Object.freeze({ clip: BODY_FALL, pitch: 0.36, volume: 1.8, reach: 160, at: 'him' }),
  }),
  land: Object.freeze({
    cleave: voice(B.attackSound, 0.8),
    slam: voice(B.attackSound, 0.6, 1.6),
    charge: voice(B.attackSound, 0.72),
    hellfire: Object.freeze({ clip: BURNING, pitch: 0.9, volume: 1.2, reach: 40, at: 'targets' }),
    nova: Object.freeze({ clip: BURNING, pitch: 0.7, volume: 1.8, reach: 60, at: 'him' }),
    wrath: Object.freeze({ clip: BURNING, pitch: 0.5, volume: 2, reach: 120, at: 'him' }),
    leap: voice(B.attackSound, 0.55, 1.7),
    meteor: Object.freeze({ clip: BURNING, pitch: 0.55, volume: 2, reach: 80, at: 'targets' }),
    spokes: Object.freeze({ clip: BURNING, pitch: 0.65, volume: 1.8, reach: 60, at: 'him' }),
    cross: Object.freeze({ clip: BODY_FALL, pitch: 0.24, volume: 2.2, reach: 160, at: 'him' }),
    reckon: Object.freeze({ clip: BURNING, pitch: 0.42, volume: 2.2, reach: 200, at: 'him' }),
    chains: voice(B.attackSound, 0.9),
    brand: Object.freeze({ clip: BURNING, pitch: 0.95, volume: 1.4, reach: 40, at: 'targets' }),
    torment: Object.freeze({ clip: BURNING, pitch: 0.8, volume: 1.6, reach: 40, at: 'targets' }),
    wheel: voice(B.attackSound, 0.66, 1.6),
    gaze: Object.freeze({ clip: BURNING, pitch: 0.85, volume: 1.6, reach: 70, at: 'him' }),
    unmake: Object.freeze({ clip: BURNING, pitch: 0.6, volume: 2, reach: 80, at: 'him' }),
    sunder: voice(B.attackSound, 0.5, 2),
    rejoin: Object.freeze({ clip: BODY_FALL, pitch: 0.22, volume: 2.2, reach: 160, at: 'him' }),
  }),
  roar: voice(B.barkSound, 0.5, 1.8),
  fall: voice(B.barkSound, 0.4, 1.8),
  step: Object.freeze({ clip: BODY_FALL, pitch: 0.42, volume: 1.0, reach: 45, at: 'him' }),
  growl: voice(B.barkSound, 0.36, 0.75),
  hurt: voice(B.barkSound, 0.62, 0.9),
  quake: Object.freeze({ clip: BODY_FALL, pitch: 0.3, volume: 1.8, reach: 70, at: 'him' }),
  thunder: Object.freeze({ clip: THUNDER_ROLL, pitch: 0.62, volume: 1.4, reach: 140, at: 'him' }),
  thud: Object.freeze({ clip: BODY_FALL, pitch: 0.26, volume: 2.0, reach: 90, at: 'him' }),
  crystalRise: Object.freeze({ clip: CRYSTAL_CLIPS.rise, pitch: 0.7, volume: 1.3, reach: 60, at: 'point' }),
  crystalHit: Object.freeze({ clip: CRYSTAL_CLIPS.hit, pitch: 1.55, volume: 0.9, reach: 30, at: 'point' }),
  crystalBreak: Object.freeze({ clip: CRYSTAL_CLIPS.shatter, pitch: 1.9, volume: 1.7, reach: 80, at: 'point' }),
  crystalRing: Object.freeze({ clip: CRYSTAL_CLIPS.hit, pitch: 0.55, volume: 1.4, reach: 80, at: 'point' }),
  stunned: Object.freeze({ clip: B.barkSound, pitch: 0.7, volume: 1.8, reach: 120, at: 'him' }),
  groundStep: Object.freeze({ clip: BURNING, pitch: 1.35, volume: 0.9, reach: 14, at: 'point' }),
  sting: Object.freeze({ clip: CRYSTAL_CLIPS.hit, pitch: 2.2, volume: 1.3, reach: 20, at: 'point' }),
});
// Copies of one clip at many targets sum past full scale, so only the nearest target and others at least
// `CUE_TARGET_APART_M` apart play, at most `CUE_TARGET_COPIES`.
export const CUE_TARGET_COPIES = 2;
export const CUE_TARGET_APART_M = 10;
export function cueTargetPlaces(points, ear) {
  if (!Array.isArray(points) || !points.length) return [];
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const order = Array.isArray(ear) ? points.slice().sort((p, q) => d2(p, ear) - d2(q, ear)) : points;
  const kept = [], apart = CUE_TARGET_APART_M * CUE_TARGET_APART_M;
  for (const p of order) {
    if (kept.length >= CUE_TARGET_COPIES) break;
    if (kept.every((k) => d2(k, p) >= apart)) kept.push(p);
  }
  return kept;
}
export const ASPECT_CUE_IDS = Object.freeze({ rime: 353, storm: 351, venom: 350 });
export const ASPECT_LAND = Object.freeze({
  rime: Object.freeze({ id: 353, pitch: 0.55 }),
  storm: Object.freeze({ clip: THUNDER_ROLL, pitch: 0.9 }),
  venom: Object.freeze({ id: 350, pitch: 0.5 }),
});
export function bossCue(kind, A, P) {
  const cue = BOSS_CUES[kind]?.[A.key] ?? null;
  const aspect = P?.aspect?.id;
  if (!cue || isDagons(A) || !P?.atk?.[A.key]?.el || !(aspect in ASPECT_CUE_IDS)) return cue;
  if (kind === 'windup' || kind === 'release') return { id: ASPECT_CUE_IDS[aspect], pitch: cue.pitch, volume: cue.volume, reach: cue.reach, at: cue.at };
  const land = ASPECT_LAND[aspect];
  return { ...(land.clip != null ? { clip: land.clip } : { id: land.id }), pitch: land.pitch * (cue.pitch / 0.7), volume: cue.volume, reach: cue.reach, at: cue.at };
}
export function groundStepCue(P) {
  const id = ASPECT_CUE_IDS[P?.aspect?.id];
  return id != null ? { id, pitch: 1.3, volume: BOSS_CUES.groundStep.volume, reach: BOSS_CUES.groundStep.reach, at: 'point' } : BOSS_CUES.groundStep;
}
export const BOSS_STRIDE_M = 2.8;
export const GROWL_EVERY_MS = Object.freeze([7000, 13000]);
export const HURT_GAP_MS = 1400;
export const HURT_SHARE = 0.004;
export const QUAKE_ON = Object.freeze(['slam', 'charge', 'nova', 'wrath', 'leap', 'meteor', 'cross', 'reckon', 'sunder', 'rejoin']);
export const LAND_SHAKE = Object.freeze({
  slam: Object.freeze([2.5, 12]), leap: Object.freeze([2.5, 12]), cross: Object.freeze([4, 25]), meteor: Object.freeze([3.5, 15]),
  nova: Object.freeze([2, 24]), wrath: Object.freeze([6, 0]), reckon: Object.freeze([6, 0]),
});
export const SHAKE_AS = Object.freeze({ sunder: 'cross', rejoin: 'cross' });
export const landShake = (A, d) => { const w = LAND_SHAKE[SHAKE_AS[A?.key] ?? A?.key]; return !w ? 0 : !(w[1] > 0) ? w[0] : w[0] * Math.max(0, 1 - d / w[1]); };
export const THUD_AT_MS = 1500;

export const HOST_LOOKS = Object.freeze({
  harrier: Object.freeze({ burning: 1, rime: 1, storm: 1, venom: 1 }),
  sapper: Object.freeze({ burning: 35, rime: 38, storm: 36, venom: 37 }),
  bearer: Object.freeze({ burning: 26, rime: 25, storm: 29, venom: 27 }),
  brute: Object.freeze({ burning: 27, rime: 27, storm: 27, venom: 27 }),
  caster: Object.freeze({ burning: 26, rime: 25, storm: 29, venom: 32 }),
  markynaz: Object.freeze({ burning: 31, rime: 31, storm: 31, venom: 31 }),
  tithe: Object.freeze({ burning: 1, rime: 1, storm: 1, venom: 1 }),
  gaoler: Object.freeze({ burning: 26, rime: 25, storm: 29, venom: 27 }),
});
export const TITHE_SCALE = 1.3;
export const TITHE_GOLD = Object.freeze([1.0, 0.8, 0.3]);
export const HOST_NAMES = Object.freeze({
  1: Object.freeze(['Imp', 'Imps']), 35: Object.freeze(['Fire Atronach', 'Fire Atronachs']), 38: Object.freeze(['Ice Atronach', 'Ice Atronachs']),
  36: Object.freeze(['Iron Atronach', 'Iron Atronachs']), 37: Object.freeze(['Flesh Atronach', 'Flesh Atronachs']),
  26: Object.freeze(['Fire Daedra', 'Fire Daedra']), 25: Object.freeze(['Frost Daedra', 'Frost Daedra']), 29: Object.freeze(['Daedra Seducer', 'Daedra Seducers']), 27: Object.freeze(['Daedroth', 'Daedroths']),
  32: Object.freeze({ get 0() { return t('gate.host.lich', 'Lich'); }, get 1() { return t('gate.host.liches', 'Liches'); } }),
  31: Object.freeze({ get 0() { return t('gate.host.markynaz', 'Markynaz'); }, get 1() { return t('gate.host.markynazes', 'Markynazes'); } }),
});
export const HOST_HOVER_M = 0.9;
export function hostLookOf(k, aspectId) {
  const key = HOST_KINDS[k]?.key ?? 'harrier', table = HOST_LOOKS[key];
  const mobile = table[aspectId] ?? table.burning;
  const names = HOST_NAMES[mobile], name = names?.[0] ?? 'Daedra', plural = names?.[1] ?? 'Daedra';
  const tithe = k === HOST.tithe;
  if (k === HOST.gaoler) return { mobile, name: t('gate.host.gaoler', 'Gaoler'), plural: t('gate.host.gaolers', 'Gaolers'), hover: 0, winged: mobile === 29, scale: 1 };
  return { mobile, name: tithe ? t('gate.host.tithe', 'Tithe-Imp') : name, plural: tithe ? t('gate.host.tithes', 'Tithe-Imps') : plural, hover: ENEMY_BASICS[mobile]?.behaviour === 'Flying' ? HOST_HOVER_M : 0, winged: mobile === 29, scale: tithe ? TITHE_SCALE : 1 };
}
export const KNIGHT_MOBILE = 145;
export const knightLookOf = (dame) => Object.freeze({ mobile: KNIGHT_MOBILE, archive: (dame ? ENEMY_BASICS[KNIGHT_MOBILE]?.femaleTexture : null) ?? ENEMY_BASICS[KNIGHT_MOBILE]?.maleTexture ?? null });
export const KNIGHT_BOWED_FRAME = 9;
export function knightAct(freed, now) {
  if (!freed) return { act: 'chained', anims: HURT_ANIMS, frame: KNIGHT_BOWED_FRAME, loop: false, sink: 0 };
  return { act: 'idle', anims: IDLE_ANIMS, frame: Math.floor((Math.max(0, now) / 1000) * IDLE_ANIM_SPEED), loop: true, sink: 0 };
}
// `hostI` routes a Cast When Strikes spell to this host body; without it the spell lands on the boss.
export function hostStandIn(look, i = null, share = null, blowX = null) {
  const e = bossStandIn({ mobile: look.mobile }, look.name, share, blowX);
  if (i !== null) e.hostI = i;
  return e;
}

export const HOST_FALL_MS = 900;
export const HOST_FLINCH_MS = 350;
/**
 * @param {any} a
 * @param {number} now
 * @param {{mobile?: number, winged?: boolean, hover?: number}} look
 * @param {number} [hurtAt]
 */
export function hostAct(a, now, look, hurtAt = -Infinity) {
  const winged = !!look?.winged;
  const tab = (state) => stateAnims(state, look?.mobile, !!ENEMY_BASICS[look?.mobile]?.hasIdle, false, false, true, false, winged);
  const moveT = tab('move'), idleT = tab('idle'), hurtT = tab('hurt'), atkT = tab('attack');
  const flyer = winged || (look?.hover ?? 0) > 0;
  const pace = flyer ? FLY_ANIM_SPEED : moveT[0].fps, idlePace = flyer ? FLY_ANIM_SPEED : idleT[0].fps;
  const riseMs = HOST_RISE_MS[a?.k] ?? 0, since = now - (a?.rose ?? -Infinity);
  if (since < riseMs) return { act: 'rise', anims: idleT, frame: Math.floor((Math.max(0, since) / 1000) * idlePace), loop: true, sink: HOST_KINDS[a.k].h * (1 - Math.max(0, since) / riseMs) };
  const tel = a?.atk ? hostTelegraphAt(a.atk, a.k, now) : null;
  if (tel && !tel.landing && !tel.over) return { act: 'windup', anims: atkT, frame: winged ? 0 : tel.t >= 0.5 ? 1 : 0, loop: false, sink: 0 };
  if (tel && tel.since < 600) return { act: 'strike', anims: atkT, frame: winged ? Math.floor((tel.since / 1000) * PRIMARY_ATTACK_ANIM_SPEED) : 2 + Math.floor((tel.since / 1000) * PRIMARY_ATTACK_ANIM_SPEED), loop: winged, sink: 0 };
  if (now - hurtAt >= 0 && now - hurtAt < HOST_FLINCH_MS) return { act: 'flinch', anims: hurtT, frame: Math.floor(((now - hurtAt) / 1000) * HURT_ANIM_SPEED), loop: winged, sink: 0 };
  const m = a?.mv;
  if (m && m.v > 0) {
    const [x, z] = hostAt(a, now);
    if (Math.hypot(m.tx - x, m.tz - z) > 0.05) return { act: 'walk', anims: moveT, frame: Math.floor((now / 1000) * pace), loop: true, sink: 0 };
  }
  return { act: 'idle', anims: idleT, frame: Math.floor((now / 1000) * idlePace), loop: true, sink: 0 };
}
export function hostFallAct(g, now, look) {
  const since = now - g.at, winged = !!look?.winged;
  if (g.w === 1 || since >= HOST_FALL_MS || since < 0) return { act: 'gone', anims: HURT_ANIMS, frame: 0, loop: false, sink: 0 };
  return { act: 'fall', anims: winged ? SEDUCER_IDLE_MOVE_ANIMS : HURT_ANIMS, frame: Math.floor((since / HOST_FALL_MS) * 4), loop: winged, sink: g.w === 2 || g.w === 3 ? HOST_KINDS[g.k].h * (since / HOST_FALL_MS) : 0 };
}
export function hostCue(kind, mobile) {
  const E = ENEMY_BASICS[mobile] ?? ENEMY_BASICS[1];
  switch (kind) {
    case 'rise': return { clip: E.barkSound, pitch: 0.92, volume: 1.15, reach: 55, at: 'point' };
    case 'windup': return { clip: E.barkSound, pitch: 1, volume: 1, reach: 40, at: 'point' };
    case 'land': return { clip: E.attackSound, pitch: 1, volume: 1.1, reach: 40, at: 'point' };
    case 'hurt': return { clip: E.barkSound, pitch: 1.2, volume: 0.8, reach: 30, at: 'point' };
    case 'fall': return { clip: BODY_FALL, pitch: 1.1, volume: 1, reach: 40, at: 'point' };
    case 'drunk': return { clip: BURNING, pitch: 0.6, volume: 1.6, reach: 70, at: 'point' };
    default: return null;
  }
}
export const HOST_BITE_COLOR = Object.freeze([1.0, 0.4, 0.16]);
export const HOST_PULSE_FIRE = Object.freeze([1.0, 0.5, 0.12]);
export const hostPulseColor = (P) => ASPECT_COLORS[P?.aspect?.id]?.nova ?? HOST_PULSE_FIRE;
