import { canSeeTarget, SYSTEM_TIMER_UPDATES_DIVISOR, SENSES_INTERVAL_UNITS } from './enemyMotor.js';
import { CAPSULE_HEIGHT } from '../player/motor.js';
import { getBool } from '../platform/settings.js';
import { ENEMY_BASICS } from './enemyBasics.js';

export const MOBILE_TEAMS = Object.freeze([
  'PlayerEnemy', 'PlayerAlly', 'Vermin', 'Spriggans', 'Bears', 'Tigers',
  'Spiders', 'Orcs', 'Centaurs', 'Werecreatures', 'Nymphs', 'Aquatic',
  'Harpies', 'Undead', 'Giants', 'Scorpions', 'Magic', 'Daedra',
  'Dragonlings', 'KnightsAndMages', 'Criminals', 'CityWatch',
]);

export const enemyInfightingEnabled = () => getBool('Enhancements', 'EnemyInfighting');

export const PLAYER_TARGET = Object.freeze({ isPlayer: true });
export const PEER_CAST_TARGET = Object.freeze({ activeEffects: Object.freeze([]) });
export const isPlayerTarget = (c) => c === PLAYER_TARGET || c?.isPlayer === true;
export const isPeerTarget = (c) => c?.isPeer === true;
export const wireRecipient = (t) => (t?.isPeer ? t.id : (t == null ? '' : (t.isPlayer ? '.' : '')));
export const bumpAtkCount = (a, ranged) => ((((a | 0) >> 1) + 1) << 1) | (ranged ? 1 : 0);
export const isLocalPlayerTarget = (c) => isPlayerTarget(c) && !isPeerTarget(c);

export const mobileTeamOf = (entity) => entity?.mobileTeam ?? entity?.basics?.team ?? 'PlayerEnemy';

export const staticTeamOf = (mobileType) => ENEMY_BASICS[mobileType]?.team ?? 'PlayerEnemy';

export const COMPANION_ASSIST_PRIORITY = 20;
export const fightsOurSide = (targetAi, self) => {
  const t = targetAi?.target ?? null;
  return t != null && (isPlayerTarget(t) || t.companion != null || t === self);
};
export function huntsCivilians(self) {
  if (!self?.ai?.isHostile || self.isQuestFoe || self.companion != null) return false;
  const team = self.entity?.team, mobile = mobileTeamOf(self.entity);
  if (team === 'PlayerAlly' || mobile === 'PlayerAlly' || mobile === 'CityWatch' || self.entity?.isClass) return false;
  if (self.caster || (self.entity?.spells?.length ?? 0) > 0) return false;
  return !self.mobile?.basics?.hasRangedAttack1;
}
export const huntsStar = (self, ward) => self?.starSite != null && self.starSite === ward?.site && huntsCivilians(self);
export const STAR_HUNT_PRIORITY = 40;
export const huntsRaidGoal = (self, c) => self?.raidKey != null && c?.raidGoal === self.raidKey && !!self.ai?.isHostile;
export const RAID_GOAL_PRIORITY = 40;
export function targetPriority(targetHasNoTarget, seen, distance) {
  let p = 0;
  if (targetHasNoTarget) p += 5;
  if (seen) p += 10;
  p += Math.max(0, 30 - distance);
  return p;
}

let _playerBout = null;
export function setPlayerBout(b) { _playerBout = b ?? null; }
export const playerBoutOf = () => (_playerBout ? { id: String(_playerBout.id), side: _playerBout.side | 0, out: !!_playerBout.out, ...(_playerBout.hold ? { hold: true } : {}), ...(_playerBout.kit ? { kit: true } : {}) } : null);
export const inBout = (f) => !!f?.entity?.bout;
export function boutGate(self, c, isPlayer, playerBout = _playerBout) {
  const sb = self?.entity?.bout ?? null;
  const tb = isPlayer ? (isPeerTarget(c) ? (c.bout ?? null) : playerBout) : (c?.entity?.bout ?? null);
  if (!sb && !tb) return null;
  if (!sb || !tb) return false;
  if (String(sb.id) !== String(tb.id) || sb.out || tb.out || sb.hold || tb.hold) return false;
  return (sb.side | 0) !== (tb.side | 0);
}

