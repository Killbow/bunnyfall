
export function parseBsaIndex(bytes) {
  const size = bytes.byteLength;
  if (size < 12) throw new Error('file too small to be a BSA (under 12 bytes)');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, size);
  const id = dv.getUint32(0, true);
  if (id !== 0x100) {
    throw new Error(`not a Morrowind BSA: header id is 0x${id.toString(16)}, expected 0x100`);
  }
  const dirsize = dv.getUint32(4, true);
  const filenum = dv.getUint32(8, true);

  if (filenum * 21 > size - 12) throw new Error('directory larger than the archive (file count)');
  if (dirsize + 8 * filenum > size - 12) throw new Error('directory larger than the archive (dir size)');

  const tableBytes = 12 * filenum;
  const stringStart = 12 + tableBytes;
  const stringLen = dirsize - tableBytes;
  if (stringLen < 0) throw new Error('directory smaller than its own offset table');
  const dataStart = 12 + dirsize + 8 * filenum;

  const u32 = (i) => dv.getUint32(12 + i * 4, true);
  const files = [];
  for (let i = 0; i < filenum; i++) {
    const fileSize = u32(i * 2);
    const offset = u32(i * 2 + 1) + dataStart;
    const nameOffset = u32(2 * filenum + i);
    if (nameOffset >= stringLen) throw new Error(`name offset outside the string buffer (entry ${i})`);
    let end = stringStart + nameOffset;
    while (end < stringStart + stringLen && bytes[end] !== 0) end++;
    if (end >= stringStart + stringLen) throw new Error(`unterminated name (entry ${i})`);
    files.push({
      name: latin1(bytes.subarray(stringStart + nameOffset, end)).replace(/\\/g, '/').toLowerCase(),
      size: fileSize,
      offset,
    });
  }
  return { fileCount: filenum, dirSize: dirsize, dataStart, files };
}

export function latin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export const NIF_MAGICS = Object.freeze(['NetImmerse File Format', 'Gamebryo File Format']);

export function readNifHeader(bytes) {
  let nl = -1;
  for (let i = 0; i < Math.min(bytes.length, 128); i++) if (bytes[i] === 0x0a) { nl = i; break; }
  if (nl < 0) return { ok: false, why: 'no newline in the first 128 bytes - not a NIF' };
  const line = latin1(bytes.subarray(0, nl)).replace(/\r$/, '');
  const magic = NIF_MAGICS.find((m) => line.startsWith(m));
  if (!magic) return { ok: false, why: `header line is ${JSON.stringify(line)}`, line };
  if (bytes.length < nl + 5) return { ok: false, why: 'file ends before the version field', line };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = dv.getUint32(nl + 1, true);
  return {
    ok: true, magic, line, version,
    versionText: [24, 16, 8, 0].map((s) => (version >>> s) & 0xff).join('.'),
    // A NIF bool is 4 bytes below version 4.1.0.0 and 1 byte from that version on.
    boolBytes: version < 0x04010000 ? 4 : 1,
  };
}

export const FP_SKELETONS = Object.freeze([
  { path: 'meshes/xbase_anim.1st.nif', who: 'male, non-beast' },
  { path: 'meshes/base_anim_female.1st.nif', who: 'female' },
  { path: 'meshes/base_animkna.1st.nif', who: 'beast (Khajiit, Argonian)' },
  { path: 'meshes/wolf/skin.1st.nif', who: 'werewolf' },
  { path: 'meshes/xbase_anim.1st.kf', who: 'first-person animation source' },
  { path: 'meshes/base_anim.1st.nif', who: 'THE NAME THE REVERTED RIG HARDCODED' },
]);

export function walkEsm(bytes, { limit = Infinity } = {}) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let p = 0;
  while (p + 16 <= bytes.length && out.length < limit) {
    const type = latin1(bytes.subarray(p, p + 4));
    const size = dv.getUint32(p + 4, true);
    const body = p + 16;
    if (body + size > bytes.length) break;
    out.push({ type, start: body, size });
    p = body + size;
  }
  return out;
}

export function subrecords(bytes, rec) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let p = rec.start;
  const end = rec.start + rec.size;
  while (p + 8 <= end) {
    const name = latin1(bytes.subarray(p, p + 4));
    const len = dv.getUint32(p + 4, true);
    if (p + 8 + len > end) break;
    out.push({ name, start: p + 8, len });
    p = p + 8 + len;
  }
  return out;
}

const zstr = (bytes, s, n) => {
  let e = s;
  while (e < s + n && bytes[e] !== 0) e++;
  return latin1(bytes.subarray(s, e));
};

export { MW_BODY_PARTS, isFirstPersonId } from './mwEsmFile.js';
import { MW_BODY_PARTS, isFirstPersonId } from './mwEsmFile.js';
import FACE_TABLE from './mwFaceTable.json' with { type: 'json' };
import { GRAPH_ROOT, ACCUM_ROOT_NAMES } from './mwSkin.js';
import { transferSkin, sourceSkin, fitLift, liftBatch } from './mwSkinTransfer.js';
import { getTextKeyTime, animVelocity, collectTextKeys, normalizeTextKeys, clipGroups, resetClip, parseAnimGroups, extractTracks } from './mwAnim.js';
import { mat33Mul } from './mwNifMesh.js';
import { batchMoves, posePartBatch, nodeAffineAt, nodeClockAt, clockFor } from './mwPartClock.js';
import { applyClimbRig } from '../combat/climbRig.js';
import { applyMirrorRig, limbSkeleton, offWeaponBoneAddon, WEAPON_BONE_LEFT_SOURCE, mirrorBindSources } from '../combat/twoHands/mirrorRig.js';
import { ownFacePools } from '../characters/ownHeadModels.js';

// Only these four parts may fall back to a third-person mesh when the first-person record is missing. This is not
// the list of parts shown.
export const ARM_PARTS = Object.freeze(['hand', 'wrist', 'forearm', 'upperarm']);

function readBodyPart(bytes, rec) {
  const e = { id: '', model: '', race: '', part: -1, female: false, playable: true, skin: false, vampire: false };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.race = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'BYDT' && sub.len >= 4) {
      e.part = bytes[sub.start];
      e.vampire = bytes[sub.start + 1] !== 0;
      const flags = bytes[sub.start + 2];
      e.female = (flags & 1) !== 0;
      e.playable = (flags & 2) === 0;
      e.skin = bytes[sub.start + 3] === 0;
      e.bodyKind = bytes[sub.start + 3];
    }
  }
  e.slot = MW_BODY_PARTS[e.part] ?? `#${e.part}`;
  e.firstPerson = isFirstPersonId(e.id);
  return e;
}

export function bodyParts(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type === 'BODY') out.push(readBodyPart(bytes, rec));
  }
  return out;
}

function readRace(bytes, rec) {
  const e = { id: '', beast: false, playable: false, height: [1, 1], weight: [1, 1], radt: false };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'RADT' && sub.len >= 140) {
      e.radt = true;
      const dv = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 140);
      e.height = [dv.getFloat32(120, true), dv.getFloat32(124, true)];
      e.weight = [dv.getFloat32(128, true), dv.getFloat32(132, true)];
      const flags = dv.getInt32(136, true);
      e.playable = (flags & 1) !== 0;
      e.beast = (flags & 2) !== 0;
    }
  }
  return e.id ? e : null;
}

export function raceRecords(bytes) {
  const out = new Map();
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'RACE') continue;
    const e = readRace(bytes, rec);
    if (e) out.set(e.id, e);
  }
  return out;
}

export const MW_WEAPON_TYPE = Object.freeze({
  PickProbe: -4,
  HandToHand: -3,
  Spell: -2,
  None: -1,
  ShortBladeOneHand: 0,
  LongBladeOneHand: 1,
  LongBladeTwoHand: 2,
  BluntOneHand: 3,
  BluntTwoClose: 4,
  BluntTwoWide: 5,
  SpearTwoWide: 6,
  AxeOneHand: 7,
  AxeTwoHand: 8,
  MarksmanBow: 9,
  MarksmanCrossbow: 10,
  MarksmanThrown: 11,
  Arrow: 12,
  Bolt: 13,
});

// For a weapon, the equipped type's attach bone replaces the generic Weapon Bone when the actor has that node. The
// bow is the only weapon on the left.
export const WEAPON_ATTACH_BONE = Object.freeze({
  [MW_WEAPON_TYPE.MarksmanBow]: 'Weapon Bone Left',
  [MW_WEAPON_TYPE.Arrow]: 'Bip01 Arrow',
  [MW_WEAPON_TYPE.Bolt]: 'ArrowBone',
});
// This game maps attacks by motion shape, since the two games pick attacks differently: the three downward strikes
// chop, left and right slash, and up thrusts. Any bow swing is shoot.
export const DF_STRIKE_TO_MW_ATTACK = Object.freeze({
  StrikeDown: 'chop',
  StrikeDownLeft: 'chop',
  StrikeDownRight: 'chop',
  StrikeLeft: 'slash',
  StrikeRight: 'slash',
  StrikeUp: 'thrust',
});

// StrikeRight plays the slash clip backwards as a backhand, so the weapon stays in the right hand. Chops, the
// thrust, and shots never reverse.
export const REVERSED_STRIKES = Object.freeze(['StrikeRight']);
export const strikeReversed = (strike) => REVERSED_STRIKES.includes(strike);

export const MW_SHOOT_ATTACK = 'shoot';

export function mwAttackType(strike, { bow = false } = {}) {
  if (bow) return MW_SHOOT_ATTACK;
  return DF_STRIKE_TO_MW_ATTACK[strike] ?? null;
}

// The attack type is a prefix on text keys inside the long group, never part of the group name. Strength is small
// below 0.33, medium below 0.66, else large; shoot has no strength word.
export function attackKeys(attackType, strength = 0, { reversed = false } = {}) {
  const shoot = attackType === MW_SHOOT_ATTACK;
  const hit = shoot ? 'release' : 'hit';
  const word = strength < 0.33 ? 'small' : strength < 0.66 ? 'medium' : 'large';
  const windUp = { start: `${attackType} start`, stop: `${attackType} max attack` };
  const release = { start: `${attackType} max attack`, stop: `${attackType} ${hit}` };
  const follow = shoot
    ? { start: `${attackType} follow start`, stop: `${attackType} follow stop` }
    : { start: `${attackType} ${word} follow start`, stop: `${attackType} ${word} follow stop` };
  // A backhand swaps the wind-up and follow sections but keeps each key pair in file order, since `resetClip` needs
  // start before stop. The pose reads the time reversed.
  const back = reversed && !shoot;
  return {
    reversed: back,
    windUp: back ? follow : windUp,
    release,
    follow: back ? windUp : follow,
    hitKey: `${attackType} ${hit}`,
    minAttack: `${attackType} min attack`,
    maxAttack: `${attackType} max attack`,
    minHit: `${attackType} min hit`,
  };
}

/**
 * Returns -1 when the wind-up window is missing. Callers must not read -1 as no charge, since the reference
 * replaces it with a random strength.
 * @param currentTime
 * @param minAttackTime
 * @param maxAttackTime
 */
export function calculateWindUp(currentTime, minAttackTime, maxAttackTime) {
  if (minAttackTime === -1 || minAttackTime >= maxAttackTime) return -1;
  const f = (currentTime - minAttackTime) / (maxAttackTime - minAttackTime);
  return Math.min(1, Math.max(0, f));
}

// Each term is an ordering test, not a sentinel test, so a missing 'min hit' (-1) fails `maxAttackTime <=
// minHitTime` by itself.
export function releaseStartPoint(strength, { minAttackTime, maxAttackTime, minHitTime, hitTime }) {
  if (minAttackTime === -1 || minAttackTime >= maxAttackTime) return 0;
  let startPoint = 1 - strength;
  if (maxAttackTime <= minHitTime && minHitTime < hitTime) {
    startPoint *= (minHitTime - maxAttackTime) / (hitTime - maxAttackTime);
  }
  return startPoint;
}

