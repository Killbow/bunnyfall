export const BEAST_ATTACKS = Object.freeze({
  LUNGE: 'lunge',
  MAUL: 'maul',
  BITE: 'bite',
  STING: 'sting',
  SWOOP: 'swoop',
});

/**
 * @param {string} kind
 * @param {number} t
 * @param {number} hit
 * @returns {{z:number, y:number, pitch:number, roll:number}}
 */
export function beastAttackPose(kind, t, hit = 0.45) {
  const wind = hit <= 0 ? 0 : Math.min(1, Math.max(0, t / hit));
  const past = t <= hit ? 0 : Math.min(1, (t - hit) / Math.max(0.05, 1 - hit));
  const gather0 = Math.sin(wind * Math.PI * 0.5) ** 2;
  const strike = t <= hit ? gather0 : 1 - Math.sin(past * Math.PI * 0.5) ** 1.4;
  const gather = t <= hit ? gather0 : gather0 * (1 - past);

  switch (kind) {
    case BEAST_ATTACKS.MAUL:
      return { z: strike * 0.1 - gather * 0.04, y: -strike * 0.05 + gather * 0.06, pitch: strike * 0.5 - gather * 0.18, roll: 0 };
    case BEAST_ATTACKS.BITE:
      return { z: strike * 0.22 - gather * 0.06, y: 0, pitch: strike * 0.16, roll: strike * 0.1 };
    case BEAST_ATTACKS.STING:
      return { z: -strike * 0.1, y: strike * 0.07, pitch: -strike * 0.42 + gather * 0.05, roll: 0 };
    case BEAST_ATTACKS.SWOOP:
      return { z: strike * 0.34 - gather * 0.1, y: -strike * 0.2 + gather * 0.12, pitch: strike * 0.3, roll: strike * 0.22 };
    case BEAST_ATTACKS.LUNGE:
    default:
      return { z: strike * 0.28 - gather * 0.08, y: -strike * 0.07 + gather * 0.03, pitch: strike * 0.34 - gather * 0.1, roll: 0 };
  }
}

export function hitPointOf(frames) {
  if (!Array.isArray(frames) || !frames.length) return 0.45;
  const i = frames.indexOf(-1);
  if (i < 0) return 0.45;
  return i / (frames.length - 1);
}

export function hitCountOf(frames) {
  if (!Array.isArray(frames)) return 1;
  const n = frames.filter((f) => f === -1).length;
  return Math.max(1, n);
}
