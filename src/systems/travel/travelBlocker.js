// @ts-check
// Names the nearest enemy that blocks travel and marks a lone one on the Overworld.
// Outside a journey, a wilderness enemy closes the Overworld only after it notices the player.
import { areEnemiesNearby, foeAlerted } from '../encounters.js';
import { enemyDisplayName } from '../../characters/enemy/enemyBasics.js';
import { directionHintString } from '../talk/talk.js';
import { t, getLocalizedEnemyName } from '../textManager.js';

/** @param {any[]} enemies @param {number[]} feet */
export function nearestBlocker(enemies, feet) {
  let best = null;
  for (const f of enemies ?? []) {
    if (!f?.ai?.feet || !areEnemiesNearby([f])) continue;
    const dx = f.ai.feet[0] - feet[0], dy = f.ai.feet[1] - feet[1], dz = f.ai.feet[2] - feet[2];
    const dist = Math.hypot(dx, dy, dz);
    if (!best || dist < best.dist) best = { foe: f, dx, dz, dist, flat: Math.hypot(dx, dz) };
  }
  return best;
}

/** @param {string} base @param {any[]} enemies @param {number[] | null} feet */
export function blockerLine(base, enemies, feet) {
  const b = feet ? nearestBlocker(enemies, feet) : null;
  if (!b || b.flat < 1) return base;
  const name = getLocalizedEnemyName(b.foe.mobileType, enemyDisplayName(b.foe.mobileType));
  const who = !name ? t('travel.blocker.enemy', 'an enemy')
    : /^[aeiou]/i.test(name) ? t('travel.blocker.anName', 'an {name}', { name }) : t('travel.blocker.aName', 'a {name}', { name });
  return t('travel.blocker.line', '{refusal}: {who} {meters, plural, one {# meter} other {# meters}} to the {direction}.',
    { refusal: base.replace(/[.!]\s*$/, ''), who, meters: Math.max(1, Math.round(b.dist)), direction: directionHintString(b.dx, b.dz) });
}

/** @param {any[]} enemies @param {(feet: number[]) => boolean} inTown */
export const noticedFoes = (enemies, inTown) => enemies.filter((f) => f.puppet || foeAlerted(f) || !f.ai?.feet || inTown(f.ai.feet));

/** @param {any} f */
export const loneMember = (f) => (f.campId == null && !f.puppet && !f.entity?.wildGiant && areEnemiesNearby([f])
  ? { camp: `lone:${f.uid}`, kind: 'lone', type: f.mobileType, feet: f.ai.feet } : null);