export const EQUIP_KEYS = Object.freeze({ start: 'equip start', stop: 'equip stop', attach: 'equip attach' });
export const UNEQUIP_KEYS = Object.freeze({ start: 'unequip start', stop: 'unequip stop', detach: 'unequip detach' });

export const WEAPON_SHORT_GROUP = Object.freeze({
  [MW_WEAPON_TYPE.ShortBladeOneHand]: '1s',
  [MW_WEAPON_TYPE.LongBladeOneHand]: '1h',
  [MW_WEAPON_TYPE.BluntOneHand]: '1b',
  [MW_WEAPON_TYPE.AxeOneHand]: '1b',
  [MW_WEAPON_TYPE.LongBladeTwoHand]: '2c',
  [MW_WEAPON_TYPE.AxeTwoHand]: '2b',
  [MW_WEAPON_TYPE.BluntTwoClose]: '2b',
  [MW_WEAPON_TYPE.BluntTwoWide]: '2w',
  [MW_WEAPON_TYPE.SpearTwoWide]: '2w',
  [MW_WEAPON_TYPE.MarksmanBow]: 'bow',
  [MW_WEAPON_TYPE.MarksmanCrossbow]: 'crossbow',
  [MW_WEAPON_TYPE.MarksmanThrown]: '1t',
  [MW_WEAPON_TYPE.HandToHand]: 'hh',
  [MW_WEAPON_TYPE.Spell]: 'spell',
  [MW_WEAPON_TYPE.PickProbe]: '1h',
  [MW_WEAPON_TYPE.None]: '',
});

export const WEAPON_LONG_GROUP = Object.freeze({
  [MW_WEAPON_TYPE.ShortBladeOneHand]: 'shortbladeonehand',
  [MW_WEAPON_TYPE.LongBladeOneHand]: 'weapononehand',
  [MW_WEAPON_TYPE.BluntOneHand]: 'bluntonehand',
  [MW_WEAPON_TYPE.AxeOneHand]: 'bluntonehand',
  [MW_WEAPON_TYPE.LongBladeTwoHand]: 'weapontwohand',
  [MW_WEAPON_TYPE.AxeTwoHand]: 'blunttwohand',
  [MW_WEAPON_TYPE.BluntTwoClose]: 'blunttwohand',
  [MW_WEAPON_TYPE.BluntTwoWide]: 'weapontwowide',
  [MW_WEAPON_TYPE.SpearTwoWide]: 'weapontwowide',
  [MW_WEAPON_TYPE.MarksmanBow]: 'bowandarrow',
  [MW_WEAPON_TYPE.MarksmanCrossbow]: 'crossbow',
  [MW_WEAPON_TYPE.MarksmanThrown]: 'throwweapon',
  [MW_WEAPON_TYPE.HandToHand]: 'handtohand',
  [MW_WEAPON_TYPE.Spell]: 'spellcast',
  [MW_WEAPON_TYPE.PickProbe]: 'pickprobe',
  [MW_WEAPON_TYPE.None]: '',
});

export const weaponShortGroup = (type) => WEAPON_SHORT_GROUP[type] ?? '';
export const weaponLongGroup = (type) => WEAPON_LONG_GROUP[type] ?? '';

export function allWeaponShortGroups() {
  const set = new Set();
  for (let type = MW_WEAPON_TYPE.PickProbe; type <= MW_WEAPON_TYPE.Bolt; type++) {
    const shortGroup = weaponShortGroup(type);
    if (shortGroup) set.add(shortGroup);
  }
  return [...set].sort();
}

// Spell and hand-to-hand carry the TwoHanded bit and class Melee, so the bit is always tested together with the
// class.
export const MW_WEAPON_CLASS = Object.freeze({
  Melee: 0, Ranged: 1, Thrown: 2, Ammo: 3,
});
export const MW_TWO_HANDED = 0x01;
export const MW_HAS_HEALTH = 0x02;

export const WEAPON_CLASS = Object.freeze({
  [MW_WEAPON_TYPE.None]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.PickProbe]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.Spell]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.HandToHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.ShortBladeOneHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.LongBladeOneHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.BluntOneHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.AxeOneHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.LongBladeTwoHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.AxeTwoHand]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.BluntTwoClose]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.BluntTwoWide]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.SpearTwoWide]: MW_WEAPON_CLASS.Melee,
  [MW_WEAPON_TYPE.MarksmanBow]: MW_WEAPON_CLASS.Ranged,
  [MW_WEAPON_TYPE.MarksmanCrossbow]: MW_WEAPON_CLASS.Ranged,
  [MW_WEAPON_TYPE.MarksmanThrown]: MW_WEAPON_CLASS.Thrown,
  [MW_WEAPON_TYPE.Arrow]: MW_WEAPON_CLASS.Ammo,
  [MW_WEAPON_TYPE.Bolt]: MW_WEAPON_CLASS.Ammo,
});

export const WEAPON_FLAGS = Object.freeze({
  [MW_WEAPON_TYPE.None]: 0,
  [MW_WEAPON_TYPE.PickProbe]: 0,
  [MW_WEAPON_TYPE.Spell]: MW_TWO_HANDED,
  [MW_WEAPON_TYPE.HandToHand]: MW_TWO_HANDED,
  [MW_WEAPON_TYPE.ShortBladeOneHand]: MW_HAS_HEALTH,
  [MW_WEAPON_TYPE.LongBladeOneHand]: MW_HAS_HEALTH,
  [MW_WEAPON_TYPE.BluntOneHand]: MW_HAS_HEALTH,
  [MW_WEAPON_TYPE.AxeOneHand]: MW_HAS_HEALTH,
  [MW_WEAPON_TYPE.LongBladeTwoHand]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.AxeTwoHand]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.BluntTwoClose]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.BluntTwoWide]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.SpearTwoWide]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.MarksmanBow]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.MarksmanCrossbow]: MW_HAS_HEALTH | MW_TWO_HANDED,
  [MW_WEAPON_TYPE.MarksmanThrown]: 0,
  [MW_WEAPON_TYPE.Arrow]: 0,
  [MW_WEAPON_TYPE.Bolt]: 0,
});

export const weaponClass = (type) => WEAPON_CLASS[type] ?? MW_WEAPON_CLASS.Melee;
export const weaponFlags = (type) => WEAPON_FLAGS[type] ?? 0;

// PickProbe counts as a real weapon. Bare fists, a readied spell, and an empty hand never borrow a weapon animation
// when their own is missing.
export function isRealWeapon(type) {
  return type !== MW_WEAPON_TYPE.HandToHand
    && type !== MW_WEAPON_TYPE.Spell
    && type !== MW_WEAPON_TYPE.None;
}

// Both terms matter: bows carry the TwoHanded bit but are Ranged, so they take the one-handed ladder.
export function isTwoHandedMelee(type) {
  return !!(weaponFlags(type) & MW_TWO_HANDED)
    && weaponClass(type) === MW_WEAPON_CLASS.Melee;
}

/**
 * A non-weapon falls straight to the bare base group, so bare hands idle in 'idle', not the sword stance 'idle1h'.
 * A real weapon tries its short group, then 2c or 1h, then the bare base.
 * @param base
 * @param type
 * @param hasGroup
 */
export function composeStanceGroup(base, type, hasGroup) {
  const short = weaponShortGroup(type);
  const asked = short ? `${base}${short}` : base;
  if (hasGroup(asked)) return { group: asked, fallback: null };
  if (!isRealWeapon(type)) {
    return hasGroup(base) ? { group: base, fallback: 'bare' } : { group: null, fallback: null };
  }
  const ladder = isTwoHandedMelee(type)
    ? `${base}${WEAPON_SHORT_GROUP[MW_WEAPON_TYPE.LongBladeTwoHand]}`
    : `${base}${WEAPON_SHORT_GROUP[MW_WEAPON_TYPE.LongBladeOneHand]}`;
  if (ladder !== asked && hasGroup(ladder)) return { group: ladder, fallback: 'short' };
  if (hasGroup(base)) return { group: base, fallback: 'bare' };
  return { group: null, fallback: null };
}

// Only real weapons fall back, so a missing 'handtohand' stays missing and the arm does not mime a sword swing.
export function movementAnimState({
  forward = 0, strafe = 0, running = false, sneaking = false,
  turning = 0, thirdPerson = false,
} = {}) {
  const prefix = sneaking ? 'sneak' : running ? 'run' : 'walk';
  const strafing = Math.abs(strafe) > Math.abs(forward) * 2;
  if (strafing) return strafe > 0 ? `${prefix}right` : `${prefix}left`;
  if (forward !== 0 || strafe !== 0) return forward >= 0 ? `${prefix}forward` : `${prefix}back`;
  if (turning && thirdPerson && !sneaking) return turning > 0 ? 'turnright' : 'turnleft';
  return null;
}

export function composeMovementGroup(base, type, hasGroup) {
  const short = weaponShortGroup(type);
  let name = base;
  if (short && type === MW_WEAPON_TYPE.Spell && (base === 'turnleft' || base === 'turnright')) {
    const prefixed = `${short}${base}`;
    name = hasGroup(prefixed) ? prefixed : base;
  } else if (short) {
    const r = composeStanceGroup(base, type, hasGroup);
    name = r.group ?? base;
  }
  if (!hasGroup(name)) {
    const walked = name.replace('run', 'walk');
    if (walked !== name && hasGroup(walked)) return { group: walked, walked: true };
    return { group: null, walked: false };
  }
  return { group: name, walked: false };
}

/** @returns {{ jump: 'inair'|'landing'|null, inJump: boolean }} */
export function jumpAnimState({ grounded = true, swimming = false, levitating = false,
  jumpQueued = false, priorInAir = false, jumpPlaying = false } = {}) {
  let inJump = false;
  let jump = null;
  if (!swimming && !levitating) {
    if (!grounded) { inJump = true; jump = 'inair'; }
    else if (!priorInAir && jumpQueued) inJump = true;
  }
  if (!inJump && jumpPlaying) jump = 'landing';
  return { jump, inJump };
}

export const MOVEMENT_FALLBACK_SPEED = Object.freeze({
  sneak: 33.5452, run: 222.857, walk: 154.064,
});

export const MOVEMENT_SPEED_CAP = 10;

export const turnAnimSpeed = (yawRatePerSec) =>
  Math.min(1.5, Math.abs(yawRatePerSec) / Math.PI);

export function composeWeaponGroup(type, hasGroup) {
  const asked = weaponLongGroup(type);
  if (asked && hasGroup(asked)) return { group: asked, fallback: null };
  if (!isRealWeapon(type)) return { group: null, fallback: null };
  const ladder = isTwoHandedMelee(type)
    ? WEAPON_LONG_GROUP[MW_WEAPON_TYPE.LongBladeTwoHand]
    : WEAPON_LONG_GROUP[MW_WEAPON_TYPE.LongBladeOneHand];
  if (ladder !== asked && hasGroup(ladder)) return { group: ladder, fallback: 'long' };
  return { group: null, fallback: null };
}

export const WEAPON_AMMO_TYPE = Object.freeze({
  [MW_WEAPON_TYPE.MarksmanBow]: MW_WEAPON_TYPE.Arrow,
  [MW_WEAPON_TYPE.MarksmanCrossbow]: MW_WEAPON_TYPE.Bolt,
});
export const ammoTypeFor = (type) => WEAPON_AMMO_TYPE[type] ?? MW_WEAPON_TYPE.None;

// The ammo bone is looked up in the actor skeleton first, then as 'ArrowBone' inside the weapon mesh, which retail
// bows use. That arrow inherits the bow's mirror.
export const ARROW_FALLBACK_NODE = 'ArrowBone';
export function arrowAttachBone(weaponType) {
  const ammo = ammoTypeFor(weaponType);
  if (ammo === MW_WEAPON_TYPE.None) return null;
  return WEAPON_ATTACH_BONE[ammo] ?? null;
}

