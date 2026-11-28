import { MOBILE_TYPES } from './mobileTypes.js';
import { WERERAT, WERERAT_RAT_COUNT } from './wererat.js';
import { summonedBody } from '../items/foeLootCap.js';
import { placeFoeEnv } from '../systems/quest/questFoeHost.js';
import { placeFoeFreely } from '../systems/quest/sceneMount.js';
import { t } from '../ui/textManager.js';

export function callWereratRats(foe, { collider, isOccupied, spawn, say, targetFeet }) {
  if (foe.mobileType !== WERERAT || foe.dead || !foe.ai.detected || !foe.ai.isHostile
    || foe.entity.team === 'PlayerAlly' || foe.entity.wereratCalled
    || !(foe.entity.health > 0 && foe.entity.health <= foe.entity.maxHealth * 0.5)) return false;

  foe.entity.wereratCalled = true;
  say?.(t('enemy.wererat.call', 'The Wererat calls her swarm.'));
  const at = [...foe.ai.feet];
  const target = foe.ai.target;
  const targetAt = targetFeet ? [...targetFeet] : null;
  const reserved = [];
  const occupied = (point, radius) => isOccupied?.(point, radius)
    || reserved.some(([x, , z]) => Math.hypot(point.x - x, point.z - z) < 0.8);
  const env = placeFoeEnv({ collider, playerFeet: [at[0], at[1] + 0.9, at[2]], playerYawRad: foe.ai.yaw,
    fovDegrees: 0, isOccupied: occupied });

  for (let rat = 0; rat < WERERAT_RAT_COUNT; rat++) {
    let spot = null;
    for (let attempt = 0; attempt < 12 && !spot; attempt++) {
      spot = placeFoeFreely(env, { minDistance: 1, maxDistance: 5, lineOfSightCheck: false });
      if (spot && Math.abs(spot.y - at[1]) > 1.25) spot = null;
    }
    const feet = spot ? [spot.x, spot.y, spot.z] : [...at];
    reserved.push(feet);
    void spawn(MOBILE_TYPES.Rat, feet).then((minion) => {
      if (!minion?.ai) return;
      summonedBody(minion);
      if (target) minion.ai.makeEnemyHostileToAttacker(target, targetAt);
      else minion.ai.makeHostileToPlayer(undefined, targetAt);
    }).catch(() => {});
  }
  return true;
}
