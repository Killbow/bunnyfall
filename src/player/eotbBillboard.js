// Logic for the Eye of the Beholder player billboard: which sprite, which facing, which frame clock.
import { roundToInt } from '../world/mathf.js';

export const RECORD_OFFSETS = Object.freeze([0, 1, 2, 3, 4, 3, 2, 1]);
export const MIRRORED = Object.freeze([false, true, true, true, false, false, false, false]);
export const ORIENTATIONS = 8;
export const ANGLE_PER_ORIENTATION = 360 / ORIENTATIONS;

export const ARCHIVE_FOOT = 112364;
export const ARCHIVE_HORSE = 112382;
export const ARCHIVE_LYCAN = 112380;
export const lycanArchive = (lycanthropyType) => ARCHIVE_LYCAN + (lycanthropyType === 2 ? 1 : 0);

export const STATE_TABLES = Object.freeze({
  Idle: { base: 0, frames: 0 },
  Move: { base: 5, frames: 0 },
  Death: { base: 10, frames: 0 },
  IdleMelee: { base: 15, frames: 0 },
  MoveMelee: { base: 20, frames: 0 },
  AttackMelee: { base: 25, frames: 0 },
  IdleRanged: { base: 30, frames: 3 },
  MoveRanged: { base: 35, frames: 3 },
  AttackRanged: { base: 40, frames: 0 },
  IdleSpell: { base: 45, frames: 0 },
  MoveSpell: { base: 50, frames: 0 },
  AttackSpell: { base: 55, frames: 0 },
  IdleHorse: { base: 0, frames: 0 },
  MoveHorse: { base: 5, frames: 0 },
  GallopHorse: { base: 10, frames: 0 },
  IdleLycan: { base: 0, frames: 0 },
  MoveLycan: { base: 5, frames: 0 },
  IdleMeleeLycan: { base: 15, frames: 0 },
  MoveMeleeLycan: { base: 20, frames: 0 },
  AttackMeleeLycan: { base: 25, frames: 0 },
  DeathLycan: { base: 10, frames: 0 },
});

export const TABLE_FRAMES = Object.freeze({
  Idle: 1, Move: 4, Death: 2, IdleMelee: 1, MoveMelee: 2, AttackMelee: 6,
  IdleRanged: 1, MoveRanged: 2, AttackRanged: 4, IdleSpell: 2, MoveSpell: 2, AttackSpell: 4,
  IdleHorse: 1, MoveHorse: 8, GallopHorse: 8,
  IdleLycan: 1, MoveLycan: 4, IdleMeleeLycan: 1, MoveMeleeLycan: 2, AttackMeleeLycan: 3, DeathLycan: 2,
});
export const frameCount = (table) => TABLE_FRAMES[table] ?? 1;

export const tableArchive = (name, { onFoot = 0, onHorse = 0, lycanthropyType = 0 } = {}) => {
  if (name.endsWith('Horse')) return ARCHIVE_HORSE + onHorse;
  if (name.endsWith('Lycan')) return lycanArchive(lycanthropyType);
  return ARCHIVE_FOOT + onFoot;
};

export function stateFor(table, orientation) {
  const t = STATE_TABLES[table];
  if (!t) return null;
  const i = ((orientation % ORIENTATIONS) + ORIENTATIONS) % ORIENTATIONS;
  return { record: t.base + RECORD_OFFSETS[i], mirror: MIRRORED[i], frames: t.frames };
}

export { roundToInt };