// A crossbow reloads itself at the end of equip, attack, or cast, while a bow waits for the next 'shoot attach'
// key. No Daggerfall weapon maps to a crossbow today.
export const reloadsItself = (type) => type === MW_WEAPON_TYPE.MarksmanCrossbow;

export const shootsRatherThanSwings = (type) => {
  const cls = weaponClass(type);
  return cls === MW_WEAPON_CLASS.Ranged || cls === MW_WEAPON_CLASS.Thrown;
};

export const DEFAULT_WEAPON_BONE = 'Weapon Bone';

export const weaponAttachBone = (type) => WEAPON_ATTACH_BONE[type] ?? DEFAULT_WEAPON_BONE;

function readWeapon(bytes, rec) {
  const e = { id: '', model: '', name: '', type: MW_WEAPON_TYPE.None, enchanted: false, speed: 1 };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'ENAM') e.enchanted = true;
    else if (sub.name === 'WPDT') {
      if (sub.len < 32) continue;
      // WPDT mType is the int16 at byte 8, after a float weight and an int32 value. Byte 10 holds mHealth.
      const dv = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 32);
      e.type = dv.getInt16(8, true);
      // mSpeed at byte 12 is the only record field that changes attack speed, and only for the three attack
      // sections. Equip and unequip play at speed 1.
      e.speed = dv.getFloat32(12, true);
    }
  }
  return e.id && e.model ? e : null;
}

export const CREA_FLAG = Object.freeze({ Bipedal: 0x01, Respawn: 0x02, Weapon: 0x04, Base: 0x08, Swims: 0x10, Flies: 0x20, Walks: 0x40, Essential: 0x80 });

function readCreature(bytes, rec) {
  const e = { id: '', model: '', name: '', flags: 0, scale: 1 };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'FLAG' && sub.len >= 4) e.flags = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getInt32(0, true) & 0xff;
    else if (sub.name === 'XSCL' && sub.len >= 4) e.scale = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getFloat32(0, true);
  }
  return e.id && e.model ? e : null;
}

export function creatureRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'CREA') continue;
    const e = readCreature(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

export function weaponRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'WEAP') continue;
    const e = readWeapon(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

// LHDT flags are the int32 at byte 20: Carry is 0x2 and Fire 0x10. Only a carriable light goes in the hand, since
// wall sconces are LIGH records too.
export const MW_LIGHT_CARRY = 0x2;
export const MW_LIGHT_FIRE = 0x10;
function readLight(bytes, rec) {
  const e = { id: '', model: '', name: '', carry: false, fire: false, flags: 0 };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'LHDT') {
      if (sub.len < 24) continue;
      const dv = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 24);
      e.flags = dv.getInt32(20, true);
      e.carry = (e.flags & MW_LIGHT_CARRY) !== 0;
      e.fire = (e.flags & MW_LIGHT_FIRE) !== 0;
    }
  }
  return e.id && e.model ? e : null;
}

function readMagicEffect(bytes, rec) {
  const e = { index: -1, school: 0, flags: 0, color: [255, 255, 255], speed: 1, particle: '', casting: '', bolt: '', hit: '', area: '' };
  for (const sub of subrecords(bytes, rec)) {
    const dv = () => new DataView(bytes.buffer, bytes.byteOffset + sub.start, sub.len);
    if (sub.name === 'INDX' && sub.len >= 4) e.index = dv().getInt32(0, true);
    else if (sub.name === 'MEDT') {
      if (sub.len < 36) continue;
      const d = dv();
      e.school = d.getInt32(0, true);
      e.flags = d.getInt32(8, true) & (0x200 | 0x400 | 0x800);
      e.color = [d.getInt32(12, true), d.getInt32(16, true), d.getInt32(20, true)];
      e.speed = d.getFloat32(28, true);
    } else if (sub.name === 'PTEX') e.particle = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'CVFX') e.casting = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'BVFX') e.bolt = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'HVFX') e.hit = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'AVFX') e.area = zstr(bytes, sub.start, sub.len).toLowerCase();
  }
  return e.index >= 0 && e.index < 256 ? e : null;
}

export function magicEffectRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'MGEF') continue;
    const e = readMagicEffect(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

function readStatic(bytes, rec) {
  const e = { id: '', model: '' };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
  }
  return e.id && e.model ? e : null;
}
export const VFX_STATIC_PREFIX = 'vfx_';
function vfxStatics(byId, effects) {
  const named = new Set(effects.flatMap((m) => [m.casting, m.bolt, m.hit, m.area]).filter(Boolean));
  return [...byId.values()].filter((e) => e.id.startsWith(VFX_STATIC_PREFIX) || named.has(e.id));
}

export function vfxStaticRecords(bytes) {
  const byId = new Map();
  const effects = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type === 'STAT') { const e = readStatic(bytes, rec); if (e) byId.set(e.id, e); }
    else if (rec.type === 'MGEF') { const m = readMagicEffect(bytes, rec); if (m) effects.push(m); }
  }
  return vfxStatics(byId, effects);
}

export function lightRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'LIGH') continue;
    const e = readLight(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

export function pickTorchRecord(lights, { has = null } = {}) {
  return pickCarriedLight(lights, /torch/, 'torch', has);
}
export function pickLanternRecord(lights, { has = null } = {}) {
  return pickCarriedLight(lights, /lantern/, null, has);
}
function pickCarriedLight(lights, named, exactId, has) {
  const cands = (lights ?? []).filter((l) => l && l.carry && l.model && named.test(l.id)
    && (!has || has(`meshes/${l.model}`)));
  if (!cands.length) return null;
  const exact = exactId ? cands.find((l) => l.id === exactId) : null;
  if (exact) return exact;
  return cands.slice().sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

export function blendMaskBones(skeleton, rootName = 'bip01 l clavicle') {
  const out = new Set();
  if (!skeleton || !skeleton.nodes) return out;
  const want = String(rootName).toLowerCase();
  for (const [ref, node] of skeleton.nodes) {
    let at = ref;
    let hops = 0;
    while (at !== undefined && at !== null && at >= 0 && hops++ < 256) {
      const n = skeleton.nodes.get(at);
      if (!n) break;
      if (String(n.name || '').toLowerCase() === want) { out.add(String(node.name || '').toLowerCase()); break; }
      at = n.parent;
    }
  }
  return out;
}

// The overlay wins the mask bones and the base keeps the rest. Overlay tracks sample at the overlay clock, and a
// mask bone the overlay does not key uses the base track.
export function overlayTracks(base, overlay, bones) {
  const out = new Map(base ?? []);
  if (overlay && bones) {
    for (const [name, t] of overlay) if (bones.has(name) && t) out.set(name, { __overlay: t });
  }
  return out;
}
export function overlaySampler(sampleTrack, clock) {
  const at = typeof clock === 'function' ? clock : () => clock;
  return (track, time) => (track && track.__overlay ? sampleTrack(track.__overlay, at()) : sampleTrack(track, time));
}

// An ARMO or CLOT MODL is the ground mesh. The worn shape comes from INDX part references, with BNAM naming the
// male body record and CNAM the female.
function readPartRef(bytes, sub, e, kind) {
  if (sub.name === 'INDX') {
    if (sub.len !== 1) throw new Error(`${kind} ${e.id}: INDX is ${sub.len} bytes`);
    e.parts.push({ part: bytes[sub.start], male: null, female: null });
  } else if (sub.name === 'BNAM' && e.parts.length) {
    e.parts[e.parts.length - 1].male = zstr(bytes, sub.start, sub.len).toLowerCase();
  } else if (sub.name === 'CNAM' && e.parts.length) {
    e.parts[e.parts.length - 1].female = zstr(bytes, sub.start, sub.len).toLowerCase();
  }
}

function readClothing(bytes, rec) {
  const e = { id: '', model: '', name: '', type: -1, enchanted: false, parts: [] };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'ENAM') e.enchanted = true;
    else if (sub.name === 'CTDT') {
      if (sub.len !== 12) throw new Error(`CLOT ${e.id}: CTDT is ${sub.len} bytes`);
      e.type = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getUint32(0, true);
    } else readPartRef(bytes, sub, e, 'CLOT');
  }
  return e.id && (e.model || e.parts.length) ? e : null;
}

export function clothingRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'CLOT') continue;
    const e = readClothing(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

export function raceBeastFlag(bytes, raceId) {
  const rec = raceRecords(bytes).get(String(raceId || '').toLowerCase());
  return rec && rec.radt ? rec.beast : null;
}

function readArmor(bytes, rec) {
  const e = { id: '', model: '', name: '', enchanted: false, parts: [] };
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') e.id = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'MODL') e.model = zstr(bytes, sub.start, sub.len).replace(/\\/g, '/').toLowerCase();
    else if (sub.name === 'FNAM') e.name = zstr(bytes, sub.start, sub.len);
    else if (sub.name === 'ENAM') e.enchanted = true;
    else readPartRef(bytes, sub, e, 'ARMO');
  }
  return e.id && e.model ? e : null;
}

export function armorRecords(bytes) {
  const out = [];
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'ARMO') continue;
    const e = readArmor(bytes, rec);
    if (e) out.push(e);
  }
  return out;
}

/** @returns */
function readGmst(bytes, rec) {
  let name = '';
  let value = null;
  for (const sub of subrecords(bytes, rec)) {
    if (sub.name === 'NAME') name = zstr(bytes, sub.start, sub.len).toLowerCase();
    else if (sub.name === 'INTV' && sub.len >= 4) {
      value = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getInt32(0, true);
    } else if (sub.name === 'FLTV' && sub.len >= 4) {
      value = new DataView(bytes.buffer, bytes.byteOffset + sub.start, 4).getFloat32(0, true);
    } else if (sub.name === 'STRV') value = zstr(bytes, sub.start, sub.len);
  }
  return { name, value };
}

export function gmstValue(bytes, id) {
  const want = String(id).toLowerCase();
  for (const rec of walkEsm(bytes)) {
    if (rec.type !== 'GMST') continue;
    const g = readGmst(bytes, rec);
    if (g.name === want) return g.value;
  }
  return null;
}

export const GMST_SNEAK_DELTA = 'i1stpersonsneakdelta';

export const ARM_GMST_IDS = Object.freeze([GMST_SNEAK_DELTA]);

// Bump when a reader changes what it returns, so a derived set from an older build is re-extracted instead of read
// wrong.
export const ARM_RECORDS_VERSION = 6;

export function extractArmRecords(bytes, { gmst = ARM_GMST_IDS } = {}) {
  const want = new Set(gmst.map((id) => String(id).toLowerCase()));
  const out = { version: ARM_RECORDS_VERSION, parts: [], races: [], armors: [], clothes: [], weapons: [], lights: [], magicEffects: [], statics: [], creatures: [], gmst: {} };
  const races = new Map();
  const statics = new Map();
  for (const rec of walkEsm(bytes)) {
    switch (rec.type) {
      case 'BODY': out.parts.push(readBodyPart(bytes, rec)); break;
      case 'RACE': { const e = readRace(bytes, rec); if (e) races.set(e.id, e); break; }
      case 'ARMO': { const e = readArmor(bytes, rec); if (e) out.armors.push(e); break; }
      case 'CLOT': { const e = readClothing(bytes, rec); if (e) out.clothes.push(e); break; }
      case 'WEAP': { const e = readWeapon(bytes, rec); if (e) out.weapons.push(e); break; }
      case 'CREA': { const e = readCreature(bytes, rec); if (e) out.creatures.push(e); break; }
      case 'LIGH': { const e = readLight(bytes, rec); if (e) out.lights.push(e); break; }
      case 'MGEF': { const e = readMagicEffect(bytes, rec); if (e) out.magicEffects.push(e); break; }
      case 'STAT': { const e = readStatic(bytes, rec); if (e) statics.set(e.id, e); break; }
      case 'GMST': {
        const g = readGmst(bytes, rec);
        if (want.has(g.name) && !Object.hasOwn(out.gmst, g.name)) out.gmst[g.name] = g.value;
        break;
      }
      default: break;
    }
  }
  out.races = [...races.entries()];
  out.statics = vfxStatics(statics, out.magicEffects);
  return out;
}

