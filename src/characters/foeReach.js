// @ts-check
export function foeInWater(f, seaY) {
  const ai = f?.ai;
  if (!ai) return false;
  if (ai.swims) return true;
  const y = ai.feet?.[1];
  return Number.isFinite(y) && Number.isFinite(seaY) && y + (ai.centreOffset ?? 0) < seaY;
}

/**
 * @param {Iterable<any>} foes
 * @param {{ aboard: boolean, seaY: number }} at
 */
export function markFoeReach(foes, { aboard, seaY }) {
  for (const f of foes) if (f?.ai) f.ai.unreachable = !!aboard && foeInWater(f, seaY);
}
