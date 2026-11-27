// @ts-check
// Third-person spine pitch for ranged aim and casting, matching the Morrowind reference animation code.
// Pitch is positive downward, so callers negate the camera pitch.

import { MW_WEAPON_TYPE, MW_WEAPON_CLASS, weaponClass, rotNegX, applyRotateController } from '../formats/mwFirstPerson.js';

// Order matters: spine2 is a child of spine1, and each takes half the pitch so the two turns add up.
export const SPINE_AIM_BONES = Object.freeze(['bip01 spine1', 'bip01 spine2']);

export const RANDOM_ATTACK_GROUPS = Object.freeze(new Set(['attack1', 'attack2', 'attack3', 'swimattack1', 'swimattack2', 'swimattack3']));

export const AIMING_STATES = Object.freeze(new Set(['AttackWindUp', 'AttackRelease', 'AttackEnd', 'Casting']));

/** @param {{ upper?: string, weaponType?: number, group?: string | null, time?: number, startTime?: number, minAttackTime?: number, completion?: number }} s */
export function spinePitchFactor({ upper = 'None', weaponType = MW_WEAPON_TYPE.None, group = null, time = -1, startTime = -1, minAttackTime = -1, completion = 0 } = {}) {
  const cls = weaponClass(weaponType);
  if (!AIMING_STATES.has(upper) || (cls !== MW_WEAPON_CLASS.Ranged && cls !== MW_WEAPON_CLASS.Thrown)) return 0;
  if (upper === 'AttackWindUp' && !RANDOM_ATTACK_GROUPS.has(group ?? '')) {
    if (startTime <= time && time < minAttackTime) return (time - startTime) / (minAttackTime - startTime);
    return 1;
  }
  if (upper === 'AttackEnd') {
    return weaponType === MW_WEAPON_TYPE.MarksmanCrossbow ? Math.max(0, 1 - completion * 10) : 1 - completion;
  }
  return 1;
}

export function applySpineAim(skeleton, pose, rootRef, skelMats, pitch) {
  if (!pitch || !skeleton?.byName) return 0;
  const half = rotNegX(pitch / 2);
  let turned = 0;
  for (const name of SPINE_AIM_BONES) if (applyRotateController(skeleton, pose, rootRef, skelMats, skeleton.byName.get(name), half)) turned++;
  return turned;
}

export function spineAimSlot(pitch) {
  return pitch ? (skeleton, pose, rootRef, skelMats) => applySpineAim(skeleton, pose, rootRef, skelMats, pitch) : null;
}