export function isArmRecords(r) {
  return !!r && typeof r === 'object' && r.version === ARM_RECORDS_VERSION
    && ['parts', 'races', 'armors', 'clothes', 'weapons', 'lights', 'magicEffects', 'statics', 'creatures'].every((k) => Array.isArray(r[k]))
    && !!r.gmst && typeof r.gmst === 'object';
}

export function sneakOffset(sneaking, delta) {
  return sneaking && delta ? [0, 0, -delta] : [0, 0, 0];
}

// A decision for this game, keyed by template index because Daggerfall weapon types fold one- and two-handers
// together. The Daggerfall Battle Axe is the one-hander and its War Axe the two-hander, the reverse of Morrowind.
export const DF_TO_MW_WEAPON = Object.freeze({
  Dagger: MW_WEAPON_TYPE.ShortBladeOneHand,
  Tanto: MW_WEAPON_TYPE.ShortBladeOneHand,
  Shortsword: MW_WEAPON_TYPE.ShortBladeOneHand,
  Wakazashi: MW_WEAPON_TYPE.ShortBladeOneHand,
  Broadsword: MW_WEAPON_TYPE.LongBladeOneHand,
  Saber: MW_WEAPON_TYPE.LongBladeOneHand,
  Longsword: MW_WEAPON_TYPE.LongBladeOneHand,
  Katana: MW_WEAPON_TYPE.LongBladeOneHand,
  Claymore: MW_WEAPON_TYPE.LongBladeTwoHand,
  Dai_Katana: MW_WEAPON_TYPE.LongBladeTwoHand,
  Mace: MW_WEAPON_TYPE.BluntOneHand,
  Flail: MW_WEAPON_TYPE.BluntOneHand,
  Warhammer: MW_WEAPON_TYPE.BluntTwoClose,
  Staff: MW_WEAPON_TYPE.BluntTwoWide,
  War_Axe: MW_WEAPON_TYPE.AxeTwoHand,
  Battle_Axe: MW_WEAPON_TYPE.AxeOneHand,
  Short_Bow: MW_WEAPON_TYPE.MarksmanBow,
  Long_Bow: MW_WEAPON_TYPE.MarksmanBow,
});

// Material rows follow the measured sprite colors, not lore: elven reads as silver, mithril and adamantium as
// ebony, and orcish as glass. Each value is a chain tried in order.
export const DF_TO_MW_MATERIAL = Object.freeze({
  Iron: ['iron'], Steel: ['steel'], Silver: ['silver'], Elven: ['silver', 'steel'],
  Dwarven: ['dwarven'], Mithril: ['ebony'], Adamantium: ['adamantium', 'ebony'],
  Ebony: ['ebony'], Orcish: ['glass', 'ebony'], Daedric: ['daedric'],
});

export function dfWeaponToMw(item, weaponsTable) {
  if (!item || item.werecreatureClaws) return MW_WEAPON_TYPE.None;
  const idx = item.templateIndex;
  for (const [name, tmpl] of Object.entries(weaponsTable ?? {})) {
    if (tmpl === idx && name in DF_TO_MW_WEAPON) return DF_TO_MW_WEAPON[name];
  }
  return MOD_WEAPON_TO_MW[idx] ?? MW_WEAPON_TYPE.None;
}

export const MOD_WEAPON_TO_MW = Object.freeze({
  513: MW_WEAPON_TYPE.AxeOneHand,
  514: MW_WEAPON_TYPE.BluntOneHand,
});

export function pickWeaponRecord(records, type, material = null, { has = null, shape = null } = {}) {
  const sorted = (records ?? []).filter((r) => r.type === type && !r.enchanted)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!sorted.length) return null;
  // Records come from every attached .esm but meshes only from attached .bsa files, so records whose mesh exists
  // are tried first. Only when none exists does the plain pick apply.
  const present = has ? sorted.filter((r) => has(`meshes/${r.model}`)) : sorted;
  const ofType = present.length ? present : sorted;
  const chain = material ? DF_TO_MW_MATERIAL[material] : null;
  for (const want of (Array.isArray(chain) ? chain : chain ? [chain] : [])) {
    const matches = ofType.filter((r) => r.id.includes(want));
    if (matches.length) return (shape && matches.find((r) => r.id.replace(/[^a-z]/g, '').endsWith(shape))) || matches[0];
  }
  return ofType[0];
}

export const SKIN_SWEEP_SLOTS = Object.freeze([
  'neck', 'chest', 'groin', 'hand', 'wrist', 'forearm', 'upperarm',
  'foot', 'ankle', 'knee', 'upperleg', 'tail',
]);

const ARM_SLOT_SET = new Set(['hand', 'wrist', 'forearm', 'upperarm']);

/**
 * Load-order sweep with the reference ladder: only playable skin parts of the race, hand slots may fall back to
 * third-person skins, and males fill for females. The last proper match wins.
 * @returns {Map}
 */
export function resolveBodyParts(parts, race, female, { firstPerson = false } = {}) {
  const want = String(race || '').toLowerCase();
  const isF = !!female;
  const out = new Map();
  for (const p of parts ?? []) {
    if (!p.playable || !p.skin) continue;
    if (p.race !== want) continue;
    const slot = p.slot;
    if (!SKIN_SWEEP_SLOTS.includes(slot)) continue;
    const isHand = ARM_SLOT_SET.has(slot);
    const sameGender = !!p.female === isF;
    if (firstPerson && isHand && !p.firstPerson) {
      const cur = out.get(slot);
      if (!cur && sameGender) out.set(slot, p);
      else if (cur && sameGender && !!cur.female !== isF) out.set(slot, p);
      else if (!cur && isF) out.set(slot, p);
      continue;
    }
    if (!!p.firstPerson !== !!firstPerson) continue;
    if (isF && !p.female) {
      const cur = out.get(slot);
      if (!cur) out.set(slot, p);
      else if (isHand && !cur.firstPerson && p.firstPerson) out.set(slot, p);
      continue;
    }
    if (isF !== !!p.female) continue;
    out.set(slot, p);
  }
  return out;
}

export function armReport(parts, race, female) {
  const want = String(race || '').toLowerCase();
  const fpResolved = resolveBodyParts(parts, race, female, { firstPerson: true });
  const tpResolved = resolveBodyParts(parts, race, female, { firstPerson: false });
  const rows = [];
  for (const slot of ARM_PARTS) {
    const forSlot = parts.filter((p) => p.race === want && p.slot === slot && p.skin && p.playable);
    const fp = forSlot.filter((p) => p.firstPerson);
    const tp = forSlot.filter((p) => !p.firstPerson);
    const resolved = fpResolved.get(slot) ?? null;
    const chosenFp = resolved && resolved.firstPerson ? resolved : null;
    const chosenTp = resolved && !resolved.firstPerson ? resolved : (tpResolved.get(slot) ?? null);
    rows.push({
      slot,
      firstPerson: chosenFp,
      thirdPersonFallback: chosenTp,
      verdict: chosenFp ? 'first-person record found'
        : chosenTp ? 'no .1st record - falls back to the third-person mesh (allowed for arms)'
          : 'NOTHING for this slot',
      counts: { firstPerson: fp.length, thirdPerson: tp.length },
    });
  }
  return rows;
}

// The face is the classic faceIndex modulo each pool's size, with pools sorted by record id, so old saves keep their
// face. This game's own pools replace the data's only when all their meshes are in the archives, so no index shifts.
export function facePools(parts, race, female, { has = null, own: ownAsked = false } = {}) {
  const own = ownAsked ? ownFacePools(race, female) : null;
  if (own && (!has || [...own.heads, ...own.hairs].every((r) => has(`meshes/${r.model}`)))) return { heads: own.heads, hairs: own.hairs };
  const want = String(race || '').toLowerCase();
  const pool = (slot) => {
    const forSlot = (parts ?? []).filter((p) => p.race === want && p.slot === slot
      && p.skin && p.playable && !p.firstPerson);
    const sexed = forSlot.filter((p) => p.female === !!female);
    return (sexed.length ? sexed : forSlot.filter((p) => !p.female))
      .slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  };
  return { heads: pool('head'), hairs: pool('hair') };
}

export const WEREWOLF_HEAD_ID = 'werewolfhead';
export const WEREWOLF_HAIR_ID = 'werewolfhair';
export function werewolfHeadRows(parts) {
  const byId = new Map();
  for (const p of parts ?? []) byId.set(String(p.id || '').toLowerCase(), p);
  return [
    { slot: 'head', record: byId.get(WEREWOLF_HEAD_ID) ?? null },
    { slot: 'hair', record: byId.get(WEREWOLF_HAIR_ID) ?? null },
  ];
}

export const curatedFace = (race, female, faceIndex, faceTable = FACE_TABLE) =>
  faceTable?.[String(race || '').toLowerCase()]?.[female ? 'female' : 'male']?.[String(faceIndex | 0)] ?? null;

export const poolRecord = (pool, id) => {
  const w = String(id || '').toLowerCase();
  return w ? pool.find((p) => String(p.id).toLowerCase() === w) ?? null : null;
};

export function curatedAnswersFace(pools, race, female, faceIndex, faceTable = FACE_TABLE) {
  const c = curatedFace(race, female, faceIndex, faceTable);
  return !!c && !!poolRecord(pools.heads, c.head) && !!poolRecord(pools.hairs, c.hair);
}

export function playerBodyRows(parts, race, female, { beast = false, faceIndex = 0, faceTable = FACE_TABLE, faceMatch = null, vampire = false, walk = null, has = null, ownHeads = false } = {}) {
  const want = String(race || '').toLowerCase();
  const resolved = resolveBodyParts(parts, race, female, { firstPerson: false });
  const rows = [];
  for (const slot of SKIN_SWEEP_SLOTS) {
    const forSlot = parts.filter((p) => p.race === want && p.slot === slot
      && p.skin && p.playable && !p.firstPerson);
    const chosen = resolved.get(slot) ?? null;
    if (!chosen && slot === 'tail' && !beast) continue;
    rows.push({
      slot,
      record: chosen,
      verdict: chosen ? 'third-person record found' : 'NOTHING for this slot',
      counts: { all: forSlot.length },
    });
  }
  const curated = curatedFace(race, female, faceIndex, faceTable);
  // Uses the matching sex's pool, else the male pool, never a mix, or the index would walk across sexes.
  const pools = facePools(parts, race, female, { has, own: ownHeads });
  for (const slot of ['head', 'hair']) {
    const sorted = slot === 'head' ? pools.heads : pools.hairs;
    let chosen = null;
    let how = null;
    const step = walk ? walk[slot] : null;
    if (sorted.length && Number.isInteger(step) && step >= 0) {
      chosen = sorted[step % sorted.length];
      how = 'walked for an NPC';
    } else if (sorted.length) {
      const wantId = curated ? String(curated[slot] || '').toLowerCase() : '';
      chosen = poolRecord(sorted, wantId);
      how = chosen ? 'curated' : null;
      if (!chosen && faceMatch?.[slot]) {
        chosen = poolRecord(sorted, faceMatch[slot]);
        how = chosen ? 'matched to the portrait' : null;
      }
      if (!chosen) {
        chosen = sorted[((faceIndex % sorted.length) + sorted.length) % sorted.length];
        how = wantId ? `derived (curated "${wantId}" is not in these archives)` : 'derived';
      }
    }
    rows.push({
      slot,
      record: chosen,
      verdict: chosen ? (how ? `third-person record found, ${how}` : 'third-person record found') : 'NOTHING for this slot',
      counts: { all: sorted.length },
    });
  }
  const vamp = vampire ? vampireHeadRecord(parts, race, female) : null;
  if (vamp) {
    const row = rows.find((r) => r.slot === 'head');
    if (row) { row.record = vamp; row.verdict = 'third-person record found, a vampire\'s (getVampireHead)'; }
  }
  return rows;
}