export function signedAngleY(from, to) {
  if ((!from[0] && !from[2]) || (!to[0] && !to[2])) return 0;
  const a = Math.atan2(from[0], from[2]);
  const b = Math.atan2(to[0], to[2]);
  let d = (b - a) * (180 / Math.PI);
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

export function orientationFor(facing, toCamera) {
  const angle = signedAngleY(toCamera, facing);
  const o = -roundToInt(angle / ANGLE_PER_ORIENTATION);
  return ((o % ORIENTATIONS) + ORIENTATIONS) % ORIENTATIONS;
}

export function portrayedYaw(orientation, toCamera) {
  if (!Number.isInteger(orientation) || !toCamera || (!toCamera[0] && !toCamera[2])) return null;
  const y = Math.atan2(toCamera[0], toCamera[2]) - orientation * ANGLE_PER_ORIENTATION * Math.PI / 180;
  return Math.atan2(Math.sin(y), Math.cos(y));
}

export const TURN_TO_VIEW = Object.freeze(['Never', 'OnlyWhenAnimating', 'WhenWeaponReadied', 'Always']);

export function facingFor({ turnToView = 2, floating = false, animating = false, sheathed = true, spellcasting = false, stopped = true, boatForward = null } = {},
  moveDir, lastMoveDirection, cameraForward) {
  const zero = (v) => !v || (!v[0] && !v[2]);
  let move = moveDir;
  if (zero(move)) move = zero(lastMoveDirection) ? cameraForward : lastMoveDirection;
  const moving = () => (stopped ? (lastMoveDirection ?? [0, 0, 0]) : move);
  let facing = cameraForward;
  if (!floating) {
    if (turnToView > 2) facing = cameraForward;
    else if (turnToView > 1) {
      if (animating) facing = cameraForward;
      else if (!sheathed || spellcasting) facing = cameraForward;
      else facing = moving();
    } else if (turnToView > 0) {
      facing = animating ? cameraForward : moving();
    } else facing = moving();
  }
  if (boatForward) facing = boatForward;
  return [facing[0], 0, facing[2]];
}

export const boatForwardOf = ({ isSailing = false, boatDriveObject = null, boatMeshObject = null } = {}) =>
  (isSailing ? (boatDriveObject != null ? boatDriveObject.forward : boatMeshObject.forward) : null);

export const FRAME_TIME_ON_FOOT = 0.25;
export const FRAME_TIME_RIDING = 0.0625;
export const frameTime = (riding, walkAnimSpeedMod = 1) =>
  (riding ? FRAME_TIME_RIDING : FRAME_TIME_ON_FOOT) * (2 - walkAnimSpeedMod);

export function speedMod({ running = false, crouching = false, sneaking = false } = {}) {
  let m = 1;
  if (running) m *= 0.5;
  if (crouching) m *= 2;
  if (sneaking) m *= 2;
  return m;
}

export const isFootstepFrame = (frame, riding = false) => frame % (riding ? 4 : 2) === 0;

export const GALLOP_SPEED = 10;
export const tableMoveSpeed = (forward, strafe, speed) => ((forward || strafe) ? (speed || 0) * ((forward && strafe) ? Math.SQRT1_2 : 1) : 0);
export function chooseTable(s = {}) {
  const {
    transformed = false, riding = false, stopped = true,
    sheathed = true, spellcasting = false, usingBow = false, moveSpeed = 0,
    readyStance = 2,
  } = s;
  if (transformed) {
    if (stopped) return sheathed ? 'IdleLycan' : 'IdleMeleeLycan';
    return 'MoveLycan';
  }
  if (stopped) {
    if (riding) return 'IdleHorse';
    if (readyStance > 0) {
      if (spellcasting) return 'IdleSpell';
      if (!sheathed) return usingBow ? 'IdleRanged' : 'IdleMelee';
    }
    return 'Idle';
  }
  if (riding) return moveSpeed > GALLOP_SPEED ? 'GallopHorse' : 'MoveHorse';
  if (readyStance > 1) {
    if (spellcasting) return 'MoveSpell';
    if (!sheathed) return usingBow ? 'MoveRanged' : 'MoveMelee';
  }
  return 'Move';
}

export const deathTable = (s = {}) => (s.transformed ? 'DeathLycan' : 'Death');

export const spriteKey = (archive, record, frame) => `${archive}_${record}-${frame}`;

export const ATTACK_STRINGS = Object.freeze(['None', 'Mirror', 'PingPong', 'Mixed']);
export const STRING = Object.freeze({ None: 0, Mirror: 1, PingPong: 2, Mixed: 3 });

export const meleeAnimTickTime = (animTime, frames) => (animTime * 5) / frames;

export const RANGED_TICK = 0.125;
export const SPELL_TICK = 0.125;
export const LYCAN_TICK = 0.125;
export const DEATH_TICK = 0.5;

export function meleeStrokeFrames(n, blow = 0) {
  const len = Math.max(0, n | 0);
  const half = len >> 1;
  if (half < 1) return forwardFrames(len);
  const from = (((blow | 0) % 2) + 2) % 2 ? half : 0;
  return Array.from({ length: from ? len - half : half }, (_, i) => from + i);
}
export const forwardFrames = (n) => Array.from({ length: Math.max(0, n | 0) }, (_, i) => i);
export const holdDrawFrames = (n) => Array.from({ length: Math.max(0, (n | 0) - 1) }, (_, i) => n - 2 - i);

export const MIRROR_TABLES = Object.freeze(new Set([
  'Idle', 'IdleLycan', 'Move', 'MoveMelee', 'MoveSpell', 'MoveLycan', 'IdleMelee', 'IdleSpell', 'IdleMeleeLycan',
  'AttackMelee', 'AttackSpell', 'AttackMeleeLycan',
]));
export function mirrorFlips(attackStrings, table, orientation, mirrorCount) {
  if (attackStrings !== STRING.Mirror && attackStrings !== STRING.Mixed) return false;
  if (!MIRROR_TABLES.has(table)) return false;
  if (orientation !== 0 && orientation !== 4) return false;
  return mirrorCount % 2 === 1;
}

export const mirrorRevertTime = (mirrorTime, firstPerson) => (firstPerson ? 0.1 : mirrorTime);

export const DELAYED_FRAMES = 3;
export const ORIENTATION_TIME = 0.1;

export const AUTO_TOGGLE_ROWS = Object.freeze([
  'OnFoot', 'OnFootMelee', 'OnFootRanged', 'OnFootSpell', 'OnHorse', 'OnHorseReady', 'OnLycan',
]);
export const AUTO_TOGGLE = Object.freeze({ DontChange: 0, FirstPerson: 1, ThirdPerson: 2 });

export function autoToggleRows(now, prev, { forced = false } = {}) {
  const p = prev ?? { transformed: false, riding: false, spellcasting: false, sheathed: false, ranged: false };
  const rows = [];
  let changed = forced;
  if (now.transformed) { if (p.transformed !== now.transformed) rows.push('OnLycan'); } else if (p.transformed !== now.transformed) changed = true;
  if (now.riding) { if (p.riding !== now.riding) rows.push('OnHorse'); } else if (p.riding !== now.riding) changed = true;
  if (now.spellcasting) { if (p.spellcasting !== now.spellcasting) rows.push('OnFootSpell'); } else if (p.spellcasting !== now.spellcasting) changed = true;
  const fan = () => (!now.sheathed
    ? (now.riding ? 'OnHorseReady' : now.ranged ? 'OnFootRanged' : 'OnFootMelee')
    : (now.riding ? 'OnHorse' : 'OnFoot'));
  if (changed) rows.push(fan());
  else if (!now.sheathed) {
    if (p.sheathed !== now.sheathed || p.ranged !== now.ranged) rows.push(fan());
  } else if (p.sheathed !== now.sheathed) rows.push(fan());
  return rows;
}