export function getTargets(self, candidates, playerFeet, {
  noTargetMode = false,
  dropLocal = false,
  infighting = enemyInfightingEnabled(),
  playerHeight = CAPSULE_HEIGHT,
  playerBout = _playerBout,
} = {}) {
  const ai = self.ai;
  const selfTeam = self.entity?.team ?? 'PlayerEnemy';
  const selfMobileTeam = mobileTeamOf(self.entity);
  let highestPriorityTarget = null;
  let highestPriority = -1;
  let secondHighestPriority = -1;
  let sawSelectedTarget = false;
  let sawSecondaryTarget = false;
  let selectedDistance = 0;
  // The player walks last so enemies win priority ties; a list holding PLAYER_TARGET sets its slot.
  const walk = (candidates ?? []).includes(PLAYER_TARGET) ? [...candidates] : [...(candidates ?? []), PLAYER_TARGET];
  for (const c of walk) {
    const isPlayer = isPlayerTarget(c);
    const targetEntity = isPlayer ? null : c.entity;
    const targetAi = isPlayer ? null : c.ai;
    if (c === self || (targetAi && targetAi === ai)) continue;
    if (!isPlayer && (c.yielded || c.executing || c.sparing || c.leaving)) continue;
    const civilian = !isPlayer && c.civilian === true;
    if (civilian && !huntsCivilians(self)) continue;
    const star = !isPlayer && c.starWard === true;
    if (star && !huntsStar(self, c)) continue;
    const goal = !isPlayer && !self.raidTurned && huntsRaidGoal(self, c);
    const bout = boutGate(self, c, isPlayer, playerBout);
    if (bout === false) continue;
    if (bout !== true && !civilian && !star && !goal) {
    if ((noTargetMode || !ai.isHostile || selfMobileTeam === 'PlayerAlly' || self.companion != null) && isPlayer) continue;
    if (dropLocal && isLocalPlayerTarget(c)) continue;
    if (!ai.isHostile && targetEntity && targetEntity.team === 'PlayerAlly') continue;
    if (selfTeam === 'PlayerAlly' && !isPlayer) {
      if (targetAi && !targetAi.isHostile) continue;
    }
    if (isPlayer && selfTeam === 'PlayerAlly') {
      continue;
    } else if (infighting && !self.entity?.suppressInfighting && targetEntity && !targetEntity.suppressInfighting) {
      if (targetEntity.team === selfTeam) continue;
      if (self.entity?.campId != null && targetEntity.campId === self.entity.campId) continue;
    } else {
      if (!isPlayer && selfMobileTeam !== 'PlayerAlly' && !(c.companion != null && ai.isHostile)) continue;
    }
    if (self.companion != null && (c.companion != null || targetEntity?.team === 'PlayerAlly')) continue;
    if (c.companion != null && selfTeam === 'PlayerAlly') continue;
    if (self.isQuestFoe && !self.questAttackable && !isPlayer && c.companion == null) continue;
    if (targetAi && c.isQuestFoe && !c.questAttackable && self.companion == null) continue;
    }
    const tFeet = isPlayer ? (c.feet ?? playerFeet) : targetAi.feet;
    if (!tFeet) continue;
    const tHeight = isPlayer ? (c.height ?? playerHeight) : targetAi.height;
    const tOff = isPlayer ? tHeight / 2 : (targetAi.centreOffset ?? (targetAi.height ?? CAPSULE_HEIGHT) / 2);
    const sOff = ai.centreOffset ?? (ai.height ?? CAPSULE_HEIGHT) / 2;
    const dx = tFeet[0] - ai.feet[0], dy = (tFeet[1] + tOff) - (ai.feet[1] + sOff), dz = tFeet[2] - ai.feet[2];
    const distance = Math.hypot(dx, dy, dz);
    const see = canSeeTarget(ai.collider, ai.feet, ai.yaw, ai.height, tFeet, tHeight, null, distance, ai.sightRadius);
    if (targetAi && !targetAi.wouldBeSpawned && !see) continue;
    let priority = targetPriority(targetAi && !civilian && !star ? (targetAi.target ?? null) === null : false, see, distance);
    if (star && !self.starTurned) priority += STAR_HUNT_PRIORITY;
    if (goal) priority += RAID_GOAL_PRIORITY;
    if (self.companion != null && fightsOurSide(targetAi, self)) priority += COMPANION_ASSIST_PRIORITY;
    if (priority > highestPriority) {
      secondHighestPriority = highestPriority;
      highestPriority = priority;
      sawSecondaryTarget = sawSelectedTarget;
      sawSelectedTarget = see;
      selectedDistance = distance;
      highestPriorityTarget = c;
    } else if (priority > secondHighestPriority) {
      sawSecondaryTarget = see;
      secondHighestPriority = priority;
    }
  }
  return {
    target: highestPriorityTarget, targetInSight: sawSelectedTarget,
    distanceToTarget: selectedDistance, sawSecondaryTarget,
  };
}