// The last skin head BODY record of the race and sex in load order. NotPlayable does not exclude it, since vampire
// heads are never offered at chargen.
export function vampireHeadRecord(parts, race, female) {
  const want = String(race || '').toLowerCase();
  let out = null;
  for (const p of parts ?? []) if (p.vampire && p.skin && p.slot === 'head' && p.female === !!female && p.race === want && !p.firstPerson) out = p;
  return out;
}

export function scanNifRecordTypes(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const census = new Map();
  const NAME = /^[A-Z][A-Za-z0-9_]{2,39}$/;
  for (let i = 0; i + 4 < bytes.length; i++) {
    const len = dv.getUint32(i, true);
    if (len < 3 || len > 40 || i + 4 + len > bytes.length) continue;
    let ok = true;
    for (let j = i + 4; j < i + 4 + len; j++) {
      const c = bytes[j];
      if (c < 0x30 || c > 0x7a || (c > 0x39 && c < 0x41) || (c > 0x5a && c < 0x61 && c !== 0x5f)) { ok = false; break; }
    }
    if (!ok) continue;
    const name = latin1(bytes.subarray(i + 4, i + 4 + len));
    if (!NAME.test(name)) continue;
    if (!/^Ni/.test(name) && !['RootCollisionNode', 'AvoidNode'].includes(name)) continue;
    census.set(name, (census.get(name) || 0) + 1);
    i += 3 + len;
  }
  return census;
}

export function skinVerdict(bytes) {
  const header = readNifHeader(bytes);
  if (!header.ok) return { ok: false, why: header.why };
  const census = scanNifRecordTypes(bytes);
  const skinInstances = census.get('NiSkinInstance') || 0;
  const shapes = (census.get('NiTriShape') || 0) + (census.get('NiTriStrips') || 0);
  return {
    ok: true,
    version: header.versionText,
    skinned: skinInstances > 0,
    skinInstances,
    shapes,
    census: [...census.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    method: 'record-type SCAN, not a parse - it can tell you a NiSkinInstance is present, nothing more',
  };
}

export function armMeshPaths(rows) {
  return rows.map((row) => {
    const rec = row.firstPerson || row.thirdPersonFallback || null;
    return {
      slot: row.slot,
      record: rec ? rec.id : null,
      firstPerson: !!row.firstPerson,
      path: rec && rec.model ? `meshes/${rec.model}` : null,
    };
  });
}

export async function parseMeshForPreview(bytes) {
  let parseNif; let flattenNif;
  try {
    ({ parseNif } = await import('./mwNifFile.js'));
    ({ flattenNif } = await import('./mwNifMesh.js'));
  } catch (err) {
    return { ok: false, error: `reader unavailable: ${err.message}` };
  }
  let nif;
  try {
    nif = parseNif(bytes);
  } catch (err) {
    return { ok: false, stage: 'parse', error: err.message };
  }
  let batches;
  try {
    batches = flattenNif(nif);
  } catch (err) {
    return { ok: false, stage: 'flatten', error: err.message };
  }
  const shapes = batches.map((b) => ({
    positions: b.positions,
    indices: b.indices,
    skinned: !!(b.skinned && b.skin),
    vertices: b.positions ? b.positions.length / 3 : 0,
    triangles: b.indices ? b.indices.length / 3 : 0,
  })).filter((s) => s.vertices > 0 && s.triangles > 0);
  if (!shapes.length) return { ok: false, stage: 'geometry', error: 'parsed, but it carries no drawable geometry' };
  return {
    ok: true,
    shapes,
    vertices: shapes.reduce((n, s) => n + s.vertices, 0),
    triangles: shapes.reduce((n, s) => n + s.triangles, 0),
    skinnedShapes: shapes.filter((s) => s.skinned).length,
    bounds: meshBounds(shapes),
  };
}

export function meshBounds(shapes) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const s of shapes) {
    const p = s.positions;
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < minX) minX = p[i];
      if (p[i] > maxX) maxX = p[i];
      if (p[i + 1] < minY) minY = p[i + 1];
      if (p[i + 1] > maxY) maxY = p[i + 1];
      if (p[i + 2] < minZ) minZ = p[i + 2];
      if (p[i + 2] > maxZ) maxZ = p[i + 2];
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function foldPieceBounds(pieces) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const s of pieces) {
    const p = s.positions;
    let aX = Infinity; let aY = Infinity; let aZ = Infinity;
    let bX = -Infinity; let bY = -Infinity; let bZ = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]; const y = p[i + 1]; const z = p[i + 2];
      if (x < aX) aX = x; if (x > bX) bX = x;
      if (y < aY) aY = y; if (y > bY) bY = y;
      if (z < aZ) aZ = z; if (z > bZ) bZ = z;
    }
    const b = s.box || (s.box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
    b.minX = aX; b.minY = aY; b.minZ = aZ; b.maxX = bX; b.maxY = bY; b.maxZ = bZ;
    if (aX < minX) minX = aX; if (bX > maxX) maxX = bX;
    if (aY < minY) minY = aY; if (bY > maxY) maxY = bY;
    if (aZ < minZ) minZ = aZ; if (bZ > maxZ) maxZ = bZ;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

export function frontViewMapper(bounds, w, h, pad = 8) {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1e-6);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  return (x, y, z) => [w / 2 + (x - cx) * scale, h / 2 - (z - cz) * scale];
}

export async function skeletonReport(bytes) {
  let parseNif; let buildSkeleton;
  try {
    ({ parseNif } = await import('./mwNifFile.js'));
    ({ buildSkeleton } = await import('./mwSkin.js'));
  } catch (err) {
    return { ok: false, error: `reader unavailable: ${err.message}` };
  }
  let skel;
  try {
    skel = buildSkeleton(parseNif(bytes));
  } catch (err) {
    return { ok: false, stage: 'parse', error: err.message };
  }
  const names = [...skel.nodes.values()].map((n) => n.name).filter(Boolean);
  return {
    ok: true,
    boneCount: skel.nodes.size,
    names,
    has: (name) => skel.byName.has(String(name).toLowerCase()),
  };
}

export const FP_REQUIRED_BONES = Object.freeze([
  { name: 'Left Hand', why: 'hand, left side' },
  { name: 'Right Hand', why: 'hand, right side' },
  { name: 'Left Wrist', why: 'wrist, left side' },
  { name: 'Right Wrist', why: 'wrist, right side' },
  { name: 'Left Forearm', why: 'forearm, left side' },
  { name: 'Right Forearm', why: 'forearm, right side' },
  { name: 'Left Upper Arm', why: 'upper arm, left side' },
  { name: 'Right Upper Arm', why: 'upper arm, right side' },
  { name: 'Weapon Bone', why: 'every weapon type except the bow' },
  { name: 'Weapon Bone Left', why: 'the BOW, and only the bow (rule 8)' },
  { name: 'Bip01 Spine1', why: 'blend mask: Torso (rule 9)' },
  { name: 'Bip01 L Clavicle', why: 'blend mask: LeftArm' },
  { name: 'Bip01 R Clavicle', why: 'blend mask: RightArm' },
]);

export function checkRequiredBones(report) {
  if (!report || !report.ok) return [];
  return FP_REQUIRED_BONES.map((b) => ({ ...b, present: report.has(b.name) }));
}

// Binds only: skinned parts follow the skeleton, and rigid parts sit at a bone and mirror on the left. It ends with
// one `poseAssembly` call, so the rest pose is the pose at t = 0 with no tracks.
async function assemblyFns(parseNif) {
  const mod = {};
  ({ parseNif: mod.parseNif } = await import('./mwNifFile.js'));
  // A parsed NIF is never written after reading, so one parse serves every assembly that binds it.
  if (parseNif) mod.parseNif = parseNif;
  ({ buildSkeleton: mod.buildSkeleton, poseSkeleton: mod.poseSkeleton,
    skeletonSpaceMatrices: mod.skelMats, skinBatch: mod.skinBatch,
    accumRootRef: mod.accumRootRef, trackBinding: mod.trackBinding,
    injectSkeletonNodes: mod.injectSkeletonNodes } = await import('./mwSkin.js'));
  ({ bindPart: mod.bindPart, attachmentTransform: mod.attachmentTransform, bindCreatureModel: mod.bindCreatureModel } = await import('./mwCharacter.js'));
  ({ PART_BONES: mod.PART_BONES } = await import('./mwNpc.js'));
  return mod;
}

export async function assembleFirstPersonArm({ skeletonBytes, parts, boneSources = [], parseNif = null, offWeaponBone = false }) {
  let mod;
  try {
    mod = await assemblyFns(parseNif);
  } catch (err) {
    return { ok: false, error: `readers unavailable: ${err.message}` };
  }

  let skeleton, skeletonFile;
  try {
    skeletonFile = mod.parseNif(skeletonBytes);
    skeleton = mod.buildSkeleton(skeletonFile);
  } catch (err) {
    return { ok: false, stage: 'skeleton', error: err.message };
  }
  const pieces = [];
  const notes = [];
  const effects = [];
  const injected = [];
  for (const src of boneSources ?? []) {
    try {
      const r = mod.injectSkeletonNodes(skeleton, mod.parseNif(src.bytes));
      injected.push({ name: src.name, added: r.added, skipped: r.skipped });
    } catch (err) {
      notes.push(`bones: ${src.name}: ${err.message}`);
    }
  }
  // A skeleton without 'Weapon Bone Left', as every retail one is, gets one mirrored from its Weapon Bone, after
  // the addons and before any part binds.
  if (offWeaponBone) {
    const addon = offWeaponBoneAddon(skeleton, GRAPH_ROOT, mod.skelMats, skeletonFile);
    if (addon) {
      const r = mod.injectSkeletonNodes(skeleton, addon);
      injected.push({ name: WEAPON_BONE_LEFT_SOURCE, added: r.added, skipped: r.skipped });
    }
  }
  bindPartsInto({ pieces, notes, effects, skeleton, fns: mod }, parts);
  const assembly = {
    ok: pieces.length > 0,
    pieces,
    effects,
    notes,
    skeleton,
    fns: mod,
    bounds: null,
    injected,
    skinBinds: offWeaponBone ? mirrorBindSources({ nif: skeletonFile }) : null,
    error: pieces.length ? null : 'nothing bound - see the notes for why',
  };
  return pieces.length ? poseAssembly(assembly) : assembly;
}

export async function assembleCreature({ modelBytes, parseNif = null }) {
  let mod;
  try {
    mod = await assemblyFns(parseNif);
  } catch (err) {
    return { ok: false, error: `readers unavailable: ${err.message}` };
  }
  let nif, skeleton;
  try {
    nif = mod.parseNif(modelBytes);
    skeleton = mod.buildSkeleton(nif);
  } catch (err) {
    return { ok: false, stage: 'skeleton', error: err.message };
  }
  const notes = [];
  let bound;
  try {
    bound = mod.bindCreatureModel(skeleton, nif);
  } catch (err) {
    return { ok: false, stage: 'assembly', error: err.message };
  }
  if (bound.missingBones.length) notes.push(`creature: its skin names no node ${bound.missingBones.map((b) => `"${b}"`).join(', ')} - those influences are skipped (rule 40)`);
  const pieces = [];
  for (const batch of bound.skinned) {
    pieces.push({ slot: 'creature', bone: null, kind: 'skinned', mirrored: false, batch, source: null, attachRef: null,
      uvs: batch.uvs || null, colors: batch.colors || null, material: batch.material || null,
      positions: new Float32Array(batch.positions.length), indices: batch.indices, normals: posedNormals(batch) });
  }
  for (const { batch, attachRef, pre } of bound.rigid) {
    const normals = posedNormals(batch);
    pieces.push({ slot: 'creature', bone: null, kind: 'rigid', mirrored: false, tag: null, hang: null,
      batch: null, source: applyPre(batch.positions, pre), attachRef, boneOffset: null,
      uvs: batch.uvs || null, colors: batch.colors || null, material: batch.material || null, shape: batch.name || null,
      positions: new Float32Array(batch.positions.length), indices: batch.indices,
      sourceNormals: normals ? applyPreNormals(batch.normals, pre) : null, normals });
  }
  const effects = bound.effects.map(({ desc, attachRef, pre }) => ({ slot: 'creature', bone: null, mirrored: false, tag: null, hang: null,
    attachRef, boneOffset: null, pre, desc, material: desc.material }));
  const assembly = {
    ok: pieces.length > 0, pieces, effects, notes, skeleton, fns: mod, bounds: null, injected: [],
    dropped: bound.dropped,
    error: pieces.length ? null : 'the creature model has no shape to draw',
  };
  return pieces.length ? poseAssembly(assembly) : assembly;
}

