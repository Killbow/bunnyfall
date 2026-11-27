// @ts-check
import { poisonCount } from '../afflictions/poisons.js';

const plainDiseases = (entity) => (entity?.activeEffects ?? []).filter((a) => a.kind === 'disease' && !a.ended && !a.infection).length;

export function restAilmentLines(entity) {
  const p = poisonCount(entity), d = plainDiseases(entity);
  if (!p && !d) return null;
  const what = p && d ? 'You are poisoned and diseased.' : p ? 'You are poisoned.' : 'You are diseased.';
  return [what, 'Resting will not cure it.', 'Rest anyway?'];
}