export function targetAimPoint(target, playerFeet, playerHeight = CAPSULE_HEIGHT) {
  if (isPeerTarget(target)) return target.feet ? [target.feet[0], target.feet[1] + (target.height ?? CAPSULE_HEIGHT) / 2, target.feet[2]] : null;
  if (target == null || isPlayerTarget(target)) {
    return playerFeet ? [playerFeet[0], playerFeet[1] + playerHeight / 2, playerFeet[2]] : null;
  }
  const a = target.ai;
  if (!a?.feet) return null;
  return [a.feet[0], a.feet[1] + (a.centreOffset ?? (a.height ?? CAPSULE_HEIGHT) / 2), a.feet[2]];
}

export const ARROW_ORIGIN_FORWARD = 0.6;
export const ARROW_ORIGIN_HEIGHT_DIVISOR = 3;

export function enemyTransformPoint(ai) {
  if (!ai?.feet) return null;
  return [ai.feet[0], ai.feet[1] + (ai.centreOffset ?? (ai.height ?? CAPSULE_HEIGHT) / 2), ai.feet[2]];
}

export function enemyArrowOrigin(ai) {
  if (!ai?.feet) return null;
  const h = ai.height ?? CAPSULE_HEIGHT;
  const centre = ai.centreOffset ?? h / 2;
  return [
    ai.feet[0] + Math.sin(ai.yaw ?? 0) * ARROW_ORIGIN_FORWARD,
    ai.feet[1] + centre + h / ARROW_ORIGIN_HEIGHT_DIVISOR,
    ai.feet[2] + Math.cos(ai.yaw ?? 0) * ARROW_ORIGIN_FORWARD,
  ];
}

export const ARROW_CROUCH_DIP = 0.05;