export function bindPartsInto(assembly, parts) {
  const mod = assembly.fns;
  const { skeleton, pieces, notes } = assembly;
  const effects = assembly.effects ?? (assembly.effects = []);
  // The weapon's BoneOffset applies to the arrow inside its mesh, since 'weapon' always binds before 'arrow'. It
  // resets per call so a body without a weapon cannot inherit a stale one.
  let weaponBoneOffset = null;
  let sheathBoneOffset = null;
  for (const part of parts) {
    const bones = part.bones ?? mod.PART_BONES[part.slot] ?? [];
    if (part.skinFrom) { bindSkinnedFromBody(assembly, part, bones); continue; }
    let nif;
    try {
      nif = mod.parseNif(part.bytes);
    } catch (err) {
      notes.push(`${part.slot}: ${err.message}`);
      continue;
    }
    let tookNameless = false;
    const piecesBefore = pieces.length;
    let shapeCensus = null;
    for (const bone of bones.length ? bones : [null]) {
      if (bone && !skeleton.byName.has(bone.toLowerCase())) {
        notes.push(`${part.slot}: this skeleton has no bone "${bone}"`);
        continue;
      }
      let bound;
      try {
        bound = mod.bindPart(skeleton, nif, { ...(bone ? { attachBone: bone } : {}), underNode: part.underNode, excludeNode: part.excludeNode });
      } catch (err) {
        notes.push(`${part.slot} @ ${bone}: ${err.message}`);
        continue;
      }
      const bonePiecesBefore = pieces.length;
      if (bound.missingBones?.length) {
        const say = `${part.slot}: this skeleton has no bone `
          + `${bound.missingBones.map((b) => `"${b}"`).join(', ')} - `
          + 'those influences are skipped (rule 40)';
        if (!notes.includes(say)) notes.push(say);
      }
      shapeCensus ??= bound.skinned.map((b) => String(b.name || '').trim() || '(nameless)');

      // Skinned geometry is never mirrored: it picks its side by shape name and binds once per side, and only a
      // nameless shape binds once. Hair filters on the word 'hair', by the part's own name.
      const geomFilter = (part.partName ?? part.slot) === 'hair' ? 'hair' : bone;
      let namelessHere = false;
      for (const batch of bound.skinned) {
        const nameless = !String(batch.name || '').trim();
        if (nameless && tookNameless) continue;
        if (geomFilter && !shapeMatchesBone(batch.name, geomFilter)) continue;
        // `positions` must be the piece's own buffer, never an alias of `batch.positions`, which `poseAssembly`
        // reads every frame.
        pieces.push({ slot: part.slot, bone, kind: 'skinned', mirrored: false,
          batch, source: null, attachRef: null,
          uvs: batch.uvs || null, colors: batch.colors || null, material: batch.material || null,
          positions: new Float32Array(batch.positions.length), indices: batch.indices,
          normals: posedNormals(batch) });
        if (nameless) namelessHere = true;
      }
      tookNameless = tookNameless || namelessHere;

      // The skinned or rigid branch is per file. One skinned shape makes the whole file a rig, and its rigid
      // batches are noted and dropped, since the reference never draws them there.
      if (bound.attached.length && bound.skinned.length) {
        const say = `${part.slot}: ${bound.attached.length} unskinned shape(s) in a RIG file are not `
          + 'attached (attach.cpp:42-46 seeds only skinned geometry)';
        if (!notes.includes(say)) notes.push(say);
      } else if (bound.attached.length) {
        // The mirror is fixed at bind time from the resolved node's own name, tested case-sensitively for 'Left',
        // as the reference does.
        const nodeRef = bone ? skeleton.byName.get(bone.toLowerCase()) : null;
        const nodeName = nodeRef != null && skeleton.nodes.has(nodeRef) ? skeleton.nodes.get(nodeRef).name : (bone || '');
        const mirror = nodeName.includes('Left');
        for (const batch of bound.attached) {
          const normals = posedNormals(batch);
          pieces.push({ slot: part.slot, bone, kind: 'rigid', mirrored: mirror, tag: part.tag ?? null,
            hang: part.hang ?? null,
            batch: null, source: applyPre(batch.positions, part.preTransform), attachRef: bound.attachRef,
            // Ammunition never takes its own BoneOffset and attaches with identity under its parent. Inside the
            // weapon mesh it inherits the weapon's offset translation, but not under an actor 'Bip01 Arrow' bone.
            boneOffset: part.ammo
              ? (part.preTransform ? weaponBoneOffset : null)
              : part.bare
                ? (part.inheritOffsetFrom === 'sheath' ? sheathBoneOffset : null)
                : (bound.boneOffset || null),
            uvs: batch.uvs || null, colors: batch.colors || null, material: batch.material || null,
            shape: batch.name || null,
            clip: WEAPON_CLOCK_SLOTS.has(part.slot) ? { nif, batch } : null,
            preClip: part.preClip ? { ...part.preClip, local: batch.positions, localNormals: batch.normals ?? null } : null,
            positions: new Float32Array(batch.positions.length), indices: batch.indices,
            sourceNormals: normals ? applyPreNormals(batch.normals, part.preTransform) : null, normals });
        }
        for (const desc of bound.effects ?? []) {
          effects.push({
            slot: part.slot, bone, mirrored: mirror, tag: part.tag ?? null, hang: part.hang ?? null,
            attachRef: bound.attachRef, boneOffset: bound.boneOffset || null, pre: part.preTransform || null,
            desc, material: desc.material,
          });
        }
        if (part.slot === 'weapon') weaponBoneOffset = bound.boneOffset || null;
        if (part.slot === 'sheath') sheathBoneOffset = bound.boneOffset || null;
      }
      if (pieces.length === bonePiecesBefore && bone) {
        const named = bound.skinned
          .map((b) => String(b.name || '').trim())
          .filter((s) => s);
        if (named.length) {
          notes.push(`${part.slot} @ ${bone}: no shape matched - the mesh offers `
            + `${named.map((s) => `"${s}"`).join(', ')} (rule 15's filter is a `
            + 'case-insensitive prefix, "tri " stripped first)');
        }
      }
    }
    if (pieces.length === piecesBefore && shapeCensus && !shapeCensus.length) {
      notes.push(`${part.slot}: nothing bound - the mesh has no geometry to bind`);
    }
  }
}

// The camera tracks the 'Camera' node, else 'Head', with no third fallback and no height term in first person.
export function firstPersonCameraRef(skeleton) {
  const byName = skeleton && skeleton.byName;
  if (!byName) return -1;
  if (byName.has('camera')) return byName.get('camera');
  if (byName.has('head')) return byName.get('head');
  return -1;
}

export const FP_NECK_BONE = 'bip01 neck';

// The rotate factor is 0.75 at rest and jumps to 1.0 while an attack section plays, then decays at 0.5 per second,
// not per frame.
export const FP_NECK_ROTATE_FACTOR = 0.75;
export const FP_AIM_SPAN = 0.25;
export const FP_AIM_DECAY_PER_SECOND = 0.5;

export function aimingFactor(prev, accurate, dt) {
  if (accurate) return 1;
  return Math.max(0, (prev || 0) - dt * FP_AIM_DECAY_PER_SECOND);
}

export function neckRotateFactor(aim = 0) {
  return FP_NECK_ROTATE_FACTOR + FP_AIM_SPAN * aim;
}

