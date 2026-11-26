export const QUARRY_HEIGHT = 1.8;

// A townsperson dies to one landed blow whatever its damage, as a classic civilian dies to the player's first hit.
export const QUARRY_BLOW = () => 1;

/**
 * @param {any} person
 * @param {(quarry: any, striker: any) => void} struck
 */
export function makeQuarry(person, struck) {
  const q = {
    civilian: true, living: person.living, person,
    ai: { feet: [0, 0, 0], height: QUARRY_HEIGHT, centreOffset: QUARRY_HEIGHT / 2, target: null, isHostile: false, wouldBeSpawned: true, yaw: 0 },
    entity: { team: 'Civilian', mobileTeam: 'Civilian', health: 1, maxHealth: 1 },
    hurtFromFoe(_damage, _dir, striker) {
      if (q.entity.health <= 0) return 0;
      // Zero health is what makes the target machine release this body (enemyTargets.js `targetHealth`).
      q.entity.health = 0;
      struck(q, striker);
      return 1;
    },
  };
  return q;
}