export function missileAimDirection(from, aimPoint) {
  const d = [aimPoint[0] - from[0], aimPoint[1] - from[1], aimPoint[2] - from[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}

export function arrowAimDirection(casterTransform, aimPoint, { targetIsPlayer = false, playerCrouching = false } = {}) {
  if (!casterTransform || !aimPoint) return null;
  const dx = aimPoint[0] - casterTransform[0], dy = aimPoint[1] - casterTransform[1], dz = aimPoint[2] - casterTransform[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  const dir = [dx / l, dy / l, dz / l];
  if (targetIsPlayer && playerCrouching) dir[1] -= ARROW_CROUCH_DIP;
  return dir;
}

const targetHealth = (c, playerEntity) =>
  (isPlayerTarget(c) ? (c.health ?? playerEntity?.health ?? 1) : (c.entity?.health ?? 0));

export function runTargetMachine(self, candidates, playerFeet, classicDt, {
  noTargetMode = false,
  dropLocal = false,
  infighting,
  playerEntity = null,
  playerHeight = CAPSULE_HEIGHT,
  playerBout = _playerBout,
} = {}) {
  const ai = self.ai;
  ai.classicTargetUpdateTimer = (ai.classicTargetUpdateTimer ?? 0) + classicDt / SYSTEM_TIMER_UPDATES_DIVISOR;
  if (ai.target && targetHealth(ai.target, playerEntity) <= 0) ai.target = null;
  if (noTargetMode || !ai.isHostile) {
    if (isPlayerTarget(ai.target) && boutGate(self, ai.target, true, playerBout) !== true) ai.target = null;
    if (isPlayerTarget(ai.secondaryTarget) && boutGate(self, ai.secondaryTarget, true, playerBout) !== true) ai.secondaryTarget = null;
  }
  if (ai.target && boutGate(self, ai.target, isPlayerTarget(ai.target), playerBout) === false) ai.target = null;
  if (ai.secondaryTarget && boutGate(self, ai.secondaryTarget, isPlayerTarget(ai.secondaryTarget), playerBout) === false) ai.secondaryTarget = null;
  if (ai.target == null) {
    ai.lastKnownTargetPos = null;
    ai.predictedTargetPos = null;
    ai._dist = 0;
    if (ai.secondaryTarget && targetHealth(ai.secondaryTarget, playerEntity) > 0) {
      ai.target = ai.secondaryTarget;
      if (ai.sawSecondaryTarget) ai.lastKnownTargetPos = [0, 0, 0];
      ai.awareOfTargetForLastPrediction = false;
    }
  }
  let playerInSight = false;
  if (!ai.wouldBeSpawned && playerFeet && ai.classicTargetUpdateTimer > SENSES_INTERVAL_UNITS) {
    playerInSight = canSeeTarget(ai.collider, ai.feet, ai.yaw, ai.height, playerFeet, playerHeight, null, null, ai.sightRadius);
    if (!playerInSight) for (const c of candidates ?? []) {
      if (!isPeerTarget(c) || !c.feet) continue;
      if (canSeeTarget(ai.collider, ai.feet, ai.yaw, ai.height, c.feet, c.height ?? playerHeight, null, null, ai.sightRadius)) { playerInSight = true; break; }
    }
  }
  if (ai.classicTargetUpdateTimer > SENSES_INTERVAL_UNITS) {
    ai.classicTargetUpdateTimer = 0;
    if (ai.wouldBeSpawned || playerInSight) {
      const got = getTargets(self, candidates, playerFeet, { noTargetMode, dropLocal, infighting, playerHeight, playerBout });
      ai.target = got.target;
      ai.sawSecondaryTarget = got.sawSecondaryTarget;
      ai.targetSenses = ai.target && !isPlayerTarget(ai.target) ? ai.target : null;
    }
    // This runs outside the spawn-or-sight gate, so a rejected tick writes through the stale targetSenses.
    if (ai.target != null && ai.targetSenses && (ai.targetSenses.ai?.target ?? null) === null) {
      ai.targetSenses.ai.target = self;
    }
  }
  if (ai.target == null) return null;
  return isPlayerTarget(ai.target) ? (ai.target.feet ?? playerFeet) : ai.target.ai.feet;
}

export function resetAllyTeamOnPlayerAttack(ai, entity, mobileType) {
  ai.isHostile = true;
  if (entity && entity.team === 'PlayerAlly') {
    // The static table by mobile ID, never the instance copy, which reads PlayerAlly for a summoned ally.
    entity.team = staticTeamOf(mobileType ?? entity.mobileType);
  }
}