const transpose33 = (m) => Float32Array.from([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);

// Divides the scale out of a rotation-times-scale matrix. Using the scaled matrix is right only at scale 1.
const rotationOf = (m) => {
  const s = Math.hypot(m[0], m[3], m[6]);
  if (!(s > 1e-8) || Math.abs(s - 1) < 1e-6) return m;
  const out = new Float32Array(9);
  for (let i = 0; i < 9; i++) out[i] = m[i] / s;
  return out;
};
export const rotNegX = (rad) => {
  const c = Math.cos(rad); const sn = Math.sin(rad);
  return Float32Array.from([1, 0, 0, 0, c, sn, 0, -sn, c]);
};

// In this game's column-vector convention the turn is local' = local * W^T * rotate * W, so the world becomes
// rotate * parent * local. Copying OSG's row-vector order turns by the wrong conjugate.
function rootSpaceTurn(local, w, rotate) {
  return mat33Mul(mat33Mul(mat33Mul(local, transpose33(w)), rotate), w);
}

export function applyFirstPersonNeck(skeleton, pose, rootRef, skelMats, pitch, aim = 0, offset = null) {
  const ref = skeleton && skeleton.byName ? skeleton.byName.get(FP_NECK_BONE) : undefined;
  const sinking = !!(offset && (offset[0] || offset[1] || offset[2]));
  if (ref === undefined || (!pitch && !sinking)) return false;
  const world = skelMats(skeleton, pose, rootRef).get(ref);
  if (!world) return false;
  const local = pose.get(ref) ?? skeleton.nodes.get(ref).rest;
  const w = rotationOf(world.a);
  const rotate = rotNegX(pitch * neckRotateFactor(aim));
  const rotation = rootSpaceTurn(local.rotation, w, rotate);
  let translation = local.translation;
  if (sinking) {
    const inv = transpose33(w);
    translation = [
      local.translation[0] + inv[0] * offset[0] + inv[1] * offset[1] + inv[2] * offset[2],
      local.translation[1] + inv[3] * offset[0] + inv[4] * offset[1] + inv[5] * offset[2],
      local.translation[2] + inv[6] * offset[0] + inv[7] * offset[1] + inv[8] * offset[2],
    ];
  }
  pose.set(ref, { rotation, translation, scale: local.scale });
  return true;
}

export function applyRotateController(skeleton, pose, rootRef, skelMats, ref, rotate) {
  if (ref === undefined || ref === null || !skeleton?.nodes?.has(ref)) return false;
  const world = skelMats(skeleton, pose, rootRef).get(ref);
  if (!world) return false;
  const local = pose.get(ref) ?? skeleton.nodes.get(ref).rest;
  const w = rotationOf(world.a);
  pose.set(ref, { rotation: rootSpaceTurn(local.rotation, w, rotate), translation: local.translation, scale: local.scale });
  return true;
}

// Only the weapon and the arrow under it run their controllers on the weapon clock. Other parts would use the
// lower-body clock, which this game does not drive.
export const WEAPON_CLOCK_SLOTS = Object.freeze(new Set(['weapon', 'arrow']));

export function posePartClocks(assembly, value, { frameTime = value, slots = WEAPON_CLOCK_SLOTS } = {}) {
  let moved = 0;
  for (const p of assembly.pieces ?? []) {
    if (p.kind !== 'rigid' || !slots.has(p.slot)) continue;
    if (p.preClip) {
      const t = nodeClockAt(p.preClip.nif, p.preClip.node, value, frameTime);
      if (t === null || t === p._clockAt) continue;
      const pre = nodeAffineAt(p.preClip.nif, p.preClip.node, t);
      writePre(p.preClip.local, pre, p.source);
      if (p.sourceNormals && p.preClip.localNormals) writePreNormals(p.preClip.localNormals, pre, p.sourceNormals);
      p._clockAt = t;
      p.sourceGen = (p.sourceGen | 0) + 1;
      moved++;
    } else if (p.clip && batchMoves(p.clip.nif, p.clip.batch)) {
      const t = clockFor(p.clip.batch.animFlags | 0, value, frameTime);
      if (t === p._clockAt) continue;
      posePartBatch(p.clip.nif, p.clip.batch, t, p.source, p.sourceNormals);
      p._clockAt = t;
      p.sourceGen = (p.sourceGen | 0) + 1;
      moved++;
    }
  }
  return moved;
}

// Recomputes only the pose, skeleton matrices, skinned buffers, and rigid attach affines. Bind results and the draw
// mapper stay fixed, so the picture does not renormalize every frame.
export function poseAssembly(assembly, { tracks = null, sampleTrack = null,
  time = 0, accumRoot = null, neckPitch = 0, neckAim = 0, neckOffset = null, climb = null, skin = true, mirror = null, run = null, hold = null, motion = null, aim = null } = {}) {
  const { fns, skeleton, pieces } = assembly;
  if (!fns || !skeleton) return assembly;
  if (mirror?.plane && mirror.plane.binds === undefined) mirror.plane.binds = mirrorBindsOf(assembly);
  const pose = fns.poseSkeleton(skeleton, tracks, sampleTrack, time, { accumRoot });
  assembly.mirrored = mirror ? applyMirrorRig(skeleton, pose, GRAPH_ROOT, fns.skelMats, mirrorWithPoses(mirror, fns, skeleton, accumRoot)) : null;
  applyFirstPersonNeck(skeleton, pose, GRAPH_ROOT, fns.skelMats, neckPitch, neckAim, neckOffset);
  assembly.aimFit = aim ? aim(skeleton, pose, GRAPH_ROOT, fns.skelMats) : null;
  // Runs after the mirror and before the run, climb, seat, and long-gun hold, which win the bones they ask for.
  assembly.motionFit = motion ? motion(skeleton, pose, GRAPH_ROOT, fns.skelMats) : null;
  // Runs before the climb, which eases each wrist on from where the run left it, so the two blend.
  assembly.runFit = run ? applyClimbRig(skeleton, pose, GRAPH_ROOT, fns.skelMats, run) : null;
  assembly.climbFit = climb ? applyClimbRig(skeleton, pose, GRAPH_ROOT, fns.skelMats, climb) : null;
  assembly.holdFit = hold ? hold(skeleton, pose, GRAPH_ROOT, fns.skelMats) : null;
  const mats = fns.skelMats(skeleton, pose, GRAPH_ROOT);
  // With `skin: false` the GPU blends the pieces from the palette, so their CPU positions and bounds stay as they
  // were and `cpuSkinned` says so.
  assembly.cpuSkinned = skin !== false;
  if (!assembly.cpuSkinned) {
    assembly.pose = pose;
    assembly.mats = mats;
    assembly.time = time;
    if (assembly.afterPose) assembly.afterPose(assembly);
    return assembly;
  }
  for (const p of pieces) {
    if (p.kind === 'skinned') {
      fns.skinBatch(p.batch, skeleton, pose, mats, p.positions, p.normals ?? null);
    } else {
      const at = fns.attachmentTransform(mats, p.attachRef);
      const placed = p.hang ? hangAffine(at, p.hang) : at;
      placeAtBone(p.source, placed, p.mirrored, p.positions, p.boneOffset);
      if (p.normals && p.sourceNormals) placeNormalsAtBone(p.sourceNormals, placed, p.mirrored, p.normals);
    }
  }
  assembly.pose = pose;
  assembly.mats = mats;
  assembly.time = time;
  if (assembly.afterPose) assembly.afterPose(assembly);
  assembly.bounds = pieces.length ? foldPieceBounds(pieces) : null;
  return assembly;
}

function mirrorBindsOf(assembly) {
  const n = assembly.pieces?.length ?? 0;
  if (assembly.mirrorBinds?.n !== n) assembly.mirrorBinds = { n, binds: [...(assembly.skinBinds ?? []), ...mirrorBindSources({ pieces: assembly.pieces })] };
  return assembly.mirrorBinds.binds;
}

function mirrorWithPoses(req, fns, skeleton, accumRoot) {
  if (!req.limbs) return req;
  const limbs = {};
  for (const side of ['L', 'R']) {
    const l = req.limbs[side];
    if (!l) continue;
    limbs[side] = l.clip && !l.pose
      ? { ...l, pose: fns.poseSkeleton(limbSkeleton(skeleton, GRAPH_ROOT, fns.skelMats, side, l), l.clip.tracks, l.clip.sampleTrack, l.clip.time, { accumRoot }) }
      : l;
  }
  return { ...req, limbs };
}

// A hanging part ignores the bone's rotation and maps v to rot * size * (v - anchor) + hook, so it hangs plumb from
// a point fixed to the bone. The result goes in the hang's own scratch, so a frame allocates nothing.
export function hangAffine(at, hang) {
  const out = hang._at ?? (hang._at = { a: new Float32Array(9), t: [0, 0, 0] });
  const s = hang.size > 0 ? hang.size : 1, r = hang.rot, A = out.a;
  for (let i = 0; i < 9; i++) A[i] = r[i] * s;
  const k = hang.hookLocal ?? ZERO3, n = hang.anchor ?? ZERO3, a = at.a;
  const hx = a[0] * k[0] + a[1] * k[1] + a[2] * k[2] + at.t[0];
  const hy = a[3] * k[0] + a[4] * k[1] + a[5] * k[2] + at.t[1];
  const hz = a[6] * k[0] + a[7] * k[1] + a[8] * k[2] + at.t[2];
  out.t[0] = hx - (A[0] * n[0] + A[1] * n[1] + A[2] * n[2]);
  out.t[1] = hy - (A[3] * n[0] + A[4] * n[1] + A[5] * n[2]);
  out.t[2] = hz - (A[6] * n[0] + A[7] * n[1] + A[8] * n[2]);
  return out;
}
const ZERO3 = Object.freeze([0, 0, 0]);

export function hangAnchor(pieces, hang) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pieces ?? []) {
    if (p.hang !== hang || !p.source) continue;
    const o = p.boneOffset;
    for (let v = 0; v < p.source.length; v += 3) {
      const x = (p.mirrored ? -p.source[v] : p.source[v]) + (o ? o[0] : 0);
      const y = p.source[v + 1] + (o ? o[1] : 0);
      const z = p.source[v + 2] + (o ? o[2] : 0);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  hang.anchor = Number.isFinite(maxZ) ? [(minX + maxX) / 2, (minY + maxY) / 2, maxZ] : [0, 0, 0];
  hang.height = Number.isFinite(maxZ) ? maxZ - minZ : 0;
  return hang.anchor;
}

export function hookOnBone(assembly, boneName, offset) {
  const { fns, skeleton } = assembly ?? {};
  const ref = skeleton?.byName?.get(String(boneName).toLowerCase());
  if (!fns || ref === undefined) return null;
  const rest = fns.skelMats(skeleton, fns.poseSkeleton(skeleton, null, null, 0, {}), GRAPH_ROOT).get(ref);
  if (!rest) return null;
  const inv = invert33(rest.a);
  if (!inv) return null;
  return [
    inv[0] * offset[0] + inv[1] * offset[1] + inv[2] * offset[2],
    inv[3] * offset[0] + inv[4] * offset[1] + inv[5] * offset[2],
    inv[6] * offset[0] + inv[7] * offset[1] + inv[8] * offset[2],
  ];
}
function invert33(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-12)) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

export function armPieceRows(pieces) {
  return (pieces ?? []).map((p) => ({
    key: `${p.slot} @ ${p.bone ?? '(no bone)'}`,
    slot: p.slot,
    bone: p.bone ?? null,
    kind: p.kind,
    mirrored: !!p.mirrored,
    boneOffset: p.boneOffset || null,
    vertices: p.positions ? p.positions.length / 3 : 0,
    triangles: p.indices ? p.indices.length / 3 : 0,
    bounds: meshBounds([p]),
  }));
}

// The garment first moves onto the wearer, its top to the top of the part it hides, then copies the skin of the
// body it covers. A garment with no body under it is a note and is not drawn.
function bindSkinnedFromBody(assembly, part, bones) {
  const mod = assembly.fns;
  const { skeleton, pieces, notes } = assembly;
  let nif;
  try { nif = mod.parseNif(part.bytes); } catch (err) { notes.push(`${part.slot}: ${err.message}`); return; }
  const sources = [];
  const slotOf = new Map();
  for (const src of part.skinFrom) {
    let srcNif;
    try { srcNif = mod.parseNif(src.bytes); } catch (err) { notes.push(`${part.slot}: body ${src.slot}: ${err.message}`); continue; }
    let tookNameless = false;
    for (const bone of src.bones ?? mod.PART_BONES[src.slot] ?? []) {
      if (!skeleton.byName.has(bone.toLowerCase())) continue;
      let bound;
      try { bound = mod.bindPart(skeleton, srcNif, { attachBone: bone }); } catch { continue; }
      for (const b of bound.skinned) {
        const nameless = !String(b.name || '').trim();
        if (nameless ? tookNameless : !shapeMatchesBone(b.name, bone)) continue;
        if (nameless) tookNameless = true;
        sources.push(b);
        slotOf.set(b, src.slot);
      }
      if (bound.skinned.length) continue;
      const ref = skeleton.byName.get(bone.toLowerCase());
      const mirrored = (skeleton.nodes.get(ref)?.name ?? '').includes('Left');
      for (const b of bound.attached) {
        const skin = sourceSkin(b, { attachRef: bound.attachRef, mirrored, boneOffset: bound.boneOffset || null });
        sources.push(skin);
        slotOf.set(skin, src.slot);
      }
    }
  }
  if (!sources.length) {
    notes.push(`${part.slot}: no body part to skin it from (${part.skinFrom.map((x) => x.slot).join(', ') || 'none named'}) - not drawn`);
    return;
  }
  let garment;
  try { garment = mod.bindPart(skeleton, nif, bones[0] ? { attachBone: bones[0] } : {}); } catch (err) { notes.push(`${part.slot}: ${err.message}`); return; }
  const pose = mod.poseSkeleton(skeleton, null, null, 0, {});
  const ctx = { skeleton, pose, mats: mod.skelMats(skeleton, pose, GRAPH_ROOT), skinBatch: mod.skinBatch };
  let worn = [...garment.attached, ...garment.skinned];
  if (part.fitTo) {
    const fit = fitLift(worn, sources.filter((s) => slotOf.get(s) === part.fitTo), ctx);
    if (fit) {
      worn = worn.map((g) => liftBatch(g, fit.lift));
      notes.push(`${part.slot}: fitted to the ${part.fitTo} - moved ${fit.lift >= 0 ? 'up' : 'down'} ${Math.abs(fit.lift).toFixed(1)} `
        + `(its top from ${fit.top.toFixed(1)} to the ${part.fitTo}'s top at ${fit.anchorTop.toFixed(1)})`);
    } else {
      notes.push(`${part.slot}: no ${part.fitTo} to fit it to - drawn at its baked height`);
    }
  }
  for (const g of worn) {
    for (const batch of transferSkin(g, sources, ctx)) {
      pieces.push({ slot: part.slot, bone: bones[0] ?? null, kind: 'skinned', mirrored: false,
        batch, source: null, attachRef: null,
        uvs: batch.uvs || null, colors: null, material: batch.material || null,
        positions: new Float32Array(batch.positions.length), indices: batch.indices,
        normals: posedNormals(batch) });
    }
  }
}

function applyPre(positions, pre) {
  if (!pre) return positions;
  const out = new Float32Array(positions.length);
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v]; const y = positions[v + 1]; const z = positions[v + 2];
    out[v] = pre.a[0] * x + pre.a[1] * y + pre.a[2] * z + pre.t[0];
    out[v + 1] = pre.a[3] * x + pre.a[4] * y + pre.a[5] * z + pre.t[1];
    out[v + 2] = pre.a[6] * x + pre.a[7] * y + pre.a[8] * z + pre.t[2];
  }
  return out;
}

// Case-insensitive prefix match on the shape name with the 'Tri ' prefix stripped. A nameless shape matches
// everything, since in a one-shape file it is the part.
export function shapeMatchesBone(shapeName, bone) {
  const name = String(shapeName || '').trim().toLowerCase();
  if (!name) return true;
  const want = String(bone).toLowerCase();
  if (name.startsWith(want)) return true;
  return name.startsWith('tri ') && name.slice(4).startsWith(want);
}

export function placeAtBone(positions, at, mirror, out = new Float32Array(positions.length), offset = null) {
  // The mirror scales the vertex, the offset translates the result, and then the bone places it. Adding the offset
  // before the mirror would negate its x on every left-hand part.
  const ox = offset ? offset[0] : 0;
  const oy = offset ? offset[1] : 0;
  const oz = offset ? offset[2] : 0;
  for (let v = 0; v < positions.length; v += 3) {
    const x = (mirror ? -positions[v] : positions[v]) + ox;
    const y = positions[v + 1] + oy;
    const z = positions[v + 2] + oz;
    out[v] = at.a[0] * x + at.a[1] * y + at.a[2] * z + at.t[0];
    out[v + 1] = at.a[3] * x + at.a[4] * y + at.a[5] * z + at.t[1];
    out[v + 2] = at.a[6] * x + at.a[7] * y + at.a[8] * z + at.t[2];
  }
  return out;
}

export function placeNormalsAtBone(normals, at, mirror, out = new Float32Array(normals.length)) {
  const a = at.a;
  for (let v = 0; v < normals.length; v += 3) {
    const x = mirror ? -normals[v] : normals[v];
    const y = normals[v + 1];
    const z = normals[v + 2];
    const nx = a[0] * x + a[1] * y + a[2] * z;
    const ny = a[3] * x + a[4] * y + a[5] * z;
    const nz = a[6] * x + a[7] * y + a[8] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[v] = nx / len; out[v + 1] = ny / len; out[v + 2] = nz / len;
  }
  return out;
}

function posedNormals(batch) {
  return batch.normals && batch.normals.length === batch.positions.length ? new Float32Array(batch.normals.length) : null;
}

function writePre(positions, pre, out) {
  for (let v = 0; v + 2 < positions.length && v + 2 < out.length; v += 3) {
    const x = positions[v]; const y = positions[v + 1]; const z = positions[v + 2];
    out[v] = pre.a[0] * x + pre.a[1] * y + pre.a[2] * z + pre.t[0];
    out[v + 1] = pre.a[3] * x + pre.a[4] * y + pre.a[5] * z + pre.t[1];
    out[v + 2] = pre.a[6] * x + pre.a[7] * y + pre.a[8] * z + pre.t[2];
  }
}
function writePreNormals(normals, pre, out) {
  for (let v = 0; v + 2 < normals.length && v + 2 < out.length; v += 3) {
    const x = normals[v]; const y = normals[v + 1]; const z = normals[v + 2];
    const nx = pre.a[0] * x + pre.a[1] * y + pre.a[2] * z;
    const ny = pre.a[3] * x + pre.a[4] * y + pre.a[5] * z;
    const nz = pre.a[6] * x + pre.a[7] * y + pre.a[8] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[v] = nx / len; out[v + 1] = ny / len; out[v + 2] = nz / len;
  }
}

function applyPreNormals(normals, pre) {
  if (!pre) return normals;
  const out = new Float32Array(normals.length);
  for (let v = 0; v < normals.length; v += 3) {
    const x = normals[v]; const y = normals[v + 1]; const z = normals[v + 2];
    const nx = pre.a[0] * x + pre.a[1] * y + pre.a[2] * z;
    const ny = pre.a[3] * x + pre.a[4] * y + pre.a[5] * z;
    const nz = pre.a[6] * x + pre.a[7] * y + pre.a[8] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[v] = nx / len; out[v + 1] = ny / len; out[v + 2] = nz / len;
  }
  return out;
}

// A first-person actor has two animation sources: xbase_anim.1st, then the actor skeleton when it differs, as for a
// female or a beast. A missing .kf is dropped silently, and the last pushed wins.
export const FP_BASE_MODEL = 'meshes/xbase_anim.1st.nif';

export function animSourceName(model) {
  const p = String(model || '').toLowerCase();
  return p.endsWith('.nif') ? `${p.slice(0, -4)}.kf` : p;
}

export function fpAnimSources(skeletonPath, exists, { werewolf = false } = {}) {
  return animSourcesFor(werewolf ? null : FP_BASE_MODEL, skeletonPath, exists);
}

export const MW_UNITS_PER_METER = 69.99125109;

export const TP_BASE_MODEL = 'meshes/xbase_anim.nif';

export function tpAnimSources(skeletonPath, exists, { werewolf = false } = {}) {
  return animSourcesFor(werewolf ? null : TP_BASE_MODEL, skeletonPath, exists);
}

export function creatureAnimSources(modelPath, exists, { bipedal = false } = {}) {
  return animSourcesFor(bipedal ? TP_BASE_MODEL : null, modelPath, exists);
}

function animSourcesFor(baseModel, skeletonPath, exists) {
  const out = [];
  const base = baseModel ? animSourceName(baseModel) : null;
  if (base && exists(base)) out.push(base);
  const own = animSourceName(skeletonPath);
  if (own !== base && exists(own)) out.push(own);
  return out;
}

export function sourcesKeyTime(sources, textKey) {
  for (let i = (sources ? sources.length : 0) - 1; i >= 0; i--) {
    const t = getTextKeyTime(sources[i].keys, textKey);
    if (t >= 0) return t;
  }
  return -1;
}

export function sourceVelocityOf(source, group) {
  if (!source) return 0;
  const acc = ACCUM_ROOT_NAMES.find((n) => source.trackMap && source.trackMap.has && source.trackMap.has(n));
  return acc ? animVelocity(source.keys, source.trackMap.get(acc), group) : 0;
}

export function sourcesVelocity(sources, group) {
  const list = sources || [];
  const velOf = (so) => sourceVelocityOf(so, group);
  let i = list.length - 1;
  for (; i >= 0; i--) {
    if (getTextKeyTime(list[i].keys, `${group}: start`) >= 0
      || getTextKeyTime(list[i].keys, `${group}: loop start`) >= 0) break;
  }
  if (i < 0) return 0;
  let velocity = velOf(list[i]);
  for (let j = i - 1; !(velocity > 1) && j >= 0; j--) velocity = velOf(list[j]);
  return velocity;
}

export function pickAnimSource(sources, group, resetClip, opts = {}) {
  for (let i = (sources?.length ?? 0) - 1; i >= 0; i--) {
    const state = resetClip(sources[i].keys, group, opts);
    if (state.ok) return { index: i, source: sources[i], state };
  }
  return null;
}

export function anySourceHasGroup(sources, group) {
  return (sources ?? []).some((s) => s.groupSet.has(group));
}

export async function clipReport({ kfBytes, skeleton = null, group = 'Idle', clipOpts = {} } = {}) {
  const mod = {};
  try {
    ({ parseNif: mod.parseNif } = await import('./mwNifFile.js'));
    Object.assign(mod, { collectTextKeys, normalizeTextKeys, clipGroups, resetClip, parseAnimGroups, extractTracks });
    ({ trackBinding: mod.trackBinding, accumRootRef: mod.accumRootRef } = await import('./mwSkin.js'));
  } catch (err) {
    return { ok: false, error: `readers unavailable: ${err.message}` };
  }
  if (!kfBytes || !kfBytes.length) {
    return { ok: false, error: 'no animation file - the archive carries no first-person .kf' };
  }
  let nif;
  try {
    nif = mod.parseNif(kfBytes);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  const rawKeys = mod.collectTextKeys(nif);
  const keys = mod.normalizeTextKeys(rawKeys);
  const tracks = mod.extractTracks(nif);
  const clip = mod.resetClip(keys, group, clipOpts);
  const legacyRaw = mod.parseAnimGroups(rawKeys).get(group);
  const channels = (t) => ({
    rotation: (t.rotationKeys?.length ?? 0) || (t.xyzRotations ? -1 : 0),
    translation: t.translations?.keys?.length ?? 0,
    scale: t.scales?.keys?.length ?? 0,
  });
  return {
    ok: true,
    header: readNifHeader(kfBytes),
    rawKeys,
    keys,
    groups: mod.clipGroups(keys),
    group,
    clip,
    // JSON turns the Infinity default of `loopStopTime` into null, so report a boolean that survives a page
    // evaluation.
    loopStopFinite: !!clip.ok && Number.isFinite(clip.loopStopTime),
    legacy: legacyRaw
      ? { start: legacyRaw.start, stop: legacyRaw.stop,
        loopStart: legacyRaw.loopStart, loopStop: legacyRaw.loopStop }
      : null,
    tracks: [...tracks.entries()].map(([bone, t]) => ({
      bone,
      channels: channels(t),
      rotationType: t.rotationType,
      translationType: t.translations?.type ?? 0,
      startTime: t.startTime,
      stopTime: t.stopTime,
      frequency: t.frequency,
      phase: t.phase,
    })),
    binding: skeleton ? mod.trackBinding(skeleton, tracks) : null,
    accumRoot: skeleton ? mod.accumRootRef(skeleton, tracks) : null,
    trackMap: tracks,
  };
}

export function clipSweepTimes(sources, idleState, { perClip = 9 } = {}) {
  const spans = [];
  for (const so of sources ?? []) {
    const keys = so?.keys;
    if (!Array.isArray(keys)) continue;
    const starts = new Map();
    for (const k of keys) {
      const time = k?.time;
      const n = String(k?.text ?? '').toLowerCase();
      const i = n.lastIndexOf(': ');
      if (i < 0) continue;
      const group = n.slice(0, i);
      const word = n.slice(i + 2);
      if (word.endsWith('start')) starts.set(`${group}|${word.slice(0, -5)}`, time);
      else if (word.endsWith('stop')) {
        const from = starts.get(`${group}|${word.slice(0, -4)}`);
        if (from != null && time > from) spans.push([from, time]);
      }
    }
  }
  if (!spans.length) {
    const a = idleState?.startTime ?? 0;
    const b = idleState?.stopTime ?? a;
    return Array.from({ length: 25 }, (_, i) => a + ((b - a) * i) / 24);
  }
  const out = [];
  for (const [a, b] of spans) {
    for (let i = 0; i < perClip; i++) out.push(a + ((b - a) * i) / (perClip - 1));
  }
  return out;
}

export function clipUnionBounds(assembly, poseAt, times) {
  let acc = null;
  for (const t of times ?? []) {
    poseAt(t);
    const b = assembly.bounds;
    if (!b) continue;
    acc = acc ? {
      minX: Math.min(acc.minX, b.minX), minY: Math.min(acc.minY, b.minY), minZ: Math.min(acc.minZ, b.minZ),
      maxX: Math.max(acc.maxX, b.maxX), maxY: Math.max(acc.maxY, b.maxY), maxZ: Math.max(acc.maxZ, b.maxZ),
    } : { ...b };
  }
  return acc;
}

// Retail record ids spell Wakizashi, where the Daggerfall template enum spells Wakazashi. The Daggerfall Battle Axe
// takes the Morrowind war axe shape, and its War Axe the battle axe.
const DF_TO_MW_SHAPE = Object.freeze({ wakazashi: 'wakizashi', battleaxe: 'waraxe', waraxe: 'battleaxe' });
export function dfWeaponShape(item, weaponsTable) {
  if (!item || item.werecreatureClaws) return null;
  const name = Object.keys(weaponsTable ?? {}).find((key) => weaponsTable[key] === item.templateIndex);
  const shape = name ? name.toLowerCase().replace(/[^a-z]/g, '') : null;
  return shape ? (DF_TO_MW_SHAPE[shape] ?? shape) : null;
}
